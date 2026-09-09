## 2026-09-09 — docs-mirror-151 (mirror/design-artifacts-toolbar-rule)

This head is a preserved failing state, not a candidate.
Verification boundary: preserved-failing at 1a2e23f253b93e492f227a24626932a2fb655a52

Verification record (lane run, 2026-09-09):

Failures: none (failures: []).

Deferred checks:
- secret-scan-gate / secret-scan-gate — engine is the upstream TruffleHog GitHub Action (trufflesecurity/trufflehog), not a local node script — cannot run outside the Actions runner.
- cited-paths-gate — not wired to pull_request in its own workflow (schedule + workflow_dispatch only) — never runs as a PR check; run locally anyway for due diligence and confirmed same-as-main (7 unresolved citations, identical to main, none in the two touched files), so no gate/failure entry needed.
- check-published-sync.mjs (design repo) — task asked to run this against the docs worktree if it accepts a local path — it does not: it always fetches the committed bytes from https://raw.githubusercontent.com/cinatra-ai/docs/main/, i.e. the already-merged remote main, not this uncommitted candidate diff or worktree path, so it cannot meaningfully verify this PR before merge.

Suites (10 total, all pass or same-as-main):
- design source: artifacts-toolbar-replaces-rule-drawing.test.mjs — 4 pass / 4 total
- design source: conformance.test.mjs (full conformance suite) — 33 pass / 33 total
- docs: check-artifact-ui-contradictions.mjs --selftest — OK, 21 retired claims caught, 13 legitimate sentences pass clean
- docs: check-artifact-ui-contradictions.mjs — OK, 0 superseded-boundary claims across tracked Markdown pages
- docs: check-meta-commentary.mjs — OK, 0 violations across 168 tracked Markdown/HTML pages
- docs: check-meta-commentary-parity.mjs — OK, engine reproduces shared verdict exactly (53 violations over 2 corpus files, 6 digests verified)
- docs: check-cited-paths.mjs (nightly/manual only, not a required PR check) — 7 unresolved citations, none in the two touched files; measured identical on origin/main
- byte comparison: references/design/application-design-artifacts.html vs design publish build output — byte-identical (sha256 57f9cd0c...02106a65 both sides)
- byte comparison: references/design/conformance/app-artifacts.json vs design generate-conformance.mjs output — byte-identical (diff empty)
- root suite (pnpm test:root) / whole-repository suite — skipped this round (quick tier)

Gates (12 total):
- source-leak-gate (ops-docs profile) — exit 0
- gitignore-gate — exit 0
- actions-pinned-gate — exit 0
- objects-writer-drift-gate.mjs — absent
- objects-surface-drift.test.ts — absent
- route-graph-ratchet.mjs — absent
- core-extension-border-gate.mjs — absent
- product-tree-hygiene.mjs — absent
- design-pin-drift.mjs — absent
- ci-pinned-tests-exist.mjs — absent
- surface-guard.sh claim docs-mirror-151 — exit 0
- leak-gate on added lines — exit 0

Typecheck: zero errors (0), same as main (0 errors).

Assisted-by: Claude Code (claude-opus-5)
