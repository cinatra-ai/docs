# CRM Connector — Provider-Neutral Facade (Twenty)

cinatra's CRM is a thin provider-agnostic facade over an external CRM system. The current — and only — provider is **Twenty CRM**, shipped as a docker container in dev and reached over MCP. The facade lives in [`packages/crm-connector`](../../packages/crm-connector/); the Twenty implementation lives in [`packages/twenty-connector`](../../packages/twenty-connector/) (which speaks Twenty's `/mcp` server through the workspace-scoped `twenty-workspace` external-MCP row).

Twenty is the source of truth for accounts, contacts, and lists. cinatra holds **pointer rows** for accounts/contacts in `cinatra.objects` (id + a couple of identity-key fields) and reads heavy fields on demand through the facade; lists are not materialized in cinatra at all — they live as Twenty Views.

## Why it exists

Prior versions of cinatra owned the CRM data model directly: `@cinatra-ai/entity-accounts`, `@cinatra-ai/entity-contacts`, `@cinatra-ai/lists` each shipped their own MCP primitives (`accounts_*`, `contacts_*`, `lists_*`), server actions, table UIs, and store modules. The v6.14 (foundation) and v6.14.1 (close-out) milestones retired that surface in favor of the Twenty-backed facade so that:

- agents and chat tools never bind to a specific CRM implementation (the `crm_*` verbs stay stable even if Twenty is later swapped for another provider);
- cinatra stops carrying CRM UI — accounts, contacts, and lists are reached programmatically through the `crm_*` MCP facade; for humans, the CRM browse lives in Twenty directly (no cinatra-side link);
- semantic search through Graphiti is wired off a single `ObjectSyncAdapter` seam rather than per-package custom code.

## Architecture overview

```
agent SKILL.md  ──▶ crm_* MCP verb  ──▶  crmFacade  ──▶  Twenty CRM
                                              │            (docker /mcp)
                                              ▼
                                        ObjectSyncAdapter
                                              │
                                              ▼ (deferred → v6.14.2+)
                                          Graphiti
```

- **Facade (`packages/crm-connector`)** — defines the public types (`CrmAccount`, `CrmContact`, `CrmList`) and the provider port. Exports `crmFacade` for in-process callers (chat widget, server actions). Has no provider-specific code.
- **Twenty provider (`packages/twenty-connector`)** — implements the port by calling Twenty's MCP catalog tools through the host-side Layer B proxy. Resolves credentials from the `twenty-workspace` row in `external_mcp_servers`.
- **MCP surface** — `crm_account_*` / `crm_contact_*` / `crm_list_*` primitives are registered by the connector and are what agents + the chat assistant see. The retired `accounts_*` / `contacts_*` / `lists_*` primitives are **not** registered.
- **`ObjectSyncAdapter` seam** — the integration seam for projecting cinatra-originated CRM writes into Graphiti. The seam exists; the concrete `TwentyToGraphitiAdapter` activation is deferred to v6.14.2+.

For the Twenty side specifically — bootstrap, transport, the Layer A/Layer B allowlist model — read [`twenty-bootstrap.md`](twenty-bootstrap.md) and [`twenty-transport-matrix.md`](twenty-transport-matrix.md). This page focuses on the cinatra-side facade.

## Key files

- [`packages/crm-connector/src/`](../../packages/crm-connector/src/) — the provider-agnostic facade, types, and `crmFacade` entry.
- [`packages/twenty-connector/src/`](../../packages/twenty-connector/src/) — Twenty implementation: per-method `execute_tool` calls against Twenty's MCP catalog (see [`twenty-mcp-tools.json`](twenty-mcp-tools.json) for the catalog snapshot).
- [`extensions/cinatra-ai/crm-connector/src/chat-widgets/crm-contact-finder.tsx`](../../extensions/cinatra-ai/crm-connector/src/chat-widgets/crm-contact-finder.tsx) — the chat widget that resolves a contact by email through `crmFacade.contact.findByEmail` (auth-gated). This is the only cinatra-side UI touching CRM data; the previous browse routes + deeplink card were deleted in v6.14.2.
- [`scripts/audit/crm-pointer-gate.mjs`](../../scripts/audit/crm-pointer-gate.mjs) + [`scripts/audit/oas-banned-primitives-gate.mjs`](../../scripts/audit/oas-banned-primitives-gate.mjs) — the two CI gates that keep the retirement from regressing. Both run in [`.github/workflows/crm-migration-gate.yml`](../../.github/workflows/crm-migration-gate.yml) on every PR.
- [`docs/runbooks/twenty-cutover.md`](../runbooks/twenty-cutover.md) — the operator runbook for the one-shot wipe of cinatra-side CRM pointer rows.

## The contract

Three top-level resource types and one fact about how they're persisted.

