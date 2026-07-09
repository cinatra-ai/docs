# Drupal in-admin assistant — which hop reaches Drupal? (captured live)

**Question.** For the Drupal in-admin Cinatra assistant, the widget talks only to the
Cinatra instance (undisputed). Disputed: does Cinatra reach Drupal **(a)** through the
**Drupal MCP module** (`drupal/mcp_tools`), or **(b)** through **direct REST / JSON:API
credentials**, *for the in-admin editing path specifically*?

**Verdict.**
- **The edit itself (the WRITE) goes through the Drupal MCP module — (a). The owner is correct for Drupal.**
  Every content mutation primitive (`drupal_node_update`, `drupal_node_create_draft_revision`,
  `drupal_node_publish`) is an MCP `tools/call` to the site's `drupal/mcp_tools` remote
  endpoint `POST /_mcp_tools` (MCP over Streamable HTTP, Bearer credential). The `update`
  case is proven live below; `create`/`publish` are the same `callDrupalMcp` code path
  (proven by code, not by that capture).
- **Scope.** This verdict is for the stock in-admin path: the declared
  `drupal-mcp-connector` primitives driven by the stock `@cinatra-ai/drupal-agent`. It does
  not speak for a non-default agent swapped in via `DRUPAL_CONTENT_EDITOR_A2A_URL`.
- **Nuance — there IS a direct JSON:API hop, but it is READ-ONLY.** Before editing, the
  content-editor's STEP-1 read (`drupal_node_get`) fetches the node's editable
  before-values over **core JSON:API** (`GET /jsonapi/...`, `Accept:
  application/vnd.api+json`) so it can build a real before/after diff. That is a genuine
  direct-REST hop, but the code path is read-only, and it reuses the same OAuth bearer (or
  goes anonymous) — there is **no separate stored REST credential**, and **no direct
  REST/JSON:API content *write*** in the in-admin primitive path. So "Cinatra reaches Drupal
  only through MCP" would be too strong (reads can be JSON:API); "the *edit* is written
  through the Drupal MCP module" is exact.
- **This is the opposite of WordPress on the final CMS hop.** Both widgets go through
  Cinatra → agent → connector first; the difference is the *last* hop into the CMS. The
  sibling proof on this PR shows WordPress's content-editor write lands on the WordPress
  REST API + Application Password (b), with the MCP Adapter reserved for agent tool access.
  Drupal's content-editor write lands on its MCP module (a). The two CMSes genuinely differ
  on that final write hop.

Grounded on `origin/main`: `drupal-mcp-connector` `123b368`, `drupal-agent` `f28f2e4`,
`drupal-module` `73fc78c`, `drupal-assistant-connector` `92abb82`.

---

## The in-admin editing path, end to end (code, origin/main)

1. **Browser widget → Cinatra only (undisputed).** The in-CMS chat runs the
   `drupal-widget-chat` system prompt and calls the LLM tool `drupal_content_editor_run`.
   `drupal-mcp-connector/src/widget-chat-tool.ts:43` builds that tool; its `execute()`
   (`:60`) forcibly overrides `instanceId`/`nodeId` from server-trusted context and calls
   the connector handler (`:66`).
2. **Handler → WayFlow agent (A2A), not Drupal.** `drupal-mcp-connector/src/mcp/handlers.ts:449`
   (`drupal_content_editor_run`) dispatches a blocking A2A task to the WayFlow
   `drupal-content-editor` agent (default `…/agents/cinatra-ai/drupal-agent`, `handlers.ts:453`).
3. **Agent runs the primitives.** `drupal-agent/skills/drupal-agent/SKILL.md`: STEP 1
   `drupal_node_get` (read), STEP 2 `drupal_node_create_draft_revision` if published,
   STEP 3 `drupal_node_update` (write). These are the connector's MCP primitives
   (`drupal-mcp-connector/cinatra/mcp.json`).
4. **READ primitive → direct JSON:API (option b, read-only).**
   `handlers.ts:285` `drupal_node_get` → `readNodeViaJsonApi` (`:230`) → `jsonApiGet`
   (`:170`): a plain `fetch()` to `/jsonapi/node_type/node_type` then
   `/jsonapi/node/{bundle}?filter[drupal_internal__nid]=…`, `Accept:
   application/vnd.api+json`, **best-effort** bearer (anonymous if none). If JSON:API is
   unavailable it falls back to the MCP module `mcp_tools_get_recent_content` (`:315`).
   The full-field JSON:API read is what surfaces `body.value` for the diff (the MCP summary
   row lacks it).
5. **WRITE primitive → Drupal MCP module (option a).** `handlers.ts:335`
   `drupal_node_update` → per-user write-authority gate `requireWriteAuthority` (`:137`,
   fail-closed) → `callDrupalMcp(instance, "mcp_update_content", { nid, updates })` (`:369`).
   `drupal-mcp-connector/src/lib/drupal-mcp-client.ts`: `MCP_TOOLS_PATH = "/_mcp_tools"`
   (`:14`), `baseUrl = instance.siteUrl + "/_mcp_tools"` (`:27`), Bearer from the vault
   (`:28`), `StreamableHTTPClientTransport` (`:38`), `client.callTool({ name, arguments })`
   (`:46`); it parses the `drupal/mcp_tools` `ToolApiCallToolHandler` envelope.

