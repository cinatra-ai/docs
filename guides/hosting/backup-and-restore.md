# Backup & restore

This page covers how to capture a full backup of a Cinatra instance, restore one, and move connector/API configuration between instances — plus the one thing a backup bundle does **not** contain that you must preserve yourself for a real recovery.

For the environment variables referenced here see [Configuration](configuration.md). For upgrading an instance (take a backup first) see [Upgrading](upgrading.md). Back to the [Hosting Guide](README.md).

---

## The commands

All backup operations live under `cinatra instance backup`:

| Command | What it does |
|---------|--------------|
| `cinatra instance backup create [--file <path>]` | Export a full backup **bundle** to `data/backups/`. |
| `cinatra instance backup import [--file <path>\|<filename>] --yes` | Restore a bundle. **Destructive** — requires `--yes`. |
| `cinatra instance backup export-api-configs [--file <path>]` | Export just the connector/API configuration to JSON. |
| `cinatra instance backup import-api-configs [--file <path>\|<filename>] --yes` | Import that JSON into an instance. Overwrites matching configs; requires `--yes`. |

Run any of them from inside the instance's checkout. Each reads the database connection from `.env.local` (`SUPABASE_DB_URL`), so a shell that has that instance's `.env.local` is all you need.

---

## What a full backup contains

`cinatra instance backup create` writes a single gzipped tar bundle. With no `--file`, it lands at:

```
data/backups/cinatra-backup-<timestamp>.tar.gz
```

Inside the bundle:

| Entry | Contents |
|-------|----------|
| `manifest.json` | Bundle metadata: format (`cinatra-backup-bundle`), version, creation time, and an `includes` map recording which of the parts below are present. |
| `postgres/cinatra.sql` | A `pg_dump` of the **application database** — the `SUPABASE_SCHEMA` schema (default `cinatra`) plus `public`, where the Better Auth tables live. Taken with `--clean --if-exists --no-owner --no-privileges` so it restores cleanly onto another database. |
| `postgres/nango.sql` | A dump of the **Nango** OAuth-broker database — **only present when `NANGO_DATABASE_URL` (or `NANGO_DB_URL`) is configured**. This is where connector OAuth credentials are stored. |
| `files/data/…` | A copy of the instance's `data/` directory (for example the local skills store and generated files), excluding any prior backup artifacts. |

So a full bundle captures the application database, the connector-credential database (when you run Nango), and the on-disk `data/` tree — enough to reconstruct the instance's state onto another database and host.

### What it does NOT contain: your encryption key

A backup bundle does **not** include `CINATRA_ENCRYPTION_KEY`, and that key is not recoverable from the bundle. Provider API keys and connector credentials are encrypted **at rest** with that key (AES-256-GCM), so the ciphertext in `cinatra.sql` / `nango.sql` is only usable by an instance that holds the **same** key.

