# Migration roadmap

Cinatra's long-term architectural direction is **a microservices-style architecture, but the inter-service contract is Model Context Protocol (MCP) primitives, not REST.** Every domain package becomes a deployable unit; every cross-domain operation is a typed primitive call; every call carries the same actor envelope and authorization model.

This page documents the current state, the trajectory, and what's deliberately not yet done.

---

## Where the platform is today

Today every package lives inside one Node process. The host app's `src/lib/mcp-server.ts` builds a single `McpRuntimeToolServer` and walks the module list at startup. Packages talk to each other through the in-process deterministic transport — same primitive contract as the external HTTP route, no network hop.

The boundary discipline is real, but the deployment unit is monolithic. A change to any package redeploys the whole app. A failure in one domain takes the process with it.

## What stays the same

The primitive contract is already shaped for service-boundary lift:

- **One transport interface.** `createInProcessPrimitiveTransport` is one implementation of the `PrimitiveTransport` type. Another implementation — an HTTP transport — is a drop-in replacement for any single cross-package call site.
- **One actor envelope.** Every primitive call carries a `PrimitiveActorContext` regardless of transport. The handler can't tell whether the caller is in-process or remote.
- **One authorization model.** `enforceRunAccess` / `enforceResourceAccess` / equivalent runs identically over either transport.
- **One audit surface.** The `audit_events` writer can be co-located with the called handler in either deployment topology.

The handlers themselves don't change. The wiring does.

## What changes

The migration from "one process, in-process transport" to "many processes, HTTP transport between them" is gradual. A package that grows enough to warrant its own service:

1. Keeps its existing handlers unchanged.
2. Replaces its `createXxxModule()` registration in `src/lib/mcp-server.ts` with an "external" client pointing at the service's own MCP endpoint.
3. Spins up its own Next.js / Node process exposing the same primitives at its own `/api/mcp`.
4. Shares the same auth provider (or accepts JWTs signed by it) so the actor envelope stays consistent across the boundary.

The caller doesn't notice. It still calls `accounts_list` through the deterministic client; the client now routes the call over HTTP transparently.

## What is intentionally not yet done

Several pieces of the migration are deliberately deferred:

- **No service for any package.** Today every package runs in-process. No "auth service", no "agents service", no "objects service". The next service to peel off has not been chosen because the operational cost of running it has to be weighed against the gains.
- **No service-mesh ergonomics.** No service discovery, no per-call mTLS, no per-call rate limiting. The HTTP transport that would carry inter-service calls reuses Cinatra's existing auth + CORS + audit machinery; a real mesh is later.
- **No "remote MCP primitive in your tool list" surface for arbitrary external services.** External MCP servers can be configured by an admin and surfaced into agent runs, but they don't participate in Cinatra's actor envelope. That's a different boundary (caller agent → external MCP) from the internal-microservices boundary (Cinatra service A → Cinatra service B).

These deferrals are not philosophical objections; they are scope decisions. The work to do them well is bigger than the work to do them at all.

## How to think about this when contributing

Contribution work is planned with GSD ("Git. Ship. Done", the open-gsd spec-driven development framework) — see [Contributing](../../guides/developer/contributing.md#planning). Beyond that, two practical guidelines if you're working on a feature that might want to be a separate service one day: <!-- source-leak-allow -->

1. **Don't bake the deployment topology into the package.** A package's primitives should be callable without assuming the caller is in the same Node process. The deterministic-client wrapper makes this trivially the case today; future you will thank present you for not adding "if (sameProcess()) shortcut" branches.

2. **Don't introduce non-primitive cross-package APIs.** Stick to the rule documented in [Package boundaries](package-boundaries.md). Every back-door reduces the boundary's reversibility.

If you find yourself reaching for a non-primitive cross-package call because "MCP is too slow" or "the actor envelope is too rigid," push back at the design instead of working around it. Both are addressable. The architecture is worth more than the convenience.

## What this isn't

This is not a plan to rewrite everything. The vast majority of Cinatra's packages will live happily in one Node process forever. Microservices-via-MCP is an option for the packages that earn it, not a requirement for all of them. The architecture's value is that the option *exists* without rewriting handlers, not that it has to be exercised everywhere.

---

## Where to go next

- The current architecture in detail: [Internal architecture](internal-architecture.md)
- The boundary discipline that makes the option reversible: [Package boundaries](package-boundaries.md)
- The external HTTP transport already used by remote MCP clients: [The external MCP server](external-server.md)
