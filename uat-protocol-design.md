# Real UAT Protocol Design

Status: PARTIAL - Track A scaffolded (5/16 visible-human-in-the-loop (HITL) fixtures, 3/5 passing). Track B not yet started.

This document captures the UAT protocol for autonomous agent runs and the
implemented test surface that remains useful for completing it.

## Track A - Playwright `/agents/run` UAT

**Goal:** click "Run" for every agent at http://localhost:3000/agents/run,
fill in every HITL form, click "Continue", assert terminal status.

**Built:**

- `playwright.agents-run.config.ts` - project layout (auth setup -> preflight -> agents-run)
- `tests/e2e/agents-run/fixtures.ts` - canonical visible-agent set + the
  authored HITL fixtures (e.g. skill-recommender, trigger-agent)
- `tests/e2e/agents-run/hitl-actions.ts` - `awaitPendingApproval`,
  `driveHitlScreen` (dispatches by `xRenderer`), `waitForRunCompletion`,
  `assertExpectedOutputs`, plus per-renderer advance helpers
- `tests/e2e/agents-run/agents-run.spec.ts` - parameterized runner that
  iterates `AGENT_FIXTURES`

**Passing fixtures:**

- `skill-recommender-agent`
- `trigger-agent`

**Still to add (11 of 16 visible-HITL):**

Per `DEFER_PREREQ_AGENTS` in `fixtures.ts`, the following are deferred because
they require prerequisite state (campaignId, draftBundleRef, etc.) that the
test harness doesn't yet seed:

- `auditor-agent` (needs data + parentPackageName context)
- `email-recipient-selection-agent` (needs campaignId)
- `email-drafting-agent` (needs campaignId + confirmedRecipients)
- `email-follow-up-agent` (needs campaignId + followUpDays)
- `email-delivery-agent` (needs full chain prerequisites)
- `email-test-delivery-agent` (needs campaignId)
- `email-outreach-agent` (orchestrator - drives 9 HITL screens)
- `list-curator-agent` (external dependency + prereq)
- `reviewer-agent` (sub-agent - requires draftBundleRef OR followupBundleRef)
- `blog-linkedin-publish-agent`, `blog-wordpress-publish-agent`
  (external dependency - require live LinkedIn/WordPress connector setup)

Add a seeding helper (`tests/e2e/agents-run/seed.ts`) that creates a campaign +
draft bundle before running these fixtures. The seeding can use the existing
`objects_save` Model Context Protocol (MCP) path.

## Track B - Chat-MCP UAT

**Goal:** test running all agents through `/chat`, using the same product path
that starts an agent run from a chat thread.

**Built:**

- `tests/e2e/agents-run/chat-mcp-fixtures.ts` - `(packageName, prompt,
  agentFixture)` triples that pair a specific chat prompt with a Track A
  fixture's HITL screen sequence
- `tests/e2e/agents-run/chat-mcp.spec.ts` - adaptive runner that:
  1. POSTs the prompt to /api/chat (SSE)
  2. Parses the stream for a `cinatra_<slug>` or `agent_run` tool result
  3. Extracts the runId
  4. Navigates to the run detail page
  5. Drives HITL gates via Track A's `driveHitlScreen` helpers (skipping
     gates the chat auto-resolved by passing the input via the tool call)
  6. Polls for terminal status + asserts
- New `chat-mcp` Playwright project in `playwright.agents-run.config.ts`

**Passing fixtures:**

- `skill-recommender-agent`
- `trigger-agent`

Track B has parity with Track A on the surviving fixtures. The remaining work
is fixture coverage, not a chat-MCP framework issue.

**Design:**

The chat path is non-deterministic by design: a large language model (LLM) picks tools based on
the user's natural-language prompt. To make it testable:

1. **Prompt library** - `tests/e2e/chat/prompts.ts` mapping each agent to a
   prompt that should trigger it (e.g. media-feed-lister: "List the latest
   episodes from https://example.com/feed.xml").

2. **Chat fixture** - `tests/e2e/chat/chat-mcp.spec.ts` that for each agent:
   - Opens `/chat`
   - Creates a new thread (or uses a fresh one)
   - Types the prompt into the chat input
   - Sends
   - Polls the thread for an `agent_run` tool call
   - Asserts the agent run reaches terminal status (completed or
     pending_approval)

3. **Tool-call assertion** - Use `mcp__cinatra__chat_thread_get` (the existing
   MCP read tool) to inspect the thread's messages and look for an
   `agent_run` tool call with the expected `packageName`. If the LLM picks
   the wrong tool, fail the test with a clear error so the prompt can be
   improved.

4. **HITL handling** - If the agent reaches `pending_approval`, the test
   can either accept-with-defaults via the MCP `agent_run_resume` tool, or
   navigate to the run's detail page and reuse the Track A `driveHitlScreen`
   helpers.

**Risks:**

- LLM non-determinism: same prompt may pick different tools across runs.
  Mitigation: use very specific prompts that name the agent or its inputs
  unambiguously.
- Cost: each chat invocation costs LLM tokens. For all agents, this is real
  money per CI run. Mitigation: gate the suite to a manual trigger or weekly
  schedule.
- Tool selection blast radius: a buggy prompt might invoke an external API
  agent (LinkedIn publish, email send) with real side effects. Mitigation:
  use clearly-sandboxed inputs (example.com URLs, dev@example.com emails)
  and verify every prompt by hand before adding to the suite.

## Implementation Notes

The setup-loop HITL chain fix established the expected behavior across the chat
panel, `/agents/run` panel, server-side review-task actions, and the
`resolveWayflowXRenderer` gate-index walker.

Key implementation constraints:

- Editing source Open Agent Specification (OAS) without republishing can break the WayFlow (Cinatra's OAS Flow agent runtime) mount for that
  agent.
- HITL chain repair must stay consistent across the chat panel, `/agents/run`
  panel, server-side review-task actions, and the `resolveWayflowXRenderer`
  gate-index walker.
