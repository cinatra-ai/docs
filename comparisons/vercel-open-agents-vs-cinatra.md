# Vercel Open Agents vs. Cinatra

## What They Are

| Dimension | Vercel Open Agents | Cinatra |
|---|---|---|
| **Category** | Open source reference app for coding agents | Self-hosted multi-agent business automation platform |
| **Primary user** | Developers building / running coding agents on Vercel | Teams automating business workflows via a browser UI |
| **Agent types** | One (coding / repo work) | Many — email outreach, blog publishing, CRM enrichment, content review, web research, and any extension-defined custom agents |
| **Hosting** | Vercel-native (Workflow + Sandbox) | Your own infrastructure (PostgreSQL + Redis + Node.js) |
| **Platform lock-in** | Vercel Workflow SDK + Vercel Sandbox | None — runs on any Postgres + Redis stack |

## Architecture

**Vercel Open Agents** uses a three-layer design: a Next.js web layer handles auth and chat UI; a durable Vercel Workflow runs the agent logic outside the sandbox for independent scaling; an isolated Sandbox VM provides filesystem, shell, and git execution. Snapshot-based hibernation lets sandboxes pause and resume without losing execution context.

**Cinatra** is an extension platform: every capability (email outreach, blog publishing, CRM, data connectors) is packaged as an extension exposing its actions as Model Context Protocol (MCP) primitives. The MCP server is Cinatra itself. Agents compose by calling each other's primitives in-process via deterministic clients. BullMQ (a Redis-backed job queue) handles background execution; agent-to-agent (A2A) protocol in-process transport coordinates multi-agent workflows.

## Key Differences

### 1. Agent scope

- **Open Agents:** one coding agent — file manipulation, shell execution, git, branch management, auto-commit + PR creation
- **Cinatra:** registry of heterogeneous agent types with independent data models, execution engines, and result surfaces

### 2. Execution environment

- **Open Agents:** Vercel Sandbox VM with snapshot-based hibernation; agent logic runs outside the sandbox for independent scaling
- **Cinatra:** BullMQ jobs on your own server; no VM sandbox, but full control over infrastructure; no additional service required

### 3. Platform dependency

- **Open Agents:** Vercel Workflow SDK + Vercel Sandbox — requires Vercel; not self-hostable on arbitrary infrastructure
- **Cinatra:** runs on any Node.js + PostgreSQL + Redis stack; no platform vendor

### 4. LLM access

- **Open Agents:** model-flexible (provider unspecified in the reference implementation)
- **Cinatra:** centralized `llm-orchestration` layer covering OpenAI, Anthropic, Gemini with native MCP tool injection on every call; provider-agnostic routing via `generate/Stream`

### 5. Multi-agent

- **Open Agents:** single agent per session; no inter-agent composition model
- **Cinatra:** agents compose via the in-process A2A transport, with orchestrator agents that coordinate sub-agents across federated workspaces

### 6. Business features

- **Open Agents:** none — it is a coding tool
- **Cinatra:** CRM (accounts, contacts, campaigns), email outreach with cadences, connectors for Gmail / Google Calendar / Apollo / LinkedIn / WordPress / Drupal / Apify / YouTube / GitHub, blog pipeline, metrics and cost tracking

### 7. Human-in-the-loop

- **Open Agents:** read-only session sharing, voice input via ElevenLabs
- **Cinatra:** human-in-the-loop (HITL) at invocation time with interrupt/resume via the Agent-User Interaction Protocol (AG-UI); per-agent configuration workspaces

### 8. Skills / memory

- **Open Agents:** no skills system; no persistent memory beyond git history
- **Cinatra:** central skills catalog — versioned `SKILL.md` files captured from usage, delivered as tools to any large language model (LLM) call

## When each makes sense

| Use case | Better fit |
|---|---|
| Autonomous coding assistant operating on git repos | **Open Agents** |
| Need Vercel-managed sandbox execution with snapshot hibernation | **Open Agents** |
| Auto-commit and PR creation out of the box | **Open Agents** |
| Multi-provider LLM support | **Cinatra** |
| Domain workflows (outreach, enrichment, blog, research) with a UI | **Cinatra** |
| Self-hosting on arbitrary infrastructure | **Cinatra** |
| Composing many specialized agents over a shared MCP bus | **Cinatra** |
| CRM + connector ecosystem (Gmail, Google Calendar, Apollo, LinkedIn, WordPress, Drupal, Apify, YouTube, GitHub) | **Cinatra** |
| Cost tracking and budget alerts across providers | **Cinatra** |

## TL;DR

Vercel Open Agents is a focused, well-scoped reference implementation for one thing: running a coding agent on Vercel infrastructure. It is a strong starting point if you want to deploy a git-aware coding assistant without building the scaffolding yourself — but it is Vercel-native and covers a single agent type.

Cinatra is a different category: a multi-agent business automation platform that uses several LLM providers as its intelligence layer while providing the product layer on top — connectors, domain workflows, a skills catalog, an MCP server, and a full admin UI. They do not compete directly. The coding-agent pattern from Open Agents (durable workflow + sandbox VM) would map cleanly onto a future Cinatra agent type if sandboxed code execution becomes a requirement.
