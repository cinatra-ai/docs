# Uncovered-UI Register

Every UI element the spec does not cover gets a row here. **No restyling-by-guess** — the user mandate forbids it.

## Taxonomy

| Code | Meaning |
|---|---|
| `ADOPT_NEAREST_RULE` | Spec doesn't name this element, but the nearest spec rule applies cleanly. Documented and executed. |
| `KEEP_LEGACY_FOR_NOW` | Element is functioning, not blocking, but doesn't match the spec. Untouched; revisitable. |
| `EXTERNAL_COMPONENT_BOUNDARY` | The component is owned by a third-party library; cinatra does not control its chrome. Documented; untouched. |
| `DEPRECATED_BUT_NOT_REMOVED` | Element is on a path to deprecation but is still wired. Untouched, functioning, register row only. |
| `NEEDS_OWNER_DECISION` | Conflict requires owner input. Frozen until decided. Owner-facing summary in the row. |
| `NEEDS_SPEC_EXTENSION` | Spec is silent on a load-bearing element; spec must extend before this can resolve. Frozen until decided. |

## Closing condition

Zero rows in `NEEDS_OWNER_DECISION` or `NEEDS_SPEC_EXTENSION` at close, or each has an owner-facing summary ready for review. All `ADOPT_NEAREST_RULE` rows are `applied: Y`.

---

## Rows

### Recharts chart palette

- **Category:** `ADOPT_NEAREST_RULE`
- **Surfaces:** `src/components/ui/chart.tsx`, every dashboard chart consumer
- **Issue:** Spec §IV defines a 6-color accent palette (mustard / burgundy / red / sea-green / indigo + slate). It does NOT define a chart palette. Repo today uses `--chart-1..5` oklch tokens unrelated to the spec accents.
- **Resolution:** Map `--chart-1..5` to the spec accent palette in this order: indigo / sea-green / mustard / burgundy / red. Slate (`#5A6477`) is reserved for the muted color and is omitted from the chart palette to keep series visually distinct. This is the **interim canonical chart policy**; if the spec later defines a different chart palette, that supersedes.
- **Status:** `applied: Y` (`:root` + `.cinatra` `--chart-1..5` now `#364e81 / #3f6e6b / #c79545 / #7a2e3a / #a6384f`). `.dark` chart palette left untouched; revisit only if dark mode is redesigned. `scripts/design/scan-chart-colors.mjs` remains non-gating evidence-only.

### `lifecycle-badge.tsx`

- **Category:** `ADOPT_NEAREST_RULE`
- **Surfaces:** `src/components/lifecycle-badge.tsx`, all call sites
- **Issue:** `LifecycleBadge` predates `StatusPill`. Two renderers for similar status semantics violates the "one canonical status renderer" rule.
- **Resolution:** Re-implement `LifecycleBadge` as a thin wrapper over `StatusPill`. Existing call sites keep their `<LifecycleBadge>` JSX; the renderer maps the lifecycle enum to a `StatusPillStatus` via `src/lib/status-adapter.ts`.
- **Status:** `applied: Y` (`LifecycleBadge` now imports `StatusPill` and maps `active → approved`, `archived → archived`. Tested via `src/lib/status-adapter.test.ts` `lifecycleStatusToPill` cases). The raw-palette `cva` variants are gone.

### `@daveyplate/better-auth-ui` chrome

- **Category:** `EXTERNAL_COMPONENT_BOUNDARY`
- **Surfaces:** all auth pages
- **Issue:** Auth UI is owned by `@daveyplate/better-auth-ui`. Tokens are theme-aware via shadcn tokens, but cinatra doesn't control the chrome.
- **Resolution:** Documented; untouched. Auth pages receive token retunes automatically.

### Marketing surfaces (`/`, public landing)

