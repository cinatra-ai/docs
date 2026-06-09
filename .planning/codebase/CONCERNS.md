# Codebase Concerns

**Analysis Date:** 2026-06-09

> This is a **documentation-only repository** (`/docs`). It contains no application source code — only Markdown reference docs, guides, assets, and a CI workflow. All concerns below are drawn from explicit issues, limitations, and known gaps documented within the docs themselves, plus structural observations about the repository.

---

## Tech Debt

**Non-agent extension kind mis-dispatch (critical, documented):**
- Issue: `ensureConfig()` throws when `getAgentPackage()` / `getPublishedExtensionKind()` are called without an explicit `VerdaccioConfig`. The extension install/update/uninstall/archive/restore dispatch in `packages/extensions/src/actions.ts` + `mcp/handlers.ts` calls these without config, swallows the throw, and falls through to `deriveTypeId(null)` → `"agent"`. Non-agent extension kinds (skill / connector / artifact) are silently mis-dispatched to the agent handler.
- Files: `references/platform/artifacts.md` § 5a (documents the bug)
- Impact: Skill, connector, and artifact extensions are mis-dispatched on main today. The marketplace listing path (`listAgentPackages()`) also drops non-agent extensions, so they never appear in the registry marketplace.
- Fix approach: Load `loadVerdaccioConfigForServer()` once at the server/MCP boundary; thread resolved `VerdaccioConfig` into `resolveExtensionTypeId` and every `getAgentPackage`/`getPublishedExtensionKind` call. Add a kind-agnostic `listExtensionPackages()` summary path.

**`personalSkillContent` deprecated but described as "must not be used":**
- Issue: `personalSkillContent` is documented as deprecated and explicitly forbidden for new code, but the field presumably still exists in the codebase.
- Files: `references/platform/llm-orchestration.md`
- Impact: Accidental re-use by contributors unfamiliar with the deprecation could silently degrade skill delivery to the LLM.
- Fix approach: Remove the field from the schema and all call sites; add a lint rule or structural test asserting absence.

**Dead retired blog media code still present:**
- Issue: `saveBlogPostImageToMediaLibrary()` is a retired throwing stub still present at `src/lib/blog/store.ts (~L1242)`. MCP primitives `blog_media_image_save` / `blog_media_list` exist as cleanup bridges awaiting removal. Object-type registration `@cinatra-ai/asset-blog:saved-media` and the `/assets/media` nav route were de-registered but not fully purged.
- Files: `references/platform/artifacts-preflight.md` (purge checklist)
- Impact: Dead code increases bundle / cognitive overhead; the retired throwing stub is a runtime trap if accidentally called.
- Fix approach: Execute the documented purge checklist in `references/platform/artifacts-preflight.md`.

**`objects_list` lacks server-side `data.<field>` filter:**
- Issue: The sender-identity list in the email connector uses a 200-row page budget with client-side `ownerLevel`/`ownerId` filtering because `objects_list` has no `data.<field>` server filter. Documented as a "future-scale TODO."
- Files: `references/platform/email-connector.md`
- Impact: Safe only while per-org record counts stay small; breaks at scale.
- Fix approach: Add structured-filter support to `objects_list` so the filter can be pushed to the database query.

**Monolithic deployment with no service boundary:**
- Issue: All packages run in a single Node process today. The migration to MCP-primitive-based microservices is documented as intentionally deferred with no timeline.
- Files: `references/mcp/migration-roadmap.md`
- Impact: A failure in any package takes the entire process; any change redeploys the whole app.
- Fix approach: Documented migration path exists (replace in-process transport with HTTP transport per package); execute when operational cost is justified.

**`A2AServer.serve_agent()` is last-writer-wins within a single instance:**
- Issue: The multi-tenant WayFlow runtime works around this by mounting distinct `A2AServer` instances per agent, but the underlying `serve_agent()` API is not multi-tenant safe.
- Files: `references/platform/agent-packaging.md`
- Impact: Any future code that shares a single `A2AServer` across agents will silently produce incorrect routing.
- Fix approach: Document this constraint more visibly; add a structural assertion in the WayFlow agent loader.

---

## Known Bugs

**Advisory agent dispatch deferred / non-functional in production:**
- Symptoms: `agent_source_review` in `"advisory"` mode always returns `ranAdvisoryAgents: []` and emits one `advisory_dispatch_deferred` suggestion per helper agent instead of running them.
- Files: `references/platform/chat-agent-authoring-review.md` § 3
- Trigger: Any call to `agent_source_review` with `reviewMode: "advisory"`.
- Workaround: Invoke helpers directly via `agent_run @cinatra/agent-planner` etc. for async output. Deterministic lint path is unaffected and fully functional.

