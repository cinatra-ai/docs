# Technology Stack

**Analysis Date:** 2026-06-09

## Languages

**Primary:**
- TypeScript — app, all packages under `packages/<name>/`, server actions, API routes, UI components
- Python — WayFlow agent runtime sidecar container

**Secondary:**
- HTML/CSS — design system components (`references/design/design-system.html`)

## Runtime

**Environment:**
- Node.js 24 or newer (required per `guides/hosting/installation.md`)
- Python (version not specified in docs; runs inside Docker container as WayFlow sidecar)

**Package Manager:**
- pnpm (required per `guides/hosting/installation.md`)
- Lockfile: expected (pnpm-lock.yaml at repo root of the main cinatra repo; not present in this docs-only repo)

## Frameworks

**Core:**
- Next.js (App Router, Server Components, Server Actions) — primary web framework
- React with shadcn/ui components on Tailwind CSS — UI layer

**Agent Runtime:**
- WayFlow (`wayflowcore`) — Python sidecar implementing OAS Flow 26.1.0; communicates over A2A protocol; runs at `http://localhost:3010`

**Testing:**
- Not documented in this docs repo (docs-only repository, no test config present)

**Build/Dev:**
- Make — top-level dev lifecycle (`make setup`, `make dev`, `make refresh`, etc.)
- Docker + Compose plugin — runs all supporting services; base `docker-compose.yml` + `docker-compose.dev.yml` overlay
- `tsgo` — fast TypeScript type-check (`pnpm typecheck`)
- ESLint — linting (`pnpm lint`)

## Key Dependencies

**Critical:**
- `@cinatra-ai/llm` — single LLM orchestration layer; every LLM call (OpenAI, Anthropic, Gemini) goes through this package
- `@cinatra-ai/agents` — compiles OAS Flow agent definitions from disk (`agents/<vendor>/<slug>/`) to runtime representations
- `@cinatra-ai/sdk-extensions` — frozen SDK ABI surface for extension authors; versioned; loader rejects incompatible extensions
- Better Auth — authentication server library; handles username/password, passkey, organization, OAuth provider plugins, and issues JWTs for MCP/A2A access
- BullMQ — Redis-backed job queue for all background/long-running work
- Drizzle ORM — database schema definitions and query layer for PostgreSQL

**Infrastructure:**
- PostgreSQL 14+ — primary durable store (app data, auth tables, audit logs, HITL state, message history)
- Redis — BullMQ job queue, AG-UI/A2UI event log (Redis Streams), pub/sub for live UI updates
- Verdaccio — local private npm-compatible registry; hosts extensions authored/published from the instance; distinct from hosted `registry.cinatra.ai`
- Nango — OAuth gateway for third-party connector credentials (Gmail, Google Calendar, Apollo, LinkedIn, WordPress, Drupal, Apify, YouTube, GitHub); runs locally at `http://localhost:3003`
- Graphiti — knowledge-graph indexer (typed object graph); runs at `http://localhost:8000`; requires `OPENAI_API_KEY` at container start

**ORM / Schema:**
- Drizzle ORM — each extension package owns its own Drizzle schema definitions and store layer

## Configuration

**Environment:**
- Primary config via environment variables (see `guides/hosting/configuration.md`)
- Per-instance settings stored in the database and managed through the in-app UI (`/configuration/*`)
- `.env.example` at main repo root; `make setup` copies to `.env.local` and fills safe defaults
- AES-256-GCM encryption key (`CINATRA_ENCRYPTION_KEY`) encrypts provider API keys and connector credentials at rest

**Key required env vars:**
- `BETTER_AUTH_URL` — canonical base URL for session cookies and OAuth callbacks
- `NEXT_PUBLIC_BETTER_AUTH_URL` — browser-exposed variant of the same
- `BETTER_AUTH_SECRET` — session signing secret (32 random hex chars)
- `SUPABASE_DB_URL` — PostgreSQL connection string
- `CINATRA_ENCRYPTION_KEY` — AES-256-GCM key; must be explicit in long-lived deployments
- `CINATRA_BRIDGE_TOKEN` — shared secret between Next.js app and WayFlow container
- `OPENAI_API_KEY` — required at container boot for Graphiti knowledge-graph indexer

**Key optional env vars:**
- `REDIS_URL` — default `redis://127.0.0.1:6379`
- `BULLMQ_QUEUE_NAME` — default `cinatra-background-jobs`
- `WAYFLOW_BASE_URL` — default `http://localhost:3010`
- `GRAPHITI_URL` — default `http://localhost:8000`
- `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` — error reporting (no-op when unset)
- `CINATRA_RUNTIME_MODE` — set to `development` for dev-only behavior
- `CINATRA_A2A_HTTP_ENABLED` — opt-in external A2A endpoint
- `CINATRA_EXTENSION_REQUIRE_SIGNATURES` — set `"true"` to require Ed25519 signatures on extensions
- `CINATRA_EXTENSION_SIGNING_PUBLIC_KEYS` — trusted public keys for extension signature verification
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — optional Google OAuth sign-in
- `NANGO_SERVER_URL` / `NANGO_DATABASE_URL` / `NANGO_ENCRYPTION_KEY` — Nango OAuth gateway

**Build:**
- Build-time only: `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` for source-map upload to Sentry

## Platform Requirements

**Development:**
- Node.js 24+, pnpm, Docker with Compose plugin, Make
- Docker allocated at least 6 GB RAM
- macOS/Linux (Windows via WSL)
- For AI chat native MCP: a public HTTPS tunnel (Tailscale Funnel, Cloudflare Tunnel, ngrok) pointing to `http://localhost:3000`

**Production:**
- Self-hosted deployment (not production-ready per `README.md`; evaluation/dev/self-hosted experimentation only)
- PostgreSQL 14+ (Supabase-compatible)
- Redis instance
- Docker for WayFlow, Nango, Graphiti, Verdaccio sidecars
- Public HTTPS URL for `BETTER_AUTH_URL` and MCP external access

---

*Stack analysis: 2026-06-09*
