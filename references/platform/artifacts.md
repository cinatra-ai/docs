# Artifacts Architecture, Threat Model & Invariants

> Authoritative design: `docs/superpowers/specs/2026-05-17-artifacts-and-file-upload-design.md`.
> This page is the **binding contract** storage, service, and large language model (LLM) implementations must honor. It should be read before storage work.

## 1. Conceptual model (locked)

- **Artifact** = a self-contained deliverable consumed by being opened/read/edited/published/downloaded/attached. Identity is *content + provenance*, not relations.
- **Data object** = a record whose identity is its relations + operational status (contact, account, list, email record/draft). Not an artifact.
- Artifacts are a **typed projection over `cinatra.objects`** — one ownership/scope/Graphiti (a knowledge-graph indexer) stack — plus dedicated supporting tables (blob metadata, immutable artifact-version, normalized refs, provider-ref cache, audit/retention). **No parallel ownership stack.**
- Artifact **representation forms** (`packages/objects/src/semantic-manifest.ts`): `file`, `dashboard`, `connectorRef`. These are internal substrate shapes — not extension packages. The typed meaning of an artifact is carried by one or more **semantic artifact extensions** (`kind:"artifact"` packages); the set of semantic types is extensible by adding extensions (no core edits).
- **Context** = artifacts in their input-binding role: the set of artifact references an agent run consumes as grounding input, version-pinned at selection time. Context is not a separate substance and not its own extension kind. A consuming agent declares typed `contextSlots` on its Open Agent Specification (OAS), including which artifact extension types each slot accepts, and the built-in `@cinatra-ai/context-selection-agent` (a `kind:"agent"` extension) resolves each slot at run time against the ownership chain. See [Agent context slots](../../guides/developer/context-slots.md).

## 2. Hard invariants (BLOCKING — enforced by tests/greps)

1. **No bytes in `objects.data`.** `cinatra.objects.data` (JSONB) holds metadata + normalized refs only — never file bytes, base64, or blob content. Blob bytes live only in the blob store; the object row carries `{ artifactType, latestVersionId, digest, mime, size, originKind, … }`.
2. **Full-fidelity `file` model from the first implementation — never an upload-only blob.** The `file` artifact model MUST support, from day one:
   - stable artifact id (survives every version);
   - immutable versions, each with a content digest (sha256) + blob ref;
   - MIME-driven viewer hint;
   - `origin.kind` ∈ `upload | email_attachment | agent_generated | external_link | live_generator`;
   - arbitrary `parent_id` / `parent_type` (e.g. attachment → email object);
   - run / message / provider provenance;
   - editable text/markdown body (not only opaque binary);
   - generated-image variants;
   - publication / reference metadata (published?, editable?, referenced-by).
