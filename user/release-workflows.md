# Release workflows

Some work isn't a single agent run — it's a multi-week process with a date everyone is driving toward. A product launch, a campaign, a compliance filing: scheduled checkpoints, content that has to be drafted, approvals that have to be signed, all anchored to one target date. A **release workflow** is Cinatra's first-class way to run that kind of process.

A release workflow is a calendar-driven plan — *not* an agent. It coordinates several kinds of step (checkpoints, agent-drafted content, human approvals, notifications, waits) on a timeline, and a durable engine advances it on its own: it runs each task when it's due and unblocked, dispatches agents for drafts, waits on approvals, and notifies the right people — across reloads, restarts, and the weeks in between.

The interface split is deliberate: **you create a workflow in chat; you manage it on the Gantt.**

---

## Create it in chat

Open `/chat` and describe the release in plain language — "Plan the Acme 2.0 launch, GA on September 1, drive everything off that date." The assistant either instantiates a reusable template or builds a plan from scratch, fills in the release-specific details, validates it, and shows you a preview.

The assistant is **proposal-only**. It drafts and revises the plan and answers read-only questions ("what's blocked? what's due next?"), but it never starts, approves, or rejects anything — those are human actions on the Gantt. When the draft is ready it hands you a deep link to manage it.

Two things it always needs: the **release/product name** and the **target date + timezone**. Everything else it can infer or ask for in a single round.

---

## Manage it on the Gantt

Every workflow has a detail page at `/workflows/<id>` (the index of all workflows is at `/workflows`, titled **Release Workflows**). The page is an interactive Gantt plus the controls to run it.

- **The timeline.** Tasks render as bars on a calendar in the release timezone, with dependency links between them. While a workflow is editable you can drag, resize, edit, and delete tasks and dependencies; every change is saved against the server's schedule resolver, so the dates you see are the dates the engine will use.
- **The target date.** A workflow is anchored to one date. Most tasks are scheduled *relative* to it ("7 days before release"), so moving the target date cascades the dependent dates — you'll see the shift previewed before you commit it.
- **Status and ownership** are shown at the top: a status pill (draft → active → paused → completed / cancelled / failed) and a scope badge for who owns it.

> Editing is allowed while a workflow is a **draft** or **paused** — see [Editing a running workflow](#editing-a-running-workflow) below.

---

## Run it: start, pause, resume, cancel

The controls on the detail page move the workflow through its lifecycle:

- **Start** activates the workflow; from then on the engine advances it automatically — running due tasks, dispatching agents, opening approval gates.
- **Pause** halts new dispatch without losing any state. In-flight evidence (agent runs, drafts, decisions) is preserved.
- **Resume** picks up exactly where it left off.
- **Cancel** stops the workflow and tears down its in-flight work deterministically.

Because the workflow lives in the database (not in a browser tab), it keeps running when you close the page — the same durability model as [durable agent runs](durable-workflows.md). A read-only **audit log** on the detail page records every dispatch, success, failure, retry, and approval as it happens, and the index page flags any task that has been **stuck** running past its expected window.

---

## Approvals

An **approval** task is a human gate. When its turn comes, the engine opens it, notifies the people whose scope is required to sign off, and holds everything downstream until a decision is made. Approvals are human-only — the chat assistant can never grant or reject one.

You act on approvals in two places: the **Approvals** inbox at `/approvals` (every pending approval across your organization, oldest first) or inline on the workflow's own detail page. A granted approval opens the gate; a rejection holds or skips the downstream branch depending on the workflow's policy.

This is the same human-in-the-loop philosophy used throughout Cinatra — see [Human-in-the-loop by design](human-in-the-loop.md). An agent-drafted task inside a workflow can *itself* pause for review; that surfaces as its own banner on the workflow page, separate from the workflow's approval gates.

---

## Editing a running workflow

Plans change mid-flight. You can **pause** an active workflow and edit it — re-time a task, add a step, fix a dependency — then resume.

Cinatra keeps the edit safe against the work that has already happened:

- Tasks that have already run (or are running) keep their history; you can still adjust their planning details (title, window), but their execution identity — what the task *does* — is frozen so the recorded evidence always matches what actually ran.
- You can't remove a task that already produced a run, draft, or decided approval; the edit is rejected rather than silently dropping evidence.
- If your edit changes the content an approval was granted against, that approval is automatically **reopened** for re-approval — a sign-off never silently applies to changed content.

In practice you edit freely; Cinatra only stops the specific changes that would rewrite history, and tells you which.

---

## Where this fits

- Reusable plans can be saved as **templates** and instantiated for the next release, so you're not rebuilding the same launch plan each quarter.
- Agent tasks inside a workflow run on the same engine as everything else in Cinatra and produce **draft artifacts** you review in place; external publishing is a separate, later step.

## Where to go next

- [Human-in-the-loop by design](human-in-the-loop.md) — the review/approve/resume model approvals build on
- [Durable workflows](durable-workflows.md) — why work survives reloads and restarts
- [Creating agents in chat](creating-agents-in-chat.md) — authoring the agents a workflow's `agent_task` steps dispatch
- The engine implementation: [Release workflows](../developer/release-workflows.md)
