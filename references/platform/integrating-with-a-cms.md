# Integrating Cinatra with a CMS

Cinatra ships two reference CMS integrations — WordPress and Drupal — that embed a Cinatra-driven AI assistant inside the CMS authoring surface. This page is the protocol-level reference for both. The [user-facing companion](../../guides/user/cinatra-in-your-cms.md) covers the editor and admin experience.

The architecture is symmetric across the two CMSes. The walkthrough below uses Drupal where the two diverge; the WordPress equivalents are noted inline.

---

## The two halves

A CMS integration has two halves:

1. **The CMS-side plugin/module** — code installed on the CMS that injects a chat widget into editor pages and brokers the conversation back to Cinatra.
2. **The Cinatra-side stream route + content-editor agent** — receives the widget's chat requests, orchestrates a large language model (LLM) turn against a content-editor function tool, and produces typed field diffs the widget renders.

Auth, CORS, and the widget bundle live in the Cinatra app. The CMS-side code is intentionally thin — it injects the widget bundle, holds the per-instance credentials, and gets out of the way.

## The CMS-side artifact

For Drupal: `dev/drupal-module/cinatra/` — a PHP module installable via Composer or manual placement in the Drupal `modules/custom/` tree. Its `cinatra.module` and supporting `src/` directory:

- Register an admin settings form at `/admin/config/services/cinatra` (`cinatra.routing.yml`). The form captures Cinatra URL, API key, and instance ID.
- Implement `cinatra_page_attachments()` to inject the widget bundle on **node canonical view, node edit form, and the site front page** — and only for authenticated Drupal users (`!\Drupal::currentUser()->isAuthenticated()` early-returns).
- Pass the configured Cinatra URL + widget API key + instance ID to the bundle via `drupalSettings.cinatra`.

For WordPress: `dev/wordpress-plugin/cinatra.php` — a single-file WordPress plugin that:

- Adds a **Settings → Cinatra** admin page capturing Cinatra URL, API key, instance ID, and an optional webhook secret.
- Enqueues the widget bundle on **WordPress admin pages, only for users with the `manage_options` capability** (administrator-level). It does not load on the public front-end and is not visible to lower-privileged editors.
- Exposes the configured values to the bundle as `window.CinatraConfig`.
- Also registers REST endpoints under `/wp-json/cinatra/v1/*` for webhook subscription management (list, create, delete, plus an HMAC-signed receive endpoint).

The Drupal module is a pure credential carrier + script loader. The WordPress plugin is the same for the widget chat path, but additionally carries the webhook subscription surface — when Cinatra wants to notify the CMS of an event (e.g., a Cinatra-side LinkedIn publish completed), it posts to the WordPress REST endpoint signed with the configured webhook secret.

## The widget bundle

The bundle itself is served from the Cinatra app:

- `GET /api/drupal/bundle.js` — implemented at `src/app/api/drupal/bundle.js/route.ts`.
- `GET /api/wordpress/bundle.js` — implemented at `src/app/api/wordpress/bundle.js/route.ts`.

Both routes return an IIFE that mounts a shadow-DOM widget on the CMS page, opens a chat panel when clicked, and posts messages to the Cinatra stream endpoint described below. The bundle is served with permissive CORS (the editor's browser fetches it from the CMS origin) and `Cache-Control: no-cache, no-store, must-revalidate` so a Cinatra upgrade picks up the new bundle immediately. The WordPress plugin additionally enqueues the bundle URL with a `CINATRA_PLUGIN_VERSION` cache buster so older bundle versions cached at the proxy or CDN layer are still invalidated.

## The stream endpoint

The widget bundle does not call Model Context Protocol (MCP) primitives directly. It calls a single stream route per CMS:

- `POST /api/agents/drupal-content-editor/stream`
- `POST /api/agents/wordpress-content-editor/stream`

Both are handled by `src/app/api/agents/[agentSlug]/stream/route.ts`, a per-slug agent stream registry. The route:

1. Validates the CMS origin against the configured allowlist (`resolveDrupalWidgetOrigin` / `resolveWordPressWidgetOrigin` in `src/lib/{drupal,wordpress}-widget-auth.ts`).
2. Validates the `Authorization: Bearer <api-key>` header against the widget API key (`validateDrupalWidgetToken` / `validateWordPressWidgetToken`). The key is global per CMS kind — one `drupal_widget_auth` / `wordpress_widget_auth` record per Cinatra install, not per instance.
3. Calls `stream` from `@cinatra-ai/llm` with:
   - The widget's message history (capped at the most recent N user/assistant turns).
   - A **widget-chat function tool** built by the connector — `createDrupalWidgetChatTool` (`@cinatra-ai/drupal-mcp-connector/widget-chat-tool`) or `createWordPressWidgetChatTool` (`@cinatra-ai/wordpress-mcp-connector/widget-chat-tool`). When the LLM calls this tool, it invokes the connector's `drupal_content_editor_run` / `wordpress_content_editor_run` MCP primitive, which dispatches to a WayFlow (Cinatra's OAS Flow agent runtime) content-editor agent through the host-bound `dispatchContentEditor` dependency.
   - The standard skill tool surface so skills can shape the assistant's behavior.
