# Agent Spec — Compact OAS Flow (`oas.json`)

> See also: packages/agents/AGENTS.md — implementation details

> **Canonical filename:** The canonical on-disk path is
> `agents/<vendor>/<slug>/cinatra/oas.json`. The loader/handlers also
> recognise `agents/<slug>/cinatra/agent.json` and
> `agents/<slug>/agent.json` as transitional fallbacks, but all new agents
> MUST be written as `oas.json` in the vendor-namespaced path. Both the live
> Model Context Protocol (MCP) schemas and the runtime resolver (`resolveAgentJsonPath`) treat
> `oas.json` as the only canonical name. References to `agent.json` below
> are about example content, not the canonical on-disk filename.

The file content uses the compact Open Agent Specification (OAS) Flow 26.1.0 format. Root-level fields are now `agentspec_version: "26.1.0"` and `component_type: "Flow"`; all Cinatra-specific metadata lives under `metadata.cinatra`. This document is the canonical reference. The filename `agent-spec.md` is retained for link stability — the current format is NOT v2; it is OAS Flow. See the `## What Changed` table below for the full legacy → current mapping.

Related docs:
- `references/platform/agent-packaging.md` — layout conventions, templates, install paths
- `references/platform/ensure-agent-package.md` — startup scan + ZIP install mechanics
- `packages/agents/src/oas-compiler.ts` — live compiler (source of truth for derivation)
- `packages/agents/src/validate-agent-json.ts` — live validator (source of truth for rejection rules)
- `packages/agents/AGENTS.md` §OAS compiler — package-scoped reference

---

## What Changed (v2 → OAS Flow)

| v2 (nested) | OAS Flow (compact) |
|---|---|
| `componentType: "Agent"` at root | `component_type: "Flow"` at root |
| `metadata.cinatra.formatVersion: 2` | `agentspec_version: "26.1.0"` at root |
| `metadata.cinatra.inputSchema` (authored) | derived by compiler from `StartNode.inputs` |
| `metadata.cinatra.outputSchema` (authored) | derived by compiler from `EndNode.outputs` |
| `metadata.cinatra.prompt` (authored) | sourced from `Agent.system_prompt` component |
| `metadata.cinatra.taskSpec` (authored) | rejected — moved to SKILL.md / `Agent.system_prompt` |
| `metadata.cinatra.approvalPolicy` (authored) | derived from AgentNodes by compiler |
| `metadata.cinatra.compiledPlan` (authored) | rejected — always `[]`, produced at compile time |
| `validateAgentJsonV2()` | `validateOasAgentJson()` |
| `AgentJsonV2` type | DELETED |

---

## Full OAS Flow Shape

<!-- From agents/email-recipients/cinatra/agent.json (golden leaf reference) -->
```json
{
  "agentspec_version": "26.1.0",
  "component_type": "Flow",
  "id": "email-recipients-flow",
  "name": "Recipient Generator",
  "metadata": {
    "cinatra": {
      "type": "leaf",
      "hitlScreens": [
        "@cinatra-agents/email-outreach:contact-source-selector",
        "@cinatra-agents/email-recipients:output"
      ]
    }
  },
  "inputs": [
    { "title": "campaignId", "type": "string", "format": "uuid" },
    { "title": "accountScope", "type": "object" }
  ],
  "outputs": [
    { "title": "campaignId", "type": "string", "format": "uuid" },
    { "title": "recipientCount", "type": "integer" },
    { "title": "confirmedRecipients", "type": "array", "items": { "type": "object" } }
  ],
  "start_node": { "$component_ref": "start" },
  "nodes": [
    { "$component_ref": "start" },
    { "$component_ref": "generate" },
    { "$component_ref": "end" }
  ],
  "control_flow_connections": [
    {
      "component_type": "ControlFlowEdge",
      "name": "start_to_generate",
      "from_node": { "$component_ref": "start" },
      "to_node": { "$component_ref": "generate" }
    },
    {
      "component_type": "ControlFlowEdge",
      "name": "generate_to_end",
      "from_node": { "$component_ref": "generate" },
      "to_node": { "$component_ref": "end" }
    }
  ],
  "data_flow_connections": [
    {
      "component_type": "DataFlowEdge",
      "name": "start_to_generate_campaignId",
      "source_node": { "$component_ref": "start" },
      "source_output": "campaignId",
      "destination_node": { "$component_ref": "generate" },
      "destination_input": "campaignId"
    }
  ],
  "$referenced_components": {
    "start": {
      "component_type": "StartNode",
      "id": "start",
      "name": "Inputs",
      "metadata": {
        "cinatra": {
          "required": ["campaignId", "accountScope"],
          "hidden": ["campaignId"],
          "inputRenderers": {
            "accountScope": "@cinatra-agents/email-outreach:contact-source-selector"
          }
        }
      },
      "inputs": [
        { "title": "campaignId", "type": "string", "format": "uuid" },
        { "title": "accountScope", "type": "object" }
      ]
    },
    "generate": {
      "component_type": "AgentNode",
      "id": "generate",
      "name": "Generate recipient list",
      "metadata": {
        "cinatra": {
          "riskClass": "read_only",
          "requiresApproval": true,
          "renderer": "@cinatra-agents/email-recipients:output",
          "a2uiSurfaceId": "email-recipients:step-1:output"
        }
      },
      "agent": { "$component_ref": "agent-recipients" }
    },
    "end": {
      "component_type": "EndNode",
      "id": "end",
      "name": "End",
      "outputs": [
        { "title": "campaignId", "type": "string", "format": "uuid" },
        { "title": "recipientCount", "type": "integer" },
        { "title": "confirmedRecipients", "type": "array", "items": { "type": "object" } }
      ]
    },
    "agent-recipients": {
      "component_type": "Agent",
      "id": "agent-recipients",
      "name": "Recipient generator agent",
      "llm_config": { "$component_ref": "shared-llm-config" },
      "toolboxes": [{ "$component_ref": "cinatra-mcp-toolbox" }],
      "system_prompt": "You are a campaign recipient selection agent...",
      "metadata": {
        "cinatra": {
          "packageName": "@cinatra-agents/email-recipients"
        }
      }
    }
  }
}
```

