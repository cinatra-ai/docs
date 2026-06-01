# Blog + Social-Media Connectors — Provider-Neutral Transport Facades

Documents the `@cinatra-ai/social-media-connector` + `@cinatra-ai/blog-connector` facades and the `@ossflywheel/blog-connector` vendor connector. Read alongside `email-connector.md` (the proven connector-facade pattern these mirror), `mcp-patterns.md`, and `docs/developer/extensions.md` (the `kind:"connector"` extension kind).

## Why it exists

`packages/asset-blog/` owns transport + generation + project state. The connector split isolates the **transport spine** along the connector-facade pattern: generic facades own the routing/contract; concrete + vendor-scoped connectors own the provider/site specifics.

## Architecture overview

```
LinkedIn publish (asset-blog generation.ts)
  └─ publishSocialMediaPostThroughSystem(post, opts)   @cinatra-ai/social-media-connector/facade
       ├─ resolveConnectorId(opts)                       src/lib/register-social-providers.ts
       │    1. explicit connectorId  2. first registered
       └─ connector.publish(post)   linkedInSocialMediaConnector → publishLinkedInPost (host @/lib/linkedin-api)

WordPress draft-write (asset-blog wordpress.ts)
  └─ buildBlogDraftPayloadThroughSystem(input, {instanceBlogConnectorId})  @cinatra-ai/blog-connector/facade
       ├─ resolveConnectorId                              src/lib/register-blog-providers.ts
       │    1. explicit connectorId
       │    2. WordPressInstanceSettings.blogConnectorId
       │    3. "default" generic connector
       └─ connector.buildDraftPayload(input) → { createPayload, postMeta? }
            • defaultBlogConnector       → markdown→HTML, postMeta:undefined (NO injection, NO Elementor)
            • ossflywheelBlogConnector   → Elementor node-tree swap + ossflywheel template selectors
       host: createWordPressDraft(createPayload); if postMeta → updateWordPressDraftMeta({meta:postMeta})
```

## Widened `BlogConnector` contract

The legacy `WordPressContentConverterFn` shape (`{title?, excerpt?, content, contentIsHtml?}`) could not express Elementor node-tree injection, which needs a 2-call WordPress sequence: create-draft, then meta-update. The `BlogConnector` contract returns both the create payload and an optional `postMeta` map:

```ts
buildDraftPayload(input): Promise<{
  createPayload: { title; content; excerpt; status: "draft"; featured_media?; ... };
  postMeta?: Record<string, unknown>;  // omit → host skips the meta-update call
}>
```

The host owns the 2-call orchestration; the connector just declares what to write. Generic connectors omit `postMeta`; ossflywheel returns the swapped `_elementor_data` node-tree.

## Generic-vendor extension-management policy boundary

Extension management accepts any `@<vendor>/<slug>-connector`, not an `@ossflywheel`-only carve-out, while keeping validation stricter than a permissive wildcard. The boundary (`packages/extensions/src/connector-handler.ts`):

- Regex `GENERIC_VENDOR_CONNECTOR_NAME_RE = /^@[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*-connector$/` (exported, single source of truth)
- `cinatra.kind === "connector"` semantic gate (rejects `-agent`/`-skill`/`-artifact` even if the name shape matches)
- `checkConnectorRealpathMatch()` — package-name↔realpath equality under `realpath(extensionsRoot)`; rejects symlink-escape + vendor/slug mismatch
- `cinatra.visibility` default `admin` (`defaultConnectorVisibility()`); validate() rejects unknown values
- Static setup-page loader entries only — no dynamic vendor import

The extension-management surfaces are connector-handler regex, `pnpm-workspace.yaml` glob (`extensions/*/*-connector`), `tsconfig.json` alias, the boot scanner, and boot registration. Catalog descriptor, connector-policy preflight, and publish/purge validation are vendor-agnostic because they key on `cinatra.kind`, not a specific vendor scope.

## Transport-only binding

Only the actual provider/transport call routes through a facade. The asset-blog `blog_post_publish_linkedin_*` / `blog_post_publish_wordpress_*` Model Context Protocol (MCP) primitives drive draft-copy generation + project/human-in-the-loop (HITL) state, not pure transport, so they remain asset-blog compatibility wrappers.

## `blogConnectorId` binding non-regression

`WordPressInstanceSettings.blogConnectorId?: string` is stored in the existing `connector_config:wordpress` JSON blob (no schema migration). Both save constructors build the row field-by-field (no `...existing` spread), so the field is explicitly preserved:

- `saveWordPressInstance` — inherits from `existing` when no override passed
- `saveWordPressInstanceFromNangoConnection` — **unconditionally** preserves `existing?.blogConnectorId` (Nango (the OAuth gateway brokering connector credentials) never carries it; without this a disconnect→reconnect silently drops the binding)
- `getWordPressAPISettings` normalizer extracts it on re-read

Pinned by `src/__tests__/wordpress-blog-connector-id-roundtrip.test.ts`.

## Idempotent ossflywheel self-heal

