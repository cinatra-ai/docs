# Agent Context Slots

Audience: developers retrofitting an existing agent Open Agent Specification (OAS) to consume
semantic-artifact context, or designing a new agent that needs typed
context inputs.

This guide covers the `contextSlots` contract: schema, resolver
semantics, the **explicit context-selection-agent invocation** pattern, human-in-the-loop (HITL)
renderer flow, and the `run_context_selections` audit trail.

## What "context" means here

An agent's **context** is the set of artifact references it consumes as grounding input. The durable artifact lives in the Objects layer (see [Artifacts](../../references/platform/artifacts.md)); a run pins specific artifact versions at selection time so the run is replay-safe even if the artifact is later edited. **Context is not an extension kind.** It is surfaced by two things working together: the built-in `@cinatra-ai/context-selection-agent` (a `kind:"agent"` extension), which resolves slots and writes the audit row; and the `contextSlots` declaration this guide describes, which a consuming agent's author adds to its OAS. The user-facing definition lives in [Concepts: Context](../../references/glossary.md#context).

The rest of this page is the developer contract for that `contextSlots` declaration.

> **Mechanism: explicit OAS sub-agent invocation, NOT runtime
> auto-wiring.** There is no runtime patch that splices
> context-selection-agent calls into a parent's flow. A context slot is wired
> by an **explicit `context-selection-agent` FlowNode the agent author adds to
> its own OAS** — see "Explicit context-selection-agent invocation" below.

## TL;DR

An agent that needs typed context declares `contextSlots:
AgentContextSlot[]` on its OAS `metadata.cinatra.contextSlots`, declares
`@cinatra-ai/context-selection-agent` in its package's `package.json`
`cinatra.agentDependencies`, and **explicitly includes one
`context-selection-agent` FlowNode per slot before the first slot-consuming
node**. That FlowNode resolves the slot to a set of
pinned artifact refs, opens the ContextSelector HITL renderer when
`selectionMode === "interactive"`, writes a `run_context_selections`
audit row per selected ref, and emits `output_data.contextRefs`, which a
data-flow edge feeds into the consuming node's `contextSlotBindings`
input. **Invocation is child-local** — each agent owns its own
context-selection-agent FlowNode + its own three-key audit pin. A parent
orchestrator does NOT fan-out a single context-selection-agent call to its
children, and does NOT declare `@cinatra-ai/context-selection-agent` unless the
parent itself declares `contextSlots`.

## Slot schema

```typescript
type AgentContextSlot = {
  slotId: string;
  acceptedArtifactExtensions: string[];        // direct + satisfies-graph
  selectionMode: "interactive" | "autonomous";
  resolutionMode: "override" | "accumulate";
  minItems?: number;                            // default 0
  maxItems?: number;                            // optional cap
  readableOnly?: boolean;                       // capability-registry gate
};
```

Lives on the agent OAS at `metadata.cinatra.contextSlots`.

### `slotId`

Unique per agent. Duplicate slotIds are rejected at the consumer
boundary (`context_resolve` Model Context Protocol (MCP) handler) and should be validated by the
agent's contract test. Keep it identifier-safe (it names the
`context-selection-agent` FlowNode + the data-flow edge into the consuming node).

### `acceptedArtifactExtensions`

List of semantic artifact-extension package names (e.g.
`@cinatra-ai/marketing-icp-artifact`). The resolver expands this list
via the single-hop `satisfies`-graph: an installed extension X is
added to the accepted set IFF `X.satisfies` intersects the directly-
accepted set. NO transitive closure.

### `selectionMode`

- `"interactive"` — the context-selection-agent opens the ContextSelector HITL
  renderer; a human picks from the resolved candidates.
- `"autonomous"` — the context-selection-agent resolves without a HITL gate. In
  `override` mode this collapses to the narrowest-tier ref; in
  `accumulate` mode it returns all matching refs.

### `resolutionMode`

- `"override"` — narrowest scope wins. The large language model (LLM) sees ONE ref (project
  beats org beats workspace). Used when specificity trumps generality
  (e.g. "ideal customer profile").
- `"accumulate"` — walk the ownership chain, return all matching refs
  ordered narrow→broad with a manifest tagging each by source scope.
  The LLM sees them as separate attached artifacts and reconciles
  itself. NO synthesis at the resolver layer. Used when broader context
  layers under narrower refinement (e.g. "brand voice").

### `minItems` / `maxItems`

