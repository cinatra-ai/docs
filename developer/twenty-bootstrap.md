# Twenty CRM Bootstrap (cinatra v6.14)

Operator runbook for the Phase 536 bootstrap proof gate. This document captures the exact recipe the proof script implements + the load-bearing decisions behind it.

> **Image-pull warning** — first start pulls `twentycrm/twenty:v2.7.3` (~2 GB) plus `postgres:16` and `redis:7`. Plan for ~10 min of bandwidth on a cold cache.

## TL;DR

```bash
# 1. Bring up the Twenty stack (profile-gated; default `docker compose up` does NOT start this)
docker compose --profile twenty up -d twenty-server twenty-worker twenty-db twenty-redis

# 2. Wait for healthy
./scripts/v614/wait-for-twenty-healthy.sh

# 3. Run the proof
node scripts/v614/twenty-bootstrap-proof.mjs

# 4. Sign in to the Twenty UI at http://localhost:3300 (Apple workspace)
#    Email: tim@apple.dev  (any password — dev mode disables real auth)
```

CI mode: prefix with `CINATRA_CI=1` to skip the local-token-cache path and keep the bearer in memory only.

## Why this exists

cinatra v6.14 retires `entity-accounts`, `entity-contacts`, and `lists` in favour of Twenty CRM as the source of truth. Phase 536 is a **BLOCKER**: no downstream code in v6.14 merges until this gate is green in CI and Codex APPROVEs the proof script. Twenty's MCP server is in **alpha** as of v2.7.3 (per Twenty's own docs), so the proof script also doubles as a stable contract — downstream phases consume the committed snapshot at `docs/developer/twenty-mcp-tools.json`.

## Material upstream deviations from the milestone REQUIREMENTS

### D-536-A — Bootstrap is API-key bearer, not OAuth `client_credentials`

The original REQ assumed `POST /oauth/register` + `POST /oauth/token` (`grant_type=client_credentials`). **Twenty's OAuth controllers only allow `authorization_code` and `refresh_token`** (`packages/twenty-server/src/engine/core-modules/application/application-oauth/controllers/oauth-registration.controller.ts:34`). `client_credentials` is not a code path. Twenty's documented automation flow uses a **bearer API key** minted via the dev/test-only CLI `workspace:generate-api-key`. The MCP guard delegates to JwtAuthGuard, which accepts API-key-issued JWTs.

The proof script implements this corrected flow. **Codex paired R1 APPROVE.**

### D-536-B — `IS_MULTIWORKSPACE_ENABLED` is not a Twenty env var

The original D10 said "Twenty `IS_MULTIWORKSPACE_ENABLED=false`". **No such env var exists upstream** (verified against `twenty-config.variables.ts`). Single-workspace is achieved by **`workspace:seed:dev --light`'s seed-shape** — it seeds only the Apple workspace.

> **Important:** the `--light` flag defines the *initial* seed shape (Apple only). Twenty can still create additional workspaces through its own UI surfaces; we are not actively preventing that, we are simply not seeding more. If the deployment must hard-enforce single-workspace, that's a separate constraint (deferred to v6.14.1 alongside managed-deployment work).

## The bootstrap recipe (Phase 536, CRM-BOOT-01 … CRM-BOOT-11)

| Step | What | How | Idempotent? |
|---|---|---|---|
| 1 | 4 containers up + healthy | `docker compose --profile twenty up -d twenty-{server,worker,db,redis}` | yes |
| 2 | HTTP healthcheck | `GET http://localhost:3300/healthz` → 200 | yes |
| 3 | Apple workspace seeded | `docker exec cinatra-twenty-1 yarn command:prod workspace:seed:dev --light` | yes — second run is a clean no-op |
| 4 | API key minted | `docker exec cinatra-twenty-1 yarn command:prod workspace:generate-api-key -w 20202020-1c25-4d02-bf25-6aeccf7ea419 -n cinatra-bootstrap-v6.14` | yes (local mode reuses cached key if still authenticates; CI mode always mints fresh `-e 1`) |
| 5 | MCP discovery | `POST /mcp` JSON-RPC `initialize` (proto v2025-06-18) → `tools/list` | yes |
| 6 | Snapshot tool catalog | `POST /mcp tools/call get_tool_catalog` (categories=DATABASE_CRUD) → write `docs/developer/twenty-mcp-tools.json` canonicalized | yes (byte-diff vs committed; CI fails on drift unless `UPDATE_SNAPSHOT=1`) |
| 7 | Custom fields | Metadata API `createOneField` for `cinatraObjectId`, `apolloPersonId`, `apolloOrganizationId`, `enrichmentStatus`, `inLists`, plus social URLs | yes — "Name not available" / NOT_AVAILABLE errors treated as success |
| 8 | CRUD smoke | full round-trip: create_company → create_person (with companyId link) → find_one_* read-back → update_* both → delete_person | leaves fixture rows (see Cutover) |
| 9 | Views fixture | tag 3 Persons with inLists + 1 untagged control; strict View-filter contract deferred to Phase 537 | leaves fixture rows |
| 10 | Batch probe | `find_people` (catalog name) returns sub-500ms locally | read-only |
| 11 | Deeplink | `GET /rest/companies/<id>` → 200 + JSON echoes recordId · negative-control random-UUID does NOT 200 · UI route `/object/companies/<id>` → 200 | read-only |

