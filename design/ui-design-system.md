# UI Design System

## Stack

- **Tailwind CSS v4** — utility-first, configured via CSS (`src/app/globals.css`)
- **shadcn/ui** — component library (style: `radix-nova`), source copied into `src/components/ui/`
- **Radix UI** — unstyled primitives underlying shadcn components
- **`class-variance-authority`** — variant system used inside shadcn components
- **`cn()`** — merge helper at `@/lib/utils`, combines `clsx` + `tailwind-merge`

## Design tokens

Cinatra's tokens live in `:root` in `src/app/globals.css`. shadcn expects a different token set; they are bridged via `var()` aliases in the same file — cinatra tokens are never removed.

### Cinatra tokens (source of truth)

| Token | Value | Use |
|---|---|---|
| `--background` | `#f3f4f7` | Page background |
| `--foreground` | `#16181d` | Default text |
| `--surface` | `rgba(255,255,255,0.82)` | Frosted-glass panels |
| `--surface-strong` | `#ffffff` | Solid white panels |
| `--surface-muted` | `#eef1f5` | Muted/secondary surfaces |
| `--muted` | `#69707d` | Muted text color |
| `--accent` | `#17191f` | Dark ink (primary action color) |
| `--accent-soft` | `#d9dee7` | Light soft tint |
| `--line` | `rgba(15,23,42,0.08)` | Borders |
| `--shadow-soft` / `--shadow-strong` | — | Box shadows |
| `--radius` | `0.5rem` | Base border radius |

### shadcn compatibility aliases

These are defined as `var(--cinatra-token)` aliases; they let shadcn components work without modification.

| shadcn token | Maps to |
|---|---|
| `--card` / `--card-foreground` | `--surface` / `--foreground` |
| `--popover` / `--popover-foreground` | `--surface-strong` / `--foreground` |
| `--primary` / `--primary-foreground` | `--accent` / `#ffffff` |
| `--secondary` / `--secondary-foreground` | `--surface-muted` / `--foreground` |
| `--muted-foreground` | `--muted` |
| `--border` / `--input` | `--line` |
| `--ring` | `--accent` |
| `--destructive` / `--destructive-foreground` | `#a6384f` (light) / `oklch(0.704 0.191 22.216)` (dark) |
| `--success` / `--success-foreground` | `oklch(0.50 0.17 145)` (light) / `oklch(0.65 0.20 145)` (dark) — green status tier |
| `--warning` / `--warning-foreground` | `oklch(0.52 0.14 55)` (light) / `oklch(0.72 0.16 75)` (dark) — amber status tier (note: dark-mode hue is intentionally shifted from 55→75 for warmer reading on dark surfaces) |
| `--info` / `--info-foreground` | `oklch(0.47 0.13 240)` (light) / `oklch(0.66 0.15 240)` (dark) — blue status tier |

The four status-tier tokens (`destructive`, `success`, `warning`, `info`) all share the tinted-pill cva pattern (`bg-{token}/10 text-{token} ... [a]:hover:bg-{token}/20`) when used in `<Badge variant="…">`. Solid-fill alerts using these tokens must verify foreground contrast meets WCAG AA on the chosen surface before shipping. For color substitutions, preserve semantic intent by mapping states to the nearest status-tier token instead of hardcoding palette classes.

### Tailwind utility remaps

In `@theme inline`, `bg-muted` maps to `--surface-muted` (light surface background, not the muted text color) and `bg-accent` maps to `--accent-soft` (subtle hover tint). This follows shadcn semantics, so use these utilities with the meanings above.