---

## Field Reference

### Top-level fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `agentspec_version` | `"26.1.0"` (literal) | Yes | Anything else is rejected by `validateOasFlowStructural`. |
| `component_type` | `"Flow"` (literal) | Yes | Identifies the compact OAS envelope. |
| `id` | `string` | Yes | Stable human-readable id (convention: `<slug>-flow`). |
| `name` | `string` | Yes | Display name. |
| `metadata.cinatra.type` | `"leaf" \| "orchestrator"` | Yes | Determines compile topology. Other classifications (`proxy`, `parallel`, `supervisor`, `iterative`) are runtime concerns of the LangGraph type graphs, not the compiler. |
| `metadata.cinatra.hitlScreens` | `string[]` | No | Namespaced `@cinatra-agents/<slug>:<renderer-id>` ids of human-in-the-loop (HITL) renderers this agent may emit. |
| `inputs` | `PropertySchema[]` | Yes | Flat JSON Schema property list — compiler derives `inputSchema` from this + StartNode. |
| `outputs` | `PropertySchema[]` | Yes | Flat JSON Schema property list — compiler derives `outputSchema` from EndNode. |
| `start_node` | `{ $component_ref: string }` | Yes | Must resolve to a StartNode inside `$referenced_components`. |
| `nodes` | `{ $component_ref: string }[]` | Yes | All flow nodes (Start + all AgentNodes + End). Array order is NOT execution order — see BFS topology. |
| `control_flow_connections` | `ControlFlowEdge[]` | Yes | Compiler traverses these to derive step order. |
| `data_flow_connections` | `DataFlowEdge[]` | No | Compiler uses these to derive per-step `inputMapping`. |
| `$referenced_components` | `Record<string, unknown>` | Yes | Local component registry. Must contain exactly one StartNode and exactly one EndNode (validator cases 40, 41). |

### StartNode `metadata.cinatra` extensions

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `required` | `string[]` | No | Input ids that must be present in `agent_runs.inputParams` before the setup interrupt loop falls through to LangGraph dispatch. |
| `hidden` | `string[]` | No | Input ids suppressed from the setup form UI. Compiler still threads them into `inputSchema`. |
| `inputRenderers` | `Record<string, string>` | No | Maps input id → namespaced `x-renderer` id (e.g. `@cinatra-agents/email-outreach:cta`). |
| `inputTitles` | `Record<string, string>` | No | Human-readable label overrides per input id, shown in the setup UI. |

### AgentNode `metadata.cinatra` extensions

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `riskClass` | `string` | No | Surfaced as `step.riskClass` for UI risk badges (e.g. `"read_only"`, `"send_external_message"`). |
| `requiresApproval` | `boolean` | No | Drives HITL gate. Leaf defaults may apply via `mergeParentLeafCinatra`. |
| `renderer` | `string` | No | Namespaced `x-renderer` id; emitted as `step.xRenderer` in compiled output. |
| `a2uiSurfaceId` | `string` | No | agent-to-UI (A2UI) protocol catalog surface id. Emitted as `step.a2uiSurfaceId`. |
| `a2uiSurfaceIdOverride` | `string` | No | **Consumed by `mergeParentLeafCinatra`; never re-emitted in compiled output.** Only valid when `hitlOwnedBy === "childAgent"`. |
| `hitlOwnedBy` | `"childAgent" \| "self"` | No | Indicates which actor gates HITL. `"childAgent"` = defer to sub-agent's own approval policy; `"self"` = this step gates. |
| `description` | `string` | No | Prose shown in admin views. |