## Key contracts

### Twenty MCP shape (v2.7.3)

The MCP server exposes **5 native tools**:

1. `execute_tool` — `{ toolName, arguments }`. The toolName MUST come from the catalog.
2. `get_tool_catalog` — `{ categories?: ["DATABASE_CRUD" | "ACTION" | "WORKFLOW" | "METADATA" | "VIEW" | "VIEW_FIELD" | "DASHBOARD" | "LOGIC_FUNCTION"] }`. Returns the catalog (~184 tools in DATABASE_CRUD on the seeded Apple workspace).
3. `learn_tools` — `{ toolNames, aspects? }`. Returns the input schemas.
4. `load_skills` — `{ skillNames }`. Returns step-by-step instructions for complex flows.
5. `search_help_center` — `{ query }`. Twenty docs search.

The protocol is JSON-RPC over `POST /mcp`. Twenty replies with `application/json` by default and `text/event-stream` when the client sets `Accept: text/event-stream`. Auth is `Authorization: Bearer <api-key-JWT>`.

### Metadata API schema gotchas

- Default page size is **10**; always pass `paging: { first: 200 }` for object/field discovery on the Apple workspace (27 objects + lots of fields).
- Validation errors are surfaced at `errors[].extensions.errors.fieldMetadata[].errors[].code` (e.g. `NOT_AVAILABLE` for "field name already in use"). The top-level `message` is the unhelpful "Multiple validation errors occurred while creating fields" — always inspect `extensions`.
- Field-type alias drift: across Twenty 2.x minor versions, the connection-filter input type has been `ObjectFilter` (v2.7.3) and `ObjectFilterInput` (earlier). The proof script avoids typed filters entirely — it pulls the full object list and filters in-memory.

### Token storage

- Local mode (default) → `data/twenty/bootstrap.local.json` (mode `0600`, gitignored under existing `/data/`).
- CI mode (`CINATRA_CI=1`) → bearer held only in memory, short TTL `-e 1`.
- Logs always redact the bearer to `****<last4>`.

### Container names

- `cinatra-twenty-1` (server, port 3300)
- `cinatra-twenty-worker-1`
- `cinatra-twenty-db-1` (postgres, port 5532)
- `cinatra-twenty-redis-1` (redis, port 6479)

## Common failures + recovery

| Symptom | Probable cause | Recovery |
|---|---|---|
| `Couldn't find a script named "command:run"` | You're trying the dev-mode script name in the prod image | Use `yarn command:prod <command>` (the docker image is the prod build). |
| `Multiple validation errors` on createOneField | Field name already exists | Treated as idempotent success by the proof script. If from your own code: inspect `extensions.errors.fieldMetadata[].errors[].code` for the real reason. |
| `Tool "undefined" not found` from `execute_tool` | Passing `tool` / `input` instead of `toolName` / `arguments` | Use `{ toolName, arguments }` — Twenty's MCP rejects unknown keys. |
| Snapshot drift in CI | Twenty image bumped or catalog grew | Investigate the diff. If intentional, rerun locally with `UPDATE_SNAPSHOT=1`, commit the new snapshot, update the Twenty `${TWENTY_TAG}` pin. |
| Workspace seed exit=1 with "already" or "duplicate key" in stderr | Workspace already seeded | Treated as idempotent success by the proof script (see `step3_seed` in `twenty-bootstrap-proof.mjs`). |
| `/healthz` → 200 but MCP `initialize` → 401 | Bearer is stale or workspace re-created | `rm data/twenty/bootstrap.local.json` and rerun the proof; it will mint a fresh key. |

## Phase 540 LEARNINGS note (for the close-out)

- `workspace:generate-api-key` is dev/test-only — managed Twenty deployments will need a different bootstrap path (Settings UI / API key creation via authenticated REST). Out of scope for v6.14.1.
- Twenty MCP `get_tool_catalog` reports **184 DATABASE_CRUD tools** on the Apple workspace as of v2.7.3. Downstream phase 537/538 catalog audits should expect this baseline.
- Twenty has no built-in bulk-delete tool in MCP — the proof script does not attempt to clean up its fixture rows; Phase 539's wipe-and-reseed cutover handles full reset.

## See also

- [`twenty-transport-matrix.md`](./twenty-transport-matrix.md) — per-operation transport decision (MCP vs REST vs CLI).
- [`twenty-mcp-tools.json`](./twenty-mcp-tools.json) — committed canonical snapshot of the native + catalog tool surface.
- [`.planning/phases/v6.14-p536-twenty-bootstrap/PLAN.md`](../../.planning/phases/v6.14-p536-twenty-bootstrap/PLAN.md) — full Phase 536 plan + Codex r1 fold-ins.
