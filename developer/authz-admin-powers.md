# Authorization Admin Powers

**Status:** Adopted (2026-05-10)
**Supersedes:** implicit silent-bypass pattern for platform-admin resource CRUD
**Owners:** authz kernel maintainers

## 1. Context

The authorization model must not grant `platform_admin` resource-CRUD
permissions in `EFFECTIVE_GRANTS`. Grants such as `project.update` and
`project.delete` in `DIRECT_GRANTS.platform_admin` would give any platform admin
cross-tenant write authority on user-owned data, with no audit row and no named
code path.

Removing those grants from the role table is necessary but not sufficient: a
future change could re-add them in good faith ("admins need to delete spam
projects"), silently regressing to the same posture. This document defines the
**structural convention** that prevents that — both as a CI guard (invariant
test) and as a documented pattern for "how do admins legitimately moderate /
GDPR-delete user data".

## 2. Decision

Permissions split into two groups, treated differently:

### Platform-level powers — granted directly via `DIRECT_GRANTS.platform_admin`

| Permission           | Why it's platform-level                                                                            |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| `settings.read`      | App-wide configuration (large language model (LLM) keys, Model Context Protocol (MCP) public base URL). Not per-tenant data.                       |
| `settings.update`    | Same.                                                                                              |
| `audit.read`         | Audit table is global by definition.                                                               |
| `registry.read`      | Public agent registry — global product surface.                                                    |
| `registry.install`   | Same — but **also granted to `org_admin` and `team_admin`**; see scope-target rules below.         |
| `registry.update`    | Same.                                                                                              |
| `registry.uninstall` | Same.                                                                                              |

These operate on global app config, not on per-tenant user data. They are safe
to grant via the role table.

### Resource-CRUD powers — NEVER granted to `platform_admin` via `DIRECT_GRANTS`

Every other permission in the catalog (`project.update`, `project.delete`,
`object.delete`, `agent.update`, `skill.update`, `*.share`, `*.execute`,
`*.manage*`, `*.promoteScope`, `*.cancel`, `*.resume`, `*.assign`,
`*.approveHitl`, `*.respondToHitl`, …) is **resource-CRUD**.

When platform admin intervention on user data is legitimate (moderation, GDPR,
ownership transfer, incident response, compliance audit), it goes through a
**named, audited code path** via `withPlatformAdminBypass(...)`. There is no
silent grant. The audit row is the authorization record.

## 3. The helper

Defined in `src/lib/authz/admin-bypass.ts`:

```typescript
export type AdminBypassReason =
  | "moderation"
  | "gdpr_request"
  | "ownership_transfer"
  | "incident_response"
  | "compliance_audit";

export async function withPlatformAdminBypass(
  actor: ActorContext,
  operation: string,
  resource: ResourceRef & { ownerId: string },
  reason: AdminBypassReason,
  extraMetadata?: Record<string, unknown>,
): Promise<{ auditEventId: string }>;
```

**Throw semantics:** rejects with `AuthzError({ statusCode: 403, reason: "forbidden" })`
if `actor.platformRole !== "platform_admin"`. Audit-write failure propagates
(via `logAuditEventStrict`) and aborts the caller's mutation — there is no
"best effort" path.

**Audit row shape** (one row per successful call):

| Column                     | Value                                                                                                                                                                             |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `actorPrincipalId`         | `actor.principalId`                                                                                                                                                              |
| `actorPrincipalType`       | `"human"` (literal — *not* `"HumanUser"`; common pitfall)                                                                                                                        |
| `authSource`               | `actor.authSource`                                                                                                                                                               |
| `organizationId`           | `actor.organizationId`                                                                                                                                                           |
| `resourceType`             | `resource.resourceType` (e.g. `"project"`)                                                                                                                                       |
| `resourceId`               | `resource.resourceId`                                                                                                                                                            |
| `operation`                | caller-supplied (e.g. `"project.delete"`)                                                                                                                                        |
| `decision`                 | `"allowed"`                                                                                                                                                                      |
| `policyVersion`            | `actor.policyVersion`                                                                                                                                                            |
| `metadata.bypass`          | `true`                                                                                                                                                                           |
| `metadata.reason`          | one of the 5 enum values                                                                                                                                                         |
| `metadata.originalOwnerId` | `resource.ownerId` (captured BEFORE the mutation)                                                                                                                                |
| `metadata.<extras>`        | merged from `extraMetadata` (caller-supplied keys merge FIRST and are overridden by the canonical keys above — a buggy or hostile caller cannot suppress `bypass: true`)         |

Return shape: `{ auditEventId: string }`. Callers that surface the receipt to
operators (UI toast, ticket comment) thread it through.

## 4. The reason enum

Five values, locked:

| Reason               | Use case                                                        |
| -------------------- | --------------------------------------------------------------- |
| `moderation`         | Removing spam / abuse content reported via in-app flow          |
| `gdpr_request`       | Right-to-be-forgotten deletion under GDPR Art. 17               |
| `ownership_transfer` | Reassigning resources after team / org membership changes       |
| `incident_response`  | Containing live security incidents (token leak, account takeover) |
| `compliance_audit`   | Read-then-mutate flows tied to SOC2 / HIPAA evidence collection |

Adding a new reason requires editing `AdminBypassReason` in
`src/lib/authz/admin-bypass.ts`. Call sites narrow via
`Extract<AdminBypassReason, ...>` to restrict which reasons their UI / API
surface accepts — see Section 5.

## 5. First call site — `moderationDeleteProject`

In `src/app/projects/admin-actions.ts`:

```typescript
export type ProjectModerationDeleteReason = Extract<
  AdminBypassReason,
  "gdpr_request" | "incident_response"
>;

const ALLOWED_REASONS: readonly ProjectModerationDeleteReason[] = [
  "gdpr_request",
  "incident_response",
] as const;

export async function moderationDeleteProject(
  projectId: string,
  opts: { reason: ProjectModerationDeleteReason; ticketRef: string },
): Promise<{ ok: true; auditEventId?: string }> {
  // 1. Runtime allow-list check (mirrors the narrowed type — defends against
  //    a caller using `as any` to widen reason).
  // 2. Runtime ticketRef non-empty / non-whitespace check.
  // 3. Resolve session → actor.
  // 4. Read project (idempotent: missing → return ok).
  // 5. await withPlatformAdminBypass(actor, "project.delete", resource, reason,
  //                                  { ticketRef: opts.ticketRef })
  // 6. await deleteProject(project.id)
}
```

Note the layered defenses: the type narrows the *caller surface* at compile
time, the runtime allow-list narrows it at the server-action boundary against
`as any` widening, and the helper itself is the trust boundary that produces
the audit row. Error messages **do not echo invalid input** — log-injection
defense, since these surface in Next.js server-action logs.

## 6. Adding a new bypass call site — recipe

1. **Write a named server action.** Don't add the bypass inline next to a
   mutation; the named action is what auditors / on-call grep for.
2. **Narrow `reason` via `Extract<>`.** Pick the smallest reason set the
   surface needs. UI / API consumers should not be able to pass
   `compliance_audit` to a moderation endpoint.
3. **Require any correlation IDs (e.g. `ticketRef`) and validate at runtime.**
   Type-level required props are bypassable via `as any`; runtime check is the
   real gate.
4. **Call `withPlatformAdminBypass` BEFORE the mutation.** Audit row is written
   first; if the audit DB is down, the mutation never runs.
5. **Thread caller-supplied metadata via the optional 5th arg.** Only the
   canonical keys (`bypass`, `reason`, `originalOwnerId`) are guaranteed; any
   correlation field (ticket ref, incident ID, GDPR request UUID) goes here.
6. **Add a unit test asserting the order: bypass-then-mutate; audit-failure
   aborts the mutation; type-narrowed reasons fail at compile time;
   runtime-narrowed reasons fail at runtime when widened via `as any`.**

## 7. Invariant test

`src/lib/authz/__tests__/platform-admin-grants-invariant.test.ts` walks
`EFFECTIVE_GRANTS.platform_admin` and rejects any permission whose suffix
matches the resource-CRUD regex
`/\.(update|delete|share|execute|manage[A-Z]|editOutput|promoteScope|cancel|resume|assign|approveHitl|respondToHitl)$/`,
**except** the four-entry allow-list:

- `settings.update` — platform config (Section 2)
- `registry.update` — platform registry (Section 2)
- `registry.install` — platform registry
- `registry.uninstall` — platform registry

`*.create` is **intentionally excluded from the regex**. Creation does not
destroy existing user data and is needed for tenant-bootstrapping flows. If you
find yourself wanting to add `*.create` to platform_admin for a new resource
type, that is fine; the convention only locks down destructive / mutating
powers on existing user data.

Failure messages should reference this ADR and the bypass convention.

## 8. Audit trail — querying

Every bypass writes a row tagged `metadata.bypass = true`. To list all admin
bypass actions:

```sql
SELECT id, created_at, actor_principal_id, resource_type, resource_id,
       operation, metadata
  FROM audit_events
 WHERE metadata->>'bypass' = 'true'
 ORDER BY created_at DESC;
```

Filter by reason:

```sql
SELECT * FROM audit_events
 WHERE metadata->>'bypass' = 'true'
   AND metadata->>'reason' = 'gdpr_request';
```

Filter by ticket ref (when call site threads it):

```sql
SELECT * FROM audit_events
 WHERE metadata->>'ticketRef' = 'INC-12345';
```

## 9. What this convention does NOT replace

- **Cross-org READ bypasses** (e.g. inline `actor.platformRole === "platform_admin"`
  SQL filters in `src/lib/derived-store-ownership.ts`) — these are reads, not
  writes, and don't require audit rows.
- **Scope guards** like `src/lib/objects-store.ts` write-scope checks — those
  are fail-closed enforcement points, not bypasses.
- **Project scope ratchet** in `src/app/projects/scope-ratchet.ts` — the
  ratchet is a UX rule layered on top of the kernel; it cross-references this
  ADR but is not subject to it.

## 10. Code references

| Concern            | Location                                                                  |
| ------------------ | ------------------------------------------------------------------------- |
| Helper             | `src/lib/authz/admin-bypass.ts`                                           |
| Audit insert       | `src/lib/authz/audit.ts` (`logAuditEventStrict`)                          |
| First call site    | `src/app/projects/admin-actions.ts` (`moderationDeleteProject`)           |
| Invariant test     | `src/lib/authz/__tests__/platform-admin-grants-invariant.test.ts`         |
| Permission catalog | `src/lib/authz/permissions.ts` (with `=== Platform-level ===` / `=== Resource-CRUD ===` section markers) |
| Policy table       | `src/lib/authz/policies.ts` (header references this ADR)                  |
| Scope ratchet      | `src/app/projects/scope-ratchet.ts` (cross-references this ADR)           |

---

## 11. `registry.install` scope-target rules

`registry.install` is the one platform power that ships with **target-scope granularity**. Three roles can install, but each is bounded to specific target levels:

| Role | Allowed target levels |
|------|----------------------|
| `platform_admin` | any (`organization` / `team` / `project`) |
| `org_admin` / `org_owner` | `organization` only |
| `team_admin` | `team` (only the team they admin) — and `project` (when project owner OR co-owner OR team_admin of project's owning team) |
| `member` | none — never granted |

**`org_admin` × `team-target` → `403`.** An `org_admin` who is NOT also `team_admin` of the target team must be denied. This is enforced by the product-specific helper `assertCanInstallAtTarget` inside `installRegistryPackageAtScope` (`packages/agents/src/actions.ts`), NOT by the kernel `enforceResourceAccess` alone — the kernel grants by permission, but install needs target-level constraints the kernel doesn't model.

**Cross-org forgery returns `403` with the same code as deny** — no existence leakage. `assertTargetBelongsToActiveOrg` validates that `target.id` belongs to the active org BEFORE persistence.

**Audit metadata** carries `targetScope: { level, id }` on every install path (allowed + denied + back-compat-wrapper).

**Team-role loader limitation:** the `teamMember` table of Better Auth (the auth server library Cinatra uses) currently has no `role` column, so production `actor.teamRoles` is empty. Until the loader populates team roles, all team-target and team-owned-project installs by non-`platform_admin` actors deny — the picker correctly disables those rows with explainer tooltips.

References:
- Server action: `installRegistryPackageAtScope` in `packages/agents/src/actions.ts`
- UI: `<InstallScopeDialog>` in `packages/agents/src/components/install-scope-dialog.tsx`
- Server-side picker target builder: `buildInstallTargets` in `packages/agents/src/install-targets.ts`