`--color-ink` / `--color-ink-foreground` expose `--accent` (#17191f) as `bg-ink` / `text-ink-foreground` for use in cinatra-specific components that predate shadcn.

## Adding components

Use the shadcn CLI — it reads `components.json` and writes source to `src/components/ui/`:

```bash
pnpm dlx shadcn@latest add <component>
pnpm dlx shadcn@latest add table dialog tabs select separator skeleton
```

To preview changes before writing:

```bash
pnpm dlx shadcn@latest add <component> --dry-run
pnpm dlx shadcn@latest add <component> --diff
```

To search available components:

```bash
pnpm dlx shadcn@latest search <keyword>
```

## Component rules (summary from `.agents/skills/shadcn/`)

For the complete rules see `.agents/skills/shadcn/SKILL.md`. Key points:

- Use semantic color tokens (`bg-primary`, `text-muted-foreground`), never raw values (`bg-blue-500`)
- Use `cn()` for conditional classes — not manual template literals
- Use `flex` with `gap-*` — never `space-x-*` / `space-y-*`
- Use `size-*` when width and height are equal
- Full Card composition: `CardHeader` / `CardTitle` / `CardDescription` / `CardContent` / `CardFooter`
- Dialogs always need a title (`DialogTitle`, even if `sr-only`)
- Toast via `sonner` `toast()`, not custom markup
- `Skeleton` for loading states, `Badge` for labels, `Separator` instead of `<hr>`

## Current components

### shadcn UI primitives (`src/components/ui/`)

Added via `pnpm dlx shadcn@latest add <name>`. Own the source — edit freely.

- `button.tsx` — variants: default (dark ink), outline, secondary, ghost, destructive, link
- `card.tsx` — full composition with CardHeader, CardTitle, CardDescription, CardContent, CardFooter, CardAction
- `badge.tsx` — inline labels with variants
- `input.tsx` — form input with ring/border tokens

### App layout components (`src/components/`)

App-specific, not managed by shadcn CLI.

**`PageHeader`** — page title bar with optional description and right-side action slot:

```tsx
import { PageHeader } from "@/components/page-header";

<PageHeader
  title="Accounts"
  description="Company-level records and enrichment signals."
  actions={<Button>New account</Button>}
/>
```

Props: `title: string`, `description?: string`, `actions?: ReactNode`, `className?: string`.
Uses `text-foreground` / `text-muted-foreground` so it responds to theme automatically.

**`PageContent`** — content wrapper matching `PageHeader`'s max-width and padding:

```tsx
import { PageContent } from "@/components/page-content";

<PageContent>
  <Card>...</Card>
</PageContent>
```

Props: `children: ReactNode`, `className?: string` (e.g. `"pb-16"` for pages with a floating action bar).

Use `PageHeader` + `PageContent` on every new page instead of repeating `mx-auto max-w-7xl px-5 sm:px-8 lg:px-0` inline.

**`IconButton`** — square 44×44 icon button used in the AppShell header. Uses semantic tokens, adapts to all themes automatically:

```tsx
import { IconButton } from "@/components/icon-button";

<IconButton onClick={handleClick} aria-label="Open menu">
  <SomeIcon className="h-5 w-5" />
</IconButton>
```

Props: extends `React.ComponentPropsWithoutRef<"button">`. Add `className` to override specific utilities (e.g. `"fixed right-5"` for positioned variants).

## Dark mode

Implemented. `next-themes` manages the `.dark` class on `<html>`.

- **Token overrides**: `src/app/globals.css` — `.dark { ... }` block overrides all cinatra tokens and the two shadcn-specific values (`--primary-foreground`, `--destructive`) that need different values in dark mode
- **Provider**: `src/app/providers.tsx` wraps the tree in `<ThemeProvider attribute="class" defaultTheme="system" enableSystem>`
- **Toggle**: `src/components/theme-toggle.tsx` — sun/moon button; rendered in the AppShell header between dev tools and notifications
- **shadcn components** pick up dark mode automatically via semantic tokens — no extra work needed when adding new components

Dark token values (in `.dark`):

| Token | Dark value |
|---|---|
| `--background` | `#0e1016` |
| `--foreground` | `#e8eaef` |
| `--surface` | `rgba(22,25,34,0.84)` |
| `--surface-strong` | `#1a1d27` |
| `--surface-muted` | `#1e2130` |
| `--muted` | `#8891a0` |
| `--accent` | `#e8eaef` (flipped to light for primary buttons) |
| `--accent-soft` | `#262b38` |
| `--line` | `rgba(255,255,255,0.07)` |

## Color themes (named palettes)

A named color theme is a `[data-theme="X"]` block in `globals.css` that overrides the cinatra design tokens. The `ThemeColorSelector` component (`src/components/theme-color-selector.tsx`) writes `data-theme` to `<html>` and persists to `localStorage`. A small inline script in `src/app/layout.tsx` restores the selection before React hydrates to prevent flash.

Currently defined themes: **default** (no `data-theme` attribute) and **ocean** (`[data-theme="ocean"]`).

To add a new color theme:
1. Add a `[data-theme="my-theme"] { ... }` block to `globals.css` overriding the tokens you want to change
2. Add a `{ id: "my-theme", label: "My Theme", swatch: "#hex" }` entry to the `THEMES` array in `theme-color-selector.tsx`

Named themes compose with dark mode — the `.dark` class and `data-theme` are independent. A dark "ocean" theme would need `.dark[data-theme="ocean"]` overrides if the default `[data-theme="ocean"]` values don't look right in dark mode.

---

## Best practices (mandatory rules)

These rules are **enforced by the shadcn skill** (`.agents/skills/shadcn/SKILL.md`) and apply to all new code in this project.

### Never use hardcoded color classes

**Wrong:**
```tsx
<div className="bg-white text-slate-900 hover:bg-slate-900 hover:text-white" />
<div className="dark:bg-gray-800 dark:text-gray-100" />
```

**Right:**
```tsx
<div className="bg-surface-strong text-foreground hover:bg-primary hover:text-primary-foreground" />
```

The shadcn skill rule: **"No manual `dark:` color overrides. Use semantic tokens."**

Semantic tokens (`text-foreground`, `bg-surface-strong`) adapt to every theme automatically — no `dark:` variants needed. Adding explicit `dark:` color pairs is the wrong fix; it bloats classNames and still breaks when a third theme is added.

### Token cheat sheet (what to use instead of what)

| Instead of | Use |
|---|---|
| `text-slate-900`, `text-slate-800`, `text-slate-700` | `text-foreground` |
| `text-slate-600`, `text-slate-500`, `text-slate-400` | `text-muted-foreground` |
| `bg-white` | `bg-surface-strong` |
| `bg-white/80`, `bg-white/75`, `bg-white/70` | `bg-surface` |
| `hover:bg-slate-900 hover:text-white` | `hover:bg-primary hover:text-primary-foreground` |
| `hover:bg-slate-100`, `hover:bg-slate-50` | `hover:bg-surface-muted` |
| `border-slate-200`, `border-slate-300` | `border-line` |
| `focus:border-slate-400` | `focus:border-border` |

### When a semantic token doesn't exist

Add it to `globals.css` rather than hardcoding a value. See "Extending the theme" below.

---

## Extending the theme

To add a new cinatra design token that shadcn components can also use:

1. Add the raw value in `:root` in `globals.css`
2. Add a corresponding override in `.dark { ... }` if the dark value differs
3. Add a `var()` alias under the shadcn section if it maps to a shadcn concept
4. Add a `--color-*` entry in `@theme inline` to expose it as a Tailwind utility
