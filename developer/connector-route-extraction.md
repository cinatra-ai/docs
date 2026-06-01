# Connector setup-page route extraction pattern

**Status:** canonical
**Scope:** when promoting a host-side `src/app/connectors/<slug>/page.tsx` into a self-contained `extensions/cinatra-ai/<slug>-connector/` extension so the page is served by the unified dispatch route at `/connectors/cinatra-ai/<slug>/setup`.

## When to use this pattern

You're folding an existing host route into its connector extension so the extension is genuinely self-contained. Pre-conditions:

- The host page already lives at `src/app/connectors/<slug>/page.tsx` and works.
- The extension `extensions/cinatra-ai/<slug>-connector/` exists.
- The dispatch route `src/app/connectors/[vendor]/[slug]/[subroute]/page.tsx` is in place; the loader map at `src/lib/connector-setup-pages.ts` has a placeholder entry for the slug.

## Three-file split

Extract the host page into THREE files inside the extension:

```
extensions/cinatra-ai/<slug>-connector/src/
├── <slug>-setup-impl.tsx        # the page implementation (named export)
├── <slug>-setup-actions.ts      # server actions extracted from the host route (if any)
└── setup-page.tsx                # default-exported dispatch-route adapter (thin wrapper)
```

The split is load-bearing for three reasons:

1. **`setup-page.tsx` is the contract surface.** It's a thin default-exported async server component that adapts the dispatch route's `ConnectorSetupPageProps` (`{ packageId, slug, searchParams }`) to whatever the named-export `<Slug>ConnectorPageImpl` actually wants. Keep it ≤20 lines. Nothing else lives here.
2. **`<slug>-setup-impl.tsx` carries the page UI.** Move the original host page verbatim, then change `export default async function <Slug>ConnectorPage(...)` → `export async function <Slug>ConnectorPageImpl(...)`. Update internal imports from `@/app/...` to `./...` where they were colocated in the host route directory.
3. **`<slug>-setup-actions.ts` is the form-action home.** If the host route had its own `actions.ts` colocated, extract it as a sibling. Update:
   - Imports that resolved against `@cinatra-ai/<slug>-connector` (the extension itself) → `./index` (the file is now INSIDE the extension).
   - All `revalidatePath(...)` / `redirect(...)` strings that point at `/connectors/<slug>` → `/connectors/cinatra-ai/<slug>-connector/setup`.

## Mechanical recipe

```bash
WT=<your-checkout>/.claude/worktrees/<your-worktree>
SLUG=<slug>              # e.g. "tailscale"
EXT=$WT/extensions/cinatra-ai/${SLUG}-connector/src
HOST=$WT/src/app/connectors/${SLUG}

# 1. Copy page + colocated files into the extension.
cp $HOST/page.tsx           $EXT/${SLUG}-setup-impl.tsx
cp $HOST/actions.ts         $EXT/${SLUG}-setup-actions.ts          # if present
cp $HOST/<other-client>.tsx $EXT/<other-client>.tsx                # if present

# 2. Rename default export to a named one (in <slug>-setup-impl.tsx).
sed -i.bak "s|export default async function ${SLUG^}ConnectorPage|export async function ${SLUG^}ConnectorPageImpl|" $EXT/${SLUG}-setup-impl.tsx

# 3. Flip self-referential package imports inside extracted files.
#    `@cinatra-ai/<slug>-connector` → `./index` (we're now INSIDE that package).
sed -i.bak "s|@cinatra-ai/${SLUG}-connector\"|./index\"|g" $EXT/${SLUG}-setup-actions.ts $EXT/${SLUG}-setup-impl.tsx

# 4. Flip redirect / revalidatePath strings to the canonical dispatch path.
sed -i.bak "s|/connectors/${SLUG}|/connectors/cinatra-ai/${SLUG}-connector/setup|g" $EXT/${SLUG}-setup-impl.tsx $EXT/${SLUG}-setup-actions.ts

# 5. Flip action import from "./actions" → "./<slug>-setup-actions" inside any
#    client component that used the colocated `actions.ts`.
sed -i.bak "s|from \"./actions\"|from \"./${SLUG}-setup-actions\"|" $EXT/<other-client>.tsx

# 6. Write the setup-page.tsx adapter (default export, ~15 lines):
cat > $EXT/setup-page.tsx <<'EOF'
import { <Slug>ConnectorPageImpl } from "./<slug>-setup-impl";
type ConnectorSetupPageProps = {
  packageId: string;
  slug: string;
  searchParams: Record<string, string | string[] | undefined>;
};
export default async function <Slug>ConnectorSetupPage({
  searchParams,
}: ConnectorSetupPageProps) {
  return <Slug>ConnectorPageImpl({ searchParams: Promise.resolve(searchParams) });
}
EOF

# 7. Wire tsconfig path alias.
#    "@cinatra-ai/<slug>-connector/setup-page": ["./extensions/cinatra-ai/<slug>-connector/src/setup-page.tsx"]
#    (add manually in tsconfig.json paths block)

# 8. Flip the loader map in src/lib/connector-setup-pages.ts from
#    PLACEHOLDER_SETUP_PAGE_LOADER → () => import("@cinatra-ai/<slug>-connector/setup-page").

# 9. Delete the host route.
rm -rf $HOST

# 10. Typecheck. If clean, commit.
( cd $WT && corepack pnpm typecheck )
```

