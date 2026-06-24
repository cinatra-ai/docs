# Spawnlabs vs. Cinatra

Spawnlabs and Cinatra share a striking amount of surface area — both spawn autonomous, long-running agents that keep working after you close the tab, both run fleets of agents and sub-agents in parallel, both carry memory across sessions, and both reach a broad catalog of connected apps. The difference is not in the shape of what an agent does; it is in who owns the platform underneath. Spawnlabs is a proprietary cloud product where agents run, by default, in Spawnlabs' own infrastructure. Cinatra is an open source platform you self-host, where the runtime, the data, the connectors, and the agents themselves live on infrastructure you control.

## What They Are

| Dimension | Spawnlabs | Cinatra |
|---|---|---|
| **Category** | Cloud AI-agent platform — turn personal expertise into autonomous agents ("run without you, scale beyond you") | Self-hosted full-stack agent platform |
| **Primary user** | Individuals and teams who want to delegate long-running business processes to autonomous agents without operating infrastructure | Teams building, running, and operating their own AI agent workflows on their own infrastructure |
| **Agent runtime** | Spawnlabs' cloud — each agent gets "its own isolated runtime"; enterprise customers can run agents in their own virtual private cloud (VPC) or on-prem | WayFlow (Cinatra's Open Agent Specification (OAS) Flow agent runtime), a Python sidecar running on infrastructure you control |
| **Large language model (LLM) access** | Managed inside the platform; the public site does not document a configurable model provider | Multi-provider through `@cinatra-ai/llm` (OpenAI, Anthropic, Gemini) |
| **Authoring** | Describe the work in chat; an autonomous agent is spawned that builds its own tools and integrations as it goes | Agents authored as OAS Flow files (declarative JSON), or built conversationally inside the platform's chat assistant |
| **Hosting** | Vendor cloud by default; private cloud / on-prem deploy and data residency are advertised on the enterprise (Business) tier | Self-hosted (Next.js + PostgreSQL + Redis + WayFlow sidecar) — the standard and only model, on infrastructure you control |
| **License** | Proprietary, hosted product; source not published | Open source (Apache 2.0) |
| **Pricing** | Credit-pool model starting at $39/month ("no onboarding call, no credit card" to start); enterprise pricing on request | Run the platform at your own infrastructure cost; no per-run vendor fee from Cinatra |

## What Spawnlabs is, in Spawnlabs' framing

Spawnlabs' pitch is *"Digitize your abilities."* The promise is to take the way an individual works and turn it into agents that *"run without you, scale beyond you."* The core ideas from its public site:

- **Autonomous, day-one operation** — an agent "ships without you, day one," runs in the background on schedules and triggers, and keeps going after you close the tab.
- **Self-building toolkit** — a built-in set of native capabilities (identity/verification, browser automation, document creation, data generation, lead generation, scripting) that "work together," plus agents that "build [their] own tools" as needed, framed as "nothing to wire, nothing to install."
- **Memory that compounds** — "every interaction makes the agent sharper," with memory carried across prior sessions.
- **Fleets and sub-agents** — "spawn another, and another," one agent per role working in parallel; agents "can also spawn sub-agents in parallel for shardable work like research, sourcing, or multi-account analysis, then aggregate the results."
- **Ownership framing** — agents are positioned as portable assets: "owned by the expert — portable across jobs, shareable with a team, and licensable to the market."

Integration breadth is a headline claim: the product page advertises "200+ out of the box, including Slack, Gmail, Notion, GitHub, Stripe, HubSpot, Salesforce, Linear, Jira, and your CRM" (the homepage shows the lower "100+" figure in places), and agents can additionally "write [their] own integrations against any HTTP API on demand." Pricing (as of June 2026) runs on a credit pool from $39/month, with a Business/enterprise tier that adds private cloud / on-prem deploy, data residency, SSO/SAML, audit logs, and dedicated support, quoted on request.

## What Cinatra is

