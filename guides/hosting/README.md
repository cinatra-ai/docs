# Hosting Guide

This guide is for operators — the people who install Cinatra, configure it, deploy it, and keep it running. It covers prerequisites, environment variables, services, upgrades, and operational troubleshooting.

If you are an end user, see the [User Guide](../user/README.md). If you administer the `/configuration/*` area, see the [Admin Guide](../admin/README.md). If you work on the code, see the [Developer Guide](../developer/README.md). For the Model Context Protocol (MCP) server (external and internal), see the [MCP Guide](../../references/mcp/README.md).

---

## Get a working instance

- [Installation](installation.md) — prerequisites, services, first-time setup, the database, Redis, the WayFlow (Cinatra's OAS Flow agent runtime) sidecar
- [Quickstart](quickstart.md) — start the dev server, register the first admin, run your first agent

## Run it well

- [Configuration](configuration.md) — every environment variable: database, Redis, Better Auth (the auth server library Cinatra uses), MCP server, public base URL, Sentry, large language model (LLM) provider keys
- [MCP public URL & tunnels](mcp-public-url.md) — why a local install needs a public URL for the AI chat, local vs. remote services, Tailscale Funnel (a public-internet tunnel) setup
- [Error reporting](error-reporting.md) — Sentry-compatible error reporting: when it fires, what's redacted, how to wire it up
- [Troubleshooting](troubleshooting.md) — common failure modes, how to read the logs, when to restart what
- [Operations](operations.md) — how a release is built and deployed (and why merging is not deploying)
- [Skills maintenance](skills-maintenance.md) — the opt-in background jobs that keep skill-match rows honest: staleness sweep, orphan GC, drift sampler, dual-store parity observation, and the cost model that bounds them
- [Upgrading](upgrading.md) — `cinatra update` for the CLI vs. an instance, the dev (fast-forward `origin/main`) and prod (latest `v*` release) paths, and how migrations apply automatically
- [Upgrading stateful services across majors](https://docs.cinatra.ai/self-hosting/upgrading-stateful-services) — the deployed-version ledger, the fail-closed `db upgrade-preflight`, hardened backups, and the safe order when a backing store crosses a major version
- [Backup & restore](backup-and-restore.md) — what a backup bundle contains (and the encryption key it does not), how to create and restore one, the API-config export/import, and disaster recovery

---

## What "hosting" means here

Hosting in this guide means **the deployment dimension** — what processes run, where state lives, how secrets are injected, how the OAuth surface binds to a canonical origin, how upgrades flow.

It does not mean **the production runbook for any particular hosting target.** Production deployment specifics (Kubernetes manifests, Terraform, CI/CD pipelines, observability stacks) live separately from this open source repository and depend on your environment.

## The Cinatra environment

Beyond the Next.js application itself, Cinatra runs alongside a small set of supporting services. All of them ship in the bundled `docker-compose.yml` for development; production deployments wire equivalent services from whatever environment you operate.

- **PostgreSQL** — the canonical store. Drizzle ORM owns the schema. The default schema name is `cinatra` (override with `SUPABASE_SCHEMA`). Better Auth tables live in the `public` schema.
- **Redis** — BullMQ (a Redis-backed job queue), Redis Streams for the Agent-User Interaction Protocol (AG-UI) event log, plus session caches. Default URL is `redis://127.0.0.1:6379` (override with `REDIS_URL`).
- **WayFlow Python sidecar** — hosts the Open Agent Specification (OAS) Flow runtime that executes agent runs. The Next.js app calls it over agent-to-agent (A2A) protocol. The sidecar is replaceable by any OAS-compliant runtime; see [Architecture](../../references/platform/architecture.md) for the integration contract.
- **Verdaccio (an npm-compatible registry)** — the npm-compatible private registry that backs the extension marketplace for all five extension kinds. Cinatra publishes installed extensions to it and reads other instances' extensions from it. The public marketplace at `registry.cinatra.ai` runs the same software.
- **Nango (the OAuth gateway brokering connector credentials)** — the OAuth gateway that brokers connector credentials (Gmail, Apollo, LinkedIn, and the rest). Nango runs as its own server + dedicated Postgres database; Cinatra calls it via `NANGO_SECRET_KEY` + `NANGO_SERVER_URL`.
- **Neo4j + Graphiti (a knowledge-graph indexer)** — the knowledge-graph derived index for the objects layer. Neo4j stores the graph; the `knowledge-graph-mcp` (Graphiti) front-end projects objects into it via MCP. The Graphiti projection is asynchronous and lives outside the synchronous primitive path; see [Objects layer](../../references/platform/objects-layer.md) for how the projector consumes the outbox.

The bundled `docker-compose.yml` also ships **WordPress** and **Drupal** containers, but those are not part of Cinatra's hosting requirements — they are integration-test target instances used by the Cinatra WordPress and Drupal connectors. A real deployment connects to your own existing CMS instances (or omits them entirely).

## The first user is admin

On a fresh database, the first user to register through the auth surface becomes the platform admin (via Better Auth's `admin` plugin). After that, admin grants are issued through `/configuration/permissions`. There is no env var that promotes a user to admin retroactively.

## Where production deployment material lives

Anything operational that's specific to running Cinatra in production at your organisation — Kubernetes manifests, Terraform modules, your secret-manager wiring, your CI pipeline, your incident runbook — belongs in your own deployment repository, not in the open source Cinatra repo. This Hosting Guide covers what you need to know about Cinatra to wire it into whatever deployment you operate.

---

## Where to go next

- The full env var matrix: [Configuration](configuration.md)
- The architecture you're hosting: [Architecture](../../references/platform/architecture.md)
