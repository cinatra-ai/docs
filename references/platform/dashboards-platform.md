# Dashboards Platform

A Cinatra subsystem for interactive analytics dashboards backed by a semantic-layer engine. Two workspace packages cooperate:

- **`packages/sdk-dashboard`** — generic, extraction-ready. Owns DTOs, the drizzle-cube anti-corruption adapter, hooks (`useCubeQuery`, `useCubeMeta`), Cube.js wire-format helpers (`cubejs-wire.ts`), and a permission-resolver-aware persistence surface. **May not** import `@/`, `@cinatra/*`, `better-auth`, `bullmq`, or any Cinatra module — provider injection only.
- **`packages/dashboards`** — Cinatra glue. Owns Drizzle tables (`dashboards`, `dashboard_revisions`), the mutation service (single PERSIST-03 writer), Model Context Protocol (MCP) handlers, screens, Server Actions, and the `DashboardsClientShell` that wraps `<CubeProvider>` + `<DashboardStoreProvider>`.

## Architecture at a glance

```
Browser
  ↓
src/app/agents/executions/page.tsx  → AgentsDashboardPage (server component)
  ↓
packages/dashboards/src/screens/agents-dashboard.tsx
  ↓ mounts
DashboardsClientShell (provides QueryClient + CubeProvider + DashboardStoreProvider)
  ↓ wraps
<DashboardGrid>  (from drizzle-cube/client, themed via dashboard-theme.css)
  ↓ calls
GET /api/dashboards/cubejs-api/v1/load?query=<JSON>
  ↓ routes through
sdk-dashboard's drizzle-cube adapter → drizzle-cube/server
  ↓ generates
SELECT ... FROM cinatra.agent_runs LEFT JOIN cinatra.agent_templates ...
```

On save:

```
<DashboardGrid onSave={saveAgentsDashboardAction}>
  ↓ Server Action
packages/dashboards/src/actions.ts → upsertDashboardConfig()
  ↓
INSERT ... ON CONFLICT (id) DO UPDATE   (atomic, wrapped in pg_advisory_xact_lock)
  ↓ same TX
INSERT INTO audit_events (...)           (PERSIST-03 invariant)
```

## Design Decisions

- The headless foundation uses `drizzle-cube/server` only, an anti-corruption adapter, a two-package split, an ESLint boundary, exact-version pinning, shadcn-admin UI, and large language model (LLM) access only via `@cinatra-ai/llm`.
- `drizzle-cube/client` is allowed only through a directory-bounded exception: `drizzle-cube/client/*` imports are allowed inside `packages/dashboards/src/components/**` ONLY.

## Where the boundary is enforced

ESLint `no-restricted-imports` in `eslint.config.mjs` runs in 4 layered blocks (last matching block wins):

| Layer | Scope | What it forbids |
|---|---|---|
| 1 | repo-wide | `drizzle-cube/mcp`, `drizzle-cube/client*` (lifted by Layer 4), `drizzle-cube` root + non-client subpaths (lifted by Layer 3) |
| 2 | `packages/sdk-dashboard/src/**` excluding the adapter | `@/*`, `@cinatra/*`, `better-auth`, `bullmq` |
| 3 | `packages/sdk-dashboard/src/adapters/drizzle-cube/**` | Re-allows `drizzle-cube/*` server imports |
| 4 | `packages/dashboards/src/components/**` | Re-allows `drizzle-cube/client/*` (ADR 0045) |

Boundary tests live at `packages/sdk-dashboard/src/__tests__/eslint-boundary.test.ts` and assert both positive and negative controls.

## Wire format

The `/api/dashboards/cubejs-api/v1/[...endpoint]/route.ts` route serves drizzle-cube/client (Cube.js-compatible) AND Cinatra's internal `useCubeQuery` hook from the same surface:

