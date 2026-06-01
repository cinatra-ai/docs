# Notifications

Cinatra ships a Postgres-backed per-user notifications layer. Inserts trigger a Postgres `pg_notify`; a single process-level `LISTEN` connection fans events out to per-tab server-sent events (SSE) handlers; the browser flyout subscribes via EventSource with a 30s poll backstop. Background jobs route their lifecycle events through a recipient policy that picks the right user (or admin fanout for system jobs).

## What goes where

| Concern | Module |
|---|---|
| Schema (typed columns + 3 partial indexes + trigger fn) | `src/lib/drizzle-store.ts` — bundled in `buildCreateStoreSchemaQueries()`, applied by `ensurePostgresSchema()` |
| Server-only service (CRUD, fan-out, dedupe) | `src/lib/notifications/service.ts` |
| Recipient discriminated union + job→recipient policy | `src/lib/notifications/recipient-policy.ts` |
| Request-scope ActorContext helper | `src/lib/notifications/request-actor.ts` |
| Process-level `LISTEN` singleton + EventEmitter fanout | `src/lib/notifications/realtime.ts` |
| Legacy 5-function compat surface (preserves pre-2026-05 callers) | `src/lib/notifications.ts` |
| SSE endpoint | `src/app/api/notifications/stream/route.ts` |
| API CRUD endpoint | `src/app/api/notifications/route.ts` |
| Full-page list view | `src/app/notifications/page.tsx` |
| Flyout subscription + poll backstop | `src/components/app-shell.tsx` |
| Pure SSE dedupe-prepend helper (`applySseNotification`) | `src/lib/notifications/flyout-state.ts` — testable without mounting the component; the flyout must reuse this helper |
| Import-guard regression test pinning helper usage in `app-shell.tsx` | `src/components/__tests__/app-shell-flyout-state-import.test.ts` |
| BullMQ (a Redis-backed job queue) worker lifecycle hook | `src/lib/background-jobs.ts` (`notifyJobLifecycle` private helper) |

## Recipient policy

```ts
type NotificationRecipient =
  | { kind: "user"; userId: string }
  | { kind: "team"; teamId: string }
  | { kind: "organization"; organizationId: string }
  | { kind: "project"; projectId: string }
  | { kind: "admins" };
```

Resolution happens at write time: a `team` recipient becomes one row per team member; `admins` becomes one row per platform admin. There is no nullable `user_id`, no join table; every notification belongs to exactly one user.

