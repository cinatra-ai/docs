# Artifacts: LLM attachments + prompt-window file upload

> **Status:** Prompt-window attachment wiring is implemented.
> Core artifacts system: see [`artifacts.md`](./artifacts.md)
> and [`artifacts-preflight.md`](./artifacts-preflight.md).

This document is the cross-cutting reference for how artifact refs flow
from the prompt window through the large language model (LLM) orchestration layer, the bridge,
chat persistence, and agent-to-agent (A2A) protocol agent-run resume. It is the operator/dev
contract — read this when adding a new LLM caller, a new provider, a new
prompt-window consumer, or a new resume path.

## Invariants

These hold throughout the attachment path. **Never break any of them
without explicit review and a planned cutover.**

1. **Byte-identical default behavior.** Every caller that omits
   `attachments`, `resolvedAttachments`, `attachmentResolverPorts`, and
   `user_envelope` MUST observe a request body indistinguishable
   from the prior behavior. The optionality of every new field on
   `LlmMessage`, `GenerateInput`, `StreamInput`, `OrchestrateGenerateInput`,
   `OrchestrateStreamInput`, `DeterministicLlmExecutionInput`, and the
   bridge `RequestSchema` is the load-bearing guarantee.

2. **Decision A — never silently drop.** A non-ingestible attachment OR
   an attachment-carrying turn with no resolver ports OR a per-attachment
   resolver failure is NEVER silently dropped. The orchestration entry
   resolver prepends a `[ATTACHMENTS …]` manifest to the system prompt
   so the model knows the file exists and why it cannot read it.

3. **Resolver ports are INTERNAL.** `resolvedAttachments` is set by the
   orchestration entry points from `resolveAttachments()`. A caller NEVER
   provides it. The public `OrchestrateGenerateInput` /
   `OrchestrateStreamInput` are `Omit<…, "resolvedAttachments">` and the
   entry impls additionally runtime-strip a smuggled field via cast.

4. **Cross-tenant safety.** Bridge resolver ports are built ONLY from a
   run resolved via the auth-injected `x-cinatra-a2a-context-id` header.
   A caller-supplied `body.agent_run_id` cannot select the tenant
   namespace. If both context and body resolve, they MUST match. Without
   request-bound ports → ports stay undefined → entry resolver degrades
   to the Decision-A manifest.

5. **A2A messages stay text-only.** Artifact refs that round-trip through
   the agent-run resume path ride INSIDE the text content of a single
   A2A part as a JSON envelope `{text, attachments?}` — never as native
   file parts.

6. **`llm-orchestration` stays `@/lib`-free** in `attachments/` and
   `providers/`. All app-side dependencies (cache, blob store, provider
   upload, run lookup) are injected via the `AttachmentResolverPorts`
   contract. `rg "from ['\"]@/lib"` in those directories must stay empty.

7. **`generateWithFileInput` is untouched.** The single-file asset-blog
   path is unrelated and must stay unchanged.

## Flow

### Prompt → LLM (chat + bridge)

```
PromptField.onAttachmentsChange → ChatMessage.attachments[]
        │
        ▼
chat-page.tsx strips API messages WITH attachments forwarded
        │
        ▼
/api/chat POST → runner.runChatTurn
        │  builds chat-side AttachmentResolverPorts(sessionOrgId)
        │  resolves per-message attachments → stamps resolvedAttachments
        ▼
stream(provider, system, messages, ...)
        │
        ▼
adapter.stream({system, messages, tools, resolvedAttachments?, ...})
        │  (provider-parts.ts: resolvedAttachmentsPerMessage)
        ▼
provider-native parts emitted on the LAST user turn (or per-message
  when each user message carries its own resolvedAttachments)
```

