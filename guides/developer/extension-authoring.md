# Extension authoring

This page is the cross-kind hub for building a Cinatra extension. It assumes the model and architecture from the [Extensions hub](../../references/platform/extensions.md) — read that first if you have not. Once authored, ship the extension with [Extension publishing](extension-publishing.md).

Cinatra extensions install on a running instance from the marketplace. When an admin selects an extension, the runtime records the canonical `installed_extension` manifest, verifies the extension's SDK ABI range and dependencies, materializes the extension into the runtime store, and activates it through the same contract as development. The host grants only approved SDK ports, then exposes the extension's surfaces without rebuilding or redeploying. (One exception is the build-known artifact `cinatra.artifact.ui` renderer: a marketplace-installed artifact still activates — its type, matcher, and templates — without a redeploy, but its own detail/preview renderer falls back to the generic view with a "requires rebuild" indicator until the extension is in the base image build.)

**Authoring is per-kind — start with your kind.** An extension is exactly one of five kinds, and the kind decides how you author it: what payload you ship, whether you write a `register(ctx)` server entry at all, and which lifecycle the host runs. Only the connector kind is a code package with a host-port `register(ctx)` server entry; the other four are authored primarily as data — with one exception: an artifact extension may *optionally* ship a port-less `detail`/`preview` **renderer** (an RSC component) through its `cinatra.artifact.ui` block. This page covers the concerns common to all kinds and routes you to the dedicated per-kind guide.

---

## 1. Choose your kind

| Kind | Build it when you want to add… | `register(ctx)`? | Per-kind guide |
|---|---|---|---|
| **agent** | An OAS Flow agent — a role the platform can run. | No (declarative) | [Authoring agent extensions](../../references/platform/extension-kinds/authoring-agent-extensions.md) |
| **connector** | An integration to an external system, or a provider behind a capability facade. | **Yes** | [Authoring connector extensions](../../references/platform/extension-kinds/authoring-connector-extensions.md) |
| **artifact** | A semantic content type with matcher/authoring skills. | No (declarative) | [Authoring artifact extensions](../../references/platform/extension-kinds/authoring-artifact-extensions.md) |
| **skill** | One or more `SKILL.md` skills delivered to agents/the assistant. | No (payload-only) | [Authoring skill extensions](../../references/platform/extension-kinds/authoring-skill-extensions.md) |
| **workflow** | A multi-step BPMN process orchestrating agents and approvals. | No (declarative) | [Authoring workflow extensions](../../references/platform/extension-kinds/authoring-workflow-extensions.md) |

> **The four declarative-kind authors do not go through connector mechanics.** If you are shipping an agent, artifact, skill, or workflow, **do not start from the `register(ctx)`/ports/migrations material** — that is connector-specific. Go straight to your kind's guide. The landing page that helps you choose and links every guide is [Extension kinds — choose your kind](../../references/platform/extension-kinds/).

`cinatra.kind` is singular (`"agent" | "connector" | "artifact" | "skill" | "workflow"`) and is the authoritative signal for lifecycle, dispatch, and discovery. The directory suffix (`<slug>-<kind>`) is a strong hint validated by the naming-conformance test, but the manifest wins on disagreement.

---

## 2. What every kind shares

Whatever your kind, the same cross-kind machinery applies. The per-kind guides reference back to these sections so you only learn them once.

### The package and the three-file manifest

An extension is a versioned, scoped npm-style package. The directory name equals the unscoped package name (1:1, kebab-case), with the kind at the end so the registry reads as a noun phrase: `extensions/<scope>/<slug>-<kind>/`. The manifest is three files: the `package.json` `cinatra` block, the published-provenance sidecar `.cinatra-published.json` (written by publish), and the kind payload (`cinatra/oas.json`, `cinatra/workflow.bpmn`, `skills/<slug>/SKILL.md`, the `artifact` descriptor block, or the connector `src/`).

Author the manifest under the `package.json` `cinatra` block:

```jsonc
{
  "name": "@cinatra-ai/<slug>-<kind>",
  "version": "0.1.0",
  "cinatra": {
    "apiVersion": "cinatra.ai/v1",
    "kind": "connector",
    "serverEntry": "./register",        // connector only — omit for payload-only kinds
    "sdkAbiRange": "^2",
    "requestedHostPorts": ["mcp", "settings", "authSession"],
    "dependencies": [ /* canonical cross-kind edges */ ]
  }
}
```

Shared manifest fields (`CinatraManifest`, `packages/sdk-extensions/src/manifest.ts`):

