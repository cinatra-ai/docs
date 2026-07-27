# Developer Guide

This guide is for people working on Cinatra's code — writing agents, building extensions, contributing to the platform, integrating with the open standards Cinatra speaks. Work here is planned with GSD ("Git. Ship. Done"), the [open-gsd](https://github.com/open-gsd/gsd-core) spec-driven development framework — see [Contributing](contributing.md#planning). <!-- source-leak-allow -->

For end-user material, see the [User Guide](../user/README.md). For platform-administration content, see the [Admin Guide](../admin/README.md). For installation and configuration, see the [Hosting Guide](../hosting/README.md). For the Model Context Protocol (MCP) server (external and internal), see the [MCP Guide](../../references/mcp/README.md).

---

## Foundations

- [Architecture](../../references/platform/architecture.md) — how the platform is composed: monorepo layout, runtime split, package boundaries
- [Security](../../references/platform/security.md) — identities, authentication, authorization, secrets handling, agent execution safety
- [large language model (LLM) orchestration](../../references/platform/llm-orchestration.md) — the central orchestration layer over the provider SDKs
- [Source package architecture](../../references/platform/source-package-architecture.md) — how a domain capability is structured as a workspace package
- [MCP patterns](../../references/mcp/patterns.md) — how primitives are injected and called across packages

## Objects and data

- [Objects layer](../../references/platform/objects-layer.md) — the platform's typed object store, dual-write hooks, registration
- [Objects: the canonical surface](../../references/platform/objects.md) — the unified object model and its primitives
- [Objects surface unification](../../references/platform/objects-surface-unification.md) — the consolidation onto the canonical objects surface

## Authoring agents

- [Developing agents](developing-agents.md) — the file-driven contributor authoring loop
- [Agent development guide](agent-development.md) — building an agent end to end
- [Agent spec — compact Open Agent Specification (OAS) Flow](../../references/platform/agent-spec.md) — the `oas.json` agent definition format
- [Agent packaging](../../references/platform/agent-packaging.md) — canonical packaging conventions
- [Agent context slots](context-slots.md) — how context is injected into a run
- [ensureAgentPackage](../../references/platform/ensure-agent-package.md) — the system-provided agent startup pattern
- [Chat agent authoring review](../../references/platform/chat-agent-authoring-review.md) — the in-chat authoring review loop

## Extensions

- [Extensions](../../references/platform/extensions.md) — the extension system end to end: the five kinds, the dual loader, `register(ctx)`, the host context ports, and the installed-extension gate
- [Extension authoring](extension-authoring.md) — build an extension: the three-file manifest, declared dependencies, and the `register(ctx)` activation contract
- [Extension publishing](extension-publishing.md) — the submit → approve → promote → registry-sync flow and the `@cinatra-ai/*` registry
- [Extension lifecycle and distribution](../../references/platform/extension-lifecycle.md) — the canonical manifest, lifecycle states, and distribution
- [Extension permissions](../../references/platform/extension-permissions.md) — the permissions architecture for extensions
- [Extension README contract](../../references/platform/extension-readme.md) — the marketplace-ready README every extension ships, plus the CI gate that enforces it
- [Workflow extension doctrine](../../references/platform/workflow-extension-doctrine.md) — the four contracts a workflow extension must define before it can replace and retire a legacy surface
- [Workflow extensions as app surfaces](../../references/platform/workflow-extension-surfaces.md) — the typed-portlet `cinatra/dashboard.json` operator surface, never a bespoke route tree
- [Cinatra BPMN Profile 1.0](../../references/platform/cinatra-bpmn-profile.md) — the `cinatra/workflow.bpmn` authoring profile: supported constructs, the 12 `cinatra:` elements, and the BPMN→WorkflowSpec mapping

## Building and extending

- [Building TypeScript packages for extensions](building-packages.md) — extension architecture and package conventions
- [Sandboxed execution and shell skills](../../references/platform/shell-skills.md) — where an agent's commands, scripts and installs actually run

## Artifacts

- [Artifacts — architecture, threat model and invariants](../../references/platform/artifacts.md)
- [Artifacts — LLM attachments and prompt-window upload](../../references/platform/artifacts-attachments-and-prompt-window-upload.md)
- [Artifacts — preflight and legacy-media purge gate](../../references/platform/artifacts-preflight.md)
- [Authoring semantic artifact extensions](semantic-artifact-extensions.md)
- [Authoring shadcn registry items](authoring-registry-items.md) — contributing presentational `registryItems` to the shared design registry: identity, presentational constraints, digest-vs-alias serving, append-only lifecycle

