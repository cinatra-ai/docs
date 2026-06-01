# ensureAgentPackage — System-Provided Agent Startup Pattern

System-provided agent templates (shipped as ZIP files) are managed by `ensureAgentPackage` from `/agents`. It centralizes startup agent-template installation instead of using per-package patch functions.

## How it works

1. **Version-skip guard** — reads the existing template by `packageName`. If `packageVersion` already matches, returns `{ skipped: true }` without touching the DB.
2. **ZIP injection** — reads the ZIP from `data/downloads/`, parses the Open Agent Specification (OAS) Flow descriptor (`oas.json` canonical, `agent.json` for legacy ZIPs), injects `packageName` and `packageVersion`, then rebuilds the ZIP.
3. **Upsert** — delegates to `importAgentTemplate(..., { redirect: false })`, which calls `updateAgentTemplate` if a template with that `packageName` already exists, or `createAgentTemplate` if not.
4. **Identity lock** — calls `setAgentTemplatePackageName` after upsert. The setter guards with `WHERE package_name IS NULL`, so it is a no-op on subsequent restarts.
5. **Diagnostic logging** — logs `[ensureAgentPackage] <packageName> v<version> upserted` or `skipped — already up to date` via `console.info`.

## Usage

Calls live in `src/instrumentation.node.ts`, which runs once at server startup:

```ts
const { ensureAgentPackage } = await import("/agents");

await ensureAgentPackage({
  zipFileName: "email-outreach-template.zip",  // file in data/downloads/
  packageName: "email-outreach-template",       // stable identity — never changes
  packageVersion: "1.0.0",                      // bump to force a re-upsert on next start
  name: "Email Outreach",                       // display name override (optional)
});
```

## Adding a new system-provided agent

1. Export the agent template as a ZIP via the agent builder UI.
2. Place the ZIP in `data/downloads/`.
3. Add an `ensureAgentPackage` call in `src/instrumentation.node.ts`.
4. Set `packageVersion` to `"1.0.0"` (or the initial version).

## Forcing a re-upsert

Bump `packageVersion` in the `instrumentation.node.ts` call. On the next server start, `ensureAgentPackage` will see the version mismatch, re-read the ZIP, and run the upsert.

## packageName identity rules

- `packageName` is assigned once. `setAgentTemplatePackageName` guards with `WHERE package_name IS NULL` — it cannot overwrite an established identity.
- `updateAgentTemplate` does not accept `packageName` — the general update path cannot rename a package identity.
- The `agent_templates_package_name_idx` unique index enforces one template per package name at the DB level. If a conflict occurs, `importAgentTemplate` maps the Postgres error to a user-friendly message: `"Package name [X] is already registered."`.

## Key files

| File | Role |
|------|------|
| `packages/agents/src/ensure-agent-package.ts` | Startup engine |
| `packages/agents/src/zip-helpers.ts` | Pure Node ZIP read/write utilities |
| `packages/agents/src/import-export-actions.ts` | `importAgentTemplate` with upsert-by-packageName |
| `packages/agents/src/store.ts` | `readAgentTemplateByPackageName`, `setAgentTemplatePackageName` |
| `src/instrumentation.node.ts` | Startup wiring — add new calls here |
| `data/downloads/` | System-provided agent ZIPs |
