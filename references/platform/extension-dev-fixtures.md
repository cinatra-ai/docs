# Extension Dev-Mode Fixtures

> Companion to [extension-data-ownership.md](./extension-data-ownership.md).

An extension can ship **declarative demo / sample data** that the host's dev-only
seeder applies into the extension's **own** org-scoped surfaces on a fresh dev
boot — so a freshly-installed extension is visible and exercisable without the
monolithic `scripts/seed.mjs` hardcoding its demo rows (which do not survive
extraction).

This is **dev *demo* data** (visibility and UAT) — NOT *functional bootstrap*
data an extension needs to RUN. A real bootstrap need belongs to install-time
migrations (prod-relevant), not this mechanism.

> **Sibling mechanism:** a connector whose dev wiring cannot be expressed as
> declarative data (mint a credential, register an instance row, push a widget
> config into a local docker fixture) declares the IMPERATIVE `cinatra.devSetup`
> hook instead — see the [connector authoring guide](extension-kinds/authoring-connector-extensions.md)
> and `packages/sdk-extensions/src/dev-setup.ts`. Content seeded *inside* the
> external CMS instances themselves is a third, separate layer:
> [Generic dev content fixtures](dev-cms-fixtures.md).

## Declaring fixtures

Add `cinatra.devFixtures` (a path, recommended `cinatra/dev-fixtures.json`) to
the extension's `package.json` `cinatra` block, and ship the file:

```jsonc
// package.json
"cinatra": {
  "kind": "connector",
  "requestedHostPorts": ["settings"],     // a `setting` fixture REQUIRES the `settings` grant
  "devFixtures": "cinatra/dev-fixtures.json"
}
```

```jsonc
// cinatra/dev-fixtures.json — DECLARATIVE DATA ONLY (no SQL / JS / seed function)
{
  "version": 1,                            // bump to REPLACE older still-fixture-owned rows
  "fixtures": [
    { "id": "demo-default-calendar-view", "surface": "setting", "key": "demoDefaultCalendarView", "value": "month" }
  ]
}
```

### Fixture shape

- **`id`** — stable, unique-within-file fixture id (the provenance key).
- **`surface`** — `"setting"` or `"object"` (the only allowed targets — **never**
  secrets, RBAC grants, `installed_extension`, core tables, SQL, or JS).
- **`setting`** → `{ key, value }` — written to `ctx.settings`
  (`ext:<pkg>:<orgId>:<key>`).
- **`object`** → `{ typeId, data }` — written to `ctx.objects`.

The validator (`parseDevFixtures` in `@cinatra-ai/sdk-extensions`) is fail-loud;
the static CI gate `scripts/audit/dev-fixtures-gate.mjs` rejects any malformed
declared file at build time (the dev seeder is fire-and-forget, so a malformed
file must not silently no-op).

## How seeding works

`src/lib/dev-fixture-seeder.ts` runs at dev boot (gated on
`CINATRA_RUNTIME_MODE=development`, after `dev-auto-setup`, fire-and-forget,
soft-fail). For each declaring extension it:

1. **Resolves the dev org host-side** from trusted bootstrap state (earliest user
   → their first org membership — the `dev-auto-setup` pattern). The fixture file
   **MUST NOT** name an org; tenancy is host-derived only.
2. Runs inside `mcpRequestContextStorage.run({ userId, orgId }, …)` so the
   extension's own `ctx.settings` resolves to the dev org.
3. **Enforces grants:** a `setting` fixture requires `settings` in
   `requestedHostPorts`, else the write fails loud (least-privilege).

### Provenance and idempotency (settings)

Each seeded setting carries a **sidecar provenance** row
`ext-fixture-prov:<pkg>:<orgId>:<key>` = `{ pkg, id, rev, checksum }` (the setting
VALUE itself stays raw — no envelope). Re-running converges without clobbering:

- **CREATE** — no row yet.
- **REPLACE** — only when the sidecar exists, pkg/id match, the stored row's
  checksum still equals the seeded checksum (i.e. unchanged since seeding), AND
  the fixture-set `version` advanced.
- **SKIP** — the checksum diverged (a user edited it), or there is no sidecar
  (user owns it), or it is already current.

A normal `ctx.settings.set` / `delete` **clears the sidecar**, so a user-edited
row is permanently user-owned and never re-seeded.

### Teardown

Hard removal (`uninstall` / `force_delete` / `purge`) reaps the extension's
`ext-fixture-prov:<pkg>:` keyspace via the durable data-teardown hook (alongside
its `ext:` / `ext-secret:` keyspaces) — see
[extension-data-ownership.md](./extension-data-ownership.md). The seeded setting
values themselves are reaped by the `ext:<pkg>:` teardown.

## Scope and deferrals

- **Object fixtures** are accepted by the contract and validated, but their dev
  *seeding* is deferred to the first real consumer: the public
  `ctx.objects.write` cannot carry the stable id and source provenance an
  idempotent, reapable object fixture needs. The seeder logs and skips an
  `object` fixture.
- Reading fixtures from the runtime package store (vs the dev `extensions/`
  checkout) is a future capability.

## See also

- [developer guide index](../../guides/developer/README.md)
- [Extension data ownership](./extension-data-ownership.md) — the dev-mode
  fixtures contract's parent doctrine.
- [Extension lifecycle and distribution](./extension-lifecycle.md) — teardown and
  the manifest gate.