**`run.orgId → actor.organizationId` wiring not implemented:**
- Symptoms: 5 tests in `build-actor-context-from-run.test.ts` are deliberately RED (excluded from CI with `--exclude`) because the `run.orgId` field is not wired through to `actor.organizationId`.
- Files: `references/platform/rbac-browser-e2e-ci.md`
- Trigger: Any code path that builds actor context from a run record and then uses `actor.organizationId`.
- Workaround: The excluded tests are the known gate; drop `--exclude` once wiring is implemented.

**`message/stream` not implemented on `A2AServer`:**
- Symptoms: Calling `method: "message/stream"` returns an error; only `"message/send"` is supported.
- Files: `references/platform/agent-packaging.md`
- Trigger: Any A2A client that requests streaming.
- Workaround: Always use `"message/send"`.

---

## Security Considerations

**Development bypasses require explicit documentation to avoid accidental production use:**
- Risk: `A2A_DEV_BYPASS=true` opens the A2A endpoint to any caller reaching the server. `CINATRA_RUNTIME_MODE=development` activates code paths that assume non-production trust boundaries. `CINATRA_MCP_DEV_ADMIN_BYPASS=true` skips OAuth for admin MCP handlers.
- Files: `references/platform/security.md`, `references/mcp/patterns.md`, `references/mcp/authentication.md`
- Current mitigation: All three are explicitly off-by-default; the docs warn against production use. The MCP bypass is deliberately scoped to OAuth-skip only and does not affect actor identity or A2A org fallback.
- Recommendations: Add runtime assertions that abort with a fatal error if any bypass env var is set while `NODE_ENV=production` and the request origin is non-loopback.

**Role field is a comma-joined multi-role string — equality checks are incorrect:**
- Risk: Any authorization check that compares the role field with `===` or single-string equality silently denies or mis-grants owner-capable accounts whose role field holds e.g. `owner,admin`.
- Files: `references/platform/security.md` § "Role values can be comma-joined multi-role strings"
- Current mitigation: Documented as an explicit invariant; the security doc mandates split-then-evaluate. No automated enforcement is mentioned.
- Recommendations: Add a lint rule or test that detects raw `=== "owner"` / `=== "admin"` comparisons on role fields in `src/lib/authz/`.

**CINATRA_E2E_SETUP_BYPASS bypasses setup wizard gate at process level:**
- Risk: If this env var is accidentally set in a production deployment, `isSetupWizardComplete()` returns true regardless of actual instance state, allowing unauthenticated users to bypass the onboarding redirect.
- Files: `references/platform/rbac-browser-e2e-ci.md`
- Current mitigation: Documented as explicit opt-in; does not bypass auth/RBAC. No runtime guard against production use.
- Recommendations: Assert `NODE_ENV !== "production"` before honoring the bypass, or restrict it behind `NODE_ENV=test`.

**Graphiti projector serializes full `objects.data` — secret/data exfiltration risk:**
- Risk: Full `objects.data` serialization into the Graphiti knowledge graph could surface secrets or PII through graph-memory queries.
- Files: `references/platform/artifacts.md` (risk table)
- Current mitigation: Documented; a metadata/excerpt-only projection policy is planned "before the first artifact write."
- Recommendations: Confirm the projection policy is implemented before artifact writes are enabled in production.

**Credential safety in OAS authoring relies on skill rule as first layer:**
- Risk: Chat assistant credential-safety enforcement is a skill rule in `packages/chat/skills/chat-assistant/SKILL.md` — not a hard technical constraint. The deterministic lint (`scanOasForLiteralSecrets`) is the second layer, but the first layer is advisory/LLM-enforced.
- Files: `references/platform/chat-agent-authoring-review.md` § 4
- Current mitigation: Two-layer defense is documented and the deterministic scan blocks compile/publish. The skill rule prevents most cases before they reach the scanner.
- Recommendations: Ensure `scanOasForLiteralSecrets` is tested exhaustively for bypass patterns (base64-encoded secrets, env-var-like substitution strings).

---

## Performance Bottlenecks

