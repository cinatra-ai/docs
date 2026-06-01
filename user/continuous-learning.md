# Continuous Learning and Custom Skills

A workflow that runs the same agent every week, but the prompts you type during the human-in-the-loop reviews drift each time — better word choices, examples that work for your buyers, a specific exclusion list. The next run starts cold and you re-type half of it. The run after that starts cold again.

Continuous learning closes that loop. When skill autosave is enabled, Cinatra captures the prompts you wrote during a human-in-the-loop pause and consolidates them into a **custom skill** scoped to you and that agent. The next run starts pre-tuned: your skill is matched into the agent's prompt context automatically, so the agent already knows the patterns you taught it last time.

This page covers what gets captured, where the captured content lives, who controls it, and how to disable it. For the broader skills story (how skills get matched, who can own them, the catalog) see [Concepts and glossary](concepts.md#skill).

The chat-side selector that lets you pick a custom skill on a human-in-the-loop (HITL) field is currently wired in for the `campaign-email-outreach` agent's HITL surfaces — the rest of the loop (capture, storage, match injection on the next run) applies to any agent. Expansion of the in-HITL selector to additional agents is an ongoing surface widening.

---

## How capture works

The capture path runs once at the end of every successful agent run, in `runSkillAutosaveOnRunCompletion`:

1. The run completes and transitions to status `completed`.
2. The autosave hook reads every HITL prompt the user edited during that run (excluding any prompt the user explicitly opted out of via the field-level autosave toggle).
3. For each distinct `agentId` that received non-excluded prompts, the hook calls `createOrUpdateCustomSkillForAgent`.
4. That function uses the large language model (LLM) orchestration layer to consolidate the captured prompts into a focused `SKILL.md` snippet — a short, declarative skill scoped to **this user × this agent**.
5. The skill is persisted with a `based_on:` YAML frontmatter listing the IDs of the base skills the matcher considered when building this custom skill, so the provenance back to the matched-skill set is intact.
6. On the next run of the same agent for the same user, the platform's skill-matching engine picks up the custom skill alongside the catalog skills and injects it into the agent's prompt context.

The capture is non-blocking: a failure in autosave never blocks the run's `RUN_FINISHED` event from firing or the user from seeing the run's output. Any failure logs a warning and the run completes normally.

---

## What gets captured, what doesn't

Captured:

- HITL prompt text that the user *edited*. The captured content is the user's edit, not the agent's default placeholder.
- Per-agent fan-out — if a run had multiple agents in its flow (an orchestrator with sub-agents, for example), each agent receives its own custom skill, capturing the prompts the user edited inside that specific agent's HITL surface.

Not captured:

- Prompts the user did not edit (the default placeholder stays the default).
- Prompts marked with the per-field autosave-opt-out toggle in the HITL surface (when users are allowed to configure this — see the admin controls below).
- Anything outside the HITL prompt surface — chat messages, agent outputs, tool calls, etc.

---

## Owners and visibility

A custom skill defaults to **personal** scope — just for you, on the agent it was captured from. From there, the same scope-aware resolver the platform uses for any extension lets you make it available more broadly:

- **Personal** (the default) — only you can use it.
- **Team** — anyone on a team you grant access.
- **Project** — anyone with access to the project, through the project's grant model.
- **Organization** — everyone in your organization.
- **Workspace** — everyone in the workspace.

Promoting a custom skill to a wider scope follows the standard skill ownership controls — the platform never promotes automatically; you decide.

In the common single-user case, the captured skill is `User`-owned and visible only to the user that ran the agent. In team or organization-shared workflows, the resolver writes to the higher tier so the captured pattern is reusable by the rest of the team — never silently demoting the skill to a less-shared scope.

The captured skill carries:

- A generated display name (e.g. *"Personal preferences for `<agent-name>`"*).
- A `based_on:` frontmatter list of the base skill IDs the matcher saw when this custom skill was built.
- A `display_name` frontmatter line matching the resolved display name (kept in sync on every overwrite so legacy listings reflect the latest title).
- The skill content itself — a short Markdown body the LLM generated from the captured prompts.

When the same user runs the same agent again and edits more prompts, the custom skill is *updated in place*, not replaced — the platform reads the existing skill, merges the new captured prompts, and writes back. Run-by-run drift accumulates into a single living skill rather than a noisy pile of one-shot files.

---

## Where in the UI

- **`/skills`** — All your installed skills, including any custom skills the autosave hook has created. Custom skills show their `based_on:` provenance in the detail view.
- **`/configuration/skills`** (admin-only) — Skill autosave controls (see below) live here, alongside the catalog and match configuration.
- **Inside a HITL surface** — when custom skills are available for an agent that wires in the personal-skill selector (today, the email-outreach campaign agent), the relevant prompt fields show an `x-renderer: "personal-skill"` picker so you can attach, swap, or detach a custom skill on the fly. The picker lists the user's installed + custom skills relevant to that agent.

---

## Admin controls

Skill autosave is off by default. Enable it under **Administration → Skills → Skill autosave** (`/configuration/skills`). The three knobs on `SkillAutosaveConfig`:

- **`enabled`** — master switch. When false, the autosave hook short-circuits as a no-op before any database read. No prompts are captured.
- **`userCanConfigure`** — when true, non-admin users can toggle the autosave opt-out on individual prompt fields inside the HITL surface (per-field, per-run). When false, the per-field toggle is hidden and admin-level policy applies uniformly.
- **`userCanSeeIndicator`** — when true, non-admin users can see the autosave-active indicator on the HITL surface (a small affordance showing the field will be captured). When false, the indicator is hidden from non-admins. Admins always see it. If `userCanSeeIndicator` is false, `userCanConfigure` is forced false too — you can't toggle what you can't see.

The settings are stored in the `connector_config` table under the `skill_autosave` key and read synchronously on every HITL render and on every run-completion. Changes take effect immediately for new HITL surfaces and the next run-completion hook.

---

## Why personal, not shared by default

The captured prompts represent the user's editing style — phrasing, examples, exclusion lists, the way they prefer to write to their own audiences. Capturing those into the team-shared or org-shared skill catalog by default would force everyone else's runs to inherit one person's voice. Personal scope keeps the captured pattern useful to the editor without contaminating the shared catalog.

If you decide a custom skill is useful to the whole team, you can promote it to a higher scope manually through the standard skill ownership controls — but the platform doesn't make that decision for you.

---

## Where to go next

- The conceptual model: [Concepts and glossary](concepts.md#skill)
- The chat-driven agent authoring flow that creates the agents these skills attach to: [Creating agents in chat](creating-agents-in-chat.md)
- How the skill catalog is matched to agent runs in general (rules, scoring, the `match_when` engine): [Workspace features](workspace-features.md)
