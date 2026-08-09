# Configuration

Cinatra is configured by a handful of environment variables plus per-instance settings stored in the database. This document covers the environment surface — what each variable does, when you have to set it, and the operational consequences of getting it wrong.

For local-development defaults, see `.env.example` at the repository root. The setup script copies that file to `.env.local` on first run and fills in sensible defaults.

---

## App

### `BETTER_AUTH_URL` (required)

The canonical base URL the app serves from. Used by Better Auth (the auth server library Cinatra uses) for session cookie domains and OAuth callback URLs, and as the issuer for the OAuth-provider JWTs that authenticate Model Context Protocol (MCP) and agent-to-agent (A2A) protocol clients.

- Development: `http://localhost:3000`
- Public deployment: your public HTTPS URL, e.g. <https://cinatra.example.com>

### `NEXT_PUBLIC_BETTER_AUTH_URL` (required)

The public-facing variant of the same URL, exposed to the browser bundle. Usually identical to `BETTER_AUTH_URL`. Keep them in sync.

### `BETTER_AUTH_SECRET` (required)

The signing secret for Better Auth sessions. Must be a long random string.

- Development: anything stable works; generate with `openssl rand -hex 32`.
- Long-lived deployments: a strong secret stored in your secrets manager. Rotating it invalidates all existing sessions.

### `CINATRA_RUNTIME_MODE`

Set to `development` to enable dev-only behaviour (filesystem-driven agent scans, setup-wizard encryption-key auto-generation, etc.). Unset or anything else in production.

### `CINATRA_ENCRYPTION_KEY`

AES-256-GCM key used to encrypt provider API keys and connector credentials at rest.

- Development: generated automatically on first server boot and persisted to `.env.local`. You do not normally set it manually.
- Long-lived deployments: **must be provided explicitly** as an environment variable. **Losing this key means losing access to all encrypted data** — provider credentials become unreadable and would need to be re-entered. Recommended value: 32-byte hex secret (`openssl rand -hex 32`).

---

## Database

### `SUPABASE_DB_URL` (required)

PostgreSQL connection string for the application database. Cinatra is Supabase-compatible — any Postgres 14+ instance works.

- Development (Docker Compose): `postgresql://postgres:postgres@127.0.0.1:5434/postgres`
- Hosted: your managed Postgres URL.

### `SUPABASE_SCHEMA`

The Postgres schema name where Cinatra application tables live. Default: `cinatra`. Better Auth tables always live in `public` regardless of this setting.

You normally only change this for branch-isolated worktrees where multiple dev servers run in parallel against the same database.

---

## Redis and background jobs

### `REDIS_URL`

Redis connection string. Default: `redis://127.0.0.1:6379`.

Used for three things:

1. **BullMQ (a Redis-backed job queue)** — all background work flows through Redis.
2. **Agent-User Interaction Protocol (AG-UI) / agent-to-UI (A2UI) protocol event log** — Redis Streams hold the durable per-run event log.
3. **Pub/sub** — low-latency UI update channels for A2UI surface payloads.

A single Redis instance is fine for typical deployments. Losing Redis loses in-flight queues and live event streams but does not lose completed run results (those are in Postgres).

### `BULLMQ_QUEUE_NAME`

The BullMQ queue name to use. Default: `cinatra-background-jobs`. Set per-worktree to avoid queue collisions when running multiple dev servers in parallel.

### `SKILL_MATCH_MAINTENANCE_CRON`

Opt-in cron pattern for the skill-match maintenance tick (tombstoned orphan garbage collection followed by the hash staleness sweep). Unset means disabled — this is the default. An invalid pattern logs a boot warning and behaves as disabled. Accepts a 5- or 6-field cron expression, evaluated in UTC, e.g. `0 4 * * *` for daily at 04:00 UTC.

See [Skills maintenance](skills-maintenance.md) for what the tick does and its cost bounds.

### `SKILL_MATCH_PARITY_CRON`

