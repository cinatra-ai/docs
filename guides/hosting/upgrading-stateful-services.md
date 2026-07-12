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

1. **Quiesce writers and consumers — all of them.** Stop every process that writes the stores you are about to back up: the application and its workers, and any profile apps that write their own stores (Nango's server, Twenty, Plane, WordPress/Drupal) when those stores are the ones moving. Leave the database containers themselves running — the dump needs them. `pg_dumpall` snapshots each database in turn, not the whole cluster at one instant, which is exactly why the writers must already be stopped when it runs.
2. **Run the preflight** and resolve what it reports. `STOP` means back up and migrate along the supported path; anything `BLOCKED` or `FAIL-CLOSED` means do not proceed until the finding is resolved.
3. **Take verified backups** — the bundle plus a hardened cluster dump per affected Postgres service (above). Verify the checksums. Confirm `CINATRA_ENCRYPTION_KEY` and your other non-derivable secrets are preserved separately.
4. **Migrate or restore the base stores, offline, along a supported path only.** Restore into a **fresh volume** and leave the old volume untouched — never migrate in place over the only copy of your data. A hop the preflight does not name as supported has no sanctioned path: staying on the pinned major is the supported position. And if a `STOP` message names a migration command your installed CLI does not actually provide (check `cinatra --help`), do not improvise the migration by hand against your only copy — keep the verified backups and stay on the current pin until you run a CLI version that ships the command.
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

What your preparation bought you:

- **The old volume, untouched.** If you migrated the way this page requires — restoring into a fresh volume, never in place — the source volume still holds the pre-upgrade cluster. Rolling back is: stop the stack, pin the previous image, point the service back at the old volume. Only do this if nothing has written data to the new store that you need to keep.
- **The verified backup artifact.** The hardened cluster dump restores onto a fresh cluster of the source major — a new volume, another host — independent of what happened to either volume, provided the target has the same Postgres extensions available.
- **The ledger stays truthful.** A rolled-back migration restores the service's source ledger entry, so the preflight keeps reporting the instance as it actually is.

Note the direction rule: the preflight **blocks downgrades**. A rollback is a restore of old data under the old image pin — not a newer data directory forced under an older image.

Keep the old volume and the backup artifact at least until the upgraded instance has passed functional verification and a fresh backup taken on the new major exists.

---

## Service families

The preflight's decision table ships with the CLI, keyed by the compose service names in the bundled `docker-compose.yml`. Per family, the supported major hops today:

| Family | Compose services | Supported major hops |
|--------|------------------|----------------------|
| [Postgres](#postgres) | `postgres`, `nango-db`, `twenty-db`, `plane-db` | `postgres` 17 → 18; `nango-db` 15 → 17 and 16 → 17 |
| [MariaDB](#mariadb) | `wordpress-db`, `drupal-db` | none |
| [Neo4j](#neo4j) | `neo4j` | none |
| [Redis and Valkey](#redis-and-valkey) | `redis`, `twenty-redis`, `plane-redis` | none |
| [RabbitMQ](#rabbitmq) | `plane-mq` | none |
| [MinIO](#minio) | `plane-minio` | not evaluated by the preflight |
| [Verdaccio](#verdaccio) | `verdaccio` | none |
| [Graphiti](#graphiti) | `graphiti` | derived state — never migrated, and not disposable either |

"None" is a real answer, not an omission: for those families the preflight fails closed on any major change, and staying on the pinned major is the supported position.

### Postgres

Four independent Postgres services run in the bundled stack — the platform database (`postgres`), Nango's OAuth-broker database (`nango-db`), and the Twenty and Plane app databases (`twenty-db`, `plane-db`). Each has its own volume, its own detected major, and its own verdict; upgrading one says nothing about the others.

Supported hops in the shipped decision table: the platform database **17 → 18**, and `nango-db` **16 → 17** plus a case-scoped **15 → 17** entry that exists specifically for older installs whose Nango volume was initialized under Postgres 15 — the exact volume class that crash-loops on a naive recreate.

On a supported pending hop the preflight's `STOP` message names the backup step, the sanctioned migration command for that exact source → target hop, and this page. A hop the stop message does not name has no sanctioned path — and a named command only counts once your installed CLI actually provides it (step 4 of [the safe order](#the-safe-order)): never improvise the hop by hand against your only copy of the data.

Family-specific facts that matter during the migration window:

- A Postgres cluster initialized under one major cannot be opened by another. Never point a new-major image at the old volume "to check" — that is precisely the crash-loop this page exists to prevent.
- The volume **mount target is major-dependent** in the official images: majors up to and including 17 mount the data volume at `/var/lib/postgresql/data`, while 18 and later moved the data layout and mount the parent `/var/lib/postgresql`. A hand-rolled migration that assumes one path or the other will point a healthy image at the wrong place.
- The [hardened `pg_dumpall` recipe](#back-up-a-hardened-cluster-dump-per-postgres-service) applies per service, with that service's container name and superuser.

### MariaDB

`wordpress-db` and `drupal-db` (MariaDB) back the WordPress and Drupal containers in the bundled stack — integration-test target instances, not Cinatra's own state; a real deployment usually connects your own CMS instances instead (see [the Cinatra environment](README.md#the-cinatra-environment)).

No major hop is supported: the preflight fails closed on any MariaDB major change. If you carry data you care about in these databases, back it up with `mariadb-dump` before any image change and stay on the pinned major.

### Neo4j

`neo4j` stores the knowledge graph behind the objects layer's derived index. Its version axis is known to the decision table (the `5` line and the `2026.05` calendar-versioned line), so a major change is classified — and no hop is supported: the preflight fails closed.

Note that the [backup bundle](backup-and-restore.md) does **not** include the graph store. The graph is derived state (see [Graphiti](#graphiti)); its authoritative inputs live in Postgres.

### Redis and Valkey

Three services: `redis` (the platform's BullMQ queues, AG-UI event streams, and caches), `twenty-redis`, and `plane-redis` (Valkey). Their axes are known to the decision table; no major hop is supported, and the preflight fails closed on one.

An empty or fresh volume passes — but do not assume the platform's Redis is disposable: queues and event streams are state, and dropping them mid-flight loses in-progress work. Quiesce first (step 1 of the safe order), always.

### RabbitMQ

`plane-mq` is Plane's message broker. Its axis is known to the decision table; no major hop is supported — the preflight fails closed on a major change.

### MinIO

`plane-minio` holds Plane's object storage. It is **not in the shipped decision table**, so the preflight does not evaluate it — there is no ledger entry and no verdict for it. Treat any MinIO image change as your own manual change: back up the volume first, and apply the same safe order by hand.

### Verdaccio

`verdaccio` is the npm-compatible registry backing the extension marketplace; its storage volume holds the extension packages this instance has published and installed. Its axis is known to the decision table; no major hop is supported — the preflight fails closed on a major change.

### Graphiti

`graphiti` (the knowledge-graph-mcp front-end) projects objects into Neo4j **asynchronously** — the graph is a derived index, not a source of truth (see [Objects layer](../../references/platform/objects-layer.md)), so there is no data *migration* for it: after the base stores are migrated and the app is booted, the projector resumes projecting object changes as they happen.

Do not read "derived" as "disposable", though: no whole-graph rebuild command ships today, and the projector deliberately skips re-projecting an object version it has already projected. A graph store you empty does not repopulate itself with history — each object reappears only when it next changes. Keep the Neo4j volume through the upgrade like every other store.

---

## Where to go next

- Routine code upgrades and how migrations apply: [Upgrading](upgrading.md)
- What a backup bundle contains — and the encryption key it does not: [Backup & restore](backup-and-restore.md)
- Post-upgrade verification commands: [Troubleshooting](troubleshooting.md)
- The services this page is about: [The Cinatra environment](README.md#the-cinatra-environment)
