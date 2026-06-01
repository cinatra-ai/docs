# Extension publishing

This page covers shipping an authored extension to the registry and the distinction between the registry (where versions are published) and the installed lifecycle (where an instance activates them). It assumes the model from the [Extensions hub](extensions.md) and the build steps from [Extension authoring](extension-authoring.md).

Registry actions affect published versions; lifecycle actions affect installed state. Publishing puts an immutable version in a registry; it does not by itself install or activate anything. Conversely, removing a published version (a registry action) is separate from archiving or uninstalling an installed extension (a lifecycle action). Keep the two axes distinct.

---

## The registry model

Cinatra speaks to a Verdaccio registry (`registry.cinatra.ai`) under the `@cinatra-ai/*` npm scope, with two destination roles:

- **Private** — the destination the publishing instance writes its own packages to (typically a self-hosted Verdaccio vhost). Credentials live encrypted in the destinations table, keyed by an opaque destination pointer with per-field AAD bindings; tokens are never written into the `origin` record.
- **Public** — the shared registry every connected Cinatra instance can read from. An instance connects under **Administration → Environment** (the registries tab): it submits a request, receives a single-use npm token after admin approval, and the token is stored in the Nango OAuth gateway — never in Cinatra's own database.

**Private is the default publish destination.** An instance with no vendor namespace cannot publish and cannot see another instance's private extensions.

The runtime resolves *which* registry handles a given operation through a deployment registry config and a required `routingMode`:

- **`scope-based`** — emits `--@<scope>:registry=<url>` so each scope routes to its own registry. Used when the private destination uses a distinct npm scope.
- **`shared-acl`** — emits plain `--registry=<url>` so one registry vhost serves multiple instances with ACL-based isolation. Used when the private destination shares the vhost with the public registry.

`routingMode` is required; an unset value is a configuration error, not a fallback. The canonical resolution entry points are `resolvePublishDestination("private" | "public")` and `resolveInstallEnvironment(extensionId)` (`packages/extensions/src/destination-resolver.ts`); callers must run the admin auth gate before invoking them, and direct use of lower-level registry config helpers is blocked by a regression test.

### Immutable versions

A published version is immutable. The registry's `unpublish` directive is locked to `nobody` for every package glob; a boot-time verifier (`packages/extensions/src/registry-immutability.ts`) asserts the live config matches the contract and **fails closed in production** (refuses to publish) when it does not. Publish version strings are strict-semver-gated (`assertPublishableSemver`): pre-release tags are allowed, but dev compile versions (`0.0.0-dev.<sha>`) are rejected — they are reserved for the dev compile-to-DB path. Publish authority itself is gated to the release-manager role (`assertReleaseManagerAuthority`; platform admin dominates it).

---

## The publish flow

Publishing is admin-only:

1. Author the extension as a versioned package (see [Extension authoring](extension-authoring.md)).
2. Bump the package version (strict semver; no dev compile version).
3. Pick a publish destination — `private` or `public`. Private is the default.
4. Run the publish action. The platform packs the tarball, resolves credentials by destination pointer, and pushes through the topology adapter for the chosen `routingMode`.
5. The publisher's row becomes `active`; the package is now installable elsewhere through the normal marketplace flow. The publish writes `.cinatra-published.json` (the provenance sidecar — package name, version, payload digest, `publishedAt`) so install can verify what was published.

For an OAS Flow agent, publish runs the same deterministic review gate the authoring review surfaces (`runDeterministicReview`) before pushing — a publishable agent must pass the gate.

---

## The submit → approve → promote → registry-sync pipeline

Reaching the **public** shared registry goes through a moderated marketplace pipeline rather than a direct write. The submission moves through these states: `pending → approved → promoted → superseded` (with `rejected` and `withdrawn` as terminal off-ramps).

