# External Integrations

**Analysis Date:** 2026-06-09

## APIs & External Services

**LLM Providers:**
- OpenAI — default LLM provider; used for agent/chat calls and required by Graphiti knowledge-graph indexer at container start
  - SDK/Client: `@cinatra-ai/llm` orchestration layer (no direct OpenAI SDK imports in extension code)
  - Auth: `OPENAI_API_KEY` env var (for Graphiti); in-app setting at `/configuration/llm` (for agent/chat calls)
- Anthropic (Claude) — purpose-specific LLM paths (agent creation, data classification)
  - SDK/Client: `@cinatra-ai/llm` orchestration layer
  - Auth: in-app setting at `/configuration/llm`, stored encrypted in database
- Google Gemini — purpose-specific LLM paths; configured via the Gemini connector setup page
  - SDK/Client: `@cinatra-ai/llm` orchestration layer
  - Auth: in-app setting via Gemini connector; `GEMINI_API_KEY` env var only for the `adk_expense_reimbursement` dev A2A peer

**Connector Integrations (managed via `/connectors` UI, credentials encrypted in DB via Nango):**
- Gmail — email connector
- Google Calendar — calendar connector
- Apollo — CRM/prospecting connector
- LinkedIn — social connector
- WordPress — CMS connector; test instance runs in Docker during development
- Drupal — CMS connector; test instance runs in Docker during development
- Apify — web scraping/automation connector
- YouTube — video/social connector
- GitHub — code/repository connector

**Extension Registry & Marketplace:**
- `registry.cinatra.ai` — hosted public registry; backs package/manifest reads and install downloads for first-party extensions
- `marketplace.cinatra.ai` — hosted storefront; powers marketplace browse and detail UI at `/configuration/marketplace`

**Agent-to-Agent (A2A) Dev Peers:**
- Dev peer servers cloned from `cinatra-ai/a2a-servers-dev` repo into `dev/a2a-peers/`
- Default dev peer URLs: `http://localhost:10001` through `http://localhost:10007` (configured via `CINATRA_A2A_DEV_PEER_URLS`)

## Data Storage

**Databases:**
- PostgreSQL 14+ (Supabase-compatible)
  - Connection: `SUPABASE_DB_URL`
  - Client: Drizzle ORM
  - Schema: configurable via `SUPABASE_SCHEMA` (default: `cinatra`); Better Auth tables always in `public`
  - Stores: agent run records, HITL approval state, message history, audit logs, notifications, extension manifests, encrypted provider credentials, dashboard data

**Cache / Queue / Streams:**
- Redis
  - Connection: `REDIS_URL` (default `redis://127.0.0.1:6379`)
  - Used for: BullMQ job queue, AG-UI/A2UI event log via Redis Streams, pub/sub for live UI updates (notifications)

**File Storage:**
- Local filesystem (on-disk extension store for runtime-loaded packages)
- No cloud object storage documented

**Caching:**
- OpenAI prompt caching — configurable per provider card at `/configuration/llm`; cached-input tokens tracked separately in usage metrics

## Authentication & Identity

**Auth Provider:**
- Better Auth — the auth server library Cinatra uses
  - Implementation: username/password, passkey, organization, and OAuth provider plugins
  - Issues JWTs for MCP and A2A access (OAuth-provider mode)
  - Session cookies scoped to `BETTER_AUTH_URL`
  - OAuth callbacks route through `BETTER_AUTH_URL`

**Optional OAuth Sign-in:**
- Google OAuth — `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (optional; falls back to username/password + passkey)

**Third-party OAuth Brokering:**
- Nango — OAuth gateway for all connector credentials (Gmail, Google Calendar, Apollo, LinkedIn, WordPress, Drupal, Apify, YouTube, GitHub)
  - Local URL: `http://localhost:3003`
  - Config: `NANGO_SERVER_URL`, `NANGO_DATABASE_URL`, `NANGO_ENCRYPTION_KEY`

**Extension Signing:**
- Ed25519 signature verification — consumer-side; controlled by `CINATRA_EXTENSION_REQUIRE_SIGNATURES` and `CINATRA_EXTENSION_SIGNING_PUBLIC_KEYS`

