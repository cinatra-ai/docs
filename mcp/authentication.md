# Authentication

External Model Context Protocol (MCP) clients authenticate with a Bearer JSON Web Token (JWT) issued by Cinatra's Better Auth (the auth server library Cinatra uses) OAuth-provider plugin. The same plugin authenticates agent-to-agent (A2A) protocol traffic into `/api/a2a`, so an OAuth client registered against your instance works for both surfaces with the same credentials.

---

## Where the OAuth provider lives

The plugin is configured inside `src/lib/auth.ts` and mounted at `/api/auth/*` alongside Better Auth's normal endpoints. Discovery documents are exposed at:

- `/.well-known/oauth-authorization-server` — OAuth 2.1 server metadata
- `/.well-known/oauth-protected-resource` — protected-resource metadata for clients that auto-discover

An MCP client that supports OAuth auto-discovery (Claude Code's `mcp-remote`, several ChatGPT connector flows) reads these documents and finds the token endpoint and audience without manual configuration.

## The flow

1. The MCP client opens the OAuth flow against your Cinatra instance.
2. The user logs in (Better Auth session, possibly with passkey / 2FA depending on configuration).
3. The OAuth provider issues a JWT with an audience that matches the instance's canonical origin (tunnel-safe — the audience reflects the public-facing URL, not whichever proxy host the request hit).
4. The MCP client stores the JWT and sends it in the `Authorization: Bearer <jwt>` header on every MCP call.
5. The JWT is verified on every call. When it expires, the client refreshes through the same flow.

## What the JWT carries

The JWT identifies the user (or service account) and the OAuth client. The MCP server resolves both into an **actor context** — a typed envelope (`PrimitiveActorContext`) that every primitive handler receives. The actor carries:

- `source` — one of `"ui"`, `"route"`, `"worker"`, `"scheduler"`, `"agent"`, `"a2a"`, `"mcp"`.
- The user identity (or service-account identity).
- The org / team / project / workspace context the call runs in.

Authorization runs against the actor. A user who can't read an agent in the UI can't read it over MCP either. The two paths are unified.

## Local development

For local development the loopback origin (`http://localhost:3000`) is treated specially:

- **First-user-as-admin.** The first user to register on a fresh instance becomes the platform admin (Better Auth `admin` plugin).
- **Dev-admin bypass.** When running on `127.0.0.1` / `localhost`, an admin session can call admin-gated MCP handlers without registering an OAuth client. This is loopback-gated and never engages in production.

The shared dev bridge-token bypass and the XFF loopback fallback have been intentionally removed (the bridge between WayFlow (Cinatra's OAS Flow agent runtime) and the host app uses a separate per-deployment shared secret described in [Security](../developer/security.md)).

## Client registration

The OAuth provider supports **dynamic client registration** (RFC 7591). A new MCP client can register itself against `/api/auth/oauth2/register` without prior credentials and receive a client-id / client-secret pair. Auto-discovering MCP clients (`mcp-remote`, several ChatGPT connector flows) use this path so end users don't have to provision a client manually before connecting.

For deployments that need to disable self-registration, the relevant Better Auth plugin flags are `allowDynamicClientRegistration` and `allowUnauthenticatedClientRegistration` in `src/lib/auth.ts`. Both default to enabled.

## Tokens and rotation

The OAuth provider issues both access tokens and refresh tokens. Default TTLs are:

- **Access tokens** — 30 days.
- **Refresh tokens** — 1 year.

Clients exchange refresh tokens for new access tokens through the standard `refresh_token` grant. The full grant-type set is `authorization_code`, `client_credentials`, and `refresh_token`. Long TTLs are deliberate — they let MCP clients survive across dev sessions without re-running the browser flow.

For dev workflows that need a public URL, bring your own tunnel (Tailscale Funnel (a public-internet tunnel), named Cloudflare Tunnel, ngrok) and save the URL at `/configuration/development?tab=tunnel`.

---

## Where to go next

- Connecting Claude Code with `mcp-remote`: [Connecting Claude Code](clients/claude-code.md)
- The actor envelope every primitive sees: [Primitives](primitives.md)
- The shared auth model with A2A: [Cross-instance collaboration](../developer/cross-instance-collaboration.md)