**Production build required for CI e2e (dev mode is unusably slow):**
- Problem: Running Playwright e2e against `pnpm dev` (Turbopack) repeatedly signal-kills the CI runner; the permissions page alone takes ~60s for first cold compile.
- Files: `references/platform/rbac-browser-e2e-ci.md`
- Cause: Turbopack compiles each route segment cold on first request; CI runners exhaust memory/time under that load.
- Improvement path: Already mitigated by running against a production build. Documented; no further action needed unless dev-mode e2e is required.

**Node.js heap requires `--max-old-space-size=4096` to build:**
- Problem: Default ~2GB worker heap OOMs during `pnpm build`.
- Files: `references/platform/rbac-browser-e2e-ci.md`
- Cause: Large Next.js monorepo + SSR compilation exceeds default V8 heap.
- Improvement path: Investigate tree-shaking / code-split opportunities to reduce build-time memory; or accept the current explicit flag as stable configuration.

**Drupal MCP probe cache is module-level (2-minute TTL, process-scoped):**
- Problem: Module-level probe cache persists for 2 minutes; distinct `siteUrl` values required in tests to avoid cache bleed.
- Files: `references/platform/drupal-connector.md`
- Cause: In-process caching without request scoping.
- Improvement path: Move cache to a request-scoped or injectable store to enable reliable test isolation without `siteUrl` tricks.

**`agent_run` queues via BullMQ and cannot return findings inline:**
- Problem: Synchronous helper execution for advisory review is architecturally blocked because `agent_run` is always async (BullMQ-queued). This caused the advisory dispatch to be non-functional in production (see Known Bugs).
- Files: `references/platform/chat-agent-authoring-review.md`
- Cause: No synchronous variant of `agent_run` exists; `agent_source_review` advisory mode therefore degrades to a stub.
- Improvement path: Implement a direct `/api/llm-bridge` call surface or a synchronous helper-execution primitive.

---

## Fragile Areas

**CI merge gate not enforced (org on free GitHub plan):**
- Files: `references/platform/rbac-browser-e2e-ci.md`
- Why fragile: The RBAC browser e2e and authz unit jobs run as visible checks but cannot block merges. Merges proceed via `--admin`. A broken authz change could merge without failing required checks.
- Safe modification: Upgrade to GitHub Team / Pro or make the repo public to enable branch protection required status checks. Until then, manually verify `RBAC browser e2e` and `RBAC authz unit tests` pass before merging security-sensitive changes.
- Test coverage: 9 Playwright tests + 160 authz unit tests exist but are not enforced gates.

**`app-shell.tsx` flyout DOM on stale component model:**
- Files: `references/platform/notifications.md` (Known gaps)
- Why fragile: The flyout DOM in `app-shell.tsx` is on a component model that needs a rebuild; changes to notification display logic risk breakage.
- Safe modification: Treat flyout rendering as high-risk until the component model rebuild is completed.

**`window.confirm()` dialogs still used:**
- Files: `references/platform/notifications.md` (Known gaps)
- Why fragile: `window.confirm()` is not testable in Playwright/jsdom and blocks the event loop; any test relying on confirm dialogs will behave inconsistently.
- Safe modification: Replace with `<AlertDialog>` wrapper before adding e2e tests that trigger these dialogs.

**HITL A2UI surfaces linger until Redis Streams TTL:**
- Files: `references/platform/a2ui-usage.md`
- Why fragile: `AgentUIAdapter.onResume` does not yet accept `reviewTaskId` to delete the surface on resume. Surfaces accumulate until TTL expires. Acceptable only while no A2UI native client renders them.
- Safe modification: Do not build A2UI native client rendering of HITL surfaces until explicit deletion on resume is implemented.

**BullMQ worker module cache does not hot-reload:**
- Files: `references/platform/agent-packaging.md`
- Why fragile: Changes to `packages/agents/src/execution.ts` require a full server restart even with Turbopack hot reload active. A developer who forgets the restart will see stale execution behavior.
- Safe modification: Always restart the dev server after changes to the execution module; add a comment in `execution.ts` warning about this.

---

## Scaling Limits

**Notification system: in-app inbox only:**
- Current capacity: Single-channel (in-app inbox via Redis Streams).
- Limit: No email, SMS, or push notification delivery; the recipient policy is channel-agnostic but the service only emits to the in-app channel.
- Files: `references/platform/notifications.md`
- Scaling path: Implement a provider abstraction (documented as "a provider abstraction decision is still needed") and wire email/SMS/push providers.

**Email sender-identity list capped at 200 rows with client-side filtering:**
- Current capacity: 200-row page budget; client-side `ownerLevel`/`ownerId` filter.
- Limit: Breaks at scale when per-org sender-identity record counts exceed the page budget.
- Files: `references/platform/email-connector.md`
- Scaling path: Add `data.<field>` server-side filter to `objects_list` and push the filter to the database.

