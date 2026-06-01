# Cinatra Concepts and Glossary

Cinatra introduces several first-class concepts. They are well-defined inside the platform and recur across every doc; if you are landing here for the first time, this page is the quickest way to orient yourself.

For a deeper architectural picture, see [Architecture](../developer/architecture.md). For the open standards that meet at the platform's edges, see [Open standards in Cinatra](../developer/open-standards.md).

---

## Core entities

### Agent

A unit of capability with its own inputs, system prompt, tool references, control flow, output schema, and optional human-in-the-loop gates. A Cinatra agent is declared as an Open Agent Specification (OAS) Flow file at `agents/<vendor>/<slug>/cinatra/oas.json`. The OAS compiler derives the runtime fields (input/output schemas, approval policy, compiled plan) from the node graph; the WayFlow (Cinatra's OAS Flow agent runtime) executes the compiled flow. Agents are first-class citizens of the platform — they show up in the sidebar, can be installed from the marketplace, can be composed (an orchestrator agent calls sub-agents), and can be reached over agent-to-agent (A2A) protocol by anything outside Cinatra.

### Assistant

A long-lived persona that appears in `/chat`. Assistants are not the same as agents: an agent runs a specific declared flow and exits; an assistant is a conversational identity (`@chatgpt`, future `@gemini`, `@claude` via the testing daemon) that lives across threads and can invoke agents as tools. Assistant configuration is managed under `/configuration/assistants`.

### Skill

A `SKILL.md` file (plus optional supporting scripts or references) that the platform delivers to a large language model (LLM) as runtime guidance. Skills are curated, versioned, matched to agents through a declarative match engine, and synced into the active skills store. The skills surface in the sidebar (`/skills`) covers the installed catalog, extensions, and matches.

### Custom skill

A user-curated skill captured automatically by the **skill autosave** hook from the human-in-the-loop (HITL) prompt edits made during a run. Custom skills default to **personal** scope — just for you, on the agent you captured them from — and can be made available to a **team**, a **project**, an **organization**, or **everyone in the workspace** through the standard ownership controls. Each carries a `based_on:` frontmatter list of the prompt IDs that informed it, is updated in place on subsequent runs, and is matched into the agent's prompt context on the next run for whoever has access. Autosave is off by default and admin-gated under `/configuration/skills`. See [Continuous learning and custom skills](continuous-learning.md).

### Extension

A self-contained domain capability packaged for Cinatra. The extension registry recognises five kinds: **agents** (OAS Flow packages), **skill extensions** (curated `SKILL.md` bundles), **connector extensions** (provider integrations such as Gmail or WordPress), **artifact extensions** (typed deliverable schemas — see [Artifact](#artifact) below), and **workflow extensions** (multi-stage release flows). Most extension kinds own their own persistence (Drizzle schema), background jobs (BullMQ), UI screens, Model Context Protocol (MCP) primitives, and a deterministic in-process client; artifact extensions are metadata-only descriptors. Extension lifecycle (install, archive, restore, force-delete, public/private visibility) is dispatched through a central `extensionRegistry`. The marketplace listing at `/configuration/marketplace` today surfaces **agent** extensions; the other kinds install through paths described in [Marketplace](../configuration/marketplace.md). See also [Extensions](../developer/extensions.md) for the engineering reference.

### Object

Any persistent record in the typed object store — accounts, contacts, campaigns, recipients, blog posts, blog ideas, saved media, agent templates, lists, generic objects produced by agent runs. Every object has a namespaced type ID (`@cinatra/<package>:<local-id>`), a parent/child relationship, soft-delete, provenance, and is dual-written to a Graphiti (a knowledge-graph indexer)-backed graph index for retrieval. See [Objects layer](../developer/objects-layer.md).

### List

A typed grouping of object references — for example, a list of contacts to receive an outreach campaign. Lists are themselves objects (`@cinatra-ai/lists:list`); the canonical record lives in Twenty CRM and is reached via the `crm_list_*` MCP primitives. They are designed so agents can read from and write to them as first-class inputs and outputs.

### Artifact

A self-contained, typed deliverable that is consumed by being opened, read, edited, published, downloaded, or attached. Every artifact takes one of three substrate **representation forms** — `file`, `dashboard`, or `connectorRef` — that describe the shape of its bytes; on top of that, one or more **semantic artifact extensions** (blog post, marketing ICP, product portfolio, sales playbook, slide deck, and others) carry its typed meaning. Artifact identity is content + provenance — an artifact has a stable id, immutable versions each with a sha256 digest, MIME-driven viewer hint, and an `origin.kind` (`upload | email_attachment | agent_generated | external_link | live_generator`). Artifacts are a typed projection over the Objects layer plus dedicated tables for blob metadata, immutable versions, normalized refs, provider-ref cache, and audit/retention. Each semantic type ships as a `kind:"artifact"` extension; the set is extensible by adding extensions, no core edits. See [Artifacts](../developer/artifacts.md) and [Authoring semantic artifact extensions](../developer/semantic-artifact-extensions.md).

### Context

The set of artifact references an agent run consumes as grounding input. A context-using agent declares typed **context slots** on its OAS — each slot names which artifact extension types it accepts (e.g. an outreach agent's `offeringContext` slot accepts marketing ICP, marketing strategy, and product portfolio artifacts). At run time each slot is resolved against the ownership chain (user → team → organization → workspace, optionally refined by project), and every selected artifact is **version-pinned** at selection time so the run is replay-safe even after the artifact is edited. Context is not its own extension kind; it is surfaced by the built-in `@cinatra-ai/context-selection-agent` (a `kind:"agent"` extension) together with the `contextSlots` declared on a consuming agent's OAS. See [Agent context slots](../developer/context-slots.md).

### Project

A bounded execution and context space that scopes a set of related runs and outputs. A project can sit at any of the four ownership levels (User, Team, Organization, Workspace) and ratchets upward irreversibly. Outputs created inside a project inherit the project's scope; outputs created outside a project are owned directly at the triggering level. See [Project scoping](../developer/project-scoping.md) for the full data and access model.

### Run

A single execution of an agent. A run has an id, a status (`queued`, `running`, `pending_approval`, `completed`, `failed`, `stopped`), a stream of typed AG-UI events, optional HITL surfaces published over agent-to-UI (A2UI) protocol, and a final outputs payload. Runs are durable: they survive page reloads and disconnects, and a client reconnecting with a `Last-Event-ID` header resumes exactly where it left off.

### Trigger

A configured way to start an agent run without a user clicking Run. Triggers include scheduled runs, webhook-driven runs, and event-driven runs. Each agent template can have a trigger config that fires its execution under specific conditions.

### Dashboard

A user-configurable layout of analytics widgets backed by a shared semantic-layer engine. The `/agents` route hosts the default agents-activity dashboard out of the box; users can create additional dashboards, drag widgets around, and persist their layout through a single mutation service with a draft → published → archived lifecycle. Each mutation also writes an `audit_events` row inside the same transaction. Dashboards are reachable as MCP primitives (`dashboards_create`, `dashboards_update`, `dashboards_publish`, `dashboards_archive`, `dashboards_get`, `dashboards_list`). See [Dashboards](dashboards.md).

### Notification

A typed record in `cinatra.notifications` describing an event a user (or team, organisation, project, or admins recipient set) should see. Notifications are written by the platform — for example, on BullMQ job completion or failure, on long-running agent run state transitions, or by extensions through the explicit `createNotificationForRecipient` API — and surfaced through the **Notifications** sidebar area plus a realtime server-sent events (SSE) push driven by Postgres `LISTEN/NOTIFY`. Toasts handle in-page transient feedback; the notifications feed is durable.

### Permission

The access control on an extension. Cinatra's permissions surface is generic across four kinds — `agent_template`, `agent_run`, `skill_package`, and `skill` — with a co-owner grant (a boolean entry, paired with a per-resource access policy that governs read / execute / share for users outside the co-owner set). Skill-level entries can carry a tighter or wider policy than the parent skill extension. Every privileged read or write goes through one of the kernel's authorization helpers, and every grant, revoke, and policy change writes an `audit_events` row.

## Ownership and scope

### User

The signed-in human. Every actor in the system resolves to a user identity (or a delegated service identity).

### Team

A collaboration unit inside an organization. Teams own resources that the team's members can use together.

### Organization

A workspace tenant. Better Auth (the auth server library Cinatra uses) manages organizations, memberships, roles, and invitations. Most administrative controls (LLM keys, connector credentials, extensions installed) operate at the organization level.

### Workspace

The platform-instance level above organization — currently implicit per deployment. The Workspace level is the ownership tier where platform-wide resources (instance namespace, registry credentials, base configuration) live.

### Instance namespace

A globally-unique identifier each Cinatra instance picks during setup. It doubles as the npm scope under which the instance publishes its extensions to the shared registry — `@<instance-namespace>/<extension-name>`. Setting up an instance fixes the namespace; renaming it is intentional and limited.

---

## Protocols and surfaces

### OAS (Open Agent Specification / agentspec)

The declarative file format Cinatra agents are authored in. Cinatra implements `agentspec_version: "26.1.0"`. See [Open standards in Cinatra](../developer/open-standards.md).

### A2A (Agent-to-Agent Protocol)

The HTTP/JSON-RPC protocol Cinatra exposes for external systems to call its agents, and the protocol Cinatra uses to call remote agents.

### AG-UI (Agent-User Interaction Protocol)

The SSE event protocol Cinatra streams from every agent run — `RUN_STARTED`, `TEXT_MESSAGE_CONTENT`, `INTERRUPT`, etc.

### A2UI (Agent-to-User Interface)

The declarative payload format Cinatra publishes for HITL surfaces — setup forms before a run starts, mid-run review panels, confirmation surfaces.

### MCP (Model Context Protocol)

The capability surface every extension exposes. Internally, packages call each other through MCP primitives via the deterministic client; externally, MCP clients (Claude Code, ChatGPT connector, custom agents) reach the same primitives via the MCP server endpoint.

---

## Runtime and infrastructure

### WayFlow

The OAS-compliant Python agent runtime, running as a Docker sidecar. Cinatra invokes it over A2A; in principle any OAS-compliant runtime could be swapped in without changing the rest of the platform.

### BullMQ

The Redis-backed job queue handling all long-running work (agent runs, content generation, email sends, etc.). The Next.js app enqueues, the worker process picks up and executes. Default queue name: `cinatra-background-jobs`.

### Graphiti

A typed object graph indexer used by the Objects layer. Persisted objects are shadow-written into Graphiti for embedding-backed retrieval; the OpenAI API key is required because Graphiti uses it for embeddings.

### Nango

The OAuth gateway for third-party connector authentication. Connectors (Gmail, Apollo, LinkedIn, etc.) authenticate via Nango (the OAuth gateway brokering connector credentials); the user-side flow is in the **Connectors** sidebar area.

### Better Auth

The authentication library powering sessions, multi-factor auth, passkeys, organization membership, and the OAuth provider plugin that issues tokens for MCP and A2A access.

---

## Where to go next

- See how the pieces fit: [Architecture](../developer/architecture.md)
- Author your first agent: [Developing agents](../developer/developing-agents.md)
- Install and run an agent: [Quickstart](../hosting/quickstart.md)
- The open standards behind the surfaces: [Open standards in Cinatra](../developer/open-standards.md)
- Extension lifecycle: [Extensions](../developer/extensions.md)
