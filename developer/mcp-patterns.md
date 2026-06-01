# MCP Patterns

## Cross-package boundaries

When one package orchestrates another package:

- prefer the downstream package's deterministic Model Context Protocol (MCP) client
- route execution through public MCP primitives
- avoid direct imports of downstream internal execution functions

## Typical primitive families

Use public MCP namespaces such as:

- `{package}.source.instance.*`
- `{package}.source.execution.*`
- `{package}.source.results.*`
- `{package}.source.jobs.execution.run`

## Composed-source chaining

A composed source should typically:

1. create downstream instances
2. start downstream execution through deterministic clients
3. poll or subscribe to execution state
4. import or pass data across package boundaries using public primitives
5. persist final results through the package that owns persistence

## LLM provider access via OAuth 2.0 client_credentials

large language model (LLM) providers (OpenAI, Gemini, Anthropic) can connect to the Cinatra MCP server using the OAuth 2.0 `client_credentials` grant. Each provider gets a dedicated OAuth client (`cinatra-llm-openai`, etc.) provisioned via the `/settings/mcp/clients` UI.

### Token issuance: JWT vs opaque

the `oauth-provider` of Better Auth (the auth server library Cinatra uses) issues two token types from `client_credentials`:

| Token request | Token type | Verifiable by |
|---|---|---|
| Without `resource` parameter | Opaque (32-char string) | Introspection only |
| With `resource: <url>` | JSON Web Token (JWT) with `aud` claim | JWKS (offline) |

`verifyMcpAccessToken` uses JWKS verification — it only accepts JWTs. **Always include `resource: getLocalMcpServerUrl("/api/mcp")` in every `client_credentials` token request.**

### validAudiences configuration (RFC 8707)

Better Auth validates the `resource` parameter against `opts.validAudiences`. The default is `[baseURL]` (e.g. `http://localhost:3000`), which does NOT include `/api/mcp`. Without explicit configuration, any token request with `resource: "http://localhost:3000/api/mcp"` fails with `invalid_request: requested resource invalid`.

**Required configuration** in `createMcpServerAuthPlugins` (`packages/mcp-server/src/index.tsx`):
```ts
oauthProvider({
  validAudiences: [getLocalMcpServerUrl(mcpBasePath)],
  // ... other options
})
```

This is correct, intended OAuth 2.0 behavior — not a workaround. Better Auth provides no `defaultAudience` or per-client `audience` field; the `resource` parameter (RFC 8707) is the only mechanism. The opaque token default is a correct security decision: without a declared resource, no `aud` can be set.

### Auth is multi-origin — both local AND the configured public URL are valid audiences

`BETTER_AUTH_URL` typically stays as `http://localhost:3000`. `validAudiences` is computed in `createMcpServerAuthPlugins`:

```ts
const localMcpUrl = getLocalMcpServerUrl(mcpBasePath);            // http://localhost:3000/api/mcp
const publicMcpUrl = getPublicMcpServerUrl();                     // https://<your-tunnel>/api/mcp or null
const validAudiences = publicMcpUrl ? [localMcpUrl, publicMcpUrl] : [localMcpUrl];
```

