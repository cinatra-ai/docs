# Extension Lifecycle & Distribution

The canonical lifecycle and distribution contract for every Cinatra extension.
One canonical manifest, one lifecycle primitive, one canonical gate. Locked is
unmovable. Required-in-prod implies locked-in-prod. Provenance is verified, not
asserted. Source-switch is explicit.

Extensions install on a running instance from the marketplace. When an admin
selects an extension, the runtime records the canonical `installed_extension`
manifest, verifies the extension's SDK ABI range and dependencies, materializes
the extension into the runtime store, and activates its `register(ctx)` hook
through the same activation contract used in development. Archive, restore,
update, and uninstall all flow through the manifest gate — without a rebuild or
redeploy.

> Kind taxonomy cross-reference: see [objects.md](./objects.md) for the
> `{agent, connector, artifact, skill, workflow}` kind set, and
> [extensions.md](./extensions.md) for the engineering reference that ties the
> lifecycle, loader, and discovery surfaces together.

## Canonical manifest

`installed_extension` is the single source of truth for "what is installed and
from where". One row per `(organization_id, owner_level, owner_id, package_name)`;
platform-wide rows use a sentinel (`owner_id = '__platform__'`, `organization_id
= NULL`). The Drizzle table plus read/write helpers live in
`packages/extensions/src/canonical-store.ts`.

Columns: `kind`, `status` (`active | archived | locked`), `source` (a
discriminated provenance union — see below), `required_in_prod`, `dependencies`,
`manifest_hash`, and timestamps. DB `CHECK` constraints enforce the
kind/status/owner_level domains and the platform-sentinel invariant.

The manifest is the only place status lives. Every per-kind reader and writer
sources status from it:

- **Readers** — `readActiveExtensionTemplates` / `readArchivedExtensionTemplates`
  resolve status by EXACT identity (`org_id, owner_level, owner_id,
  package_name`) with a platform-row fallback (`pickEffectiveStatusForIdentity`
  — exact wins, so a scoped row never bleeds status across scopes);
  `checkDependents` uses the fail-safe package-name aggregate
  (`readEffectiveStatusByPackageNames`).
- **Writers** — the per-kind handler archive/restore are no-ops; the canonical
  write is owned by the dispatcher (`syncCanonicalManifestTransition`, the sole
  status writer, non-best-effort). `locked` collapses to `active` for the
  2-value `AgentTemplateRecord.extensionLifecycleStatus` field.

## Lifecycle primitive — the only write path

`transitionExtensionLifecycle(id, op, opts)` in
`packages/extensions/src/lifecycle-primitive.ts` is the ONLY function permitted
to write `installed_extension.status`. The canonical-gate reach test
(`packages/extensions/src/__tests__/drift-canonical-gate-reach.test.ts`) fails
CI on any direct status write — `_internal*` helpers, raw SQL, or Drizzle
`.update` — outside the allow-listed canonical store.

Transition matrix:

```
active   ↔ archived     (archive / activate)
archived → active       (activate)
*        → locked       (lock; admin / required-in-prod)
locked   → active       (unlock; requires opts.allowUnlock + platform_admin)
locked   ⊘  destructive  (archive / uninstall / force_delete / purge / registry_remove)
update preserves status (lock survives update)
```

The destructive ops — `uninstall`, `force_delete`, `purge`, `registry_remove` —
remove the row outright for a non-locked, non-used extension and drive teardown.
`install` and `sourceSwitchExtension` verify provenance before writing: an
install or source-switch with incomplete provenance is refused.

## Canonical gate

`enforceCanonicalManifest(actor, identity, op)` in
`packages/extensions/src/canonical-gate.ts` is the pre-flight check before
per-kind activation adapters dispatch. It refuses destructive ops on locked rows
upstream, so the adapters never re-implement lock semantics. The kind-agnostic
dispatcher (`packages/extensions/src/index.ts`) also calls
`assertNoLockedCanonicalRow` on archive / uninstall / forceDelete as a coarse
safety net for callers that lack an identity.

## Source union (provenance)

```ts
type ExtensionSource =
  | { type: "verdaccio"; registryUrl; packageName; version; integrity }
  | { type: "github";    repo; ref; resolvedSha; path? }
  | { type: "local";     path; resolvedCommitOrTreeHash };
```