## Monitoring & Observability

**Error Tracking:**
- Sentry-API-compatible layer (`@sentry/nextjs` + `@sentry/opentelemetry`)
  - Works against Sentry (SaaS or self-hosted) or GlitchTip
  - No-op when `SENTRY_DSN` is unset; no separate on/off flag
  - Server/worker capture: `SENTRY_DSN`
  - Browser capture: `NEXT_PUBLIC_SENTRY_DSN`
  - Optional: `SENTRY_ENVIRONMENT`, `SENTRY_TRACES_SAMPLE_RATE`, `SENTRY_RELEASE`
  - Build-time source-map upload: `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` (CI only)

**Tracing:**
- OpenTelemetry (vendor-neutral tracing) — integrated with Sentry layer via single `provider.register()` call

**Logs:**
- Configurable per-provider call logging at **Administration → Telemetry** (`/configuration/telemetry`)
- Cost and token consumption dashboard at `/configuration/cost-and-usage`, broken down by provider and model
- BullMQ worker emits notifications to `cinatra.notifications` table on job completion/failure

**Notifications:**
- Postgres `LISTEN/NOTIFY` — real-time push from `cinatra.notifications` table
- SSE route — browser subscription to notification stream

## CI/CD & Deployment

**Hosting:**
- Self-hosted (Docker Compose); not production-ready per `README.md`
- Docs site deployed to `docs.cinatra.ai` via `cinatra-ai/ops` repo

**CI Pipeline:**
- GitHub Actions — `.github/workflows/notify-ops.yml` fires `repository_dispatch(cinatra-docs-pushed)` to `cinatra-ai/ops` on push to `main`
  - Requires `CINATRA_OPS_DISPATCH_TOKEN` repo secret (fine-grained PAT scoped to `cinatra-ai/ops` with Contents: write)
  - Gracefully no-ops if secret is absent

## Environment Configuration

**Required env vars (runtime):**
- `BETTER_AUTH_URL`, `NEXT_PUBLIC_BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`
- `SUPABASE_DB_URL`
- `CINATRA_ENCRYPTION_KEY` (explicit in long-lived deployments; auto-generated in dev)
- `CINATRA_BRIDGE_TOKEN`
- `OPENAI_API_KEY` (for Graphiti sidecar)

**Secrets location:**
- Runtime secrets: environment variables (`.env.local` in development, process environment in production)
- Provider API keys and connector credentials: AES-256-GCM encrypted in PostgreSQL database
- Nango OAuth tokens: encrypted by `NANGO_ENCRYPTION_KEY` inside Nango's own database
- Extension signing private key: never on the instance; stays in operator custody (secrets manager)
- GitHub Actions secret: `CINATRA_OPS_DISPATCH_TOKEN` stored as repo secret

## Webhooks & Callbacks

**Incoming:**
- `/api/a2a` — external A2A JSON-RPC 2.0 endpoint (opt-in via `CINATRA_A2A_HTTP_ENABLED=true`)
- `/api/a2a/agents/*` — per-agent A2A routes; validated by `CINATRA_BRIDGE_TOKEN` on WayFlow-to-app calls
- `/api/llm-bridge` — WayFlow-to-app LLM bridge; validated by `CINATRA_BRIDGE_TOKEN`
- `/api/mcp` — MCP server endpoint; reachable by external MCP clients (requires public URL for native MCP)
- `/api/agents/runs/{runId}/stream` — AG-UI SSE stream for agent run events

**Outgoing:**
- LLM provider API calls (OpenAI, Anthropic, Google Gemini) — outbound from `@cinatra-ai/llm`
- Nango OAuth gateway calls — connector credential brokering
- Graphiti MCP server calls (appends `/mcp` to `GRAPHITI_URL`)
- `registry.cinatra.ai` — extension package/manifest reads
- `marketplace.cinatra.ai` — marketplace browse and detail reads
- A2A calls to remote agent peers (registered A2A endpoints, dev peers at `CINATRA_A2A_DEV_PEER_URLS`)
- GitHub API `repository_dispatch` to `cinatra-ai/ops` (docs CI only)

---

*Integration audit: 2026-06-09*
