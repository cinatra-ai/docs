# BullMQ and Agent Runtime Boundary

Cinatra's current agent runtime is **WayFlow (Cinatra's OAS Flow agent runtime)**, the reference Open Agent Specification (OAS) implementation,
running as a Python sidecar invoked over agent-to-agent (A2A) protocol.

The BullMQ (a Redis-backed job queue)-side guidance in this document is current. LangGraph references are
retained only where they name still-relevant legacy job constants, columns, or
code paths that must not be reintroduced.

## Standard approach

Every agent run in Cinatra passes through two different engines. Respect the
boundary between them:

- **BullMQ** owns scheduling, durability, retries, worker pooling, and
  cancellation signals. It is the *trigger* layer. It schedules a job,
  guarantees the job eventually runs, and gives operators a dashboard
  (`/settings/operations/jobs`) to see queue state.
- **WayFlow** owns the agent execution graph and human-in-the-loop (HITL) interrupt/resume behavior.
  It is the *agent runtime* layer.

The two layers meet at exactly one function:
`runAgentBuilderExecutionJob` in `packages/agents/src/execution.ts`. BullMQ
dispatches a run to this worker; the worker invokes WayFlow over A2A. No other
code path should cross the boundary.

## Current runtime state

The TypeScript agent execution layer has been retired. The files
`agentic-execution.ts`, `agentic-resume.ts`, `agentic-tools.ts`,
`tool-interceptor.ts`, and `resume.ts` have been deleted.

`execution.ts` dispatches agent runs via `createExternalA2AClient` — to the
template's external A2A server when `template.sourceType === "external"`,
otherwise to WayFlow. The `planned_actions` and `review_tasks` tables are
not part of the current schema. All HITL routing uses synthetic ID prefixes:
`setup-{runId}` and `lg-{runId}`.

The concurrent dispatch race window is closed with
`updateAgentRunStatusConditional(runId, "queued", "running")` immediately before
the runtime dispatch. A second BullMQ retry that dequeues the same job fails the
compare-and-swap (CAS) and returns early without entering the runtime.

The `agent_update` Model Context Protocol (MCP) tool does not accept `"default"` as an
`executionProvider` value. Existing DB rows that still carry `"default"` still
execute — dispatch in `execution.ts` does not read `executionProvider`; input
validation and runtime backward compatibility are separate concerns.

The REST polling route `/runs/[runId]` returns the actual
`template.inputSchema` in setup-fallback `hitlContext` so REST polling clients
have field metadata to render HITL approval forms.

## Layer responsibilities

### BullMQ — the job layer

What BullMQ owns:

- **Queue:** `cinatra-background-jobs`, the single queue for all background work
  (`src/lib/background-jobs.ts`).
- **Worker pool:** `concurrency: 4`, single `Worker` instance per process,
  registered via `getBackgroundJobRuntime()`.
- **Job names:** `BACKGROUND_JOB_NAMES`; `AGENT_BUILDER_EXECUTION` is the
  agent-run entry point. Other names cover non-agent work such as blog,
  transcript, email-outreach sub-steps, Ross, scrape, research, enrichment, and
  pricing sync.
- **Durability:** Redis persistence of job payloads, retry state, and scheduled
  jobs.
- **Retry / backoff:** `attempts` and `backoff` options on
  `enqueueBackgroundJob(...)`.
- **Cancellation:** `AbortController` map (`runtime.abortControllers`) plus
  poll-based cancellation metadata written to `system_metadata`. Workers check
  the flag every `BACKGROUND_JOB_ABORT_POLL_INTERVAL_MS` (750ms).
- **Observability:** BullMQ Board mounted at
  `/settings/operations/jobs/[[...slug]]` (QueueDash).

What BullMQ does NOT own:

- agent conversation state
- HITL pause/resume semantics
- per-step retry budgets
- presentation-hint parsing

`AGENT_BUILDER_RESUME` has been removed. Do not add new code that enqueues it.
The valid HITL resume paths are `AGENT_BUILDER_EXECUTION` for setup-loop
re-entry and direct WayFlow A2A `sendTask` into `run.a2aContextId` for
`resumeStoppedOrchestratorAction`.

