# Quickstart

This guide takes you from a fresh machine to running your first agent end-to-end.

Expected time: about fifteen minutes (a few extra for the first Docker pull).

---

## 0. Download and install

To set up a new Cinatra instance from scratch, you can use the published CLI:

```bash
npx @cinatra-ai/cinatra install
```

That command checks your prerequisites, clones Cinatra, creates your environment, starts the local services, and runs first-time setup. After it completes, continue from [Step 1](#1-create-the-admin-account) below.

Alternatively, set up manually with the steps below (useful if you want to clone the repo yourself or contribute to the platform).

### Prerequisites

You need:

- **Node.js 24 or newer** — <https://nodejs.org/>
- **pnpm** — <https://pnpm.io/installation>
- **Docker** with the Compose plugin — <https://docs.docker.com/get-docker/>
- **Make** — already on macOS and Linux; on Windows use WSL

Docker should have at least **6 GB of RAM** allocated.

### Clone the repo

```bash
git clone https://github.com/cinatra-ai/cinatra.git
cd cinatra
```

### First-time setup

```bash
make setup
```

This installs dependencies, starts the supporting services in Docker, applies the database schema, and validates that every service is reachable. The script is idempotent — safe to re-run.

### Start the app

```bash
make dev
```

Open <http://localhost:3000> once the dev server is ready. For the full details on what `make setup` and `make dev` do — and troubleshooting tips — see [Installation](installation.md).

---

## 1. Create the admin account

Open <http://localhost:3000> in a browser. You will be redirected to a sign-up form. Register with an email and password.

The first user to register becomes the **platform admin** and the owner of the default workspace organization. Every subsequent sign-up creates a regular user account. Admins are the only users who can install agent extensions, manage network/registry settings, and access cross-organization administration.

---

## 2. Complete the setup wizard

After registering you land in the setup wizard at `/setup`. It walks through a few one-time decisions:

1. **Encryption key.** Cinatra encrypts provider API keys and connector credentials at rest. In development the wizard generates a key and persists it to `.env.local`. In production this is provided as an environment variable instead.
2. **Instance identity.** A display name (e.g. "Acme Demo") and a short namespace slug (e.g. `acme-demo`). The namespace is used as part of agent package names you publish from this instance.
3. **large language model (LLM) provider.** Paste an OpenAI API key. OpenAI is the default provider; you can connect Anthropic and Google Gemini later from **Administration → LLM Providers** (`/configuration/llm`).

Each step has its own page; the wizard skips steps you have already completed if you re-enter it.

---

## 3. Connect at least one LLM provider

If you skipped the LLM step in the wizard, visit **Administration → LLM Providers** (`/configuration/llm`) and connect a provider. You need at least one to run any agent.

For the rest of this guide, OpenAI is enough.

---

## 4. Install a sample agent

Visit **Administration → Marketplace** (`/configuration/marketplace`). The marketplace installs the full set of extension kinds — agents, connectors, skills, artifacts, and workflows — not just agents. For this walkthrough we install an agent. Pick one that looks simple — for example, **URL Title Fetcher** (a deterministic agent that fetches a URL and returns its title) or **Summarize and Review Page** (an LLM-backed page summarizer).

Click **Install**. The platform downloads the agent extension, validates its `oas.json`, persists it locally, and makes it available under **Agents** (`/agents`).

Behind the scenes: the installation creates an `agent_templates` row, copies the package contents to `agents/<vendor>/<slug>/`, and registers the agent's Model Context Protocol (MCP) primitive so it becomes callable like any other capability.

---

## 5. Run it

Open the **Agents** sidebar group. The top-level `/agents` route is now an interactive dashboard of recently used and recently run agents, and is the installed-agents surface. Click the agent you just installed and use its **Run** action.

Two patterns appear here, both backed by the same runtime:

- **Setup-step human-in-the-loop (HITL).** Before the agent starts, it asks for the inputs declared in its Open Agent Specification (OAS) file (a URL, a topic, recipient list, etc.) via a form rendered from the agent's declared HITL screens.
- **Mid-run HITL.** During the run, the agent may pause for a review (a recipient list to approve, a draft email to edit) and ask you to confirm before continuing.

Fill in the inputs, click **Start**, and watch the run page — you will see typed Agent-User Interaction Protocol (AG-UI) events streaming in real time: tool calls, text chunks, state snapshots, eventually a completion or interrupt event. Reload the page if you like; the stream resumes from the durable Redis-backed event log via the `Last-Event-ID` header.

---

## 6. Watch the standards in action

While the run is happening:

- **OAS** — the agent definition came from a `oas.json` file in the installed package; the platform compiled it into the runtime representation when the package was installed.
- **agent-to-agent (A2A) protocol** — the run is being executed inside the WayFlow (Cinatra's OAS Flow agent runtime) container. The Next.js app reached it over an A2A call.
- **AG-UI** — the events you see in the run page (tool calls, message chunks, state snapshots) are AG-UI typed events delivered over Server-Sent Events.
- **agent-to-UI (A2UI) protocol** — if the run paused for HITL, the form you saw was rendered from an A2UI surface payload published in parallel to the AG-UI lifecycle stream.

See [Open standards in Cinatra](../../references/platform/open-standards.md) for the full breakdown.

---

## 7. Let your edits teach the next run (optional)

If your admin has enabled **skill autosave** at `/configuration/skills`, every prompt edit you make inside a HITL surface during a run is captured at the end of that run and turned into a custom skill scoped to you and the agent you just ran. The next time you run the same agent, the platform's skill-matching engine injects that custom skill back into the agent's prompt context — the agent already knows your preferences. See [Continuous learning and custom skills](../user/continuous-learning.md) for the full picture; nothing here is on by default.

---

## 8. Try the chat assistant

The chat surface at `/chat` (linked from the main nav) is a built-in AI assistant that can drive every capability of the platform via MCP. Try:

> "Create a new agent that summarizes a URL using the page title and the first paragraph."

The assistant walks through the OAS Flow scaffolding interactively, validates the result, and offers to publish it to your local registry. You can install and run the new agent the same way as any other.

The chat needs the public MCP URL set — see [MCP public URL & tunnels](mcp-public-url.md). The same `/api/mcp` endpoint lets external MCP clients (Claude Desktop, Codex, Claude.ai, ChatGPT) drive Cinatra; see [Connect MCP clients](../user/mcp-clients.md).

---

## What to do next

- Author your own agent: [Developing agents](../developer/developing-agents.md)
- Understand the architecture: [Architecture](../../references/platform/architecture.md)
- Drive Cinatra from an external MCP client (Claude Desktop, Codex, Claude.ai, ChatGPT): [Connect MCP clients](../user/mcp-clients.md)
- Review the full configuration surface for non-default setups: [Configuration](configuration.md)
- Diagnose problems: [Troubleshooting](troubleshooting.md)
