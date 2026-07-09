# Proof: how the in-admin WordPress assistant reaches WordPress

**Question (owner challenge on `cinatra-ai/docs#115`, ruling context `docs#89`).**
When a WordPress admin uses the in-admin Cinatra assistant (the floating button)
to edit the post they are on, the widget talks only to the Cinatra instance
(undisputed). When the **Cinatra** side then reaches WordPress to read/write that
post, does it go through **(a)** the WordPress MCP Adapter plugin, or **(b)** the
plugin's REST credentials — Application-Password HTTP Basic auth on
`/wp/v2/*`?

**Verdict: (b).** The in-admin content-editor hop reads/writes WordPress through
the connector's own WordPress REST client using **Application-Password HTTP Basic
auth** against `/wp/v2/posts|pages/{id}` (served via `index.php?rest_route=…`).
The **MCP Adapter is not on this hop.** The adapter is the *separate*
agent-tool-access path and only ever engages when it is installed, reachable, and
the site URL is public. Confirmed by a live traffic capture (below) and by a
Codex convergence round.

---

## Code trace (each hop, all at `origin/main`)

Repos: `wordpress-mcp-connector@a527015`, `wordpress-agent@2064011`.

1. **Widget → Cinatra only.** The floating widget (the `wordpress-plugin`) streams
   to the Cinatra instance behind a short-lived token handshake. It never issues
   a WordPress REST call itself.

2. **Cinatra widget-chat tool.**
   `wordpress-mcp-connector/src/widget-chat-tool.ts:46` builds the LLM
   function-tool `wordpress_content_editor_run`; its `execute()`
   (`:71`) calls `handlers.wordpress_content_editor_run(...)`.

3. **Connector handler → WayFlow agent (Cinatra→Cinatra, NOT WordPress).**
   `src/mcp/handlers.ts:307` dispatches an A2A call to the WayFlow
   `wordpress-agent` via `getWordPressDeps().dispatchContentEditor(...)`, default
   URL `http://localhost:3010/agents/cinatra-ai/wordpress-agent`
   (`handlers.ts:317`). No WordPress hop here.

4. **The agent's tools.** `wordpress-agent/skills/wordpress-agent/SKILL.md`
   instructs the content-editor agent: STEP 1 call **`wordpress_post_get`**,
   STEP 2 call **`wordpress_post_update`** — "the primitive uses it to pick the
   correct REST route (`/pages/{id}` for pages, `/posts/{id}` for posts)". The
   `wordpress-agent/cinatra/oas.json` `edit` node POSTs to
   `{{CINATRA_BASE_URL}}/api/llm-bridge` with `agent_id: wordpress-content-editor`.

5. **Primitives → host content provider.**
   `handlers.ts:237` `wordpress_post_get` → `getWordPressDeps().readPost`;
   `handlers.ts:278` `wordpress_post_update` → `getWordPressDeps().updatePost`.
   `src/register.ts` (`buildWordPressContentProvider`, provider "flip" per
   `cinatra#975`) binds the `@cinatra-ai/host:wordpress-content` capability's
   `readPost → client.readWordPressPost` and `updatePost → client.updateWordPressPost`,
   backed by the connector-owned client.

6. **The outbound HTTP.** `src/lib/wordpress-client.ts`:
   - `buildRESTEndpoint()` (`:568`) → `${siteUrl}/index.php?rest_route=/wp/v2{route}`.
   - `resolveWordPressBasicAuth()` (`:475`) → `Authorization: Basic base64(user:appPassword)`
     (the Application Password, resolved host-side from Nango/DB).
   - `readWordPressPost()` → `GET …/wp/v2/posts/{id}?context=edit`.
   - `updateWordPressPost()` → `POST …/wp/v2/posts/{id}` with title/content/status.
   No MCP adapter anywhere in this path.

### The separate path that DOES use the adapter (agent tool access)

