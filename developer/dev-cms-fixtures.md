# Generic dev content fixtures (Drupal / WordPress / Twenty)

In dev mode, Cinatra seeds **generic, fictional sample content INTO the local
Drupal, WordPress, and Twenty instances** so the connectors always have
realistic data to operate on (and so demos never start from an empty CMS).

> This is distinct from the cinatra-side [`cinatra.devFixtures`
> contract](./extension-dev-fixtures.md), which seeds an extension's own
> `ctx.settings` / `ctx.objects` inside Cinatra. The fixtures described here are
> *content rows inside the external instances themselves* — Drupal nodes,
> WordPress posts/pages, Twenty companies/people/views — which the devFixtures
> contract deliberately cannot reach.

## Source of truth

All content lives in one declarative, fictional manifest:

```
scripts/fixtures/external-instances.dev-content.json
```

Everything is generic: fictional company names, RFC 2606 reserved `.example`
domains, neutral copy. **Never** put real brands or OpenCloud content here — the
manifest unit test (`scripts/__tests__/external-instances-dev-content.test.mjs`)
fails the build if a domain/email is not a reserved TLD or if an `OpenCloud`
token appears.

The shared loader/validator is `scripts/fixtures/lib/dev-content-manifest.mjs`.

## How it loads at dev setup

Each instance is seeded where it is most robust — no Cinatra app-boot / Nango /
auth dependency:

| Instance | Seeder | Runs from |
|----------|--------|-----------|
| Drupal | `docker/drupal/seed-content.php` (drush `php:script`) | `scripts/drupal-entrypoint.sh` bootstrap (container boot) |
| WordPress | `docker/wordpress/seed-content.php` (`wp eval-file`) | `scripts/wordpress-entrypoint.sh` bootstrap (container boot) |
| Twenty | `scripts/fixtures/seed-twenty-content.mjs` (MCP catalog tools) | operator-run, after the Twenty bootstrap |

The seed script + manifest are bind-mounted into the Drupal and WordPress
containers (under `/opt/cinatra-dev-content/`, outside the web root) by
`docker-compose.yml`. Bring the profiles up as usual:

```bash
docker compose --profile drupal --profile wordpress up -d
docker compose --profile twenty up -d   # then run the Twenty bootstrap
```

The **Drupal/WordPress** seeders are **fire-and-forget and non-fatal** — a
failure logs a `WARN` and never blocks container boot. The **Twenty** step is
stricter: it refuses to run against a non-local Twenty (override with
`CINATRA_TWENTY_ALLOW_NONLOCAL=1`), and on a local operator run it **hard-fails**
(non-zero exit) if any fixture — including the required views — errors or cannot
be verified (e.g. the `get_views` lookup failed), so a run never appears green
without the content. Under CI it degrades to `WARN` so transient Twenty API
drift never breaks the bootstrap gate.

## Idempotency (mirrors the devFixtures philosophy)

Each seeder is **create-if-absent, replace-only-while-fixture-owned,
skip-if-user-edited** so reruns never duplicate and never clobber your edits:

- **Drupal** — provenance map in Drupal state `cinatra_dev_fixtures.nodes`
  (`fixtureId → {nid, checksum}`). A live checksum that diverges from the stored
  one means you edited the node → skipped. A deleted node is never recreated.
- **WordPress** — post meta `_cinatra_dev_fixture_id` + `_cinatra_dev_fixture_checksum`.
  A trashed post is left trashed.
- **Twenty** — a gitignored provenance sidecar
  `data/twenty/dev-content-provenance.local.json` maps `fixtureId → {id, rev,
  checksum}`. Companies/people also carry `cinatraObjectId = <fixtureId>` (the
  required custom field the bootstrap already creates) for first-run adoption of
  out-of-band rows. Records/views are matched by their **stored id** (so a user
  rename is not duplicated) and a deleted record is **not** recreated. A manifest
  `version` bump re-applies changed content to fixture-owned rows via the
  `update_*` tools — but only when the row's identifying fields still match what
  was last seeded (`checksum`); **a row you edited/renamed is preserved, not
  clobbered**. Existing-record lookups **fail closed** — if Twenty errors on the
  list call, the seeder skips creation rather than risk a duplicate.

## One-shot OpenCloud cleanup

Some local Drupal volumes still carry legacy **OpenCloud** demo nodes
hand-created during earlier manual UAT testing (they were never repo fixtures). The Drupal
seeder deletes any node whose title starts with a configured prefix
(`drupal.legacyCleanup.titlePrefixes`) exactly once per volume, guarded by the
Drupal state sentinel `cinatra_dev_fixtures.opencloud_cleanup_v1`. Bumping the
sentinel re-runs the cleanup.

## Adding or changing content

1. Edit `scripts/fixtures/external-instances.dev-content.json` (keep it generic).
2. To force re-seed of an existing item after a content change, the seeders
   detect the changed checksum and REPLACE it — as long as you have not edited
   the row in the instance yourself.
3. Run `pnpm exec vitest run scripts/__tests__/external-instances-dev-content.test.mjs scripts/__tests__/seed-twenty-content.test.mjs`.

## Limitations

- Twenty ships its own built-in **Apple** dev workspace (Google/Microsoft/…),
  baked into the Twenty image. We keep it and layer generic content on top;
  making Twenty's built-in seed generic would require forking Twenty.
- Full live verification across all three requires the heavy docker profiles
  (incl. the ~2 GB Twenty stack).
- The Twenty connector **API key now auto-mints + attaches** at dev-auto-setup
  (`src/lib/dev-auto-setup.ts` → `autoSetupLocalTwenty`) when the Twenty
  container is up and Nango is configured (`cinatra setup nango`): it reuses a
  working bearer, else mints a fresh workspace key via `docker exec`, imports it
  into Nango, and readback-verifies — no operator setup-page step. Twenty
  *content* (companies/people/views) still seeds via the bootstrap step 13,
  because that path owns the row-accumulation / cleanup concerns.
  - The minted key is stored as the `twenty-workspace` Nango connection under the
    `cinatra-external-mcp` provider config key, so subsequent boots reuse it; a
    new key is minted only on a definite `401/403`, never on a transient probe or
    Nango outage (avoids key sprawl).
