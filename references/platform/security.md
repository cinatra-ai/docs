# Security

This document describes the security model Cinatra runs on: how authentication and authorization work, how secrets are protected, how the agent runtime is sandboxed, and what threat patterns the platform is designed against.

For operational secret-handling, see also [Configuration](../../guides/hosting/configuration.md).

---

## Identities

Cinatra has two kinds of identity:

- **Users** — humans who sign in to the app. Managed by Better Auth (the auth server library Cinatra uses). A user has a role inside one or more organizations (member, admin, owner) and a platform-level role (regular or platform admin).
- **Actors** — the executing entity inside a request. Resolved from the inbound auth (session cookie, Bearer JSON Web Token (JWT), agent-to-agent (A2A) protocol identity envelope, or worker context) and threaded through every server action, Model Context Protocol (MCP) primitive, and background job. Authorization checks happen against the actor, not the user that started the chain.

Actors carry their source — `"ui"`, `"route"`, `"worker"`, `"scheduler"`, `"agent"`, `"a2a"` — so authorization checks can apply different rules to UI calls vs. agent-driven calls. For example, an agent calling `agents_run` resolves to an `"agent"` actor and is bound by the policy of the run that started the chain.

---

## Authentication

### Sessions

Better Auth handles all interactive authentication. Username/password is the primary path; passkeys and two-factor authentication are supported plugins. Google OAuth is optional and configured via the `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` environment variables.

Session cookies are signed with `BETTER_AUTH_SECRET`. Rotating the secret invalidates all existing sessions.

### OAuth provider for MCP and A2A

External clients — IDE assistants, third-party agent frameworks, custom dashboards — authenticate with Cinatra by exchanging client credentials for a JWT through the Better Auth OAuth-provider plugin. The same JWT authorizes:

- The MCP server at `/api/mcp`
- The A2A endpoint at `/api/a2a` (when `CINATRA_A2A_HTTP_ENABLED` is set)
- Any per-agent A2A sub-route

The JWT carries the actor identity, so all downstream authorization checks behave the same as for a UI session.

### Development bypasses

Two bypasses exist for development convenience and are explicitly off-by-default:

- `A2A_DEV_BYPASS=true` allows unauthenticated loopback requests to `/api/a2a` for local testing.
- `CINATRA_RUNTIME_MODE=development` enables filesystem-driven agent scans and a handful of other dev affordances.

**Neither should be set in production.** The first opens the A2A endpoint to anyone reaching the box; the second activates dev-only code paths that assume trust boundaries that do not exist in production.

---

## Authorization

### Scope model

Every Cinatra resource — agents, objects, skills, templates, playbooks, runs, policies, integrations — is owned at exactly one of four levels:

```
User → Team → Organization → Workspace
```

These are nesting scopes: a Team is inside an Organization, an Organization is inside a Workspace. A resource owned at "Team" is visible to anyone with that team membership; a resource owned at "Organization" is visible to anyone in the organization; and so on.

A **Project** is a bounded execution and context space, itself owned at one of these four levels. Access to a project is granted independently to users, teams, organizations, or the workspace through read, write, or admin grants. Outputs created inside a project inherit the project's scope; outputs created outside a project are owned at the triggering level directly.

This model is enforced in the kernel and is the basis for every authorization decision.

### Authorization seams

Every privileged operation goes through an explicit authorization helper. The kernel never trusts that "we already checked this earlier in the call chain." Common patterns:

- `requireAuthSession()` — any signed-in user
- `requireAdminSession()` — platform admin only
- `enforceRunAccess(run, actor)` — agent-run ownership and policy check, used uniformly across UI / worker / A2A actors
- `withPlatformAdminBypass(actor, action)` — explicit, audited bypass for cross-organization administrative actions

Authorization bypass is a **convention** in Cinatra, not an exception path: every place a check is intentionally relaxed for an admin uses an explicit helper that names the bypass and logs the action. There is no "implicit admin override" anywhere in the code path.

