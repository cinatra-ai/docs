# Installation

This guide gets a working Cinatra development instance running on your machine: app, database, queue, agent runtime, and local supporting services.

For the first-time configuration steps after the app is running, see [Quickstart](quickstart.md).

---

## Prerequisites

You need:

- **Node.js 24 or newer** — <https://nodejs.org/>
- **pnpm** — <https://pnpm.io/installation>
- **Docker** with the Compose plugin — <https://docs.docker.com/get-docker/>
- **Make** — already on macOS and Linux; on Windows use WSL

Cinatra runs the app on your host machine and the supporting services (PostgreSQL, Redis, Nango (the OAuth gateway brokering connector credentials), Verdaccio (an npm-compatible registry), Graphiti (a knowledge-graph indexer), WayFlow (Cinatra's OAS Flow agent runtime), WordPress test instance, Drupal test instance) in Docker. Docker should have at least 6 GB of RAM allocated.

---

## Clone the repo

```bash
git clone https://github.com/cinatra-ai/cinatra.git
cd cinatra
```

Cinatra is open source under Apache 2.0; any clone of the canonical repository works.

---

## First-time setup

One command:

```bash
make setup
```

That target runs `scripts/setup.sh`, which does the following in order:

1. **Copies `.env.example` to `.env.local`** if you do not already have one, and fills in safe defaults for local development.
2. **Starts the supporting services** with `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d` — Postgres, Redis, Verdaccio, Nango, Graphiti, WayFlow, and the optional test CMS containers. The base compose is **safe-by-default** (it does not publish the Postgres/Redis/Neo4j ports); `docker-compose.dev.yml` re-publishes them on `127.0.0.1` so the host-run app can reach them. If you start services manually, include both `-f` files — a bare `docker compose up -d` will not expose the DB ports.
3. **Installs Node dependencies** with `pnpm install`.
4. **Runs the app's setup script** (`pnpm setup:dev`) which creates the configured Postgres schema, applies migrations, and prepares the Better Auth (the auth server library Cinatra uses) tables.
5. **Builds the OpenAI shell image** so agents that use the shell tool can run.
6. **Validates the services** — runs `scripts/check-services.mjs` and reports any supporting service that is not reachable. Re-run it any time with `make check`.

The script is idempotent — running it on an already-set-up environment skips work that is already done.

---

## Start the app

```bash
make dev
```

That brings up the Docker services (if they are not running) and starts the Next.js dev server. Open <http://localhost:3000>.

The first user to register becomes the initial admin and the owner of the default workspace organization. The setup wizard (at `/setup` after first sign-in) walks through the remaining one-time configuration: encryption key, instance display name, and the default large language model (LLM) provider key. See [Quickstart](quickstart.md) for the full walkthrough.

---

## Keeping your checkout up to date

After pulling new code, reconcile your dev environment — dependencies and the dev database schema — to match it:

```bash
git pull
make refresh
```

`make refresh` is dev-only and never touches git: you manage branches, it brings dependencies and the dev database in sync with the code on disk. It applies **additive** schema changes automatically; transformational one-shot migrations (renames/backfills) are run by hand only when a release's notes say so. Restart with `make dev` afterwards.

---

## Other commands

| Command | Purpose |
|---------|---------|
| `make dev` | Start infrastructure and the app |
| `make refresh` | After `git pull`, reconcile dependencies + the dev database schema to the code on disk |
| `make check` | Validate that every supporting service is reachable |
| `make down` | Stop infrastructure; keep data |
| `make logs` | Tail Docker service logs |
| `make reset` | Soft reset — drop app data, flush Redis, rebuild schemas |
| `make reset-full` | Hard reset — wipes volumes and `node_modules`, regenerates `.env.local`, reinstalls everything |
| `make clean` | Remove Docker volumes only (data wipe, no rebuild) |
| `pnpm typecheck` | Fast type check via `tsgo` |
| `pnpm lint` | ESLint |
| `pnpm setup:status` | Inspect current setup state |
| `pnpm backup:create` | Create a backup bundle of the running instance |

### Extension CLI commands

A few extension-related operations are available from the `cinatra` CLI:

| Command | Purpose |
|---------|---------|
| `cinatra agents install [<name>[@<range>]]` | Install an agent extension tree from the local Verdaccio registry. Writes a `cinatra-agents.lock`. |
| `cinatra extensions submit <tarball.tgz>` | Submit a built extension tarball to the Cinatra Marketplace for review. Requires `MARKETPLACE_INSTANCE_TOKEN` in the shell env. |
| `cinatra extensions purge <packageName>` | Remove an extension's installed state from this instance — its database rows and on-disk files. The registry is left untouched (purge never unpublishes a published version; version cleanup is a separate operation). |

**There is no general `cinatra extensions install` command.** The only install-style CLI command is `cinatra agents install`, which installs an agent tree from Verdaccio. General extensions — connectors, skills, artifacts, and workflows — are installed through the UI and MCP surface (browse at `/configuration/marketplace`, manage installed extensions at `/configuration/extensions`), not the CLI.

---

## What is running after setup

Once `make dev` is up, the local processes are:

- **Next.js app** on `http://localhost:3000` — the UI and all API routes
- **PostgreSQL** on `localhost:5434` — Better Auth + Cinatra app data
- **Redis** on the default port — BullMQ (a Redis-backed job queue), Agent-User Interaction Protocol (AG-UI)/agent-to-UI (A2UI) protocol event log, pub/sub
- **WayFlow** on `http://localhost:3010` — agent runtime container
- **Nango** on `http://localhost:3003` — OAuth gateway for third-party connector auth
- **Verdaccio** on `http://localhost:4873` — the **local, private npm-compatible registry** in the self-host stack. This is where extensions you author and publish from this instance land, and what `cinatra agents install` pulls from locally. It is distinct from the hosted endpoints the app talks to for the marketplace experience: the storefront `marketplace.cinatra.ai` powers marketplace **browse and detail**, and the public registry `registry.cinatra.ai` backs the **package/manifest reads and install download** for first-party extensions. The app references those two hosted endpoints by URL; you do not host or operate them — you only run your own local Verdaccio.
- **Graphiti** on `http://localhost:8000` — typed object graph indexer
- **Test CMS instances** (WordPress, Drupal) on their compose-defined ports — used by the CMS connectors during development

You do not need all of these for every use case; the Compose file starts them all because they are cheap and the typical development workflow touches several. Trim the compose profile down if you only need a subset.

Run `make check` at any time to confirm each of these services is reachable.

---

## Remote services and the MCP public URL

The services above all run **on your machine**. Cinatra also depends on **remote provider services** — the LLM providers (OpenAI, Anthropic, Google). Calls to those are normally outbound and work from any machine with internet access.

The one exception is **native Model Context Protocol (MCP)**: the AI chat hands the LLM provider a reference to your `/api/mcp` endpoint, and the provider's servers connect *back* to it — which a `localhost` URL cannot satisfy. To use the chat on a local install you expose the app through a tunnel and record the resulting public URL in Cinatra.

See [MCP public URL & tunnels](mcp-public-url.md) for why this is needed, how the three service tiers differ, and a step-by-step Tailscale Funnel (a public-internet tunnel) setup.

---

## Troubleshooting installation

If `make setup` fails partway through, the most common causes are:

- **Docker is not running.** Start Docker Desktop or the daemon, then re-run `make setup`.
- **Port conflicts.** Postgres on `5434`, Redis on its default port, WayFlow on `3010`. If any of those are taken, edit `docker-compose.yml` or the matching env var in `.env.local`.
- **pnpm install fails on missing native deps.** On macOS, install Xcode Command Line Tools (`xcode-select --install`). On Linux, install `build-essential` and `python3`.
- **App boots but `/api/auth/get-session` 500s.** Usually a missing `BETTER_AUTH_SECRET` or a stale `.next` cache. Set the secret in `.env.local` (32 random hex chars) and run `rm -rf .next && pnpm dev`.

More patterns are in [Troubleshooting](troubleshooting.md).

---

## Where to go next

- First-time configuration and your first agent run: [Quickstart](quickstart.md)
- Full configuration reference: [Configuration](configuration.md)
- Why the AI chat needs a public URL, and how to set up a tunnel: [MCP public URL & tunnels](mcp-public-url.md)
- How the platform is put together: [Architecture](../../references/platform/architecture.md)
