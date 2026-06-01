# A connected ecosystem of capabilities

Cinatra's surface is not a list of independent tools; it is a single capability fabric where every agent, every connector, every skill, every dashboard, and every data object shares one set of primitives. A workflow you build is rarely "one agent does one thing." It is usually a chain — an agent that calls another agent, that consults a skill, that pulls data from a connector, that writes results into a list other agents read from. This page covers what those parts are and how they compose.

---

## Agents

An agent is a deterministic workflow expressed as an [Open Agent Specification (OAS) Flow](../developer/open-standards.md) declarative file. It declares its inputs, its sub-agents, its tools, and its execution graph. The platform runs that flow in a WayFlow (Cinatra's OAS Flow agent runtime) Python sidecar; the chat UI, the run page, and any Model Context Protocol (MCP) client all see the same execution stream.

Agents come from three places:

- **The marketplace.** Installed from the shared registry or from another Cinatra instance. See the [Registry and marketplace](../configuration/marketplace.md) admin reference and [Cross-instance collaboration](cross-instance-collaboration.md) for the user-side workflow.
- **Authored in chat.** You describe what you need; the chat assistant probes for existing agents that already do it, then (if nothing fits) drafts a new one, validates it, and offers to publish it. See [Creating agents in chat](creating-agents-in-chat.md).
- **Authored from files.** For agents that need git-tracked review, the same OAS Flow can be authored in an editor. See [Developing agents](../developer/developing-agents.md) on the developer side.

Every agent is callable three ways:

1. From the chat UI as a tool the assistant can invoke.
2. From the run page for that run directly.
3. From any MCP client (Claude Code, ChatGPT connectors, automation scripts) as `cinatra_<vendor>_<slug>`.

The composition rules — how one agent can declare another agent as a sub-agent dependency, how versions resolve, how the runtime hands off — are formalised in [Open standards in Cinatra](../developer/open-standards.md).

## Connectors

Connectors are the bridges to third-party services. Each connector wraps a vendor API (Gmail, Google Calendar, Apollo, LinkedIn, WordPress, Drupal, Apify, YouTube, GitHub) and exposes its operations as MCP primitives that agents can call.

Authentication for connectors is brokered through Nango (the OAuth gateway brokering connector credentials). You click "connect" in the workspace, hand off through OAuth, and the connector becomes available to every agent that declares it. The credential is stored once and reused across agents — you don't paste an API key into each one.

## Skills

A skill is a declarative `SKILL.md` file an agent can reach for at runtime. Skills come in two shapes:

- **Skill extensions** — versioned, installable, marketplace-distributable. A skill extension can carry several SKILL files plus accompanying tool scripts.
- **Custom skills** — captured automatically from your prompt edits inside human-in-the-loop (HITL) surfaces when an admin has enabled skill autosave. See [Continuous learning and custom skills](continuous-learning.md).

The skill-matching layer keeps a per-agent register of which skills currently apply. When you run an agent, the runtime resolves the active skill set, the large language model (LLM) reads them via a shell tool, and they shape the run.

## Objects and lists

Cinatra ships a typed object layer (the **Object Layer**) that agents both read from and write to as first-class inputs and outputs. Object types include contacts, accounts, campaigns, blog posts, transcripts, and a handful of others. The unified view at `/data` shows the same underlying objects through typed surface lenses.

**Lists** are durable groupings of objects. An agent can read "the list of accounts I am researching this week", append discovered contacts to "the list of warm leads", and another agent can pick up that same list as its own input. Lists are how multi-step workflows stay coordinated without one agent having to call the next directly.

For the data-model details — typed identifiers, registration, dual-write hooks — see [The objects layer](../developer/objects-layer.md).

## Dashboards

The `/agents` surface and any new dashboard you create are real, editable layouts backed by a shared semantic-layer engine. You add widgets, resize them, save the layout. New dashboards have draft / published / archived lifecycles, governed by per-resource permissions, and exposed as MCP primitives just like any other capability. See [Dashboards](dashboards.md).

## How the pieces compose

A concrete workflow:

1. A user starts an outreach campaign in chat. The assistant picks up the **Email outreach** agent.
2. The agent reads the **list** "Q2 target accounts" — an object list curated last week.
3. It calls the **Apollo connector** to enrich missing contact data on those accounts.
4. It consults a **skill** describing the team's voice and exclusion rules.
5. It drafts personalised emails for each contact and writes them to a **list** "outbox drafts."
6. A human reviews the drafts in a **HITL surface**, edits a few. The edits are captured as a **custom skill** that primes the next run.
7. When approved, the **Gmail connector** sends the emails and the **notifications feed** confirms delivery.

No part of that workflow lives outside the platform. The lists, the connectors, the skills, the agent, and the notifications are all first-class capabilities sharing one envelope (the MCP primitive contract, the actor model, the audit trail).

---

## Where to go next

- The chat surface that drives most of this: [Workspace features](workspace-features.md)
- The MCP primitive shape that ties it together: [Cinatra over MCP](../mcp/external-server.md)
- The composability of agents under the open standards: [Open standards](../developer/open-standards.md)