- **Category:** `EXTERNAL_COMPONENT_BOUNDARY`
- **Surfaces:** `src/app/page.tsx`, any marketing copy
- **Issue:** Marketing surfaces have a different design intent (sales-oriented) from the in-product design system.
- **Resolution:** Documented; in-product `.cinatra` themed surfaces are the focus. Marketing surfaces are out of scope.

### QueueDash (BullMQ board)

- **Category:** `EXTERNAL_COMPONENT_BOUNDARY`
- **Surfaces:** `src/app/settings/operations/jobs/[[...slug]]/page.tsx`
- **Issue:** `@queuedash/ui` ships its own chrome; tokens flow through shadcn but the layout is third-party.
- **Resolution:** Documented; untouched.

### `katex` math rendering

- **Category:** `EXTERNAL_COMPONENT_BOUNDARY`
- **Surfaces:** any markdown rendering that includes math
- **Issue:** KaTeX CSS comes from `node_modules/katex/dist/katex.min.css`.
- **Resolution:** Documented; untouched.

### Sparkles animation (BrandMark)

- **Category:** `ADOPT_NEAREST_RULE`
- **Surfaces:** `src/components/brand-mark.tsx`
- **Issue:** The animated BrandMark uses a custom keyframe `bm-spark` not in the global token system. Reduced-motion compliance is not built in.
- **Resolution:** Add `@media (prefers-reduced-motion: reduce)` override in `brand-mark.tsx` that disables the sparkle animation. The variant `static` is the static fallback per the existing API.
- **Status:** `applied: Y` (`@media (prefers-reduced-motion: reduce) { .bm-spark { animation: none; opacity: 0; } }` shipped inline with the `bm-spark` keyframe).

### Sidebar burgundy brand head

- **Category:** `ADOPT_NEAREST_RULE`
- **Surfaces:** `src/components/app-sidebar.tsx` brand head
- **Issue:** Spec §I says the wordmark + fedora is mustard `#C79545`. The sidebar used `--logo-color: #7a2e3a` (burgundy).
- **Resolution:** Sidebar brand head replaced with `<BrandMark tone="mustard" variant="animated" size={28}>` for the expanded rail; collapsible-icon state drops back to the bare `<CinatraLogo>` to preserve the 32px chip without the wordmark.
- **Status:** `applied: Y`.

### Etched paired-line section divider utility

- **Category:** `ADOPT_NEAREST_RULE`
- **Surfaces:** Major page section dividers, dialog headers, table-head underline
- **Issue:** Spec §III + §X (Dialog) call for "etched paired-line dividers" (2 navy hairlines 1px each, 5px gap). The current `<Separator>` ships a single grey hairline.
- **Resolution:** `.divider-etched` utility class in `globals.css` provides a 7px height with a linear-gradient of 1px navy + 5px transparent + 1px navy. `<Separator major>` opts into the utility. Table head underline routes to `--line-strong`. Existing `<Separator>` API preserved.
- **Status:** `applied: Y`. Call-site adoption is on-demand; the utility is available wherever a major section break is intentional.

### Dark mode

- **Category:** `KEEP_LEGACY_FOR_NOW` (per dark-mode exception)
- **Surfaces:** `.dark` block in `src/app/globals.css`
- **Issue:** Spec is light-only; cinatra has a full dark theme.
- **Resolution:** Untouched except as required to preserve appearance through token rewiring. `--success`/`--warning`/`--info` light values are retuned; corresponding `.dark` values stay unless the dark-mode token snapshot shows a contrast regression.

### Mode toggle / theme switcher

- **Category:** `KEEP_LEGACY_FOR_NOW`
- **Surfaces:** `src/components/mode-toggle.tsx`
- **Issue:** Mode toggle lets the user switch to dark mode, which is excluded from spec conformance.
- **Resolution:** Untouched.

### `cinatra-brand` logo path data

