# Admin Guide

This guide is for platform administrators — the people working inside `/configuration/*` on a running Cinatra instance. Admins configure large language model (LLM) providers, manage the marketplace and extensions, grant and revoke permissions, watch telemetry, and tune instance-wide settings.

If you are an end user, see the [User Guide](../user/README.md). If you install or operate Cinatra, see the [Hosting Guide](../hosting/README.md). If you work on the code, see the [Developer Guide](../developer/README.md). For the Model Context Protocol (MCP) server, see the [MCP Guide](../../references/mcp/README.md).

---

## The /configuration area

The administration surface at `/configuration` groups the platform-level controls into clearly scoped pages. Most are admin-only by default.

- **LLM providers** — configure provider credentials and per-provider model selection. Provider routing is centralised in the orchestration layer, so a provider change applies to every agent.
- **MCP** — settings for the external MCP server: tool exposure, OAuth client registration, server-level options.
- **Assistants** — chat-assistant configuration: system prompts, tooling defaults, the function-tool list for built-in chat.
- **Marketplace** — see [Marketplace](marketplace.md) for the full reference. Install extensions of all five kinds — agents, connectors, skills, artifacts, and workflows — from the shared registry, archive or restore them, promote private extensions to public.
- **Extensions** — the installed-extensions lifecycle: install, archive, restore, force-delete, plus GitHub-URL skill upload. See the [Extensions reference](../../references/platform/extensions.md) for protocol-level details on installation and origin tracking.
- **Permissions** — the generic co-owner / access-policy model for agents, agent runs, connectors, skills, skill extensions, artifacts, and workflows. Invite members, change roles, manage per-resource grants.
- **Network** — registry connections and agent-to-agent (A2A) protocol peer URLs for cross-instance collaboration.
- **Environment** — per-instance environment knobs surfaced through the UI. The **Registries** tab is where you submit a registry-connection request, see its status, and verify the credential round-trip. Adjacent tabs cover runtime mode and instance identity.
- **Telemetry** — cost and usage rollups by agent and by provider. The same data feeds the metrics dashboard.
- **Instance** — instance-level identity: the namespace under which this instance publishes packages, the canonical origin, the trusted-origin list.
- **Workspace** — the organisation/team management surface of Better Auth (the auth server library Cinatra uses) (note: the URL says "workspace" but the underlying entity is the **Organization** ownership level).

## Common admin tasks

- [Setup and first run](setup-and-first-run.md) — what to configure when you first take ownership of an instance
- [Managing the marketplace](marketplace.md) — install, update, archive, restore; private vs public; promotion to public
- [Permissions](permissions.md) — roles, capability grants, per-resource access, and the admin tier
- [LLM providers](llm-providers.md) — provider credentials, per-provider model selection, and how routing applies platform-wide
- [Cost and usage](cost-and-usage.md) — per-provider, per-agent, and per-skill spend, plus budgets
- [Telemetry and logging](telemetry-and-logging.md) — what the instance records, where to watch it, and audit trails
- [The Cinatra Drupal module](drupal-module.md) — install, connect, the `use Cinatra assistant` permission, the local-widget / server-side token delivery model, and uninstall
- The skills system behind `/configuration/skills`: [Skills lifecycle](../../references/platform/skills-lifecycle.md) (states, revisions, rollback semantics) and [Skill matching](../../references/platform/skill-matching.md) (the matches tab, batch re-evaluation, trust thresholds); the background maintenance jobs are operator-enabled — see the [Hosting Guide → Skills maintenance](../hosting/skills-maintenance.md)
- The [Hosting Guide → Configuration](../hosting/configuration.md) page documents the environment variables behind the in-app settings; admins sometimes need to coordinate with whoever operates the deployment

## How admin actions are audited

Every install, update, archive, restore, force-delete, and promotion is recorded in the audit log with actor, resource, action, and time. See [Security](../../references/platform/security.md) for the full audit-trail model.

## Permissions and the admin role

The Better Auth `admin` plugin grants the platform-level admin role. The first user to register on a fresh deployment becomes admin automatically; subsequent admin grants are issued through `/configuration/permissions`. The admin role is global to the instance — it gates the `/configuration/*` surface and the admin-only MCP primitives.

Per-resource permissions (co-owners on individual agents, dashboards, skill extensions) are independent from the admin role. An admin can override per-resource permissions; a non-admin co-owner cannot.

---

## Where to go next

- The capability surface admins govern: [A connected ecosystem of capabilities](../user/connected-ecosystem.md)
- The platform's authorization model: [Security](../../references/platform/security.md)
- The MCP primitives that map to admin actions: [Primitives](../../references/mcp/primitives.md)
