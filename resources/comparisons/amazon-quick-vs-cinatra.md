# Amazon Quick vs. Cinatra

Amazon Quick is AWS's managed, AWS-hosted AI assistant and agentic workspace for business teams. Cinatra is the open source, self-hosted agent platform you run on your own infrastructure. Both are agentic work platforms — they go beyond chat into scheduling, building deliverables, and acting on a user's behalf — and they make opposite bets on where that capability should live: inside AWS's cloud as a managed product, or on servers you control as software you own.

## What They Are

| Dimension | Amazon Quick | Cinatra |
|---|---|---|
| **Category** | Managed agentic AI assistant / workspace (AWS-hosted SaaS) | Self-hosted full-stack agent platform |
| **Primary user** | Business teams — sales, marketing, IT, operations, finance, legal — from a free individual tier up to enterprise | Teams building, running, and operating their own AI agent workflows on their own infrastructure |
| **Agent runtime** | AWS-managed cloud, plus a native desktop app (macOS, Windows) that runs scheduled background agents | WayFlow (Cinatra's Open Agent Specification (OAS) Flow agent runtime), a Python sidecar running on infrastructure you control |
| **Large language model (LLM) access** | Underlying models are not disclosed on AWS's product pages | Multi-provider through `@cinatra-ai/llm` (OpenAI, Anthropic, Gemini) |
| **Authoring** | No-code Custom Agents, natural-language Quick Flows, and Quick Automate for multi-step cross-system processes | Agents authored as OAS Flow files (declarative JSON), or built conversationally inside the platform's chat assistant |
| **Hosting** | AWS cloud only; no self-host option | Self-hosted (Next.js + PostgreSQL + Redis + WayFlow sidecar) |
| **License** | Proprietary, hosted product | Open source (Apache 2.0) |
| **Pricing** | Per-user tiers plus a per-account infrastructure fee and metered agent hours on the paid team tiers | Run the platform at your own infrastructure cost; no per-run vendor fee from Cinatra |

## What Amazon Quick is, in AWS's framing

AWS's FAQ defines Amazon Quick as *"an AI assistant for work that turns questions into answers, answers into actions, and actions into outcomes — for you and your entire team."* The lineage runs through Amazon Quick Suite, announced in October 2025; Amazon Quick itself launched in late April 2026, and third-party coverage describes it as the evolution of Amazon Q Business rather than a separate product (AWS's own pages do not state a launch date).

The product is explicitly agentic — *"scheduling, building deliverables, creating dashboards, and acting on your behalf"* — and is organised into named modules:

- **Spaces** — collaborative team environments that share knowledge, data, apps, and agent interactions
- **Custom Agents** — no-code chat agents that can be shared with the team
- **Quick Flows** — simple workflows described in natural language
- **Quick Automate** — complex multi-step processes spanning systems
- **Quick Sight** — AI-assisted business intelligence and dashboards
- **Quick Research** — a deep-research agent producing cited reports
- **Quick Index** — a pooled enterprise knowledge index

A native desktop app for macOS and Windows has local file, calendar, and email access and runs scheduled background agents; browser extensions exist for Chrome, Edge, and Firefox. AWS's FAQ states that *"AWS does not use your data to train models in any Amazon Quick plan — free or paid"* and that the service is *"HIPAA eligible, FedRAMP authorized, and SOC 2 audited."* The desktop product builds what AWS calls a personal knowledge graph of your people, projects, and how your work connects across tools, which AWS describes as private to you; hosted workspace data lives in AWS.

Pricing (as of June 2026): a Free tier; Plus at $20/user/month (annual); Professional at $20/user/month plus a $250/account/month infrastructure fee, which includes 4 agent hours per month (2 agentic + 2 Quick Research), 50 GB of index storage per user pooled across the organisation, Quick Automate, Quick Sight scenarios, and RBAC/SSO; Enterprise at $40/user/month plus the $250 fee, with 8 hours (4 agentic + 4 Quick Research), data sovereignty controls, asset certification, and 24/7 support. Overages are metered: $3 per agentic hour, $6 per Quick Research hour, $5/GB/month of index storage beyond the pooled allocation.

## What Cinatra is

