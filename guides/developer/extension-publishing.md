# Extension publishing

This page covers shipping an authored extension to the registry and the distinction between the registry (where versions are published) and the installed lifecycle (where an instance activates them). It assumes the model from the [Extensions hub](../../references/platform/extensions.md) and the build steps from [Extension authoring](extension-authoring.md).

Registry actions affect published versions; lifecycle actions affect installed state. Publishing puts an immutable version in a registry; it does not by itself install or activate anything. Conversely, removing a published version (a registry action) is separate from archiving or uninstalling an installed extension (a lifecycle action). Keep the two axes distinct.

---

## The registry model

Cinatra speaks to an npm registry under the `@cinatra-ai/*` scope, with two destination roles:

- **Private** — the destination the publishing instance writes its own packages to (typically a self-hosted Verdaccio vhost — the local/private registry that ships with the self-host docker stack). Credentials live encrypted in the destinations table, keyed by an opaque destination pointer with per-field AAD bindings; tokens are never written into the `origin` record.
- **Public** — the shared public registry endpoint (`registry.cinatra.ai`) every connected Cinatra instance can read from. An instance connects under **Administration → Environment** (the registries tab): it submits a request, receives a single-use npm token after admin approval, and the token is stored in the Nango OAuth gateway — never in Cinatra's own database.

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

## Listing assets at publish time

