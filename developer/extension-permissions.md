# Extension Permissions Architecture

The kind-discriminated permission system that answers "who can access / use this
installed extension" for every Cinatra extension kind. One polymorphic backend,
one widget, one set of server actions — across all access kinds.

This is the **end-user access axis**. It is separate from the **host-port
capability axis** (`requestedHostPorts`): at install an admin approves the SDK
ports an extension may use, and the host grants only those. This page covers the
end-user axis; for the canonical resource-identity guarantees and the per-kind
enforce/discovery wiring see
[extension-access-contract.md](./extension-access-contract.md).

## The access kinds

Every shareable extension resource belongs to one of seven access kinds:

| Kind | What it is |
|------|------------|
| `agent_run` | A single execution of an agent template |
| `agent_template` | A registered agent definition |
| `skill_package` | A skill extension (a bundle of skills) |
| `skill` | An individual skill inside a package |
| `connector` | An installed connector extension |
| `artifact` | An installed artifact extension |
| `workflow` | An installed workflow extension |

These are a `text + CHECK` constraint on the polymorphic tables — adding a new
kind is "add the value to the IN-list", not an `ALTER TYPE`. For `connector` /
`artifact` / `workflow`, the polymorphic `resource_id` is the canonical
`installed_extension.id`; the other kinds carry their own kind-specific id.
Resolve identity through `@cinatra-ai/extensions/extension-resource-identity` —
never build a `resource_id` by hand.

## Ownership tiers and the owner-aware admin tier

Access visibility resolves over the ownership tiers
`user → team → organization → workspace`. On top of those four sits an
**owner-aware admin tier**: for the extension access path, the `"admin"`
visibility means **platform_admin OR org_owner / org_admin of the OWNING org**,
not platform-admin-only. The installer chooses the access tier at install time;
the per-kind default applies only as a fail-safe (connector / artifact / workflow
default to `workspace`; agent and skill kinds default to `owner`).

## The two polymorphic tables

Both keyed on `(resource_kind, resource_id)`.

### `cinatra.extension_access_policy`

```
resource_kind         text NOT NULL    -- one of the seven access kinds
resource_id           text NOT NULL    -- the kind-specific resource id
policy                jsonb NOT NULL    -- AgentAuthPolicySchema-validated
installed_by_user_id  text              -- FK ON DELETE SET NULL
updated_at            timestamptz DEFAULT now()
PRIMARY KEY           (resource_kind, resource_id)
CHECK                 resource_kind IN (...)
```

The `policy` holds list / data / execute visibility plus `allowRunSharing`.

### `cinatra.extension_co_owners`

```
resource_kind text NOT NULL    -- one of the seven access kinds
resource_id   text NOT NULL
user_id       text NOT NULL    -- better-auth user id (FK ON DELETE CASCADE)
granted_by    text NOT NULL    -- better-auth user id of the granter
granted_at    timestamptz DEFAULT now()
PRIMARY KEY   (resource_kind, resource_id, user_id)
INDEX         on (user_id) and (resource_kind, resource_id)
CHECK         resource_kind IN (...)
```

There is no FK on `resource_id` — it is polymorphic, so app-layer and per-kind
DELETE hooks handle cleanup. Orphan reads return empty co-owner sets (the auth
gate fails closed for a now-deleted resource).

## The generic backend

Lives in `packages/extensions/src/`:

- **`install-access-contract.ts`** — `setExtensionInstallAccess({ kind,
  resourceId, policy?, coOwnerUserIds?, installedByUserId })`. The single
  install-time entry for any kind: it Zod-validates the policy up front, then
  writes the policy, the installer pointer, and the seed co-owners in ONE
  transaction (`writeExtensionInstallAccessAtomic`), so a mid-write failure
  leaves no partially-configured access. The per-kind default applies when no
  policy is supplied. Best-effort per-kind projection hooks fire after the
  canonical write to keep kind-specific readers in sync; hook failures are
  logged, never thrown — the canonical write is authoritative.

