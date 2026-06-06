# Connecting Claude Desktop

Claude Desktop connects to Cinatra as a **custom remote connector** — it speaks the Model Context Protocol (MCP) directly to Cinatra's `/api/mcp` endpoint over HTTPS, authenticating with the OAuth flow rather than a local stdio bridge.

This page covers the endpoint, the auth flow, and the limitations. For the hands-on click-through (where to copy the URL, what to click in Claude), see the user-guide page [Use Cinatra from Claude Desktop, Codex, and other MCP clients](../../../guides/user/mcp-clients.md).

---

## Local development

Claude Desktop's custom-connector UI **requires an `https://` URL** and rejects a plain `http://localhost` endpoint — entering a non-HTTPS URL surfaces a "URL must start with https" message, and a tunnel whose host doesn't match the OAuth audience can trip an `invalid_redirect_uri` error.

So for a pure-localhost dev box, you have two choices:

- **Use the `mcp-remote` bridge instead of the custom-connector UI.** Claude Code's `mcp-remote` setup speaks to `http://localhost:3000/api/mcp` directly, no tunnel and no HTTPS required. See [Connecting Claude Code](claude-code.md) and the localhost workaround in [Testing assistants locally](testing-assistants-locally-with-claude.md).
- **Put your dev server behind an HTTPS tunnel** and use the custom-connector UI as in production (below).

## Production / remote instance

For a Cinatra instance reachable over a public HTTPS URL, Claude Desktop connects through its custom-connector UI:

1. Copy the **MCP Server URL** — a `<public-base-url>/api/mcp` value — from the in-app **Claude Desktop** connector page (`/connectors/cinatra-ai/mcp-client-registry-connector/setup`).
2. In Claude, add it under **Settings → Connectors → Add custom connector**.
3. Complete the OAuth sign-in to your Cinatra instance and click **Connect**.

The `<public-base-url>` is the workspace's public MCP base URL (`getPublicMcpServerUrl()`), set by an operator at `/configuration/development?tab=tunnel`. Until it is set, the connector page shows a "Public URL not configured" warning instead of the copy panel.

Authentication uses a Bearer JSON Web Token (JWT) issued by Cinatra's OAuth provider. Claude Desktop self-registers via dynamic client registration (RFC 7591) and signs in over OAuth — no operator pre-provisioning. Authorization mirrors the UI: the connected client can do exactly what the signed-in account can do, nothing more. For the full flow, see [Authentication](../authentication.md).

## When you need a tunnel

Because the custom-connector UI requires HTTPS, any instance that isn't already served over `https://` needs a public HTTPS endpoint that forwards to it. Cinatra does not ship a built-in tunnel — bring your own (Tailscale Funnel (a public-internet tunnel), a named Cloudflare Tunnel, ngrok with a reserved domain, etc.), then save the public URL at `/configuration/development?tab=tunnel`. See [Reaching your instance over a public URL](../../../guides/hosting/mcp-public-url.md).

For a same-machine dev box where you'd rather not run a tunnel, use the `mcp-remote` path in [Connecting Claude Code](claude-code.md) instead.

## What you'll see in Claude Desktop

Once connected, Cinatra's primitives appear as MCP tools in Claude Desktop. Claude can start agent runs, read lists and objects, and call connectors. See [The external MCP server](../external-server.md) for the catalog and [Agent runs over MCP](../agent-runs-over-mcp.md) for the run lifecycle.

The same in-app **Claude Desktop** connector page that gives you the URL also lists connected clients and lets an admin disconnect one (revoking that client's OAuth access). Note the list is name-filtered — it shows clients whose registered name contains "claude" — so a non-Claude client may be connected and serving without appearing there.

## Known limitations

- **HTTPS only.** The custom-connector UI rejects non-HTTPS URLs. For localhost without HTTPS, use [`mcp-remote`](claude-code.md).
- **Authorization is the account's authorization.** A client can't do anything the signed-in account can't do in the UI. Admin-gated primitives require an admin actor.
- **Connected-clients list is name-filtered.** The connector page lists clients whose name contains "claude"; other clients served by the same endpoint may not appear there.
- **Run streaming.** Like other external clients, Claude Desktop polls run status (`agent_run_get`) rather than receiving the live Agent-User Interaction Protocol (AG-UI) event stream. For watch-style UX, open the Cinatra run page directly.

---

## Where to go next

- The hands-on walkthrough: [Use Cinatra from Claude Desktop, Codex, and other MCP clients](../../../guides/user/mcp-clients.md)
- The auth flow in detail: [Authentication](../authentication.md)
- The full primitive catalog: [The external MCP server](../external-server.md)
- Connecting Codex: [Connecting Codex](codex.md)
- The CLI / localhost `mcp-remote` alternative: [Connecting Claude Code](claude-code.md)
