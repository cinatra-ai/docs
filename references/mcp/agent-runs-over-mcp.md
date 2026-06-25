# Agent runs over MCP

This page is the operational guide for starting, polling, and resuming an agent run from any Model Context Protocol (MCP) client — Claude Code, a ChatGPT connector, or a curl-driven script. It covers the standard run lifecycle and the human-in-the-loop (HITL) resume pattern.

---

## The five-step lifecycle

1. **List available agents.** Call `agent_list` (or `agent_source_list` for source-form agents) to see what's installed.
2. **Read the definition.** Call `agent_source_read` with the package name to inspect inputs and expected behavior. Optional but recommended — the platform's chat assistant always does this first.
3. **Start a run.** Call `agent_run` with the required inputs. The result is `{ runId, status: "queued" }`.
4. **Poll until terminal or paused.** Call `agent_run_get` with the `runId` every 3–5 seconds until `status` becomes `"completed"`, `"failed"`, or `"pending_approval"`.
5. **Read the result.** Call `agent_run_messages_list` to retrieve the full message history and structured outputs.

A successful run terminates at step 4 with `status: "completed"` and the outputs visible at step 5. A failed run terminates with `status: "failed"` and an error message in the messages list. A run that needs human input pauses at `pending_approval` — see the next section.

## HITL resume

When `agent_run_get` returns `status: "pending_approval"`, the agent is waiting at an HITL gate. The response carries the renderer hint (which screen schema the agent declared) so a client that can render it knows what to draw.

To resume from MCP:

1. Render the screen yourself, or hand the gate off to the platform's UI by surfacing the run URL.
2. Collect the human's input.
3. Call `agent_run_resume` with:
   - `runId` — the run to resume.
   - `userResponse` — optional, a structured response (typically `JSON.stringify` of the renderer's payload). Takes precedence over `approvalNote` when both are set.
   - `approvalNote` — optional, free-text note used when `userResponse` is absent. Falls back to `"[Approved by operator]"` when both are missing.
4. Resume polling with `agent_run_get` until terminal.

The platform's UI renders HITL screens automatically when you open the run page for that `runId` — most MCP clients that can't render typed surfaces just deep-link to that page and let the human respond there.

External Agent-User Interaction Protocol (AG-UI) / agent-to-agent (A2A) protocol clients (not MCP clients) have a separate resume surface at `POST /api/a2a/resume`, which is gated by `CINATRA_AGUI_EXTERNAL_ENABLED=true` and takes `reviewTaskId` + `values`. MCP and A2A resume are independent paths; choose based on which client you have.

For the deeper model of how HITL gates work, see [Human-in-the-loop by design](../../guides/user/human-in-the-loop.md).

## Streaming vs polling

The MCP surface is polling-shaped. `agent_run_get` returns the current state; you call it until the state changes. There is no MCP "subscribe to event stream" primitive — that would conflict with MCP's request/response transport.

The streaming AG-UI event channel exists alongside MCP. It's reachable at `{CINATRA_BASE_URL}/api/agents/runs/{runId}/stream` as Server-Sent Events (the canonical browser SSE route, with `Last-Event-ID` resume). See [Open standards in Cinatra](../platform/open-standards.md) for the event types (`RUN_STARTED`, `TEXT_MESSAGE_CONTENT`, `TOOL_CALL_START`, `INTERRUPT`, `STATE_SNAPSHOT`, `RUN_FINISHED`).

Most MCP clients don't need the streaming channel — polling at 3–5 second intervals is fine for runs that take seconds to minutes. The streaming channel matters when you want to surface intermediate text or tool calls to a watching user.

## Stopping a run

Call `agent_run_stop` with the `runId` to cancel an in-progress run. The platform transitions the run to the `stopped` terminal state and the background job halts after its current step.

Bulk stop is available as `agent_runs_stop` (note the plural) — for stopping every run for a given agent template.

## Listing past runs

`agent_run_list` returns a paginated list of runs for the actor's scope of access. Filter by agent template, by status, by time range. The list is the same one the platform's `/agents` UI uses.

`agent_run_trigger_get` / `agent_run_trigger_set` / `agent_run_trigger_delete` manage scheduled triggers for an agent — cron-style schedules or event-driven triggers. The trigger model is documented inside the agent runtime, not on this page; see [Architecture](../platform/architecture.md) for the BullMQ (a Redis-backed job queue)-backed scheduler.

## What the resume actor is recorded as

When a remote MCP client resumes a HITL gate, the actor envelope on the resume call carries the calling client's identity, not the original requester's. Both are recorded distinctly. The audit trail shows "started by X, resumed by Y."

This is intentional — when an automation script resumes a gate without a human, the audit trail makes the automation responsibility visible.

---

## Where to go next

- The HITL contract on the user side: [Human-in-the-loop by design](../../guides/user/human-in-the-loop.md)
- The streaming event channel: [Open standards in Cinatra](../platform/open-standards.md)
- The full primitive catalog: [The external MCP server](external-server.md)
