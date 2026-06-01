# Skills Storage Layout

Reference for the ownership-first, vendor-namespaced on-disk layout of
`data/skills/`, the durable saga relocation worker, and the Recreate
Library admin action.

## TL;DR

- Top-level: exactly `{personal, organization, workspace}`. No top-level `team/`.
- Inside any owner: children starting with `~` are Cinatra sub-buckets (`~agents`, `~teams`, `~projects`); everything else is a vendor namespace. Vendors are forbidden from starting their name with `~`.
- Two leaf shapes inside each owner:
  - `<vendor>/<package>/<skill>/SKILL.md` — installed (marketplace, upload, or GitHub)
  - `~agents/<vendor>/<package>/<skill>/SKILL.md` — bundled with an installed agent OR user-authored against one
- Workspace is a singleton with no slug segment.

## Directory tree

```
data/skills/
├── personal/<user-slug>/
│   ├── <vendor>/<package>/<skill>/SKILL.md           # installed
│   ├── ~agents/<vendor>/<package>/<skill>/SKILL.md   # bundled / user-authored
│   └── ~projects/<project-slug>/...                  # (same two leaf shapes)
│
├── organization/<org-slug>/
│   ├── <vendor>/<package>/<skill>/SKILL.md
│   ├── ~agents/<vendor>/<package>/<skill>/SKILL.md
│   ├── ~projects/<project-slug>/...
│   └── ~teams/<team-slug>/
│       ├── <vendor>/<package>/<skill>/SKILL.md
│       ├── ~agents/<vendor>/<package>/<skill>/SKILL.md
│       └── ~projects/<project-slug>/...
│
└── workspace/                                         # singleton, no slug
    ├── <vendor>/<package>/<skill>/SKILL.md
    ├── ~agents/<vendor>/<package>/<skill>/SKILL.md
    └── ~projects/<project-slug>/...
```

Teams nest under their parent organization because `team.slug` is unique
*per organization*, not globally. Projects nest under whichever of the four
tiers owns them: Project is a bounded execution-context space owned by
exactly one of User/Team/Organization/Workspace, not an ownership tier
itself.

## Path resolution

Paths are **derived from logical identity columns**, never persisted as
absolute strings. The `cinatra.skill_packages` table stores eight identity
columns:

| Column | Type | Meaning |
|--------|------|---------|
| `owner_scope` | text enum | `personal \| team \| organization \| workspace \| project` |
| `owner_id` | text | NULL when `owner_scope='workspace'` |
| `binding_scope` | text enum | `owner` (leaf at owner root) or `agent` (under `~agents/`) |
| `source_kind` | text enum | `installed \| bundled \| user-authored` |
| `vendor` | text | NULL only for vendor-less user-authored skills |
| `package` | text | NULL only for vendor-less user-authored skills |
| `agent_template_id` | text FK | Non-null iff `binding_scope='agent'` |
| `skill_slug` | text | Stable per-skill identifier |

The pure resolver `packages/skills/src/skill-paths.ts:resolveSkillDir(identity, slugMap, root)`
walks the ownership chain, joins to `public.user.username`, `public.team.slug`,
`public.organization.slug`, and `cinatra.projects.slug` for fresh slugs, and
composes the absolute on-disk directory. The SQL helper
`cinatra.compute_owner_path_prefix(p_level, p_id)` (in `drizzle-store.ts`)
mirrors this exactly so triggers can write the same path that the worker
will read.

**NOT NULL enforcement.** `owner_scope`, `binding_scope`, `source_kind`, and
`skill_slug` are NOT NULL on every catalog row. These constraints are
restored behind a guarded PL/pgSQL `DO $body$` block in
`ensurePostgresSchema` — the block runs `ALTER TABLE ... SET NOT NULL` only
when `COUNT(*) WHERE identity IS NULL = 0`, otherwise leaves the columns
nullable and emits a `RAISE NOTICE` for manual repair. This preserves
compatibility for rows written by the JSON-only `buildUpsertJsonRowQuery`
while preventing new cutovers when any identity column is NULL.