Cinatra is a self-hosted application platform. Every layer — the Next.js app, the WayFlow agent runtime, the LLM orchestration, the connectors, the registry, the durable execution layer (BullMQ (a Redis-backed job queue) + PostgreSQL), the object store, the audit trail — runs on infrastructure you control. Agents are declarative OAS Flow files committed to git; the same files run on any OAS-compliant runtime. Cinatra exposes its primitives as a Model Context Protocol (MCP) server so any MCP client (Claude Code, ChatGPT connectors, custom tooling) can drive it, speaks agent-to-agent (A2A) protocol so external agent platforms can call its agents and it can call theirs as local tools, and publishes typed lifecycle events over the Agent-User Interaction Protocol (AG-UI) plus declarative human-in-the-loop surfaces over the agent-to-UI (A2UI) protocol.

## Key Differences

### 1. Execution environment

- **Spawnlabs:** agents run in Spawnlabs' cloud by default, each in its own isolated runtime; they operate in the background on schedules and triggers and continue after you close the tab. Enterprise customers can place that runtime in their own VPC or on-prem environment "with the same UX."
- **Cinatra:** BullMQ jobs on your own server; the WayFlow sidecar executes agents server-side. Runs survive page reloads, network drops, and process restarts, and continue while every laptop is closed. Self-hosting is the standard path for every user, not an enterprise upgrade.

### 2. Skills / tools

- **Spawnlabs:** a built-in native toolkit (browser automation, document creation, data generation, lead generation, scripting, identity/verification) plus agents that build their own tools on demand — "nothing to wire, nothing to install."
- **Cinatra:** versioned `SKILL.md` files, auto-captured from usage when enabled, delivered as tools to any LLM call — and packaged as installable extensions that can be published to a registry and shared *across* Cinatra instances, not just within one account.

### 3. Multi-agent

- **Spawnlabs:** spawn one agent per role or workflow, running in parallel; agents spawn sub-agents for shardable work (research, sourcing, multi-account analysis) and aggregate the results, each in its own isolated runtime.
- **Cinatra:** explicit orchestrator + sub-agent model. Orchestrators call other agents in-process via the A2A transport, with human-in-the-loop (HITL) gates that pause the parent flow until each sub-agent's review is approved; sub-agents can live on another Cinatra instance and be invoked over authenticated A2A.

### 4. Connectors

- **Spawnlabs:** a very broad catalog — "200+ out of the box" (a vendor figure; the homepage shows "100+") covering Slack, Gmail, Notion, GitHub, Stripe, HubSpot, Salesforce, Linear, Jira, and more — plus agents that write their own integrations against any HTTP API on demand.
- **Cinatra:** a smaller, deliberate set of first-class connector extensions — Gmail, Google Calendar, Apollo, LinkedIn, WordPress, Drupal, Apify, YouTube, GitHub — routed through Nango (the OAuth gateway brokering connector credentials). Every connector is open code you can read, fork, and extend; new connectors are TypeScript packages you publish to your own registry.

### 5. UI / human-in-the-loop

- **Spawnlabs:** agents are spawned and steered from chat and run autonomously in the background; the public site emphasizes that autonomy, and does not document a specific mid-run human approval surface.
- **Cinatra:** A2UI declarative HITL surfaces — setup forms before a run starts, mid-run review panels (recipient lists, draft emails, custom renderers) — published on a parallel Redis channel alongside the AG-UI lifecycle stream, with a shared approval queue and full run history visible to the team.

### 6. Memory

- **Spawnlabs:** "memory that compounds" — agents carry memory across prior sessions, and the platform frames each interaction as making the agent sharper.
- **Cinatra:** skills-as-memory — context captured into versioned `SKILL.md` files that persist across runs, including per-user custom skills consolidated from HITL edits — plus durable run state, event streams, and an audited object graph in your own PostgreSQL and Redis.

### 7. Hosting, data control, and audit

- **Spawnlabs:** the default is vendor cloud; private cloud / on-prem deploy, data residency, SSO/SAML, and audit logs are advertised, but on the Business (enterprise) tier rather than as the standard model. The agents and their data live in Spawnlabs' environment unless you reach that tier.
- **Cinatra:** everything lives in your environment by default — run state, event streams, files, credentials (encrypted with your key), and an `audit_events` trail in your own Postgres, where your existing backup, retention, and SIEM pipelines apply. Retention is whatever you configure, not a plan tier.

### 8. Open standards and portability

