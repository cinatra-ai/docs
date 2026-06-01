# Claude Managed Agents vs. Cinatra

This page compares Cinatra with Anthropic's developer-facing **Managed Agents** API. For Anthropic's end-user desktop product, see [Claude Cowork vs Cinatra](claude-cowork-vs-cinatra.md) — the two Anthropic products are distinct, and people sometimes file them in the same drawer.

## What They Are

| Dimension | Claude Managed Agents | Cinatra |
|---|---|---|
| **Category** | Managed API infrastructure (Anthropic-hosted) | Self-hosted agent platform / Model Context Protocol (MCP) application framework |
| **Primary user** | Developers building products on Claude | Teams using AI collaboratively via a browser UI |
| **Model lock-in** | Claude only | OpenAI, Anthropic, Gemini — provider-agnostic |
| **Hosting** | Anthropic's cloud | Your own infrastructure (PostgreSQL + Redis + Node.js) |

## Architecture

**Claude Managed Agents** provides the *execution harness*: you define an agent (model + system prompt + tools + MCP servers), spin up a sandboxed container (the "environment"), then create sessions and exchange events via server-sent events (SSE). Anthropic manages everything — containers, file systems, tool execution, conversation history.

**Cinatra** is an *application platform*: every capability (scraping, email outreach, enrichment, research, blog publishing) is a self-contained extension that exposes its actions as MCP primitives. The MCP server is Cinatra itself. Agents compose by calling each other's primitives in-process. BullMQ (a Redis-backed job queue) handles background execution; the browser UI drives everything.

## Key Differences

### 1. Execution environment

- **Managed Agents:** Anthropic-sandboxed containers with bash, file ops, web fetch built-in
- **Cinatra:** your server runs the jobs; no sandboxing, but full control over infrastructure

### 2. Skills / tools

- **Managed Agents:** built-in tools (bash, file ops, web search, MCP), skills in research preview
- **Cinatra:** skill system is central — `SKILL.md` files, versioned, auto-captured from usage, delivered as tools to any large language model (LLM)

### 3. Multi-agent

- **Managed Agents:** multi-agent in research preview (request access required)
- **Cinatra:** already composable — every extension is an MCP server, agents call each other in-process today

### 4. Connectors

- **Managed Agents:** MCP servers you bring yourself
- **Cinatra:** first-class connectors for Gmail, Google Calendar, Apollo, LinkedIn, WordPress, Drupal, Apify, YouTube, GitHub — wired with OAuth/Nango (the OAuth gateway brokering connector credentials) out of the box

### 5. UI / human-in-the-loop

- **Managed Agents:** no built-in UI — you build your own; human-in-the-loop (HITL) via event API
- **Cinatra:** full admin UI with per-agent screens, chat assistant, review workflows, background job dashboard

### 6. Memory

- **Managed Agents:** memory in research preview
- **Cinatra:** skills-as-memory pattern — context captured into `SKILL.md` files that persist across runs

## When each makes sense

| Use case | Better fit |
|---|---|
| Building a product on Claude, want Anthropic to run infra | **Managed Agents** |
| Need bash / code execution in a secure sandbox | **Managed Agents** |
| Multi-provider LLM support | **Cinatra** |
| Domain-specific workflows (outreach, blog, enrichment) with a UI | **Cinatra** |
| Self-hosting, full data control | **Cinatra** |
| Quick API integration without standing up infrastructure | **Managed Agents** |
| Composing many specialized agents that share the same MCP bus | **Cinatra** |

## TL;DR

Managed Agents is Anthropic's answer to "run Claude autonomously without building infra" — it's a developer API with managed containers. Cinatra is a full-stack platform that *uses* Claude (among other models) as the intelligence layer, but provides the product layer on top: connectors, workflows, a UI, a skills catalog, and an MCP server that any external client can connect to.

They're complementary more than competitive — Cinatra could theoretically use a Managed Agents session as one of its execution backends for sandboxed tasks, while Managed Agents has no equivalent to Cinatra's domain workflows, connector ecosystem, or admin UI.
