# Setup and first run

This page is for the administrator bringing a fresh Cinatra instance to life — from the first admin account through to a first agent run with audit and usage signals confirmed. It assumes an operator has already installed the platform; if the app is not yet running, start with the [Hosting Guide → Installation](../hosting/installation.md).

Back to the [Admin Guide](README.md).

---

## 1. Become the first admin

The first user to register on a fresh deployment becomes the **platform admin** automatically and the owner of the default organization. Every subsequent sign-up is a regular member. Treat this first registration as a deliberate act: it grants the whole `/configuration/*` administration surface and the admin-only capabilities.

Open the app, register with an email and password, and you are the admin. Additional admin grants are issued later from `/configuration/permissions` — see [Permissions](permissions.md).

---

## 2. Set instance identity

After registering you complete a short one-time setup that establishes the instance's identity:

- **Encryption key.** Cinatra encrypts provider keys and connector credentials at rest. In development the key is generated and persisted automatically; in production the operator supplies it as an environment variable. This is an operator-coordinated decision — see [Security](../../references/platform/security.md).
- **Instance display name and namespace.** A human name (for example, "Acme Demo") and a short namespace slug. The namespace is the scope under which this instance publishes packages and is the canonical identity other instances see. You can review and adjust instance identity later under **Administration → Instance**.

The instance identity matters the moment you publish or share anything, so set the namespace thoughtfully.

---

## 3. Connect required providers

An instance needs at least one large-language-model (LLM) provider before any agent can run.

- Go to **Administration → LLM Providers** (`/configuration/llm`) and connect a provider — OpenAI is the default and is enough to start. Connect Anthropic (Claude) and Google Gemini later if you need them.
- Keys are in-app settings stored encrypted; paste them on the provider card. Connect OpenAI and set the model and default controls; connect Anthropic and Gemini for supported purpose-specific paths. Routing is centralized, so the Standard default (OpenAI) applies everywhere.

The full provider, model-selection, prompt-caching, and MCP-tool-access controls are documented in [LLM providers](llm-providers.md).

---

## 4. Connect registry access

Browsing the marketplace is served by the storefront; *installing* an extension is what needs registry access — the manifest reads and the install download come from the registry.

- Submit a registry-connection request and verify the credential round-trip under **Administration → Environment → Registries**.
- The shared registry has a reserved Cinatra namespace; your instance publishes under its own namespace.
- Two endpoints are in play: marketplace **browse** (and the per-extension detail page) is served by the storefront, while the package you **install** is pulled from the registry. Both are reached through the same Registries tab.

Connecting a registry is the prerequisite for installing anything beyond what your own instance has published. See [Registry and marketplace](marketplace.md).

---

## 5. Configure assistants, skills, permissions, and telemetry

With providers and registry in place, tune the instance:

- **Assistants** (`/configuration/assistants`) — the chat assistant's defaults: system prompt and tooling.
- **Skills** (`/configuration/skills`) — the skills catalog and matching behavior. If you want a user's in-run edits to become custom skills automatically, this is where skill autosave is enabled; it is off by default. See [Continuous learning and custom skills](../user/continuous-learning.md).
- **Permissions** (`/configuration/permissions`) — invite members, assign the admin role to anyone who needs it, and review the role matrix. Set per-resource access deliberately. See [Permissions](permissions.md).
- **Telemetry** (`/configuration/telemetry`) — decide whether to enable Sentry-compatible error reporting (off by default, an operator-coordinated change) and set per-integration logging. See [Telemetry and logging](telemetry-and-logging.md).

---

## 6. Install your first extension

Extensions add new things Cinatra can do. The admin claim:

> Marketplace install activates an extension on the running instance. Before activation, admins review what the extension requests, approve only the capabilities it may access, choose the install access (who in your workspace can use it), and complete any setup screens it registers. After activation, its agents, skills, workflows, tools, setup pages, and settings pages become available without a redeploy. Use Archive for reversible suspension, Restore to bring it back, and hard removal only when scoped settings and secrets should be removed. Registry actions affect published versions; lifecycle actions affect installed state.

To install one:

1. Open **Administration → Marketplace** (`/configuration/marketplace`).
2. Pick a starter extension — a simple agent is a good first choice.
3. Review what it requests: the capabilities it asks for, its declared dependencies, and its compatibility. Approve only the capabilities it genuinely needs.
4. Choose the install access (who in your workspace can use it).
5. Install. The extension activates on the running instance and approved surfaces appear without a redeploy. An installed agent shows up under **Agents**; a connector exposes its setup screen; skills populate the catalog and become matchable.

Installed code only activates in-process once it passes the host's activation-trust gate — it must be integrity-verified, have a recorded host trust decision, and come from the configured marketplace host. The full gate (and the signature-enforcement lever) is covered in [Registry and marketplace](marketplace.md).

The full lifecycle — install, update, archive (reversible), restore, and hard removal — is in [Registry and marketplace](marketplace.md). Archive preserves history and configuration; hard removal removes scoped settings and secrets.

---

## 7. Run a first agent and confirm the signals

1. Open **Agents** (`/agents`) and pick the agent you installed.
2. Use its **Run** action. If the agent declares inputs, you fill a form before it starts; during the run it may pause for a review checkpoint and ask you to confirm before continuing.
3. Start it and watch the run page stream its events to completion.

Then confirm the platform recorded the run:

- **Usage and cost.** Open the LLM cost dashboard under **Analytics → LLM** (`/analytics/llm`). The run's LLM calls appear in the per-provider and per-agent breakdowns. See [Cost and usage](cost-and-usage.md).
- **Audit.** The install and any privileged actions you took are recorded in the audit log. Every install, update, archive, restore, and grant writes an audit row naming you as the actor. See [Permissions](permissions.md) and [Security](../../references/platform/security.md).

Seeing the run in the cost breakdown and the install in the audit log confirms the instance is wired end to end.

---

## Operator and user handoff checklist

Before you hand the instance to its users, confirm:

- [ ] First admin account created; any additional admins granted from `/configuration/permissions`.
- [ ] Instance display name and namespace set under **Administration → Instance**.
- [ ] At least one LLM provider connected and the default chosen.
- [ ] Registry connection submitted and the credential round-trip verified.
- [ ] Assistants, skills, and permissions reviewed; skill autosave decision made.
- [ ] Telemetry decision made (error reporting on/off, logging level), coordinated with the operator.
- [ ] A first extension installed with only the capabilities it needs approved.
- [ ] A first agent run completed and visible in the cost breakdown; the install visible in the audit log.
- [ ] If the chat assistant or native MCP tools are needed on a local install, the public MCP URL is configured — see [MCP public URL and tunnels](../hosting/mcp-public-url.md).
- [ ] Operator owns: the encryption key in production, the `SENTRY_DSN` decision, backups, and the supporting services — see the [Hosting Guide](../hosting/README.md).

---

## Where to go next

- The end-user first-run walkthrough: [Quickstart](../hosting/quickstart.md)
- Govern who can do what: [Permissions](permissions.md)
- Manage installed extensions: [Registry and marketplace](marketplace.md)
- Watch spend and usage: [Cost and usage](cost-and-usage.md)
- Configure providers: [LLM providers](llm-providers.md)
- Back to the [Admin Guide](README.md)
