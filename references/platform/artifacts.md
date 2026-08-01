# Artifacts Architecture, Threat Model & Invariants

> Authoritative design: `docs/superpowers/specs/2026-05-17-artifacts-and-file-upload-design.md`.
> This page is the **binding contract** storage, service, and large language model (LLM) implementations must honor. It should be read before storage work.

## 1. Conceptual model (locked)

- **Artifact** = a self-contained deliverable consumed by being opened/read/edited/published/downloaded/attached. Identity is *content + provenance*, not relations.
- **Data object** = a record whose identity is its relations + operational status (contact, account, list, email record/draft). Not an artifact.
- Artifacts are a **typed projection over `cinatra.objects`** — one ownership/scope/Graphiti (a knowledge-graph indexer) stack — plus dedicated supporting tables (blob metadata, immutable artifact-version, normalized refs, provider-ref cache, audit/retention). **No parallel ownership stack.**
- Artifact **representation forms** (`packages/objects/src/semantic-manifest.ts`): `file`, `dashboard`, `connectorRef`. These are internal substrate shapes — not extension packages. The typed meaning of an artifact is carried by one or more **semantic artifact extensions** (`kind:"artifact"` packages); the set of semantic types is extensible by adding extensions (no core edits).
- Semantic artifact extensions fall into **two categories** — per-connector artifacts packs and connector-independent artifact extensions — governed by an atomicity rule, a per-type mutability class, and a naming grammar. See [§7. Per-connector artifacts extensions](#7-per-connector-artifacts-extensions-the-two-category-catalog).
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

`kind:"artifact"` extensions are **declarative by default** (descriptor: type, representation forms, capabilities, matcher/authoring skills). They MUST NOT contain `cinatra/oas.json` (so WayFlow's agent loader never mounts them) and carry no `register(ctx)` server entry or host ports. The one sanctioned executable surface is an **optional extension-shipped renderer** declared in the versioned `cinatra.artifact.ui` block: the extension owns its type's `detail` / `preview` **view** while core owns dispatch, the shell, and the never-blank floor. That surface stays inside the boundary because a **v1 renderer requests no host ports** — it renders only from a host-supplied, already-access-checked, serializable props snapshot (`src/lib/artifacts/artifact-renderer-props.ts`), and a malformed `ui` block degrades-with-diagnostic at boot (never dropping the type's registration or claims) and is rejected fail-closed at the publish/conformance gate. The `ArtifactExtensionTypeHandler` validates `cinatra.kind:"artifact"` + `@cinatra-ai/<slug>-artifact` naming + absence of `oas.json`; the `ui` block is validated by the leaf schema in `packages/sdk-extensions/src/artifact-contract.ts`. See [Authoring semantic artifact extensions](../../guides/developer/semantic-artifact-extensions.md#shipping-a-renderer--the-cinatraartifactui-block).

## 5a. Extension registry dispatch and listing gap

A systemic extension-registry gap affects artifact registry-install and marketplace surfaces:

> - `ensureConfig()` **throws** when `getAgentPackage()` / `getPublishedExtensionKind()` are called without an explicit `VerdaccioConfig`. The extension install/update/uninstall/archive/restore dispatch in `packages/extensions/src/actions.ts` + `mcp/handlers.ts` calls these *without* config and swallows the throw → `deriveTypeId(null)` → **`"agent"`**. This means **non-agent extension kinds (skill / connector / artifact) are silently mis-dispatched to the agent handler on `main` today**. Fix: load `loadVerdaccioConfigForServer()` once at the server/MCP boundary and thread the resolved `VerdaccioConfig` into `resolveExtensionTypeId` + every `getAgentPackage`/`getPublishedExtensionKind` call. This corrects agent/skill/connector **and** artifact dispatch together.
> - `listAgentPackages()` extracts `agent.json` for every package and drops the rest, so skill/connector/artifact extensions never appear in the registry marketplace listing. Add a kind-agnostic `listExtensionPackages()` summary path that reads `cinatra.kind` from the packument `package.json`, using the agent payload only when `kind === "agent"`. Until then, in-tree built-in artifact extensions (like connectors today) are not registry-listed — an accepted interim.
>
> Scope rationale: this is a registries-wide DI/listing change affecting all extension kinds; treating it as artifact-local would conflate a platform fix with the artifact feature.

The kind-agnostic `resolveExtensionTypeId` / `getPublishedExtensionKind` plumbing is the correct shape; it needs an explicit `VerdaccioConfig` so it resolves instead of falling through to `"agent"`.

## 6. Verification posture (worktree, no live server)

Code-level verification in-worktree: `pnpm typecheck`, package vitest, targeted source greps (invariant guards). Live UAT covers upload→chat→library→MCP, browser, and OAuth flows.

## 7. Per-connector artifacts extensions (the two-category catalog)

Building on the objects-substrate artifact model above, the connector-owned artifact contract defines *which* artifact extensions exist, how they are named, how their rows may change, and the one composition rule. The connector **packs** the catalog names are **not yet shipped**; the **substrate** every pack builds on — the mutability disposition, the claim-only registration mode, the plural-name grammar, and the `objectTypes` claims block — is what this section describes concretely. Where a behavior's enforcing machinery is not yet in place it is called out inline as **not yet shipped**, so nothing here reads as live before it is.

### Two extension categories

A semantic artifact extension is exactly one of two things, and **artifact coverage is always optional per connector** — no connector is required to define artifacts, and none is permanently forbidden them (a pack can be added later if agents need one):

1. **Per-connector artifacts extensions** (`<platform>-artifacts`) claim the typed rows a connector's platform owns — one pack per platform (a connector pair, such as a LinkedIn member connector plus its community connector, shares one pack). The catalog names `email-artifacts`, `linkedin-artifacts`, `wordpress-artifacts`, and `drupal-artifacts` today, with more (`x-artifacts`, `bluesky-artifacts`, `gdrive-artifacts`, …) gated on their connectors in a later wave. These packs land on their own sub-issues and are not yet in the tree.
2. **Connector-independent artifact extensions** — authored deliverables that belong to no connector (the blog trio, brand-voice, contract, marketing docs, screenshot, slide-deck, and the `default-artifact` floor). This is unchanged and remains first-class.

"Gated on a connector" is delivery sequencing only, **never a manifest dependency**: a pack installs and its claims activate even with zero rows before its connector ships (see [§7.4](#74-claims-ship-self-contained-schemas)).

### 7.1 Atomicity — an artifact is never a composition of artifacts

An artifact is **always atomic**. Composition is expressed by *agents defining relationships between atomic artifacts*, never by nesting one inside another:

- **No bundle artifact types.** A multi-part deliverable (for example a Meta ads campaign draft) is one aggregate draft with its parts embedded as plain data — not a parent artifact pointing at child artifacts.
- **Correlation, not containment.** An email *thread* is a relationship over sent/reply records, not an artifact; artifact content never embeds artifact-ID references.
- **Correlation-key fields are soft provenance only.** String fields such as `runId`, `campaignId`, `contactId` may travel on a row as provenance, but they carry **no** foreign-key, cascade, pin, retention, or lifecycle authority. A missing or tombstoned correlation target never changes any read / pin / delete / GC / lifecycle outcome.

### 7.2 Mutability as a claim disposition

Each claimed type declares *how its rows may change* through the optional `mutability` class on its claim disposition (`packages/objects/src/claims.ts`). It is one axis of the disposition; `projection` (`raw | artifact-safe | none` — what a row projects to Graphiti) is the other, orthogonal axis. An absent `mutability` defers to the registering type's own `lifecycle.mutableBy`.

| Class | What it means | Post-create editability |
|---|---|---|
| `draftable` | Cinatra-authored content (a social post draft, an email body). Editable as new revisions *while it is a draft*; once scheduled/published it locks, and publishing is recorded separately — it never rewrites the draft into the third-party entity, and there is no direct draft→published edge. | the type baseline, gated to the draft state |
| `record` | A create-only fact — a sent email, a received reply, a run-scoped delivery-target snapshot. Self-contained and immutable; any post-create update is rejected. | none |
| `external` | A connector-owned pointer to third-party-canonical content (a Google Doc, a WordPress post). Its rows are written only by connector sync and can drift or vanish upstream. | none (agent/user) |

Two invariants ride the disposition itself:

- **`external ⇒ pinnable:false`** — you never pin a live external pointer; pin the immutable snapshot record instead (enforced on the disposition union in `claims.ts`).
- **A mutability class may only *narrow* the type's baseline `mutableBy`, never widen it.** `record` / `external` narrow it to nobody (`effectiveMutableBy` returns `[]`); declaring `draftable` over a fully-immutable type is rejected (`validateMutabilityNarrowsBaseline`). The per-class semantics are documented in `packages/objects/AGENTS.md`.

The disposition vocabulary and the narrowing rule are merged. So is the `external` class's substrate: the reference-state machine (`linked → stale → dangling`, moved only by connector sync — an upstream delete flags `dangling` and never silently tombstones the object row, a later probe re-links it), the bare-identity pointer builder, the http(s)-only open-in-source deeplink resolver, and the snapshot-as-new-artifact / pointer-pin policy are a pure leaf, `packages/objects/src/connector-ref.ts`, that the external packs compose; the connector-sync DB write path and provider rendering ride those (not-yet-shipped) packs.

**Not yet shipped.** The `draftable` *publish* machinery — the schedule→publish state machine with pinned-revision publish receipts (the publication-operation ledger) — is not driven end-to-end. A type may be *classified* `draftable`, but the lock-on-publish transition does not run.

### 7.3 Naming and the `-ref`-free type grammar

- **Plural `-artifacts` for multi-type packs.** A pack that holds — or is expected to grow to — more than one type uses the plural `<platform>-artifacts` suffix; the singular `-artifact` stays valid for a single-type extension. The extension-name validator accepts both forms (`packages/extensions/src/artifact-handler.ts`) and the pnpm workspace includes the plural glob. *(Not yet shipped: the boot-time filesystem discovery scan in `packages/objects/src/integration/register-artifact-extensions.ts` still matches only the singular suffix, so end-to-end auto-discovery of a plural-named directory is a pending follow-on.)*
- **Type ids carry pure entity semantics — no `-ref` suffix.** Delivery form lives in `representation.form` (`file` / `connectorRef` / `dashboard`) and the authority class lives in the claim disposition, so the type id names only *what the thing is* (`gdrive:document`, not `gdrive:document-ref`; `email:sent-email`; `linkedin:post-draft`).
- **An export is always a new artifact.** A PDF exported from a Google Doc is its own independent artifact, never a mutation of the external pointer it came from.

### 7.4 Claims ship self-contained schemas

A per-connector pack declares each row type it owns as an entry in its `cinatra.artifact.objectTypes[]` claims block, and each claim **ships its own JSON Schema** rather than a required dependency on the connector. Consequences:

- Installing a pack never force-installs its connector(s); a pack installed without its connector is *active-but-unbacked* (a `draftable` type may legitimately hold rows before a publisher connector exists).
- Exactly one package remains the runtime registrar for a type — the claimant schema is *activation evidence*, not a second registrar. Cross-repo drift tests pin the claimant JSON Schema to the registering connector's Zod definition.

**Claim-only manifest mode.** Multi-type connector packs register under a third manifest mode — **claim-only** — that mints no generic `<package>:artifact` umbrella and inherits no package-wide matcher/authoring behavior; instead each owned claim is registered as its own first-class artifact type, listable under its exact `objectTypeId` (the registration substrate is in `register-artifact-extensions.ts`). The two classic modes are unchanged: **descriptor-only** (mint the one umbrella) and **hybrid** (umbrella plus per-claim validators, as the `default-artifact` floor uses). *(Not yet shipped: the manifest `mode` field a pack sets to select claim-only is a pending schema handoff — the registration path exists and is exercised through the internal seam, but a pack cannot yet declare `mode` in its own manifest.)*

### 7.5 Retrieved third-party data is never auto-persisted

Data an agent *reads back* from a third party does not silently become an artifact:

- Its **default home is the run transcript** (plus existing domain projections such as the CRM). Nothing is persisted as a typed artifact by default.
- An agent may **opt in** to a typed `record` artifact where a deliverable needs durable evidence.
- The **long tail** is covered by dynamic types plus org-scoped admin approval and the `default-artifact` floor — no dedicated extension per shape.

What is and is not **semantically searchable** follows the projection axis, not the mutability one. Graphiti is a derived, rebuildable *recall* index: a claimed row projects only artifact-safe facets — or nothing at all, `projection:"none"` — so raw payloads never enter graph memory. Searching or filtering on the raw `data.*` fields is a Postgres concern served by an indexed query seam, not by Graphiti recall.