```
WayFlow / Python container → /api/llm-bridge POST
  body: {user, user_envelope?, attachments?, agent_run_id?, …}
        │
        │  runFromContext = readAgentRunByContextId(x-cinatra-a2a-context-id)
        │  runForPorts = runFromContext (mismatch with body.agent_run_id → null)
        │
        │  envelope = parseUserEnvelope(body.user, body.user_envelope === true, body.attachments)
        │    enabled=false: text VERBATIM; enabled=true: strict-parse or 400
        │
        │  if envelope.attachments && runForPorts.orgId:
        │    attachmentResolverPorts = buildBridgeAttachmentResolverPorts({orgId})
        ▼
runResolvedSkillAwareDeterministicLlmTask({
  user: envelope.text,
  attachments?: envelope.attachments,
  attachmentResolverPorts?: …,
})
        │
        ▼
resolveEntryAttachments → resolveAttachments (port-driven cache+upload)
                       → maps readable → resolvedAttachments
                       → prepends manifest for non-readable refs
        ▼
adapter.generate({system: resolved.system, prompt, resolvedAttachments?, …})
```

### A2A agent-run resume (HITL approval)

```
HITL approval form → values.userResponse = JSON.stringify({text, attachments?})
        │
        ▼
approveReviewTaskInternal:
  resumeText = userResponseRaw  (verbatim)
  submittedValues = JSON.parse(userResponseRaw)
  sendTask({message: {parts: [{kind:"text", text: resumeText}]}, …})
        │   ↑ A2A text-only invariant (one text part, no file parts)
        ▼
WayFlow forwards body.user = resumeText to /api/llm-bridge
       WAYFLOW MUST ALSO SET body.user_envelope = true if it wants the
       bridge to extract the embedded {text, attachments}. Without that
       flag the bridge ships the JSON string VERBATIM to orchestration —
       byte-identical default behavior, NOT a bug.
```

### Email-attachment provenance

```
inbound email handler (future) → for each MIME attachment:
  await createUploadedArtifact({
    orgId, createdBy, stream, maxBytes, declaredMime, title,
    originKind: "email_attachment",
    parentId: <email object id>,
    parentType: "email",
  })
```

No new artifact type, no new enum value — both fields already exist on
`WriteUploadedArtifactInput`. The `ArtifactOriginKind` enum is shared
structurally between `@cinatra-ai/artifacts` and `@cinatra-ai/llm`
so an email-attached file resolved into a later LLM turn keeps its origin
tag end-to-end.

## Per-provider native emission

| Provider | nativeKind | `providerFileId` is… | Emitted as |
|---|---|---|---|
| OpenAI | `openai_input_file` | Files API `file_id` | `{ type: "input_file", file_id }` |
| Anthropic | `anthropic_document` | Files API `file_id` | `{ type: "document", source: { type: "file", file_id } }` (`files-api-2025-04-14` beta gate; ONLY when document parts present) |
| Gemini | `gemini_file_data` | the file **URI** (NOT the resource `name`) | `{ fileData: { mimeType, fileUri } }` — emitting the resource name silently fails |

The capability registry per-provider gates each candidate by `mime` +
`size`. Non-ingestible → manifest. Anthropic's `betas` array also lists
`MCP_CLIENT_BETA` when native Model Context Protocol (MCP) is on; the two betas combine.

## Resolver ports contract

```ts
export type AttachmentResolverPorts = {
  cacheGet(ref, provider): Promise<string|null> | string|null;
  providerUpload(ref, provider, capability: {maxBytes, nativeKind}): Promise<string>;
  cachePut(ref, provider, providerFileId, ttlMs): Promise<void> | void;
};
```

- `cacheGet` returns `null` on miss/expired/cache-outage; throws are
  swallowed by the resolver (treated as miss).
- `providerUpload` throws → that ref degrades to the manifest (the turn
  proceeds for the other refs). The cap is authoritative — the port MUST
  enforce `maxBytes` BEFORE materializing the buffer; it should also use
  the server-authoritative MIME (not `ref.mime`) and reject mime
  mismatches.
