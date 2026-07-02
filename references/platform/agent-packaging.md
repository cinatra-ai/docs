# Agent Packaging — Canonical Conventions

This document defines the canonical rules for Cinatra agent packaging. Every first-party agent (each shipped as its own git repository, not committed inside the `cinatra` monorepo — see [Developing agents](../../guides/developer/developing-agents.md#where-agents-live)) MUST follow these rules. When in doubt, prefer the reference packages at `github.com/cinatra-ai/email-outreach-agent`, `email-recipient-selection-agent`, `email-drafting-agent`, `reviewer-agent`, `email-delivery-agent` — they are the golden examples for the compact Open Agent Specification (OAS) Flow 26.1.0 shape and vendor-namespaced layout. In a dev checkout they are materialized under `extensions/cinatra-ai/<slug>-agent/`.

> **Canonical filename:** The current canonical path is `extensions/<vendor>/<slug>/cinatra/oas.json` on disk (each `<slug>` is an independent extension package/git repo; `<vendor>` for first-party Cinatra agents is `cinatra-ai`). Legacy filenames (`agent.json` at either depth) are still resolved by the loader for transitional packages, but new agents MUST be written as `oas.json`. Wherever this document continues to reference `agent.json`, treat it as the OAS Flow descriptor under its current canonical filename.

> **OAS Flow content format:** All agents use the compact OAS Flow 26.1.0 format (`agentspec_version: "26.1.0"`, `component_type: "Flow"`). See [references/platform/agent-spec.md](./agent-spec.md) for the full field inventory and validator rules.

Related docs:
- `guides/developer/agent-development.md` — 14 behavioral rules (taskSpec, SKILL.md, human-in-the-loop (HITL), etc.)
- `references/platform/ensure-agent-package.md` — startup scan + ZIP install mechanics

## Directory Layout

Every agent is its **own extension package** (its own git repository), materialized on disk under the install directory (`extensions/` by default) at a vendor-namespaced path:

```
extensions/
└── cinatra-ai/                            # vendor namespace (npm scope, minus the @)
    └── <slug>-agent/                      # one repo per agent; kind suffix required
        ├── package.json                   # npm manifest — name: "@cinatra-ai/<slug>-agent"
        ├── cinatra/
        │   └── oas.json                   # compact OAS Flow 26.1.0 runtime descriptor (ZIP install reads this)
        └── skills/<slug>/
            └── SKILL.md                   # behavioral spec (frontmatter + taskSpec)
```

Multi-agent families (orchestrator + leaves) are represented as sibling independent packages (sibling git repos), NOT as nested subdirectories of one another. Example from the email-outreach family (each a separate `github.com/cinatra-ai/<name>` repo):

```
extensions/cinatra-ai/
├── email-outreach-agent/              # orchestrator
├── email-recipient-selection-agent/   # leaf
├── email-drafting-agent/              # leaf
├── reviewer-agent/                    # leaf
└── email-delivery-agent/              # leaf
```

## CONV-01 — Flat layout within the vendor namespace

Every agent extension lives at `extensions/<vendor>/<slug>/`. Never `extensions/<vendor>/<domain>/<slug>/`, never any deeper nesting — one agent package per vendor-namespaced directory.

**Why:** Keeping agents at one level under their vendor namespace keeps `grep -r "<slug>" extensions/` a single-hop search and avoids the ambiguity of "which domain does this belong in?" when an agent could reasonably belong to several.

**Enforced by:** the extension naming-conformance gate (directory name == unscoped package name, kind suffix at the end) plus code review for the rest. Watch for changes that introduce an extra subdirectory level under a vendor namespace.

> **Dev-mode only — narrowly.** The git-native ingest scan in `src/instrumentation.node.ts` (re-deriving `agent_templates` from whatever is on disk) runs exclusively when `CINATRA_RUNTIME_MODE=development`. In production, agents are installed through the `agent_builder_git_publish` / MCP install primitives, or `cinatra instance setup prod` at provisioning time — not by re-importing the on-disk tree the way this dev-only scan does. (A prod boot separately runs its own on-disk reconciliation — a fail-closed required-extension materialize phase plus an always-on marker self-heal phase — see [`developing-agents.md`](../../guides/developer/developing-agents.md) for the distinction.)

## CONV-02 — Role-noun slug

The package slug names the role the agent plays — what the agent IS — not where it sits in a workflow.

**MUST NOT contain:**
- Step numbers: `stage-1`, `stage-2`, `step-3`
- Positional qualifiers: `-orchestrator`, `-child`, `-handler`
- Workflow names as prefixes when they force coupling (e.g. `<workflow>-stage-2-recipients`) — the prefix couples the agent to exactly one workflow

**SHOULD be:**
- A role noun describing what the agent IS: `author`, `planner`, `code-reviewer`, `security-reviewer`, `lint-policy`, `skill-recommender`, `email-reviewer`, `email-sender`
- Short (2-3 words) and reusable across workflows

**Why:** A positional slug asserts which orchestrator uses the agent. Role-noun slugs make agents reusable, keep rename pressure low when a workflow's shape changes, and read naturally in agent-card lists and chat dispatches ("the code-reviewer agent did X").

## CONV-03 — Leaf vs. orchestrator boundary

Setup/initialization steps that are **not independently reusable** are inlined into the orchestrator's SKILL.md — they do NOT ship as separate packages.

**Test:** Would this agent be useful to call from a different orchestrator or directly via `agent_run`? If no, it belongs inline.

**Example:** An init-only setup leaf that creates the campaign record, derives offering context, and persists sender config belongs inline when none of those steps make sense outside the email-outreach workflow.

**When in doubt:** default to inlining. Extracting an init step later is cheaper than recalling an over-shipped package.

## CONV-04 — Dependency declaration: `cinatra.dependencies[]` and `cinatra.agentDependencies`

Every agent package — leaf or orchestrator — carries a `cinatra` block with at least `apiVersion`, `kind: "agent"`, and a `dependencies` array (empty `[]` for a leaf with no children; this is required by the naming-conformance and install/activation gates, not omitted). Never put agent-to-agent (or agent-to-connector) edges in npm's own top-level `package.json.dependencies` — the package-contract schema at `packages/agents/src/verdaccio/package-contract.ts` rejects a top-level `dependencies` field on publish.

`cinatra.dependencies[]` is the canonical cross-kind dependency graph shared by all five extension kinds (see [Extension authoring](../../guides/developer/extension-authoring.md#cinatradependencies--capability-based-required-vs-optional)) — every real agent package declares its children here, `kind: "agent"` and `requirement: "required"` for a hard child dependency.

`cinatra.agentDependencies` is a **separate, older map** (`{ "@cinatra-ai/<child-slug>-agent": "<semver-range>" }`) that some agent packages additionally carry. It matters for exactly one consumer: `cinatra agents install`'s registry-based transitive resolver, which reads `cinatra.agentDependencies` (not `dependencies[]`) to walk the child-agent tree (`cinatra-cli`'s `src/agents-install.mjs`: `const childDeps = m.cinatra?.agentDependencies ?? {}`). It is not universally present on real orchestrators today (the reference `email-outreach-agent` package, for instance, declares its 7 children only via `dependencies[]` and has no `agentDependencies` map) — if you ship an agent meant to be installed via `cinatra agents install`, populate `agentDependencies` alongside `dependencies[]` for the same children; otherwise `dependencies[]` alone is sufficient for the cross-kind install/activation contract.

### Leaf `package.json` template

```json
{
  "name": "@cinatra-ai/<slug>-agent",
  "version": "0.1.0",
  "license": "Apache-2.0",
  "description": "<role-noun description — no 'Stage N' prefix>",
  "type": "module",
  "files": ["cinatra", "skills"],
  "cinatra": {
    "apiVersion": "cinatra.ai/v1",
    "kind": "agent",
    "dependencies": []
  }
}
```

A leaf with a real child (e.g. a delivery step it hands off to) declares that child in `dependencies[]` (see the Orchestrator template below for the shape) — CONV-03 governs whether a given step should be its own package at all.

Reference: `github.com/cinatra-ai/context-selection-agent` (`package.json`) for a true zero-dependency leaf.

### Orchestrator `package.json` template

```json
{
  "name": "@cinatra-ai/<slug>-agent",
  "version": "0.1.0",
  "license": "Apache-2.0",
  "description": "<workflow description>",
  "type": "module",
  "files": ["cinatra", "skills"],
  "cinatra": {
    "apiVersion": "cinatra.ai/v1",
    "kind": "agent",
    "dependencies": [
      {
        "packageName": "@cinatra-ai/<child-slug>-agent",
        "kind": "agent",
        "edgeType": "runtime",
        "versionConstraint": { "kind": "exact", "version": "0.1.0" },
        "requirement": "required"
      }
    ],
    "agentDependencies": {
      "@cinatra-ai/<child-slug>-agent": "^0.1.0"
    }
  }
}
```

`agentDependencies` here is optional (see above) — include it if the package should be installable via `cinatra agents install`.

Reference: `github.com/cinatra-ai/email-outreach-agent` (`package.json`).

### Leaf `agent.json` template

> **Compact OAS Flow 26.1.0 shape**. Root-level fields are `agentspec_version`, `component_type`, `id`, `name`, `metadata`, `inputs`, `outputs`, `start_node`, `nodes`, `control_flow_connections`, `data_flow_connections`, `$referenced_components`. All Cinatra-specific fields nest under `metadata.cinatra` and under per-node `metadata.cinatra` extensions. See [references/platform/agent-spec.md](./agent-spec.md) for the full field inventory and validator rules.

<!-- Structural template derived from github.com/cinatra-ai/email-recipient-selection-agent's cinatra/oas.json -->
```json
{
  "agentspec_version": "26.1.0",
  "component_type": "Flow",
  "id": "<slug>-flow",
  "name": "<Display Name>",
  "metadata": {
    "cinatra": {
      "type": "leaf",
      "hitlScreens": []
    }
  },
  "inputs": [
    { "title": "<input-id>", "type": "string", "description": "<what this is>" }
  ],
  "outputs": [
    { "title": "<output-id>", "type": "string", "description": "<what this is>" }
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
      "name": "start_input_to_generate",
      "source_node": { "$component_ref": "start" },
      "source_output": "<input-id>",
      "destination_node": { "$component_ref": "generate" },
      "destination_input": "<input-id>"
    },
    {
      "component_type": "DataFlowEdge",
      "name": "generate_output_to_end",
      "source_node": { "$component_ref": "generate" },
      "source_output": "<output-id>",
      "destination_node": { "$component_ref": "end" },
      "destination_input": "<output-id>"
    }
  ],
  "$referenced_components": {
    "start": {
      "component_type": "StartNode",
      "id": "start",
      "name": "<Start name>",
      "inputs": [
        { "title": "<input-id>", "type": "string" }
      ]
    },
    "generate": {
      "component_type": "AgentNode",
      "id": "generate",
      "name": "<Step name>",
      "metadata": { "cinatra": { "riskClass": "read_only", "requiresApproval": false } },
      "agent": { "$component_ref": "generate-agent" }
    },
    "generate-agent": {
      "component_type": "Agent",
      "id": "generate-agent",
      "name": "<Agent name>",
      "system_prompt": "<Short role summary; full behavior lives in SKILL.md>",
      "llm_config": { "$component_ref": "shared-llm-config" },
      "toolbox": { "$component_ref": "cinatra-mcp-toolbox" }
    },
    "end": {
      "component_type": "EndNode",
      "id": "end",
      "name": "<End name>",
      "outputs": [
        { "title": "<output-id>", "type": "string" }
      ]
    }
  }
}
```

No `agentDependencies` key (that lives in `package.json` — see CONV-04). Most current agents also set `metadata.cinatra.packageName` (matching `package.json#name`) — see [CONV-05 § Package identity](#conv-05--agentjson-runtime-fields) for why. Reference: `github.com/cinatra-ai/email-recipient-selection-agent` (`cinatra/oas.json`).

## CONV-05 — agent.json runtime fields

> **Compact OAS Flow 26.1.0 shape**. Root-level fields are `agentspec_version`, `component_type`, `id`, `name`, `metadata`, `inputs`, `outputs`, `start_node`, `nodes`, `control_flow_connections`, `data_flow_connections`, `$referenced_components`. Cinatra-specific fields nest under `metadata.cinatra` at the flow level and under per-node `metadata.cinatra` extensions. See [references/platform/agent-spec.md](./agent-spec.md) for the full spec.

The table below enumerates every field path in `agent.json` (OAS Flow), whether the install path reads it, and whether it is duplicated elsewhere.

| agent.json path | Type | Active/Redundant | Notes |
|-----------------|------|------------------|-------|
| `agentspec_version` | `"26.1.0"` (literal) | Active | Top-level literal. Required by `validateOasFlowStructural`. |
| `component_type` | `"Flow"` (literal) | Active | Top-level literal. Replaces legacy `componentType: "Agent"` (rejected). |
| `id` | string | Active | Stable human-readable id (convention: `<slug>-flow`). Install generates a new DB UUID separately. |
| `name` | string | Active | Display label. |
| `metadata.cinatra.type` | `"leaf" \| "orchestrator"` | Active | Drives compile topology. |
| `metadata.cinatra.hitlScreens` | `string[]` | Active | Namespaced `x-renderer` ids this agent may emit. Use `[]` when none. |
| `inputs` | `PropertySchema[]` | Active | Flat JSON Schema property list — compiler derives `inputSchema`. |
| `outputs` | `PropertySchema[]` | Active | Flat JSON Schema property list — compiler derives `outputSchema`. |
| `start_node` | `{ $component_ref: string }` | Active | Must resolve to a StartNode in `$referenced_components`. |
| `nodes` | `{ $component_ref: string }[]` | Active | All flow nodes. Array order is NOT execution order — BFS from `start_node` determines step sequence. |
| `control_flow_connections` | `ControlFlowEdge[]` | Active | Compiler traverses these to derive step order. |
| `data_flow_connections` | `DataFlowEdge[]` | Active (optional) | Compiler uses these to derive per-step `inputMapping`. |
| `$referenced_components` | `Record<string, unknown>` | Active | Local component registry (StartNode, AgentNodes, EndNode, Agent, A2AAgent stubs). |

**Compiler-derived — do not author (rejected by validator):** `metadata.cinatra.inputSchema` (derived from `StartNode.inputs`), `metadata.cinatra.outputSchema` (derived from `EndNode.outputs`), `metadata.cinatra.prompt` (sourced from `Agent.system_prompt`), `metadata.cinatra.approvalPolicy` (derived from AgentNodes), `metadata.cinatra.compiledPlan` (always `[]`), `metadata.cinatra.taskSpec` (moved to SKILL.md).

**Package identity — version is package.json-only; name may also be authored in the OAS file.** `metadata.cinatra.packageVersion` resolves solely from the sibling `package.json#version` — never author it in `oas.json`. `metadata.cinatra.packageName`, however, is still commonly authored in `oas.json` (every current first-party agent's `oas.json` carries it) and, when present, **takes precedence over** the sibling `package.json#name` at import time (`cinatraPackageName ?? sibling?.name` in `ensureAgentPackageFromGitFile`) — so keep the two in sync rather than treating one as dead.

**Dependencies:** declared entirely in the sibling `package.json` (`cinatra.dependencies[]`, plus `cinatra.agentDependencies` if the package needs to be `cinatra agents install`-able) — see CONV-04. Nothing about dependencies is authored in `agent.json`/`oas.json` itself.

### Legacy Fields (rejected by validator)

The following v2-era fields are rejected by `validateOasAgentJson` and must not appear in an OAS Flow `agent.json`:
- `componentType` (at root) — replaced by `component_type: "Flow"`
- `metadata.cinatra.formatVersion` — replaced by root `agentspec_version`
- `metadata.cinatra.executionMode`
- `metadata.cinatra.inputSchema` (as authored) — compiler-derived
- `metadata.cinatra.outputSchema` (as authored) — compiler-derived
- `metadata.cinatra.prompt` (as authored) — sourced from `Agent.system_prompt`
- `metadata.cinatra.taskSpec` — moved to SKILL.md
- `metadata.cinatra.approvalPolicy` (as authored) — derived from AgentNodes
- `metadata.cinatra.compiledPlan` (as authored) — always `[]`, produced at compile time

## Two Install Paths

### 1. Registry install — `cinatra agents install`

```bash
cinatra agents install "@cinatra-ai/<slug>-agent@^<range>"
```

Resolves via `pacote.manifest()` against the configured registry (Verdaccio (an npm-compatible registry) under the hood). Walks `cinatra.agentDependencies` transitively, writes `cinatra-agents.lock`, extracts each tarball, upserts `cinatra.agent_templates` + `cinatra.agent_versions`. Requires a live registry (Verdaccio under the hood).

Primary path for production/prod-like installs. Produces a lockfile consumers can commit.

### 2. ZIP install — `ensureAgentPackageFromGitFile`

At server start, `src/instrumentation.node.ts` scans the agent install directory (`extensions/` by default; see [Configuring the agent install path](../../guides/developer/developing-agents.md#configuring-the-agent-install-path)), reads each `oas.json`/`agent.json`, and calls `importAgentTemplate(zipBase64)` for each. Parses in-memory; upserts the same DB tables; does NOT require a registry (Verdaccio under the hood) and does NOT produce a lockfile.

Primary path for local dev — the files cloned into the install directory (from each agent's own git repo) are the source of truth. See `references/platform/ensure-agent-package.md` for details.

Both paths ultimately converge on `importAgentTemplateCore` in `packages/agents/src/import-agent-core.ts`.

## SKILL.md Rules

Every agent has a `SKILL.md` at `<installDir>/<vendor>/<slug>/skills/<slug>/SKILL.md`. Frontmatter requires `name:` and `description:`. Body describes the behavior in executable prose. See `guides/developer/agent-development.md` for the 14 canonical rules governing SKILL.md content (self-containment, `## What I retrieve myself (MCP)` section, no inline skill content, etc.).

## cinatra/ Sidecar

The `cinatra/` directory under each agent extension holds the runtime descriptor:
- `cinatra/agent.json` — compact OAS Flow 26.1.0 runtime descriptor (see "Leaf `agent.json` template" above).

> **Note:** A `cinatra/mcp.json` manifest used to declare MCP transport + required primitives, but the convention was removed (no runtime consumer; agent SKILL.md governs which primitives the large language model (LLM) may call). The `agent_source_write_files` handler still normalizes incoming `mcp.json` shapes for backwards-compat with older callers, but the file is no longer written or shipped with new agents.

## Anti-Patterns

Do not:

1. **Nest agents under domain subdirectories** — violates CONV-01. If multiple agents share a family, give them sibling flat slugs.
2. **Use positional slugs** (`stage-N-purpose`, `-orchestrator`, `-child`) — violates CONV-02. Name by function.
3. **Ship init-only leaves** (steps with no callers besides a single orchestrator) — violates CONV-03. Inline into the orchestrator's SKILL.md.
4. **List child agents in top-level `package.json.dependencies`** — violates CONV-04; the package contract rejects a top-level `dependencies` field at publish time. Declare children in `cinatra.dependencies[]` (and `cinatra.agentDependencies` if the package should be `cinatra agents install`-able).
5. **Let `cinatra.agentDependencies` drift out of sync with `cinatra.dependencies[]`** for the same children, when both are present — CONV-04.
6. **Let `package.json.name` and `metadata.cinatra.packageName` drift apart** — they MUST match. Edit both when renaming.

## Reference Family — Email Outreach

The canonical reference implementation for this document is the email-outreach family — each a separate `github.com/cinatra-ai/<slug>` repository, materialized in a dev checkout under `extensions/cinatra-ai/`:

| Role | Repo / dev-checkout path | Scoped name |
|------|---------------------------|-------------|
| Orchestrator | `email-outreach-agent` | `@cinatra-ai/email-outreach-agent` |
| Leaf | `email-recipient-selection-agent` | `@cinatra-ai/email-recipient-selection-agent` |
| Leaf | `email-drafting-agent` | `@cinatra-ai/email-drafting-agent` |
| Leaf | `reviewer-agent` | `@cinatra-ai/reviewer-agent` |
| Leaf | `email-delivery-agent` | `@cinatra-ai/email-delivery-agent` |

## Relationship Between Code and Agent Extensions

Agent extensions (independent git repos, materialized under `extensions/`) and code packages (`packages/` in this monorepo) are independent artifacts. Neither nests inside the other, even when they share a domain name (e.g. `campaign-email-outreach`).

| Aspect | Code package (`packages/`) | Agent extension (`extensions/<vendor>/<slug>/`) |
|---|---|---|
| Location | `packages/<name>/` (this monorepo) | Its own git repo, cloned into `extensions/<vendor>/<slug>/` |
| Purpose | TypeScript implementation | Agent behavior + identity |
| npm scope | `@cinatra-ai/` | `@cinatra-ai/` (slug ends in `-agent`) |
| Distribution | pnpm workspace | registry (Verdaccio under the hood) |
| SKILL.md | None (code packages don't need one) | `SKILL.md` under `skills/<slug>/` |
| DB record | None | `agent_templates` row |
| Relationship | May implement the same domain | May call code package MCP primitives |

The orchestrator's `cinatra.agentDependencies` lists its leaves and should use registry-published semver ranges aligned with the leaf package versions.

---

## WayFlow A2A Runtime Constraints

These constraints apply to every `agent.json` that will be served via the A2AServer of WayFlow (Cinatra's OAS Flow agent runtime). Violating any of these causes silent failures (task state `failed` with no visible traceback) or produces incorrect HITL behavior.

### Loading

Use `wayflowcore.agentspec.AgentSpecLoader.load_json(spec_str)` — **not** `pyagentspec.AgentSpecDeserializer().from_dict(dict)`. `AgentSpecDeserializer` returns Pydantic data models. `A2AServer.serve_agent()` requires a `wayflowcore.ConversationalComponent` (runtime object). Only `AgentSpecLoader` performs that conversion.

### Flow-level inputs must have defaults

`A2AAgentWorker.run_task()` calls `flow.start_conversation()` with no `inputs` argument. Any Flow input declared without a `"default"` field raises:

```
ValueError: Cannot start conversation because of missing inputs "campaignId"
```

**Rule:** Every Flow-level input whose value comes from context (not collected interactively) must declare `"default": ""` (or an appropriate empty value). Inputs collected by an `InputMessageNode` during the conversation do NOT need a default.

### MCPToolBox URLs must be absolute

WayFlow resolves MCPToolBox `url` at agent execution time via `httpx`. Relative paths (`/api/mcp`) fail:

```
httpx.UnsupportedProtocol: Request URL is missing an 'http://' or 'https://' protocol
```

**Rule:** Always use a fully-qualified URL. In Docker Compose: `http://host.docker.internal:3000/api/mcp`. In production: derive from `CINATRA_BASE_URL` at container startup.

### `input-required` is multi-turn, not first-turn

`A2AAgentWorker` runs a Flow containing an `InputMessageNode` in two passes within a single `run_task()` call:

1. Pre-execute: Start → InputMessageNode → pauses (returns `UserMessageRequestStatus`).
2. User message is immediately appended by the worker.
3. Second execute: InputMessageNode processes the user message → continues to AgentNode.

The agent-to-agent (A2A) protocol task state `input-required` is only emitted if a **second** `InputMessageNode` is reached after step 3. A Flow with a single `InputMessageNode` at the top completes in one `run_task()` without ever emitting `input-required`.

**Rule (current — May 2026 onward):** To produce `pending_approval` in Cinatra's state machine (which detects `input-required`), add a **second** `InputMessageNode` (e.g. `approval_gate`) **after** the `AgentNode`. The OAS spec mandates that `InputMessageNode` declares **exactly one string output** named `userResponse`, and **no `inputs[]` field** (the spec rejects user-defined inputs on this node — the only way to template upstream data into the prompt is via the `message` parameter). Wire `approval_gate.userResponse → end.userResponse` via `DataFlowEdge`. Renderers carrying structured form data MUST send `{ ...payload, userResponse: JSON.stringify(payload) }` so Cinatra's `approveReviewTaskInternal` forwards `userResponse` verbatim as the InputMessageNode's user-message text; downstream nodes (typically an `ApiNode` with an LLM bridge) parse the JSON.

> **Invalid shape:** Do not wire an `approvalDecision` output or optional `editedBundle` output. That shape is invalid per OAS spec strict validation: an `InputMessageNode` may only have one string output. Use `userResponse` for structured HITL form values.

### `accountScope` and similar UI-collected fields must not be in `inputSchema.required`

Cinatra's setup interrupt loop in `execution.ts` fires **before** the WayFlow dispatch branch. If `accountScope` (or any field the WayFlow `InputMessageNode` is meant to collect) appears in `inputSchema.required` in the DB template, the setup loop pauses the run at `pending_approval` before WayFlow is ever reached.

**Rule:** Remove UI-form fields (those with `inputRenderers` in `metadata.cinatra`) from `inputSchema.required`. They must be optional in the DB template's `inputSchema`. WayFlow's `InputMessageNode` enforces their collection at runtime.

### A2A `message/send` format

```json
{
  "jsonrpc": "2.0", "id": "...", "method": "message/send",
  "params": {
    "message": {
      "kind": "message",
      "role": "user",
      "messageId": "...",
      "parts": [{"kind": "text", "text": "..."}]
    }
  }
}
```

- Parts use `"kind": "text"`, not `"type": "text"`.
- Message requires `"kind": "message"`.
- `messageId` in JSON → `message_id` in Python dict (pydantic camelCase alias).
- `method: "message/stream"` is **not implemented** by `A2AServer` — always use `"message/send"`.

### Multi-tenant WayFlow runtime

The multi-tenant WayFlow runtime uses a single Starlette parent app that mounts one isolated `A2AServer` ASGI sub-app per agent at `/agents/<vendor>/<slug>/`. While `A2AServer.serve_agent()` is still last-writer-wins **within a single instance**, distinct instances are constructed per agent and mounted at distinct paths, so the runtime hosts every installed agent in one container. See `docker/wayflow/agent_loader.py` for the loader implementation.

Configuration uses a single env var, `WAYFLOW_BASE_URL` (default `http://localhost:3010`). New agents become reachable on container restart after they appear on disk at `extensions/<vendor>/<slug>/cinatra/oas.json` — the WayFlow container mounts that directory read-only at `/agents` (`CINATRA_AGENTS_DIR`), so no `.env.local` edit or per-agent container config is required.

### `execution.ts` agentUrl

The WayFlow dispatch branch must use `wayflowUrl` directly — not `${wayflowUrl}/agents/${slug}`. The agent card endpoint is `GET {wayflowUrl}/.well-known/agent-card.json`. The slug-based path does not exist on `A2AServer`.

### `A2AAgent` `agent_url` must use `{{CINATRA_BASE_URL}}` placeholder — never hardcoded ports

`A2AAgent` components in `agent.json` call peer WayFlow containers via their `agent_url` field. The correct form is always:

```json
{ "agent_url": "{{CINATRA_BASE_URL}}/api/a2a/agents/cinatra-ai/email-recipient-selection-agent" }
```

**Rule:** Never hardcode ports (`http://host.docker.internal:3010`) or Docker-internal hostnames. Use the URL-templated `{{CINATRA_BASE_URL}}/api/a2a/agents/<vendor>/<slug>` form. The proxy route at `src/app/api/a2a/agents/[...slug]/route.ts` extracts `<vendor>/<slug>` from the first two path segments, calls `resolveWayflowUrl(\`@\${vendor}/\${slug}\`)` against `WAYFLOW_BASE_URL`, and forwards verbatim. Agent extensions are installed, updated, and uninstalled dynamically; the multi-tenant runtime hosts every installed agent in one container so URLs do not need to be reconfigured per slug.

### fasta2a `sendTask`: persist both `task.id` and `task.contextId`

`task.id` and `task.contextId` are **different UUIDs** — they are not interchangeable. Resume requires `contextId`, not `task.id`.

When `sendTask` returns a Task in `input-required` state:

```typescript
const task = await client.sendTask({ message: { ... } });
await updateAgentRunA2ATaskId(runId, task.id);       // task identity
await updateAgentRunA2AContextId(runId, task.contextId); // resume routing key
```

The resume call must send a new message into the **same** `contextId` so fasta2a routes it to the paused conversation rather than starting a fresh one. If only `task.id` is persisted, resume creates a new context and the flow starts over from the beginning.

### `A2AAgent` cannot have named `inputs` — use `OutputMessageNode` to pass data

`wayflowcore`'s `A2AAgent.__init__` hardcodes `input_descriptors=[]`. Setting `"inputs"` on an `A2AAgent` component in `agent.json` causes pyagentspec to propagate those inputs to the `AgentNode.inputs` list, which WayFlow then validates against the empty descriptor set:

```
ValueError: Unknown input descriptor specified: StringProperty(name='campaignId')
```

**Rule:** Never declare `"inputs"` on `A2AAgent` components. Instead, place an `OutputMessageNode` component before the `A2AAgent` step and render the value into its `"message"` field using a Jinja placeholder:

```json
{
  "campaign_announce": {
    "component_type": "OutputMessageNode",
    "id": "campaign_announce",
    "name": "Announce campaign",
    "message": "Email outreach campaign created. Campaign ID: {{campaignId}}"
  }
}
```

The WayFlow runtime injects the rendered message into the shared conversation history. Child A2A agents receive it via `_share_conversation=True` on `AgentExecutionStep` and can read the value from the conversation context.

### `AgentExecutionStep.might_yield` does not handle `A2AAgent` (agent_loader patch)

`AgentExecutionStep.might_yield` in wayflowcore raises `NotImplementedError: A2AAgent not supported in agent execution step` at flow startup. This is an omission — the property handles Agent, Swarm, ManagerWorkers, and OciAgent but not A2AAgent.

The `agent_loader.py` `_patch_agent_execution_step_might_yield()` function monkey-patches this at startup:

```python
if isinstance(self.agent, RuntimeA2AAgent):
    return self.caller_input_mode == CallerInputMode.ALWAYS
```

This means A2AAgent execution steps yield (produce HITL interrupts) when `caller_input_mode=ALWAYS` — which is the value set by the `caller_input_mode` loader patch.

### Server restart required for `execution.ts` changes

The BullMQ (a Redis-backed job queue) worker module cache initializes once at Next.js dev server startup. Changes to `packages/agents/src/execution.ts` require a **server restart** to take effect, even with Turbopack hot reload active.
