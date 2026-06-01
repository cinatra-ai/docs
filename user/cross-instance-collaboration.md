# Cross-Instance Collaboration

Cinatra is a multi-tenant platform by deployment: every Cinatra instance is its own self-hosted application, with its own user accounts, its own database, and its own namespace. A team of 50 people might run one Cinatra; a consultancy of three might run another; a vendor publishing tools for both might run a third. The interesting question is what they do *together*.

This page covers what cross-instance collaboration looks like for end users — installing extensions from another instance, running each other's agents over agent-to-agent (A2A) protocol, governing who sees what. For the protocol-level details (registry routing, auth, the AgentCard contract, the bridge token), see the protocol-level reference at [Cross-instance collaboration](../developer/cross-instance-collaboration.md) in the Developer Guide.

---

## The shared marketplace

Every Cinatra instance can publish agents and skill extensions to a registry. The registry comes in two flavours:

- **Private** — your own registry, typically a self-hosted Verdaccio (an npm-compatible registry). Packages published here are visible only to your instance (and to anything else you explicitly grant the read credential to).
- **Public** — a shared registry that any connected Cinatra instance can read. Today the canonical public registry is hosted at <https://registry.cinatra.ai>.

Once your instance is connected to the public registry (set up under **Administration → Environment → Registries**), Administration → Marketplace shows every extension published there. You browse the same listing other connected instances see. Whether an extension is `public` or `private` is set at publish time and enforced server-side at every read path — your instance never sees another instance's `private` extensions.

For the user-facing flow (install / archive / restore / upload from GitHub), see [Marketplace](../configuration/marketplace.md).

---

## The instance namespace

Every Cinatra instance picks an **instance namespace** during setup. The namespace doubles as the npm scope under which the instance publishes its packages:

- Acme's instance namespace is `acme` → packages publish as `@acme/some-agent`.
- A vendor's instance namespace is `gtm-tools` → packages publish as `@gtm-tools/some-agent`.

The namespace is the basis of identity:

- The marketplace's server-side visibility filter compares each package's `origin.scope` against the reading instance's namespace. Your own private extensions are visible to you because the scopes match; another instance's private extensions are filtered out.
- When you install a package from another instance, its `origin` is preserved — your instance remembers who published it.
- When you publish, the destination credentials are pulled from your instance's `extension_destinations` table by destination id, so you cannot accidentally push to another instance's registry slot.

A reserved-substrings list prevents instances from claiming namespaces that conflict with platform-vendor scopes (anything containing the substring `cinatra`, for example, is reserved).

---

## A typical cross-instance scenario

A concrete example: Acme's data team publishes a `@acme/company-research` agent. Beta Inc. wants to use it.

1. **Acme publishes.** An admin at Acme builds the agent (chat or file-driven authoring), runs the publish flow, and chooses **public** as the destination. The platform packs the tarball, pushes through the routing adapter, and registers the package with `origin.visibility = "public"`. The package becomes visible in the marketplace listing for every connected instance.

2. **Beta installs.** An admin at Beta opens Administration → Marketplace, sees `@acme/company-research`, clicks **Install Now**. The platform downloads the tarball, validates the Open Agent Specification (OAS) Flow, upserts the matching `agent_templates` row, creates an `agent_template_versions` snapshot, registers any object types the agent declares, and persists the `origin` record so Beta remembers the package came from Acme.

