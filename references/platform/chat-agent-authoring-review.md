# Chat Agent Authoring Review

**Status:** Accepted
**Date:** 2026-05-11
**Supersedes:** None
**Superseded by:** None

## 1. Context

The `/chat` Open Agent Specification (OAS) scaffolding path lets the chat assistant discover, scaffold, validate, and compile OAS Flow 26.1.0 agents end-to-end. Publishing remained outside that scaffolding path. The next gap was the absence of a review surface between scaffold and publish. The chat assistant could emit any compilable OAS, including OAS bodies with literal credentials baked into headers, untrusted URLs at HTTP boundaries, or `/api/llm-bridge` ApiNodes missing the `agent_id` envelope field. The deterministic compiler accepted them all.

This design introduces a single Model Context Protocol (MCP) review primitive, `agent_source_review`, plus three reference advisory helper agents (planner, security-reviewer, code-reviewer), plus deterministic scans that gate both `agent_source_compile` and `agent_source_publish`. Advisory dispatch is deferred; see § 3 for the reason.

**Design decisions and rejected alternatives:**

- **WayFlow (Cinatra's OAS Flow agent runtime) A2AAgent parent (rejected).** One draft proposed a WayFlow `A2AAgent` parent that fanned out to the three helper agents and joined their `ReviewFinding[]` arrays. The OAS Flow 26.1.0 spec does not define reliable parallel-join semantics for A2AAgent. The parent would have to serialize helper calls or accept indeterminate completion ordering. Security gates that block publish must not depend on a large language model (LLM)-only parent for join correctness.

- **`createDeterministicAgentsClient.runAdvisoryReview()` extension (rejected).** Another draft proposed extending the deterministic-agents client with a `runAdvisoryReview` method that the handler would call. This introduced a circular-import risk between `@cinatra-ai/agents` (handler) and `@cinatra-ai/agents/client` (which already re-exports types from handlers).

- **Direct in-process MCP `agent_run` (rejected after contract validation).** The handler was wired to dispatch helpers via `Promise.allSettled` over `invokePrimitive(transport, { primitiveName: "agent_run", ... })`. Tests passed because the mock returned `{ blockers, warnings, suggestions }` arrays, but `agent_run`'s real implementation queues a BullMQ (a Redis-backed job queue) job and returns `{ runId, status: "queued" }`; it never returns findings inline. The mock contract diverged from the production contract, so the implementation was non-functional in production.

- **Deferred advisory dispatch (accepted).** Synchronous helper execution requires a separate architectural surface, such as a direct call into `/api/llm-bridge` against each helper's ApiNode body, or a synchronous variant of `agent_run`. The handler currently emits one `advisory_dispatch_deferred` suggestion-severity finding per helper that would have been dispatched, returns `ranAdvisoryAgents: []`, and leaves synchronous helper execution to future work. The deterministic-only path is unaffected and ships fully functional.

## 2. Architecture

```
                               ┌─────────────────────────────────────┐
                               │   chat-assistant-core (system skill)│
                               │   assistant-skills: chat-...        │
                               └──────────────┬──────────────────────┘
                                              │
                                              │ MCP call
                                              ▼
                ┌────────────────────────────────────────────────────────┐
                │   agent_source_review (single primitive)               │
                │   packages/agents/src/mcp/handlers.ts                  │
                └─────────┬──────────────────────────────────────────────┘
                          │
              ┌───────────┴───────────────┐
              │                           │
              ▼                           ▼
   ┌──────────────────────┐   ┌──────────────────────────────────┐
   │ deterministic lint   │   │ advisory deferred                │
   │ (always runs first)  │   │ — synchronous helper execution   │
   │                      │   │   wiring is not yet present.     │
   │ scanOasForLiteral-   │   │                                  │
   │   Secrets            │   │  Emits one suggestion-severity   │
   │ scanOasForUntrusted- │   │  `advisory_dispatch_deferred`    │
   │   Urls               │   │  finding per helper that would   │
   │ scanOasForLlmBridge- │   │  have run:                       │
   │   Wiring             │   │  ├── agent-planner               │
   │                      │   │  ├── agent-security-reviewer     │
   │                      │   │  └── agent-code-reviewer         │
   └──────────────────────┘   └──────────────────────────────────┘
              │                           │
              └─────────────┬─────────────┘
                            ▼
              ┌──────────────────────────────────┐
              │  merged ReviewFinding[]          │
              │  { blockers, warnings,           │
              │    suggestions, ranAdvisory-     │
              │    Agents: [] when dispatch      │
              │    is deferred }                 │
              └──────────────────────────────────┘
```

Two side-effecting handlers, `agent_source_compile` and `agent_source_publish`, invoke the deterministic portion of `agent_source_review` before mutating state. Both return `{ error, code: "review_blocked", blockers }` on `blockers.length > 0` and abort the side effect.

## 3. Rationale: no WayFlow parent

OAS Flow 26.1.0 + the WayFlow runtime do not guarantee parallel execution of `A2AAgent` children launched from a single `FlowNode`. Each `A2AAgent` invocation is an LLM-mediated call that emits its own Agent-User Interaction Protocol (AG-UI) event stream. The parent has no language-level `Promise.all` and no deterministic join checkpoint. In practice, WayFlow serializes A2AAgent dispatches per parent FlowNode.

Three concrete consequences of the A2AAgent parent design:

1. **Latency.** Serial dispatch across three LLM helpers (planner, security-reviewer, code-reviewer) would be `O(3 × p99 helper latency)` instead of `O(p99 helper latency)`. For three ~2s helpers that is 6s vs 2s end-to-end.
2. **Indeterminate failure modes.** If helper 2 of 3 errors mid-flight in a WayFlow parent, the parent has no rollback semantics. Helper 1's findings are emitted to the event stream, helper 3 is never dispatched, and the parent must reconcile a partial result.
3. **Gate-on-LLM anti-pattern.** Security gates that block `agent_source_publish` must not depend on an LLM-driven parent for routing correctness. The deterministic scans run regardless of LLM availability; the advisory helpers are explicitly best-effort.

**Current state:** advisory mode emits one `advisory_dispatch_deferred` suggestion per helper that would have been dispatched, and returns `ranAdvisoryAgents: []`. The reason: `agent_run` queues asynchronously via BullMQ and cannot return findings inline; wiring a synchronous helper-execution surface, such as a direct call into `/api/llm-bridge`, is real architectural work. The deterministic-only path runs in full. Helpers exist as real OAS Flow 26.1.0 agents on disk, so they can be invoked directly via `agent_run @cinatra/agent-planner` for single-helper async output.

## 4. Credential safety doctrine

Two-layer defense. Both layers are mandatory; neither is sufficient alone.

**Layer 1 — Preventive skill rule.** The always-loaded `chat-assistant-core` skill (`skills/chat-assistant-core/SKILL.md` in the `assistant-skills` extension) carries a `## Credential safety` section that forbids the chat assistant from soliciting, accepting, or echoing credentials. On user offer, the assistant redirects to `/connectors` (Nango (the OAuth gateway brokering connector credentials) is the canonical credential surface) and explicitly states that any literal value pasted into chat will be ignored. This stops the data from entering the OAS in the first place.

**Layer 2 — Interceptive deterministic scan.** Even if the skill rule fails (model drift, jailbreak prompt, future model version), `validateOasAgentJson` runs three deterministic scans against the OAS body before either `agent_source_compile` or `agent_source_publish` proceeds:

- `scanOasForLiteralSecrets` — flags string values under scannable keys (`body`, `data`, `config`, `headers`, `params`, `auth`, `authorization`, `apiKey`, `token`, `secret`, `bearer`, `credentials`) that look like API keys, bearer tokens, OAuth secrets, or refresh tokens. Top-level descriptive fields (`name`, `description`) are intentionally NOT scanned to avoid false positives on documentation prose.
- `scanOasForUntrustedUrls` — flags HTTP boundary URLs (ApiNode endpoints) that point at non-allowlisted hosts.
- `scanOasForLlmBridgeWiring` — flags `/api/llm-bridge` ApiNodes missing the `agent_id` envelope field. This catches malformed bridge calls before compile or publish.

Both layers are required because:

- Layer 1 alone fails closed only as well as the model behaves. Models drift; jailbreaks exist; the deterministic backstop is non-negotiable.
- Layer 2 alone would let the chat conversation accumulate the literal credentials before the OAS is built. Those literals would persist in conversation history, server logs, and any other downstream consumer.

See `skills/chat-assistant-core/SKILL.md` (in the `assistant-skills` extension) for the assistant-facing credential-safety rules, `skills/chat-agent-authoring/SKILL.md` for the agent-authoring review primitive, and `packages/agents/src/validate-agent-json.ts` for the scan implementations.

## 5. ReviewFinding contract

All scans and advisory helpers return findings conforming to this exact TypeScript shape, exported from `packages/agents/src/validate-agent-json.ts`:

```typescript
export type ReviewFindingSeverity = "blocker" | "warning" | "suggestion";

export type ReviewFindingSource =
  | "deterministic"
  | "agent-planner"
  | "agent-security-reviewer"
  | "agent-code-reviewer";

export interface ReviewFinding {
  code: string;
  severity: ReviewFindingSeverity;
  message: string;
  location?: string;
  source: ReviewFindingSource;
}
```

Field semantics:

| Field | Required | Description |
|-------|----------|-------------|
| `code` | yes | Machine-readable identifier (e.g. `literal_secret_in_headers`, `untrusted_url`, `llm_bridge_missing_agent_id`, `naming_inconsistency`, `prompt_injection_risk`). |
| `severity` | yes | `blocker` aborts compile/publish. `warning` surfaces in the review response but does not block. `suggestion` is purely informational. |
| `message` | yes | Human-readable explanation. Must not echo literal secret values. The deterministic scan masks before formatting. |
| `location` | no | OAS JSON Pointer (e.g. `/components/2/configuration/headers/Authorization`) or filename when scanning multi-file artifacts. |
| `source` | yes | Identifies the producer. Deterministic scans always emit `"deterministic"`; advisory helpers emit their slug. The `agent_source_review` handler enforces this by post-processing helper findings to set `source` to the calling slug. |

`ReviewFinding[]` arrays are the canonical inter-layer payload. The `agent_source_review` handler returns three buckets (`blockers`, `warnings`, `suggestions`) partitioned by severity, plus `ranAdvisoryAgents: string[]` for observability.

## 6. reviewMode semantics

Two modes: exactly `"deterministic" | "advisory"`. A third mode, `"full"`, is reserved for `agent-smoke-tester` dispatch once that helper exists.

| Mode | Deterministic scans run | Advisory helpers dispatched | Current behavior | Use case |
|------|-------------------------|------------------------------|------------------|----------|
| `"deterministic"` | yes | never | Returns deterministic findings only; `ranAdvisoryAgents: []`. | Fast gate. Used by `agent_source_compile` and `agent_source_publish` internally. ~5ms. |
| `"advisory"` | yes (first) | deferred | Returns deterministic findings + one `advisory_dispatch_deferred` suggestion per helper that would have run; `ranAdvisoryAgents: []`. | Full review surface for the chat assistant. ~5ms while live dispatch is deferred. |

In `"advisory"` mode, the handler still short-circuits if deterministic scans return any blocker (no advisory markers emitted). Triviality (see § 7) is checked: trivial OAS bodies skip the planner deferred marker specifically but still receive security-reviewer and code-reviewer deferred markers.

**Why advisory is deferred:** the `agent_run` MCP primitive queues a BullMQ job and returns `{ runId, status: "queued" }` synchronously. It cannot return helper findings inline. Future work can wire a synchronous helper-execution surface, such as a direct `/api/llm-bridge` call against each helper's ApiNode body, and turn `ranAdvisoryAgents` into the real list of helpers that executed.

A future `"full"` mode is reserved for the deferred `agent-smoke-tester` helper, which would dry-run the agent against a sandbox.

## 7. Triviality predicate

An OAS body qualifies as **trivial** iff ALL of the following hold:

- No human-in-the-loop (HITL) `InputMessageNode` anywhere in the component tree.
- No `FlowNode` (i.e., no nested sub-flow).
- No `A2AAgent`-backed `AgentNode` (delegation to another LLM agent).
- No `MCPToolBox` whose `serverId` is not `"cinatra"` (i.e., no third-party MCP servers).
- ≤1 executable LLM/review step total. An executable step is an `AgentNode` whose `agent` is `Agent` (not `A2AAgent`) OR an `ApiNode`. `OutputMessageNode` does NOT count toward this total.

The planner helper's deferred marker is omitted for trivial OAS because there is nothing for it to plan. Security-reviewer and code-reviewer deferred markers are emitted on trivial OAS in advisory mode because credential and naming review remain useful even for small agents. Once synchronous helper execution is wired, those markers will be replaced by real findings; the size-independence of credential and naming review is preserved.

The predicate is implemented inline in `packages/agents/src/mcp/handlers.ts` (search for `isTrivialOas` near the `agent_source_review` handler).

## 8. Compile/publish gate

Both `agent_source_compile` and `agent_source_publish` invoke the deterministic portion of `agent_source_review` before any side effect (compilation cache write, registry upload, DB insert).

**Response shape on block** — extends the existing `{ error: string }` data return; does NOT throw:

```typescript
{
  error: string;             // human-readable summary, e.g. "review_blocked: 2 deterministic blockers"
  code: "review_blocked";    // discriminant for callers
  blockers: ReviewFinding[]; // the actual blockers (only — warnings/suggestions are not surfaced via this gate)
}
```

**Invariants:**

- The gate is **idempotent**. The same input produces the same response, no side effects either way.
- The handlers themselves are **not** idempotent. `agent_source_publish` writes to the registry; `agent_source_compile` writes a compilation cache. The gate runs strictly before any such write.
- The gate uses the deterministic-only path (`reviewMode: "deterministic"` semantics). Advisory dispatch is never invoked at publish/compile time. Advisory helpers are a UX surface for the chat assistant, not a publish blocker.

## 9. References

**Helper agents:**

- `agents/cinatra/agent-planner/cinatra/oas.json` — design-review helper. Returns plan-shaped suggestions over the OAS body.
- `agents/cinatra/agent-security-reviewer/cinatra/oas.json` — security-review helper. Surfaces fuzzy risks (prompt injection, scope bypass, over-broad permissions, leaked PII) beyond the deterministic lint.
- `agents/cinatra/agent-code-reviewer/cinatra/oas.json` — code-quality helper. Naming consistency, version bumps, package metadata completeness.

**Implementation:**

- `packages/agents/src/validate-agent-json.ts` — deterministic scans + `ReviewFinding` type export.
- `packages/agents/src/mcp/handlers.ts` — `agent_source_review` handler (search for `handleAgentSourceReview`), `agent_source_compile` gate, `agent_source_publish` gate, `isOasTrivial` predicate.
- `skills/chat-assistant-core/SKILL.md` (in the `assistant-skills` extension) — `## Credential safety` rules; `skills/chat-agent-authoring/SKILL.md` — `## When creating or updating an agent: the review primitive`.

**Tests:**

- `packages/agents/src/__tests__/scan-oas-literal-secrets.test.ts` — deterministic scan parity.
- `packages/agents/src/__tests__/scan-oas-untrusted-urls.test.ts` — deterministic scan parity.
- `packages/agents/src/__tests__/scan-oas-llm-bridge-wiring.test.ts` — deterministic scan parity.
- `packages/agents/src/__tests__/agent-source-review-handler.test.ts` — handler-level gate + advisory-deferred marker contract.
- `packages/agents/src/__tests__/helper-agents-packagename.test.ts` — helper presence + packageName parity.
- `packages/agents/src/__tests__/agent-source-review-gate.test.ts` — `review_blocked` gate behavior for `agent_source_compile` and `agent_source_publish`.

## 10. Deferred work

The following remain out of scope for this review primitive:

- **Synchronous helper execution from `agent_source_review` advisory mode.** `agent_run` queues via BullMQ and cannot return findings inline. The current implementation ships the deferred-marker stub described in § 3 instead. Wiring a synchronous helper-execution surface, such as a direct `/api/llm-bridge` call against each helper's ApiNode body, is the path forward.
- **Publishing the three helper agents to `registry.cinatra.ai`.** Helpers land as on-disk OAS files only; the `agent_save` MCP path (which requires `compiledPlan`, `inputSchema`, `taskSpec`) has not been exercised on them.
- **A fourth `agent-smoke-tester` helper** that would dry-run an OAS against a sandbox before publish. This helper would activate a future `reviewMode: "full"`.
- **Live UAT** for calling `agent_source_review` with `reviewMode: "advisory"` against a non-trivial OAS and confirming each helper returns real findings end-to-end after synchronous helper execution exists.
- **Legacy packageName retrofit** for adding `metadata.cinatra.packageName` to any older Flow-type reference agents that do not carry the field. The current parity tests require matching packageName values when the field is present; retrofitting older reference agents is separate from the review primitive.
