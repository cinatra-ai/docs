# Claude Cowork vs. Cinatra

A quick framing first, because the two products are sometimes filed in the same drawer and they should not be: this page compares Cinatra with **Claude Cowork**, Anthropic's end-user desktop product for autonomous knowledge work. If you are looking for the developer-facing Anthropic managed-agent runtime, see [Claude Managed Agents vs Cinatra](managed-agents-vs-cinatra.md) instead.

The shortest honest summary: Claude Cowork helps an individual delegate messy desktop knowledge work to Claude and get back a finished deliverable. Cinatra gives a team a self-hosted workspace for durable, governed, multi-agent workflows across shared business systems. The two share a thesis — *delegate the outcome, not the prompt* — and largely disagree on where that outcome should live.

## What They Are

| Dimension | Claude Cowork | Cinatra |
|---|---|---|
| **Category** | Anthropic's desktop agent for individual knowledge work | Self-hosted full-stack agent platform |
| **Primary surface** | Claude desktop app (macOS, Windows) with local file and app access | Web workspace at your domain plus Model Context Protocol (MCP) and agent-to-agent (A2A) protocol endpoints |
| **Primary user** | An individual knowledge worker; admins enabling them at team/enterprise scale | A team operating shared business workflows |
| **Execution model** | Agent loop and conversation handling run natively on the user's device; code runs in a local isolated VM (Apple Virtualization.framework on macOS, Hyper-V on Windows); model inference is sent to Anthropic's API by default, or to a third-party endpoint when Cowork is deployed through Bedrock / Vertex AI / Foundry / a large language model (LLM) gateway | All execution is server-side on infrastructure you control — Next.js + PostgreSQL + Redis + WayFlow (Cinatra's OAS Flow agent runtime) Python sidecar |
| **LLM access** | Claude models only. Standard Cowork routes inference to Anthropic; third-party deployments route inference to the configured provider endpoint | Multi-provider through `@cinatra-ai/llm` (OpenAI, Anthropic, Gemini) |
| **Authoring** | Describe an outcome in natural language; plugins/skills/connectors extend Claude's behaviour | Author agents as declarative Open Agent Specification (OAS) Flow files, or conversationally inside the chat assistant |
| **Hosting** | Anthropic-managed plus the user's desktop (or third-party inference provider plus the user's desktop) | Self-hosted (your servers, your DB, your Redis, your provider keys) |
| **License** | Proprietary, gated by Anthropic plan tier | Open source (Apache 2.0) |
| **Pricing** | Bundled into Anthropic plans (Pro, Max, Team, Enterprise) | Your infrastructure cost; no per-run vendor fee from Cinatra |
| **Availability** | Generally available since April 2026 | Open source; continuously released |

## What Claude Cowork is, in Anthropic's framing

Anthropic positions Cowork as *"Claude Code power for knowledge work"* and contrasts it with the chat experience: *"Unlike Chat, Cowork lets Claude complete work on its own."* The hand-off model is the headline — describe the outcome, approve at checkpoints, get a finished deliverable. Canonical examples from Anthropic's product pages include organising downloads and drafts, assembling decks and reports from scattered local sources, extracting data from receipts and invoices into spreadsheets, pulling metrics from analytics dashboards into weekly summaries, and running scheduled tasks on a daily/weekly/monthly cadence.