## Skills

- [Skill matching](../../references/platform/skill-matching.md) — the LLM evaluator, OpenAI batch, and visibility filter
- [Skills storage layout](../../references/platform/skills-storage-layout.md) — where skills live on disk and in the catalog

## Connectors

- [Integrating Cinatra with a CMS](../../references/platform/integrating-with-a-cms.md) — the WordPress and Drupal reference integrations, plus how to wire a third CMS the same way
- [WordPress plugin / Drupal module development](wp-drupal-plugin-development.md) — where commits go now that the plugin/module live in extracted repos, the `cinatra instance setup dev` clone-sync workflow, and contract-version bumps
- [Email connector](../../references/platform/email-connector.md) — the provider-neutral transport facade
- [Blog and social-media connectors](../../references/platform/blog-and-social-connectors.md) — provider-neutral transport facades
- [Drupal connector](../../references/platform/drupal-connector.md) — the Drupal integration pattern
- [CRM connector](../../references/platform/crm-connector.md) — the provider-neutral CRM facade (Twenty), retired-package story, deeplink UI, and pointer-row model
- [Connector setup-page route extraction](connector-route-extraction.md) — the setup-page route contract

## Open standards

- [Open standards in Cinatra](../../references/platform/open-standards.md) — agent-to-agent (A2A) protocol, Agent-User Interaction Protocol (AG-UI), agent-to-UI (A2UI) protocol, OAS — what Cinatra implements, the version pins, the endpoint matrix
- [A2UI usage in Cinatra](../../references/platform/a2ui-usage.md) — using A2UI for human-in-the-loop surfaces
- [Cross-instance collaboration](../../references/platform/cross-instance-collaboration.md) — registry routing, external A2A surface, AgentCard discovery, and how two instances talk at the protocol level

## Platform features (implementation)

- [Dashboards platform](../../references/platform/dashboards-platform.md) — the implementation behind the [user-facing dashboards](../user/dashboards.md)
- [Release workflows](../../references/platform/release-workflows.md) — the engine behind the [user-facing release workflows](../user/release-workflows.md)
- [Notifications](../../references/platform/notifications.md) — the notification subsystem
- [Data safety: undo and versioning](../../references/platform/data-safety-undo.md) — the version history and rollback model behind the [user-facing undo and history](../user/undo-and-history.md)
- [Project scoping](../../references/platform/project-scoping.md) — the project ownership and access model
- [Authorization admin powers](../../references/platform/authz-admin-powers.md) — how elevated authorization is granted and enforced
- [Clone-on-demand worktrees](clone-on-demand.md) — heavy deep-fork clone tooling for isolated development

## Integrations

- [ChatGPT built-in assistant](integrations/chatgpt-built-in-assistant.md)
- [Gemini built-in assistant](integrations/gemini-built-in-assistant.md) — documented design, not currently wired into the chat surface

## Deep references

Advanced, internal engineering references — contributor material, not part of the day-to-day developer flow.

- [WayFlow (Cinatra's OAS Flow agent runtime) `InputMessageNode` contract](../../references/platform/wayflow-input-message-node-contract.md)
- [WayFlow `user_envelope` contract](../../references/platform/wayflow-user-envelope-contract.md)
- [WayFlow runtime hot-reload](../../references/platform/wayflow-runtime-reload.md)
- [BullMQ (a Redis-backed job queue) and agent runtime boundary](../../references/platform/bullmq-wayflow-boundary.md)
- [Headless e2e hydration requirements](../../references/platform/e2e-headless-hydration.md)
- [role-based access control (RBAC) browser e2e in CI](../../references/platform/rbac-browser-e2e-ci.md)
- [Testing doctrine](../../references/platform/testing-doctrine.md)
- [Wave execution policy](../../references/platform/wave-execution-policy.md)
- [Dev-mode build-performance harness](devperf-harness.md) — `pnpm route-graph` / `pnpm bench:cold-start` / `pnpm dev:stop` + the build-performance acceptance contract

## Contribute

- [Contributing](contributing.md) — how to contribute, and how work is planned with GSD ("Git. Ship. Done", the open-gsd spec-driven development framework) <!-- source-leak-allow -->

---

## Where to go next

- The MCP architecture underpinning every cross-package call: [Internal architecture](../../references/mcp/internal-architecture.md)
- The runtime configuration surface: [Configuration](../hosting/configuration.md)