### Agent runtime layer

What the runtime owns:

- **Dispatch:** `runAgentBuilderExecutionJob` resolves the agent run and invokes
  the runtime client.
- **Runtime lifecycle:** the runtime owns its own execution state and pause state.
- **Event stream:** runtime events are translated to Agent-User Interaction Protocol (AG-UI) events via
  `AgUiAdapter`.
- **HITL interrupt/resume:** interrupt handlers emit AG-UI interrupts with
  synthetic IDs. They do not write DB rows during interrupt emission.
- **Setup field collection:** the setup interrupt loop in `execution.ts` passes
  `setup-{runId}` synthetic IDs and re-enters `runAgentBuilderExecutionJob` after
  each field approval. The runtime receives all collected fields in its input.

## HITL routing

All HITL approval routing uses synthetic ID prefixes. The `planned_actions` and
`review_tasks` tables are not valid runtime dependencies.

| Prefix | Source | What it does on approval |
|--------|--------|--------------------------|
| `setup-{runId}` | Setup interrupt loop in `execution.ts` | Merges submitted field into `agent_runs.inputParams`; re-enqueues `AGENT_BUILDER_EXECUTION` |
| `lg-{runId}` | Runtime interrupt handler | Resumes the paused run through the runtime path |
| Real UUID | Unsupported path | Throws; real UUID approval paths are not supported |

**Rule:** Never pass a real UUID to `approveReviewTaskInternal`. Interrupt
emitters pass synthetic IDs directly to `agUiAdapter.onInterrupt` with no DB
writes.

## Deleted TypeScript execution layer

The hand-rolled TypeScript execution layer is gone:

| File | What it owned |
|------|---------------|
| `agentic-execution.ts` | large language model (LLM) agent loop, `HitlPauseSignal` catch branch |
| `agentic-resume.ts` | BullMQ resume worker for the agentic path |
| `agentic-tools.ts` | Child agent spawner, `invokeAgentAsTool` |
| `tool-interceptor.ts` | Risk-class map, `HitlPauseSignal`, budget guards |
| `resume.ts` | Deterministic resume step loop |

`orchestrator-execution.ts` survives with its non-dispatch symbols only:
`cancelOrchestratorRun`, `TERMINAL_STATUSES`,
`OrchestratorLedgerEntrySchema`, `OrchestratorLedgerSchema`,
`buildLedgerFromChildren`, `resolveInstalledVersion`, and `computeChildInput`.

### Function-Level Inventory

One row per code span that is either current or intentionally absent.

#### execution.ts

| Function / Span | What it does | Current state |
|----------------|-------------|---------------|
| `assertOrchestratorReady` | Validates all declared `agentDependencies` are installed; orchestrator gate | Kept |
| Version pinning block | Reads `agent_template_versions` snapshot for `run.packageVersion` | Kept |
| Setup Interrupt Loop | For each required `inputSchema` field missing from `run.inputParams`: sets `pending_approval` and emits AG-UI INTERRUPT with synthetic `setup-{runId}` ID; no DB writes | Kept |
| External-template short-circuit | `template.sourceType === "external"` dispatches to the external A2A server (`template.agentUrl` + saved connection) before the WayFlow branch | Kept |
| Runtime dispatch | Dispatches WayFlow runs unconditionally for non-external templates; throws when `template.packageName` is null (cannot derive the WayFlow URL) | Kept as the only non-external dispatch branch |
| Unsupported provider throw | Threw for null or unknown `executionProvider` | Deleted — dispatch no longer discriminates on `executionProvider` |
| Orchestrator dispatch | Direct `runOrchestratorJob` dispatch | Deleted |
| Agentic dispatch | Direct `runAgentBuilderAgenticJob` dispatch | Deleted |
| Deterministic step loop | Sequential step iteration with approval gates | Deleted |

#### resume.ts

