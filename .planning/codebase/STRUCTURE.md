# Codebase Structure

**Analysis Date:** 2026-06-09

> Note: This repository (`cinatra-ai/docs`) is the **documentation site** for the Cinatra platform. It contains no application source code. The application source lives in the main platform monorepo. All paths below are relative to this docs repo root.

## Directory Layout

```
docs/                               # Repo root
├── README.md                       # Entry point — new-here orientation + section index
├── assets/                         # SVG diagrams (architecture overviews, object layer, open standards)
├── guides/                         # Step-by-step how-to content, organized by audience
│   ├── README.md                   # Guide index
│   ├── user/                       # End-user guides (agents, HITL, dashboards, skills, etc.)
│   ├── admin/                      # Admin guides (marketplace, extensions, permissions, providers)
│   ├── developer/                  # Developer guides (authoring, building, contributing)
│   │   └── integrations/           # CMS/assistant integration guides (ChatGPT, Gemini)
│   └── hosting/                    # Operator guides (install, config, troubleshooting)
├── references/                     # Stable specs, contracts, architecture references
│   ├── README.md                   # Reference index
│   ├── platform/                   # Platform architecture, subsystem contracts, security, CI
│   ├── mcp/                        # MCP server: auth, primitives, clients
│   ├── design/                     # Design system: normative spec, shadcn components, operational rules
│   └── glossary.md                 # Canonical concepts and terminology
└── resources/                      # Why-Cinatra narrative + competitive comparisons
    ├── README.md
    ├── why-cinatra.md
    └── comparisons/                # Cinatra vs ChatGPT Workspace, Claude Cowork, Vercel, Managed Agents
```

## Directory Purposes

**`assets/`:**
- Purpose: Static SVG diagrams embedded in reference documents
- Key files: `assets/architecture-overview.svg`, `assets/agents-architecture.svg`, `assets/objects-layer.svg`, `assets/open-standards-diagram.svg`

**`guides/`:**
- Purpose: Task-oriented, step-by-step content for four audiences (user, admin, developer, hosting/operator)
- Contains: Markdown how-to files; no specs or contracts
- Note: Guides reference reference documents but do not restate invariants; the reference section is the source of truth

**`guides/user/`:**
- Purpose: End-user documentation for running agents, chat, HITL review, dashboards, skills, cross-instance collaboration, undo/history, notifications
- Key files: `guides/user/durable-workflows.md`, `guides/user/human-in-the-loop.md`, `guides/user/dashboards.md`, `guides/user/marketplace-and-extensions.md`

**`guides/admin/`:**
- Purpose: Instance administration — marketplace, extension management, permissions, LLM providers, cost/usage, telemetry
- Key files: `guides/admin/setup-and-first-run.md`, `guides/admin/marketplace.md`, `guides/admin/permissions.md`, `guides/admin/llm-providers.md`

**`guides/developer/`:**
- Purpose: Extension/agent authoring, TypeScript package conventions, contributor workflow, dev loop
- Key files: `guides/developer/extension-authoring.md`, `guides/developer/extension-publishing.md`, `guides/developer/developing-agents.md`, `guides/developer/building-packages.md`, `guides/developer/contributing.md`

**`guides/hosting/`:**
- Purpose: Operator documentation — installation, configuration reference, connector migration, MCP public URL, error reporting, operations runbook, troubleshooting
- Key files: `guides/hosting/quickstart.md`, `guides/hosting/installation.md`, `guides/hosting/configuration.md`, `guides/hosting/troubleshooting.md`

**`references/platform/`:**
- Purpose: Canonical architecture specs, subsystem contracts and invariants — the authoritative "how it actually works" layer
- Key files:
  - `references/platform/architecture.md` — four-pillar architecture overview and tech stack
  - `references/platform/extensions.md` — extension model, five kinds, lifecycle, registry, conformance gates
  - `references/platform/open-standards.md` — OAS, A2A, AG-UI, A2UI specs and Cinatra implementation details
  - `references/platform/llm-orchestration.md` — LLM provider abstraction layer
  - `references/platform/objects-layer.md` — typed object store
  - `references/platform/objects.md` — objects subsystem reference
  - `references/platform/security.md` — auth, RBAC, extension permissions model
  - `references/platform/source-package-architecture.md` — package composition patterns, deterministic vs LLM responsibilities
  - `references/platform/extension-ioc-safeguards.md` — IoC conformance tests and per-change review contract
  - `references/platform/testing-doctrine.md` — CI/testing policy
  - `references/platform/bullmq-wayflow-boundary.md` — BullMQ/WayFlow execution boundary
  - `references/platform/skill-matching.md`, `references/platform/skills-storage-layout.md`, `references/platform/shell-skills.md` — skills subsystem