4. Streams the LLM response back to the widget as server-sent events (SSE).

The SSE wire format is frozen — clients in the wild depend on it:

| Event | Payload | Meaning |
|---|---|---|
| `text` | `{ content: string }` | A text chunk to append to the chat panel. |
| `changes` | `{ fields: [{ field, before, after }], nodeId: string, postId: string }` | A typed field-level diff describing what the agent wrote. Both `nodeId` and `postId` are always present as strings, regardless of which CMS the stream serves; clients pick the one they care about. The diff describes changes that have already been applied to the CMS draft. |
| `error` | `{ message }` | A terminal error; the chat ends. |
| `done` | `{}` or `{ fallback: true }` | Stream complete. The default empty payload signals normal completion; `fallback: true` signals the agent could not produce changes and only the chat-only text response is meaningful. |

The route's path is allowlisted in `src/lib/auth-route-guard.ts` so unauthenticated browser widgets reach it instead of being redirected to `/sign-in`.

## Auth model

Two credentials are involved; they must not be confused.

1. **The widget API key.**
   - Generated server-side and stored in `connector_config` keyed by `drupal_widget_auth` / `wordpress_widget_auth`. Helpers: `generateDrupalWidgetAuthConfig`, `generateWidgetAuthConfig` (WordPress).
   - Copied by the admin into the CMS plugin/module settings form.
   - Sent on every stream request as `Authorization: Bearer <api-key>`.
   - Scope: widget chat + content-editor function tool only. Not an OAuth grant; it does not unlock the full MCP primitive catalog.

2. **The MCP bearer the content-editor agent uses to call back into the CMS.**
   - For Drupal, the `drupal-content-editor` WayFlow agent calls into the configured Drupal site's `mcp_tools` module at `<siteUrl>/_mcp_tools` to read fields, create draft revisions, and write updates. The credential is a separate per-instance MCP key configured on the Drupal `mcp_tools` side.
   - For WordPress, the equivalent uses HTTP basic auth (username + application password) against the WordPress REST API at `/wp/v2/posts/*`.

The two credentials live in different stores and have different rotation lifecycles. Rotating the widget API key on Cinatra does not affect the CMS-side MCP/REST credential, and vice versa.

For the wider Cinatra auth model (Better Auth (the auth server library Cinatra uses), OAuth-provider plugin, MCP JWTs), see [Authentication](../mcp/authentication.md).

## The MCP primitives the connectors register

The connector extensions each register a small primitive set the content-editor agent (and any other Cinatra surface) can call.

`@cinatra-ai/drupal-mcp-connector` registers:

- `drupal_status` — connection status for a configured instance.
- `drupal_instances_list` — every configured Drupal instance on this Cinatra deployment.
- `drupal_node_get`, `drupal_node_list` — read node data.
- `drupal_node_create_draft_revision` — create a new draft revision on a published node.
- `drupal_node_update`, `drupal_node_publish` — write the draft, then publish.
- `drupal_content_editor_run` — dispatch a high-level edit task to the `drupal-content-editor` WayFlow agent.

`@cinatra-ai/wordpress-mcp-connector` registers an analogous but slightly larger set:

- `wordpress_status`, `wordpress_instances_list` — metadata.
- `wordpress_post_get`, `wordpress_posts_list`, `wordpress_post_get_latest`, `wordpress_post_status` — read.
- `wordpress_post_create_draft`, `wordpress_post_update`, `wordpress_post_update_meta`, `wordpress_post_delete` — write.
- `wordpress_media_upload` — media library.
- `wordpress_content_editor_run` — dispatch the `wordpress-content-editor` WayFlow agent.

Each primitive is Zod-validated. Each runs through the standard MCP authorization gate. The primitives are also reachable from the external MCP server at `/api/mcp` — an external client with the right credentials can drive WordPress or Drupal from outside the embedded widget.

## What WordPress and Drupal don't share

Even with symmetric integrations the underlying CMSes diverge in places the agent and the connector need to handle explicitly.

| Concern | Drupal | WordPress |
|---|---|---|
| Draft-before-edit | True draft revision (`drupal_node_create_draft_revision`) | Demote-then-edit pattern (`wordpress_post_update` with `status: "draft"`) |
| Read with edit context | Recent-content list (`mcp_tools_get_recent_content`) filtered by node ID — `mcp_tools` has no get-by-ID tool | Direct REST lookup (`/wp/v2/posts/{id}?context=edit`) |
| Auth to the CMS-side endpoint | Bearer token (`mcp_tools` remote key) | HTTP basic (username + application password) |
| ID type | `string` at the schema level; handlers parse it to a positive integer and send `nid` as a string (works around a `strtolower()` type quirk in `mcp_tools`) | `number` (positive integer, coerced at schema level) |
| Media | Inline in the node structure | Separate `wordpress_media_upload` primitive |

The WordPress connector also enforces an "at least one field" refinement on `wordpress_post_update` to prevent silent no-ops. See `wordpress-mcp-connector/AGENTS.md` for the connector-package-internal conventions.

