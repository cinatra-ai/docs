# Design System — Resolutions Doc (binding)

**Status:** Operational source for autonomous and human contributors. Supersedes the HTML spec where they conflict.

---

## Why this file exists

`../cinatra-design/docs/design-system.html` is the normative spec but it carries **stale internal drift** (§IV red swatch labels "running") and does **not encode design deviations** (Inter body, dark-mode legacy). Agents and humans reading the HTML alone would either apply the wrong rule or fight the recorded judgement.

This doc encodes the four resolutions and the two design decisions in one place. The design skill (`.agents/skills/design/SKILL.md`) reads this file first.

---

## Design decisions (binding)

### D1 — Body typography

**Decision:** Archivo is used for **display only** — headlines, the wordmark, drop-caps, and the brand mark.
**Inter is retained for body.** This is a binding deviation from spec §IX (which mandates Archivo 400 for body).

JetBrains Mono **IS** adopted for microcopy / IDs / table headers per spec.

Token wiring:
- `--font-sans` → Inter (unchanged from current repo)
- `--font-display` → Archivo (dedicated display lane)
- `--font-mono` → JetBrains Mono (replaces SF Mono)

### D2 — Dark mode

**Decision:** Dark mode is legacy. **Excluded from spec conformance, must not visibly regress.**

The repo has a full `.dark` block sharing semantic tokens. Every primitive change is checked with a dark-mode token snapshot diff. No `.dark` block edits except as required to preserve the existing dark appearance through token rewiring.

---

## Spec defects reconciled (binding)

### R1 — "Running" is indigo, not red

**Conflict:** §IV (Accents) red swatch labels red `running · destructive` and "'Running' status". §III, §VIII rule 4, §VI pill CSS, the shipped `status-pill.tsx`, and `INSTRUCTIONS.md` all say running = **indigo**, red = destructive only.

**Resolution:** Running = indigo (`--primary` / `var(--blue)` / `#364E81`). Red is destructive only. The §IV swatch's "running" label is **stale drift**; ignore it. This file is operational source — agents and the design skill cite this resolution, not the HTML.

### R2 — Hairlines must be navy, not grey

**Repo today:** `--line: #dcdcd6`, `--line-strong: #b8b8b1` (both grey).
**Spec mandate (§III):** `--line: rgba(21,33,58,.14)`, `--line-strong: #15213a` plus etched paired-line section dividers.

**Resolution:** Adopt the spec values. Implementation must ensure `globals.css` carries these values.

### R3 — Light status palette must retune

**Repo today:**
- `--success: oklch(0.50 0.17 145)` (Slack-green)
- `--warning: oklch(0.52 0.14 55)` (amber)
- `--info: oklch(0.47 0.13 240)` (blue)

**Spec mandate (§IV + §VIII rule 5):** Sea-green `#3F6E6B` is the ONLY green in the system. Mustard `#C79545` for "needs you" / `on hold`. Indigo `#364E81` for info / running.

**Resolution:**
- `--success: #3F6E6B` (sea-green)
- `--warning: #C79545` (mustard — same as `--needs-attention`, intentional)
- `--info: #364E81` (indigo — same as `--primary`, intentional)

Foreground tokens (`--success-foreground` etc.) remain `#ffffff` (white on green/indigo lands at ≥6.1:1 per §VII contrast table).

### R4 — Fonts: Archivo display + JetBrains Mono microcopy

**Repo today:** `--font-sans: Inter`, `--font-mono: SFMono-Regular`, no JetBrains Mono loaded.
**Spec mandate (§IX):** Archivo + JetBrains Mono.

**Resolution:**
- `--font-sans` stays Inter (per D1)
- `--font-display` is **new** — Archivo, used by `.font-display` utility, headlines, wordmark, drop-caps, brand mark
- `--font-mono` switches to JetBrains Mono — used by table headers (uppercase mono), microcopy, IDs, timestamps

`next/font/google` loads both Archivo and JetBrains Mono in `src/app/layout.tsx`.

---

## Validation gates

Every change that touches CSS, primitives, or call sites must pass:

1. **Raw-color scanner** — `scripts/design/scan-raw-colors.mjs` returns 0 unallowlisted hex codes in `src/**`. Allowlist is in `scripts/design/allowlist-raw-colors.json` (current contents: SVG-only colors, the cinatra-brand logo fill, the extension-card accent palette which is data-driven).
2. **Status-render scanner** — `scripts/design/scan-status-render.mjs` returns 0 ad-hoc status renderings outside `src/lib/status-adapter.ts` and `src/components/ui/status-pill.tsx`.
3. **Token snapshot** — `scripts/design/snapshot-tokens.mjs` produces a comparable token snapshot; diff must match the resolutions above.
4. **`pnpm typecheck`** — zero new errors (delta 0).
5. **Dark-mode token snapshot** — `tokens-snapshot.json` includes the `.dark` block; any change to `.dark` requires a register row.

---

## Out of scope

- Dark-mode redesign.
- Removing or restyling spec-uncovered UI without a register row.
- Chart visual overhaul beyond palette policy.
- Marketing / `@daveyplate/better-auth-ui` surfaces (`EXTERNAL_COMPONENT_BOUNDARY`).

---

## How to cite this file

When making a design decision in a PR description, code comment, or register row, cite as **R1**, **R2**, **R3**, **R4** (spec defects) or **D1**, **D2** (design decisions). Example: "Switched `--success` to `#3F6E6B` per R3."
