# shadcn Components

Component inventory, import paths, and migration rules for all shadcn/ui and custom components available in the main app.

---

## UI Primitives — `src/components/ui/`

| Component | Import | Notes |
|---|---|---|
| `Alert`, `AlertTitle`, `AlertDescription` | `@/components/ui/alert` | CVA variants: default, destructive |
| `AlertDialog` + sub-components | `@/components/ui/alert-dialog` | Confirm/destructive dialogs |
| `Avatar`, `AvatarImage`, `AvatarFallback` | `@/components/ui/avatar` | |
| `Badge` | `@/components/ui/badge` | Variants: default, secondary, destructive, outline |
| `Button` | `@/components/ui/button` | Variants: default, outline, ghost, destructive; sizes: sm, lg, icon, xs, icon-xs, icon-sm, icon-lg |
| `Calendar` | `@/components/ui/calendar` | Wraps `react-day-picker` |
| `Card`, `CardContent`, `CardHeader`, `CardTitle`, `CardDescription`, `CardFooter` | `@/components/ui/card` | |
| `Checkbox` | `@/components/ui/checkbox` | Use `onCheckedChange`, not `onChange` |
| `Dialog` + sub-components | `@/components/ui/dialog` | |
| `DropdownMenu` + sub-components | `@/components/ui/dropdown-menu` | |
| `Form` + sub-components | `@/components/ui/form` | Wraps `react-hook-form` |
| `Input` | `@/components/ui/input` | |
| `InputOTP` + sub-components | `@/components/ui/input-otp` | Wraps `input-otp` package |
| `Label` | `@/components/ui/label` | |
| `RadioGroup`, `RadioGroupItem` | `@/components/ui/radio-group` | |
| `ScrollArea`, `ScrollBar` | `@/components/ui/scroll-area` | |
| `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem`, `SelectGroup`, `SelectLabel`, `SelectSeparator` | `@/components/ui/select` | Use `onValueChange`, not `onChange` |
| `Separator` | `@/components/ui/separator` | |
| `Sheet` + sub-components | `@/components/ui/sheet` | |
| `Skeleton` | `@/components/ui/skeleton` | |
| `Sonner` (toast) | `@/components/ui/sonner` | |
| `Switch` | `@/components/ui/switch` | |
| `Table`, `TableHeader`, `TableBody`, `TableFooter`, `TableRow`, `TableHead`, `TableCell`, `TableCaption` | `@/components/ui/table` | |
| `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` | `@/components/ui/tabs` | |
| `Textarea` | `@/components/ui/textarea` | |
| `Tooltip`, `TooltipProvider`, `TooltipTrigger`, `TooltipContent` | `@/components/ui/tooltip` | |

---

## Data Table — `src/components/data-table/`

TanStack Table suite. All exported from `@/components/data-table`.

| Export | File | Purpose |
|---|---|---|
| `DataTableColumnHeader` | `column-header.tsx` | Sortable column header with sort icons |
| `DataTablePagination` | `pagination.tsx` | Page size + prev/next controls |
| `DataTableToolbar` | `toolbar.tsx` | Search input + faceted filters + view options |
| `DataTableBulkActions` | `bulk-actions.tsx` | Floating bulk-action toolbar |
| `DataTableFacetedFilter` | `faceted-filter.tsx` | Popover with Command for multi-select filtering |
| `DataTableViewOptions` | `view-options.tsx` | Column visibility toggle dropdown |

---

## Custom Components — `src/components/`

| Component | Import | Props |
|---|---|---|
| `ConfirmDialog` | `@/components/confirm-dialog` | `open`, `onOpenChange`, `title`, `desc`, `handleConfirm`, `destructive?`, `isLoading?`, `cancelBtnText?`, `confirmText?` |
| `DatePicker` | `@/components/date-picker` | Popover wrapping Calendar; uses `date-fns` format |
| `PasswordInput` | `@/components/password-input` | Input with Eye/EyeOff toggle |
| `SelectDropdown` | `@/components/select-dropdown` | Select with loading state + FormControl integration |
| `LongText` | `@/components/long-text` | Truncated text; Tooltip on desktop, Popover on mobile |
| `SkipToMain` | `@/components/skip-to-main` | Accessibility skip link |
| `ComingSoon` | `@/components/coming-soon` | Placeholder page with Telescope icon |

---

## Layout Components — `src/components/layout/`

| Component | Import | Notes |
|---|---|---|
| `Header` | `@/components/layout/header` | Scroll-aware sticky header; accepts `fixed` prop; uses `SidebarTrigger` + `Separator` |
| `Main` | `@/components/layout/main` | `<main>` wrapper; `fixed` prop for flex overflow layout; `fluid` prop disables max-width centering |
| `AppTitle` | `@/components/layout/app-title` | Branding component with `name` and `description` props |
| `TopNav` | `@/components/layout/top-nav` | Responsive nav: mobile dropdown + desktop inline links; accepts `links` array with `title`, `href`, `isActive`, `disabled?` |

