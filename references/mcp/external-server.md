# The external MCP server

Cinatra's MCP server is mounted at `/api/mcp` on the same Next.js app that serves the UI. There is no separate process. The same hostname, the same authentication surface, the same Postgres database.

This page covers what the server exposes, how the transport works, and how the primitive surface is organised.

---

## Endpoint

`POST /api/mcp` — JSON-RPC envelope, MCP transport. Streaming responses use the standard MCP transport mechanics; non-streaming responses return the JSON-RPC result inline.

The route is wired in `src/app/api/mcp/route.ts` and delegates to the `mcpServerMount` in `src/lib/mcp-server.ts`. The in-process deterministic clients described in [Internal architecture](internal-architecture.md) share the same handler families and the same Zod schemas as the external surface, so external and internal callers see the same primitive catalog and the same validation rules.

## Authentication

External clients authenticate with a Bearer JSON Web Token (JWT) issued by Cinatra's Better Auth (the auth server library Cinatra uses) OAuth-provider plugin. See [Authentication](authentication.md) for the OAuth flow, where to register a client, and the JWT format.

## Primitive catalog

The server exposes primitives across the platform's domain packages:

- **Agents** — list, get, run, poll, resume, list runs, list messages.
- **Lists & objects** — typed CRUD plus list-membership operations.
- **Skills** — catalog, installed, personal, match-evaluation.
- **Extensions** — install, archive, restore, search.
- **Connectors** — each connector contributes its own operations (Gmail send, Apollo people search, WordPress create-draft, and so on).
- **Dashboards** — list, get, create, update, publish, archive.
- **Metrics** — cost and usage queries, time series, by-agent / by-provider rollups.
- **Permissions** — invite, member updates, platform-role changes.
- **Chat** — thread list, get, send, pause/resume the assistant.

The full live list comes back over the MCP `tools/list` call. Each primitive declares its input schema (Zod-validated) and a description; the large language model (LLM) or the human reads those and picks the right one.

Primitive names follow the convention `<domain>_<resource>_<action>` — for example `agent_run`, `accounts_list`, `wordpress_post_create_draft`. See [Primitives](primitives.md) for the naming rules and the actor-context envelope every primitive receives.

> [!NOTE]
> A connector's primitives can carry capability gaps an external caller should know about. For example, Cinatra's WordPress primitives are page-aware primitive by primitive: over `/api/mcp` you can read and update a WordPress *page* today by passing `postType: "page"` with a known page ID, while page listing (a dedicated `wordpress_pages_list` primitive) and page-aware status/delete have landed in the connector's `main` and ship in the next connector release; drafting a page stays post-only. See the [WordPress page contract](../platform/integrating-with-a-cms.md#wordpress-pages-vs-posts-the-current-page-contract) for the details and current limits.

## Same primitive contract, different surfaces

The MCP server is the *one* capability surface Cinatra exposes externally. The chat assistant inside the app uses it. The `/agents` UI uses it. The built-in agent runtime uses it. An external Claude Code instance uses it. A ChatGPT connector uses it. All these paths converge on the same primitive contract — same primitive names, same Zod input schemas, same handler functions.

This is intentional. There is no "internal API" that does more than the external one, and no "external API" with fewer capabilities than the internal one. When the chat assistant can call `agent_run`, you can too.

The path-specific bits — which actor envelope a call carries, where its audit row lands — depend on the entry point. Most authoritative-actor primitives (agents, dashboards, the agent-builder surface) propagate the OAuth/session actor end-to-end. A few connector and entity primitives currently register with a fixed actor (`{ actorType: "model", source: "agent" }`) intended for in-platform LLM tool use; running those over the external MCP surface still works for capabilities they don't gate per-actor, but the per-actor authorization model is not uniform across every primitive yet. See [Primitives](primitives.md) for which categories propagate the actor and which don't.

## What the server does not do

A few capabilities live outside the MCP surface by design:

- **Long-running streaming UIs.** The agent run page streams Agent-User Interaction Protocol (AG-UI) events over a separate server-sent events (SSE) channel; the MCP primitive `agent_run_get` is the polling/get pair, not a streaming event consumer. See [Agent runs over MCP](agent-runs-over-mcp.md) for the resume contract.
- **Authentication itself.** Better Auth's OAuth endpoints live at `/api/auth/*` — the MCP server only consumes the JWTs they issue.
- **The realtime notifications feed.** It lives at `/notifications` with Postgres `LISTEN/NOTIFY` push, not over MCP.

---

## Where to go next

- The auth surface: [Authentication](authentication.md)
- The primitive contract: [Primitives](primitives.md)
- The internal architecture that backs these primitives: [Internal architecture](internal-architecture.md)
