# UI Patterns

Recurring UX conventions used across entity pages, agent pages, asset pages, and settings. Follow these patterns on any new or modified page.

---

## Page Chrome — `<Card>` is canonical

Use `<Card>` from `src/components/ui/card.tsx` for every top-level page chrome panel. Composition:

```tsx
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";

<Card>
  <CardHeader>
    <CardTitle>Section title</CardTitle>
    <CardDescription>Optional subtitle</CardDescription>
  </CardHeader>
  <CardContent>{/* body */}</CardContent>
</Card>;
```

Do NOT use `.shell-card` or `.hero-shell`. Both className usages and the underlying CSS rules in `src/app/globals.css` are gone.

**Cinatra-scope visual fidelity:** when migrating a `<Card>` placed under the `.cinatra` themed shell, override with `className="border-line bg-surface backdrop-blur-none"` to match the previous chrome (no backdrop blur, warmer border via the semantic `border-line` token). This preserves the visual contract of the old `.cinatra .shell-card` rule, which set `background: var(--surface)` + `backdrop-filter: none` + `border: 1px solid var(--line)`.

This is the same pattern used by `ScopeBadge` for ownership-level palette: a single canonical primitive owns the visual contract, and consumers compose around it via `className` overrides rather than introducing parallel classes.

### Edge cases (do NOT wrap with `<Card>`)

These patterns cannot be migrated to `<Card>` composition. Substitute the className tokens directly instead.

**better-auth-ui `cardClassNames.base` (and similar string-prop className APIs).** Components like `<AccountView>`, `<OrganizationView>`, and other better-auth-ui surfaces accept a `classNames.card.base` prop that is a string applied to the component's internally-owned card div. There is no JSX hook to wrap with `<Card>`. Substitute the string with the token-equivalent chrome:

```tsx
classNames={{
  card: {
    base: "border border-line bg-surface backdrop-blur-none rounded-card",
  },
}}
```

Note the explicit `border` width utility — `border-line` is color only and contributes no border without it. This was a 233.2 code-review finding (WR-03).

**`<form className="shell-card">` blocks.** The `<form>` element is required for server-action wiring; you can't replace the form tag with `<Card>` (Card has no `asChild` prop). Keep the `<form>` and wrap the inner content with `<Card><CardContent>...</CardContent></Card>`:

```tsx
<form action={...}>
  <Card className="border-line bg-surface backdrop-blur-none">
    <CardContent>{/* form fields */}</CardContent>
  </Card>
</form>
```

**`<AccordionItem className="shell-card">`.** Radix AccordionItem is required as the direct child of Accordion; you can't substitute `<Card>`. Apply the chrome inline on the AccordionItem:

```tsx
<AccordionItem
  className="rounded-card border border-line bg-surface text-card-foreground ring-1 ring-foreground/10 backdrop-blur-none"
>
```

**Note:** `<Card>` does NOT support `asChild`. Any attempt to use `<Card asChild>` is a bug — replace with the standard `<Card>...<CardContent>...</CardContent></Card>` composition.

---

## Inner Sub-Panels — `.soft-panel` is canonical

`.soft-panel` is the single canonical class for inner content sections inside `<PageContent>`. Its concept (solid inner section grouping with semantic spacing/border-radius tokens via `var(--surface-strong)` + `var(--line)`) does not map cleanly to shadcn's `<Card>` semantics, mirroring how `ScopeBadge` is canonical for the ownership-level palette inside its own component file.

Use it directly on a `<div>`:

```tsx
<div className="soft-panel">{/* inner section content */}</div>
```

Do NOT introduce a `<SoftPanel>` component, do NOT inline the same styles on a different class, and do NOT replace `.soft-panel` with `<Card>` — the abstraction levels differ. `<Card>` is page-chrome scaffolding; `.soft-panel` is an inner-content surface.

---

## Forbidden patterns

- Raw `<h1>` at the top level of a screen — use `<PageHeader title="...">` instead. `PageHeader` owns the page `h1`.
- Raw `<div>` chrome wrappers at the top of a screen — use `<Card>` instead.
- `.shell-card` className — deleted.
- `.hero-shell` className — deleted.
- A `<SoftPanel>` component — never introduce one. Use the `.soft-panel` className directly on a `<div>`.
- Hardcoded palette classes (`bg-white`, `text-gray-*`, `border-slate-*`) — use semantic tokens (`bg-surface`, `text-foreground`, `border-line`).
- Inlining ownership-level palette classes outside `src/components/scope-badge.tsx` — use `<ScopeBadge level={...}>`.

---

## 1. Back navigation

Back links must appear **above the page title**, not inside the action button group.

### Rule

- Place a `← X` link as the first element before the title `<div>` or `<section>`.
- Use `ChevronLeft` from `lucide-react` and the shared inline-flex style below.
- The action group in the top-right of the header contains **only** destructive/CRUD buttons — never a back link.

### Pattern (full-page layouts)

```tsx
import { ChevronLeft } from "lucide-react";

// Above the flex header section:
<Link href="/data" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit">
  <ChevronLeft className="h-4 w-4" />
  Data
</Link>

// The header flex div — action buttons only, no back link:
<div className="flex items-center justify-between">
  <div>
    <p className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">Data detail</p>
    <h1 className="mt-2 text-4xl font-semibold tracking-tight">{record.name}</h1>
  </div>
  <div className="flex gap-3">
    {/* Add contact, Edit, Delete — no back link here */}
  </div>
</div>
```

