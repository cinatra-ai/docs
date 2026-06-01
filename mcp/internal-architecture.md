# Internal architecture

Cinatra is a TypeScript monorepo of packages running on Next.js. Each package owns a domain — agents, lists, dashboards, the Apollo connector, the Gmail connector, and so on. The packages do not import each other's internals. They communicate through primitives registered with a single shared MCP runtime.

This page documents how that runtime is wired today.

---

## One server, many modules

The host app's `src/lib/mcp-server.ts` constructs a single `McpRuntimeToolServer` instance. Every domain package contributes a **module** — a factory like `createObjectsModule()`, `createDashboardsModule()`, `createGmailModule()` — and the host walks the module list at startup, calling each module's `registerCapabilities(server)`.

After registration the server has the union of every domain's primitives. There is one canonical catalog. The same catalog is reachable from three places:

1. **The external HTTP route** at `/api/mcp` — for Claude Code, ChatGPT connectors, and any other remote MCP client.
2. **The in-process deterministic transport** — for typed cross-package calls inside the same Node process.
3. **The agentic transport** — for the platform's chat assistant and large language model (LLM)-orchestration layer, which inject the MCP server as a tool on the LLM and let the model pick primitives by name.

All three paths run through the same handler functions and the same Zod schemas. Authoritative-actor primitives also run through the same authorization gates regardless of transport; the few primitives that currently register with a fixed actor envelope are flagged on the [Primitives](primitives.md) page.

## The deterministic in-process client

When package A needs a capability from package B, it doesn't import B's internals. It calls B's primitive through the deterministic in-process client.

The factory is `createInProcessPrimitiveTransport` in `@cinatra-ai/mcp-client`. Each package exports a typed wrapper around it — for example `@cinatra-ai/agents` exports `createDeterministicClient()` that returns a typed surface for every agent primitive. The wrapper calls the same handler family that the external HTTP route registers (the handler functions are the same; the package's deterministic client wires them into an in-process transport directly, while the external route registers them into the shared `McpRuntimeToolServer`). Either path bypasses JSON serialization — the deterministic transport hands typed values directly to the handler.

For the call site, this looks like:

```ts
const client = createAgentsDeterministicClient();
const result = await client.agentRunGet({ runId, actor: thisCallerActor });
```

Three things are happening:

- The call name is statically typed — wrong primitive name fails at compile time.
- The actor envelope is mandatory — the call cannot bypass authorization by forgetting to pass one.
- The handler runs the same authorization it would for an external HTTP call.

## Capability registration

Each module's `registerCapabilities(server)` runs a series of `server.register("primitive_name", schema, handler)` calls. The schema is Zod. The handler receives the parsed input, the actor envelope, and any platform-injected dependencies. The handler returns a typed result or throws a typed error.

The handler is where domain logic lives. It calls the package's store (Drizzle queries against Postgres), it calls the package's use cases, it does the work. When it needs another domain's capability, it constructs the other domain's deterministic client and calls that primitive — not the other domain's internal store.

## What this gives you

A few load-bearing properties fall out of this architecture:

- **One authorization model.** Every call goes through the actor envelope. There is no "internal" call path that skips authorization.
- **One audit surface.** Every primitive can write to the audit trail; every primitive sees the same actor identifying who is responsible.
- **One contract for testing.** Tests call primitives the same way the rest of the app does; there is no "test-only" backdoor that the production paths don't share.
- **Drop-in observability.** Tracing hooks on the deterministic transport see every cross-package call. Cost attribution can hang off the same hooks.
- **Architectural reversibility.** A package today registers as an in-process module. If the same package needed to run as a separate service tomorrow, the same primitive surface lifts directly into an HTTP transport without rewriting handlers.

The last point is the connection to the microservices-via-MCP vision documented in [Migration roadmap](migration-roadmap.md).

---

## Where to go next

- The boundary discipline this enforces: [Package boundaries](package-boundaries.md)
- The forward trajectory: [Migration roadmap](migration-roadmap.md)
- The external face of the same registration: [The external MCP server](external-server.md)
