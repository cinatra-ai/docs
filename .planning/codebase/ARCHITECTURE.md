<!-- refreshed: 2026-06-09 -->
# Architecture

**Analysis Date:** 2026-06-09

## System Overview

```text
┌──────────────────────────────────────────────────────────────────────────┐
│                        Next.js App (TypeScript)                          │
│   App Router · Server Components · Server Actions · shadcn/ui + Tailwind │
├──────────────┬──────────────────────┬────────────────┬───────────────────┤
│  Extension   │   LLM Orchestration  │   MCP Server   │   BullMQ Workers  │
│  Registry    │   @cinatra-ai/llm    │  (primitives)  │   (Redis-backed)  │
│  packages/*/ │                      │                │                   │
└──────┬───────┴──────────────────────┴────────┬───────┴──────────┬────────┘
       │                                        │                  │
       ▼                                        ▼                  ▼
┌─────────────────────┐  ┌──────────────────────────┐  ┌──────────────────┐
│  Extension Store    │  │  Protocol Layer           │  │  PostgreSQL      │
│  (Verdaccio npm     │  │  OAS · A2A · AG-UI · A2UI │  │  (Drizzle ORM)   │
│   registry)         │  │                           │  │                  │
└─────────────────────┘  └───────────┬──────────────┘  └──────────────────┘
                                     │
                                     ▼
                         ┌───────────────────────────┐
                         │  WayFlow Python Sidecar   │
                         │  (Docker container)       │
                         │  wayflowcore[a2a]==26.1.1 │
                         │  pyagentspec==26.1.0      │
                         └───────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | Reference |
|-----------|----------------|-----------|
| Next.js app | UI, server actions, API routes, session management | `references/platform/architecture.md` |
| `@cinatra-ai/extensions` | Extension registry, lifecycle dispatch, active-capability discovery | `references/platform/extensions.md` |
| `@cinatra-ai/llm` | Single seam for all LLM providers (OpenAI, Anthropic, Gemini) | `references/platform/llm-orchestration.md` |
| `@cinatra-ai/a2a` | Inbound/outbound A2A HTTP/JSON-RPC proxying, SSE plumbing | `references/platform/open-standards.md` |
| `@cinatra-ai/agent-ui-protocol` | AG-UI + A2UI event emission, Redis Streams persistence | `references/platform/open-standards.md` |
| `@cinatra-ai/sdk-extensions` | SDK ABI contract, host-context ports, loader, activation driver | `references/platform/extensions.md` |
| `@cinatra-ai/sdk-dashboard` | Generic semantic-layer dashboard adapter | `references/platform/architecture.md` |
| `@cinatra-ai/dashboards` | Cinatra-specific dashboard glue over `sdk-dashboard` | `references/platform/architecture.md` |
| WayFlow container | OAS Flow graph traversal, tool invocation, HITL pausing (Python) | `references/platform/architecture.md` |
| BullMQ / Redis | Durable background job queue for long-running work | `references/platform/bullmq-wayflow-boundary.md` |
| PostgreSQL | Durable state: runs, HITL approval, messages, audit, notifications | `references/platform/architecture.md` |
| Verdaccio registry | Immutable npm package storage for published extensions | `references/platform/extensions.md` |

## Pattern Overview

**Overall:** Extension-based monorepo with a shared-protocol boundary

**Key Characteristics:**
- Every domain capability is a versioned extension under `packages/<name>/` with its own persistence, jobs, UI, and capability surface
- Cross-package calls go through MCP primitives via a deterministic in-process client, never through direct internal imports
- Long-running work is always enqueued to BullMQ; requests return immediately and callers subscribe to AG-UI event streams
- The agent runtime (WayFlow) is a separate Python container; the boundary is the A2A protocol, making the runtime replaceable
- All LLM provider calls funnel through a single `@cinatra-ai/llm` orchestration layer

## Layers

**Extension Packages (`packages/<name>/`):**
- Purpose: Every domain capability lives here as an independently versioned, installable unit
- Contains: MCP handlers, Drizzle schema, BullMQ workers, React UI surfaces, deterministic client wrappers
- Depends on: `@cinatra-ai/sdk-extensions` (host context), `@cinatra-ai/llm` (LLM calls)
- Used by: Next.js app (via extension registry), MCP server, agent runtime

**Protocol Layer:**
- Purpose: Open standards seams between packages, between Cinatra and users, and between Cinatra and external agents
- Location: `packages/a2a/src/`, `packages/agent-ui-protocol/src/`
- Contains: A2A JSON-RPC routing, AG-UI event emission, A2UI HITL payloads, Redis Streams persistence
- Depends on: Redis, `@a2a-js/sdk@^0.3.13`, `@ag-ui/core@0.0.52`

**LLM Orchestration (`@cinatra-ai/llm`):**
- Purpose: Single provider abstraction for OpenAI, Anthropic, Gemini
- Contains: Provider selection, tool injection, skill resolution, usage-event emission
- Used by: All agents, server actions — never direct SDK imports in extension code

**Background Execution (BullMQ + Redis):**
- Purpose: Durable asynchronous job queue decoupling request lifecycle from long-running work
- Reference: `references/platform/bullmq-wayflow-boundary.md`
- Contains: Agent run workers, registry install workers, email/blog job workers
- Depends on: Redis (queue), PostgreSQL (durable state)

**WayFlow Sidecar (Python):**
- Purpose: OAS-compliant agent runtime — flow graph traversal, prompt assembly, tool dispatch, HITL pausing
- Boundary: A2A protocol (HTTP/JSON-RPC) — called from Next.js app, never via shared memory
- Contains: `wayflowcore[a2a]==26.1.1`, `pyagentspec==26.1.0`, `fasta2a` for A2A compliance

**Data Layer:**
- Purpose: Durable state
- Contains: PostgreSQL (Drizzle ORM, `cinatra` schema), Redis (job queues, event streams, pub/sub)

## Data Flow

### Agent Run (Primary Path)

1. User triggers run via UI or external caller hits `POST /api/a2a` — entry point is the Next.js route
2. Server action / A2A handler enqueues a BullMQ job and returns a run identifier immediately
3. BullMQ worker picks up the job, calls WayFlow container over A2A (`POST /api/a2a/agents/<vendor>/<slug>`)
4. WayFlow traverses the OAS Flow graph, emitting tool calls resolved via Cinatra's MCP primitives
5. Lifecycle events fan out via dual adapter: AG-UI events → Redis Streams `cinatra:a2a:events:{runId}`; HITL payloads → A2UI Redis pub/sub `cinatra:a2ui:run:{runId}`
6. Browser subscribes to `GET /api/agents/runs/{runId}/stream` (SSE, `Last-Event-ID` resume) to watch progress

### HITL (Human-in-the-Loop) Pause

1. WayFlow emits an `INTERRUPT` AG-UI event when the flow hits an approval gate
2. A2UI `createSurface` message describes the form to render (catalog renderer ID)
3. User acts via approval inbox UI; decision POSTed to `POST /api/a2a/resume`
4. WayFlow resumes flow execution from the paused node

### Extension Install

1. Admin selects extension in Marketplace (`/configuration/marketplace`)
2. `extensions_install` MCP primitive dispatched via `extensionRegistry` in `@cinatra-ai/extensions`
3. Kind handler resolves dependency tree, fetches package from Verdaccio, validates ABI range
4. `installed_extension` manifest row written; `register(ctx)` activation runs (ABI gate → config gate → `register`)
5. `bootstrap(ctx)` runs after all modules registered; extension surfaces appear without redeploy

### Event Streaming Reconnect

1. Browser disconnects (page reload, network drop)
2. Browser reconnects with `Last-Event-ID` header
3. SSE route replays missed events from Redis Streams log — no events lost

**State Management:**
- PostgreSQL holds durable state: agent runs, HITL approval, message history, audit logs, notifications
- Redis holds transient-but-durable: BullMQ job queues, AG-UI event log (Redis Streams), A2UI pub/sub channels

## Key Abstractions

**Extension (`packages/<name>/`):**
- Purpose: Self-contained capability unit — persistence, jobs, UI, MCP tools in one versioned package
- Pattern: `register(ctx: ExtensionHostContext)` activation entry point; everything goes through 14 host-context ports, never direct host internals
- Reference: `references/platform/extensions.md`

**`ExtensionHostContext` (SDK ABI 2):**
- Purpose: The privileged port surface a registered extension receives — least-privilege, 14 ports only
- Ports: `settings`, `secrets`, `nango`, `authSession`, `mcp`, `objects`, `jobs`, `notifications`, `ui`, `logger`, `runtime`, `capabilities`, `telemetry`, `db`
- Reference: `references/platform/extensions.md`

**`discoverActiveCapabilities` dispatcher:**
- Purpose: Single function that answers "what is active for this actor right now" — intersects `installed_extension` lifecycle gate with per-kind visibility readers
- Location: `packages/extensions/src/runtime-discovery.ts`
- Pattern: `installed_extension (active|locked)` → group by kind → `ExtensionTypeHandler.listActive({ actor, scope, manifests })`

**OAS Flow File (`agents/<vendor>/<slug>/cinatra/oas.json`):**
- Purpose: The canonical agent definition — inputs, system prompt, tool references, flow nodes, output schema, HITL renderer declarations
- Pattern: Compact authoring format compiled at publish time; `agentspec_version: "26.1.0"`, `component_type: "Flow"`

**Deterministic Client:**
- Purpose: Typed in-process wrapper for cross-package calls that avoids importing another package's internals
- Pattern: Calls a package's own MCP primitives; used by UI server actions and the agent runtime

**Dual Adapter (AG-UI + A2UI):**
- Purpose: Single dispatch at the execution worker fans every lifecycle hook to both AG-UI (event log) and A2UI (HITL channel)
- Location: `packages/agent-ui-protocol/src/`

## Entry Points

**Next.js App Router:**
- Location: `app/` (inferred from Next.js App Router convention)
- Triggers: Browser requests, server actions, API routes
- Responsibilities: Session management, UI rendering, routing to extension surfaces

**A2A Inbound Endpoint:**
- Location: `app/api/a2a/route.ts` (multiplexed JSON-RPC)
- Triggers: External agents or tools calling a Cinatra agent over HTTP
- Auth: Bearer JWT (same as MCP); flag-gated by `CINATRA_A2A_HTTP_ENABLED`

**Agent Run SSE Endpoint:**
- Location: `app/api/agents/runs/[runId]/stream/route.ts`
- Triggers: Browser subscribes to watch a running agent; reconnects with `Last-Event-ID`
- Responsibilities: Replays missed events from Redis Streams log

**Extension `register(ctx)` Hook:**
- Location: Each extension's `serverEntry` file (e.g., `src/register.ts`)
- Triggers: Boot-time activation (static-bundle loader or runtime-package loader)
- Responsibilities: Registers MCP tools, UI surfaces, object types, job workers via host context ports

## Architectural Constraints

- **Extension isolation:** Extensions must never import `@/lib/*`, `@/components/*`, or `@/app/*` host internals. All privileged access goes through `ExtensionHostContext` ports. Enforced by `scripts/audit/core-extension-import-ban.mjs` and `scripts/audit/core-extension-instance-coupling-ban.mjs`.
- **LLM calls:** Extension/agent code must not import OpenAI, Anthropic, or Gemini SDKs directly. All LLM calls go through `@cinatra-ai/llm`.
- **Cross-package calls:** Packages communicate through MCP primitives via the deterministic client, not by importing each other's internal modules.
- **`installed_extension` writes:** Only `transitionExtensionLifecycle` (`packages/extensions/src/lifecycle-primitive.ts`) may write `installed_extension.status`. Direct manifest row edits are forbidden.
- **Runtime/A2A boundary:** The Next.js app calls WayFlow strictly over A2A (HTTP/JSON-RPC). No shared memory or direct Python imports.
- **Immutable registry:** Published extension versions in Verdaccio are immutable (`unpublish` locked to `nobody`, verified at boot).
- **SDK ABI freeze:** Extension host-context ports are frozen on SDK ABI 2. No port may be added or changed without a major ABI bump.

## Anti-Patterns

### Direct Extension-to-Extension Internal Imports

**What happens:** Package A imports `packages/b/src/internal-util.ts` directly rather than calling B's MCP primitive via the deterministic client.
**Why it's wrong:** Creates hard coupling, breaks the IoC model, and means the same capability is not reachable externally via MCP — violating the principle that internal and external callers use identical paths.
**Do this instead:** Call the target package's MCP primitive via its deterministic client. See `references/platform/extension-ioc-safeguards.md`.

### Direct LLM SDK Imports in Extension Code

**What happens:** An extension imports `openai` or `@anthropic-ai/sdk` directly.
**Why it's wrong:** Provider-specific code scatters across the codebase; swapping or adding a provider requires touching every callsite; usage telemetry is not emitted.
**Do this instead:** Use `@cinatra-ai/llm` `generate` or `stream`. Provider code lives in exactly one place.

### Editing `installed_extension` Rows Directly

**What happens:** A migration or script sets `installed_extension.status` via a raw SQL update.
**Why it's wrong:** Bypasses the canonical gate (`enforceCanonicalManifest`), the lifecycle audit log, and the locked-row rejection.
**Do this instead:** Route through `transitionExtensionLifecycle` in `packages/extensions/src/lifecycle-primitive.ts`.

## Error Handling

**Strategy:** Failure isolation per extension module during activation; fail-closed on ABI and integrity gates.

**Patterns:**
- Extension activation failures are isolated per module — one failing `register(ctx)` does not block other extensions from activating
- ABI gate and integrity gate fail-closed before any extension code runs
- `discoverActiveCapabilities` isolates reader-throw per kind; a failing kind reader is recorded in `unmigratedKinds`, never fatal and never silently dropped
- BullMQ job failures are logged and surfaced as notifications (user/team/org/project/admins routing)
- Sentry-API-compatible error layer (`@sentry/nextjs` + `@sentry/opentelemetry`) runs as no-op when `SENTRY_DSN` is unset

## Cross-Cutting Concerns

**Logging:** Structured logging scoped per extension via the `logger` host-context port
**Validation:** OAS files validated by `pyagentspec==26.1.0` before compilation; extension manifests validated by ABI and integrity gates at load time; naming/README/license enforced by audit scripts
**Authentication:** Better Auth with username, passkey, organization, OAuth provider plugins; Bearer JWT for MCP and A2A access; `CINATRA_A2A_HTTP_ENABLED` flag gates external A2A inbound
**Observability:** Single `provider.register()` call for OpenTelemetry tracing; `telemetry` host-context port for usage/cost events from extensions (fire-and-forget, must not throw or block)
**Notifications:** `cinatra.notifications` table with Postgres `LISTEN/NOTIFY`-driven realtime SSE; BullMQ worker emits on job completion/failure with recipient routing

---

*Architecture analysis: 2026-06-09*
