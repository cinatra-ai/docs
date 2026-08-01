# PM Connector — Provider-Neutral Facade (Plane)

cinatra's PM (project-management) integration is a thin provider-agnostic facade
that mirrors agent-run **schedules** into an external PM tool's work items. The
current — and only — provider is **Plane**, shipped as a docker stack in dev
(`docker compose --profile plane up -d`) and reached over REST. The contract
lives in the SDK (`@cinatra-ai/sdk-extensions`); the Plane implementation lives
in the standalone `@cinatra-ai/plane-connector` package, which registers a
`PmConnector` behind the `pm-provider` capability from its `serverEntry`.

This is the schedule-side dual of the [CRM connector](crm-connector.md): the CRM
side mirrors a cinatra object to a CRM record; the PM side mirrors a cinatra
agent-run **trigger** to a PM work item. cinatra stays authoritative for the
schedule and its execution — the PM tool is the external view, not a second
control surface.

## Why it exists

cinatra owns the schedule and the durable execution of agent runs. The PM tool
exists only to make that schedule *visible* on a board/calendar/timeline a team
already watches. Routing every PM tool through one provider-neutral contract
means:

- the trigger lifecycle never binds to a specific PM tool — the host calls a
  stable `PmConnector` surface even if Plane is later joined or replaced by
  Linear/Jira;
- a PM outage can never break or block a local schedule (fail-open — see below);
- adding a provider is a new connector package, with **no host edit**.

## Architecture overview

```
agent-run trigger lifecycle (packages/agents/src/trigger-service.ts)
        │  setRunTriggerForActor / deleteRunTriggerForActor
        ▼
host PM bridge (src/lib/pm-integration-providers.ts)        ← bounded 10s, fail-open
        │  syncRunTriggerPmTask / deleteRunTriggerPmTask
        ├──▶ pm-link store (packages/agents/src/pm-link-store.ts) → agent_run_pm_links
        ▼
SDK PM provider registry (@cinatra-ai/sdk-extensions)        ← lookupPmProvider / listPmProviders
        │  external resolver bound by src/lib/register-pm-providers.ts
        ▼
PmConnector impl (@cinatra-ai/plane-connector)  ──▶  Plane REST (/work-items/)
```

- **Contract (`@cinatra-ai/sdk-extensions`)** — defines the types-only
  `PmConnector` port plus `PmTriggerTask` / `PmTaskRef`
  (`pm-connector-contract.ts`), and the globalThis-anchored provider registry
  (`pm-provider-registry-contract.ts`). No runtime provider code. Provider
  packages and the host both depend only on the SDK, so neither imports the
  other by name.
- **Host bridge (`src/lib/pm-integration-providers.ts`)** — resolves the
  registered provider and delegates the mirror; persists the outcome into the
  pm-link table. `packages/agents` never imports the SDK registry or any Plane
  code — it calls OUT to two narrow fail-open functions via the `@/lib/*` alias
  (the host-owned bridge, the same Option-2 boundary the CRM side uses).
- **Provider discovery (`src/lib/register-pm-providers.ts`)** — binds the SDK
  registry's external resolver to the host capability registry at boot, so a
  provider extension that did `ctx.capabilities.registerProvider("pm-provider",
  …)` is surfaced lazily on every lookup. Structurally validates each impl
  (`providerId` + `upsertTriggerTask` + `deleteTriggerTask`) before trusting it.
- **Plane provider (`@cinatra-ai/plane-connector`)** — implements the port
  against Plane's REST work-item endpoints, scoping every op to the configured
  `/workspaces/{slug}/projects/{projectId}/work-items/`.

## The contract

`PmConnector` is two methods. Provider packages import these symbols with
`import type` only — the contract has no runtime code.

- **`upsertTriggerTask({ task, existingTaskId })`** — idempotent upsert of the
  work item mirroring a schedule-defining trigger. `existingTaskId` is the
  previously-persisted external id, or `null` on the first push. Returns a
  `PmTaskRef` (`{ externalTaskId, providerId }`) that the host persists.
- **`deleteTriggerTask({ runId, externalTaskId })`** — delete (unschedule) the
  mirrored work item for a run. Idempotent: a provider 404 (already gone) is a
  success, not an error.

The pushed snapshot is a `PmTriggerTask`: `runId`, `triggerType`, `scheduledAt`
(ISO instant or null), `cronExpression`, `timezone`, and `enabled`. cinatra
stays authoritative for the exact fire instant; the provider reconciles at day
granularity (Plane carries calendar dates).

### Natural-key idempotency (load-bearing)

The natural key of a mirrored task is **`task.runId`** — only the
schedule-defining trigger is mirrored, never the recurring child runs it spawns,
so the top-level run id is one-to-one with the work item.

This matters because the host's bounded timeout (below) can reject the host
*await* while a slow first push still creates the upstream item. On the next
sync the host passes `existingTaskId: null` again. A provider that blindly
created on a null id would orphan the first item — a permanent duplicate the host
can never address. So on a null-id upsert the provider must **find-or-create by
`runId`**: the Plane provider stamps a stable `[cinatra:<runId>]` marker into the
work-item title and looks it up by that marker before creating, then returns the
real id the host re-links.

