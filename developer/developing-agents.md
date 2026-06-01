# Developing Agents

Audience: contributors (human or AI) who want to add, edit, or migrate an agent in Cinatra without reading the source of `@cinatra-ai/agents`.

**TL;DR:** Write an `oas.json` file under `agents/cinatra/<slug>-agent/cinatra/`, run `node scripts/ci-validate-agents.mjs`, restart the dev server, and the agent is live.

> **Looking for the end-user authoring path?** Most agents are written conversationally through Cinatra's chat assistant, not by hand-editing files. See [Creating agents in chat](../user/creating-agents-in-chat.md) for that flow. This document is the file-driven contributor guide.

## What is a Cinatra agent?

A Cinatra agent is defined entirely as a declarative Open Agent Specification (OAS) Flow file in the repository under `agents/<vendor>/<slug>/cinatra/oas.json`. There is no TypeScript source, no `packages/agent-<name>/` directory, and no per-agent BullMQ (a Redis-backed job queue) worker. On startup **in development mode only** (`CINATRA_RUNTIME_MODE=development`), the Next.js instrumentation hook scans the agent install directory and upserts each file into the `agent_templates` table. The DB becomes a derived cache of the files committed to git — agents live in git first, in the DB second.

> **Dev-mode only.** The on-disk `agents/` scan runs exclusively when `CINATRA_RUNTIME_MODE=development`. In production, agents are installed through the proper install flow — `agent_builder_git_publish` / Model Context Protocol (MCP) install primitives, or `cinatra setup prod` at provisioning time — and the `agent_templates` table is never overwritten from disk at boot. The filesystem-scan-on-restart workflow described below is a developer convenience, not the production deploy path.

Agents are authored as OAS Flow files at `agentspec_version: "26.1.0"` with `component_type: "Flow"`. The file declares the agent's inputs, system prompt, tool references, flow control nodes, output schema, and human-in-the-loop (HITL) renderer declarations. A compiler in `@cinatra-ai/agents` derives the runtime representation — `inputSchema`, `outputSchema`, `approvalPolicy`, and the compiled plan — automatically from the node graph. Authors never write those fields by hand.

