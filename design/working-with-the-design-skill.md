# Working with the design skill

The design skill (`.agents/skills/design/SKILL.md`) is how Claude, Cursor, and any other agent applies the Cinatra design system to real code. This page explains what the skill enforces, how the validation harness works, and where the binding rules live.

The skill is user-invocable: `/design` from a Claude Code session.

---

## Operational sources (in order)

When an agent or human is making a styling decision, they consult:

1. **`docs/design/operational/01-resolutions.md`** — owner deviations (D1 Inter body, D2 dark legacy) + spec-defect resolutions (R1 running=indigo, R2 navy hairlines, R3 status retune, R4 Archivo display + JetBrains Mono).
2. **`docs/design/operational/02-token-map.md`** — semantic role → CSS var → Tailwind utility cheat sheet.
3. **`docs/design/operational/03-conformance-matrix.md`** — per-component target state.
4. **`docs/design/operational/04-exception-policy.md`** — recorded deviations + forbidden-exceptions list.
5. **`docs/design/operational/05-uncovered-ui-register.md`** — UI elements the spec does not cover.

The HTML spec ([`design-system.html`](./design-system.html)) is the **normative reference for designers**. The five evidence files are the **operational source for agents and engineers** because the HTML carries one known stale label (§IV red swatch tags red as "running"; running is indigo per [R1](operational/01-resolutions.md)).

---

## Non-negotiables

These rules are gating. The scanners enforce them; CI fails when they're violated.

1. **No UI removal.** Never delete or restyle-by-guess a UI element because it does not fit the spec. Add a register row first (see [register taxonomy](operational/05-uncovered-ui-register.md)).
2. **Running = indigo** (R1). Red is destructive-only. The §IV "red running" label is stale; do not apply it.
3. **No colors outside tokens.** Every color in `src/**` must be a semantic token (`bg-primary`, `text-foreground`, `border-line`, etc.) or an allowlisted exception in `scripts/design/allowlist-raw-colors.json`. Raw hex codes in `.tsx`/`.ts`/`.css` outside the allowlist will fail `pnpm design:scan:raw`.
4. **JetBrains Mono for microcopy / IDs / table headers** (R4 + spec §IX 3). Use `font-mono`.
5. **Inter body deviation** (D1). Do NOT introduce Archivo as body text. Use `font-display` for headlines, the wordmark, drop-caps, brand mark, and italic 800 numerics only.
6. **Dark must-not-regress** (D2). Do NOT add hand-rolled `dark:` overrides on primitives; the semantic token palette already adapts. If a primitive needs different visual handling in dark mode, add a register row.
7. **Status semantics flow through `StatusPill`.** Never hand-roll a status pill with raw color classes (`bg-emerald-50` + `text-emerald-700` etc.). Use `<StatusPill status="approved">` and let the central adapter (`src/lib/status-adapter.ts`) map your domain enum.

---

## Validation harness

Four gates run on every commit (or every `pnpm design:scan` invocation):

| Gate | Command | What it does |
|---|---|---|
| Raw-color scanner | `pnpm design:scan:raw` | Fails on any unallowlisted hex / oklch / rgba / banned Tailwind palette utility in `src/**`. Allowlist at `scripts/design/allowlist-raw-colors.json`. |
| Status-render scanner | `pnpm design:scan:status` | Fails when any site outside `src/lib/status-adapter.ts` or `src/components/ui/status-pill.tsx` hand-rolls a status pill with raw color classes for the canonical status words. |
| Chart-color scanner | `pnpm design:scan:charts` | Surfaces hard-coded recharts series colors. Non-gating; the register owns the policy. |
| Token snapshot | `pnpm design:tokens:check` | Fails when the `:root` / `.cinatra` / `.dark` / `@theme inline` token surface drifts from the committed baseline snapshot. |

All four ride on `pnpm typecheck` as the deltaless gate.

Aggregated: `pnpm design:scan` runs raw + status + charts in sequence.

To intentionally change tokens (e.g. owner-approved palette tweak), update the source CSS and run `pnpm design:tokens:write` to refresh the baseline, then commit the new snapshot alongside the CSS change.

---

## When to add a register row

If you're about to style a UI element that the spec does not cover (e.g. a Cinatra-specific visualization, a niche admin widget, a third-party component wrapper), you **MUST** first add a row to `docs/design/operational/05-uncovered-ui-register.md` with the surface (file path), the issue, and a taxonomy code:

- `ADOPT_NEAREST_RULE` — spec doesn't name this element, but the nearest spec rule applies cleanly.
- `KEEP_LEGACY_FOR_NOW` — element is functioning, doesn't match spec, untouched.
- `EXTERNAL_COMPONENT_BOUNDARY` — third-party component, cinatra doesn't control chrome.
- `DEPRECATED_BUT_NOT_REMOVED` — on path to deprecation, still wired.
- `NEEDS_OWNER_DECISION` — conflict requires owner input. Frozen.
- `NEEDS_SPEC_EXTENSION` — spec is silent on a load-bearing element. Frozen.

Only then write the styling. A change that lacks a register row will be reverted at code review.

---

## Composition with the shadcn skill

The design skill **composes with** `.agents/skills/shadcn/SKILL.md` — they do not overlap.

- **Design skill** owns *what color* and *what semantic*. The non-negotiables above, the token map, the register procedure, and the validation harness.
- **shadcn skill** owns *how to compose* and *how to add*. The component CLI (`pnpm dlx shadcn@latest add <component>`), the registry conventions, the variant CVA shape.

When a primitive needs token-only changes, consult the design skill. When a primitive needs API changes or a new variant, consult the shadcn skill. Most primitive work touches both.

---

## When the spec drifts