**The endpoint is the separate Drupal MCP module, not the Cinatra widget module.** On the
live site `drush` route list shows `mcp_tools_remote.handle → /_mcp_tools` (the
`drupal/mcp_tools` contrib module). The Cinatra widget module (`drupal-module`,
`cinatra.info.yml`) depends only on `node` + `user` and its `cinatra.routing.yml` exposes
only the widget-auth / token-broker / connect routes — it has no content-write endpoint.

## The agent-tool-access path (the DISTINCT path, for contrast)

`drupal-mcp-connector/src/mcp/toolbox.ts` (`createDrupalExternalMcpToolbox`) injects the
site's `drupal/mcp_tools` server **directly into an LLM call** as a remote MCP tool
(`type:"mcp"`, `serverUrl = resolveMcpServerUrl(siteUrl)`, Nango bearer, allowlisted
read+write tools, `requireApproval:"always"`). It **skips private/localhost URLs**
(`toolbox.ts:78`, "LLM providers cannot reach localhost"), requires `probeMcp ===
"registered"`, and lists instances actor-scoped. This is the general-agent tool-access
path — also the Drupal MCP module (a), never JSON:API — and it is INACTIVE against a
local site. So on the local proof stack only the in-admin path fires.

## Config flags that could switch routes

- `DRUPAL_CONTENT_EDITOR_A2A_URL` (`handlers.ts:453`) — where the in-admin editor dispatches
  the agent run. Not an a/b switch; just the agent endpoint.
- **Read route is availability-dependent:** JSON:API primary, auto-fallback to the MCP
  module `mcp_tools_get_recent_content` when JSON:API is disabled/restricted/transient
  (`handlers.ts:299`–`315`). So the read hop can be (b) *or* (a); the write hop is always (a).
- **All Drupal credentials come from the Nango vault** via `buildNangoBearerHeader` — the
  MCP write bearer and the best-effort JSON:API read bearer are the same OAuth credential.
  There is no separate stored REST/basic-auth credential set for Drupal.
- Agent-tool-access toolbox gates: non-private URL + `isNangoConfigured` + `probeMcp
  registered` + actor-scoped instance list + `requireApproval:"always"`.

---

## Live proof (captured traffic, not just code reading)

I ran the **real, unmodified** `drupal-mcp-connector` code paths from `origin/main`
(`callDrupalMcp` + the `drupal_node_get` / `drupal_node_update` primitive handlers — the
only change is removing an inert `server-only` client-bundle guard so the source runs under
Node) against a **real Drupal 11 container** (`docker compose --profile drupal`, the
`drupal/mcp_tools` remote endpoint enabled), driving exactly the read-then-write the
content-editor agent performs on node 1. Traffic was captured by a logging proxy in front
of Drupal and independently corroborated by Drupal's own Apache access log.

**Captured outbound hops (Cinatra connector → Drupal), one content-editor run:**

```
# STEP 1 read — direct JSON:API (option b, read-only)
GET  /jsonapi/node_type/node_type?fields[node_type--node_type]=drupal_internal__type   Accept: application/vnd.api+json   Bearer mcp_tools.<id>  -> 200
GET  /jsonapi/node/article?filter[drupal_internal__nid]=1&page[limit]=1                Accept: application/vnd.api+json   Bearer mcp_tools.<id>  -> 200

# STEP 3 write — the Drupal MCP module (option a)
POST /_mcp_tools   rpc=initialize                     Accept: application/json, text/event-stream   Bearer mcp_tools.<id>  -> 200
POST /_mcp_tools   rpc=notifications/initialized                                                     Bearer mcp_tools.<id>  -> 202
POST /_mcp_tools   rpc=tools/call  name=mcp_update_content   { nid:"1", updates:{ title } }         Bearer mcp_tools.<id>  -> 200

# MCP read fallback also exercised — same /_mcp_tools transport
POST /_mcp_tools   rpc=tools/call  name=mcp_tools_get_recent_content                                 Bearer mcp_tools.<id>  -> 200
```

**Result of the write (the real handler's return value):**
`{ nid: 1, title: "PROVEN via Drupal mcp_tools /_mcp_tools …", revision_id: "40", message: "Content updated successfully." }`

**Persistence verified out-of-band** — a direct JSON:API read on Drupal (no proxy) after
the run shows node 1's title is the MCP-written value, `changed` at the write timestamp.

**Negative control** — a hand-rolled `POST /_mcp_tools` with a wrong key returned `401`;
the real connector's minted-key handshake returned `200`/`202` and applied the edit.

Zero outbound requests to any REST *write* endpoint; the only REST hop is the read-only
JSON:API fetch.
