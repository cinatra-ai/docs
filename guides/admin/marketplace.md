# Marketplace and extensions

Marketplace install activates an extension on the running instance. Before activation, admins review what the extension requests, approve only the capabilities it may access, choose visibility, and complete any setup screens it registers. After activation, its agents, skills, workflows, tools, setup pages, and settings pages become available without a redeploy. Use Archive for reversible suspension, Restore to bring it back, and hard removal only when scoped settings and secrets should be removed. Registry actions affect published versions; lifecycle actions affect installed state.

This page is the admin reference for the marketplace and the extension lifecycle. It is written for the people governing `/configuration/*`. For what extensions look like to the people using the workspace, see [Marketplace and extensions](../user/marketplace-and-extensions.md) in the User Guide. For developer implementation details, see the [Extensions reference](../../references/platform/extensions.md) and [Extension lifecycle](../../references/platform/extension-lifecycle.md).

---

## What the marketplace controls

Extensions are how capability arrives in Cinatra. The marketplace recognises five kinds — **agent**, **connector**, **skill**, **artifact**, and **workflow** — and each appears in the marketplace listing with its kind badge and a state-aware action button. Installing an extension activates it on the running instance: the host records the installed extension, verifies it is compatible, grants only the capabilities you approved, and makes its surfaces available. There is no rebuild and no redeploy in that loop.

Two surfaces sit at the centre of this:

- **Marketplace** (`/configuration/marketplace`) — the discover-and-install catalogue. Each card shows the extension's name, kind, description, author, visibility, and a CTA that reflects its state in your instance.
- **Extensions** (`/configuration/extensions`) — the installed-state manager. An **Active** tab lists what is installed and running; an **Archived** tab lists what is suspended. Both tabs link out to the Marketplace and to the GitHub **Upload** flow.

A separate axis exists for what is *published* versus what is *installed*. Registry actions (publish, promote, unpublish a version) affect the packages available to install. Lifecycle actions (install, update, archive, restore, uninstall) affect what is active on your instance. Keep the two clear: archiving an installed extension does not retract a published release, and unpublishing a registry version does not uninstall it from anyone who already has it.

---

## Before installing

### Connect a registry

