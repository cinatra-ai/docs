# Authoring artifact extensions

Audience: developers shipping a `kind: "artifact"` extension — a semantic content type the platform recognizes and classifies.

An artifact extension is **declarative and metadata-first**: you ship a descriptor that declares which representation forms a work-product type accepts and which classifier skill classifies it. There is no `register(ctx)` server entry. The platform's matcher runtime queues an LLM classification pass against every artifact whose authoritative MIME type matches the extension's declared `accepts.file.mimeTypes`; the classifier returns `{ matches, confidence }`, and the assertion service writes a draft semantic assertion when confidence clears the threshold.

This page is a router. The full author-facing contract already lives in a dedicated guide — follow it rather than a duplicate here:

- **[Authoring semantic artifact extensions](../../../guides/developer/semantic-artifact-extensions.md)** — the semantic-artifact contract: the manifest shape, the file layout (`package.json` + `src/index.ts` + `skills/<slug>-matcher/SKILL.md`), how matcher skills register and run, and what the runtime does with each field.

Read it alongside the platform-level model:

- **[Artifacts — architecture, threat model and invariants](../artifacts.md)** — the platform-level artifact model.
- **[Objects layer](../objects-layer.md)** — the typed object store the matcher writes assertions into.

## What the kind contributes

The artifact install unit is a descriptor package → the object/artifact registry. It contributes the semantic descriptor, an object type, representation forms (`file` / `connectorRef` / `dashboard`), templates, the `satisfies` graph, matcher/authoring/validator skills, agent dependencies, a confidence threshold, and generic renderers. There is no setup page; the surface is the data/object layer plus a dashboard representation when a dashboard form is declared. Descriptor removal archives the descriptor when live artifact rows exist, so existing artifacts stay readable.

## Cross-kind concerns

The package shape, the `cinatra` manifest block, the `cinatra.dependencies` graph, the README contract, and the conformance gates are shared across all kinds — see the [Extension authoring hub](../../../guides/developer/extension-authoring.md). Ship through [Extension publishing](../../../guides/developer/extension-publishing.md).

## See also

- [Extension kinds — choose your kind](index.md)
- [Extensions hub](../extensions.md)
