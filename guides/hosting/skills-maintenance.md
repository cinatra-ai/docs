# Skills Maintenance — Runbooks

Skill-to-agent match decisions are persisted rows (see [Skill matching](../../references/platform/skill-matching.md)), and persisted rows go stale: skill content gets edited out of band, skills get uninstalled, and the evaluating model itself drifts between provider-side updates. This page is the operator runbook for the background jobs that keep the match store honest, plus the cost model that bounds what they spend.

All of these jobs are **opt-in and disabled by default**. A fresh install runs none of them.

| Job | How to enable | Default cadence when enabled |
|---|---|---|
| [Batch re-evaluation schedule](#the-batch-re-evaluation-schedule) | Admin UI (`/configuration/skills?tab=matches`) or the `skills_match_schedule_set` MCP primitive | Operator-chosen cron |
| [Maintenance tick](#runbook-the-maintenance-tick) (staleness sweep + orphan GC) | `SKILL_MATCH_MAINTENANCE_CRON` environment variable | Operator-chosen cron |
| [Drift sampler](#runbook-the-drift-sampler) | `drift_sampler_enabled` column on the `skill_match_schedule` row (no UI toggle) | Daily at 03:00 UTC |
| [Match-store parity observation](#runbook-the-dual-store-parity-observation) | `SKILL_MATCH_PARITY_CRON` environment variable | Operator-chosen cron |

All four register through the standard BullMQ (a Redis-backed job queue) scheduler at boot. Disabling one (unsetting the env var, clearing the flag) removes any stale scheduler entry at the next boot — no manual queue cleanup needed. For the two env-gated jobs, an invalid cron pattern logs a boot warning and behaves as disabled, so a typo can never half-enable them; the batch schedule's setter instead rejects an invalid pattern outright, before anything is persisted.

## The batch re-evaluation schedule

The admin-driven batch path ("Re-evaluate all" and its optional cron) is covered in [Skill matching](../../references/platform/skill-matching.md). It re-evaluates every *current* pair. What it does **not** do is notice out-of-band changes between runs, delete rows for uninstalled pairs, or watch for model drift — that is what the jobs below add.

## Runbook: the maintenance tick

**What it is.** One scheduled tick that runs two passes in order: the **tombstoned orphan GC** first, then the **hash staleness sweep**. Ordering matters — the GC runs first so the sweep does not waste evaluations on rows about to be deleted.

**Enable it** by setting the environment variable and restarting:

```bash
SKILL_MATCH_MAINTENANCE_CRON="0 4 * * *"   # daily at 04:00 UTC
```

Any valid 5- or 6-field cron pattern works. Unset (or invalid) means disabled; the boot log warns on an invalid pattern. The tick runs with the queue timezone fixed to UTC.

### What the staleness sweep does

For every persisted match row, the sweep recomputes the evaluator fingerprint (the same content/metadata hashes every write path records) and compares it to the row's stored fingerprint:

- **Machine rows** (rule- or LLM-sourced) whose inputs changed out of band — a `SKILL.md` edited on disk, an agent renamed — are re-evaluated through the standard evaluator (rules still short-circuit without a model call). No install or save event is needed for the change to be noticed.
- **Manual rows are never machine-re-evaluated.** A manual row whose inputs changed is flagged as "inputs changed" for admin attention instead. The flag set uses replace semantics — once the inputs settle or the row is re-affirmed, the flag clears on the next tick.
- **An evaluator-version bump** marks every row of that source stale at once — LLM-sourced rows track the LLM matcher version, rule-sourced rows the rule matcher version. The per-tick cap below spreads the re-evaluation across ticks.
- Rows whose agent or skill is missing from the live catalog are left for the orphan GC — the sweep never deletes.

**Cost bound:** at most **200 re-evaluations per tick** (the sweep's per-tick cap). Rows beyond the cap stay stale and are picked up on subsequent ticks; the processing order is stable, so forward progress is guaranteed. Reads fail closed — a catalog or store read error aborts the tick rather than acting on a partial view.

### What the orphan GC does

A row is deleted only when its `(agent, skill)` pair has been **durably** absent from the live catalog:

1. The first tick that observes the pair absent only records a **tombstone** — nothing is deleted on a single (possibly transient) catalog snapshot.
2. A later tick deletes the row only if the pair has stayed absent for the whole **24-hour grace window**, and the delete is conditional — a row re-written inside the window is not deleted.
3. If the pair reappears (e.g. the skill is reinstalled), the tombstone clears; if a reappearance races the delete itself, a fresh evaluation is enqueued afterwards, so the pair is re-evaluated rather than lost.

The GC also prunes the drift-flag records (below) for the pairs it deletes.

Each tick logs two info-level summary events — `skill_match_maintenance_orphan_gc` and `skill_match_maintenance_sweep` — with the per-pass counts (scanned, stale, re-evaluated, deferred over the cap, manual-flagged, tombstoned, deleted), so a log scrape shows exactly what every tick did.

### Where the maintenance state lives

Tombstones, drift flags, and the manual "inputs changed" set are small key-value blobs in the `connector_config` table, keys `skill_match_orphan_tombstones`, `skill_match_drift_flags`, and `skill_match_manual_stale`. There is no admin page that renders them; to inspect them today, read those keys directly (any Postgres client) or watch the log events listed [below](#log-events-worth-scraping).

## Runbook: the drift sampler

**What it is.** A low-frequency canary for provider-side model drift: it samples **5 match rows per run**, re-runs the evaluator on each, and emits a structured `skill-match-drift` warning when the fresh decision flips (`decision-flip`) or the score moves by more than **0.30** (`score-delta`) against the persisted row. It never rewrites the persisted decision — it only observes and reports.

**Enable it** by setting the flag on the schedule row (there is no UI toggle for this flag; the `skills_match_schedule_set` MCP primitive manages the batch schedule fields only):

```sql
UPDATE cinatra.skill_match_schedule
SET drift_sampler_enabled = true          -- optionally: drift_sampler_cron = '0 3 * * *'
WHERE id = 'default';
```

Then restart the app. With no explicit `drift_sampler_cron` it runs daily at 03:00 UTC — deliberately after typical business-hours batch windows, so it does not race a fresh batch write on the same rows.

**Drift flags.** Each drift observation is also counted per pair, cumulatively per fingerprint. A pair that drifts **3 or more times** on unchanged inputs is auto-flagged as repeatedly drifting (stored in the `skill_match_drift_flags` key above). A legitimate input change resets the count — changed inputs producing a changed decision is re-evaluation, not drift.

**When the canary fires repeatedly:** treat it as a signal that the evaluating model's behavior has shifted. The remediation is an admin-triggered "Re-evaluate all" batch run (which rewrites decisions on current model behavior), and — if decisions look wrong after that — a review of the matcher's calibration gates described in [Skill matching](../../references/platform/skill-matching.md#production-trust-thresholds).

## Runbook: the dual-store parity observation

The platform is mid-consolidation from a legacy per-agent match snapshot to the canonical `skill_matches` store; both are still written today, and reads are being migrated. Retiring the legacy store is gated on **observed parity**, and this job is the observation half — it never retires, deletes, or stops a dual-write.

**Enable it** with:

```bash
SKILL_MATCH_PARITY_CRON="30 4 * * *"
```

Each run projects the canonical store, reads the legacy snapshot, and diffs them pair-by-pair: pairs missing in the legacy snapshot, extra pairs in the legacy snapshot, and score mismatches. Every run:

- emits an `agent-skill-match-parity` structured log event — `warn` on any divergence, `info` on a clean run — with counts and the zero-diff streak, and
- persists a report (capped diff sample included) under the `agent_skill_match_parity_report` key in `connector_config`.

The streak is counted in distinct UTC **days**, not runs, so running the cron more often does not inflate it. A sustained zero-diff streak (seven consecutive days) is the evidence the retirement decision looks for; divergences reset it. If you plan to rely on the retirement, enable this observation and let it accumulate — without it there is no parity evidence.

## The cost model

Skill matching spends LLM tokens; these are the levers and bounds. All estimates use the pinned pricing snapshot (`SKILL_MATCH_PRICING_USD` in `packages/skills/src/llm-matching/constants.ts`): the matcher model's per-token prices, captured on a recorded date.

**Pricing snapshot discipline.** Displayed costs are estimates against that snapshot, not your provider bill. The snapshot is hand-maintained; when it is older than **90 days**, the first cost estimate in each process emits a `skill-match-pricing-stale` warning with the snapshot's age. The discipline: whenever the matcher model or matcher version is bumped, the pricing snapshot is re-verified in the same change — so a stale-pricing warning on a current build is a real signal that estimates have drifted from the provider's actual prices, worth checking against your invoice.

**Per-path bounds:**

| Path | Bound | Worst case per unit |
|---|---|---|
| Inline (install/save events) | 200 pairs per event; overflow spills into continuation jobs over a frozen candidate set, so every pair is evaluated exactly once — nothing is silently dropped | Per pair: 4,000 input + 200 output tokens |
| Batch ("Re-evaluate all") | Two-click confirmation with an upfront estimate (`pairCount`, token estimates, estimated USD) before any tokens are spent | The shown estimate |
| Staleness sweep | 200 re-evaluations per tick (remainder deferred to later ticks) | ≈ US$0.15 per fully-capped tick at snapshot prices — 200 × (4,000 × $0.15/1M input + 200 × $0.60/1M output); real prompts are typically much smaller |
| Drift sampler | 5 evaluations per run | Negligible (five pairs daily) |

Rule-matched pairs short-circuit without a model call on every path, so heavy `match_when` usage (see the rule grammar in [Skill matching](../../references/platform/skill-matching.md#rule-grammar-for-skill-authors)) directly reduces all of the above.

## Log events worth scraping

All maintenance-relevant events are single-line JSON on the app's stdout/stderr, keyed by `event`:

| Event | Level | Meaning |
|---|---|---|
| `skill_match_maintenance_sweep` | info | Per-tick staleness-sweep summary (scanned, stale, re-evaluated, deferred over the cap, manual-flagged, errors) |
| `skill_match_maintenance_orphan_gc` | info | Per-tick orphan-GC summary (tombstoned, deleted, cleared, reappeared re-enqueues) |
| `skill-match-drift` | warn | Drift sampler: a sampled pair flipped decision or moved past the score-delta threshold |
| `agent-skill-match-parity` | warn / info | Parity observation result: warn on divergence, info on a clean run |
| `skill-match-pricing-stale` | warn | The pricing snapshot behind cost estimates is older than 90 days |
| `skill-match-ungrounded-rationale` | warn | A match rationale failed the grounding check and was replaced with a fallback |

See [Telemetry and logging](../admin/telemetry-and-logging.md) for where instance logs go in your deployment.

## Where to go next

- [Skill matching](../../references/platform/skill-matching.md) — the evaluator these jobs maintain
- [Skills lifecycle](../../references/platform/skills-lifecycle.md) — states, revisions, content authority, catalog rebuilds
- [Configuration](configuration.md) — the full environment-variable matrix
