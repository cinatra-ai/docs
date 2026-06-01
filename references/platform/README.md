# Platform references

Architecture, subsystem contracts, invariants, and protocol references for the Cinatra platform. These document how the system is built; for the task-oriented authoring workflow see the [Developer Guide](../../guides/developer/README.md).

## Architecture & runtime
- [Architecture](architecture.md) — how the platform is composed: monorepo layout, runtime split, package boundaries
- [Source package architecture](source-package-architecture.md) — how a domain capability is structured as a workspace package
- [LLM orchestration](llm-orchestration.md) — the central orchestration layer over the provider SDKs
- [BullMQ and agent-runtime boundary](bullmq-wayflow-boundary.md) — the job-queue ↔ runtime seam
- [WayFlow `InputMessageNode` contract](wayflow-input-message-node-contract.md)
- [WayFlow `user_envelope` contract](wayflow-user-envelope-contract.md)
- [WayFlow runtime hot-reload](wayflow-runtime-reload.md)

## Security & access
- [Security](security.md) — identities, authentication, authorization, secrets, agent execution safety
- [Authorization admin powers](authz-admin-powers.md)
- [Project scoping](project-scoping.md)
- [Extension access contract](extension-access-contract.md)
- [Extension permissions](extension-permissions.md)
- [Extension data ownership](extension-data-ownership.md)
- [Extension IoC safeguards](extension-ioc-safeguards.md)

## Objects & data
- [Objects: the canonical surface](objects.md)
- [Objects layer](objects-layer.md) — the typed object store, dual-write hooks, registration
- [Objects surface unification](objects-surface-unification.md)
- [Data safety: undo and versioning](data-safety-undo.md)

## Agents
- [Agent spec — compact Open Agent Specification (OAS) Flow](agent-spec.md)
- [Agent packaging](agent-packaging.md)
- [ensureAgentPackage](ensure-agent-package.md)
- [Chat agent authoring review](chat-agent-authoring-review.md)

## Extensions
- [Extensions](extensions.md) — the extension system end to end
- [Extension lifecycle and distribution](extension-lifecycle.md)
- [Extension README contract](extension-readme.md)
- [Extension dev fixtures](extension-dev-fixtures.md)

## Connectors
- [Integrating Cinatra with a CMS](integrating-with-a-cms.md)
- [CRM connector](crm-connector.md) — the provider-neutral CRM facade (Twenty)
- [Email connector](email-connector.md)
- [Blog and social-media connectors](blog-and-social-connectors.md)
- [Drupal connector](drupal-connector.md)

## Artifacts
- [Artifacts — architecture, threat model and invariants](artifacts.md)
- [Artifacts — LLM attachments and prompt-window upload](artifacts-attachments-and-prompt-window-upload.md)
- [Artifacts — preflight and legacy-media purge gate](artifacts-preflight.md)

## Workflows & dashboards
- [Workflow extension doctrine](workflow-extension-doctrine.md)
- [Workflow extensions as app surfaces](workflow-extension-surfaces.md)
- [Cinatra BPMN Profile 1.0](cinatra-bpmn-profile.md)
- [Dashboards platform](dashboards-platform.md)
- [Release workflows](release-workflows.md)
- [Notifications](notifications.md)

## Skills
- [Skill matching](skill-matching.md)
- [Skills storage layout](skills-storage-layout.md)
- [Shell skills](shell-skills.md)

## Open standards & protocols
- [Open standards in Cinatra](open-standards.md) — A2A, AG-UI, A2UI, OAS
- [A2UI usage in Cinatra](a2ui-usage.md)
- [Cross-instance collaboration](cross-instance-collaboration.md)

## Testing & CI
- [Testing doctrine](testing-doctrine.md)
- [RBAC browser e2e in CI](rbac-browser-e2e-ci.md)
- [Headless e2e hydration requirements](e2e-headless-hydration.md)
- [Wave execution policy](wave-execution-policy.md)
- [Dev content fixtures (Drupal / WordPress / Twenty)](dev-cms-fixtures.md)
