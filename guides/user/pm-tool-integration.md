# PM-tool integration

You schedule an agent run for next Tuesday at 9am, or set one to run every
Monday morning. Cinatra is where that schedule lives and where the run actually
fires — but the schedule is invisible to anyone who isn't logged into Cinatra
looking at the run. PM-tool integration fixes that: Cinatra **mirrors** the
schedule into a project-management tool, so the run shows up as a work item on
that tool's board, calendar, and timeline — with a start date and a target date
— right next to the rest of your team's planned work.

Concretely: you configure a scheduled (or recurring) agent run in Cinatra, and a
matching **work item** appears in Plane, dated to when the run is due. Anyone who
lives in Plane can now *see* that the run is coming without opening Cinatra. The
run still executes in Cinatra, on Cinatra's schedule — the PM tool is just the
external **view**.

This page explains how that mirroring works, exactly what it does and does not
do, and how to set up the Plane connector that powers it today.

For the connector mechanics, see the developer reference
[PM connector](../../references/platform/pm-connector.md).

---

## Cinatra stays authoritative; the PM tool is the view

The most important thing to understand up front: **Cinatra is the source of
truth for the schedule and the execution.** The PM tool is a read-style mirror
of the schedule, not a second control surface.

- The schedule is defined in Cinatra (when an agent run fires, whether it
  repeats, whether it's armed or paused).
- The run executes in Cinatra, driven by Cinatra's durable engine — the same
  engine behind [durable workflows](durable-workflows.md).
- The PM tool receives a mirror of that schedule as a dated work item so the
  schedule is *visible* on a board or timeline your team already watches.

Editing the work item in the PM tool does not change anything in Cinatra. The PM
tool is downstream; the schedule flows one way, out of Cinatra.

---

## Provider-neutral: a PM connector, Plane today

Like the [CRM integration](twenty-crm-integration.md), the PM integration is
built around a **provider-neutral connector contract**. Cinatra defines a single
`PmConnector` shape — "mirror this trigger to a work item", "delete this work
item" — and a provider registry that the host resolves at runtime. A specific
tool plugs in behind that contract as a provider.

Today there is exactly one provider: **Plane**, an open source project-management
tool. The contract is deliberately provider-neutral so other tools (Linear,
Jira) can be added later as additional providers without changing how scheduling
works in Cinatra. For now, "PM tool" means Plane.

---

## What syncs, and what does not

This is the part to read carefully — the boundary is narrow on purpose.

**What is mirrored:**

- **The schedule-defining trigger only.** A scheduled or recurring run has one
  *trigger* that defines its schedule. That trigger is what becomes a work item.
  A recurring run does **not** create a new work item for each repeat — the
  individual recurring executions are not mirrored. One trigger, one work item.
- **The dates.** The work item carries a **start date** and a **target date**,
  derived from when the trigger is due. These are calendar dates (day-level).
- **The armed/paused state.** A paused schedule still shows up as a work item, so
  the PM surface can reflect that it's currently paused — the mirror never makes
  a paused run disappear.

**What is not mirrored, and what the mirror never does:**

- **It is one-way: Cinatra → PM tool.** Changes you make in the PM tool do not
  feed back into Cinatra. Renaming, re-dating, or closing the work item in Plane
  has no effect on the Cinatra schedule.
- **The PM tool never controls the run.** Nothing you do in the PM tool can
  pause, disable, start, or reschedule a Cinatra run. The PM state is a view, not
  a lever.
- **Unscheduling deletes the work item.** If you delete the trigger or unschedule
  the run in Cinatra, the mirrored work item is removed in the PM tool too — the
  view follows the schedule.

The mirror is **idempotent**, keyed on the run's id: re-syncing the same trigger
updates the same work item rather than creating duplicates.

---

## If the PM tool is down (fail-open)

The PM integration is **fail-open** by design: the mirror is a convenience, never
a dependency.

- If the PM tool is unreachable, absent, or misconfigured, **your local schedule
  still runs.** The run fires on time regardless of the PM tool's state.
- A failed mirror is **recorded** (the schedule operation has already been
  saved) so it can be repaired, and the schedule is never blocked waiting on the
  PM tool. The work item also re-syncs the next time you change that schedule.
- The PM tool can never disable or delay a Cinatra schedule. Each mirror call is
  bounded (a short timeout); if the PM tool doesn't answer in time, Cinatra
  treats it as a temporary outage and moves on.

In short: a Plane outage is invisible to your agent runs. The worst case is a
work item that's out of date until the schedule changes again; a background
reconcile loop repairs stale mirrors automatically every ~10 minutes.

---

## Setting up the Plane connector

To mirror schedules you connect a Plane workspace + project. You can point at a
hosted Plane (Plane Cloud or your own self-hosted Plane), or stand up a local
Plane for development.

### Production: your Plane instance or Plane Cloud

Use the Plane workspace your team already runs, or Plane Cloud.

### Development: the local Plane fixture

Cinatra ships an opt-in local Plane stack for development. Bring it up with the
dedicated compose profile:

```bash
docker compose --profile plane up -d
```

This runs Plane Community Edition on loopback at `http://localhost:3400`. The
first time, complete Plane's one-time first-user sign-up and create a workspace
in the Plane UI (there is no headless token mint — you sign up and create the
workspace by hand once). See the
[installation guide](../hosting/installation.md) for where this fits in the dev
stack.

### Connect Cinatra to Plane

Once you have a Plane workspace (hosted or local):

1. **Mint a user-level API token in Plane.** In Plane, open your **profile →
   API tokens** and create a personal access token. This is a *user-level*
   token tied to your Plane account.
2. **Open the Plane connector setup** in Cinatra.
3. **Paste the base URL and the token.** Enter your Plane instance's base URL
   (for the dev fixture, `http://localhost:3400`) and the API token you just
   minted.
4. **Pick the workspace and project.** Choose the Plane workspace slug and the
   target project explicitly — this is where mirrored work items land. The
   mapping is always explicit; Cinatra never guesses a project for you.

A few setup notes worth knowing:

- **Auth uses an API-key header, not a bearer token.** Plane authenticates with
  its `X-API-Key` header; a bearer-style `Authorization` header is rejected.
  Cinatra handles this for you — you just paste the token.
- **The token is encrypted at rest.** Cinatra stores the Plane token encrypted
  (it is decrypted only in-process when making a call), never as plaintext.
- **Dates are strict calendar dates.** Plane work items carry a start date and a
  target date as day-level calendar dates — there is no separate due-date field
  in this integration.

---

## Related

- [User Guide home](README.md)
- [Release workflows](release-workflows.md) — the calendar-driven, multi-week process surface (managed on the workflow detail page)
- [Durable workflows](durable-workflows.md) — why agent runs survive reloads and restarts
- [Installation](../hosting/installation.md) — the dev stack, including the `--profile plane` fixture
- Developer reference: [PM connector](../../references/platform/pm-connector.md)
