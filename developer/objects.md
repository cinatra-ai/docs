# Objects: the canonical surface

> **Status:** the source-of-truth for accounts, contacts, campaigns, email-outreach bundles, blog projects/ideas/posts, and artifact refs. Every read/write path goes through one of five canonical primitives.

## Why a single surface

The platform exposes one canonical Objects contract instead of separate `<entity>_*` wrapper primitives (`accounts_list`, `contacts_get`, ...). The blog domain is also represented through Objects.

| Operation | Canonical primitive | Replaces |
| --- | --- | --- |
| Read one | `objects_get({ objectId })` | `accounts_get`, `contacts_get`, `blog_*_get`, ad-hoc raw `cinatra.objects` reads |
| Read many | `objects_list({ type, parentId?, projectId?, runId?, ... })` | `accounts_list`, `contacts_list`, `contacts_sources_list`, raw shadow-row scans |
| Create | `objects_save({ rawData, typeHint?, parentId? })` | `accounts_create`, `contacts_create`, shadow upserts |
| Mutate | `objects_update({ objectId, data })` | `accounts_update`, `contacts_update` |
| Delete | `objects_delete({ objectId })` | `accounts_delete`, `contacts_delete` |

There is **no** `payload` field (use `rawData`). There is **no** `{ type, id }` or bare `{ id }` identity shape (use `objectId`). Re-introducing either fails the contract guard.

## The taxonomy

The locked vocabulary lives in `packages/objects/src/taxonomy.ts` - every classifier, contract guard, registry, and renderer reads from there. The four taxa:

- **`ObjectCategory`** - the classifier's category axis: `profile | content | project | idea | report`.
- **`UiFamily`** - the UI grouping: `entity | asset | campaign | list | agent | artifact | workflow`.
- **`ArtifactStatus`** - artifact-bearing object lifecycle: `draft | active | archived`.
- **`RbacResourceType`** - the authorization resource-type axis (type-only alias of the authz `ResourceType` to avoid runtime coupling).

The **locked typeId -> family** map (`OBJECT_TYPE_FAMILY`) - every statically-known object type must have an entry here, and every entry must be domain-namespaced (`@scope/package:type`):

| Type id | Family |
| --- | --- |
| `@cinatra-ai/entity-contacts:contact` | `entity` |
| `@cinatra-ai/entity-accounts:account` | `entity` |
| `@cinatra-ai/assets:blog-project` | `asset` |
| `@cinatra-ai/assets:blog-idea` | `asset` |
| `@cinatra-ai/assets:blog-post` | `asset` |
| `@cinatra-ai/lists:list` | `list` |
| `@cinatra-ai/agent-builder:agent-template` | `agent` |
| `@cinatra-ai/artifact:object` | `artifact` |
| `@cinatra-ai/artifacts:artifact-ref` | `artifact` |
| `@cinatra-ai/campaigns:campaign` | `campaign` |
| `@cinatra-ai/campaigns:context` | `campaign` |
| `@cinatra-ai/campaigns:recipients` | `campaign` |
| `@cinatra-ai/campaigns:email-draft-bundle` | `campaign` |
| `@cinatra-ai/campaigns:email-followup-bundle` | `campaign` |
| `@cinatra-ai/campaigns:send-attempt` | `campaign` |

`ENTITY_TYPE_IDS` and `ASSET_TYPE_IDS` in [`src/lib/register-all-object-types.ts`](../../src/lib/register-all-object-types.ts) **derive** from this map via `objectTypeIdsForFamily(family)`; the invariant test asserts the lockstep - they cannot diverge.

## The five primitives in detail

### `objects_get`
```ts
{ objectId: string }
-> { object: { id, type, name, data, createdAt, updatedAt, ... } | null }
```
Identity is **`objectId`**, never `{ type, id }`. Reads honor the calling actor's `project_access` grants and, when resource-level authorization is enabled, the `requireResourceAccess` predicate. The handler stamps the envelope id back into `data` on read (`{ ...data, id: object.id }`) - code that constructs nested trees from the response can rely on it.

