# Data and objects

Cinatra is the open source AI workspace for teams, and a workspace needs a place
where the *records* live — the contacts, accounts, campaigns, transcripts, and
lists that agents read from and write back to. In Cinatra that place is the
**Data** surface, and the records are called **objects**.

This page explains the unified Data surface, the kinds of objects it holds, the
views that organize them, how Lists work, and how agents read and write objects
during a run.

For the deeper mechanics, see the developer references
[Objects: the canonical surface](../developer/objects.md) and
[Objects layer](../developer/objects-layer.md).

---

## One Data surface for everything

Rather than a separate screen per record type, Cinatra gives you a single,
unified **Data** surface (`/data`) that lists objects across every type you have
access to. From there you can:

- filter by family — for example assets vs. entities;
- filter by a specific type;
- open any record to see its detail (`/data/[id]`), including its change history;
- browse the available types (`/data/types`).

Each row is rendered in a way that suits its type, so a contact looks like a
contact and a campaign looks like a campaign — but they all live on one queryable
surface. This is what makes cross-cutting questions possible: "show me everything
related to this campaign," "what did this run produce," "everything created by
this person."

---

## The typed object families

Objects are grouped into families. The families you will encounter most:

- **Entities** — your identity records: **contacts** (people) and **accounts**
  (companies). These are the backbone of customer and prospect data.
- **Campaigns** — the records that make up outreach work: a campaign, its context,
  its recipient set, and the email bundles a run produces.
- **Assets / content** — created deliverables such as content ideas and posts,
  and saved media.
- **Lists** — saved collections of accounts or contacts (more below).
- **Agents** — saved agent templates.
- **Artifacts** — references to artifact deliverables (see
  [Artifacts and files](artifacts-and-files.md)).

Transcripts and other domain records also surface here as objects. The exact set
of types you see depends on which extensions are installed in your workspace — an
extension can add its own object types, and they appear on the same Data surface
without any special handling. After an admin installs an extension, its object
types show up here alongside the built-in ones.

Each object carries a clear, namespaced type, an owner and scope, optional parent
links (a contact belongs to an account, for example), and provenance — including
which agent and run produced it, when an agent created it.

---

## Typed views

The Data surface presents each type through views built for it. A contact record
shows contact fields; an account shows company fields and its contacts; a campaign
shows its context and recipients. You do not configure a generic spreadsheet — you
work with records that already know what they are.

Family- and type-scoped entry points let you jump straight to a slice of the data
(for example, all assets, or all records of one type) while still reading from the
same underlying surface. The detail view of any record includes its history, so
you can see how it changed over time.

---

## Lists as first-class agent inputs and outputs

A **List** is a saved collection of accounts or contacts — and in Cinatra a List
is not just a convenience for humans; it is a first-class way to hand a set of
records to an agent and to receive a set back.

- **As an input:** point an agent at a List and it works through those records —
  enriching them, contacting them, researching them.
- **As an output:** an agent that discovers or selects records can write the
  result into a List, so the next step (or the next agent) picks up exactly that
  set.

This is what lets multi-step work flow cleanly: a discovery agent produces a List,
a selection step narrows it, an outreach agent consumes it. The List is the handle
that carries the set of records from one stage to the next.

---

## How agents read and write objects

You do not have to manage the plumbing — but it helps to know the shape of it.

**Reading.** When an agent needs records, it reads from the Data surface scoped to
what the run is allowed to see. If the run is happening inside a Project, the
agent sees that Project's records (see
[Projects and ownership](projects-and-ownership.md)); outside a Project it sees the
records owned at the run's level. Access is always checked — an agent cannot read
across tenants or into work it has no grant for.

**Writing.** When an agent produces a record — a new contact, an updated account,
a campaign bundle — the workspace decides intelligently what to do with it rather
than blindly creating duplicates. Depending on the type, a produced record may
**update** a matching existing record, **merge** into it, **create** a new one, or
**pause for a human to confirm** when the match is uncertain or a required field is
missing. This keeps your data clean as agents run and re-run.

Records an agent writes inherit the run's scope, so work done inside a Project
stays with that Project, and per-run provenance is stamped on every row so you can
always trace a record back to the run that produced it.

---

## Related

- [User Guide home](README.md)
- [Artifacts and files](artifacts-and-files.md) — deliverables (files, drafts, images) as opposed to typed records
- [Twenty CRM integration](twenty-crm-integration.md) — where contacts, accounts, and lists actually live for CRM data
- [Projects and ownership](projects-and-ownership.md) — how object access and scoping work
- Developer references: [Objects: the canonical surface](../developer/objects.md), [Objects layer](../developer/objects-layer.md)