- `GET /meta` — returns `CubeMeta` (`{ cubes: CubeMetaCube[] }`) with member names fully qualified `<cube>.<member>`. Cinatra `dimension.type === "date"` maps to drizzle-cube `"time"`; granularities emit as `["day", "week", "month"]` string literals (NOT `{name: "day"}` objects).
- `GET /load?query=<encoded JSON>` — Cube.js wire format. Returns `{ data, query, annotation }`.
- `POST /load` — same response shape; accepts the legacy `{ cubeId, query }` body too.
- `POST /batch` — drizzle-cube/client's multi-query path; serial-N over `/load`; HTTP 200 with per-query partial-success items (`{ success: true|false, data?, error?, query }`).

v1 rejects `funnel`/`flow`/`retention`/multi-query top-level keys with `400 unsupported_analysis_type` and rejects `filters[]` / `timeDimensions[]` with `400 unsupported_query_feature`.

## Persistence

`packages/dashboards/src/store/dashboard-config.ts` ships two Zod schemas:

- **Initial baseline** — permissive shape, portlets discriminated by `type`.
- **Current shape** (ADR 0045) — drizzle-cube `DashboardConfig` shape: `w/h/x/y` at portlet root + nested `analysisConfig`. `.passthrough()` accepts future drizzle-cube fields; `.superRefine()` enforces invariants (non-empty id/title, finite layout numbers, at least one content spec).

`CURRENT_CONFIG_VERSION = "1.1.0"` — new writes use v1.1.0; reads dispatch by `config_version` so v1.0.0 rows still parse.

## Mutation service

`packages/dashboards/src/mutation-service.ts` is the single writer (PERSIST-03 invariant). Every mutation:

1. Opens a Postgres transaction.
2. Acquires `pg_advisory_xact_lock(hashtext(id))` (in `upsertDashboardConfig`) or `SELECT ... FOR UPDATE` (in `update`/`publish`/`archive`).
3. Validates `DashboardConfig` via Zod.
4. Runs `resolveDashboardAccess(row, actor)` from `packages/dashboards/src/permissions.ts` — single permission resolver (PERSIST-08 invariant).
5. Executes the data change.
6. Writes an `audit_events` row INSIDE THE SAME TX.

`upsertDashboardConfig` uses `INSERT ... ON CONFLICT (id) DO UPDATE` via Drizzle's `.onConflictDoUpdate()` for race-free atomic upsert.

An AST regression gate at `packages/dashboards/src/__tests__/no-direct-writes.test.ts` walks every file and rejects any `tx.insert|.update|.delete(dashboards|dashboardRevisions)` outside the mutation-service allowlist.

## `/agents/executions` (the user-visible deliverable)

`/agents/executions` — the **Executions** tab of the Agents area — mounts an interactive `<DashboardGrid>` with two seeded portlets backed by the `agent_runs` cube. (The dashboard formerly lived at the bare `/agents`; that route now serves the **All Agents** run-agent picker instead, with no redirect from the old location.)

- **Top 5 recently used agents** — bar chart of `agent_runs.count` grouped by `agent_runs.agent_name`, order desc, limit 5.
- **5 latest run agents** — table of `agent_runs.last_run_at` (MAX, post-processed to relative time) grouped by `agent_runs.agent_name`, order desc, limit 5.

The dashboard id is `system-agents:<orgId>:<userId>` (per-user-per-org). On first save the row materialises with `ownerLevel: "user"` + `visibility: "private"`. Defense-in-depth:

- The MCP schema (`packages/dashboards/src/mcp/schemas.ts`) rejects any user-supplied `dashboardId` starting with `system-` — the reserved prefix.
- The screen-level read in `loadAgentsConfig()` filters by `id AND organizationId AND ownerId AND ownerLevel='user'`, so a pre-poisoned row created under a different actor falls through to the seed.

## Cube — `agent_runs`

`packages/sdk-dashboard/src/adapters/drizzle-cube/cubes/agent-runs.ts`:

