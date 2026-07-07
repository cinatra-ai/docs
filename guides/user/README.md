# User Guide

Cinatra is the open source AI workspace for teams — a workspace where people, AI assistants, and autonomous agents work together on durable workflows. This guide is for the people *using* the workspace day to day: starting agents in chat, reviewing their work at human-in-the-loop (HITL) gates, watching durable runs, browsing the marketplace, collaborating across team and instance boundaries.

If you administer the `/configuration/*` area, see the [Admin Guide](../admin/README.md). If you install or operate Cinatra, see the [Hosting Guide](../hosting/README.md). If you write agents or contribute to the platform, see the [Developer Guide](../developer/README.md) — contribution work is planned with GSD ("Git. Ship. Done", the open-gsd spec-driven development framework). If you build against the Model Context Protocol (MCP) server, see the [MCP Guide](../../references/mcp/README.md). <!-- source-leak-allow -->

---

## Concepts

- [Concepts and glossary](../../references/glossary.md) — agents, assistants, skills, extensions, objects, lists, projects, teams, organisations
- [Workspace features](workspace-features.md) — a guided tour of the sidebar and the user-facing surfaces

## Core capabilities

- [The built-in AI assistant](built-in-ai-assistant.md) — app-wide awareness, run agents, build workflows and dashboards, @-mention multiple assistants in a shared thread
- [A connected ecosystem of capabilities](connected-ecosystem.md) — how agents, connectors, skills, objects, lists, and dashboards compose
- [Projects and ownership](projects-and-ownership.md) — projects that bound context, and the user / team / organization / workspace ownership levels
- [Connections: scopes, sharing, and revocation](connections-and-sharing.md) — the six connection scopes, what sharing a connection means (others act via your account), use-time auditing, and taking access back
- [Human-in-the-loop by design](human-in-the-loop.md) — pause for review, edit, approve, resume
- [Continuous learning and custom skills](continuous-learning.md) — prompt edits become reusable skills
- [Cross-instance collaboration](cross-instance-collaboration.md) — share agents, skills, and run-time calls between Cinatra instances
- [Durable workflows](durable-workflows.md) — runs survive reloads, drops, and restarts; notifications when they land
- [Undo and history](undo-and-history.md) — review past versions of your work and roll back changes
- [Notifications](notifications.md) — the bell, the feed, and what gets surfaced when long work finishes

## Outputs and data

- [Artifacts and files](artifacts-and-files.md) — the files agents produce, attach, and hand back to you
- [Data and objects](data-and-objects.md) — the structured records agents read and write, and where they live
- [Twenty CRM integration](twenty-crm-integration.md) — connect accounts, contacts, and companies through the Twenty CRM connector

## Day-to-day

- [Release workflows](release-workflows.md) — plan a multi-week, calendar-driven process in chat; manage it on the workflow detail page; approvals, lifecycle, and mid-flight editing
- [PM-tool integration](pm-tool-integration.md) — mirror agent-run schedules into a project-management tool (Plane) so they appear on its board and timeline, and connect the Plane connector
- [Creating agents in chat](creating-agents-in-chat.md) — author and publish an agent through the chat assistant
- [Marketplace and extensions](marketplace-and-extensions.md) — find, install, and use the extensions that add new agents, connectors, skills, and workflows
- [Dashboards](dashboards.md) — the dashboards platform and the `/agents/executions` dashboard
- [Cinatra in your CMS](cinatra-in-your-cms.md) — the in-CMS AI assistant for WordPress and Drupal editors
- [The Cinatra WordPress plugin](wordpress-plugin.md) — install, connect, and use the WordPress admin assistant, and how it is delivered safely
- [Use Cinatra from Claude Desktop and Codex](mcp-clients.md) — connect Claude Desktop, Codex, Claude.ai, or ChatGPT to your workspace over MCP

---

## Where to go next

- The capability story for the curious: [Why Cinatra](../../resources/why-cinatra.md)
- The hands-on first run: [Quickstart](../hosting/quickstart.md) in the Hosting Guide