---

## Dependencies at Risk

**`better-auth migrate` CLI incompatible with `import "server-only"` in the auth config:**
- Risk: The Better Auth migration CLI bundles the `auth.ts` import graph and statically refuses any `import "server-only"`. This means the standard migration path cannot be used in CI without mutating `node_modules`.
- Files: `references/platform/rbac-browser-e2e-ci.md`
- Impact: Schema migrations rely on a committed SQL snapshot (`tests/e2e/rbac/fixtures/public-schema.sql`) regenerated manually against a working local DB; if this diverges from the actual schema, CI provisioning silently runs on stale schema.
- Migration plan: Track the Better Auth issue; consider contributing a fix upstream or abstracting schema generation to avoid the `server-only` transitive dependency.

---

## Missing Critical Features

**Advisory agent review (security-reviewer, code-reviewer, planner) not wired:**
- Problem: The three advisory helper agents (`agent-planner`, `agent-security-reviewer`, `agent-code-reviewer`) exist on disk as valid OAS Flow agents but cannot be dispatched synchronously from `agent_source_review`. The architectural surface (synchronous `agent_run` variant or direct `/api/llm-bridge` call) does not exist.
- Blocks: Full LLM-based OAS security review before agent publish; prompt-injection and scope-bypass detection depend on the security-reviewer helper.
- Files: `references/platform/chat-agent-authoring-review.md`

**Multi-channel notifications not wired:**
- Problem: Email, SMS, and push delivery channels are not implemented despite the recipient policy being channel-agnostic.
- Blocks: Notification delivery outside the active browser session.
- Files: `references/platform/notifications.md`

---

## Test Coverage Gaps

**`src/` vitest suite not run by default `test` command:**
- What's not tested: The root `src/lib/authz` suite (20 files / 160 tests) is only run by the dedicated `rbac-authz-unit` CI job. The default `pnpm test` command skips it (because appending to `test` would skip after `packages/agents` baseline fails).
- Files: `references/platform/rbac-browser-e2e-ci.md`
- Risk: A contributor running `pnpm test` locally sees passing tests even if authz logic is broken.
- Priority: High — authorization correctness is security-critical.

**5 placeholder authz tests deliberately RED and excluded from CI:**
- What's not tested: `build-actor-context-from-run.test.ts` — 5 tests for `run.orgId → actor.organizationId` wiring are excluded from CI with `--exclude` until the wiring is implemented.
- Files: `references/platform/rbac-browser-e2e-ci.md`
- Risk: The unimplemented wiring could silently affect run-scoped authorization decisions.
- Priority: High — drop `--exclude` and implement wiring.

**Skill golden-set evaluation requires manual opt-in (`GOLDEN_EVAL_LIVE=1`):**
- What's not tested: The LLM skill-matching golden-set evaluation suite (85% accuracy gate, Spearman correlation gate) is skipped in all offline CI runs. The accuracy and correlation thresholds are only verified when both `OPENAI_API_KEY` and `GOLDEN_EVAL_LIVE=1` are set.
- Files: `references/platform/skill-matching.md`
- Risk: A skill-matching regression (LLM prompt drift, model change) would not be caught in standard CI.
- Priority: Medium — schedule periodic live eval runs as a separate CI job.

**E2e RBAC suite is not a required merge gate:**
- What's not tested: 9 Playwright RBAC scenarios run but cannot block merges on the current free-plan GitHub org.
- Files: `references/platform/rbac-browser-e2e-ci.md`
- Risk: A RBAC regression could reach `main` without a failing required check.
- Priority: High — enforce as required status check once branch protection is available.

**`KNOWN_BROKEN_AGENTS` allowlist masks OAS-RUNTIME-005 violations:**
- What's not tested: Agents with inlined context subflows are recorded in `KNOWN_BROKEN_AGENTS` with an exact `expectedBlockerCount`. If a broken agent's blocker count drifts (e.g., additional inlined subflows added), the count mismatch will fail — but the allowlist means these agents never need to be fixed.
- Files: `references/platform/blog-and-social-connectors.md`
- Risk: The allowlist can grow over time, normalizing structurally broken agents rather than requiring them to be fixed.
- Priority: Medium — audit `KNOWN_BROKEN_AGENTS` entries and resolve the underlying inlined-context-subflow violations where feasible.

---

*Concerns audit: 2026-06-09*
