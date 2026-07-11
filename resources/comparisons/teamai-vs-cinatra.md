# TeamAI vs. Cinatra

TeamAI and Cinatra both want a team's AI work to stop happening in scattered, per-person chat windows and start compounding into shared capability — but they make opposite bets about where that capability lives. TeamAI is a hosted, cloud-SaaS multi-LLM workspace: one place where a team chats across many models, builds a citing knowledge base over its documents, stands up custom assistants, and wires in the tools it already uses, all run in the vendor's cloud. Cinatra is an open source, self-hosted platform that runs the agents itself, server-side, on infrastructure you control. One is a managed workspace you sign in to; the other is a runtime and platform you own and operate.

## What They Are

| Dimension | TeamAI | Cinatra |
|---|---|---|
| **Category** | Cloud-SaaS "collaborative multi-LLM AI platform" — a shared team workspace for multi-model chat, a document knowledge base, custom assistants, and automated workflows | Self-hosted full-stack agent platform |
| **Primary user** | Teams that want one managed workspace across many LLM providers — from individuals up to enterprise departments (the site cites up to 1,000 users) | Teams building, running, and operating their own AI agent workflows on their own infrastructure |
| **Agent runtime** | The vendor's cloud; custom assistants and automated workflows run inside the TeamAI workspace | WayFlow (Cinatra's Open Agent Specification (OAS) Flow agent runtime), a Python sidecar running on infrastructure you control |
| **Large language model (LLM) access** | Multi-provider, switchable per conversation or workflow — OpenAI, Anthropic (Claude), Google (Gemini), Meta, and DeepSeek, per the site | Multi-provider through `@cinatra-ai/llm` (OpenAI, Anthropic, Gemini), on your own provider keys |
| **Authoring** | In-workspace: custom assistants ("agents"), a 500+-prompt library, custom plugins, and automated multi-step workflows, built inside the hosted workspace | Agents authored as OAS Flow files (declarative JSON), or built conversationally inside the platform's chat assistant |
| **Hosting** | Hosted SaaS; no self-hosted option identified in TeamAI's public materials as of 2026-07-11 | Self-hosted (Next.js + PostgreSQL + Redis + WayFlow sidecar) |
| **License** | Hosted product; no open-source license identified in TeamAI's public materials as of 2026-07-11 | Open source (Apache 2.0) |
| **Pricing** | Workspace-based (not per-seat), credit-metered, in USD as of 2026-07-11: Individual $5/mo, Starter $25/mo, Professional $149/mo, Enterprise $849/mo, each with an included monthly credit allotment then per-credit overage; annual billing saves 15% | Run the platform at your own infrastructure cost; no per-run vendor fee from Cinatra |

## What TeamAI is, in TeamAI's framing

TeamAI's pitch is *"A Collaborative Multi-LLM AI Platform"* — *"The Multi-LLM Platform to Power Your Team Projects."* The problem it names is a team scattered across separate AI subscriptions with no shared knowledge or workflow, and its answer is one workspace those needs converge into:

- **Multi-model chat** — access to models from OpenAI, Anthropic (Claude), Google (Gemini), Meta, and DeepSeek, switchable per conversation or workflow; the site says newly released models are added so workflows stay current.
- **Knowledge base** — *"Chat with thousands of documents. RAG with citations for accurate, verifiable information retrieval,"* organized into datastores.
- **Custom assistants / agents** — domain-specific assistants for functions like marketing, sales, and support, and *"custom AI agent workflows that streamline projects and automate your entire project lifecycle."*
- **Integrations** — native connections to Slack, Google Workspace, and Guru, plus a Jira integration the site describes as running over the Model Context Protocol (MCP) for project automation.
- **Prompt library and plugins** — a customizable library the site puts at 500+ pre-built prompts, plus custom plugins to extend the workspace, and a Chrome extension for browser access.
- **Usage reporting** — reporting on model and credit usage.

Pricing (teamai.com, USD, as of 2026-07-11) is billed by workspace rather than by seat, with an included monthly credit allotment and per-credit overage beyond it: **Individual** $5/month (single user, 500 included credits), **Starter** $25/month (up to 10 users, 5,000 credits, 10 datastores / assistants / plugins), **Professional** $149/month (up to 25 users, 20,000 credits, 25 datastores / assistants / plugins, up to 10 workflows), and **Enterprise** $849/month (up to 1,000 users across 10 workspaces, 200,000 credits, unlimited datastores / assistants / plugins / workflows, with SAML SSO and SCIM). Annual billing is stated to save 15%. The site positions workspace-based pricing as more cost-effective than per-seat team plans. As of 2026-07-11, TeamAI's public materials present a hosted SaaS offering; no self-hosted deployment option and no open-source license were identified in them.

