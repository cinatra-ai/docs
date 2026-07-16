# Authoring shadcn Registry Items

Audience: developers shipping presentational UI primitives from an artifact
extension through `cinatra.artifact.ui.registryItems`.

An artifact extension that ships a `detail` / `preview` renderer composes it from
the `@cinatra-ai` design registry — Cinatra's shadcn primitives, vendored into
the extension's own tree (see
[Shipping a renderer](semantic-artifact-extensions.md#shipping-a-renderer--the-cinatraartifactui-block)).
This guide covers the other half of the registry contract: how an extension
**contributes its own** registry items — the shadcn `registry:ui` / `registry:lib`
components it wants published to the shared design registry — instead of only
consuming the host roster. The design registry is extensible by extensions
**without a core rebuild**: an item declared here is validated and served
dynamically at the public registry host.

Read alongside the manifest-level model in
[Authoring semantic artifact extensions](semantic-artifact-extensions.md) and the
platform model in [Artifacts](../../references/platform/artifacts.md).

## TL;DR

- An extension declares presentational components under
  `cinatra.artifact.ui.registryItems: [{ name, entry, type, description }]`.
  These are **consumer-executed source** — copied by `shadcn add` into a
  consuming tree, never host-executed — so an item may import **only** public npm
  packages and other registry items.
- Each item's published identity is `@<registryNamespace>/<slug>-<component>`.
  The `registryNamespace` is assigned to the vendor at onboarding and is
  immutable; `cinatra-ai` is reserved for the host and first-party items.
- The marketplace publish pipeline validates the dependency graph, runs a
  per-item clean-consumer install + typecheck, scans content/provenance, then
  emits **digest-pinned immutable blobs** to an append-only registry host.
- Serving is by immutable digest URL (byte-reproducible forever) plus a
  compatibility **stable-name alias**. A published digest URL never 404s;
  namespaces and item identities are permanently tombstoned.

## Vendored primitives vs. declared `registryItems`

Two distinct capabilities touch the design registry — do not confuse them:

- **Vendoring host primitives (consuming).** To build a renderer you *vendor* the
  `@cinatra-ai` shadcn primitives into your package with the pinned CLI
  (`pnpm dlx shadcn@4.8.2 add …`, never `@latest`) and import them by relative
  path. This is dev/build-time only; the app never fetches the registry at
  runtime. Covered in the [renderer guide](semantic-artifact-extensions.md#the-cinatra-ai-design-registry-vendored-primitives).
- **Declaring `registryItems` (contributing).** To *publish* your own
  presentational components to the shared registry — so other extensions can
  vendor them the same way — you declare them in `registryItems`. That is this
  guide.

An extension may do either, both, or neither. Declaring `registryItems` does not
require shipping a renderer, and shipping a renderer does not require declaring
`registryItems`.

## Declaring items — the `registryItems` block

`registryItems` is an optional list inside the versioned `cinatra.artifact.ui`
block. Since a `ui` block may now carry `renderers`, `registryItems`, or both,
`renderers` is optional — but at least one of the two must be non-empty.

```jsonc
"cinatra": {
  "kind": "artifact",
  "apiVersion": "cinatra.ai/v1",
  "artifact": {
    "accepts": { "file": { "mimeTypes": ["text/markdown"] } },
    "skills": { "matchers": ["@cinatra-ai/report-artifact:report-matcher"] },
    "ui": {
      "abiVersion": 1,
      "sdkAbiRange": "^2.4.0",
      "registryItems": [
        { "name": "stat-tile", "entry": "./src/registry/stat-tile.tsx", "type": "registry:ui",  "description": "A compact labelled metric tile." },
        { "name": "format",    "entry": "./src/registry/format.ts",     "type": "registry:lib", "description": "Presentational number/date formatting helpers." }
      ]
    }
  }
}
```

Each item is `{ name, entry, type, description }` and **nothing else** — the
schema is `.strict()`:

- **`name`** — the `<component>` token: strict lowercase kebab (a leading
  alphanumeric segment, hyphen-joined alphanumeric segments, e.g. `stat-tile`).
  This becomes the last segment of the published identity. Item `name`s are
  **unique within a manifest** — two items composing the same identity is a
  collision the pipeline cannot disambiguate.
- **`entry`** — a package-relative, path-contained subpath (`"./…"`, no `".."`,
  no absolute path or URL) that resolves to a real file inside the published
  `files` allowlist (or the tarball omits it). Same containment guard as a
  renderer `entry`.
- **`type`** — the shadcn registry item type: `registry:ui` (a presentational
  component) or `registry:lib` (a plain library module). This is the closed enum
  the conformance gate derives from the leaf source
  (`ARTIFACT_UI_REGISTRY_ITEM_TYPES` in
  `packages/sdk-extensions/src/artifact-contract.ts`).
- **`description`** — a human-readable, presentational, non-empty string.

**npm dependencies and registry-item dependencies are NOT declared here.** They
are extracted from the item's *source* by the publish pipeline's `shadcn build`
step. The manifest surface is presentational metadata only; keeping deps out of
it is why the schema is strict.

Mirror the same `ui` block in the typed `SemanticArtifactManifest` export in
`src/index.ts`, exactly as you would for renderers.

## Presentational-only — what an item may and may not import

A registry item is consumer-executed source, copied into a consumer's tree. It is
never executed by the host, so it carries none of the host's trust. The rule
(generalized from the #1607 registry doctrine):

- **May import** public npm packages and other registry items.
- **May NOT import** any app or host module, any authentication/authorization
  context, or any data-fetching surface. No `@/…` host-internal import, no
  request/session/`ctx` access, no server actions.
- A registry item is **presentation**, not behavior that reaches platform state.
  If a component needs host data, that data belongs in the renderer's
  host-supplied props snapshot, not fetched inside a registry item.

The publish pipeline's per-item clean-consumer install + typecheck runs the item
exactly as a downstream consumer would, so a smuggled host import fails at publish
time, not at some consumer's build.

## Identity — `@<registryNamespace>/<slug>-<component>`

Every published item has a single composed identity:

```
@<registryNamespace>/<slug>-<component>
```

- **`registryNamespace`** — the vendor's namespace. Strict lowercase kebab, the
  same grammar as the other tokens, so the whole identifier is one strict slug.
  It is **immutable** and **assigned at vendor onboarding**, not declared in the
  manifest. Uniqueness is by a case-folded canonical token: `acme`, `Acme`, and
  `ACME` are the same namespace.
- **`<slug>`** — the extension's package slug (e.g. `report-artifact` for
  `@cinatra-ai/report-artifact`).
- **`<component>`** — the item's `name` token.

Construction is the canonical direction: because the `<slug>`/`<component>`
boundary is only recoverable when you know the extension slug, the identity is
carried as the `{ namespace, slug, component }` triple and composed into the
`@ns/<slug>-<component>` string by the pipeline.

**`cinatra-ai` is reserved — case-insensitively — for the host and first-party.**
No vendor can onboard `cinatra-ai`, `Cinatra-AI`, or any case variant. First-party
items publish under the flat `@cinatra-ai` mapping, slug-prefixed, so the host's
14 generic primitives (bare names like `button`, `card`) and first-party
extension items (`<slug>-<component>` names) share one flat roster without
collision.

The identity grammar itself is namespace-general — any onboarded namespace and
any strict-kebab `<slug>` compose the same way. In practice, the only kind that
declares `registryItems` is the artifact kind, and artifact extensions are
first-party-locked (their package name is `@cinatra-ai/<slug>-artifact`), so a
shipped item today is first-party: its `<slug>` is the extension slug (which,
by that naming, ends in `-artifact`) and its identity is
`@cinatra-ai/<slug>-artifact-<component>` — for example, an item named
`stat-tile` in the `@cinatra-ai/report-artifact` extension is
`@cinatra-ai/report-artifact-stat-tile`. The vendor-namespace grammar is what an
external-vendor publishing phase would onboard against; the same identity rules
apply to any namespace once assigned.

## Serving — immutable digest URLs and stable-name aliases

Published items are served from the registry host `registry.cinatra.ai` across
three URL classes that coexist with the existing flat host roster:

1. **Flat host-roster URL** — `/r/<name>.json`. Unchanged. The 14 host primitives
   keep resolving here byte-for-byte; **first-party** items reuse it
   slug-prefixed (`/r/<slug>-<component>.json`). A **third-party** item is never
   exposed on the flat roster — the flat namespace omits the vendor, so two
   vendors sharing a `<slug>-<component>` would collide there.
2. **Canonical immutable digest URL** — `/rd/<namespace>/<slug>-<component>/<sha256-…>.json`.
   Byte-reproducible forever; a published digest URL **never 404s**. This is the
   pin a consumer resolves through for a reproducible build.
3. **Stable-name alias URL** — for a third-party item,
   `/r/@<namespace>/<slug>-<component>.json`; for a first-party item this alias
   *is* the flat host-roster URL. The alias is **explicitly mutable**: its target
   digest may advance under compatibility-only evolution, and it keeps an
   append-only history of the digests it has pointed at.

Digests are `sha256-<64-hex>`. New components become fetchable **at publication
time** — no core rebuild. An item is never discoverable before it is fetchable:
the pipeline freezes and digest-pins the whole dependency closure at publication,
so a root validated once can never later resolve different dependency bytes.

## Publish-time validation (author-facing guarantees)

The marketplace publish pipeline is owned by the publishing infrastructure; from
an author's side the observable guarantees are:

- **The dependency graph is fully qualified.** Every registry-item dependency
  resolves either to a sibling in the same publish batch or to an
  already-published `@<ns>/<path>` identifier. An unresolved reference is
  rejected. Registry-item dependency **cycles are rejected** — the graph must be
  a DAG.
- **Each item installs and typechecks as a consumer would.** A per-item
  clean-consumer install + typecheck runs the item in isolation exactly as a
  downstream `shadcn add` consumer would; a host import or a missing dependency
  fails here.
- **Content and provenance are scanned**, and published blobs are digest-pinned
  with their dependency closures frozen at publication.

## Lifecycle — append-only, compatibility within an identity

- **Within an identifier, evolution is compatibility-only.** A breaking change
  takes a **new name** (a new `<component>` / identity), never a mutation of an
  existing one.
- **Byte-reproducibility is per digest URL; compatibility is per alias.** The
  immutable digest URL is frozen forever; the stable-name alias advances only
  under compatibility-only evolution.
- **Unpublish only delists discovery.** An unpublished identifier stops appearing
  in discovery but its already-published digest URLs keep resolving — a consumer
  that pinned a digest is never broken.
- **Tombstoning is permanent.** A retired `registryNamespace`, and each retired
  `(namespace, slug, item)` identity, is permanently tombstoned in an append-only
  set and is never reassigned — so a later publish can never re-mint an old
  identity onto different bytes.

## The publish / conformance gate

`cinatra.artifact.ui.registryItems` is validated **fail-closed at publish** by the
extension-repo conformance gate
(`scripts/extensions/conformance-gate.mjs`, `checkArtifactUi` →
`checkArtifactUiRegistryItems`) and **degraded-with-diagnostic at boot** — a
malformed `registryItems` list never rejects the whole manifest. The gate asserts:
each item carries only `{ name, entry, type, description }` (any extra field is a
disallowed presentational-boundary violation); `name` is a strict lowercase
`<component>` token, unique within the manifest; `entry` is contained, resolves to
a file, and ships in `files`; `type` is one of the derived item-type enum; and
`description` is non-empty. Reproduce it locally with `node
extension-kind-gate.mjs --package-root .` plus the conformance run before you push.

## Cross-references

- [Authoring semantic artifact extensions](semantic-artifact-extensions.md) — the
  manifest, the matcher skill, and the `cinatra.artifact.ui` renderer block
- [Artifacts — architecture, threat model and invariants](../../references/platform/artifacts.md)
- [Extension publishing](extension-publishing.md) — the submit → approve → promote
  → registry-sync flow