- **`kind`, `apiVersion`** — the identity fields every extension declares.
- **`sdkAbiRange`** — the SDK ABI range the extension was built against (`"^2"` requires any SDK ABI 2.x host). Build against the current `SDK_EXTENSIONS_ABI_VERSION` exported from `@cinatra-ai/sdk-extensions`. See [Declare `sdkAbiRange` for compatibility](#declare-sdkabirange-for-compatibility) for why this is an ABI **range**, not a cinatra app-version, and how it surfaces as a compatibility badge.
- **`dependencies`** — the canonical cross-kind dependency graph (below).

The kind-specific fields — `serverEntry`, `requestedHostPorts`, `uiSurface`, `devFixtures`, `devSetup` (the imperative dev-mode provisioning hook), `envOverrides` (manifest-declared env-first settings/secrets keys), `migrationsDir` — apply mostly to connectors and are covered in the [connector guide](../../references/platform/extension-kinds/authoring-connector-extensions.md). The full SDK ABI, the manifest shape, and the schema-migration contract live in [Extension SDK ABI and dependencies](../../references/platform/extension-sdk-abi-and-dependencies.md).

### `cinatra.dependencies` — capability-based, required vs optional

`cinatra.dependencies` is the canonical cross-kind dependency graph (`ExtensionDependency`, `packages/sdk-extensions/src/dependencies.ts`). Each edge declares a `packageName`, the depended-on `kind`, an `edgeType` (`runtime | install-time | peer`), a `versionConstraint`, and a `requirement` (`required | optional`):

- **`required`** — the capability cannot work without it. A missing package fails install/boot; an unconfigured-but-present connector fails run-start or opens a setup HITL.
- **`optional`** — a valid degraded path exists. Missing does not fail install/boot; the runtime records a skipped capability.

Declare dependencies **by capability, not by concrete provider** — an email-delivery agent depends on the email-send facade plus a rule requiring at least one concrete provider, not a hard Gmail pin. `versionConstraint` is `semver-range`, `exact`, or `git-ref`; declare `semver-range` or `exact` for an installable package (a `git-ref` edge is refused at install).

### Built artifacts — what you publish

**You author in TypeScript source; the package you publish ships a BUILT artifact.** This matters for the connector kind (the one kind with a `serverEntry`): the marketplace runtime store activates built, Node-importable JavaScript only — a `.ts` source entry is refused at install. You do not hand-build this; publishing through the release workflow runs the canonical builder. The full normative contract is [The runtime-store `serverEntry` contract](../../references/platform/extension-server-entry-artifact.md).

### The README contract

Every extension — every kind — ships a marketplace-ready `README.md` at its root: an end-user-facing, value-forward description in the register the marketplace renders. The structure is enforced by a CI gate. See [Extension README contract](../../references/platform/extension-readme.md).

### Declare `sdkAbiRange` for compatibility

Declare `sdkAbiRange` in the `package.json` `cinatra` block as an **SDK-ABI range** — the range of `@cinatra-ai/sdk-extensions` ABI majors your built extension is compatible with — **not** a cinatra app-version. Build against the current `SDK_EXTENSIONS_ABI_VERSION` exported from `@cinatra-ai/sdk-extensions` and declare the matching range (today that is `"^2"`, meaning "any SDK ABI 2.x host").

```jsonc
"cinatra": {
  "sdkAbiRange": "^2"      // any SDK ABI 2.x host — NOT a cinatra app-version
}
```

The instance compares the declared range against its own frozen SDK ABI in two places:

- **An install / activation gate.** A host outside the declared range refuses the install (and the loaders refuse to activate the code) before any durable state mutates.
- **A card badge.** The marketplace listing card and the detail header show a **3-state compatibility badge** derived locally on each instance from your declared range versus that instance's ABI:
  - **Compatible** (green) — the declared range admits this instance's ABI.
  - **Incompatible** (red) — the instance's ABI is outside the declared range (or the range is malformed; the verdict fails closed).
  - **Unknown** (neutral, never green) — the extension declared **no** `sdkAbiRange`. The badge cannot vouch for compatibility, so it never reads "Compatible" for an undeclared range.

Because an omitted range reads as the neutral **"Unknown"** badge rather than "Compatible", **declare `sdkAbiRange`** so installers see a definite verdict.

**Release independence.** Declaring an ABI **range** (e.g. `"^2"`) decouples your extension from the cinatra app-version: every cinatra release that stays within SDK ABI major 2 remains compatible with **no republish**. Only a deliberate SDK ABI **major** break (3.x) requires you to rebuild against the new SDK and bump the range. Do **not** pin a cinatra app-version into `sdkAbiRange` — that would force a needless republish on every release. The full ABI contract is [Extension SDK ABI and dependencies](../../references/platform/extension-sdk-abi-and-dependencies.md).

### Listing assets — icon, banner, and vendor logo

Beyond the README, an extension can ship branded **listing assets** (à la WordPress.org plugin assets) that the marketplace serves on its cards and detail view. All three are optional; an extension with none still renders with a sensible fallback.

- **Extension icon** — the small square image shown inside the coloured banner on the marketplace listing card.
- **Banner** — a wide image shown across the top of the extension's detail view header. When absent, the header falls back to a coloured accent panel.
- **Vendor logo** — the brand mark for the vendor (publisher). It is set once per vendor (see [Extension publishing](extension-publishing.md#listing-assets-at-publish-time)) and reused across that vendor's extensions.

**The card icon fallback chain.** The square icon tile on a listing card resolves the first available of: the extension's **icon → the vendor logo → the extension-type (kind) emblem**. So an extension with no icon of its own still shows the vendor's logo, and a vendor with no logo still shows the built-in kind emblem — the tile is never empty.

**Asset constraints.** Assets are uploaded to the marketplace and served as **sanitized hosted images** — the card model exposes a hosted URL plus the image's intrinsic dimensions, never the raw upload bytes and never an SVG blob:

- **Accepted formats: PNG, JPEG, WebP only.** **SVG is rejected.** The format is decided by sniffing the actual bytes, not the filename or declared content-type, and each stored asset is re-encoded (rasterized) so only pixel data is persisted — any markup or script smuggled into an image file is dropped.
- **Maximum size: 4 MiB** per asset.
- There are no fixed pixel dimensions; the stored intrinsic width/height are recorded and used for layout. Provide an icon that reads well as a small square and a banner sized for a wide header.

### Local validation and the conformance gates

Before publishing, satisfy the gates the platform holds every extension to:

- **`pnpm typecheck`** — the activation contract typechecks against the SDK.
- **Naming conformance** — directory == unscoped package name, kind-at-end, allowed scope for the kind.
- **README gate**, **License gate**, **Dev-fixtures gate** (if you declare `devFixtures`, the file is declarative data only).
- **Discovery conformance** — a new kind's reader facet must satisfy the golden discovery contract.
- **Manifest validity** — real port names, a supported `sdkAbiRange`, well-formed `dependencies` edges.

Beyond these author-time gates, the production loader applies a runtime trust check (tarball integrity + Ed25519 signature in the signature-required window). The IoC review contract every change is held to is in [Extension IoC safeguards](../../references/platform/extension-ioc-safeguards.md).

### Design conformance — extensions that ship UI

An extension whose UI is user-facing — a connector's setup page, or an agent/skill surface — must **adhere to the published Application Design references**. Always link the `docs.cinatra.ai/references/design/*` pages below, never a source or private repo:

- **[Application Design (design system)](https://docs.cinatra.ai/references/design/design-system.html)** — the palette, typography, and component reference every surface builds from.
- **[Extensions](https://docs.cinatra.ai/references/design/application-design-extensions.html)** — the marketplace card, detail-view, and installed-extensions patterns.
- **[Connectors](https://docs.cinatra.ai/references/design/application-design-connectors.html)** — the connector grid and setup page, including the single- and multi-connection layouts and additional config tabs.

Follow the referenced layout and interaction patterns for any surface you ship — tab order (a reserved Help tab, when present, always sits last) and the connection/status patterns. Design conformance is part of review.

---

## 3. Go to your kind's guide

Now follow the dedicated guide for what you are building:

- **agent** → [Authoring agent extensions](../../references/platform/extension-kinds/authoring-agent-extensions.md) (routes to [Developing agents](developing-agents.md) and [Agent packaging](../../references/platform/agent-packaging.md))
- **connector** → [Authoring connector extensions](../../references/platform/extension-kinds/authoring-connector-extensions.md) — the `register(ctx)` server entry, host ports, UI surfaces, and schema migrations
- **artifact** → [Authoring artifact extensions](../../references/platform/extension-kinds/authoring-artifact-extensions.md) (routes to [Authoring semantic artifact extensions](semantic-artifact-extensions.md))
- **skill** → [Authoring skill extensions](../../references/platform/extension-kinds/authoring-skill-extensions.md)
- **workflow** → [Authoring workflow extensions](../../references/platform/extension-kinds/authoring-workflow-extensions.md)

---

## Where to go next

- Choose your kind: [Extension kinds — choose your kind](../../references/platform/extension-kinds/)
- Ship the authored extension: [Extension publishing](extension-publishing.md)
- The model and runtime architecture: [Extensions hub](../../references/platform/extensions.md)
- The host-port grant/permission model: [Extension permissions](../../references/platform/extension-permissions.md)
- The TypeScript package conventions: [Building packages](building-packages.md)

Back to the [Developer Guide](README.md).