## What Cinatra is

Cinatra is a self-hosted application platform. Every layer — the Next.js app, the WayFlow agent runtime, the LLM orchestration, the connectors, the registry, the durable execution layer (BullMQ (a Redis-backed job queue) + PostgreSQL), the object store, the audit trail — runs on infrastructure you control. Agents are declarative OAS Flow files committed to git; the same files run on any OAS-compliant runtime. Cinatra exposes its primitives as an MCP server so any MCP client (Claude Code, ChatGPT connectors, custom tooling) can drive it, speaks agent-to-agent (A2A) protocol so external agent platforms can call its agents and it can call theirs as local tools, and publishes typed lifecycle events over the Agent-User Interaction Protocol (AG-UI) plus declarative human-in-the-loop surfaces over the agent-to-UI (A2UI) protocol.

## Key Differences

### 1. Execution environment

- **TeamAI:** the vendor's cloud runs the workspace — chat, the knowledge base, custom assistants, and automated workflows all execute in TeamAI's infrastructure, reachable from a browser, the Chrome extension, and connected tools. As of 2026-07-11, no self-hosted deployment option was identified in TeamAI's public materials.
- **Cinatra:** BullMQ jobs on your own server; the WayFlow sidecar executes agents server-side. Runs survive page reloads, network drops, and process restarts, and continue while every laptop is closed.

### 2. Knowledge and memory

- **TeamAI:** a document knowledge base is a headline feature — upload documents into datastores and chat over them with RAG and citations for verifiable retrieval. This is a genuine, ready-to-use strength: a citing document-QA surface the vendor runs for you.
- **Cinatra:** memory is skills-as-memory — context captured into versioned `SKILL.md` files that persist across runs, including per-user custom skills consolidated from human-in-the-loop edits — plus durable run state, event streams, and an audited object graph in your own PostgreSQL and Redis, shadow-written into a knowledge-graph index for embedding-backed retrieval. It is retrieval over your typed object graph rather than a packaged upload-documents-and-cite product, so if a turnkey document knowledge base with citations is the requirement, that is TeamAI's shape.

### 3. Custom agents and multi-agent

- **TeamAI:** custom assistants are configured per domain and shared across the workspace, and automated workflows chain multiple steps; the documented model is assistants and workflows a team builds and reuses inside one workspace.
- **Cinatra:** an explicit orchestrator + sub-agent model. Orchestrators call other agents in-process via the A2A transport, with human-in-the-loop (HITL) gates that pause the parent flow until each sub-agent's review is approved; sub-agents can live on another Cinatra instance and be invoked over authenticated A2A.

### 4. Connectors and tools

- **TeamAI:** native integrations with Slack, Google Workspace, and Guru, a Jira integration the site describes as MCP-based, plus custom plugins and a prompt library — a curated set aimed at the tools a team already works in.
- **Cinatra:** a deliberate set of first-class connector extensions — Gmail, Google Calendar, Apollo, LinkedIn, WordPress, Drupal, Apify, YouTube, GitHub — routed through Nango (the OAuth gateway brokering connector credentials). Every connector is open code you can read, fork, and extend; new connectors are TypeScript packages you publish to your own registry.

### 5. LLM model access

- **TeamAI:** breadth is a headline — models from OpenAI, Anthropic, Google, Meta, and DeepSeek in one workspace, switchable per conversation or workflow, billed against workspace credits, with new models added by the vendor. For teams that want the widest managed model menu without operating it themselves, that breadth is a real advantage.
- **Cinatra:** multi-provider orchestration through `@cinatra-ai/llm` across OpenAI, Anthropic, and Gemini, calling your own provider keys from infrastructure you run — fewer providers than TeamAI's menu, but the calls, keys, and usage records stay in your environment.

### 6. UI / human-in-the-loop

- **TeamAI:** the primary interaction is collaborative chat and configured assistants over a shared workspace, with automated workflows running multi-step tasks; usage reporting gives visibility into model and credit usage.
- **Cinatra:** A2UI declarative HITL surfaces — setup forms before a run starts, mid-run review panels (recipient lists, draft emails, custom renderers) — published on a parallel Redis channel alongside the AG-UI lifecycle stream, with a shared approval queue and full run history visible to the team.

### 7. Hosting, data control, and audit

