# Extension webhooks and streams

Connectors can receive push events from external systems (inbound webhooks) and expose server-sent event streams to clients, using two reusable host-owned facilities: the generic webhook route and the generic stream route. Both follow the same declare-generate-dispatch pattern as `cinatra.widgetStream`: the connector declares the surface in its `package.json`, the manifest generator emits a typed registry map, and a single host route serves any declaring connector without importing that connector's package or branching on vendor/slug.

---

## Inbound webhooks (`cinatra.webhooks`)

The inbound-webhook facility (cinatra#340) lets a connector declare one or more named hooks. The host owns the route, the secret store, the idempotency ledger, and the Standard-Webhooks signature verification. The connector owns only the per-hook business logic that turns a verified payload into a handler outcome.

### Route contract

Every declared webhook is served at:

```
POST /webhook/<vendor>/<slug>/<hook>/<bindingId>
```

- **`vendor`** — the npm scope segment of the connector's package name (e.g. `cinatra-ai`).
- **`slug`** — the unscoped package name segment (e.g. `acme-connector`).
- **`hook`** — the kebab-case hook id declared in `cinatra.webhooks.hooks[].id` (e.g. `post-published`).
- **`bindingId`** — an opaque server-issued identifier the host mints at provisioning time. The route uses it to look up the per-binding secret and the site identity. **The host never reads identity from the payload.**

The path is auth-exempt from the sign-in redirect (the host exempts the whole `/webhook` namespace), but it is not auth-free: every request must carry a valid Standard-Webhooks signature under the per-binding secret or the route returns `401`.

The route processes requests in a strict pipeline:

1. Resolve the declared hook from the generated registry. An undeclared hook → `404` before any other validation — this is the first-class response for an empty or miss registry.
2. Validate `Content-Type` — must be `application/json` or a structured `+json` suffix (e.g. `application/vnd.acme+json`). Other types → `415`.
3. Read and cap the raw body. Bodies over 256 KiB → `413`.
4. Resolve the binding by the opaque `bindingId`. Unknown or revoked → `401`.
5. Verify the Standard-Webhooks signature (`webhook-id`, `webhook-timestamp`, `webhook-signature` headers) against the binding's candidate secrets (current, then a non-expired previous during a rotation window). Failure → `401`.
6. Claim an idempotency lease keyed by `(scope, siteId, messageId)`. A duplicate (already done) → `200 {"deduped":true}`. A live-lease collision → `409`.
7. Build the connector's handler via the recorded factory and dispatch the verified context.
8. Finalize the idempotency ledger and map the handler's outcome to HTTP.

### Handler outcomes and HTTP responses

The connector's handler returns one of four outcomes:

| Outcome | Ledger | HTTP |
|---|---|---|
| `accepted` | `done` | `200 {"ok":true}` |
| `ignored` | `done` | `200 {"ok":true}` |
| `rejected` | `done` | `204` (or `rejectStatus` if declared) |
| `retryable` | `failed` (retry re-claims) | `503` |

A handler throw → `503` + `ledger.failed`. A stale lease holder that loses the finalize fence → `503`, so the sender retries until a winning holder's verdict is committed.

### Declaring `cinatra.webhooks` in `package.json`

Opt in by adding a `cinatra.webhooks` block to the connector's `package.json`:

```jsonc
{
  "name": "@acme/acme-connector",
  "cinatra": {
    "apiVersion": "cinatra.ai/v1",
    "kind": "connector",
    "webhooks": {
      "hooks": [
        {
          "id": "post-published",          // kebab-case; becomes the <hook> URL segment
          "handler": "./src/webhooks/post-published",  // package-relative subpath
          "factory": "createPostPublishedHandler",     // named export in the handler module
          "label": "Post Published",       // optional human label (Webhooks page + logs)
          "rejectStatus": 422,             // optional 4xx for `rejected` outcome (default 204)
          "schemaVersion": 1               // optional metadata; positive integer
        }
      ]
    }
  }
}
```

Field reference for each `hooks` entry:

| Field | Required | Description |
|---|---|---|
| `id` | Yes | Kebab-case hook identifier. Becomes the `<hook>` path segment. Must be unique within the package. |
| `handler` | Yes | Package-relative source subpath (e.g. `"./src/webhooks/post-published"`). The manifest generator reads this file to assert the factory export exists and is a function. |
| `factory` | Yes | Named export on the handler module that is a `WebhookHandlerFactory` (a zero-arg function returning a `WebhookHandler`). |
| `label` | No | Human-readable label shown on the Webhooks page and in logs. Derived from `id` when absent. |
| `rejectStatus` | No | HTTP status (400–499) the route returns for a `rejected` outcome. Defaults to `204`. |
| `schemaVersion` | No | Integer payload schema version carried as metadata. Must be a positive integer. |

The manifest generator validates the declaration fail-closed: a malformed block, a duplicate `id` within the package, a missing handler file, or a handler module that does not export the named factory as a function is a **generation error** that fails CI. The generated registry map (keyed `"<vendor>/<slug>/<hook>"`) is the host's only source of truth.

### Authoring a webhook handler module

The handler module exports a factory that the host calls once at dispatch to build the handler for the current request:

```ts
import type {
  WebhookHandlerFactory,
  WebhookHandler,
  WebhookContext,
  WebhookHandlerOutcome,
} from "@cinatra-ai/webhooks";
import { z } from "zod";

const PostPublishedPayload = z.object({
  id: z.number(),
  title: z.string(),
});

export const createPostPublishedHandler: WebhookHandlerFactory = () => {
  const handler: WebhookHandler = async (ctx: WebhookContext): Promise<WebhookHandlerOutcome> => {
    // Re-validate the payload with your own schema. The route verified the
    // Standard-Webhooks signature; it does not shape the payload for you.
    const parsed = PostPublishedPayload.safeParse(ctx.webhook.payload);
    if (!parsed.success) {
      return { outcome: "rejected", detail: { reason: "unexpected-payload-shape" } };
    }

    ctx.log("processing post-published", { id: parsed.data.id });

    // ... your business logic here

    return { outcome: "accepted" };
  };
  return handler;
};
```

The host passes a `WebhookContext` containing:

- **`ctx.webhook.payload`** — the parsed JSON body (already signature-verified). Re-validate it with your own schema.
- **`ctx.webhook.siteId`** — the connected-site identity, resolved from the server-issued `bindingId`. Never trust site identity from the payload.
- **`ctx.webhook.messageId`** — the Standard-Webhooks `webhook-id`, which is the idempotency key.
- **`ctx.webhook.timestamp`** — the `webhook-timestamp` as a `Date`.
- **`ctx.webhook.rawBody`** — the exact request bytes that were signed (for any downstream HMAC re-verification).
- **`ctx.log(message, fields?)`** — a scoped logger. Never log secret material or full payloads through it.

### Package exports

Add a `package.json` `exports` entry for the handler subpath so the manifest generator's literal dynamic import resolves at build time:

```jsonc
"exports": {
  ".": "./src/index.ts",
  "./register": "./src/register.ts",
  "./webhooks/post-published": "./src/webhooks/post-published.ts"
}
```

Alternatively, a matching `tsconfig.json` path alias resolves the specifier. The generator asserts the subpath is resolvable at generation time; an unresolvable specifier fails CI.

### Authentication and secrets

The host provisions a per-binding, per-site Standard-Webhooks secret at connection time. The external system uses this secret to sign each POST. The secret is stored encrypted by the host's secrets codec; the connector never reads it directly.

Secret format: `whsec_<base64>` — the `whsec_` prefix is the Standard-Webhooks convention. During a secret rotation, both the current and the non-expired previous secret are verified (a dual-candidate window); the connector is unaffected by rotations.

---

## Streams (`cinatra.streams`)

The streams facility (cinatra#344) lets a connector expose a server-sent event stream at a host-owned generic route. The `@cinatra-ai/streams` package provides three vocabulary-free primitives — a durable Redis-Streams event log, a resumable per-connection SSE wrapper, and a generalized token broker — that the connector's handler is built on top of. The host owns the route and the SSE wire protocol; the connector owns the business logic.

> **Staged and inert on day one.** No extension declares `cinatra.streams` yet. The generated registry is `{}` and the route returns `404` for every request safely. The relay and run-stream migration onto `@cinatra-ai/streams` are follow-on work.

### Route contract

Every declared stream is served at:

```
GET /api/streams/<streamSlug>
```

- **`streamSlug`** — the kebab-case slug declared in `cinatra.streams.streams[].streamSlug`.

The route resolves the slug from the generated registry, builds the connector's stream handler, and pipes the handler's `AsyncIterable<SseFrame>` onto the wire using `@cinatra-ai/streams`' `sseResponse` primitive.

### Declaring `cinatra.streams` in `package.json`

```jsonc
{
  "name": "@acme/acme-connector",
  "cinatra": {
    "apiVersion": "cinatra.ai/v1",
    "kind": "connector",
    "streams": {
      "streams": [
        {
          "streamSlug": "acme-events",     // kebab-case; becomes the <streamSlug> URL segment
          "label": "Acme Events",          // human label
          "handler": "./src/streams/events", // package-relative subpath
          "factory": "createAcmeEventsHandler", // named export in the handler module
          "resume": false                  // optional; true opts into Last-Event-ID resume
        }
      ]
    }
  }
}
```

Field reference for each `streams` entry:

| Field | Required | Description |
|---|---|---|
| `streamSlug` | Yes | Kebab-case stream identifier. Becomes the `<streamSlug>` URL segment. Must be unique across all installed extensions. |
| `label` | Yes | Human-readable label. |
| `handler` | Yes | Package-relative source subpath (e.g. `"./src/streams/events"`). |
| `factory` | Yes | Named export on the handler module returning a `StreamHandler`. |
| `resume` | No | `true` to opt the stream into Last-Event-ID resumable-SSE (backed by the Redis-Streams durable log). Defaults to `false`. |

The manifest generator validates the declaration fail-closed: unknown fields, a duplicate `streamSlug` within the package, or a missing handler file are generation errors.

### Authoring a stream handler module

The handler module exports a factory that the host calls once at dispatch:

```ts
import type { SseFrame } from "@cinatra-ai/streams";

export type StreamHandler = (ctx: {
  request: Request;
  streamId: string;
}) => AsyncIterable<SseFrame> | Promise<AsyncIterable<SseFrame>>;

export function createAcmeEventsHandler(): StreamHandler {
  return async function* ({ streamId }) {
    // Yield SSE frames; the host serializes them onto the wire.
    yield { event: "ready", data: JSON.stringify({ streamId }) };

    // ... produce further frames from your data source
  };
}
```

An `SseFrame` is a plain object `{ event?: string; data: string; id?: string; retry?: number }` — the fields map directly to the SSE spec. The host serializes each frame with `serializeSseFrame` from `@cinatra-ai/streams`.

---

## The Webhooks page (Tools → Webhooks)

**Tools → Webhooks** is a host-admin page (`/webhooks`) that lists every inbound webhook declared across all installed extensions. It reads from the generated `GENERATED_WEBHOOK_REGISTRY_META` — the import-free pure-data module the manifest generator emits alongside the handler-loader map.

Each row shows:

| Column | Content |
|---|---|
| Vendor | The `vendor` segment of the hook's package scope |
| Package / Scope | The npm scope the hook belongs to |
| Hook | The hook `id` and, when present, its `label` |
| URL | The public path: `/webhook/<vendor>/<slug>/<hook>` |
| Status | `registered` (the hook is in the generated registry) |

When no extensions have declared `cinatra.webhooks` yet, the page shows an empty-state card. This is the expected state until the first extension declares and ships hooks.

The page is admin-only (it requires an admin session). The URL does not appear in the nav unless the current actor is an admin, but the page enforces its own admin check regardless.

---

## How the facilities relate to the manifest generator

Both `cinatra.webhooks` and `cinatra.streams` are processed by the manifest generator (`scripts/extensions/generate-extension-manifest.mjs`). The generator:

1. Reads each declared `cinatra.webhooks` or `cinatra.streams` block fail-closed at generation time (invalid declaration → exit 1).
2. Reads the declared handler source file and asserts that the named factory export is a callable function.
3. Emits a **generated registry map** — a typed `Record<string, Entry>` with one literal dynamic import per hook/stream. The host route resolves and imports these without naming any connector package.
4. Emits a **slug-only public-path list** for the auth-route guard (no imports, no package identifiers, proxy-bundle-safe).
5. Emits **import-free pure-data metadata** consumed by the Webhooks page UI.

All generated files are pinned byte-exact by the `--check` mode; a hand-edit or a stale file fails CI.

---

## See also

- [Authoring connector extensions](extension-kinds/authoring-connector-extensions.md) — the host-port and `register(ctx)` contract that connector webhooks and streams sit alongside.
- [Extension IoC safeguards](extension-ioc-safeguards.md) — why the host owns the route and the extension owns only the handler.
- `packages/webhooks/` in the cinatra repository — the `@cinatra-ai/webhooks` package: Standard-Webhooks verify/sign, registry, idempotency ledger, and secret-service contract.
- `packages/streams/` — the `@cinatra-ai/streams` package: durable event log, resumable SSE, and token broker.
