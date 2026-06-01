# Data safety: undo and versioning

> **TL;DR.** Every mutation of a `cinatra.objects` row is captured as an
> append-only `object_change_event`, grouped under a `change_set`, emitted in
> the same DB transaction as the object mutation. The CAS-guarded restore
> engine appends a *new* `change_set` containing the inverse events — it never
> rewrites history.

This is the engineering reference for the undo / versioning substrate. The
user-facing walkthrough lives at
[Undo and history](../../guides/user/undo-and-history.md); this page covers the data
model, the effect taxonomy, the canonical writer, the restore engine, and the
MCP primitives.

---

## Core principle

One transaction, one history event; restore appends, never rewrites; chat and
the UI resolve intent, history holds the inverse.

AI-driven mutations are routine, so the substrate exists to make them
trustworthy to undo:

- every change is observable on a timeline,
- every reversible change is restorable in one step,
- every irreversible effect (a sent email, a CMS publish) is logged with a
  precise reason it cannot be auto-reversed, and
- the user is never surprised by silent data loss.

---

## Effect taxonomy

Every event carries a `history_effect` DB column (surfaced as the
`historyEffect` TypeScript field) with one of three values
(`HistoryEffect` in `src/lib/object-history/types.ts`):

- **`reversible-internal`** — pure object mutations; replayable as inverse
  statements by the restore engine.
- **`irreversible-logged`** — sent emails, CMS publishes, connector writes;
  logged-only, not replayable.
- **`compensating-action`** — irreversible *plus* a registered compensating
  template; eligible for restore when the template is approved, in which case
  the restore performs the compensating action rather than a silent inverse.

A `change_set` whose effect rollup contains any `irreversible-logged` event
*without* a compensating template is non-restorable. The TypeScript field is named
`historyEffect` (not `effectClass`) to avoid collision with the RBAC
`EffectClass`; the underlying DB column is `history_effect`.

The operation vocabulary (`HistoryOperation`) is `create`, `update`,
`soft-delete`, `hard-delete`, `tombstone`, and `restore`.

---

## Substrate

The history tables are created alongside the rest of the object store schema.
The substrate spans:

| Table | Role |
|---|---|
| `object_change_event` | Append-only history. Canonical before/after snapshots, idempotency key, event checksum, actor/run provenance, object schema version, and per-event restore eligibility. |
| `change_set` | Lifecycle grouping. `opened_at` / `closed_at`, effect rollup, restorable flag, and pointers to a parent change-set and to the change-set a restore reverses (`restore_of_change_set_id`). |
| `remote_effect_attempts` | Mutable status for connector (CMS) restores. Keyed to `object_change_event.id`; the append-only history itself stays append-only. |
| `merge_proposal` | Pending merge proposals from enrichment agents. Append-only; approval triggers a canonical `historyAwareUpsert`. |

`CanonicalSnapshot` carries the full row payload at the mutation boundary —
data plus identity metadata (`org_id`, `project_id`, `owner_level`,
`owner_id`, `visibility`, `parent_id`, `version`, `type`, `agent_id`,
`run_id`, `source`, timestamps, and so on). Snapshots are never trimmed at
write time; a tombstone may overwrite fields per the per-type tombstone
policy.

---

## Canonical writer API

`src/lib/object-history/canonical-writer.ts` is the **only** path that mutates
`cinatra.objects`. A drift gate
(`scripts/audit/objects-writer-drift-gate.mjs`) fails CI on any other
INSERT / UPDATE / DELETE against the table outside a small allowlist.

The public surface is exported from `@/lib/object-history`:

```ts
import {
  historyAwareUpsert,
  historyAwareSoftDelete,
  historyAwareUndelete,
  historyAwareTombstone,
} from "@/lib/object-history";

// CAS contract (HistoryWriteOptions.expectedBaseVersion):
//   null  → create-only: assert the row does NOT yet exist.
//   N     → update: assert the existing row.version === N before mutating.
// A mismatch raises VersionConflictError with a precise reason.
const result = historyAwareUpsert(
  { id, type, data, orgId },
  {
    expectedBaseVersion: null,
    historyEffect: "reversible-internal",
    actor: { actorId, actorKind: "user", orgId },
  },
);
```

`HistoryWriteOptions` (in `types.ts`) makes `expectedBaseVersion`,
`historyEffect`, and `actor` mandatory. Optional fields cover a
`compensatingTemplateId` (required when the effect is `compensating-action`), a
`remoteRevisionRef` pointer at a CMS-native revision, an explicit `changeSet`
handle, an `idempotencyKey`, an `auditEventId` linking to the RBAC trail, and
an `objectSchemaVersion` override.

Concurrency safety is enforced in SQL: `WHERE version = $N` on UPDATE and
`ON CONFLICT (id) DO NOTHING` on CREATE. The CTE includes a `cas_assert` clause
that raises `division_by_zero` (SQLSTATE 22012) when the write affected zero
rows; the JS layer catches and rethrows as `VersionConflictError` carrying a
`VersionConflictPayload` (current version, expected base version, latest
snapshot, conflicting fields, reason).

