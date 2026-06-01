# Extension Access Contract

"Who can ACCESS / USE this installed extension" — one model across all five
extension kinds (agent / connector / skill / artifact / workflow). This is the
**end-user access axis**, distinct from the **host-port capability axis**
(`requestedHostPorts`, the capabilities an admin approves at install — see
[extension-permissions.md](./extension-permissions.md)). The runtime installer
consumes the API documented here.

The contract guarantees one thing: every installed extension, of every kind, has
exactly one authoritative place that answers "may this actor list / read / use /
execute / share / manage this extension", resolved against a canonical resource
identity that no caller constructs by hand.

## The model

| Table | Key | Holds |
|-------|-----|-------|
| `installed_extension` | `id` (+ identity `(organization_id, owner_level, owner_id, package_name)`) | the install row; `kind ∈ {agent, connector, artifact, skill, workflow}` |
| `extension_access_policy` | `(resource_kind, resource_id)` | the `AgentAuthPolicy` (list/data/execute visibility + `allowRunSharing`) + `installed_by_user_id` |
| `extension_co_owners` | `(resource_kind, resource_id, user_id)` | per-principal co-owner grants |

`resource_kind` covers all seven polymorphic access kinds: `agent_run`,
`agent_template`, `skill_package`, `skill`, `connector`, `artifact`, `workflow`.

**Canonical resource identity.** For `connector` / `artifact` / `workflow`, the
polymorphic `resource_id` IS the `installed_extension.id`. Org scoping comes free
from the row's `organization_id`, and teardown is per-row. Resolve identity
through `@cinatra-ai/extensions/extension-resource-identity`
(`resolveConnectorResource`, `resolveInstalledExtensionResource`) — never build a
`resource_id` by hand. This is the load-bearing guarantee of the contract: one
identity per installed extension, derived the same way everywhere.

## The API (what to call)

All from `@cinatra-ai/extensions`:

- **Install time** — `setExtensionInstallAccess({ kind, resourceId, policy?, coOwnerUserIds?, installedByUserId })`
  (`/install-access-contract`). Zod-validates the policy; writes policy +
  installer + co-owners in ONE transaction; applies the per-kind default when no
  policy is given (connector / artifact / workflow default to `workspace`; agent
  and skill kinds default to `owner` and their existing install flows pass an
  explicit policy). The installer chooses the access tier at install time.
- **Enforce (async, throws)** — `enforceExtensionAccess({ kind, resourceId, owner }, actor, op)`
  (`/enforce-extension-access`). `op ∈ {list, read, use, execute, share, manage}`.
- **Enforce (async, predicate)** — `canExtensionAccess(...)` → `{ allowed }`.
- **Pure decision (no I/O)** — `evaluateExtensionAccess({ policy, coOwnerUserIds, installedByUserId, owner, actor, op })`.
- **Teardown** — `deleteExtensionPermissions(kind, resourceId)`. Called
  automatically by `transitionExtensionLifecycle` on hard removal
  (`uninstall` / `force_delete` / `purge` / `registry_remove`) for connector /
  artifact / workflow; archive preserves the rows.

### Ownership tiers and the owner-aware `admin` tier

Access policy visibility resolves over the ownership tiers
`user → team → organization → workspace`, plus an **owner-aware admin tier**.
`enforceExtensionAccess`'s `"admin"` visibility means **platform_admin OR
org_owner / org_admin of the OWNING org** (for org-owned extensions) — not
platform-admin-only. This deliberately diverges from the agent **run** path
(`packages/agents/src/auth-policy.ts` `policyAllows`, where `"admin"` = platform
admin only), which is left unchanged. The divergence preserves the connector rule
that `visibility="admin"` connectors are usable by org admins.

`manage` resolves to platform/org admin OR installer OR co-owner. Connectors keep
a stricter shim: `enforceConnectorPolicy("manage")` stays org-admin-only.

## Per-kind handlers

The shape is one across all kinds; each kind plugs its install, enforce,
discovery-filter, and teardown into the same contract.

| Kind | Install | Enforce (use) | Discovery filter | Teardown |
|------|---------|---------------|------------------|----------|
| agent | import flow | `enforceRunAccess` (run path) | existing | `deleteAgentTemplate` |
| skill / skill_package | install flow + `setExtensionInstallAccess` | `canEditExtension` / policy gates | skills permission surface | `uninstallSkillPackage` |
| connector | `setExtensionInstallAccess` (dev seed + installer) | `enforceConnectorPolicy` → `enforceExtensionAccess` (canonical-first, with an absence-only connector fallback) | `isConnectorVisibleToActor` (delegates) | `transitionExtensionLifecycle` |
| artifact | `setExtensionInstallAccess` | `authorArtifact` emit gate (`canAccessArtifactExtension`, op `execute`) | `searchArtifactExtensions` / `getArtifactExtension` (op `list` / `read`) | `transitionExtensionLifecycle` |
| workflow | `setExtensionInstallAccess` | `workflow_template_instantiate` (op `execute`) via host-injected `assertExtensionAccess` | `workflow_template_list` / `_get` (op `list` / `read`) | `transitionExtensionLifecycle` |

**Workflow dependency-direction note:** `packages/workflows` must NOT import
`@cinatra-ai/extensions` (the dependency runs the other way). The access check is
a host-injected dep — `WorkflowHandlerDeps.assertExtensionAccess`, built in
`src/lib/workflow-host-deps.ts`. Only EXTENSION-ORIGIN templates (those whose
`origin.package` names an installed workflow extension) are gated; operator-
authored templates keep their existing row-scope checks.

**Governance scope:** only install-tracked extensions are governed. A
disk-registered dev artifact or operator-authored workflow with no
`installed_extension` row is ungoverned (allowed). A DB read error fails CLOSED.

## Consumption contract

Any surface that exposes an installed extension MUST:

1. **At install** — call `setExtensionInstallAccess` with the installer's chosen
   access (or the per-kind default). This is the ONLY sanctioned install-time
   access write path; do not write a kind-specific default directly.
2. **At render / dispatch / use** — gate through `enforceExtensionAccess` /
   `canExtensionAccess` (or the per-kind delegating shim) using the canonical
   `resource_id` from `extension-resource-identity`.
3. **At teardown** — rely on `transitionExtensionLifecycle` (which calls
   `deleteExtensionPermissions`); do not hand-delete access rows.

---

See also: [developer guide index](./README.md) ·
[Extension permissions](./extension-permissions.md) ·
[Extension lifecycle and distribution](./extension-lifecycle.md) ·
[Extension data ownership](./extension-data-ownership.md)
