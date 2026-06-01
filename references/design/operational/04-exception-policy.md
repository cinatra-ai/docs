# Exception Policy

Governs how approved deviations from `../cinatra-design/docs/design-system.html` are recorded and how new exception requests are handled.

---

## Recorded deviations (approved 2026-05-19)

### EX-1 — Body typography stays Inter

**Spec §IX:** "Body prose — Archivo 400."
**Deviation:** Inter is retained for body. Archivo is wired to a new `--font-display` lane (NOT `--font-sans`).
**Rationale:** Replacing Inter globally changes density, table column widths, sidebar labels, button + form heights. The ergonomic risk is too high for the current design-system rollout; the spec was authored from a green-field display starting point, while cinatra is brown-field.
**Bounds:** Archivo IS used for display surfaces (headlines, wordmark, drop-caps, brand mark, italic 800 numeric accents in avatars / extension cards). JetBrains Mono IS adopted for microcopy / IDs / table headers per spec.
**Revisitable:** Yes. Re-evaluate after the rest of the design-system work lands and the density risk can be measured rather than estimated.

### EX-2 — Dark mode legacy carve-out

**Spec scope:** Light only ("do not touch dark mode" — `INSTRUCTIONS.md`).
**Deviation:** The repo has a full `.dark` block. Tokens are shared; primitives auto-adapt.
**Rationale:** Dark mode is legacy. Removing or redesigning it is out of scope. The constraint is **must not visibly regress**; dark-mode token snapshot diff gates every primitive change.
**Bounds:** No edits to the `.dark` block unless required to preserve existing dark appearance through token rewiring. For example, if `--success` is retuned through the shared token name and that rewiring causes a visible darkness shift, the `.dark` value must be retuned too.
**Revisitable:** Yes. Later design-system work may either adopt the design system for dark mode or formally deprecate dark mode.

### EX-3 — Component conformance precedence

**Conflict:** When the spec HTML and the shipped reference components in `../cinatra-design/src/components/` disagree, **the reference components win** for component code. For tokens and rules, the resolutions doc (`01-resolutions.md`) wins.
**Example:** §IV labels red as "Running" but `status-pill.tsx` codes `running: text-primary` (indigo). The component is the operational truth (cf. R1).

### EX-4 — BrandMark drop-shadow omitted

**Spec §I rule 5:** "No drop-shadows on the wordmark."
**Conflict:** A reference SVG includes `style="filter: drop-shadow(0 1px 0 rgba(122,58,30,0.22));"` on the wordmark `<text>`.
**Decision:** Omit the drop-shadow — follow the written rule. The reference SVG is artist-tooling output, not a binding override.
**Escape hatch:** The owner may opt back in by adding `filter: drop-shadow(0 1px 0 rgba(122,58,30,0.22))` to the visible wordmark `<text>` in `src/components/brand-mark.tsx`. If exercised, document the override in this file as a deliberate spec deviation.
**Revisitable:** Yes. Later design-system work may either codify the drop-shadow into the spec or keep the omission permanently.

---

## Process for new exceptions

Any deviation NOT in this file requires owner approval BEFORE shipping. Until approved, the work either:

1. Applies the spec/resolutions rule as-is, OR
2. Records a row in `05-uncovered-ui-register.md` with category `NEEDS_OWNER_DECISION`.

**Inline `// design-exception:` comments are NOT recognised as exceptions.** Only this file is authoritative. A drift-by-comment that lands on `main` is a regression; the next scanner sweep removes it.

## Forbidden exceptions

These cannot be opened as exceptions regardless of rationale:

1. Restyling a UI element by guess because it does not appear in the spec (per user mandate). Use the uncovered-UI register instead.
2. Introducing a new raw color outside the allowlist. Use semantic tokens or extend the token map (`02-token-map.md`) with an owner-approved addition.
3. Removing a UI element because it does not fit the spec (per user mandate). Use `DEPRECATED_BUT_NOT_REMOVED` in the register.
4. Hand-rolled `dark:` overrides on primitives (per D2 — semantic tokens already adapt). The exception is a `.dark` block CSS variable edit, which goes through this file.
5. A third red, third green, third indigo, etc. (per §VIII rules 4, 5).