### Authz: current actor, not original actor

Restore authorization uses the **current** actor's RBAC authority, not the
actor that produced the event being restored. The original actor is provenance
only. This is reflected in `HistoryActor` and threaded through the restore
engine and the MCP handlers.

---

## Restore engine

`src/lib/object-history/restore-engine.ts`:

- `restoreChangeSet({ changeSetId, actor })` walks the events in reverse,
  builds inverse statements, and submits them in **one DB transaction** for
  true all-or-none. Per-object version tracking threads through the chain so
  consecutive inverses against the same object compose. A CAS failure inside
  the batched transaction raises in SQL and rolls back every other write.
- `restoreObjectToVersion({ objectId, targetVersion, actor })` is the
  single-object case (a degenerate change-set of size one). It takes the
  after-snapshot of the event whose `resultVersion === N` and writes via
  `historyAwareUpsert` with CAS against the current version. It does not
  cascade to other objects.

Restore appends a **new** `change_set` with `restore_of_change_set_id`
pointing at the original. The original is preserved unchanged, so a restore is
itself fully recorded and itself reversible.

### Eligibility

`src/lib/object-history/eligibility.ts` computes whether a change-set (or an
individual event) can be restored against the *current* snapshot, accounting
for schema-version fencing, referenced-object reachability, retention, and
external freshness. `RestoreIneligibleReason` enumerates the blocking cases —
for example `hard-deleted`, `referenced-object-hard-deleted`,
`schema-version-mismatch`, `retention-expired`, `external-source-missing`, and
`external-source-changed`.

---

## MCP primitives

Registered with the objects MCP server in
`packages/objects/src/mcp/registry.ts`; handlers in
`packages/objects/src/mcp/object-history-handlers.ts`.

| Primitive | Purpose |
|---|---|
| `change_set_undo` | Replay inverse events of a change-set under the current actor's RBAC. Appends a new change-set; all-or-none; CAS-guarded. Hard-deleted objects are ineligible. |
| `object_version_restore` | Restore a single object to a prior version (degenerate change-set of size one; same CAS + all-or-none + current-actor authz). |
| `change_set_get` | Read a change-set with its events and eligibility verdict. Events on objects the actor cannot read are redacted (partial-visibility safety). |
| `change_set_list` | List change-sets for an org / run, ordered by `opened_at` DESC, cursor-paginated. |
| `object_history_list` | List `object_change_event` rows for a single object, ordered by `created_at` DESC. Requires `object.read` on the target. |
| `change_set_eligibility_get` | Read-only eligibility verdict for a change-set, computed on demand against the current snapshot. |

Three operational-visibility primitives support connector restores and are
**not** in the delegated-chat allowlist (so chat assistants cannot call them);
they are reachable from the UI and authorized direct callers:

| Primitive | Purpose |
|---|---|
| `freshness_check_for_change_set` | Probe remote freshness for a change-set's CMS-tagged events; per-event verdict (`fresh` / `changed` / `missing` / `unknown` / `unsupported`). Reader authz. |
| `remote_effect_attempts_list_for_change_set` | List connector restore lifecycle rows for a change-set's events. Reader authz; org-scoped plus per-event read. |
| `remote_effect_attempt_retry` | Retry a failed or pending connector restore. `platform_admin` only; re-invokes with the stored `intendedState` under a fresh idempotency key. |

Every history primitive requires an authenticated org context
(`actor.orgId`). The registry resolves `orgId` / `userId` / `platformRole`
from the MCP request context (the active session), and orgless callers are
rejected with an explicit error rather than running unscoped.

---

## UI surfaces

- `/data-safety/change-sets` — the workspace change-history index, filterable
  by object, actor, run, effect, restorable flag, and date window. Fails
  closed to an empty state when there is no active org.
- `/data-safety/change-sets/[changeSetId]` — change-set detail with a per-event
  diff, eligibility verdict, connector attempts panel, and the restore modal.
  Events on objects the actor cannot read are redacted (snapshots and
  provenance scrubbed, timeline shape preserved); deep-links to unreadable
  objects are omitted rather than rendered as broken links.
- `/data-safety/merge-proposals` — pending merge proposals.
- `/data/[id]` — the canonical object detail page (`ObjectDetailPage` in
  `packages/objects`). Its **History** tab mounts `<UndoLastAction>` plus
  `<ObjectHistoryPanel>`, and a retention indicator. The tab can be deep-linked
  via `/data/[id]?focus=history`.
- `<ObjectHistoryPanel>` (`src/components/data-safety/object-history-panel.tsx`)
  — an importable per-object history panel. It reads via the object-history
  substrate (the caller passes the object id and the current actor's `orgId`
  so the SQL filter applies for id-reuse / cross-tenant safety) and renders a
  per-version **Restore to this version** button on each restore-eligible event
  that isn't the current version, *only* when the caller resolved
  `object.update` for the actor server-side.

