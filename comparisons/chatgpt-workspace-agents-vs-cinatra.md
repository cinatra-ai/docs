# ChatGPT Workspace Agents vs. Cinatra

## What They Are

| Dimension | ChatGPT Workspace Agents | Cinatra |
|---|---|---|
| **Category** | Managed shared-agent feature inside ChatGPT for business plans | Self-hosted full-stack agent platform |
| **Primary user** | Teams running shared business workflows inside ChatGPT | Teams building, running, and operating their own AI agent workflows on their own infrastructure |
| **Agent runtime** | Cloud, managed by OpenAI (Codex-powered) | WayFlow (Cinatra's OAS Flow agent runtime) (Open Agent Specification (OAS)-compliant Python runtime) running locally or on infrastructure you control |
| **large language model (LLM) access** | OpenAI models only | Multi-provider through `@cinatra-ai/llm` (OpenAI, Anthropic, Gemini) |
| **Authoring** | End users describe a workflow or start from templates inside ChatGPT; define steps, connect tools, add skills | Agents authored as OAS Flow files (declarative JSON), or built inside the platform's chat assistant |
| **Hosting** | OpenAI cloud only | Self-hosted (Next.js + PostgreSQL + Redis + WayFlow sidecar) |
| **License** | Proprietary, hosted product | Open source (Apache 2.0) |
| **Pricing** | Tied to ChatGPT Business / Enterprise / Edu plans plus credit-based usage | Run the platform at your own infrastructure cost; no per-run vendor fee from Cinatra |

## What ChatGPT Workspace Agents are, in OpenAI's framing

OpenAI describes Workspace Agents as the "evolution of GPTs," powered by Codex, and positions them as shared, organization-scoped agents for repeatable team workflows. They appear as an **Agents** item in the ChatGPT sidebar; users create agents by describing a workflow or starting from a template, then define steps, connect tools, add skills, and test before sharing across the workspace.

Availability is **ChatGPT Business, Enterprise, Edu, and Teachers** in research preview. Free until **May 6, 2026**, then credit-based pricing begins. Plus and Pro consumer tiers are not listed.

Canonical examples OpenAI cites include software-request review, product feedback routing, weekly metrics reporting, lead outreach, third-party risk management, Slack Q&A, month-end accounting close, and sales opportunity research and follow-up. Agents can be used inside ChatGPT and Slack, can run on a schedule, and run in the cloud so they continue working while the user is away.

## Architecture

**ChatGPT Workspace Agents** are a managed product surface inside ChatGPT. The runtime, models, scheduler, file workspace, memory, and connector catalog are all operated by OpenAI. Users do not host anything, do not pick the model, and do not run the agent themselves. Org admins enable agents, set role-based controls, restrict which user groups can use which connected tools, approve sensitive actions, and view configuration / updates / runs through OpenAI's Compliance API.

**Cinatra** is a self-hosted application platform. Every layer — the Next.js app, the WayFlow agent runtime, the LLM orchestration, the connectors, the registry, the durable execution layer (BullMQ (a Redis-backed job queue) + PostgreSQL), the object store — runs on infrastructure you control. Agents are declarative OAS Flow files committed to git; the same files run on any OAS-compliant runtime. Cinatra also exposes its agents over agent-to-agent (A2A) protocol and Agent-User Interaction Protocol (AG-UI) so other agent platforms can call them.

## Key Differences

### 1. Hosting and data control

- **Workspace Agents:** OpenAI hosts everything. Agent state, memory, files, runs, and connected-app credentials live in OpenAI's environment. There is no self-host option.
- **Cinatra:** runs entirely on your own infrastructure. Provider keys and connector credentials are encrypted at rest with an encryption key you control. No data leaves your environment unless your agents call out.

### 2. Models

- **Workspace Agents:** OpenAI's Codex-powered runtime; no model selection exposed to users.
- **Cinatra:** any combination of OpenAI, Anthropic, and Gemini through a common orchestration interface. Adding a new provider is a single-place change.

### 3. Open standards alignment

- **Workspace Agents:** the announcement does not surface support for open agent protocols (A2A, AG-UI, OAS/agentspec). Model Context Protocol (MCP) support is not described in the announcement.
- **Cinatra:** speaks four open standards — **OAS** for agent specification, **A2A** for agent-to-agent execution, **AG-UI** for typed lifecycle events, **agent-to-UI (A2UI) protocol** for declarative human-in-the-loop (HITL) surfaces. External A2A agents can call Cinatra agents and vice versa.

### 4. Agent portability

- **Workspace Agents:** an agent built inside ChatGPT is a configuration inside ChatGPT. There is no portable file format that another runtime could load.
- **Cinatra:** agents are OAS Flow files. Any OAS-compliant runtime can load them; Cinatra can install third-party OAS agents the same way it installs first-party ones.

### 5. Multi-agent composition

- **Workspace Agents:** the announcement describes agents as individual authored units, without a native orchestrator/sub-agent composition model.
- **Cinatra:** explicit orchestrator + sub-agent model. Orchestrators call other agents in-process via the A2A transport, with HITL gates that pause the parent flow until each sub-agent's review is approved.

### 6. Human-in-the-loop

- **Workspace Agents:** approval gates for sensitive actions (sending email, editing a spreadsheet, adding a calendar event). The exact pause / notification / escalation UX is not fully specified in the announcement.
- **Cinatra:** A2UI declarative surfaces for HITL — setup forms before a run starts and mid-run review panels (recipient lists, draft emails) — all published on a parallel Redis channel alongside the AG-UI lifecycle stream. The same approval surface works for any agent that declares the same renderer ID.

### 7. Connector ecosystem

- **Workspace Agents:** "dozens of tools" via OpenAI's connected-apps surface; the platform curates which tools are available and which user groups can use them.
- **Cinatra:** first-class connector extensions for Gmail, Google Calendar, Apollo, LinkedIn, WordPress, Drupal, Apify, YouTube, GitHub, plus Nango (the OAuth gateway brokering connector credentials) as the OAuth gateway for adding new ones. New connectors are TypeScript packages you publish to your own registry.

### 8. Extensibility

- **Workspace Agents:** end-user authoring within OpenAI's catalog. Capabilities outside that catalog (new connectors, new tool types) require OpenAI to add them.
- **Cinatra:** every domain capability is an extension under `packages/`. You write new extensions, publish them to the registry, and other instances install them.

### 9. Where data lives

- **Workspace Agents:** OpenAI's cloud (the "workspace" — files, code, tools, memory).
- **Cinatra:** your PostgreSQL for durable state, your Redis for the event log, your Graphiti (a knowledge-graph indexer) for the object graph index. Backups are your standard Postgres backups.

### 10. Governance and audit

- **Workspace Agents:** Compliance API exposes configuration, updates, and run history; admins can suspend agents and restrict tool access per user group.
- **Cinatra:** every privileged operation goes through a kernel-level authorization helper; every LLM call, agent run, MCP primitive invocation, and job emission is structurally logged. Audit storage is in your own database.

## Where They Overlap

Both target team workflows that benefit from agents (outreach, reporting, content review, support triage). Both support scheduled execution. Both have an approval model for sensitive actions. Both let end users author agents without writing TypeScript.

## When each makes sense

| Use case | Better fit |
|---|---|
| Team is already on ChatGPT Business/Enterprise and wants agents available to everyone in chat | **Workspace Agents** |
| OpenAI-only model stack and a managed product is acceptable | **Workspace Agents** |
| Data residency, encryption-at-rest control, or air-gapped operation is required | **Cinatra** |
| Multi-provider (OpenAI + Anthropic + Gemini) with one orchestration layer | **Cinatra** |
| Need agents to be portable across runtimes (OAS Flow files) | **Cinatra** |
| Need explicit multi-agent / orchestrator-with-sub-agents composition | **Cinatra** |
| Need open-standard interop (A2A, AG-UI, A2UI) with non-OpenAI ecosystems | **Cinatra** |
| Want to package and distribute custom connectors and agents as versioned extensions | **Cinatra** |

## TL;DR

Workspace Agents are OpenAI's managed product for shared team agents inside ChatGPT — fast to enable, fully managed, OpenAI-only model stack, no portability outside ChatGPT. Cinatra is the open source platform you self-host when you want the same shape of value (shared business workflow agents, scheduling, HITL, connectors) without giving up control of the runtime, the model choice, the data, or the agent file format. The two are aimed at different buyers and largely do not compete: Workspace Agents replace the build-it-yourself decision with "use OpenAI's managed offering"; Cinatra is what you reach for when that build-it-yourself decision is intentional.

## Notes on source

This comparison was assembled from OpenAI's announcement of ChatGPT Workspace Agents at <https://openai.com/index/introducing-workspace-agents-in-chatgpt/> and the related Help Center entry "ChatGPT Workspace Agents for Enterprise and Business." Where the announcement is silent on a detail (e.g. exact maximum task duration, the precise pause/notification UX), this doc says "the announcement does not specify" rather than guessing.
