# Extension authoring

This page is the build-it walkthrough for a Cinatra extension. It assumes the model and architecture from the [Extensions hub](../../references/platform/extensions.md) — read that first if you have not. Once authored, ship the extension with [Extension publishing](extension-publishing.md).

Cinatra extensions install on a running instance from the marketplace. When an admin selects an extension, the runtime records the canonical `installed_extension` manifest, verifies the extension's SDK ABI range and dependencies, materializes the extension into the runtime store, and activates its `register(ctx)` hook through the same activation contract as development. The host grants only approved SDK ports, then exposes the extension's surfaces without rebuilding or redeploying. Authoring an extension means making that activation contract resolvable: the manifest the loaders read, the `register(ctx)` hook they call, and the kind-specific payload they materialize.

---

## 1. Choose a kind

An extension is exactly one of five kinds, declared as `cinatra.kind` in `package.json`:

| Kind | Build it when you want to add… | Install unit |
|---|---|---|
| **agent** | An OAS Flow agent — a role the platform can run. | An OAS package (`cinatra/oas.json` + co-located skills). |
| **connector** | An integration to an external system, or a provider behind a capability facade. | A code package with a `register(ctx)` server entry and setup/settings pages. |
| **artifact** | A semantic content type with matcher/authoring skills. | A descriptor package declaring an `artifact` block. |
| **skill** | One or more `SKILL.md` skills delivered to agents/the assistant. | A content package of `skills/<slug>/SKILL.md` directories. |
| **workflow** | A multi-step BPMN process orchestrating agents and approvals. | A BPMN + sidecar package, optionally with a dashboard. |

`cinatra.kind` is singular (`"agent" | "connector" | "artifact" | "skill" | "workflow"`) and is the authoritative signal for lifecycle, dispatch, and discovery. The directory suffix is a strong hint validated by the naming-conformance test, but the manifest wins on disagreement.

Per-kind authoring procedure lives alongside this page:

- agent → [Agent packaging](../../references/platform/agent-packaging.md) and [Developing agents](developing-agents.md)
- artifact → [Authoring semantic artifact extensions](semantic-artifact-extensions.md)
- skill → the skill payload section below + the [Objects layer](../../references/platform/objects-layer.md) for matching
- connector / workflow → the file-shape and `register(ctx)` sections below

---

## 2. Repo and file shape

An extension is a versioned, scoped npm-style package. The directory name equals the unscoped package name (1:1, kebab-case), with the kind at the end so the registry reads as a noun phrase:

```
extensions/<scope>/<slug>-<kind>/
  package.json                 # the cinatra manifest block
  .cinatra-published.json      # published-provenance sidecar (written by publish)
  README.md                    # marketplace-ready README (gate-enforced)
  LICENSE
  cinatra/ | src/ | skills/    # the per-kind payload
```

Per-kind required files:

| Kind | Required files |
|---|---|
| **agent** | `package.json`, `LICENSE`, `cinatra/oas.json`, `.cinatra-published.json`, `skills/<slug>/SKILL.md` |
| **connector (provider)** | `package.json`, `src/index.ts`, `src/register.ts`, `src/setup-page.tsx`, the setup-impl component, `src/deps.ts` |
| **connector (facade)** | `package.json`, `src/index.ts`, the contract type, the facade implementation, the provider registry |
| **artifact** | `package.json`, `src/index.ts` (re-exports), the `artifact` descriptor block |
| **skill** | `package.json`, `skills/<slug>/SKILL.md` (one directory per skill) |
| **workflow** | `package.json`, `cinatra/workflow.bpmn`, optional `cinatra/dashboard.json`, `src/index.ts` |

The package exposes the activation contract through `package.json` `exports` subpaths. `./register` is the one universal contract; `./setup-page`, `./settings-page`, and `./mcp-module` are used by connector/UI/MCP-capable kinds:

```jsonc
"exports": {
  ".": "./src/index.ts",
  "./register": "./src/register.ts",
  "./mcp-module": "./src/mcp/module.ts"
}
```

This is the split-entrypoint model: a server entry (`./register`) runs the privileged half under `server-only`; client widget entries (`./setup-page`, `./settings-page`) carry true client surfaces. Keep `server-only`/DB code out of the `"use client"` entrypoints.

### The `register(ctx)` server entry