- Dimensions: `agent_id` (UUID, back-compat), `agent_name` (LEFT JOIN to `agent_templates`, `coalesce(nullif(name, ''), template_id)`), `status`, `created_at` (time).
- Measures: `count` (count of id), `last_run_at` (MAX of `EXTRACT(EPOCH FROM created_at)` — numeric so MAX works; humanised by the route's `humanizeAgentRunsRows()` post-processor since DC's table renderer has no per-column date formatter).
- Access predicate: `WHERE org_id = ctx.organizationId OR run_by = ctx.userId` (owns OR can-access). Multi-org access widens `SecurityContext` with `accessibleOrgIds[]` so users in multiple orgs see all org-accessible runs.
- The factory takes `{ tableRef, columns, templatesTableRef, templateColumns }`. drizzle-cube needs the FULL Drizzle Table in `from` (Codex round-12 lesson — passing a destructured column-bag produces `FROM $1` and a pg JSON-serialisation crash).

## Theming

drizzle-cube/client ships ~124 `--dc-*` CSS variables. `packages/dashboards/src/components/dashboard-theme.css` (loaded by `dashboards-client-shell.tsx` AFTER `drizzle-cube/client/styles.css`) maps ~60 color/surface families to shadcn tokens:

- Surface family → `var(--card)` / `var(--surface)` / `var(--surface-muted)`.
- Text family → `var(--foreground)` / `var(--muted-foreground)`.
- Border → `var(--border)`.
- Primary / accent → `var(--primary)` / `var(--accent)`.
- Status (success / warning / error / info / danger) → shadcn semantic tokens, body fill derived with `color-mix(in srgb, var(--…) 15%, var(--card))`.
- Field-picker pills (drizzle-cube concept) — `--dc-dimension-*` / `--dc-measure-*` / `--dc-time-dimension-*` / `--dc-filter-*` — derived with `color-mix(...)` at 18% bg / 45% border against shadcn semantics.
- `--dc-primary-rgb` hardcoded per theme: light `45, 74, 138`, dark `226, 232, 240` (drizzle-cube uses it inside `rgba(var(--dc-primary-rgb), <alpha>)` which cannot accept a CSS color).
- Sizing/animation/font tokens keep DC defaults.

`DashboardsClientShell` sets `features.enableAI = false` (suppresses AnalysisBuilder AI buttons + short-circuits `useExplainAI`) and `enableBatching = false` (single-query path uses N `/load` calls, not 1 batched `/batch`; multi-query falls through to `/batch` via `useMultiCubeLoadQuery`).

## MCP cube tools

Three MCP tools mount drizzle-cube's native semantic-query surface under Cinatra's existing `/api/mcp` Better-Auth / OAuth gate:

- `dashboards_cube_discover` — list cubes + dimensions + measures + drizzle-cube's query-language reference.
- `dashboards_cube_validate` — parse a CubeQuery and surface the generated SQL (drizzle-cube 0.5.5+).
- `dashboards_cube_load` — execute a CubeQuery; rows are filtered at the SQL predicate layer.

### Architecture

This is a **vanilla integration** of `drizzle-cube/mcp`'s composable `getCubeTools`. No Cinatra-side query rewriting, limit clamping, or row post-processing. drizzle-cube owns the query lifecycle end-to-end; Cinatra owns identity resolution and registration shape only.

