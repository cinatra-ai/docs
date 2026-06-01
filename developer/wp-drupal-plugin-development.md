# Developing the WordPress plugin + Drupal module

The Cinatra WordPress plugin and Drupal module live in **their own repositories**
(the source of truth), not in this monorepo:

- `cinatra-ai/wordpress-plugin` → WordPress.org slug `cinatra` (GPL-2.0-or-later)
- `cinatra-ai/drupal-module` → Drupal.org machine name `cinatra` (GPL-2.0-or-later)

For local development the dev docker stack consumes them as **clones** inside
this tree. `cinatra setup {dev,branch,clone}` clones / fast-forwards them from
the config in `package.json` (`cinatra.devMarketplacePlugins`) into:

- `wordpress-plugin/` — the WordPress plugin (repo root maps to the plugin dir;
  docker bind-mounts it to `/wp-content/plugins/cinatra/`)
- `drupal-module/cinatra/` — the Drupal module (docker bind-mounts it to
  `/modules/custom/cinatra/`)

Both clone paths are **gitignored** in this repo; only `drupal-module/.gitkeep`
is tracked. See [LINKING.md](../../LINKING.md) for the Apache-2.0 ↔
GPL-2.0-or-later HTTP-only boundary.

## Where does my commit go?

| You changed… | Commit in… | PR in… |
|---|---|---|
| Plugin/module PHP, YAML, readme | the clone (`wordpress-plugin/` or `drupal-module/cinatra/`) | the **extracted repo** — no cinatra PR needed |
| Cinatra core (bundle route, contracts, setup, docs) | the cinatra repo | the **cinatra repo** |
| The wire contract (both sides) | both — see "Contract-version bumps" | two coordinated PRs |

`git status` makes it obvious which tree you're in: run it inside
`wordpress-plugin/` (or `drupal-module/cinatra/`) and you'll see the **extracted
repo's** status (its own `origin`, its own `main`). Run it at the cinatra root
and the clone paths don't appear at all (they're gitignored).

## Pure plugin/module change

1. `cd wordpress-plugin` (or `drupal-module/cinatra`).
2. Edit, commit, push to the extracted repo's `main` via a PR there.
3. Back in cinatra, `cinatra setup dev` fast-forwards the local clone to the new
   `main`. No cinatra PR is involved.

## Contract-version bumps (cross-cutting changes)

When a change touches the wire contract (`contracts/wp-drupal-assistant/`), use
the two-PR protocol so a plugin built against the old contract never silently
breaks:

1. **cinatra first:** add `contracts/wp-drupal-assistant/v2/` (new schemas +
   fixtures), extend `SUPPORTED_CONTRACT_VERSIONS` in
   `src/lib/wp-drupal-contract.ts` (keep `v1`), ship the v2-aware backend.
   Merge it.
2. **plugin/module next:** bump the client's `contractVersion` to `v2` in the
   extracted repo, ship it.
3. Keep `v1` supported until a deliberate deprecation PR removes it.

The contract test suite (`tests/contracts/wp-drupal/`) + the
`wp-drupal-contract.yml` gate enforce schema/fixture conformance on every change
under `contracts/wp-drupal-assistant/`.

## Dirty-tree recipes

`cinatra setup` never destroys local work. If a clone has uncommitted changes it
is **skipped with a warning** naming the dirty repo. To proceed:

- **Keep your work:** `cd wordpress-plugin && git commit -am "wip"` (or `git
  stash`), then re-run `cinatra setup dev`.
- **Discard your work:** `cd wordpress-plugin && git checkout . && git clean -fd`,
  then re-run.
- **Force fast-forward (stashes first):** `cinatra setup dev
  --force-dev-marketplace-plugins` — stashes local changes, then hard-resets the
  clone to `origin/main`. A clone pointing at the **wrong origin or branch** is
  never auto-reset, even with `--force`; fix the remote or move the dir aside.
- **Skip the sync entirely:** `cinatra setup dev --skip-marketplace-plugins`
  (e.g. on CI / contributors without access to the private repos pre-launch).

Per-repo URL overrides (for a fork or an SSH remote) without editing
`package.json`: `CINATRA_WORDPRESS_PLUGIN_REPO_URL`,
`CINATRA_DRUPAL_MODULE_REPO_URL` (HTTPS or SSH; origin comparison normalizes the
two forms).

## Temporary debugging

`error_log()` (WordPress) and `\Drupal::logger('cinatra')->debug()` (Drupal)
changes you add while debugging live in the clone and are **local-only** unless
you intentionally commit + push them to the extracted repo. `cinatra setup`
treats them as a dirty tree and skips (see above) — so they won't be silently
fast-forwarded away, but they also won't reach anyone else until you push.

## Recovery when `cinatra setup` skips a dirty clone

The warning names the dirty repo and the exact next command. Pick one of the
dirty-tree recipes above. If a clone is in a **non-git** or **wrong-origin**
state, `cinatra setup` fails loud (non-zero exit) with remediation text rather
than touching it — move the directory aside and re-run to get a fresh clone.

## Volume-scoped dev migration (post-cutover, one-time)

Existing dev installs have the pre-rename (widget-era) plugin/module baked into
the WordPress/Drupal docker volumes. To pick up the renamed `cinatra` plugin/module,
drop **only** the WP/Drupal volumes (not unrelated cinatra volumes) and re-setup:

```bash
docker compose stop wordpress wordpress-db drupal drupal-db
docker volume rm cinatra_cinatra-wordpress cinatra_cinatra-wordpress-db \
                 cinatra_cinatra-drupal cinatra_cinatra-drupal-db
cinatra setup dev
```

The renamed plugin/module each run a one-shot migration that copies the
pre-rename WordPress option keys / Drupal settings config into the new
`cinatra_*` / `cinatra.settings` keys (the exact legacy identifiers live in the
extracted repos' migration code), so a real (non-volume-dropped) upgrade
preserves the configured URL + API key. Browser-side localStorage chat history
resets (the history key was renamed).

## UAT gate + override label

PRs that touch the contract / plugin-integration paths trigger the Playwright
UAT hard gate (`wp-drupal-uat.yml`). To land a planned migration that knowingly
breaks a UAT, add the `override-wp-drupal-uat` label — see the override process
in [contributing.md](contributing.md). Running the UATs locally:
`pnpm test:e2e:wp-drupal` (see [tests/e2e/wp-drupal-uat/README.md](../../tests/e2e/wp-drupal-uat/README.md)).
