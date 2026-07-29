# Authoring Semantic Artifact Extensions

Audience: developers shipping a new `kind:"artifact"` extension.

This guide covers the semantic-artifact contract: the manifest shape,
where the files live, how matcher skills register and run, and what the
runtime does with each field. Read alongside
`references/platform/artifacts.md` for the platform-level model.

## TL;DR

A semantic artifact extension is a Cinatra extension under
`extensions/cinatra-ai/<slug>-artifact/` that declares which
representation forms a work-product type accepts and which classification
skills classify it. The platform's matcher runtime queues a large language model (LLM)
classification pass against every artifact whose authoritative MIME
matches the extension's declared `accepts.file.mimeTypes`; the
classifier returns `{matches, confidence}` and the assertion service
writes a `draft` semantic assertion when confidence ≥ threshold.

An artifact extension is **declarative by default** — it ships no
`register(ctx)` server entry, and most artifact extensions never write a
line of runtime code. But it MAY additionally **ship its own detail /
preview renderer** through the versioned `cinatra.artifact.ui` block: the
extension owns its type's *view*, while core owns *dispatch*, the artifact
*shell*, and the never-blank fallback *floor*.
Shipping a renderer is opt-in — omit the `ui` block and the type renders
with the host's generic renderer, exactly as before. See
[Shipping a renderer — the `cinatra.artifact.ui` block](#shipping-a-renderer--the-cinatraartifactui-block).

## File layout

```
extensions/cinatra-ai/<slug>-artifact/
├── package.json                       ← cinatra.kind:"artifact" + manifest
├── src/index.ts                       ← typed manifest export (mirror of package.json)
└── skills/
    └── <slug>-matcher/
        └── SKILL.md                   ← bytes-only classifier prompt
```

The `<slug>` is the extension's package-name slug — e.g.
`marketing-icp-artifact` for `@cinatra-ai/marketing-icp-artifact`.

## Manifest shape

`package.json` declares:

```json
{
  "name": "@cinatra-ai/<slug>-artifact",
  "version": "0.1.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "cinatra": {
    "apiVersion": "cinatra.ai/v1",
    "kind": "artifact",
    "artifact": {
      "accepts": {
        "file": { "mimeTypes": ["text/markdown", "application/pdf"] }
      },
      "skills": {
        "matchers": ["@cinatra-ai/<slug>-artifact:<slug>-matcher"]
      },
      "matcherConfidenceThreshold": 0.7
    }
  }
}
```

Mirror the same manifest in `src/index.ts` as a typed export — the
pack-parity test in `packages/objects/src/__tests__/seed-pack-*.test.ts`
gates the two against drift:

```typescript
import type { SemanticArtifactManifest } from "@cinatra-ai/sdk-extensions";

export const <camelSlug>ArtifactManifest: SemanticArtifactManifest = {
  accepts: { file: { mimeTypes: ["text/markdown", "application/pdf"] } },
  skills: { matchers: ["@cinatra-ai/<slug>-artifact:<slug>-matcher"] },
  matcherConfidenceThreshold: 0.7,
};
```

### `accepts.file.mimeTypes` — what the matcher sees

Declare ONLY MIME types the LLM attachment capability registry
supports. The supported set is `text/markdown`, `text/plain`,
`application/pdf`, `image/png`, `image/jpeg`, `image/webp`. Unsupported
MIME (e.g. `text/html`, `application/vnd.openxmlformats-…`, `.docx`)
are out of scope until the capability registry expands.

The pack-test capability guard validates every declared MIME against
`resolveAttachmentCapability` for representative OpenAI / Anthropic /
Gemini models. Add an unsupported MIME and the test fails closed.

### `skills.matchers[0]` — the FULL catalog id

The matcher skill id MUST be the full
`<packageName>:<skillDirSlug>` produced by slice-5a's
`deriveSkillRegistration`. A bare slug WILL NOT RESOLVE at runtime:

```
✗ "marketing-icp-matcher"
✓ "@cinatra-ai/marketing-icp-artifact:marketing-icp-matcher"
```

`<skillDirSlug>` is the on-disk directory name under `skills/`. Stick
to the convention `<slug-without-artifact>-matcher` to keep the
contract pinnable.

### `matcherConfidenceThreshold` — when to assert

Default: `0.7`. The matcher runtime asserts ELIGIBILITY only when the
classifier's returned confidence ≥ this value. Tune per-extension only
when there's evidence the default is too low / high. Higher = fewer
false positives + more default-floor rows; lower = more drafts
generated.

Note: ALL matcher-asserted rows land as `draft` state per
review-task-actions.ts:255's precedence. The user-confirmation flip
draft → eligible lives in the Stage F library UI (follow-on slice).

## Matcher SKILL.md

`skills/<slug>-matcher/SKILL.md` is the LLM classifier's SYSTEM
PROMPT. The runtime supplies the USER prompt
("Classify the attached artifact. Decide whether it is a
\"<packageName>\" work product. Respond ONLY with JSON: …") plus the
attachment as the resource bytes.

Required frontmatter + body shape:

```markdown
---
name: <slug>-matcher
description: Classifies an attached resource as a <type-label>.
---

You are a strict semantic classifier for <domain>.

The user prompt asks whether the attached resource is a
`@cinatra-ai/<slug>-artifact` work product — a **<type-label>**.

## What a <type-label> document IS

[bullet list of canonical structural cues — section headings, content
shape, length, terminology]

## What a <type-label> document is NOT (return `matches:false`)

[bullet list of look-alike types, with cross-references to their
respective artifact extensions]

## Confidence guidance

- 0.85–0.95 — strongest cues present (heading + ≥3 IS-categories).
- 0.70–0.84 — clear framing missing one element.
- 0.50–0.69 — borderline.
- < 0.50 — clearly NOT a match.

## Output contract

Respond with JSON ONLY, no markdown wrapper:

```json
{ "matches": <boolean>, "confidence": <number 0..1>, "rationale": "<short explanation>" }
```
```

Bytes-only classification: the LLM sees the resource content but NOT
filename / parent metadata / lifecycle state. Distinctions that depend
on those signals (e.g. `email-draft` vs `email-body`) must be handled
via PRODUCER-asserted paths instead of bytes-only matchers.

## Workspace registration

`extensions/cinatra-ai/*-artifact/` is in `pnpm-workspace.yaml`. After
adding a new artifact extension, run `corepack pnpm install` and the
package is picked up by:

1. Boot scan (`extensions-dev-watcher.ts`) — registers the matcher
   skill into the catalog via `registerColocatedWorkspaceSkills`.
2. Object-registry bridge — registers the manifest as a semantic
   artifact descriptor on `objectTypeRegistry`.
3. Matcher runtime — queues a classification pass against any
   incoming resource whose authoritative MIME matches.

## Shipping a renderer — the `cinatra.artifact.ui` block

Declaring representation forms + a matcher makes the platform *recognize*
your type. To also make it *look* like your type — a purpose-built detail
view instead of the host's generic renderer — ship a renderer through the
versioned `cinatra.artifact.ui` block. This block is **optional**: omit it
and the type renders generically, exactly as a declarative-only extension
always has.

The boundary this restores: **core owns dispatch, the artifact shell, and
the never-blank floor; the extension owns its type's view.** Before this
block, every new artifact type's UI meant a core PR — core accreted
per-type UI knowledge. Now the view ships from the type's own package.

### The `ui` block shape (v1)

```jsonc
"cinatra": {
  "kind": "artifact",
  "apiVersion": "cinatra.ai/v1",
  "artifact": {
    "accepts": { "file": { "mimeTypes": ["application/pdf"] } },
    "skills": { "matchers": ["@cinatra-ai/<slug>-artifact:<slug>-matcher"] },
    "ui": {
      "abiVersion": 1,
      "sdkAbiRange": "^2.4.0",
      "renderers": {
        "detail":  { "entry": "./src/renderers/detail.tsx",  "propsApiVersion": 1 },
        "preview": { "entry": "./src/renderers/preview.tsx", "propsApiVersion": 1, "representations": ["application/pdf"] }
      }
    }
  }
}
```

- **`abiVersion`** — the `ui`-block ABI, distinct from the SDK ABI.
  Exactly `1` in v1; a future v2 is an additive, versioned migration. The
  canonical schema is `packages/sdk-extensions/src/artifact-contract.ts`.
- **`sdkAbiRange`** — **GENERATED (never hand-picked).** It pins the host
  ABI range the renderer was built against (a caret range admitting the
  build ABI and every later compatible minor). There is exactly one correct
  value — `^<the canonical SDK ABI you built against>` — and the conformance
  gate rejects any other. The opt-in scaffolder ui template (S4) emits it for
  you; until then, copy that single canonical value rather than inventing one.
- **`renderers`** — a **non-empty partial map** over the closed v1 slot
  enum: `detail` (the artifact detail view) and `preview` (the neutral
  inline-preview capability reused by in-core preview sites). Declare any
  non-empty subset (e.g. `detail` only). Slots `listRow` / `card` /
  `inline` are **reserved** for later waves and rejected in v1; the HITL
  field-renderer and chat renderable-view systems are separate channels,
  not slots of this enum.
- Each renderer is `{ entry, propsApiVersion, representations? }` and
  **nothing else**. The schema is `.strict()`: **a v1 renderer requests NO
  host ports.** Any extra key (a `ports` / `requestedHostPorts` request, or
  any other field) is rejected — a read-only renderer port is out of scope
  pending an ABI-major process.
  - **`entry`** — a package-relative, path-contained subpath (`"./…"`, no
    `".."`, no absolute path or URL) that resolves to a real file and ships
    inside the published `files` allowlist (or the tarball omits it). The
    conformance gate checks containment + file resolution + `files` inclusion;
    an `exports` subpath mapping is recommended for a stable import but is not
    itself required.
  - **`propsApiVersion`** — the props-contract version the renderer expects
    (an integer ≥ 1; the current props ABI is `1`). The host refuses to
    mount a renderer whose expected version the supplied snapshot does not
    satisfy.
  - **`representations`** — optional non-empty array of MIME patterns this
    slot renders (e.g. `["application/pdf"]`).

### The renderer contract (RSC, no ports, serializable props)

A renderer is a **React Server Component module with a default export**.
It receives ONE argument: a versioned, normalized, **serializable** props
snapshot (`ArtifactRendererProps`, props ABI `1`), assembled host-side
*after* the host has already access-checked the row. The snapshot carries
plain JSON only — row metadata, the resolved representation, host-authorized
preview/download URLs, the resolved effective identity, and sanctioned
actions as navigational **hrefs**. Its canonical shape is
`src/lib/artifacts/artifact-renderer-props.ts`. The versioned props **type** is
re-exported for extensions by the SDK **as of the first renderer wave (S4)** —
until S4 lands, the SDK export is not yet published, so the scaffolder's
renderer stub (which lands in the same wave) is the source of the exact import;
do not hand-guess a subpath:

```tsx
// ./src/renderers/detail.tsx  — the scaffolder wires the props-type import.
export default function ContractDetail({ artifact, urls, actions }) {
  return (
    <article>
      <h1>{artifact.title ?? "Untitled contract"}</h1>
      {urls.preview ? <iframe src={urls.preview} title="preview" /> : null}
      {actions.download ? <a href={actions.download}>Download</a> : null}
    </article>
  );
}
```

The v1 props snapshot fields: `artifact` (id, title, objectType, mime,
size, timestamps, ownerLevel, visibility, sourceUrl), `representation`
(`{revisionId, mime}` or null), `urls` (`preview`, `download` — already
access-checked), `identity` (the flattened effective identity), and
`actions` (`download`, `openInSource` as hrefs). Nothing else crosses.

- **v1 renderers request no host ports** — the renderer runs *only* from
  this host-supplied authorized snapshot. Non-serializable host context (DB
  handles, the request, server-action closures over `ctx`) NEVER crosses
  the boundary. The renderer may run as a client component, so the
  RSC→client serialization boundary must hold; the host pins this. Actions
  are host-authorized links, never closures.
- **UI primitives are vendored, not imported from the host.** Compose with
  your package's *vendored* copies of the `@cinatra-ai` shadcn primitives
  (relative imports into your own tree) and never reach into host internals
  or pull an ad-hoc UI library. See [The `@cinatra-ai` design registry](#the-cinatra-ai-design-registry-vendored-primitives).

### Failure isolation and "requires rebuild"

Renderers are **build-known**, wired through a generated literal-import map
(`src/lib/generated/artifact-renderers.ts`) resolved by the S2 dispatch spine
(`src/lib/artifacts/artifact-renderer-loader.ts`) — the same generated-map
pattern the connector `bundled-react` setup pages already use. Two
consequences:

- **Until your extension is in the base image build, its renderer is not
  wired.** A runtime-installed claimant that is not yet in the build renders
  **generically**, with a **"requires rebuild"** indicator — the type is
  never blank and never errors; it just falls back to the generic view until
  the next image includes it.
- **Two-tier failure isolation.** A pre-render failure (module absent,
  missing default export, props-ABI mismatch, or a key that crossed the
  repeat-failure quarantine threshold) degrades to the generic renderer plus
  a **sanitized** diagnostic (package + slot + failure class only — never a
  raw error or a manifest value). A render-time throw is caught by the
  route-segment error boundary; a renderer that keeps throwing is
  quarantined and renders generically until restart. **The floor is never
  blank.**

### The publish / conformance gate

`cinatra.artifact.ui` is validated **fail-closed at publish** by the
extension-repo conformance gate (`scripts/extensions/conformance-gate.mjs`,
`checkArtifactUi`) and **degraded-with-diagnostic at boot** — a malformed
`ui` never rejects the whole manifest or drops your type registration /
`objectTypes` claims; it only drops the renderer. The gate asserts:
`abiVersion` is exactly `1`; `sdkAbiRange` equals the generated value;
`renderers` is a non-empty map over `{detail, preview}` (reserved slots
rejected); each `entry` is contained, resolves to a file, and ships in
`files`; `propsApiVersion` is an integer ≥ 1; and no extra key (a port
request) is present. Reproduce it locally with `node
extension-kind-gate.mjs --package-root .` and the conformance run before you
push.

### The `@cinatra-ai` design registry (vendored primitives)

Renderers do not consume the host's UI package directly. Cinatra publishes
its shadcn design primitives as the `@cinatra-ai` registry — built from
`registry.json` into `public/r/*.json` by
`scripts/extensions/build-design-registry.mjs` and served flat at
`/r/{name}.json`. The registry is consumed **at authoring time** with the
**pinned** shadcn CLI (`pnpm dlx shadcn@4.8.2 add …`), never `@latest`;
`scripts/extensions/vendor-extension-primitives.mjs` vendors the primitives
into the extension's own tree so the renderer imports them by relative path.
Consumption is dev/build-time only — the app never fetches the registry at
runtime. Declaring your OWN `registryItems` — publishing presentational
components to the shared registry so other extensions can vendor them the same
way — is a separate capability with its own contract: see
[Authoring shadcn registry items](authoring-registry-items.md).

## Producer-asserted artifacts (no matcher)

Some artifact types are intentionally NOT classified from bytes (e.g.
`blog-image-artifact` — bytes don't carry blog-attachment context).
For these:

1. Ship the manifest WITHOUT `skills.matchers[0]`.
2. The producing agent / upload route calls `createSemanticArtifact`
   with `createdByRunId` set; the producer-assertion path reads the
   agent extension's `cinatra.produces` field and writes the eligible
   assertion at create-time.
3. The agent extension declares `cinatra.produces: [{ extension }]`
   in its `package.json`.

The producer-asserted flow is end-to-end: manifests may omit matcher
skills, and producer paths create eligible assertions using declared
`cinatra.produces` metadata.

## Per-connector artifacts packs

A second authoring path exists alongside the single-type, matcher-classified
extension above: a **per-connector artifacts pack** that claims the typed rows
a connector's platform owns. The full architecture — the two categories, the
atomicity rule, the mutability classes, and the naming grammar — is the
[Artifacts architecture §7](../../references/platform/artifacts.md#7-per-connector-artifacts-extensions-the-two-category-catalog);
this section is the authoring-facing summary of what a manifest can declare.
Where a capability is not selectable from a manifest, that limit is called out
inline with the section it belongs to.

### Which category are you building?

- **A per-connector artifacts pack** (`<platform>-artifacts`) when the types are
  the rows a connector platform owns — one pack per platform, claiming each row
  type as a `cinatra.artifact.objectTypes[]` entry. Coverage is always optional:
  a connector needs no pack, and a pack can be added later.
- **A connector-independent artifact extension** (the single-type shape the rest
  of this guide covers) for an authored deliverable that belongs to no connector
  — a blog post, an ICP document, a contract.

### Plural `-artifacts` naming

A pack that holds — or will grow to — more than one type uses the plural
`@cinatra-ai/<platform>-artifacts` suffix; the singular `-artifact` stays valid
for a single-type extension. The name validator
(`packages/extensions/src/artifact-handler.ts`) accepts both, and the pnpm
workspace includes the plural glob. **Not yet shipped:** the boot-time
filesystem discovery scan in
`packages/objects/src/integration/register-artifact-extensions.ts` still matches
only the singular suffix, so a plural-named directory is not auto-discovered
end-to-end yet — the naming is accepted, the discovery widening is a pending
follow-on.

### Claim each type with a self-contained schema and a mutability class

Each row type the pack owns is a `cinatra.artifact.objectTypes[]` claim that
**ships its own JSON Schema** rather than a required dependency on the connector
— installing a pack never force-installs its connector, and a pack installed
without its connector is active-but-unbacked. Each claim carries a `dispositions`
payload, and that payload's optional `mutability` class is **authorable today**
(`packages/objects/src/claims.ts`):

- `draftable` — Cinatra-authored, editable while a draft then locked (a post
  draft, an email body);
- `record` — create-only and immutable (a sent email, a received reply);
- `external` — a connector-owned pointer to third-party content; its rows are
  connector-sync-written and **must** declare `pinnable:false` (pin the snapshot
  record, not the live pointer).

A class may only *narrow* the registering type's baseline `mutableBy`, never
widen it. Type ids carry pure entity semantics with **no `-ref` suffix**
(`gdrive:document`, not `gdrive:document-ref`) — delivery form lives in
`representation.form`. The per-class semantics and invariants are in
`packages/objects/AGENTS.md`.

The `external` reference machinery (`linked → stale → dangling` plus
snapshot-as-new-artifact and the `pinnable:false` pointer policy) is a shipped
substrate leaf, `packages/objects/src/connector-ref.ts`, that the external packs
compose. The `draftable` publish ledger — the schedule→publish state machine
and its lock-on-publish — is not driven end-to-end: you can classify a type
`draftable`, but the publish transition does not run.

### Claim-only mode is substrate-ready, not yet author-selectable

A multi-type connector pack is designed to register in **claim-only** mode — no
generic `<package>:artifact` umbrella; each owned claim is surfaced under its
exact `objectTypeId`. The registration substrate is in place, but **the
manifest `mode` field that selects it is not yet in the schema** — do not add a
`mode` key to a manifest yet (a strict parse rejects it). Until the field lands,
authored packs resolve to the classic descriptor-only / hybrid behavior.

### Atomicity — do not compose artifacts

An artifact is always atomic. Never model a multi-part deliverable as a parent
artifact referencing child artifacts: embed the parts as plain data in one
aggregate draft, and express cross-artifact relationships with correlation-key
string fields (`runId`, `campaignId`) that are **soft provenance only** — no
foreign-key, cascade, pin, retention, or lifecycle authority. An export (a PDF
from a Google Doc) is always a new, independent artifact.

## Validation checklist

Before shipping a new artifact extension:

- [ ] `package.json` + `src/index.ts` byte-equal on the manifest block.
- [ ] `skills.matchers[0]` is the FULL `<packageName>:<skillDirSlug>` form.
- [ ] Every declared MIME passes `resolveAttachmentCapability` for
      OpenAI + Anthropic + Gemini probe models.
- [ ] `matcherConfidenceThreshold` is in `(0, 1]`.
- [ ] No `connectorRef` / `dashboard` / `templates` / `satisfies` /
      `agentDependencies` unless that subset is explicitly needed
      (Stage D ships none of these in the seed packs).
- [ ] SKILL.md frontmatter: `name` matches the dir slug;
      `description` is a one-sentence summary.
- [ ] SKILL.md body: IS / IS-NOT / confidence-guidance / output-contract.
- [ ] Pack test (`packages/objects/src/__tests__/seed-pack-*.test.ts`)
      pins the manifest shape + catalog-id format + capability guard.

## Cross-references

- `references/platform/artifacts.md` — platform-level data model
- `guides/developer/context-slots.md` — how `contextSlots` consume your extension
- Working examples: `extensions/cinatra-ai/marketing-icp-artifact/`,
  `extensions/cinatra-ai/blog-post-artifact/`,
  `extensions/cinatra-ai/contract-artifact/`
