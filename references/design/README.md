# Designer Guide

The Cinatra Design System — what designers, product, and engineering need to know about how the product looks, what colours mean, and why.

This is the Cinatra design-system reference for contributors, alongside the [User](../../guides/user/README.md), [Admin](../../guides/admin/README.md), [Hosting](../../guides/hosting/README.md), [Developer](../../guides/developer/README.md), and [Model Context Protocol (MCP)](../mcp/README.md) guides.

---

## Quick links

- [Open the design system spec (HTML)](./design-system.html) — the normative reference, 1278 lines of palette / typography / contrast / component rules. Recommended view: open in a browser (`open references/design/design-system.html`).
- [Working with the design skill](./working-with-the-design-skill.md) — how Claude / Cursor / any agent applies the spec to real code, and what gates run on every commit.

## What's in here

| Page | Audience | Use when |
|---|---|---|
| [`design-system.html`](./design-system.html) | Designer · Brand · Marketing | You want to see the palette, typography, contrast tables, and component briefs at a glance. |
| [`working-with-the-design-skill.md`](./working-with-the-design-skill.md) | Engineering · Tooling | You're writing or reviewing UI and want to know which token to use, which scanner runs in CI, and what the binding "non-negotiables" are. |
| [`ui-design-system.md`](./ui-design-system.md) | Engineering | You need the implemented token system, theme structure, and the semantic↔raw mapping in code. |
| [`ui-patterns.md`](./ui-patterns.md) | Engineering | You are composing primitives and want the canonical patterns the app uses (Card vs `.soft-panel`, page shell, status pills, and the rest). |
| [`shadcn-components.md`](./shadcn-components.md) | Engineering | You need the shadcn/ui component catalog and how Cinatra extends/overrides it. |

## What's NOT in here

- **Code-level styling rules** — those live in `.agents/skills/design/SKILL.md` (the design skill, user-invocable via `/design`). The page in this guide describes how that skill works; the skill itself is the operational source.
- **The spec defect resolutions** (R1 running=indigo, R2 navy hairlines, R3 status retune, R4 fonts) — those live in `references/design/operational/01-resolutions.md`. The HTML below carries one known stale label (§IV red swatch's "running" tag). Designers reading the HTML should treat that label as drift and use indigo for running per [§VIII rule 4](./design-system.html) and the [design skill](./working-with-the-design-skill.md).
- **The token map** — see `references/design/operational/02-token-map.md`.

## How this guide stays current

When the spec is updated, re-run the validation harness in this repo:

```bash
node scripts/design/snapshot-tokens.mjs --check   # warns if token retune is needed
node scripts/design/scan-raw-colors.mjs           # warns if a new raw-color leak appears
node scripts/design/scan-status-render.mjs        # warns if a new ad-hoc status renderer appears
```

The design skill (`.agents/skills/design/SKILL.md`) is the **operational source** when the HTML and the resolutions conflict. The HTML carries one known stale label (§IV red swatch); the skill + resolutions doc are the binding rule when an agent is making a styling decision.