#### Role values can be comma-joined multi-role strings

A member's or user's role field is not guaranteed to hold a single role. A single account can carry several roles at once, stored as a comma-joined string (for example, an owner-capable account whose role field holds `owner,admin`). Treat the role field as a **set**, not a scalar.

Any authorization check that inspects a role MUST split the field on commas and evaluate each role independently — never compare the raw field with `===` or a single-string equality. An exact-string comparison against `"owner"` misses an account whose role field holds `owner,admin`, silently denying (or, depending on the check, mis-granting) an owner-capable account. The same applies to deduplication and to ranking roles by privilege: split first, then take the highest-privilege role present.

This is an invariant for everyone writing or reviewing an authorization check, anywhere the membership/user role value is read.

### Run sharing

Per-run authorization is governed by an `agentAuthPolicy` JSON document on each agent template, with optional per-run overrides. The policy controls four dimensions:

- Who can list the runs
- Who can read run data and messages
- Who can execute new runs
- Whether the run is shareable to specific users beyond the owner

These checks apply uniformly across the UI, the BullMQ (a Redis-backed job queue) worker, the MCP server, and A2A inbound calls.

### Generic Extension Permissions

Beyond per-run authorization, Cinatra ships a generic permissions surface that applies to seven access resource kinds:

| Kind | What it covers |
|---|---|
| `agent_template` | Installed agents (each `agent_templates` row). Governs who can read the template, run it, and share it. |
| `agent_run` | Individual run records, scoped per run. Inherits from the template's policy with per-run overrides. |
| `skill_package` | Installed skill extensions — the bundle as a whole. |
| `skill` | Individual `SKILL.md` files inside a skill extension, with per-skill overrides that can be tighter or wider than the parent package. |
| `connector` | Installed connector extensions (keyed to the `installed_extension` row). Defaults to workspace-wide access. |
| `artifact` | Installed artifact extensions (keyed to the `installed_extension` row). Defaults to workspace-wide access. |
| `workflow` | Installed workflow extensions (keyed to the `installed_extension` row). Defaults to workspace-wide access. |

The model is the same across kinds:

- Every resource has an **owner** identified by `ownerLevel` (one of `user / team / organization / workspace`) and `ownerId`.
- An owner can grant **co-owners** — a row in the polymorphic `extension_co_owners` table (`{resourceKind, resourceId, userId, grantedBy, grantedAt}`). Being a co-owner is a boolean grant: a co-owner can edit and share the resource without being an organization admin.
- A polymorphic `extension_access_policy` row (`{resourceKind, resourceId, policy, installedByUserId}`) holds the resource's per-operation access rules (read / execute / share). The same `AgentAuthPolicy` shape is used for every kind, and the policy is the lever that controls who outside the co-owner set can do what.

The polymorphic backend means a single generic UI component (`PermissionsForm`) drives every permissions screen across all seven kinds; cleanup on extension removal is uniform across kinds, so a co-owner row for a deleted skill cannot dangle. Every grant, revoke, and policy change writes an `audit_events` row.

The permission resolver runs **inside** every mutation transaction. An unauthorized write cannot commit even if a client tries to bypass the screen.

---

## Secrets

### Encryption at rest

Per-instance secrets — provider API keys, connector credentials, registry tokens — are encrypted at rest with AES-256-GCM. The key is `CINATRA_ENCRYPTION_KEY`.

- In development, the key is generated automatically on first server boot and persisted to `.env.local`. Do not commit `.env.local`.
- In production, the key must be provided explicitly as an environment variable from your secrets manager. Losing the key means losing access to all encrypted data — the platform cannot decrypt provider keys without it.

### Environment variables vs. in-app settings

The general rule:

