# Workflow extension doctrine

Binding rules that govern when a workflow extension is safe to ship and when a legacy surface it replaces can be retired.

## Rule 1 — Workflow extensions producing external effects must define four contracts

A workflow extension (a `kind: "workflow"` extension package) that materializes external artifacts (drafts, images, blog posts) or fires irreversible effects (publishing to LinkedIn, WordPress, email outbox) MUST define ALL of the following before the legacy surface it replaces is retired:

1. **Fan-out shape.** If the workflow declares one or more `foreach` patterns, the extension's README states the fan-out cardinality bound, the source of `{ items: [...] }`, and the per-item child template's own contracts. Single-level fan-out only; nested foreach is rejected at validate-time and would block the extension's install.
2. **Artifact-binding contract.** Every produced artifact MUST be reachable via `workflow_artifact` rows linked to the producing task. The extension's README lists the artifact kinds it produces and the agent that emits them.
3. **Approval gates.** Tasks that fire irreversible effects (LinkedIn / WordPress publish, email send, etc.) MUST be preceded by an `approval` task in the workflow template. Removing such an approval violates this contract.
4. **Idempotency keys.** Irreversible-effect tasks MUST carry a stable idempotency key in their input so a duplicate workflow run cannot double-fire the side effect.

## Rule 2 — Retirement gates on contract presence

When retiring a legacy surface, the retirement may only proceed once the workflow extension that REPLACES the legacy surface satisfies all four contracts above. The retirement must reference the replacing extension's README + SKILL.md, where those contracts are recorded. (Worked example: the legacy `/assets/asset-blog/*` UI was retired in favor of the `@cinatra-ai/blog-content-workflow` extension's typed-portlet dashboard.)

## Rule 3 — Doctrine is binding

This file is the source of truth for the four contracts. The blog content workflow extension (`@cinatra-ai/blog-content-workflow`) is the first consumer. Future workflow extensions cite this entry from their own READMEs.

## See also

- [`workflow-extension-surfaces.md`](./workflow-extension-surfaces.md) — the operator-surface doctrine: every workflow extension's UI is a `cinatra/dashboard.json` composing typed-registry portlets, never a bespoke React route tree.
- [`cinatra-bpmn-profile.md`](./cinatra-bpmn-profile.md) — Cinatra BPMN Profile 1.0: the supported BPMN constructs, the 12 `cinatra:` extension elements, the BPMN→WorkflowSpec mapping, and the structured error catalog.