`validateExtensionSource` (`canonical-types.ts`) checks every required field per
type. Source-switch (`sourceSwitchExtension`) is an explicit
"reinstall-with-provenance" — identity and status are preserved, provenance is
replaced and re-verified. It is never a silent update.

## Locked and system extensions

`SYSTEM_EXTENSIONS` (`packages/extensions/src/system-extension-inventory.ts`)
ship `locked` on install. `lockSystemExtensionsAtBoot` also locks every
`requiredInProd` package in production (required-implies-locked). A drift test
asserts the inventory is a subset of `cinatra.requiredExtensions` (root
`package.json`).

## Dependencies and closure

`dependency-closure.ts` computes the transitive closure over `active | locked`
rows only — an `archived` dependency counts as MISSING. `assertInstallClosure`
fails install on a required-missing dependency; `assertArchiveDoesNotBreakClosure`
blocks archive/uninstall when an active dependent requires the target.
`optionalMissingBehaviorForKind` declares per-kind optional-missing behavior
(agent → stop-run-hitl, connector → skip-step-audit, skill/artifact →
log-continue, workflow → fail-instantiate). Dependencies are capability-based
and declared as required vs optional — see
[extension-access-contract.md](./extension-access-contract.md) for how the same
manifest scopes access.

## Dev and prod distribution

- **Dev (`CINATRA_RUNTIME_MODE=development`):** `recordDevExtensionVersion`
  (`dev-version.ts`) updates the manifest source to `0.0.0-dev.<sha>` in place.
  The dev instance consumes git checkouts under `extensions/` through
  `cinatra setup` — no registry publish.
- **Prod (tagged release):** an `ext-v<semver>` tag triggers
  `.github/workflows/extension-tag-publish.yml`. `publish-authority.ts` enforces
  strict semver plus the release-manager gate. The Verdaccio config
  (`docker/verdaccio/config.yaml`) sets `unpublish: nobody` —
  immutable-on-publish. Lifecycle primitives never yank or delete from the
  registry. Registry actions affect published versions; lifecycle actions affect
  installed state.

## Add-from-chat (thin)

`add-from-chat.ts` — `detectSourceRef` detects a GitHub URL, a `name@version`
reference (a private `@cinatra-ai/*` resolves to the Verdaccio registry, else
npm), or a local path; `buildProposal` returns a structured propose-confirm
payload (`requiresConfirmation: true`). Chat never auto-installs; an admin or
release manager confirms, then the lifecycle primitive executes.

## Lifecycle-discovery UX

`lifecycle-ui.ts` — `lifecycleBadgesFor` (locked / required / source / version
badge descriptors mapped to shadcn `<Badge>` variants), `disabledActionReason`
("Cannot uninstall — locked; archive instead"), `matchesLifecycleFilter` (filter
by kind / status / source / locked / required plus free-text). Rendered via
`components/lifecycle-badges.tsx`.

## Teardown and data retention

Teardown removes the extension's registered surfaces from the running instance:
its agents, connectors, artifacts, skills, workflows, setup pages, settings
pages, MCP tools, object types, and capability providers stop being exposed.
What happens to the extension's *data* depends on the operation:

- **Archive** is reversible suspension. It preserves run history and the
  extension's org-scoped settings and objects, so a `Restore` brings the
  extension back with its configuration intact. Normal access stops while past
  work remains available.
- **Hard removal** (`uninstall` / `force_delete` / `purge` / `registry_remove`)
  deletes the extension's scoped settings, secrets, and dev-fixture provenance.
  This fires a durable, awaited, idempotent data-teardown hook on hard removal
  only — never on archive.

See [extension-data-ownership.md](./extension-data-ownership.md) for the exact
keyspaces removed and the retention semantics, and
[extension-access-contract.md](./extension-access-contract.md) for how access
rows are torn down alongside the row.

## Regression Gates

- **Kind coverage** — every kind has a typeId, a bootstrap handler, a registry
  parser entry, naming-conformance, marketplace, and purge coverage.
- **Canonical-gate reach** — no status write outside the primitive; raw SQL and
  Drizzle writes are confined to the canonical store; every surviving per-kind
  writer is baseline-allow-listed (a NEW writer trips the gate).

See [extension-ioc-safeguards.md](./extension-ioc-safeguards.md) for the
discovery and decoupling gates that keep core from statically naming any specific
extension.

---

See also: [developer guide index](../../guides/developer/README.md) ·
[Extensions engineering reference](./extensions.md) ·
[Extension permissions](./extension-permissions.md)
