# Tasklet vs. Cinatra

Tasklet and Cinatra both turn "an AI agent should just do this for me" into something a team can rely on, but they make opposite bets about where that agent lives. Tasklet is a cloud platform: you describe a task in plain English, and it builds an always-on automation that runs in the vendor's infrastructure, each agent inside its own sandboxed cloud machine. Cinatra is an open source, self-hosted platform that runs the agents itself, server-side, on infrastructure you control. One is a managed cloud you build agents inside; the other is a runtime and platform you own and operate.

## What They Are

| Dimension | Tasklet | Cinatra |
|---|---|---|
| **Category** | Cloud AI-agent platform — plain-English task authoring into always-on automations | Self-hosted full-stack agent platform |
| **Primary user** | Teams that want to describe work in sentences and have it run in the cloud without operating infrastructure | Teams building, running, and operating their own AI agent workflows on their own infrastructure |
| **Agent runtime** | The vendor's cloud; each agent gets its own sandboxed cloud machine (isolated compute, code execution, browser automation) | WayFlow (Cinatra's Open Agent Specification (OAS) Flow agent runtime), a Python sidecar running on infrastructure you control |
| **Large language model (LLM) access** | Multi-model — frontier models from Anthropic (Claude), OpenAI (GPT), and Google (Gemini) | Multi-provider through `@cinatra-ai/llm` (OpenAI, Anthropic, Gemini) |
| **Authoring** | Natural language — describe the task in plain English and the platform builds the multi-step automation; no flowcharts or wizards | Agents authored as OAS Flow files (declarative JSON), or built conversationally inside the platform's chat assistant |
| **Hosting** | Vendor cloud only; no self-host option published | Self-hosted (Next.js + PostgreSQL + Redis + WayFlow sidecar) |
| **License** | Proprietary, hosted product | Open source (Apache 2.0) |
| **Pricing** | Free tier plus paid plans for higher limits and computer-use (browser automation) | Run the platform at your own infrastructure cost; no per-run vendor fee from Cinatra |

## What Tasklet is, in Tasklet's framing

Tasklet's pitch is *"The AI command center for your team's agents, connections, knowledge, and apps"* — *"AI agents that do real work."* The problem it names is that building automations usually means flowcharts, wizards, and glue code; its answer is to let you describe the work in sentences and have the platform assemble the multi-step automation:

- **Natural-language authoring** — "Describe what you want in plain English — Tasklet figures out the rest." No flowcharts or builder wizards.
- **Integrations** — thousands of pre-built integrations (Gmail, Slack, Salesforce, HubSpot, Asana, Google Drive, and more), and the platform "can build connections automatically to any HTTP API or MCP server — including the internal, private ones your company built itself." Tasklet is Model Context Protocol (MCP)-native.
- **Sandboxed cloud compute** — "Every agent gets its own secure cloud sandbox — a full machine to run code, crunch data, process files, and build things," isolated per agent. Browser automation ("if a human can do it through a browser, your agent can too") is available on paid plans.
- **Triggers** — schedules (for example, a weekday morning briefing), events (for example, a new HubSpot contact), webhooks (for example, a `/deploy` call), and inbound email.
- **Always-on execution** — agents run in the cloud around the clock, fired by schedules and events rather than a person sitting at a keyboard.
- **Multi-model** — "frontier models from every major lab — Anthropic, OpenAI, Google."
- **Team sharing** — "Share an agent once and the whole team can run it, reuse it, and make it better," with shared credentials (without exposing the keys) and shared knowledge.
- **Dynamic apps** — "Tasklet can turn any prompt into live software" — a dashboard, a tracker, a calculator, an approval workflow, or an internal CRUD app, built on the spot.

On governance, Tasklet's site states it is CASA Tier 2 certified, with SOC 2 and GDPR "in progress," plus granular access controls and guardrails on what agents can touch. Deployment is cloud-only SaaS; the site advertises no self-hosted option. Pricing (as of June 2026) is a free tier plus paid plans that raise limits and unlock computer-use.

## What Cinatra is