### `objects_list`
```ts
{
  type?: string,
  parentId?: string,
  projectId?: string,   // sealed-room filter
  runId?: string,       // per-run filter
  query?: string,       // semantic (Graphiti)
  category?: string,
  limit?: number,
  cursor?: string,
}
-> { items: ObjectRecord[], nextCursor: string | null }
```
The `projectId` filter implements sealed-room reads - substrate writes skip it, but every consumer-facing read carries the actor's project context. The `parentId` filter is how the blog facade (and any other tree-shaped domain) walks the canonical hierarchy.

### `objects_save`
```ts
{
  rawData: Record<string, unknown>,
  typeHint?: string,
  parentId?: string,
  ownerLevel?: "user" | "team" | "organization" | "workspace",
  ownerId?: string,
  visibility?: "private" | "team" | "organization" | "public",
}
-> { objectId, type, isNew, wasMerged, confidence }
```
Creates a new object; ids are minted by the substrate. **There is no caller-supplied id field on the canonical surface** - id preservation is reserved for one-shot migration tooling (`scripts/backfill-asset-blog-objects.mts` calls `upsertObjectAndEnqueue` with a preserved id; consumer code does not).

### `objects_update`
```ts
{ objectId: string, data: Record<string, unknown>, projectId?: string }
-> { ok: true }
```
Optional `projectId` performs a project re-tag. Without it, the row's `project_id` is preserved under conflict.

### `objects_delete`
```ts
{ objectId: string }
-> { ok: true }
```
Soft delete via `assertWriteScopeAllowed` + the `softDeleteObject` substrate writer; cross-tenant deletion is fenced by the actor frame's `organizationId`.

## Actor + authz model

Every canonical call requires an `ActorContext` - built once at the entry boundary (RSC page, request envelope, agent passthrough, server action) via `requireActorContext()` / `getActorContext()`, then carried through `createSessionObjectsClient(actor)`:

```ts
// In an RSC page or server action:
const actor = await requireActorContext();   // @/lib/auth-session
const client = createSessionObjectsClient(actor);
const { items } = await client.list({ type: "@cinatra-ai/entity-accounts:account" });

// In a system/worker path (no session):
function systemActorForOrg(orgId: string | null): ActorContext {
  return { principalType: "System", principalId: "system", organizationId: orgId ?? undefined, authSource: "worker", policyVersion: POLICY_VERSION };
}
const client = createSessionObjectsClient(systemActorForOrg(orgId));
```

The actor carries `userId`, `organizationId`, platform/org/team roles, and `projectGrants`; the handler applies the resource-access predicate plus the sealed-room project filter on every read.

Write-scope is enforced by `assertWriteScopeAllowed` (`src/lib/objects-store.ts`): a non-admin actor frame requires a non-null `orgId` matching `actor.organizationId`; without a frame the guard short-circuits (substrate / background-job paths).

## Project scoping (D1 inheritance)

When a write happens inside a project context (the agent run frame established by `runAgentBuilderExecutionJob` / set explicitly at a transport boundary), `upsertObjectAndEnqueue` resolves `projectIdForRow` via `resolveProjectInheritanceForType(frame?.projectId, type)`:

- **substrate rows** (artifact bytes, semantic assertions, internal classifiers) are pan-project - they ignore the frame and tag NULL.
- **product rows** (entity, asset, campaign, list, agent objects) inherit the frame's projectId.

The archive guard then asserts the resolved projectId is writable; substrate rows skip the guard.

## Graphiti projection

Every write through `upsertObjectAndEnqueue` atomically (single CTE) writes the row, bumps `version`, sets `graphiti_sync_status='pending'`, and inserts a matching `graphiti_projection_outbox` row. The `GRAPHITI_PROJECTION_REPAIR` BullMQ (a Redis-backed job queue) job pulls the outbox -> calls Graphiti (a knowledge-graph indexer) `add_memory` -> updates `graphiti_episode_uuid` with the version guard. No object write can bypass projection - the invariant test forbids the `."objects"` raw-SQL table outside the inventoried substrate allowlist.

