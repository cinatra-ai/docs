# Cinatra BPMN Profile 1.0

> **Doctrine.** Workflow extensions author their template DAG as a `cinatra/workflow.bpmn` sidecar in **Cinatra BPMN Profile 1.0** — a deliberately narrow subset of BPMN 2.0 extended with a small set of `cinatra:`-namespaced elements. The compiler (`packages/workflows/src/bpmn/`) parses + validates the sidecar and produces a lossless `WorkflowSpec`. Inline JSON workflow definitions are forbidden.

Namespace: `xmlns:cinatra="http://cinatra.ai/schema/bpmn/profile-1.0"`.

## Supported BPMN constructs (locked set)

The profile accepts exactly these BPMN elements:

| BPMN element | WorkflowSpec mapping |
|---|---|
| `bpmn:process` | The workflow body. |
| `bpmn:startEvent` | Workflow start. |
| `bpmn:endEvent` | Workflow end. |
| `bpmn:userTask` | `TaskSpec` of `type:"checkpoint"` or `"approval"` (per `cinatra:taskKind`). |
| `bpmn:serviceTask` | `TaskSpec` of `type:"agent_task"` (per `cinatra:agentRef`). |
| `bpmn:manualTask` | `TaskSpec` of `type:"manual"`. |
| `bpmn:sendTask` | `TaskSpec` of `type:"send"` (notification body via `cinatra:messageBody`). |
| `bpmn:sequenceFlow` | Task dependency edge (`dependsOn`). |
| `bpmn:documentation` | Workflow `description`. |

Anything else (gateways, scriptTask, callActivity, intermediateCatchEvent, …) rejects with `bpmn_unsupported_construct`. The narrow set is intentional — the profile ships the smallest surface that covers real customer workflows; gateways and timer events are planned for later profile revisions.

## Cinatra extension elements (the 12)

These extension elements live under `<bpmn:extensionElements>` inside the process or each task:

| Element | Scope | Carries |
|---|---|---|
| `cinatra:workflowMeta` | process | `name`, `product` attributes (sometimes templated with `{{placeholder}}`). |
| `cinatra:placeholders` | process | container for `cinatra:placeholder` children. |
| `cinatra:placeholder` | process | `name`, `type` (`string`\|`number`\|`date`\|`boolean`), `required`, `description`, `default`. May carry a `cinatra:placeholderHint` child. |
| `cinatra:placeholderHint` | placeholder | `kind` attribute (drives the launcher's typed picker). |
| `cinatra:taskKind` | userTask | `value` (`"checkpoint"` or `"approval"`). |
| `cinatra:approvalConfig` | userTask (approval) | `level`, `rejectionPolicy`. |
| `cinatra:agentRef` | serviceTask | `package` / `name` / `version` / `templateId`. |
| `cinatra:taskInput` | serviceTask | JSON body (parsed; supports `{{placeholder}}`). |
| `cinatra:taskSchedule` | task | `mode`, `anchor`, `at`, `offsetIso8601`, `direction`, `localTime`, `tz`, `anchorPoint`, `durationIso8601`. |
| `cinatra:taskPolicy` | task | `failurePolicy`, `maxAttempts`. |
| `cinatra:messageBody` | sendTask | notification body (text; supports `{{placeholder}}`). |
| `cinatra:transitionOutcome` | sequenceFlow | `outcome` (e.g. `"success"`). |

## BPMN → WorkflowSpec mapping

The compiler walks the sidecar and emits a `WorkflowSpec`:

- `process @id` → `WorkflowSpec.key`.
- `bpmn:documentation` → `WorkflowSpec.description`.
- `cinatra:workflowMeta@product` → `WorkflowSpec.product`.
- `cinatra:placeholders/cinatra:placeholder[]` → `WorkflowSpec.placeholders: Record<name, PlaceholderDecl>`.
- Each `cinatra:placeholder/cinatra:placeholderHint@kind` → `WorkflowSpec.metadata.placeholderHints[name] = { kind }` (the launcher reads this to pick a typed picker).
- Each task → `TaskSpec` keyed by the BPMN id; type derived from BPMN element + `cinatra:taskKind`.
- Each sequenceFlow → `dependsOn` edge on the target task.

The mapping is **lossless** — round-tripping BPMN → spec → BPMN preserves every construct that the profile recognizes.

## Examples

- `extensions/cinatra-ai/blog-content-workflow/cinatra/workflow.bpmn` — a reference example: three required placeholders with typed hints (`blog-project` / `blog-post` / `wordpress-instance`), an approval gate, a serviceTask invoking the `@cinatra-ai/blog-wordpress-publish-agent`, a manualTask, and a sendTask notification.
- `extensions/cinatra-ai/major-release-workflow/cinatra/workflow.bpmn` — a second reference: a single string placeholder (`product`) and four tasks demonstrating `cinatra:taskSchedule` (absolute + relative).

## Error catalog (5 structured errors)

The install gate (`scripts/audit/workflow-bpmn-gate.mjs`) and the compiler emit exactly these structured errors:

| Code | Cause |
|---|---|
| `bpmn_unsupported_construct` | The sidecar contains a BPMN element outside the supported set (e.g. exclusiveGateway). |
| `bpmn_unsupported_workflowspec_field` | The compiler emitted a WorkflowSpec field the live engine does not accept (e.g. a TaskSpec property new to the BPMN profile but not yet in the engine schema). |
| `bpmn_sidecar_missing` | A workflow-kind extension package has no `cinatra/workflow.bpmn` file. |
| `bpmn_sidecar_duplicate` | A workflow-kind extension package ships more than one BPMN sidecar (e.g. both `cinatra/workflow.bpmn` and a stray copy). |
| `bpmn_inline_definition_forbidden` | `package.json` carries an inline `cinatra.workflow` JSON definition (no longer allowed). |

## See also

- [`workflow-extension-surfaces.md`](./workflow-extension-surfaces.md) — the operator-surface side (`cinatra/dashboard.json` + portlets).
- [`workflow-extension-doctrine.md`](./workflow-extension-doctrine.md) — workflow lifecycle invariants the profile encodes.