**Write surface.** `buildUpsertSkillPackageQuery(schemaName, row, identity)`
in `src/lib/drizzle-store.ts` is the canonical raw-SQL UPSERT — writes all
10 columns (`id`, `payload`, plus the 8 identity columns) via `$1..$10`.
The schema identifier is quote-escaped with `replaceAll('"', '""')`.
`deriveSkillPackageIdentity` in `src/lib/database.ts` projects
`PersistedSkillPackage` to the typed `SkillPackageIdentity` tuple —
recognizes `github:`/`zip:`/`installed:`/`custom:` packageId prefixes for
vendor/package derivation. A second writer
(`packages/skills/src/cli.mjs:compileAndRegisterAgentSkillsViaPg`) matches
the same column tuple inline for agent-level packages registered via the
CLI; the column list must stay in lockstep with
`buildUpsertSkillPackageQuery`. Both writers whitelist the schema identifier
against `^[a-zA-Z_][a-zA-Z0-9_]*$` before interpolation.

**Reverse projection.**
`packages/skills/src/skill-paths.ts:projectLevelFromIdentity(input)` —
canonical legacy-`SkillLevel` projection from typed identity columns
(`personal | team | organization | system | agent`). Legacy readers
(`plugin-pages.tsx`, `skill-access-actions.ts`, `agents-store.ts`,
`dedup-skills.ts`, `llm-matching/*`) can adopt this helper incrementally
without breaking the existing `payload.level` path.

## Slug rename reflection (durable saga)

When any of `user.username`, `team.slug`, `organization.slug`, or
`projects.slug` changes via a normal `UPDATE`, a per-table trigger:

1. Captures the OLD slug + composes OLD and NEW absolute-from-root paths.
2. Inserts a row into `cinatra.path_relocations` (outbox table) with
   `status='pending'`.
3. Fires `pg_notify('cinatra_path_relocations_pending', <row_id>)`.

The relocation worker in `packages/skills/src/relocate-worker.ts`:

1. `LISTEN cinatra_path_relocations_pending` on a dedicated `pg.Client`.
2. On NOTIFY (or every 5 min as backstop poll), claims one row via
   `UPDATE ... WHERE id = (SELECT ... FOR UPDATE SKIP LOCKED LIMIT 1)
   RETURNING ...`. Concurrent worker instances cannot double-process.
3. Writes a `.cinatra-moving.json` marker at the source.
4. Atomic `fs.rename(oldAbs, newAbs)`. On `EXDEV` (cross-mount): recursive
   `cp` + verify + `rm -rf` with marker held throughout.
5. Removes the marker at the new location.
6. Marks the row `completed` (separate short transaction).

Chained renames work correctly: rename A→B then B→C produces two outbox
rows; the worker processes them in `enqueued_at` order, moving the
directory through both transitions.

### Crash recovery

`packages/skills/src/recover-pending-moves.ts:recoverPendingMoves()` runs
once at boot from `src/instrumentation.node.ts`, BEFORE the worker starts.
It inspects `status='in_progress'` rows (not `pending` — those are not yet
claimed) and reconciles based on disk state:

| Old path | New path | Action |
|----------|----------|--------|
| exists | absent | re-enqueue (crashed before rename committed) |
| absent | exists | mark `completed` (rename succeeded, DB write lost) |
| both | – | mark `failed` (diverged — manual repair) |
| neither | – | mark `failed` (destructive event — manual repair) |

A separate orphan-marker sweep deletes `.cinatra-moving.json` files older
than 1 hour with no matching active row.

## Agent ownership reassignment with pre-run gate

`packages/agents/src/store.ts:updateAgentTemplate` is gated atomically:
when the patch changes `(ownerLevel, ownerId)`, the UPDATE includes
`WHERE id=? AND first_run_at IS NULL RETURNING id`. Zero rows affected
means either the template doesn't exist or it has been run; we throw
`CannotReassignAfterFirstRun(templateId)`.

`first_run_at` is maintained by an `AFTER INSERT ON agent_runs` trigger
that sets the column to `NEW.created_at` if currently NULL. Race-safe by
construction.

When ownership changes successfully, the `enqueue_agent_owner_move` trigger
fires automatically (since the UPDATE touched `owner_level` / `owner_id`)
and writes a `subject_kind='agent_template'` row to `path_relocations`.
The worker moves the `~agents/<vendor>/<package>/` subtree to the new
owner — all bundled and user-authored skills follow as one atomic move.

## Recreate Library admin action