## What this surface ABSOLUTELY does NOT include

Three things are intentionally kept out of this surface:

- **`packages/artifacts/` blob/version/storage internals** - the `ArtifactRef` mechanics and the `@cinatra-ai/blob/version` tables stay unchanged. `@cinatra-ai/artifacts:artifact-ref` is registered for *classification* of blog post refs only; it is not a per-blob row type.
- **Generic-collection schema redesign for `@cinatra-ai/lists:list`** - the list pointer type keeps its current account/contact-oriented schema. The schema lives with the CRM connector (`extensions/cinatra-ai/crm-connector/src/integration/register-object-types.ts`); the consumer surface unifies (member resolution via canonical `objects_*`) but the schema is not redesigned.
- **Auto-mapping for object types outside the static registration set** - the dispatcher covers exactly the statically registered types; auto-mapping for new types is added with those types.

## Contract Guard

The contract guard ([`src/lib/objects/__tests__/objects-surface-drift.test.ts`](../../src/lib/objects/__tests__/objects-surface-drift.test.ts)) is the single CI test that enforces every invariant on this page:

1. **Taxonomy lockstep** - every locked typeId is domain-namespaced; `ENTITY_TYPE_IDS` and `ASSET_TYPE_IDS` derive from the taxonomy via `objectTypeIdsForFamily`.
2. **Contract lock** - the `objects_*` schemas have no `payload:` field, `objectsSaveSchema` has no top-level `type:` alias, and `get/update/delete/classify` schemas are `.strict()`.
3. **Raw bypass scan** - every file touching `."objects"` is either inside `packages/objects/` (substrate) OR explicitly inventoried in `src/lib/objects/surface-inventory.ts`. The allowlist is fail-closed.
4. **Delegated-chat allowlist** - every inventoried allowlist entry is present in the live policy; no entity *mutation* primitive (the retired `accounts_create`/etc.) is in the allowlist.
5. **Tool-count** - every `LEGACY_PRIMITIVES` entry's `registered` flag matches its presence in *both* the registry file AND the handlers file. Re-introducing any retired wrapper primitive fails CI on either file.

## Glossary

- **Object** - a row in `cinatra.objects`. Has a domain-namespaced `type`, optional `parent_id`/`parent_type` pointer, freeform JSONB `data`, an `org_id` scope, a `project_id`, and provenance (`source`/`run_id`/`agent_id`/...).
- **Object type** - a static registration in `objectTypeRegistry` with a zod schema, a category, a lifecycle (`sources`, `mutableBy`), and renderers. Registered via each domain package's `register*ObjectTypes()` and the host-side `registerAllObjectTypes()`.
- **`UiFamily`** - the UI grouping a type belongs to (entity, asset, campaign, list, agent, artifact, workflow). Drives `ENTITY_TYPE_IDS` / `ASSET_TYPE_IDS` derivation and the inventory.
- **`ActorContext`** - the authorization principal carried through every canonical call (`packages/llm-orchestration/src/actor-context.ts`). Discriminated by `principalType` (`HumanUser | ServiceAccount | ExternalA2AAgent | InternalWorker | System`) plus `organizationId`, roles, `projectGrants`.
- **`createSessionObjectsClient(actor)`** - the canonical RSC / server-side wrapper around the deterministic objects client. Carries the full actor context.
- **`upsertObjectAndEnqueue`** - the sync substrate writer. Atomic CTE inside a single transaction: upsert into `cinatra.objects` + insert into `graphiti_projection_outbox`. Used by all canonical writes + by `scripts/backfill-asset-blog-objects.mts`.
- **D1 inheritance** - the write-time project frame: every product-row write inside an agent run inherits the frame's `projectId`; substrate rows skip the inheritance.
- **D3 sealed-room read** - the read-time project filter: list reads scoped to the actor's `projectGrants` + the frame's `projectId`.
- **Fail-closed raw-object allowlist** - the raw-`objects` bypass allowlist has no escape hatch. Adding a new file that touches `."objects"` without an explicit inventory entry fails CI.
- **Contract guard** - the CI test in `src/lib/objects/__tests__/objects-surface-drift.test.ts` that enforces every invariant on this page.

