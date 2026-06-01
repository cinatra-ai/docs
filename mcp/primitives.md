# Primitives

A primitive is Cinatra's unit of capability. Every domain operation — running an agent, listing accounts, sending an email, creating a dashboard — is implemented as a primitive that gets registered with the Model Context Protocol (MCP) server. External clients see them as MCP tools; internal callers see them as typed deterministic-client calls. Same definition, same validation, same authorization.

This page covers the naming, the validation contract, the actor envelope, and the capability categories.

---

## Naming

Primitive names follow `<domain>_<resource>_<action>`, with underscores throughout. Examples:

- `agent_run`, `agent_run_get`, `agent_run_resume`
- `objects_list`, `objects_get`, `objects_save`, `objects_update` (canonical Objects surface for object CRUD)
- `wordpress_post_create_draft`, `gmail_email_send`
- `dashboards_publish`, `extensions_install`
- `lists_members_add`, `permissions_members_invite`

The names appear verbatim in the MCP tool list. Some primitives have a fourth segment when the action is composite (e.g. `agent_source_write_files` vs `agent_source_write`).

## Schemas and validation

Every primitive declares its input shape as a Zod schema. The MCP framework calls `schema.parse(input)` before the handler runs. Invalid input throws a validation error that surfaces to the caller as a standard MCP `tools/call` failure with the Zod error message.

Output shapes are typed but not Zod-validated on the way out — they're produced by trusted handler code. External callers should treat output as JSON and feature-detect missing fields.

## The actor envelope

Every handler receives a `PrimitiveActorContext` as part of the invocation request:

```ts
type PrimitiveActorContext = {
  source: "ui" | "route" | "worker" | "scheduler" | "agent" | "a2a" | "mcp";
  // plus user identity, org/team/project context
};
```

The `source` discriminator tells the handler where the call came from. The user identity is the actor's identity; the org/team/project context comes from the OAuth client's session (or the in-process call site for internal callers).

Authoritative-actor primitives (agents, agent runs, agent sources, dashboards, lists, objects, permissions, skills, extensions) propagate the OAuth/session actor and run authorization against it. The same agent template that a user can run in the UI is the same one they can run over MCP — `enforceRunAccess(run, actor)` is the canonical gate either way.

Some connector and entity primitives currently register with a fixed actor envelope (`{ actorType: "model", source: "agent" }`) intended for in-platform large language model (LLM) tool use. Calling them externally still works, but they do not yet vary their behavior by external-actor identity. The uniform actor-propagation model is something the platform is working toward, not a finished property of every primitive today.

Internal callers also pass an invocation mode:

- `deterministic` — the call site knows exactly which primitive to call.
- `agentic` — the LLM is choosing primitives over MCP.
- `system` — a platform job that runs without a user.

## Categories

The primitive catalog is grouped by domain package. Each package contributes its own primitives through a `createXxxModule()` factory wired in `src/lib/mcp-server.ts`:

- **agents** — agent templates, runs, run lifecycle, run messages
- **agent sources** — write Open Agent Specification (OAS) Flow files, compile, review, publish
- **objects** — typed CRUD, classification, registration
- **lists** — list CRUD, member add/remove/count
- **projects** — project CRUD
- **dashboards** — dashboard lifecycle
- **chat** — thread CRUD, send, pause/resume the assistant
- **skills** — installed, catalog, personal, match-evaluation, packages
- **extensions** — install, archive, restore, search, force-delete
- **permissions** — invitations, members, platform-role updates
- **metrics** — cost/usage queries, time series
- **trigger** — agent run trigger configuration
- **connectors** — Gmail, Google Calendar, Apollo, LinkedIn, WordPress, Drupal, Media feeds, Blog content

Plus the **virtual agent primitives** — every installed agent registers `cinatra_<vendor>_<slug>` so the MCP tool list always reflects which agents are available right now.

## How a primitive is registered

Each package exports `registerCapabilities(server)`. The host app's `registerAllCapabilities()` walks the module list and registers them all into the single `McpRuntimeToolServer` instance. See [Internal architecture](internal-architecture.md) for the full wiring.

The same registration function is what makes a primitive reachable both externally over `/api/mcp` and internally via the deterministic in-process client. There is no separate "internal API" — packages talk to each other through the same primitive surface external clients use.

---

## Where to go next

- The internal client that calls primitives in-process: [Internal architecture](internal-architecture.md)
- The package-boundary discipline primitives enforce: [Package boundaries](package-boundaries.md)
- Auth on top of every primitive call: [Authentication](authentication.md)
