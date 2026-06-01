# A2UI v0.9 Usage in Cinatra

## Overview

agent-to-UI (A2UI) protocol is a declarative UI payload format carried **inside** Agent-User Interaction Protocol (AG-UI) `STATE_SNAPSHOT` events. It is distinct from AG-UI itself:

| Layer | Role | Transport |
|-------|------|-----------|
| **AG-UI** | Streaming lifecycle transport | server-sent events (SSE) / WebSocket |
| **A2UI** | Declarative UI surface description | Payload inside `STATE_SNAPSHOT` |

A2UI v0.9 is implemented by the spec at `packages/agent-ui-protocol/src/a2ui-spec.ts`.

---

## Architecture

```
Execution worker
  └─ AgUiAdapter          (AG-UI lifecycle calls)
  └─ A2UiAdapter          (A2UI surface creation/deletion)
       └─ publishA2UiEvent → Redis Streams → client STATE_SNAPSHOT
```

`A2UiAdapter` is wired in parallel at every lifecycle site in:
- `packages/agents/src/agentic-execution.ts`
- `packages/agents/src/langgraph-execution.ts`
- `packages/agents/src/agentic-resume.ts`

---

## Grouped Setup Form — Email Outreach

The first concrete A2UI use case collapses sequential per-field human-in-the-loop (HITL) setup interrupts into a single grouped form.

### How it activates

1. Add `"x-renderer": "@cinatra/agent-builder:grouped-setup-form"` to **any one** of the agent's setup fields in `agent.json`.
2. `execution.ts` checks `agentOptsIntoGrouped = pendingFields.some(f => properties[f]?.["x-renderer"] === GROUPED_SETUP_FORM_RENDERER_ID)`.
3. When `pendingFields.length >= 2` **and** `agentOptsIntoGrouped` is true → grouped path. Otherwise → per-field path.

### Agent JSON example

```json
{
  "inputSchema": {
    "properties": {
      "offeringCompanyWebsite": {
        "type": "string",
        "format": "uri",
        "title": "Company website",
        "x-renderer": "@cinatra/agent-builder:grouped-setup-form"
      }
    }
  }
}
```

Only **one field** needs the annotation — it is the opt-in signal, not a per-field decoration.

### What the renderer does

`GroupedSetupFormRenderer` (priority 50 in `register-default-renderers.ts`):

- Iterates `schema.properties` in order: required fields first, then optional.
- Delegates each field to `fieldRendererRegistry.resolve()` (same resolver as `AgenticRunPanel`) or falls back to `SchemaFieldRenderer`.
- Wraps each sub-renderer in a react-hook-form `<Controller>` so sub-renderer `onChange` buffers into form state — it does **not** call the outer `onChange` per keystroke.
- Strips `x-renderer === grouped-setup-form` from the marker field's schema before sub-renderer resolution to prevent recursive matching.
- A single **"Save & start run"** button at the bottom submits the whole form via `form.handleSubmit → onChange(mergedValues)`.
- Uses `useEffect(() => form.reset(value ?? {}), [form, value])` to keep react-hook-form `defaultValues` in sync with upstream prop changes after mount.
- Uses `useWatch({ control: form.control })` (not `form.watch()`) to build `subContext.allFieldValues` without broad re-render churn.

### `hideSubmit` prop

Sub-renderers receive `hideSubmit={true}`. `SchemaFieldRenderer` and `FollowUpCadenceFieldRenderer` honour this by suppressing their internal Continue button. Custom renderers (`gmail-sender`, `cta`, `contact-source-selector`) are assumed safe in grouped mode — they expose their value via controlled `value + onChange` and have no standalone submit action.

---

## Idempotency contract

`createSurface` with the same `surfaceId` emitted more than once (e.g., on resume/retry) must be treated as a **no-op** by consumers. The current Redis Streams TTL provides cleanup for stale surfaces.

---

## Future adoption candidates

The following agents and workflows could adopt grouped setup via the same `x-renderer` annotation mechanism, requiring no backend changes:

| Agent / Workflow | Setup fields today | Grouped benefit |
|-----------------|-------------------|-----------------|
| `email-drafts` | 2–3 fields | Minor friction reduction |
| `email-recipients` | 2 fields | Small win |
| Future onboarding wizard | 4–6 fields | High value — multi-step replaced by one form |
| Any agent with ≥ 3 required setup fields | ≥ 3 | Standard pattern to adopt |

To adopt: add `"x-renderer": "@cinatra/agent-builder:grouped-setup-form"` to one field in the agent's `inputSchema`, bump `packageVersion` in `agent.json`.

---

