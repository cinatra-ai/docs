---
title: Upgrading stateful services across majors
slug: self-hosting/upgrading-stateful-services
description: The operator runbook for moving a self-hosted Cinatra install across a major version of one of its stateful backing services — the deployed-version ledger, the fail-closed upgrade preflight, hardened backups, and the safe order of operations.
editUrl: https://github.com/cinatra-ai/docs/edit/main/guides/hosting/upgrading-stateful-services.md
---

Moving to newer Cinatra code is covered by [Upgrading](upgrading.md). This page covers a rarer, riskier event: an upgrade that moves one of the instance's **stateful backing services** — Postgres, MariaDB, Neo4j, Redis, Valkey, RabbitMQ, MinIO, Verdaccio — across a **major version**.

A data volume initialized under an older major is generally not readable by a newer one — and even where a newer engine tolerates the old on-disk format, the change is one-way. Recreating the container naively (a bare `docker compose up` after the image pin moved) does not migrate anything: at best the service silently commits you to the new major, at worst it crash-loops against the old data directory. Postgres is explicit about it:

```
FATAL: database files are incompatible with server
DETAIL: The data directory was initialized by PostgreSQL version 15, which is not compatible with this version ...
```

The `cinatra` CLI guards this event with a **deployed-version ledger** and a **fail-closed upgrade preflight**. This page explains both, gives the backup recipes to run first, and spells out the safe order of operations.

> [!NOTE]
> The ledger and the preflight operate on instances the `cinatra` CLI installed and manages (the bundled `docker-compose.yml` stack). If your Postgres or other stores run outside that stack, the same order of operations applies, but detection and backups are on your own database tooling.

---

## Before you upgrade

### The deployed-version ledger

At every successful install, attach, and refresh, the CLI records — per stateful service — the deployed image, its digest, the detected data-format version, and the identity of the Docker volume backing the service's data. The ledger is one JSON file per instance, stored with the CLI's instance state at `~/.cinatra/ledgers/<slug>.json`, and you will see the recording in the install output:

```
Version ledger: recorded 3 stateful service(s) for "main" (nango-db, postgres, redis).
```

What makes it trustworthy:

- **Volume-bound.** Each entry is tied to the identity of the live volume (its name *and* creation time). A volume that was destroyed and recreated out-of-band under the same name no longer matches its entry — the preflight reports that as a finding instead of trusting a stale version.
- **Transactional.** A migration writes its target entry only after the migration's post-verify passes, and a rolled-back migration restores the source entry. A migration interrupted mid-way leaves a journal that the preflight treats as a finding. A failed upgrade can never leave a new-version ledger entry sitting beside a restored old volume.
- **Proof-gated.** Only services with a container actually running under the instance's compose project are recorded, so a dormant profile's old volume is never re-stamped with a newer image pin.
- **Best-effort by contract.** A recording failure never fails an install. The install output says when recording was skipped or failed outright, and the `Version ledger: recorded …` line names exactly which services were captured — a service missing from that line was not recorded.

The recorded version is the preflight's **primary** detection source. A ledger file that has become malformed is never silently reset — the preflight fails closed on it until you repair or remove it deliberately.

### Run the preflight

```bash
cinatra instance db upgrade-preflight [--instance <slug>] [--service <name>] [--target <service>=<version>] [--json]
```

Run it from inside the install checkout (or name the instance with `--instance`). It is **read-only** — it never recreates, migrates, or writes anything.

Discovery merges two sources: the recorded ledger, and the checkout's resolved compose configuration. The image a recreate *would* deploy is the natural target, so a checkout whose pins have already moved to new majors reports its pending hops with no flags at all. A ledger entry whose service is no longer in the compose config gets an integrity-only check, and `--target <service>=<version>` lets you model a proposed hop before moving any pins.

Exit codes: `0` — safe, no blocking findings; `1` — at least one blocking finding; `2` — usage or discovery failure. Discovery is itself fail-closed: a compose config that cannot be resolved inside a checkout aborts the run rather than degrading into a partial check.

### Reading the verdicts

Each guarded stateful service the run checks gets one verdict (the decision table below lists which services are guarded — MinIO, notably, is not yet):