- **Environment variables** are for things the platform needs at process start — the encryption key, database URLs, the bridge token, OAuth provider client secrets.
- **In-app settings** are for everything else — large language model (LLM) provider keys (managed under `/configuration/llm`), connector OAuth tokens (managed in the **Connectors** area at `/connectors`), and registry credentials. All are stored encrypted in the database.

`OPENAI_API_KEY` is the notable exception: the Graphiti (a knowledge-graph indexer) needs it as a static env var at container startup, so it is an env var rather than an in-app setting.

### The WayFlow bridge token

Calls from the WayFlow (Cinatra's OAS Flow agent runtime) container back into the Next.js app — the `/api/llm-bridge` and per-agent A2A routes — are authenticated by a shared secret in the `X-Cinatra-Bridge-Token` header. The variable is `CINATRA_BRIDGE_TOKEN`. Strict-token-only auth: when the variable is unset, all bridge calls return 403. There is no loopback or origin-based fallback.

Set the variable on both the Next.js app and the WayFlow container; the two values must match.

---

## Agent execution safety

### Shell tool sandboxing

Agents can be configured with shell tool access for executing local commands. The shell tool runs inside a dedicated OpenAI-style sandbox container built from the `runtime/` directory of the `@cinatra-ai/openai-connector` package — the agent does not get arbitrary shell access on the host.

The sandbox container has its own filesystem snapshot, no host network mounts by default, and limited capabilities. Agents that need filesystem access read from a host directory mounted explicitly into the sandbox.

### MCP primitive boundaries

Every MCP primitive validates its input with Zod before any side effect runs. Invalid input is rejected at the boundary; downstream code can assume validated shapes. Primitives that perform sensitive operations (admin-only writes, cross-organization reads) gate explicitly through the authorization helpers.

### Per-run policies

A platform admin can apply an `agentAuthPolicy` to an agent template that restricts who can run it, who can see its outputs, and whether the runs are shareable. The policy is enforced at every authorization seam — there is no path that bypasses it for "convenience."

---

## Threat patterns the platform mitigates

- **Stolen session cookie** → MFA and passkey support reduce the window; rotating `BETTER_AUTH_SECRET` invalidates all sessions immediately.
- **Stolen Bearer JWT** → tokens are scoped to a single OAuth client and rotated through the OAuth provider plugin; per-actor checks still apply.
- **Compromised provider API key** → keys are encrypted at rest; only decryptable with `CINATRA_ENCRYPTION_KEY`, which is held outside the database.
- **Malicious external agent calling Cinatra over A2A** → A2A route is off by default (`CINATRA_A2A_HTTP_ENABLED` opts in); when on, every call is bound by the same `enforceRunAccess` checks the UI uses.
- **Cross-organization data leakage** → resource scope is enforced in the kernel; cross-org reads require an explicit `withPlatformAdminBypass` call which is audited.
- **Path traversal in package install** → installer rejects archives with non-canonical paths before unpacking.
- **Timing attacks on the bridge token** → `timingSafeEqual` with a length-mismatch short-circuit.

---

## Reporting vulnerabilities

If you believe you have found a security issue in Cinatra, report it privately — do not open a public issue. Coordinated disclosure protects users running the platform in production.

To report a vulnerability:

- **Preferred:** open a private security advisory on GitHub via the repository's Security tab (`Security` → `Advisories` → `New draft security advisory`). This opens a private conversation with the maintainers.
- **Alternative:** if you cannot use GitHub Security Advisories, contact the maintainers through the contact path listed in `package.json` (`author` / `repository` fields).

Please include:

- A description of the vulnerability and its impact
- Reproduction steps or a proof-of-concept
- Affected versions or commit ranges, if known
- Your proposed remediation if you have one

We aim to acknowledge security reports within three business days and to issue a fix or mitigation timeline within ten business days for valid HIGH/CRITICAL findings.

---

## Where to go next

- Operational configuration: [Configuration](../../guides/hosting/configuration.md)
- The MCP server's auth model: [Authentication](../mcp/authentication.md)