---

## Radix import style

Cinatra uses the consolidated `radix-ui` package, not individual `@radix-ui/react-*` packages:

```typescript
// Correct
import { Dialog as DialogPrimitive, Checkbox as CheckboxPrimitive } from "radix-ui";

// Wrong — do not use
import * as DialogPrimitive from "@radix-ui/react-dialog";
```

---

## Form element migration rules

When replacing raw HTML form elements with shadcn components:

| Raw HTML | shadcn component | Key change |
|---|---|---|
| `<button className="ink-button">` | `<Button>` | default variant |
| `<button className="cream-button">` or outline-style | `<Button variant="outline">` | |
| `<button className="ghost-button">` | `<Button variant="ghost">` | |
| `<button className="destructive-button">` | `<Button variant="destructive">` | |
| `<input className="...">` | `<Input>` | preserve type, all props |
| `<textarea className="...">` | `<Textarea>` | preserve rows, all props |
| `<select onChange={fn}>` | `<Select onValueChange={fn}>` | `onValueChange`, not `onChange`; `value` on `<Select>` for controlled |
| `<input type="checkbox" onChange={fn}>` | `<Checkbox onCheckedChange={fn}>` | `onCheckedChange`, not `onChange` |
| `<label>` | `<Label>` | preserve `htmlFor` |
| Status `<span>` with color classes | `<Badge variant="...">` | green→default, red→destructive, gray→secondary, outlined→outline |
| `<table>/<thead>/<tbody>/<tr>/<th>/<td>` | `<Table>/<TableHeader>/<TableBody>/<TableRow>/<TableHead>/<TableCell>` | |

### Server-action exception

**Keep native `<select>` and `<input type="checkbox">` as raw HTML** when they are inside a server action `<form>` with a `name` attribute. Radix/shadcn wrappers are not form-associated elements — they will not appear in `FormData`, silently breaking form submissions.

```tsx
// Inside a server action form — keep native:
<form action={myServerAction}>
  <select name="outputFormat" defaultValue="json">
    <option value="json">JSON</option>
    <option value="csv">CSV</option>
  </select>
  <input type="checkbox" name="enabled" defaultChecked={isEnabled} />
</form>
```

### `buttonClassName()` helper deletion policy

When migrating buttons to shadcn `Button`, delete any local helper functions that were used to build button class strings (`buttonClassName()`, `stepButtonClassName()`, `inkButtonClassName()`, etc.). These become dead code after migration and must be removed — do not leave them as unused exports. If the helper was exported and consumed by other files, migrate those call sites first, then delete the helper.

### `<Link>` as button

When a `<Link>` is styled to look like a button, use the `asChild` prop:

```tsx
import { Button } from "@/components/ui/button";
import Link from "next/link";

<Button asChild>
  <Link href="/new">Create</Link>
</Button>

<Button variant="outline" asChild>
  <Link href="/edit">Edit</Link>
</Button>
```

---

## CSS utilities added

These were added to `src/app/globals.css` alongside the component migration:

- `@utility no-scrollbar` — hides scrollbar cross-browser
- `@utility faded-bottom` — gradient fade at scroll bottom
- `@import "tw-animate-css"` — provides `animate-in`, `fade-in-0`, `zoom-in-95`, `slide-in-from-*` used by Radix popover/dialog transitions
- Collapsible keyframes: `slideDown` / `slideUp` / `.animate-slideDown` / `.animate-slideUp`
- Chart tokens: `--chart-1` through `--chart-5` (OKLch values)
- Font variables: `--font-inter`, `--font-manrope`

---

## Related references

- `~/.claude/skills/shadcn` — the canonical shadcn skill, surfaced through the Claude Code skill loader (symlink to `~/.agents/skills/shadcn`). Contains `SKILL.md`, the rule files in `rules/` (`base-vs-radix.md`, `composition.md`, `forms.md`, `icons.md`, `styling.md`), plus `customization.md`, `cli.md`, and `mcp.md`. The shadcn skill activates automatically when `components.json` is present at the project root, so component generation, customization, and migration follow shadcn-blessed defaults out of the box.
- UI Compliance audit tooling — each violation is a row in `audit-rows.tsv`; `UI-AUDIT.md` renders the human-readable view, scoped by section (`html`, `color`, `space`, `dark`, `zindex-overlay-managed`, `zindex-layout-layer`, `arbitrary-color`, `shell`, `compose`, `icon`, `scope-badge`, `primitive`). Run `node scripts/audit/ui-violations.mjs --section={…} [--strict] [--json]` to query violations by section.
- `AGENTS.md` → "Frontend / UI development" → "Forbidden patterns" — the eleven non-negotiable forbidden-pattern rules for UI work. Audit rows reference this section by heading anchor (`AGENTS.md#frontend--ui-development--forbidden-patterns`) for `rule_ref` traceability.
