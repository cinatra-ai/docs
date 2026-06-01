# Artifacts Preflight & Legacy-Media Purge Gate

> Authoritative design: `docs/superpowers/specs/2026-05-17-artifacts-and-file-upload-design.md`.
> This page is the **preflight contract** for artifacts and prompt-window upload implementation. It gates dependent implementation work.

## 1. DB / migration protocol

The artifacts work adds schema for blob metadata, immutable artifact versions, normalized refs, provider-ref cache, audit, and retention. Per repo policy there are **no in-process DB backups** in the app flow; schema lands via `buildCreateStoreSchemaQueries()` / `ensurePostgresSchema()` on dev-server boot and is verified on `main`. Each schema-bearing change MUST:

- Add tables/columns idempotently (`CREATE TABLE IF NOT EXISTS`, additive columns) — never destructive ALTERs on existing shared tables.
- Keep the **hard invariant**: `cinatra.objects.data` (JSONB) never holds file bytes/base64 (see `artifacts.md`).
- Be re-verified against the live `cinatra` schema after integration (not just the worktree's scoped schema).

## 2. Legacy-Media purge gate

The legacy "Media" surface is **removed outright, not migrated**. Conversion of asset-blog/asset-email deliverables is explicitly **deferred to later asset-specific conversion work**. The purge itself is gated here and executed in the storage/surface stages.

### Known legacy-media callers (enumerated — must all be removed/replaced)

| Caller | Location | Disposition |
|---|---|---|
| `SavedMediaRecord` (base64 store) | `packages/asset-blog/src/store.ts` (~L70) | Removed; replaced by `file` artifact + blob storage |
| `saveBlogPostImageToMediaLibrary()` writes `imageBase64` + shadow-writes `@cinatra-ai/asset-blog:saved-media` | `packages/asset-blog/src/store.ts` (~L1097, ~L1126) | Rewired to the artifact service after asset-blog conversion |
| Object-type registration `@cinatra-ai/asset-blog:saved-media` + `/assets/media` nav/URL | `src/lib/register-all-object-types.ts` (~L13, ~L36) | De-registered; route deleted |
| Blog Model Context Protocol (MCP) primitives `blog_media_image_save`, `blog_media_list` | `packages/asset-blog/src/mcp/*` | Superseded by artifact MCP CRUD; kept until asset-blog conversion |
| `/assets/media` page + nav entry | `src/app/assets/media/*`, `src/components/app-sidebar.tsx` | Replaced by `/artifacts` |

### Purge guard (cheap, runnable)

After the surface stage the following must return **no matches** outside this preflight doc and the deferred-conversion work:

```bash
grep -rn "SavedMediaRecord\|/assets/media\|blog_media_" \
  --include='*.ts' --include='*.tsx' src/ packages/ \
  | grep -v 'artifacts-preflight' || echo "PURGE CLEAN"
```

**Scope of the blocking gate:** only the **`/assets/media` surface** (route, nav, plugins-routes mount, the saved-media new-URL map) must be gone at the gate close — verified by `grep -rn "assets/media" src packages | grep -v artifacts-preflight` returning **no matches** (route deleted, nav repointed to `/artifacts`, revalidate path swapped). `SavedMediaRecord` / `blog_media_*` legitimately **remain** until asset-blog deliverable conversion — they are NOT part of the surface gate.

## 3. Implementation dependency invariants

- **Extension-dispatch config-DI + kind-agnostic registry listing** — a systemic gap documented in `artifacts.md` §5a. MUST land **before artifact registry-install / marketplace surface**.
- Threat model + full-fidelity `file` contract **before** any storage code.
- Artifact extension kind + dispatch coherence **before** built-in type extensions.
- Built-in type extensions **before** registry bridge proof of pluggability.
- Adapter → version/ref schema+types → **Graphiti (a knowledge-graph indexer) policy before first write API**.
- Storage+integrity spine **before** service/UI/MCP wrap a complete spine.
- Service is the canonical write path **before** MCP wraps the service, never a second write path.
- Multimodal contract → capability registry → provider adapters; chat upload UI **after** provider adapters.
- Chat path **before** human-in-the-loop (HITL)/run-resume artifact-ref plumbing.

## 4. Out of scope

- asset-blog deliverable conversion (body/image → `file` artifacts).
- asset-email deliverable conversion (attachments/exported bodies → `file` artifacts).