## Mid-Run HITL Surfaces

Three mid-run review screens use the A2UI layer. Unlike the grouped setup form (which fires before the run starts), these surfaces fire during an already-running LangGraph execution when a `build_hitl_gate` node emits an interrupt.

### Overview

A2UI v0.9 has no DataTable primitive. Mid-run review screens use: `Column` wrapping a title `Text`, a `List` with a row template (or a `Card` for summary views), and a `Row` of Approve + Reject `Button` components.

The three translator functions in `packages/agent-ui-protocol/src/server.ts` build these trees and are keyed in `A2UiAdapter.MID_RUN_TRANSLATORS` by xRenderer ID.

### Recipe 1: Row-table — Recipients Review

xRenderer: `@cinatra-agents/email-recipients:output`
Translator: `translateRecipientsOutputToA2Ui`

```typescript
// Abbreviated component tree
Column([
  Text("Review Recipients", { variant: "heading" }),
  List({
    items: recipients.map(r => ({
      id: r.email,
      cells: [Text(r.name), Text(r.email), Text(r.company ?? "—")],
    })),
    rowTemplate: "three-column",
  }),
  Row([
    Button("Approve", { action: { event: { name: "approve_review_task", values: { literal: { approved: true } } } } }),
    Button("Reject",  { action: { event: { name: "reject_review_task",  values: { literal: { approved: false } } } } }),
  ]),
])
```

### Recipe 2: Card-list — Drafts Review

xRenderer: `@cinatra-agents/email-drafts:output`
Translator: `translateDraftsOutputToA2Ui`

```typescript
Column([
  Text("Review Email Drafts", { variant: "heading" }),
  List({
    items: drafts.map(d => ({
      id: d.id,
      cells: [Text(d.recipientEmail ?? ""), Text(d.subject), Text(d.body.slice(0, 120) + "…")],
    })),
  }),
  Row([
    Button("Approve", { action: { event: { name: "approve_review_task", values: { literal: { approved: true } } } } }),
    Button("Reject",  { action: { event: { name: "reject_review_task",  values: { literal: { approved: false } } } } }),
  ]),
])
```

### Recipe 3: Summary card — Send Confirmation

xRenderer: `@cinatra-agents/email-sender:output`
Translator: `translateSendOutputToA2Ui`

```typescript
Column([
  Text("Confirm Send", { variant: "heading" }),
  Card([
    Text(`Recipients: ${summary.recipientCount ?? "—"}`),
    Text(`Drafts ready: ${summary.draftCount ?? "—"}`),
  ]),
  Text("This action sends real emails and cannot be undone.", { variant: "warning" }),
  Row([
    Button("Send now", { action: { event: { name: "approve_review_task", values: { literal: { approved: true } } } } }),
    Button("Cancel",   { action: { event: { name: "reject_review_task",  values: { literal: { approved: false } } } } }),
  ]),
])
```

### Approve/Reject Button action contract

Both buttons use the `action.event` pattern:

| Button | `action.event.name` | `context.values.literal` |
|--------|---------------------|--------------------------|
| Approve | `"approve_review_task"` | `{ "approved": true }` |
| Reject  | `"reject_review_task"`  | `{ "approved": false }` |

The `reviewTaskId` is carried separately in the interrupt envelope; the button action fires `approveReviewTaskServerAction(reviewTaskId, values)` on the TS side.

### Surface lifecycle (known limitation)

HITL surfaces created during a mid-run gate currently linger until Redis Streams TTL expires. `AgentUIAdapter.onResume` does not yet accept a `reviewTaskId` argument to delete the surface on resume. This is acceptable for now because no A2UI native client renders these surfaces yet; only the workspace `AgenticRunPanel` consumes the INTERRUPT event stream directly via `fieldRendererRegistry`.

### Dispatch table

`A2UiAdapter.MID_RUN_TRANSLATORS` maps xRenderer IDs to translator functions:

```typescript
const MID_RUN_TRANSLATORS: Record<string, MidRunTranslator> = {
  "@cinatra-agents/email-recipients:output": translateRecipientsOutputToA2Ui,
  "@cinatra-agents/email-drafts:output":     translateDraftsOutputToA2Ui,
  "@cinatra-agents/email-sender:output":     translateSendOutputToA2Ui,
};
```

`onInterrupt` checks this table first; grouped-setup-form interrupts fall through to the existing handler.

---

## A2UI surface cleanup

HITL-specific A2UI surfaces are currently cleaned up by Redis Streams TTL. Explicit deletion on resume is deferred because `AgentUIAdapter.onResume` does not yet accept a `reviewTaskId`.
