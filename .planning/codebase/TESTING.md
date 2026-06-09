# Testing Patterns

**Analysis Date:** 2026-06-09

> Note: This repository (`cinatra-ai/docs`) is a pure documentation site with no test files of its own. The testing patterns below are documented for the `cinatra-ai/cinatra` platform monorepo, extracted from the authoritative testing doctrine and CI reference documents published here.

---

## Test Framework

**Runner:**
- Vitest — used for unit and integration tests across packages.
- Config: per-package (no root-level `vitest.config.ts` documented here).

**E2E:**
- Playwright — browser end-to-end tests.
- RBAC suite config: `playwright.rbac.config.ts`; notifications suite config: `playwright.notifications.config.ts`.

**Assertion Library:**
- Vitest's built-in `expect` (Jest-compatible API).

**Run Commands:**
```bash
pnpm --filter <package> test          # Run tests for one package
pnpm --filter <package> test --watch  # Watch mode
# No global test runner — tests are package-local

# E2E — RBAC suite (must use prod build):
pnpm build
cp -r .next/static .next/standalone/.next/static
(cd .next/standalone && PORT=3000 HOSTNAME=0.0.0.0 node server.js) &
pnpm exec playwright test -c playwright.rbac.config.ts

# E2E — against existing dev server (local only):
env -u CI E2E_BASE_URL=http://127.0.0.1:3000 E2E_PORT=3000 \
  pnpm exec playwright test -c playwright.notifications.config.ts --reporter=list
```

Source: `references/platform/rbac-browser-e2e-ci.md`, `references/platform/e2e-headless-hydration.md`, `guides/developer/contributing.md`.

---

## Test File Organization

**Location:**
- Package-local: each package owns its tests in `__tests__/` or `tests/` subdirectories.
- E2E fixtures: `tests/e2e/rbac/` (RBAC suite); `tests/e2e/<suite>/` pattern for other suites.
- Auth setup files: `tests/e2e/rbac/auth.setup.ts`, `tests/e2e/rbac/auth.customer.setup.ts`.

**Naming:**
- Unit/integration: `<module>.test.ts` or `<module>.test.mjs`.
- E2E setup: `auth.setup.ts`, `auth.customer.setup.ts`.
- Concrete examples: `dev-tunnel.test.mjs`, `resolver-matrix.test.ts`.

**Structure:**
```
packages/<name>/
├── __tests__/          # or tests/
│   └── <module>.test.ts
tests/
└── e2e/
    └── rbac/
        ├── auth.setup.ts
        ├── auth.customer.setup.ts
        └── fixtures/
            └── public-schema.sql
```

Source: `references/platform/rbac-browser-e2e-ci.md`, `guides/developer/contributing.md`.

---

## Test Structure

**Suite Organization:**
```typescript
// Standard Vitest pattern
it("description of what must hold", () => {
  expect(actual).toBe(expected);
});

// Structural LOCK pattern — pin absence, not presence
it("cannot reintroduce the deleted background reachability poll", () => {
  const src = readFileSync(targetModulePath, "utf8");
  const block = extractFunctionBody(src, "runDevTunnel");
  expect(block.includes("setTimeout")).toBe(false);
  expect(block.includes("pollFunnelUrl")).toBe(false);
  // one assertion per forbidden construct
});

// Arity lock pattern — pin function signature independence
it("decision is structurally decoupled from any probe", () => {
  expect(shouldWritePublicBaseUrl.length).toBe(1); // arity lock
  expect(shouldWritePublicBaseUrl({ funnelUrl: "https://foo.ts.net", hostnameCheck: true })).toBe(true);
});
```

Source: `references/platform/testing-doctrine.md`.

**Patterns:**
- Structural regression LOCKs: assert forbidden constructs CANNOT return (absence over presence).
- Arity locks: pin function `.length` to enforce signature-level independence from forbidden inputs.
- No presence-only tests for deleted code — presence-only tests mask the defect.

---

## Testing Doctrine

Two canonical patterns from `references/platform/testing-doctrine.md`:

### 1. Structural Regression LOCK

**When to use:** After deleting dead or dangerous code that a future refactor could silently reintroduce.

**Approach:** Read the source file, extract the target function body, assert that each forbidden construct is absent (`toBe(false)`).

**Anti-pattern:** A test that asserts deleted code is "present" (presence-only assertion) actively masks the defect it should catch.

**Example location:** `dev-tunnel.test.mjs` — 9 `toBe(false)` assertions forbidding `setTimeout`, `timer.unref`, `pollProjectName`, `pollFunnelUrl`, `mcpProbe`, and related constructs.

### 2. Pure-Decision Module with Arity Lock

**When to use:** Any time a decision function must be provably independent of a forbidden input.

