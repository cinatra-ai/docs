# 06. Workflow doctrine

Binding rules that govern when a workflow extension is safe to ship and when a
retirement phase may consume it. Added in v6.18 P569 (FAN-07).

## Rule 1 — Workflow extensions producing external effects must define four contracts

A workflow extension (a `kind: "workflow"` extension package — see v6.18
P572) that materializes external artifacts (drafts, images, blog posts) or
fires irreversible effects (publishing to LinkedIn, WordPress, email outbox)
MUST define ALL of the following before any retirement phase consumes it:

1. **Fan-out shape.** If the workflow declares one or more `foreach`
   patterns, the extension's README states the fan-out cardinality bound,
   the source of `{ items: [...] }`, and the per-item child template's own
   contracts. Single-level fan-out only in v6.18 (see REQUIREMENTS.md
   FAN-01 §"Guardrail" for rationale). Nested foreach is rejected at
   validate-time and would block the extension's install.
2. **Artifact-binding contract.** Per v6.18 P570 (forward reference): every
   produced artifact MUST be reachable via `workflow_artifact` rows linked
   to the producing task. The extension's README lists the artifact kinds
   it produces and the agent that emits them.
3. **Approval gates.** Tasks that fire irreversible effects (LinkedIn /
   WordPress publish, email send, etc.) MUST be preceded by an `approval`
   task in the workflow template. Removing such an approval would fail
   Codex review for the extension's PR.
4. **Idempotency keys.** Irreversible-effect tasks MUST carry a stable
   idempotency key in their input so a duplicate workflow run cannot
   double-fire the side effect.

## Rule 2 — Retirement gates on contract presence

When a phase proposes to retire a legacy surface, the retirement may only
proceed once the workflow extension that REPLACES the legacy surface
satisfies all four contracts above. The retirement PR must cite the
extension's README + SKILL.md as evidence. (Worked example: the legacy
`/assets/asset-blog/*` UI was retired in favor of the
`@cinatra-ai/blog-content-workflow` extension's typed-portlet dashboard.)

## Rule 3 — Doctrine is binding from v6.18 forward

This file is the source of truth for the four contracts. The blog content
workflow extension (`@cinatra-ai/blog-content-workflow`, v6.18 P572) is the
first consumer. Future workflow extensions cite this entry from their own
READMEs.

## See also

- [`07-workflow-extensions-as-app-surfaces.md`](./07-workflow-extensions-as-app-surfaces.md) — the operator-surface doctrine (v6.20 P603 DOC-01): every workflow extension's UI is a `cinatra/dashboard.json` composing typed-registry portlets, never a bespoke React route tree.
- [`08-cinatra-bpmn-profile.md`](./08-cinatra-bpmn-profile.md) — Cinatra BPMN Profile 1.0 (v6.20 P603 DOC-02): the supported BPMN constructs, the 12 `cinatra:` extension elements, the BPMN→WorkflowSpec mapping, and the 5-error structured catalog.
