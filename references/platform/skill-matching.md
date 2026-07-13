# Skill Matching — LLM Evaluator + OpenAI Batch + Visibility Filter

Cinatra evaluates whether each `(agent, skill)` pair is a match using a small OpenAI model, persists the decision to the `skill_matches` table, and surfaces it on the admin matches tab. This page covers what gets evaluated, when evaluation runs, where the decisions live, and how the visibility, stale-write, and manual-protection guarantees compose.

## Overview

Three sources can write a decision row for a `(agent, skill)` pair:

- **Rule-based** — the skill author declared a `match_when` clause in the SKILL.md frontmatter and the rule short-circuits to a `true` or `false` answer without consulting the large language model (LLM). This covers `always`, `agent_id: "<npm-name>"`, and `agent_has_tag: "<tag>"` clauses.
- **LLM-based** — the rules are absent, the rules are malformed, or the rules don't short-circuit; the matcher prompts a small OpenAI model with the skill's content and the agent's metadata, parses a structured JSON response, and writes the model's decision.
- **Manual** — an admin clicked "Add" or "Remove" on the matches tab; the row is locked from subsequent rule or LLM rewrites.

`level: "agent"` skills self-match unconditionally without any LLM call. `level: "system"` skills inject globally without any LLM call. The matcher only evaluates the other levels (`third-party`, `personal`, `team`, `organization`, `workspace`, `project`).

## When evaluation happens

Three transports write to the same evaluator core; they only differ in scope and latency.

**Inline on install or update.** Installing a skill or saving an agent enqueues a single scoped BullMQ (a Redis-backed job queue) job (`skill-match-inline-for-skill` or `skill-match-inline-for-agent`) on the existing `cinatra-background-jobs` queue. The job fans out across the matching set — agents × the new skill, or skills × the new agent — evaluating in fixed 200-pair chunks. An event larger than one chunk spills the remainder into continuation jobs over a frozen, de-duplicated candidate set carrying a per-run nonce, so every pair is evaluated exactly once even if the catalog churns mid-run, and two concurrent runs for the same entity cannot coalesce and drop a chunk. Job IDs are SHA-256 prefixes of the changed entity's ID, so back-to-back reinstalls coalesce into a single execution while pending.

**Per-row from the admin tab.** The "Re-evaluate" button next to each row in `/configuration/skills?tab=matches` runs synchronously through an admin-gated Model Context Protocol (MCP) handler and refreshes that one row's timestamp.

