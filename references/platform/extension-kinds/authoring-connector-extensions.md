# Authoring connector extensions

Audience: developers shipping a `kind: "connector"` extension — an integration to an external system, or a provider behind a capability facade.

The connector is the **one kind that is a code package with a `register(ctx)` server entry.** It runs privileged server code at activation, requests host ports, registers MCP tools and capability providers, ships setup/settings UI, and — when it owns Postgres tables — declares schema migrations the host runs. The four declarative kinds (agent, artifact, skill, workflow) do **not** go through this path; if you landed here for one of those, start at [Extension kinds — choose your kind](./).

## What the kind contributes

The connector install unit is a code package → MCP registration, the catalog + access policy, setup/settings pages, and provider/Nango/config stores. It contributes MCP modules and tools, setup pages, settings pages, Nango/credential handlers, catalog descriptors, status/readiness, config stores, email/CRM/blog/social/LLM provider facades, the external-MCP registry, object types, and object-sync adapters. The runtime surface is DB- and policy-gated routing. Teardown deregisters MCP, routes, capability providers, the catalog, and policy; scoped settings and secrets are removed only on hard removal.

> **`ObjectSyncAdapter` is not a connector.** A connector is an integration to an external system; an `ObjectSyncAdapter` mirrors a Cinatra object out to an external CRM/CMS. They are orthogonal.

## Repo and file shape

A connector is a versioned, scoped npm-style package. The directory name equals the unscoped package name (1:1, kebab-case), with the kind at the end:

```
extensions/<scope>/<slug>-connector/
  package.json                 # the cinatra manifest block
  .cinatra-published.json      # published-provenance sidecar (written by publish)
  README.md                    # marketplace-ready README (gate-enforced)
  LICENSE
  cinatra/
    config.json                # connection access-scope declaration (see below)
  src/                         # the connector code payload
```

Per-kind required files:

| Connector flavor | Required files |
|---|---|
| **connector (provider)** | `package.json`, `cinatra/config.json`, `src/index.ts`, `src/register.ts`, `src/setup-page.tsx`, the setup-impl component, `src/deps.ts` |
| **connector (facade)** | `package.json`, `cinatra/config.json`, `src/index.ts`, the contract type, the facade implementation, the provider registry |

The package exposes the activation contract through `package.json` `exports` subpaths. `./register` is the one universal contract; `./setup-page`, `./settings-page`, and `./mcp-module` carry the connector's UI and MCP surfaces:

```jsonc
"exports": {
  ".": "./src/index.ts",
  "./register": "./src/register.ts",
  "./mcp-module": "./src/mcp/module.ts"
}
```

This is the split-entrypoint model: a server entry (`./register`) runs the privileged half under `server-only`; client widget entries (`./setup-page`, `./settings-page`) carry true client surfaces. Keep `server-only`/DB code out of the `"use client"` entrypoints.

> **You author in TypeScript source; the package you publish ships a BUILT artifact.** The source shape above (`./register` → `./src/register.ts`) is what you author in-repo and what the first-party static-bundle path compiles at image build. The marketplace **runtime store activates built, Node-importable JavaScript artifacts only**: the published package's `cinatra.serverEntry` must resolve to a `.mjs`/`.cjs`/`.js` file inside the tarball (a top-level `register.mjs` is the recommended shape) — a `.ts` source entry is **refused at install** (and at submit-time preflight). You do not hand-build this: publishing through the release workflow runs the canonical builder (`scripts/extensions/build-server-entry.mjs`), which bundles your source entry into a top-level `register.mjs` and rewrites the *packed* manifest to `"serverEntry": "./register.mjs"` (your source tree is untouched). The full normative contract — the resolver semantics, the recommended published shape, and the `dependencyMode` library-bundling options — is [The runtime-store `serverEntry` contract](../extension-server-entry-artifact.md). Do not hand-roll a tarball that points `serverEntry` at `.ts` source.

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

## The manifest

Author the manifest under the `package.json` `cinatra` block. The published-provenance sidecar (`.cinatra-published.json`) completes the package.