- **Category:** `ADOPT_NEAREST_RULE`
- **Surfaces:** `src/lib/cinatra-brand.ts`
- **Issue:** The logo path data is referenced by both `CinatraLogo` and `BrandMark`. Both need to coexist while call sites migrate.
- **Resolution:** Both components import from `cinatra-brand.ts`. `BrandMark` is the preferred component; `CinatraLogo` remains for surfaces that still require the compact logo path.

### `next-themes` programmatic classes

- **Category:** `EXTERNAL_COMPONENT_BOUNDARY`
- **Surfaces:** `<html class="cinatra">` and `.dark` programmatic toggle
- **Issue:** `next-themes` sets classes programmatically. The raw-color scanner must allowlist these strings.
- **Resolution:** Allowlist entry in `scripts/design/allowlist-raw-colors.json`. Documented.

### Stripe seersucker (fabric stripe)

- **Category:** `ADOPT_NEAREST_RULE`
- **Surfaces:** Table zebra in `src/components/ui/table.tsx`
- **Issue:** Spec §IV defines `--stripe-light` / `--stripe-mid` for "subtle seersucker zebra on alternate table rows" but the current Table used `bg-muted/50` for zebra.
- **Resolution:** `--stripe-light` (`#e3e8ee`) + `--stripe-mid` (`#b8c4d4`) tokens expose `bg-stripe-light` / `bg-stripe-mid` Tailwind utilities. The Table `tbody` even-row selector uses `bg-stripe-light/50`.
- **Status:** `applied: Y`.

### Marquee / animated indicators

- **Category:** `ADOPT_NEAREST_RULE`
- **Surfaces:** Any animated status indicator (marquee bulbs per spec §IV mustard usage)
- **Issue:** Spec calls for mustard marquee bulbs; reduced-motion compliance.
- **Resolution:** Any animated indicator added for this design system honors `prefers-reduced-motion`.

### Sonner toast variants + Copy/Close

- **Category:** `ADOPT_NEAREST_RULE`
- **Surfaces:** `src/components/ui/sonner.tsx`, `src/lib/cinatra-toast.ts`, all `toast(...)` call sites
- **Issue:** Spec §X requires 5 variants (default · success · warning · error · info) + Copy + Close on every toast, icon-led. Repo had 4 variants (no info, no Copy action).
- **Resolution:** The 5 sonner CSS variant slots map to design tokens (`--success` / `--warning` / `--info` / `--destructive` / `--popover`). `src/lib/cinatra-toast.ts` wraps `sonner.toast` with a default Copy action (clipboard write of the message text) and `closeButton: true`. Five variants are exposed: success / error / warning / info / message. Call sites import `toast` from `@/lib/cinatra-toast`.
- **Status:** `applied: Y (fully migrated)` — 38 importers use `@/lib/cinatra-toast`; `src/lib/toast.ts` is deleted; `src/lib/__tests__/toast-import-guard.test.ts` fails CI if the old import path is reintroduced. Zero `toast.custom(` call sites existed at the migration, so the missing `custom` slot on `cinatra-toast` was an intentional removal.

### Drop-cap in liner-notes prose

- **Category:** `ADOPT_NEAREST_RULE`
- **Surfaces:** any run-summary / liner-notes page (none in production yet; fixture at `/design-fixtures`)
- **Issue:** Spec §IX 5 calls for a burgundy italic-800 drop-cap in 2-column liner-notes prose.
- **Resolution:** The `.liner-notes` utility in `src/app/globals.css` sets `column-count: 2`, `column-gap: 2rem`, `column-rule: 1px solid var(--line)`. First paragraph's `::first-letter` is burgundy (`var(--cinatra-red)`) italic-800 in `var(--font-display)` (Archivo). `::first-line` of the first paragraph is JetBrains Mono small-caps. Falls back to 1-column under 480px. Fixture row at `/design-fixtures` exercises the utility for the Playwright pixel-diff harness.
- **Status:** `applied: Y` — utility shipped + fixture row visible. First production call site (run summary / campaign retrospective) will pick this up when that surface lands.