Cinatra is a self-hosted application platform. Every layer — the Next.js app, the WayFlow agent runtime, the LLM orchestration, the connectors, the registry, the durable execution layer (BullMQ (a Redis-backed job queue) + PostgreSQL), the object store, the audit trail — runs on infrastructure you control. Agents are declarative OAS Flow files committed to git; the same files run on any OAS-compliant runtime. Cinatra exposes its primitives as an MCP server so any MCP client (Claude Code, ChatGPT connectors, custom tooling) can drive it, speaks agent-to-agent (A2A) protocol so external agent platforms can call its agents and it can call theirs as local tools, and publishes typed lifecycle events over the Agent-User Interaction Protocol (AG-UI) plus declarative human-in-the-loop surfaces over the agent-to-UI (A2UI) protocol.

## Key Differences

### 1. Execution environment

- **Tasklet:** the vendor's cloud runs everything, and each agent gets its own isolated sandbox — a full cloud machine for code execution, file processing, and browser automation. That per-agent sandbox is a genuine strength: it is a real, isolated compute environment without you provisioning anything.
- **Cinatra:** BullMQ jobs on your own server; the WayFlow sidecar executes agents server-side. Runs survive page reloads, network drops, and process restarts, and continue while every laptop is closed. Cinatra does not give each agent its own sandboxed virtual machine — agent jobs run in your environment — so if isolated, disposable per-agent compute with arbitrary code execution is the requirement, that is Tasklet's shape, not Cinatra's.

### 2. Skills / tools

- **Tasklet:** capability comes from its integration catalog and per-agent sandbox tools; knowledge is shared team-wide, and agents are reused and improved within the team.
- **Cinatra:** versioned `SKILL.md` files, auto-captured from usage when enabled, delivered as tools to any LLM call — and packaged as installable extensions that can be published to a registry and shared *across* Cinatra instances, not just within one team.

### 3. Multi-agent

- **Tasklet:** the documented model is per-agent automations that a team shares and reuses, each agent owning a task end to end in its own sandbox.
- **Cinatra:** explicit orchestrator + sub-agent model. Orchestrators call other agents in-process via the A2A transport, with human-in-the-loop (HITL) gates that pause the parent flow until each sub-agent's review is approved; sub-agents can live on another Cinatra instance and be invoked over authenticated A2A.

### 4. Connectors

- **Tasklet:** thousands of pre-built integrations, plus the ability to connect automatically to any HTTP API or MCP server — including internal, private ones — which makes catalog breadth and ad-hoc API reach a headline strength.
- **Cinatra:** a smaller, deliberate set of first-class connector extensions — Gmail, Google Calendar, Apollo, LinkedIn, WordPress, Drupal, Apify, YouTube, GitHub — routed through Nango (the OAuth gateway brokering connector credentials). Every connector is open code you can read, fork, and extend; new connectors are TypeScript packages you publish to your own registry.

### 5. UI / human-in-the-loop

- **Tasklet:** governance includes granular access controls and guardrails on what agents can touch, and "dynamic apps" can express approval workflows; the headline interaction is describe-a-task and let it run.
- **Cinatra:** A2UI declarative HITL surfaces — setup forms before a run starts, mid-run review panels (recipient lists, draft emails, custom renderers) — published on a parallel Redis channel alongside the AG-UI lifecycle stream, with a shared approval queue and full run history visible to the team.

### 6. Memory

- **Tasklet:** shared knowledge bases the whole team can draw on, attached to agents and reused across runs.
- **Cinatra:** skills-as-memory — context captured into versioned `SKILL.md` files that persist across runs, including per-user custom skills consolidated from HITL edits — plus durable run state, event streams, and an audited object graph in your own PostgreSQL and Redis.

### 7. Hosting, data control, and audit

- **Tasklet:** vendor cloud only; no self-host or data-residency option is published. Governance for a managed cloud is real — CASA Tier 2 certification, granular access controls, guardrails — with SOC 2 and GDPR stated as "in progress" on the site rather than completed.
- **Cinatra:** everything lives in your environment — run state, event streams, files, credentials (encrypted with your key), and an `audit_events` trail in your own Postgres, where your existing backup, retention, and SIEM pipelines apply. Retention is whatever you configure, not a vendor setting.

