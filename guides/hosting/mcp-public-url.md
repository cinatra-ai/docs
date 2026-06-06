# The MCP public URL — why a dev instance needs a tunnel

A fresh local install of Cinatra reaches a point — the AI chat, external Model Context Protocol (MCP)
clients, some agent runs — where it stops with:

> Cinatra MCP public URL is not configured for hosted MCP access. Set it at
> `/configuration/development?tab=tunnel`.

This is **not a bug or a broken install.** It is a configuration step that a
local-only instance cannot skip, and this page explains why, then walks
through the fix with [Tailscale](https://tailscale.com) Funnel.

---

## Local vs. remotely-hosted services

Cinatra is built from three tiers of services. Understanding which tier a
service is in explains the whole problem.

### 1. The Cinatra app — on your machine

The Next.js application itself. `pnpm dev` (or `make dev`) runs it on
`http://localhost:3000`. In production it runs on whatever host you deploy to.

### 2. Supporting services — on your machine

PostgreSQL, Redis, Verdaccio (an npm-compatible registry), Nango (the OAuth gateway brokering connector credentials), Neo4j + Graphiti (a knowledge-graph indexer), and the WayFlow (Cinatra's OAS Flow agent runtime)
runtime. In development they all run as containers from the bundled
`docker-compose.yml`, bound to `localhost` ports. The Cinatra app talks to them
over the loopback interface or the Docker network. **They never need to be
reachable from the public internet** — only the app talks to them, and the app
is right there on the same machine.

`make setup` checks this tier for you, and you can re-check it any time with
`make check` (see [Validating services](#validating-services-after-setup)).

### 3. Remote provider services — not on your machine

The large language model (LLM) providers — OpenAI, Anthropic, Google — and, optionally, the hosted
extensions registry at `registry.cinatra.ai`. These run on the vendors'
infrastructure, not yours.

For almost everything, traffic to this tier is **outbound**: the Cinatra app
opens a connection *to* `api.openai.com`, sends a request, reads the response.
Outbound calls work from any machine with internet access — your laptop
included. No public URL required.

---

## Why the chat needs a public URL

There is exactly one case where the direction reverses: **native MCP**.

OpenAI and Anthropic implement the [Model Context
Protocol](https://modelcontextprotocol.io) natively. When Cinatra wants to give
a model access to Cinatra's own tools — running agents, reading and writing
objects, sending outreach — it does **not** send the tools inline. It hands the
provider a small reference instead:

```jsonc
{
  "type": "mcp",
  "server_label": "cinatra",
  "server_url": "https://<your-instance>/api/mcp",
  "headers": { "Authorization": "Bearer …" }
}
```

The provider's servers then open a **new, inbound connection** — from the
provider's infrastructure *to* `server_url` — to list and call those tools.

That inbound connection is the problem. `server_url` cannot be
`http://localhost:3000/api/mcp`: "localhost" on OpenAI's servers means
*OpenAI's* machine, not yours. The provider has no route to a private address
on your laptop. So Cinatra needs a **public HTTPS URL that maps back to your
local `/api/mcp`** — and it refuses to start a chat session it knows the
provider could never complete, which is the error above.

The same public URL is reused for external MCP clients connecting *to* your
instance and for the OAuth audience the MCP server validates. For example, an
external client like **Claude Desktop** or **Codex** is pointed at
`https://<your-tunnel>/api/mcp` — the public origin you set below, with the
`/api/mcp` path appended — and connects back over OAuth. Without a public URL,
those external clients have nothing reachable to point at, exactly as the chat
does not.

### What works without it, and what doesn't

| Works without a public URL | Needs a public URL |
| --- | --- |
| The setup wizard, registration, admin | The AI chat (OpenAI / Anthropic) |
| Browsing agents, objects, dashboards | External MCP clients calling your instance |
| Deterministic agent runs | Agent runs that use native MCP tool access |
| Outbound LLM calls (no MCP tools) | The hosted MCP / agent-to-agent (A2A) protocol surface |

If you only want to click around a local instance, you can ignore the message.
To use the chat, set the URL.

---

## Set it up with Tailscale Funnel

[Tailscale](https://tailscale.com) Funnel exposes one local port on a stable
public HTTPS URL. Your instance and its data stay on your machine — Funnel only
forwards `/api/mcp` (and the rest of port 3000) so the providers can reach it.
The URL is stable across restarts, which Cloudflare quick tunnels are not.

### 1. Install Tailscale

```bash
# macOS
brew install tailscale

# Debian / Ubuntu
curl -fsSL https://tailscale.com/install.sh | sh
```

### 2. Start the daemon

`tailscaled` manages a network device, so it runs as root.

```bash
# macOS (Homebrew) — needs sudo to install a system daemon
sudo brew services start tailscale

# Linux (systemd) — the install script already enabled the service
sudo systemctl enable --now tailscaled
```

### 3. Log in

```bash
tailscale up
```

This opens a browser to authenticate the machine to your tailnet. If you do not
have a Tailscale account, the page walks you through creating one (the free
Personal plan is sufficient).

### 4. Enable and start Funnel

```bash
tailscale funnel 3000
```

This forwards your local port 3000 to a public HTTPS URL and prints it:

```
Available on the internet:

https://your-machine.foo.ts.net/
```

Funnel is **opt-in per tailnet**. The first time you run it, Tailscale prints a
one-time link to enable Funnel (and HTTPS certificates / MagicDNS) in the admin
console — open it, approve, and re-run the command. This is a one-time setup.

Leave this running while you use Cinatra. To run it in the background instead,
use `tailscale funnel --bg 3000`; check it with `tailscale funnel status` and
stop it with `tailscale funnel --https=443 off`.

### 5. Tell Cinatra the URL

Open **`http://localhost:3000/configuration/development?tab=tunnel`** and paste
the `https://….ts.net` URL (no trailing path — just the origin). Save.

Cinatra stores it in the `connector_config:mcp_server` metadata blob and
`getPublicMcpServerUrl()` picks it up immediately — no dev-server restart
needed.

### 6. Verify

Retry the chat. It should now build the Cinatra MCP tool and respond. You can
also confirm the endpoint is reachable from outside:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://your-machine.foo.ts.net/api/health
# expect: 200
```

---

## Alternative: a Cloudflare quick tunnel

If you do not want a Tailscale account, `cloudflared` quick tunnels need none:

```bash
brew install cloudflared          # or the platform install from Cloudflare
cloudflared tunnel --url http://localhost:3000
```

It prints a `https://<random>.trycloudflare.com` URL — paste that into
`/configuration/development?tab=tunnel` the same way. The trade-off: the URL
**changes every time you restart the tunnel**, so you re-paste it each session.
the URL of Tailscale Funnel (a public-internet tunnel) is stable.

ngrok works too (`ngrok http 3000`); a stable subdomain there needs a paid
plan.

---

## Validating services after setup

`make setup` ends with a service check, and you can re-run it at any time:

```bash
make check
```

It probes every supporting service (Postgres, Redis, Verdaccio, Nango, Neo4j,
Graphiti, WayFlow) plus the app, and reports whether the MCP public URL is set.
A non-zero exit means a required service is down — start it with
`docker compose up -d` and check `make logs`.

---

## Production

In a real deployment the app already runs behind a public hostname with TLS, so
the "tunnel" is just your normal ingress. Set the MCP public URL to that
canonical origin (the same one the OAuth surface binds to). No Tailscale or
Cloudflare tunnel is involved — those are a development convenience for
exposing a laptop.

See [Configuration → Public base URL](configuration.md#public-base-url-development)
for the underlying metadata field and env-var fallbacks.

---

## Troubleshooting

- **Chat still errors after saving the URL.** Confirm you saved the *origin*
  only (`https://foo.ts.net`, no `/api/mcp` suffix). `getPublicMcpServerUrl()`
  appends the path itself.
- **`curl …/api/health` from another network fails.** Funnel is not actually
  public yet — re-run `tailscale funnel status`, and make sure you completed
  the admin-console opt-in from step 4.
- **The URL works but the model gets 401 from the MCP server.** The MCP public
  URL must match the OAuth audience. Set it through the UI (which records
  `publicBaseUrlSource: "manual"`) rather than hand-editing the database.
- **Tailscale daemon won't start on macOS.** `tailscaled` needs root — use
  `sudo brew services start tailscale`, not the plain user-level command.

---

## Where to go next

Once the public URL is set, end users can connect external MCP clients —
Claude Desktop, Codex, Claude.ai, or ChatGPT — to your workspace and drive
Cinatra over MCP. They copy the `<public-url>/api/mcp` endpoint from the in-app
**Claude Desktop** / MCP Clients connector page and complete the OAuth sign-in.
See [Connect MCP clients](../user/mcp-clients.md) for the end-user walkthrough.