### Blog draft editor h1 (RETIRED)

- **Status:** `applied: N/A — surface retired`. The legacy
  `src/lib/blog/draft-editor.tsx` file was deleted with the rest of the
  `/assets/asset-blog/*` route tree. The replacement editing surface is
  the `artifact-edit-text` portlet on the blog-content-workflow
  extension's dashboard at `/dashboards/{id}`; that portlet renders
  inside the standard `<PageHeader>`-owned chrome, so no
  `EDITORIAL_COMPONENT_BOUNDARY` carve-out is needed. The design scanner
  no longer needs to allowlist that file.

### Release-workflow Gantt timeline

- **Category:** `EXTERNAL_COMPONENT_BOUNDARY`
- **Surfaces:** `src/components/workflows/workflow-gantt.tsx` (the SVAR embed); `src/app/workflows/page.tsx` (list, design-conformant) + `src/app/workflows/[workflowId]/page.tsx`.
- **Issue:** A calendar-driven Gantt (task bars positioned by date, dependency arrows, drag/resize/link editing) is a Cinatra-specific visualization the spec does not name. The first read-view was a custom DOM component styled with design tokens.
- **Doctrine (v6.16 — narrows the previously-blanket exception):** The SVAR embed is **CSS-conformed via scoped overrides under `[data-gantt-shell]` in `src/components/workflows/gantt-overrides.css`, anchored exclusively on design tokens** — typography, surfaces, accents, focus rings, scrollbars, dark-mode parity. The viewport-control button cluster (Week/Month/Quarter/Year + Today + Fullscreen + Read-only badge) is composed via the `<Toolbar>` primitive (`@/components/ui/toolbar`) as the Gantt panel's top edge, replacing the panel-local section rule (see the "toolbar replaces section rule" doctrine in `02-token-map.md`). A dedicated token-drift gate (`scripts/audit/gantt-css-tokens.mjs`, wired by `.github/workflows/gantt-css-tokens-gate.yml`) hard-fails CI on raw colors in the override file.
- **Cinatra-owned chrome layered on the embed (token-conformant):** the surrounding controls and the content we inject INTO SVAR's slots use shadcn + semantic tokens, not raw palette — the viewport `<Toolbar>` with `<ToolbarButton active>` view switcher (`aria-pressed` via the primitive) + Today + Fullscreen as `<ToolbarButton type="button">`, the conditional Read-only `<Badge>`; the bar `taskTemplate` (status dot + title + per-type letter) and hover `Tooltip` body; the right-click `ContextMenu` items; the left-grid column cells (`Badge` for type, `StatusPill` for status); and the `highlightTime` weekend class (`.wx-cell.gantt-weekend` → `var(--color-surface-muted)`, scoped under `[data-gantt-shell]`, no `!important`); the today indicator is rendered by an absolute `<GanttTodayLine>` overlay computed from SVAR's reactive `_scales`/`scrollLeft` against the `.wx-chart` viewport — not a `.wx-cell` border — so it's exact-pixel and tracks scroll/resize/view-switch; the critical-path bar highlight is a Cinatra-owned `gantt-critical-path` class on our wrapper span inside `.wx-bar` (server-computed via CPM in `packages/workflows/src/schedule/critical-path.ts`); the planned-vs-actual ghost is a Cinatra-owned `<span class="gantt-actual-bar" data-status>` inside the same wrapper, sized as a percentage of the planned bar via the pure helper `computeActualBarMetrics` and rendered ONLY on `active`/`paused` workflows; a `· +Nd late` muted suffix in the title reports `actual_end − planned_end` slip. None of these introduces a new `.wx-*` class — the axe SVAR allowlist stays intact. `WillowDark` swaps in on the app dark theme via `next-themes`.
- **Overridden surfaces (the diff that closed the blanket carve-out):** rather than out-specificity every internal `.wx-*` selector individually, `gantt-overrides.css` rebinds the SVAR `--wx-*` custom-property cascade on the theme classes `.wx-willow-theme` and `.wx-willow-dark-theme` from `[data-gantt-shell]` scope (specificity `0,2,0` — one step above SVAR's own theme block). The rebound vars are: `--wx-font-family`, `--wx-font-size`, `--wx-font-size-sm`, `--wx-font-weight`, `--wx-font-weight-md`, `--wx-input-font-family`, `--wx-input-font-size`, `--wx-input-font-weigth`, `--wx-color-font`, `--wx-color-secondary-font`, `--wx-color-font-disabled`, `--wx-color-primary`, `--wx-color-danger`, `--wx-color-link`, `--wx-input-font-color`, `--wx-icon-color`, `--wx-gantt-icon-color`, `--wx-background`, `--wx-background-alt`, `--wx-border`, `--wx-gantt-border-color`, `--wx-gantt-border`, `--wx-gantt-task-color`, `--wx-gantt-task-fill-color`, `--wx-gantt-task-font-color`, `--wx-gantt-task-border-color`, `--wx-gantt-task-border`, `--wx-gantt-task-critical-color`, `--wx-gantt-task-critical-fill-color`, `--wx-gantt-task-slack-color`, `--wx-gantt-task-slack-border-color`, `--wx-gantt-summary-color`, `--wx-gantt-summary-font-color`, `--wx-gantt-summary-fill-color`, `--wx-gantt-summary-border-color`, `--wx-gantt-summary-border`, `--wx-gantt-summary-critical-color`, `--wx-gantt-summary-critical-fill-color`, `--wx-gantt-milestone-color`, `--wx-gantt-critical-color`, `--wx-gantt-marker-color`, `--wx-gantt-marker-font-color`, `--wx-gantt-link-color`, `--wx-gantt-link-color-hovered`, `--wx-gantt-link-critical-color`, `--wx-gantt-link-critical-color-hovered`, `--wx-gantt-link-marker-background`, `--wx-gantt-link-marker-color`, `--wx-gantt-progress-border-color`, `--wx-gantt-select-color`, `--wx-gantt-holiday-background`, `--wx-gantt-holiday-color`, `--wx-grid-header-font-color`, `--wx-grid-body-font-color`, `--wx-timescale-font-color`, `--wx-tooltip-background`, `--wx-tooltip-font-color`, `--wx-sidebar-close-icon`. Selector-level overrides (still under `[data-gantt-shell]`): `.wx-cell.gantt-weekend`, `.gantt-critical-path`, `.gantt-actual-bar` (+ `[data-status="succeeded"]`, `[data-status="failed"]`), `.wx-chart .wx-bar:focus-visible` (specificity tie with SVAR's bundled `.wx-bar:not(.wx-milestone):focus.wx-GKbcLEGA`, won by source order), `.wx-chart { scrollbar-width: thin; scrollbar-color }`.
- **Residual exception (final — what scoped CSS cannot reach):** (i) **SVAR DOM/ARIA ownership** of `.wx-bar`, `.wx-cell`, `.wx-row`, `.wx-grip`, `.wx-input`, `.wx-chart` — we override their *visual* layer but not their structure, roles, or attributes. (ii) **Five axe-allowlisted rules preserved verbatim** on SVAR-owned nodes only: `label` (SVAR's grid filter `<input class="wx-input">` ships without an accessible name), `scrollable-region-focusable` (SVAR's `.wx-chart` viewport is `tabindex="-1"`), `aria-valid-attr-value` (SVAR's `.wx-row` uses `aria-rowindex="0"`, which must be ≥1), `aria-prohibited-attr` (SVAR's `.wx-grip` resize handle puts an `aria-label` on a `role="presentation"` element), and `aria-conditional-attr` (SVAR puts `aria-expanded` on a hierarchical parent's `.wx-row[role="row"]`, but the grid container is `role="grid"` not `role="treegrid"` — surfaces only when hierarchy is present, added with the v6.10-followups HIER-06 e2e). (iii) **No bar tabindex** — SVAR 2.6.1 renders `.wx-bar` without `tabindex`; bars are pointer / right-click operable only, no keyboard reach for the bar itself. (iv) **Pointer-only context menu** — SVAR's right-click menu carries no keyboard handling in the 2.6.1 embed (dismisses on outside-click / option-select, not Escape). (v) **Drag/resize/link hit geometry** — `.wx-grip`, `.wx-link`, `.wx-resizer`, `.wx-progress-marker` carry SVAR-owned `cursor:` + hit-region logic we do not override. (vi) **Date-scale math + browser-local axis labels** on `.wx-scale` — SVAR formats axis labels via browser-local date strings (workflow grid Start/Tooltip/Sheet columns localize to `release_tz` separately). (vii) **Virtualization / scroll model** — `.wx-chart` overflow, `.wx-pseudo-rows` virtualization, the sticky `.wx-scale` are SVAR-owned mechanics. (viii) **SVAR-owned header / filter menu behavior + manipulation handles + delete/progress handles** — `.wx-resizer`, `.wx-progress-marker`, `.wx-link` carry SVAR-internal click/hover/drag JS that the override file does not (and cannot) attempt to reach from CSS. (ix) **Upstream `.wx-*` class drift risk** — SVAR's internal hashed class suffixes (`.wx-rHj6070p`, `.wx-dkx3NwEn`, `.wx-GKbcLEGA`, `.wx-mR7v2Xag`, `.wx-jlbQoHOz`, `.wx-pFykzMlT`, `.wx-LU2cdPQ2`, `.wx-pqc08MHU`, `.wx-9DAESAHW`, `.wx-ZkvhDKir`, `.wx-KG0Lwsqo`, `.wx-XkvqDXuw`, `.wx-GKbcLEGA`, `.wx-hFsbgDln`, `.wx-j93aYGQf`) can shift on SVAR minor bumps. The override file deliberately avoids selecting any hashed class — we target only the stable public classes — but a SVAR bump that renames a stable class would silently break the corresponding override. Mitigation: the token-drift gate doesn't catch this, but a visible regression on `Visual baseline` (see below) does.
- **Accepted vanilla trade-offs:** (a) tasks are stored as **server UTC instants**; SVAR's own scale/axis labels + the `highlightTime` weekend/today shading still run through SVAR/browser-local date handling, but the human-readable date *strings* we render — grid Start column, hover Tooltip, detail Sheet — are localized to the workflow `release_tz` via Intl `timeZone` (RWF-GANTT-08), falling back to browser tz when `release_tz` is unset; (b) native SVAR actions not yet persisted (add-task / copy / indent / move-row / link-type-change) are intercepted-and-rejected so they can't create unsaved phantom state; move / resize / delete / add-link / delete-link persist via narrow draft-only compare-and-swap (CAS) server mutations; (c) SVAR 2.6.1 types `Fullscreen` but the JS bundle doesn't export it, so fullscreen uses the native `requestFullscreen()` on the panel shell — exposed via a focusable shadcn **Fullscreen** button (Tab-reachable) plus a redundant `F` keyboard shortcut; (d) **keyboard accessibility (RWF-GANTT-A11Y-01):** the Cinatra-owned chrome is keyboard-operable and Tab-ordered (view switcher → Today → Fullscreen → SVAR grid header/filter controls), Escape closes the detail Sheet (Radix Dialog), and `.wx-bar` carries a `focus-visible` ring (`var(--ring)`, scoped under `[data-gantt-shell]`). Two documented SVAR-owned limits we deliberately do **not** work around (no synthetic `tabindex`, no synthetic dismiss): (i) the task **bars are pointer / right-click operable only** — SVAR 2.6.1 renders `.wx-bar` without `tabindex`, so bar-level keyboard focus/navigation is unavailable; (ii) the **right-click context menu is a pointer affordance** with no keyboard handling in the 2.6.1 embed (it dismisses on outside-click / option-select, not Escape). Both are moot for keyboard-only users: a bar can't receive keyboard focus, so the context menu can't be keyboard-invoked — keyboard users operate the Gantt through the controls above and the Escape-dismissable detail Sheet. The workflow-detail axe gate (serious/critical, `tests/e2e/workflows/workflow-lifecycle.spec.ts`) gates all Cinatra-owned chrome normally and allowlists exactly five SVAR-embed-internal rules **scoped to SVAR-owned (`wx-`) nodes**: `label` (SVAR's grid filter `<input class="wx-input">` ships without an accessible name), `scrollable-region-focusable` (SVAR's `.wx-chart` viewport is `tabindex="-1"`), `aria-valid-attr-value` (SVAR's `.wx-row` uses `aria-rowindex="0"`, which must be ≥1), `aria-prohibited-attr` (SVAR's `.wx-grip` resize handle puts an `aria-label` on a `role="presentation"` element), and `aria-conditional-attr` (SVAR puts `aria-expanded` on a hierarchical parent's `.wx-row[role="row"]`, but the grid container is `role="grid"` not `role="treegrid"` — surfaces only when hierarchy is present, added with the v6.10-followups HIER-06 e2e). All five are vanilla-embed DOM we cannot fix from outside it.
- **Why it doesn't trip `design:scan`:** SVAR's styles live in its own package CSS (imported), not as raw colors in `src/**`; our injected chrome uses shadcn primitives + semantic tokens, so the raw-color scanner stays clean.
- **Summary-parent overlay behavior (documented contract, not a defect):** when a task is referenced as `parent` by another task, SVAR renders it as a summary/rollup bar — its wrapper carries `.wx-bar.wx-summary[data-id=":<key>"]` and SVAR still invokes our `taskTemplate` on it (SVAR 2.6.1, `node_modules/@svar-ui/react-gantt/dist/index.es.js:966` — the same `o ? i(o, ...)` template call applies to summaries; the only summary-specific divergence is the auto-progress marker suppression at `:958`). Concretely on the v6.10 chrome: status-dot, per-type letter, and the truncated title all render. The `gantt-critical-path` outline does NOT render because CPM excludes parents from its pass and skips edges touching a parent at either end (`packages/workflows/src/schedule/critical-path.ts`), so `isCriticalPath` is always false on a summary. The `gantt-actual-bar` ghost only renders when the row carries `actual_start_utc`/`actual_end_utc` directly on the parent record (the resolver writes derived `planned_start/end/due` for parents from children, but actuals are not derived); without those columns the helper returns null. An operator looking at a hierarchical critical-path workflow should expect the highlight on the **leaf children**, not on the parent rollup.
- **v6.17 P559 amendments (toolbar architecture + milestone halo + tooltip + scrollbars + card-hugs-chart):**
  - **Toolbar lives ABOVE the soft-panel** (was: "as the panel's top edge" in v6.16). `WorkflowGanttSection` (renamed from `WorkflowGanttPanel`) owns the toolbar; the soft-panel below it contains only the SVAR shell. The toolbar REPLACES the section rule between the `<PageHeader>` and the panel — the workflow detail page sets `<PageHeader divider={hitlEvents.length > 0 || pendingApprovals.length > 0} />` so the etched rule renders only when an intermediate banner (AgentHitlBanner / WorkflowApprovalsPanel) is present; in the common (empty-banner) state the toolbar sits directly under the PageHeader and no rule paints between them.
  - **Toolbar layout (left → right):** view `<Select>` · readonly `<Badge>` · `flex-1` spacer · target-date control + lifecycle controls (Start/Pause/Resume/Cancel via `WorkflowControls`) · `<ToolbarSeparator>` · Today · Fullscreen (with `<Maximize2>` icon, ~13px). Fullscreen anchors right; destructive Cancel sits in the mutations group, NOT on the extreme right edge.
  - **Editable workflow name:** the spec h1 is rendered via the new `PageHeader.titleContent?: ReactNode` prop (additive — `title: string` stays for `PageHeaderTitleSync`). `WorkflowEditableTitle` renders click-to-edit / Enter-saves / Esc-cancels / blur-saves, gated on `canManage`. The server action `renameWorkflowAction` runs `canManage` + trim + CAS on `lockVersion` and updates only `workflow.name`, `lockVersion`, `updatedAt` (no `specVersion` touch).
  - **Milestone halo fix:** the focus-visible ring rule is now scoped to `.wx-bar:not(.wx-milestone)` so SVAR's bounding-box outline no longer paints a square halo around the rotated milestone diamond. If halos persist on milestones in browser verification, additionally suppress `.wx-milestone .wx-content` outline — only after evidence.
  - **Milestone diamond size:** `transform: rotate(45deg) scale(.6)` on `.wx-milestone .wx-content` (was: SVAR default `.75`); owner can re-tune in a follow-up if too small.
  - **Tooltip body:** drops all per-element `text-foreground` / `text-muted-foreground` / `text-[10px]` / `text-xs` so each row inherits `--wx-tooltip-font-color` (cream). Padding `6px 10px`, 12px everywhere; the SVAR cascade owns the palette.
  - **Scrollbars:** `scrollbar-color: var(--color-line)` (was: `var(--color-line-strong)`), still `scrollbar-width: thin` per spec §Select 1020.
  - **Card hugs chart (WPP-13):** the `.soft-panel` wrapper no longer enforces excess height. The SVAR shell `style={{ height: 480 }}` + standard panel padding is the card's full height; fullscreen is unaffected.