**Batch ("Re-evaluate all").** Submitting the batch packages every current pair into a single OpenAI Batch API request. Submission is two-click: the first click computes a cost estimate (`{ pairCount, estimatedInputTokens, estimatedOutputTokens, estimatedUsd, pricingVersion }`); the second click confirms and uploads the JSONL. The OpenAI Batch API returns a `batchId`; a poll job re-runs every 30 seconds and downloads results once the batch reaches a terminal status. The batch path is the only path with a non-trivial completion window — read the [OpenAI Batch API spec](https://platform.openai.com/docs/guides/batch) for the SLA details.

A separate cron schedule can fire the batch path on a recurring cadence. The schedule is a single-row config (`enabled`, `cron_expression`, `timezone`); when enabled at boot the platform calls `upsertJobScheduler` with a stable scheduler ID so multiple Next.js workers never register duplicate scheduler entries.

## Lifecycle gating and maintenance

Candidate creation is lifecycle-gated: a custom or personal skill in a non-deliverable lifecycle state (`draft`, `archived` — see [Skills lifecycle](skills-lifecycle.md)) produces no new match evaluations on any transport. Existing rows for such skills are left in place — row hygiene belongs to the opt-in maintenance jobs (hash staleness sweep, tombstoned orphan garbage collection, drift sampler), documented with runbooks in the [Hosting Guide → Skills maintenance](../../guides/hosting/skills-maintenance.md).

## Storage

- **`skill_matches`** — one row per `(agent_id, skill_id)` pair (composite primary key). Each row carries `source` (`rule | llm | manual`), `matched`, `score` (NULL for manual rows; `0.000`–`1.000` otherwise), `rationale`, `evaluator_version`, `agent_input_hash`, `skill_input_hash`, `status` (`ok | error | skipped`), `error_code`, `error_message`, `evaluated_at`, and `job_started_at`.
- **`skill_match_batch_runs`** — one row per OpenAI batch submission. Carries `batch_id`, `submitted_by`, `pair_count`, `input_file_id`, `output_file_id`, `error_file_id`, `status`, `last_polled_at`, `completed_at`, and `evaluator_version`. Drives the admin tab's progress UI.
- **`skill_match_schedule`** — single row, `id = "default"`. Carries the cron toggle and timing fields.

All three tables are created idempotently via the boot-time `CREATE TABLE IF NOT EXISTS` runner — there is no separate migration step. Schema creation requires no LLM, no Redis, and no OpenAI access; the first row population happens via the admin "Re-evaluate all" button.

## Visibility filter

When the matcher reads scoped rows for a non-admin actor, it filters by the actor's access:

- `level: "personal"` — visible only when the row belongs to the calling user.
- `level: "team"` — visible only when the row belongs to a team the actor is a member of.
- `level: "organization"` — visible only when the row belongs to the actor's organization.
- `level: "workspace"` — denied for non-admin actors (the workspace tier is implicit per platform deployment).
- `level: "project"` — visible only when the actor is a member of the project.

Platform admins bypass the filter and see every row. The matcher itself ignores visibility at write time — it only knows about the skill's content and the agent's metadata. The decoupling is deliberate: matching is a property of "would this skill be useful to this agent"; visibility is a separate property of "is this user allowed to see this matched row".

## Stale-write guard

A long-running batch can finish after a fresh inline write touches the same pair. The upsert compares `job_started_at` between the existing row and the incoming write; if the existing row's `job_started_at` is strictly newer, the incoming write is skipped. The invariant is one line of English: an older job never overwrites a newer job. Same-`job_started_at` ties resolve as last-writer-wins.

## Manual rows are protected

Manual add and manual remove from the admin UI write rows with `source: "manual"` and `evaluator_version: "manual-v1"`. The upsert checks `existing.source === "manual"` before any rule or LLM write and short-circuits if so. A manual exclusion (`matched: false`) survives every subsequent batch and inline run until an admin clicks "Remove" again.

## Error handling

A malformed LLM response (invalid JSON, missing field, score out of `[0.000, 1.000]`, oversized rationale) writes a row with `status: "error"`, `matched: false`, and a redacted slice of the raw response in `error_message` (capped at 1 KiB plus a truncation marker). The matcher never falls through to "match-all" on a parse failure; the failure is recorded as a no-match plus a diagnostic.

A malformed `match_when` clause is a separate failure mode: the parser logs a structured warning with the offending YAML and the skill ID, then passes the raw `match_when` text into the LLM prompt as a hint string. The skill is still evaluated; it is just evaluated by the LLM rather than by the broken rule.

## Rationale grounding

The LLM matcher returns `{ matched, score, rationale }`. The rationale text is shown to admins in the matches tab and stored in `cinatra.skill_matches.rationale`. Without a check, the model can produce plausible-sounding rationales that don't actually reference the skill — silent hallucination.

A deterministic token-overlap check runs on every `matched=true` row BEFORE persisting:

- **Tokenize** the rationale into content words (≥4 chars, lowercased).
- **Reference set** = tokens from skill ID + skill name + first 4 KB of skill content + agent packageId + agent name + agent description + agent tags.
- **Overlap ratio** = `|rationale_tokens ∩ reference_set| / |unique_rationale_tokens|`.
- **Gate**: `grounded = overlapRatio ≥ 0.20`.

When `grounded === false` AND `matched === true`:

- The persisted `rationale` is replaced with a conservative fallback string (the original is captured in the warning event for post-hoc review).
- A structured `skill-match-ungrounded-rationale` warning is emitted to `console.warn` with `{ agentId, skillId, originalRationale, overlapRatio, rationaleTokenCount, sharedTokens, evaluatorVersion }`.
- `matched` and `score` are NOT changed — only the user-visible rationale text.

The guard runs ONLY on `matched=true`. A `matched=false` rationale legitimately discusses why the skill ISN'T relevant and may not quote skill content — grounding would have a high false-positive rate.

Rationales shorter than 5 content tokens skip the check (defer to the score gate — they're effectively decision labels like "Yes match", not arguments).

This is a PoC-grade guard: token overlap catches gross fabrication; a future iteration may layer a sampled second-LLM consistency check on top.

## Cost guardrails

- Inline events evaluate in fixed 200-pair chunks; an oversized event spills into continuation jobs over a frozen candidate set rather than dropping pairs, so per-job cost stays bounded while every pair is still evaluated.
- The batch path requires a two-click cost-estimate confirmation before any tokens are spent.
- Pricing is stored as a versioned snapshot constant (`SKILL_MATCH_PRICING_USD` with `inputPer1MTokens`, `outputPer1MTokens`, `source`, `capturedAt`). Bumping the evaluator version requires re-checking the snapshot, and estimates emit a staleness warning when the snapshot is older than 90 days — see the [cost model](../../guides/hosting/skills-maintenance.md#the-cost-model).
- Token counting uses `gpt-tokenizer` (`cl100k_base`) for the cost-estimate function only; runtime truncation uses byte length on the SKILL.md content.

## Provider scope

All LLM traffic — generate, stream, and the four batch methods (`submitBatch`, `retrieveBatch`, `downloadBatchResults`, `cancelBatch`) — routes through the `@cinatra-ai/llm` orchestration gateway. Today, only the OpenAI provider implements the batch path; the Anthropic and Gemini providers stub all four batch methods to throw `BatchNotSupportedError` with the provider name. Adding a second provider's batch path is a single-file change to that provider; no caller in the skills package needs to know.

## Rule grammar (for skill authors)

When you do want a deterministic short-circuit, add `match_when` to the SKILL.md frontmatter. Rules use OR semantics: any single rule passing is sufficient. There is no AND combinator.

```yaml
---
name: cold-email
description: Write B2B cold emails and follow-up sequences.
match_when:
  - agent_id: "@cinatra-agents/email-outreach"
  - agent_id: "@cinatra-agents/email-drafts"
  - agent_has_tag: "email"
---
```

| Rule | Matches when |
|------|-------------|
| `always` | Every agent unconditionally — no LLM call |
| `agent_id: "<npm-name>"` | The agent's `packageId` equals the value — no LLM call |
| `agent_has_tag: "<tag>"` | The agent's `keywords` array includes the tag — no LLM call |

YAML values containing `@` or `/` must be quoted. Both single and double quotes are stripped by the parser. A skill with no `match_when` key is LLM-evaluated against every candidate agent; the lenient "empty rules → match-all" behavior was retired.

## Production trust thresholds

The skill-matcher is a probabilistic LLM judge. Before its `score` and `matched` outputs are surfaced as user-facing trust signals, the evaluator must demonstrate calibration against a labelled reference dataset. Two gates apply.

### Accuracy gate ≥ 0.85

Across the labelled golden set, at least **85%** of LLM decisions must agree with the human-labelled `expectedMatched` boolean. Borderline rows are excluded from this metric — by design, their consensus rationale acknowledges either answer as defensible, so including them would punish a defensible but minority decision. Rule-source rows are also excluded because they exercise the deterministic short-circuit (no LLM call to score).

### Spearman correlation gate ≥ 0.7

Across the labelled golden set, the Spearman rank correlation between the LLM `score` and the expected score band (high = 0.92, medium = 0.67, low = 0.20 — midpoints of the prompt's documented decision criteria) must be at least **0.7**. Borderline rows ARE included in correlation because rank-correlation rewards a model that ranks borderline cases between high and low (vs collapsing them to one extreme). Rule-source rows are excluded.

### How to run the live eval

```bash
cd packages/skills && \
  OPENAI_API_KEY=sk-... GOLDEN_EVAL_LIVE=1 \
  pnpm exec vitest run src/llm-matching/__tests__/golden-eval.live.test.ts
```

The suite double-gates: `OPENAI_API_KEY` is the credential, `GOLDEN_EVAL_LIVE=1` opts out of the package's vitest stub for `@cinatra-ai/llm`. Both must be set — without `GOLDEN_EVAL_LIVE=1`, the orchestration alias falls back to the test stub and the "live" run silently calls the stub instead of OpenAI. The unit suite (`pnpm exec vitest run`) skips this test by design so local `pnpm typecheck` and CI default runs stay offline. One full run is roughly 17 sequential LLM calls × `gpt-4o-mini` × ~1KB prompts ≈ ~$0.005 at the snapshot pricing in `constants.ts`.

The single-thread loop is intentional — the production matcher runs scoped inline jobs serially per pair, and the eval mirrors that path so calibration reflects production conditions.

### Continuous integration

A path-filtered workflow at `.github/workflows/skill-match-eval.yml` fires this eval on PRs that touch any file in the transitive matcher path: `prompt.md`, `prompt-builder.ts`, `evaluate-pair.ts`, `constants.ts`, `rationale-grounding.ts`, `response-parser.ts`, `rule-short-circuit.ts`, `match-when-parser.ts`, `eval-calibration.ts`, the live test file, the golden fixture (`golden-matches.jsonl` + `golden-fixture-schema.ts`), the workflow itself, or this doc page. The job has two layers of gating:

1. **Fork-PR skip** via the job-level `if:` — PRs from forks (where the head repo differs from the base repo) skip the entire job. Forks can't access secrets anyway; skipping prevents red checks they can't fix.
2. **Secret presence check** inside the job — a `check_key` step emits `has_key=true/false` based on whether `secrets.OPENAI_API_KEY` resolves to a non-empty value. All subsequent steps are conditioned on `has_key=true`. When the secret is absent the job emits a GitHub `::notice` and exits successfully (the workflow status is "success" with a skipped-note message, not "neutral" — GitHub Actions does not have a true neutral state for `if:`-gated steps).

Configure the required-status-check policy on `main` to either omit this workflow OR accept a "success" status on it. Manual one-off runs are supported via `workflow_dispatch`.

Manual one-off runs are supported via `workflow_dispatch`.

### When to refresh the golden set

Re-label and re-run the eval whenever any of the following change:

- The matcher prompt (`packages/skills/src/llm-matching/prompt.md`) — wording shifts can move boundary decisions.
- The matcher model (`SKILL_MATCH_MODEL` in `constants.ts`) — a new model has different calibration.
- The evaluator version (`LLM_MATCHER_VERSION` in `constants.ts`) — versioning is the contract for "this output is comparable to that output."
- The fixture itself (`__tests__/__fixtures__/golden-matches.jsonl`) — extending or relabelling rows. Bump the row's `id` (e.g. `GM-11` → `GM-11b`) on a relabel and document the rationale.

When accuracy or Spearman shifts by more than 0.05 between runs, document the new baseline in this section and in the fixture's `README.md` freeze date.

### Calibration helpers

`packages/skills/src/llm-matching/eval-calibration.ts` exports:

- `spearmanCorrelation(xs, ys): number | null` — rank correlation with midrank tie-resolution; returns `null` on fewer than 2 samples or on constant input.
- `computeCalibration(pairs): CalibrationReport` — accepts `{rowId, category, expectedMatched, expectedScoreBand, expectedSource, llmMatched, llmScore}[]` and returns `{accuracy, spearman, perBandAccuracy, mismatchCount, mismatches}`. The filtering policy (borderline excluded from accuracy, rule excluded from both) is encoded inside the helper so callers cannot accidentally re-implement it differently.
- `SCORE_BAND_MIDPOINTS` — `{high: 0.92, medium: 0.67, low: 0.20}` calibration constants.

These helpers are pure (no side effects, no `import "server-only"`, no transitive `@cinatra-ai/skills` barrel reach) so the same code can run inside a unit test, a CI workflow report renderer, or a future operator-facing calibration dashboard.

## Further reading

- `packages/skills/src/llm-matching/` — evaluator core, prompt template, hashes, response parser, cost estimator, batch JSONL builder, persistence stores
- `packages/skills/src/llm-matching/__tests__/__fixtures__/README.md` — golden-fixture schema, category coverage, curation method, two-expert labelling rationale
- `packages/llm/src/types.ts` — `LlmProviderAdapter` batch surface
- [OpenAI Batch API](https://platform.openai.com/docs/guides/batch) — upstream provider documentation