- **TeamAI:** hosted SaaS; the team's documents, chats, and workflows live in TeamAI's cloud, with access controls and, on the Enterprise plan, SAML SSO and SCIM. A hosted workspace is not the same as an absence of governance — it is a different operating model, where the vendor runs and secures the infrastructure.
- **Cinatra:** everything lives in your environment — run state, event streams, files, credentials (encrypted with your key), and an `audit_events` trail in your own Postgres, where your existing backup, retention, and SIEM pipelines apply. Retention and data location are whatever you configure in your deployment.

### 8. Open standards and portability

- **TeamAI:** the site describes its Jira integration as MCP-based, a genuine open-standards touchpoint; assistants, workflows, datastores, and prompts themselves live inside the workspace, and no portable format another runtime could load was identified in TeamAI's public materials as of 2026-07-11.
- **Cinatra:** agents are OAS Flow files any OAS-compliant runtime can load; A2A, AG-UI, and A2UI cover execution, lifecycle events, and HITL surfaces; extensions are versioned packages installable on any instance. Cinatra also exposes its own primitives over MCP, so external MCP clients can drive it directly.

### 9. Pricing model

- **TeamAI:** workspace-based (not per-seat) subscription plans from $5 to $849/month, each with an included monthly credit allotment and per-credit overage, annual billing saving 15% (USD, as of 2026-07-11) — a managed cloud where the vendor runs the compute.
- **Cinatra:** your infrastructure cost plus your LLM provider bills. No seats, credits, or storage tiers from Cinatra.

## Where They Overlap

The overlap is real. Both are **multi-provider** — several frontier LLMs behind one surface — and both let a team **standardize on shared assets** (TeamAI's custom assistants, prompt library, and datastores; Cinatra's skills, agents, and extensions) so individual usage compounds into team capability. Both run **multi-step automations** rather than one-shot chats. Both touch **MCP**: TeamAI describes its Jira integration as MCP-based, and Cinatra exposes its whole platform over MCP for external clients to drive. And both aim squarely at teams, not just individuals, with workspace-level sharing and reporting.

## When each makes sense

| Use case | Better fit |
|---|---|
| One managed workspace across many LLM providers (OpenAI, Anthropic, Google, Meta, DeepSeek) with nothing to self-host | **TeamAI** |
| A turnkey document knowledge base — upload files and chat over them with RAG and citations | **TeamAI** |
| A team that wants collaborative multi-model chat, a prompt library, and a Chrome extension out of the box | **TeamAI** |
| Workspace-based (not per-seat) subscription pricing with a managed vendor running the infrastructure | **TeamAI** |
| The widest managed model menu, switchable per conversation, kept current by the vendor | **TeamAI** |
| Self-hosting, full data control, or audit logs in your own database with your own retention | **Cinatra** |
| Open source code you can read, fork, and extend | **Cinatra** |
| Durable server-side agent runs that survive restarts and run while laptops are closed | **Cinatra** |
| LLM calls made on your own provider keys from infrastructure you operate | **Cinatra** |
| Orchestrator + sub-agent workflows with HITL gates, including across instances | **Cinatra** |
| Packaging and distributing your own agents, skills, and connectors as versioned extensions | **Cinatra** |
| Portable agents (OAS Flow files) not tied to one vendor's workspace | **Cinatra** |

## TL;DR

TeamAI bets that what a team needs is a managed multi-LLM workspace: chat across many models, a citing document knowledge base, custom assistants, a prompt library, and native integrations — all hosted, with workspace-based pricing and nothing to operate. Cinatra bets that teams ultimately want to *own* the agent layer: an open source, self-hosted platform with its own runtime, multi-provider LLM orchestration on your own keys, portable OAS agents, a cross-instance extension marketplace, declarative HITL surfaces, and an audit trail in your own database. If you want a ready-to-use collaborative AI workspace with broad managed model access and a turnkey knowledge base, TeamAI is the shape of tool to evaluate. If you want the agents, the data, and the extension surface to be yours — inspectable, portable, and self-hosted — that is what Cinatra is for.

## Notes on source

This comparison was assembled from TeamAI's public homepage and pricing pages at <https://teamai.com/> and <https://teamai.com/pricing/>, verified 2026-07-11. TeamAI's own descriptions (the multi-provider model list, the RAG-with-citations knowledge base, the integration set, the MCP-based Jira integration, the 500+-prompt library) are reported as the vendor states them, with pricing given in USD with its named plans, credit model, and billing basis as of the verification date. Where TeamAI's public materials publish no information — a self-hosted deployment option, an open-source license, a portable agent format — this page says so and qualifies it to the verification date rather than inferring a missing capability from silence. TeamAI's positioning changes; re-confirm each claim against the live site before relying on it.