### 8. Open standards and portability

- **Tasklet:** MCP-native both for consuming external MCP servers and for connecting any HTTP API, which is a genuine open-standards commitment for connectivity; agents themselves live inside the workspace, with no published portable agent format another runtime could load.
- **Cinatra:** agents are OAS Flow files any OAS-compliant runtime can load; A2A, AG-UI, and A2UI cover execution, lifecycle events, and HITL surfaces; extensions are versioned packages installable on any instance.

### 9. Pricing model

- **Tasklet:** a free tier plus paid plans that raise limits and unlock computer-use — a managed cloud where the vendor runs the compute (as of June 2026).
- **Cinatra:** your infrastructure cost plus your LLM provider bills. No seats, credits, or storage tiers from Cinatra.

## Where They Overlap

The overlap is real and worth naming. Both are **MCP-native**, and both can connect external MCP servers as tools. Both are **multi-model** (Claude, GPT, and Gemini behind one platform). Both run **multi-step automations** fired by schedules, events, and webhooks. Both let teams **share and reuse agents** so individual usage compounds into team capability. Both court non-developers as builders — Tasklet through plain-English task authoring, Cinatra through conversational agent authoring in chat. Both can stand up **on-demand internal apps and dashboards** (Tasklet's dynamic apps; Cinatra's `/agents` dashboards). Both reach out onto the **web**, though the shapes differ and are not equivalent: Tasklet runs a full browser inside each agent's sandbox for general computer-use, while Cinatra reaches the web through connectors and research/scrape agents — not a per-agent sandboxed machine with arbitrary code execution, which remains a Tasklet strength. Because both speak MCP, they are not mutually exclusive — an MCP client could drive a Cinatra instance and a Tasklet agent in the same workflow.

## When each makes sense

| Use case | Better fit |
|---|---|
| Describe a task in plain English and have it run in the cloud without operating any infrastructure | **Tasklet** |
| Isolated, disposable per-agent sandbox compute with arbitrary code execution and a built-in browser | **Tasklet** |
| Very broad catalog-style integration coverage plus automatic connection to any HTTP API out of the box | **Tasklet** |
| A fully managed cloud with the vendor running schedules, events, and always-on execution | **Tasklet** |
| Self-hosting, full data control, or audit logs in your own database with your own retention | **Cinatra** |
| Open source code you can read, fork, and extend | **Cinatra** |
| Durable server-side agent runs that survive restarts and run while laptops are closed | **Cinatra** |
| Orchestrator + sub-agent workflows with HITL gates, including across instances | **Cinatra** |
| Packaging and distributing your own agents, skills, and connectors as versioned extensions | **Cinatra** |
| Portable agents (OAS Flow files) not tied to one vendor's cloud | **Cinatra** |

## TL;DR

Tasklet bets that the friction is in *building* agents, and removes it with plain-English authoring, a per-agent cloud sandbox, a broad integration catalog, and always-on managed execution — you describe the work and the vendor runs it. Cinatra bets that teams ultimately want to *own* the agent layer: an open source, self-hosted platform with its own runtime, multi-provider LLM orchestration, portable OAS agents, a cross-instance extension marketplace, declarative HITL surfaces, and an audit trail in your own database. If you want the fastest path from a sentence to a running cloud automation, with isolated per-agent compute and a managed vendor, Tasklet is the shape of tool to evaluate. If you want the agents, the data, and the extension surface to be yours — inspectable, portable, and self-hosted — that is what Cinatra is for. Because both speak MCP, the two can even meet in the middle.

## Notes on source

This comparison was assembled from Tasklet's public homepage and pricing pages at <https://tasklet.ai/>. Vendor-supplied descriptions (the integration breadth, the per-agent sandbox specifications, the compliance status) are reported as the vendor states them — including "SOC 2 / GDPR in progress" and "CASA Tier 2 certified," which are Tasklet's own stated statuses. Where Tasklet publishes no information (self-hosting, data residency, a portable agent format), this page says so rather than guessing. Pricing and plan details reflect June 2026 and are described as a free tier plus paid plans rather than fixed figures.
