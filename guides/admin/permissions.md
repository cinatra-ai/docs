# Permissions

This page is for administrators governing who can do what on a running Cinatra instance. It covers the admin role, the co-owner and access-policy model for shared resources, per-skill overrides, the four ownership tiers, and the common grant / revoke / transfer / audit workflows.

For the implementation model behind these controls, see [Authorization admin powers](../../references/platform/authz-admin-powers.md) and [Security](../../references/platform/security.md).

Back to the [Admin Guide](README.md).

---

## Two layers of permission

Cinatra separates platform governance from per-resource sharing. They are independent levers, and you control both from `/configuration/permissions`.

- **The admin role** is global to the instance. It gates the `/configuration/*` surface and the admin-only capabilities. An admin governs the platform; they do not silently own everyone's data.
- **Per-resource permissions** (co-owners and access policies on individual agents, agent runs, connectors, connections, skills, skill packages, artifacts, and workflows) decide who can see, run, and share a specific resource. These apply to every user, admin or not.

An admin can step in on per-resource matters when intervention is legitimate (moderation, a data-protection request, an ownership transfer after a team change), but that path is named and audited rather than a silent override. See [Authorization admin powers](../../references/platform/authz-admin-powers.md) for the audited-bypass model.

---

## Roles

The permissions matrix at `/configuration/permissions` displays each role and the rights it carries across categories — agents, data, projects, teams, organizations, skills, connectors, registry, and administration. The human-readable roles shown are:

| Role | What it is |
|---|---|
| **Platform admin** | Instance-wide governance: configuration, registry management, audit, telemetry. Read and list across domains, plus full registry install / update / uninstall. Not a blanket write key over user data. |
| **Org owner** | Owns an organization. Full management of that organization, its teams, and resources owned at the organization level. |
| **Org admin** | Administers an organization without owning it. Manages members and organization-level resources. |
| **Team admin** | Administers a team and the resources that team owns. |
| **Member** | A regular signed-in user. Works with the resources they own or have been granted, and the resources shared at their team / organization. |

Platform admin is a governance role, not the union of every permission. Mutation-heavy rights on user data (canceling, sharing, editing run output; creating and deleting skills and data) are held by the org-scoped roles, not by platform admin directly. This keeps platform governance distinct from org-scoped write authority. When an admin genuinely must act on a specific user's data, that goes through the audited intervention path rather than a standing grant.

### How the first user becomes admin

The first user to register on a fresh deployment becomes the platform admin automatically and the owner of the default organization. Every subsequent sign-up is a regular member. Additional admin grants are issued from `/configuration/permissions`. The admin role gates the whole `/configuration/*` surface and the admin-only capabilities, so treat the first-registration step as a deliberate operator action — see [Setup and first run](setup-and-first-run.md).

---

## The four ownership tiers

Every shared resource — agents, runs, skills, skill packages, data, projects — is owned at exactly one of four nesting levels:

```
User  ->  Team  ->  Organization  ->  Workspace
```

These are visibility scopes that widen as you go up. A resource owned at **Team** is visible to that team; owned at **Organization**, to the whole organization; owned at **Workspace**, to everyone on the instance. A resource owned at **User** is private to that user unless they share it.

When you make a grant, you are choosing both *who* (a specific user, or a level) and *what* they may do. Choosing a wider level is the lever for broad access; choosing a co-owner or a specific user is the lever for targeted access. A workspace-level resource is open to every workspace user by design — pick it deliberately.

> The product-voice **workspace** (the Cinatra application) is a different thing from the **Workspace ownership tier** here and from the `/configuration/workspace` route (which manages the Organization). This page always means the ownership tier when it writes "Workspace."

---

## Co-owners and access policies

Beyond ownership, Cinatra ships one generic sharing model that applies uniformly across the eight access resource kinds — agents, agent runs, connectors, connections, skills, skill packages, artifacts, and workflows:

| Kind | What it covers |
|---|---|
| **Agent** (agent template) | An installed agent. Governs who can view it, run it, edit it, and share it. |
| **Agent run** | An individual run record. Inherits the agent's policy, with per-run overrides. |
| **Connector** | An installed connector. Governs who can view and use it. |
| **Connection** | An individual connected external account inside a connector. Owned by its creator; the policy governs who may **use** it (act through the owner's account). Widening a connection's scope is reserved to its owner. See [Connector connections](#connector-connections-owner-bound-scoped-audited) below. |
| **Skill** | An individual skill inside a package, with its own override that can be tighter or wider than the parent package. |
| **Skill package** | An installed skill extension as a whole bundle. |
| **Artifact** | An installed artifact extension. |
| **Workflow** | An installed workflow extension. |

Two controls sit on top of every one of these:

- **Co-owner** — a direct grant naming a specific user. A co-owner can edit and share the resource without being an organization admin. It is a yes/no grant: someone is a co-owner or they are not.
- **Access policy** — the per-operation rules for everyone outside the co-owner set. The same policy shape applies to all eight kinds and controls the operations below.

### The operations a policy governs

Across agents, agent runs, connectors, connections, skills, skill packages, artifacts, and workflows, the access policy decides who can:

- **List** the resource (does it appear in their listings)
- **Read** it (view its detail, including run data and messages for runs)
- **Use / execute** it (run an agent, apply a skill)
- **Share** it (extend access to others)
- **Manage** it (edit it, and — for agents — manage its permissions)

For agent runs specifically, the policy also governs who can approve and respond to mid-run review checkpoints, resume a run, and edit run output. The same checks apply everywhere the resource can be reached — the in-app UI, the background worker, the MCP server, and agent-to-agent calls — so there is no surface that quietly skips them.

### Per-skill overrides

A skill package carries a default policy for everything inside it. Any individual skill can override that default, in either direction:

- **Tighter** — a sensitive skill inside an otherwise broadly shared package can be restricted to specific users or a narrower level.
- **Wider** — a generally useful skill inside a more restricted package can be opened up without opening the whole package.

Set the package policy first to establish the baseline, then adjust individual skills only where they need to differ. This keeps the common case simple and reserves overrides for genuine exceptions.

### Connector connections: owner-bound, scoped, audited

A **connection** — one linked external account inside a connector (a specific Gmail mailbox, a specific GitHub account) — is a first-class access resource with three properties admins should understand:

- **Owner-bound.** A connection is permanently owned by the user who created it. Sharing never transfers the credential; it lets other users' agents **act through the owner's account** (a shared Gmail sends as the owner). Because of that, consent is the owner's alone: **only the owner widens a connection's scope** — the generic co-owner lever does not extend to sharing someone else's connection, and admins do not widen connections on an owner's behalf. The full user-facing model — the six scopes, the connect-time recommendation, sharing, use-time auditing, and revocation — is in [Connections: scopes, sharing, and revocation](../user/connections-and-sharing.md).
- **Scoped by the connector's declaration.** Each connector declares in its package how its connections may be scoped: a **recommended** scope that is pre-selected at connect time (the owner can freely change it, and it never auto-shares), or an **exclusive** scope that is locked in the picker *and* enforced by the server, which rejects any broader grant. The authoring contract is [`cinatra/config.json`](../../references/platform/extension-kinds/authoring-connector-extensions.md#declaring-connection-access-scope--cinatraconfigjson).
- **Audited at use time.** Every use of a shared connection — allowed and denied — writes an audit row recording the acting user, the connection owner it was delegated by, and the run. Denials are recorded before any external call is made. Tokens and secrets are never written to the audit log.

Two locked classes matter operationally:

- **Admin-only connectors.** The LLM-provider key connectors (OpenAI, Anthropic, Gemini) are validator-forced to the exclusive admin scope — a marketplace submission declaring anything else is rejected. Their connections are usable only by the owning organization's admins. This is how instance-level provider credentials (see [LLM providers](llm-providers.md)) stay out of general reach.
- **Per-user-only connectors.** A connector declared exclusively personal can never be shared: the sharing surface is absent and its connections never appear in anyone else's listings.

Connection *use* is what the scope governs. **Managing** connectors themselves (install, archive, configuration) remains organization-admin RBAC and is never definable by an extension package.

When agents resolve which connection to use, ambiguity fails closed: a user's own connection wins; otherwise exactly one authorized shared connection must match, or the run stops with an actionable error. There is deliberately no connection-pinning or candidate-selection control to administer.

---

## Common admin workflows

### Grant access

1. Open the resource's permissions screen (the **Permissions** tab on an agent, or the permissions surface for a skill package or skill).
2. To give a specific person edit-and-share rights, add them as a **co-owner**.
3. To open the resource to a group, set the **access policy** level (team, organization, or workspace) and the operations that level may perform.
4. The change is recorded. Every grant writes an audit entry.

### Revoke access

1. Remove the co-owner row, or narrow the access-policy level / operations.
2. Normal access stops immediately for anyone who only held the revoked grant; existing run records remain for audit.
3. The revoke is audited like the grant.

### Transfer ownership

Ownership transfer (reassigning a resource after a team or organization membership change) is one of the named, audited admin interventions rather than an ad-hoc edit. The admin path captures the original owner, the reason, and a correlation reference so the action is fully traceable. See the `ownership_transfer` reason in [Authorization admin powers](../../references/platform/authz-admin-powers.md).

### Audit who changed what

Every grant, revoke, policy change, and admin intervention writes a row to the audit log: who acted, on which resource, what operation, and when. Admins with audit access can review the full history. To review specifically the admin-intervention actions (moderation, data-protection deletes, ownership transfers, incident response), filter the audit log for bypass-flagged events — the audit row is the authorization record for those. The query patterns are in [Authorization admin powers](../../references/platform/authz-admin-powers.md).

---

## Members and machine principals

The permissions screen lists human members and their relations (which organization, team, or project they belong to and at what role). It also surfaces the chat assistant as a principal so you can see it in the same place.

Service accounts and external-agent identities are machine principals. They are governed by the same model but managed alongside the agent-to-agent settings rather than as human rows in the matrix.

---

## Where to go next

- The kernel mechanics, audited-bypass helper, and registry-install scope rules: [Authorization admin powers](../../references/platform/authz-admin-powers.md)
- The full security model — identities, sessions, secrets, agent sandboxing: [Security](../../references/platform/security.md)
- Cost and usage governance: [Cost and usage](cost-and-usage.md)
- Back to the [Admin Guide](README.md)
