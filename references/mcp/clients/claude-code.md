# Connecting Claude Code

Claude Code (the Anthropic CLI / IDE extension) connects to Cinatra over `mcp-remote`, a thin HTTP-to-stdio bridge that lets the Claude Code Model Context Protocol (MCP) client speak to the remote `/api/mcp` endpoint as if it were a local stdio MCP server.

This page walks the local-dev and production setup.

---

## Local development

For a Cinatra dev server running on `localhost:3000`, the simplest configuration is:

Add an MCP server entry to your Claude Code config pointing at:

```
npm exec mcp-remote http://localhost:3000/api/mcp
```

Claude Code launches `mcp-remote` on demand. The first call triggers the OAuth flow:

1. `mcp-remote` opens a browser window to Cinatra's OAuth authorization endpoint.
2. You log in (or accept the session that's already there).
3. The authorization callback returns to `mcp-remote`'s loopback listener.
4. `mcp-remote` stores the JSON Web Token (JWT) and returns the MCP tool list to Claude Code.

From this point Claude Code sees every Cinatra primitive — `agent_run`, `accounts_list`, `wordpress_site_tool_call`, the lot. See [The external MCP server](../external-server.md) for the catalog.

When the JWT expires, `mcp-remote` re-runs the flow automatically.

## Production / remote instance

For a Cinatra instance reachable over a public URL:

```
npm exec mcp-remote https://<your-cinatra>/api/mcp
```

The flow is the same. The OAuth callback uses your real hostname; the JWT's audience matches.

## When you need a tunnel

If your Cinatra dev server isn't reachable from where Claude Code runs (e.g., you want a remote desktop instance to call your local dev box), you need a public HTTPS endpoint that forwards to `http://localhost:3000`. Cinatra does not ship a built-in tunnel — bring your own (Tailscale Funnel (a public-internet tunnel), a named Cloudflare Tunnel, ngrok with a reserved domain, etc.), then paste the public URL into `/configuration/development?tab=tunnel`.

For pure localhost-to-localhost setups (dev server and Claude Code on the same machine), no tunnel is needed.

## What you'll see in Claude Code

Once connected, every Cinatra primitive appears in Claude Code's tool list, prefixed with the MCP server name you configured (often `cinatra__...`). The descriptions come from the Zod schemas in each handler. The validation errors come back as standard MCP `tools/call` failures.

Claude Code's reasoning over the primitive catalog works the same way the platform's own chat assistant does. The MCP-injection contract is the same; the OAuth audience is the same; the actor envelope is the same.

## Known limitations

- **Function-tool cap.** OpenAI's function-tool surface caps at 128 tools per request and Cinatra's primitive catalog already exceeds that. Claude Code does not hit this cap (it uses native MCP tool support), but a ChatGPT-style connector that materialises primitives as function tools does — see [Connecting ChatGPT connectors](chatgpt-connectors.md).
- **Run streaming.** Claude Code receives `agent_run_get` polling results, not the live Agent-User Interaction Protocol (AG-UI) event stream. For watch-style UX, open the Cinatra run page directly. See [Agent runs over MCP](../agent-runs-over-mcp.md).

---

## Where to go next

- The auth flow in detail: [Authentication](../authentication.md)
- Running an agent from Claude Code: [Agent runs over MCP](../agent-runs-over-mcp.md)
