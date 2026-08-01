# Extensions

Cinatra extensions install on a running instance from the marketplace. When an admin selects an extension, the runtime records the canonical `installed_extension` manifest, verifies the extension's SDK ABI range and dependencies, materializes the extension into the runtime store, and activates its `register(ctx)` hook through the same activation contract as development. The host grants only approved SDK ports, then exposes the extension's agents, connectors, artifacts, skills, workflows, setup pages, settings pages, MCP tools, object types, and capability providers without rebuilding or redeploying. Archive, restore, update, and uninstall flow through the manifest gate. Teardown removes registered surfaces, preserves restorable data on archive, and deletes scoped settings and secrets only on hard removal.

This page is the canonical hub for the extension system. It covers the model, the five kinds, the live-install architecture, the host context and activation contract, the three-file manifest, runtime discovery, the lifecycle operations, registry and distribution, and the conformance gates that lock the contract. The two companion how-to pages are [Extension authoring](../../guides/developer/extension-authoring.md) (build one) and [Extension publishing](../../guides/developer/extension-publishing.md) (ship one).

For the broader package-authoring conventions an extension is built on, see [Building packages](../../guides/developer/building-packages.md). For the OAS Flow agent definition inside an agent extension, see [Developing agents](../../guides/developer/developing-agents.md).

---

## The extension model

An extension is a versioned, published package the host installs onto a running instance. Everything an extension contributes — capabilities, UI surfaces, object types, MCP tools — reaches the platform through one privileged port surface (`ExtensionHostContext`) and one activation entry point (`register(ctx)`). An extension never imports host internals (`@/lib/*`, `@/components/*`, `@/app/*`); it reaches every privileged capability through a port the host grants it.

Three things make the model uniform across kinds:

- **One canonical lifecycle gate.** The `installed_extension` table is the single source of truth for "what is installed and from where". Lifecycle status for every kind lives there; one row per `(organization_id, owner_level, owner_id, package_name)`, with a platform-wide sentinel for instance-level installs.
- **One activation path, two loaders.** A dev loader reads build-bundled extensions; a prod loader reads packages materialized into an on-disk store. Both normalize an extension to the same `ExtensionModule` and drive it through the same `register(ctx)` activation contract, so they cannot drift.
- **One frozen SDK ABI.** The author-facing contract — the host port surface, the `register`/`bootstrap`/`destroy` lifecycle, and the manifest fields — is the `@cinatra-ai/sdk-extensions` package, versioned by a single SDK ABI version. Extensions declare which ABI range they were built against; the loader refuses an incompatible extension before any of its code runs.

---

## The five kinds

The install-kind set is exactly five (`agent | connector | artifact | skill | workflow`). `dashboard` and `context` are not install kinds — a dashboard is a representation form a workflow or artifact may render, and a context slot is an agent feature; an MCP tool is a capability an extension registers, not a kind. Adding a genuinely new kind means writing and registering a new `ExtensionTypeHandler` (the connector handler is the reference example, `packages/extensions/src/connector-handler.ts`).