Both audiences are accepted because callers may send `resource=<local>` (Cinatra-internal token exchange) OR `resource=<public>` (OpenAI's MCP client per RFC 8707). The token still verifies against whichever audience it was issued for.

### Token flow

```
[LLM provider / test route]
  POST /api/auth/oauth2/token
    grant_type=client_credentials
    scope=mcp:connect
    resource=<one of the validAudiences>   ← RFC 8707, triggers JWT
  ↓
  access_token: <JWT with aud=<the requested resource>>
  ↓
[LLM calls public MCP URL with Authorization: Bearer <JWT>]
  ↓
[Operator's tunnel (Tailscale Funnel, named Cloudflare Tunnel, …) forwards to localhost]
  ↓
verifyMcpAccessToken: JWKS verify, audience ∈ validAudiences ✓
```

## UI implications

Background execution UI should reflect package boundaries without bypassing them.

If the execution panel uses a background modal, prefer the established modal-session hook pattern rather than a bare `open` prop when the working reference implementation already uses the session hook.

## Local-dev MCP admin bypass

Claude Code's MCP OAuth tokens don't always carry a fresh `platform_admin` claim (mcp-remote tokens have a 30-day TTL). For local dev work, set:

```bash
# .env.local
CINATRA_MCP_DEV_ADMIN_BYPASS=true
```

When all three guards pass at the MCP transport boundary, the request's `mcpRequestContextStorage.platformRole` is stamped to `"platform_admin"` AND OAuth verification is skipped:

1. `NODE_ENV !== "production"` — never elevates in production builds
2. `CINATRA_MCP_DEV_ADMIN_BYPASS === "true"` — explicit opt-in (separate from `A2A_DEV_BYPASS` / `BETTER_AUTH_DEV_BYPASS` so accidentally enabling one doesn't unlock the other)
3. `isTrustedDevHost(request) === true` — one of:
   - **URL hostname is loopback** (`localhost`, `127.0.0.1`, `::1`, `host.docker.internal`) AND any present `x-forwarded-host` value parses to either loopback (Turbopack dev-proxy compat) OR an entry in `CINATRA_MCP_DEV_TRUSTED_HOSTS` (the local-reverse-proxy topology used by Tailscale Funnel (a public-internet tunnel)/Serve, named Cloudflare Tunnel, and similar: TLS terminates at the public edge, connection to localhost listener sets `Host: localhost` and `X-Forwarded-Host: <public-hostname>`). Present-but-malformed forwarded values veto.
   - **URL hostname literally appears in the allowlist** (the direct-Host-preserved topology — fewer proxies use this shape). `x-forwarded-host` is ignored on this path so a spoofed forwarded header cannot rescue a non-loopback URL host.

### Extending trust beyond loopback

When you run a stable dev tunnel (Tailscale Serve, named Cloudflare Tunnel, ngrok stable subdomain) the request arrives with `x-forwarded-host` set to your tunnel hostname — not loopback — so the dev bypass would not fire and admin handlers would 401 once the 30-day OAuth token expired. To extend trust to that hostname, add it explicitly:

```bash
# .env.local — comma-separated list, exact hostname match
CINATRA_MCP_DEV_TRUSTED_HOSTS=my-box.foo.ts.net,my-tunnel.cinatra.dev
```

**When to use:**

- Your dev MCP server is reachable on a stable external hostname that you control AND you accept that any caller who can reach that hostname becomes an unauthenticated platform admin.

**What it grants:**

- Requests to a listed hostname are treated exactly like loopback: OAuth verification is skipped AND `platformRole` is stamped to `"platform_admin"`.
- Trust is the SAME tier as loopback — there is no second-factor token. The env allowlist + `CINATRA_MCP_DEV_ADMIN_BYPASS=true` is the entire authorization boundary.

**Security implications:**

- `CINATRA_MCP_DEV_TRUSTED_HOSTS` overrides OAuth for the listed hostnames. Never list a publicly-reachable hostname unless you accept unauthenticated admin access from any caller who can reach it.
- Tailscale Funnel, ngrok public mode, and named public Cloudflare Tunnels are all "publicly reachable" in this sense. Only `tailscale serve` (tailnet-only) is network-isolated.
- DB configuration is intentionally NOT consulted for trust: an attacker who gains DB write but not server-process write cannot widen the bypass. The operator must literally type the FQDN into env.
- A loud warning is logged on the first request after process boot when `CINATRA_MCP_DEV_TRUSTED_HOSTS` is non-empty, listing the normalized hostnames.
- **`x-forwarded-host` spoofing defense:** the allowlist path (non-loopback URL host) consults only the URL hostname — a spoofed `X-Forwarded-Host` cannot rescue a non-loopback request. The loopback path accepts allowlisted forwarded-host values (Funnel topology — see Threat Model below) because a same-host attacker already has the unconditional loopback bypass without any header, so the additional value doesn't widen the attack surface; an off-host attacker can only reach the loopback listener through the operator-deployed reverse proxy, which stamps the forwarded header itself.
- **Threat model — why allowlisted forwarded-host on the loopback path is safe in dev:** there are three header shapes a request can have when `urlHost = localhost`:
  1. *No forwarded-host* → a direct localhost caller. Same-host trust, granted unconditionally. This is the baseline localhost path.
  2. *Forwarded-host present and loopback* → Turbopack dev-proxy. Trusted (legacy behavior).
  3. *Forwarded-host present, non-loopback* → an operator-deployed reverse proxy. **Only trusted when the forwarded value matches `CINATRA_MCP_DEV_TRUSTED_HOSTS`.** Same-host attackers spoofing this header don't gain anything they couldn't get from case 1 (just omit the header); off-host attackers can only reach the loopback listener through the operator's proxy, which sets the header based on the URL they actually hit. This is a dev/local operator-intent trust path, NOT a production reverse-proxy auth model.
- **URL-shaped entries are rejected.** `https://foo.ts.net` will NOT match `foo.ts.net` — `parseTrustedHosts` drops any entry containing `://`. Operators must write bare hostnames in the allowlist.

### Implementation

The skills MCP registry (`packages/skills/src/mcp/registry.ts`) forwards `userId`/`orgId`/`platformRole` from the request store into the actor envelope, and `requireAdminActor` (`packages/skills/src/mcp/auth.ts`) honors `actor.platformRole === "platform_admin"` as a trusted-hint early-exit. Without that early-exit, `actorContextFromMcpRequest` would rebuild platformRole from session and drop the bypass hint.

Policy lives as pure helpers in `packages/mcp-server/src/dev-admin-bypass.ts`:

- `isTrustedDevHost({ nodeEnv, envBypassFlag, trustedHostsEnv, urlHost, forwardedHostRaw })` — unified trust tier. **Loopback path** (urlHost is loopback): trust when `forwardedHostRaw` is absent, OR when it parses to a loopback host (Turbopack dev-proxy compat), OR when it parses to an entry in the allowlist (Funnel / named Cloudflare Tunnel / nginx-on-localhost reverse-proxy topology). Present-but-malformed AND present-but-neither-loopback-nor-allowlisted veto. **Non-loopback allowlist path**: urlHost must literally appear in the allowlist; `forwardedHostRaw` is ignored to prevent a spoofed forwarded header from rescuing a non-loopback URL host.
- `shouldGrantDevAdminBypass({ nodeEnv, envBypassFlag, isTrustedDevHost })` — admin elevation decision
- `urlRequestHost(url)` — URL-only host; `forwardedRequestHost(headers)` — first comma-separated forwarded value; `effectiveRequestHost(headers, url)` — proxy-aware view (forwarded-host preferred, URL fallback); `normalizeHost(raw)` / `parseTrustedHosts(raw)` — host normalization + allowlist parsing. `normalizeHost` rejects URL-shaped entries (`://`) and malformed IPv6 bracket suffixes (e.g. `[::1]evil.com`).

The bypass affects ONLY the OAuth-skip and `platformRole` paths in the MCP transport. Actor identity fallback (`resolveActorIdentity`) and the agent-to-agent (A2A) protocol dev-bypass org fallback continue to use strict loopback detection (`isLocalhostRequest`) — extending those would impersonate the first admin user from a non-loopback request, which is a deliberately larger semantic change deferred until explicitly requested.

Test coverage lives in `packages/mcp-server/src/__tests__/dev-admin-bypass.test.ts`, `packages/skills/src/mcp/__tests__/require-admin-actor.test.ts`, and `packages/skills/src/mcp/__tests__/registry-actor-forwarding.test.ts`.