**`references/mcp/`:**
- Purpose: MCP server documentation — external server, auth, primitives, internal architecture, client integrations

**`references/design/`:**
- Purpose: Cinatra design system — normative HTML spec, shadcn component catalogue, operational rulebook
- Key files: `references/design/design-system.html`, `references/design/shadcn-components.md`

**`references/glossary.md`:**
- Purpose: Single source of truth for canonical terms used across all documentation

**`resources/comparisons/`:**
- Purpose: Competitive positioning documents
- Key files: `resources/comparisons/chatgpt-workspace-agents-vs-cinatra.md`, `resources/comparisons/claude-cowork-vs-cinatra.md`, `resources/comparisons/vercel-open-agents-vs-cinatra.md`, `resources/comparisons/managed-agents-vs-cinatra.md`

## Key File Locations

**Architecture entry point:**
- `references/platform/architecture.md`: The four pillars, WayFlow, tech stack, diagram pointers

**Extension system canonical hub:**
- `references/platform/extensions.md`: Extension model, five kinds, lifecycle operations, registry, conformance gates

**Open standards reference:**
- `references/platform/open-standards.md`: OAS, A2A, AG-UI, A2UI — what each is, how Cinatra implements it, endpoint/version matrix

**Developer starting points:**
- `guides/developer/extension-authoring.md`: Build an extension
- `guides/developer/developing-agents.md`: Author an OAS agent
- `guides/developer/building-packages.md`: TypeScript package conventions
- `guides/developer/contributing.md`: Contributor workflow

**Operator starting points:**
- `guides/hosting/quickstart.md`: Fastest path to a running instance
- `guides/hosting/configuration.md`: All configuration reference

## Naming Conventions

**Files:**
- All lowercase, hyphen-separated: `extension-authoring.md`, `open-standards.md`, `setup-and-first-run.md`
- Descriptive, audience-scoped names within each directory
- Connector-specific reference files use the connector name as prefix: `email-connector.md`, `drupal-connector.md`, `crm-connector.md`
- Extension subsystem slice files use `extension-` prefix: `extension-lifecycle.md`, `extension-permissions.md`, `extension-ioc-safeguards.md`

**Directories:**
- All lowercase, singular where possible: `platform/`, `design/`, `user/`, `admin/`, `developer/`, `hosting/`

## Where to Add New Content

**New end-user feature guide:**
- `guides/user/<feature-name>.md`
- Cross-link from `guides/user/README.md`

**New admin feature guide:**
- `guides/admin/<feature-name>.md`
- Cross-link from `guides/admin/README.md`

**New developer guide (authoring, tooling):**
- `guides/developer/<topic>.md`
- Cross-link from `guides/developer/README.md`

**New platform reference (subsystem contract, invariant spec):**
- `references/platform/<subsystem-name>.md`
- Cross-link from `references/platform/README.md` and from `references/README.md` if it warrants top-level visibility

**New connector reference:**
- `references/platform/<connector-name>-connector.md` (follow `email-connector.md`, `drupal-connector.md` naming)

**New architecture diagram:**
- `assets/<diagram-name>.svg`
- Embed in the relevant reference document with a relative `../../assets/` path

**New comparison document:**
- `resources/comparisons/<product-name>-vs-cinatra.md`
- Cross-link from `resources/comparisons/README.md`

## Special Directories

**`.planning/`:**
- Purpose: GSD workflow planning and codebase maps
- Generated: By GSD commands
- Committed: Yes (permitted per project policy)

**`.github/workflows/`:**
- Purpose: CI workflows for the docs repo
- Key file: `.github/workflows/notify-ops.yml`
- Generated: No
- Committed: Yes

---

*Structure analysis: 2026-06-09*