```jsonc
{
  "name": "@cinatra-ai/<slug>-connector",
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

Connector-relevant manifest fields (`CinatraManifest`, `packages/sdk-extensions/src/manifest.ts`):

- **`kind`, `apiVersion`** — the identity fields every extension declares.
- **`serverEntry`** — the server entry the loaders dynamically import. You declare the source subpath (`./register`) in-repo; the *published* package's manifest resolves it to a built ESM file (`./register.mjs`) — see the built-artifact note above.
- **`sdkAbiRange`** — the SDK ABI range the connector was built against. Declare `"^2"` to require any SDK ABI 2.x host. An unpinned (`*` / absent) range is treated as compatible; a malformed range fails closed. Build against the current `SDK_EXTENSIONS_ABI_VERSION` exported from `@cinatra-ai/sdk-extensions`.
- **`requestedHostPorts`** — the least-privilege ports the connector requests (see below).
- **`uiSurface`** — `schema-config` (the host renders a generic schema-driven form from `configSchema` — fully hot-pluggable) or `bundled-react` (a bespoke setup page that ships in the build).
- **`devFixtures`** — a path to a declarative dev-mode fixtures file (see [Extension dev fixtures](../extension-dev-fixtures.md)).
- **`devSetup`** — a package-relative path (recommended `./src/dev-setup`) to an **imperative dev-mode provisioning hook** module exposing a single `runDevSetup(ctx)` entry (`ExtensionDevSetupModule` in the SDK's `packages/sdk-extensions/src/dev-setup.ts`). On a dev boot the host's dev-only orchestration shell imports and invokes it **idempotently** so the connector can wire its OWN local docker fixture — mint a credential, register an instance row, push a widget config — through host services resolved on the hook context: core owns the orchestration mechanism, the connector owns its vendor provisioning. Dev-only, localhost-only, soft-fail (a hook returns a `created` / `already-wired` / `skipped` / `error` status and never throws to the shell); the imperative IO it needs (argv-based `docker exec`, HTTP probes) is supplied by the host through `ctx.helpers`, so the connector never imports `node:child_process` or `node:fs` for provisioning. NOT part of the frozen `register(ctx)` ABI, and distinct from `devFixtures` (declarative data). Adopted first by the WordPress and Drupal MCP connectors.
- **`envOverrides`** — a map from a process-environment variable NAME to the `settings:`/`secrets:` key it overrides (e.g. `{"NANGO_SERVER_URL": "settings:serverUrl"}`). The host's `settings`/`secrets` port serves such a key **env-first-else-DB**, so an operator can pin a connector setting via the environment while the env-var names stay in the connector's own manifest and core stays vendor-free. Validated host-side and fail-closed: a marketplace extension may claim only a namespaced env key (`CINATRA_EXT_<PKG>_*` derived from its own package name); a legacy non-namespaced name is honored only for a `resolution: "required"` system extension (SDK contract: `packages/sdk-extensions/src/env-overrides.ts`).
- **`migrationsDir`** — a package-relative directory of standard node-pg-migrate migration modules the HOST runs for trusted-signed installs (see [Shipping schema migrations](#shipping-schema-migrations)). The legacy `migrations` JSON-DSL field is retired and rejected fail-closed.
- **`dependencies`** — the canonical cross-kind dependency graph (below).

## Declaring connection access scope — `cinatra/config.json`

Every connector ships a `cinatra/config.json` file declaring how its **connections** — the individual connected external accounts users create through it — may be scoped. The declaration drives the connect-time scope picker and is enforced server-side; the user-facing model it feeds is [Connections: scopes, sharing, and revocation](../../../guides/user/connections-and-sharing.md).

The file has one governing `formatVersion` and, today, one config domain, `access`:

```jsonc
// cinatra/config.json — a recommendation (Gmail: a mailbox is personal by nature)
{
  "formatVersion": 1,
  "access": {
    "scope": { "default": "user" }
  }
}
```

```jsonc
// cinatra/config.json — an exclusive scope (an LLM-provider key connector such as openai)
{
  "formatVersion": 1,
  "access": {
    "scope": { "only": "admin" }
  }
}
```

### The scope vocabulary

`access.scope` takes one value from the full platform vocabulary:

`user | project | team | organization | workspace | admin`

These map to the scopes users see in the picker: Personal, Project, Team, Organization, Workspace, and Admins only.

### `default` vs `only` — recommendation vs lock

`access.scope` carries **exactly one** of two keys:

- **`default`** — a *recommendation*. The declared scope is **pre-selected** at connect time; the connection owner can freely choose any other scope. A `default` never auto-shares anything — pre-selecting `team` still requires the owner to confirm and pick a concrete team.
- **`only`** — an *exclusive* scope: the declared scope is the **only** scope that may ever have access to the connector's connections. The picker renders locked at that value, and — independently of the UI — the server **rejects** any broader grant with a typed error. Two values matter most:
  - `only: "user"` — strictly per-actor. Connections are never shareable; the sharing surface is removed entirely and the connections never enter shared listings.
  - `only: "admin"` — usable only by the owning organization's admins.

Declaring **both** `default` and `only` is an error; a present `access.scope` object with **neither** key is an error. An **absent file** is a hard failure at both submit and install — every connector must ship `cinatra/config.json`. A file that is present and valid but declares no `access.scope` resolves to `default: "admin"` — the most conservative recommendation, pre-selected but changeable.

`only` governs the *use* of connections. Who may **manage** the connector itself (install, archive, configure) remains organization-admin RBAC — it is not package-definable, by `cinatra/config.json` or anything else.

### Fail-closed validation, at submit and at install

The file is validated **strictly and fail-closed**, both when you submit to the marketplace and again on every install:

- An **absent `cinatra/config.json`** hard-fails — at submit and at install.
- An **unknown top-level domain** (anything that is not a recognized sibling of `access`) hard-fails.
- An **unknown key inside a known domain** hard-fails — a misspelled `scpoe` is a rejection, never a silent fallback to defaults.
- An unrecognized scope value, a missing `formatVersion`, or the both-keys / neither-key cases above are all rejections.

**Protected slugs.** The LLM-provider key connectors — `openai`, `anthropic`, `gemini` — are validator-forced to `only: "admin"`. A submission for one of these slugs declaring anything else (including a plain `default: "admin"`) fails validation. `gmail` ships `default: "user"`.

### Packaging: put `cinatra/` in the `files` allowlist

The `cinatra/` directory must be included in the package's `package.json` `files` allowlist, or the published tarball will not contain the declaration — a typical connector `files` list of `["src", …]` excludes it. The packlist gate asserts `cinatra/config.json` is present in the pack output for every `kind: "connector"` package, and the submit/install validator (including the protected-slug rule) runs against the packed file.

### Forward compatibility

Future configuration domains land as **siblings of `access`** in this same file, governed by `formatVersion`. Do not invent your own top-level keys — the unknown-domain rule rejects them by design.

## `cinatra.dependencies` — capability-based, required vs optional

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

`versionConstraint` is one of `semver-range`, `exact`, or `git-ref`. **Declare `semver-range` or `exact` for an installable package** — a `git-ref` constraint on a dependency edge is **refused at install** (the v1 version model resolves registry coordinates only, so a git-ref target is not installable). Legacy `agentDependencies` / `connectorDependencies` maps normalize into `dependencies` deterministically — prefer declaring canonical `dependencies` directly.

## `requestedHostPorts` — request least privilege

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

The canonical port list is `HOST_PORT_NAMES`. The permission/grant model that decides which requested ports an admin approves is in [Extension permissions](../extension-permissions.md).

## Registering setup and settings UI through approved surfaces

Setup and settings UI register through `ctx.ui` (not by creating a filesystem route): `ctx.ui.registerSetupSurface(...)`, `ctx.ui.registerSettingsSurface(...)`, and `ctx.ui.registerAction({ id, handler })`. Registered surfaces appear after activation, with no new filesystem route created for each installed UI.

Two UI classifications (`uiSurface`):

- **`schema-config`** — declare the config as data in `configSchema`; the host renders a generic schema-driven form. Fully hot-pluggable: a freshly installed connector's config UI appears on the running instance with no rebuild.
- **`bundled-react`** — a bespoke React setup/settings page. Under the App Router, RSC client chunks are build-known, so a bundled-react component's **code** must ship in the build; its existence and routing are still DB-driven and dynamic. Prefer `schema-config` when the form is expressible as data.

Visual primitives come from `@cinatra-ai/sdk-ui` (a peer dependency) and the Cinatra-owned shadcn design registry — never from the app's `@/components/*`. `ctx.ui` registers surfaces; it is not a bag of host components.

## Data ownership, secrets, and archive/restore/teardown

A connector owns its own data and reaches it only through ports:

- **Config** → `ctx.settings` (non-secret, per-extension namespace).
- **Credentials** → `ctx.secrets` (deliberately separate from settings).
- **Structured records** → `ctx.objects` (registered object types with version history).
- **Scoped DB** → `ctx.db` is the reserved, exceptional escape hatch — not the default data path.

Write a `destroy(ctx)` hook that deregisters the surfaces your `register(ctx)` added (MCP tools, capability providers, workers). The lifecycle then preserves or removes your data correctly:

- **Archive preserves history and configuration** — the connector is suspended; settings, secrets, and object rows remain, so Restore is non-destructive.
- **Hard removal removes scoped settings and secrets** — uninstall/force-delete/purge clean up the connector's own scoped state.

Author for both: keep object data restorable across archive, and make `destroy` idempotent. Full model: [Extension data ownership](../extension-data-ownership.md). Declarative demo data for dev boots: [Extension dev fixtures](../extension-dev-fixtures.md).

### Shipping schema migrations

When your connector owns Postgres tables, ship **standard
[node-pg-migrate](https://github.com/salsita/node-pg-migrate) migrations** in a
directory declared via `cinatra.migrationsDir` (e.g. `cinatra/migrations`).
The host applies them — into the same shared, namespaced migration ledger the
core schema uses — at install (before finalize: a failed migration aborts the
install), at boot, and at hot-activate, **only for trusted-signed packages**.

The contract in brief:

- Modules are plain runtime ESM exporting `up(pgm)`/`down(pgm)`, named
  `ext_<scope>_<pkg>__NNNN_<short-description>.mjs` — the prefix derives from
  your package name (`@acme/crm-connector` → `ext_acme_crm-connector__`), which
  must be scoped lowercase kebab-case. Sequences are append-only and shipped
  migrations are immutable; the directory must contain migrations only.
- Migrations are raw SQL on the shared multi-tenant schema: touch **only your
  own `ext_<scope>_<pkg>_…` tables**, carry `org_id text NOT NULL`, and keep
  every statement safe to re-run.
- An unsigned or bootstrap-trusted package that declares `migrationsDir` is
  refused; workflow-path installs cannot declare host migrations at all.
- **Only ship host migrations if your publishing channel emits a verified
  signature for the package.** Running host DDL requires the `trusted-signed`
  tier — a verified Ed25519 signature against a host-trusted key. A package
  that declares `migrationsDir` but is served unsigned (or signed only with a
  key the host does not trust) is refused import on every instance, regardless
  of the `CINATRA_EXTENSION_REQUIRE_SIGNATURES` lever. See the precise
  producer/verifier signing status in [Extension publishing](../../../guides/developer/extension-publishing.md#extension-signing-and-the-activation-trust-root).

Full authoring contract: [Extension SDK ABI and dependencies](../extension-sdk-abi-and-dependencies.md) ("Schema migrations") and
`migrations/README.md` in the cinatra repository.

## Local validation and the conformance gates

Before publishing, satisfy the gates the platform holds every extension to:

- **`pnpm typecheck`** — the activation contract typechecks against the SDK; `register(ctx)` matches `ExtensionHostContext`.
- **Naming conformance** (`packages/extensions/src/__tests__/naming-conformance.test.ts`) — directory == unscoped package name, kind-at-end, allowed scope for the kind.
- **README gate** (`scripts/audit/extension-readme-gate.mjs`) — the README structure.
- **License gate** (`scripts/audit/extension-license-gate.mjs`) — a policy license in the manifest.
- **Dev-fixtures gate** (`scripts/audit/dev-fixtures-gate.mjs`) — if you declare `devFixtures`, the file is declarative data only (no SQL/JS/secrets; only `setting` and `object` surfaces).
- **Discovery conformance** (`packages/extensions/src/__tests__/extension-discovery-conformance.test.ts`) — if you add a new kind's reader facet, it must satisfy the golden discovery contract (lifecycle suppression, visibility authority, reader-throw isolation).
- **Manifest validity** — `requestedHostPorts` must be real port names, `sdkAbiRange` must be a supported range, and `dependencies` edges must be well-formed; the manifest generator flags unknown values at generation time.
- **Connection-scope config** — `cinatra/config.json` present, packed (the `files` allowlist includes `cinatra`), and valid under the fail-closed schema, including the protected-slug rule. See [Declaring connection access scope](#declaring-connection-access-scope--cinatraconfigjson).

Beyond these author-time gates, the production loader applies a runtime trust check before importing your code in-process: it verifies the tarball's integrity and — in the signature-required window — an Ed25519 signature against a host-trusted key. An unsigned package is import-denied once enforcement is on, and a package that declares host migrations cannot import unless it is signed. See [Extension signing and the activation trust root](../../../guides/developer/extension-publishing.md#extension-signing-and-the-activation-trust-root).

The IoC review contract every change is held to is in [Extension IoC safeguards](../extension-ioc-safeguards.md).

## Cross-kind concerns

The README contract and the shared package conventions apply to every kind — see the [Extension authoring hub](../../../guides/developer/extension-authoring.md) and [Building packages](../../../guides/developer/building-packages.md). Ship through [Extension publishing](../../../guides/developer/extension-publishing.md).

## See also

- [Extension kinds — choose your kind](./)
- [Extensions hub](../extensions.md)
- [The runtime-store `serverEntry` contract](../extension-server-entry-artifact.md)
- [Extension SDK ABI and dependencies](../extension-sdk-abi-and-dependencies.md)
- [Extension webhooks and streams](../extension-webhooks-and-streams.md) — declaring `cinatra.webhooks` and `cinatra.streams` to receive inbound webhooks and expose SSE streams.
- [CRM connector](../crm-connector.md), [Email connector](../email-connector.md), [Drupal connector](../drupal-connector.md) — worked first-party examples.