### Pattern (PageHeader-based pages)

For pages using the `PageHeader` / `PageContent` shell (settings pages, `NewEntityPage`, etc.), do **not** pass the back link as the `actions` prop. Instead, place it as the first element inside `PageContent`:

```tsx
<PageHeader title="Agent-skill matches" description="..." />
<PageContent className="flex flex-col gap-6 pb-8">
  <Link href="/settings/agents" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit -mt-2">
    <ChevronLeft className="h-4 w-4" />
    Agents
  </Link>
  {/* rest of content */}
</PageContent>
```

### Pattern (client components with conditional back link)

For `"use client"` components like `CampaignForm` where the back link is conditional:

```tsx
{backLabel && !(isDraftCampaign && mode === "edit") ? (
  <Link data-embed-hide href={backHref} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit">
    <ChevronLeft className="h-4 w-4" />
    {backLabel}
  </Link>
) : null}
<div data-embed-hide className="flex items-center justify-between">
  {/* title only — no back link */}
</div>
```

---

## 2. Status badge colours

Badges that convey **state or status** must use semantic colours. Static attributes (job titles, record IDs) must not use badge styling at all.

### Status → colour mapping

| Status value | Classes |
|---|---|
| `complete`, `connected`, `mountable` | `rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs uppercase text-emerald-700` |
| `partial`, `ready to connect` | `rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs uppercase text-amber-700` |
| `running` | `rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700` |
| `failed` | `rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700` |
| any other / default | `badge rounded-full px-3 py-1 text-xs uppercase` |

### Pattern (ternary)

```tsx
<span className={`rounded-full border px-3 py-1 text-xs uppercase ${
  account.enrichmentStatus === "complete"
    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
    : account.enrichmentStatus === "partial"
    ? "border-amber-300 bg-amber-50 text-amber-700"
    : "badge"
}`}>
  {account.enrichmentStatus}
</span>
```

### What NOT to badge

- Contact/person job titles (CEO, CTO, Founder) — show as plain secondary text instead (see section 3).
- Static record attributes (IDs, dates, counts).
- Labels that are never stateful.

---

## 3. Contact title display

A person's job title is a **descriptive attribute**, not a status. Never render it as a `.badge` pill.

### In a detail page header

```tsx
<h1 className="mt-2 text-4xl font-semibold tracking-tight">{contact.name}</h1>
{contact.title ? <p className="mb-3 text-sm font-medium text-muted-foreground">{contact.title}</p> : null}
```

### In a list item (e.g. related contacts inside an account card)

```tsx
<p className="font-semibold">{contact.name}</p>
{contact.title ? <p className="mt-0.5 text-xs text-muted-foreground">{contact.title}</p> : null}
```

The `Manual` badge (emerald, uppercase) is still appropriate because it conveys origin state, not a descriptive attribute.

---

## 4. Raw-data detail tables — accordion

Raw or debug data sections (`DetailTable` / `DetailTableBody`) must be wrapped in a collapsed `Accordion` rather than stacked open cards. Users can expand individual sections on demand.

### When to apply

When a page has **3 or more** `DetailTable` instances below the main summary area (e.g. "Account record data", "Default properties", "Custom properties", "Source startup data").

### Pattern

```tsx
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

<Accordion type="multiple" className="flex flex-col gap-3">
  <DetailTable accordionValue="account-record" title="Account record data" entries={accountRecordEntries} />
  <DetailTable accordionValue="default-properties" title="Default properties" entries={defaultPropertyEntries} />
  <DetailTable accordionValue="custom-properties" title="Custom properties" entries={customPropertyEntries} />
  <DetailTable accordionValue="source-startup" title="Source startup data" entries={sourceAccountEntries} />
</Accordion>
```

The `DetailTable` component accepts an optional `accordionValue` prop. When set it renders as an `AccordionItem` (collapsed by default). When omitted it renders as a plain `<Card>` section (open); use `<Card>` with the canonical Cinatra-scope override instead.

`AccordionItem` needs `[&:not(:last-child)]:border-b-0` to suppress shadcn's default inter-item border when the items are styled as standalone Card-equivalent chrome. Apply the inline-equivalent classes that mirror the canonical `<Card>` chrome (since `AccordionItem` is not a `<Card>`):

```tsx
<AccordionItem
  value={accordionValue}
  className="rounded-card border border-line bg-surface text-card-foreground backdrop-blur-none px-6 [&:not(:last-child)]:border-b-0"
>
```

---

## 5. Detail page two-column ratio

Entity detail pages (accounts, contacts) use a two-column grid. The left column carries the main overview; the right column carries secondary panels (related contacts, schedule, tools).

| Page type | Grid class |
|---|---|
| Entity detail (AccountDetailPage, ContactDetailPage) | `lg:grid-cols-[1.3fr_1fr]` |
| Agent detail (all agent instance pages) | `lg:grid-cols-[1fr_minmax(18rem,0.6fr)]` |
| Create / edit form pages | single column `max-w-4xl` — no change |

### What to avoid

- `lg:grid-cols-[1fr_0.95fr]` — near-equal columns give no visual hierarchy between primary and secondary content.
- More than two columns on detail pages — use the sidebar pattern instead.
