# Source Package Architecture

## Canonical patterns

### Generic reusable source packages

Each reusable source package should define:

- a clear package purpose
- an instance-based data model when repeated runs or named configurations matter
- explicit execution state and result storage
- public Model Context Protocol (MCP) primitives for CRUD, execution, and results
- generic creation and detail UIs that do not embed business-specific configuration

### Composed sources

A composed source should own:

- scenario-specific user input and configuration UI
- downstream instance creation
- orchestration sequencing across reusable sub-packages
- run history and progress mapping
- orchestration-specific legacy `SKILL.md` behavior

A composed source should not reimplement the generic execution logic moved into sub-packages.

## Deterministic vs LLM responsibilities

### Deterministic

Use deterministic code for:

- fetches
- parsing
- redirect checks
- validation HTTP requests
- structured third-party APIs
- persistence
- aggregation

### LLM via orchestration

Use large language model (LLM) orchestration for:

- extraction from raw fetched content when the user provides flexible instructions
- plan generation across a dataset
- reasoning-heavy per-item research
- schema-guided transformation that cannot be expressed safely as deterministic parsing alone

## Skills

- default package skills live under `packages/*/skills/*/SKILL.md`
- repo-wide refactor or architecture playbooks can live under `skills/*/SKILL.md`
- legacy skill preservation is mandatory during package splits
- instance-specific custom skills may be stored on instance records and, when expected by the architecture, persisted to the skills store

## AgentIOSpec and composability

Every agent extension declares its input and output object types via `AgentIOSpec`. This is separate from the object type registry — registration describes the type's shape and lifecycle; `AgentIOSpec` describes what flows into and out of an agent execution.

### Where to declare it

| Plugin type | Where | How |
|---|---|---|
| `AgentPluginDefinition` | `plugin/definition.ts` inline field | `ioSpec: { ... } satisfies AgentIOSpec` |
| `CampaignPluginDefinition` | standalone export in `plugin/definition.ts` | `export const xIoSpec: AgentIOSpec = { ... }` |
| Content / other plain objects | standalone export | same as campaign |
| Virtual (builder-compiled) | emitted by compiler SKILL.md LLM | parsed by `agentIOSpecSchema.safeParse()` in `compiler.ts` |

### Type ID rule

All `type` strings in `input[]` and `output[]` must exactly match a registered object type ID from the registry (`@cinatra/<pkg>:<local-id>`). Non-matching IDs silently cause `canCompose()` to return false — there is no runtime error.

### Seeding to DB

Code-based agents seed their `ioSpec` to `agent_templates.io_spec` at startup via `seedCodeBasedAgentIoSpec` from `/agents`. The function is idempotent (guards on `io_spec IS NULL`). Only call it from packages that have rows in `agent_templates` (i.e., packages with `AgentPluginDefinition`). Campaign and content plugins have no `agent_templates` rows — do not call `seedCodeBasedAgentIoSpec` from those modules.

### canCompose

```ts
import { canCompose } from "@cinatra/object-types";
canCompose(producer, consumer) // true if any producer.output[].type ∈ consumer.input[].type
```

Returns `false` when either array is empty — source agents with `input: []` cannot be checked as consumers.

## Completion-aware architecture work

When a split is already mostly complete:

- do not re-plan completed architecture
- isolate the remaining defect
- treat UI modal-session bugs separately from MCP, orchestration, and skill wiring if those are already complete

## BASE / renderer split for `objectTypeRegistry.register`

The BASE / renderer split prevents server actions and other server-only entry points from missing object type registrations in Next.js code-split chunks. The failure mode is a server action such as `createListAction` reaching `classifyObject(rawData, typeHint)` without the package's object type registered; classification can then fall through to the LLM classifier and fail when no actor context is available. Keeping a renderer-free base registration in the adapter makes the schema available to those chunks without pulling client UI modules into the server bundle.

When wiring `objectTypeRegistry.register({...})` into a code path that load-time-couples with server actions or other server-only entry points, split the definition into two layers:

### 1. Renderer-free BASE

Lives next to the adapter (e.g. `packages/<pkg>/src/integration/<entity>-object-type-definition.ts`). Exports the schema + lifecycle + identityKey + **stub** renderers (`() => null`). No `@/components/ui/*` imports, no React import beyond type level.

The adapter file (`packages/<pkg>/src/integration/<entity>-adapters.ts`) imports the base and registers it as a module-top side effect:

```ts
import { objectTypeRegistry } from "@cinatra-ai/objects";
import { LIST_OBJECT_TYPE_DEFINITION_BASE } from "./list-object-type-definition";

objectTypeRegistry.register(LIST_OBJECT_TYPE_DEFINITION_BASE);
```

Any code path that imports the adapter — including every server-action chunk in the package — now lands the schema in the registry. `classifyObject(rawData, typeHint)` short-circuits to the registered entry before reaching the LLM classifier, so the ALS-frame requirement never fires.

The `renderers` field on `ObjectTypeDefinition` is required, so the base uses no-op stubs. They never reach the UI in practice — if they ever do, the boot path is misconfigured.

### 2. Boot-path full registration

Lives in `packages/<pkg>/src/integration/register-object-types.ts` (the existing entrypoint). Imports both the BASE and the real React renderers, then re-registers via spread:

```ts
import { objectTypeRegistry } from "@cinatra-ai/objects";
import { ListListRow, ListCard, ListDetail } from "./renderers";
import { LIST_OBJECT_TYPE_DEFINITION_BASE } from "./list-object-type-definition";

export function registerListObjectTypes(): void {
  objectTypeRegistry.register({
    ...LIST_OBJECT_TYPE_DEFINITION_BASE,
    renderers: { listRow: ListListRow, card: ListCard, detail: ListDetail },
  });
}
```

Called from `createXModule()` and from `src/lib/register-all-object-types.ts`. `Map#set` semantics on `objectTypeRegistry.register` mean this second write overwrites the first — the renderer-bearing entry wins for any UI surface that mounts after boot.

### Why the split matters

Putting the renderer-bearing `registerXObjectTypes()` directly at the top of the adapter (the obvious one-line fix) drags `./renderers.tsx` → `@/components/ui/*` into the server-only chunk. Every shadcn component carries `"use client"`. Next.js / Turbopack either bloats the action bundle or fails RSC bundle-boundary checks. Keep this regression covered before merging changes to object type registration.

### Regression test pattern

Lock the wire with a hermetic vitest using `vi.hoisted({ fakeRegistry })` plus `vi.mock("@cinatra-ai/objects")`:

- Adapter import registers stubs (assert `entry.renderers.listRow({}) === null`).
- MCP handlers import triggers the same registration (covers the second entry point).
- Boot path registers renderers distinct from the stubs (assert strict identity against `BASE.renderers.*`).

Reference implementation: `packages/lists/src/__tests__/object-type-registration.test.ts`.
