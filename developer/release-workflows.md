# Release Workflows

AI-assisted, reusable **product release workflows**. A user describes a release in
`/chat`; Cinatra instantiates a template, the user manages it on an interactive
**Gantt**, approves human gates, and a durable reconciler executes the multi-week
process on Cinatra's existing stack.

## Core principle

```
OpenAI (in /chat) helps CREATE/revise the workflow (proposal-only, via MCP).
Cinatra OWNS the spec, templates, validation, authz, approvals, the Gantt, audit.
A durable BullMQ reconciler EXECUTES the approved workflow (Postgres = source of truth).
WayFlow RUNS the agents (one step type among several).
```

A release workflow is a first-class **calendar-driven process DAG** — not an
agent. `agent_task` is one of six heterogeneous step types
(`agent_task` / `approval` / `manual` / `notification` / `wait` / `checkpoint`).

## Architecture decisions (why)

- **No Temporal, no n8n, no new service.** Reuse Postgres + BullMQ (a Redis-backed job queue) + WayFlow (Cinatra's OAS Flow agent runtime). The
  workflow is *mutable product data* (editable mid-flight), not deployed code; and
  it must be packageable as a marketplace extension — both block Temporal/n8n.
- **Postgres is the single source of truth.** The executor is a thin driver:
  wake → ask Postgres what's due & unblocked → dispatch idempotently → record
  event → sleep. No execution state in code → editing an active workflow is tractable.
- **Three orthogonal gates** — timing / dependency / approval — in a per-task
  ledger; a node dispatches only when all three pass (atomic compare-and-swap (CAS)).
- **`depends_on` (execution) ≠ `schedule.anchor` (timing).** Cascade follows
  schedule expressions, not dependency edges.
- **Approvals are workflow-native + human-only.** Never assistant-callable.
- **Triggers do not nest in workflows.** A node's schedule is the timing truth.

## Package: `packages/release-workflows`

The package owns the spec, data model, resolver, state machines, scope scaffold,
and object registration. See the package
[`AGENTS.md`](../../packages/release-workflows/AGENTS.md) for invariants.

### Data model (Postgres, `cinatra` schema)

`workflow_template` (immutable versions) · `workflow` (mutable, versioned,
`lock_version` CAS) · `workflow_task` (heterogeneous; planned/actual + anchor
timing; first-class failure/retry/cancel/missed-window policy; per-task CAS) ·
`workflow_dependency` (per-edge outcome) · `workflow_gate` (ledger w/
explainability) · `workflow_event` (append-only operational log) ·
`workflow_task_attempt` (unique idempotency key — at-least-once guard) ·
`workflow_artifact` · `workflow_approval` (own solicitation schedule + deadline +
review-packet hash + resolved approvers).

### Schedule resolver

Server-side, DST-correct (`@date-fns/tz`). Relative offsets resolve as calendar
durations in the task/release tz then convert to UTC; pinned tasks keep absolute
dates; a release-date move yields a **cascade diff** for unpinned tasks (the Gantt
commits via CAS). A relative anchor resolves to the anchor task's canonical
`dueAtUtc`; pinned tasks freeze as cascade anchors.

### Agent steps

`agent_task` steps dispatch a child agent run and poll it to terminal — durably,
and crash-safe. The leaf package can't reach the app-layer enqueue chokepoint, so
the host injects two functions at engine boot (`src/lib/release-workflow-agent-executor.ts`,
wired in `src/instrumentation.node.ts`):

- **executor** — resolves the task's `agentRef` to a template, calls
  `createAgentRun(...)` and `enqueueAgentRun(...)`, returns `running` + the
  `childRunId`. Delegated provenance (auth-derived `orgId`, `runBy`, `projectId`,
  `workflowId`, `workflowTaskId`) is stamped on the child run. Uses
  `softPreflight` because the reconciler has no live session actor — a missing
  connector then surfaces as a run failure at execution (captured by
  retry/dead-letter), not a hard enqueue block.
- **poller** (`getChildRunStatus`) — maps an `agent_run` status to terminal /
  failed / human-in-the-loop (HITL).

**Idempotency (at-least-once safe).** The reconciler's per-attempt key
`${workflowId}:${taskId}:${attemptNo}` is passed verbatim to `createAgentRun`,
which is race-safe: a redispatch of the same attempt catches the partial-unique
violation (`agent_runs_idempotency_key_uniq`), re-reads, and returns the same
child run only if its provenance matches (else fails closed). A retry (new
`attemptNo` → new key) spawns a fresh run.

**Poll ordering.** Child statuses are read OUTSIDE the per-workflow advisory lock,
then the `workflow_task` is settled UNDER the lock with a CAS that fires only if
the task is still `running` and the attempt's `child_run_id` still matches — so a
stale read can never clobber a re-claimed task. On success the child run is linked
as a `workflow_artifact`; HITL (the child run paused for human input) bubbles a
single `agent_hitl` event and leaves the task running for the approvals UI (442).
A dispatch that crashed before recording a child id is **not** auto-recovered — it
is indistinguishable from a slow in-flight dispatch and would risk a duplicate run,
so it needs a durable dispatch lease (deferred); `findStuckTasks` surfaces such a
stuck agent_task meanwhile.

### Editing a draft vs. a paused workflow

`updateWorkflowDraftSpec` edits both **draft** and **paused** workflows, but by two
different mechanisms — because a draft has no execution evidence and a paused
workflow may.

- **Draft** → delete-and-reinsert. No `workflow_task_attempt`/`_artifact`/decided
  `_approval` rows exist, so wiping + re-creating tasks is FK-safe.
- **Paused** → **FK-safe diff-and-apply** (`diffApplySpecRows`). Existing tasks are
  UPDATEd in place (id / status / `actual*` / attempts preserved); new tasks
  INSERTed; a removed task is DELETEd **only** when it has no evidence across all
  three RESTRICT FKs (attempts + artifacts + an acted-upon approval) — otherwise the
  whole edit is rejected (`task_has_attempts`) via a thrown sentinel that rolls back
  the tx (so the workflow-row CAS never half-commits).

**Execution-identity freeze.** Once a task has evidence or has left `idle`/
`scheduled`, its identity is frozen on a paused edit — columns (`type`/`agentRef`/
`input`/policies), dependency edges, approval definition (scope/deadline/policy),
and timing (`schedule`/`anchor`; pinned tasks keep their resolved dates via
`frozenDueAt` so a release-date cascade can't drift an already-run relative task).
Planning/display fields (title, assignee, window, `pinned`, `risk`) stay editable;
changing a frozen field is rejected (`task_immutable`).

**Approval correctness on a paused edit.** The decide path, the org inbox, and the
detail panel all reject `invalidatedAt`-stamped approvals, and `decideWorkflowApproval`
runs under the same per-workflow advisory lock as the reconciler + diff-apply. Because
the reconciler does not run while paused, diff-apply handles staleness
**synchronously**: an opened, not-yet-consumed approval whose review packet (the gating
task's key/title/scope + upstream titles/edges, hashed by
`state/review-packet.ts#computeReviewPacketHash`) changed is reopened
(`status=pending`, `notificationState={}`, `invalidatedAt=now`, new hash) so it can't be
signed off against stale content.

## Coverage

Paused active edits preserve tasks with attempts, and workflow browser e2e coverage
lives in `tests/e2e/workflows/` (`pnpm test:e2e:workflows`).
