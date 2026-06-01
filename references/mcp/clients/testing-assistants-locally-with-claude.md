# Testing Cinatra Assistants Locally with Claude

`scripts/claude-assistant-agent.mts` is a self-contained polling daemon. It uses `client_credentials` OAuth to authenticate, polls for @mentions every 30 seconds, calls the Anthropic API to generate replies, and posts them back.

### Prerequisites

- `CLAUDE_CLIENT_SECRET` — the plaintext client secret printed when you created the assistant in Step 1
- `ANTHROPIC_API_KEY` — an Anthropic API key

### Running it

```bash
CLAUDE_CLIENT_SECRET="<your-secret>" ANTHROPIC_API_KEY="<your-key>" \
  node --experimental-strip-types scripts/claude-assistant-agent.mts
```

Or add both to `.env.local` and run without inline env vars:

```bash
node --experimental-strip-types scripts/claude-assistant-agent.mts
```

The script prints a `.` on each empty poll and logs replies as they are sent. Press `Ctrl+C` to stop.

### How authentication works

The script uses the OAuth `client_credentials` flow with the `resource` parameter set to `http://localhost:3000/api/mcp`. This is required — without `resource`, Better Auth (the auth server library Cinatra uses) issues an opaque token; with it, Better Auth issues a signed JSON Web Token (JWT) that the Model Context Protocol (MCP) server can verify.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "URL must start with https" in Connectors UI | Connectors UI requires HTTPS | Use `claude_desktop_config.json` + `mcp-remote` instead |
| `invalid_redirect_uri` OAuth error | Tunnel URL ≠ localhost OAuth audience | Use `mcp-remote` pointing to `http://localhost:3000` — no tunnel needed |
| "I don't have access to chat_mentions_poll" | `mcpServers` config missing or Claude not restarted | Check config file, fully quit (Cmd+Q) and reopen |
| Tool validation error in console | A tool name contains dots or other invalid chars | Ensure all `server.registerTool()` names match `^[a-zA-Z0-9_-]{1,64}$` |
| @claude doesn't reply | mentionState not set to `pending` | Confirm `chat-page.tsx` sets `mentionState` when routing to external handle |
| Reply attributed to wrong user | Missing `assistantClientId` in tool call | Always pass `assistantClientId` in both `chat_mentions_poll` and `chat_thread_send` |
