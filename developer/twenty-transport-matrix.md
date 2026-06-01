# Twenty CRM Transport Matrix (v6.14 Phase 536)

Per-operation transport choices for cinatra ↔ Twenty integration. Empirically confirmed against `twentycrm/twenty:v2.7.3` during the Phase 536 bootstrap proof run (2026-05-24). Downstream phases (537–540) consume this matrix as the contract — entries marked **REST fallback** explain why the MCP path isn't used.

## Authentication

Bearer JWT (API key) in `Authorization` header for every authenticated call. Mint via `docker exec cinatra-twenty-1 yarn command:prod workspace:generate-api-key -w <workspace-id> -n <name>`. See [`twenty-bootstrap.md`](./twenty-bootstrap.md) for the full recipe.

## Per-operation matrix

| Operation | Transport | Endpoint / Tool | Empirically confirmed |
|---|---|---|---|
| **Server up / health probe** | REST | `GET /healthz` → `200 OK` (no body parse needed) | ✅ Phase 536 step 2 |
| **Workspace seed (dev/test only)** | CLI | `docker exec cinatra-twenty-1 yarn command:prod workspace:seed:dev --light` | ✅ Phase 536 step 3 |
| **API-key mint (dev/test only)** | CLI | `docker exec cinatra-twenty-1 yarn command:prod workspace:generate-api-key -w <id> -n <name> [-e <days>]` | ✅ Phase 536 step 4 |
| **MCP discovery / capabilities** | MCP (`POST /mcp`) | JSON-RPC `initialize` (proto `2025-06-18`), then `tools/list` | ✅ Phase 536 step 5/6 — 5 native tools |
| **Tool catalog discovery** | MCP | `tools/call` `get_tool_catalog` `{ categories?: ["DATABASE_CRUD" \| ...] }` | ✅ ~184 DATABASE_CRUD tools on Apple workspace |
| **Tool schema discovery** | MCP | `tools/call` `learn_tools` `{ toolNames: [...] }` | available |
| **Skill instructions** | MCP | `tools/call` `load_skills` `{ skillNames: ["workflow-building", "data-manipulation"] }` | available |
| **Help / docs search** | MCP | `tools/call` `search_help_center` `{ query }` | available |
| **Custom field create (Metadata)** | GraphQL (REST) | `POST /metadata` mutation `createOneField(input: CreateOneFieldMetadataInput!)` | ✅ Phase 536 step 8 (REST fallback because: Twenty MCP does not expose Metadata API field-create as a tool) |
| **Object metadata discovery** | GraphQL (REST) | `POST /metadata` query `objects(paging: { first: 200 }) { edges { node { id nameSingular fields(...) ... } } }` | ✅ Default page size is 10 — always pass paging |
| **Person CRUD** | MCP | `tools/call` `execute_tool` `{ toolName: "create_person" \| "find_people" \| "find_one_person" \| "update_person" \| "delete_person", arguments: {...} }` | ✅ Phase 536 step 9 — full CRUD round-trip |
| **Company CRUD** | MCP | `tools/call` `execute_tool` `{ toolName: "create_company" \| "find_companies" \| "find_one_company" \| "update_company" \| "delete_company", arguments: {...} }` | ✅ Phase 536 step 9 — read-back verified |
| **Person batch fetch** | MCP | `execute_tool` `{ toolName: "find_people", arguments: { limit, ... } }` | ✅ Phase 536 step 11 — sub-500ms locally |
| **View create (filter on `inLists`)** | MCP | `execute_tool` `{ toolName: "create_view", arguments: {...} }` (VIEW category) | catalog confirmed — exercised end-to-end in Phase 537 |
| **View members query** | MCP | `execute_tool` `{ toolName: "find_people", arguments: { viewId } }` | catalog confirmed |
| **UI deeplink (record)** | REST/HTML | `GET /object/companies/<id>` (and `/object/people/<id>`) → SPA shell loads + REST `GET /rest/companies/<id>` returns the record JSON. Phase 536 step 12 asserts the REST record-fetch by id matches `<id>` (the SPA HTML alone is not record-specific). | ✅ Phase 536 step 12 |
| **Bulk delete (cleanup)** | _not available_ | Twenty MCP v2.7.3 has no bulk-filter delete tool. The bootstrap proof leaves fixture rows; Phase 539 wipe-and-reseed handles full reset. | known gap |
| **Live event stream (webhooks)** | _deferred_ | v6.14 does NOT subscribe to Twenty webhooks. Read-on-demand + batch cache. Bidirectional sync deferred to v6.14.1. | deferred |

## Per-operation arguments shape

`execute_tool` requires exactly `{ toolName: string, arguments: object }`. Twenty rejects extra keys (`tool`, `input`, etc. → `"Tool \"undefined\" not found"`).

The argument schema per tool is published by `learn_tools` and varies per Twenty version — downstream phases (537+) should always read the schema before constructing arguments, never hard-code field shapes.

## Pagination defaults (Metadata API)

| Query | Default first | What to pass |
|---|---|---|
| `objects` (object metadata) | 10 | `paging: { first: 200 }` |
| `fields(...)` inside an object | 10 | `paging: { first: 200 }` |

Both connections also support `endCursor` / `hasNextPage` if the Apple workspace ever grows past 200.

## Error-response shape

Validation errors live deep:

```json
{
  "errors": [
    {
      "message": "Multiple validation errors occurred while creating fields",
      "extensions": {
        "code": "METADATA_VALIDATION_FAILED",
        "errors": {
          "fieldMetadata": [{ "errors": [{ "code": "NOT_AVAILABLE", "message": "Name \"foo\" is not available as it is already used by another field" }] }]
        }
      }
    }
  ]
}
```

Always inspect `extensions.code` + `extensions.errors.<entity>[].errors[].code` for the real reason. Top-level `message` is generic.

## MCP response modes

| Client Accept header | Twenty response | When to use |
|---|---|---|
| `application/json, text/event-stream` (default) | Single JSON response | Synchronous calls — what the proof script does. |
| `text/event-stream` | SSE stream of JSON frames | Long-running tool calls that emit progress notifications. |

Both modes contain the same JSON-RPC payload structure (`{ jsonrpc, id, result }` or `{ jsonrpc, id, error }`).

## Twenty version pin

Pinned to `twentycrm/twenty:v2.7.3` (`sha256:4207fe56527e21c0e0ab6602bb1c6be7d001396001a38a94045291de4abc6da8`). Bumps update this file + the snapshot + the `${TWENTY_TAG}` default in `docker-compose.yml` in the same PR.
