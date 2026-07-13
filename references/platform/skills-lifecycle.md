# Skills Lifecycle — States, Revisions, Content Authority, Catalog Rebuild

Custom and personal skills are managed, living objects: they carry a lifecycle state, an immutable revision history, and a database-authoritative content record. This page is the operator-facing reference for that layer — where a skill's state comes from, what each state means at runtime, what the revision history guarantees, and how catalog reads relate to catalog rebuilds.

For how skills are matched to agents, see [Skill matching](skill-matching.md). For the day-to-day maintenance jobs and their runbooks, see the [Hosting Guide → Skills maintenance](../../guides/hosting/skills-maintenance.md).

## Where a skill's state comes from — the precedence matrix

A skill's lifecycle authority is determined by its origin. There is exactly one authority per skill; the two never overlap.

| Skill class | Authority for state | `lifecycle_state` column | Notes |
|---|---|---|---|
| **Custom / personal** (owner-authored in-app) | The lifecycle layer described on this page | Non-null: `draft`, `active`, `deprecated`, or `archived` | Owner-authored content; carries revisions and a transition audit trail. |
| **Extension** (bundled, GitHub-installed, or marketplace package skills) | **Derived** at read time from the installed extension's own state (active / locked / archived install) | NULL | The installed extension is the single source of truth; the lifecycle layer never stores a second copy of its state. |
| **Legacy / bare local** (no recorded source) | Derived (treated as an active head) | NULL | Gains a lifecycle authority only if it becomes a custom skill through a content write. |

A NULL `lifecycle_state` means "derived — this layer holds no opinion". A database CHECK constraint enforces that the column is either NULL or one of the four states, so an extension skill row is always valid while carrying no lifecycle state of its own.

Archiving or restoring an **extension** is therefore an extensions operation (see [Extensions](extensions.md)), not a skill-lifecycle transition. The lifecycle states below apply to custom and personal skills only.

## Lifecycle states

| State | Meaning |
|---|---|
| `draft` | Creation-time only — a skill being authored before publication. Nothing transitions *into* `draft`. |
| `active` | Usable. A custom or personal skill created through the standard save path starts here. |
| `deprecated` | Discouraged but still delivered at runtime; typically paired with a `superseded_by` pointer to a successor skill. |
| `archived` | Retired. Terminal — nothing transitions out of `archived`; a revival is a new skill. |

### Legal transitions

Rows are FROM states, columns are TO states. A blank cell is rejected (the state machine fails closed), and a same-state "transition" is rejected as a no-op.

| from \ to | draft | active | deprecated | archived |
|---|:---:|:---:|:---:|:---:|
| **draft** | | yes (publish) | | yes (discard) |
| **active** | | | yes (wind down) | yes (retire) |
| **deprecated** | | yes (restore) | | yes (retire) |
| **archived** | | | | (terminal) |

`superseded_by` is a self-reference between skills. Cycle creation is rejected twice over: an application-layer pre-check walks the successor chain, and the transition write itself re-walks the chain under a transaction-scoped lock, so two concurrent supersede writes can never commit a cycle between them.

### Who may drive a transition

Fail-closed: a transition is applied only when it is both legal (table above) and the actor is entitled.

| Actor | May transition? |
|---|---|
| Owner of the skill | Yes — any legal transition on their own skill |
| Org admin / platform admin | Yes — any legal transition (governance) |
| System (migration / automation) | Yes — e.g. the upgrade backfill's initial activation |
| Any other user | No |
| Unknown actor type, or an illegal transition | No |

Every applied transition writes one audit row (`from_state`, `to_state`, actor, reason, timestamp) atomically with the state change; a concurrent transition loses the compare-and-swap and is rejected rather than mis-audited. A skill's *initial* activation is provenance carried by its first revision, not an audit row — an audited transition's `from_state` is always a real prior state.

**Current exposure.** State changes today happen automatically: a new custom or personal skill activates on creation, and the upgrade backfill activated pre-existing ones. The transition machinery (state machine, authorization, audit) is a platform primitive (`packages/skills/src/lifecycle-store.ts`); no admin UI control or MCP tool drives it. The runtime enforcement below is live regardless of how a state comes to be.

## What each state means at runtime

Every runtime consumer applies the same pure deliverability rule, fail-closed:

