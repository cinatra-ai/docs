# Error reporting (Sentry-compatible)

Cinatra ships a Sentry-compatible error-reporting layer. It works against both Sentry (self-hosted or SaaS) and GlitchTip (Sentry-API compatible, lighter to self-host). The application code does not pick — it points at whichever data source name (DSN) the operator provides.

## What gets captured

- Unhandled exceptions in route handlers, server components, and server actions, via Next.js `onRequestError`
- React render errors, caught by the root-level App Router error boundary at `src/app/global-error.tsx`
- BullMQ (a Redis-backed job queue) worker failures, with `jobName`, `jobId`, and `queueName` tags

Everything is best-effort and isolated: a Sentry-internal failure never crashes a worker, a route handler, or a render.

## Disabling Sentry

`SENTRY_DSN` unset → every helper is a no-op. There is no separate "off" flag. This is the dev default.

## Coexistence with OpenTelemetry

Cinatra already owns its `NodeTracerProvider` in `src/lib/otel-bootstrap.ts` and writes spans to Postgres via `PostgresSpanExporter`. The Sentry SDK is initialised with `skipOpenTelemetrySetup: true`, and the bootstrap then attaches Sentry's `SentrySpanProcessor`, `SentrySampler`, `SentryPropagator`, and `SentryContextManager` to the *existing* provider. There is exactly one `provider.register()` call in the codebase.

## PII scrubbing

`src/lib/sentry-shared.ts` `beforeSendFilter` redacts:

- Request headers: `authorization`, `cookie`, `set-cookie`, `x-api-key`, `x-auth-token`
- Body fields anywhere in nested objects: `password`, `newPassword`, `currentPassword`, `apiKey`, `secret`, `token`, `accessToken`, `refreshToken`, `sessionToken`, `clientSecret`, `privateKey`
- Cookies entirely
- User extras outside `id`, `email`, `username`, `ip_address`
- JSON-stringified bodies that start with `{` or `[` (parsed, redacted, restringified)

Breadcrumb data is filtered with the same rules.

### Known scrub gaps (deliberate)

- Plain-text bodies (not JSON-shaped) pass through unmodified. Callers MUST NOT log secrets into plain-text request bodies anywhere.
- `URLSearchParams` and `FormData` payloads pass through unmodified if they reach the Sentry event. Cinatra's API surface is JSON-heavy so this is a low-impact gap; the Sentry SDK serialises these forms before our hook runs, and the scrubbing of object body keys still applies post-serialisation when the serialised shape is JSON.
- The scrubber walks at most 8 levels deep. Beyond that the value is returned verbatim. No real Cinatra payload is that deep, but worth knowing for hand-crafted captures.

## Operator runbook

Pointing Cinatra at a backend is a small operator change:

```
# Server / edge / BullMQ worker capture
SENTRY_DSN=https://...@sentry.example.com/123
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.1

# Browser-side capture (Next.js only inlines NEXT_PUBLIC_* envs into the
# client bundle). Set this to enable Sentry in the browser. Leave unset to
# keep browser-side capture disabled — server / worker capture still works.
NEXT_PUBLIC_SENTRY_DSN=https://...@sentry.example.com/123
```

For self-hosted setups, the recommendation is **GlitchTip first** unless you need full Sentry tracing/replay/release features. GlitchTip stands up on Postgres + Redis only, mirrors the Sentry SDK protocol, and is the lighter operational pick.

Source-map upload is build-time only. Set `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` in CI. Do not set them in production runtime envs.

## Tests

`src/lib/__tests__/sentry.test.ts` covers:

- `shouldInitSentry()` returns true only when `SENTRY_DSN` is set
- `beforeSendFilter` redacts headers, body fields, cookies, user extras
- `withSentryServerAction` re-throws after capture

## File map

- `sentry.client.config.ts` / `sentry.server.config.ts` / `sentry.edge.config.ts` — runtime init, side-effect imports of `src/lib/sentry.ts`
- `instrumentation-client.ts` — loads client config at the start of every navigation
- `src/instrumentation.ts` — exports `onRequestError` (runtime-gated dynamic import)
- `src/instrumentation.node.ts` — side-effect imports the server config before OTel
- `src/lib/sentry.ts` — `shouldInitSentry`, `buildSentryClientOptions`, `beforeSendFilter`, `captureBackgroundJobError`, `withSentryServerAction`
- `src/lib/otel-bootstrap.ts` — attaches Sentry OTel pieces to Cinatra's existing provider
- `src/lib/background-jobs.ts` — `worker.on('failed')` calls `captureBackgroundJobError`
- `src/app/global-error.tsx` — `Sentry.captureException`
- `next.config.ts` — `withSentryConfig` wrapper, gated on build-time envs
