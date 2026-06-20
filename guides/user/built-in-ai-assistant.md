# The built-in AI assistant

Most AI chat tools are separate from the software you work in. Cinatra's chat assistant is the opposite: it is built *into* the workspace and reaches every capability in it — the agents you have installed, the data your team has collected, the connectors wired to your external services. You interact with it the same way you would any chat tool, but it can actually take action, build things, and run on your behalf.

This page covers what the assistant can do and when each capability applies. It is a companion to the surface-level tour in [Workspace features](workspace-features.md).

---

## App-wide awareness, scoped to your access

The assistant does not work from a static training snapshot of your workspace. At runtime it can reach agents, connectors, skills, dashboards, data objects, artifact contents, and more — as the *you* who is signed in. If you cannot read a resource through the normal UI, the assistant cannot read it either.

Practically:

- Ask "what agents do I have installed?" and it queries the live agent list, not its memory.
- Ask "what's the status of my last outreach run?" and it fetches the actual run record.
- Ask "what leads are in my Q2 list?" and it reads the list through the same access check the UI uses.

This means the assistant's answers reflect the real state of your workspace at the time you ask. It also means the assistant's reach is bounded: it sees what you can see, nothing more.

For a full map of the capability fabric the assistant draws on, see [A connected ecosystem of capabilities](connected-ecosystem.md).

---

## Running agents from chat

The most common thing you will do with the assistant is dispatch an agent. Say what you need — "research the three companies I added yesterday", "draft a LinkedIn post about our launch", "check for new messages from the campaign thread" — and the assistant finds the right installed agent and runs it.

While the agent runs, a live run card appears in the conversation. You see steps ticking forward in real time. If the agent reaches a human-in-the-loop (HITL) gate — a draft to review, a batch to approve, a field to fill — the gate surfaces right there in the thread. You approve, edit, or reject without leaving the chat. The agent picks up immediately after.

When you are done with the thread, the run keeps going. Cinatra is built so runs survive page reloads and network drops; the notifications feed tells you when a long background run finishes. See [Durable workflows](durable-workflows.md) for how that persistence works.

When you schedule a run for later — or set one to repeat — its **schedule** can be mirrored into an external project-management tool like Plane, so the run shows up as a dated work item on a board or timeline your team already watches. Cinatra stays in charge of the actual schedule and execution; the PM tool is just the external view. See [PM-tool integration](pm-tool-integration.md).

For the HITL mechanics, see [Human-in-the-loop by design](human-in-the-loop.md).

---

## Building agents in conversation

If no existing agent does what you need, the assistant can build one. Describe what you want — "I want an agent that summarises a URL and asks me to approve the summary before saving it" — and the assistant walks you through the design and prepares the agent for you. Platform admins can publish directly after confirmation; if you are not an admin, the assistant submits a creation request that an admin reviews and approves.

The assistant probes for existing agents before offering to write one. It checks three tiers in order: agents already on disk in your instance, agents in connected marketplace registries, and remote agents reachable over the A2A protocol (if you have specifically named a remote endpoint). You only get a "build it from scratch" offer if all three come up empty.

For the full authoring flow — how the OAS file is structured, how the review gate works, how non-admin users go through a proposal path — see [Creating agents in chat](creating-agents-in-chat.md).

---

## Building workflows in conversation

A **workflow** is a calendar-anchored, multi-week process with scheduled tasks, agent-drafted content, and human approval gates. You describe the shape of the work — a product launch, a legal filing cycle, a quarterly review — and the assistant drafts the workflow, validates it, and hands you a deep link to the Gantt view where you manage, approve, and start it.

The assistant stays in the role of drafter and advisor. It creates and revises workflow proposals from chat; it answers read-only questions about status. Starting, approving gates, and cancelling runs happen on the Gantt — not in chat. This keeps the approval record on a surface where the full context is visible to the people who need it.

---

## Building dashboards in conversation

The assistant can create and update dashboards. Tell it what you want to see — "I want a dashboard with this week's agent run counts by type" — and it creates the layout, queries the semantic layer for the right data, and opens the result for you to review and publish. You can ask it to adjust the layout or swap a chart type in follow-up messages.

