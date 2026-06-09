# Coding Conventions

**Analysis Date:** 2026-06-09

> Note: This repository (`cinatra-ai/docs`) is a pure documentation site — Markdown, HTML, SVG, and one YAML workflow. The conventions below describe (a) the documentation authoring conventions observed in this repo and (b) the platform coding conventions documented here for the `cinatra-ai/cinatra` monorepo, because `/gsd-execute-phase` agents working in the docs repo need both.

---

## Documentation Authoring Conventions (this repo)

### File Naming

- **Files:** kebab-case everywhere (`ui-patterns.md`, `testing-doctrine.md`, `rbac-browser-e2e-ci.md`).
- **Directories:** kebab-case (`guides/developer/`, `references/platform/`, `references/design/`).
- Every directory has a `README.md` that acts as a directory index.

### Markdown Structure

- One `#` H1 at the top matching the file's concept.
- `---` horizontal rules used to separate major sections, not H2s alone.
- Code blocks always use a language tag (` ```ts `, ` ```bash `, ` ```json `, ` ```tsx `).
- Blockquote `>` used for callouts/notes; GitHub-flavored `> [!WARNING]` callout syntax used in `README.md`.
- Tables used for structured reference data (token maps, field maps, job descriptions).
- Cross-links use relative Markdown paths (`../../references/platform/security.md`), not absolute URLs.

### Internal Link Conventions

- Every cross-reference is a relative path with `.md` extension.
- Link text is the document's H1 title (or the concept name), not "click here".
- "See also" sections placed at document end, not inline.

### Content Tone

- Active voice, imperative mood for instructions: "Use `<Card>` for every top-level page chrome panel."
- Anti-patterns explicitly called out in their own subsections with **Anti-pattern callout:** heading or bold label.
- "Do NOT" in all-caps signals a gating rule enforced by CI or design scanners.

---

## Platform Code Conventions (documented here, applies to `cinatra-ai/cinatra`)

These conventions are normative for anyone writing code guided by this documentation set.

### Naming Patterns

**Files:**
- kebab-case for all source files: `status-adapter.ts`, `tailscale-provision.mjs`, `dev-tunnel.test.mjs`.

**Functions:**
- camelCase: `shouldWritePublicBaseUrl`, `isSetupWizardComplete`, `ensurePostgresSchema`.

**Variables:**
- camelCase.

**Types / Components:**
- PascalCase: `StatusPill`, `CardHeader`, `NextConfig`.

**MCP primitives:**
- `<package>_<verb>` snake_case: `extensions_install`, `extensions_force_delete`, `extensions_purge`.

### TypeScript Rules

- TypeScript-first; strict mode on (`noImplicitAny: false`).
- Always use `import type` for type-only imports.
- No direct imports of provider SDKs (OpenAI, Anthropic, Gemini) from outside `@cinatra-ai/llm` — all LLM calls go through the orchestration layer.
- Packages communicate through capability surfaces (MCP primitives via the deterministic client), not by importing each other's internals.

Source: `guides/developer/contributing.md` lines 103–106.

### Import Organization

- External/third-party imports before internal package imports.
- Path alias `@/` maps to `src/` (inferred from `@/components/ui/card`, `@/lib/utils`).
- `import type` for type-only imports (enforced convention per contributing guide).

### UI / Component Style

**Tailwind:**
- Use semantic tokens only — never hardcode palette classes (`bg-emerald-50`) or raw hex/oklch values in `src/**`.
- Raw colors must be in `scripts/design/allowlist-raw-colors.json` or CI fails (`pnpm design:scan:raw`).
- `bg-muted` = muted surface (not muted text). `bg-accent` = subtle hover tint.
- Use `font-mono` for microcopy, IDs, table headers.

**Components:**
- `<Card>` from `src/components/ui/card.tsx` for all top-level page chrome panels.
- shadcn/ui components over raw HTML elements.
- `cn()` helper at `@/lib/utils` (clsx + tailwind-merge) for all className merges.
- Page shell: every full-page screen uses `Main`, `PageHeader`, `PageContent` — no raw `<div>` wrappers.
- Status indicators: always `<StatusPill status="...">` via `src/lib/status-adapter.ts`; never hand-rolled color classes.

**Dark mode:**
- No hand-rolled `dark:` overrides on primitives; semantic token palette adapts automatically.

Source: `references/design/ui-design-system.md`, `references/design/ui-patterns.md`, `references/design/working-with-the-design-skill.md`.

### Server Actions

- Server actions live next to the surface that uses them — never split into a separate package to "share".
- Shared server-side functionality is exposed through an MCP primitive, not by exporting server actions.

### Error Handling

Not explicitly documented in the docs repo beyond surface-level notes. The platform uses structured error responses through MCP primitives. No global error handling pattern documented here.

### Logging

Not detailed in this documentation set. Telemetry and logging admin configuration is in `guides/admin/telemetry-and-logging.md`.

### Comments

- Commit messages: describe the *why*, not just the *what* (`guides/developer/contributing.md` line 121).
- Inline comments used extensively in CI YAML to explain non-obvious choices (see `.github/workflows/notify-ops.yml`).

### Module / Package Design

- Every package under `packages/<name>/` owns: capability surface (MCP primitives), persistence (Drizzle schema + store), background jobs (BullMQ workers), UI (React screens), and a deterministic client.
- Deterministic client: typed in-process wrapper for cross-package calls — no HTTP round-trips for internal use.
- Agent definitions: canonical path `agents/<vendor>/<slug>/cinatra/oas.json`; OAS Flow 26.1.0 format.

Source: `references/platform/architecture.md`, `references/platform/agent-spec.md`.

### CI / Toolchain Commands

```bash
pnpm typecheck          # fast type check via tsgo
pnpm lint               # ESLint
pnpm build              # production build
pnpm design:scan        # raw-color + status-render + chart-color scanners
pnpm design:scan:raw    # gating: no unallowlisted colors in src/**
pnpm design:scan:status # gating: no hand-rolled status pills
pnpm design:tokens:check # gating: token snapshot drift
pnpm design:tokens:write # update committed token baseline
```

Source: `guides/developer/contributing.md`, `references/design/working-with-the-design-skill.md`.

---

*Convention analysis: 2026-06-09*