When the spec (`design-system.html`) is updated, rerun the harness. The five evidence files in `docs/design/operational/` remain authoritative for agents — if the new HTML conflicts with a recorded resolution, the resolution wins until the owner updates the resolutions doc.

---

## `.liner-notes` utility

For prose surfaces that match spec §IX 5 (run summary, campaign retrospective, post-mortem write-up), wrap the prose in a `<div className="liner-notes">`. The utility provides:

- 2-column flow with a navy hairline column rule (collapses to 1 column under 480px).
- Burgundy italic-800 drop-cap on the first paragraph's first letter (Archivo, `var(--cinatra-red)`).
- JetBrains Mono small-caps on the first paragraph's first line.

The utility is opt-in — never auto-apply to a body region. The fixture row at `/design-fixtures` shows the rendered output as a visual reference. The uncovered UI register records the adoption rationale.

## Design reconciliation updates

The design system includes tokens, primitives, scanners, and the design fixtures page. The deployed implementation has been reconciled with the spec for four call-site surfaces:

### New token — `--brand-mustard`

The dedicated brand mustard token (`#c79545`) lives at `:root` + `.cinatra` and is bound through `@theme inline` as `--color-brand-mustard`. Use `text-brand-mustard` / `bg-brand-mustard` / `border-brand-mustard` for page-title display and wordmark on light surfaces. **Always go through `<PageHeader tone="mustard">` — never inline `text-brand-mustard` on a raw h1.** The token is deliberately separate from `--warning` (same hex today but decoupled) so page-title brand chrome cannot hijack status semantics.

The global `.cinatra h1` font-family rule does not own PageHeader typography; PageHeader's h1 className owns page-title typography end-to-end.

### PageHeader — three new props

`<PageHeader>` (`src/components/page-header.tsx`) gains:

- `size?: "sm" | "md" | "lg"` (default `"lg"` = 38px). `"md"` = 30px for action-heavy admin/settings/detail subpages with long titles; `"sm"` = 24px for nested sub-screens.
- `tone?: "ink" | "mustard"` (default `"ink"` = `text-foreground`). `"mustard"` = `text-brand-mustard`, opt-in per route for brand-y top-level pages.
- `divider?: boolean` (default `false`). When `true`, renders `<PageHeaderRule />` beneath the header block — a tiny `"use client"` wrapper around `<Separator major decorative />` so PageHeader itself stays a server component.

The root element is `<header>` for cleaner semantics. The h1 className is `font-display italic font-extrabold leading-[1.05] tracking-[-0.018em] text-balance` + per-size `text-[24px]` / `text-[30px]` / `text-[38px]` + per-tone `text-foreground` / `text-brand-mustard`.

Default for every route today is `size="lg"` + `tone="ink"`; opting routes into mustard or md requires design review.

### PageHeaderRule — server/client split

`src/components/page-header-rule.tsx` is a tiny `"use client"` file rendering `<Separator major decorative />`. PageHeader imports it and renders conditionally on `divider`. Inlining the Separator into PageHeader itself would force the `"use client"` directive onto PageHeader, which would drag every PageHeader call site (~70 imports across `src/app/`) onto a client boundary unnecessarily.

### BrandMark — single composed SVG with mask-gated wordmark sparkles

`src/components/brand-mark.tsx` is one composed `<svg>` with `<defs>` for the radial-gradient sparkle glow, a `<clipPath>` for the fedora silhouette, and a `<mask>` for the wordmark glyphs. The mask approach (rather than `<clipPath><text/></clipPath>`) is cross-browser safe; Safari can render clip-on-text incorrectly. Wordmark sparkles render inside the composed SVG so the sparkle group can reach the glyphs.

Sparkle architecture:

- 2 fedora circles inside `<g clipPath transform>` at source coords (220,160)/(340,215).
- 7 wordmark circles inside `<g mask>` at viewBox coords (66,32)/(85,36)/(104,32)/(130,36)/(158,32)/(183,34)/(207,36).
- Each circle's `fill={`url(#${gradId})`}` is bound per-circle as a JSX attribute. CSS `fill: url(#id)` does not resolve per-instance unique IDs.
- `safeId = React.useId().replace(/:/g, "_")` — colon-bracketed IDs are illegal in SVG fragment IRIs across some browsers.
- `@keyframes bm-spark` is defined once in `src/app/globals.css` (4s cycle, 10% duty, irregular delays). No per-instance `<style>` block.
- `prefers-reduced-motion: reduce` disables the animation; `variant="static"` is the build-time opt-out.

### Drop-shadow decision

Spec §I rule 5 forbids drop-shadows on the wordmark. The owner-reference SVG includes one. Resolution: omit (follow the rule). The component defaults to no drop-shadow; an approved override can add a `filter:` style to the `<text>` element and must record the deviation in the operational design docs.

### `cinatra-brand.ts` color refresh

`src/lib/cinatra-brand.ts` is the single source of truth for embed-bundle colors. The live `.cinatra` theme values are `accent #364e81`, `accentHover #2d416c`, and `line #15213a14`. `wordmarkColor` is mustard `#c79545`; a deprecated `logoColor` alias keeps existing internal consumers (WordPress + Drupal widget bundle routes) working, with their visuals automatically shifting to spec-correct mustard.

### Editorial-boundary register row (HISTORICAL)

The blog draft editor `EDITORIAL_COMPONENT_BOUNDARY` carve-out is
retired — the legacy editor file (`src/lib/blog/draft-editor.tsx`) was
deleted with the rest of the `/assets/asset-blog/*` route tree. The
replacement editing surface (the `artifact-edit-text` portlet on the
blog-content-workflow extension's dashboard) renders inside the standard
`<PageHeader>`-owned chrome, so the scanner no longer needs the
carve-out. Future drift detection still focuses on second h1s or a
spec-extension for content-preview h1 rules.
