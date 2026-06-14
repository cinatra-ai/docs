# Authoring agent extensions

Audience: developers shipping a `kind: "agent"` extension — a runnable role the platform invokes.

An agent extension is **declarative**: you author an Open Agent Specification (OAS) Flow file, not TypeScript server code. There is no `register(ctx)` server entry — the agent's inputs, system prompt, tool references, flow-control nodes, output schema, and human-in-the-loop (HITL) renderers are all declared in `cinatra/oas.json`, and a compiler derives the runtime representation. Co-located `SKILL.md` files travel with the agent.

This page is a router. The full author-facing guidance already lives in two dedicated documents — follow them rather than a duplicate here:

- **[Developing agents](../../../guides/developer/developing-agents.md)** — the file-driven contributor guide: the `oas.json` anatomy, the node graph, validation (`node scripts/ci-validate-agents.mjs`), and the dev-mode filesystem-scan workflow.
- **[Agent packaging](../agent-packaging.md)** — how an agent is packaged as an installable extension (the `agent_templates` / `agent_template_versions` install unit, versions, and the disk mount).
- **[Agent spec — compact OAS Flow](../agent-spec.md)** — the normative reference for the `oas.json` shape.
- **[Chat agent authoring review](../chat-agent-authoring-review.md)** — the review contract agent changes are held to.

> **Looking for the no-code path?** Most agents are written conversationally through Cinatra's chat assistant, not by hand-editing files. See [Creating agents in chat](../../../guides/user/creating-agents-in-chat.md). The documents above are the file-driven contributor path.

## What the kind contributes

The agent install unit is an OAS package → `agent_templates`, `agent_template_versions`, an agent-runtime disk mount, and the skills catalog. It contributes the OAS spec, the compiled plan, in/out schemas, the approval + HITL policy, LLM config, MCP toolbox usage, agent/connector dependencies, trigger mode, auth policy, co-located `SKILL.md` skills, and declared output object types.

## Cross-kind concerns

The package shape, the `cinatra` manifest block, the `cinatra.dependencies` graph, the README contract, and the conformance gates are shared across all kinds — see the [Extension authoring hub](../../../guides/developer/extension-authoring.md). Ship through [Extension publishing](../../../guides/developer/extension-publishing.md).

## See also

- [Extension kinds — choose your kind](index.md)
- [Extensions hub](../extensions.md)
