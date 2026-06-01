# Workspace Features

A guided tour of what you find in the Cinatra sidebar and the administration area, with links into the deeper docs for each surface.

If you are arriving here from the README, this page is the map. If you are looking for the developer reference, start at [Concepts and glossary](concepts.md).

---

## Sidebar

### Chat

`/chat` is the conversational surface. It is also where most agents are created, run, edited, and managed. The chat assistant follows a discovery-first authoring loop — it looks for an existing agent before offering to write a new one, and asks for explicit confirmation before any write or publish. See [Creating agents in chat](creating-agents-in-chat.md).

Multi-threaded chats with team chats are supported; built-in handles include `@chatgpt` today.

### Agents

The Agents sidebar item routes to `/agents`, now an interactive dashboard of recently used and recently run agents. The dashboard is the single installed-agents surface (the previous standalone listing and its "Status" affordance were retired). **Agent Setup** is a sibling sidebar entry that opens the chat-driven authoring flow. See [Dashboards](dashboards.md) for the dashboard side and [Creating agents in chat](creating-agents-in-chat.md) for the authoring side.

### Information

- **Data** — the unified object list with typed views for assets, accounts, contacts, and any registered object type. Browse, filter, drill into individual records.
- **Metrics** — operating visibility, cost tracking, provider usage. See [Configuration](../hosting/configuration.md) for what the underlying metrics surface tracks.

### Tools

- **Skills** — the skill catalog, installed skill extensions, and the match overview that shows which skills apply to which agents. When **skill autosave** is enabled by an admin, your prompt edits inside agent human-in-the-loop (HITL) surfaces are captured automatically at run completion and turned into custom skills that prime the next run. See [Continuous learning and custom skills](continuous-learning.md).
- **Connectors** — third-party service connections (Gmail, Google Calendar, Apollo, LinkedIn, WordPress, Drupal, Apify, YouTube, GitHub) wired through Nango (the OAuth gateway brokering connector credentials). Each connector exposes its operations as Model Context Protocol (MCP) primitives that agents can call.

---

## Other top-level surfaces (not in the sidebar)

A few features ship as routes you reach directly or through the chat assistant, even though they don't have a dedicated sidebar slot:

- **Dashboards** at `/agents` (the default dashboard) and additional dashboards under their own routes. See [Dashboards](dashboards.md).
- **Lists** are typed groupings agents read from and write to as first-class inputs and outputs. Lists are themselves typed objects (`@cinatra-ai/lists:list`); the canonical record lives in Twenty CRM (no cinatra-side browse) and is reached programmatically through the `crm_list_*` MCP primitives (`crm_list_search`, `crm_list_get`, `crm_list_create`, `crm_list_member_add`, `crm_list_member_remove`, `crm_list_members_get`).
- **Notifications** at `/notifications`. A Postgres-backed feed surfaced with realtime push via Postgres `LISTEN / NOTIFY`. The platform writes notifications on background-job completion or failure, on long-running agent run state transitions, and from extensions through the explicit `createNotificationForRecipient` API. Recipient routing covers per-user, per-team, per-organisation, per-project, and an admins-only sink for system failures. Toasts handle transient in-page feedback; the notifications feed is durable.

---

## Administration

The **Administration** area at `/configuration/*` is the platform-settings surface. Most screens are admin-only.

### LLM (`/configuration/llm`)

Provider configuration for OpenAI, Anthropic, and Google Gemini. Keys are stored encrypted under the platform's encryption key. See [Configuration](../hosting/configuration.md).

### MCP (`/configuration/mcp`)

The Cinatra MCP server's shared configuration: auth, discovery, and OAuth-client management for external clients (Claude Code, ChatGPT connectors, custom agents).

### Marketplace (`/configuration/marketplace`)

Discover and install extensions from your connected registries. Public extensions are visible to every Cinatra instance; private extensions are filtered server-side to the publishing instance's vendor scope. See [Marketplace](../configuration/marketplace.md).

### Extensions (`/configuration/extensions`)

The active / archived catalog of every extension installed in this instance, with the lifecycle controls (archive, restore, force-delete, promote to public) and the GitHub-release skill upload entry at `/configuration/extensions/upload`. See [Marketplace](../configuration/marketplace.md) for the install flows and [Extensions](../developer/extensions.md) for the engineering shape.

### Permissions (`/configuration/permissions`)

Platform roles, organisation membership, and the generic Extension Permissions surface used across all four extension kinds (agents, skill extensions, dashboards, dashboard cubes). Skill extensions additionally support per-skill overrides. See [Security](../developer/security.md).

### Skills (`/configuration/skills`)

Skill catalog administration plus the **skill autosave** controls that govern continuous learning. Three knobs: master `enabled`, `userCanConfigure` for per-field opt-out, `userCanSeeIndicator` for the autosave indicator on HITL surfaces. See [Continuous learning and custom skills](continuous-learning.md).

### Environment (`/configuration/environment`)

Per-instance environment knobs and the canonical registry-configuration surface. The **Registries** tab (`?tab=registries`) is where you submit the registry-connection request, see its pending/connected status, and (post-approval) verify the credential round-trip. Runtime mode and instance identity live in adjacent tabs of the same page.

### Assistants (`/configuration/assistants`)

Configuration for built-in chat assistants (`@chatgpt`) — credentials, model selection, persona, default tool catalogs.

### Instance (`/configuration/instance`)

Instance identity: display name and namespace. The namespace is the npm scope under which this instance publishes its extensions and the basis for the server-side visibility filter.

### Telemetry (`/configuration/telemetry`)

Per-instance telemetry settings — what gets emitted to OpenTelemetry (vendor-neutral tracing), what gets shipped to the Sentry-compatible error backend if a data source name (DSN) is configured. See [Configuration](../hosting/configuration.md) for the DSN-gated error reporting layer.

### Workspace (`/configuration/workspace`)

Better Auth (the auth server library Cinatra uses) organisation management — members, roles, invitations. The route is named "workspace" historically; the underlying entity is the Organisation ownership level.

### Apps (`/configuration/apps`)

App-specific integrations that don't fit a generic connector pattern (Apollo people-search, Gmail aliases, OpenAI Codex). These are visible separately from the user-facing **Connectors** sidebar group because they configure platform-level capabilities, not per-user OAuth flows.

### a2a (`/configuration/a2a`)

agent-to-agent (A2A) protocol dev-peer registration and the outbound A2A endpoint catalog — used during development to wire up sample external A2A agents, and in long-lived deployments to inspect the configured A2A peer set.

---

## Where to go next

- The platform vocabulary: [Concepts and glossary](concepts.md)
- The open protocols every sidebar surface speaks: [Open standards in Cinatra](../developer/open-standards.md)
- The architecture behind the sidebar: [Architecture](../developer/architecture.md)
