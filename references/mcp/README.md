# MCP Guide

Cinatra is built around the Model Context Protocol (MCP) in two ways at once:

1. **As an external server.** Every capability the platform offers — running agents, listing skills, reading objects, sending email — is exposed as an MCP primitive at `/api/mcp`. Any MCP-compliant client (Claude Code, ChatGPT connectors, automation scripts) can connect, authenticate, and call those primitives.

2. **As an internal architecture.** Inside the monorepo, packages talk to each other through the same MCP primitive contract instead of importing each other's internals. This is the platform's chosen alternative to a REST microservice mesh — same boundary discipline, no HTTP overhead.

This guide covers both. The external-server pages are how-to material for connecting from any MCP client; the internal-architecture pages document where Cinatra is today and where it is going.

---

## External server

- [The external MCP server](external-server.md) — what `/api/mcp` exposes, transport, primitive catalog overview
- [Authentication](authentication.md) — Better Auth (the auth server library Cinatra uses) OAuth-provider flow, bearer JWTs, local vs production
- [Connecting Claude Code](clients/claude-code.md) — `mcp-remote`, OAuth callback, local-dev flow
- [Connecting Claude Desktop](clients/claude-desktop.md) — custom remote connector, HTTPS `/api/mcp`, OAuth sign-in
- [Connecting Codex](clients/codex.md) — `codex mcp add --url` + `codex mcp login`, `~/.codex/config.toml`
- [Connecting ChatGPT connectors](clients/chatgpt-connectors.md) — connector setup, supported behavior
- [Testing assistants locally](clients/testing-assistants-locally-with-claude.md) — running through built-in chat surfaces with the same MCP server
- [Primitives](primitives.md) — naming, validation, actor context, capability categories
- [Agent runs over MCP](agent-runs-over-mcp.md) — start/poll/resume an agent run from any MCP client

## Internal architecture

- [Internal architecture](internal-architecture.md) — `McpRuntimeToolServer`, package primitive registration, deterministic in-process clients
- [Package boundaries](package-boundaries.md) — primitives as the package interface, why no direct cross-package imports
- [Migration roadmap](migration-roadmap.md) — current state, the microservices-via-MCP trajectory, what is not yet done

---

## Where to go next

- The runtime that hosts the primitives at the application layer: [Architecture](../platform/architecture.md)
- The open standards the MCP server speaks alongside MCP itself: [Open standards in Cinatra](../platform/open-standards.md)
- The configuration surface for the MCP server: [Configuration](../../guides/hosting/configuration.md)
