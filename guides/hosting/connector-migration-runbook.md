# Connector Access Migration — Operator Runbook

Moves connector access off the legacy `connector_access_policy` table onto the
uniform polymorphic model (`installed_extension` + `extension_access_policy`).
This is the **one-shot, deploy-time, operator-run** step (the autonomy boundary
— the migration is authored + tested against a throwaway schema, but applying it
to production is an operator action under the release-tag-gated deploy).

## Preconditions

- The migration code is deployed (the broadened `resource_kind` CHECK ships via
  `buildCreateStoreSchemaQueries` on `cinatra setup prod` (the in-image deploy-time schema sync), and via migration 640).
- A fresh backup exists: `cinatra instance backup create` (defensive — the migration is
  non-destructive, but back up before any prod data migration).
- Optionally `cinatra instance backup export-api-configs` (connectors touched; no
  credential schema change, but access rows move).

## Steps

1. **Broaden the CHECK constraints** (idempotent; also applied by setup):
   ```bash
   SUPABASE_DB_URL=<prod> SUPABASE_SCHEMA=<schema> \
     npx tsx src/lib/migrations/640-extension-access-kinds.ts
   ```
   Expect: `_kind_check_v2` (7-kind list) added on `extension_co_owners` +
   `extension_access_policy`; re-run is a no-op.

2. **Backfill connector access** (idempotent, transactional, race-safe):
   ```bash
   SUPABASE_DB_URL=<prod> SUPABASE_SCHEMA=<schema> \
     npx tsx src/lib/migrations/641-connector-access-to-polymorphic.ts
   ```
   Expect log: `N legacy connector_access_policy row(s) to migrate` →
   `installed_extension created: N, connector policies written: N`.

3. **Verify counts**:
   ```sql
   -- every legacy row has a canonical install + policy
   SELECT count(*) FROM <schema>.connector_access_policy;            -- legacy total
   SELECT count(*) FROM <schema>.extension_access_policy
     WHERE resource_kind = 'connector';                              -- should match
   -- mapping fidelity (expect 0)
   SELECT count(*) FROM <schema>.connector_access_policy l
   JOIN <schema>.installed_extension ie
     ON ie.organization_id=l.org_id AND ie.owner_level='organization'
     AND ie.owner_id=l.org_id AND ie.package_name=l.package_id AND ie.kind='connector'
   JOIN <schema>.extension_access_policy p
     ON p.resource_kind='connector' AND p.resource_id=ie.id
   WHERE (p.policy->>'runDataVisibility') <> l.visibility;            -- mismatches
   ```

4. **Smoke**: as an org member, confirm `workspace`-visibility connectors are
   visible and `admin`-visibility connectors are hidden (admin-only) on
   `/connectors`. The runtime now reads the canonical model; the legacy table is
   only the absence-only fallback (a one-time `[connector-policy] using legacy
   connector_access_policy fallback` warning means an org had no canonical row).

## Rollback

The migration is additive (it never deletes legacy rows). To roll back the code,
redeploy the prior tag; the shim reads legacy when no canonical row exists. The
pre-deploy backup is the hard rollback.

## Follow-up (separate, after verification)

Once production is verified on the canonical model, a later removal migration can
DROP `connector_access_policy` and delete the absence-only fallback branch in
`src/lib/connector-policy.ts`. Tracked as a deprecation.
