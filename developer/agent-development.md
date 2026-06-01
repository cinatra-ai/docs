# Agent Development Guide

Rules extracted from the email outreach agent audit. These apply to every agent built or compiled in the Cinatra agent builder.

## Self-Containment

An agent should be **as self-contained as possible** — everything it needs to execute its logic should live in its own package. This is what enables agents to be composed, moved, and tested in isolation.

**What an agent extension CAN contain:**
- `SKILL.md` — behavioral spec: instructions, step sequences, decision logic
- Scripts (shell, Python, JS) referenced in SKILL.md and invoked by the large language model (LLM) via the shell tool
- Extra reference files (prompt templates, lookup tables, config defaults)
- Pure LLM reasoning and content generation — no MCP needed for these

**What an agent MUST delegate to the platform (via MCP):**
- Data persistence: contacts, campaigns, runs, results, drafts
- External integrations: Gmail, LinkedIn, Apollo, WordPress, any connector
- Authentication and credentials: never stored in agent; platform handles all auth
- State across sessions: platform maintains run records, not the agent
- Other agents: invoked via agent-as-tool, never via direct imports

**The border is the MCP interface.** An agent crosses the border once — via MCP primitives. The platform never reaches into the agent. This symmetry is what makes composite agents possible: a well-bounded agent can be invoked by any orchestrator without coupling.

If you are tempted to replicate Cinatra data retrieval logic (pagination, DB schema, field mapping) inside an agent, that is a signal the MCP layer is missing a primitive — flag it and add the primitive instead of duplicating the logic.

---

## Structural Rules

**Rule 1 — packageName + packageVersion are required for reusable agents.**
Every agent that can be invoked by an orchestrator or installed from the registry must be published via `agent_registry_publish`. Publishing sets `packageName` (e.g. `@cinatra-agents/email-recipients`). Without `packageName`, the orchestrator cannot resolve the agent as a child tool.