The file is deleted. `resumeAgentBuilderExecutionJob` is gone. Runtime resumes
go through the active runtime resume path.

#### agentic-execution.ts

The file is deleted. All spans are removed.

#### agentic-resume.ts

The file is deleted. All spans are removed.

#### agentic-tools.ts

The file is deleted. All spans are removed.

#### tool-interceptor.ts

The file is deleted. All spans are removed.

#### orchestrator-execution.ts

| Function / Span | What it does | Current state |
|----------------|-------------|---------------|
| `WaitingForHumanError` class | Error for parking a BullMQ job | Deleted |
| `TERMINAL_STATUSES` constant | Set of terminal status strings | Kept |
| `OrchestratorLedgerEntrySchema` / `OrchestratorLedgerSchema` | Zod schemas for ledger entries | Kept |
| `buildLedgerFromChildren` | Maps child run rows to ledger entries | Kept |
| `resolveInstalledVersion` | Reads installed semver for a package dependency | Kept |
| `computeChildInput` | Returns orchestrator `inputParams` as child input | Kept |
| `runOrchestratorJob` dispatch | Created child runs and FlowProducer dispatch | Deleted |
| `enqueueChildFlow` | BullMQ parent/child flow | Deleted |
| `runOrchestratorRollup` | Aggregates terminal child statuses; audit-side write for `agent_runs` | Kept |
| `cancelOrchestratorRun` | Fan-out cancel across child runs | Kept |

## Symbol Dependency Map

Symbols removed from the runtime path are listed for reference; importers should
not reintroduce them.

| Symbol | Source File | Replacement |
|--------|------------|-------------|
| `runAgentBuilderExecutionJob` | `execution.ts` | Still exists; thin dispatcher to the runtime |
| `resumeAgentBuilderExecutionJob` | `resume.ts` | Runtime resume path |
| `runAgentBuilderAgenticJob` | `agentic-execution.ts` | Deleted |
| `runAgentBuilderAgenticResumeJob` | `agentic-resume.ts` | Deleted |
| `runOrchestratorJob` | `orchestrator-execution.ts` | Deleted |
| `WaitingForHumanError` | `orchestrator-execution.ts` | Deleted |
| `cancelOrchestratorRun` | `orchestrator-execution.ts` | Kept |
| `OrchestratorLedgerSchema` | `orchestrator-execution.ts` | Kept |
| `HitlPauseSignal` | `tool-interceptor.ts` | Runtime-native interrupt |
| `AGENTIC_MAX_STEPS` | `tool-interceptor.ts` | Runtime recursion limit |
| `TOOL_RISK_CLASSES` | `tool-interceptor.ts` | Runtime-side risk metadata |
| `buildAgenticAgentTools` | `agentic-tools.ts` | Deleted |
| `BACKGROUND_JOB_NAMES.AGENT_BUILDER_RESUME` | `background-jobs.ts` | Deleted; resume uses the active runtime path |

## Routing

```text
runAgentBuilderExecutionJob (BullMQ worker)
  ├─ version pinning          (packageVersion → readAgentTemplateVersionBySemver)
  ├─ assertOrchestratorReady  (orchestrator dep-check)
  ├─ Setup Interrupt Loop     (emits INTERRUPT per pending inputSchema field; no DB writes)
  └─ Dispatch:
       ├─ template.sourceType === "external"  → external A2A dispatch (template.agentUrl + saved connection)
       └─ everything else                     → WayFlow runtime dispatch via resolveWayflowUrl(template.packageName)
                                                (throws when template.packageName is null)
```

Dispatch does not discriminate on `executionProvider`. All other dispatch branches are deleted.

## HITL surface

### Setup field collection

1. `execution.ts` setup interrupt loop detects a pending required `inputSchema`
   field.
2. Sets `agent_runs.status → pending_approval`. Constructs synthetic ID
   `setup-{runId}`.
3. Calls `agUiAdapter.onInterrupt(fieldSchema, xRenderer, inputParams,
   syntheticId, fieldName)` with no DB writes.
