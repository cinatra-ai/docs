# Runwork vs. Cinatra

Runwork and Cinatra answer the same complaint — every person on the team uses AI alone, and nothing accumulates — with different architectures. Runwork is a cloud SaaS coordination layer that sits *across* the AI tools a team already uses (Claude, Cursor, and other Model Context Protocol (MCP)-compatible agents), giving them shared skills, automations, and adoption visibility. Cinatra is an open source, self-hosted platform that *runs the agents itself*, server-side, on infrastructure you control. One coordinates agents that live elsewhere; the other is the place the agents live.

## What They Are

| Dimension | Runwork | Cinatra |
|---|---|---|
| **Category** | Cloud SaaS "AI-native team workspace" — a coordination layer across multiple AI agents | Self-hosted full-stack agent platform |
| **Primary user** | Teams already using several AI tools without shared context; department leads who want adoption visibility; non-technical operators building team apps | Teams building, running, and operating their own AI agent workflows on their own infrastructure |
| **Agent runtime** | The team's existing agents (Claude/Claude Desktop and Cursor are concretely documented; any MCP-compatible tool can connect) plus Runwork's own cloud automations | WayFlow (Cinatra's Open Agent Specification (OAS) Flow agent runtime), a Python sidecar running on infrastructure you control |
| **Large language model (LLM) access** | Indirect — through whichever AI tools the team connects; platform credits cover AI usage in Runwork's own features | Multi-provider through `@cinatra-ai/llm` (OpenAI, Anthropic, Gemini) |
| **Authoring** | Reusable team Skills, multi-step automations, and natural-language ("vibe-code") full-stack team apps; a CLI with zero local dependencies | Agents authored as OAS Flow files (declarative JSON), or built conversationally inside the platform's chat assistant |
| **Hosting** | Vendor cloud only; no self-host option published | Self-hosted (Next.js + PostgreSQL + Redis + WayFlow sidecar) |
| **License** | Proprietary, hosted product | Open source (Apache 2.0) |
| **Pricing** | Flat workspace plans ($39–$979/month) with seat counts, storage, and a monthly platform-credit budget | Run the platform at your own infrastructure cost; no per-run vendor fee from Cinatra |

## What Runwork is, in Runwork's framing

Runwork's pitch is *"Make Your Team AI-Native."* The problem it names is scattered, uncoordinated per-person AI usage — each teammate prompting their own tool with no shared context — and its answer is a workspace layer those tools plug into:

- **Skills** — reusable prompts and workflows shared team-wide, auto-generated from each connected app's registered capabilities, and usable as slash commands by any connected agent.
- **Automations** — multi-step, with schedule/event/manual triggers, human-in-the-loop approvals, automatic retries, and durable scheduled jobs.
- **Team apps** — full-stack internal apps built in natural language, plus a CLI with "zero local dependencies"; the positioning is "operators as builders."
- **Adoption visibility** — team dashboards scoring setup, usage, building, and knowledge; weekly adoption digests; a desktop app that auto-detects which AI tools the team uses. Runwork frames adoption as a three-stage model: Talking → Acting → Making.

Integration breadth is a headline claim: "3,200+ integrations" (Slack, Stripe, HubSpot, Gmail, Airtable, GitHub, and more — Runwork does not document which integration provider supplies the catalog). MCP runs in both directions: built-in MCP servers expose the workspace to external agents, and an MCP client connects external MCP servers into it. The homepage lists Claude, Cursor, ChatGPT, Gemini, Windsurf, Cline, and VS Code as supported agents; the features page concretely documents Claude/Claude Desktop, Cursor, and "any MCP-compatible AI tool."

Pricing (as of June 2026) is flat per workspace: Solo $39/month (1 seat, 10 apps, $15 platform credits, 10 GB), Startup $79 (3 seats, unlimited apps, $30 credits, 50 GB), Growth $379 (15 seats, $150 credits, 200 GB, SSO + custom domain), Scale $979 (50 seats, $400 credits, 1 TB); extra seats are $29/month. The monthly credit budget covers AI usage and integration calls, with alerts at 75% and 90%. Governance features include role-based access control (Owner/Admin/Editor/Viewer), immutable audit logs with tiered retention (14 days to 1 year by plan), git-based versioning, and snapshot backups. The pricing page marks SOC 2 Type II as "(Soon)" on all tiers.

## What Cinatra is

Cinatra is a self-hosted application platform. Every layer — the Next.js app, the WayFlow agent runtime, the LLM orchestration, the connectors, the registry, the durable execution layer (BullMQ (a Redis-backed job queue) + PostgreSQL), the object store, the audit trail — runs on infrastructure you control. Agents are declarative OAS Flow files committed to git; the same files run on any OAS-compliant runtime. Cinatra exposes its primitives as an MCP server so any MCP client (Claude Code, ChatGPT connectors, custom tooling) can drive it, speaks agent-to-agent (A2A) protocol so external agent platforms can call its agents and it can call theirs as local tools, and publishes typed lifecycle events over the Agent-User Interaction Protocol (AG-UI) plus declarative human-in-the-loop surfaces over the agent-to-UI (A2UI) protocol.

## Key Differences

### 1. Execution environment

- **Runwork:** the vendor's cloud runs the workspace, skills, automations, and team apps; the heavyweight agent work happens inside the team's existing AI tools, wherever those run. Nothing executes on your infrastructure.
- **Cinatra:** BullMQ jobs on your own server; the WayFlow sidecar executes agents server-side. Runs survive page reloads, network drops, and process restarts, and continue while every laptop is closed.

### 2. Skills / tools

- **Runwork:** Skills are the core shared asset — reusable prompts/workflows, auto-generated from registered app capabilities, surfaced as slash commands inside any connected agent. Sharing is within the workspace.
- **Cinatra:** versioned `SKILL.md` files, auto-captured from usage when enabled, delivered as tools to any LLM call — and packaged as installable extensions that can be published to a registry and shared *across* Cinatra instances, not just within one workspace.

### 3. Multi-agent

- **Runwork:** coordination across heterogeneous third-party agents through shared workspace context and MCP; the documented model is many external agents sharing one workspace, not agents composing each other.
- **Cinatra:** explicit orchestrator + sub-agent model. Orchestrators call other agents in-process via the A2A transport, with human-in-the-loop (HITL) gates that pause the parent flow until each sub-agent's review is approved; sub-agents can live on another Cinatra instance and be invoked over authenticated A2A.

### 4. Connectors

- **Runwork:** "3,200+ integrations" (a vendor figure; the underlying provider is not documented), plus MCP in both directions — built-in MCP servers expose the workspace outward, and an MCP client pulls external MCP servers in.
- **Cinatra:** a smaller, deliberate set of first-class connector extensions — Gmail, Google Calendar, Apollo, LinkedIn, WordPress, Drupal, Apify, YouTube, GitHub — routed through Nango (the OAuth gateway brokering connector credentials). Every connector is open code you can read, fork, and extend; new connectors are TypeScript packages you publish to your own registry.

### 5. UI / human-in-the-loop

- **Runwork:** human-in-the-loop approvals inside automations, per the features page, alongside automatic retries; team dashboards and weekly digests cover adoption rather than run review.
- **Cinatra:** A2UI declarative HITL surfaces — setup forms before a run starts, mid-run review panels (recipient lists, draft emails, custom renderers) — published on a parallel Redis channel alongside the AG-UI lifecycle stream, with a shared approval queue and full run history visible to the team.

### 6. Memory

- **Runwork:** shared workspace context and knowledge (one of the four dimensions its team dashboards score), tiered storage from 10 GB to 1 TB, git-based versioning of workspace assets.
- **Cinatra:** skills-as-memory — context captured into versioned `SKILL.md` files that persist across runs, including per-user custom skills consolidated from HITL edits — plus durable run state, event streams, and an audited object graph in your own PostgreSQL and Redis.

### 7. Hosting, data control, and audit

- **Runwork:** vendor cloud only; no self-host or data-residency options are published. Governance is solid on paper for a SaaS — RBAC, immutable audit logs (retention 14 days to 1 year by tier), snapshot backups — and SOC 2 Type II is marked "(Soon)" on the pricing page rather than attained.
- **Cinatra:** everything lives in your environment — run state, event streams, files, credentials (encrypted with your key), and an `audit_events` trail in your own Postgres, where your existing backup, retention, and SIEM pipelines apply. Retention is whatever you configure, not a plan tier.

### 8. Relationship to the AI tools you already use

- **Runwork:** designed to sit across them — it does not replace Claude or Cursor, it gives them shared skills and context. Claude/Claude Desktop and Cursor are documented in depth; broader agent support runs through "any MCP-compatible AI tool."
- **Cinatra:** runs its own agents server-side, *and* is reachable from those same tools: Claude Code, Claude Desktop, Codex, and ChatGPT connectors can drive a Cinatra instance through its MCP server — listing agents, starting runs, resuming HITL gates. The difference is what is on the other end of MCP: a coordination workspace versus an agent platform with its own runtime.

### 9. Open standards and portability

- **Runwork:** MCP in both directions is a genuine open-standards commitment; skills and apps themselves live inside the workspace, with git-based versioning but no published portable format another runtime could load.
- **Cinatra:** agents are OAS Flow files any OAS-compliant runtime can load; A2A, AG-UI, and A2UI cover execution, lifecycle events, and HITL surfaces; extensions are versioned packages installable on any instance.

### 10. Pricing model

- **Runwork:** flat workspace plans from $39 to $979/month with seat counts, storage tiers, and a monthly credit budget covering AI usage and integration calls.
- **Cinatra:** your infrastructure cost plus your LLM provider bills. No seats, credits, or storage tiers from Cinatra.

## Where They Overlap

The overlap is real and larger than with most products in this comparisons set: both treat **shared, reusable skills** as the unit that turns individual AI usage into team capability; both run **multi-step automations** with schedules, triggers, approvals, and retries; both use **MCP** as the interoperability fabric; both give teams **shared visibility** (Runwork's adoption dashboards; Cinatra's shared runs, dashboards, and approval queues); and both court non-developers as builders (Runwork's natural-language team apps; Cinatra's conversational agent authoring). Because both speak MCP, they are not mutually exclusive: a Runwork-coordinated agent like Claude Desktop can drive a Cinatra instance through Cinatra's MCP server.

## When each makes sense

| Use case | Better fit |
|---|---|
| Team is already deep in Claude/Cursor and wants shared skills and context without hosting anything | **Runwork** |
| Measuring and driving AI adoption across a department (dashboards, digests, tool detection) | **Runwork** |
| Non-technical operators building internal team apps in natural language | **Runwork** |
| Flat, predictable per-workspace pricing with a managed vendor | **Runwork** |
| Very broad catalog-style integration coverage out of the box | **Runwork** |
| Self-hosting, full data control, or audit logs in your own database with your own retention | **Cinatra** |
| Open source code you can read, fork, and extend | **Cinatra** |
| Durable server-side agent runs that survive restarts and run while laptops are closed | **Cinatra** |
| Multi-provider LLM stack (OpenAI + Anthropic + Gemini) behind one orchestration layer | **Cinatra** |
| Orchestrator + sub-agent workflows with HITL gates, including across instances | **Cinatra** |
| Packaging and distributing your own agents, skills, and connectors as versioned extensions | **Cinatra** |
| Portable agents (OAS Flow files) not tied to one vendor's workspace | **Cinatra** |

## TL;DR

Runwork bets that the agents your team already uses are fine — what is missing is the layer that coordinates them: shared skills, automations, team apps, and adoption metrics, delivered as a managed cloud workspace with MCP running in both directions. Cinatra bets that teams ultimately want to *own* the agent layer: an open source, self-hosted platform with its own runtime, multi-provider LLM orchestration, portable OAS agents, a cross-instance extension marketplace, declarative HITL surfaces, and an audit trail in your own database. If your team's AI life happens inside Claude and Cursor and you want it coordinated without operating anything, Runwork is the shape of tool to evaluate. If you want the agents, the data, and the extension surface to be yours — inspectable, portable, and self-hosted — that is what Cinatra is for. Thanks to MCP, the two can even meet in the middle.

## Notes on source

This comparison was assembled from Runwork's public homepage, features, and pricing pages at <https://www.runwork.ai/>. Vendor-supplied figures ("3,200+ integrations", the homepage's agent list) are reported as claims, and where the features page is more specific than the homepage (concretely documented agents: Claude/Claude Desktop, Cursor, and any MCP-compatible tool), this page follows the features page. Where Runwork publishes no information (self-hosting, data residency, the integration provider behind the catalog), this page says so rather than guessing. Pricing and plan details reflect June 2026.
