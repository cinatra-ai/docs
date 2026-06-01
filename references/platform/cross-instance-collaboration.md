# Cross-Instance Collaboration

The technical reference for the seams between Cinatra instances. The [user-facing companion](../../guides/user/cross-instance-collaboration.md) explains the workflow and the experience. This page documents the protocol, the routing model, the auth surface, and the source files you read if you are integrating Cinatra with another Cinatra (or another agent-to-agent (A2A) protocol-compliant platform) at the protocol level.

---

## The two seams

Two protocols carry cross-instance traffic:

1. **Registry traffic** — Verdaccio (an npm-compatible registry). One instance publishes a package; another reads the package listing and pulls the tarball.
2. **A2A traffic** — JSON-RPC 2.0 over HTTPS. One instance's agent makes a tool call into another instance's agent; the called agent runs locally on the host, streams Agent-User Interaction Protocol (AG-UI) events back, and (optionally) pauses for human-in-the-loop (HITL).

Both seams reuse Cinatra's existing primitives — there is no separate "federation" subsystem. The seams are governed by `DeploymentRegistryConfig` on the registry side and by the per-agent A2A routes plus the OAuth-provider plugin on the A2A side.

---

## Registry routing

The runtime answers two questions for any cross-instance package operation: *which registry does this destination point at* and *how do I authenticate*. The answer is in the canonical `DeploymentRegistryConfig`:

```ts
type DeploymentRegistryConfig = {
  publicRegistryUrl:            string;
  publicReadToken:              string;
  publicPublishToken:           string | null;
  privateRegistryUrl:           string | null;
  privateReadToken:             string | null;
  privatePublishToken:          string | null;
  privateDestinationConfigured: boolean;
  privateDestinationId:         string | null;
  routingMode:                  "scope-based" | "shared-acl";
};
```

Loaded by `loadDeploymentRegistryConfig()` in `src/lib/deployment-registry-config.ts`. Caller MUST be auth-gated before invoking — the loader does not call `requireAuthSession()` itself.

### Topology adapters

`routingMode` selects the topology adapter inside `packages/extensions/src/destination-resolver.ts`:

- **`scope-based`** — emits `--@<scope>:registry=<url>` flags so each scope routes to its own registry vhost. Used when the private destination uses a distinct npm scope from the public registry.
- **`shared-acl`** — emits plain `--registry=<url>` flags so a single registry vhost serves multiple instances with ACL-based isolation. Used when the public and private destinations share infrastructure.

`routingMode` is required. An unset value raises `DeploymentRegistryConfigNotAvailableError("deployment config malformed — routingMode missing")`.

### Credential storage

No registry secrets live in `origin`. The per-destination credentials sit in the encrypted `extension_destinations` table, keyed by `destinationId`, and decrypted with per-field AAD: `destination.<id>.publish-token` for publish tokens, `destination.<id>.read-token` for read tokens. The destination resolver pulls credentials by id; callers never touch ciphertexts.

### Origin record

Every install persists an `origin` JSONB on the primary row (`agent_templates.origin`, `skill_packages.origin`):

```ts
type ExtensionOrigin = {
  packageName:   string;
  version:       string;
  destinationId: string | null;     // null for public-registry installs
  scope:         string;             // "@<scope>" — basis of the visibility filter
  visibility:    "public" | "private";
  registryUrl:   string;
  importedFrom?: {
    source: "github" | "zip" | "chat";
    url?: string;
    license?: string;
    licenseAcknowledged?: boolean;
    updatePolicy: "manual" | "auto";
    lastSyncedAt?: string;
  };
};
```

The instance's vendor scope (read from `readInstanceIdentity()`) is the basis of every server-side visibility filter: `public` rows are universally visible; `private` rows are visible only when `origin.scope` matches the reading instance's scope. This is enforced at every server read path that touches the extension tables (`packages/agents/src/store.ts:readActiveExtensionTemplates`, the marketplace screen at `src/app/configuration/marketplace/page.tsx`, the Model Context Protocol (MCP) `extensions_search` handler). A regression test (`packages/extensions/src/__tests__/visibility-filter.test.ts`) scans for direct callers of the lower-level Verdaccio config helpers that would bypass the filter.

---

## A2A — calling another instance's agent

