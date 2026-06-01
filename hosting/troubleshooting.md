# Troubleshooting

This guide collects the failure modes most users hit when setting up or running Cinatra, with the diagnostic command or check that confirms the root cause and the fix.

For each problem: what you see, why it happens, how to fix it.

---

## Install / setup

### `make setup` fails on Docker

**Symptom:** the setup script aborts during `docker compose up -d`.

**Cause:** Docker is not running, or the user does not have permission to talk to the Docker daemon.

**Fix:** Start Docker Desktop or the Docker daemon. On Linux, ensure your user is in the `docker` group (`sudo usermod -aG docker $USER` and re-login).

### `pnpm install` fails on native dependencies

**Symptom:** node-gyp errors during install, often on `bcrypt`, `sharp`, or other native packages.

**Cause:** Missing build toolchain.

**Fix:**

- macOS: `xcode-select --install`.
- Linux: install `build-essential`, `python3`, and `pkg-config`.
- Windows (WSL): run `make setup` from inside WSL, not from PowerShell.

### Port conflicts

**Symptom:** Postgres, Redis, or WayFlow (Cinatra's OAS Flow agent runtime) fails to start because a port is in use.

**Cause:** Another process — often another Cinatra instance, or a system Postgres — already holds the port.

**Fix:** Find the conflicting process (`lsof -i :5434` for Postgres, `:6379` for Redis, `:3010` for WayFlow) and stop it, or remap the port by editing `docker-compose.yml` and the matching `.env.local` variable.

---

## App boot

### `/api/auth/get-session` returns 500

**Symptom:** the app loads but every protected page bounces back to a 500.

**Cause:** Usually one of:

- `BETTER_AUTH_SECRET` is unset, the placeholder, or shorter than 32 characters.
- A stale `.next` Turbopack cache is holding on to an old auth module.

**Fix:**

1. Set a real `BETTER_AUTH_SECRET`: `openssl rand -hex 32`.
2. Clear the cache and restart: `rm -rf .next && pnpm dev`.

### "Cannot resolve module" on first dev start

**Symptom:** Turbopack errors out on missing modules immediately after `pnpm dev`.

**Cause:** Stale `node_modules` or a partial install.

**Fix:** `rm -rf node_modules .next && pnpm install && pnpm dev`.

### Workspace root error from cross-worktree `node_modules`

**Symptom:** Turbopack complains about a workspace root mismatch or refuses to start.

**Cause:** A symlinked `node_modules` from a sibling git worktree confuses Turbopack's pnp resolver.

**Fix:** In the affected worktree, `rm -rf node_modules .next && pnpm install` to rebuild a clean local `node_modules`.

---

### Chat errors with "MCP public URL is not configured"

**Symptom:** The AI chat stops immediately with *"Cinatra Model Context Protocol (MCP) public URL is not configured for hosted MCP access."*

**Cause:** Not a bug. OpenAI/Anthropic native MCP makes the *provider's* servers connect back to your `/api/mcp` endpoint, which a `localhost` URL cannot satisfy. A local install has no public URL set.

**Fix:** Expose the app through a tunnel and record the public URL at `/configuration/development?tab=tunnel`. See [MCP public URL & tunnels](mcp-public-url.md) for the Tailscale Funnel (a public-internet tunnel) walkthrough.

---

## Agents and runs

### Run starts, status stays `queued`

**Symptom:** clicking Run creates a run with status `queued` that never advances.

**Cause:** The BullMQ (a Redis-backed job queue) worker is not picking up the job. Either Redis is unreachable, the worker process is not running, or the queue name does not match between producer and consumer.

**Fix:**

1. Verify Redis: `redis-cli ping` should return `PONG`.
2. Check that `BULLMQ_QUEUE_NAME` is consistent between the app and any auxiliary workers.
3. If you run the worker as a separate process, confirm it is alive and consuming from the same queue.

### Run completes but message body is empty

**Symptom:** the agent finishes with status `completed` but the assistant message has no content.

**Cause:** Inside an MCP tool path, the underlying chat handler tried to call its own HTTP endpoint and failed authentication. The handler swallows the error and returns an empty body.

**Fix:** Make sure `CINATRA_BRIDGE_TOKEN` is set on both the Next.js app and the WayFlow container. They must match.

### Run pauses but no HITL form appears

**Symptom:** The run state is `pending_approval` but the UI does not render an approval form.

**Cause:** Usually one of:

- The agent declared a human-in-the-loop (HITL) renderer ID that is not registered in the client catalog.
- The agent-to-UI (A2UI) protocol surface payload failed to publish because Redis was unavailable.

**Fix:**

1. Check the run page console for renderer-not-found warnings.
2. Verify Redis with `redis-cli ping`.
3. Re-fetch the run; the page should subscribe to both Agent-User Interaction Protocol (AG-UI) and A2UI channels and display whichever it can resolve.

### Agent install fails with "agentspec version mismatch"

**Symptom:** Installing an agent extension returns a validation error about the agentspec version.

**Cause:** The package declares an `agentspec_version` other than `26.1.0`, which is what Cinatra's runtime currently supports.

**Fix:** Update the package's `oas.json` to `"agentspec_version": "26.1.0"` and bump its package version before re-publishing.

---

## Connectors

### Connector OAuth flow ends with "redirect URL mismatch"

**Symptom:** OAuth flow for Gmail, LinkedIn, Apollo, etc. fails on the provider's consent screen.

**Cause:** Nango (the OAuth gateway brokering connector credentials) is configured for one base URL and the app is reachable on another (most commonly: a dev tunnel public URL vs. localhost).

**Fix:** Update the provider's OAuth client config to include both URLs (localhost and the public URL) in its allowed redirect URIs, or restart the app so it uses a single consistent URL.

### Provider key change is not picked up

**Symptom:** You updated a provider key in `/configuration/llm` but agent runs still use the old key.

**Cause:** The orchestration layer caches resolved provider configs per-process. A long-running worker process may hold a stale cache.

**Fix:** Restart the affected process. In development that means restarting `pnpm dev`. In production, restart the worker container.

---

## Registry and packages

### "Connected" badge in network settings but publishes fail

**Symptom:** The Network/Registry settings page shows "connected" for the public registry, but `agent_registry_publish` returns an error.

**Cause:** The credential auth chain reached Nango successfully (badge turns green) but the upstream registry rejected the credential for write access.

**Fix:** Verify the registry token has publish scope. The local Verdaccio (an npm-compatible registry) default tokens have publish scope; the hosted public registry requires per-user tokens with explicit publish permission.

### `agent_registry_publish` returns `alreadyPublished: true`

**Symptom:** You changed an agent extension but the publish reports it is already published.

**Cause:** Verdaccio (and npm-compatible registries in general) refuse to re-publish the same version. The platform reports this as `alreadyPublished` rather than an error.

**Fix:** Bump the `version` in the package's `package.json` before publishing.

---

## Diagnostic commands

| Command | What it tells you |
|---------|-------------------|
| `make logs` | All Docker service logs (postgres, redis, wayflow, nango, …) |
| `make check` | Reachability of every supporting service + whether the MCP public URL is set |
| `pnpm setup:status` | Current platform setup state — what is configured and what is missing |
| `pnpm typecheck` | Fast type check via `tsgo` |
| `pnpm lint` | ESLint |
| `redis-cli ping` | Redis reachable / not reachable |
| `psql $SUPABASE_DB_URL -c '\dt cinatra.*'` | List of Cinatra tables in the configured schema |
| `curl http://localhost:3010/health` | WayFlow runtime health check |
| `curl -I http://localhost:3000/` | Next.js app reachable (any 2xx/3xx confirms the dev server is up) |

---

## When you are still stuck

- Check the [Configuration](../hosting/configuration.md) reference for the variable that controls the symptom you are seeing.
- For agent-runtime-specific issues, look at the WayFlow container logs: `docker compose logs -f wayflow`.
- For the open standards behind the runtime, see [Open standards in Cinatra](../developer/open-standards.md). For the MCP architecture, see the [MCP Guide](../mcp/README.md).