1. **Submit.** A vendor instance submits the extension to the marketplace. The submission lands `pending` in the moderator queue. A vendor may withdraw their own pending submission.
2. **Approve.** A marketplace moderator approves the submission (`extensionSubmissionApprove`, admin-gated on the Cinatra side and capability-gated on the marketplace side). Approval starts the asynchronous promotion saga.
3. **Promote.** The promotion saga lands the package in Verdaccio and flips the submission to `promoted`. Because the saga is async, an approve result may still be `in_flight` and settle afterward; a stuck row exposes a "Retry promotion" path.
4. **Registry-sync.** On an on-track approval, the platform enqueues a single-package catalog-sync job (`MARKETPLACE_CATALOG_SYNC`) so the marketplace catalog table picks up the new package without waiting for the periodic full-sweep. The job uses bounded attempts with backoff to tolerate the saga still finishing on the marketplace side; if the per-package enqueue fails, the periodic sweep reconciles the catalog on its next tick.

A later, equal-version republish of an already-promoted package supersedes the prior submission row (`superseded`), preserving the moderation history.

### Promotion (private → public)

`promoteExtensionToPublicAction(extensionId)` is the admin-gated path that republishes a private extension to the public destination at its current version and flips `origin.visibility` to `public`. It writes a `promote` operation to the audit events (resource type `extension_registry`), not to the destructive lifecycle audit.

**Promotion is one-way.** Public-to-private demotion is intentionally blocked. The demotion control renders disabled-but-visible with a locked tooltip, so the limit is discoverable rather than hidden.

---

## Distribution: dev `cinatra setup` checkouts vs prod package-store install

The same activation contract runs in development and production; only *where the compiled code comes from* differs.

- **Development — git-checkout consumption.** The host consumes extensions as on-disk git checkouts under `extensions/<scope>/<slug>/`, cloned by `cinatra setup` (the dev-extensions clone helper). These checkouts are surfaced through the generated manifest and activated by the dev static-bundle loader. This is the contributor loop: edit the checkout, the dev loader activates it.
- **Production — package-store install.** The host installs published packages into a verified on-disk package store (default `/data/extensions/packages`) and activates them with the prod runtime-package loader. A package dropped into the store is discovered and registered on boot without rebuilding the image.

Both loaders normalize to the same `NormalizedExtensionRecord` and run the identical activation driver, so dev and prod cannot drift. Both run the ABI gate before importing any module; the prod loader additionally runs an integrity (digest) gate, fails closed on ambiguous package identity, and refuses a server entry that escapes its package dir. (Architecture detail: see the [Extensions hub](extensions.md).)

---

## Separating registry removal from the installed lifecycle

Keep the two axes distinct:

- **Registry actions affect published versions.** `extensions_registry_unpublish` deprecates/yanks one version (history retained); `extensions_registry_delete` hard-removes one version. These are kind-agnostic Verdaccio operations with no DB / disk / installed-state semantics.
- **Lifecycle actions affect installed state.** `archive` (reversible suspension), `restore`, `update`, `uninstall`, and `force-delete` change an instance's `installed_extension` row and per-kind native stores — they do not touch the registry. `force-delete` removes one installed version's DB + on-disk dir but leaves the package re-installable in the registry.
- **`purge`** is the one combined "gone everywhere" path — registry (all versions) plus installed state. The dry-run `extensions_purge` MCP tool returns the blast radius and a `digest`; execution runs through the admin-gated `extensions_purge_execute` MCP tool (which requires that exact `digest` plus `confirmDestructive: true`) or the equivalent `cinatra extensions purge` CLI, with a quarantine recovery hedge.

In short: removing a published version does not uninstall it from instances that already installed it, and uninstalling/archiving on an instance does not retract a marketplace release. Use the lifecycle operations to manage installed state and the registry operations to manage published versions — do not hand-edit manifest rows or delete package-store files.

### Update and restore behavior

- **Update** installs a newer published version over the current one, applying what the new version declares (new object types, new skill bundles) and bumping the persisted version, while preserving run history and HITL state. It consumes the same registry/package-store path as install.
- **Restore** reverses an archive — it flips the installed row back to `active` from the instance's existing state. It is a lifecycle action and does not re-fetch from the registry.

---

## Where to go next

- The model and runtime architecture: [Extensions hub](extensions.md)
- Build an extension before publishing: [Extension authoring](extension-authoring.md)
- The canonical manifest and lifecycle transitions: [Extension lifecycle and distribution](extension-lifecycle.md)
- The marketplace-ready README the registry renders: [Extension README contract](extension-readme.md)

Back to the [Developer Guide](README.md).