The marketplace renders branded **listing assets** alongside your published extension — an extension **icon** and **banner**, plus the **vendor logo** for your publishing namespace. These are uploaded to the marketplace (not shipped inside the package tarball) and served as sanitized hosted images on the cards and detail view. See [Listing assets](extension-authoring.md#listing-assets--icon-banner-and-vendor-logo) in the authoring guide for what each one is and where it appears.

- **Extension icon + banner** are per-extension: the icon fills the square tile on the listing card, the banner spans the detail-view header.
- **Vendor logo** is set once for your vendor namespace and reused across all of that vendor's extensions; it is also the second link in the card icon fallback chain (icon → vendor logo → kind emblem).

**Upload constraints (security model).** Assets are accepted as **PNG, JPEG, or WebP only — SVG is rejected** — up to **4 MiB** each. The format is decided by sniffing the uploaded bytes (never the filename or declared content-type), and every stored asset is re-encoded (rasterized) so only pixel data is persisted; any markup or script embedded in an image file is stripped before storage. The card model therefore only ever exposes a hosted URL plus the image's intrinsic dimensions — never the raw upload and never an SVG. This is a deliberate, hardened path: the marketplace allows real branded uploads while guaranteeing a raw SVG or polyglot never reaches storage or the wire.

If you provide no assets, the listing still renders: the card falls back through the icon chain to the kind emblem, and the detail header falls back to a coloured accent panel.

---

## The submit → approve → promote → registry-sync pipeline

Reaching the **public** shared registry goes through a moderated marketplace pipeline rather than a direct write. The submission moves through these states: `pending → approved → promoted → superseded` (with `rejected` and `withdrawn` as terminal off-ramps).

1. **Submit.** A vendor instance submits the extension to the marketplace. The submission lands `pending` in the moderator queue. A vendor may withdraw their own pending submission.
2. **Approve.** A marketplace moderator approves the submission (`extensionSubmissionApprove`, admin-gated on the Cinatra side and capability-gated on the marketplace side). Approval starts the asynchronous promotion saga.
3. **Promote.** The promotion saga lands the package on the public registry endpoint and flips the submission to `promoted`. Because the saga is async, an approve result may still be `in_flight` and settle afterward; a stuck row exposes a "Retry promotion" path.
4. **Registry-sync.** On an on-track approval, the platform enqueues a single-package catalog-sync job (`MARKETPLACE_CATALOG_SYNC`) so the marketplace catalog table picks up the new package without waiting for the periodic full-sweep. The job uses bounded attempts with backoff to tolerate the saga still finishing on the marketplace side; if the per-package enqueue fails, the periodic sweep reconciles the catalog on its next tick.

A later, equal-version republish of an already-promoted package supersedes the prior submission row (`superseded`), preserving the moderation history.

### Promotion (private → public)

`promoteExtensionToPublicAction(extensionId)` is the admin-gated path that republishes a private extension to the public destination at its current version and flips `origin.visibility` to `public`. It writes a `promote` operation to the audit events (resource type `extension_registry`), not to the destructive lifecycle audit.

**Promotion is one-way.** Public-to-private demotion is intentionally blocked. The demotion control renders disabled-but-visible with a locked tooltip, so the limit is discoverable rather than hidden.

---

## Distribution: dev `cinatra instance setup dev` checkouts vs prod package-store install

The same activation contract runs in development and production; only *where the compiled code comes from* differs.

- **Development — git-checkout consumption.** The host consumes extensions as on-disk git checkouts under `extensions/<scope>/<slug>/`, cloned by the dev-extensions sync that runs as part of `cinatra install`. These checkouts are surfaced through the generated manifest and activated by the dev static-bundle loader. This is the contributor loop: edit the checkout, the dev loader activates it. (The contribution itself is planned with GSD — "Git. Ship. Done", the open-gsd spec-driven development framework; see [Contributing](contributing.md#planning).) <!-- source-leak-allow -->
- **Production — package-store install.** The host installs published packages into a verified on-disk package store (default `/data/extensions/packages`) and activates them with the prod runtime-package loader. A package dropped into the store is discovered and registered on boot without rebuilding the image.

Both loaders normalize to the same `NormalizedExtensionRecord` and run the identical activation driver, so dev and prod cannot drift. Both run the ABI gate before importing any module; the prod loader additionally runs an integrity (digest) gate, fails closed on ambiguous package identity, and refuses a server entry that escapes its package dir. (Architecture detail: see the [Extensions hub](../../references/platform/extensions.md).)

---

## Separating registry removal from the installed lifecycle

Keep the two axes distinct:

- **Registry actions affect published versions.** `extensions_registry_unpublish` deprecates/yanks one version (history retained); `extensions_registry_delete` hard-removes one version. These are kind-agnostic registry operations with no DB / disk / installed-state semantics.
- **Lifecycle actions affect installed state.** `archive` (reversible suspension), `restore`, `update`, `uninstall`, and `force-delete` change an instance's `installed_extension` row and per-kind native stores — they do not touch the registry. `force-delete` removes one installed version's DB + on-disk dir but leaves the package re-installable in the registry.
- **`purge`** is the deepest installed-state removal path — it deletes an extension's database rows and on-disk files from this instance. It leaves the registry untouched (purge never unpublishes a published version; version cleanup is a separate operation). The dry-run `extensions_purge` MCP tool returns the blast radius and a `digest`; execution runs through the admin-gated `extensions_purge_execute` MCP tool (which requires that exact `digest` plus `confirmDestructive: true`) or the equivalent `cinatra extensions purge` CLI, with a quarantine recovery hedge.

In short: removing a published version does not uninstall it from instances that already installed it, and uninstalling/archiving on an instance does not retract a marketplace release. Use the lifecycle operations to manage installed state and the registry operations to manage published versions — do not hand-edit manifest rows or delete package-store files.

### Update and restore behavior

- **Update** installs a newer published version over the current one, applying what the new version declares (new object types, new skill bundles) and bumping the persisted version, while preserving run history and HITL state. It consumes the same registry/package-store path as install.
- **Restore** reverses an archive — it flips the installed row back to `active` from the instance's existing state. It is a lifecycle action and does not re-fetch from the registry.

---

## Extension signing and the activation trust root

Beyond the integrity (digest) gate, consuming instances can verify an **Ed25519 signature** over a published version before activating its code in-process. This is a consumer-side verification: the app checks a signature on what it received. The in-repo publish/submit path (`cinatra extensions submit`) does **not** sign; the signature, when present, is attached by the marketplace publish channel. See [Producer status: what signs, and when](#producer-status-what-signs-and-when) for exactly what is signed today.

### The verification mechanism (consumer-side)

A consuming instance verifies a signature over a canonical payload that binds the package identity to the tarball it received:

- **What is signed** — a newline-delimited payload (scheme `cinatra-extension-signature/v1`) binding `packageName` + `version` + the **sha512 SRI** of the tarball bytes (the same `integrity` the materializer verifies before extraction). Signing the SRI binds the signature to the exact bytes, so a tampered tarball fails verification even with a valid-looking signature.
- **Where it lives** — the signature is expected on the packument as `dist.cinatraSignature` (a base64 Ed25519 signature; non-secret). The consuming instance reads it alongside the version's `dist.integrity`.
- **The trust root** — the host's configured public key(s) in `CINATRA_EXTENSION_SIGNING_PUBLIC_KEYS` (comma-separated base64 SPKI DER). **These are public keys, not secrets** — the consuming instance only ever holds public keys, never the private signing key. Only Ed25519 keys are trusted.

Verification distinguishes three cases:

- a signature that is **present and verifies** against a trusted key → a trust signal (`trusted-signed`);
- a signature that is **present but does not verify** (tampered, or signed with a key not configured on the host) → **refused in all windows**, regardless of whether signatures are required — an invalid signature is a red flag, never a soft pass;
- **no signature at all** (absent) → allowed during the transition windows under bootstrap-trust, and denied only once signatures are required.

Distinguish absent from invalid: an absent signature is tolerated during transition; an invalid one is always refused.

### Producer status: what signs, and when

State the producer status precisely — it is **not** symmetric with the verifier:

- **The in-repo publish path does not sign.** `cinatra extensions submit` submits the built **tarball and digest metadata only**; it does not produce a signature. Do not read "publishing now signs the tarball" into the in-repo flow — it does not.
- **Producer-side signing, where configured, emits a v1 signature only.** The signing tooling that runs at publish time produces a `cinatra-extension-signature/v1` signature over `packageName` + `version` + the tarball's sha512 SRI, served on `dist.cinatraSignature`. When no signing key is configured, the package is published **unsigned** (the transition window). A v1 producer cannot sign a closure-mode package — see below.
- **v2 / library-dependency closure is verifier-complete but producer-pending.** The host **verifier** already implements both v1 and the v2 closure scheme (a v2 signature additionally binds the `closureHash` over the materialization plan, with hard downgrade refusal — a closure package can never reach a trusted tier on a v1 signature). But there is **no shipped v2 producer** yet: the v1 signing tool refuses to sign a `dependencyMode: "closure"` package outright. Until a documented v2 producer ships, **`inline` is the only author-adoptable dependency mode** and closure-mode packages cannot be published end-to-end. The full v2/closure contract is [Extension library-dependency closure](https://github.com/cinatra-ai/cinatra/blob/main/docs/extension-library-closure.md).

Consumer-side enforcement is governed by a single operator lever, `CINATRA_EXTENSION_REQUIRE_SIGNATURES`. It is **off by default**: a consuming instance tolerates an absent signature (bootstrap-trust) until an operator sets it to the string `true`, at which point a verified Ed25519 signature becomes the sole in-process trust root. Do not assume signatures are mandatory on any given instance — the default is enforcement off. The operator levers (`CINATRA_EXTENSION_REQUIRE_SIGNATURES` and `CINATRA_EXTENSION_SIGNING_PUBLIC_KEYS`) are documented in [Configuration](../hosting/configuration.md).

### What this means for authors

- Once signature enforcement is on, an **unsigned** package from the marketplace host will **not activate in-process** on consuming instances — its `register(ctx)` hook is never called, so its surfaces never appear, even though the install row exists.
- A package that **declares host migrations** (`cinatra.migrationsDir`) is held to a higher bar: running host DDL is a privileged capability gated on a verified signature, so such a package **cannot import in-process at all** unless it is `trusted-signed` — this holds even before enforcement is globally required. If you ship migrations, your package must be served with a verified signature to activate.
- An invalid or wrong-key signature is refused regardless of the enforcement flag, so a mis-signed build fails on every instance, not just enforcing ones.

Authors do not sign their own builds in the current flow; the signature served on `dist.cinatraSignature` is produced by the marketplace publish channel (v1 today; see [Producer status](#producer-status-what-signs-and-when)). Build and submit as documented; the trust gate is a consumer-side verification an instance applies to what it received.

---

## Where to go next

- The model and runtime architecture: [Extensions hub](../../references/platform/extensions.md)
- Build an extension before publishing: [Extension authoring](extension-authoring.md)
- The canonical manifest and lifecycle transitions: [Extension lifecycle and distribution](../../references/platform/extension-lifecycle.md)
- The marketplace-ready README the registry renders: [Extension README contract](../../references/platform/extension-readme.md)

Back to the [Developer Guide](README.md).