## Agent-output auto-mapping

Every statically registered object type may declare a `crudPolicy` on its `ObjectTypeDefinition`. The agent-output dispatcher (`packages/objects/src/automap/dispatcher.ts`) consumes the policy plus the type's `identityKey` and the classifier's confidence to produce a deterministic `DispatchDecision`:

```ts
type DispatchDecision =
  | { kind: "create"; typeId; data }
  | { kind: "update"; typeId; objectId; data }
  | { kind: "merge";  typeId; objectId; data }
  | { kind: "skip";   typeId; objectId; reason }
  | { kind: "hitl";   typeId; reason; output };
```

### SKILL.md / OAS guidance for consumer agents

When your agent's output targets one of the auto-mapped types, you do NOT call `objects_save` / `objects_update` directly. Instead, structure the output as the type's schema and let the dispatcher decide. The dispatcher picks `create` / `update` / `merge` / `skip` / `hitl` based on the type's policy:

| Type | onMatch | onNoMatch | Required | Mergeable / Preserved (highlights) |
| --- | --- | --- | --- | --- |
| `@cinatra-ai/entity-accounts:account` | `update` | `create` | `name` | preserved: `id`, `createdAt`, `startupId`, `accountId`. human-in-the-loop (HITL)>=0.7. Dedupe on `websiteHost` -> `website` -> `name`. |
| `@cinatra-ai/entity-contacts:contact` | `merge` | `create` | `email` | merge: `customProperties`/`externalIds`/`defaultProperties`. preserved: `id`/`createdAt`/`startupId`/`accountId`. Dedupe on `email` -> `linkedinUrl` -> `apolloPersonId`. |
| `@cinatra-ai/assets:blog-project` | `update` | **`hitl`** | `name` | Agent never auto-creates a project. `name`/`companyUrl`/`ideasPerTranscript`/`transcriptIds` preserved across agent re-runs. |
| `@cinatra-ai/assets:blog-idea` | `update` | `create` | `title` + `projectId` | preserved: `id`/`createdAt` + summary artifact refs (materializer-owned). |
| `@cinatra-ai/assets:blog-post` | `merge` | `create` | `title` + `ideaId` | merge: `linkedinDrafts`/`wordpressDrafts`/`savedPrompts`. preserved: `id`/`createdAt` + post/image artifact refs (materializer-owned). |
| `@cinatra-ai/campaigns:campaign` | `update` | `create` | - | run-scoped via `cinatra_agent_run_id`. `name` (user-owned) preserved across agent re-runs. |
| `@cinatra-ai/campaigns:context` / `:recipients` / `:email-draft-bundle` / `:email-followup-bundle` / `:send-attempt` | `update` | `create` | - | run-scoped transient bundles via `cinatra_agent_run_id`. Same-run retry updates in-place; new run = new row. |
| `@cinatra-ai/artifacts:artifact-ref` | **`skip`** | **`hitl`** | `artifactId` + `representationRevisionId` | Materializer-owned: ref creation happens via the artifact pipeline (`src/lib/blog-*-materializer.ts`) which holds the blob+ref lock. Agents never auto-write a ref. |

### HITL fallback paths

The dispatcher escalates to a `hitl` event (output attached) when ANY of these hold:

1. `classifierConfidence` is below the policy's `hitlConfidenceThreshold` (default `0.6`).
2. A `requiredFields` value is missing or empty.
3. `identityKey(output)` returns `null` AND `policy.onNoMatch === "hitl"`.
4. `identityKey` resolves but no existing match exists AND `policy.onNoMatch === "hitl"`.

A type with NO `crudPolicy` is *intentionally* opt-in: the dispatcher always emits HITL for that type. Types are never auto-written by silent default.