## The pm-link table (`agent_run_pm_links`)

The host persists the mirror outcome in `agent_run_pm_links`, added by the
`core__0007` migration. It is a **link table** — one row per mirrored
schedule-defining trigger, keyed by `run_id` — not columns on
`agent_run_triggers`, so a PM outage or absent provider leaves the trigger
lifecycle untouched (the *absence* of a row is the natural "not mirrored" state).

| column | meaning |
|---|---|
| `run_id` | PK; FK → `agent_runs.id` `ON DELETE CASCADE` (link torn down with the run) |
| `provider` | the provider id that owns the external task (e.g. `plane`) |
| `external_task_id` | the provider's work-item id; null until the first successful push |
| `synced_at` | last successful sync; null until then |
| `sync_error` | last fail-open error (null = healthy) — retried by the background reconcile loop |
| `version` | optimistic-concurrency counter for the background reconcile loop |

> The `sync_error` / `version` columns support the **periodic reconcile loop**, a background job that re-checks every mirrored schedule every ~10 minutes and repairs any work item that drifted or failed to sync. A failed mirror is also re-synced on the next configure/delete of that trigger.

The migration is **additive** (a brand-new `CREATE TABLE IF NOT EXISTS`), and
the store (`packages/agents/src/pm-link-store.ts`) is server-only:
`recordPmLinkSuccess` / `recordPmLinkError` / `readPmLinkByRunId` /
`deletePmLinkByRunId`.

## Fail-open and the bounded timeout

The trigger lifecycle is the source of truth for the **local** schedule, so the
host bridge is fail-open at every PM path:

- A PM provider that is absent, inactive, or unreachable must never throw out of
  `syncRunTriggerPmTask` / `deleteRunTriggerPmTask`, and never block or disable
  the local schedule. A failed push is recorded in the pm-link row (`sync_error`)
  for the background reconcile loop to retry on its next tick; the
  trigger lifecycle continues regardless.
- Each provider call is raced against a bounded **10s ceiling**
  (`PM_CALL_TIMEOUT_MS`). The trigger lifecycle awaits the mirror, so a
  never-settling provider would otherwise hold the already-persisted schedule
  operation open indefinitely; at the ceiling it is treated as a fail-open
  outage.
- The bridge **never guesses a provider.** With a pinned provider id (a link row
  already named one) it resolves that exact id or nothing — it never falls back
  to a different provider, because the external task id belongs to the named one.
  On a first push it auto-selects only when exactly one provider is registered;
  with zero or more than one it refuses to guess.

## Plane provider quirks

The Plane implementation encodes facts proven against Plane Community Edition on
the wire:

- **Auth is `X-API-Key` alone.** Plane's REST auth reads only the `X-API-Key`
  header (case-insensitive). An `Authorization: Bearer …` header is rejected with
  a 401. The token is a **user-level** PAT minted via Plane's
  `POST /api/users/api-tokens/` (profile → API tokens).
- **The token is encrypted at rest.** It is stored through the host
  `secretsCodec` (AES-256-GCM, instance key) and decrypted in-process only —
  never plaintext.
- **Dates are strict calendar dates.** REST create/patch accept `start_date` /
  `target_date` as day-level `YYYY-MM-DD`; a malformed value is a 400. The
  provider validates the date *before* the write rather than relying on Plane's
  rejection.
- **`due_date` is silently dropped — never sent.** Plane REST accepts a body
  with `due_date`, returns 201, and silently discards the date. The provider
  **never** sends `due_date`, and **asserts the echoed `target_date`** after
  every write so a dropped date surfaces as a loud error instead of silent loss.
- **`/work-items/` is the endpoint** (the forward-looking alias of `/issues/` on
  current Plane Community Edition). Every op scopes to
  `/workspaces/{slug}/projects/{projectId}/work-items/`.

## Adding a new provider (e.g. Linear, Jira)

The Plane implementation is the reference. To add a second provider:

1. **Build the provider package** as a standalone connector alongside
   `@cinatra-ai/plane-connector`. Implement the `PmConnector` port
   (`upsertTriggerTask` / `deleteTriggerTask`), importing the contract types from
   `@cinatra-ai/sdk-extensions` with `import type`.
2. **Register behind the capability.** From the package's `serverEntry`,
   `ctx.capabilities.registerProvider("pm-provider", impl)`. No host edit — the
   external resolver surfaces it on the next lookup.
3. **Honor the natural-key idempotency contract.** On a null-id upsert, find-or-
   create by `runId` (stamp a stable per-run marker, look it up first). A
   blind-create provider will orphan items on a timed-out first push.
4. **Respect fail-open.** The host bounds your call at 10s and never blocks the
   schedule; keep your own per-request timeouts under that and make delete
   idempotent (treat a 404 as success).
5. **Pin per-provider quirks with a proof script** that captures real upstream
   calls (Plane's `due_date` drop is exactly the class of fact that TypeScript
   intuition misses).

See also: [`crm-connector.md`](crm-connector.md) (the parallel object→CRM
facade), and the user guide [PM-tool integration](../../guides/user/pm-tool-integration.md).
