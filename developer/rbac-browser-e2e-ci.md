# RBAC browser e2e in CI

How the role-based access control (RBAC) Playwright suite runs as a CI check, and the non-obvious choices that make it work. Source of truth: the `e2e-rbac` + `rbac-authz-unit` jobs in [.github/workflows/build-image.yml](../../.github/workflows/build-image.yml). Local config: [playwright.rbac.config.ts](../../playwright.rbac.config.ts); fixtures under [tests/e2e/rbac/](../../tests/e2e/rbac/).

## Two jobs

- **`rbac-authz-unit`** — runs the whole `src/lib/authz` suite (20 files / 160 tests), including the resolver matrix (`resolver-matrix.test.ts`) the e2e job below calls "the primary CI proof of resolver correctness". A *separate* job is required because appending to `test` would skip after the `packages/agents` baseline fails. Excludes `build-actor-context-from-run.test.ts` (5 placeholder tests deliberately RED until `run.orgId → actor.organizationId` wiring is implemented); when that wiring lands, drop the `--exclude` so those tests start gating CI. The root `src/` vitest suite is otherwise not run by `test`, so this job is the only CI gate enforcing authz unit correctness today.
- **`e2e-rbac`** — the representative end-to-end arm: 9 Playwright tests covering permissions pages, project access, extension marketplace access, and customer scoped-view behavior in a real hydrated browser.

## Why a production build, not `pnpm dev`

The single most important choice. Running the suite against `pnpm dev` (Turbopack) **does not work in CI**: dev mode compiles each route segment cold on first hit (the permissions page alone ~60s), which exhausts the runner mid-run — the heaviest customer invite→revoke test repeatedly got the job *signal-killed at variable points* (6m / 22m / 55m across attempts). Cold-compile mitigations (pre-warming routes, fewer retries, longer timeouts) did not hold.

A production build serves prebuilt routes instantly with steady low memory. The same 9 tests went from "hangs/killed" to **9 passed in ~54s**. The job therefore:

1. `pnpm build` with `NODE_OPTIONS=--max-old-space-size=4096` (matches the Dockerfile; the default ~2GB worker heap OOMs this app).
2. Runs the standalone server exactly like the Dockerfile (`next.config.ts` sets `output: "standalone"`, so `next start` will not serve): `cp -r .next/static .next/standalone/.next/static`, copy `public`, then `(cd .next/standalone && PORT=3000 HOSTNAME=0.0.0.0 node server.js)`.

The dev-only headless-hydration flags (`allowedDevOrigins`, `experimental.reactDebugChannel` — see [e2e-headless-hydration.md](e2e-headless-hydration.md)) are irrelevant under a prod build; the `waitForFunction(__reactFiber$)` gate still works (React attaches `__reactFiber$` in prod) and resolves fast.

## Provisioning a fresh CI Postgres

- **Better Auth (the auth server library Cinatra uses) `public.*` tables** are applied from a committed, idempotent SQL snapshot: [scripts/dump-public-schema.mjs](../../scripts/dump-public-schema.mjs) (dev-only generator) writes [tests/e2e/rbac/fixtures/public-schema.sql](../../tests/e2e/rbac/fixtures/public-schema.sql), applied by [scripts/apply-public-schema.mjs](../../scripts/apply-public-schema.mjs) before boot. We do **not** use the `better-auth migrate` CLI: it bundles `auth.ts`'s import graph and statically refuses any `import "server-only"` (present transitively via `better-auth/next-js`), so it cannot load the config in CI without mutating `node_modules`. Regenerate with `node --env-file=.env.local scripts/dump-public-schema.mjs` against a working local DB.
- **The `cinatra` schema** self-provisions via the instrumentation hook (`ensurePostgresSchema` → `buildCreateStoreSchemaQueries`) on the first query at boot — no seed needed.

## Getting past the setup wizard

A freshly-provisioned instance has no instance-identity / Nango (the OAuth gateway brokering connector credentials) / OpenAI rows, so `isSetupWizardComplete()` is false and the app shell redirects every authenticated route to `/setup` (the test lands on "heading Setup"). The e2e job sets `CINATRA_E2E_SETUP_BYPASS=true`, which makes `isSetupWizardComplete()` return true. It is an explicit, non-default opt-in (same posture as `A2A_DEV_BYPASS`), gated on the var alone so it also works under `NODE_ENV=production` from the prod build. It only skips the setup *onboarding* gate — no auth/RBAC boundary.

## Seeding the multi-actor fixtures

[tests/e2e/rbac/auth.setup.ts](../../tests/e2e/rbac/auth.setup.ts) creates a non-admin org member, a member-owned project, and a customer user, and saves the member's `state.json`; [tests/e2e/rbac/auth.customer.setup.ts](../../tests/e2e/rbac/auth.customer.setup.ts) signs in as the customer for the scoped-view test. Ordering matters: the customer sign-up runs **before** the member sign-in because better-auth sign-up auto-signs-in (last write wins the cookie jar). The customer is added to the member's org so `project_access` FK constraints are satisfiable.

## Diagnostics gotcha

A job that is cancelled or hits `timeout-minutes` **hard-skips post-steps — even `if: always()` uploads** — so a hung run yields no report or dev-server log. Avoid the hang (prod build) rather than relying on artifact upload from a dying job.

## Limitation: not yet an enforced gate

These jobs run as visible CI checks but **cannot currently block merges**: required status checks need GitHub Pro / Team or a public repo (the API returns `403: Upgrade to GitHub Pro or make this repository public`; the org is on the free plan). To make the e2e a true merge gate, enable branch protection on `main` and add `RBAC browser e2e` (and `RBAC authz unit tests`) to the required checks. Until then, merges proceed via `--admin`.

## Current shape

The browser scenarios and prod-build job are wired together with the Better Auth schema snapshot scripts and the explicit setup bypass. The authz unit job now covers the full `src/lib/authz` suite while keeping the placeholder run-context tests excluded until their missing organization-context wiring is implemented.

Use this file as the canonical record of why the CI shape looks the way it does.