| Kind | Install unit + authority store | Contributes | UI / runtime surface | Uninstall / retention |
|---|---|---|---|---|
| **agent** | OAS package → `agent_templates`, `agent_template_versions`, agent-runtime disk mount, skills catalog | OAS spec, compiled plan, in/out schemas, approval + HITL policy, LLM config, MCP toolbox usage, agent/connector dependencies, trigger mode, auth policy, co-located `SKILL.md`, declared output object types | Bundled screens + instance tabs; data from the template row | Archive when depended on; hard uninstall removes skills, template, matches, and disk mount; run history is kept for audit |
| **connector** | Code package → MCP registration, catalog + access policy, setup/settings pages, provider/Nango/config stores | MCP modules and tools, setup pages, settings pages, Nango/credential handlers, catalog descriptors, status/readiness, config stores, email/CRM/blog/social/LLM provider facades, external-MCP registry, object types and object-sync adapters | Setup/settings surfaces; DB- and policy-gated routing | Deregisters MCP, routes, capability providers, catalog, and policy; scoped settings and secrets removed only on hard removal |
| **artifact** | Descriptor package → object/artifact registry | Semantic descriptor, object type, representation forms (`file` / `connectorRef` / `dashboard`), templates, the `satisfies` graph, matcher/authoring/validator skills, agent dependencies, confidence threshold, and an **optional extension-shipped `detail`/`preview` renderer** (`cinatra.artifact.ui`) | No setup page and no `register(ctx)`; the data/object surface, a dashboard representation when a dashboard form is declared, and the type's own view when a port-less `ui` renderer is shipped (otherwise the host's generic renderer) | Descriptor removal archives the descriptor when live artifact rows exist, so existing artifacts stay readable |
| **skill** | Content package → skills catalog, `SkillSource`, on-disk `SKILL.md` | One `SKILL.md` per skill, catalog rows, durable source content, agent matching, shell mountability | Shell/assistant-delivered; no app route of its own | Uninstall removes content and catalog rows and prunes skill matches; restore re-runs matching |
| **workflow** | BPMN + sidecar package → `workflow_template`, optional `dashboard_template`, workflow object types | Template and BPMN spec, agent tasks, approvals, schedule/dependency/retry/cancel policy, an optional dashboard sidecar, workflow/dashboard launcher and status portlets, workflow object types | Workflow runtime plus a DB-rendered dashboard when a sidecar is present | Uninstall/archive archives the dashboard template and instances; instantiated workflows embed snapshots so history survives |

Asset and entity packages are not separate extension kinds — their MCP primitives and UI surfaces ship as workspace packages compiled into the platform. The extension registry is a deliberately small surface.

> **`ObjectSyncAdapter` is not a connector.** The object-store outbound-sync framework uses `ObjectSyncAdapter` for its interface, registry, config table, and `adapter_id` column. A connector extension is an integration to an external system; an `ObjectSyncAdapter` mirrors a Cinatra object out to an external CRM/CMS. They are orthogonal.

---

## Live-install architecture

The runtime resolves three questions independently, and keeps them separated on purpose:

1. **Is this extension installed and reachable?** — answered by the canonical `installed_extension` manifest (the coarse lifecycle gate).
2. **At runtime, which capabilities are currently active for this actor?** — answered by the single active-manifest dispatcher intersecting the lifecycle gate with each kind's per-actor visibility reader.
3. **How does the extension's compiled code reach the host?** — answered by one of two loaders (dev static-bundle, prod runtime-package), both driving the same activation contract.

### The canonical manifest gate and the single active-manifest dispatcher

`installed_extension` is the uniform active gate. The status enum is `active | archived | locked`. Only one function — `transitionExtensionLifecycle` (`packages/extensions/src/lifecycle-primitive.ts`) — may write `installed_extension.status`; every code path (UI server actions, MCP handlers, install adapters, boot/reload) routes through it, fronted by the canonical gate `enforceCanonicalManifest` (`packages/extensions/src/canonical-gate.ts`). A locked row rejects destructive operations; an extension marked required-in-prod is locked-in-prod.

All "what is active right now" discovery flows through one dispatcher, `discoverActiveCapabilities` (`packages/extensions/src/runtime-discovery.ts`), with authority split deliberately:

```
installed_extension (active|locked)        ← the UNIFORM lifecycle gate
        │   "is this (kind, packageName) live?"  — no per-actor visibility
        ▼
   group by kind
        ▼
ExtensionTypeHandler.listActive({ actor, scope, manifests })   ← the per-kind VISIBILITY authority
        │   "of the live packages, which may THIS actor see, and what are their native descriptors?"
        ▼
   active capability descriptors
```

- **`installed_extension` is the coarse lifecycle gate**, not a visibility authority. It answers only "is this `(kind, packageName)` `active|locked`?".
- **Each kind's native store is the capability + visibility authority** (`agent_templates`; the skills catalog + `SkillSource` + on-disk `SKILL.md`; the object/artifact registry; `workflow_template` + `dashboard_template`; the connector capability set). Its reader facet returns the scope's visible rows, then keeps only those the gate reports live.
- **Discovery is the intersection** of (lifecycle-live gate) ∩ (scoped native read). A stale native read can never re-expose an uninstalled capability — the gate suppresses it (the split-brain guard).

The host-wired entry point:

```ts
import { discoverActiveExtensionCapabilities } from "@cinatra-ai/extensions/runtime-discovery-host";

const discovered = await discoverActiveExtensionCapabilities({ kind: "agent", actor, scope });
const agents = (discovered.byKind.agent ?? []) as AgentTemplateRecord[];
// discovered.unmigratedKinds lists kinds whose handler has no reader facet (or is unregistered).
```

Each kind's handler implements the reader facet on `ExtensionTypeHandler` (in `@cinatra-ai/extension-types`):

```ts
listActive?(input: { actor: Actor; scope: ExtensionDiscoveryScope; manifests: ActiveExtensionManifest[] }): Promise<unknown[]>;
readActive?(input: { actor: Actor; scope: ExtensionDiscoveryScope; manifest: ActiveExtensionManifest }): Promise<unknown | null>;
```

A handler that lacks `listActive` contributes nothing and is recorded in `unmigratedKinds` (never silently dropped, never fatal); a reader that throws is isolated to its own kind.

The visibility envelope passed in is `ExtensionDiscoveryScope`, resolved by the host from the session and approved-vendor state — never from the MCP actor envelope — and **fail-closed**: a session with no active org or team membership sees only public + platform-visible rows, never "everything active".

```ts
type ExtensionDiscoveryScope = {
  userId: string | null;
  organizationId: string | null;
  teamIds: string[];
  projectIds?: string[];
  vendorScope?: string | null;   // npm vendor scope whose private rows the actor may see
  platformRole?: "platform_admin" | "member";
};
```

### Dual loader, single `register(ctx)` activation

Two loaders feed the same activation driver:

- **Dev static-bundle loader** (`src/lib/static-bundle-loader.ts`, entry `loadStaticBundleExtensions`) activates build-bundled extensions surfaced through the generated manifest. Before activating, it drops records whose `installed_extension` effective status is `archived` (the tombstone guard, fail-open if the boot-time status read throws).
- **Prod runtime-package loader** (`packages/sdk-extensions/src/runtime-loader.ts`, entry `runRuntimePackageActivation`, default store `/data/extensions/packages`) discovers packages materialized into an on-disk store and activates them. A package dropped into the store is discovered and registered on boot without rebuilding the image.

Both normalize each record to a `LoaderRecord` (a subset of `NormalizedExtensionRecord`) and hand it to the shared, pure driver `runStaticBundleActivation` (`packages/sdk-extensions/src/loader.ts`), which runs three host-orchestrated phases (`packages/sdk-extensions/src/activate.ts`):

1. **Register-all** (`activateExtensionModule`, failure-isolated per module): ABI gate → config gate → `register(ctx)`.
2. The host records capabilities for the registered set.
3. **Bootstrap-all** (`bootstrapExtensionModule`): runs after every module has registered, so a module's `bootstrap` can rely on its peers' capabilities.

`destroyExtensionModule` runs the `destroy(ctx)` teardown hook on hot-reload or uninstall.

Two gates run before any extension code executes:

- **ABI gate (both loaders).** The record's `cinatra.sdkAbiRange` must satisfy the host's frozen SDK ABI version, enforced before the module is imported (importing runs the module's top-level code). `isSdkAbiRangeSatisfied` fails closed on a malformed or unsatisfied range.
- **Integrity gate (runtime-package loader only).** The runtime loader accepts a `verifyIntegrity` hook the host wires to a digest check, refusing import when a materialized bundle fails verification. It also fails closed on ambiguous package identity (more than one store record for a name) and refuses a `serverEntry` that escapes its package dir. The dev loader has no integrity gate — its records are build-bundled, already-trusted first-party code.

### The host context — 14 ports on SDK ABI 2

`register(ctx)` receives an `ExtensionHostContext` (`packages/sdk-extensions/src/host-context.ts`), the privileged port surface the host passes the extension. The port set is empirically derived from what extensions actually need; it is frozen on SDK ABI 2, and no port may be added or changed without a major ABI bump. There are 14 ports:

| Port | Purpose |
|---|---|
| `settings` | Non-secret per-extension configuration persistence (`get`/`set`/`delete`). |
| `secrets` | Credential storage, deliberately separate from non-secret settings. |
| `nango` | Nango OAuth gateway access; render-time getters for connector setup/settings pages. |
| `authSession` | Current actor / session (`getActor`, `requireOrganizationId`). |
| `mcp` | MCP tool registration, self-client primitive calls, external-server registry, public MCP base URL. |
| `objects` | Object-type registration, object read/write, version history. |
| `jobs` | Background job enqueue + worker registration. |
| `notifications` | Host notification emission. |
| `ui` | UI surface registration — setup surface, settings surface, named actions. |
| `logger` | Structured logging scoped to the extension. |
| `runtime` | Runtime mode / environment flags, public base URL. |
| `capabilities` | Capability/facade provider registration and resolution (how a connector advertises what it can do without dependents pinning a concrete provider). |
| `telemetry` | Usage/cost telemetry emission; fire-and-forget by contract (must not throw or block). |
| `db` | Opaque scoped DB handle — least-privilege; the exceptional escape hatch, not the default data path. |

The canonical list is `HOST_PORT_NAMES`. The surface is presented in full to the author, and least-privilege is enforced at runtime: the host's grant-aware factory supplies only the subset the manifest's `requestedHostPorts` declares and an admin approves, and fail-louds on an ungranted or unwired port. (`db` is reserved — accessing it fail-louds until its scoped runtime is wired; route configuration through `settings` and credentials through `secrets`.) For the per-port consumption rules, see [Extension authoring](../../guides/developer/extension-authoring.md); for the permission/grant model, [Extension permissions](extension-permissions.md).

---

## The three-file manifest

Every extension carries three manifest files:

1. **`package.json` `cinatra` block** — the live manifest (`CinatraManifest`, `packages/sdk-extensions/src/manifest.ts`). Declares `kind`, `apiVersion`, the loader/ABI fields (`serverEntry`, `requestedHostPorts`, `sdkAbiRange`, `uiSurface`, `migrationsDir`, `configSchema`, `devFixtures`), and the canonical `dependencies` graph. (The legacy `migrations` JSON-DSL field is retired and rejected fail-closed — use `migrationsDir`.)

   ```jsonc
   {
     "name": "@cinatra-ai/google-calendar-connector",
     "version": "0.1.0",
     "cinatra": {
       "apiVersion": "cinatra.ai/v1",
       "kind": "connector",
       "serverEntry": "./register",
       "requestedHostPorts": ["mcp", "settings", "authSession"],
       "sdkAbiRange": "^2",
       "devFixtures": "cinatra/dev-fixtures.json",
       "dependencies": [
         {
           "packageName": "@cinatra-ai/nango-connector",
           "kind": "connector",
           "edgeType": "runtime",
           "versionConstraint": { "kind": "semver-range", "range": "*" },
           "requirement": "required"
         }
       ]
     }
   }
   ```

2. **`.cinatra-published.json`** — the published-provenance sidecar the publish flow writes: the package name and version, a payload digest (e.g. `oasSha256` for an agent), and `publishedAt`. It records what was actually published so install can verify provenance.

   ```jsonc
   {
     "packageName": "@cinatra-ai/auditor-agent",
     "packageVersion": "0.1.3",
     "oasSha256": "8e682ef1241487727e56a806a58479985424679145b5061ad9a5eeefbf1fc222",
     "publishedAt": "2026-05-15T18:22:37.388Z"
   }
   ```

3. **A per-kind sidecar** — the kind's payload: `cinatra/oas.json` (agent), `cinatra/workflow.bpmn` (+ optional `cinatra/dashboard.json`) (workflow), an `artifact` descriptor block (artifact), `skills/<slug>/SKILL.md` directories (skill), or a `src/register.ts` server entry plus setup/settings pages (connector).

`cinatra.dependencies` is the **canonical, capability-based** cross-kind dependency graph (`ExtensionDependency`, `packages/sdk-extensions/src/dependencies.ts`). Each edge carries the depended-on `packageName`, the depended-on `kind`, an `edgeType` (`runtime | install-time | peer`), a `versionConstraint`, and a `requirement`:

- **`required`** — the depender's normal successful capability cannot work without it. A missing package fails install/boot; an unconfigured-but-present connector fails run-start or opens a setup HITL.
- **`optional`** — a valid degraded path exists. Missing does not fail install/boot; the runtime records a skipped capability.

Dependencies are capability-based, not provider-pinned: an email agent depends on the email-send facade plus a resolution rule requiring at least one concrete provider (Gmail or Resend), not a hard Gmail pin. Legacy `agentDependencies` / `connectorDependencies` maps normalize into `dependencies` via `normalizeLegacyDependencies` (pure and deterministic, so a drift gate can assert the normalization).

The `NormalizedExtensionRecord` shape both loaders emit is also defined in `manifest.ts` — keeping the dev and prod loaders on one record type is what guarantees they cannot diverge.

---

## Lifecycle operations

The `extensionRegistry` in `@cinatra-ai/extensions` dispatches every operation to the right kind handler. The MCP primitives are admin-gated; the same surface is reachable from the UI. Lifecycle actions affect installed state; registry actions (below) affect published versions.

- **install** (`extensions_install`) — routes to the kind handler: the agent handler resolves the dependency tree, fetches and validates each package, upserts the template row and a version snapshot, registers declared object types, and installs declared skills; the skill handler persists a `skill_packages` row and queues a skill-match recompute. Both write the provenance record. Marketplace install **activates the extension on the running instance** — its registered surfaces appear after activation, with no redeploy.
- **update** (`extensions_update`) — replaces the installed version with a newer one, applies anything the new version declares (new object types, new skill bundles), and bumps the persisted version. Run history and HITL state are preserved.
- **archive** (`extensions_archive`) — reversible suspension. Flips status to `archived`; dependent run/version rows stay intact; normal access stops while past work remains available. Idempotent.
- **restore** (`extensions_restore`) — the reverse of archive. Flips status back to `active`. Idempotent.
- **uninstall** (`extensions_uninstall`) — the dispatcher checks dependents and prior use first: an active dependent refuses (uninstall the dependent first); an archived dependent forces archive to preserve the dependency closure; a used-but-undepended extension forces archive so run history stays valid; an unused, undepended extension is hard-deleted via the handler's `uninstall`.
- **force-delete** (`extensions_force_delete`) — the audited destructive escape hatch for one installed version. Pre-cleans the FK source tables, writes a snapshot to the lifecycle audit table **before** deletion, then removes the primary row. Requires an explicit destructive confirmation. Scope is DB + on-disk dir for one version; it does **not** touch the registry (the package stays re-installable).
- **purge** — the "gone everywhere" path (registry, all versions, plus DB rows + on-disk dir), split into a dry-run MCP tool (`extensions_purge`) that returns the blast radius and a `digest`, and the admin-gated `extensions_purge_execute` MCP tool that performs the destructive saga (it requires the exact `digest` from a fresh dry-run plus `confirmDestructive: true`). The `cinatra extensions purge` CLI drives the same execution path. Purge quarantines every version tarball before touching the registry so the operation is recoverable until the quarantine dir is deleted.

Teardown semantics: `archive` preserves history and configuration; hard removal (uninstall/force-delete/purge) is what removes scoped settings and secrets. Use Archive for reversible suspension; reach for uninstall/purge only when scoped state should actually be removed. **Use these lifecycle operations — do not edit manifest rows or delete package-store files by hand.**

Full lifecycle reference, including the canonical transition matrix and locked semantics: [Extension lifecycle and distribution](extension-lifecycle.md).

---

## Registry, visibility, and distribution

### Marketplace

The marketplace lives at **Administration → Marketplace** (`/configuration/marketplace`). It reads the configured registry, applies the server-side visibility filter, and renders a per-row CTA against the workspace's current extension table — `Install Now`, `Update Now`, `Installed`, or `Restore` — depending on whether the package is absent, present at an older version, present at the current version, or archived. With no remote registry connected, the empty-state CTA points to the registry-configuration tab.

### Origin and visibility

Every installed extension carries an `origin` record (package name, version, scope, destination pointer, registry URL, visibility, optional import provenance). No secrets live in `origin` — the destination pointer is an opaque key into the encrypted destinations table.

**Visibility is a server-side contract, not UI styling.** Public rows are universally visible; private rows are visible only when their origin scope matches the reading instance's vendor scope. The filter runs at every server read path that touches extension tables (the marketplace screen, MCP `extensions_search`, the active/archived catalog readers). UI-only filtering is forbidden.

### Registry model

Cinatra publishes to and installs from a Verdaccio registry (`registry.cinatra.ai`) under the `@cinatra-ai/*` npm scope, with separate **private** (the publishing instance's own destination) and **public** (the shared registry every instance can read) destinations. Published versions are immutable — the registry's `unpublish` directive is locked to `nobody`, verified fail-closed at boot. In development the host consumes extensions as git checkouts via `cinatra instance setup dev`; in production it installs published packages into the runtime store.

Full distribution mechanics — the submit → approve → promote → registry-sync pipeline, immutable versions, and dev-checkout vs prod-package-store consumption — are in [Extension publishing](../../guides/developer/extension-publishing.md).

---

## Conformance gates

The "extensible" claim is the conjunction of a runtime contract test and structural gates (now pinned-empty zero-floor — see [Extension IoC safeguards](extension-ioc-safeguards.md)):

- **Golden discovery conformance** (`packages/extensions/src/__tests__/extension-discovery-conformance.test.ts`) — asserts the lifecycle suppression / split-brain guard, the visibility authority, `locked`-is-discoverable, unmigrated-kind recording, and reader-throw isolation through the public dispatcher. It is the template every kind's reader must satisfy.
- **Activation parity** — both loaders emit the same `NormalizedExtensionRecord` and run the identical activation driver, so dev and prod activation cannot drift.
- **Core → extension import ban** (`scripts/audit/core-extension-import-ban.mjs`) — forbids *any* core (`src/`) named-extension import (baseline pinned empty: any edge fails CI).
- **Core → extension instance-coupling ban** (`scripts/audit/core-extension-instance-coupling-ban.mjs`) — forbids *any* hardcoded extension-instance string/path reference in core (baseline pinned empty).
- **Naming conformance** (`packages/extensions/src/__tests__/naming-conformance.test.ts`) — enforces the package-naming, scope, and kind rules on every extension `package.json`.
- **Dev-fixtures gate** (`scripts/audit/dev-fixtures-gate.mjs`) — enforces the declarative-only dev-fixtures contract.
- **README gate** (`scripts/audit/extension-readme-gate.mjs`) — enforces the marketplace-ready README structure.
- **License gate** (`scripts/audit/extension-license-gate.mjs`) — enforces a policy license on every extension manifest.

The canonical IoC definition and the per-change review contract live in [Extension IoC safeguards](extension-ioc-safeguards.md) — read it before changing anything in the extension/discovery path.

---

## Index

Build and ship an extension:

- [Extension authoring](../../guides/developer/extension-authoring.md) — choose a kind, the repo + file shape, the three-file manifest, dependencies, host-port grants, registering setup/settings UI, data ownership, and local validation.
- [Extension publishing](../../guides/developer/extension-publishing.md) — the registry model, the submit → approve → promote → registry-sync pipeline, immutable versions, and dev-checkout vs prod-package-store consumption.

Slice references:

- [Extension lifecycle and distribution](extension-lifecycle.md) — the canonical manifest, lifecycle states, the transition matrix, locked semantics.
- [Extension permissions](extension-permissions.md) — the permissions architecture and the host-port grant model.
- [Extension access contract](extension-access-contract.md) — the uniform install-time "who can use this" contract for every kind.
- [Extension data ownership](extension-data-ownership.md) — how an extension owns its settings, secrets, and object data.
- [Extension IoC safeguards](extension-ioc-safeguards.md) — the conformance test + ratchet gates + the per-change review checklist.
- [Extension dev fixtures](extension-dev-fixtures.md) — the declarative dev-mode fixtures contract.
- [Extension README contract](extension-readme.md) — the marketplace-ready README every extension ships.

Per-kind and related references:

- [Agent packaging](agent-packaging.md) — the agent-kind packaging conventions.
- [Building packages](../../guides/developer/building-packages.md) — the TypeScript package conventions an extension is built on.
- [Authoring semantic artifact extensions](../../guides/developer/semantic-artifact-extensions.md) — the artifact-kind authoring guide.
- [Objects layer](objects-layer.md) — the typed object store extensions write into.

Back to the [Developer Guide](../../guides/developer/README.md).
