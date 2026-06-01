# Extension README contract

Every Cinatra extension under `extensions/cinatra-ai/<slug>/` ships a marketplace-ready `README.md` written in the same register OpenAI uses for its workspace agent template descriptions. Short. End-user-facing. Value-forward. The marketplace renders it next to the extension's one-line `description` in `package.json` / `oas.json` — they coexist.

The shape is the same for every kind. The content interpretation differs per kind. The gate at `scripts/audit/extension-readme-gate.mjs` enforces the structure. Wired in CI by `extension-readme-gate.yml`.

## Scope

- **In scope:** every directory `extensions/cinatra-ai/<slug>/` whose `package.json` declares `cinatra.kind` ∈ `{agent, connector, artifact, skill, workflow}`.
- **Out of scope:** the second-vendor tree `extensions/ossflywheel/`, plus any directory without a `package.json#cinatra.kind`.
- **Root-level only:** the gate validates exactly `extensions/cinatra-ai/<slug>/README.md`. Nested READMEs are out of scope.

## Audience

End user installing the extension from the marketplace. Same register as the OpenAI workspace agent template UI: a name, a value-forward description, the apps the extension integrates with, and the concrete user-outcomes you can accomplish with it. Nothing else.

## The shape (the same for every kind)

```markdown
# <Display name>

<Value-forward description paragraph — 1 to 4 sentences, plain end-user language,
in the OpenAI workspace agent template register: what the extension is and what
the user gets from installing it.>

## Works with    (OPTIONAL — omit when no meaningful user-visible integration list exists)

- <Integration name 1>
- <Integration name 2>

## Capabilities

- <Concrete user-outcome verb-phrase 1>
- <Concrete user-outcome verb-phrase 2>
```

That is the entire shape. Nothing else may appear in a README.

## Per-kind content interpretation

The shape is one across all kinds. The CONTENT you put in each section differs per kind.

### Agent

- **Description.** What task or outcome the agent delivers, in plain user language. Example: *"Prepare a high-signal operating brief from schedule, inbox, and team-chat context."*
- **Works with.** External apps / services the agent talks to. Derive from OAS toolboxes, the agent's connector dependencies, SKILL.md references, and inferable integrations from the code. Omit if the agent is pure-LLM with no external integrations.
- **Capabilities.** Concrete user-facing tasks the agent performs. Verb-phrases. Example: *"Triage and prioritize a support issue"*, *"Draft a customer-facing response"*.

### Connector

- **Description.** What external service this connector brings into Cinatra and what value it unlocks for the user.
- **Works with.** List the external apps or surfaces the connector bridges, when meaningful (e.g. a Google OAuth connector unlocks Gmail / Calendar / YouTube; an MCP-client registry connector lists the user-recognizable clients like Claude Desktop, ChatGPT). Omit when the connector is a direct 1:1 adapter for the named service (e.g. a Gmail connector for Gmail).
- **Capabilities.** Concrete user actions the connector enables once configured. Verb-phrases. Example: *"Send email on your behalf"*, *"Find and reply to messages in your inbox"*.

### Artifact

- **Description.** What kind of content or document this artifact represents and when a user would encounter it.
- **Works with.** Visible agents / workflows / surfaces that create or use the artifact, when there is a clear user-visible list. Omit otherwise.
- **Capabilities.** What the artifact helps a user do. Example: *"Reuse a polished draft across publish targets"*, *"Hand off a brief to a downstream agent"*.

### Skill

- **Description.** What kind of work the skill improves and for which kinds of users.
- **Works with.** Agents or workflows the skill benefits, when there is a clear user-visible list. Omit otherwise.
- **Capabilities.** Improvements the skill enables. Example: *"Match brand voice in generated content"*, *"Suggest screen-grabs at decision moments"*.

### Workflow

- **Description.** End-to-end outcome the multi-step workflow delivers.
- **Works with.** Apps / connectors / agents involved across the stages.
- **Capabilities.** User-facing outcomes — a mix of the overall outcome and the meaningful per-stage outcomes. Verb-phrases.

## Authoring rules (gate-enforced)

| Rule | Enforcement |
|---|---|
| File is plain Markdown (`.md`) | Filename + parse |
| No YAML/TOML frontmatter | Reject `---\n…\n---` and `+++\n…\n+++` at the top |
| No raw HTML | Reject any `<tag…>` outside fenced code blocks and inline code spans |
| Exactly one `<h1>` | Exactly one line matching `^# ` outside code fences |
| Description paragraph before any `<h2>` | At least one non-empty paragraph between the H1 and the first H2 |
| Only `Works with` and `Capabilities` H2s | Any other H2 → FAIL |
| No `<h3>`–`<h6>` | Any deeper heading → FAIL |
| If `Works with` is present, it comes BEFORE `Capabilities` | Ordering enforced |
| `Works with` (if present) has ≥1 bulleted item | One integration is enough |
| `Capabilities` is present and has ≥2 bulleted items | The marketplace card always promises multiple capabilities |
| Section bodies are bullet lists | No prose paragraphs / no bold pseudo-sections inside `Works with` or `Capabilities` |
| No italic-only tagline block directly under the H1 | The description paragraph IS the lede; an all-emphasis block under H1 fails |
| Size 250–2500 bytes | Lower bound prevents stubs; upper bound keeps the README marketplace-sized |

## What does NOT go in a README

Anything that would make the README read as developer documentation:

- Setup steps, credentials, env vars, OAuth scopes, dashboards
- Operations enumerations, internal API surface, function or symbol names
- Inputs / outputs schemas, OAS field references
- Dependency lists (`@cinatra-ai/...` package names)
- "Required before use" / "Required by" graphs
- Internal code paths, file paths, DB schema, repo URLs
- Phase numbers, GSD workstream IDs, milestone tags, PR references, commit SHAs
- "How we built this" architectural notes
- Compile / publish / Verdaccio mechanics
- Examples of inputs / outputs / structured JSON
- Limitations / known-issues sections
- Approval-gate enumerations or human-in-the-loop checklists
- One-line italic taglines under the H1

Developer / maintainer content has a home: `docs/developer/<topic>.md`. The extension README is not that home.

## Staged debt

The contract is strict from day one. Because no READMEs existed when the gate landed, every currently-README-less extension carries one empty marker file: `extensions/cinatra-ai/<slug>/.readme-pending` (0 bytes). The gate state machine:

| Has `README.md` | Has `.readme-pending` | Result |
|---|---|---|
| Yes | No | Validate the README |
| No | Yes | Pass — known debt, awaiting authoring |
| No | No | **FAIL** — untracked missing README |
| Yes | Yes | **FAIL** — stale marker; remove `.readme-pending` |

A `.readme-pending` outside `extensions/cinatra-ai/<slug>/` is an **orphan marker** and fails the gate. Markers must be exactly 0 bytes.

The debt set may only **shrink**. After the gate is in place no PR may add a new `.readme-pending` marker (enforced via `--no-renames` git diff vs the merge base; self-bootstrapping carve-out for the seed PR).

Authoring a README and removing its marker happens in the same commit:

```sh
${EDITOR} extensions/cinatra-ai/<slug>/README.md
git rm extensions/cinatra-ai/<slug>/.readme-pending
```

## See also

- [developer guide index](../../guides/developer/README.md)
- [Extensions — engineering reference](./extensions.md)
- [Building TypeScript packages for extensions](../../guides/developer/building-packages.md)
- [Extension lifecycle and distribution](./extension-lifecycle.md)
- `scripts/audit/extension-readme-gate.mjs` — the gate
- `.github/workflows/extension-readme-gate.yml` — CI