- `cachePut` failures after a successful upload are best-effort —
  the upload still serves THIS turn.

Stale-cache self-heal: a Gemini cached id that does not have a URI scheme
(`files/<id>`) is treated as a MISS so the next call re-uploads with the
correct URI.

## Cutover notes

| Concern | Resolution |
|---|---|
| `LlmMessage.attachments` / `resolvedAttachments` | Optional everywhere — no caller is forced to opt in. |
| `body.user_envelope` (bridge) | Opt-in; absent → byte-identical. WayFlow (Cinatra's OAS Flow agent runtime) agent_loader.py must opt in when forwarding human-in-the-loop (HITL) `{text, attachments}` envelopes. |
| Gemini PROCESSING→ACTIVE poll | The bridge `providerUpload` returns the URI immediately; a Gemini file in `PROCESSING` state may cause the first turn to skip the attachment silently. The right place to poll is inside the Gemini adapter's `uploadFile` where the SDK client lives. |
| Dashboards as artifacts | Dashboard objects can publish an `artifact` extension that maps the dashboard snapshot to an ArtifactRef so it can be attached/referenced like any file. |
| Generic connector-ref resolver | A new `connector-ref` artifact type can point at a connector-owned resource; resolver port supplies a connector-specific bytes loader. |
| Live-update binding | When an `artifact` extension declares `liveBindingChannel`, the chat replay path subscribes (server-sent events (SSE)/WS) and re-renders on update. |
| Email ingestion | The inbound-email handler calls `createUploadedArtifact({originKind:"email_attachment", parentId, parentType})`. |

## Where to look

| Concern | File |
|---|---|
| Pure provider-part builders | [packages/llm-orchestration/src/attachments/provider-parts.ts](../../packages/llm-orchestration/src/attachments/provider-parts.ts) |
| Capability gate (per provider × mime/size) | [packages/llm-orchestration/src/attachments/capability-registry.ts](../../packages/llm-orchestration/src/attachments/capability-registry.ts) |
| Resolver (cache-first, manifest-on-failure) | [packages/llm-orchestration/src/attachments/resolve-attachments.ts](../../packages/llm-orchestration/src/attachments/resolve-attachments.ts) |
| Orchestration entry step | [packages/llm-orchestration/src/attachments/entry-resolve.ts](../../packages/llm-orchestration/src/attachments/entry-resolve.ts) |
| Provider native emission | `packages/llm-orchestration/src/providers/{openai,anthropic,gemini}.ts` |
| Bridge resolver ports | [src/app/api/llm-bridge/attachment-resolver-ports.ts](../../src/app/api/llm-bridge/attachment-resolver-ports.ts) |
| Bridge user envelope | [src/app/api/llm-bridge/user-envelope.ts](../../src/app/api/llm-bridge/user-envelope.ts) |
| Bridge route wiring | [src/app/api/llm-bridge/route.ts](../../src/app/api/llm-bridge/route.ts) |
| Chat persist/replay + attachments | [packages/chat/src/chat-page.tsx](../../packages/chat/src/chat-page.tsx), [src/app/api/chat/runner.ts](../../src/app/api/chat/runner.ts) |
| Prompt-window attachment picker | [packages/sdk-ui/src/prompt-field.tsx](../../packages/sdk-ui/src/prompt-field.tsx) (prop-gated — consumers opt in by passing `onAttachmentsChange`) |
| A2A resume envelope | [packages/agents/src/review-task-actions.ts](../../packages/agents/src/review-task-actions.ts) (precedence comment block) |
| Provenance contract | [packages/artifacts/src/artifact-version.ts](../../packages/artifacts/src/artifact-version.ts) (`ArtifactOriginKind`) + [src/lib/artifacts/artifact-write.ts](../../src/lib/artifacts/artifact-write.ts) (`WriteUploadedArtifactInput.parentId/parentType`) |
