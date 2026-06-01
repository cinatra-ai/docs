# Workflow extensions as app surfaces

> **Doctrine.** Every workflow extension's *operator surface* is a `cinatra/dashboard.json` composing typed-registry portlets — never a bespoke `/app/<extension>/page.tsx` route tree. Workflows supervise; dashboards expose. The two ship together in the same npm-shaped extension package.

## Three files, one extension

A workflow extension is exactly:

| File | Owns |
|---|---|
| `package.json` (`cinatra.kind:"workflow"`, integer `workflowVersion`) | Identity + install lifecycle + naming-conformance (dir ends `-workflow`, `@cinatra-ai` scope, `cinatra.apiVersion:"cinatra.ai/v1"`). |
| `cinatra/workflow.bpmn` (Cinatra BPMN Profile 1.0 sidecar) | Template DAG: placeholders, tasks (userTask/serviceTask/manualTask/sendTask), sequence flows, approval/agent-ref/messageBody extension elements. Compiled to `WorkflowSpec` at install. |
| `cinatra/dashboard.json` (`apiVersion:"v1.2"`) | Operator workspace: portlets at fixed slots, input/output wiring, scope. Materialized as a *template* dashboard + per-project *instance* dashboards on install. |

Inline JSON workflow definitions in `package.json` are **forbidden**; the sidecar is the single source.

## Portlets compose the operator surface

The typed portlet registry ships nine kinds at `1.0.0`:

| Kind | Purpose | Mutates? |
|---|---|---|
| `object-list` | List a `cinatra.objects` type, optional parent filter. | No |
| `object-detail` | Read-only detail for a selected object id. | No |
| `artifact-list` | List artifacts eligible for an extension. | No |
| `artifact-version-history` | Ref-swap timeline for one parent-object field. | No |
| `artifact-edit-text` | Author + ref-swap (e.g. blog post body). | Yes (object.update + refSwapPrimitive) |
| `artifact-edit-binary-prompt` | Baseline preview; interactive regen tied to a generation primitive. | Yes when wired |
| `workflow-launcher` | Instantiate a workflow template; renders typed pickers per placeholder hint. | Yes (workflow_template_instantiate; project-write-gated) |
| `agent-launcher` | Start an agent run. | Yes (agent_run; execute-gated) |
| `workflow-status` | Read-only status summary (single-workflow or project-scope). | No |

New kinds register into the typed registry; bespoke React routes for extension operator UI are not supported — register a portlet kind instead.

## Workflows supervise; agent flows materialize

A workflow's tasks observe state transitions and gate downstream actions (approvals, schedules, sendTasks). They **do not** produce canonical artifacts. Agent flows — dispatched by `serviceTask` agentRef or by user action through a launcher portlet — are the writers; they emit artifacts through the authoring recursion ledger (`artifact_authoring_emit`) and surface results via object-store rows that downstream portlets read.

## Scope inheritance: dashboard scope = workflow scope

A workflow extension's dashboard ships with `scopeLevel:"project"` (the common case). Materialization creates:
- one *template* dashboard per `(extension_id, organization_id)`;
- one *instance* dashboard per `(extension_id, organization_id, project_id)`.

The instance inherits the project's scope. Workflow rows instantiated from the launcher portlet are tagged with the same `workflow.project_id`: `workflow_template_instantiate` requires `assertProjectWriteAccess(actor, projectId, "write")` before any DB write — host-injected from `@/lib/workflow-host-deps`, shared by both the MCP server registration and the launcher's app server action.

## Kind + version validation at install

`assertConfigV12` (in `@cinatra-ai/dashboards` mutation-service) self-wires the typed registry on every install: it calls `registerCorePortletKinds()` (idempotent), passes `getPortletKindDescriptor` as the descriptor lookup, and walks every portlet's `validateConfig` per-kind. Unknown kinds, unknown versions, undeclared input/output keys, and per-kind config errors (e.g. `port_object_list_missing_type`, `port_edit_binary_invalid_config`, `port_workflow_status_missing_binding`) all reject at install.

## Scope leakage is the #1 risk

The portlet contract: **the client never sends a tenant/actor/scope.** Every loader + action re-derives the actor from session (`resolvePortletAuthz` for read; `resolvePortletPrimitiveActor` for mutating in-process clients), reads through actor-scoped store functions, and gates every effect at the resource touched — `enforceResourceAccess(...)` per-row for reads; `enforceResourceAccess(..., "object.update")` before any artifact emit; the host-injected `assertProjectWriteAccess` before workflow instantiation. The scope-leakage tests at `src/lib/dashboards/__tests__/portlet-*-scope.test.ts` lock the server seam.

## See also

- [`cinatra-bpmn-profile.md`](./cinatra-bpmn-profile.md) — the BPMN Profile 1.0 + WorkflowSpec mapping.
- [`workflow-extension-doctrine.md`](./workflow-extension-doctrine.md) — workflow lifecycle invariants.
