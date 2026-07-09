# How this was captured (runnable)

**Goal:** capture the real outbound HTTP the Cinatra Drupal connector makes *to Drupal*
during an in-admin content edit, to settle whether the edit is written via the Drupal MCP
module (`drupal/mcp_tools`) or via direct REST/JSON:API.

**Real Drupal.** `docker compose --profile drupal up drupal drupal-db` (from
`cinatra-ai/cinatra`) — Drupal 11 on `:8082` with `drupal/mcp_tools` + `mcp_tools_remote`
enabled. The MCP endpoint route is `mcp_tools_remote.handle → /_mcp_tools` (confirmed by
`drush` route list); `/mcp` does not exist (README drift). A read+write remote key was
minted with `drush mcp-tools:remote-key-create --scopes=read,write`.

**Real connector code.** The harness drives the **unmodified `origin/main`** source of
`cinatra-ai/drupal-mcp-connector` (`123b368`):
- `src/lib/drupal-mcp-client.ts` — `callDrupalMcp` (the MCP write client)
- `src/mcp/handlers.ts` — `drupal_node_get` (read) and `drupal_node_update` (write) primitives
- `src/deps.ts` — the host-DI seam

The only change to that source is removing the inert `import "server-only"` client-bundle
guard so it runs under Node/`tsx`. The harness binds the host-DI seam (`buildNangoBearerHeader`
returns the minted key; the `#409` write-authority gate resolves) and then calls the real
`drupal_node_get` → `drupal_node_update` on node 1, exactly as the WayFlow
`drupal-content-editor` agent does (`cinatra-ai/drupal-agent` `SKILL.md` STEP 1 → STEP 3).

**Capture.** A transparent logging reverse proxy sat at `:8092 → :8082`; the connector's
`instance.siteUrl` pointed at the proxy. Every request was logged (method, path, auth
scheme + key-id with the secret redacted, `Accept`, and the JSON-RPC method/tool name);
responses were streamed through untouched (MCP SSE-safe). Drupal's own Apache access log
(`wp-apache-access.log`) independently shows the same hops (User-Agent `node`).

**Files here**
- `TRACE.md` — full code trace + verdict (incl. Codex caveats)
- `captured-wire.jsonl` — the proxy capture (the load-bearing artifact)
- `drupal-apache-access.log` — Drupal-side corroboration (UA `node`; the `401` line is a
  wrong-key negative control from a hand probe)
- `hop-results.json` — the real handlers' return values (write → `revision_id 40`,
  "Content updated successfully.")
- `runner.mts` — the harness
- `grounding-shas.txt` — origin/main SHAs the trace is grounded on
- `codex-verdict.md` — convergence review (AGREE-WITH-CAVEATS)