- **`enforce-extension-access.ts`** — `enforceExtensionAccess({ kind,
  resourceId, owner }, actor, op)` (async, throws), `canExtensionAccess(...)`
  (async predicate → `{ allowed }`), and `evaluateExtensionAccess(...)` (the
  pure, no-I/O decision). `op ∈ {list, read, use, execute, share, manage}`.
  `manage` resolves to platform/org admin OR installer OR co-owner.

- **`permissions-store.ts`** — raw SQL helpers on the two polymorphic tables.
  Policy upsert uses `ON CONFLICT DO UPDATE` with `COALESCE` for selective field
  preservation.

- **`permissions-kind-hooks.ts`** — the per-kind hooks registry, lazy-loaded so
  this module never pulls every kind's store layer into the bundle. Each kind
  implements:
    - `resourceExists(resourceId)` — cheap existence check
    - `extraEditors(resourceId)` — additional editor user ids unioned into the
      auth gate (e.g. `agent_run` adds `runBy`; `skill` adds the parent
      package's installer + co-owners)
    - `allowSharing(resourceId)` — optional gate before a co-owner add (e.g.
      `agent_run` blocks when `allowRunSharing === false`)
    - `afterPolicyWrite` / `afterCoOwnerAdd` / `afterCoOwnerRemove` /
      `afterInstallerSet` — per-kind projection hooks that mirror the canonical
      write into any kind-specific reader (no-ops for the canonical-only kinds)
    - `selfRemoveRedirect` — page-level redirect target after self-removal

- **`permissions-actions.ts`** — `"use server"` kind-discriminated server
  actions. A single `canEditExtension` gate consults admin → installer →
  polymorphic co-owners → `extraEditors`. Exported actions:
    - `saveExtensionAccessPolicy(kind, resourceId, policy)` — Zod-validates
      `policy` against `AgentAuthPolicySchema` before any write or hook (server
      actions receive untyped JSON at runtime; the TS type is not trustworthy)
    - `setExtensionInstaller(kind, resourceId, installedByUserId)` — admin-only,
      with resource-existence and humans-only target checks
    - `searchExtensionCoOwnerCandidates(kind, resourceId | null, query, page)` —
      paginated humans-only user search; a `null` resourceId means upload-flow
      mode (admin-only gate)
    - `addExtensionCoOwner(kind, resourceId, targetUserId)` — humans-only
      direct-add guard
    - `removeExtensionCoOwner(kind, resourceId, targetUserId)`
    - `readExtensionAccessPolicyAction(kind, resourceId)` — used by page-data
      loaders and post-install flows

## The generic widget

A single client component at `src/components/extension-permissions-client.tsx`:

```tsx
<ExtensionPermissionsClient
  kind="agent_run"          // any of the seven access kinds
  resourceId={run.id}
  canEdit={canEdit}
  initialPolicy={effectivePolicy}
  owner={runOwner}
  coOwners={coOwners}
  availableScopes={availableScopes}
  currentUserId={actorUserId}
  allowSharing={effectivePolicy.allowRunSharing}
  removeOwner={() => removeRunOwner(run.id)}  // optional — agent_run only
/>
```

It binds the generic server actions to the underlying `<PermissionsForm>` widget.
The optional `removeOwner` prop lets a kind expose its own primary-owner clear
semantic (only `agent_run` does so today — `agent_runs.run_by` lives on the run
record itself, with a last-co-owner-remaining guard).

## Install-time access capture

Both the ZIP and GitHub upload forms expose a `<PermissionsFormDraft>` behind a
"Configure access & ownership (advanced)" disclosure. The captured draft threads
into the install action, which routes through `setExtensionInstallAccess` so the
policy, installer, and co-owners land atomically. The disclosure defaults closed
so the one-click admin flow stays clean.

## Teardown

On hard removal (`uninstall` / `force_delete` / `purge` / `registry_remove`),
`transitionExtensionLifecycle` calls `deleteExtensionPermissions(kind,
resourceId)` to remove the access policy and co-owner rows. Archive preserves
them, so a restored extension keeps its access configuration. Do not hand-delete
access rows.

---

See also: [developer guide index](./README.md) ·
[Extension access contract](./extension-access-contract.md) ·
[Extension lifecycle and distribution](./extension-lifecycle.md) ·
[Extension data ownership](./extension-data-ownership.md)
