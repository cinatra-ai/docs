# Telemetry and logging

This page is for administrators who need to know what a Cinatra instance reports about itself, where logs live, and how run failures reach the right people. Cinatra is private by default: error reporting is off unless an operator turns it on, and the platform never phones home.

Back to the [Admin Guide](README.md).

---

## Telemetry is off by default

Cinatra ships with external error reporting **disabled**. There is no separate "off" switch to find — the reporting layer is a no-op until an operator provides a data source name (DSN). On a default install, nothing is sent anywhere outside your instance.

Three categories of signal exist, and they are distinct:

- **Error reporting** (Sentry-compatible) — opt-in, sends captured exceptions to a backend you control. Off by default.
- **Per-call logs** — in-app logging toggles for provider and connector calls, configured under **Administration → Telemetry**. These write to your instance, not outward.
- **Traces** — execution spans the platform records to its own database for run inspection. Internal, not sent outward.

---

## Opting in to error reporting (Sentry-compatible)

Cinatra has a Sentry-compatible error-reporting layer. It works against Sentry (self-hosted or SaaS) and against GlitchTip (a lighter, Sentry-API-compatible backend). The application does not pick a vendor — it points at whatever DSN the operator supplies.

Turning it on is an operator change, not an in-app toggle: set `SENTRY_DSN` to your backend's DSN. With it unset, every reporting call is a no-op. For browser-side capture there is a separate public DSN variable; server and worker capture work from the server DSN alone. The operator-side details — environment tagging, sample rate, and the GlitchTip-first recommendation for self-hosting — are in [Error reporting](../hosting/error-reporting.md).

As an admin, the decision you own is *whether* error reporting should be enabled and to *which* backend; the operator makes the env change. Coordinate with whoever runs the deployment.

### What gets captured

When error reporting is enabled, the layer captures:

- Unhandled exceptions in route handlers, server components, and server actions.
- React render errors caught by the app's error boundaries.
- Root-level application errors.
- Background-job (queue worker) failures, tagged with the job name, job ID, and queue name.

Capture is best-effort and isolated — a reporting failure never crashes a worker, a request, or a render.

### What is *not* captured (PII scrubbing)

Before any event leaves the instance, a scrubbing pass redacts sensitive data:

- Auth-bearing request headers (authorization, cookie, API-key and auth-token headers) and cookies entirely.
- Secret-shaped body fields anywhere in nested JSON — passwords, API keys, tokens, access / refresh / session tokens, client secrets, private keys.
- User detail beyond a minimal identity (id, email, username, IP).

A few deliberate gaps are worth knowing: plain-text (non-JSON) request bodies pass through unmodified, and the scrubber walks a bounded depth. The standing rule that protects you here is operational — never log secrets into plain-text request bodies. The full redaction list and the known gaps are documented in [Error reporting](../hosting/error-reporting.md).

---

## Per-call logs

Under **Administration → Telemetry** the **Logs** tab holds the per-integration logging toggles — for the LLM providers and the connectors (such as the mail, CMS, and prospecting connectors) and for MCP. These control how verbosely each integration records its own calls within your instance. They are local logs for diagnosing a misbehaving integration; they do not send anything outward.

This is a different surface from error reporting: logs help you debug an integration; error reporting captures unexpected exceptions to a backend.

---

## Traces

The platform records execution spans to its own PostgreSQL database. These traces back the run-inspection views, so an admin can follow what an agent run did. When error reporting is enabled, the same span pipeline also feeds the Sentry-compatible backend, but the spans themselves live in your instance's database regardless. There is no separate admin toggle for tracing — it is part of how runs are made inspectable.

---

## Where logs live

- **Application and worker output** goes to the process logs of the running deployment. On a local install, those are your dev-server and container logs (the hosting guide covers `make logs` and the per-service log streams).
- **Per-call integration logs** are written within the instance and surfaced through the Telemetry → Logs tab.
- **Traces** persist to the instance database.
- **Captured exceptions** (only when error reporting is enabled) go to your configured Sentry / GlitchTip backend.

For operator-side log access and the service log streams, see the [Hosting Guide → Installation](../hosting/installation.md) and [Configuration](../hosting/configuration.md).

---

## Failure routing to notifications

Run and job failures are routed to people, not just to logs. The platform attributes each background job to whoever initiated it:

- **User-initiated work** routes its outcome to the person who started it. A failed run notifies that user.
- **System work** is silent on success and routes its **failures to admins**, so a background failure with no obvious initiator still reaches someone who can act.

This means an admin does not have to watch logs to learn that a system job failed — the failure surfaces as a notification. The routing model and the user-facing notification behavior are documented in [Notifications](../user/notifications.md) and, for the mechanics, the developer [Notifications](../developer/notifications.md) reference.

---

## Practical guidance

- **Decide on error reporting deliberately.** Default-off is the safe posture; enable it (with the operator) when you want centralized exception visibility, and prefer a backend you control.
- **Use Telemetry → Logs to debug a specific integration**, then turn verbosity back down.
- **Rely on failure notifications for system jobs** rather than tailing logs — admins get the failures automatically.
- **Never log secrets into plain-text bodies** — they are the one shape the scrubber does not catch.

---

## Where to go next

- Operator-side error-reporting setup and the full scrub list: [Error reporting](../hosting/error-reporting.md)
- Where logs and services live on the deployment: [Installation](../hosting/installation.md)
- How failures reach users and admins: [Notifications](../user/notifications.md)
- Cost and usage telemetry: [Cost and usage](cost-and-usage.md)
- Back to the [Admin Guide](README.md)