`minItems` is a CALLER concern — the resolver returns what's eligible
without enforcing the floor. The context-selection-agent (autonomous) or the HITL
renderer (interactive) blocks the parent agent when `selectedRefs.length
< minItems`.

`maxItems` is enforced at SELECTION time. Accumulate-mode truncates;
the HITL renderer disables unchecked checkboxes at-cap.

### `readableOnly`

Capability-registry gate. When `true`, the ContextSelector renderer will
filter the candidate set to refs whose representation MIME is readable by the
parent agent's LLM provider. Currently displayed as a UI badge only.

## Example: email-outreach offering context

```json
"metadata": {
  "cinatra": {
    "contextSlots": [
      {
        "slotId": "offeringContext",
        "acceptedArtifactExtensions": [
          "@cinatra-ai/marketing-icp-artifact",
          "@cinatra-ai/marketing-strategy-artifact",
          "@cinatra-ai/product-portfolio-artifact"
        ],
        "selectionMode": "interactive",
        "resolutionMode": "accumulate",
        "minItems": 0,
        "maxItems": 5,
        "readableOnly": true
      }
    ]
  }
}
```

The agent's prompt template substitutes the explicit `context-selection-agent`
FlowNode's `contextRefs` output (wired via a data-flow edge into the
consuming node's `contextSlotBindings` input — e.g.
`{{context_offeringContext.contextRefs}}` where
`context_offeringContext` is the FlowNode id) for the free-text context input.

## Resolver semantics

`resolveContextSlot(actor, slot, projectId?, installedExtensions)`
runs a single Postgres query:

1. **CTE `visible_objects`** — `objects` filtered by `org_id`, semantic
   artifact type, `deleted_at IS NULL`, the canonical
   `buildOwnershipFilter(actor)` visibility predicate, AND
   (when `projectId` is set) `visibility = "project:<projectId>"`,
   OR (when absent) `visibility NOT LIKE "project:%"`.

2. **Join `semantic_assertion`** filtered to
   `eligibility = "eligible"` AND
   `extension = ANY(<expandedAcceptedExtensions>)`.

3. **LATERAL join** to the latest `representation` revision per
   artifact (replay-safe pin at SELECT time).

Returns `ResolvedContextRef[]` with sourceScope derived from the
artifact's visibility column.

### Project refinement gates

The optional `projectId` arg fails closed when not present in
`actor.projectIds`. The resolver returns `[]` WITHOUT issuing the
query. Cross-project artifact disclosure is structurally impossible
through this path.

## Explicit context-selection-agent invocation (canonical)

> There is **no** transformer and **no** out-of-repo runtime patch. Wiring is
> an explicit, author-owned part of the agent's own OAS.

For **each** declared slot, the agent OAS must carry, in addition to
`metadata.cinatra.contextSlots[<slot>]`:

1. **`agentDependencies` entry** — `"@cinatra-ai/context-selection-agent":
   "^x.y.z"` in the agent **package's `package.json`** under
   `cinatra.agentDependencies` (the packument/semantic-manifest source
   the dep-resolver + agent-card read — NOT OAS
   `metadata.cinatra.agentDependencies`).
2. **An explicit `context-selection-agent` FlowNode** — one per slot — placed
   **before the first node that consumes the slot**. Conventionally
   named `context_<slotId>`.
3. **Control edge** — `context_<slotId>` → consuming node (the
   context-selection-agent FlowNode runs first).
4. **Data edges IN** to the context-selection-agent FlowNode (these are the
   context-selection-agent OAS input titles): `parentRunId`, `parentPackageName`,
   `slotId`, `projectId`.
5. **Data edge OUT**: the FlowNode's `contextRefs` output → the
   consuming node's `contextSlotBindings` input. This data edge is the
   binding contract; do not substitute a prompt-template-only reference
   for the explicit `contextSlotBindings` data edge.

**Invocation locality (binding rule):** child-local only. Each
context-using agent owns its own `context-selection-agent` FlowNode and its own
three-key audit pin. A parent orchestrator **must not** fan-out a single
context-selection-agent call to its children (fan-out couples the parent to child
internals and weakens per-agent audit semantics). A parent declares
`@cinatra-ai/context-selection-agent` in `agentDependencies` **only if the parent
itself declares `contextSlots`** — declaring it merely because a child
does is a transitive-declaration leak and is forbidden.