The marketplace reads from a registry. When no remote registry is connected, the Marketplace screen shows a "registry not connected" empty state and points you to the registry-connection settings under the **Environment → Registries** tab. Connecting a registry is the prerequisite for browsing anything beyond what your own instance has published. The shared registry uses the `@cinatra-ai/*` npm scope; your instance also publishes under its own namespace scope (see [The instance namespace](#the-instance-namespace)).

### Review what the extension requests

An extension declares the host capabilities it needs and any cross-kind dependencies it relies on. Admins approve only the capabilities an extension may use — an extension does not get full host access by default. Before activating, review:

- **Requested capabilities** — settings, secrets, jobs, notifications, tools, object types, and other approved access the extension asks for. Approve the set the extension genuinely needs.
- **Declared dependencies** — an extension can declare that it depends on other capabilities (for example, an agent that consumes a particular artifact type or connector). Dependencies are capability-based and may be required or optional; a required dependency that is missing blocks activation until it is satisfied.
- **Compatibility** — the host rejects extensions built for an incompatible platform version. Compatibility and dependencies are checked at install time, so an incompatible extension is rejected rather than half-activated.

### Choose visibility

Every published extension carries a visibility:

- **Private** — visible only to your instance's scope. This is the default for a new publish. The marketplace filters server-side: a private extension whose origin scope does not match the reading instance is dropped before render.
- **Public** — visible to every instance reading the shared registry.

Make an extension public deliberately, when you want other instances to install it. Within your instance, an installed extension also carries a per-resource access level that governs which users see and use it — see [Capability approval, permissions, and audit](#capability-approval-permissions-and-audit).

---

## Live activation

When you choose **Install Now** on a marketplace card, the extension activates on the running instance. The host records the installed extension as the canonical active state, verifies compatibility and dependencies, materialises the extension, grants the approved capabilities, and runs its activation hook. After that:

- Its **agents** appear in the Agents area and are reachable from chat and from any connected MCP client.
- Its **skills** populate the skills catalogue and become matchable into agent runs whose rules accept them.
- Its **connectors** expose their setup and status surfaces so a credential can be connected.
- Its **artifacts** register their typed schemas so agents can produce them and users can open, edit, and attach them.
- Its **workflows** become launchable multi-stage processes.
- Any **setup pages and settings pages** it registers become available in the appropriate places.

These registered surfaces appear after activation. Development and production installs follow the same approved lifecycle.

The marketplace card CTA reflects the installed state:

| Button | When it appears |
|---|---|
| **Install Now** | The extension is not installed on this instance. |
| **Update Now** | The extension is installed at an older version than the registry offers. |
| **Installed** | The extension is installed at the current version (disabled). |
| **Restore** | The extension was archived and can be re-activated. |

The detail page for an extension is at `/configuration/marketplace/<scope>/<name>`. Agent extensions render a full detail view; the other kinds render a summary with an install path while their kind-specific detail views are built out.

---

## Capability approval, permissions, and audit

Activation grants only the capabilities you approved. Beyond that, two permission layers govern who can use an installed extension and who can change it.

### Per-resource access

The platform has a generic per-resource access model keyed by extension kind — `agent_run`, `agent_template`, `skill_package`, `skill`, `connector`, `artifact`, and `workflow`. An extension is owned at one of the ownership tiers — user, team, organisation, or workspace — and there is an owner-aware admin tier above them. Co-owner grants let an extension's owner give another person co-owner access without making them an instance admin, and a per-resource access policy governs what non-co-owners can do (read, run, share). Skill-level records can carry a tighter or wider policy than their parent skill package. The permissions surfaces live under `/configuration/permissions`; see [Security](../../references/platform/security.md) for the model.

### Audit

Every privileged lifecycle or permission action is recorded in the audit log with actor, resource, action, and time. That covers install, update, archive, restore, force-delete, and promote, as well as every grant, revoke, and policy change. The audit trail is your record of who activated, suspended, or removed what, and when.

---

## Update, archive, restore, uninstall

Lifecycle actions live on the **Extensions** screen (and as the matching marketplace CTAs). They affect installed state, not published versions.

- **Update** — when a newer version is published, an admin can update the installed extension in place from the Active tab or the marketplace card. The extension keeps its identity and configuration and picks up the newer behaviour.
- **Archive** — reversible suspension. Archiving stops active access while preserving history and configuration. Archived extensions move to the **Archived** tab; their run history stays intact. Archive does not delete data. An extension that has already been used is archived (so its history survives) rather than fully removed when you uninstall it.
- **Restore** — bring an archived extension back to active. From the Archived tab, **Restore** re-activates it at its pinned version, and **Reinstall latest** re-activates it at the newest registry version.
- **Uninstall / hard removal** — removal is the heavier action. It tears down the extension's registered surfaces and, on a hard removal, deletes the extension's scoped settings and secrets. Use Archive (reversible) when you only want to turn something off; reserve uninstall/purge (removal) for when scoped settings and secrets should genuinely go away.

Prefer the lifecycle UI to manual intervention. Use the lifecycle controls in the UI; manual changes bypass installed state, registered surfaces, and audit.

| Action | Effect | Reversible |
|---|---|---|
| Update | Installed extension moves to a newer published version | n/a (re-update to change) |
| Archive | Active access stops; history and configuration kept | Yes — Restore |
| Restore / Reinstall latest | Archived extension becomes active again | Yes — Archive again |
| Uninstall / hard removal | Surfaces torn down; scoped settings and secrets removed | No — re-install from the marketplace |

---

## Registry actions

Registry actions affect *published versions* in the registry, not the installed state on any instance.

- **Publish** (admin) — packs an extension and pushes it to a destination. Private (your own scope, the default) or public (the shared registry). The platform runs a deterministic review gate before a publish; an extension that fails review does not publish.
- **Promote private → public** (admin) — republishes an extension to the public destination at its current version and records the new visibility. Promotion is one-way: there is no public → demote-to-private flow in the UI, so make a release public deliberately. If you genuinely need to retract a public release, that is an operations-side action, not a self-service button.
- **Unpublish a single version** (admin) — removes one published version from the registry. This is a registry action: it does not retract a marketplace release wholesale and does not uninstall the version from instances that already have it.
- **Purge planning** (admin) — a dry-run that reports the blast radius of removing an extension everywhere (all registry versions plus on-disk and database state) before anyone commits to it.

Full removal (purge) is destructive and admin-gated. It runs as a confirmed action after a dry-run preview that shows exactly what will be removed — every registry version plus on-disk and database state. Force-delete from the admin UI is the narrower action: it clears the local database and on-disk state with an explicit destructive confirmation and an audit record, but does not touch the registry.

---

## Publishing and the submission flow

There are two ways an extension reaches the shared marketplace.

### Direct publish (your own scope)

For agents authored in this instance, publish through the approved publish path or GitHub release upload; the platform reviews the release and sends it to the chosen destination (private by default, or public). Skill extensions can also be uploaded from a GitHub release (see below).

### Vendor submission and moderation

Submitting an extension to the *shared* marketplace for review flows through a submission queue, and the instance exposes both sides of it:

- **My extension submissions** (`/configuration/marketplace/submissions`) — lists every submission this instance has made and its status. A pending submission can be **withdrawn**. Submissions are created by sending an extension release to the marketplace for moderator review.
- **Extension submission queue** (`/configuration/marketplace/submissions/admin`) — the moderator queue across all vendors. Admins **Approve** or **Reject** a pending submission, and **Retry** a promotion that failed after approval. A status filter switches between pending, approved, rejected, withdrawn, promoted, and superseded.
- **Vendor applications** (`/configuration/marketplace/vendor-applications`) — the moderator queue for commercial-tier vendor applications. Admins view application detail and **Approve** or **Reject** an applied entry. Free-tier applications auto-approve on apply and never appear here.

The submit → approve → promote flow is gated on the marketplace side as well as locally: each admin queue first requires an admin session on this instance, then the marketplace enforces its own moderator capability on the credential the instance presents. If that capability is missing, the queue surfaces the error rather than silently showing an empty list — coordinate with whoever holds the marketplace admin credential to grant it.

### Installing a skill from a GitHub release

The **Extensions → Upload** screen (`/configuration/extensions/upload`) installs a skill extension directly from a GitHub repository without publishing to the marketplace first. Paste a repository URL or `owner/repo`, pick a release from the list, choose an authenticated GitHub connection if the repository is private, and confirm. The platform fetches the release, validates it, installs it, and recomputes skill matches so the new skills are reachable by agents whose rules accept them. Admin-only.

---

## The instance namespace

Every Cinatra instance picks a namespace during setup, under **Administration → Instance**. That namespace doubles as the npm scope this instance publishes under — `@<instance-namespace>/<extension-name>` — and is the stable identity the instance presents to the shared marketplace. A few consequences follow:

- You cannot publish until your instance has a namespace.
- The namespace is the basis for the private-visibility filter: your own private extensions are visible to your instance because they share your scope.
- A reserved-substrings rule prevents an instance from claiming a namespace that conflicts with the platform vendor scopes; the validator surfaces a specific error if a forbidden substring is detected.

---

## Who can do what

| Action | Role required |
|---|---|
| Browse the marketplace | Admin |
| Install / update an extension | Admin |
| Upload a skill extension from a GitHub release | Admin |
| Archive / restore an installed extension | Admin |
| Force-delete an extension (local database and on-disk state; does not touch the registry; audited) | Admin, with explicit destructive confirmation |
| Unpublish a single registry version | Admin |
| Plan a purge (dry-run blast radius) | Admin |
| Fully purge an extension everywhere (all registry versions plus database and disk) | Admin, with explicit destructive confirmation after a dry-run preview |
| Publish an extension | Admin |
| Promote a private extension to public | Admin |
| Submit an extension to the shared marketplace | Admin |
| Withdraw a pending submission | Admin |
| Approve / reject a submission or vendor application | Admin, plus the marketplace moderator capability on the instance credential |
| Run an installed agent | Any user the agent's per-resource access permits |

---

## Troubleshooting install and setup

- **The marketplace is empty or shows "registry not connected."** Connect a remote registry under **Environment → Registries**. Until a registry is connected, you can only see what your own instance has published.
- **An install is rejected for compatibility.** The extension was built for an incompatible platform version, or is missing a required dependency. Update the extension to a compatible version, satisfy the missing dependency, or wait for a compatible release — the host rejects rather than half-activating.
- **A connector is installed but nothing works.** Installation activates the connector's surfaces, but the connector still needs a credential. Open its setup screen and complete the connection.
- **A feature did not appear after install.** Confirm the extension activated (it shows on the **Active** tab), and check its visibility and per-resource access — an installed extension scoped to a team or to specific people is hidden from everyone else even though it is active.
- **A submission or vendor-application queue shows an error instead of rows.** The instance's marketplace credential is missing the moderator capability. The admin session on this instance is necessary but not sufficient; grant the marketplace moderator capability to the user the marketplace credential belongs to.
- **Publish failed the review gate.** The deterministic review gate blocks a publish that does not pass. Fix the flagged issue and re-publish; the gate runs before anything reaches the registry.

---

## Where to go next

- [Admin Guide](README.md) — the rest of the `/configuration/*` reference
- [Extensions reference](../../references/platform/extensions.md) — developer implementation details for building and activating extensions
- [Extension lifecycle](../../references/platform/extension-lifecycle.md) — the installed-state model and lifecycle transitions
- [Security](../../references/platform/security.md) — the per-resource access model and the audit trail
- [Marketplace and extensions](../user/marketplace-and-extensions.md) — the user-facing view of the same system
