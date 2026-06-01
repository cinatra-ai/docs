# Human-in-the-loop by design

Cinatra does not assume "automated" means "unattended." Real work — outreach, content, research, internal ops — needs people in the loop. Sometimes that means an approval gate. Sometimes it means a chance to edit one item before the whole batch goes out. Sometimes it means a reviewer who only sees the run when it asks for them.

Cinatra is built so those interruptions are first-class events, not bolt-ons. An agent can pause for a human, the human sees a typed surface tailored to the decision, and the agent picks up exactly where it left off when the human responds.

---

## What an HITL gate looks like

When an agent reaches a step that declares an human-in-the-loop (HITL) gate, three things happen:

1. The run pauses. Its state becomes `pending_approval`.
2. The platform emits an `INTERRUPT` event on the Agent-User Interaction Protocol (AG-UI) stream. The chat UI, the run page, and any subscribed Model Context Protocol (MCP) client see it at the same time.
3. The agent's `AgentCard` declares the **HITL screen** (a typed schema) the renderer should display. The chat UI loads the right screen automatically — a list editor for "review proposed contacts", a per-item editor for "edit each draft email", a yes/no confirmation for "ready to send."

The agent does not continue until a human acts. There is no timeout that auto-approves; there is no silent default.

## How a human responds

The HITL screen is interactive. Depending on what the screen declares, you can:

- **Approve as-is** and the agent continues with the values it proposed.
- **Edit** any field in place. The agent receives your edited values, not its own draft.
- **Reject** and the agent ends (or, if the flow declares a rejection branch, takes the rejection path).
- **Request changes** via free-text. The agent re-plans against your feedback and re-asks.

Each HITL screen is a typed contract. The schema lives on the `AgentCard` and is shipped to the renderer at run time. There is no hand-coded form per agent.

## Why prompt edits are not lost

When you edit a draft inside an HITL surface, your edit is not just consumed by the current run. If your admin has enabled skill autosave, the edit is captured into a per-user, per-agent **custom skill** that primes the next run of the same agent. Your phrasing, your examples, your exclusion lists — they accumulate over time instead of evaporating. See [Continuous learning and custom skills](continuous-learning.md) for how that capture is gated.

## Resume across the boundaries

The interrupt-and-resume contract works from any client that speaks AG-UI:

- Resume from the **chat UI** by acting on the screen inline.
- Resume from the **run page** for that run.
- Resume from a **remote MCP client** — Claude Code, ChatGPT connectors, an automation script — by calling the `agent_run_resume` primitive with the run ID and the human's response. See [Agent runs over MCP](../../references/mcp/agent-runs-over-mcp.md).

The run does not care where the resume comes from. The actor that resumes is recorded; the audit trail keeps the original requester and the resuming actor distinct.

## Safety boundaries the platform enforces

HITL is not just a UI convenience. The runtime enforces it:

- A `pending_approval` run cannot be silently advanced. The only way to continue is through the resume protocol.
- The resume actor is authorised against the run's owner and the resource's access policy. An unauthorised resume is denied with the same logic that denies an unauthorised read.
- The HITL screen schema is checked against the renderer's response. The agent receives validated values, not arbitrary client input.
- Long-running gates do not lose state. Page reloads, network drops, container restarts — the run stays at the same step and waits.

## Where HITL fits in different agent shapes

- **Approval gates.** A single yes/no before an expensive action — sending a campaign, publishing a blog post, posting to LinkedIn.
- **Batch editors.** Per-item review of a list — edit each of 50 drafts before the next step.
- **Filter / select.** Pick which N of M proposed candidates the agent should keep working on.
- **Context capture.** Mid-run questions the agent uses to fill in what was missing from the original brief.

A flow can declare more than one HITL gate. The runtime serialises them — gate one resolves, the flow continues, gate two appears.

---

## Where to go next

- How prompts you write inside HITL gates become reusable: [Continuous learning and custom skills](continuous-learning.md)
- The streaming event contract HITL rides on: [Open standards in Cinatra](../../references/platform/open-standards.md)
- The runtime that hosts long-running paused runs: [Durable workflows](durable-workflows.md)
