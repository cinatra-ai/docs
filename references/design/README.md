# Designer Guide

The Cinatra Design System — what designers, product, and engineering need to know about how the product looks, what colours mean, and why.

This is the Cinatra design-system reference for contributors, alongside the [User](../../guides/user/README.md), [Admin](../../guides/admin/README.md), [Hosting](../../guides/hosting/README.md), [Developer](../../guides/developer/README.md), and [Model Context Protocol (MCP)](../mcp/README.md) guides. Contribution work is planned with GSD ("Git. Ship. Done", the open-gsd spec-driven development framework) — see [Contributing](../../guides/developer/contributing.md#planning). <!-- source-leak-allow -->

---

## Quick links

- [Open the design system spec (HTML)](./design-system.html) — the full palette / typography / contrast / component reference. This page is a **published mirror** (see [Canonical source](#canonical-source)) — read it here, but don't hand-edit it. Recommended view: open in a browser (`open references/design/design-system.html`).
- [Working with the design skill](./working-with-the-design-skill.md) — how Claude / Cursor / any agent applies the spec to real code, and what gates run on every commit.

## Canonical source

`design-system.html` is a **published mirror**: a byte-for-byte copy of Cinatra's canonical design-system spec, served at `docs.cinatra.ai/references/design/design-system.html`. The single canonical, editable source is that upstream spec; this file is republished from it and is authoritative **as published**.

- **Do not hand-edit `design-system.html` here** — changes are overwritten the next time it is synced from the canonical spec. To change the design system, change the upstream spec.
- Drift between this mirror and the canonical spec is caught by a CI gate on the upstream source, which fails when the two diverge — so what you read here tracks the canonical spec rather than silently going stale.

## What's in here

| Page | Audience | Use when |
|---|---|---|
| [`design-system.html`](./design-system.html) | Designer · Brand · Marketing | You want to see the palette, typography, contrast tables, and component briefs at a glance. |
| [`working-with-the-design-skill.md`](./working-with-the-design-skill.md) | Engineering · Tooling | You're writing or reviewing UI and want to know which token to use, which scanner runs in CI, and what the binding "non-negotiables" are. |
| [`ui-design-system.md`](./ui-design-system.md) | Engineering | You need the implemented token system, theme structure, and the semantic↔raw mapping in code. |
| [`ui-patterns.md`](./ui-patterns.md) | Engineering | You are composing primitives and want the canonical patterns the app uses (Card vs `.soft-panel`, page shell, status pills, and the rest). |
| [`shadcn-components.md`](./shadcn-components.md) | Engineering | You need the shadcn/ui component catalog and how Cinatra extends/overrides it. |

## What's NOT in here

- **Code-level styling rules** — the binding non-negotiables (R1 running=indigo, R2 navy hairlines, R3 status retune, R4 fonts, and the rest), the token map, and the CI scanners are documented directly in [`working-with-the-design-skill.md`](./working-with-the-design-skill.md) in this repo.

## How this guide stays current

When the spec is updated, re-run the validation harness in this repo:

```bash
node scripts/design/snapshot-tokens.mjs --check   # warns if token retune is needed
node scripts/design/scan-raw-colors.mjs           # warns if a new raw-color leak appears
node scripts/design/scan-status-render.mjs        # warns if a new ad-hoc status renderer appears
```

The [`design-system.html`](./design-system.html) mirror is the **normative reference as published** — its single canonical source is the upstream design-system spec it is republished from (see [Canonical source](#canonical-source)). [`working-with-the-design-skill.md`](./working-with-the-design-skill.md) records how that spec is applied to code (the owner deviations + resolutions); on a genuine conflict between the two, stop and request owner reconciliation.