Publish and archive actions stay on the dashboard surface itself. The assistant hands off to the Gantt and dashboard pages for lifecycle operations that affect the whole team.

---

## Personal skills created from your edits

When an admin has enabled skill autosave for your instance, the edits you make inside HITL surfaces during agent runs are captured into **personal skills** — compact notes that prime the same agent the next time it runs for you. The assistant also lets you create and update personal skills directly from chat, outside of a run.

You do not need to manage these yourself. They accumulate quietly and shape how agents respond to you over time. See [Continuous learning and custom skills](continuous-learning.md) for how capture and matching work.

---

## Connected tools as live actions

When connectors are installed and authenticated — Gmail, Google Calendar, LinkedIn, WordPress, Drupal, GitHub, Apollo, Apify, and others — the assistant can drive them directly. Ask it to check your Gmail, work with a LinkedIn post, or edit a WordPress draft, and it calls the connector on your behalf, not just tells you how.

Each connector's operations are MCP primitives, so the assistant has the same access to them as any agent in your workspace. Credentials stay in Nango (the OAuth gateway); you connect once and every agent and the assistant share the same credential.

For how connectors fit into the workspace, see [A connected ecosystem of capabilities](connected-ecosystem.md).

---

## Files and artifacts

Attach files to your message with the **plus (+)** menu beside the prompt box. Readable file types (text, Markdown, PDF, images, within size limits) are passed to the model so it can work with the content directly. All types become **artifacts** the assistant and future agents can reference.

The assistant also creates artifacts on request. Ask it to "write me a blog post draft" or "create a brand voice document" and it finds the right artifact type, writes the content, and registers a reusable artifact in your workspace.

For how artifacts are versioned and how agents use them as inputs and outputs, see [Artifacts and files](artifacts-and-files.md).

---

## @-mentioning multiple assistants

A Cinatra workspace can have more than one assistant configured — your own instance assistant, assistants from other Cinatra instances connected over A2A, or external ones like `@chatgpt`. You bring them into a thread by @-mentioning their handle.

When you address more than one assistant in the same thread, the thread shifts to a **Slack-style multi-assistant layout**: each assistant's replies are labelled with its name and an icon, so you can read the conversation as a dialogue rather than a single stream. You can also address a single external assistant to make it the active respondent, without involving the built-in Cinatra assistant at all.

This works from the same chat surface — no special setup beyond the assistants being configured by an admin and the connectors to reach them being available.

---

## Project-scoped threads

If your workspace has projects enabled, a thread can belong to a specific project. Project-scoped threads are only visible to people who have access to that project (your admin controls whether this isolation is enabled for your instance). This lets you keep sensitive work — a legal review, a candidate pipeline, a confidential launch — in a thread that is only readable by the right people.

Moving a thread between projects is possible through the `chat_thread_update` action available from the assistant or any MCP client.

---

## What the assistant does not do

A few things that might look implied but are not shipped:

- **Connector authoring.** The assistant can use installed connectors and help you discover and configure them. It cannot write a new connector type from scratch in conversation.
- **Starting, approving, or cancelling workflow runs.** The assistant creates and revises workflow drafts. The Gantt surface owns start/approve/cancel.
- **Auto-approving HITL gates.** The resume action on a paused gate requires an explicit human action on the HITL surface. The assistant cannot approve a gate on your behalf.
- **Seeing data you cannot see.** The assistant's access is exactly your access. It cannot read resources another user has locked from you.

---

## Where to go next

- Authoring agents in detail: [Creating agents in chat](creating-agents-in-chat.md)
- The capability fabric the assistant draws on: [A connected ecosystem of capabilities](connected-ecosystem.md)
- How agent runs stay alive across reloads: [Durable workflows](durable-workflows.md)
- How your edits feed back into future runs: [Continuous learning and custom skills](continuous-learning.md)
- Attaching files and working with agent-produced documents: [Artifacts and files](artifacts-and-files.md)
- Using an external MCP client to reach your workspace: [Use Cinatra from Claude Desktop and Codex](mcp-clients.md)
