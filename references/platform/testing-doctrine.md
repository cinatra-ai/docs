# Testing Doctrine

Reusable regression-test patterns for deleted dead code and decision-boundary decoupling. These patterns come from cases where presence-only tests and a body-only decoupling claim both masked a real blocker across multiple review rounds.

---

## Structural regression LOCK over presence assertions

Assert that forbidden constructs CANNOT return (grep-style absence over the target code block) rather than asserting current behavior. A structural LOCK is durable against the silent reintroduction of deleted dead code — a future refactor that adds the construct back fails the lock immediately, regardless of runtime behavior.

**When to use:** After deleting dead or dangerous code that a future refactor could plausibly reintroduce.

**Anti-pattern callout:** Presence-only "is X gone?" tests actively MASK the defect they should catch. A test that pins the *existence* of code that should not exist is worse than no test — tests asserting deleted background-poll symbols were "present" can actively mask the defect.

Concrete instance: `dev-tunnel.test.mjs` uses 9 `toBe(false)` assertions that structurally forbid the return of `setTimeout` / `timer.unref` / `pollProjectName` / `pollFunnelUrl` / "Model Context Protocol (MCP) health via Funnel" / "background check" / "not yet reachable after 5m" / `mcpProbe` from the target code block. The idiom (schematic):

```js
const src = readFileSync(targetModulePath, "utf8");
const block = extractFunctionBody(src, "runDevTunnel");

it("cannot reintroduce the deleted background reachability poll", () => {
  expect(block.includes("setTimeout")).toBe(false);
  expect(block.includes("timer.unref")).toBe(false);
  expect(block.includes("pollFunnelUrl")).toBe(false);
  expect(block.includes("not yet reachable after 5m")).toBe(false);
  expect(block.includes("mcpProbe")).toBe(false);
  // …one assertion per forbidden construct
});
```

The lock pins absence over the source block, so it stays green only while the dead code stays deleted — and goes red the moment a refactor silently reintroduces it.

## Pure-decision module with an arity lock

A "should we do X?" decision function takes a single object arg with NO forbidden-input parameter, and its independence from that input is pinned by an arity assertion on the function's *signature* — `expect(fn.length).toBe(1)` — not just on its body. A body-only test can pass while a later edit threads the forbidden input back in; the arity lock makes that structurally impossible without failing the test.

**When to use:** Any time a decision must be provably independent of a forbidden input — make the input structurally impossible to pass and lock the arity in a test.

Concrete instance: `packages/cli/src/tailscale-provision.mjs` exposes `shouldWritePublicBaseUrl({funnelUrl, hostnameCheck})` — a single object arg, no probe/reachability parameter — pinned by `expect(shouldWritePublicBaseUrl.length).toBe(1)`. The probe-decoupling is enforced by the function's signature, not just its body:

```js
import { shouldWritePublicBaseUrl } from "../tailscale-provision.mjs";

it("decision is structurally decoupled from any probe", () => {
  // arity lock: exactly one (object) parameter, so a reachability/probe
  // argument cannot be threaded back in without failing this test
  expect(shouldWritePublicBaseUrl.length).toBe(1);
  expect(shouldWritePublicBaseUrl({ funnelUrl: "https://foo.ts.net", hostnameCheck: true })).toBe(true);
});
```

## See also

- [rbac-browser-e2e-ci.md](rbac-browser-e2e-ci.md) — how the role-based access control (RBAC) Playwright suite + resolver-matrix unit job run in CI (why a production build, the public-schema SQL seed, the setup-wizard bypass, and the branch-protection limitation).
- [e2e-headless-hydration.md](e2e-headless-hydration.md) — dev-mode headless hydration requirements (relevant when running e2e against `pnpm dev` locally).
