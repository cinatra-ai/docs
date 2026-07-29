# Authoring artifact extensions

Audience: developers shipping a `kind: "artifact"` extension — a semantic content type the platform recognizes and classifies.

An artifact extension is **declarative by default**: you ship a descriptor that declares which representation forms a work-product type accepts and which classifier skill classifies it. There is no `register(ctx)` server entry, and most artifact extensions never write a line of runtime code. The platform's matcher runtime queues an LLM classification pass against every artifact whose authoritative MIME type matches the extension's declared `accepts.file.mimeTypes`; the classifier returns `{ matches, confidence }`, and the assertion service writes a draft semantic assertion when confidence clears the threshold.

An artifact extension **may additionally ship its own detail / preview renderer** through the versioned `cinatra.artifact.ui` block: the extension owns its type's *view*, while core owns *dispatch*, the artifact *shell*, and the never-blank *floor*. Shipping a renderer is opt-in — omit the block and the type renders with the host's generic renderer. This is the one place an artifact extension carries executable (RSC) code; it stays inside the boundary because v1 renderers request no host ports and render only from a host-supplied, access-checked, serializable snapshot. See the [`cinatra.artifact.ui` block](../../../guides/developer/semantic-artifact-extensions.md#shipping-a-renderer--the-cinatraartifactui-block) in the full guide.

This page is a router. The full author-facing contract already lives in a dedicated guide — follow it rather than a duplicate here:

- **[Authoring semantic artifact extensions](../../../guides/developer/semantic-artifact-extensions.md)** — the semantic-artifact contract: the manifest shape, the file layout (`package.json` + `src/index.ts` + `skills/<slug>-matcher/SKILL.md`), how matcher skills register and run, and what the runtime does with each field.

An artifact extension may also **contribute its own presentational registry
items** to the shared `@cinatra-ai` design registry via
`cinatra.artifact.ui.registryItems` — see
**[Authoring shadcn registry items](../../../guides/developer/authoring-registry-items.md)**
for the identity grammar, the presentational-only rule, and the digest-pinned
serving and lifecycle contract.

Read it alongside the platform-level model:

- **[Artifacts — architecture, threat model and invariants](../artifacts.md)** — the platform-level artifact model.
- **[Objects layer](../objects-layer.md)** — the typed object store the matcher writes assertions into.

## What the kind contributes

The artifact install unit is a descriptor package → the object/artifact registry. It contributes the semantic descriptor, an object type, representation forms (`file` / `connectorRef` / `dashboard`), templates, the `satisfies` graph, matcher/authoring/validator skills, agent dependencies, a confidence threshold, and — optionally — its own extension-shipped `detail` / `preview` renderer via the `cinatra.artifact.ui` block. There is no setup page; the surface is the data/object layer plus a dashboard representation when a dashboard form is declared. When the extension ships no `ui` block (or is not yet in the base image build), the host renders the type generically — the extension's renderer is build-known, so a runtime-installed claimant not yet in the build renders generically with a "requires rebuild" indicator. Descriptor removal archives the descriptor when live artifact rows exist, so existing artifacts stay readable.

## Cross-kind concerns

The package shape, the `cinatra` manifest block, the `cinatra.dependencies` graph, the README contract, and the conformance gates are shared across all kinds — see the [Extension authoring hub](../../../guides/developer/extension-authoring.md). Ship through [Extension publishing](../../../guides/developer/extension-publishing.md).

## See also

- [Extension kinds — choose your kind](./)
- [Extensions hub](../extensions.md)
