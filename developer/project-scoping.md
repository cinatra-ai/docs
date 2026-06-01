# Project scoping

Developer reference for the project scoping model. This document describes
the data model, authorization axes, Model Context Protocol (MCP) surface, inheritance rules,
sealed-room semantics, archive lifecycle, migration behavior, and the UI
patterns that surface the model.

**Project is never an ownership tier.** Project access is N:M via
`project_access` (see [MCP surface](#mcp-surface) below). The four-tier
ownership ladder still applies to *every other resource* (objects,
agent_runs, chat_threads, agent templates, skills) — but a project is a
bounded execution and context space that **lives at** one of those four
levels and gains N:M access rows on top, not a fifth tier.

## Data model

### Three physical `project_id` columns

Artifacts are `objects` rows with an artifact type; there is no physical
`artifacts` table. Project membership collapses to three `project_id`
columns:

| Logical resource | Physical reality                                                 | `project_id` column?        |
|------------------|------------------------------------------------------------------|-----------------------------|
| `artifacts`      | `cinatra.objects` rows where `type ∈ artifactObjectTypeIds()`    | covered by `objects.project_id` |
| `objects`        | `cinatra.objects` (raw-SQL store)                                | `text NULL`                 |
| `agent_runs`     | `cinatra.agent_runs` (raw-SQL store)                             | `text NULL`                 |
| `chat_threads`   | `cinatra.chat_threads (id, payload, project_id, created_at, updated_at)` | `text NULL` typed column |

`chat_threads` has two typed timestamp columns (`created_at`,
`updated_at`) alongside `project_id`. The writer mirrors `project_id` /
`created_at` / `updated_at` from `payload → columns` on every write
(lockstep). Sealed-room chat listing reads the columns, never `payload`
JSON.

`artifact_blobs`, `artifact_refs`, `artifact_audit`, `artifact_provider_cache`
do **not** get `project_id`. These are immutable physical/provenance rows;
membership lives on the logical `objects` row.

### Project scoping tables

```sql
-- N:M access. Owner is implicit and NEVER a row here.
CREATE TABLE cinatra.project_access (
  project_id      text NOT NULL REFERENCES cinatra.projects(id) ON DELETE CASCADE,
  principal_level text NOT NULL CHECK (principal_level IN ('user','team','organization','workspace')),
  principal_id    text NOT NULL,
  role            text NOT NULL CHECK (role IN ('read','write','admin')),
  granted_by      text NOT NULL,
  granted_at      timestamptz NOT NULL DEFAULT now(),
  -- Generated columns + same-org trigger materialize the polymorphic FK.
  principal_user_id text GENERATED ALWAYS AS (CASE WHEN principal_level='user'         THEN principal_id END) STORED,
  principal_team_id text GENERATED ALWAYS AS (CASE WHEN principal_level='team'         THEN principal_id END) STORED,
  principal_org_id  text GENERATED ALWAYS AS (CASE WHEN principal_level='organization' THEN principal_id END) STORED,
  CONSTRAINT project_access_workspace_principal_chk CHECK (
    (principal_level =  'workspace' AND principal_id =  '__workspace__') OR
    (principal_level <> 'workspace' AND principal_id <> '__workspace__')
  ),
  PRIMARY KEY (project_id, principal_level, principal_id)
);

-- Per-project agent template binding — pins ambient agent templates into
-- a project with a visibility filter + optional pinned_version + per-project
-- default context overrides. The agent_templates table itself stays ambient;
-- substrate tables never gain project_id.
CREATE TABLE cinatra.project_agent_template_bindings (
  project_id                 text NOT NULL REFERENCES cinatra.projects(id) ON DELETE CASCADE,
  agent_template_id          text NOT NULL,
  visibility                 text NOT NULL CHECK (visibility IN ('visible','hidden','project-private')) DEFAULT 'visible',
  pinned_version             text,
  default_context_overrides  jsonb CHECK (jsonb_typeof(default_context_overrides) = 'object'),
  created_by                 text NOT NULL,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, agent_template_id)
);

-- Move audit + provenance: every cross-project move records the
-- (resource_kind, resource_id, from_project_id, to_project_id, moved_by).
CREATE TABLE cinatra.resource_project_moves (...);

-- Per-resource refs: where else this project_id is "stamped" (e.g.
-- chat_thread → agent_run lineage during the dual-lineage path).
CREATE TABLE cinatra.project_resource_refs (...);
```

`__workspace__` is the reserved workspace sentinel; the CHECK constraint
makes the canonicalization explicit so a project can't accumulate multiple
semantically-identical workspace grants. Owner is **never** a
`project_access` row — handlers synthesize the owner row at read time
(`project_access_list`) and reject self-insert at write time
(`project_access_grant`).

### Indexing

Per `project_id`-bearing table:

- `(owner_level, owner_id, project_id, created_at DESC)` where the table has
  owner cols (`objects` only).
- Partial `(project_id, created_at DESC) WHERE project_id IS NOT NULL` —
  the project-listing path.
- Table-specific:
  - `agent_runs`: also `(project_id, status, created_at DESC) WHERE project_id IS NOT NULL`.
  - `chat_threads`: no owner cols → just the partial project index + PK.
- `project_access`: partial indexes on `principal_user_id`,
  `principal_team_id`, `principal_org_id`, plus
  `project_access_workspace_idx (project_id) WHERE principal_level='workspace' AND principal_id='__workspace__'`.

## Authorization extension

`ActorContext.projectGrants` is the canonical project access axis:

```ts
export type ProjectRole = "read" | "write" | "admin" | "owner";
export type ProjectAccessSource =
  | "owner" | "user" | "team" | "organization" | "workspace";
export type ProjectGrant = {
  projectId: string;
  effectiveRole: ProjectRole;
  accessSource: ProjectAccessSource;
};
```

`readProjectGrantsForUser(userId, actorOrgId, hints)` resolves the union
**owned ∪ accessed**:

- **Source 1 — implicit owned:** scans `cinatra.projects` for rows whose
  `(owner_level, owner_id)` matches the actor's membership chain. Returns
  role by *authority* (user-owned → `owner`; team-owned → `read|write|admin`
  by team role; org-owned → `read|write|admin` by org role). Multi-org safe
  — self-anchors via the owner clauses.
- **Source 2 — explicit project_access rows:** SQL union over the four
  partial generated-column indexes. Active-org anchored (`actorOrgId`) so a
  stale session token can't surface grants from a former org.
- **Source 3 — back-compat co-owners** (`project_co_owners.user_id`): every
  row maps to `{effectiveRole: "admin", accessSource: "user"}`. Active-org
  anchored.

`mergeProjectGrants(...)` collapses duplicates via **max-not-last-wins**:
the merged role is the highest authority across all matching rows for a
given `projectId` — so an implicit `team:read` grant cannot silently
demote an explicit `project_access` `admin` grant.

Stale-membership guard: Sources 2+3 only fire when `actorOrgId` appears
in the actor's *current* accessible org list. If a session carries a stale
`activeOrganizationId`, the resolver does NOT even issue the
project_access / co_owners queries (fail-closed, no wasted round-trip).
Source 1 is unaffected because it self-anchors.

### Dual lineage (MCP + session)

The MCP registry (`packages/projects/src/mcp/registry.ts`) and the
human-session lineage (`src/lib/auth-session.ts`) both call
`readProjectGrantsForUser` and stamp the result onto the request actor.
Handlers consult `actor.projectGrants` for authz; the MCP transport
context flows through `mcpRequestContextStorage` so platform_admin /
orgId / userId are available even mid-stream.

`assertProjectGrantRole(actor, projectId, required)` is the canonical
check inside every handler that mutates project state; rank order is
`read < write < admin < owner`. Platform admin bypasses.

## MCP surface

| Primitive                                       | Role gate | Purpose |
|-------------------------------------------------|-----------|---------|
| `projects_list`                                 | derived from grants | owned ∪ accessed, with effectiveRole/accessSource per row; default `archived=false` |
| `projects_get` / `_create` / `_update`          | kernel    | standard kernel shape |
| `projects_archive` / `_unarchive`               | admin     | idempotent (already-archived / already-active returns flag) |
| `project_access_grant`                          | admin     | idempotent (ON CONFLICT update role); admin-role grants are **owner-only**; owner self-insert rejected |
| `project_access_revoke`                         | admin     | idempotent |
| `project_access_list`                           | read      | returns the synthesised owner row + every stored row |
| `project_access_check`                          | read      | resolves principal → effectiveRole + accessSource |
| `project_agent_template_bindings_create`        | write     | pins an ambient agent template into the project with visibility / pinned_version / default_context_overrides |
| `project_agent_template_bindings_update`        | write     | sparse update; 404 on zero-rows-affected |
| `project_agent_template_bindings_delete`        | write     | unbind; the template itself stays ambient |
| `project_agent_template_bindings_list`          | read      | enumerate bindings for the project |
| `agent_run_move_with_outputs`                   | admin both ends | atomic move of an agent run + its emitted artifacts to a different project; recorded in `resource_project_moves` |

`projects_delete` is **NOT** on the surface; archive is the lifecycle.

## Inheritance rules

Two layers govern `project_id` propagation:

1. **Runtime propagation:** when an agent run is started inside project P,
   every output object (artifact, derived row) inherits `project_id = P`
   via a `ProjectContext` propagation boundary the write path enforces.
   Chat threads pin their `project_id` at create time and never re-derive.

2. **Substrate exclusion list:** the following tables are **substrate** and
   never gain a `project_id` column: `agent_templates`, skills
   (`cinatra.skills`), extensions (`cinatra.extensions_installed`),
   contacts, accounts, `model_pricing`. These are catalog/registry tables
   that span the tenant — binding them into a project is what the
   `project_agent_template_bindings` table is for.

## Sealed-room semantics

When a caller supplies `projectId` to a sealed-room-aware primitive
(`objects_list`, `agent_run_list`, `chat_thread_list`, the artifact
listing path), four invariants hold:

- The SQL filter `AND project_id = $projectId` is appended in the
  data-layer function (`listObjectsByFilter`, etc.) — handlers cannot
  bypass.
- A 404-hide read gate runs first: if `actor.projectGrants` has no
  read+ entry for the project, the call throws with `reason: "hidden"`
  before any rows are scanned.
- Cross-project Graphiti (a knowledge-graph indexer) candidate sets are re-filtered: the ID set may
  include rows from P+Q+ambient, but the SQL filter intersects to P-only
  before authz.
- **List handlers never import the context resolver.** The context resolver
  (`buildContextForRun` etc.) is a sealed-room-leaking surface;
  sealed-room semantics live behind the data-layer filter, not the
  resolver.

## Archive lifecycle

`projects.archived_at timestamptz NULL` is the lifecycle marker:

- `projects_archive(projectId)` sets `archived_at = now()`; idempotent.
- `projects_unarchive(projectId)` sets `archived_at = NULL`; idempotent.
- `assertProjectWritable(actor, projectId, "write" | "admin")` rejects
  every inheritance write, move-INTO target, and binding mutation when
  `archived_at IS NOT NULL`. Archived projects remain *readable* for
  grant-holders, and a resource can still be moved *out of* an archived
  project (the archive is a write-freeze, not a delete).
- `projects_delete` does not exist on the MCP surface.

## Migration

The migration script is the one-shot data backfill. DDL itself lives in
`buildCreateStoreSchemaQueries` because `project_id` columns and tables
must materialize on every fresh schema. The script:

- Discovers three sources of legacy `project_id` provenance:
  - `cinatra.agent_runs.input_params.projectId` (free-form runs)
  - `cinatra.chat_threads.payload.projectId` (chat-thread metadata)
  - `cinatra.objects.data.projectId` for object types that carry project
    metadata in the JSON body
- `--dry-run` (default): emits a deterministic report showing counts and
  ambiguity classes.
- `--apply`: idempotent backfill (re-runs against a partially-migrated DB
  are no-ops). The legacy blog-project object type
  (`@cinatra-ai/assets:blog-project`, still living in `cinatra.objects` for
  backward compatibility) is unrelated to the product-model Project — it's a
  different domain.

`buildCreateStoreSchemaQueries()` carries the column DDL because every
fresh schema (worktree clone, CI fixture, prod boot) must materialize it;
the standalone script handles only the data backfill so it can stay out of
the boot-time migration array (where it would re-run every dev-server boot).

## UI patterns

Routes:
- `/projects` — index. Renders owned ∪ accessed with `effectiveRole` +
  `accessSource` badges per row + `?archived=1` toggle.
- `/projects/[projectId]` — detail. Metadata card + sealed-room counts
  card (objects / agent_runs / chat_threads) + Archived banner when
  `archived_at IS NOT NULL`.
- `/projects/[projectId]/permissions` — `project_access` management.
  Principal-level picker (user/team/organization/workspace) + role picker
  (read/write/admin); revoke per row; owner row read-only.
- `/projects/[projectId]/agents` — `project_agent_template_bindings`
  management: bind / unbind agent templates, visibility filter
  (visible/hidden/project-private), optional pinned_version, optional
  default_context_overrides.

UI rules that must hold:
- Every interactive element uses shadcn/ui components from
  `src/components/ui/`. Semantic tokens only — never raw Tailwind palette
  classes.
- `ScopeBadge` is the canonical ownership / principal level indicator;
  inline palette classes are forbidden outside `scope-badge.tsx` itself.
- Top-level page chrome uses `<Card>` from `@/components/ui/card`; inner
  sub-sections use `.soft-panel`.
- The principal picker on `/projects/[projectId]/permissions` writes
  `__workspace__` automatically for the workspace level — the user does
  not type the sentinel.

## Cross-references

- `packages/projects/AGENTS.md` — package-scoped reference for project behavior.
- `CLAUDE.md` § Scope Model — the four-tier ownership ladder and project access model.
