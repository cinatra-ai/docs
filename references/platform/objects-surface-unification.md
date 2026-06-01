# Objects Surface Unification

The canonical objects documentation lives at [`references/platform/objects.md`](objects.md).
Read that page first. This file summarizes the object-surface contract and the
guardrails that keep the legacy entity surface aligned with the canonical
`packages/objects/` substrate.

The object surface contract defines the shared vocabulary, schemas, actor
context, surface inventory, CI consistency checks, and fail-closed bypass policy
for the objects layer.

## Current Contract

- **Code-owned taxonomy** — `packages/objects/src/taxonomy.ts` is the single
  source of truth for the allowed taxa: `ObjectCategory`, `UiFamily`,
  `ArtifactStatus`, `WrapperPrimitive`, `RbacResourceType` (a type-only alias of
  the authz `ResourceType`), plus `OBJECT_TYPE_FAMILY` (the locked typeId→family
  map) and the domain-namespaced type-id scheme `@cinatra-ai/<domain>:<type>`.
  `ENTITY_TYPE_IDS`/`ASSET_TYPE_IDS` are **derived** from it in
  `src/lib/register-all-object-types.ts` (lockstep — they cannot diverge). Lists
  + agent templates are no longer "entities" (they carry `UiFamily`
  `list`/`agent`).

- **Canonical `objects_*` contract locked** — legacy aliases are removed outright
  (no compat wrapper): `payload` (use `rawData`/`data`), top-level `type` on save
  (use `typeHint`), and the composite `{ type, id }` / bare `{ id }` identity
  (use `objects_get({ objectId })`). The save/get/update/delete/classify schemas
  are `.strict()`; negative tests assert the aliases fail.

- **Session-aware RSC client carries the full actor context** —
  `createSessionObjectsClient(actor: ActorContext)` (no `orgId`-only overload).
  The translation lives in `packages/objects/src/objects-actor-envelope.ts`; RSC
  pages pass `await requireActorContext()`, system paths build a role-less
  org-scoped `System` actor. This lets the objects handlers apply real role/grant
  authz on reads (role hints flow into `enforceResourceAccess`; `projectGrants`
  into the sealed-room filter).

- **Machine-readable surface inventory** —
  `src/lib/objects/surface-inventory.ts` enumerates legacy primitives →
  canonical replacement, raw `cinatra.objects` access (substrate vs. inventoried
  bypass), dynamic-type dispositions, the artifact + list consumer surfaces, and
  the delegated-chat allowlist. It is the mandatory source of truth for CI
  consistency checks.

- **CI consistency checks + tool-count** —
  `src/lib/objects/__tests__/objects-surface-drift.test.ts` (static source-scan,
  inventory-backed) fails CI on: taxonomy/lockstep divergence, a re-introduced
  alias or missing `.strict()`, a new raw `cinatra.objects` bypass outside the
  allow-list, delegated-chat allowlist divergence, or legacy-primitive
  registration divergence. It complements the existing authz consistency checks;
  it does not replace them.

- **Carve-out: fail-closed** — the typed `CarveOut` registry does not exist in
  code, so the CI checks have no carve-out escape hatch; any uninventoried
  object-surface bypass fails CI.