> **Restoring onto an instance with a different `CINATRA_ENCRYPTION_KEY` will leave every encrypted secret unreadable — provider credentials and connector connections would have to be re-entered.** Preserve the key (and your other secrets) separately from the bundle, in your secret manager. See [`CINATRA_ENCRYPTION_KEY`](configuration.md#cinatra_encryption_key).

In development the key is auto-generated into `.env.local` on first boot; for any long-lived instance you set it explicitly and back it up as a secret, not as part of a database dump.

---

## Create a backup

```bash
# Default: data/backups/cinatra-backup-<timestamp>.tar.gz
cinatra instance backup create

# Or choose the destination (a bare filename is placed in data/backups/;
# a relative or absolute path is used as given). Full backups are bundles —
# use a .tar.gz or .tgz name.
cinatra instance backup create --file /secure/backups/pre-upgrade.tar.gz
```

The database must be reachable (`SUPABASE_DB_URL`), and the bundle is assembled with `pg_dump` and `tar` (see [Prerequisites](#prerequisites)). The command prints the path it wrote.

---

## Restore a backup

Restoring is **destructive**: it replaces the current application database (and the Nango database, if the bundle contains one) and the `data/` directory with the bundle's contents. It therefore requires an explicit `--yes`.

```bash
# Restore a specific bundle
cinatra instance backup import --file /secure/backups/pre-upgrade.tar.gz --yes

# With no --file, the most recent bundle in data/backups/ is used
cinatra instance backup import --yes
```

What happens on import:

1. The bundle is extracted and validated (a bundle missing `postgres/cinatra.sql` is rejected before anything is touched).
2. If the bundle contains `postgres/nango.sql`, the target must have `NANGO_DATABASE_URL` (or `NANGO_DB_URL`) configured — otherwise the import aborts before mutating any database, telling you to set it (or to remove the Nango dump to skip it).
3. Each target database is pre-cleaned (the schemas the dump recreates are dropped and `public` is recreated empty), then the dump is applied with `psql -v ON_ERROR_STOP=1` so any restore error stops the load rather than leaving a half-applied database.
4. The `data/` directory is restored from the bundle (your existing local backup files under `data/backups/` are preserved).

A legacy single-file `.sql` backup is still accepted by `import` for older archives; new backups are always bundles.

> Restore into the instance you intend to overwrite. Because import reconciles the database from `.env.local`, run it from the target checkout with that instance's environment — never with a shell `SUPABASE_DB_URL` override pointing somewhere else.

---

## Export / import just the API configuration

Sometimes you do not want a full database restore — you only want to carry the **connector and provider wiring** from one instance to another (for example, to seed a new instance with the same integrations). Two focused commands cover that:

```bash
# Export connector/API configuration to data/cinatra-api-configs-<timestamp>.json
cinatra instance backup export-api-configs

# Import it into another instance (overwrites matching configs)
cinatra instance backup import-api-configs --file cinatra-api-configs-2026-01-01T00-00-00.json --yes
```

These move the metadata rows keyed `connector_config:*` (connector configuration) plus the `openai_connection` entry — the configuration surface, not the full dataset. Export is read-only and writes a JSON file (format `cinatra-api-configs`); with no `--file`, import uses the most recent export in `data/`. Import applies all entries in a single transaction, so a mid-way failure never leaves a half-applied config set.

The same encryption-key caveat applies: any encrypted values in these entries are only usable by an instance holding the matching `CINATRA_ENCRYPTION_KEY`.

---

## Prerequisites

- **`tar`** must be available — the bundle is a gzipped tar archive.
- **The Postgres client tools** (`pg_dump` for create, `psql` for restore). If they are not on your `PATH`, the CLI runs them for you inside a `postgres:17-alpine` **Docker** container (it mounts the backup directory and adjusts the connection string automatically). So you need **either** the Postgres client tools installed **or** Docker available; if neither is present the command fails with an actionable message. Override the container image with `CINATRA_POSTGRES_CLIENT_IMAGE` if you need a different Postgres major version.
- Match the client to your server: restoring a dump taken from a newer Postgres with older client tools can fail. The bundled `postgres:17-alpine` fallback targets a current major version.

---

## Beyond the bundle: a recovery checklist

A bundle alone is not a complete disaster-recovery position. To be able to fully reconstruct an instance, preserve — separately, in your secret manager — everything the bundle deliberately leaves out:

- **The backup bundle** itself (`cinatra-backup-<timestamp>.tar.gz`), stored off the instance host.
- **`CINATRA_ENCRYPTION_KEY`** — without the exact key, encrypted provider/connector secrets in the bundle are unrecoverable.
- **`BETTER_AUTH_SECRET`** and any other secrets from `.env.local` that are not re-derivable, plus provider API keys you cannot simply re-enter.
- **External services you operate yourself** — if your Postgres or Nango databases live outside the bundled Docker stack, back those up with your own database tooling too; the bundle captures a `pg_dump` of them only when the CLI can reach them at backup time.

Store bundles somewhere durable and access-controlled (they contain your full dataset), and keep a retention window that matches your recovery needs.

---

## Disaster recovery: restore onto a fresh host

1. **Stand up an instance** on the new host — [`cinatra install`](installation.md) — so the checkout, `.env.local`, and services exist.
2. **Set the original `CINATRA_ENCRYPTION_KEY`** (and any other preserved secrets) in the new instance's environment, so restored credentials decrypt. This must match the key the backup was taken under.
3. **Configure Nango** (`NANGO_DATABASE_URL`) if the bundle includes `postgres/nango.sql`, so the connector-credential database has somewhere to restore to.
4. **Place the bundle** where the restore can find it — copy it into `data/backups/`, or pass its path with `--file`.
5. **Restore:** `cinatra instance backup import --file <bundle>.tar.gz --yes`.
6. **Verify:** `cinatra status` (auth tables, user count, MCP config) and, for the content-write path, `cinatra doctor`. Sign in and confirm your connectors are connected.

---

## Automating backups

`cinatra instance backup create` is non-interactive and safe to schedule. A minimal cron entry that keeps a nightly bundle:

```bash
# 2:15 AM daily — run from the instance checkout so .env.local is read
15 2 * * *  cd /srv/cinatra && cinatra instance backup create >> /var/log/cinatra-backup.log 2>&1
```

Rotate the resulting bundles out of `data/backups/` to durable, access-controlled storage, and confirm restores periodically — an untested backup is not a backup.

---

## Where to go next

- Take a backup before moving code: [Upgrading](upgrading.md)
- The secrets a restore depends on: [Configuration](configuration.md#cinatra_encryption_key)
- Recovering from a broken instance: [Troubleshooting](troubleshooting.md)