### Object type annotations

Cinatra agents may declare the object types they produce as output. The declaration is placed **inline on the output port** that carries the object's id, as a `cinatra` custom keyword directly on the JSON Schema property. This follows OAS 26.1.0 §6.3 which defines output ports as JSON Schema `Property` objects and permits custom keyword annotations inline.

**Schema** (snake_case in JSON, all fields except `object_type` are optional):

```typescript
outputs[*].cinatra?: {
  object_type: string;         // @scope/package:local-id (validated at compile time)
  display_name?: string;       // Human-readable label (defaults to port title)
  category?: "profile" | "content" | "project" | "idea" | "report"; // defaults to "report"
  canonical_keys?: string[];   // Identity-resolution keys for dedup
  identity_key?: string;       // Data field used as Graphiti dedup key (e.g. "cinatra_agent_run_id")
};
```

**Compile-time validation:**
1. Each `object_type` is validated against the namespace regex `/^@[\w-]+\/[\w-]+:[\w-]+$/`. Failed entries return `{ ok: false, error: ... }`.
2. Type IDs already registered statically by `@cinatra/*` packages are accepted; the install hook skips creating a duplicate dynamic row. A category mismatch with the static registration emits `console.warn` but does not fail compile.
3. Type IDs not statically registered are inserted into `cinatra.dynamic_object_types` at install time with `source: "install"`, `status: "active"`.

**Example (orchestrator outputting a campaign id):**

```json
{
  "metadata": {
    "cinatra": { "type": "orchestrator" }
  },
  "outputs": [
    {
      "title": "campaignId",
      "type": "string",
      "format": "uuid",
      "cinatra": {
        "object_type": "@cinatra/campaigns:campaign",
        "display_name": "Email Outreach Campaign",
        "category": "project",
        "canonical_keys": ["name", "offeringCompanyWebsite", "cinatraAgentRunId"],
        "identity_key": "cinatra_agent_run_id"
      }
    }
  ]
}
```

Lifecycle: classifier proposes → admin approves → MCP register → agent install registers.

---

## Validator Rules

Implemented in `packages/agents/src/validate-agent-json.ts` (`validateOasAgentJson`):

1. `validateOasFlowStructural` — Zod parse of flowSchema (agentspec_version=26.1.0, component_type=Flow, required arrays).
2. Root-level legacy field rejection: `componentType` (leftover from v2).
3. `metadata.cinatra` legacy-field rejection: `formatVersion`, `executionMode`, `approvalPolicy`, `compiledPlan`, `inputSchema`, `outputSchema`, `prompt`, `taskSpec`.
4. Per-AgentNode semantic checks: `hitlOwnedBy ∈ {childAgent, self}`, `a2uiSurfaceIdOverride` only valid when `hitlOwnedBy === "childAgent"`, `requiresApproval` boolean.
5. Case 38 — every `$component_ref` resolves locally OR against the known global registry ids (`shared-llm-config`, `cinatra-mcp-toolbox`, `a2a-default-connection`).
6. Case 39 — no duplicate node ids in the `nodes` array.
7. Case 40 — exactly one `StartNode` in `$referenced_components`.
8. Case 41 — exactly one `EndNode` in `$referenced_components`.

---

## Component Registry (Two-Tier Lookup)

Component references (`{ "$component_ref": "<id>" }`) resolve through a two-tier lookup: first against the flow's local `$referenced_components` map, then against the global registry at `agents/_shared/cinatra/components.json`. An unresolved id throws; cycles throw too (the walker tracks `visited` per resolution pass).

| Tier | Source | Behavior on miss |
|------|--------|------------------|
| 1 — Local | `parsed.$referenced_components` | Fall through to tier 2 |
| 2 — Global | `agents/_shared/cinatra/components.json` | Throw `unresolved component ref: {id}` |
| (cycle) | `visited: Set<string>` per walk | Throw `cycle detected at component id {id}` |

```typescript
// From packages/agents/src/oas-compiler.ts:223-238
function resolveComponentRef(
  id: string,
  localRefs: Record<string, unknown>,
  globalRegistry: Record<string, unknown>,
  visited: Set<string>,
): Record<string, unknown> {
  if (visited.has(id)) throw new Error(`cycle detected at component id ${id}`);
  visited.add(id);
  const local = localRefs[id];
  if (local && typeof local === "object") return local as Record<string, unknown>;
  const global = globalRegistry[id];
  if (global && typeof global === "object") return global as Record<string, unknown>;
  throw new Error(
    `unresolved component ref: ${id} (looked in local $referenced_components and global registry)`,
  );
}
```