The server entry exposes `register(ctx)` (the host calls it once at activation with the granted port subset) and optionally `bootstrap(ctx)` (runs after every extension has registered, so it can rely on peers' capabilities) and `destroy(ctx)` (teardown on hot-reload/uninstall):

```ts
import { defineServerEntry } from "@cinatra-ai/sdk-extensions";
import type { ExtensionHostContext } from "@cinatra-ai/sdk-extensions";

export default defineServerEntry({
  register(ctx: ExtensionHostContext) {
    ctx.mcp.registerTool({
      name: "my_tool",
      description: "…",
      inputSchema: mySchema,           // an opaque Standard Schema value, e.g. a zod schema
      handler: async (input) => { /* return a plain result; the host wraps it */ },
    });
    ctx.capabilities.registerProvider("email-send", { packageName: "@scope/my-connector", impl });
  },
});
```

You may export `register`/`bootstrap`/`destroy` as named functions, or return a full module via `defineExtension({ server, admin, config })`. The loader normalizes either shape and preserves the whole activation shape (server, config gate, bootstrap, destroy) — do not reduce the export to just `{ register }`.

A `config` entrypoint can gate activation: `config.enabled === false` short-circuits, and `config.resolve({ installedPackages })` enables dynamically (for example, only when an optional dependency is present).

---

## 3. The three-file manifest

Author the manifest under the `package.json` `cinatra` block. The published-provenance sidecar (`.cinatra-published.json`) and the kind sidecar (`cinatra/oas.json`, `cinatra/workflow.bpmn`, `skills/<slug>/SKILL.md`, etc.) complete the trio.

```jsonc
{
  "name": "@cinatra-ai/<slug>-<kind>",
  "version": "0.1.0",
  "cinatra": {
    "apiVersion": "cinatra.ai/v1",
    "kind": "connector",
    "serverEntry": "./register",
    "sdkAbiRange": "^2",
    "requestedHostPorts": ["mcp", "settings", "authSession"],
    "uiSurface": "schema-config",
    "devFixtures": "cinatra/dev-fixtures.json",
    "dependencies": [ /* canonical cross-kind edges */ ]
  }
}
```

Manifest fields (`CinatraManifest`, `packages/sdk-extensions/src/manifest.ts`):

- **`kind`, `apiVersion`** — the identity fields every extension declares.
- **`serverEntry`** — the compiled server entry the loaders dynamically import (`./register`). Omit for a payload-only kind (a skill bundle).
- **`sdkAbiRange`** — the SDK ABI range the extension was built against. Declare `"^2"` to require any SDK ABI 2.x host. An unpinned (`*` / absent) range is treated as compatible; a malformed range fails closed. Build against the current `SDK_EXTENSIONS_ABI_VERSION` exported from `@cinatra-ai/sdk-extensions`.
- **`requestedHostPorts`** — the least-privilege ports the extension requests (see below).
- **`uiSurface`** — `schema-config` (the host renders a generic schema-driven form from `configSchema` — fully hot-pluggable) or `bundled-react` (a bespoke setup page that ships in the build).
- **`devFixtures`** — a path to a declarative dev-mode fixtures file (see [Extension dev fixtures](../../references/platform/extension-dev-fixtures.md)).
- **`migrations`** — declarative, idempotent, extension-owned migration descriptors.
- **`dependencies`** — the canonical cross-kind dependency graph (below).

---

## 4. `cinatra.dependencies` — capability-based, required vs optional

`cinatra.dependencies` is the canonical cross-kind dependency graph (`ExtensionDependency`, `packages/sdk-extensions/src/dependencies.ts`). Each edge:

```jsonc
{
  "packageName": "@cinatra-ai/nango-connector",
  "kind": "connector",                                   // the depended-on extension's kind
  "edgeType": "runtime",                                 // runtime | install-time | peer
  "versionConstraint": { "kind": "semver-range", "range": "*" },
  "requirement": "required"                              // required | optional
}
```

- **`required`** — normal successful capability cannot work without it. A missing package fails install/boot; an unconfigured-but-present connector fails run-start or opens a setup HITL.
- **`optional`** — a valid degraded path exists. Missing does not fail install/boot; the runtime records a skipped capability.

Declare dependencies **by capability, not by concrete provider.** An email-delivery agent depends on the email-send facade plus a rule requiring at least one concrete provider (Gmail or Resend), not a hard Gmail pin. This is what lets the host resolve a provider at runtime through `ctx.capabilities`.

`versionConstraint` is one of `semver-range`, `exact`, or `git-ref`. Legacy `agentDependencies` / `connectorDependencies` maps normalize into `dependencies` deterministically — prefer declaring canonical `dependencies` directly.

---

## 5. `requestedHostPorts` — request least privilege

The host passes `register(ctx)` an `ExtensionHostContext` with all 14 ports visible, but supplies only the subset your manifest's `requestedHostPorts` declares and an admin approves. The grant-aware host factory fail-louds on an ungranted or unwired port, so request exactly what you use:

| Port | Request when you need to… |
|---|---|
| `settings` | persist non-secret per-extension config |
| `secrets` | store credentials (separate from settings) |
| `nango` | use the Nango OAuth gateway / render connection status on setup pages |
| `authSession` | read the current actor or require an organization id |
| `mcp` | register MCP tools, call host primitives, read the public MCP base URL |
| `objects` | register object types, read/write objects, read version history |
| `jobs` | enqueue background jobs or register a worker |
| `notifications` | emit host notifications |
| `ui` | register setup/settings surfaces and named actions |
| `logger` | emit structured logs scoped to the extension |
| `runtime` | read runtime mode / flags / public base URL |
| `capabilities` | register or resolve capability/facade providers |
| `telemetry` | emit usage/cost events (fire-and-forget; never throw) |
| `db` | (reserved — accessing it fail-louds today; route config through `settings`, credentials through `secrets`) |

The canonical port list is `HOST_PORT_NAMES`. The permission/grant model that decides which requested ports an admin approves is in [Extension permissions](../../references/platform/extension-permissions.md).

---

## 6. Registering setup and settings UI through approved surfaces

Setup and settings UI register through `ctx.ui` (not by creating a filesystem route): `ctx.ui.registerSetupSurface(...)`, `ctx.ui.registerSettingsSurface(...)`, and `ctx.ui.registerAction({ id, handler })`. Registered surfaces appear after activation, with no new filesystem route created for each installed UI.

Two UI classifications (`uiSurface`):

- **`schema-config`** — declare the config as data in `configSchema`; the host renders a generic schema-driven form. Fully hot-pluggable: a freshly installed extension's config UI appears on the running instance with no rebuild.
- **`bundled-react`** — a bespoke React setup/settings page. Under the App Router, RSC client chunks are build-known, so a bundled-react component's **code** must ship in the build; its existence and routing are still DB-driven and dynamic. Prefer `schema-config` when the form is expressible as data.

Visual primitives come from `@cinatra-ai/sdk-ui` (a peer dependency) and the Cinatra-owned shadcn design registry — never from the app's `@/components/*`. `ctx.ui` registers surfaces; it is not a bag of host components.

---

## 7. Data ownership, secrets, and archive/restore/teardown

An extension owns its own data and reaches it only through ports:

- **Config** → `ctx.settings` (non-secret, per-extension namespace).
- **Credentials** → `ctx.secrets` (deliberately separate from settings).
- **Structured records** → `ctx.objects` (registered object types with version history).
- **Scoped DB** → `ctx.db` is the reserved, exceptional escape hatch — not the default data path.

Write a `destroy(ctx)` hook that deregisters the surfaces your `register(ctx)` added (MCP tools, capability providers, workers). The lifecycle then preserves or removes your data correctly:

- **Archive preserves history and configuration** — the extension is suspended; settings, secrets, and object rows remain, so Restore is non-destructive.
- **Hard removal removes scoped settings and secrets** — uninstall/force-delete/purge clean up the extension's own scoped state.

Author for both: keep object data restorable across archive, and make `destroy` idempotent. Full model: [Extension data ownership](../../references/platform/extension-data-ownership.md). Declarative demo data for dev boots: [Extension dev fixtures](../../references/platform/extension-dev-fixtures.md).

---

## 8. The README contract

Every extension ships a marketplace-ready `README.md` at its root — an end-user-facing, value-forward description in the same register the marketplace renders next to the one-line `package.json` description. The structure (a display name, a value-forward paragraph, an optional "Works with" list, and a "What you can do" outcomes list) is enforced by a CI gate. See [Extension README contract](../../references/platform/extension-readme.md).

---

## 9. Local validation and the conformance gates

Before publishing, satisfy the gates the platform holds every extension to:

- **`pnpm typecheck`** — the activation contract typechecks against the SDK; `register(ctx)` matches `ExtensionHostContext`.
- **Naming conformance** (`packages/extensions/src/__tests__/naming-conformance.test.ts`) — directory == unscoped package name, kind-at-end, allowed scope for the kind.
- **README gate** (`scripts/audit/extension-readme-gate.mjs`) — the README structure.
- **License gate** (`scripts/audit/extension-license-gate.mjs`) — a policy license in the manifest.
- **Dev-fixtures gate** (`scripts/audit/dev-fixtures-gate.mjs`) — if you declare `devFixtures`, the file is declarative data only (no SQL/JS/secrets; only `setting` and `object` surfaces).
- **Discovery conformance** (`packages/extensions/src/__tests__/extension-discovery-conformance.test.ts`) — if you add a new kind's reader facet, it must satisfy the golden discovery contract (lifecycle suppression, visibility authority, reader-throw isolation).
- **Manifest validity** — `requestedHostPorts` must be real port names, `sdkAbiRange` must be a supported range, and `dependencies` edges must be well-formed; the manifest generator flags unknown values at generation time.

Beyond these author-time gates, the production loader applies a runtime trust check before importing your code in-process: it verifies the tarball's integrity and — in the signature-required window — an Ed25519 signature against a host-trusted key. An unsigned package is import-denied once enforcement is on, and a package that declares host migrations cannot import unless it is signed. See [Extension signing and the activation trust root](extension-publishing.md#extension-signing-and-the-activation-trust-root).

The IoC review contract every change is held to is in [Extension IoC safeguards](../../references/platform/extension-ioc-safeguards.md).

---

## Where to go next

- Ship the authored extension: [Extension publishing](extension-publishing.md)
- The model and runtime architecture: [Extensions hub](../../references/platform/extensions.md)
- The host-port grant/permission model: [Extension permissions](../../references/platform/extension-permissions.md)
- The TypeScript package conventions: [Building packages](building-packages.md)

Back to the [Developer Guide](README.md).