- **Delivered:** `active`, `deprecated`, and NULL (derived — extension skills are governed by their extension's state instead).
- **Withheld:** `draft`, `archived`, and any unknown or unreadable state. A failure to *read* the lifecycle state also withholds — delivery is never the failure mode.

The consumers that enforce this:

| Consumer | Behavior for a non-deliverable skill |
|---|---|
| Agent tier resolution (which skills an agent gets) | Excluded — including on degraded catalog-read paths; a lifecycle read error withholds all custom skills rather than delivering blind. |
| LLM provider delivery (per-run skill injection, personal delta skills) | Withheld from the run. Explicit source-path references are gated on the owning catalog skill's state. |
| MCP direct reads (`skills_installed_get`, `skills_installed_list`, `skills_installed_resolve_for_agent`) | Returned only to an actor with `manage` access on the skill — the management plane keeps full visibility. A read-level actor gets a not-found / exclusion. |
| Remote provider mirror sync (Anthropic-hosted skill copies) | Excluded from sync candidates, so the existing stale-marking and garbage-collection path reclaims the remote copy. A lifecycle read *error* aborts the sync entirely rather than guessing. |
| Match candidate creation (see [Skill matching](skill-matching.md)) | Non-deliverable skills produce no new match evaluations. Existing match rows are left in place (maintenance jobs, not lifecycle state, own their cleanup) so an archived skill's history is never silently tombstoned. |

The full consumer-by-state matrix is pinned in the product repo (`packages/skills/src/skill-source.ts`, the lifecycle policy section) with per-cell tests.

## Revisions and content authority

Every content write to a custom or personal skill records one **immutable revision**, atomically with the write:

- A revision has its own event identity — saving identical content twice yields two revisions, so provenance is per event, not per unique content.
- Each revision records the SHA-256 digest of the content, its source — the write path that produced it — and, for generated deltas, which skills it was derived from and their digests at generation time. Today's write paths record `manual` (standard saves), `migration` (the upgrade backfill), and `rollback`; the schema also admits `autosave`, `hitl`, and `chat-capture` source values for capture flows that do not write revisions today.
- Revisions are **append-only**: a database trigger rejects any UPDATE or DELETE, so history can never be mutated. Revisions survive even a hard skill delete (tombstoned history).
- The only mutable element is the skill's **active-revision pointer**, which must name a revision belonging to that same skill (enforced by a composite foreign key).

**The database is authoritative for content.** A skill's authoritative content is the immutable blob named by the active revision's digest, stored content-addressed with database CHECKs that prove `digest = sha256(content)` — a wrong blob cannot be inserted. The `SKILL.md` file on disk and the catalog row's inline content are **projections** of that authority: caches, rebuildable from it. A content write commits payload, revision, blob, and pointer in one transaction; the disk re-projection happens after commit and is best-effort — a failed projection never corrupts committed authority.

**Retention:** revisions and content blobs are retained indefinitely. There is no pruning; only the active pointer moves.

### Rollback

Rollback is **forward-only**: it never mutates history. Rolling back records a *new* revision (source `rollback`) whose content digest equals the chosen prior revision's, restores that exact content, and re-points the active head. Guarantees:

- Authorization is the standard `manage`-access chokepoint, derived from the persisted skill and the caller's session — never a caller-supplied flag.
- The target revision must belong to the skill and resolve to verifiable stored content; a revision whose content cannot be verified is rejected.
- The write is a compare-and-swap on the active pointer: if a concurrent edit advanced the head, the rollback fails loudly instead of silently reverting the newer write, and writes nothing.
- A successful rollback re-fires the standard post-write hooks, so skill matching re-evaluates against the restored content.

**Current exposure.** Rollback is a platform primitive (`packages/skills/src/rollback.ts`); there is no rollback button in the admin UI and no MCP tool for it.

## Catalog reads vs. catalog rebuilds

Reading the skills catalog and rebuilding it are two different operations:

- **Snapshot read** — a pure read of the persisted catalog, with zero side effects. Served through a cross-process-coherent cache: every catalog write bumps a generation token in the same transaction, and cache misses read token + rows + token inside one `REPEATABLE READ` transaction, so a reader sees the catalog fully-old or fully-new — never a torn mix — and a write from any process (web worker, job worker) invalidates every process's cache.
- **Explicit rebuild** — the full engine: sync, disk scan, merge, catalog rewrite, match-job enqueue. It runs single-flight per process (a trigger arriving mid-rebuild queues exactly one follow-up run), and cross-process under a database lease with TTL takeover, so concurrent app workers cannot run overlapping rebuilds and a wedged rebuild cannot block the system forever. The catalog-write transaction itself verifies lease ownership before committing, so a rebuild that outlived its lease rolls back rather than overwriting a fresher result.

Rebuilds run automatically at boot (after extension activation), on skill-extension install / update / uninstall, on MCP package install / uninstall, on GitHub skill installs, and — in development mode — when the extensions watcher settles. Not every read path has moved to the pure snapshot read; the migration is incremental and tracked per call site in the product repo (`docs/architecture/skills-catalog-read-inventory.json` there). Operationally this means some read paths can still trigger the legacy read-through-rebuild behavior; the locking and fencing above hold for both.

**Operator takeaways:** a restart forces a full rebuild at boot; running multiple app processes is safe (the lease serializes rebuilds); and there is no manual "rebuild now" control — install/uninstall events and boot are the triggers.

## Further reading

- [Skill matching](skill-matching.md) — the evaluator, transports, and trust thresholds
- [Skills maintenance runbooks](../../guides/hosting/skills-maintenance.md) — the opt-in background jobs that keep match rows honest
- [Skills storage layout](skills-storage-layout.md) — scope/level columns and typed identity
- [Extensions](extensions.md) — the install-state model that extension skills derive from
