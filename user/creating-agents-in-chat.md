# Creating Agents in Chat

Most agents in Cinatra are not authored in a code editor — they are authored in a conversation. The platform's chat assistant can take a description like *"build me an agent that summarises a URL and asks me to approve the summary before saving it"*, walk you through the design, and end with a working agent installed in your workspace.

This page is the end-user guide to that flow. For the file-driven authoring loop (write `oas.json` directly, run the validator, open a PR), see [Developing agents](../developer/developing-agents.md).

> **Authorization:** the live source-authoring tools (`agent_source_write`,
> `agent_source_write_files`, `agent_source_compile`, `agent_source_publish`) are
> **admin-only**. When the chat user is NOT a platform admin, the assistant invokes
> `agent_creation_request_propose` instead — the proposal lands in an isolated
> `agent_creation_request` row at status `proposed` and surfaces at
> `/configuration/agents/approvals` for a platform admin to review. The author can edit and
> resubmit a rejected proposal via `agent_creation_request_edit`. Admin approval dispatches the
> existing gated publish under the admin's actor frame (private-scoped) — never the non-admin's.

---

## When to use chat authoring

Chat authoring is best when:

- You are starting from a problem statement, not a spec — "I want an agent that does X."
- The agent's behavior fits one of the patterns the platform already knows (single-step, flow with one or more human-in-the-loop gates, leaf reusable building block, orchestrator over sub-agents).
- You want the agent installed in your instance immediately and (optionally) published to the marketplace.

Use the file-driven loop instead when you are batch-editing many agents at once, or when the change is mechanical (rename, version bump, dependency update) and easier as a code change.

---

## The discovery-first principle

The chat assistant is trained to *not* author an agent from scratch until it has confirmed that no existing one (or composition of existing ones) already does the job. Before it offers to build anything new, it probes three tiers in order:

1. **Local** — every Open Agent Specification (OAS) Flow package already shipped on disk in your instance, plus DB-saved drafts.
2. **Marketplace** — packages searchable in your connected registries (typically `registry.cinatra.ai`).
3. **Remote** — other Cinatra instances or external agent-to-agent (A2A) protocol endpoints, if you have specifically named one.

If a candidate exists, the assistant tells you what it found and asks whether to install or use it instead of writing a new one. Installing from the marketplace is an admin operation done at `/configuration/marketplace`; the chat assistant will not silently install on your behalf.

Only after all three tiers turn up nothing relevant does the assistant offer to author a new agent — and it asks for explicit confirmation before any implementation tool fires. Until you confirm, it stays in "I could build…" language and does not write files.

---

## What the assistant actually produces

When you do confirm a new agent, the assistant produces three artifacts:

- **`oas.json`** — the OAS Flow file describing the agent (inputs, outputs, system prompt, nodes, control-flow + data-flow edges, human-in-the-loop (HITL) screen declarations). Lands at `agents/cinatra/<slug>/cinatra/oas.json`.
- **`package.json`** — the npm-style metadata (`name: "@<vendor>/<slug>"`, version, description, license). The `license` field is required because the publish gate runs SPDX detection. Lands at `agents/cinatra/<slug>/package.json`.
- **`SKILL.md`** — the agent's curated skill content, where the assistant captures any reusable guidance about how the agent should behave. Lands at `agents/cinatra/<slug>/skills/<slug>/SKILL.md`.

The `package.json` and `SKILL.md` are written together in a single atomic call to `agent_source_write_files`; the `oas.json` is written by a sibling call to `agent_source_write`. The vendor inside the `package.json` `name` is your instance namespace; the slug is the agent's machine-readable identifier.

The assistant chooses an agent **type** based on the shape of the request:

| Type | When the assistant picks it |
|---|---|
| `node` | Single-purpose self-contained step. No mid-run HITL gates (pre-run setup-field HITL still works). |
| `flow` | A flow with one or more mid-run HITL gates that pause execution for user input between steps. |
| `leaf` | A reusable building block — one AgentNode plus optionally one mid-run HITL gate — that other orchestrators can compose. |
| `orchestrator` | Coordinates two or more sub-agents through their `AgentCard` contracts. Declares `metadata.cinatra.agentDependencies` so the install path resolves the dep tree. |

---

## The review gate

Before any new agent can ship, it has to pass a **deterministic review gate**. The chat assistant runs it for you automatically — you do not need to invoke it by hand — but knowing what it does is useful when the gate blocks publish.

The gate is implemented as a single Model Context Protocol (MCP) primitive, `agent_source_review`, that runs a pure server-side lint over the package. It partitions findings into three buckets:

- **Blockers** — hard errors that prevent publish (malformed OAS, missing license, banned dependencies, etc.).
- **Warnings** — things the agent author should look at but that do not prevent publish.
- **Advisories** — informational notes about non-obvious patterns.

The gate is **idempotent**: byte-identical input produces byte-identical blockers across re-runs. The same gate runs again as a hard precondition inside `agent_source_publish` — you cannot publish an agent that fails the gate, regardless of which path you use to author it.

---

## Compile and publish

After the review gate passes, the chat assistant compiles the OAS Flow and (when you confirm) publishes the package.

**Compile** — `agent_source_compile` runs the OAS compiler over the package: it derives the runtime fields the platform needs (`inputSchema`, `outputSchema`, `approvalPolicy`, the compiled plan), syncs the matching `agent_templates` row, and registers any inline skills the agent declares.

**Publish** — `agent_source_publish` runs the deterministic review gate one more time, packs the tarball, resolves the destination credentials from `extension_destinations`, and pushes through the topology adapter for your `routingMode`. You pick the destination: **private** (your instance's own registry, the default) or **public** (the shared marketplace). The assistant will ask before it switches to public; private is the safe default for new work.

Once published, the agent is installable through the normal marketplace flow on your instance and on any other instance that can see the destination.

---

## What happens during a run

When you run a chat-authored agent — either from the `/agents` dashboard or by asking the chat assistant to run it for you — the same lifecycle applies as for any other agent:

- The platform spawns a run, returns a `runId`, and emits typed Agent-User Interaction Protocol (AG-UI) events on the server-sent events (SSE) stream.
- For agents with declared HITL screens, the run pauses at each gate, the surface renders in chat (or on the agent's run page), and the run resumes after you submit or approve.
- If skill autosave is enabled at your instance, the prompts you edit inside HITL surfaces during the run are captured at run completion and turned into a custom skill that primes the next run of the same agent for the same user. See [Continuous learning and custom skills](continuous-learning.md).

---

## Safety net: nothing implements without confirmation

The chat assistant is explicit about consent. Until you have confirmed "yes, build it," it stays in conditional language ("I could build…", "I would do this…") and does not call any tool that writes, compiles, or publishes a file:

- Read and search tools (`agent_source_list`, `agent_source_read`, `agent_list`, `extensions_search`, `agent_registry_list`) run freely.
- Write/compile/publish tools (`agent_source_write_files`, `agent_source_write`, `agent_source_compile`, `agent_source_publish`, the parallel skills primitives) only fire after explicit confirmation in the conversation.

The same rule applies to skill authoring and extension publishing through chat.

---

## Where to go next

- The file-driven authoring path (no chat, just `oas.json` + the validator): [Developing agents](../developer/developing-agents.md)
- What happens to your edits after a run: [Continuous learning and custom skills](continuous-learning.md)
- How the produced package reaches other instances: [Registry and marketplace](../configuration/marketplace.md)
- The open standards a chat-authored agent automatically speaks: [Open standards in Cinatra](../developer/open-standards.md)