4. Human submits field value. `approveReviewTaskInternal` routes on the
   `setup-` prefix, merges the value into `agent_runs.inputParams`, and
   re-enqueues `AGENT_BUILDER_EXECUTION`.
5. `runAgentBuilderExecutionJob` re-enters, re-evaluates pending fields, then
   either emits the next INTERRUPT or falls through to runtime dispatch.

### Mid-run HITL

1. Runtime execution emits an interrupt with the approval payload.
2. The runtime persists pause state and emits an interrupt event.
3. The runtime handler constructs a synthetic ID such as `lg-{runId}` and emits
   `agUiAdapter.onInterrupt(...)` with no DB writes.
4. Human clicks Approve. `approveReviewTaskInternal` routes on the synthetic
   prefix and resumes the paused run through the runtime path.
5. The runtime resumes from persisted pause state. It must not synthesize new
   messages or re-run completed tools.

The key invariant preserved:

- `agent_runs.status` transitions (`running → pending_approval → running →
  completed/failed/stopped`) stay byte-identical so existing UI code such as the
  polling route and `AgenticRunPanel` keeps working.
- AG-UI event shape stays byte-identical (`onInterrupt`, `onRunFinished`,
  `onToolCallStart`/`End`) so the renderer and chat `useAgUiRunStream` keep
  working.

## Typical package mapping

### Keep using BullMQ

- **Non-agent background jobs** — blog post generation, transcripts, email
  outreach per-draft workers, Apify scraping, LiteLLM pricing sync. These are
  short-lived deterministic jobs with no state machine; BullMQ retry and
  durability are the right primitives.
- **Scheduled work** — anything triggered on a cron. The agent runtime is not a
  scheduler.
- **Agent-run dispatch** — `AGENT_BUILDER_EXECUTION` stays as the single
  BullMQ entry point into the runtime.

### Stays TypeScript regardless

- `packages/llm` permanent components (`registry.ts`,
  `mcp-access.ts`, `telemetry.ts`, `tools/skills.ts`) are used by TypeScript
  connector packages independently of the agent execution layer.
- `packages/connector-*` — all connectors stay TypeScript.
- MCP server routes (`/api/mcp`) — TypeScript owns the MCP surface.
- All Next.js routes and server actions.

## Target-shape patterns

### BullMQ trigger to runtime run

```typescript
export async function runAgentBuilderExecutionJob(
  data: { runId: string },
  jobId: string,
): Promise<void> {
  const { runId } = data;

  const run = await readAgentRunById(runId);
  if (!run) throw new Error(`Run ${runId} not found`);

  const claimed = await updateAgentRunStatusConditional(runId, "queued", "running");
  if (!claimed) return;

  const template = await readAgentTemplateById(run.templateId);
  await dispatchToRuntime({ run, template, jobId });
}
```

### Enqueue setup re-entry from an approval action

```typescript
await enqueueBackgroundJob(BACKGROUND_JOB_NAMES.AGENT_BUILDER_EXECUTION, {
  runId: run.id,
});
```

### Runtime interrupt handling shape

```typescript
async function handleRuntimeInterrupt(runId: string, payload: unknown) {
  const syntheticId = `lg-${runId}`;
  await agUiAdapter.onInterrupt(payload, undefined, undefined, syntheticId);
}
```

## Current execution structure

The TypeScript worker is intentionally small:

1. Load the agent run.
2. Claim the run with `updateAgentRunStatusConditional`.
3. Pin the agent template version.
4. Validate orchestrator dependencies.
5. Collect required setup fields through synthetic-ID HITL.
6. Dispatch — external-source templates (`template.sourceType === "external"`)
   short-circuit to their external A2A server; everything else dispatches to
   WayFlow.

All agent execution behavior belongs in WayFlow agents or runtime-side tools.
All background scheduling, retries, and cancellation stay in BullMQ.

## Schema decisions

### Tables that stay

- `agent_runs` — unchanged. `lg_thread_id` is a load-bearing compatibility
  column.
