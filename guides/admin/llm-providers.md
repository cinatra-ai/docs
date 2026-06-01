# LLM providers

This page is for administrators configuring which large-language-model (LLM) providers a Cinatra instance uses, where their keys live, which models agents run on, and how prompt caching and Model Context Protocol (MCP) tool access behave. It is a controls-level guide — for the orchestration internals, see [LLM orchestration](../../references/platform/llm-orchestration.md).

Provider configuration is admin-only, at **Administration → LLM Providers** (`/configuration/llm`). Back to the [Admin Guide](README.md).

---

## Providers Cinatra supports

Cinatra routes every model call through a single orchestration layer, so connecting a provider once makes it available to every agent, skill, and the chat assistant. The supported providers are:

- **OpenAI** — the default provider out of the box. Connect it first; you need at least one provider to run any agent.
- **Anthropic (Claude)** — native Claude support, including the Claude model family the connector exposes.
- **Google Gemini** — configured on the Gemini connector's own setup page; the LLM providers page shows its connected status and links there.

Because routing is centralized, the global default applies instance-wide rather than per agent. The Standard default is OpenAI; Anthropic and Gemini serve purpose-specific paths rather than the global default.

---

## API keys and where they live

Provider keys are **in-app settings**, not environment variables. You paste a key into the provider's card on the LLM providers page; Cinatra stores it encrypted at rest in the database. This keeps keys out of process configuration and lets you rotate them from the UI.

- **OpenAI** — paste the API key on its card. Once a working key is saved, Cinatra can load the live model list for that account.
- **Anthropic** — connect the key the same way; the card shows connected status and the available Claude models.
- **Gemini** — connect on the Gemini connector setup page; the LLM providers card reflects the result.

The one notable exception is `OPENAI_API_KEY` as an environment variable: a supporting service (the knowledge-graph indexer) needs it at container start, so operators set it there in addition to the in-app key. See [Security](../../references/platform/security.md) for the environment-variable-vs-in-app-setting rule, and the [Hosting Guide → Configuration](../hosting/configuration.md) for the operator side.

> Rotating a key in the UI takes effect for subsequent calls. Because the key is encrypted with the instance encryption key, losing the encryption key means losing access to the stored provider keys — that is an operator concern covered in the hosting docs.

---

## Model selection

There are two layers of model choice:

1. **The default provider and model.** The LLM providers page has a default-providers card. The **Standard** default provider is OpenAI today — the Standard selector currently offers OpenAI, and that is the global default every agent, skill, and the chat assistant routes through. You pick the default OpenAI model here; save a working key first so the selectable model list is populated, until then you set the model name directly. Anthropic is used for specific purposes (see below) and is not selectable as the global Standard default.
2. **Per-purpose overrides.** A few purposes can use a different provider or model than the global default — for example a separate selection for agent creation and for data classification, where Anthropic can be chosen. These are deliberate, narrowly scoped overrides; they never silently change the global Standard default.

For OpenAI, the card also exposes a service-tier choice for accounts that offer one. Pick the tier that matches your account's latency / cost posture.

---

## Prompt caching

OpenAI connections have a **prompt caching** control on the provider card — Enabled or Disabled. Prompt caching lets the provider reuse the cached portion of a repeated prompt prefix, which reduces token cost on calls that share a large stable preamble (system prompts, long tool definitions, injected skills). Leave it enabled unless you have a specific reason to turn it off. Cached-input tokens are tracked separately in usage capture, so you can see the effect of caching in the [cost dashboard](cost-and-usage.md).

---

## MCP tool access (controls level)

Cinatra exposes its own capabilities to the LLM through the native MCP server tool, and it does so automatically — you do not wire it per agent. What you should know as an admin:

- **The chat assistant and ordinary agents get the Cinatra MCP server and every connected external MCP server** (such as a connected WordPress, Drupal, or other registered MCP server) handed to the model as tool references, rather than the platform dumping individual functions into every call. This is the default behavior.
- **Agents that declare a specific toolbox** get only the MCP servers they declared. This lets an agent author scope an agent to just the tools it needs.
- **Native MCP requires a reachable public URL.** The provider's servers connect *back* to your instance's MCP endpoint, so a purely local install needs the public MCP URL configured before native MCP works. See [MCP public URL and tunnels](../hosting/mcp-public-url.md). When the public URL or credentials are unavailable, the platform simply skips MCP injection rather than failing the call.
- **Provider capability differs.** Gemini does not support the native MCP tool path the same way OpenAI does; the orchestration layer handles that difference for you. You do not configure it.

For the full injection rules, provider-by-provider tool handling, and the JWT exchange behind native MCP, see [LLM orchestration](../../references/platform/llm-orchestration.md).

---

## Telemetry for provider calls

Per-provider call logging is configured under **Administration → Telemetry**, and the cost and token consumption of every provider call shows up in the [cost dashboard](cost-and-usage.md) broken down by provider and model. Use those two surfaces together to watch both *what was logged* and *what it cost*.

---

## Practical guidance

- **Connect at least one provider before anything else** — no agent runs without one.
- **The Standard default provider is OpenAI** — it applies everywhere; set its default model deliberately. Anthropic and Gemini cover purpose-specific paths, not the global default.
- **Keep prompt caching on for OpenAI** unless you have a reason not to; check the cached-input tokens in the cost dashboard to confirm it is helping.
- **Configure the public MCP URL** if you want the chat assistant and agents to use native MCP tools on a local install.
- **Rotate keys from the UI**, and coordinate the `OPENAI_API_KEY` environment variable with whoever operates the deployment.

---

## Where to go next

- Watch what these providers cost: [Cost and usage](cost-and-usage.md)
- Per-call logging and error reporting: [Telemetry and logging](telemetry-and-logging.md)
- The orchestration internals and MCP injection rules: [LLM orchestration](../../references/platform/llm-orchestration.md)
- The public-URL requirement for native MCP: [MCP public URL and tunnels](../hosting/mcp-public-url.md)
- Back to the [Admin Guide](README.md)