Opt-in cron pattern for the skill-match dual-store parity observation (it diffs the canonical match store against the legacy per-agent snapshot and records a report; it never deletes or retires anything). Unset means disabled — this is the default. Same pattern rules as above.

See [Skills maintenance](skills-maintenance.md#runbook-the-dual-store-parity-observation) for the runbook.

---

## Agent runtime (WayFlow)

### `WAYFLOW_BASE_URL`

URL of the WayFlow (Cinatra's OAS Flow agent runtime) container. Default: `http://localhost:3010`.

WayFlow hosts every installed agent under `/agents/<vendor>/<slug>/`. The platform derives per-agent URLs automatically from the installed `packageName` — you do not configure URLs per agent.

### `CINATRA_BRIDGE_TOKEN`

Shared secret between the Next.js app and the WayFlow container, validated on every WayFlow-to-app call (the `/api/llm-bridge` and `/api/a2a/agents/*` routes). Strict-token-only auth — when this variable is unset, all bridge calls return 403.

- Development: set automatically by the setup script.
- Long-lived deployments: **must be set explicitly** to a 32-byte hex secret. The same value must be passed to the WayFlow container.

Recommended value: `openssl rand -hex 32`.

---

## A2A (external agent-to-agent)

### `CINATRA_A2A_HTTP_ENABLED`

Set to `"true"` to enable the external A2A endpoint at `POST /api/a2a` (JSON-RPC 2.0). When unset the route returns 404, so production deployments opt in explicitly.

### `A2A_DEV_BYPASS`

Set to `"true"` to allow unauthenticated loopback requests to `/api/a2a`. Development and CI only — **never set in production**.

### `CINATRA_A2A_DEV_PEER_URLS`

Comma-separated list of A2A dev peer URLs to auto-register on dev boot. The sample peer servers are cloned by `cinatra instance setup dev` from the `cinatra-ai/a2a-servers-dev` repo (via `package.json` `cinatra.devApps`) into the git-ignored `dev/a2a-peers/`; bring them up with the optional `docker compose --profile a2a-peers` profile (or run the per-peer host launchers). A typical default set:

```
CINATRA_A2A_DEV_PEER_URLS=http://localhost:10001,http://localhost:10002,http://localhost:10004,http://localhost:10005,http://localhost:10006,http://localhost:10007
```

### `CINATRA_AGUI_EXTERNAL_ENABLED`

Set to `"true"` to multiplex AG-UI events inline into the A2A server-sent events (SSE) response so external A2A callers receive them alongside JSON-RPC responses. Off by default — most callers fetch the dedicated browser stream endpoint at `/api/agents/runs/{runId}/stream` instead.

---

## LLM providers

### `OPENAI_API_KEY` (optional fallback)

OpenAI API key. You normally do **not** set this: configure OpenAI in the app (`/configuration/llm`), and the bring-up passes that stored key to the Graphiti container (a knowledge-graph indexer) for you. Graphiti needs a key as a static environment variable at container startup, so the bring-up writes the resolved key to a narrow, permission-restricted env file the container reads.

Set `OPENAI_API_KEY` here only if you want the indexer to run on a different key than the app's, or before the app has one at all. Whichever source is used, re-run the bring-up after changing the key so the container picks it up.

**Without a key anywhere, `objects_save` and `objects_list` still work.** Objects are saved to and read from Postgres, and the app does not require this variable to boot. What you lose is knowledge-graph indexing: Graphiti runs entity extraction *before* it writes to the graph, so with no key each episode is accepted and then dropped, and the graph stays empty. Both the bring-up and the app startup log say so, in the form `knowledge-graph indexing OFF — no provider key`.

### Other providers (Anthropic, Gemini, etc.)

Provider keys for Anthropic and Google Gemini are managed through the LLM Providers UI (`/configuration/llm`). Third-party connector credentials — Gmail, Google Calendar, Apollo, LinkedIn, WordPress, Drupal, Apify, YouTube, GitHub — are managed through the **Connectors** sidebar area (`/connectors`). Both kinds of credential are persisted encrypted in the database — no environment variables needed.

The exception is the dev `adk_expense_reimbursement` A2A peer, which expects `GEMINI_API_KEY` as a host env var. Other dev peers need no key.

---

## Error reporting (optional)

Cinatra ships a Sentry-API-compatible error-reporting layer that works against both Sentry (self-hosted or SaaS) and GlitchTip. When the data source name (DSN) is unset, every helper is a no-op — error reporting is off by default.

### `SENTRY_DSN`

The DSN for server, edge, and BullMQ-worker capture. Setting it enables error reporting on those surfaces. Leave unset to keep error reporting disabled. There is no separate on/off flag.

### `NEXT_PUBLIC_SENTRY_DSN`

The same DSN exposed to the browser bundle. Next.js only inlines `NEXT_PUBLIC_*` variables into the client build, so the browser-side path needs this variant. Setting it enables browser-side capture; leaving it unset keeps the browser silent while server/worker capture still works (if `SENTRY_DSN` is set).

### `SENTRY_ENVIRONMENT` (optional)

Free-form environment label (`production`, `staging`, `demo`, etc.) attached to every captured event. Reads `NEXT_PUBLIC_SENTRY_ENVIRONMENT` as a fallback in browser builds.

### `SENTRY_TRACES_SAMPLE_RATE` (optional)

Float between `0.0` and `1.0` controlling performance-trace sampling. Reads `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` as a fallback for browser builds.

### `SENTRY_RELEASE` / `NEXT_PUBLIC_SENTRY_RELEASE` (optional)

A release identifier attached to every captured event (commit hash, build ID, semantic version, whatever you choose). Server bundles read `SENTRY_RELEASE`; the browser bundle reads `NEXT_PUBLIC_SENTRY_RELEASE`. Setting both is the common pattern when you want server and client events to share the same release tag.

### Build-time only

Source-map upload to the Sentry backend is build-time only. Set `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` in CI. **Do not set these in runtime envs** — they are not read at runtime and only matter when the bundle is built.

---

## Third-party services

### `GRAPHITI_URL`

Graphiti MCP server URL. Default: `http://localhost:8000` (host-side; the in-container default `http://graphiti:8000` only resolves inside the Compose network). The client appends `/mcp` to this URL when invoking tools.

### `NANGO_SERVER_URL` / `NANGO_DATABASE_URL` / `NANGO_ENCRYPTION_KEY`

Nango (the OAuth gateway brokering connector credentials) handles third-party connector authentication (Gmail, Google Calendar, Apollo, LinkedIn, WordPress, Drupal, Apify, YouTube, GitHub). The Compose stack ships a local Nango instance; the three variables point the app at it. For deployments outside local dev you can point at a hosted Nango or your own Nango instance.

`NANGO_ENCRYPTION_KEY` encrypts the OAuth tokens Nango stores. Generate a new one for production with `openssl rand -base64 32` — **never** reuse the dev default.

---

## Extensions and registry

Cinatra installs extensions — agents, connectors, skills, artifacts, and workflows — from a package registry, and verifies the trustworthiness of any extension whose code activates in-process. The app talks to two hosted endpoints for this: the public registry `registry.cinatra.ai` for extension package, manifest, and install reads, and the storefront `marketplace.cinatra.ai` for marketplace browse and detail. Your self-host stack also runs a **local, private** Verdaccio registry (see [Installation](installation.md)) where extensions you author and publish from this instance land.

The instance's deployment registry configuration also drives extension **activation trust**: the host allowlist for in-process activation is derived from the configured public registry URL. Only extensions resolved from the configured registry host are eligible for in-process activation; code from an instance-local or otherwise untrusted host is denied (fail-closed).

The two environment variables below are the operator-facing levers for extension signature verification. Both are **consumer-side**: they control how *this* instance verifies the extensions it consumes. They do not sign anything.

### `CINATRA_EXTENSION_REQUIRE_SIGNATURES`

Whether a verified Ed25519 signature is required before an extension's code is activated in-process.

- **Unset (the default) — signatures are not required.** During the transition period an extension from the configured registry host may activate in-process without a signature (a `trusted-bootstrap` posture). A signature that *is* present but does not verify against a configured public key is still refused.
- **`"true"` — a verified signature is mandatory** for in-process activation (`trusted-signed`). An extension from the registry host that has no signature will not activate in-process; one whose signature does not verify is refused.

Set it to the literal string `true` to require signatures. Only flip this on once the packages you install actually carry verifiable signatures, otherwise extensions will stop activating in-process. This is a consumer-side verification lever, not a statement about how packages are produced or signed.

### `CINATRA_EXTENSION_SIGNING_PUBLIC_KEYS`

Comma-separated list of base64-encoded SPKI DER **public** keys that this instance trusts as signature roots. A signature on an installed extension is accepted only if it verifies against one of these keys.

These are **public keys — not secrets.** They are safe to ship in your environment configuration. The corresponding private signing key never lives on the instance; it stays in operator custody (e.g. a secrets manager). If `CINATRA_EXTENSION_REQUIRE_SIGNATURES=true` but no usable public key is configured, no extension can reach the signed-trust state.

### A note on the capability split

In-process import trust is decoupled from privileged host capability. A `trusted-bootstrap` extension (registry-host-trusted but unsigned, in the transition period) may import its code, but it is **not** auto-granted privileged host ports, and it is **not** permitted to run host database migrations (DDL). Those privileged capabilities require `trusted-signed` — a verified signature — or an explicit admin grant. In particular, a `trusted-bootstrap` extension that *declares* host migrations is refused import entirely until it is signed, because running host DDL is gated on a verified signature.

How extensions are produced and signed is out of scope here; this section covers only the consumer-side verification this instance performs.

---

## Public base URL (development)

External MCP and A2A clients need a public HTTPS endpoint that maps to your local dev server. Cinatra does **not** manage a tunnel for you — operators run their own (Tailscale Funnel (a public-internet tunnel), a named Cloudflare Tunnel, ngrok with a reserved domain, etc.) pointing at `http://localhost:3000`, then paste the resulting public URL into `/configuration/development?tab=tunnel`.

The URL is stored in the `connector_config:mcp_server` metadata blob (`publicBaseUrl` + `publicBaseUrlSource: "manual"`) and used by `getPublicMcpServerUrl()` to build the OAuth audience, the MCP injection URL, and the trusted-origin list. Leave the field empty to disable external reachability (WayFlow callbacks still work over `host.docker.internal`).

The AI chat needs this URL — without it the chat stops with "Cinatra MCP public URL is not configured for hosted MCP access." For why native MCP requires it, how local and remote service tiers differ, and a step-by-step Tailscale Funnel walkthrough, see [MCP public URL & tunnels](mcp-public-url.md).

---

## OAuth (optional)

If you want users to sign in with Google as an alternative to username/password:

- `GOOGLE_CLIENT_ID` — OAuth client ID from Google Cloud Console
- `GOOGLE_CLIENT_SECRET` — matching client secret

These are optional. Authentication falls back to username/password and passkey if they are unset.

---

## A note on per-instance vs. environment settings

Cinatra distinguishes between **environment variables** (set at process start; affect how the platform itself runs) and **per-instance settings** (managed in the in-app UI; affect which providers and integrations are available).

Provider API keys go in per-instance settings (under `/configuration/llm`). That includes the OpenAI key the Graphiti container needs at boot: the bring-up reads it from the per-instance settings and hands it to the container, so `OPENAI_API_KEY` is a fallback rather than the normal path. Connector credentials — Gmail, Google Calendar, Apollo, LinkedIn, WordPress, Drupal, Apify, YouTube, GitHub — always go through the **Connectors** area (`/connectors`); there is no env var path for them.

The encryption key is the bridge: it must be a real environment variable because nothing else can decrypt the per-instance settings.

---

## Where to go next

- Install and run: [Installation](installation.md)
- First-time setup walkthrough: [Quickstart](quickstart.md)
- Diagnose configuration problems: [Troubleshooting](troubleshooting.md)