The runtime is **WayFlow (Cinatra's OAS Flow agent runtime)**, the reference OAS implementation, running as a Python sidecar invoked over A2A. See [open standards in Cinatra](open-standards.md) for the full standards picture.

## `oas.json` anatomy

An OAS Flow file is a declarative graph of nodes. The top-level fields:

| Field | Purpose |
|-------|---------|
| `agentspec_version` | Pinned to `"26.1.0"`. The compiler and validator reject other versions. |
| `component_type` | `"Flow"` for top-level agents. |
| `id` | Stable internal identifier for the flow. |
| `name` | Human-readable name shown in the Agents UI and in MCP tool metadata. |
| `description` | Short summary surfaced in the catalog and A2A tool listing. Keep under ~200 chars. |
| `metadata.cinatra.type` | `"node"` for leaf agents (single concern), `"orchestrator"` for agents that call sub-agents. |
| `metadata.cinatra.hitlScreens` | Array of renderer IDs (e.g. `"@cinatra/reviewer-agent:output"`) declaring which HITL surfaces this agent emits. |
| `inputs` | Array of input descriptors with `title`, `type`, optional `format`/`default`. The compiler derives `inputSchema` from this. |
| `outputs` | Array of output descriptors. The compiler derives `outputSchema` from this. |
| `start_node` | Reference to the entry node. |
| `nodes` | Array of node references for every node in the flow. |
| `control_flow_connections` | Edges that describe the order of execution. |
| `data_flow_connections` | Edges that wire outputs of upstream nodes into inputs of downstream nodes. |

A small, real example: see `extensions/cinatra-ai/email-test-delivery-agent/cinatra/oas.json` for a deterministic leaf agent. For an orchestrator with mid-run HITL, see `extensions/cinatra-ai/email-outreach-agent/cinatra/oas.json`.

Package metadata — `packageName` and version — lives in a sibling `package.json` (npm-style), keyed off the directory name. The compiler reads both.

### Derived runtime fields

The OAS file is the source of truth. The runtime derives the rest:

- `inputSchema` (JSON Schema) — derived from `inputs[]`.
- `outputSchema` (JSON Schema) — derived from `outputs[]`.
- `approvalPolicy` (which steps pause for HITL) — derived from `metadata.cinatra.hitlScreens` and per-node metadata.
- Compiled plan — derived from the node graph by the OAS compiler.

Authors never write these by hand. The MCP primitive `agent_source_compile` regenerates them when the node graph changes.

### Fields owned by the runtime, not by the file

| Field | Owner | Reason |
|-------|-------|--------|
| `agent_templates.id` | DB | The runtime generates a UUID on first upsert. `packageName` is the stable identity across restarts. |
| `agent_templates.orgId` | DB | Assigned when the template is adopted by an organization — multi-tenant concern. |
| `agent_templates.creatorId` | DB | Set to the user that first imported the template; agents from git have no single creator. |
| `agent_templates.status` | DB | `draft` / `published` is managed via the Agents UI (or `agent_*` publish primitives), not in git. |

## `agents/` directory structure

All first-party Cinatra agents live under the vendor-namespaced layout:

```
agents/
  cinatra/
    email-outreach-agent/
      cinatra/
        oas.json       ← agent definition
      package.json     ← npm package metadata (@cinatra/email-outreach-agent)
    email-recipient-selection-agent/
      cinatra/
        oas.json
      package.json
    drupal-agent/
      cinatra/
        oas.json
      package.json
    …
```

Three naming rules:

1. **Directory layout:** `agents/<vendor>/<slug>/cinatra/oas.json`. For first-party Cinatra agents the vendor is `cinatra`. The slug naming is up to the author — most agents end in `-agent` (`auditor-agent`, `email-drafting-agent`). The inner `cinatra/` subdirectory is the namespace layer expected by the 4-rung probe in `mcp/handlers.ts`.
2. **The file is always named `oas.json`** (Open Agent Specification). The startup scanner probes four locations in priority order: `<installDir>/cinatra/oas.json` → `<installDir>/cinatra/agent.json` → `<installDir>/oas.json` → `<installDir>/agent.json`. The `agent.json` probes are legacy fallbacks — new agents must use `oas.json`.
3. **One agent per directory.** Future additions (test fixtures, generated examples) live as sibling files inside the same slug directory; do not nest multiple agents under one slug.

Why `agents/`, not `packages/`? A Cinatra agent is pure configuration — the OAS Flow file describes the agent declaratively, and the runtime fields are derived from it. There is no TypeScript source to build and no test suite to run. Each agent still carries its own `package.json` (so it is an npm-style package that can be published to the registry and installed into other instances), but it is not a *workspace* package: the host repo does not import it as TypeScript code, and the build system treats `agents/` as data, not source. Keeping agents at the repo root under `agents/` makes the distinction explicit — they are interpreted by `@cinatra-ai/agents` and executed by WayFlow, not compiled with the rest of the codebase.

## Authoring loop

```
agents/<vendor>/<slug>/cinatra/oas.json
        |
        v
    validate   (agent_source_validate  OR  node scripts/ci-validate-agents.mjs)
        |
        v
     git PR
        |
        v
      merge
        |
        v
       CI       (.github/workflows/validate-agents.yml re-runs the validator)
        |
        v
  Cinatra DB    (ensureAgentPackageFromGitFile upserts into agent_templates)
        |
        v
  MCP tool      (registerPublishedAgentTools exposes it as a named MCP tool)
        |
        v
      A2A       (the A2A layer catalogs it for cross-agent discovery)
```

The startup scanner walks the agent install directory (default: `agents/`, configurable at `/configuration/environment`) using a 4-rung probe per entry: `<installDir>/cinatra/<slug>/cinatra/oas.json` → `agent.json` → `<installDir>/cinatra/<slug>/oas.json` → `agent.json`. Only the first match per slug is loaded. The file → DB upsert happens on every dev-mode boot, gated by the version-skip guard in `ensureAgentPackageFromGitFile`. The entire scan block (`backfillPublishedMarkers` + `triggerWayflowReload` + the `ensureAgentPackageFromGitFile` loop) is wrapped in an `if (process.env.CINATRA_RUNTIME_MODE === "development")` guard in [`src/instrumentation.node.ts`](../../src/instrumentation.node.ts), so production boots never touch the on-disk agent tree — use the install primitives instead (see [`docs/developer/agent-packaging.md`](agent-packaging.md) and the `agent_builder_*` MCP tools).

### Step-by-step

1. Create the directory: `mkdir -p agents/cinatra/my-research-agent/cinatra`.
2. Write `agents/cinatra/my-research-agent/cinatra/oas.json` and `agents/cinatra/my-research-agent/package.json` — hand-authored or via the `agent_source_write` / `agent_source_write_files` MCP tools. Start from a similar existing agent (for example `extensions/cinatra-ai/email-test-delivery-agent/cinatra/oas.json` for a leaf agent, or `extensions/cinatra-ai/email-outreach-agent/cinatra/oas.json` for an orchestrator with mid-run HITL) and change `id`, `name`, `description`, `inputs`, `outputs`, `nodes`, and the control- and data-flow connections.
3. Run the validator: `node scripts/ci-validate-agents.mjs`. Exit code 0 means every file under `agents/` passed.
4. Compile the OAS Flow: `agent_source_compile` with `packageSlug: "my-research-agent"`. This regenerates the derived runtime artifacts (`inputSchema`, `outputSchema`, `approvalPolicy`, compiled plan) in place from the current node graph.
5. Open a PR.
6. CI must pass — `.github/workflows/validate-agents.yml` runs the same validator. Merging is blocked if any file fails.
7. After merge, restart the dev server. The startup scan upserts the new row into `agent_templates`, and the agent appears in the UI under Agents.

## MCP authoring tools

Cinatra ships eight MCP primitives for AI-assisted authoring of agents. They are exposed via the same `@cinatra-ai/agents` module as the rest of the platform's agent API; any MCP client connected to Cinatra (including Claude Code via `/mcp`) can call them.

| Tool | Purpose | Key inputs | Returns |
|------|---------|------------|---------|
| `agent_source_list` | List every `agents/<vendor>/<slug>/cinatra/oas.json` file in the repo with its `packageName`, `packageVersion`, `name`, and `description`. Tolerates a missing `agents/` directory. | _(none)_ | `{ items: Array<{ path, packageName, packageVersion, name, description }>, total: number }` |
| `agent_source_read` | Read and parse a specific agent's OAS Flow file. | `packageSlug: string` (no path separators) | `{ content: <OAS Flow object>, path: string }` or `{ error: string }` |
| `agent_source_write` | Create or overwrite the OAS Flow file at `agents/<vendor>/<packageSlug>/cinatra/oas.json`. Creates the directory if needed. Pre-parses `content` as JSON before writing. Caller is responsible for bumping the package version. | `packageSlug: string`, `content: string` (JSON-encoded OAS Flow) | `{ path: string, written: true }` or `{ error: string }` |
| `agent_source_write_files` | Write multiple files at once for an agent extension — `oas.json`, `package.json`, and any siblings — in a single atomic operation. Use when scaffolding a brand-new agent so the validator sees a consistent set of files. | `packageSlug: string`, `files: Array<{ relativePath: string, content: string }>` | `{ paths: string[] }` or `{ error: string }` |
| `agent_source_validate` | Run the OAS Flow shape checks against a raw JSON string without touching the filesystem. Same rules the CI validator enforces. | `content: string` | `{ valid: boolean, errors: string[] }` |
| `agent_source_review` | Run the deterministic review lint server-side. Partitions findings by severity (blockers, warnings, advisories) and is the single review surface used by the chat-driven authoring flow. Idempotent: byte-identical inputs produce byte-identical blockers across re-runs. | `packageSlug: string`, optional `reviewMode: "deterministic" \| "advisory"` | `{ blockers, warnings, advisories, ranAdvisoryAgents }` or `{ error: string }` |
| `agent_source_compile` | Compile an existing OAS Flow file — runs the OAS compiler, syncs the derived `agent_templates` row (system prompt, type, declared toolboxes), and registers any inline skills declared by the flow. Errors if the file is missing — use `agent_source_write` first. | `packageSlug: string` | `{ path: string }` or `{ error: string }` |
| `agent_source_publish` | Publish the agent extension to the configured registry (local Verdaccio (an npm-compatible registry) or the hosted public registry). Bumps the package version, packs the tarball, and pushes. Will run `agent_source_review` first as a gate when called from chat-driven authoring. | `packageSlug: string`, optional registry target | `{ packageName: string, version: string, registry: string }` or `{ error: string }` |

### When to use each tool

- **Authoring a new agent from scratch:** `agent_source_list` to see what exists → `agent_source_read` on a similar existing agent for reference → assemble the OAS Flow JSON → `agent_source_validate` until it returns `valid: true` → `agent_source_write_files` to persist `oas.json` and `package.json` together.
- **Updating an existing agent:** `agent_source_read` → mutate the parsed object → bump the package version → `agent_source_write`.
- **Linting before publish:** `agent_source_review` with `reviewMode: "deterministic"` returns the blocker list the chat authoring flow uses as a hard gate.
- **Regenerating compiled artifacts after a node-graph change:** `agent_source_compile` with the same `packageSlug`.
- **Publishing to the registry:** after a successful compile and validate, `agent_source_publish` pushes the package; the platform then resolves and installs it via the normal install flow.
- **Discovering existing agents from an MCP client without reading the filesystem:** `agent_source_list`. The result is cheap enough to call at the start of every authoring session.

## Local testing workflow

1. Edit `agents/cinatra/<slug>-agent/cinatra/oas.json` in your editor (or via `agent_source_write`).
2. Run the validator: `node scripts/ci-validate-agents.mjs`. Expected output on success is `PASS` per file and a final `Results: N passed, 0 failed`; exit code 0.
3. Restart the dev server: `pnpm dev`. The restart is cheap — the version-skip guard prevents DB writes when `packageVersion` is unchanged.
4. Read the console. The startup scan logs exactly one line per agent:

   ```
   [cinatra:extensions:agent] <packageName> v<packageVersion> upserted
   ```

   or, when the version-skip guard fires:

   ```
   [cinatra:extensions:agent] <packageName> v<packageVersion> skipped — already up to date
   ```

   If you see `[agents] git agent load skipped (<slug>): <error>` instead, the file exists but is unreadable or invalid JSON — fix it and restart.

5. Verify in the UI. Navigate to the Agents section. The new template appears with the `name` from your `oas.json` and the `description` from either `oas.json` or the sibling `package.json`. Open it and confirm the Setup tab renders the derived `inputSchema` correctly.
6. Validate via MCP. From any connected MCP client (e.g. Claude Code), call `agent_source_validate` with the current file contents as `content`. `{ valid: true, errors: [] }` confirms the in-process validator agrees with the CI script.

**Version-skip behavior.** The loader compares the git file's `packageVersion` against the DB's current row. If they match, the DB write is skipped entirely. This is fast and safe, but it also means edits that keep the same version are invisible to the running app. To force a re-import during local iteration, bump `packageVersion` temporarily (`1.0.0` -> `1.0.0-dev.1`) and restart; bump it back once you are satisfied with the final content.

## MCP tool registration and A2A discoverability

When an agent in the DB has a `packageName` and `status = "published"`, `registerPublishedAgentTools` registers it as a named MCP tool on every incoming MCP session. The tool name is derived via `sanitizePackageNameToToolName`:

```
@cinatra/email-outreach-agent  ->  cinatra_email-outreach-agent
email-outreach-template        ->  email-outreach-template
```

The transform strips any leading `@`, replaces `/` with `_`, replaces any other non-`[A-Za-z0-9._-]` character with `-`, trims leading/trailing `-` or `.`, and clamps to 128 characters. The result matches the MCP SDK tool-name regex `/^[A-Za-z0-9._-]{1,128}$/`.

What this enables:

- **For external LLMs:** any MCP client connected to the Cinatra MCP server (Claude Code, ChatGPT via connectors, custom agents) sees published virtual agents as first-class tools. Invoking the tool creates an `agent_runs` row and enqueues a BullMQ job — same path as the Cinatra UI's Run button.
- **For composed Cinatra agents:** the agentic orchestration loop registers the same tools inside its own tool catalog (with `MAX_AGENT_NESTING_DEPTH=3` enforced), so one virtual agent can call another as a subroutine with no extra wiring.

**A2A discoverability.** Agents under `agents/` are exactly what the Agent-to-Agent (A2A) discovery layer catalogs. There is no separate A2A registration step and no per-agent manifest: once an `oas.json` is committed to `agents/`, imported at startup, and published in the Cinatra UI, it appears automatically in the A2A agent catalog. The git file is the single source of truth for both the internal runtime and the A2A-facing advertisement.

## Package rename migrations

When renaming agent extensions (e.g. `@old-scope/name` → `@cinatra/name-agent`), three DB locations must be updated in a single transaction — missing any one causes runtime failures:

| Location | Column | What breaks if missed |
|----------|--------|-----------------------|
| `cinatra.agent_templates` | `package_name` | Template identity wrong; `agent_list` returns old name |
| `cinatra.skills` | `payload` (JSONB) — `.agentId` + `.packageName` | Skills unresolvable for old agents |
| `cinatra.agent_templates` | `agent_dependencies` | Orchestrator fails at startup: "missing installed sub-agents: @old-scope/..." |

**Reference implementation:** `scripts/rename-200.mjs` — covers all three locations, Verdaccio publish (with idempotency guard), old-version deprecation, and `latest` dist-tag move. Use it as the template for any future rename.

Key SQL patterns:

```js
// agent_templates.package_name
db.query(`UPDATE cinatra.agent_templates SET package_name = $1, package_version = $2, updated_at = NOW() WHERE package_name = $3`, [newName, newVersion, oldName]);

// skills.payload (JSONB merge — updates agentId or packageName in-place)
db.query(`UPDATE cinatra.skills SET payload = (payload::jsonb || jsonb_build_object('agentId', $1::text))::text WHERE payload::jsonb->>'agentId' = $2`, [newName, oldName]);

// agent_dependencies (JSON object — rebuild with renamed key)
// Read the row, rename the key in JS, write back as JSON string.
```

The Verdaccio publish step must run **before** the DB transaction — if publish fails, leave DB untouched so the script is safely re-runnable.

## Configuring the agent install path

By default the startup scanner and all `agent_source_*` MCP tools resolve agents relative to `<repo-root>/extensions/` (the helper's `DEFAULT_PATH`). The stored value is the contents of the `agent_install_path` metadata row; if it is unset or blank, the default is used.

The in-app UI for editing this setting was retired. The helpers below remain available as a typed surface for tooling that needs to read or programmatically set the path; there is no operator-facing form for it today, and the helper itself performs only read/write/resolve mechanics — any path-traversal validation must happen at the call site.

**Key functions** (sub-path export `@cinatra-ai/agents/agent-install-path`):

| Function | Purpose |
|----------|---------|
| `readAgentInstallPath()` | Returns the stored path (or `"extensions"` if unset/blank). Reads live from Postgres on every call — no cache. |
| `writeAgentInstallPath(value)` | Persists the value as-is (no validation). Currently invoked only from tests + ad-hoc scripts (no admin UI). |
| `resolveAgentInstallDir()` | Returns the absolute filesystem path. If the stored value is absolute, it is returned verbatim; otherwise it is joined onto `process.cwd()`. Used by the MCP handlers and the startup scanner. |

The path change takes effect immediately without a server restart — every incoming MCP call re-reads via `resolveAgentInstallDir()`.

## CI validation

The `.github/workflows/validate-agents.yml` workflow runs `node scripts/ci-validate-agents.mjs` on every `push` and `pull_request` to `main` whose diff touches `agents/**/*.json`. A PR cannot merge if any file fails the schema check, so malformed agents never reach the `main` branch.

To run the exact same validator locally:

```
node scripts/ci-validate-agents.mjs
```

Exit code 0 means every file under `agents/` passed. Exit code 1 means at least one file failed — the failing paths and error messages are printed to stdout before the non-zero exit.

## Security considerations

- **No credentials, API keys, connection strings, or secrets in `oas.json` or `package.json`.** Both files are committed to git and read by anyone with repo access. Secrets belong in the settings UI (Nango (the OAuth gateway brokering connector credentials)-managed credentials, `mcp_servers`, `external_mcp_servers`, or environment variables), never in an agent definition.
- **`inputSchema` is public.** Every MCP client that can list tools sees the schema, including field names and descriptions. Do not use input fields to smuggle auth tokens, tenant IDs, or other sensitive context — those must be resolved server-side from the authenticated session.
- **`taskSpec` is visible to admins in the UI.** The Agents catalog shows the full text. Keep it operationally descriptive ("use `<tool>` to do `<thing>`"), not a place to stash secrets or PII. If a specific run needs sensitive data, pass it via `inputSchema` from an authenticated caller — never hardcode it in the taskSpec string.

## pyagentspec constraints when authoring `oas.json`

WayFlow's loader uses pyagentspec to deserialize each agent's `oas.json`. Several pyagentspec invariants are not enforced by the hermetic `validate-agent-json.ts` validator but DO cause silent mount failures in the live runtime. Common gotchas:

### Placeholder regex is strict — no filters, no dotted paths

pyagentspec's `ApiNode._get_inferred_inputs()` scans `url + http_method + api_spec_uri + data + query_params + headers` with the regex `r"{{\s*(\w+)\s*}}"`. Filtered or computed placeholders are invisible:

- `{{ var | tojson }}` — invisible (filter)
- `{{ obj.field }}` — invisible (dotted)
- `{{ x ? a : b }}` — invisible (not even valid Jinja)

The inferred placeholder set must exactly match the ApiNode `inputs[]`. If the body uses `{{ seedUrls | tojson }}` but `inputs[]` declares `seedUrls`, pyagentspec raises *"received a property titled 'seedUrls', but expected only properties with the titles: [...]"*. To declare the input while preserving `| tojson` for rendering, prefix the template with a Jinja-comment sentinel that exposes the bare names to the regex:

```jinja
{# pyagentspec-input-hint (do not remove): {{ seedUrls }} {{ outputSchema }} #}Extract structured data from {{ seedUrls | tojson }} per schema {{ outputSchema | tojson }} ...
```

The comment is stripped at render time; the regex only cares about the lexical text.

### Use Jinja conditionals, not JS-style ternaries

`{{ title ? 'A' : 'B' }}` is invalid Jinja and the names are also invisible to the placeholder regex. Use `{{ 'A' if title else 'B' }}` plus the sentinel above if the variable is still declared in `inputs[]`.

### "type": "number" with integer default → "type": "integer"

pyagentspec maps `"type": "number"` to `FloatProperty`. Constructing `FloatProperty(default_value=5)` (integer literal) fails with *"Error when initializing: FloatProperty(...)"*. Whenever the default is an integer **or** the field semantically holds a count, declare the OAS type as `"integer"`, not `"number"`. This applies to inputs, outputs, EndNode passthroughs, and ApiNode inputs/outputs equally.

### `agent_run_id` injection follows the email-outreach pattern

Cinatra's bridge `/api/llm-bridge` expects the large language model (LLM)-bridge POST body to include `agent_run_id` derived from the current run. At runtime, `packages/agents/src/execution.ts` injects `cinatra_run_id` into WayFlow's A2A initial message — **never** `agent_run_id`. The canonical pattern (used by `email-outreach-agent`) is:

1. Declare `cinatra_run_id` (with `"default": ""`) in Flow root `inputs[]` and StartNode `inputs[]`.
2. Add a DataFlowEdge `start.cinatra_run_id → <apinode>.agent_run_id`.
3. Declare `agent_run_id` (no default) at the ApiNode boundary `inputs[]`.
4. Reference `{{ agent_run_id }}` inside the ApiNode `data.user` body (and as a top-level `agent_run_id` data field if the agent needs it in the bridge body).

The DFE translates names at the boundary so the Flow root accepts the runtime-injected `cinatra_run_id` while the ApiNode's internal contract stays on `agent_run_id`.

### EndNode outputs must each have an upstream DataFlowEdge

pyagentspec's Flow loader walks the EndNode's declared outputs and rejects any that have no DFE source (and no StartNode input to trickle through). The error reads: *"the flow requires the input descriptor `ListProperty(name='notes', ...)` because some step requires it but that is not available in the StartStep"*. Either (a) wire an explicit DFE feeding the output from an upstream node, (b) declare the same field as a Flow input + StartNode input + DFE start→end so it passes through, or (c) drop the output from EndNode if nothing actually produces it.

### Pre-merge sanity sweep

Before a phase merges new or rewritten `oas.json`, restart the WayFlow container against the new files and check `GET http://localhost:3010/.health`. If the response shows `status: "degraded"` with the new agent in `failed_agents`, debug locally first — pyagentspec's `'error' required in context` TypeError in the container logs is a known upstream defect that masks the real validation error. Patching `pyagentspec/serialization/pydanticdeserializationplugin.py:60-65` to add `ctx={"error": ValueError(e.msg)}` to the `InitErrorDetails` call surfaces the real message; this is a temporary diagnostic step until the upstream fix lands.
