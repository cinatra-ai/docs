# Design operational rulebook moved

The design operational rulebook now lives with the Cinatra monorepo code it governs, in the design skill:

`cinatra/.agents/skills/design/operational/` — `01-resolutions.md`, `02-token-map.md`, `03-conformance-matrix.md`, `04-exception-policy.md`, `05-uncovered-ui-register.md`.

These are branch-specific implementation doctrine that code agents read offline, alongside the code, so they live in the monorepo skill rather than in published docs.

The **normative visual spec** stays in this docs repo at [`../design-system.html`](../design-system.html); the monorepo skill references it by URL.

Do not edit the operational rulebook here — make operational changes in the monorepo.
