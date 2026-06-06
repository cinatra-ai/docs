# Use Cinatra from Claude Desktop, Codex, and other MCP clients

Cinatra exposes every capability it has — running agents, reading objects and lists, calling connectors — as a Model Context Protocol (MCP) server at `/api/mcp`. That means you can drive your Cinatra workspace from an external MCP client instead of (or alongside) the Cinatra UI.

The in-app connector page is labelled **"Claude Desktop"**, but it is really the front door for *any* MCP client. The same MCP URL works with **Claude Desktop**, **Codex** (the OpenAI CLI), **Claude.ai**, **ChatGPT**, and any custom MCP-aware agent. This page walks the two most common setups — Claude Desktop and Codex — and points you at the others.

Whatever client you connect, **authorization mirrors the UI**: a client only gets what the signed-in account can do in Cinatra. Signing in over OAuth is what grants access — the connector page itself doesn't hand out permissions.

---

## Prerequisites

- **A public MCP base URL must be set.** An admin or operator sets the workspace's public MCP base URL at `/configuration/development?tab=tunnel` (also reachable at **Administration → MCP server**, `/configuration/mcp`). Until it is set, the connector page shows a **"Public URL not configured"** warning instead of the copy panel, and external clients have nothing to point at. See [Reaching your instance over a public URL](../hosting/mcp-public-url.md) for bringing a tunnel.
- **OAuth is built in.** You do not provision a client by hand. Cinatra's OAuth provider supports dynamic client registration, so the client self-registers and signs you in the first time it connects. See [Authentication](../../references/mcp/authentication.md) for the flow.
- **Most clients need HTTPS.** Claude Desktop's custom-connector UI and Codex's remote-server login expect an `https://` public URL. For a pure-localhost dev box with no HTTPS, use the `mcp-remote` bridge described in [Connecting Claude Code](../../references/mcp/clients/claude-code.md) instead.

---

## Connect Claude Desktop

1. **Open the connector page in Cinatra.** Go to **Connectors → Claude Desktop** (`/connectors/cinatra-ai/mcp-client-registry-connector/setup`).
2. **Copy the MCP Server URL.** The page shows your **MCP Server URL** — a `<public-base-url>/api/mcp` value. Use the copy button.
3. **Add it as a custom connector in Claude.** In Claude, open **Settings → Connectors → Add custom connector**, paste the URL, and confirm. Claude Desktop custom connectors require an `https://` URL; a non-HTTPS URL is rejected (and can surface as an `invalid_redirect_uri` error). If you hit that, see [Testing assistants locally](../../references/mcp/clients/testing-assistants-locally-with-claude.md) for the localhost workaround. For Claude's own click-path, follow [Anthropic's custom-connector quickstart](https://support.anthropic.com/en/articles/11175166-about-custom-connectors-remote-mcp).
4. **Sign in and connect.** Complete the OAuth sign-in/consent to your Cinatra instance, then click **Connect**. That consent step is what grants the client access.

Claude can now call your Cinatra agents and primitives over MCP — start agent runs, read lists and objects, call connectors. For the protocol-level details and limitations, see [Connecting Claude Desktop](../../references/mcp/clients/claude-desktop.md).

---

## Connect Codex

Codex (the OpenAI `codex` CLI) supports remote streamable-HTTP MCP servers with OAuth sign-in.

1. **Register the server.** Point Codex at your instance's MCP endpoint:

   ```bash
   codex mcp add cinatra --url https://<your-instance>/api/mcp
   ```

2. **Sign in.** Run the OAuth login to your Cinatra instance:

   ```bash
   codex mcp login cinatra
   ```

3. **Verify it's connected.**

   ```bash
   codex mcp list
   codex mcp get cinatra
   ```

4. **Disconnect when you're done.**

   ```bash
   codex mcp remove cinatra
   ```

Codex persists the server under `[mcp_servers.cinatra]` in `~/.codex/config.toml`. A `--bearer-token-env-var` option exists if you prefer a static bearer token over the OAuth login. Remote-HTTP MCP and OAuth login in Codex are relatively new — if a command behaves differently than above, check the [official Codex MCP docs](https://developers.openai.com/codex/mcp). For the full reference, see [Connecting Codex](../../references/mcp/clients/codex.md).

---

## Claude.ai and ChatGPT

The same `<public-base-url>/api/mcp` endpoint serves browser-based clients too:

- **Claude.ai** — add Cinatra as a custom connector the same way as Claude Desktop (Settings → Connectors → Add custom connector), pasting the MCP Server URL and completing the OAuth sign-in.
- **ChatGPT** — wire Cinatra in as an MCP connector. ChatGPT-style connectors materialise primitives as function tools, which has a couple of practical limits worth knowing first. See [Connecting ChatGPT connectors](../../references/mcp/clients/chatgpt-connectors.md).

---

## Manage connected clients

The **Claude Desktop** connector page (`/connectors/cinatra-ai/mcp-client-registry-connector/setup`) does two things: it lets you **copy the MCP Server URL**, and it lists and lets you **disconnect** connected clients. Disconnecting revokes that client's OAuth access immediately; it is an admin (`manage`-gated) action, and system-managed clients can't be disconnected here.

One caveat to know: the connected-clients list is **filtered by name** — it shows clients whose registered name contains "claude". A Codex or ChatGPT client that registers under a different name is connected and working, but may **not appear** in that on-page list even though the MCP endpoint is serving it. Don't expect every client to show up there.

---

## Where to go next

- **Claude Desktop reference** — endpoint, OAuth, HTTPS requirement, limitations: [Connecting Claude Desktop](../../references/mcp/clients/claude-desktop.md)
- **Codex reference** — `codex mcp` commands, config persistence, bearer-token option: [Connecting Codex](../../references/mcp/clients/codex.md)
- **Claude Code (CLI) and pure-localhost dev** — the `mcp-remote` bridge: [Connecting Claude Code](../../references/mcp/clients/claude-code.md)
- **How the OAuth flow works** — bearer JWTs, dynamic registration: [Authentication](../../references/mcp/authentication.md)
- **What the MCP server exposes** — the full primitive catalog: [The external MCP server](../../references/mcp/external-server.md)
- **Bringing a public URL** — tunnels and the public MCP base URL: [Reaching your instance over a public URL](../hosting/mcp-public-url.md)
- **Cinatra's outbound connectors** — how the workspace reaches *out* to your tools: [A connected ecosystem of capabilities](connected-ecosystem.md)