**Approach:** Make the forbidden input structurally impossible by using a single object-arg signature, then lock the arity with `expect(fn.length).toBe(1)`.

**Example location:** `packages/cli/src/tailscale-provision.mjs` — `shouldWritePublicBaseUrl({funnelUrl, hostnameCheck})` with arity lock.

---

## Mocking

**Framework:** Not explicitly specified in the docs. Vitest provides built-in `vi.mock` / `vi.fn`.

**DB mocking for E2E:**
- No mock DB — E2E runs against a real provisioned Postgres.
- Better Auth `public.*` schema applied from committed SQL snapshot: `tests/e2e/rbac/fixtures/public-schema.sql`.
- Applied via `scripts/apply-public-schema.mjs` before boot.
- `cinatra` schema self-provisions via instrumentation hook on first query.

**Setup bypass:**
- `CINATRA_E2E_SETUP_BYPASS=true` makes `isSetupWizardComplete()` return `true` — skips the onboarding gate only, no auth/RBAC bypass.

Source: `references/platform/rbac-browser-e2e-ci.md`.

---

## Playwright E2E Patterns

### Dev Server: Always Use Production Build in CI

Running Playwright against `pnpm dev` (Turbopack) does not work in CI — cold-compile latency kills the runner. Always use a production build for CI jobs:

```bash
pnpm build  # with NODE_OPTIONS=--max-old-space-size=4096
cp -r .next/static .next/standalone/.next/static
(cd .next/standalone && PORT=3000 HOSTNAME=0.0.0.0 node server.js)
```

### Headless Hydration (dev server only)

Every new Playwright suite against the dev server needs both:

1. **`next.config.ts` flags** (already shipped — verify, don't duplicate):
   ```ts
   allowedDevOrigins: ["127.0.0.1"],
   experimental: { reactDebugChannel: false },
   ```

2. **`beforeEach` with hydration sentinel:**
   ```ts
   test.describe.configure({ timeout: 120_000 });

   test.beforeEach(async ({ page }) => {
     await page.addInitScript(() => {
       Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
       Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
     });
     await page.goto("/desk", { waitUntil: "domcontentloaded" });
     await expect(page.getByRole("button", { name: "Open notifications" })).toBeVisible({ timeout: 60_000 });
     await page.waitForFunction(
       () => {
         const bell = document.querySelector('button[aria-label="Open notifications"]');
         return !!bell && Object.keys(bell).some((k) => k.startsWith("__reactFiber$"));
       },
       undefined,
       { timeout: 60_000 },
     );
   });
   ```

**Base URL:** Always use `http://127.0.0.1:3000` (not `localhost` — resolves to `::1` in Playwright).

Source: `references/platform/e2e-headless-hydration.md`.

### Multi-Actor Fixture Ordering

For multi-role tests (admin + member + customer), setup ordering matters:
- Customer sign-up runs BEFORE member sign-in (better-auth sign-up auto-signs-in, last write wins the cookie jar).
- State files saved per actor: `tests/e2e/rbac/.auth/state.json`.

Source: `references/platform/rbac-browser-e2e-ci.md`.

---

## CI Jobs

**Unit/integration:**
- `rbac-authz-unit` — runs full `src/lib/authz` suite (20 files / 160 tests). Excludes `build-actor-context-from-run.test.ts` (5 placeholder RED tests until run-context wiring is implemented).

**E2E:**
- `e2e-rbac` — 9 Playwright tests: permissions pages, project access, extension marketplace access, customer scoped-view. Runs against a production build.

**Limitation:** CI jobs are visible checks but cannot currently block merges (org on free GitHub plan; branch protection requires Pro/Team or public repo). Merges proceed via `--admin` until upgraded.

Source: `references/platform/rbac-browser-e2e-ci.md`.

---

## Coverage

**Requirements:** None enforced globally.

**Known gaps:**
- `build-actor-context-from-run.test.ts` deliberately RED (5 placeholder tests) until `run.orgId → actor.organizationId` wiring lands. Drop the `--exclude` flag when wiring is implemented.
- No global test runner — tests are package-local, so cross-package coverage is not aggregated.

---

## Test Types

**Unit Tests:**
- Package-local Vitest tests in `__tests__/` or `tests/`.
- Focus on decision functions, pure logic, structural regression locks.

**Integration Tests:**
- Vitest; include the `src/lib/authz` resolver matrix (`resolver-matrix.test.ts`).

**E2E Tests:**
- Playwright; located in `tests/e2e/`.
- Two suites: RBAC (`playwright.rbac.config.ts`) and notifications (`playwright.notifications.config.ts`).
- Always run against a production build in CI.

---

*Testing analysis: 2026-06-09*
