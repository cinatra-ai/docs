# LLM Orchestration

## Standard approach

If a package needs large language model (LLM) calls, prefer the repository orchestration layer over provider-specific direct calls.

Preferred functions:

- `resolveConfiguredLlmRuntime()`
- `runResolvedSkillAwareDeterministicLlmTask()`

## Skill delivery to the LLM

Skills are delivered to the LLM via the `skillIds` parameter — **never** by dumping content into the system prompt (`personalSkillContent` is deprecated and must not be used for new code).

The orchestration wrapper (`runSkillAwareDeterministicLlmTask` / `runResolvedSkillAwareDeterministicLlmTask`) **auto-selects the delivery method per provider**:

- **OpenAI**: skills are preferentially delivered as the **`shell` tool** via `buildSkillTools()` internally. The LLM reads `SKILL.md` from the on-disk `sourcePath` recorded by `upsertSkill`. Chat/widget paths MUST resolve every skill to a catalog entry with `sourcePath` — enforced upstream by `ensureChatSkillRegistered` / per-widget self-heals. When `buildSkillTools` is called with skill IDs and NONE resolve with `sourcePath` (e.g. the `/api/llm-bridge` agent path with GitHub-installed or user-scoped skills that resolve null under the model actor's visibility filter), it falls back to `read_skill` so the LLM can still invoke the skill catalog primitive. A console warning is emitted so operators can see partial-resolution.
- **Anthropic**: skills are delivered as `shell` when shell is supported, OR as `read_skill` when the Anthropic adapter runs in native-Model Context Protocol (MCP) mode (the adapter strips the shell tool and injects `read_skill` directly — `buildSkillTools()` is NOT involved on that carve-out).
- **Gemini**: skill content is read directly via `readSkillContent()` and inlined into the system prompt. This avoids the extra round-trip where Gemini has to call a function tool to read the skill.

Consumers pass `skillIds` to the wrapper — the delivery method is chosen automatically. **Do not call `buildSkillTools` or `readSkillContent` directly** — they are internal to the orchestration layer.

When skills are delivered as the shell tool (OpenAI path), `buildSkillTools()` builds:

1. A `type: "shell"` tool with local file paths for every skill whose catalog record has a `sourcePath` on disk. The shell tool uses `cat`/`head`/`tail` executed locally via `readSkillFileContent` — no Docker required.

`read_skill` is the fall-back tool for: (a) the Anthropic native-MCP adapter, (b) the `/api/llm-bridge` shell-incompat path, and (c) `buildSkillTools` when no skill resolves with `sourcePath`. New chat/widget code paths should ensure their skills have `sourcePath` via `registerExtensionSkill`.

The shell tool declaration in the API request includes the skill directory path:

```json
{
  "type": "shell",
  "environment": {
    "type": "local",
    "skills": [{ "name": "agent-scrape", "description": "...", "path": "/abs/path/to/skill/dir" }]
  }
}
```

This path is present in the request only when `sourcePath` is set on the skill record. Skills persisted via `upsertSkill` always have `sourcePath` set.

### Docker-based shell

Passing `includeShell: true` to `buildSkillTools()` uses the Docker executor instead of the local file reader. Only needed for write-capable shell tasks. Regular skill reading does not require Docker.

## Execution-time skill usage

For LLM-enabled package execution:

1. Resolve the instance skill ID — call the skill generation function at instance creation time, or use the lazy-migration helper (`resolveInstanceSkillId`) for old instances without a stored ID.
2. Resolve the configured runtime.
3. Pass `skillIds: instanceSkillId ? [instanceSkillId] : undefined` to `runResolvedSkillAwareDeterministicLlmTask`.
4. Use explicit log labels for observability.

Do not pass `personalSkillContent`. Do not pass `useLiveTooling` — the shell tool is now included automatically.

### `extraTools` — additional tools through the wrapper

When a task needs tools beyond skill tools (e.g. `createWebSearchTool()`), pass them via `extraTools`. The wrapper merges them into the final tools array:

```typescript
const llmResponse = await runResolvedSkillAwareDeterministicLlmTask({
  runtime: llmRuntime,
  skillIds: ["@cinatra/example-skill:extract-data"],
  extraTools: [createWebSearchTool()],
  system: "Extract structured data from the web...",
  user: JSON.stringify({ url, instructions }),
  maxSteps: 15,
  maxOutputTokens: 4000,
  outputSchema: extractionSchema,
  signal,
  logLabel: "extract-websearch",
});
```

Do not build skill tools manually and merge them with extra tools — use `extraTools` instead.

## Typical package mapping

### Scrape-like packages

- fetch and parse: deterministic
- page discovery: LLM via orchestration with `skillIds`
- extraction from fetched content: LLM via orchestration with `skillIds`
- graceful fallback to deterministic extracted data when appropriate

### Research-like packages

- validation and web checks: deterministic
- plan generation: LLM via orchestration with `skillIds`
- per-item research: LLM via orchestration with `skillIds`
- validation outputs must be included in later LLM context

### Enrichment-like packages

- structured service lookups: deterministic
- no LLM unless the package explicitly adds an LLM-driven enrichment mode

## Native MCP server tool (LLM-to-MCP connection)

`buildLlmMcpServerTool(provider)` in `packages/llm/src/mcp-access.ts` builds an `LlmMcpServerTool` that lets an LLM provider connect directly to the Cinatra MCP server.

### Why it exchanges credentials for a Bearer token

LLM providers (OpenAI, Gemini) call the MCP server over the configured public base URL. The MCP server validates requests with `verifyMcpAccessToken`, which requires a **JSON Web Token (JWT) Bearer token** — not raw client credentials. `buildLlmMcpServerTool` therefore:

1. Reads the stored `clientId` / `clientSecret` for the provider (from `getLlmMcpCredentials`)
2. Exchanges them for a short-lived JWT via `POST /api/auth/oauth2/token` (local, not public-URL)
3. Passes the JWT as `Authorization: Bearer <token>` in the MCP tool headers

### The `resource` parameter is mandatory

The token request must include `resource: getLocalMcpServerUrl("/api/mcp")` (RFC 8707). Without it, Better Auth (the auth server library Cinatra uses) issues an opaque token, which cannot be verified by JWKS. See `references/mcp/patterns.md` — LLM provider access section for full details.

```ts
// packages/llm/src/mcp-access.ts
body: new URLSearchParams({
  grant_type: "client_credentials",
  scope: credentials.scope,
  resource: getLocalMcpServerUrl("/api/mcp"),  // ← required for JWT issuance
}),
```

### Returns null when unavailable

`buildLlmMcpServerTool` returns `null` (not an error) when:
- No credentials are provisioned for the provider
- No public MCP server URL is configured (operator did not save one in the dev tab)
- Token exchange fails

Callers fall back to in-process function tools when it returns `null`.

### Automatic injection via `injectMcpTools` — do not call manually

**Do not call `buildLlmMcpServerTool` at individual call sites.** MCP tool injection is centralized in `injectMcpTools` (`packages/llm/src/index.ts`) — the single injection site shared by all four orchestration entry points (`runDeterministicLlmTask`, `runSkillAwareDeterministicLlmTask`, `generate`, `stream`). It deliberately does **not** wrap provider adapters in `registry.ts`.

`injectMcpTools` resolves the tool set via `resolveMcpToolsForDeclaredIds` (`packages/llm/src/registry.ts`):

- `declaredToolboxIds` undefined → legacy always-inject set: Cinatra self-MCP + WordPress/Drupal external MCP tools + registered external MCP servers.
- `declaredToolboxIds` defined → filtered set: `"cinatra-mcp"` resolves to the Cinatra self-MCP; other ids resolve through the external MCP registry (with an `apify-connector` first-party branch). Unmatched ids are dropped with a console warning.

Pass-through cases (tools returned unchanged): Gemini provider (no native MCP), `skipMcpInjection: true` (stream-only opt-out, e.g. the CMS widget chat route), an MCP tool already present in `params.tools` (dedup), or zero resolved MCP tools. When MCP tools are injected, `type: "function"` tools are stripped unless the caller sets `preserveFunctionTools: true` (the client-side action / widget-chat path); the MCP tools are placed first in the tools list.

## Anthropic MCP mode

The Anthropic adapter has two MCP delivery modes configurable via the `mcpMode` setting in `@cinatra-ai/anthropic-connector` (stored in DB, managed from `/configuration/llm/claude` settings page; the setting follows the Anthropic API, not the inbound MCP-client registry at `@cinatra-ai/mcp-client-registry-connector`):

- **`"function-tools"` (default)**: Uses `client.messages.create` (standard API). MCP tools are fetched as function tools via `fetchMcpToolsAsLlmFunctionTools`. No Anthropic beta program required.
- **`"native"`**: Uses `client.beta.messages.create` with the `mcp-client-2025-11-20` beta. Requires the beta to be enabled on the Anthropic account.

If `"native"` is configured but the beta call throws (e.g. the beta is not active on the account), the adapter automatically falls back to `"function-tools"` for that run, resets conversation state, and re-fetches MCP tools as function tools. A warning is logged to the console.

The `LlmShellTool` type is translated to a standard `bash` function tool on Anthropic — not to `bash_20250124` (which would require the `computer-use-2025-01-24` beta). No extra beta headers are needed for skill reading.

## `executionProvider` — single runtime, no routing

LangGraph has been retired as an execution provider. Agent templates carry an `executionProvider` column that now defaults to `"wayflow"` (`packages/agents/src/schema.ts`), and `runAgentBuilderExecutionJob` in `packages/agents/src/execution.ts` no longer discriminates on it: external-source templates (`template.sourceType === "external"`) short-circuit to their external agent-to-agent (A2A) server, and every other run dispatches to WayFlow (Cinatra's OAS Flow agent runtime) over A2A — the upstream URL is derived from `template.packageName` via `resolveWayflowUrl` (`${WAYFLOW_BASE_URL}/agents/<vendor>/<slug>/`). There is no `isLangGraph` branch, no `AGENT_BUILDER_LANGGRAPH_EXECUTION` / `AGENT_BUILDER_RESUME` job pair — the BullMQ (a Redis-backed job queue) job is `AGENT_BUILDER_EXECUTION` (`src/lib/background-jobs.ts`).

Legacy DB rows that still carry older `executionProvider` values continue to dispatch — dispatch does not read the column — but the agent MCP write surface rejects any input value other than `"wayflow"`. See [BullMQ ↔ WayFlow boundary](bullmq-wayflow-boundary.md) for the full current runtime state.

## Unified LLM bridge — `/api/llm-bridge`

All WayFlow LLM execution goes through `/api/llm-bridge`. The old `/api/internal/langgraph-llm-step` route has been removed entirely.

**Route:** `POST /api/llm-bridge`

**Auth:** Bridge-token (`X-Cinatra-Bridge-Token` header validated by `isAuthorizedBridgeRequest`) OR Bearer JWT (agent-to-agent (A2A) protocol token validated by `verifyLangGraphBridgeToken`). No API keys accepted from callers — Cinatra owns the LLM runtime.

**Request body:**

```json
{
  "user": "workflow input text",
  "agent_id": "email-outreach",
  "max_steps": 6,
  "system": "optional fallback system text",
  "skill_source_path": "/abs/path/to/SKILL.md",
  "toolbox_ids": ["cinatra-mcp"],
  "model_id": "gpt-4o"
}
```

Skill IDs and custom skill content are resolved server-side from `agent_id` — callers never pass raw skill lists.

**`max_steps` cap:** Server clamps to `Math.min(body.max_steps ?? 6, 20)` regardless of what the caller sends. Default is 6.

**Response:** `{ "output": "final text" }` — empty string if LLM returned null.

**WayFlow caller:** agents reach the bridge through OAS `ApiNode` steps whose URL is `{{CINATRA_BASE_URL}}/api/llm-bridge` (placeholder substituted at load time). The multi-tenant loader (`docker/wayflow/agent_loader.py`) injects the `X-Cinatra-Bridge-Token` header on every outbound ApiNode HTTP call from `CINATRA_BRIDGE_TOKEN` in the container env.

**Do not call this endpoint from TypeScript.** TS callers use `runResolvedSkillAwareDeterministicLlmTask` directly. The bridge exists for delegation from WayFlow flow nodes back into the Cinatra-owned LLM runtime.

---

## What to avoid

- calling `buildLlmMcpServerTool` manually at individual call sites — it is injected automatically by `injectMcpTools` (`packages/llm/src/index.ts`) for all orchestration entry points
- calling `buildSkillTools` or `readSkillContent` directly — they are internal to the orchestration layer; pass `skillIds` to `runSkillAwareDeterministicLlmTask` or `runResolvedSkillAwareDeterministicLlmTask` instead
- building skill tools manually and merging with extra tools — use `extraTools` instead
- direct provider-specific calls when orchestration-layer helpers already exist
- passing `personalSkillContent` or dumping skill content into the system prompt
- passing `useLiveTooling` — it is a no-op; shell tool inclusion is automatic
- creating skills with `createSkillFromTemplate` directly from agent extensions — use `upsertSkill({ type: "system", ... })` instead (see `packages/skills/AGENTS.md`)
- using LLMs for HTTP fetching or other deterministic tasks