`src/app/configuration/skills/page.tsx` → Library tab → "Danger zone"
hosts a `<Card>` with a destructive "Recreate library…" button. Confirm
dialog requires type-to-confirm phrase `recreate library` and an opt-in
checkbox to force-push the empty state to the configured GitHub repo.

Server action `recreateLibraryAction({ forcePushEmptyToGitHub, confirmationPhrase })`:

1. `requireAdminSession()` — admin-only.
2. Confirmation phrase must equal `"recreate library"` literally.
3. Production-hostname refusal: if `CINATRA_DB_PROD_HOSTS` is set and
   `SUPABASE_DB_URL` matches, the action throws.
4. `unregisterSkillMatchSchedule()` (best-effort).
5. `TRUNCATE ... CASCADE` on the skill-bearing tables:
   `skills, skill_packages, skill_package_co_owners, skill_co_owners,
   agent_run_skills_used, custom_skill_assignments, skill_matches,
   skill_match_batch_runs, path_relocations`. TRUNCATE skips row triggers,
   avoiding spurious relocation enqueues.
6. `rm -rf` the on-disk skills root + recreate empty.
7. Optional `pushSkillStoreToGitHub({ force: true })` — empty tree commit.
   Failure is surfaced via `forcePushError` in the result (UI emits an
   error toast distinguishing partial failure from full success).
8. Re-register the BullMQ (a Redis-backed job queue) batch scheduler.

`/api/skills/reset-repo` route remains for the CLI command
`cinatra skills reset-repo --yes`, but is now triple-gated:
NODE_ENV != production + CINATRA_RUNTIME_MODE='development' + loopback-only
(no `x-forwarded-*` headers, hostname must be localhost / 127.0.0.1 / ::1
/ host.docker.internal).

## Scanner

`packages/skills/src/skill-scanner.ts:scanSkillsRoot(root)` is an async
generator yielding one `ScannedSkill` per `SKILL.md` found. Recursive
grammar:

1. Top level: only `{personal, organization, workspace}`. Anything else
   emits an `unknown_top_level` warning and is skipped.
2. Inside an owner directory: children starting with `~` must match the
   `RESERVED_SUBBUCKETS = {~agents, ~teams, ~projects}` set; otherwise
   warn and skip. Other children are vendor namespaces.
3. Vendor names starting with `~` are rejected at the vendor depth as well.
4. Any directory containing `.cinatra-moving.json` is skipped with a
   `marker_present` warning — the scanner never reads a subtree mid-move.

## Workspace invariant

The resolver asserts: `owner_scope='workspace'` requires `owner_id=null`.
Workspace is the implicit per-deployment container with no DB
representation. Lifting this would require introducing a
`cinatra.workspaces` table and a `<workspace-slug>/` path segment.

## Open follow-ups

- **Legacy cleanup** — the identity-column cutover writes through
  `buildUpsertSkillPackageQuery`, restores NOT NULL on the four required
  identity columns, and projects legacy `SkillLevel` reads back via
  `projectLevelFromIdentity`. The
  `~personal/~agent/~custom/~team/~organization` resolver branches in
  `skills-store.ts` and the `SkillType` enum still exist as a UI-facing
  projection layer for backward compatibility. They can be removed after
  Recreate Library has been run at least once on any deployment that needs
  to cut over.
- **Team-slug rename UI** — better-auth's `UpdateTeamDialog` may not
  expose `additionalFields` for slug; a custom form on
  `/teams/[teamId]/settings` is the fallback. The underlying machinery
  (DB column, trigger, worker) is already in place.
- **Multi-workspace** — would lift the singleton invariant; out of scope.
- **Multi-install per package per owner** — would require switching
  `~agents/<vendor>/<package>/` to `~agents/<install-slug>/`; the
  `agent_template_id` FK column is forward-compatible.

## See also

- `packages/skills/src/skill-paths.ts` — pure resolver + `projectLevelFromIdentity`
- `packages/skills/src/skill-scanner.ts` — filesystem walker
- `packages/skills/src/relocate-worker.ts` — saga worker
- `packages/skills/src/recover-pending-moves.ts` — crash recovery sweep
- `packages/skills/src/cli.mjs` — agent-skill INSERT path that matches `buildUpsertSkillPackageQuery`
- `src/lib/drizzle-store.ts` — inline DDL + 5 triggers + 2 helper functions + `buildUpsertSkillPackageQuery`