<!-- From agents/_shared/cinatra/components.json -->
```json
{
  "$schema": "/schemas/cinatra/oas-component-registry.schema.json",
  "agentspec_version": "26.1.0",
  "components": {
    "shared-llm-config": {
      "component_type": "OpenAiConfig",
      "id": "shared-llm-config",
      "name": "Shared LLM config",
      "model_id": "gpt-4o",
      "api_type": "chat_completions",
      "metadata": { "cinatra": { "resolvedAtRuntime": true } }
    },
    "cinatra-mcp-toolbox": {
      "component_type": "MCPToolBox",
      "id": "cinatra-mcp-toolbox",
      "name": "Cinatra MCP Server",
      "metadata": { "cinatra": { "resolvedAtRuntime": true } },
      "client_transport": {
        "component_type": "StreamableHTTPTransport",
        "id": "cinatra-mcp-transport",
        "name": "Cinatra MCP transport",
        "url": "/api/mcp"
      }
    },
    "a2a-default-connection": {
      "component_type": "A2AConnectionConfig",
      "id": "a2a-default-connection",
      "name": "Default A2A connection",
      "timeout": 600,
      "verify": true
    }
  }
}
```

**Do not add per-package `components.json` files.** Package-specific `Agent` / `A2AAgent` / `ServerTool` components live under each `agent.json`'s `$referenced_components` map. Only truly shared infrastructure (large language model (LLM) config, MCP toolbox, agent-to-agent (A2A) protocol connection) lives in the global registry.

---

## BFS Topology

Step order follows breadth-first search (BFS) from `start_node` via `control_flow_connections`, NOT the `parsed.nodes` array index (peer-review fix #2). The compiler:

- Builds an adjacency map from `control_flow_connections` (`from_node.$component_ref` → `to_node.$component_ref`).
- Deduplicates identical `(from, to)` edges inline (`oas-compiler.ts:495`) so queue operations are not wasted and step ordering is not muddled.
- Seeds the BFS queue from `parsed.start_node.$component_ref`.
- Appends any disconnected nodes in array order as a safety net (`oas-compiler.ts:511`); the structural validator should reject the upstream condition before compile is reached.
- Assigns `stepNumber` 1-indexed across the BFS-ordered AgentNodes only — `StartNode` and `EndNode` are never steps.

The BFS topology guarantees that adding a new linear leaf or re-ordering the `nodes` array does not change emitted step order: only the control_flow graph shape determines step sequence.

---

## Compiled Output (CompiledAgentOas)

`compileOasAgentJson` returns a discriminated union (peer-review fix #1) — callers branch on `.ok` instead of the legacy null-or-throw mix:

```typescript
// From packages/agents/src/oas-compiler.ts:386-397
export type CompiledAgentOas = {
  approvalPolicy: { steps: CompiledAgentOasStep[] };
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown> | null;
  prompt: string | null;
  packageName: string | null;
  packageVersion: string | null;
  agentDependencies: Record<string, string>;
  type: "leaf" | "orchestrator";
  compiledPlan: [];
  hitlScreens: string[];
};
```

```typescript
// From packages/agents/src/oas-compiler.ts:371-384
export type CompiledAgentOasStep = {
  stepNumber: number;
  riskClass?: string;
  requiresApproval: boolean;
  xRenderer?: string;
  description?: string;
  name?: string;
  a2uiSurfaceId?: string;
  hitlOwnedBy?: "childAgent" | "self";
  childAgent?: {
    packageName: string;
    inputMapping: Record<string, string>;
  };
};
```

The `CompileOasResult` union has two branches:

```typescript
// From packages/agents/src/oas-compiler.ts:400-402
export type CompileOasResult =
  | { ok: true; value: CompiledAgentOas }
  | { ok: false; error: string };
```

---

## Reference Files

| Role | Path |
|------|------|
| Orchestrator | `agents/email-outreach/cinatra/agent.json` |
| Leaf | `agents/email-recipients/cinatra/agent.json` |
| Leaf | `agents/email-drafts/cinatra/agent.json` |
| Leaf | `agents/email-reviewer/cinatra/agent.json` |
| Leaf | `agents/email-sender/cinatra/agent.json` |
| Global registry | `agents/_shared/cinatra/components.json` |
| Compiler source | `packages/agents/src/oas-compiler.ts` |
| Validator source | `packages/agents/src/validate-agent-json.ts` |