`src/mcp/toolbox.ts` `createWordPressExternalMcpToolbox()` injects one external
**MCP server tool per instance** into Cinatra's LLM toolbox — but **only** when
`deps.probeMcpAdapter(instance) === "registered"` (`toolbox.ts:102`) **and** the
site URL is public (private/local URLs are skipped, `toolbox.ts:72`). Its
`serverUrl` is `deps.resolveMcpServerUrl(...)` — the adapter's MCP endpoint, a
different URL from `/wp/v2/*`. This is the "give your Cinatra **agents** tool
access to your WordPress site" capability. It is not invoked by the in-admin
content-editor path.

---

## Live traffic capture

Because the shipped `wp-drupal-uat` harness uses a **scripted** LLM provider and
"does not exercise a real CMS mutation via WayFlow", it could not settle this. So
this proof ran the **real, unmodified** connector REST client against a real
WordPress.

**Method.** A real WordPress 6 container (`:8083`) with a seeded published post
and an Application Password. The **actual** `origin/main`
`wordpress-mcp-connector/src/lib/wordpress-client.ts` (git blob `54b0a6b6`) was
bundled and instantiated with a stub host context whose Nango credential lookup
returns the real Application Password — **every URL, auth header, and fetch is the
client's own code**. Driven exactly as `SKILL.md` prescribes: STEP 1
`readWordPressPost` (`wordpress_post_get`), then STEP 2 `updateWordPressPost`
(`wordpress_post_update`) with the demote-then-edit (`status:draft`) applied to a
published post. A capturing proxy sat on the wire; the WordPress apache access log
gives the independent server-side view. (See `run.cjs`, `captured-wire.jsonl`,
`wp-apache-access.log`.)

**Captured outbound wire (Cinatra client → WordPress) — exactly two requests:**

```
#1  GET  /index.php?rest_route=/wp/v2/posts/4&context=edit
        originator : cinatra connector REST client (createWordPressClient)
        auth       : Basic base64(admin:<app-password>)
        response   : HTTP 200
#2  POST /index.php?rest_route=/wp/v2/posts/4
        originator : cinatra connector REST client (createWordPressClient)
        auth       : Basic base64(admin:<app-password>)
        body       : {"title":"…","content":"…","status":"draft"}
        response   : HTTP 200   (WordPress created a revision; post demoted to draft)
```

**WordPress apache access log (server's own record; harness = user-agent `node`,
authenticated user `admin`):**

```
… "GET  /index.php?rest_route=%2Fwp%2Fv2%2Fposts%2F4&context=edit HTTP/1.1" 200 … "node"
… "POST /index.php?rest_route=%2Fwp%2Fv2%2Fposts%2F4 HTTP/1.1" 200 … "node"
```

**Adapter-endpoint check:** requests to `/wp/v2/(posts|pages)/{id}` = **2**;
requests to any MCP-adapter/MCP endpoint = **0**.

The client also logged its own outbound endpoint via `ctx.logger.capture`
(`writeWordPressLogFile`): `endpoint: …/index.php?rest_route=/wp/v2/posts/4`,
`method: POST`, `username: admin`.

---

## Codex convergence (captured)

Codex confirmed verdict **(b)** and added:
- **(i)** No config flag makes the in-admin edit hop traverse the adapter.
  Installing/registering the MCP Adapter enables the separate external-MCP toolbox
  path; it does not reroute `wordpress_post_get` / `wordpress_post_update` or the
  `@cinatra-ai/host:wordpress-content` provider.
- **(ii)** Even if adapter tools were injected to agents, the content-editor flow
  calls `wordpress_post_get`/`wordpress_post_update` → the REST client, so the wire
  is unchanged. Using the adapter would require a different, deliberately-selected
  tool path — not this prescribed content-editor path.
- **(iii)** Precision: the credential source is "Nango-resolved WordPress
  Application Password credentials"; the wire auth is standard WP Application
  Password Basic auth.
