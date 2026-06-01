# Connecting ChatGPT connectors

ChatGPT-style Model Context Protocol (MCP) connectors materialise the remote server's primitives as OpenAI function tools and let the chat model call them. Cinatra's MCP server is reachable from those connectors, but there are two practical limits to know about before you wire it up.

---

## Setup

The connector configuration in a ChatGPT-style client points at Cinatra's MCP endpoint:

```
https://<your-cinatra>/api/mcp
```

Authentication follows the same OAuth flow as any other client. See [Authentication](../authentication.md).

For local development the same `http://localhost:3000/api/mcp` works if the ChatGPT client supports loopback callbacks. If it doesn't, run Cinatra behind a tunnel of your choice (Tailscale Funnel (a public-internet tunnel), named Cloudflare Tunnel, ngrok reserved domain, …) and save the public URL at `/configuration/development?tab=tunnel`.

## The 128-tool cap

OpenAI's function-tool surface caps at 128 tools per request. Cinatra's primitive catalog already exceeds that cap and continues to grow. Connectors that materialise the entire catalog as function tools will silently drop primitives past the limit.

Two ways to handle this:

- **Use a connector that supports native MCP transport.** A native-MCP client (rather than a function-tool wrapper) doesn't hit the cap. Check the connector's documentation for which mode it uses.
- **Filter the primitives the connector exposes.** Some connectors let you specify which primitive names to surface. Pin to the subset your workflow actually needs (`agent_run`, `agent_run_get`, `agent_list`, plus the connector primitives you care about).

If the connector exposes everything by default and offers no filter, primitives near the tail of the published list — typically the trigger and dashboard primitives — may not be visible to the model.

## What you can do from a ChatGPT connector

Once connected, the model can:

- Start an agent run with `agent_run`.
- Poll status with `agent_run_get` until `status` is `completed`, `failed`, or `pending_approval`.
- Resume a `pending_approval` run by sending the right resume payload with `agent_run_resume`.
- Read the run's messages with `agent_run_messages_list`.
- List installed agents, lists, objects, skills, dashboards.
- Call any of Cinatra's connector primitives (Gmail, Apollo, WordPress, LinkedIn, etc.).

See [Agent runs over MCP](../agent-runs-over-mcp.md) for the full run lifecycle from the client side.

## Authorization is the same as in the UI

A user account or service account that can't run an agent in Cinatra's own UI can't run it from a ChatGPT connector either. The actor envelope identifies who is calling; the agent's permissions apply equally to both surfaces.

This matters when you give a ChatGPT connector a service-account credential: the service account's scope of access to your Cinatra resources is exactly what it can do over the connector. Admin operations require an admin actor; per-resource permissions still gate per-resource reads.

## When ChatGPT connectors are the wrong fit

A few scenarios where Claude Code (or running directly inside Cinatra's own chat surface) is a better choice:

- You need access to the full primitive catalog rather than a filtered subset. The 128-tool cap on function-tool bridges bites.
- You need realtime streaming UX for long-running runs. The chat connector polls; the platform's own run page streams Agent-User Interaction Protocol (AG-UI) events.
- You need human-in-the-loop (HITL) gates to surface with their typed renderer. The connector can see `pending_approval`, but it cannot render the platform's HITL screens.

---

## Where to go next

- The full client-agnostic primitive catalog: [The external MCP server](../external-server.md)
- Resuming a run that's waiting at an HITL gate: [Agent runs over MCP](../agent-runs-over-mcp.md)
- Claude Code as an alternative: [Connecting Claude Code](claude-code.md)
