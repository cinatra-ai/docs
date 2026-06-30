# Authoring workflow extensions

Audience: developers shipping a `kind: "workflow"` extension — a multi-step process orchestrating agents and approvals.

A workflow extension is **declarative**: you author a BPMN process spec and an optional dashboard sidecar. There is no `register(ctx)` host-port server entry, and workflow-path installs **cannot declare host schema migrations** — a workflow extension reaches data through its tasks' agents and the workflow runtime, not through a privileged server entry. The host materializes a `workflow_template` (and, when a sidecar is present, a `dashboard_template`) plus the workflow's object types.

## TL;DR

Ship a `cinatra/workflow.bpmn` process (and optionally a `cinatra/dashboard.json` sidecar) with `cinatra.kind: "workflow"`. The host registers the template, the optional dashboard, and the workflow object types; instantiated workflows embed snapshots so run history survives uninstall/archive.

## File layout

```
extensions/<scope>/<slug>-workflow/
├── package.json                ← cinatra.kind:"workflow"
├── README.md                   ← marketplace-ready README (gate-enforced) + the four contracts
├── LICENSE
├── src/index.ts                ← typed manifest export
└── cinatra/
    ├── workflow.bpmn           ← the BPMN process spec
    └── dashboard.json          ← optional dashboard sidecar
```

Per-kind required files: `package.json`, `cinatra/workflow.bpmn`, an optional `cinatra/dashboard.json`, and `src/index.ts`.

## The BPMN process

The process is authored against the **Cinatra BPMN Profile** — a constrained BPMN subset with `cinatra:` extension elements that map to a `WorkflowSpec`. See [Cinatra BPMN Profile 1.0](../cinatra-bpmn-profile.md) for the supported constructs, the extension elements, the BPMN→WorkflowSpec mapping, and the structured error catalog.

## What the kind contributes

The workflow install unit is a BPMN + sidecar package → a `workflow_template`, an optional `dashboard_template`, and workflow object types. It contributes the template and BPMN spec, agent tasks, approvals, schedule/dependency/retry/cancel policy, an optional dashboard sidecar, workflow/dashboard launcher and status portlets, and workflow object types. The runtime surface is the workflow runtime plus a DB-rendered dashboard when a sidecar is present. Uninstall/archive archives the dashboard template and instances; instantiated workflows embed snapshots so history survives.

## The four contracts (binding doctrine)

A workflow extension that materializes external artifacts or fires irreversible effects must define four contracts **before** any legacy surface it replaces is retired:

1. **Fan-out shape** — single-level `foreach` only; the README states the cardinality bound, the source of `{ items: [...] }`, and the per-item child template's own contracts. Nested foreach is rejected at validate-time.
2. **Artifact-binding contract** — every produced artifact is reachable via `workflow_artifact` rows linked to the producing task; the README lists the artifact kinds it produces and the agent that emits them.
3. **Approval gates** — tasks that fire irreversible effects (publish, send) must be preceded by an `approval` task in the template.
4. **Idempotency keys** — irreversible-effect tasks carry a stable idempotency key so a duplicate run cannot double-fire.

The binding doctrine — including the retirement gates and the worked example — is [Workflow extension doctrine](../workflow-extension-doctrine.md). Every workflow extension's UI is a `cinatra/dashboard.json` composing typed-registry portlets, never a bespoke React route tree — see [Workflow extensions as app surfaces](../workflow-extension-surfaces.md).

## Cross-kind concerns

The package shape, the `cinatra` manifest block, the `cinatra.dependencies` graph, the README contract, and the conformance gates are shared across all kinds — see the [Extension authoring hub](../../../guides/developer/extension-authoring.md). Ship through [Extension publishing](../../../guides/developer/extension-publishing.md).

## See also

- [Extension kinds — choose your kind](./)
- [Extensions hub](../extensions.md)
- [Dashboards platform](../dashboards-platform.md)
