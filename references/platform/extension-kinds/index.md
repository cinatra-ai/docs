# Extension kinds — choose your kind

A Cinatra extension is exactly one of five kinds, declared as `cinatra.kind` in `package.json`. The kind decides almost everything about how you author it: what payload you ship, whether you write a `register(ctx)` server entry at all, and which lifecycle the host runs. **Most extensions are not connectors.** The four declarative kinds — agent, artifact, skill, workflow — are authored primarily as data (an OAS Flow file, a descriptor block, a `SKILL.md`, a BPMN spec), and most of them never write a line of `register(ctx)` server code. Only the connector kind is a code package with a **host-port `register(ctx)` server entry**. (An artifact extension may *optionally* ship its own `detail`/`preview` **renderer** — an RSC component that requests no host ports and renders only from a host-supplied snapshot — but it still has no `register(ctx)` server entry; see its guide.)

Pick your kind below and follow its dedicated guide. The cross-kind concerns every extension shares — the package shape, the manifest, the dependency graph, the README and conformance gates — live in the [Extension authoring hub](../../../guides/developer/extension-authoring.md).

## The five kinds at a glance

| Kind | Build it when you want to add… | What you actually author | `register(ctx)`? | Guide |
|---|---|---|---|---|
| **agent** | An OAS Flow agent — a role the platform can run. | A declarative `cinatra/oas.json` Flow file + co-located skills. | No (declarative). | [Authoring agent extensions](authoring-agent-extensions.md) |
| **connector** | An integration to an external system, or a provider behind a capability facade. | A TypeScript code package with a `register(ctx)` server entry and setup/settings pages. | **Yes.** | [Authoring connector extensions](authoring-connector-extensions.md) |
| **artifact** | A semantic content type with matcher/authoring skills, and optionally its own view. | A descriptor package declaring an `artifact` block + a classifier `SKILL.md`, plus an optional `cinatra.artifact.ui` renderer. | No server entry — but may ship a port-less `detail`/`preview` renderer. | [Authoring artifact extensions](authoring-artifact-extensions.md) |
| **skill** | One or more `SKILL.md` skills delivered to agents/the assistant. | A content package of `skills/<slug>/SKILL.md` directories. | No (payload-only). | [Authoring skill extensions](authoring-skill-extensions.md) |
| **workflow** | A multi-step BPMN process orchestrating agents and approvals. | A BPMN spec + an optional dashboard sidecar. | No (declarative; runs via the workflow path). | [Authoring workflow extensions](authoring-workflow-extensions.md) |

`cinatra.kind` is singular and is the authoritative signal for lifecycle, dispatch, and discovery. The directory suffix (`<slug>-<kind>`) is a strong hint validated by the naming-conformance test, but the manifest wins on disagreement.

## How to choose

- **Adding a runnable role** the platform invokes (chat, a flow, an orchestrator that calls sub-agents)? → **agent**. Authored entirely as an OAS Flow file; no TypeScript.
- **Integrating an external system** (a CRM, a CMS, an email provider, an MCP server) or **standing up a provider behind a capability facade**? → **connector**. This is the one kind with a `register(ctx)` server entry, host ports, and (optionally) schema migrations.
- **Teaching the platform a new work-product type** that the LLM should recognize and classify (a contract, a brief, a design doc)? → **artifact**. A metadata descriptor plus a classifier skill — and, when you want the type to render as itself, an optional `cinatra.artifact.ui` detail/preview renderer.
- **Shipping reusable know-how** (a playbook, a procedure) for agents and the assistant to pick up? → **skill**. One or more `SKILL.md` files; no server code.
- **Orchestrating multiple steps, agents, and approvals** into one repeatable process? → **workflow**. A BPMN spec with an optional dashboard.

> **`ObjectSyncAdapter` is not a connector.** A connector extension is an integration to an external system; an `ObjectSyncAdapter` mirrors a Cinatra object out to an external CRM/CMS. They are orthogonal — adding a sync adapter does not make you a connector kind.

## What every kind shares

Whatever your kind, the same cross-kind machinery applies:

- **The package shape and three-file manifest** — `package.json` `cinatra` block + the `.cinatra-published.json` provenance sidecar + the kind payload. See the [Extension authoring hub](../../../guides/developer/extension-authoring.md).
- **The dependency graph** — `cinatra.dependencies` declares cross-kind edges by capability, not by concrete provider. See the hub's dependency section.
- **The README contract and conformance gates** — every kind ships a marketplace-ready [README](../extension-readme.md) and passes the [IoC safeguards](../extension-ioc-safeguards.md).
- **Publishing** — every kind ships through [Extension publishing](../../../guides/developer/extension-publishing.md).
- **The frozen SDK ABI and dependency rules** — [Extension SDK ABI and dependencies](../extension-sdk-abi-and-dependencies.md).

## See also

- [Extensions hub](../extensions.md) — the extension system end to end (the model, the five kinds, the live-install architecture, the lifecycle).
- [Extension authoring hub](../../../guides/developer/extension-authoring.md) — the cross-kind build-it walkthrough that routes here.
- [Extension lifecycle and distribution](../extension-lifecycle.md).