3. **Tenant/version-scoped blob identity.** Physical sha256 dedupe is internal only — never exposed and never used for authorization or cross-tenant existence inference. Blob lookup is always scoped by `org_id` + artifact-version.
4. **One canonical write path.** The artifact **service layer** is the only writer. Library UI and Model Context Protocol (MCP) CRUD call the service — never a second write path, never raw blob/object writes.
5. **Immutable, replay-safe refs.** A message/run `ArtifactRef` pins a specific version + digest. Referenced artifacts are tombstone-deleted, never hard-deleted; a referenced version's bytes are retained.
6. **LLM orchestration is the sole file consumer.** WayFlow (Cinatra's OAS Flow agent runtime) never consumes files. The prompt window attaches an artifact *ref*; resolution + provider upload/attach happens only in `@cinatra-ai/llm` via `/api/llm-bridge`.

## 3. Threat model

| Threat | Vector | Mitigation |
|---|---|---|
| Cross-tenant file disclosure | global sha dedupe / unscoped blob path / predictable URLs | tenant+version-scoped blob identity; authz on every serve; signed/internal URLs |
| Stored-XSS / drive-by | serving HTML/SVG/PDF inline as active content | `Content-Disposition: attachment` for non-safe types, strict CSP, MIME sniffing, no-exec storage path |
| Path traversal / RCE on upload | crafted filename / archive | server-generated storage keys, never client filename on disk; extension allow/deny; size cap; malware-scan hook point |
| Secret/data exfiltration into graph memory | Graphiti projector serializes full `objects.data` | metadata/excerpt-only projection policy lands before the first artifact write |
| Privilege escalation via artifact ownership | reassigning owner to widen access | promote-only ratchet; reassignment = explicit audited transfer; narrowing conservative if referenced |
| Replay/audit gap | hard-deleting a referenced artifact | tombstone + retention + audit log on create/delete/transfer/promote |
| Model hallucinating file access | non-ingestible type silently dropped | structured "attached, not directly readable" manifest delivered to the model |
| Unbounded provider re-upload / cost | re-uploading the same blob each turn | provider-ref cache keyed by artifact-version + provider, with GC |

## 4. `ArtifactRef` (normalized, immutable)

```
ArtifactRef = {
  artifactId: string        // stable across versions
  versionId:  string        // pinned, immutable
  digest:     string        // sha256 of the pinned version's bytes
  mime:       string
  originKind: 'upload' | 'email_attachment' | 'agent_generated' | 'external_link' | 'live_generator'
}
```

Stored in normalized storage (refs table); chat-thread JSON may carry a *projection/cache* of the ref, never the canonical record, never bytes.

## 5. Extension-kind security

`kind:"artifact"` extensions are **declarative by default** (descriptor: type, representation forms, capabilities, matcher/authoring skills). They MUST NOT contain `cinatra/oas.json` (so WayFlow's agent loader never mounts them) and carry no `register(ctx)` server entry or host ports. The one sanctioned executable surface is an **optional extension-shipped renderer** declared in the versioned `cinatra.artifact.ui` block (epic [#1620](https://github.com/cinatra-ai/cinatra/issues/1620) S1/S2): the extension owns its type's `detail` / `preview` **view** while core owns dispatch, the shell, and the never-blank floor. That surface stays inside the boundary because a **v1 renderer requests no host ports** — it renders only from a host-supplied, already-access-checked, serializable props snapshot (`src/lib/artifacts/artifact-renderer-props.ts`), and a malformed `ui` block degrades-with-diagnostic at boot (never dropping the type's registration or claims) and is rejected fail-closed at the publish/conformance gate. The `ArtifactExtensionTypeHandler` validates `cinatra.kind:"artifact"` + `@cinatra-ai/<slug>-artifact` naming + absence of `oas.json`; the `ui` block is validated by the leaf schema in `packages/sdk-extensions/src/artifact-contract.ts`. See [Authoring semantic artifact extensions](../../guides/developer/semantic-artifact-extensions.md#shipping-a-renderer--the-cinatraartifactui-block).

## 5a. Extension registry dispatch and listing gap

A systemic extension-registry gap affects artifact registry-install and marketplace surfaces:

> - `ensureConfig()` **throws** when `getAgentPackage()` / `getPublishedExtensionKind()` are called without an explicit `VerdaccioConfig`. The extension install/update/uninstall/archive/restore dispatch in `packages/extensions/src/actions.ts` + `mcp/handlers.ts` calls these *without* config and swallows the throw → `deriveTypeId(null)` → **`"agent"`**. This means **non-agent extension kinds (skill / connector / artifact) are silently mis-dispatched to the agent handler on `main` today**. Fix: load `loadVerdaccioConfigForServer()` once at the server/MCP boundary and thread the resolved `VerdaccioConfig` into `resolveExtensionTypeId` + every `getAgentPackage`/`getPublishedExtensionKind` call. This corrects agent/skill/connector **and** artifact dispatch together.
> - `listAgentPackages()` extracts `agent.json` for every package and drops the rest, so skill/connector/artifact extensions never appear in the registry marketplace listing. Add a kind-agnostic `listExtensionPackages()` summary path that reads `cinatra.kind` from the packument `package.json`, using the agent payload only when `kind === "agent"`. Until then, in-tree built-in artifact extensions (like connectors today) are not registry-listed — an accepted interim.
>
> Scope rationale: this is a registries-wide DI/listing change affecting all extension kinds; treating it as artifact-local would conflate a platform fix with the artifact feature.

The kind-agnostic `resolveExtensionTypeId` / `getPublishedExtensionKind` plumbing is the correct shape; it needs an explicit `VerdaccioConfig` so it resolves instead of falling through to `"agent"`.

## 6. Verification posture (worktree, no live server)

Code-level verification in-worktree: `pnpm typecheck`, package vitest, targeted source greps (invariant guards). Live UAT covers upload→chat→library→MCP, browser, and OAuth flows.