The job→recipient map lives in `recipient-policy.ts`. User-initiated jobs route to the initiator (resolved from the job's `__actorContext` ALS frame); system jobs are silent on success and route failures to `{ kind: "admins" }`. Unknown job names log a warning and return `null` — register new job names in `USER_INITIATED_JOBS` or `SYSTEM_JOBS` when adding to `BACKGROUND_JOB_NAMES`.

## Enqueue-time auto-attribution

`enqueueBackgroundJob()` runs a cascade when `options.actorContext` is unset:

1. Active `getActorContext()` ALS frame — but only for `HumanUser` principals.
2. `resolveRequestActorContext()` — better-auth session through `buildActorContext()`.
3. `undefined` (system context).

Set `inheritActorContext: false` to opt out. Current opt-out sites (every SYSTEM_JOB worker-internal / self-rescheduling enqueue):

- `src/instrumentation.node.ts` — `LITELLM_PRICING_SYNC` weekly bootstrap + `GRAPHITI_PROJECTION_REPAIR` repair-loop bootstrap.
- `src/lib/background-jobs.ts` worker dispatcher — `LITELLM_PRICING_SYNC` + `GRAPHITI_PROJECTION_REPAIR` self-rescheduling re-enqueues.
- `src/lib/registry-poll-job.ts` — `REGISTRY_POLL` self-reschedule via the shared `reschedule()` helper (covers every 200/302/4xx/5xx branch).
- `packages/skills/src/llm-matching/jobs.ts` — `SKILL_MATCH_BATCH_POLL` (a) initial enqueue from `handleBatchSubmit`, (b) stale-poll-guard reschedule in `handleBatchPoll`, (c) in-progress reschedule in `handleBatchPoll`.

### When to opt out (`inheritActorContext: false`)

**Rule of thumb:** if you're calling `enqueueBackgroundJob()` from `src/instrumentation.node.ts` OR from a worker self-rescheduling re-enqueue inside a `SYSTEM_JOBS` handler (`recipient-policy.ts`), pass `inheritActorContext: false` defensively. The worker's ALS frame should already be non-HumanUser, but the explicit opt-out makes system-context intent visible at the call site and is robust to upstream refactors.

The "Current opt-out sites" list above enumerates the canonical sites.

**Counterexample — do NOT opt out for:**

- **User-initiated server actions** (anything triggered from `/api/*/route.ts` or a `"use server"` form handler) — auto-attribution to the calling HumanUser is the entire point of the cascade. Forcing `inheritActorContext: false` here drops the user attribution: failure → only a `console.warn` (no user notification, no admin fanout, no silent re-route); success → no notification at all. See `recipient-policy.ts` `getRecipientForJob`: a `USER_INITIATED_JOBS` entry with no resolved initiator returns `null`.
- **Request-path enqueues from a route handler** (e.g. `/agents/[agentId]/run` triggering an `AGENT_BUILDER_EXECUTION`) — the better-auth session is the recipient signal.
- **human-in-the-loop (HITL) resume actions** — the resuming user's identity needs to land on any downstream notification.

When in doubt: read `USER_INITIATED_JOBS` and `SYSTEM_JOBS` in `recipient-policy.ts`. If the job name is in `USER_INITIATED_JOBS`, default-on attribution is correct. If it's in `SYSTEM_JOBS` and you're enqueuing from a non-user context, opt out.

## Real-time delivery

ONE channel `cinatra_notifications`. Payload `{userId, id}`. The trigger function `fn_notify_notification_insert` fires on `AFTER INSERT` of rows with a non-null `user_id`. The realtime singleton in `realtime.ts` exposes `subscribeUserNotifications(userId, cb)` returning a cleanup function — the per-tab SSE route handler subscribes; the listener client auto-reconnects on `error`/`end` with exponential backoff (capped at 30s).

The SSE handler re-reads the inserted row via `listNotificationsForUser(session.user.id)` before pushing — defense-in-depth so the in-process emitter can never leak cross-user even if a future refactor misroutes.

## Hybrid client behaviour

`src/components/app-shell.tsx` runs three triggers in parallel:

- `EventSource("/api/notifications/stream")` — primary, native reconnect.
- 30-second poll — backstop when SSE drops.
- `focus` + `visibilitychange` — manual refresh.

Notifications are de-duped by `id` when both SSE push and a poll cycle deliver the same row.

## Dedupe

Partial unique index `notifications_dedupe_job_kind_idx` on `(user_id, source_job_id, kind) WHERE source_job_id IS NOT NULL AND user_id IS NOT NULL`. BullMQ retries inserting the same `(user, job, kind)` tuple swallow on `ON CONFLICT DO NOTHING`.

## Coexistence with the legacy compat surface

`src/lib/notifications.ts` keeps the original 5 public functions (`createNotification`, `listNotifications`, `markNotificationRead`, `markNotificationsReadByHrefPrefix`, `markAllNotificationsRead`) at their pre-2026 signatures. User resolution flows through:

1. `getAuthSession()` (server actions, route handlers, server components)
2. `getActorContext()` ALS frame (worker context)
3. Falls back to a platform-admins fan-out when neither is present, so system-context legacy callers in `packages/asset-blog/src/generation.ts` keep producing visible notifications.

When you have an explicit recipient (BullMQ hook, scheduler, system event), use `createNotificationForRecipient(recipient, input)` directly instead.

## Tests

- `src/lib/notifications/__tests__/service.test.ts` — CRUD + dedupe (SQL shape mocked)
- `src/lib/notifications/__tests__/recipient-policy.test.ts` — job routing + admin SQL
- `src/lib/notifications/__tests__/realtime.test.ts` — listener + EventEmitter fanout + reconnect backoff
- `src/lib/__tests__/background-jobs-auto-attribution.test.ts` — cascade tiers
- `src/app/api/notifications/__tests__/route.test.ts` — session gate
- `src/app/api/notifications/__tests__/stream.test.ts` — SSE session gate + scoped fanout

## Operator runbook

1. Set `SENTRY_DSN` (and `NEXT_PUBLIC_SENTRY_DSN` for browser-side capture) when standing up the Sentry/GlitchTip backend.
2. The schema migration runs automatically on the next `pnpm dev` boot via `ensurePostgresSchema()`. Idempotent — `ADD COLUMN IF NOT EXISTS` + `CREATE OR REPLACE FUNCTION` + `DROP TRIGGER IF EXISTS`.
3. No additional infra. Postgres `LISTEN/NOTIFY` is already part of the existing PG. The EventEmitter is in-process.
4. For multi-process production deployment (multiple Node servers behind a load balancer), each server keeps its own `LISTEN` connection and routes to only its own SSE clients — that's correct. A future Redis pub/sub bridge becomes useful only when an event needs to reach a client on a different server than the one that wrote the row.

## Known gaps

- The flyout DOM in `app-shell.tsx` still needs a rebuild on a cleaner component model.
- `confirm()` dialogs (yes/no) still use `window.confirm()` and should move to an `<AlertDialog>` wrapper.
- Multi-channel (email, SMS, push) is not yet wired. The recipient policy is channel-agnostic; the service simply doesn't emit to anything except the in-app inbox today. A provider abstraction decision is still needed.