`selfHealOssflywheelBlogConnectorBinding()` runs best-effort at boot from `registerBlogProviders()`. It reads the WP connector_config blob **directly** (NOT `saveWordPressInstance` — that does network revalidation + Nango sync, unacceptable at boot) and binds `blogConnectorId="ossflywheel"` on instances with an EMPTY binding whose `siteUrl` host matches `/(^|\.)ossflywheel\.com$/i` (or an explicit allowlist hook). Idempotent — already-bound instances are skipped, so an explicit user choice is never overwritten.

## Key files

| File | Role |
|---|---|
| `extensions/cinatra-ai/social-media-connector/src/{contract,registry,facade,index}.ts` + `mcp/module.ts` | Social facade (5-part). `social_media_publish` MCP primitive |
| `extensions/cinatra-ai/linkedin-connector/src/connector.ts` | `linkedInSocialMediaConnector` — wraps host `publishLinkedInPost` |
| `extensions/cinatra-ai/blog-connector/src/{contract,registry,facade,index}.ts` + `default-connector.ts` + `mcp/module.ts` | Blog facade (5-part) + generic `defaultBlogConnector` + `blog_connector_list` primitive |
| `extensions/ossflywheel/blog-connector/src/{elementor,connector,index}.ts` | First non-`@cinatra-ai`-scope connector. Owns all `_elementor_data` + ossflywheel template selectors |
| `src/lib/register-social-providers.ts` / `src/lib/register-blog-providers.ts` | Boot wiring (configure facade + register connectors; auto-runs on import from `instrumentation.node.ts`). Blog one also runs the ossflywheel self-heal |
| `packages/extensions/src/connector-handler.ts` | Generic-vendor regex + visibility + realpath guards |

## Adding a new vendor connector

1. Create `extensions/<vendor>/<slug>-connector/` with `package.json` declaring `cinatra.kind:"connector"` (+ optional `cinatra.visibility`).
2. Implement `BlogConnector` / `SocialMediaConnector` (`import type` the contract only).
3. `registerBlogConnector(...)` / `registerSocialMediaConnector(...)` in the matching `src/lib/register-*-providers.ts`.
4. Add the `tsconfig.json` path alias. The `extensions/*/*-connector` workspace glob picks it up automatically.
5. Bind it: set `WordPressInstanceSettings.blogConnectorId` (blog) or pass `connectorId` (social).

## Blog agentization patterns

These patterns apply to future agent, orchestrator, and artifact work in this area.

### Explicit context-agent OAS pattern

Runtime auto-wiring for context agents is not used. An agent that declares `metadata.cinatra.contextSlots` must wire context-agent **explicitly in its own Open Agent Specification (OAS)**: declare `@cinatra-ai/context-selection-agent` in the agent **package.json** `cinatra.agentDependencies` (NOT OAS metadata), add an explicit `context_<slotId>` FlowNode (subflow ref to a byte-faithful inlined `context-agent-<slot>-subflow`) before the first slot-consuming node, and add a `contextRefs → <consumer>.contextSlotBindings` DataFlowEdge.

Constants reach a FlowNode via hidden StartNode default inputs; a `DataFlowEdge` has no literal value field. Child-local only — a parent orchestrator never fans context-agent out to its children. Reference implementation: `email-outreach-agent`. Repo-wide invariant test: `packages/extensions/src/__tests__/contextslots-require-explicit-context-agent.test.ts`. Full contract: `docs/developer/context-slots.md`.

### Faithful-inline OAS-RUNTIME-005 allowlist

`@cinatra-ai/context-selection-agent` is a runtime-backed core agent: its `contextRefs` output is runtime-injected, not flow-graph-produced, so the shipped context-agent OAS itself inherently trips exactly one `OAS-RUNTIME-005`. Any byte-faithful inline of it carries the same single finding. This is intentional: a synthetic producer would make the canonical template diverge from the real contract.

Record each such agent in `KNOWN_BROKEN_AGENTS` in `packages/agents/src/__tests__/oas-runtime-invariants.test.ts` with `expectedCodes:["OAS-RUNTIME-005"]` + the exact `expectedBlockerCount` (N inlined context subflows ⇒ N). The allowlist is the test's designed escape hatch; new code/count drift still fails loudly.

### Parent-orchestrator child-subflow inlining + deterministic `_shape` seams

A WayFlow (Cinatra's OAS Flow agent runtime) parent orchestrator (e.g. `blog-pipeline-agent`) hand-inlines each child agent's full flow as a namespaced subflow under `$referenced_components`; the compiler resolves `$component_ref` locally then via the global registry. It does not resolve a FlowNode `subflow` by package.

Inter-agent **shape gaps** (e.g. idea-array → draft-object, draft-object → linkedin-strings) are bridged by an `InputMessageNode` (string output) → a deterministic `/api/agents/passthrough` ApiNode with a per-`_shape` input shaper (`src/app/api/agents/passthrough/blog-pipeline-seam.ts`; extend `TOOL_INPUT_SHAPERS.objects_save` via a chained pure module). The route's `result_input_passthrough` echoes the shaped `rawData` into the node's declared typed outputs. Never invent a transform node and never change a shipped leaf agent's IO contract to paper over a shape gap.