**Rule 2 — `executionProvider: "wayflow"`.**
WayFlow (Cinatra's OAS Flow agent runtime) is the sole runtime. Set `executionProvider: "wayflow"` on every agent template (DB save) — the legacy values `"default"` and `"langgraph"` are migration artefacts and are no longer accepted by the validator. For Open Agent Specification (OAS) source packages on disk, the field is implicit (the OAS compiler emits it on derive); only DB-saved templates need to set it explicitly.

**Rule 3 — inputSchema must be a JSON Schema object, not a serialized string.**
The value of `inputSchema` must be a plain JSON object: `{ "type": "object", "properties": {...} }`. Do not pass a JSON-encoded string. The agent builder will reject string values at validation time.

**Rule 3a — `inputSchema.required` is the Agent-User Interaction Protocol (AG-UI) INTERRUPT specification.**
The runtime collects pre-run user input by emitting one AG-UI `INTERRUPT` event per field listed in `inputSchema.required` that is missing from the incoming `run.inputParams`. `inputSchema` IS the interrupt spec: no separate wizard definition, no `x-setup-steps` array. See "Collecting User Inputs" below for the full contract.

**Rule 4 — human-in-the-loop (HITL) gates belong in `approvalPolicy.steps`, not only in taskSpec prose.**
Declaring a human-in-the-loop gate only in the taskSpec text is not enforceable at runtime. All gates that pause execution for user approval must be registered in `approvalPolicy.steps` with a `riskClass` value. The taskSpec may describe the gate, but the `approvalPolicy` entry is authoritative.

**Rule 5 — `hitlScreens` lists the x-renderer IDs this agent may produce.**
When the agent emits a HITL state with a custom renderer, the `hitlScreens` array in the agent template must declare that renderer ID. This is how the UI knows which review screens to load. Both pre-run setup-field interrupts (Rule 3a) and mid-run HITL interrupts resolve through the same `fieldRendererRegistry`, so a single `hitlScreens` list covers both surfaces.

---

## Collecting User Inputs — AG-UI INTERRUPT Pattern

Cinatra collects pre-run input from users via the AG-UI
`INTERRUPT` protocol — the same mechanism that handles mid-run HITL approvals. A
single code path serves both surfaces: the workspace `AgenticRunPanel` and the
The retired chat panel also consumed the same INTERRUPT event stream
via `fieldRendererRegistry.resolve("hitl-field", schema, context)`.

### Rule I.1: Define `inputSchema.required` for fields the user must supply

The agent template's `inputSchema` is a JSON Schema with `properties` and
`required`. Every property listed in `required` that is NOT present in the
incoming `run.inputParams` at execution time causes the runtime to emit one
AG-UI `INTERRUPT` event per missing field. The user (or another agent) fills the
field; the run resumes and either emits the next INTERRUPT or proceeds to the
agent's main task.

```json
{
  "type": "object",
  "properties": {
    "company_website": {
      "type": "string",
      "format": "uri",
      "description": "Target company URL to research"
    },
    "outreach_goal": {
      "type": "string",
      "enum": ["meeting", "demo", "partnership"],
      "description": "What we want from this outreach"
    }
  },
  "required": ["company_website", "outreach_goal"]
}
```

At execution start, the runtime emits INTERRUPT for `company_website` first,
then (after approval) for `outreach_goal`, then dispatches to the agent worker.

### Rule I.2: Use `x-renderer` only when a custom UI is required

Most fields (string, number, boolean, enum, URL, email) render with the default
`SchemaFieldRenderer` — a generic shadcn-based form widget. No custom code
needed.

When a field requires a specialized UI (e.g. a Gmail sender picker, a
contact-source selector), add `"x-renderer": "<renderer-id>"` to the sub-schema.
The renderer must be registered in
`packages/agents/src/register-default-renderers.ts`:

```json
{
  "sender": {
    "type": "object",
    "x-renderer": "@cinatra-agents/email-outreach:gmail-sender"
  }
}
```

The renderer id format is `@<package>:<kebab-name>`. Priority 80-100 for custom
renderers (100 is highest). The built-in fallback
`@cinatra-ai/agent-builder:schema-field-fallback` sits at priority 1 and activates
only when no custom renderer matches.

### Rule I.3: Use `x-hidden: true` for fields the user never sees

Fields set by the runtime or by another agent (e.g. a parent orchestrator
writing a sub-field into a child agent's inputParams) should be marked
`"x-hidden": true`. The setup loop skips these — no INTERRUPT is emitted even
if the field is listed in `required`. If the field is missing at execution time
and no upstream writer populated it, the agent worker's input validation (via
`jsonSchemaToZod`) will reject the run.

### Retired patterns — do NOT use

These legacy patterns are no longer supported. They appear here so authors
migrating older templates can recognise unsupported vocabulary:

- **`x-setup-steps` compiler directive** — the compiler no longer emits this
  key. Existing templates that still carry `x-setup-steps` in their stored
  inputSchema have it harmlessly ignored by the dispatcher (which
  reads only `inputSchema.required` and `inputSchema.properties`).
- **Multi-step setup wizard (`setup-workspace.tsx`)** — no longer supported.
  `/agents/[slug]/new` now creates a `pending_input` run via
  `createPendingRunForZeroInputTemplate` and redirects to
  `/agents/[slug]/[runId]` immediately; field collection happens via
  INTERRUPTs after the worker dispatches.
- **Retired `agent_configure_instance` action** — no longer supported.
  The chat surface now uses `HitlApprovalPanel`, same as the workspace.
- **`saveSetupStep` / `saveSetupStepServerAction`** — deleted alongside the
  wizard. Values now flow through `approveReviewTaskServerAction(taskId, values)`.
- **`setupNonce` idempotency** — the wizard's per-step save loop is gone; the
  single-transaction merge in `approveReviewTaskInternal` makes a nonce
  unnecessary.
- **`__setup_nonce` / `__step_{id}_done` / `__agent_run_name` sentinel keys in
  inputParams** — the first two are no longer written. Run name lives on
  `agent_runs.title`. Legacy rows that still carry these
  keys are harmless (they do not match any schema property).

### Implementation reference

The runtime emission is in `packages/agents/src/execution.ts` (the
setup interrupt loop, inserted after `assertOrchestratorReady(template)` and
before the LangGraph/orchestrator/agentic/deterministic dispatch branches).
The value persistence is in
`packages/agents/src/review-task-actions.ts`
(`approveReviewTaskInternal` — merges `values` into
`agent_runs.inputParams[fieldName]` when
`planned_action.provenance.kind === "setup_field"`). The setup-branch resume
dispatcher sits in `packages/agents/src/resume.ts`; it compare-and-swaps
the run status from `pending_approval` back to `queued` and re-enters
`runAgentBuilderExecutionJob` so the setup loop runs again against the updated
`run.inputParams`.

The renderer registry lives in
`packages/agents/src/field-renderer-registry.ts` and the default
entries — including the `@cinatra/agent-builder:schema-field-fallback` entry —
are declared in
`packages/agents/src/register-default-renderers.ts`.

---

## Behavioral Rules

**Rule 6 — Every agent has a corresponding SKILL.md.**
The SKILL.md is the behavioral source of truth for the agent. It lives in the agent extension:
```
agents/{slug}/SKILL.md
```
The taskSpec stored in the DB is compiled from this file. When a chat assistant creates a new agent via `agent_save`, it should also write the SKILL.md via `agent_source_write`.

See `docs/developer/agent-packaging.md` for the full agent extension layout and file templates.

SKILL.md template:
```markdown
---
name: agent-{slug}
description: {one-line description}
---

{taskSpec content verbatim}

## What I retrieve myself (MCP)
{list of MCP tools called autonomously — not passed as user input}
```

**Rule 7 — SKILL.md must include a `## What I retrieve myself (MCP)` section.**
This section lists every MCP tool the agent calls on its own initiative — data the agent fetches from the platform rather than receiving as user input. It is part of the self-retrieval boundary documentation (see the Input Boundary section in the compiler SKILL.md).

**Rule 8 — SKILL.md may include scripts or auxiliary files.**
If the agent invokes shell scripts, Python files, or reference documents, those files live in the same `agents/{slug}/scripts/` directory alongside SKILL.md. The agent accesses them via the local skill shell tool (`sourcePath`).

**Rule 9 — Agents never access data via direct DB queries.**
All data reads and writes go through MCP primitives. An agent must never import or call Drizzle ORM, `pg`, or any database library directly. The platform owns the data layer; agents own the task logic.

---

## Composition Rules (Orchestrators)

**Rule 10 — An orchestrator's taskSpec delegates to child agents only for reusable business logic.**
The orchestrator does not re-implement reusable stage logic inline. Its taskSpec invokes child agent tools in sequence and passes outputs forward — it does not call MCP primitives for business logic that belongs in a leaf agent. *Exception:* init-only operations that are not independently reusable outside the workflow (per CONV-03) may be inlined as an explicit Stage 0 in the orchestrator's SKILL.md. The `## What I retrieve myself (MCP)` section must document all primitives called in these inline stages.

**Rule 11 — All child agents are declared in `agentDependencies`.**
`agentDependencies` is an object mapping child `packageName` values to semver ranges:
```json
{
  "@cinatra-agents/email-recipients": "^1.2.0",
  "@cinatra-agents/email-drafts": "^1.2.0"
}
```
The runtime resolves and installs these agents before the orchestrator runs.

**Rule 12 — Child agents must have `packageName` set.**
A child agent without `packageName` cannot be resolved by the orchestrator runtime. Publish the child agent via `agent_registry_publish` before wiring it into an orchestrator.

**Rule 13 — Pass inter-stage data via child agent tool outputs, not user inputs.**
If Stage 1 creates a `campaignId` that Stage 2 needs, the orchestrator receives that value as an output from the Stage 1 tool call and passes it as input to the Stage 2 tool call. The user is never asked for `campaignId` — they don't know it and don't need to.

**Rule 14 — If an MCP primitive is missing, add it — do not inline the logic.**
When the agent needs a platform operation that has no MCP tool, the right fix is to add the primitive to the relevant package's `handlers.ts` + `schemas.ts`. Inlining DB access or HTTP calls inside the agent is the wrong fix: it violates Rule 9, makes the agent non-portable, and duplicates logic the platform already owns.

**Rule 15 — The trigger target run-id has TWO intentional modes.**
A trigger persists "re-fire THIS run later" against a run id. There are two
modes and the divergence is **deliberate, not a bug** — do not "unify" it:

| Context | Trigger persists against | Why |
|---|---|---|
| **Standalone** `@cinatra-ai/trigger-agent` | its own run — `cinatra_run_id` → `agent_run_id` (`trigger-agent/cinatra/oas.json`, the `start_to_persist_cinatra_run_id` DataFlowEdge) | the standalone agent IS the thing being scheduled; re-firing it re-runs itself |
| **Embedded** `trigger-subflow` inside an orchestrator (e.g. email-outreach, or any scheduled-watcher orchestrator) | the **parent/orchestrator** run — *the semantic target is the parent run; the binding FIELD varies*: some orchestrators bind a dedicated `parentRunId`; email-outreach maps the root `cinatra_run_id` into the embedded `agent_run_id`. Do not assume a single field name. | a scheduled watcher must re-fire the *whole orchestrator*, not just its trigger subflow |

When authoring or reviewing an orchestrator that embeds a `trigger-subflow`,
the embedded copy's persist binding MUST target the PARENT/orchestrator
run (the binding field varies — a dedicated `parentRunId` field in some
orchestrators, a `cinatra_run_id`→`agent_run_id` mapping in email-outreach), and the
standalone trigger-agent MUST key by its own `cinatra_run_id`. A reviewer/auditor agent must NOT flag this divergence as
an inconsistency — it is the contract. (The two copies are intentionally
maintained separately; there is no shared subflow source because the run-id
binding is the one thing that legitimately differs.)

---

## Mid-Run HITL Pattern

Use mid-run HITL gates when your orchestrator needs sequential human approval checkpoints between deterministic stages (e.g. approve recipients before generating drafts, approve drafts before sending). Each gate pauses the LangGraph run, emits an AG-UI INTERRUPT, and waits for the user to approve or reject.

### When to use

- Your orchestrator chains 2+ stages where stage N+1 should only run after a human reviews stage N's output.
- The operation at stage N+1 has a meaningful risk class (`draft_create`, `send_external_message`).
- You need reject short-circuit: a rejection at any gate should stop the run cleanly.

### Node topology: one interrupt per LangGraph node

> **Constraint (LangGraph Issue #6208):** A single LangGraph node can only emit one interrupt per execution step. Never put two `interrupt()` calls in the same node.

Each HITL gate is a dedicated node produced by `build_hitl_gate` from `cinatra_sdk.hitl`:

```
stage_0 → hitl_recipients_review → stage_2_generate_drafts → hitl_drafts_review → stage_3_ai_review → hitl_send_confirmation → stage_4_send → terminal_node
```

### Interrupt payload shape

Every gate emits a payload with this shape:

```json
{
  "xRenderer": "@cinatra-agents/email-recipients:output",
  "schema": {
    "type": "object",
    "properties": { "approved": { "type": "boolean" } },
    "required": ["approved"]
  },
  "values": { "campaignId": "<uuid>", "recipients": [...] }
}
```

The `schema` is always `{approved: boolean}` — it drives the approve/reject buttons. The `values` dict carries the domain data the reviewer needs to see (recipients list, drafts list, send summary). `bearer_token` MUST NOT appear in `values`.

### approvalPolicy.steps mapping

Each gate corresponds to an entry in the agent template's `approvalPolicy.steps` array:

```json
{
  "approvalPolicy": {
    "steps": [
      { "stepNumber": 2, "riskClass": "read_only",             "requiresApproval": true },
      { "stepNumber": 3, "riskClass": "draft_create",          "requiresApproval": true },
      { "stepNumber": 5, "riskClass": "send_external_message", "requiresApproval": true }
    ]
  }
}
```

The Python `build_hitl_gate(step_number=N, ...)` checks `approval_policy["steps"]` at runtime and **skips the interrupt entirely** when `requiresApproval` is false or the step entry is absent. This is how you disable a gate without deleting the node.

### Resume value contract

When the user approves: `{ "approved": true, "approvedAt": "<ISO>" }` — orchestrator continues to the next stage node.

When the user rejects: `{ "approved": false }` — `build_hitl_gate` writes `state["rejected_at"] = <ISO>` and returns `{}`, which short-circuits all subsequent stage nodes (each checks `if state.get("rejected_at")`). The terminal node emits `{"status": "rejected"}` and the TS runner maps this to `updateAgentRunStatus(runId, "stopped")`.

### TS graphInput enrichment

> **Override-immunity rule:** Authoritative fields (`bearer_token`, `approval_policy`) MUST be placed AFTER the `...run.inputParams` spread in the graphInput literal so user-supplied inputParams cannot override them. JavaScript last-key-wins ensures the server-authoritative value always prevails.

> LangGraph → Cinatra MCP calls no longer mint an OAuth Bearer.
> The MCP server's `isLocalhostRequest()` (at `packages/mcp-server/src/index.tsx:255`)
> treats `host.docker.internal`, `localhost`, `127.0.0.1`, and `::1` as loopback and
> bypasses OAuth verification. `graphInput.bearer_token` is now always
> the empty string `""` — the key is preserved because `llm_step.py` / `child_agent.py`
> / `subgraph.py` read `state["bearer_token"]` and raise `ValueError` on a missing
> key. The agent-to-agent (A2A) protocol path (`a2a_bearer_token`, scope `a2a:connect`) and the external-LLM
> path (`buildLlmMcpServerTool`, configured public base URL → `/api/mcp`) still
> require real Bearer tokens — those are NOT affected.

```typescript
const graphInput = {
  prompt,
  task_spec: template.taskSpec ?? "",
  // ... other non-authoritative fields ...
  ...(run.inputParams as Record<string, unknown>),  // user params FIRST
  // --- AUTHORITATIVE (MUST come AFTER the spread) ---
  bearer_token: "",                                  // localhost bypass — see note above
  approval_policy: template.metadata?.cinatra?.approvalPolicy ?? null,  // REQ-114-APPROVAL-POLICY-READ
};
```

### Common pitfalls

- **P1: Two interrupts in one node** — LangGraph only surfaces the first. Use one `build_hitl_gate` node per gate. (See LangGraph Issue #6208.)
- **P2: bearer_token in interrupt payload** — never include it in `values`. The token is for Python→MCP calls only; it never crosses to the browser.
- **P5: authoritative fields before spread** — if `bearer_token` or `approval_policy` appear before `...run.inputParams` in graphInput, user-supplied keys silently override them. Always place them after.
- **P6: status=rejected not mapped to stopped** — the terminal node emits `{status: "rejected"}`; the TS runner must map this to `updateAgentRunStatus(runId, "stopped")` or the run stays `running` forever.
- **P8: OrchestratorState missing required fields** — TypedDict must declare `approval_policy`, `bearer_token`, `rejected_at`, `status`, and all stage-output fields used in routing conditions.

### Reference implementation

- `agents/email-outreach/SKILL.md` — interrupt payload shapes per stage
- `packages/langgraph-agents/graphs/orchestrator_v1.py` — 10-node StateGraph with `build_hitl_gate`
- `packages/agent-ui-protocol/src/a2ui-translator.ts` — agent-to-UI (A2UI) protocol translators for the 3 mid-run surfaces

---

## Reference Implementation

The email outreach campaign agent (`agents/email-outreach/`) is the canonical reference implementation for these rules. It demonstrates:
- An orchestrator delegating to 4 published leaf agents via `agentDependencies`
- Per-agent SKILL.md files with `## What I retrieve myself (MCP)` sections
- HITL gates declared in `approvalPolicy.steps` (recipient approval, send confirmation)
- `executionProvider: "wayflow"` on all agents
- Stage agents with `packageName` set and published to Verdaccio (an npm-compatible registry)

For the compiler-side encoding of these rules, see:
`packages/agents/skills/agent-builder-compiler-agentic/SKILL.md`