| Verdict | Example report line | Meaning |
|---------|---------------------|---------|
| `ok` | `matching versions (17)` | Deployed and target versions match — recreating is safe. |
| `ok` | `empty/fresh volume — nothing to migrate` | The volume holds no data; the new image initializes it fresh. |
| `ok` | `recorded 17 — no target specified (integrity check only)` | No proposed hop for this service; its ledger entry and volume check out. |
| `STOP` | `supported upgrade pending (detected 17 → target 18)` | A **supported** migration path exists for this exact hop. The message names the backup step, the sanctioned migration command, and this page. Do not recreate the container until you have done both. |
| `BLOCKED` | `downgrade blocked (detected 17 → target 15)` | The target is older than the deployed data. Downgrading in place is unsafe and unsupported — pin the previous image, or restore a backup taken under the target version. |
| `FAIL-CLOSED` | `unsupported upgrade hop (detected 15 → target 18)` | No supported path covers this hop. Back up your data and stay on the current pin. |
| `FAIL-CLOSED` | `deployed version is unknown/unreadable on a non-empty volume` | The volume holds data but no source could establish its version. Refusing to recreate blind — back up the volume and determine its version. |
| `FAIL-CLOSED` | `recorded ledger version does not match the live volume identity` | The volume was recreated out-of-band, so its data-format version is unknown. Back up and verify it before recreating the container. |
| `FAIL-CLOSED` | `a migration was interrupted (pending journal present)` | A migration began and never committed. Restore from backup (or complete/roll back the in-flight migration) first. |
| `FAIL-CLOSED` | `data volume could not be identified (…)` | Discovery could not tell which volume holds this service's data (bind-mounted or ambiguous mounts) — it cannot be cleared for a recreate. |

Three properties worth knowing:

- **There is no force flag.** The decision core reserves a bypass for a sanctioned migration path executing one exact service-and-hop — never for the eligibility checks, and no shipped command exposes it to you. `BLOCKED` and `FAIL-CLOSED` findings cannot be overridden — they are resolved by backing up, restoring, or staying on the current pin.
- **An empty volume is an explicit non-finding.** It is reported as safe (`empty/fresh volume`) rather than silently omitted, so an all-clear report accounts for every service it checked. (A run narrowed with `--service` accounts only for the named services, and a service outside the decision table gets no verdict at all.)
- **Profile-gated services are evaluated too.** Discovery resolves the compose configuration with every profile visible, so a guarded service whose profile you never enable still appears in the report — normally as safe (`empty/fresh volume`), because its data volume was never created. And a service that left a ledger entry but is no longer in the compose configuration still gets an integrity-only check against its recorded volume.

### Back up: the application bundle

Capture a full bundle first — application database, Nango database, and the `data/` tree:

```bash
cinatra instance backup create --file /secure/backups/pre-upgrade.tar.gz
```

See [Backup & restore](backup-and-restore.md) for what the bundle contains and the one thing it deliberately leaves out (`CINATRA_ENCRYPTION_KEY` — preserve it separately, or restored credentials are unreadable).

### Back up: a hardened cluster dump per Postgres service

For a major upgrade, additionally take a **cluster-level logical dump** of each Postgres service being upgraded, directly with `pg_dumpall`. The bundle above captures the application schemas; `pg_dumpall` captures the whole cluster (all databases plus roles) exactly as the old major holds it, which is what you want in hand before touching the volume.

The hardened form below refuses to bless a truncated or failed dump — the classic silent failure is a disk that fills mid-dump, leaving a short file that looks like a backup:

```bash
set -euo pipefail   # a failure anywhere in a pipeline fails the whole step
umask 077           # the dump holds every row plus role password hashes —
                    # never let the redirection create it world-readable

# 1. Dump to a temp name first — never straight to the final filename.
#    --quote-all-identifiers because this dump exists to be reloaded under a
#    different major, where an unquoted name may have become a keyword.
docker exec <postgres-container> \
  pg_dumpall -U <superuser> --clean --if-exists --quote-all-identifiers \
  > pre-upgrade-<service>.sql.tmp

# 2. Detect truncation before trusting the file. A complete pg_dumpall opens
#    with a cluster-dump header and ends with a completion marker; a dump cut
#    short by a full disk or a killed pipe is missing the trailer.
head -c 256 pre-upgrade-<service>.sql.tmp | grep -q 'PostgreSQL database cluster dump'
tail -c 256 pre-upgrade-<service>.sql.tmp | grep -q 'PostgreSQL database cluster dump complete'

# 3. Promote atomically, compress, and checksum.
mv pre-upgrade-<service>.sql.tmp pre-upgrade-<service>.sql
gzip pre-upgrade-<service>.sql
sha256sum pre-upgrade-<service>.sql.gz > pre-upgrade-<service>.sql.gz.sha256
```

