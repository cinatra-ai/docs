# Why Cinatra

Cinatra is the AI workspace teams run *together*. Instead of each person prompting a chatbot alone, a whole team runs AI agents inside shared projects, teams, and organizations — and works with the results together: reviewing what agents produce, approving the next step, and building on each other's runs. It is the open source AI workspace for teams — on data you control, for as long as the work takes, with a paper trail you can audit. This page gathers the concrete benefits the workspace unlocks over isolated chat tools, managed-agent products, and one-off SDK integrations.

For the comparisons against specific alternatives, see the [comparisons section](comparisons/).

---

## AI you run together, not alone

The main reason teams adopt Cinatra: AI stops being a solo activity. Agents, their runs, and their outputs are owned at the level that matches how you actually work — **user, team, organization, or workspace** — and organised into **projects** that bound the context and collect the results.

- Run an agent inside a project and everyone with access sees the run, its human-in-the-loop gates, and its output — not a transcript trapped in one person's chat history.
- Ownership and visibility are first-class: a skill, agent, or result scoped to a team is visible to the whole team; scoped to the organization, to everyone in it.
- People work *with* what agents produce — reviewing at human-in-the-loop (HITL) gates, resuming runs, and building on each other's outputs — instead of re-prompting from scratch.

## Work that doesn't disappear

Most AI tools are optimised for a single chat session. Close the tab and the work is gone. Cinatra is built for the opposite case: workflows that take minutes, hours, or days; agents that pause for human review and resume cleanly; runs that survive page reloads, network drops, and process restarts.

- Every agent run is durable in Postgres with a typed Agent-User Interaction Protocol (AG-UI) event stream backed by Redis Streams. Disconnect and reconnect; the stream picks up exactly where it left off.
- The platform exposes runs over both the chat UI and Model Context Protocol (MCP), so a workflow you started in chat can be inspected and continued from Claude Code, ChatGPT connectors, or any other MCP client.
- Background work is owned by BullMQ (a Redis-backed job queue) on Redis. Even when nobody is watching the run page, the work continues — and the user gets a notification when it lands.

## Multi-provider LLMs with one interface

You never write OpenAI / Anthropic / Gemini code by hand. Everything routes through one orchestration interface that owns provider selection, tool injection, skill matching, retries, and observability.

- Add a new provider once; every agent benefits.
- Switch a model on a per-agent or per-instance basis without touching agent code.
- Cost and usage are tracked centrally with per-agent and per-provider breakdowns in the metrics dashboard.

## A real marketplace, not a vendor catalog

Agents and skill extensions are first-class extensions: versioned, signed, installable, archivable. The marketplace at `/configuration/marketplace` is a registry that can be shared across Cinatra instances — any deployment with a configured public registry can publish and install.

- **Private extensions** stay scoped to the publishing instance (server-side filtered, not just UI-gated). The private path works out of the box against the instance's own Verdaccio (an npm-compatible registry).
- **Public extensions** are universally visible to every connected instance. Public publish requires the operator to configure a public registry destination under **Administration → Environment → Registries**.
- **Promotion** from private to public is one-way and audited; nothing escapes the trail.
- **Install from GitHub** for skill extensions — paste a repo URL, pick a release, the platform validates and installs.

See [Registry and marketplace](../guides/admin/marketplace.md).

## Agents authored conversationally

You don't open a code editor to author an agent. You describe the problem in chat, the assistant discovers whether an existing agent already solves it, asks you to confirm before building anything new, validates the agent against a deterministic review gate, compiles it, and (when you confirm) publishes it.

- Discovery-first: the chat assistant probes installed agents, the marketplace, and remote agent-to-agent (A2A) protocol endpoints before offering to write anything new.
- Nothing implements without explicit confirmation; the assistant stays in conditional language until you say yes.
- The same MCP primitives that drive chat authoring are reachable from any MCP client — Claude Code, automation scripts, CI workflows.

See [Creating agents in chat](../guides/user/creating-agents-in-chat.md).

## Continuous learning built in

When you edit a prompt inside a HITL surface during an agent run, the platform notices. If your admin enables skill autosave, those edits are consolidated into a per-user, per-agent **custom skill** that primes the next run of the same agent. Your phrasing, your examples, your exclusion lists — they accumulate over time instead of evaporating.

- Custom skills are scoped to you. Your editing style doesn't contaminate the shared catalog.
- Capture is non-blocking and admin-gated; the feature is off by default and audited when enabled.
- Promotion to team or org scope is a deliberate manual step, not something the platform decides for you.

See [Continuous learning and custom skills](../guides/user/continuous-learning.md).

## Cross-instance collaboration that respects boundaries

When two Cinatra instances need to work together — a vendor publishing tools, two teams sharing research agents, a consultancy serving multiple clients — the platform makes the seams explicit:

- Shared marketplace with server-side visibility filtering.
- A2A inter-instance calls so one instance's agent can invoke another's as a tool, with auth handled by the OAuth-provider plugin.
- Run data stays where the run runs. A2A calls carry the request and response; neither instance gets a back door into the other's database.
- Every install / update / archive / promote / cross-instance call writes an audit row.

See [Cross-instance collaboration](../guides/user/cross-instance-collaboration.md).

## Standards-aligned by design

Cinatra speaks four open agent standards so agents authored here are portable, and agents from elsewhere plug in:

- **OAS (Open Agent Specification)** — every agent is a declarative file readable by any OAS-compliant runtime.
- **A2A** — every agent is callable from any A2A client; the platform also calls remote A2A agents as local tools.
- **AG-UI** — typed lifecycle events any AG-UI client can render.
- **agent-to-UI (A2UI) protocol** — declarative HITL surfaces on a parallel channel.

You are not locked into a Cinatra-shaped data format. See [Open standards in Cinatra](../references/platform/open-standards.md).

## Dashboards out of the box

The `/agents` route is a real, editable dashboard backed by a shared semantic-layer engine. You add widgets, resize them, swap them, save the layout. New dashboards are persisted with a draft / published / archived lifecycle, governed by per-resource permissions, exposed as MCP primitives, and audited end-to-end. See [Dashboards](../guides/user/dashboards.md).

## Notifications and operational awareness

Background work tells you when it finishes. Failed jobs route to admins. Long-running agent runs notify the user that started them. The notification feed lives in Postgres, surfaces in realtime over `LISTEN/NOTIFY`, and is durable across sessions. Toasts handle transient in-page feedback; the feed catches everything else.

## Open source, self-hosted, your data

Cinatra is open source under Apache 2.0. You run it on your own infrastructure, with your own database, your own large language model (LLM) provider keys, your own connector credentials. There is no Cinatra cloud you have to give your data to. If you decide to leave the platform, every agent you wrote is an OAS Flow file in git; another OAS-compliant runtime can load it without modification.

---

## Where to go next

- The platform vocabulary: [Concepts and glossary](../references/glossary.md)
- The hands-on tour: [Quickstart](../guides/hosting/quickstart.md)
- A guided tour of the workspace: [Workspace features](../guides/user/workspace-features.md)
- Comparisons against specific alternatives: [Comparisons](comparisons/)