- **Status:** `applied: Y` — SVAR embed; edits persist; toolbar lives above the soft-panel; editable title in PageHeader; milestone halo + diamond + tooltip + scrollbars + card-hugs-chart all v6.17-conformant.

---

## Close-out

Every register row is in a terminal state. Summary by category:

| Category | Rows |
|---|---|
| `ADOPT_NEAREST_RULE` (applied) | Recharts chart palette; `lifecycle-badge.tsx`; Sparkles animation (BrandMark); Sidebar burgundy brand head; Etched paired-line section divider utility; `cinatra-brand` logo path data; Stripe seersucker; Marquee / animated indicators; Sonner toast variants + Copy/Close; Drop-cap in liner-notes prose |
| `EXTERNAL_COMPONENT_BOUNDARY` | `@daveyplate/better-auth-ui` chrome; Marketing surfaces; QueueDash; `katex` math rendering; `next-themes` programmatic classes; Release-workflow Gantt timeline |
| `EDITORIAL_COMPONENT_BOUNDARY` | (none — Blog draft editor h1 retired with `/assets/asset-blog/*`) |
| `KEEP_LEGACY_FOR_NOW` | Dark mode; Mode toggle / theme switcher |
| `NEEDS_SPEC_EXTENSION` | (none) |
| `NEEDS_OWNER_DECISION` | (none) |
| `DEPRECATED_BUT_NOT_REMOVED` | (none) |

**Owner-facing summary of unresolved rows:** every register row is `applied: Y` (10 rows), `EXTERNAL_COMPONENT_BOUNDARY` (6 rows), `EDITORIAL_COMPONENT_BOUNDARY` (0 rows — the historical "Blog draft editor h1" row is retired), or `KEEP_LEGACY_FOR_NOW` (2 rows). Zero rows pending owner decision.

**Chart palette policy executed:** `--chart-1..5` now map to `#364e81 / #3f6e6b / #c79545 / #7a2e3a / #a6384f` in `:root` + `.cinatra`. `.dark` chart palette untouched. `scripts/design/scan-chart-colors.mjs` ships as evidence-only.
