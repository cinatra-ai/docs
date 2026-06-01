# Notifications

Cinatra runs long. Agent runs take minutes, hours, sometimes days. The platform tells you when work finishes (or fails) instead of expecting you to keep a tab open.

## What you see

- **A bell with a badge** in the top bar — opens the notification feed.
- **Toasts** for things you just did (saved a draft, started a run) — transient, not persisted.
- **The notification feed** for things that finished while you were elsewhere — durable, persisted, scoped to you, marked read / unread.

## What gets notified

- The run you started finished — successfully, with a failure, or stopped.
- A run paused for your review at a human-in-the-loop (HITL) gate.
- A background job an admin operates failed and needs attention.
- A workflow you own moved a stage forward, an approval landed, or a milestone slipped.

## How it works (briefly)

Notifications live in Postgres so they survive sessions, deploys, and reloads. The feed updates in real time over a Postgres `LISTEN/NOTIFY` channel — you don't have to refresh.

- The implementation reference: [Notifications](../developer/notifications.md).
- The operational angle (Sentry-compatible error reporting for the operator): [Error reporting](../hosting/error-reporting.md).

---

## Where to go next

- [Durable workflows](durable-workflows.md) — why runs survive reloads in the first place
- [Human-in-the-loop by design](human-in-the-loop.md) — what a HITL pause looks like before the bell rings
