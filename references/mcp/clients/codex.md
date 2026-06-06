# Connecting Codex

Codex (the OpenAI `codex` CLI) connects to Cinatra as a **remote streamable-HTTP MCP server** — it speaks the Model Context Protocol (MCP) directly to Cinatra's `/api/mcp` endpoint and signs in over OAuth, the same auth path every other Cinatra MCP client uses.

This page covers the `codex mcp` commands, where the configuration is persisted, the bearer-token alternative, and the limitations. For the hands-on walkthrough, see the user-guide page [Use Cinatra from Claude Desktop, Codex, and other MCP clients](../../../guides/user/mcp-clients.md).

---

## Local development

Codex's remote-server login expects an `https://` URL. For a Cinatra dev server with no HTTPS, put it behind a tunnel (see [When you need a tunnel](#when-you-need-a-tunnel)) or use the `mcp-remote` localhost bridge documented in [Connecting Claude Code](claude-code.md) instead.

## Production / remote instance

Register Cinatra as a remote MCP server and sign in:

```bash
codex mcp add cinatra --url https://<your-instance>/api/mcp
codex mcp login cinatra
```

- `codex mcp add cinatra --url …` registers a streamable-HTTP MCP server named `cinatra`.
- `codex mcp login cinatra` runs the OAuth sign-in to your Cinatra instance.

The `<your-instance>` host is the workspace's public MCP base URL, set by an operator at `/configuration/development?tab=tunnel`; the value to use is the **MCP Server URL** shown on the in-app **Claude Desktop** connector page (`/connectors/cinatra-ai/mcp-client-registry-connector/setup`).

Authentication uses a Bearer JSON Web Token (JWT) issued by Cinatra's OAuth provider. Codex self-registers via dynamic client registration (RFC 7591) and signs in over OAuth — no operator pre-provisioning. Authorization mirrors the UI: the connected client can do exactly what the signed-in account can do. For the full flow, see [Authentication](../authentication.md).

## Where the configuration lives

`codex mcp add` persists the server to `~/.codex/config.toml` under a `[mcp_servers.cinatra]` table. You can inspect or hand-edit that block; the `codex mcp` subcommands manage it for you.

## Verifying the connection

```bash
codex mcp list
codex mcp get cinatra
```

`codex mcp list` shows all registered MCP servers; `codex mcp get cinatra` shows the `cinatra` entry's details and connection status. To disconnect:

```bash
codex mcp remove cinatra
```

## The bearer-token alternative

If you'd rather use a static bearer token than the interactive OAuth login, `codex mcp add` accepts a `--bearer-token-env-var` option that names an environment variable holding the token. This skips `codex mcp login`. Use OAuth (`codex mcp login`) unless you specifically need a non-interactive static token.

## When you need a tunnel

Codex talks to Cinatra over a public HTTPS URL. If your instance isn't already served over `https://`, you need a public HTTPS endpoint that forwards to it. Cinatra does not ship a built-in tunnel — bring your own (Tailscale Funnel (a public-internet tunnel), a named Cloudflare Tunnel, ngrok with a reserved domain, etc.), then save the public URL at `/configuration/development?tab=tunnel`. See [Reaching your instance over a public URL](../../../guides/hosting/mcp-public-url.md).

## What you'll see in Codex

Once connected, Cinatra's primitives appear as MCP tools available to Codex — start agent runs, read lists and objects, call connectors. See [The external MCP server](../external-server.md) for the catalog and [Agent runs over MCP](../agent-runs-over-mcp.md) for the run lifecycle.

## Known limitations

- **Remote-HTTP MCP + OAuth login in Codex is relatively new.** The `codex mcp add --url` / `codex mcp login` flow for remote streamable-HTTP servers is newer than the local-stdio MCP support; if a command behaves differently than documented here, check the [official Codex MCP docs](https://developers.openai.com/codex/mcp). Names and flags above match Codex at the time of writing.
- **Authorization is the account's authorization.** A client can't do anything the signed-in account can't do in the UI. Admin-gated primitives require an admin actor.
- **Connected-clients list is name-filtered.** The in-app connector page lists clients whose registered name contains "claude", so a Codex client (registered under a different name) may be connected and working without appearing in that on-page management list.
- **Run streaming.** Like other external clients, Codex polls run status (`agent_run_get`) rather than receiving the live Agent-User Interaction Protocol (AG-UI) event stream. For watch-style UX, open the Cinatra run page directly.

---

## Where to go next

- The hands-on walkthrough: [Use Cinatra from Claude Desktop, Codex, and other MCP clients](../../../guides/user/mcp-clients.md)
- The auth flow in detail: [Authentication](../authentication.md)
- The full primitive catalog: [The external MCP server](../external-server.md)
- Connecting Claude Desktop: [Connecting Claude Desktop](claude-desktop.md)
- The CLI / localhost `mcp-remote` alternative: [Connecting Claude Code](claude-code.md)