**Reference implementation:** `email-outreach-agent`
(`extensions/cinatra-ai/email-outreach-agent/cinatra/oas.json`) is the
canonical explicit-context-selection-agent OAS shape when it carries the
`@cinatra-ai/context-selection-agent` `package.json` `cinatra.agentDependencies`
entry, the explicit `context_offeringContext` FlowNode before the drafting
subflow, and the `contextRefs → contextSlotBindings` data edge. A repo-wide
regression test should assert that every agent OAS with a non-empty
`contextSlots` also carries the `@cinatra-ai/context-selection-agent`
`cinatra.agentDependencies` entry and a `context-selection-agent` FlowNode
before the slot consumer.

## `context_resolve` MCP primitive

Direct MCP invocation (for chat-driven flows that don't run through
the WayFlow (Cinatra's OAS Flow agent runtime)):

```
context_resolve(parentAgentOas, slotId, projectId?) → {
  slotId, resolutionMode, refs: ResolvedContextRef[]
}
```

The handler derives the installed-extension list SERVER-SIDE from
`objectTypeRegistry.listArtifacts()` (NEVER trusts caller-supplied
lists) and rejects duplicate slotIds at the consumer boundary.

## `run_context_selections` audit table

Every selection writes one append-only row pinning:

- `artifact_id` — the resource's artifact id
- `representation_revision_id` — the EXACT revision at selection time
- `semantic_assertion_id` — the EXACT classification at selection time
- `extension`, `source_scope`, `selected_by`, `selection_mode`

A correction is a NEW row, not a mutation (the table's BEFORE-trigger
raises on UPDATE OR DELETE). The three-key pin guarantees future
replays of the parent run resolve to the EXACT artifact version + the
EXACT extension classification — reclassifications cannot rewrite
history.

Triple-coherence validation runs BEFORE insert:
- representation belongs to (org, artifact_id)
- semantic_assertion belongs to (org, artifact_id)
- assertion's extension matches the audit row's extension
- artifact is live (not tombstoned, correct semantic-artifact type)

A coherent triple can't pin a stale or cross-artifact reference.

## ContextSelector HITL renderer

The interactive flow opens
`@cinatra-ai/context-selection-agent:context-selector` — a registered field
renderer that groups candidates by source scope (project → user →
team → org → workspace), enforces `maxItems` via disabled checkboxes
at-cap, and emits a structured `userResponse` JSON envelope:

```json
{
  "slotId": "offeringContext",
  "resolutionMode": "accumulate",
  "selectedRefs": [/* triple-pinned refs */]
}
```

The `userResponse` envelope rides through `review-task-actions.ts`
into the WayFlow resume — same channel the email-outreach setup-form
already uses.

## Adoption checklist

- [ ] Identify a slot you want to add (e.g. `voiceContext`).
- [ ] Pick `acceptedArtifactExtensions` (direct types; satisfies-graph
      handles supertype matches automatically).
- [ ] Choose `resolutionMode` ("override" for one-winner; "accumulate"
      for layered context).
- [ ] Choose `selectionMode` ("interactive" for HITL; "autonomous" for
      no-pick).
- [ ] Set `minItems` / `maxItems` per UX expectation.
- [ ] Add the slot to your agent OAS `metadata.cinatra.contextSlots`.
- [ ] Add `@cinatra-ai/context-selection-agent` to the agent extension's
      `package.json` `cinatra.agentDependencies` map.
- [ ] Add an explicit `context-selection-agent` FlowNode (`context_<slotId>`)
      BEFORE the first slot-consuming node, with a control edge into the
      consumer and data edges (`parentRunId`/`parentPackageName`/
      `slotId`/`projectId` in; `contextRefs` out → consumer
      `contextSlotBindings`). Copy the `email-outreach-agent` reference
      shape when it carries the explicit FlowNode + edge topology.
      Child-local only — never an orchestrator fan-out.
- [ ] Bump the package version (`ensureAgentPackageFromGitFile` skips
      re-import without a version bump).
- [ ] Add a contract test pinning the slot shape (see
      `packages/extensions/src/__tests__/email-outreach-agent-context-slot.test.ts`
      for the pattern).
- [ ] Document in the agent's UAT / README.

## Cross-references

- `guides/developer/semantic-artifact-extensions.md` — authoring artifact extensions
- `references/platform/artifacts.md` — platform data model
- Working example: `extensions/cinatra-ai/email-outreach-agent/cinatra/oas.json`
  (see `metadata.cinatra.contextSlots`)
