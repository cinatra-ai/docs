# Upgrading

Cinatra has two things you can update, and they are deliberately separate: the **`cinatra` CLI** (the tool you install globally) and a **Cinatra instance** (the checkout you deploy and run). The single command `cinatra update` handles both — in a terminal it asks which one you mean; in a script it does the instance.

For a first-time install see [Installation](installation.md). For the environment your instance reads at runtime see [Configuration](configuration.md). For how a production release is actually shipped, see [Operations](operations.md). Back to the [Hosting Guide](README.md).

---

## Two update targets

```bash
cinatra update
```

`cinatra update` is a two-choice command:

1. **Update the CLI** — reinstall the global `@cinatra-ai/cinatra` package at its latest published version. This changes the *tool*, not any instance.
2. **Update an instance** — move *this* checkout forward to newer code and reconcile it. This changes the *deployment* you are standing in.

`cinatra upgrade` is an alias for `cinatra update` — the two are interchangeable.

### How the choice is resolved

- **In a terminal (interactive):** a picker appears (`↑/↓` or `1`/`2`, then Enter). The default highlighted choice is **update the CLI**.
- **Non-interactively (piped, CI, or no TTY):** it never prompts. To keep existing `cinatra update` scripts working, it defaults to the **instance** update unless you pass `--cli`.
- **Explicit flags always win** and bypass the prompt: `--cli`, `--instance`, or any instance-only flag (`--ref`, `--force`, `--docker=…`, `--no-docker`).

---

## Update the CLI

```bash
cinatra update --cli
```

This runs `npm install -g @cinatra-ai/cinatra@latest` and reports the version it installed.

Because the update replaces the code of the tool you are currently running, the running process still holds the old code. **Re-run `cinatra` after it finishes** to pick up the new version. Use `cinatra update --cli --dry-run` to see the exact command without changing anything.

If the global install fails on permissions, that is an npm global-prefix issue on your machine (you may need a different npm prefix or elevated permissions), not a Cinatra problem.

---

## Update an instance

```bash
cinatra update --instance
```

Run this **from inside the instance's checkout**. It moves the checkout forward and then reconciles it, and what "forward" means depends on the instance's runtime mode (read from `.env.local` — see [`CINATRA_RUNTIME_MODE`](configuration.md#cinatra_runtime_mode)):

| Instance type | What the update does |
|---------------|----------------------|
| **Development** — `CINATRA_RUNTIME_MODE` is anything other than `production`/`prod` (the default) | Fast-forwards the checkout to the latest `origin/main`, then reconciles dependencies and the dev database schema to the new code. Restart your dev server (`make dev`) afterwards. |
| **Production** — `CINATRA_RUNTIME_MODE` is `production` (or `prod`) | Moves the checkout to the latest `v*` release tag. It does **not** run the dev reconcile — production runs release-tagged Docker images, so the checkout move is only the first half. Apply it the production way: rebuild/redeploy the release-tagged images (see [Operations](operations.md)). |

Pin a specific target with `--ref` instead of the type default:

```bash
cinatra update --ref <release-tag>        # move this instance to a specific release tag
cinatra update --ref <branch-or-sha>
```

Passing any instance-only flag (`--ref`, `--force`, `--docker=…`, `--no-docker`) implies `--instance`, so `cinatra update --ref <release-tag>` "just works" without also typing `--instance`.

### Preconditions and safety

- **You must be inside an installed checkout.** The command reads `.env.local` for the runtime mode; if there is no `.env.local` (or it names no mode), there is nothing to update — run [`cinatra install`](installation.md) first.
- **A dirty or divergent tree is refused** so an update can never silently discard your work. Re-run with `--force` to stash a dirty working tree / hard-reset a divergent branch before moving, exactly like `cinatra install --force`.
- **All flags are validated before anything happens.** A typo fails loudly *before* any `npm install` or git move, so a bad invocation can never half-apply an update.
- Preview any update with `--dry-run`: it describes the chosen action and makes no changes.

### Options

| Flag | Applies to | Effect |
|------|-----------|--------|
| `--cli` | CLI | Update the CLI itself (mutually exclusive with the instance flags). |
| `--instance` | instance | Update the instance (move checkout + reconcile); bypasses the prompt. |
| `--ref <ref>` | instance | Move to a specific branch, tag, or commit instead of the type default. |
| `--force` | instance | Stash a dirty tree / hard-reset a divergent branch first. |
| `--docker=auto` | instance (dev) | Start the bundled Docker stack only when this checkout owns it. Default. |
| `--docker=always` | instance (dev) | Force `docker compose up -d` during the reconcile and treat failure as fatal. |
| `--no-docker` | instance (dev) | Skip the Docker step of the reconcile. |
| `--dry-run` | both | Describe the chosen action; make no changes. |

---

## What the dev reconcile does

For a development instance, the second half of the update reconciles your environment to the freshly-moved code — the same work as the [`cinatra instance refresh`](installation.md#keeping-your-checkout-up-to-date) reconcile. It:

1. Brings up the bundled Docker infrastructure (Postgres, Redis, Nango) when this checkout owns it (`--docker=auto`), or is told to (`--docker=always`), or skips it (`--no-docker`).
2. Installs dependencies (`pnpm install`).
3. Applies database changes: the idempotent **additive** schema bootstrap, followed by the **versioned core migration chain** (`migrations/core/`, recorded in the `pgmigrations` ledger).

### Migrations apply automatically

You do not hand-run migrations on a dev update. Additive schema changes are reconciled automatically, and transformational changes (renames, backfills) ship in the versioned core migration chain that the reconcile applies for you — release-note-driven manual migration steps are retired. A fresh schema simply ledger-records the historical migrations (the bootstrap already creates the current shape); an existing database executes only the pending ones. This matches the reconcile behaviour described under [Keeping your checkout up to date](installation.md#keeping-your-checkout-up-to-date).

### Repairing a broken schema

If an instance's schema is wedged and the app will not boot, the migration chain can be applied directly against Postgres — even while the app is down — with:

```bash
cinatra instance db migrate
```

This talks to the database directly (it does not need a running app), applies the additive bootstrap plus the versioned core migration chain, and is safe to re-run. Use `--down` / `--count=N` to step the ledger. This is a repair tool; the normal path is `cinatra update` on a dev instance, which runs the same migrations as part of the reconcile.

---

## Before you upgrade

- **Take a backup first.** For anything with data you care about, capture a bundle before moving the code: `cinatra instance backup create`. See [Backup & restore](backup-and-restore.md).
- **Know your blast radius for production.** A production release ships everything merged up to the tag you move to, not one change. Review the difference between the deployed tag and your target before promoting — see [Operations](operations.md#deploying-ships-the-current-main-line-not-one-change).
- **Crossing a stateful-service major?** If the upgrade moves a backing store (Postgres, MariaDB, Neo4j, Redis/Valkey, RabbitMQ, MinIO, Verdaccio) across a major version, a code update is not enough — the data volume needs a guarded migration. Run `cinatra instance db upgrade-preflight` and follow [Upgrading stateful services across majors](https://docs.cinatra.ai/self-hosting/upgrading-stateful-services).

---

## Where to go next

- Capture and restore data around an upgrade: [Backup & restore](backup-and-restore.md)
- How a production release is built and deployed: [Operations](operations.md)
- The environment your instance reads at runtime: [Configuration](configuration.md)
- Recovering from a failed update or a broken schema: [Troubleshooting](troubleshooting.md)
