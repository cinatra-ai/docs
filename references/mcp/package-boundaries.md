# Package boundaries

The rule across Cinatra's monorepo is simple: **packages talk to each other through Model Context Protocol (MCP) primitives, not through direct imports of each other's internals.**

This page explains what that rule looks like in practice, why it exists, and the narrow exceptions.

---

## The rule

Each `@cinatra/<package>` exposes a public surface in `src/index.ts`. Other packages import from that public surface. They do not import from `packages/<other>/src/internal/...`. They do not reach across into `packages/<other>/src/store.ts` or `packages/<other>/src/some-deep-module.ts`.

For cross-package *operations* — "package A wants package B to do something" — the canonical path is package B's MCP primitive, called via package B's deterministic in-process client. Not an internal function exported from B.

A concrete example. The `@cinatra-ai/asset-blog` package owns blog content. When the agent runtime needs to update a blog post mid-run, it does not import `updateBlogPost` from `@cinatra-ai/asset-blog`. It calls `blog_post_update` through the deterministic transport. Same handler, same Zod validation, same actor authorization.

## What gets shared cross-package

Types, schemas, and stable "this is what a thing looks like" primitives can cross package boundaries through the public surface. For instance, `AgentTemplateRecord` is a typed shape exported by `@cinatra-ai/agents` and consumed by `@cinatra-ai/extensions`. That's fine — it's a data shape, not an operation.

What does *not* cross boundaries: functions that mutate state, functions that hit the database, functions that touch shared infrastructure, functions that call the large language model (LLM). Those are operations; they go through primitives.

## Why this rule

Three concrete reasons:

1. **Authorization is uniform.** A primitive call always runs through `enforceRunAccess` / `enforceResourceAccess` / whatever the package's gate function is. A direct internal-function call doesn't. When someone refactors a primitive's gate to be tighter, every cross-package caller picks up the tightening automatically. With direct imports, callers can drift.

2. **Audit is uniform.** Every primitive can write an `audit_events` row. Every primitive sees the actor envelope. Cross-package calls that skip the primitive layer skip the audit trail.

3. **Boundary reversibility.** The same primitive call works whether the target package runs in-process or behind an HTTP transport. A package that grows past the boundary of one Node process can be lifted into a separate service without rewriting its callers. This is the basis of the microservices-via-MCP trajectory documented in [Migration roadmap](migration-roadmap.md).

## Verifying the rule

The boundary is enforced socially and by code review, not by the type system. TypeScript path aliases let cross-package imports work as long as the symbol is exported from the target's public surface — but it's the public surface's responsibility to only export shapes, not operations.

A few patterns that signal a boundary violation:

- A `*.handler.ts` or `*-actions.ts` file in package B exported from `@cinatra/<B>` and imported from package A. Handlers and actions are operations.
- A direct `import { someStore }` from another package. Stores are private to the package that owns them.
- Tests in package A that mock symbols imported directly from `@cinatra/<B>/src/internal/...`. The test path tells you the production path is also wrong.

The deterministic in-process client is the right tool for almost every cross-package operational need. If it can't express what you need, the right move is usually to add a primitive to the target package, not to reach inside it.

## The narrow exception: orchestration glue

There is exactly one category of cross-package import that is allowed for operations: the orchestration glue in `src/lib/mcp-server.ts` itself. That file imports every package's `createXxxModule()` factory and walks the list to register the modules. That import path is not a domain operation — it's the wiring that builds the runtime.

Anything outside `src/lib/mcp-server.ts` (and the tightly-related `src/lib/extensions.ts`) that imports a module factory or a register function from another package is suspect.

## What this looks like for a developer

When you're working on a feature that spans two packages, the question is always: "should this be one primitive in package A that internally uses package B's primitive, or two primitives the UI orchestrates?"

The answer usually depends on whether the cross-package call has its own authorization story:

- If package A's primitive can naturally inherit B's authorization (because A's actor is the same actor B would check), the in-A-call-B-primitive pattern is fine.
- If the right authorization is "either A's gate passes OR B's gate passes," it usually wants two primitives that the UI orchestrates so the user sees both checks distinctly.

---

## Where to go next

- The runtime that enforces this in practice: [Internal architecture](internal-architecture.md)
- The forward direction: [Migration roadmap](migration-roadmap.md)
- The architecture overview that frames this: [Architecture](../platform/architecture.md)
