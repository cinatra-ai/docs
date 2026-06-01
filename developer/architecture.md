# Architecture

Cinatra is a monorepo of TypeScript packages running on Next.js, with a Python agent runtime as a sidecar container. The platform composes around four ideas:

1. **Extensions** — every domain capability (agent, connector, asset, entity) is packaged as an extension that owns its persistence, jobs, UI, and capability surface.
2. **A shared protocol layer** — MCP, agent-to-agent (A2A) protocol, AG-UI, agent-to-UI (A2UI) protocol, and Open Agent Specification (OAS) provide the seams between packages, between Cinatra and its users, and between Cinatra and external agent systems.
3. **A common large language model (LLM) orchestration layer** — every LLM call (OpenAI, Anthropic, Gemini) goes through one interface that controls authentication, tool injection, skill resolution, and observability.
4. **Durable background execution** — long-running work runs through BullMQ (a Redis-backed job queue) over Redis, with state in PostgreSQL, so a workflow that takes minutes or hours is not bound to a request lifecycle.

---

## The four pillars

### Extensions (packages)

Every package under `packages/<name>/` is an extension. An extension typically exposes:

- **A capability surface** as MCP primitives (`<package>_<verb>` style names, registered via the package's MCP handlers).
- **Persistence** — Drizzle schema definitions and a store layer for its own tables.
- **Background jobs** — BullMQ workers for any long-running work the package owns.
- **UI** — React screens mounted into the Next.js app via the extension route registry.
- **A deterministic client** — typed in-process wrapper used by other packages and server actions, so cross-package calls do not have to go over HTTP.

Extensions communicate through capability surfaces, not by importing each other's internals. An extension needing functionality from another calls its MCP primitives via the deterministic client. This keeps the dependency graph clean and lets the same primitive serve internal callers and external MCP clients identically.

The extension lifecycle (install, update, uninstall, archive, restore) is dispatched through a central `extensionRegistry` with admin-only MCP primitives (`extensions_install`, `extensions_archive`, `extensions_restore`, `extensions_force_delete`). Removal has a layered surface: `extensions_uninstall` (clean) → `extensions_force_delete` (DB+disk, no registry) → registry-only `extensions_registry_unpublish` / `extensions_registry_delete` (one Verdaccio (an npm-compatible registry) version, kind-agnostic) → `extensions_purge` (the "gone everywhere" capstone — Verdaccio all-versions + DB + disk; **dry-run only as an MCP tool**, the destructive path is the human-origin `cinatra extensions purge` CLI → admin+loopback API route, never model-invokable). Extensions can carry a `public` or `private` visibility; installation flows through Cinatra's marketplace and respects the visibility filter at every server read path.

### Shared protocols

Cinatra is intentionally standards-aligned. The four open protocols that meet at the platform's edges are documented in [Open standards in Cinatra](open-standards.md):

- **OAS (Open Agent Specification)** — every agent is a declarative OAS Flow file under `agents/<vendor>/<slug>/`. A compiler in the `@cinatra-ai/agents` package derives the runtime representation from the on-disk form.
- **A2A (Agent-to-Agent)** — every agent is callable as a standard A2A endpoint. Cinatra also calls remote A2A agents as if they were local tools.
- **AG-UI (Agent-User Interaction Protocol)** — every run streams typed lifecycle events over server-sent events (SSE) with durable replay.
- **A2UI (Agent-to-User Interface)** — declarative human-in-the-loop (HITL) surface payloads run in parallel to AG-UI on their own Redis channel.

Internally, MCP is the day-to-day fabric. The MCP server exposes every package's capability surface as named primitives. The same primitive is reachable in-process via the deterministic client (used by UI server actions and the agent runtime) and over HTTP via the Cinatra MCP server endpoint (used by external clients including the agents themselves when they emit `mcp` tool calls).

### LLM orchestration

`@cinatra-ai/llm` is the single seam to every LLM provider. Callers describe a generate or stream request — a system prompt, messages, tools, optional skills, optional MCP tool injection — and the orchestration layer resolves the right provider, attaches the Cinatra MCP tool (so the agent can call the same primitives users can), injects matched skills, and emits structured usage events to the metrics pipeline.

This means provider-specific code lives in exactly one place. Agents do not import OpenAI, Anthropic, or Gemini SDKs directly — they ask the orchestration layer for `generate` or `stream`. Adding a new provider is a single-place change.

### Durable background execution

Long-running work — agent runs, registry installs, blog post generation, email campaigns — is enqueued onto BullMQ over Redis and picked up by a worker. PostgreSQL holds the durable state: agent run records, HITL approval state, message history, audit logs. A request that triggers a workflow returns immediately with a run identifier; the workflow itself continues asynchronously and the user subscribes to the AG-UI event stream to watch progress.

This pattern means a single Next.js page can launch a workflow that takes hours, survive page reloads, replay events on reconnect, and pause for human approval at any point — all without bespoke long-polling glue per workflow.

---

## The agent runtime: WayFlow

Cinatra's agent runtime is **WayFlow**, the reference OAS-spec implementation, running as a Python service in a Docker sidecar. WayFlow is invoked from the Next.js app over A2A — every agent invocation, whether triggered by a user in the UI or by another agent in a flow step, ends up as an A2A call into the WayFlow container.

The split is deliberate:

- Authoring, UI, persistence, observability, MCP plumbing, and skill orchestration live in the TypeScript app. This is where features happen.
- Flow execution (graph traversal, tool invocation, prompt assembly, HITL pausing, context management) lives in WayFlow. This is the OAS-compliant runtime.

Because the boundary is A2A, the runtime is replaceable. Any other OAS-compliant runtime could be swapped in without changing the rest of the platform — the contract is the spec, not the runtime.

---

## Tech stack at a glance

- **Language:** TypeScript (app + packages) and Python (WayFlow runtime container)
- **Framework:** Next.js (App Router, Server Components, Server Actions)
- **UI:** React with shadcn/ui components on Tailwind CSS
- **Database:** PostgreSQL via Drizzle ORM (schema is configurable; default is the `cinatra` schema)
- **Background jobs:** BullMQ on Redis
- **Auth:** Better Auth (the auth server library Cinatra uses) with username, passkey, organization, and OAuth provider plugins; provider for MCP and A2A access
- **Agent spec/runtime:** OAS Flow 26.1.0 authored on disk; WayFlow (`wayflowcore`) inside the runtime container
- **LLM providers:** OpenAI, Anthropic, Google Gemini — all behind one orchestration layer
- **MCP server:** the platform exposes every package's capability surface as MCP primitives; same primitives used internally via deterministic clients
- **Dashboards:** a two-package split (`packages/sdk-dashboard` for the generic semantic-layer adapter, `packages/dashboards` for the Cinatra glue) backed by `drizzle-cube/server`; all dashboard mutations flow through one mutation service that writes the data change and the `audit_events` row in the same Postgres transaction. See [Dashboards](../user/dashboards.md).
- **Notifications:** Postgres-backed `cinatra.notifications` table with realtime push driven by Postgres `LISTEN/NOTIFY` and a SSE route; the BullMQ worker emits a notification on every job completion or failure, with recipient routing across user / team / organization / project / admins.
- **Error reporting:** a Sentry-API-compatible layer (`@sentry/nextjs` + `@sentry/opentelemetry`) that runs as a no-op when `SENTRY_DSN` is unset; integrated with the existing OpenTelemetry (vendor-neutral tracing) tracer so there is exactly one `provider.register()` call.
- **Generic Extension Permissions:** a polymorphic backend (`extension_co_owners`, `extension_access_policy`) and a single `PermissionsForm` UI shared across four kinds — `agent_template`, `agent_run`, `skill_package`, and `skill` — with per-skill overrides for the skill kind. See [Security](security.md).

---

## Diagrams

For a higher-level visual: see the [architecture overview diagram](../assets/architecture-overview.svg) and [agents architecture diagram](../assets/agents-architecture.svg).

For the open-standards composition: see [Open standards in Cinatra](open-standards.md), which includes a marketecture diagram showing OAS, A2A, AG-UI, and A2UI as the four interfaces into the platform.

---

## Where to go next

- Build an agent: [Developing agents](developing-agents.md)
- Package one up: [Building packages](building-packages.md)
- Understand the standards: [Open standards in Cinatra](open-standards.md)
- Configure the platform: [Configuration](../hosting/configuration.md)
