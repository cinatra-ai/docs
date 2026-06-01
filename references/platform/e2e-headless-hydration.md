# Headless e2e against the dev server: hydration requirements

When Playwright runs **headless Chromium** against the Next.js 16 + Turbopack
dev server (`pnpm dev`), the App Router will not hydrate `/desk` (or any
authenticated page) out of the box. The SSR shell renders fine — the bell
button is in the DOM, the sidebar is there, the snapshot looks correct — but
**no client component is interactive**: no `__reactFiber$…` keys on any DOM
node, `self.__next_f.length` stays at 0, `document.readyState` stays at
`"interactive"` forever, clicking a Radix `PopoverTrigger` does nothing.

This page documents the two `next.config.ts` flags and the spec-level
`waitForFunction` pattern that together make headless e2e usable. **Anyone
adding a new Playwright suite under `tests/e2e/` against the dev server
needs both pieces or the suite will be flaky / 0-of-N green.**

The same requirements unblock headless-Chromium hydration on `/desk` for the
notifications-flyout suite.

## Symptom

A headless Playwright probe against `http://127.0.0.1:3000/desk` with a
valid session cookie shows:

```js
{
  readyState: "interactive",   // never reaches "complete"
  bellPresent: true,           // SSR markup is there
  bellFiber: "NO-FIBER",       // no React fiber attached
  popoverOpened: "NO",         // click on bell does nothing
  sidebarToggle: "changed=false", // sidebar also inert
  nextFPushSrc: "function nextServerDataCallback(seg) { …" // Next bootstrap ran
}
```

— and the only console output is `[HMR] failed
ERR_INVALID_HTTP_RESPONSE` from the dev WebSocket. There is **no app
error**, no chunk load failure, no CSP violation, no `pageerror`.

## Causal chain

1. **Next 16 cross-origin block on `_next/*` dev resources.** The dev
   server self-identifies as `localhost`, but `localhost` resolves to
   `::1` in Playwright's apiRequestContext, and the IPv4 listener is
   what the suite targets. Chromium therefore sends
   `Origin: http://127.0.0.1:3000` on the `/_next/webpack-hmr?id=...`
   WebSocket upgrade. Next sees that as cross-origin and refuses the
   upgrade with a non-101 response, which Chromium logs as
   `ERR_INVALID_HTTP_RESPONSE`. A raw `curl` probe to the same endpoint
   succeeds with `HTTP/1.1 101 Switching Protocols` only because curl
   omits `Origin` and side-steps the check.

2. **App Router hydration deadlock on the React debug channel.**
   `client/app-index.js` awaits `initialServerResponse` before calling
   `hydrateRoot`. With `experimental.reactDebugChannel: true` (the
   default in `config-shared.js:247`),
   `initialServerResponse` only resolves when **both** the inline RSC
   Flight stream AND the HMR-delivered React debug stream close
   (`react-server-dom-turbopack-client.browser.development.js:5190`).
   Debug close-chunks arrive as `REACT_DEBUG_CHUNK` messages on the
   HMR WebSocket (`hot-reloader-app.js:356`). Empirically the
   `null` debug close-chunk never arrives in this headless setup —
   even after fixing the cross-origin block above and verifying HMR
   connects (`[HMR] connected`, bidirectional frames) — so
   `hydrateRoot` is never called and the page stays inert.

3. **Dev-mode compile latency.** Once the two flags above are set,
   hydration becomes possible — but it doesn't happen instantly.
   Turbopack runs 3–4 `[Fast Refresh] rebuilding` cycles during the
   initial nav (transpilePackages workspace recompiles + dev overlay
   churn), so React fibers don't attach to top-level DOM until
   ~20–30 seconds after `domcontentloaded`. The first interactive
   assertion (`expect(badge).toBeVisible()` etc.) was racing this on a
   default 10s `expect` timeout.

## What every e2e suite needs

### `next.config.ts` (already shipped for everyone — verify, don't duplicate)

```ts
// next.config.ts
const nextConfig: NextConfig = {
  // …
  allowedDevOrigins: ["127.0.0.1"], // unblocks the HMR WebSocket
  experimental: {
    reactDebugChannel: false,       // decouples hydration from the
                                    // dev React-debug-channel close
                                    // chunk (which never arrives)
  },
  // …
};
```

Both flags are **dev-only**. The experimental literal is substituted
into the client bundle by `build/define-env.js:195` only when running
`next dev` (it becomes `process.env.__NEXT_REACT_DEBUG_CHANNEL = false`
at build time, so the gated `if` in `client/app-index.js:153` short-
circuits and `debugChannel` stays `undefined`). Production builds never
substitute either; `next build` / `next start` never serves HMR.