## Gotchas

- **Default vs named export.** The dispatch route does `const SetupPage = mod.default`. If `setup-page.tsx` exports a named function instead of default, the dispatch route resolves `undefined` and React renders nothing. Always default-export.
- **Promise-shaped `searchParams`.** The host page typically takes `{ searchParams?: Promise<Record<...>> }` (Next.js 16 contract). The dispatch route passes a plain object. The adapter wraps: `searchParams: Promise.resolve(searchParams)`. Don't skip the wrap — TS will catch it but the runtime error is opaque.
- **Self-import path.** When the extracted code imports something now in the same package, prefer `./index` over `@cinatra-ai/<slug>-connector` — the latter is a tsconfig path alias that resolves to the same place but pnpm in some configurations refuses self-referential package specifiers, and the relative path is faster to read.
- **`revalidatePath` cardinality.** A page deletion under `src/app/connectors/<slug>/` invalidates that route specifically. Revalidate BOTH the new canonical path AND the old one (if any external link still points there); React Router doesn't follow the dispatch route automatically.
- **Client components.** If the host route had a `"use client"` component colocated (e.g. a Copy-to-clipboard panel), copy it verbatim into the extension. The `"use client"` directive works the same way; only the file path changes.
- **`metadata` export.** The legacy host route had `export const metadata: Metadata = { title: "..." }`. The dispatch route owns metadata via its own `generateMetadata()`. Don't re-export `metadata` from the impl file — Next.js will warn but the dispatch metadata wins.
- **Stale `.next` cache after route deletion.** `rm -rf .next/dev/types` between `pnpm typecheck` runs on the main worktree if the cache complains about removed files (`Cannot find module '../../../src/app/connectors/<slug>/page.js'`). The fix is to clear, not to add the file back.

## Verification gates

After the migration:

- `pnpm typecheck` exit 0 — most common failure is a missed `./index` import (the self-referential one) or an unflipped `revalidatePath` string.
- `src/lib/__tests__/connector-setup-pages-parity.test.ts` (3/3 pass) — confirms the catalog descriptors and the loader map are still in sync.
- `src/lib/__tests__/connector-dispatch-route.test.ts` (7/7 pass) — confirms the dispatch route resolves the slug via the registry.
- `node scripts/audit/agent-builder-enqueue-gate.mjs` — unaffected by route work but a good sanity check the worktree is still clean.

## Reference extraction cases

Use these cases to choose the smallest migration shape that preserves behavior:

| Slug | Useful note |
|---|---|
| `apify-connector` | full setup-page route extraction |
| `gmail-connector` | full setup-page route extraction |
| `tailscale-connector` | full setup-page route extraction with a client component |
| `a2a-server-connector` | full setup-page route extraction with form actions |
| `google-oauth-connector` | setup-page-only wrapper around `@cinatra-ai/google-oauth-connection` |
| `google-calendar-connector` | folded Appointment Schedules into the same setup page |
| `gemini-connector` | full setup-page route extraction |
| `claude-connector` | relocated `src/lib/mcp-oauth-clients.ts` into the extension |

Some connectors use a shorter variant of this pattern: when the extension has a working `settings-page.tsx`, the migration can be a small `setup-page.tsx` wrapper around the existing named export. Use the short variant whenever a working `settings-page.tsx` is already in the extension; use the full three-file split when extracting a host route.