| Layer | File | Job |
|------|------|-----|
| Bridge | `packages/sdk-dashboard/src/adapters/drizzle-cube/mcp-tools.ts` | Wraps `getCubeTools` so the rest of the repo never imports `drizzle-cube/mcp`. Returns Cinatra-typed `{ definitions, handle, handles, toolNames }`. |
| Schema | `packages/sdk-dashboard/src/adapters/drizzle-cube/json-schema-to-zod.ts` | Narrow converter: drizzle-cube emits plain JSON Schema, Cinatra's MCP SDK expects Zod. Fails fast on unknown shapes so a drizzle-cube minor bump trips a regression test before the LLM sees the broken tool. |
| Cubes | `packages/dashboards/src/mcp-cubes/cubes-singleton.ts` | Lazy `globalThis`-cached semantic layer + cube tools bridge. Same `agent_runs` cube definition as the HTTP route. |
| Identity | `packages/dashboards/src/mcp-cubes/handlers.ts` | Reads `mcpRequestContextStorage` (populated by the MCP transport's Better Auth (the auth server library Cinatra uses) / OAuth Bearer pass). Strict agent-to-agent (A2A) protocol precedence — if `a2aActorContext` is present, BOTH `userId` AND `orgId` must come from it. |
| Registry | `packages/dashboards/src/mcp-cubes/registry.ts` | `server.registerTool(name, meta, handler)` x3 — same shape as `packages/lists/src/mcp/registry.ts`. |
| Module | `packages/dashboards/src/mcp-cubes/index.ts` | `createDashboardCubesMcpModule()` slotted into the `modules = [...]` array in `src/lib/mcp-server.ts`. |

### Tenant isolation

Identity flows into drizzle-cube's `getSecurityContext`, then into the cube's `sql` callback. The `agent_runs` cube enforces `org_id = ctx.organizationId OR run_by = ctx.userId` (owns-OR-can-access) at the SQL predicate layer — see [Cube — `agent_runs`](#cube--agent_runs) above. Multi-org membership widens this to `accessibleOrgIds[]`.

### Auth surface

Same gate as every other Cinatra MCP tool: the transport authenticates the request and populates `mcpRequestContextStorage` before any registered handler runs. The cube tools introduce no second auth surface; ESLint enforces this — see [ESLint boundary](#where-the-boundary-is-enforced) (Layer 3 permits `drizzle-cube/mcp` imports ONLY inside the adapter directory).

## AI surface

OFF by default and statically defended. Regression tests at `packages/dashboards/src/__tests__/no-ai-on-agents.test.ts` walk `packages/dashboards/src/{screens,components}/**` and forbid:

- `import` of `AgenticNotebook`, `ExplainAIPanel`, `useExplainAI`, `useAgentChat`.
- JSX render of `<AgenticNotebook>` / `<ExplainAIPanel>`.
- Hook call of `useExplainAI()` / `useAgentChat()`.
- String occurrences of `/agent/chat`, `/api/ai/`, `aiEndpoint`, literal `enableAI: true`.

The grep is scoped to Cinatra source only (skips `node_modules`) so drizzle-cube's internal bundle references don't trigger false positives.

Future AI work routes exclusively through `@cinatra-ai/llm`, including async AI dashboard generation via BullMQ (a Redis-backed job queue) and AI cube proposals with admin promotion.

## Gotchas — see also

`feedback_drizzle_cube_pitfalls.md` (user memory) catalogues seven traps invisible to typecheck + unit tests:

1. CSS subpath imports must live inside the workspace package that declares drizzle-cube as a dep (pnpm strict hoisting).
2. Cube `from` needs the FULL Drizzle Table, not a destructured column-bag.
3. `<DashboardGrid>` needs `<DashboardStoreProvider>` IN ADDITION to `<CubeProvider>` — separate Zustand context.
4. Chart peer deps load eagerly (`@nivo/heatmap`, `@xyflow/react`, `d3`, `elkjs`, `react-is`) — install them all even if you only render bar+table.
5. `chartType: "table"` has NO per-column formatter. Humanise (relative time, custom labels) via a route-handler post-processor or SQL CASE.
6. `<DashboardGrid config={...}>` is read-back on edit-mode exit. The inner `Dr` re-derives the visible grid from `props.config` when the user clicks "Finish Editing", so wrappers must hold a local React state mirror and advance it inside `onSave` — otherwise the visible layout snaps back to the pre-edit baseline even though the DB already holds the new layout. Pattern in `AgentsDashboardGrid`.
7. `onSave` alone misses edit actions. DC's compiled save funnel has conditional gating that's fragile to inspect (a guard difference between `ye`/`be` in `DashboardEditModal-*.js`). Subscribe to BOTH `onConfigChange` (debounced) and `onSave` (immediate) and route through a single coordinator that dedupes by JSON. Pattern in `packages/dashboards/src/components/auto-save-coordinator.ts`.

## Related

- [`references/platform/llm-orchestration.md`](./llm-orchestration.md) — where AI generation hooks in.
- Requirement categories: DASH, SDK, SEM, PERSIST, VIEW, BUILD, METRICS, CUBE-IR, AI.
- Deferred verification areas: modal focus-trap a11y, dark-mode visual smoke, bundle-size impact, multi-org isolation, concurrent first-save race, `/batch` partial-success.
