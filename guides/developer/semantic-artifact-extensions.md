# Authoring Semantic Artifact Extensions

Audience: developers shipping a new `kind:"artifact"` extension.

This guide covers the semantic-artifact contract: the manifest shape,
where the files live, how matcher skills register and run, and what the
runtime does with each field. Read alongside
`references/platform/artifacts.md` for the platform-level model.

## TL;DR

A semantic artifact extension is a metadata-only Cinatra extension
under `extensions/cinatra-ai/<slug>-artifact/` that declares which
representation forms a work-product type accepts + which classification
skills classify it. The platform's matcher runtime queues a large language model (LLM)
classification pass against every artifact whose authoritative MIME
matches the extension's declared `accepts.file.mimeTypes`; the
classifier returns `{matches, confidence}` and the assertion service
writes a `draft` semantic assertion when confidence ≥ threshold.

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
