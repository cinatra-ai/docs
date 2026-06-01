# Token Map — semantic → CSS-var → Tailwind utility

Generated from `src/app/globals.css` + the resolutions doc.

This map is the single source of truth for "what utility class to use for X". Read this before touching any component.

---

## Surfaces

| Semantic role | CSS var (light) | Tailwind utility | Use when |
|---|---|---|---|
| Page background | `--background` `#f1f1ed` | `bg-background` | The body of the app — the warm cream behind everything. |
| Page surface | `--surface` `#f7f7f3` | `bg-surface` | Soft panels, presentation cards, stat tiles, palette swatches — anywhere a user does NOT touch. |
| Touchable surface | `--surface-strong` `#ffffff` | `bg-surface-strong` | Inputs, popovers, dropdowns, clickable cards — anywhere user input is invited. |
| Muted surface | `--surface-muted` `#e8e8e3` | `bg-surface-muted` | Secondary chrome — sidebar inactive, table zebra (NOT the seersucker stripe), inactive switches. |
| Accent soft | `--accent-soft` `#e6ede7` | `bg-accent` | Hover tint over interactive surfaces. |
| Stripe (mid) | `--stripe-mid` `#b8c4d4` | `bg-stripe-mid` | Seersucker zebra on alternate table rows. |
| Stripe (light) | `--stripe-light` `#e3e8ee` | `bg-stripe-light` | Same, lighter alternate. |

## Ink + structure

| Semantic role | CSS var | Tailwind utility | Use when |
|---|---|---|---|
| Primary text | `--foreground` `#15213a` | `text-foreground` | All body text, headlines, table cells, button labels. |
| Muted text | `--muted` / `--muted-foreground` `#5a6477` | `text-muted-foreground` | Captions, secondary text, column headers, sidebar group labels. |
| Hairline | `--line` `rgba(21,33,58,.14)` | `border-line` | Card borders, table row dividers, input strokes. |
| Section rule | `--line-strong` `#15213a` | `border-line-strong` | Etched paired-line section dividers, primary button strokes, table head underline. |

### Doctrine — Toolbar replaces section rule

Source: `../design-system.html` §Dividers + §Toolbar (line 1070 onward).

When a `<Toolbar>` (`@/components/ui/toolbar`) sits directly below `<PageHeader>` or as the top edge of a panel, **it replaces the section rule for that view**. Do not stack a toolbar and the etched paired-line `<Separator major>` rule — either visual band counts as the divider, and pairing the two doubles the chrome.

Scope: the toolbar replaces the **panel-local** section rule. `<PageHeader divider>` stays unchanged when lifecycle / HITL / approval chrome sits between the page header and the toolbar-fronted panel — the toolbar replaces the *panel's* divider, not the page header's. Pairing `<PageHeader divider={false}>` with a toolbar that sits immediately under the page header is still correct where there is no intervening chrome (see the marketplace at `packages/extensions/src/screens/extensions-marketplace-client.tsx`).

## Accents (status + brand)

| Semantic role | CSS var | Tailwind utility | Use when |
|---|---|---|---|
| Primary action / running / focus | `--primary` `#364e81` | `bg-primary text-primary text-primary-foreground` | Filled buttons, focus rings, links, running pill, indigo focus halo. Running is indigo, NOT red. |
| Destructive / failed / declined | `--destructive` `#a6384f` | `bg-destructive text-destructive text-destructive-foreground` | Decline button, failed pill, terminal errors. **NEVER `running`.** |
| Approved / success | `--success` `#3F6E6B` | `bg-success text-success text-success-foreground` | Approved pill, positive metric deltas. |
| Warning / on hold / needs you | `--warning` `#C79545` | `bg-warning text-warning text-warning-foreground` | On hold pill, needs-review badge, mustard "needs you". |
| Info / scheduled / queued | `--info` `#364E81`, same as `--primary` | `bg-info text-info text-info-foreground` | Informational notices, scheduled, queued, neutral pills. |
| Logo / burgundy mark | `--logo-color` `#7a2e3a` | (inline, brand only) | The bare cinatra wordmark/logo color (existing, embed-bundle scope). |
| Brand mustard (display) | `--brand-mustard` `#c79545` | `text-brand-mustard` `bg-brand-mustard` `border-brand-mustard` | Page-title display when `<PageHeader tone="mustard">` is opted in, and the cinatra wordmark on light surfaces. **Separate from `--warning`** so status semantics are not hijacked by brand chrome. Same hex today; the two tokens are decoupled and may drift independently. |

## Radius

| Semantic role | CSS var | Tailwind utility | Use when |
|---|---|---|---|
| Card chrome | `--r-card` `1rem` | `rounded-card` | Top-level page chrome (`<Card>` from `@/components/ui/card`). |
| Panel | `--r-panel` `0.875rem` | `rounded-panel` | Inner panels (`.soft-panel`). |
| Control | `--r-control` `0.625rem` | `rounded-control` | Buttons, inputs, selects. |
| Chip | `--r-chip` `0.5rem` | `rounded-chip` | Badges, status pills, small chips. |
| Full | (n/a) | `rounded-full` | Status pills (per `status-pill.tsx`), avatars. |

## Typography

| Semantic role | CSS var | Tailwind utility | Use when |
|---|---|---|---|
| Body sans | `--font-sans` (Inter) | `font-sans` (default) | All body text, form labels, buttons, table cells. |
| Display | `--font-display` (Archivo) | `font-display` | Headlines, wordmark, drop-caps, brand mark, italic 800 numerics. |
| Mono | `--font-mono` (JetBrains Mono) | `font-mono` | Table headers (uppercase), IDs, timestamps, microcopy, code. |
| Body sm | `--text-sm` `0.875rem` (14px) | `text-sm` | Body baseline. |
| Body base | `--text-base` `1rem` (16px) | `text-base` | Card heading baseline. |

## Shadows

| Semantic role | CSS var | Tailwind utility |
|---|---|---|
| Soft | `--shadow-soft` | `shadow-sm` (project mapped) |
| Strong | `--shadow-strong` | `shadow-strong` |

---

## Forbidden patterns

These will be caught by `scripts/design/scan-raw-colors.mjs`:

- Raw hex colors anywhere in `src/**.{tsx,ts,css}` outside the allowlist.
- `bg-white`, `bg-black`, `bg-gray-*`, `bg-slate-*` (use surface tokens).
- `text-gray-*`, `text-slate-*` (use `text-foreground` / `text-muted-foreground`).
- `border-gray-*`, `border-slate-*` (use `border-line` / `border-line-strong`).
- `dark:bg-*`, `dark:text-*` — semantic tokens already adapt; hand-rolled `dark:` overrides are forbidden.

## Allowlisted exceptions

Tracked in `scripts/design/allowlist-raw-colors.json`:

- SVG icon stroke/fill that uses `currentColor` (passes scanner naturally).
- `src/lib/cinatra-brand.ts` constants (the literal brand path data).
- `src/components/extension-card.tsx` ACCENT palette (data-driven random accent).
- `next-themes` programmatic theme classes.
