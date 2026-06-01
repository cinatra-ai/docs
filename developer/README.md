# Developer Guide

This guide is for people working on Cinatra's code — writing agents, building extensions, contributing to the platform, integrating with the open standards Cinatra speaks.

For end-user material, see the [User Guide](../user/README.md). For platform-administration content, see the [Admin Guide](../admin/README.md). For installation and configuration, see the [Hosting Guide](../hosting/README.md). For the Model Context Protocol (MCP) server (external and internal), see the [MCP Guide](../mcp/README.md).

---

## Foundations

- [Architecture](architecture.md) — how the platform is composed: monorepo layout, runtime split, package boundaries
- [Security](security.md) — identities, authentication, authorization, secrets handling, agent execution safety
- [large language model (LLM) orchestration](llm-orchestration.md) — the central orchestration layer over the provider SDKs
- [Source package architecture](source-package-architecture.md) — how a domain capability is structured as a workspace package
- [MCP patterns](mcp-patterns.md) — how primitives are injected and called across packages

## Objects and data

- [Objects layer](objects-layer.md) — the platform's typed object store, dual-write hooks, registration
- [Objects: the canonical surface](objects.md) — the unified object model and its primitives
- [Objects surface unification](objects-surface-unification.md) — the consolidation onto the canonical objects surface

## Authoring agents

- [Developing agents](developing-agents.md) — the file-driven contributor authoring loop
- [Agent development guide](agent-development.md) — building an agent end to end
- [Agent spec — compact Open Agent Specification (OAS) Flow](agent-spec.md) — the `oas.json` agent definition format
- [Agent packaging](agent-packaging.md) — canonical packaging conventions
- [Agent context slots](context-slots.md) — how context is injected into a run
- [ensureAgentPackage](ensure-agent-package.md) — the system-provided agent startup pattern
- [Chat agent authoring review](chat-agent-authoring-review.md) — the in-chat authoring review loop

## Extensions

- [Extensions](extensions.md) — the extension system end to end: the five kinds, the dual loader, `register(ctx)`, the host context ports, and the installed-extension gate
- [Extension authoring](extension-authoring.md) — build an extension: the three-file manifest, declared dependencies, and the `register(ctx)` activation contract
- [Extension publishing](extension-publishing.md) — the submit → approve → promote → registry-sync flow and the `@cinatra-ai/*` registry
- [Extension lifecycle and distribution](extension-lifecycle.md) — the canonical manifest, lifecycle states, and distribution
- [Extension permissions](extension-permissions.md) — the permissions architecture for extensions
- [Extension README contract](extension-readme.md) — the marketplace-ready README every extension ships, plus the CI gate that enforces it
- [Workflow extension doctrine](workflow-extension-doctrine.md) — the four contracts a workflow extension must define before it can replace and retire a legacy surface
- [Workflow extensions as app surfaces](workflow-extension-surfaces.md) — the typed-portlet `cinatra/dashboard.json` operator surface, never a bespoke route tree
- [Cinatra BPMN Profile 1.0](cinatra-bpmn-profile.md) — the `cinatra/workflow.bpmn` authoring profile: supported constructs, the 12 `cinatra:` elements, and the BPMN→WorkflowSpec mapping

## Building and extending

- [Building TypeScript packages for extensions](building-packages.md) — extension architecture and package conventions
- [Shell skills](shell-skills.md) — give an agent shell tool access

## Artifacts

- [Artifacts — architecture, threat model and invariants](artifacts.md)
- [Artifacts — LLM attachments and prompt-window upload](artifacts-attachments-and-prompt-window-upload.md)
- [Artifacts — preflight and legacy-media purge gate](artifacts-preflight.md)
- [Authoring semantic artifact extensions](semantic-artifact-extensions.md)

## Skills

- [Skill matching](skill-matching.md) — the LLM evaluator, OpenAI batch, and visibility filter
- [Skills storage layout](skills-storage-layout.md) — where skills live on disk and in the catalog

## Connectors

- [Integrating Cinatra with a CMS](integrating-with-a-cms.md) — the WordPress and Drupal reference integrations, plus how to wire a third CMS the same way
- [WordPress plugin / Drupal module development](wp-drupal-plugin-development.md) — where commits go now that the plugin/module live in extracted repos, the `cinatra setup dev` clone-sync workflow, and contract-version bumps
- [Email connector](email-connector.md) — the provider-neutral transport facade
- [Blog and social-media connectors](blog-and-social-connectors.md) — provider-neutral transport facades
- [Drupal connector](drupal-connector.md) — the Drupal integration pattern
- [CRM connector](crm-connector.md) — the provider-neutral CRM facade (Twenty), retired-package story, deeplink UI, and pointer-row model
- [Connector setup-page route extraction](connector-route-extraction.md) — the setup-page route contract

## Open standards

- [Open standards in Cinatra](open-standards.md) — agent-to-agent (A2A) protocol, Agent-User Interaction Protocol (AG-UI), agent-to-UI (A2UI) protocol, OAS — what Cinatra implements, the version pins, the endpoint matrix
- [A2UI usage in Cinatra](a2ui-usage.md) — using A2UI for human-in-the-loop surfaces
- [Cross-instance collaboration](cross-instance-collaboration.md) — registry routing, external A2A surface, AgentCard discovery, and how two instances talk at the protocol level

## Platform features (implementation)

- [Dashboards platform](dashboards-platform.md) — the implementation behind the [user-facing dashboards](../user/dashboards.md)
- [Release workflows](release-workflows.md) — the engine behind the [user-facing release workflows](../user/release-workflows.md)
- [Notifications](notifications.md) — the notification subsystem
- [Data safety: undo and versioning](data-safety-undo.md) — the version history and rollback model behind the [user-facing undo and history](../user/undo-and-history.md)
- [Project scoping](project-scoping.md) — the project ownership and access model
- [Authorization admin powers](authz-admin-powers.md) — how elevated authorization is granted and enforced
- [Clone-on-demand worktrees](clone-on-demand.md) — heavy deep-fork clone tooling for isolated development

## Integrations

- [ChatGPT built-in assistant](integrations/chatgpt-built-in-assistant.md)
- [Gemini built-in assistant](integrations/gemini-built-in-assistant.md) — documented design, not currently wired into the chat surface

## Deep references

Advanced, internal engineering references — contributor material, not part of the day-to-day developer flow.

- [WayFlow (Cinatra's OAS Flow agent runtime) `InputMessageNode` contract](wayflow-input-message-node-contract.md)
- [WayFlow `user_envelope` contract](wayflow-user-envelope-contract.md)
- [WayFlow runtime hot-reload](wayflow-runtime-reload.md)
- [BullMQ (a Redis-backed job queue) and agent runtime boundary](bullmq-wayflow-boundary.md)
- [Headless e2e hydration requirements](e2e-headless-hydration.md)
- [role-based access control (RBAC) browser e2e in CI](rbac-browser-e2e-ci.md)
- [Testing doctrine](testing-doctrine.md)
- [Wave execution policy](wave-execution-policy.md)
- [Dev-mode build-performance harness](devperf-harness.md) — `pnpm route-graph` / `pnpm bench:cold-start` / `pnpm dev:stop` + the build-performance acceptance contract

## Contribute

- [Contributing](contributing.md)

---

## Where to go next

- The MCP architecture underpinning every cross-package call: [Internal architecture](../mcp/internal-architecture.md)
- The runtime configuration surface: [Configuration](../hosting/configuration.md)