- **`CrmAccount`** — company-shaped record. Identity key: `websiteHost`. Created via `crm_account_create`; matched first via `crm_account_search` to avoid duplicate companies (the create itself does NOT dedupe server-side, so search-then-create is the discipline).
- **`CrmContact`** — person-shaped record, always attached to a `CrmAccount` via `accountId`. Identity keys (in order): `email` → `linkedinUrl` → `apolloPersonId`. `crm_contact_create` is a **plain create** — it does NOT dedupe server-side. Discovery agents (apollo-prospecting, contact-discovery) document this explicitly: re-runs may create duplicate contacts; cleanup is outside the leaf agent.
- **`CrmList`** — a saved view of accounts or contacts. Dissolves to a Twenty **View** with an `inLists: TEXT[]` custom field on the underlying record; `crm_list_member_add` is idempotent at the facade level (patches the member's `inLists` array, duplicate adds are no-ops).

Pointer rows for `CrmAccount` and `CrmContact` are kept in `cinatra.objects` (for object-history, change-set, and ObjectSyncAdapter dispatch). Lists are NOT pointer rows in cinatra; they're queried live from Twenty.

## Data model — what lives where

| Resource | cinatra.objects pointer row | Twenty | Why |
|---|---|---|---|
| Account | yes — id + identity keys | full record (UI, fields, history) | Twenty owns the UI; pointer enables object-history + adapter dispatch |
| Contact | yes — id + identity keys | full record | same |
| List | **no** | View + `inLists` custom field | Lists dissolve into Twenty Views; no cinatra-side row to keep in sync |

This is why the destructive cutover (below) only needs to wipe pointer rows for the two pointer-row types — there are no list pointer rows in the post-cutover state.

## MCP surface

The `crm_*` verbs are what agents and chat tools see. They are registered by the crm-connector package and provider-routed to Twenty. The retired `accounts_*`, `contacts_*`, and `lists_*` primitives are explicitly unregistered (and the `crm-pointer-gate --strict` CI check fails if any reference reappears).

Account ↔ Twenty operation mapping is documented in [`twenty-transport-matrix.md`](twenty-transport-matrix.md). The per-method argument shapes are pinned by the proof script at `scripts/v614/twenty-bootstrap-proof.mjs` (top-level args, never an `input` wrapper — Twenty's contract).

## Retired surfaces

The deprecation-stub packages — `packages/entity-accounts`, `packages/entity-contacts`, `packages/lists` — were deleted outright (v6.14.1 stub deletion + v6.14.2 final-surface cleanup). The CRM **object-type IDs** (`@cinatra-ai/entity-accounts:account`, `@cinatra-ai/entity-contacts:contact`, `@cinatra-ai/lists:list`) persist as STRING identifiers in `cinatra.objects.type` and across the taxonomy, retention policy, projector, and CI gates — those are NOT references to the deleted packages, they are stable substrate keys (see `packages/objects/AGENTS.md`).

UI: there is no cinatra-side CRM browse. The previous `/entities/accounts`, `/entities/contacts`, and `/lists` routes (which briefly carried `<OpenInTwenty>` deeplink cards in v6.14.1) were deleted in v6.14.2 per the owner directive "CRM is Twenty's job entirely." Sidebar and command-palette entries pointing at the retired routes were removed in the same cleanup. The `/accounts/[path]` route is **user account administration** and is intentionally untouched.

If you find a doc, comment, or LLM-visible description that still names a retired primitive (`accounts_*` / `contacts_*` / `lists_*`) or a retired route (`/entities/*` / `/lists/*`), treat it as drift to fix — the `crm-pointer-gate` covers source files explicitly, and `oas-banned-primitives-gate` covers OAS prompt strings the pointer gate skips.

## Cutover (one-shot wipe of cinatra-side pointer rows)

After the retired code is live, an operator runs the one-shot destructive cutover to delete the residual CRM pointer rows from `cinatra.objects` and let the facade own the data forever after. The script is `scripts/v614/cutover-wipe-and-reseed.mjs`; the procedure (dry-run → schema-scoped snapshot → stop workers → wipe with `--yes`) is in [`docs/runbooks/twenty-cutover.md`](../runbooks/twenty-cutover.md). CI never runs the destructive path.

After the wipe, `pnpm seed` no longer populates CRM fixtures through the pointer rows; CRM-native reseeding flows through the `crm_*` facade.

## Adding a new provider (e.g. HubSpot, Salesforce)

The Twenty implementation is the reference. To add a second provider:

1. **Build the provider package** alongside `packages/twenty-connector` (e.g. `packages/hubspot-connector`). Implement the `CrmConnector` port: each method calls the provider's API (preferably its MCP server when available, falling back to REST/SDK).
2. **Per-method argument shapes are provider contracts.** Pin them with a proof script analogous to `scripts/v614/twenty-bootstrap-proof.mjs` so test fixtures derive from real upstream calls, not TypeScript intuition.
3. **Pointer-row identity keys** stay the same (`websiteHost` for accounts, `email` → `linkedinUrl` → `apolloPersonId` for contacts) so the cinatra-side `cinatra.objects` schema doesn't need to change.
4. **Wire the chooser** — the facade resolves which provider to use from the workspace's connector row. The pattern is the same as the email-connector + blog-connector families (see [`email-connector.md`](email-connector.md)).
5. **Layer B allowlist** — if the provider exposes a dispatcher MCP tool (like Twenty's `execute_tool`), reuse the host-side proxy + per-row `allowed_catalog_tools` mechanism. Native MCP `allowedTools` is Layer A; the catalog allowlist is Layer B. Both are required.
6. **CI gate** — extend `crm-pointer-gate.mjs`'s scanner if the new provider introduces new banned patterns; otherwise it's already covered (the gate's strict mode catches any new code path reading heavy fields off `cinatra.objects` for CRM types).
7. **Deprecation-stub-style retirement** is reserved for the legacy in-cinatra surface; adding a new provider does NOT need it.

See also: [`twenty-bootstrap.md`](twenty-bootstrap.md), [`twenty-transport-matrix.md`](twenty-transport-matrix.md), [`docs/runbooks/twenty-cutover.md`](../runbooks/twenty-cutover.md), [`email-connector.md`](email-connector.md) (the parallel email facade), [`drupal-connector.md`](drupal-connector.md) (the parallel CMS connector with a dispatcher-style MCP).
