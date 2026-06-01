# Clone-on-demand worktrees

A *heavy* alternative to `cinatra setup branch` that gives a git worktree its own full
Postgres **database** (not just a schema). Created dormant; `cinatra clone start`
brings up a per-clone WayFlow (Cinatra's OAS Flow agent runtime) (+ optional Tailscale Funnel (a public-internet tunnel)) on demand.

## Two isolation paths

| | `cinatra setup branch` (light) | `cinatra setup clone` (heavy) |
|---|---|---|
| What is isolated | A Postgres **schema** (`cinatra_<slug>`) inside the shared `postgres` DB | A separate Postgres **database** (`cinatra_clone_<slug>`) |
| Better Auth (the auth server library Cinatra uses) (`public.user` / `session` / …) | **shared with main** | **isolated per clone** (own `public`) |
| Teardown | `DROP SCHEMA … CASCADE` (may miss edge cases) | `DROP DATABASE … WITH (FORCE)` (clean) |
| Snapshot mechanism | row-by-row `INSERT … ON CONFLICT` from the live `cinatra` schema | `CREATE DATABASE … TEMPLATE cinatra_seed` (file-level copy; preserves sequences/identity/indexes/constraints) |
| Port band | 3001-3099 (Next.js) | 3100-3119 (Next.js) + 3200-3219 (WayFlow) |
| `BULLMQ_QUEUE_NAME` | `cinatra-bg-<slug>` | `cinatra-clone-<slug>` |
| Worktree creation | Claude Code `EnterWorktree` → `.claude/worktrees/worktree-<name>` | **`cinatra setup clone` owns it** → `../cinatra-ai-<slug>`, branch `cinatra-ai-<slug>` |
| Operator action | `pnpm cinatra setup branch` (auto via hook) | `pnpm cinatra clone refresh-seed` once, then `pnpm cinatra setup clone <name>` |
| Deps install | manual `pnpm install` | **automatic** (`corepack pnpm install`) on creation |

> **Source-schema constraint:** both `clone refresh-seed` and `setup clone` require the source
> `SUPABASE_SCHEMA` to be unset or exactly `"cinatra"` — they throw clearly otherwise.
> Worktrees on a custom app schema stay on `setup branch`; clone seeding currently supports only the default app schema.

**Reach for `setup clone`** when a worktree needs true Better-Auth-table isolation, or a
real point-in-time snapshot of the live DB (e.g. for testing a destructive migration), or
dedicated WayFlow + public tunnel. Stick with `setup branch` for
ordinary code-level work — it's lighter, hook-driven, and shares main's Better Auth state.

## The four commands

### `cinatra clone refresh-seed [--source-env <path>]`

(Re)builds the `cinatra_seed` template database — the source every clone forks from.

1. Connects to the maintenance DB (forced to `/postgres`) — `CREATE/DROP/ALTER DATABASE`
   never runs while connected to the DB being mutated.
2. Drops any existing `cinatra_seed` (clears `IS_TEMPLATE` + `ALLOW_CONNECTIONS`, terminates
   backends, drops).
3. Creates an empty `cinatra_seed`.
4. `pg_dump` the live app DB (schemas `public` + `cinatra` only — branch worktree
   `cinatra_<slug>` schemas are explicitly excluded), `--clean --if-exists --no-owner
   --no-privileges --format=plain`, then `psql` restore into `cinatra_seed`. Uses the
   shared `runPostgresCommand` helper — host `pg_dump`/`psql` if available, falling back
   to the pinned `postgres:17-alpine` docker client image. The fallback's host-reachability
   rewrite is platform-specific: macOS rewrites `127.0.0.1`/`localhost` in the connection
   string to `host.docker.internal`; Linux keeps `127.0.0.1` and adds `--network host` to
   the `docker run` invocation.
5. `TRUNCATE` every table in `SEED_SKIP_TABLES` (the operational set: `agent_runs`,
   `agent_run_messages`, `audit_events`, `notifications`, `traces`, `chat_threads`,
   `record_activities`, `planned_actions`, `review_tasks`, `usage_events`).
6. `TRUNCATE` every table in `SEED_AUTH_SCRUB_TABLES` (`session`, `verification`,
   `oauthAccessToken`, `oauthRefreshToken`, `oauthConsent`) — mixed-case identifiers, with
   `quoteIdentifier` for both schema and table. The Better Auth *identity* tables (`user`,
   `account`, `organization`, …) are intentionally **kept** so the operator can sign into
   a clone with the same credentials.
7. Records `clone_seed_info` (source DB, refresh timestamp, git SHA) in `cinatra.metadata`.
8. `ALTER DATABASE cinatra_seed WITH IS_TEMPLATE true ALLOW_CONNECTIONS false` so
   `CREATE DATABASE … TEMPLATE cinatra_seed` always succeeds.

### `cinatra setup clone [<name>] [--slug <name>] [--worktree-path <path>] [--source-env <path>] [--force]`

**Creates** and provisions a **dormant** deep-fork clone. Two modes:

- **CLI-owned (recommended)** — `cinatra setup clone <name>` (positional) or
  `--slug <name>`. The CLI creates the git worktree itself: derives the main repo
  root (via `git rev-parse --git-common-dir`), then
  `git -C <mainRepoRoot> fetch origin` + `git worktree add
  <parentDir>/cinatra-ai-<slug> -b cinatra-ai-<slug> origin/main` (idempotent —
  reuses an existing `cinatra-ai-<slug>` branch without `-b`; skips creation if a
  worktree is already registered to the slug). No `EnterWorktree`, no
  `.claude/worktrees/`, no `worktree-` prefix. After provisioning it auto-runs
  `corepack pnpm install` in the new worktree (only when the worktree was just
  created or `node_modules` is absent; uses `corepack` so the pinned
  `packageManager` is honored — a stray global pnpm mangles the lockfile). An
  install failure is loud and exits non-zero but never rolls back the DB/worktree
  (provisioning already succeeded).
- **Current-worktree mode (no name)** — `cinatra setup clone` with no slug
  provisions the **current** worktree in place (slug from
  `resolveRealBranchName`, `cinatra-ai-`/`worktree-` prefixes stripped). This is
  the path the `EnterWorktree` hook uses (see "Hook-driven
  provisioning" below) — it does NOT create or relocate a worktree.

Internal slug stays short: `cloneSlugFromBranch` strips a leading `cinatra-ai-`
or `worktree-` segment, so the DB is `cinatra_clone_<slug>` regardless of the
branch/dir prefix.

Provisioning steps (both modes):

1. Resolves the slug (positional/`--slug`, else from
   `resolveRealBranchName(worktreePath)`, detached-HEAD safe) and
   derives `dbName = cloneDbName(slug)` (`cinatra_clone_<slug-with-underscores>`).
2. Verifies `cinatra_seed` exists and is a template — errors with a clear
   `run: cinatra clone refresh-seed` hint otherwise.
3. **Allocates the registry slot under a file lock** (`~/.cinatra/clones.json.lock`,
   inode-ownership aware so a concurrent stale-steal cannot kill a fresh lock). Lowest
   free index 0-19; throws on cross-worktree slug aliasing. Writes the slot in state
   `provisioning`.
4. Strict-compares any existing `.env.local` against **every** clone-derived value
   (`CINATRA_CLONE_SLUG`, the `SUPABASE_DB_URL` database path, `SUPABASE_SCHEMA=cinatra`,
   `PORT`, `BULLMQ_QUEUE_NAME`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_*`). Mismatch aborts
   unless `--force`. (`LANGGRAPH_CINATRA_BASE_URL` is excluded from the compare because no runtime code reads it.)
5. `CREATE DATABASE cinatra_clone_<slug> TEMPLATE cinatra_seed` (idempotent — kept if it
   already exists).
6. Writes the worktree `.env.local` (mode 0600).
7. Flips the slot from `provisioning` to `ready` under the file lock — a failure between
   steps 3 and 7 leaves the slot `provisioning`, recoverable by a re-run.

### `cinatra clone prune [--worktree-path <path>] [--slug <slug>] --yes`

Destroys a clone. Order is **validate-registry-first** — a malformed registry throws
before any DROP runs.

1. `requireUsableRegistry` (refuses malformed — leaves the file intact for repair).
2. Derives `dbName = cloneDbName(slug)` **deterministically** (never trusted from a
   stored value); a mismatched `slot.dbName` aborts with a registry-inconsistent error.
3. `isProtectedDbName(dbName)` hard guard — fail closed against `postgres` / `cinatra` /
   `cinatra_seed` / `template*` / anything not shaped like a clone DB.
4. Connects to the **maintenance DB** (`/postgres`), terminates backends on `dbName`,
   `DROP DATABASE IF EXISTS … WITH (FORCE)`.
5. Redis queue cleanup for `bull:cinatra-clone-<slug>:*`.
6. Releases the registry slot only if the cleanup succeeded — otherwise retains the
   slot with a re-run hint so orphaned keys are never silently abandoned.
7. **CLI-owned worktree removal** (`pruneCliOwnedWorktree`): a 3-layer guard —
   recorded `worktreePath` ≠ main repo root, **equals** the expected
   `<parentDir>/cinatra-ai-<slug>` sibling, and is listed in
   `git worktree list --porcelain` — then `git worktree remove`
   (→ `--force` retry) **and** `git branch -D cinatra-ai-<slug>` so teardown is
   zero-residue. A hook-owned or non-CLI-owned path (e.g. a `.claude/worktrees/...`
   EnterWorktree clone) is **skipped entirely** — DB/slot/Redis-only behavior is
   kept for it. The same guard is applied per-slot by `prune --stale`.

### `cinatra clone list`

Read-only registry table (slug, ports, database, state, worktree, createdAt). Tolerates
a malformed registry by reporting corruption rather than crashing.

## The clone registry

`~/.cinatra/clones.json` is the source of truth for **port allocation**. Dormant clones
hold no listening socket, so `findFreePort` cannot see them — only the registry can. Pure
module: [packages/cli/src/clone-registry.mjs](../../packages/cli/src/clone-registry.mjs).

Shape:

```json
{
  "version": 1,
  "clones": {
    "<slug>": {
      "index": 0,
      "nextjsPort": 3100,
      "wayflowPort": 3200,
      "dbName": "cinatra_clone_<slug-with-underscores>",
      "worktreePath": "/abs/path",
      "state": "provisioning" | "ready",
      "createdAt": "<ISO 8601>"
    }
  }
}
```

`readRegistry` deep-validates every slot (index in 0..19, ports match the index, dbName
matches `cloneDbName(slug)`, state is in `provisioning | ready`, etc.). A
syntactically-valid-but-shape-invalid registry is classified `malformed` —
`requireUsableRegistry` throws so a corrupt file cannot drive a colliding port or a
wrong-DB destructive op. The bad file is left in place for the operator to repair.

## Known limitations

- **Wrong-version host `pg_dump`** — `runPostgresCommand` falls back to the docker client
  image only when the host binary is *absent*. A wrong-version host `pg_dump` exits
  nonzero and surfaces a clear error; that matches the 3 existing `cinatra backup`
  callers. Changing the fallback to also trigger on nonzero exit is a behavior change to
  shared shipped code — routed as a separate follow-up.
- **`clone prune` with no reachable `redis-cli`** — `cleanupRedisQueueKeys`
  resolves a runner: (1) host `redis-cli` (authoritative for any URL incl.
  remote, passes `-u`); else, only for a **loopback** Redis, (2) `docker exec`
  into the **single** running container that publishes the configured Redis
  port (matched as `<hostport>->6379/tcp` — Redis' standard internal port;
  a non-standard internal port simply won't match → fail closed).
  Container identity is the published port, never a
  name guess — 0 or >1 candidates **fail closed** so prune can never DEL the
  wrong project's keys or falsely release the slot. A remote `REDIS_URL` with
  no host `redis-cli` also fails closed. On failure the registry slot is
  retained by the deliberate prune-on-Redis-failure design — the DB is already dropped; make Redis reachable and
  re-run prune (idempotent) to release the slot.

## Lifecycle commands

### `cinatra clone start [<slug>] [--rebuild-wayflow] [--tailscale-host-network]`

Brings up the local stack:

1. Acquires the per-clone runtime lock (`~/.cinatra/clones/<slug>/clone.lock`).
2. Validates `TS_AUTHKEY` if set in env (rejects malformed). The flag form
   `--tailscale-authkey` is intentionally REJECTED — pass via env to keep the
   secret out of shell history and `ps`.
3. Verifies the clone DB is reachable (`SELECT 1` on `cinatra_clone_<slug>`).
4. Builds `cinatra-wayflow:local` if the image is missing (`--rebuild-wayflow`
   forces rebuild on every start).
5. Renders the compose template into `~/.cinatra/clones/<slug>/compose.yml`.
6. Generates/reads a per-clone `CINATRA_BRIDGE_TOKEN` from
   `cinatra.metadata['bridge_token']` in the clone DB (re-rolled once on first
   start; clones never inherit main's bridge token).
7. Spawns `pnpm dev` (cwd = worktree, detached, new process group). Writes
   `nextjs.pid` + `nextjs.log` (truncated). Skipped on idempotent re-entry
   when pid + cwd + `/api/health` all check out.
8. `docker compose -p cinatra-clone-<slug>-<slot> up -d wayflow [tailscale]`.
   Stdout/stderr scrubbed of any `TS_AUTHKEY` content if Tailscale enabled.
9. Health-polls `http://localhost:31NN/api/health` + `http://localhost:32NN/.health`
   up to 60s each.
10. If `TS_AUTHKEY` was set: polls `tailscale status --json` inside the sidecar
    for `Self.DNSName`; the Funnel URL is read from there (never synthesised
    from hostname+tailnet). Probes `<funnel-url>/api/mcp/health` for 200 then
    UPSERTs `connector_config:mcp_server.publicBaseUrl` into the clone DB.
11. Without `TS_AUTHKEY`: clone runs **local-only**. `publicBaseUrl` stays
    cleared. The notice is printed so operators know.

### `cinatra clone stop [<slug>]`

1. Clears `mcp_server.publicBaseUrl` in the clone DB (no stale Funnel URL
   across stop/start).
2. `docker compose -p ... down`.
3. SIGTERMs the Next.js process **group** (verifies cwd-match first; a
   stale pid reused by another process is never signalled).
4. SIGKILLs after a 10s grace if still alive.
5. Removes `nextjs.pid`.

The clone DB + registry slot survive. To drop the clone DB entirely, run
`cinatra clone prune --slug <s> --yes`.

### `cinatra clone status [<slug>]`

Read-only diagnostic — pid alive Y/N, `/api/health` reachable Y/N, WayFlow
`/.health` reachable Y/N, compose project name, runtime-lock state, log path.

### `cinatra dev tunnel <start|stop|status>`

The bare `pnpm dev` MAIN-instance equivalent of the per-clone Funnel
(`cinatra clone start`). Both share the single deterministic
`deriveDevTailscaleHostname({dbUrl, schema})` source of truth — the SAME
deriver the app's dev-tab flyout preview uses — so the predicted hostnames
never collide: main → `cinatra-main`, heavy clone → `cinatra-clone-<slug>`,
light worktree → `cinatra-<slug>`.

#### `cinatra dev tunnel start`

1. **Dev-only HARD REFUSAL.** Exits with a thrown error (exit 1) unless
   `CINATRA_RUNTIME_MODE=development`, BEFORE any Docker / Nango (the OAuth gateway brokering connector credentials) / DB side
   effect (dev-only boot-path convention). The message
   tells the operator that production main must instead use the
   operator-supplied public URL at `/configuration/development?tab=tunnel`.
2. **Collision guard.** Asserts no real registered clone has claimed the
   reserved name `dev-main` before any side effect (throws clearly if one
   exists).
3. Uses the reserved fixed slug `"dev-main"` (index 0) fed into the
   slug-parameterized PURE clone-runtime path builders (`cloneComposePath` /
   `cloneTailscaleServePath` / `cloneComposeProjectName`), deliberately
   bypassing `loadReadyCloneSlot` / the clone registry.
4. Predicts hostname `cinatra-main` (e.g.
   `https://<your-tailnet>.ts.net`) via `deriveDevTailscaleHostname`.
5. Next.js port is the bare `pnpm dev` default (3000 / `env.PORT`), NOT the
   3100+ clone band.
6. Idempotent — skips if the dev-main compose project is already up.

#### `cinatra dev tunnel stop`

1. Tears the dev-main Tailscale sidecar down.
2. Reads `publicBaseUrlSource` from the main DB and
   clears `publicBaseUrl` ONLY when this subsystem owns it
   (`source ∈ {tailscale-auto, tailscale-funnel}`). An operator-set manual
   URL is left UNTOUCHED.

#### `cinatra dev tunnel status`

Read-only — reports predicted hostname vs registered hostname + whether
`publicBaseUrl` is currently set in the main DB. Never throws on "not
running" (clean output, short non-fatal probe). Correctly distinguishes the
deterministic prediction from any stale manual-connect DB residue.

Production main does NOT use this command — it must use the operator-supplied
public URL at `/configuration/development?tab=tunnel` (exactly what the
hard-refusal message tells the operator).

## Hook-driven provisioning

> Heavy clones are normally created by `cinatra setup clone <name>` (the
> CLI-owned path above) — that does NOT use `EnterWorktree` and is the
> recommended flow. The hook path below is available for operators who drive
> heavy clones through `EnterWorktree`; it routes through the no-slug
> current-worktree mode and provisions the EnterWorktree-created
> `.claude/worktrees/worktree-<name>` worktree in place (no relocation, no
> `cinatra-ai-` rename).

The EnterWorktree / ExitWorktree hooks default to **light branch mode**. Operators opt into clone mode by placing a marker
file:

- `<worktree>/.cinatra-clone-on-demand` — per-worktree, before the hook runs.
- `<repo-root>/.cinatra-clone-on-demand-default` — repo-wide default; every
  new worktree gets a clone.

When the marker is present, EnterWorktree invokes `cinatra setup clone`
instead of `cinatra setup branch`. ExitWorktree detects clone mode via
`cinatra clone slug-for-worktree --worktree-path <p>` (registry lookup; the
canonicalisation falls back to abs-string match so a removed worktree dir
can still be found).

ExitWorktree on a clone runs `cinatra clone stop` only — the DB is retained.
To drop the DB run `cinatra clone prune --slug <s> --yes` explicitly.

## Stale-clone detection

A registry slot is **stale** when `slot.worktreePath` no longer resolves to
an existing directory (operator did `rm -rf` the worktree, `git worktree
prune` ran, etc.). `cinatra clone list` annotates stale rows with `[STALE]`.

To bulk-prune every stale clone:

```bash
cinatra clone prune --stale --dry-run     # preview targets
cinatra clone prune --stale --yes         # actually prune them
```

There is **no `$HOME` / repo-root exclusion** — Cinatra worktrees normally
live under `$HOME`, so excluding it would make `--stale` useless. The single
safety check is dir-existence.

## Tailscale Funnel

The per-clone Tailscale sidecar exposes the clone's host-native Next.js on
a public Funnel URL. Requires `TS_AUTHKEY` in the operator's shell env.

### Auth-key flow

1. Generate an **ephemeral preauthorised** key at
   https://login.tailscale.com/admin/settings/keys (ephemeral so the device
   auto-vacates on container exit; preauthorised so no manual approval).
2. `export TS_AUTHKEY=tskey-auth-…`
3. `cinatra clone start`

The key is **never written to disk**. The rendered `compose.yml` contains
the LITERAL string `${TS_AUTHKEY}`; docker compose substitutes from the
spawned-process env at exec time. Stderr from `docker compose up` is scrubbed
of any `tskey-auth-…` substring before being forwarded.

The CLI flag `--tailscale-authkey` is **rejected** (both space and equals
forms). Set the env var.

### MCP-side reachability check

`<funnel-url>/api/mcp/health` is the canonical probe. Unauthenticated,
returns `{ status, mcpHandlerWired, serverInfo }`. The route is part of
the existing `/api/mcp` PUBLIC_PATH_PREFIXES so Better-Auth doesn't gate
it.

### macOS host networking (Linux-only optimisation)

The Tailscale sidecar uses `extra_hosts: ["host.docker.internal:host-
gateway"]` and points at `http://host.docker.internal:31NN` by default
(macOS-friendly). Linux operators can pass `--tailscale-host-network` to
switch to `network_mode: host` + `http://127.0.0.1:31NN` (one fewer hop).

## Migrating a light branch to a clone

To move a worktree from a light branch env to a clone:

```bash
# In the worktree:
cinatra teardown branch --yes
rm .env.local
cinatra setup clone
```

Note: the clone is built from `cinatra_seed` (the scrubbed source-of-truth
snapshot). The light branch's `cinatra_<slug>` schema data is intentionally
NOT carried over. If you need branch state in the clone, take a backup of
the schema first (`cinatra backup create`).

## Capability summary

- Seed DB + dormant deep-fork clone provisioning.
- `cinatra clone start|stop|status` manages the per-clone WayFlow container, host-native Next.js lifecycle, and health checks.
- Per-clone Tailscale Funnel sidecar wires `mcp_server.publicBaseUrl` and exposes `/api/mcp/health`.
- EnterWorktree/ExitWorktree hooks can opt into clone mode, with stale-clone detection and `prune --stale` bulk cleanup.
- `cinatra setup clone <name>` owns worktree creation (`../cinatra-ai-<slug>`, branch `cinatra-ai-<slug>`, from `origin/main`) and auto-installs deps; `clone prune` removes the CLI-owned worktree and branch. The no-slug / EnterWorktree-hook path remains available for current-worktree provisioning.
- `cinatra dev tunnel <start|stop|status>` provides the dev-main Funnel verb for bare `pnpm dev`, with dev-only hard refusal, source-guarded stop, optimistic `publicBaseUrl` write decoupled from reachability probes, and deterministic collision guard.
