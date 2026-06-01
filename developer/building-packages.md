# Building TypeScript Packages for Extensions

Cinatra extends through extensions, and many extensions are backed by a TypeScript package. Every domain capability — a new agent, a new connector to an external service, a new asset type, a new entity store, a new background job — lives in its own package under `packages/<name>/`. Packages do not import each other's internals; they call each other through capability surfaces, so adding a package does not entangle existing ones.

This document describes the conventions a Cinatra package follows. For end-to-end agent authoring (where the extension is an Open Agent Specification (OAS) Flow file rather than a TypeScript package), see [Developing agents](developing-agents.md).

---

## When you need a package

You need a TypeScript package when you have at least one of:

- **Custom persistence.** A new table or schema definition the agent or feature owns.
- **A capability surface other code should call.** Domain operations exposed as Model Context Protocol (MCP) primitives.
- **Background work.** A BullMQ (a Redis-backed job queue) job and worker the platform should run.
- **A UI surface.** Screens that mount into the Next.js app.
- **A typed in-process client.** Other packages or server actions need a typed wrapper to call you without going over HTTP.

If you do not need any of those — your agent is a sequence of MCP tool calls and a system prompt — you do not need a package. Author it as an OAS Flow file directly under `agents/<vendor>/<slug>/` instead.

---

## What a package contains

A typical Cinatra package has this shape:

```
packages/<name>/
  package.json          — workspace package, named "@cinatra/<name>"
  AGENTS.md             — engineering reference for the package (internal)
  src/
    index.ts            — public surface, named re-exports only
    schema.ts           — Drizzle schema for this package's tables
    store.ts            — read/write functions over the schema
    mcp/
      handlers.ts       — MCP primitive implementations
      schemas.ts        — Zod input schemas for primitives
      registry.ts       — registers primitives with the MCP server
      client/
        deterministic-client.ts — typed in-process wrapper
    integration/
      module.ts         — host-app wiring entry point
    extension/
      definition.ts     — extension metadata (id, name, slug, description)
    screens.tsx         — React server components mounted by the route registry
    ports/              — port types for the package (hexagonal pattern)
    application/        — use case functions composed from ports
    presentation/       — UI components used inside screens
```

Not every package needs every directory. The minimum is `src/index.ts` plus whatever subsystems you are introducing. The structure above is the maximal pattern; smaller packages omit what they do not use.

---

## Conventions

### Naming

- **Files:** kebab-case (`agent-runner.ts`, not `agentRunner.ts` or `AgentRunner.ts`).
- **Functions:** camelCase. Common prefixes: `read*` / `write*` / `update*` / `delete*` for store access; `build*` for data-structure assembly; `handle*` for event handlers; `create*` for factory functions.
- **Types and components:** PascalCase. Props types end with `Props`; port types end with `Port`; store types end with `Store`.
- **MCP primitives:** underscore-separated, prefixed by the package's domain (`accounts_create`, `objects_save`, `agent_run`).
- **Package name:** the scoped npm-style package name puts the kind last (e.g. `@cinatra-ai/email-drafting-agent`, `@cinatra-ai/assistant-skills`) — see [Naming conventions](extensions.md#naming-conventions).

### TypeScript

- Strict mode is on, with `noImplicitAny: false` for some loose typing.
- Module resolution: `bundler`.
- Always use `import type` for type-only imports.
- Path aliases: `@/` for the Next.js app's `src/`, `@cinatra/<name>` for workspace packages — never relative paths crossing package boundaries.

### Imports

- Never import directly from another package's internal files. Use the declared entry point: `import { foo } from "@cinatra-ai/objects"`, not `import { foo } from "../../objects/src/internal/foo"`.
- Package `index.ts` files use explicit named re-exports, not `export *`.
- Named sub-entry points are declared in `tsconfig.json` paths (for example `@cinatra-ai/objects/auto-registrar`, `@cinatra-ai/objects/registry`) for cases where the barrel export is host-only.

### Validation and errors

- MCP handler inputs are validated with Zod (`schema.parse()` — throws on invalid input).
- Domain-level errors are typed: a class extending `Error` with `code`, `retryable`, and `details` fields, plus a `toDomainError(error, fallbackCode)` converter for unknown errors.
- Server actions redirect on success via `redirect()`; they do not return a redirect value.

---

## Wiring a package into the app

A new package becomes part of the running app in three places:

1. **MCP registry.** The package's `registry.ts` registers its primitives with the platform's MCP server at startup.
2. **Background jobs.** If the package has a worker, its job constants and handler are registered with the BullMQ queue.
3. **Extension route registry.** If the package has UI screens, its `agentScreens` export (or equivalent) is mapped to routes in the host app's extension route registry. Some legacy code still uses the older `agentPluginScreens` identifier — both resolve to the same screen surface.

The host app reads each package's `src/index.ts` and follows its public surface — there is no manifest-driven loader. The result is that adding an extension is a normal TypeScript dependency change, not a configuration ceremony.

---

## When the package surface is OAS, not TypeScript

Many "agent extensions" in Cinatra are not TypeScript packages at all — they are OAS Flow files under `agents/<vendor>/<slug>/cinatra/oas.json`. These are first-class citizens: they are published, versioned, installed, and run the same way as TypeScript packages, but their entire definition lives in declarative JSON. The compiler in `@cinatra-ai/agents` converts the OAS Flow into the runtime representation; WayFlow (Cinatra's OAS Flow agent runtime) executes it; the platform handles persistence, observability, and human-in-the-loop (HITL) automatically.

If your contribution is "an agent that calls these tools in this order with this prompt," do not build a TypeScript package — author an OAS Flow file. The platform infrastructure is already there. See [Developing agents](developing-agents.md) for the authoring workflow.

---

## Where to go next

- Author an agent without building a package: [Developing agents](developing-agents.md)
- Understand the protocols packages plug into: [Open standards in Cinatra](open-standards.md)
