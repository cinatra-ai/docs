# Component Conformance Matrix

One row per spec §X component or system-canonical primitive in `src/components/ui/`. `compliant: Y` means the primitive matches the spec; `register` means an explicit row in `05-uncovered-ui-register.md` covers a deliberate deviation.

Status legend:

- `BASELINE` — initial non-conformant state for primitives that still need alignment.
- `READY` — conformant target state.
- `register` — see `05-uncovered-ui-register.md` row id.

| Component | Spec §X anchor | BASELINE | TARGET | Conformance rule |
|---|---|---|---|---|
| **Button** | Button — 7 variants, 5 sizes | indigo primary OK, destructive uses solid red | indigo primary, destructive red-on-tint not solid; `variant.default` carries `border-line-strong` per spec §III line 502 | Token-only changes; no API breaks. `compliant: Y` — primary-button navy stroke applied to filled variant only; outline/ghost/destructive keep their own borders. |
| **Card** | Card — surface/-strong, 10–12px | rounded-card already wired | unchanged | Non-interactive `--surface`; clickable `--surface-strong` per rule #8. |
| **Input** | Input — surface-strong, line-strong, 7px | partial — bg-surface-strong present, border via `--line` (grey) | switch border to `--line-strong` (navy) | Focus ring `--ring` (indigo). |
| **Textarea** | Input/Textarea family | same as Input | same as Input | — |
| **Select** | Select / Dropdown | inherits Input chrome | matches Input chrome on trigger; popover `--surface-strong` | Use scrollbar-thin on long lists. |
| **Dialog** | Dialog / Sheet — top: 4rem | starts above navbar | starts below 4rem navbar | Dim overlay; header uses etched paired-line rule. |
| **Sheet** | Dialog / Sheet | full-height OK | full-height; right-side default | Same as Dialog. |
| **Form / Field / Label** | Form — label 12px 600, helper 11px muted, gap 4–8px | mostly conformant | label 12px 600; helper text uses `--muted-foreground` | Error swaps helper to `--destructive` + `aria-invalid`. |
| **Badge** | Badge / LifecycleBadge | mixed renderers | Badge is the dumb chip; status semantics live in `StatusPill` | LifecycleBadge is re-implemented over StatusPill. |
| **Tabs** | Tabs — underline only, 2px indigo active | uses pill tabs in some places | underline-only with 2px indigo active | No pill tabs. |
| **Toolbar** | Toolbar — horizontal control surface below `<PageHeader>` / as top edge of a panel; ground = container, per-control borders forbidden; 24px-tall hairlines separate logical groups; search input is the only white interactive surface inside | primitive shipped (`src/components/ui/toolbar.tsx`); spec entry absent | per spec §X Toolbar: `bg-toolbar` ground, min-h-12, 7px container padding, 7px-radius controls; hover + selected = background tints (font weight + color constant); group hairlines via `<ToolbarSeparator>`; search via `<ToolbarSearchGroup>` + `<ToolbarSearchInput>` (only white surface inside) | Composition primitive — `Toolbar` / `ToolbarGroup` / `ToolbarSeparator` / `ToolbarButton` / `ToolbarSearchGroup` / `ToolbarSearchInput` / `ToolbarCount`. Replaces the panel-local section rule when used as a panel's top edge (see "toolbar replaces section rule" doctrine in `02-token-map.md`). Selected state uses `aria-pressed` on `<ToolbarButton active>`, not Radix `data-state="on"`. |
| **Separator** | Section rule — etched paired-line | single 1px grey line | new `.divider-etched` utility for major sections | Used inside `<Separator>` when `data-major` set, or via class. |
| **Table** | Table — header mono 10px 700 0.18em, body 13–14px, IDs/times mono 11px slate | header uppercase via inline classes | shared `TableHead` styled per spec | Right-align numerics/timestamps. |
| **PaginatedTable** | Table family | handles offset/sort/selection | inherits Table primitives + spec header treatment | — |
| **Toast (Sonner)** | Toast/Sonner — 5 variants + copy/close + icon-led | 4 variants (default/success/warning/error); no info; no copy action | 5 variants (add info); icon-led; Copy + Close on every toast | Newest on top; stack vertically. |
| **Alert** | Alert — tinted bg + border at status colour, 12–14px | partial — destructive only | 4 variants: default, info, success, warning, destructive | Inline alerts (`<Alert>`); never blocking. |
| **AlertDialog** | AlertDialog — destructive confirmations | OK shape | destructive default action uses `--destructive`; cancel uses `outline` | — |
| **Tooltip** | Tooltip — ink ground, cream text, 200ms delay | uses popover-style chrome | `--foreground` bg + `--background` text + 200ms delay | 12px text. |
| **Popover** | Popover — surface-strong, navy text | `--popover` token OK | `--surface-strong` bg, `border-line` strong, navy text | 13–14px text. |
| **Sidebar** | Sidebar — mustard fedora + Archivo wordmark in brand head | burgundy brand head | brand head uses `BrandMark`. The `src/components/ui/sidebar.tsx` primitive uses only semantic tokens (`bg-sidebar`, `text-sidebar-foreground`, `bg-sidebar-border`, `ring-sidebar-ring`) — `pnpm design:scan:raw` returns 0 hits. Fixture row added at `/design-fixtures`. | `compliant: Y` (token-conformant primitive + brand-mark composition). |
| **Command** | Command — cmdk, mono section labels, indigo soft-tint selected row | uses default cmdk styles | section labels 10px mono uppercase; selected row `bg-primary/8` | ⌘K trigger. |
| **Breadcrumb** | Breadcrumb — separator chevron, slate links, ink current | OK shape | chevron 12px 50% opacity; truncate middle if >4 crumbs | Never combine with tabs. |
| **Pagination** | Pagination — mono 13px, active ink fill, prev/next chevrons | uses default | mono `font-mono`, active `bg-foreground text-background`, line-bordered on white otherwise | Pair with "X of N" caption in mono. |
| **Avatar** | Avatar — 36–40px, random accent ground, italic 800 initial | uses muted bg + sans initial | random accent from `ExtensionAccent` palette; `font-display italic font-extrabold` initial | Per-user persisted accent; baseline OK when persistence is not present. |
| **Empty** | Empty — centred, dashed circle icon, 14px headline, 12px helper | OK shape | dashed-circle icon container + headline + helper + primary action | Always include single primary action. |
| **Skeleton** | Skeleton — surface-muted bars | OK | `bg-surface-muted` | — |
| **Spinner** | Spinner — indigo arc 1s linear | uses fg color | `--primary` arc, `1s linear infinite` | Only for <500ms inline waits inside buttons or icons. |
| **Accordion** | Components §X | OK | no major spec — keep existing chrome with `border-line` | register row if a deviation is required. |
| **Collapsible** | Components §X | OK | no major spec — keep | — |
| **Checkbox** | Checkbox/Radio/Switch — control 16–18px, indigo when on, surface-muted when off | OK shape | indigo when checked; surface-muted unchecked | — |
| **RadioGroup** | same | OK | same | — |
| **Switch** | same — switches reserved for immediate-effect | OK | indigo when on; surface-muted when off | Reserved for immediate-effect settings. |
| **InputGroup** | (composition primitive, not in spec §X but referenced) | OK | one continuous surface across addon + input | (existing convention preserved). |
| **InputOTP** | (composition primitive) | OK | inherits Input chrome | — |
| **ScrollArea** | (composition primitive) | OK | scrollbar-thin in long lists per Select spec | — |
| **Toggle** | (composition primitive) | OK | indigo when on | — |
| **ToggleGroup** | (composition primitive) | OK | same | — |
| **Calendar** | (date-picker primitive — Components §X mentions react-day-picker) | OK | tokens already routed | — |
| **Dropzone** | (Cinatra-specific upload primitive) | OK | inherits Input chrome | — |
| **StatusPill** | §VI status pills | DOES NOT EXIST | shipped from `../cinatra-design/src/components/ui/status-pill.tsx`; 10 states | The canonical status renderer. |
| **BrandMark** | §I — fedora + wordmark, mustard, sparkles in BOTH | shipped from `../cinatra-design/src/components/brand-mark.tsx` | Rebuilt as a single composed `<svg>` so wordmark sparkles can fire. 2 fedora sparkles via `<clipPath>` + 7 wordmark sparkles via `<mask>` (cross-browser-safe alternative to `<clipPath><text/></clipPath>`). Per-instance `safeId = useId().replace(/:/g, "_")`. Gradient fill set per-circle via JSX attr (CSS class fill cannot resolve per-instance unique IDs). Tone via Tailwind className → `currentColor`; `TONE_COLOURS` hex map removed. `@keyframes bm-spark` lives once in `globals.css`. No drop-shadow on wordmark (spec §I rule 5). `compliant: Y`. Used in sidebar brand head + auth chrome. | The canonical brand mark. |
| **ExtensionCard** | §V — emblem + random accent + indicator | DOES NOT EXIST | shipped from `../cinatra-design/src/components/extension-card.tsx` | The canonical extension tile in marketplace + lists. |
| **LifecycleBadge** | §X — paired with Badge | exists at `src/components/lifecycle-badge.tsx` | re-implemented over `StatusPill` | API kept; rendering delegates to StatusPill. |