3. **Beta runs.** A user at Beta opens chat (or the `/agents` dashboard), picks the new agent, fills in the inputs, and clicks Run. The agent runs on Beta's infrastructure: Beta's WayFlow (Cinatra's OAS Flow agent runtime) container executes the flow, Beta's connectors supply credentials (Acme's data doesn't touch Beta's run), Beta's large language model (LLM) provider does the inference. The run lives in Beta's `agent_runs` table.

4. **Beta updates.** When Acme publishes a new version, Beta's marketplace surfaces an **Update Now** CTA on the same row. The update path replaces the installed version, applies anything the new version declares (new object types, new skill bundles), and bumps `origin.version`. Beta's existing runs of the older version stay intact.

5. **Beta archives.** If Beta later decides the agent is wrong for their workflow, they archive it. The dispatcher checks dependents and run history, soft-archives the extension (`extension_lifecycle_status = "archived"`), and the package vanishes from the sidebar while its history stays in Beta's database.

---

## Agent-to-agent calls between instances

Beyond installing packages from each other, Cinatra instances can call each other's agents directly over **A2A** (Agent-to-Agent Protocol). An A2A client at any other instance can:

1. **Discover** — `GET /.well-known/agent.json` returns the host's `AgentCard`. The card enumerates every published agent as a `skills[]` entry (`packageName`, `operativeVersion`, `supportedVersions`, declared sub-agent dependencies, human-in-the-loop (HITL) screens). Discovery is public and unauthenticated.

2. **Authenticate** — exchange client credentials for a bearer JSON Web Token (JWT) through the host's OAuth2 token endpoint (the `tokenEndpoint` field advertised in the `AgentCard`). This is the same Better Auth (the auth server library Cinatra uses) OAuth-provider surface that authenticates the Model Context Protocol (MCP) server.

3. **Send a task** — `POST /api/a2a` with the JSON-RPC 2.0 payload and the bearer JWT in the `Authorization` header. The remote instance executes the agent on its own infrastructure and streams progress back as Agent-User Interaction Protocol (AG-UI) events. The calling instance subscribes to that stream and renders the run state in its own UI.

The external `/api/a2a` route is opt-in — operators enable it on production deployments by setting `CINATRA_A2A_HTTP_ENABLED=true`. The same protocol works in both directions once enabled. Your instance can call other instances' agents; other instances can call yours.

For the protocol details (the full `AgentCard` shape, how the bearer JWT is verified, the route flag matrix), see [Cross-instance collaboration](../developer/cross-instance-collaboration.md) in the Developer Guide.

---

## Visibility and governance across instances

Cross-instance work has to honour the same governance constraints as in-instance work:

- **Public vs private extensions.** A `private` extension is invisible to other instances. A `public` extension is universally visible. The split is set at publish time and enforced server-side.

- **Promotion from private to public** is one-way and audited. Once an extension is public it cannot be demoted back to private without an out-of-band ops action. The promote-to-public action requires admin authorisation, republishes the extension, updates `origin.visibility`, and writes a `promote` row to `audit_events`.

- **Per-resource permissions** still apply to *installed* extensions. When Beta installs `@acme/company-research`, Beta's admins control who at Beta can run it through the same generic permissions surface used for in-instance extensions (`agent_template` co-owner grants, per-resource access policies).

- **Run data stays where the run runs.** Beta's runs of an Acme-published agent live in Beta's database. Acme never sees those runs. Conversely, when Beta's agent calls Acme's agent over A2A, the call carries only the bearer-authenticated request and response — both instances' data stays in their own infrastructure.

- **Audit trail.** Every install / update / archive / promote at Beta writes an `audit_events` row in Beta's database. Every successful or failed A2A call writes a notification in the recipient instance. There is no out-of-band path that escapes the audit.

---

## When two instances are *one team*

Not every cross-instance setup is two different organisations. A common pattern is:

- A "trusted-tools" instance that hosts shared agents (research, content production, internal tooling) curated by an ops team.
- Several per-team workspaces that install and run those agents on their own data.

The platform mechanics are identical to the cross-organisation case — separate marketplaces, separate run histories, separate audit trails — but the operational policy is "we deploy together":

- Both instances share a private registry destination, so packages published from the trusted-tools instance are immediately installable on the team instances without going through the public marketplace.
- A2A peer URLs are pre-registered so the team instances can call back into shared services on the trusted-tools instance.
- Permissions on installed agents flow from the team instance's own admin model — the trusted-tools instance does not control who at the team can run what.

Setting this up is a configuration question more than a protocol question; the same surfaces (Registries tab, Marketplace, Administration → Network) apply.

---

## Where to go next

- The protocol-level details: [Cross-instance collaboration](../developer/cross-instance-collaboration.md) in the Developer Guide
- The marketplace experience: [Marketplace](../configuration/marketplace.md)
- The open standards Cinatra speaks: [Open standards in Cinatra](../developer/open-standards.md)
- Permissions on installed extensions: [Security](../developer/security.md)