## Adding a third CMS

The integration shape is replicable. To integrate Cinatra with another CMS (e.g., Strapi, Sanity, Contentful, Ghost):

1. **Write a connector extension** at `extensions/cinatra-ai/<cms>-connector/` (kind-at-end naming; declare `cinatra.kind: "connector"` in `package.json` so the `ConnectorExtensionTypeHandler` recognises it — see `references/platform/extensions.md` § Connector extension) that registers the CRUD primitives the CMS supports (`<cms>_status`, `<cms>_post_get`, etc.) plus a `<cms>_content_editor_run` primitive that dispatches a WayFlow agent. If the connector needs host-internal `@/lib/*` modules (database, mcp-pagination, etc.), inject them via a `register<Cms>Connector(deps)` factory wired in `src/lib/register-transport-connectors.ts` rather than importing `@/lib/*` directly (dependency injection keeps the package host-agnostic).
2. **Build the content-editor agent** under `agents/<vendor>/<cms>-content-editor/` — a WayFlow flow that reads the current document, produces a diff, and writes it back through the CMS's primitives.
3. **Author the widget-chat function tool** as a `widget-chat-tool` subpath export of the connector package (the existing two are `@cinatra-ai/drupal-mcp-connector/widget-chat-tool` and `@cinatra-ai/wordpress-mcp-connector/widget-chat-tool`) so `/api/agents/[agentSlug]/stream` can call it.
4. **Add a new entry** to the per-slug agent stream registry — no new route file is needed; the catch-all already routes by `agentSlug`.
5. **Implement the CMS-side artifact** — a plugin, module, or app installable on the target CMS that loads the widget bundle and holds the credentials.
6. **Add admin pages** at `/configuration/connectors/<cms>-widget` and `/configuration/assistants/<cms>-widget` to manage the widget credentials and the assistant configuration.

The two existing CMS connector extensions (`drupal-mcp-connector`, `wordpress-mcp-connector`) are the canonical reference for the shape. Read `drupal-mcp-connector/AGENTS.md` first — its conventions are documented for exactly this case.

## Source-of-truth files

When you need to verify a specific claim on this page:

- Drupal module: `dev/drupal-module/cinatra/`
- WordPress plugin: `dev/wordpress-plugin/cinatra.php`
- Drupal widget bundle: `src/app/api/drupal/bundle.js/route.ts`
- WordPress widget bundle: `src/app/api/wordpress/bundle.js/route.ts`
- Stream route: `src/app/api/agents/[agentSlug]/stream/route.ts`
- Drupal widget auth: `src/lib/drupal-widget-auth.ts`
- WordPress widget auth: `src/lib/wordpress-widget-auth.ts`
- Drupal connector: `drupal-mcp-connector/src/`
- WordPress connector: `wordpress-mcp-connector/src/`
- Drupal widget-chat tool: `drupal-mcp-connector/src/widget-chat-tool.ts`
- WordPress widget-chat tool: `wordpress-mcp-connector/src/widget-chat-tool.ts`

---

## Where to go next

- The user-facing companion: [Cinatra in your CMS](../../guides/user/cinatra-in-your-cms.md) in the User Guide
- The MCP primitive contract every CMS connector registers: [Primitives](../mcp/primitives.md)
- The streaming wire format the widget rides: [Open standards in Cinatra](open-standards.md)
- The shared authorization model: [Security](security.md)


## CMS restore via the remote-effect state machine

CMS edits do NOT participate in local DB atomicity — Cinatra cannot
roll back a WordPress publish or a Drupal node update by aborting a
Postgres transaction. The data-safety substrate handles this via
an explicit `pending → succeeded | failed` state machine that lives in
the `remote_effect_attempts` table, keyed to the canonical
`object_change_event.id`. The append-only history surface stays
append-only; the mutable state lives on the separate table.

Connector contract for CMS restores:

```ts
import { runCmsRestore } from "@/lib/object-history";

await runCmsRestore({
  changeEventId: event.id,                  // points at the local history event
  connectorName: "wordpress",
  targetKind: "wordpress-post",
  targetId: String(remoteRevisionRef.remoteId),
  intendedState: { title, content, status },
  idempotencyKey: `restore_${changeEventId}_wp`,
  orgId,
  callable: async ({ intendedState }) => {
    // 1. POST the captured snapshot to the CMS REST API.
    // 2. Read back to verify the remote reflects the intended state.
    //    (DSUV-CMS-03 — read-back-verify before mark succeeded.)
    // 3. Return the new remote revision id + the read-back payload.
    return { remoteRevisionRef: { revisionId }, readBack };
  },
});
```

Every CMS restore implementation MUST:

1. Be **idempotent** — re-executing with the same `idempotencyKey` yields the same remote state.
2. **Read back and verify** the post-write remote state before recording `succeeded`.
3. Fail loudly (throw) when the remote rejects or read-back diverges; the
   state machine records `failed` with the error message.

See [Data safety: undo and versioning](data-safety-undo.md) §10 for
the full state-machine contract and §9 for how the WordPress freshness
adapter feeds eligibility decisions back into the restore engine.
