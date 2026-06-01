# Email Connector — Provider-Neutral Transport Facade

Documents the `@cinatra-ai/email-connector` subsystem. Read alongside `mcp-patterns.md`, `llm-orchestration.md`, and `docs/developer/extensions.md` (the `kind:"connector"` extension kind).

## Why it exists

Email transport is provider-neutral: callers send through one chokepoint, providers register against one interface, and the routing chain picks the destination connector. This keeps dev-mode recipient override logic centralized, preserves the Model Context Protocol (MCP) send surface, and lets additional providers (SMTP / SES / Outlook) plug in without rewriting callers.

## Architecture overview

```
caller (trigger-email-send-use-cases.ts / email_send MCP primitive / chat)
  └─ sendEmailThroughSystem(msg, opts)            @cinatra-ai/email-connector/facade
       ├─ resolveConnectorId(opts)                src/lib/register-email-providers.ts
       │    1. explicit connectorId
       │    2. explicit senderIdentityId → objects_get → identity.connectorId
       │    3. userId  → first @cinatra-ai/email:sender-identity owned by user
       │    4. orgId   → first @cinatra-ai/email:sender-identity owned by org
       │    5. first registered connector
       ├─ applyDevModeOverride(msg)               centralized dev-mode recipient override
       ├─ connector.send(msg, { userId })         e.g. gmailEmailConnector → Gmail API
       └─ saveSentEmailObject(...)  best-effort → @cinatra-ai/email:sent-email object
```

## Key files

| File | Role |
|---|---|
| `extensions/cinatra-ai/email-connector/src/contract.ts` | `EmailConnector` interface + `EmailSystemMessage` / `EmailSendReceipt` / `EmailReplyMatch` / `EmailConnectorId` (types-only; providers `import type` it) |
| `extensions/cinatra-ai/email-connector/src/registry.ts` | In-memory `emailConnectorRegistry` + `registerEmailConnector` + `listInstalledEmailConnectors` |
| `extensions/cinatra-ai/email-connector/src/facade.ts` | `sendEmailThroughSystem` / `findReplyThroughSystem` chokepoint + `EmailSystemDeps` (host-injected routing + dev-mode override + best-effort sent-email writer) |
| `extensions/cinatra-ai/email-connector/src/mcp/module.ts` | `email_send` MCP primitive (`createEmailModule`) — one-shot transactional send for chat + ad-hoc agents |
| `extensions/cinatra-ai/gmail-connector/src/email-connector.ts` | `gmailEmailConnector` — the first `EmailConnector` impl, wraps the existing gmail functions |
| `src/lib/register-email-providers.ts` | Boot wiring: `configureEmailSystem(deps)` + `registerEmailConnector(gmailEmailConnector)`. The routing chain + dev-mode override + `saveSentEmailObject` live here (host knows the DB; the facade does not) |
| `src/lib/email-system-persistence.ts` | The `email_send_events` ledger read/write helpers |

## The contract

A provider package implements `EmailConnector` and exports a singleton:

```ts
import type { EmailConnector } from "@cinatra-ai/email-connector"; // import TYPE only
export const myEmailConnector: EmailConnector = {
  definition,            // EmailConnectorDefinition (id/name/slug/settingsHref/caps)
  send(msg, opts),       // → EmailSendReceipt
  findReply(opts),       // → EmailReplyMatch | null
  getStatus(opts),       // → { status: "connected"|"incomplete"|"not_connected", ... }
  listFromAddresses?(),  // optional — aliases / verified identities
};
```

Then register it at boot in `src/lib/register-email-providers.ts`:

```ts
registerEmailConnector(myEmailConnector);
```

The `import type` discipline is enforced by an ESLint `consistent-type-imports` rule on `extensions/cinatra-ai/*-connector/` + a regression test (`email-connector/src/__tests__/import-boundary.test.ts`) — a runtime `import { EmailConnector }` would pull the facade registry into the provider bundle and defeat pluggability.

## Email object types

Four provider-neutral object types registered statically in `packages/objects/src/integration/register-types.ts` (`registerEmailObjectTypes`):

| Type | Identity key | Written by |
|---|---|---|
| `@cinatra-ai/email:sender-identity` | `<connectorId>:<fromEmail>` | user / agent (routing input — the chain reads this) |
| `@cinatra-ai/email:sent-email` | `idempotencyKey` | facade `saveSentEmailObject` after every successful send |
| `@cinatra-ai/email:received-reply` | `internetMessageId` (fallback `<connectorId>:<providerMessageId>`) | reply-watcher (future) |
| `@cinatra-ai/email:thread` | `<connectorId>:<providerThreadId>` | groups sends + replies |

`sent-email` references the `email_send_events` audit row by `auditId`. The object write is **best-effort** — it runs after `connector.send()` has already succeeded, so a failure is logged but never thrown back into the send path (the email was already delivered). Idempotency key `email-send:<providerId>:<providerMessageId>` makes repeated facade calls dedupe at the objects layer.

## Routing chain semantics

- **Step 2 (explicit `senderIdentityId`):** a genuine not-found falls through to step 3 (the id was stale); a *real* lookup error (permission / backend / schema) **throws** — the facade refuses to silently mis-route an explicitly-chosen identity to a fallback connector.
- **Steps 3–4 (auto-resolve user/org):** any objects-layer failure → `console.warn` + fall through (the caller did not pick these; best-effort is correct, but not silent).
- **Step 5:** first registered connector.
- The sender-identity list uses a 200-row page budget with client-side `ownerLevel`/`ownerId` filtering (`objects_list` has no `data.<field>` server filter; small per-org record counts make this safe; a structured-filter promotion is a future-scale TODO).

## `email_send` MCP primitive

`email_send` is the one-shot transactional primitive (chat-callable, agent-callable) — distinct from `email_outreach_send_initial_start` which is the orchestrated batch path. Input: `to[], subject, textBody, cc?[], bcc?[], replyTo?, fromName?, fromEmail?, connectorId?, senderIdentityId?`. `connectorId` and `senderIdentityId` are not mutually-exclusive-enforced: the facade checks `explicitConnectorId` first, so `connectorId` wins if both are passed (documented precedence, friendlier than a hard reject). Reads `actor.userId`/`actor.orgId` (empty/whitespace treated as absent) so routing steps 3–4 resolve transparently.

## Adding a new provider (e.g. SMTP)

1. `extensions/cinatra-ai/smtp-connector/` with `cinatra.kind: "connector"` + a `register*Connector(deps)` factory if it needs host-internal deps.
2. Implement `EmailConnector`; export `smtpEmailConnector`.
3. `registerEmailConnector(smtpEmailConnector)` in `src/lib/register-email-providers.ts`.
4. Persist a `@cinatra-ai/email:sender-identity` object (`connectorId: "smtp"`, `fromEmail`, `ownerLevel`/`ownerId`) so the routing chain picks it for that user/org.

Dev-mode recipient override + the sent-email object write are inherited for free — they live in the facade, not per-provider.