The external A2A surface is `/api/a2a` (multiplexed JSON-RPC). Discovery happens through `/.well-known/agent.json`. The per-agent route at `/api/a2a/agents/<vendor>/<slug>` is **internal** WayFlow (Cinatra's OAS Flow agent runtime) plumbing — it is the local-host proxy that the in-process WayFlow container uses to reach the application; it is gated by `CINATRA_BRIDGE_TOKEN` and is not the route external instances call.

### AgentCard discovery

`GET /.well-known/agent.json` returns a single `AgentCard` describing the host instance and every published agent installed on it. The route is implemented at `src/app/.well-known/agent.json/route.ts`, fetches all published templates via `readPublishedAgentTemplates()`, and delegates to `packages/a2a/src/agent-card.ts:buildAgentCard()`. The shape:

- Top-level fields: `name: "Cinatra"`, `description`, `url: "<baseUrl>/api/a2a"`, `version`, `capabilities`, `authentication` (with `tokenEndpoint` pointing at the host's OAuth2 token endpoint).
- `skills[]` — one entry per published agent. Each entry has `id`, `name`, `description`, `tags`, `inputModes`, `outputModes`, `toolName`, `packageName`, `operativeVersion`, `supportedVersions`, `hitlScreens` (array of `{ id, schema }`), `agentDependencies` (a map of `@<vendor>/<slug>` → semver range — surfaced flat on each skill so a caller can resolve sub-agent dependencies before invoking an orchestrator), and `type` (`leaf` or `flow`).

Discovery is unauthenticated. The card is a public manifest; only the actual task-send call requires auth.

### Outbound calls

`packages/a2a/src/external-client.ts:createExternalA2AClient()` is the outbound surface. It:

1. Exchanges client credentials for a bearer JSON Web Token (JWT) through the remote instance's OAuth provider plugin (`tokenEndpoint` advertised in the remote `AgentCard`).
2. Sends the JSON-RPC `message/send` request with the bearer in `Authorization`.
3. Returns `streamTask()` for streaming calls, which yields the remote server-sent events (SSE) response.

Bridging the remote SSE stream into the caller's local Redis event log is the caller's responsibility — `packages/agents/src/a2a-actions.ts` does this via `startExternalSseProxyFromStream()` in `packages/a2a/src/external-sse-proxy.ts`, so the caller's UI subscribes to the local stream rather than the remote.

The caller's run sees the remote agent as if it were a local sub-agent. HITL gates on the remote agent surface as `INTERRUPT` events the caller can choose to resume against (`message/sendStreaming` with the resume payload) or to escalate to a local human.

### Inbound calls

When another instance calls your `POST /api/a2a`:

1. The bearer JWT is verified by the OAuth-provider plugin of Better Auth (the auth server library Cinatra uses) against the canonical origin (tunnel-safe) via `verifyA2AAccessToken` in `src/lib/a2a-auth.ts`.
2. The actor is resolved through `resolveA2AActorContext` (in `src/app/api/a2a/actor-context-resolver.ts`) and threaded through every server action, MCP primitive, and background job. The actor type is `"a2a"`, distinct from `"ui"` / `"route"` / `"worker"`.
3. The agent run executes on **this** instance's infrastructure, using **this** instance's WayFlow container, **this** instance's connectors and credentials, **this** instance's large language model (LLM)-orchestration layer. The caller does not get those resources — they only get the agent's output.
4. The run is durable in the local `agent_runs` table; the stream is replayable from the Redis Streams log via `Last-Event-ID`.

### Authorization

Per-run authorization on inbound A2A calls uses the same `enforceRunAccess(run, actor)` helper the UI uses. The actor envelope on inbound A2A traffic identifies the calling instance via the OAuth client; the local instance's permissions backend controls whether that client is allowed to list, read, or execute the agent. Inbound calls are denied with the same logic that denies an unauthorized UI user.

### Flag matrix recap

| Route | Default | Gating |
|---|---|---|
| `GET /.well-known/agent.json` (AgentCard discovery) | always on | — (public, unauthenticated) |
| `POST /api/a2a` (external multiplexed JSON-RPC) | 404 | `CINATRA_A2A_HTTP_ENABLED=true` + Bearer JWT |
| `POST /api/a2a/resume` (external AG-UI resume) | 404 | `CINATRA_AGUI_EXTERNAL_ENABLED=true` |
| AG-UI multiplex inside `/api/a2a` SSE response | off | `CINATRA_AGUI_EXTERNAL_ENABLED=true` |
| `GET\|POST /api/a2a/agents/<vendor>/<slug>` (internal WayFlow proxy) | always reachable | `X-Cinatra-Bridge-Token` matching `CINATRA_BRIDGE_TOKEN` (403 if unset or wrong) |

The asymmetry is intentional. `/api/a2a` is the external A2A front door and is opt-in; production deployments enable it explicitly. The per-agent `/api/a2a/agents/<vendor>/<slug>` route is the local-host WayFlow proxy — external A2A traffic never reaches it; only the WayFlow sidecar with the bridge token does.

---

## Auth between instances

Two credentials are involved:

1. **Bearer JWT** — issued by the remote instance's Better Auth OAuth-provider plugin in exchange for client credentials. The JWT carries the calling client's identity; the remote instance's authorization layer maps the client to an actor and runs every gate against the actor.
2. **Bridge token** (in-instance) — `CINATRA_BRIDGE_TOKEN` authenticates WayFlow container callbacks into the host app at `/api/llm-bridge` and the per-agent A2A routes. It is **not** a cross-instance credential; it is the secret one instance's WayFlow container uses to call its own host app.

There is no separate cross-instance shared secret. The OAuth-provider plugin is the canonical surface for both MCP and A2A access; the same JWT works for both.

For the full auth model see [Security](security.md).

---

## How publishing actually flows

End-to-end publish path for an agent:

1. Author the Open Agent Specification (OAS) Flow + `package.json` (chat or file-driven path).
2. Compile (`agent_source_compile`) — derives runtime fields, syncs `agent_templates`.
3. Review gate (`agent_source_review` / `runDeterministicReview`) — must pass.
4. Publish (`agent_source_publish`) — bumps version, packs tarball.
5. The destination resolver in `packages/extensions/src/destination-resolver.ts` reads the chosen destination (`private` | `public`) from `DeploymentRegistryConfig`, decrypts the publish token from `extension_destinations` by destination id, builds the `npm publish` command via the topology adapter for the resolved `routingMode`, and runs it.
6. `agent_templates.origin` is updated to reflect the published `(packageName, version, scope, destinationId, registryUrl, visibility)`.
7. An `audit_events` row is written.

After publish, other connected instances see the package in their marketplace listing (subject to the visibility filter); installs flow through the normal install path described in [Extensions](extensions.md).

---

## Promotion path (private → public)

`promoteExtensionToPublicAction(extensionId)` in `packages/extensions/src/actions.ts` is the one-way audited path:

1. `requireAdminSession()`.
2. Refuses with an explicit error if `origin.visibility === "public"` already.
3. Republishes the package at its current version to the public destination using the same topology routing as a fresh publish.
4. Updates `origin.visibility` to `"public"`.
5. Fire-and-forget writes a `promote` row to `audit_events` (`resourceType: "extension_registry"`).

The republish step requires a live deployment-registry resolver with a non-null `publicPublishToken`. The baseline configuration ships a fixture (`DEPLOYMENT_REGISTRY_CONFIG_FIXTURE`) whose public publish token is null, so `resolvePublishDestination("public")` throws in fixture-backed environments. Operators wire a real resolver under **Administration → Environment → Registries** before public publish/promotion will succeed.

Public-to-private demotion is intentionally not implemented; the button is rendered disabled-but-visible with a locked tooltip. The disabled-visible pattern is preferred over hidden so the limit is discoverable in the UI.

---

## Source-of-truth files

When you need to verify a specific claim on this page:

- Destination resolution: `packages/extensions/src/destination-resolver.ts`
- `ExtensionOrigin` shape: `packages/agents/src/schema.ts`
- `DeploymentRegistryConfig` shape: `src/lib/deployment-registry-config.ts`
- Visibility filter regression: `packages/extensions/src/__tests__/visibility-filter.test.ts`
- Marketplace screen + visibility filter wiring: `src/app/configuration/marketplace/page.tsx`
- AgentCard builder: `packages/a2a/src/agent-card.ts`
- Outbound A2A client: `packages/a2a/src/external-client.ts`
- External SSE bridge: `packages/a2a/src/external-sse-proxy.ts`
- A2A actor context resolver: `src/app/api/a2a/actor-context-resolver.ts`
- Per-agent A2A route: `src/app/api/a2a/agents/[...slug]/route.ts`
- Promotion action: `packages/extensions/src/actions.ts`
- Instance identity / namespace: `src/lib/instance-identity-store.ts`
- Registry credential encryption: `packages/extensions/src/destination-resolver.ts` (AAD helpers)

---

## Where to go next

- The user-facing companion: [Cross-instance collaboration](../../guides/user/cross-instance-collaboration.md) in the User Guide
- The open standards that frame this seam: [Open standards in Cinatra](open-standards.md)
- The lifecycle for an installed cross-instance package: [Extensions](extensions.md)
- The auth + permissions model: [Security](security.md)