Each Cowork **plugin** bundles **skills** (instruction sets Claude loads dynamically), **connectors** (Anthropic's documentation names Gmail, Google Drive, Slack, and DocuSign, with more available), and **sub-agents** (parallel workers that decompose complex tasks) into one installable package. On Team and Enterprise plans, owners can curate organisational plugin marketplaces; Team and Enterprise admins can also stream Cowork events to a security information and event management (SIEM) system through OpenTelemetry (vendor-neutral tracing). On Enterprise plans, groups and custom roles let admins selectively enable Cowork and specific plugins for individual teams. Deployments through Amazon Bedrock, Google Cloud Vertex AI, Azure AI Foundry, or an LLM gateway are a separate path: MCP servers do not ship by default and are allowlisted through MDM, while plugins and skills are distributed via local filesystem mounts and MDM configuration. Approvals come in two modes — *Ask before acting* and *Act without asking* — with deletion always requiring explicit confirmation.

The one limitation worth being explicit about up front: **Cowork activity is currently excluded from Anthropic's audit logs, Compliance API, and data exports**, per Anthropic's own help center. That is the single most consequential gap for regulated workloads at the time of writing.

## What Cinatra is

Cinatra is a self-hosted application platform. Every layer — the Next.js app, the WayFlow agent runtime, the LLM orchestration, the connectors, the registry, the durable execution layer (BullMQ (a Redis-backed job queue) + PostgreSQL), the object store, the audit trail — runs on infrastructure you control. Agents are declarative OAS Flow files committed to git; the same files run on any OAS-compliant runtime. Cinatra also speaks A2A so other agent platforms can call it, MCP so any external client (Claude Code, ChatGPT connectors, custom tooling) can reach its primitives, and Agent-User Interaction Protocol (AG-UI) plus agent-to-UI (A2UI) protocol so its event stream and human-in-the-loop surfaces are renderable by anything that speaks those protocols. Resources are owned at one of four scopes (user / team / organisation / workspace), and every privileged action goes through the same kernel-level authorisation helper and writes an `audit_events` row in your own database.

## Key Differences

### 1. Where the work lives

- **Cowork:** the user's desktop is the workspace. Files Claude touches sit in folders the user grants access to; conversations and run state live on the user's laptop or in Anthropic's backend.
- **Cinatra:** a shared web workspace is the workspace. Every run, every event, every approval lives in your Postgres / Redis; multiple users see the same runs and dashboards; nothing depends on a particular person's machine being on.

### 2. Buyer and persona

- **Cowork:** the individual knowledge worker delegating one-off outcomes. Admins exist to enable, govern, and curate plugins, but the work is still anchored to one person's desktop.
- **Cinatra:** an operator, internal-tools team, AI platform team, consultancy, or technical organisation that wants to own the runtime, the data, the extensions, and the integration surface for shared business workflows.

### 3. Workflow durability

- **Cowork:** agent execution requires the desktop app to be open and the machine awake. Scheduled tasks fire when the device is online.
- **Cinatra:** runs are durable in Postgres with a typed AG-UI event stream backed by Redis Streams; BullMQ owns background execution. Page reloads, network drops, and process restarts do not interrupt a run. A run started in chat can be observed and continued from any MCP client.

### 4. Models and providers

- **Cowork:** Claude only.
- **Cinatra:** OpenAI, Anthropic, and Gemini through a single orchestration interface that owns provider selection, tool injection, skill matching, retries, and cost telemetry. Switching the model on a per-agent or per-instance basis is a configuration change, not a code change.

### 5. Connectors and tools

- **Cowork:** Claude connectors that Anthropic's documentation names include Gmail, Google Drive, Slack, and DocuSign, with more available. Connectors ship inside plugins. Cowork also has direct access to local files in folders the user grants, and to local desktop applications.
- **Cinatra:** first-class connector extensions for Gmail, Google Calendar, Apollo, LinkedIn, WordPress, Drupal, Apify, YouTube, and GitHub, all routed through the Nango (the OAuth gateway brokering connector credentials). New connectors are TypeScript packages you publish to your own registry. There is no local desktop or filesystem access — Cinatra runs server-side.

### 6. Extensibility model

- **Cowork:** plugins bundle skills, connectors, and sub-agents into installable packages; Team and Enterprise owners can run curated plugin marketplaces for their org.
- **Cinatra:** agents, connectors, and capabilities are all versioned, signed, installable extensions. Private registries scope to one instance; public registries are visible to every connected Cinatra instance. Promotion from private to public is one-way and audited. Install-from-GitHub is supported for skill extensions.

### 7. Multi-agent composition

- **Cowork:** sub-agents are spawned by Claude inside a single task — parallel workers that each handle a piece of the work concurrently rather than sequentially.
- **Cinatra:** an explicit orchestrator + sub-agent model. Orchestrators call other agents in-process via the A2A transport, with human-in-the-loop (HITL) gates that pause the parent flow until each sub-agent's review is approved. Sub-agents can themselves live on another Cinatra instance and be invoked over authenticated A2A.

### 8. Human-in-the-loop

- **Cowork:** two approval modes — *Ask before acting* (Claude pauses on every action) and *Act without asking* (Claude proceeds autonomously). Deleting files always requires explicit permission. Review and approve through the desktop app.
- **Cinatra:** A2UI declarative HITL surfaces — setup forms before a run starts, mid-run review panels (recipient lists, draft emails, custom renderers) — published on a parallel Redis channel alongside the AG-UI lifecycle stream. The same approval surface works for any agent that declares the same renderer ID; renderers are registered once and reused.

### 9. Audit and governance

- **Cowork:** Cowork activity is **not** captured in Anthropic's audit logs, Compliance API, or data exports as of May 2026, per Anthropic's documentation. OpenTelemetry traces and an Analytics API exist as partial alternatives. MDM controls can lock plugin and skill configuration on managed deployments.
- **Cinatra:** every install / update / archive / promote / privileged operation writes an `audit_events` row in your database. Every LLM call, agent run, MCP primitive invocation, and job emission is structurally logged. Audit storage is in your Postgres, which means your existing backup, retention, export, and SIEM pipelines apply.

### 10. Data residency

- **Cowork:** conversation history is stored on the user's device, and local files in folders the user grants are read locally. Model inference, however, sends prompts, responses, and any file content needed for the prompt to Anthropic's API in the standard deployment, or to the configured provider endpoint in a Bedrock / Vertex AI / Foundry / LLM-gateway deployment. Anthropic's 3P documentation is explicit that Vertex AI and Bedrock keep prompts, responses, files, and tool outputs off Anthropic's servers entirely; Microsoft Foundry deployments still route inference through Anthropic's infrastructure; gateway deployments inherit whatever path the gateway operator configures.
- **Cinatra:** all run state, event streams, files, credentials (encrypted with your key), and audit trail live in your environment. No data leaves unless an agent you wrote explicitly calls out.

### 11. Open standards and interoperability

- **Cowork:** an Anthropic product surface — Claude Desktop plus Anthropic's connectors and plugin format. Custom connectors using remote MCP can be added to extend Claude, and plugins can bundle MCP servers; the older `claude_desktop_config.json` local-MCP path used by Claude Desktop's other surfaces is not available inside Cowork.
- **Cinatra:** speaks four open agent standards — **OAS** for agent specification, **A2A** for agent-to-agent execution, **AG-UI** for typed lifecycle events, **A2UI** for declarative HITL surfaces — plus exposes its primitives as an MCP server so Claude Code, Claude Cowork itself (via MCP), ChatGPT connectors, and any other MCP client can drive it. An agent authored in Cinatra is a portable OAS Flow file; another OAS-compliant runtime can load it without modification.

### 12. Sharing and collaboration

- **Cowork:** sessions are per-user. Anthropic's documentation explicitly states *"No chat or artifact sharing: Sessions cannot be shared with others."* Team and Enterprise admins curate plugins and (on Enterprise) groups; the work itself stays in the originating user's session.
- **Cinatra:** collaboration is anchored at the resource level — agents, skills, dashboards, connectors, and runs are owned at one of four scopes (user / team / organisation / workspace). Multiple users see the same shared catalogue, run history, and approval queue; cross-instance A2A extends the model across organisational boundaries.

## Where They Overlap

Both products move beyond *prompt-the-model* into *delegate-the-outcome*:

- Multi-step task execution from a high-level goal, with human oversight at consequential points.
- Research synthesis across multiple sources; document, deck, and spreadsheet generation; data extraction from messy inputs into structured outputs.
- Connectors to common knowledge-work systems — Gmail is the most direct example shared on both sides (Cowork through its Gmail connector, Cinatra through its Gmail connector extension).
- Skill and plugin concepts for repeatable domain behaviour.
- Scheduled or recurring execution.
- Sub-agent decomposition of complex tasks (different implementations: Cowork spawns parallel workers inside a single run; Cinatra composes orchestrators and sub-agents over A2A).
- Non-developer authoring through natural language.

They overlap in *the class of work they make possible*, not in *where that work lives*. Cowork turns one person's desktop into an agentic workspace. Cinatra turns a team's shared business workflows into durable, governed agent runs.

## Relationship: complementary, not interchangeable

A team can use both without picking sides:

- **Cowork** for one-off, individually-scoped deliverables that start from a user's local files, desktop apps, or personal context — organise this folder, extract data from these receipts, draft this deck from scattered sources, run a weekly digest while I am away.
- **Cinatra** for workflows that need to be installed, governed, repeated, audited, and shared across users or instances — the team's outreach cadence, the shared blog pipeline, the recurring CRM enrichment job, the cross-team research orchestrator.

Because Cinatra exposes a public MCP primitive surface, a Claude Cowork user can also reach into a Cinatra instance through a remote MCP custom connector — listing agents, starting runs, inspecting results — without leaving the desktop app. Live event streaming (the AG-UI surface) is a separate channel from MCP polling, so the desktop experience trades real-time updates for steady-state inspection. The two products do not compete for the same dollar; they sit at different ends of the *individual ↔ team* axis.

## When each makes sense

| Use case | Better fit |
|---|---|
| Organise a Downloads folder, dedupe drafts, rename files in place | **Cowork** |
| Turn a folder of receipts / contracts / scattered local PDFs into a structured spreadsheet | **Cowork** |
| Assemble a polished deck or report from local sources for one user | **Cowork** |
| Hand off a one-off messy task with the lowest setup burden | **Cowork** |
| Work on data that lives inside a user's desktop apps and local files | **Cowork** |
| Run a recurring team outreach cadence with approvals, run history, and audit trail | **Cinatra** |
| Build and operate an internal marketplace of installable agents and skills | **Cinatra** |
| Multi-provider LLM stack (OpenAI + Anthropic + Gemini) behind one orchestration layer | **Cinatra** |
| Self-host on your own infrastructure with your own DB, Redis, provider keys, and connector credentials | **Cinatra** |
| Expose your team's workflows to Claude Code, ChatGPT, or other MCP clients | **Cinatra** |
| Vendor-and-tenant collaboration over authenticated cross-instance A2A | **Cinatra** |
| Regulated workloads that require centralised audit-log and compliance-export coverage | **Cinatra** |
| Server-side scheduled workflows that must keep running while every laptop is closed | **Cinatra** |
| Desktop computer-use or local-application automation | **Cowork** |
| You want both: individual delegation *and* shared team workflows | **Both** |

## TL;DR

Claude Cowork and Cinatra both move beyond chat: the user describes an outcome, and an agent does multi-step work with human oversight. Cowork is the better fit for individual knowledge workers who want Claude to operate across their desktop, local files, and connected apps and return a finished deliverable. Cinatra is the better fit when that same outcome-driven pattern needs to become a shared, durable, self-hosted team workflow — runs that survive across sessions, multi-provider LLMs, a marketplace of installable extensions, declarative HITL renderers, cross-instance A2A, an MCP-callable surface, and an audit trail in your own database. The two are complementary rather than interchangeable: Cowork is personal delegation; Cinatra is team-owned agent operations.

## Notes on source

This comparison was assembled from Anthropic's product pages at <https://www.anthropic.com/product/claude-cowork> and <https://claude.com/product/cowork>, the Claude help-center entries on Cowork architecture, plugins, sub-agents, and Team / Enterprise administration, and Anthropic's public statement that Cowork activity is currently not captured in audit logs, the Compliance API, or data exports. Where Anthropic's documentation is silent on a specific behaviour, this page says so rather than guessing. Product status reflects May 2026; Cowork reached general availability in April 2026.
