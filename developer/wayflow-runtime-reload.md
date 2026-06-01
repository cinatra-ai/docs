# WayFlow Runtime Hot-Reload

How the WayFlow (Cinatra's OAS Flow agent runtime) multi-tenant runtime picks up freshly published or newly installed agents **without** a container restart.

## TL;DR

```
TS-side publish/install completes -> triggerWayflowReload() ->
POST {WAYFLOW_BASE_URL}/.internal/reload-agents
(X-Cinatra-Bridge-Token: $CINATRA_BRIDGE_TOKEN)
-> runtime diff-mounts disk changes -> ready
```

Before this mechanism existed, publishing an agent required `docker compose restart wayflow`. With it, the agent is callable within seconds of `agent_source_publish` returning.

## Architecture

The wayflow container hosts one `Starlette` parent app that mounts one `A2AServer` ASGI sub-app per `agents/<vendor>/<slug>/cinatra/oas.json` found under the mounted `/agents` volume. The parent app has three classes of routes:

1. **Base routes** (always present):
   - `GET /.health` - `{status, agents, failed, failed_agents, last_reload_at}`
   - `POST /.internal/reload-agents` - bridge-token-authed diff-mount endpoint
2. **Per-agent mounts** - `/agents/<vendor>/<slug>/*` proxied to each agent's agent-to-agent (A2A) protocol sub-app.
3. **(Internal)** - registry state machinery; not exposed.

### `MountedAgentRegistry`

Owns every mounted agent's runtime state: A2AServer, ASGI sub-app, Starlette `Mount`, Open Agent Specification (OAS) fingerprint, per-agent `AsyncExitStack`. Mutates `parent_app.router.routes` under an `asyncio.Lock` via copy-on-write - never in place.

### `_LifecycleLane`

A single long-lived `asyncio.Task` that owns ALL child A2A lifespan enter/exit operations. Necessary because wayflowcore's `A2AApp` lifespan uses anyio internally, and anyio cancel scopes bind to the task that entered them. A naive `asyncio.create_task` for deferred cleanup would hit `RuntimeError: Attempted to exit cancel scope in a different task`. The lane funnels every enter/exit through one task so cancel scopes never cross.

Stack identity is keyed by `id(agent)` (NOT by label). Two `MountedAgent` instances for the same label (the "changed reload" path) get independent stack records - closing the old one never reaches into the new one.

### Reload diff

```
discover_agents_for_reload(/agents) ->
  valid:        [(vendor, slug, oas_path, sha256)]   # parsed OK
  parse_failed: [(vendor, slug, oas_path, error)]    # file exists but unparseable

added   = valid_labels - registry.keys()
changed = {l for l in valid_labels ∩ registry.keys() if fingerprint_changed(l)}
removed = registry.keys() - (valid_labels ∪ parse_failed_labels)
failed  = parse_failed_labels +
          {label, kind: "changed_failed_still_serving_previous"}  # changed mount failed; prior version stays live
```

**Critical**: a label that's present-on-disk-but-unparseable is `failed`, NOT `removed`. The prior good mount stays live. This prevents a corrupted oas.json mid-flight from accidentally unmounting a still-serving agent.

After computing the diff, the registry:
1. Builds a fresh `routes` list (base + per-agent mounts in `_active`).
2. Atomically assigns `parent_app.router.routes = new_routes` (Python reference swap).
3. Schedules deferred close (5s grace) of removed/replaced agents' stacks via the lane - gives in-flight requests against the old mount time to complete.

## Auth contract

`POST /.internal/reload-agents`:

| Condition | Response |
|-----------|----------|
| `CINATRA_BRIDGE_TOKEN` unset on the runtime | 503 `{error: "reload_disabled"}` |
| `X-Cinatra-Bridge-Token` header missing or mismatched | 403 `{error: "forbidden"}` |
| Token matches, reload succeeds | 200 `{added, changed, removed, failed, agents, last_reload_at}` |
| Reload encounters an unhandled exception | 500 `{error: <message>}` |

Token compare uses `hmac.compare_digest` unconditionally (no early-return on length mismatch).

## TS-side client

`triggerWayflowReload()` (`@cinatra-ai/agents`):
- Reads `WAYFLOW_BASE_URL` + `CINATRA_BRIDGE_TOKEN` from env.
- 10s `AbortController` timeout.
- Strips trailing slashes from `WAYFLOW_BASE_URL`.
- Validates the response shape - a malformed body returns `{ok: false, reason: "http_error"}`, never `ok: true`.
- **Never throws.** Callers always receive a typed `ReloadResult`.

```ts
type ReloadResult =
  | { ok: true; report: { added, changed, removed, failed, agents, last_reload_at } }
  | { ok: false; reason: "no_token" | "no_base_url" | "http_error" | "timeout" | "network"; detail?: string };
```

## Reload trigger sites

To avoid N reloads for an N-dep extension install, reload is fanned out across four ordered sites - install/publish at the top, then uninstall, then preflight auto-recovery at the bottom of the request lifecycle. `installAgentFromPackage` itself does **NOT** trigger reload (avoids per-dep N-reload for trees).

| Site | When | Notes |
|------|------|-------|
| `installAgentPackageWithDependencies` | After the full dep tree DB+disk install succeeds | One reload regardless of tree depth |
| `agent_source_publish` Model Context Protocol (MCP) handler | After `publishAgentPackageFromGitDir` + `installAgentFromPackage` + origin freeze succeed | Gated on install success - does NOT fire if DB sync threw |
| `extension-handler.ts::uninstall` | After DB delete + skills cleanup + disk-dir removal (`rmDirForRolledBackInstall`). Reaches both `extensions_uninstall` and `extensions_force_delete` (via `extensionRegistry.forceDelete`) | Best-effort: failures log but don't raise |
| `preflightWayflowAgent` | On 404 from the agent-card endpoint, before surfacing the error | POSTs reload + re-probes once; returns `{ code: "OK", recoveredViaReload: true }` on success |

Failure semantics: reload failure is non-fatal at every site. Durable side-effects (Verdaccio (an npm-compatible registry), DB, on-disk tarball, DB delete) stay committed; failure surfaces as `installedPendingReload: true` + structured `wayflowReload: { ok: false, reason }` (publish/install paths) or as a `WAYFLOW_AGENT_NOT_REGISTERED` result with diagnostic reason (preflight path).

## Install-time disk materialization

`installAgentFromPackage` writes the tarball's runtime files to `<agentInstallDir>/<vendor>/<slug>/` atomically before the DB upsert:

```
extract tarball to tempDir -> withInstallLock(packageName, async () =>
  materializeAgentPackageToDisk -> DB upsert -> commit/rollback
)
```

The lock is **re-entrant** (via `node:async_hooks` AsyncLocalStorage) so callers in different files (e.g. `extension-handler.ts` wrapping its compensation block) can hold an outer lock for the entire transaction including post-install steps. Nested `withInstallLock` calls from the same async context detect the held key and run inline without re-acquiring (no deadlock).

Path safety: strict `@vendor/slug` whitelist on `packageName` + `resolve().startsWith(agentsRoot + path.sep)` containment check. Symbolic links in the extracted tarball are rejected via an `lstat` walk before `fs.cp`.

Atomic write algorithm:
1. Copy tarball files to `<vendorRoot>/.tmp-<slug>-<rand>/`.
2. If `targetDir` already exists, `rename(targetDir, <vendorRoot>/.old-<slug>-<rand>/)`.
3. `rename(<tmpDir>, targetDir)`. On failure: restore `.old -> targetDir` before throwing.
4. Caller commits (deletes `.old`) on DB success, rolls back (restores `.old -> targetDir`) on DB failure.

The required runtime file is `cinatra/oas.json`. If the tarball doesn't contain it (e.g. `publishAgentPackage` non-from-git-dir path), `materializeAgentPackageToDisk` returns `{materialized: false, reason}` and the DB upsert continues - but the agent won't be callable via WayFlow until the files are placed manually. Use `publishAgentPackageFromGitDir` to ensure the tarball preserves the runtime files.

## Preflight auto-recovery

The chat-builder runs `preflightWayflowAgent` before enqueueing a BullMQ (a Redis-backed job queue) run job. If the agent's card endpoint 404s, the preflight **automatically attempts a reload** and re-probes once before surfacing the error. This closes the small window between publish -> materialize -> reload during which the agent might briefly not be reachable.

When the auto-recovery itself fails, the error message names the three most-likely causes:
- The wayflow container is running an image without the `/.internal/reload-agents` endpoint - rebuild + restart it.
- The agent's tarball is **missing `cinatra/oas.json`** (use `publishAgentPackageFromGitDir`).
- The agent's `oas.json` **failed to parse** on the runtime - check `docker logs cinatra-wayflow-1`.

## Operator runbook

### Verify the runtime supports hot-reload

```bash
curl -s http://localhost:3010/.health | jq '.last_reload_at'
# null (until first reload) OR an ISO timestamp
```

A 404 on `/.health` means the runtime is too old or off-by-port; a `last_reload_at` key (even if `null`) means hot-reload is available.

### Manually trigger a reload

```bash
curl -X POST -H "X-Cinatra-Bridge-Token: $CINATRA_BRIDGE_TOKEN" \
  http://localhost:3010/.internal/reload-agents | jq
```

### After upgrading the runtime image

```bash
docker compose --profile wayflow build wayflow
docker compose --profile wayflow up -d --force-recreate wayflow
```

Then re-trigger a reload (or republish any agent - the publish handler reloads automatically).

## Limitations / out-of-scope

- **No filesystem watcher.** Reload is explicit. Operators may add a watcher if eventually-consistent semantics are acceptable.
- **No per-extension container isolation.** Untrusted third-party agents run in the same multi-tenant runtime as first-party agents.
- **Single canonical path per package name.** `agents/<vendor>/<slug>/` is one location; multi-version coexistence at the same `@vendor/slug` is not supported. Last-install-wins on disk.
- **Reload does not yet propagate to `agent_registry_publish` (the synthesized-payload republish path).** That handler writes only to the registry; the on-disk `cinatra/oas.json` is untouched, so reload would no-op. The install/republish path should embed `cinatra/oas.json` in the synthesized tarball so it matches publish-from-git-dir.
- **`publishAgentPackage` non-from-git-dir tarballs don't include `cinatra/oas.json`.** Materialize returns `materialized: false` and the runtime can't mount the agent. Use `publishAgentPackageFromGitDir`.
