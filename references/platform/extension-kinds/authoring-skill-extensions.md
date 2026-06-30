# Authoring skill extensions

Audience: developers shipping a `kind: "skill"` extension — reusable know-how delivered to agents and the assistant.

A skill extension is **payload-only**: it ships one or more `SKILL.md` files and nothing else. There is no `register(ctx)` server entry, no host ports, and no schema migrations — a skill bundle declares no `serverEntry` at all. The host materializes the content into the skills catalog, records a durable `SkillSource`, writes each `SKILL.md` to disk, and runs agent matching so the right skills surface to the right agents and to the chat assistant.

## TL;DR

Ship a content package of `skills/<slug>/SKILL.md` directories — one directory per skill. The manifest's `cinatra.kind` is `"skill"` and `serverEntry` is omitted. On install the host adds catalog rows, stores the source content, mounts the skills for shell delivery, and prunes/rebuilds matches on uninstall/restore.

## File layout

```
extensions/<scope>/<slug>-skill/
├── package.json            ← cinatra.kind:"skill" (no serverEntry)
├── README.md               ← marketplace-ready README (gate-enforced)
├── LICENSE
└── skills/
    ├── <slug-a>/SKILL.md    ← one directory per skill
    └── <slug-b>/SKILL.md
```

Per-kind required files: `package.json`, `skills/<slug>/SKILL.md` (one directory per skill), the README, and a LICENSE.

## The manifest

A skill extension declares no server entry — the payload is the content:

```jsonc
{
  "name": "@acme/playbooks-skill",
  "version": "0.1.0",
  "cinatra": {
    "apiVersion": "cinatra.ai/v1",
    "kind": "skill"
  }
}
```

No `requestedHostPorts`, no `serverEntry`, no `migrationsDir` — a skill bundle reaches nothing privileged. If you need a skill to *act* (call tools, hit an external system), that capability belongs in a connector or agent the skill references, not in the skill content itself.

## What the kind contributes

The skill install unit is a content package → the skills catalog, a `SkillSource`, and an on-disk `SKILL.md` per skill. It contributes one `SKILL.md` per skill, catalog rows, durable source content, agent matching, and shell mountability. Skills are shell/assistant-delivered; a skill extension has no app route of its own. Uninstall removes the content and catalog rows and prunes skill matches; restore re-runs matching.

## Writing the `SKILL.md`

Each `SKILL.md` is the skill's content — the know-how an agent or the assistant loads when matched. Keep one skill per directory and one concern per skill. The matching runtime decides which skills are surfaced to which agents.

- **Skill matching** — how skills are matched to agents and the assistant: [Skill matching](../skill-matching.md).
- **Storage layout** — where `SKILL.md` content and catalog rows live: [Skills storage layout](../skills-storage-layout.md).
- **Shell skills** — skills mounted into the shell surface: [Shell skills](../shell-skills.md).

## Cross-kind concerns

The package shape, the `cinatra` manifest block, the README contract, and the conformance gates are shared across all kinds — see the [Extension authoring hub](../../../guides/developer/extension-authoring.md). Ship through [Extension publishing](../../../guides/developer/extension-publishing.md).

## See also

- [Extension kinds — choose your kind](./)
- [Extensions hub](../extensions.md)