---

## Conformance Condition

This matrix is complete when every row has its `BASELINE` annotation cleared and either reaches `READY` or an explicit register row in `05-uncovered-ui-register.md`. `StatusPill`, `BrandMark`, `ExtensionCard`, and the re-implemented `LifecycleBadge` are complete when each is `READY`.

## Implementation Reconciliation Rows

Conformant or contracted call-site surfaces:

| Component | What changed | Source |
|---|---|---|
| **PageHeader** | `size` / `tone` / `divider` props. Root element `<section>` → `<header>`. h1 className rebuilt to spec (Archivo italic 800 / -0.018em / `text-balance` / `text-foreground` default; `text-brand-mustard` per `tone="mustard"`). `compliant: Y`. | `src/components/page-header.tsx`. |
| **PageHeaderRule** | Tiny `"use client"` wrapper around `<Separator major decorative />`. Keeps PageHeader as a server component while satisfying the "use Separator not `<hr>`" shadcn rule. | `src/components/page-header-rule.tsx`. |
| **Button (primary stroke)** | `variant.default` gains `border-line-strong` per spec §III line 502. Outline / ghost / destructive variants keep their own border treatment. | `src/components/ui/button.tsx`. |
| **BrandMark** | Rebuilt as single composed `<svg>` with mask-gated wordmark sparkles. See row above. | `src/components/brand-mark.tsx`. |
| **`cinatra-brand.ts`** | Embed-bundle color sync: `accent` retuned to indigo, `accentHover` retuned, `line` retuned to navy-low-alpha, `logoColor` renamed to `wordmarkColor` + retuned to mustard. Deprecated `logoColor` alias remains for backwards compatibility. | `src/lib/cinatra-brand.ts`. |
| **Marketplace toolbar call-site** | `<Toolbar aria-label="Marketplace filters">` composes the kind filter group (`<ToolbarGroup>` of `<ToolbarButton active>` — the primitive emits `aria-pressed`, not ARIA tab semantics), a `<ToolbarSearchGroup>` with the search input, and an `<ToolbarButton asChild>` Upload action. Single white search surface, group hairlines via `<ToolbarSeparator>` — all per the Toolbar matrix row. | `packages/extensions/src/screens/extensions-marketplace-client.tsx`. |
| **Workflow detail Gantt-panel toolbar call-site (v6.16 contract — implementation lands in Phase 551)** | TARGET: `<Toolbar aria-label="Timeline controls">` rendered as the top edge of the Gantt panel (`workflow-gantt-panel.tsx`). Leading `<ToolbarGroup role="group" aria-label="Timeline view">` carries the Week/Month/Quarter/Year view switcher as `<ToolbarButton active>` (the primitive emits `aria-pressed`), bracketed by `<ToolbarSeparator>` and the conditional Read-only `<Badge>`; trailing `<ToolbarGroup>` carries Today + Fullscreen. State stays in `WorkflowGantt` (Gantt-local, no page-level hoisting); the page-level `<PageHeader>` and its lifecycle actions are unchanged because lifecycle/HITL/approval chrome may sit between the page header and the panel. CURRENT (pre-Phase-551): the same controls render as a flex row of `ToggleGroup` + outline `Button`s above the embed. | `src/components/workflows/workflow-gantt-panel.tsx`. |