- `agent_templates` — `execution_mode` is advisory; `execution_provider` value
  `"default"` is a compatibility alias only.
- `agent_run_messages` — retained for chat-history display, populated by runtime
  message callbacks.
- `agent_template_versions` — unchanged. Version pinning still runs in the
  TypeScript dispatcher before runtime input is built.
- `audit_events` — unchanged.

### Tables that must stay absent

- `planned_actions` — not part of the current execution model. The runtime
  checkpointer is the authoritative state for "what is this run paused on?"
- `review_tasks` — not part of the current execution model. Approval routing uses
  synthetic ID prefixes; the runtime checkpointer is the authoritative pause
  state.

Do not re-create these tables. Do not add new code that reads or writes them.

## Cancellation and timeouts

This is the one place where the two layers meaningfully interact.

- **BullMQ cancellation** (`cancelBackgroundJob(jobId)`) continues to be the
  operator-facing kill switch. It writes to the
  `background_job_cancellation_requests` metadata key.
- **Abort polling is not wired for agent runs today.** The shared worker
  abort-poller (`registerBackgroundJobAbortController` in
  `src/lib/background-jobs.ts`, 750 ms interval) is what other background
  workers use, but `runAgentBuilderExecutionJob` does not register an
  `AbortController` — the dispatch is a single blocking `sendTask`, so a
  cancellation request takes effect only before dispatch, not mid-run. If
  mid-run cancellation is added, it belongs at this worker boundary (poll
  `signal.aborted`; stop the runtime execution; transition
  `agent_runs.status → stopped`; emit `AgUiAdapter.onRunFinished("stopped")`
  for UI closure) — not inside the runtime.
- **Server-side timeout**: `agent_runs.timeoutSeconds` exists as a column but
  is not enforced by the worker today. If enforced later, it is a
  BullMQ-worker concern; the runtime does not own it.

Do not push the BullMQ abort signal into the runtime as a runtime-native
primitive. Keep the kill switch at the worker boundary.

## What to avoid

- Adding any code that enqueues `AGENT_BUILDER_RESUME`; the job no longer
  exists.
- Referencing `planned_actions` or `review_tasks` tables in new code; they are
  absent from the current schema.
- Writing DB rows during interrupt emission in either the setup loop or runtime
  interrupt handler. Both paths use synthetic IDs and no DB writes.
- Passing real UUIDs to `approveReviewTaskInternal`. Only `setup-{runId}` and
  `lg-{runId}` prefixes are valid.
- Adding new code paths to `execution.ts` beyond the setup interrupt loop and
  runtime dispatch. New agent execution logic belongs in runtime agents or in the
  runtime dispatch function.
- Pushing BullMQ cancellation into the runtime as a runtime primitive. Keep the
  kill switch at the worker boundary.
- Building a second queue alongside `cinatra-background-jobs`; a single queue
  with job-name routing is sufficient.
- Creating runtime threads or contexts outside the runtime dispatch function.
  Runtime lifecycle belongs in one place.
- Running the agent runtime in the same process as Next.js. The runtime is a
  separate service.
- Treating `"default"` as valid MCP input for `executionProvider`. Existing DB
  rows with `"default"` still execute (dispatch does not read the column); do
  not conflate MCP input validation with runtime dispatch.
- Calling the runtime dispatch from `runAgentBuilderExecutionJob` without a
  preceding `updateAgentRunStatusConditional` CAS. Two concurrent BullMQ retries
  can both pass a stale read-check before either writes anything; the CAS is the
  serialization point.
- Calling `generate` from an agent runtime graph. Use runtime-native
  model classes inside the graph; reserve `generate` for non-agent
  LLM work inside TypeScript connector packages.

## Related documentation

- `references/platform/llm-orchestration.md` — orchestration layer that stays TypeScript.
- `references/mcp/patterns.md` — MCP primitive conventions used by both TypeScript
  and runtime layers.
- `guides/developer/agent-development.md` — authoring new agents.
- `packages/langgraph-agents/README.md` — legacy LangGraph Server setup and
  deployment reference.