### Per-page and chat undo

- `<UndoLastAction>` (`src/components/data-safety/undo-last-action.tsx`) is an
  inline "undo your last change to this object" affordance on the History tab.
  It is scoped to the current actor's most recent *closed, restorable*
  change-set touching that object within a short undo window
  (`UNDO_WINDOW_MINUTES` in `src/lib/object-history/server-views.ts`). It
  renders nothing when no such change-set exists, and reuses the shared
  `<RestoreModal>` + restore action path rather than introducing new
  restore-engine code.
- The chat-side undo (`packages/chat/src/undo-actions.ts`) polls for a recent
  closed, restorable change-set produced by a given `runId`
  (`recentUndoableChangeSetForRunAction`). The `closedAtAfter` lower bound
  avoids surfacing in-flight mutations. It returns the change-set id so the
  chat chip can deep-link to the URL-addressable restore modal
  (`?openRestore=1`), which enforces its own per-event restore authz on open
  and confirm.

All UI follows the shadcn-strict convention (`<Card>`, `<Button>`, `<Badge>`,
`<Table>`, `<Dialog>` and semantic tokens — `text-foreground`, `bg-surface`,
`border-line`, `.soft-panel`).

---

## External freshness adapter

`src/lib/object-history/freshness/` defines a five-state contract per connector
— `unsupported`, `unknown`, `missing`, `changed`, `fresh`. The restore-decision
semantics:

| State | Restore allowed? |
|---|---|
| `fresh` | Yes |
| `changed` | No — surface as a conflict |
| `missing` | No — remote source-of-truth is gone |
| `unknown` | No — non-silent warning; a platform-admin path may force |
| `unsupported` | Yes for non-CMS-tagged objects; no for CMS-tagged objects |

`resolveExternalFreshness(loaded, { orgId })` walks every event in a
change-set, looks up the registered adapter per `remoteRevisionRef`, and
produces an `ExternalFreshnessMap` the eligibility engine consumes.

---

## CMS restore state machine

`src/lib/object-history/cms-state-machine.ts` wraps connector restores in the
`remote_effect_attempts` table. It is idempotent: re-running with the same
`idempotencyKey` resumes from the stored attempt. Status transitions are
`pending → succeeded | failed`. Read-back verification is the connector's
responsibility and must run before `markRemoteEffectSucceeded`.

```ts
import { runCmsRestore } from "@/lib/object-history";

await runCmsRestore({
  changeEventId: event.id,
  connectorName: "wordpress",
  targetKind: "wordpress-post",
  targetId: String(remoteRevisionRef.remoteId),
  intendedState: { title, content /* ... */ },
  orgId: actor.orgId,
  callable: async ({ intendedState }) => {
    // 1. Write the intended state to the remote.
    // 2. Read back to verify.
    return { remoteRevisionRef: { revisionId: "..." }, readBack: { /* ... */ } };
  },
});
```

---

## Lossless-merge enrichment pattern

`src/lib/object-history/merge-proposals.ts`. Enrichment agents never mutate
objects directly — they submit a `MergeProposal` with a mandatory `baseVersion`
and per-field provenance. A reviewer approves via `approveMergeProposal()`,
which calls `historyAwareUpsert` using the proposal's `baseVersion` as the CAS
expectation; a stale base raises `VersionConflictError`, and the reviewer
chooses keep-mine / keep-latest / abort / re-propose.

```ts
import { submitMergeProposal } from "@/lib/object-history";

submitMergeProposal({
  objectId,
  objectType: "blog.post",
  baseVersion: currentObject.version,
  proposingActor: { actorId: "agent-blog-enrichment", actorKind: "agent", orgId },
  sourceKind: "external-fact-check",
  sourceRef: { url: "https://..." },
  proposedFields: {
    "data.title": {
      value: "Corrected title",
      provenance: { source: "fact-check-bot", confidence: 0.95 },
    },
  },
});
```

---

## Retention

`src/lib/object-history/retention-policy.ts` is a declarative per-type
registry. `RetentionPolicy` supports `indefinite`, `duration` (in days), and
`tombstone-after` (in days). The `scripts/audit/retention-policy-gate.mjs` CI
gate fails on missing declarations.

---

## Drift and retention gates

`scripts/audit/objects-writer-drift-gate.mjs` blocks new INSERT / UPDATE /
DELETE against `cinatra.objects` outside the canonical writer module.
`scripts/audit/retention-policy-gate.mjs` enforces a retention declaration per
registered object type. Run both locally before pushing:

```
node scripts/audit/objects-writer-drift-gate.mjs
node scripts/audit/retention-policy-gate.mjs
```

---

## Related reading

- [Developer Guide overview](../../guides/developer/README.md)
- [Objects layer](objects-layer.md) — the typed object store this substrate
  guards
- [Objects: the canonical surface](objects.md) — the unified object model and
  its primitives
- [Undo and history](../../guides/user/undo-and-history.md) — the user-facing walkthrough