Cinatra is a self-hosted application platform. Every layer — the Next.js app, the WayFlow agent runtime, the LLM orchestration, the connectors, the registry, the durable execution layer (BullMQ (a Redis-backed job queue) + PostgreSQL), the object store, the audit trail — runs on infrastructure you control. Agents are declarative OAS Flow files committed to git; the same files run on any OAS-compliant runtime. Cinatra also exposes its primitives as a Model Context Protocol (MCP) server so any MCP client (Claude Code, ChatGPT connectors, custom tooling) can drive it, speaks agent-to-agent (A2A) protocol so other agent platforms can call its agents and vice versa, and publishes typed lifecycle events over the Agent-User Interaction Protocol (AG-UI) plus declarative human-in-the-loop surfaces over the agent-to-UI (A2UI) protocol.

## Key Differences

### 1. Execution environment

- **Amazon Quick:** AWS-managed SaaS plus a desktop app for local context and scheduled background agents. Agent execution on the team tiers is metered in agent hours (4 or 8 included per month, then per-hour overage billing).
- **Cinatra:** BullMQ jobs on your own server. No vendor metering of agent execution — capacity is whatever your infrastructure provides.

### 2. Skills / tools

- **Amazon Quick:** no-code Custom Agents shared with the team, Quick Flows for simple natural-language workflows, Quick Automate for complex multi-step processes. Capabilities live inside the Quick product surface.
- **Cinatra:** skill system is central — versioned `SKILL.md` files, auto-captured from usage when enabled, delivered as tools to any LLM call, and distributable as installable extensions across instances.

### 3. Multi-agent

- **Amazon Quick:** the product pages describe individual Custom Agents, module-level agents (Quick Research, Quick Automate), and Spaces where a team shares agent interactions; an orchestrator/sub-agent composition model is not described on the product pages.
- **Cinatra:** explicit orchestrator + sub-agent model. Orchestrators call other agents in-process via the A2A transport, with human-in-the-loop (HITL) gates that pause the parent flow until each sub-agent's review is approved; sub-agents can live on another Cinatra instance and be invoked over authenticated A2A.

### 4. Connectors

- **Amazon Quick:** a curated catalog — Slack, Microsoft Teams, Outlook, Word/Excel/PowerPoint, Salesforce, Jira, ServiceNow, CRMs, databases — plus first-class MCP support. Per AWS's documentation, the MCP integration connects to remote MCP servers only (HTTP streaming preferred over server-sent events; local stdio is not supported), authenticates via user OAuth, service-to-service credentials, or no auth, reaches private MCP servers through VPC connections, and requires an Enterprise subscription. A hosted "MCP Actions" catalog (Asana, Jira/Confluence, Box, Canva, HubSpot, Notion, Linear, Zapier, and others) ships alongside it. AWS curates the catalog; there is no user-publishable extension marketplace — extensibility is bring-your-own MCP server plus custom agents.
- **Cinatra:** first-class connector extensions for Gmail, Google Calendar, Apollo, LinkedIn, WordPress, Drupal, Apify, YouTube, GitHub, routed through Nango (the OAuth gateway brokering connector credentials). New connectors are TypeScript packages you write and publish to your own registry; the marketplace is shared across connected Cinatra instances.

### 5. UI / human-in-the-loop

- **Amazon Quick:** assistant chat, Spaces, and dashboards across web, desktop, and browser extensions. The product is described as acting on your behalf; the product pages do not detail a structured approval/checkpoint model for in-flight agent actions.
- **Cinatra:** A2UI declarative HITL surfaces — setup forms before a run starts, mid-run review panels (recipient lists, draft emails, custom renderers) — published on a parallel Redis channel alongside the AG-UI lifecycle stream, with a shared approval queue visible to the team.

### 6. Memory

- **Amazon Quick:** Quick Index pools enterprise knowledge for the workspace (50 GB per user pooled organisationally on the team tiers, $5/GB/month beyond); the desktop product builds a personal knowledge graph of people, projects, and how work connects across tools, which AWS describes as private to the user.
- **Cinatra:** skills-as-memory — context captured into versioned `SKILL.md` files that persist across runs, including per-user custom skills consolidated from HITL edits — plus durable run state in your PostgreSQL.

### 7. Hosting, data control, and compliance

- **Amazon Quick:** managed SaaS in AWS's cloud only. AWS's FAQ states customer data is not used to train models on any plan, and cites HIPAA eligibility, FedRAMP authorization, and SOC 2 auditing. Data sovereignty controls are an Enterprise-tier feature.
- **Cinatra:** all run state, event streams, files, credentials (encrypted with your key), and the audit trail live in your environment. Compliance posture is whatever your own infrastructure and processes provide — Cinatra does not hold your data, so there is no vendor attestation to depend on.

