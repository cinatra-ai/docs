# Extension Data Ownership

This page is the single source of truth for **where an installed extension's data
lives and who owns it**. It governs every extension kind (agent / connector /
skill / artifact / workflow). Read it before adding any persistence to an
extension.

## The decision

Per-extension data **ownership** decouples — an extension owns its rows — but the
**physical schema stays host-owned**. Concretely:

- The host keeps the single shared `cinatra` Postgres schema (`cinatra_<slug>`
  per worktree). **All DDL is centralized** in `src/lib/drizzle-store.ts`
  `buildCreateStoreSchemaQueries()`, run at boot by `ensurePostgresSchema()`
  under an advisory lock.
- Tenant isolation is **row-level `org_id`** in application SQL — there is no
  Postgres RLS and no per-extension Postgres schema.
- **No extension authors DDL directly.** The host owns the schema; an extension
  persists through the host ports below.

**Rejected: per-extension Postgres schema.** It would re-derive the entire
`org_id` row-tenancy model and break cross-table foreign keys to core
(`workflow_artifact → artifact_blobs`, `agent_run → objects`) for trusted,
signed first-party code. The SDK fixes `HostDbPort.schema` with the
host-owned-schema intent.

## Where to put each kind of data

| Data | Surface | Persistence |
|---|---|---|
| Non-secret config | `ctx.settings` | `connector_config` KV, key `ext:<pkg>:<orgId>:<key>` |
| Credentials / tokens | `ctx.secrets` | `connector_config` KV, key `ext-secret:<pkg>:<orgId>:<key>`, **AES-256-GCM** at rest |
| Structured records | `ctx.objects` | `cinatra.objects` (org-scoped, typed) |
| Owned relational tables | `ctx.db` | Reserved (see below) |

### `ctx.settings` / `ctx.secrets` — org-scoped

This is the accepted form for extension config and credentials. A dedicated table
is not required:

- **Settings key:** `ext:<packageName>:<orgId>:<key>` on the `connector_config`
  KV (backed by the `cinatra.metadata(key, value)` table).
- **Secrets key:** `ext-secret:<packageName>:<orgId>:<key>`, value encrypted with
  AES-256-GCM via `@/lib/instance-secrets`. The **full store key is bound as the
  GCM additional-authenticated-data (AAD)**, so a ciphertext row cannot be
  replayed under a different org / package / key and still decrypt.
- **`org_id` is resolved from the trusted actor context** (`ctx.authSession`,
  `requireExtensionOrganizationId`), **never** from a caller- or
  package-supplied field. Resolution **fails closed** when there is no resolvable
  org — there is deliberately no shared package-global fallback (a stale or
  absent actor must fail loud, never silently read or write a cross-tenant
  namespace).
- One extension cannot read another's config (the package is in the key); one org
  cannot read another's (the org is in the key).

### `ctx.objects` — typed org-scoped records

Structured records go to `cinatra.objects` via `ctx.objects`, org-scoped and
typed. See [objects.md](./objects.md) for the canonical object surface.

### `ctx.db` — reserved

`ctx.db` is a **fail-loud stub**. `HostDbPort.query` / `HostDbPort.schema` are
annotated reserved. An extension may not declare `requestedHostPorts: ["db"]` and
rely on it. The SDK ABI carries the port shape so the surface is additive when it
opens: a scoped `ctx.db` read or write is a new method behind a precise
`sdkAbiRange` and an admin grant, never smuggled through the read-only `query()`.

## Lifecycle teardown

When an extension is **hard-removed** — the `uninstall` hard-delete branch,
`force_delete`, or the connector purge saga — the host fires a durable, awaited,
idempotent **data-teardown hook** (`setExtensionDataTeardownHook` in
`src/lib/extensions.ts`, fired from `@cinatra-ai/extensions`). It physically
deletes the package's org-scoped settings, secrets, and dev-fixture provenance
across all orgs: the `ext:<pkg>:` (settings), `ext-secret:<pkg>:` (secrets), and
`ext-fixture-prov:<pkg>:`
([dev-fixture provenance](./extension-dev-fixtures.md)) keyspaces.

- It fires **only on hard removal**, **never on archive** — an archived extension
  preserves run history and is restorable, so its org-scoped config must survive.
- It is **best-effort**: a transient cleanup failure is logged and swallowed (the
  removal is already committed; the next idempotent teardown re-cleans).
- A true row **DELETE** is used. `ctx.settings.delete` / `ctx.secrets.delete` and
  the teardown use the real `deleteConnectorConfig(key)` /
  `deleteConnectorConfigByPrefix(prefix)` helpers, which remove the row rather
  than upserting a `"null"` placeholder.

See [extension-lifecycle.md](./extension-lifecycle.md) for the full lifecycle and
the manifest gate that drives teardown.

## See also

- [developer guide index](../../guides/developer/README.md)
- [Extension lifecycle and distribution](./extension-lifecycle.md) — the manifest
  gate and teardown.
- [Extension dev-mode fixtures](./extension-dev-fixtures.md) — the dev fixtures
  contract.
- [Objects: the canonical surface](./objects.md) — `ctx.objects` records.
- `packages/sdk-extensions/src/host-context.ts` — the host port surface
  (`ctx.settings`, `ctx.secrets`, `ctx.objects`, `ctx.db`, and the other ports).
- `src/lib/extension-host-context.ts` — the host factory (org-scoped resolution).