### Spec `beforeEach` (every new suite needs this)

After the SSR markup is visible, wait for React to actually attach a
fiber to the element you're about to interact with. The bell is a
convenient sentinel for app-shell hydration; for suites that exercise
a different surface, pick an element that the suite's first
interactive assertion depends on.

```ts
import { expect, test } from "@playwright/test";

test.describe.configure({ timeout: 120_000 });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => false,
    });
  });

  await page.goto("/desk", { waitUntil: "domcontentloaded" });

  // SSR-visible sentinel.
  await expect(
    page.getByRole("button", { name: "Open notifications" }),
  ).toBeVisible({ timeout: 60_000 });

  // Hydration sentinel — wait until React attaches a __reactFiber$ key.
  // Without this, every interactive assertion below races dev-mode
  // Turbopack Fast Refresh cycles and times out at the default 10s
  // expect timeout. ~20–30s is normal for the first nav.
  await page.waitForFunction(
    () => {
      const bell = document.querySelector(
        'button[aria-label="Open notifications"]',
      );
      return (
        !!bell &&
        Object.keys(bell).some((k) => k.startsWith("__reactFiber$"))
      );
    },
    undefined,
    { timeout: 60_000 },
  );
});
```

The `visibilityState` shim is separate (it forces the headless tab to
report visible, so the notifications-flyout's `loadNotifications`
doesn't early-return on `document.hidden`); keep it.

### Test-run command and base URL

The default playwright config defaults the base URL to
`http://localhost:${PORT}`, but `localhost` resolves to `::1` in
Playwright and the dev server's IPv4 listener is what works. Always
pass `E2E_BASE_URL=http://127.0.0.1:3000` and `E2E_PORT=3000` when
reusing an existing dev server. Locally you also have to unset `CI`
(the `reuseExistingServer: !CI` config refuses to reuse when `CI` is
set):

```bash
env -u CI E2E_BASE_URL=http://127.0.0.1:3000 E2E_PORT=3000 \
  pnpm exec playwright test -c playwright.notifications.config.ts \
  --reporter=list
```

### Dev server stability (separate concern, same family)

`scripts/dev-server.mjs` exits when its child `next dev` detects EOF on
stdin (the harness/Playwright launches `pnpm dev` with no TTY). Keep
stdin open with `tail -f /dev/null | pnpm dev` for any long-running
local dev session under headless test automation.

## How to verify on a new suite

A short instrumented probe will tell you whether all four pieces are
in place:

```js
// __tmp_hydration_check.mjs (run from repo root)
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const state = JSON.parse(
  readFileSync("tests/e2e/<suite>/.auth/state.json", "utf8"),
);
const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ storageState: state });
const page = await ctx.newPage();
await page.addInitScript(() => {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => "visible",
  });
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => false,
  });
});

await page.goto("http://127.0.0.1:3000/desk", {
  waitUntil: "domcontentloaded",
  timeout: 90000,
});

// 30s window so Fast Refresh cycles settle.
for (const at of [3000, 10000, 20000, 30000]) {
  await page.waitForTimeout(at - (page.__last ?? 0));
  page.__last = at;
  const snap = await page.evaluate(() => {
    const el = document.querySelector('main, [role="main"]');
    return {
      readyState: document.readyState,
      hasFiber: el
        ? Object.keys(el).some((k) => k.startsWith("__reactFiber$"))
        : false,
    };
  });
  console.log("[snap@" + at + "ms]", JSON.stringify(snap));
}

await b.close();
```

Expected good output by the 30s snapshot:

```
[snap@30000ms] {"readyState":"complete","hasFiber":true}
```

If `hasFiber` stays `false` and `readyState` stays `"interactive"` at
30s+, the two `next.config.ts` flags above are missing or have been
overridden somewhere in the user-config tree. If `[HMR] connected`
never appears in the page's console, the cross-origin block is still
firing — check that `allowedDevOrigins` includes the host Playwright
is actually navigating to (not the host the dev server self-identifies
as).

## Production safety

Both `allowedDevOrigins` and `experimental.reactDebugChannel` are
dev-mode-only knobs:

- `allowedDevOrigins` is consumed only by the dev server's `_next/*`
  guard; production `next build` / `next start` does not serve HMR.
- `experimental.reactDebugChannel` is substituted into the client
  bundle by `define-env.js` only under `next dev`; the production
  client bundle has no `debugChannel` codepath at all.

Neither flag affects production builds, deployed Docker images, or any
runtime user-facing behavior. They are pure dev/test ergonomics.
