# Durable workflows

Most AI tools are optimised for a single chat session. Close the tab and the work is gone. Cinatra is built for the opposite case — work that takes minutes, hours, or days, survives the things that interrupt it, and tells you when it lands.

This page covers what "durable" actually means in Cinatra: where state lives, how reconnection works, how background completion notifies you, and how human-in-the-loop (HITL) pauses fit into the same model.

---

## State lives in Postgres, not the page

Every agent run is durable. The moment a run starts, the platform writes the run record to Postgres and the stream events to Redis Streams. The run page subscribes to those streams; closing the tab does not close the run.

What this means in practice:

- Page reload, browser restart, laptop sleep — the run is still going. Re-open the run page and it reattaches to the live stream.
- Network drop in the middle of the run — the Agent-User Interaction Protocol (AG-UI) subscriber replays from the last event you saw, so you never lose intermediate output.
- Container restart on the host (deploys, ops actions) — the run resumes from its last persisted step, not from the beginning.

The contract is "exactly-once persistence per step, replayable stream from any point." There is no hidden in-memory buffer that loses messages if the page closes.

## Background work tells you when it lands

Long-running agents don't expect you to watch the run page. Background work is owned by a queue runner on Redis; when the run finishes, the platform writes to the **notifications feed** at `/notifications`.

The feed is Postgres-backed and durable. Notifications survive sessions. The realtime push uses Postgres `LISTEN/NOTIFY` so notifications appear without polling.

What writes to the feed:

- Agent runs you started, when they complete or fail.
- Background jobs that fail (admins receive a copy).
- Extensions that explicitly post a notification.
- Platform events that affect resources you co-own.

The chat UI shows toasts for transient in-page feedback; the notifications feed catches everything else. If you only check Cinatra once a day, the feed is where you find out what happened.

## Pause and resume are part of the same contract

Long-running work and HITL gates are not separate features — they share the same persistence layer. When an agent pauses for human review, the run state becomes `pending_approval` and stays there indefinitely. The pause survives the same things the run does:

- Reload the page; the HITL screen is still waiting.
- Walk away for a day; the gate is still open when you come back.
- Resume from a different surface than where you started — chat UI, run page, or a remote Model Context Protocol (MCP) client. The actor that resumes is recorded distinctly from the actor that started the run.

For the HITL contract specifically, see [Human-in-the-loop by design](human-in-the-loop.md).

## A workflow you can leave running

Concretely, here's what "durable" looks like across a multi-hour run:

1. You start an outreach campaign at 9am from the chat UI. The agent says "starting research on 120 accounts."
2. You close the tab and head to a meeting.
3. The agent spends 45 minutes enriching contact data, calling large language model (LLM)-backed research, and drafting personalised emails.
4. At 9:50am the agent reaches a HITL gate: "Here are 120 drafts; please review."
5. You don't come back until 2pm. The drafts are still there; the run is still `pending_approval`.
6. You review and edit a few drafts on the run page. Your edits become a custom skill that will prime the next run.
7. You approve. The agent sends the emails through the Gmail connector.
8. At 2:08pm a notification appears: "Outreach campaign complete: 118 sent, 2 deferred for follow-up."

No part of that workflow required you to stay watching. None of the intermediate state was held in memory. A reload at any point would have caught up.

## When background completion is the only output

For some workflows you never need to watch the run at all. Examples:

- A nightly page-watcher agent that reports on what changed on a competitor's pages.
- A scheduled blog idea generator that proposes content topics every Monday.
- A trigger agent that runs on a Gmail event.

For these, the notifications feed is the only surface you interact with — the run completes, the notification appears, you click through to read the result. The run page exists for when you want detail; it does not exist because you have to babysit anything.

---

## Where to go next

- How HITL gates ride this same persistence: [Human-in-the-loop by design](human-in-the-loop.md)
- The capability fabric the runs operate on: [A connected ecosystem of capabilities](connected-ecosystem.md)
- How the same run can be inspected from any MCP client: [Cinatra over MCP](../../references/mcp/external-server.md)