### 8. Models

- **Amazon Quick:** the underlying models are not disclosed on the product pages (third-party reporting points to Amazon Bedrock, but AWS does not state this there); no model selection is described for users.
- **Cinatra:** OpenAI, Anthropic, and Gemini through a single orchestration interface; switching the model per agent or per instance is a configuration change.

### 9. Open standards and portability

- **Amazon Quick:** MCP support is confirmed and first-class for connecting external tools *into* Quick. Agents, flows, and automations built inside Quick are configurations inside Quick; no portable agent file format is described.
- **Cinatra:** agents are OAS Flow files any OAS-compliant runtime can load; A2A, AG-UI, and A2UI cover execution, lifecycle events, and HITL surfaces; the MCP server makes the whole primitive surface callable from outside.

### 10. Pricing model

- **Amazon Quick:** per-user tiers (Free / Plus / Professional / Enterprise), a per-account infrastructure fee on team tiers, and metered overages for agent hours and index storage.
- **Cinatra:** your infrastructure cost plus your LLM provider bills. No per-user, per-account, or per-agent-hour vendor fee.

## Where They Overlap

Both target business teams that want agents, not just chat: scheduled and background execution, no-code agent authoring, deep research with cited output (Quick Research; Cinatra's web-research agents), dashboards (Quick Sight; Cinatra's editable dashboard layer), team-shared agent work (Spaces; Cinatra's user/team/organization/workspace scoping), and MCP as the integration fabric — Quick consumes remote MCP servers, and Cinatra exposes one, so a Quick workspace could theoretically reach a Cinatra instance's primitives through Quick's MCP connector (an Enterprise-tier capability on the Quick side, and untested as a pairing).

## When each makes sense

| Use case | Better fit |
|---|---|
| AWS-centric organisation that wants a managed assistant rolled out without running anything | **Amazon Quick** |
| Need vendor compliance attestations (HIPAA eligible, FedRAMP, SOC 2) out of the box | **Amazon Quick** |
| Desktop-native assistant with local file, calendar, and email context | **Amazon Quick** |
| AI business intelligence and dashboarding as a packaged module | **Amazon Quick** |
| Self-hosting, full data control, or air-gapped operation | **Cinatra** |
| Multi-provider LLM stack (OpenAI + Anthropic + Gemini) behind one orchestration layer | **Cinatra** |
| Writing and distributing your own connectors and agents as versioned extensions | **Cinatra** |
| Orchestrator + sub-agent workflows with HITL gates, including across instances | **Cinatra** |
| Portable agents (OAS Flow files) that are not tied to one vendor's product surface | **Cinatra** |
| Predictable cost without per-agent-hour metering | **Cinatra** |

## TL;DR

Amazon Quick is AWS's managed agentic workspace: a polished product family (Spaces, Custom Agents, Quick Flows, Quick Automate, Quick Sight, Quick Research, Quick Index) with a desktop app, a curated connector catalog, first-class remote-MCP support, and enterprise compliance attestations — all hosted by AWS, priced per user plus metered agent hours, with no self-host option and no portable agent format. Cinatra is the open source platform for teams that want the same shape of value — shared agents, scheduled background work, research, dashboards, HITL — as software they run, extend, and audit themselves: multi-provider LLMs, OAS-portable agents, a self-published extension marketplace, and an MCP server other tools can drive. Choose Quick when a managed AWS product is the point; choose Cinatra when owning the runtime, the data, and the extension surface is the point.

## Notes on source

This comparison was assembled from AWS's public Amazon Quick product, pricing, and FAQ pages at <https://aws.amazon.com/quick/>, the MCP integration page of the Amazon Quick user guide at <https://docs.aws.amazon.com/quick/latest/userguide/mcp-integration.html>, and AWS's announcements of the MCP Actions catalog. Details AWS does not state on those pages — the late-April 2026 launch date, the Amazon Q Business lineage, and Bedrock as the model layer — come from third-party coverage and are flagged as such above. Where the product pages are silent (underlying models, approval UX, multi-agent composition), this page says so rather than guessing. Pricing and feature names reflect June 2026.