Identify each service's actual container from inside the instance's checkout with `docker compose ps` — container names carry the instance's compose project prefix, so on the default bundled stack the platform database is `cinatra-postgres-1` (superuser `postgres`), while an isolated instance prefixes its own project name. Never guess the name on a host that runs more than one instance: dumping a neighbouring instance's container gives you a perfectly valid backup of the wrong data. Repeat the recipe for each Postgres-family service the preflight flagged (each has its own container, volume, and credentials). Store the dump and its checksum off the instance host, and verify both before you rely on them:

```bash
sha256sum -c pre-upgrade-<service>.sql.gz.sha256
gzip -t pre-upgrade-<service>.sql.gz
```

> [!WARNING]
> If you compress inline instead (`pg_dumpall ... | gzip > dump.sql.gz`), `set -o pipefail` is what keeps a failed dump from being masked by a successful `gzip` exit. Without it, the pipeline's exit code is `gzip`'s alone and a failed dump still produces a plausible-looking file.

---

## The safe order

Every stateful-service major upgrade follows the same sequence, whichever family is moving:

1. **Quiesce writers and consumers — all of them.** Stop every process that writes the stores you are about to back up: the application and its workers, and any profile apps that write their own stores (Nango's server, Twenty, Plane, WordPress/Drupal) when those stores are the ones moving. Leave the database containers themselves running for now — your own backup step needs them. `pg_dumpall` snapshots each database in turn, not the whole cluster at one instant, which is exactly why the writers must already be stopped when it runs.
2. **Run the preflight** and resolve what it reports. `STOP` means back up and migrate along the supported path; anything `BLOCKED` or `FAIL-CLOSED` means do not proceed until the finding is resolved — with one named exception: for the exact MariaDB/Neo4j/Redis transitions [Service families](#service-families) documents as a manual guarded script, today's preflight reports `FAIL-CLOSED: unsupported upgrade hop` only because its own shipped decision table hasn't been updated yet, not because the hop is actually unsafe. Every *other* `FAIL-CLOSED` or `BLOCKED` finding — unknown version, ledger/volume mismatch, interrupted migration, unidentified volume, a downgrade, or an unsupported hop your service's section doesn't name — stays a hard stop.
3. **Take verified backups** — the bundle plus a hardened cluster dump per affected Postgres service (above). Verify the checksums. Confirm `CINATRA_ENCRYPTION_KEY` and your other non-derivable secrets are preserved separately.
4. **Stop and remove the database container itself, then migrate along a supported path only.** Every guarded migration path on this page refuses to start while *any* container — running or merely stopped — still references the volume (`docker compose stop <service>` alone is not enough; remove it too, e.g. `docker compose rm -f <service>`, where `<service>` is your compose service name — `postgres`, `nango-db`, `wordpress-db`, `drupal-db`, `neo4j`, `redis`, not the matrix id a script's own `--service` flag takes). It performs the migration or restore in a fresh candidate/target volume, verifies there, then cuts over onto the original volume at a single commit boundary — see [Rollback](#rollback) for exactly what that does and does not leave you. A hop the preflight does not name as supported has no CLI-driven path — but check [Service families](#service-families) first: three families ship a manual guarded *script* for their one supported hop even though the CLI preflight doesn't know about it yet. Outside of those, staying on the pinned major is the supported position. And if a `STOP` message names a migration command your installed CLI does not actually provide (check `cinatra --help`), do not improvise the migration by hand against your only copy — keep the verified backups and stay on the current pin until you run a CLI version that ships the command.
5. **Verify the store itself** before anything else touches it: the service comes up healthy on the new major, databases and roles are present, row counts look right.
6. **Boot the application** — schema migrations run at boot, not before it (see the boot order below).
7. **Account for derived state.** The knowledge-graph projection (Graphiti) is derived from the objects layer, so it is never *migrated* — but do not discard it expecting an automatic rebuild either; see [Graphiti](#graphiti) for what does and does not happen on its own.
8. **Restart consumers and verify functionally.** `cinatra status`, then `cinatra doctor`, then a real sign-in and an agent run.

---

## Boot order: install, then boot, then rebuild WayFlow

Order mistakes around boot are the most common way a correct data migration still ends in a broken instance:

- **Let the app boot before hand-running anything.** At boot the application first applies its additive schema bootstrap and then runs any pending core migrations itself. Running the versioned migration chain alone against a database that has not received the new bootstrap fails — a migration may reference a column only the bootstrap creates. The boot *is* the migration step: move the code, boot, and only reach for manual schema tools if the boot itself reports a schema problem (see [Troubleshooting](troubleshooting.md)).
- **Rebuild the WayFlow image when its runtime changed.** The WayFlow sidecar is built locally from the checkout (`docker compose build wayflow`), and recreating app containers does not rebuild it. New application code against a stale sidecar runtime breaks agent runs — rebuild it whenever an upgrade changed the sidecar's runtime or dependencies, and on any post-upgrade agent-run failure that smells like a version skew (for example, attestation errors).

So the full order is: move the checkout (install/update) → migrate or restore base stores → **boot** (self-bootstraps, then migrates) → rebuild WayFlow if its runtime changed → verify.

---

## Rollback

Every guarded path on this page (the CLI's `db upgrade-major` and the three manual scripts alike) performs the migration or restore in a **fresh candidate/target volume first**, verifies there, and only *then* reaches a single **commit boundary**: it wipes the original named volume and copies the verified result into it, so the volume keeps the identity your compose file and the ledger expect. Before that commit boundary, the frame only ever mounts the original volume read-only — to make the working clone, plus (for redis/valkey specifically) one earlier read-only peek to detect the AOF/persistence mode before anything starts; at and after the commit boundary it necessarily mounts the (by-then-empty) original read-write to wipe and refill it, then again to verify the result. What this means for you depends on which of the three documented outcomes you're looking at (the [exit-code contract](#postgres)):

- **Exit `5` (aborted pre-commit, verified).** The original volume was never mutated — it was only ever mounted read-only, so it's still exactly your pre-upgrade data. Any candidate/target volume this run created is removed on a best-effort basis (`|| true` in the shell frame — a stray one occasionally needs manual `docker volume rm`), and the ledger carries the source entry again. Any backup artifact the run had already produced before the abort is left on disk, not deleted.
- **Exit `4` (interrupted).** Either the ledger rollback itself failed before the commit boundary, or something failed at/after it. The pending journal and whatever recovery material exists (a candidate/target volume, a checksummed backup if that step had completed) are retained — resolve the finding named in the output before touching anything further; do not assume the original volume is either intact or migrated until you've checked.
- **Exit `0` (committed).** The original named volume now holds the **new** major's data — the old bytes are gone from it. If you decide afterward that you need the old major back, "rollback" is **not** "point the service back at the old volume": restore your verified backup artifact (the hardened `pg_dumpall` dump, `mariadb-dump`, the `neo4j-admin database dump`, or the redis/valkey backup tar — whichever family you migrated) into a **fresh** volume, and pin the service back to the previous image. That fresh volume has a new identity of its own: for **Postgres**, which drives the CLI's own deployed-version ledger, a subsequent `cinatra instance db upgrade-preflight` run will report a ledger/volume mismatch until it's reconciled; the preflight never reads a standalone `UPGRADE_LEDGER_FILE`, so for **MariaDB/Neo4j/Redis** the same mismatch instead surfaces the next time you run that family's *own* script again — its `begin` step checks the identical binding. Keep the backup artifact until the upgraded instance has passed functional verification and a fresh backup taken on the new major exists.

Note the direction rule: the preflight **blocks downgrades**. A rollback after a completed (exit `0`) migration is a restore of your backed-up old data into a fresh volume under the old image pin — never a newer data directory forced under an older image, and never an assumption that the original volume still has old bytes sitting in it.

---

## Service families

The preflight's decision table ships with the CLI, keyed by the compose service names in the bundled `docker-compose.yml`. Per family, the supported major hops today:

| Family | Compose services | Supported major hops |
|--------|------------------|----------------------|
| [Postgres](#postgres) | `postgres`, `nango-db`, `twenty-db`, `plane-db` | `postgres` 17 → 18; `nango-db` 15 → 17 (case-scoped) |
| [MariaDB](#mariadb) | `wordpress-db`, `drupal-db` | none via the CLI preflight — `wordpress-db`/`drupal-db` 11.4 → 11.8 ships as a manual guarded script |
| [Neo4j](#neo4j) | `neo4j` | none via the CLI preflight — 5.26 → 2026.05 ships as a manual guarded script |
| [Redis and Valkey](#redis-and-valkey) | `redis`, `twenty-redis`, `plane-redis` | none via the CLI preflight — `redis` 7 → 8 ships as a manual guarded script |
| [RabbitMQ](#rabbitmq) | `plane-mq` | none |
| [MinIO](#minio) | `plane-minio` | not evaluated by the preflight |
| [Verdaccio](#verdaccio) | `verdaccio` | none |
| [Graphiti](#graphiti) | `graphiti` | derived state — never migrated, and not disposable either |

"None via the CLI preflight" and "none" are real answers, not omissions: for those families (or that direction of travel) the preflight fails closed on any major change, and staying on the pinned major is the supported position. Three families additionally ship a guarded **script** in the product checkout that the CLI's own preflight does not evaluate yet — their sections below say exactly how to run it and what "outside the preflight" means for you operationally.

> [!WARNING]
> The MariaDB, Neo4j, and Redis scripts below have **no dry run and no `--yes` confirmation** — the invocation shown is the invocation that executes, immediately, once you run it. Before running any of them: stop **and remove** the service's own database container (`docker compose stop <service>` alone is not enough — the guarded frame refuses while *any* container, running or merely stopped, still references the volume; follow it with `docker compose rm -f <service>`), and make sure your own compose/image-tag override for that service already names the **target** version. These scripts migrate the volume's contents, not your compose configuration — bring the container back up on the old pin afterward and you have recreated the exact crash-loop class this page exists to prevent.
>
> Also confirm the **exact Docker volume name** first — every `--volume` value below is the *compose-file key* (`cinatra-wordpress-db`, `cinatra-neo4j-data`, `cinatra-redis`, …), and Docker Compose prefixes that key with the project name at runtime (`cinatra_cinatra-wordpress-db` on the default bundled stack; an isolated instance prefixes its own project name instead — the same rule the [hardened `pg_dumpall` recipe](#back-up-a-hardened-cluster-dump-per-postgres-service) already applies to container names). Run `docker volume ls` or `docker compose config --format json | jq '.volumes'` and pass what you actually get back, not the bare compose key.

### Postgres

Four independent Postgres services run in the bundled stack — the platform database (`postgres`), Nango's OAuth-broker database (`nango-db`), and the Twenty and Plane app databases (`twenty-db`, `plane-db`). Each has its own volume, its own detected major, and its own verdict; upgrading one says nothing about the others.

Supported hops in the shipped decision table: the platform database **17 → 18**, and a case-scoped `nango-db` **15 → 17** entry that exists specifically for older installs whose Nango volume was initialized under Postgres 15 — the exact volume class that crash-loops on a naive recreate. There is no *general* `nango-db` 16 → 17 transition: `nango-db` otherwise holds at 17 (Nango's own upstream reference compose pins 16, so 17 is already a validated divergence — but only the pre-baseline pg15 case is a sanctioned hop). `twenty-db` and `plane-db` are held at their upstream-dictated majors (16 and 15.7 respectively) — Twenty and Plane choose their own Postgres major, and neither has an in-place hop today.

On a supported pending hop the preflight's `STOP` message names the backup step, the sanctioned migration command for that exact source → target hop, and this page. A hop the stop message does not name has no sanctioned path — and a named command only counts once your installed CLI actually provides it (step 4 of [the safe order](#the-safe-order)): never improvise the hop by hand against your only copy of the data.

#### Run the guarded migration

```bash
cinatra instance db upgrade-major --service <postgres|nango-db> [--instance <slug>] [--target <version>] [--backup-dir <dir>] [--yes] [--json]
```

`--service` takes the *compose* service name (`postgres` or `nango-db`; `twenty-db`/`plane-db` are accepted but never have a pending hop to execute — they report an already-at-target no-op). Run it from inside your `cinatra` checkout: on `--yes` it delegates the destructive dump → fresh-volume → restore mechanics to `scripts/upgrade/postgres-upgrade-major.sh` in that checkout, and refuses with a usage error if the script is not there. `--backup-dir` is optional but should not be: skip it and the checksummed dump lands in a throwaway OS temp directory instead of somewhere you'll actually retain — pass a durable path explicitly. `--json` only shapes the dry-run preview below; a `--yes` run always streams the guarded shell frame's own human-readable log, `--json` or not.

Before `--yes`, stop **and remove** the service's own database container — `docker compose stop <service>` alone is not enough, the guarded frame refuses to proceed while *any* container (running or merely stopped) still references the volume: `docker compose rm -f <service>` after stopping it.

Default is a **dry run** — it resolves the deployed major, re-checks eligibility through the same logic the preflight uses, and prints the guarded frame's exact ordered steps without touching anything, for example:

```
Guarded Postgres major upgrade — nango-db: 15 -> 17 (case-scoped exception)
  volume 'cinatra_nango-postgres' (mount /var/lib/postgresql/data -> /var/lib/postgresql/data)
  steps (each gates the next; the source volume is intact until the commit boundary):
    1. quiesce writers
    2. disk-space precheck (clone + dump)
    3. ledger BEGIN (pending journal; live entry stays the source)
    4. verified backup off a read-only clone (pg_dump 15, checksummed)
    5. fresh pg17 volume at /var/lib/postgresql/data + restore
    6. post-verify the restored target (server version + content read-back)
    7. COMMIT BOUNDARY: cut over onto the original volume (identity preserved)
    8. post-cutover verify
    9. ledger COMMIT (only after post-verify)
  Backup retained under your retention window; the old volume is preserved until post-verify passes.
  Re-run with --yes to execute. See https://docs.cinatra.ai/self-hosting/upgrading-stateful-services.
```

Add `--yes` to execute for real — but only *after* you have done steps 1–3 of [the safe order](#the-safe-order) yourself (quiesce, preflight, verified backups): `--yes` runs the guarded frame itself, it does not run the safe order around it.

The guarded-transaction exit-code contract, shared by every family's guarded path on this page:

| Code | Meaning |
|------|---------|
| `0` | Upgraded and verified, ledger committed. (`cinatra instance db upgrade-major` additionally short-circuits to this code as a clean no-op when you're already at the target version — that shortcut is CLI-only; the raw family scripts always run the full guarded transaction, so there's nothing to invoke once you're at the target.) |
| `2` | Usage or misconfiguration, refused before any durable store is mutated (disk-precheck reads and other read-only docker activity may already have happened). |
| `3` | Fail-closed refusal **before any durable store is mutated** (unsupported/downgrade hop, an unquiesced volume, a failed disk precheck, or a ledger `begin` the ledger itself refused). |
| `4` | Fail-closed **interrupted**: either a failure at or after the commit boundary, *or* a pre-commit abort whose own ledger rollback itself failed. Either way the pending ledger journal is retained, and whatever recovery material this run had already created (a candidate/target volume, a checksummed backup if the backup step itself had completed) is kept — resolve them before retrying. |
| `5` | Aborted **before** the commit boundary: rolled back and *verified* — the source volume is untouched and the ledger carries the source entry again. |

Family-specific facts that matter during the migration window:

- A Postgres cluster initialized under one major cannot be opened by another. Never point a new-major image at the old volume "to check" — that is precisely the crash-loop this page exists to prevent.
- The volume **mount target is major-dependent** in the official images: majors up to and including 17 mount the data volume at `/var/lib/postgresql/data`, while 18 and later moved the data layout and mount the parent `/var/lib/postgresql`. `db upgrade-major` resolves each side's mount from its own major automatically; a hand-rolled migration that assumes one path or the other will point a healthy image at the wrong place.
- The [hardened `pg_dumpall` recipe](#back-up-a-hardened-cluster-dump-per-postgres-service) applies per service, with that service's container name and superuser, as a backup you take **yourself** before running the guarded migration — it is independent of the guarded frame's own internal dump.

### MariaDB

`wordpress-db` and `drupal-db` (MariaDB) back the WordPress and Drupal containers in the bundled stack — integration-test target instances, not Cinatra's own state; a real deployment usually connects your own CMS instances instead (see [the Cinatra environment](README.md#the-cinatra-environment)).

`cinatra instance db upgrade-preflight` does not yet recognize a supported hop for either service — its shipped decision table still holds both at a single version with no listed transition, so it fails closed on any MariaDB major change today. Below the CLI, though, a guarded engine-upgrade path now ships in the `cinatra` product checkout for the one hop the product's own matrix supports: **11.4 → 11.8**, in-place, sequential-only (11.4 → 12.0 skips 11.8 and is fail-closed — step through 11.8 first).

#### How to run it

The mechanism is `scripts/upgrade/mariadb-upgrade-major.sh` in your `cinatra` checkout — the same guarded frame Postgres uses (clone the source volume read-only to a writable candidate → start the source-version server on the candidate and take a verified `mariadb-dump --all-databases` backup off it *while it's still running* → only then a clean, full-purge shutdown (`innodb_fast_shutdown=0`) of that server, the state `mariadb-upgrade` expects → explicit `mariadb-upgrade` on the candidate, falling back to a dump/restore rebuild (with a healthcheck-credential realignment) if the in-place step fails → `mariadb-check` plus a version post-verify → commit-boundary cutover), run directly rather than through `cinatra instance db upgrade-major` — that command covers Postgres only today. `--backup-dir` is required (unlike the CLI, there is no temp-dir fallback):

```bash
UPGRADE_MARIADB_ROOT_PASSWORD=<the instance's MariaDB root password> \
UPGRADE_LEDGER_FILE=/secure/backups/mariadb-ledger.json \
scripts/upgrade/mariadb-upgrade-major.sh \
  --service wordpress-mariadb --volume cinatra_cinatra-wordpress-db \
  --from 11.4 --to 11.8 --backup-dir /secure/backups
```

(`cinatra_cinatra-wordpress-db` is the resolved Docker volume name on the default bundled stack — confirm yours per the warning above.) Use `--service drupal-mariadb --volume cinatra_cinatra-drupal-db` for the Drupal database — same script, same transition. `UPGRADE_LEDGER_FILE` is a standalone file ledger with the same begin/commit/rollback semantics as the CLI's own deployed-version ledger, but it is **not** that ledger: this path runs outside `cinatra instance db upgrade-preflight`'s view (see the warning above for what to do before you run it), and do not expect a later preflight run to reflect the new version until the CLI is wired to this family. Exit codes follow the same [contract as Postgres](#postgres) (`0`/`2`/`3`/`4`/`5`).

If you carry data you care about in either database and are not moving to 11.8 specifically, back it up with `mariadb-dump` before any image change and stay on the pinned major — every other MariaDB hop is unsupported.

### Neo4j

`neo4j` stores the knowledge graph behind the objects layer's derived index. Its version axis is known to the decision table (the `5` line and the `2026.05` calendar-versioned line), so a major change is classified — but `cinatra instance db upgrade-preflight` does not yet recognize a supported hop here either (its shipped copy still lists no transition for this service).

The product checkout ships a guarded path for the one hop Neo4j actually supports: the semver → CalVer major move **5.26 → 2026.05**. Cinatra's own matrix treats this as one-way — downgrades stay unsupported — so the pre-migration dump this path takes offline is your rollback if you need to go back.

#### How to run it

`scripts/upgrade/neo4j-upgrade-major.sh` clones the volume — the original is mounted read-only for that one copy and never touched again until cutover — to a writable candidate, then runs the migration itself **offline** on that candidate: a throwaway 5.26 server starts, captures a content fingerprint, and is cleanly stopped; only then, with the server down, do separate offline `neo4j-admin` tools take over — `neo4j-admin database dump` of every database first (the RPO floor for this family), then `neo4j-admin database migrate` per database under the TARGET (2026.05) tooling explicitly — never the server's own first-start auto-migration — before the candidate is verified and cut over:

```bash
UPGRADE_NEO4J_PASSWORD=<the deployed neo4j password, 8+ characters> \
UPGRADE_LEDGER_FILE=/secure/backups/neo4j-ledger.json \
scripts/upgrade/neo4j-upgrade-major.sh \
  --service neo4j --volume cinatra_cinatra-neo4j-data \
  --from 5.26 --to 2026.05 --backup-dir /secure/backups
```

(`cinatra_cinatra-neo4j-data` is the resolved Docker volume name on the default bundled stack — confirm yours per the warning above.)

`UPGRADE_NEO4J_PASSWORD` must be the volume's actual deployed password so the post-verify read-backs can authenticate — read from the environment only, never argv. `--backup-dir` is required, same as MariaDB. As with [MariaDB](#mariadb), this runs outside the CLI's own ledger and preflight (see the warning above for what to do before you run it), and exit codes follow the same [contract as Postgres](#postgres).

Note that the [backup bundle](backup-and-restore.md) does **not** include the graph store. The graph is derived state (see [Graphiti](#graphiti)); its authoritative inputs live in Postgres. The `neo4j-admin database dump` this path takes is the pre-migration RPO floor for the store itself, not a substitute for the application backup.

### Redis and Valkey

Three services: `redis` (the platform's BullMQ queues, AG-UI event streams, and caches), `twenty-redis`, and `plane-redis` (Valkey). `cinatra instance db upgrade-preflight` does not yet recognize a supported hop for any of them, and the "empty/fresh volume passes" non-finding only applies to `redis` and `plane-redis` — both have a real named volume to check. `twenty-redis` has no named volume in the compose config at all, so discovery cannot identify one to check; today that resolves to a `FAIL-CLOSED` "data volume could not be identified" finding rather than a pass, even though operationally there's genuinely nothing to migrate.

The product matrix supports exactly one forward hop: the platform's own **`redis` 7 → 8** (its RDB format is forward-readable). The reverse, **8 → 7, is a fail-closed downgrade** — Redis 8 writes an RDB version 7 refuses outright, so reverting means clearing the dump first, not a guarded migration. `twenty-redis` and `plane-redis` (Valkey) have no supported hop at all, but they're not the same shape: `plane-redis` has its own named volume (`cinatra-plane-redisdata`) — its fail-safe path is discard-and-recreate, dropping that volume so it reinitializes empty. `twenty-redis` has **no named volume at all** (it's a bare ephemeral cache) — there's nothing to drop; a major bump there is just an ordinary container recreate.

#### How to run it

`scripts/upgrade/redis-upgrade-major.sh` carries the platform `redis` 7 → 8 hop forward instead of discarding it — the same clone → verified-backup → migrate → verify → cutover frame, with persistence (AOF vs. RDB-only) detected from the volume bytes before any server starts, and post-verify done with a full-state digest (every key, type-aware) rather than trusting `DUMP`, whose encoding is version-dependent:

```bash
UPGRADE_LEDGER_FILE=/secure/backups/redis-ledger.json \
scripts/upgrade/redis-upgrade-major.sh \
  --service platform-redis --volume cinatra_cinatra-redis \
  --from 7 --to 8 --backup-dir /secure/backups
```

(`cinatra_cinatra-redis` is the resolved Docker volume name on the default bundled stack — confirm yours per the warning above.) `--backup-dir` is required, same as MariaDB and Neo4j. As with the other families, this runs outside the CLI's own ledger and preflight (see the warning above for what to do before you run it), and exit codes follow the same [contract as Postgres](#postgres). Do not assume the platform's Redis is disposable just because a discard-and-recreate fallback exists for `plane-redis`: queues and event streams are state, and dropping them mid-flight loses in-progress work.

### RabbitMQ

`plane-mq` is Plane's message broker. Its axis is known to the decision table; no hop is supported yet, and no guarded script ships for this family — the preflight fails closed on a major change. Per Cinatra's own matrix rationale, the blocking detail on the 3.x → 4.0 jump is **feature-flag-gated**: every stable 3.13 feature flag needs to be enabled first, or the upgrade may fail — so this hop stays unsupported here until that flag-enabling step itself has an executable, proven path. Because the queue holds regenerable state rather than canonical data, the fail-safe option today is discard-and-recreate: drain the queue, stop the container, recreate on the new pin.

### MinIO

`plane-minio` holds Plane's object storage. It is **not in the CLI's shipped decision table**, so `cinatra instance db upgrade-preflight` does not evaluate it — there is no ledger entry and no verdict for it. The product's own matrix (the source the CLI's copy is reconciled from) pins the image to an immutable dated release (digest-bound, replacing the previous floating `:latest` tag) and holds it there; an existing `:latest` volume's actual release is an unrecorded unknown until something classifies it, so that matrix fail-closes the hop by design rather than guessing. Cinatra ships no guarded migration path for this family — treat any MinIO image change as your own manual change: back up the volume first (object data must roll forward in place) and apply the same safe order by hand.

### Verdaccio

`verdaccio` is the npm-compatible registry backing the extension marketplace; its storage volume holds the extension packages this instance has published and installed. Its axis is known to the decision table; no hop is supported — the preflight fails closed on a major change. The pin holds at the `6` line deliberately: `7` is prerelease-only upstream, so no major is offered until it stabilizes. This is a dev/ephemeral registry cache, not canonical application state — the matrix's own fail-safe path for it is discard-and-recreate, since re-publishing your extensions repopulates it — but re-publishing everything by hand is tedious enough that backing the volume up before any image change is still worth doing, even though no guarded migration exists yet.

### Graphiti

`graphiti` (the knowledge-graph-mcp front-end) projects objects into Neo4j **asynchronously** — the graph is a derived index, not a source of truth (see [Objects layer](../../references/platform/objects-layer.md)), so there is no data *migration* for it: after the base stores are migrated and the app is booted, the projector resumes projecting object changes as they happen.

Do not read "derived" as "disposable", though: no whole-graph rebuild command ships today, and the projector deliberately skips re-projecting an object version it has already projected. A graph store you empty does not repopulate itself with history — each object reappears only when it next changes. Keep the Neo4j volume through the upgrade like every other store.

---

## Where to go next

- Routine code upgrades and how migrations apply: [Upgrading](upgrading.md)
- What a backup bundle contains — and the encryption key it does not: [Backup & restore](backup-and-restore.md)
- Post-upgrade verification commands: [Troubleshooting](troubleshooting.md)
- The services this page is about: [The Cinatra environment](README.md#the-cinatra-environment)