- **Spawnlabs:** agents are framed as portable, shareable, and licensable assets, which is a genuine product direction; the public site does not, however, document an open agent format, an export mechanism, or a commitment to open protocols such as MCP or A2A — so portability is a positioning claim rather than a published, runtime-independent format.
- **Cinatra:** agents are OAS Flow files any OAS-compliant runtime can load; A2A, AG-UI, and A2UI cover execution, lifecycle events, and HITL surfaces; extensions are versioned packages installable on any instance. Portability is a concrete file format and protocol set, not only a positioning claim.

### 9. License and source availability

- **Spawnlabs:** proprietary and hosted; the source is not published, so the platform's behavior is what the product surfaces, not something you can read or fork.
- **Cinatra:** open source under Apache 2.0 — the app, runtime, orchestration, connectors, and registry are code you can read, fork, run, and extend. This is the most concrete, verifiable difference between the two.

### 10. Pricing model

- **Spawnlabs:** a credit-pool model starting at $39/month ("no onboarding call, no credit card" to start), with usage drawn from a credit pool and an enterprise tier quoted on request.
- **Cinatra:** your infrastructure cost plus your LLM provider bills. No seats, credits, or vendor per-run fee from Cinatra.

## Where They Overlap

The overlap is real and larger than with most products in this comparisons set. Both **spawn autonomous, long-running agents** that run in the background and survive the tab closing; both run **fleets of agents and sub-agents in parallel**, sharding work and aggregating results; both keep **memory that persists across sessions**; both reach a **broad catalog of connected apps** and let agents adapt to new ones; and both let you **describe work in chat** and have an agent built or spawned from that description rather than hand-wiring it. If you are evaluating one because you want autonomous agents that keep working without you, the other is squarely in the same category. The decision turns on ownership — open source and self-hosted by default versus a proprietary cloud where self-hosting is an enterprise option — not on whether the agents can do the work.

## When each makes sense

| Use case | Better fit |
|---|---|
| Spinning up autonomous agents fast, with no infrastructure to operate | **Spawnlabs** |
| The broadest possible catalog of out-of-the-box integrations | **Spawnlabs** |
| Agents that write their own integrations and tools on demand | **Spawnlabs** |
| A managed vendor with credit-pool pricing and no setup call | **Spawnlabs** |
| Self-hosting, full data control, or audit logs in your own database with your own retention | **Cinatra** |
| Open source code you can read, fork, and extend | **Cinatra** |
| Durable server-side agent runs that survive restarts and run while laptops are closed | **Cinatra** |
| Multi-provider LLM stack (OpenAI + Anthropic + Gemini) behind one orchestration layer | **Cinatra** |
| Orchestrator + sub-agent workflows with explicit HITL gates, including across instances | **Cinatra** |
| Packaging and distributing your own agents, skills, and connectors as versioned extensions | **Cinatra** |
| Portable agents (OAS Flow files) and open protocols (MCP, A2A) not tied to one vendor | **Cinatra** |

## TL;DR

Spawnlabs and Cinatra reach for the same outcome — autonomous agents that run without you, in parallel, with memory and a wide reach into your tools — from opposite sides of the ownership question. Spawnlabs is a proprietary cloud product that makes spawning those agents fast and operationally hands-off, with a very broad integration catalog and agents that build their own tools; self-hosting exists, but on the enterprise tier. Cinatra is an open source, self-hosted platform where the runtime, the data, the connectors, and the agents are yours by default — readable, forkable, portable as OAS Flow files, and reachable over open protocols. If you want autonomous agents without operating anything, Spawnlabs is the shape of tool to evaluate. If you want the agents, the data, and the extension surface to be yours — open source, self-hosted, and portable — that is what Cinatra is for.

## Notes on source

This comparison was assembled from Spawnlabs' public site at <https://spawnlabs.ai/> (homepage, spawn-agents, and pricing pages), fetched June 2026. Vendor-supplied figures and positioning — the "200+ out of the box" integration count (the homepage shows "100+"), the "memory that compounds" and "owned by the expert / portable / licensable" framing — are reported as the company's claims. Where the site is more specific than the homepage (the product page's 200+ integrations; on-prem / VPC and data residency on the enterprise tier), this page follows the more specific source. Where Spawnlabs publishes no information (a configurable LLM provider, an open agent format or export mechanism, support for open protocols such as MCP or A2A), this page says the site does not document it rather than asserting absence. Pricing and plan details reflect June 2026.
