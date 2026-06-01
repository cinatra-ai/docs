# Dev-mode build-performance harness

The harness lives at `scripts/` and is the canonical measurement instrument for `pnpm dev` cold-compile / route-graph perf work.

## Three scripts + one CI gate

| Script | What it does | When to use |
|---|---|---|
| `pnpm route-graph` (`scripts/route-graph.mjs`) | Deterministic static analyzer: for each route entry, walks the ESM import graph and reports the count of reachable **first-party** modules (`src/**`, `packages/*/src/**`, `extensions/**`). Cuts at bare specifiers, `node:` builtins, and `serverExternalPackages`. Workspace packages are traversed. Pure `import type` / `export type` (and inline `{ type X }`-only named groups) are excluded — Turbopack erases them. Zero deps, zero server. | Primary acceptance metric for graph-narrowing work. Same input → byte-identical output. |
| `pnpm bench:cold-start` (`scripts/bench-cold-start.mjs`) | Dynamic benchmark: spawns `pnpm dev`, issues a warmup GET `/` (to absorb the instrumentation boot chain), then GETs a fixed route set with a bounded per-route timeout. Reads `.next/dev/trace` for the `compile-path` span keyed by `tags.trigger` and reports median/min/max over N runs. Floor-scoped (`startTime <= floorMs`) so warm runs cannot pick up stale cold spans. Wall-clock is recorded separately and **never used for acceptance**. | Secondary corroborating metric. Inherently noisy. |
| `pnpm dev:stop` (`scripts/dev-stop.mjs`) | Worktree-scoped clean SIGTERM stop. Verifies pid ownership (liveness probe + `cwd === REPO_ROOT` OR ancestor `cmdline` contains `REPO_ROOT`) before signaling. **Never SIGKILL** (SIGKILL mid-compile corrupts the ~1.3 GB Turbopack persistent cache). **Never global `pkill`** (would hit the user's main `:3000` server and every other worktree). Refuses PORT 3000 without `--allow-port-3000`. Fails closed if the port stays bound after SIGTERM + one retry. | Between every cold bench run; before re-running dev on the same worktree port. |
| CI gate (`build-image.yml`) | Parallel CI job (~1.2 s) running 4 test files under `scripts/__tests__/` (30 tests). Gates the locked invariants: route-graph determinism + `isInlineTypeOnly` + traversal-guard; bench `compile-path` floor-scoping; the **vitest alias-ORDERING** invariant; `dev-stop` PORT-3000 refusal + ownership-verification. | Automatic on every PR. |

## The contract

- **Primary acceptance metric:** the static reachable first-party module count (`route-graph.mjs`). Zero variance; same input → byte-identical output.
- **Secondary corroborating metric:** the dynamic `compile-path` ms (`bench-cold-start.mjs`). N=3 routine; N=5 for the final published baseline. Report median + min + max. A compile-ms delta counts as a real win only when the median delta exceeds `max(baseline_range, new_range)`.
- **Lock the route set after the first baseline.** Never re-pick "top routes" dynamically — the target moves.
- **Wall-clock-to-response is recorded but NEVER used for acceptance.** `/api/mcp` proves why: its compile finishes in ~6 s but the request can hang 90 s+ in runtime (Redis/Sentry/app code). The `compile-path` span is the honest compile metric.
- **`compile-path` is keyed by `tags.trigger`.** Each `.next/dev/trace` line is a JSON ARRAY of spans (not a single object). Floor-scope by `span.startTime` (epoch ms) to prevent stale-span attribution across runs.
- **Dev-server lifecycle:** SIGTERM only. Worktree-scoped. Fail closed.

## How to add a new measurement

1. Lock a new fixed route set in `FIXED_ROUTES` inside `scripts/route-graph.mjs` (or use `--routes`).
2. Record the baseline: `pnpm route-graph --out <baseline-dir>/` + `pnpm bench:cold-start --mode cold --runs 5 --out <baseline-dir>/`. Commit the JSON outputs.
3. Make the change.
4. Re-measure with the same commands; commit the after-JSONs alongside.
5. Document the before/after delta alongside the change. Use the static count as the gate; cite the cold compile-ms as corroboration.

## Reusable doctrine

**On the cinatra Turbopack-dev stack today, first-party module count is NOT the dominant cold-compile cost.** Narrowing `/sign-in`'s static graph 679 → 95 modules (-86 %) only moved its cold compile -13 % (within baseline noise). `serverExternalPackages` already externalizes the heavy leaves (`openai`, `bullmq`, `@google/genai`, vendored MCP, etc.), so the remaining first-party modules are comparatively cheap to parse.

Implications for future perf work:
1. Module count is the deterministic primary gate; compile-ms is corroboration.
2. First-party prebuild-to-`dist` migrations have a small expected payoff on this stack (a spike empirically confirmed this — no migration).
3. What WOULD move the needle next time: reducing Turbopack's per-route FIXED setup cost; lazy-loading server modules below the request/action boundary on routes whose first render doesn't need them; revisiting prebuild only if a stable non-UI package crosses ~50+ modules.