# Twenty CRM integration

Cinatra is the open source AI workspace for teams, and for customer data it
connects to **Twenty**, an open source CRM. Twenty is the system of record for
your People, Companies, Opportunities, custom objects, and Lists. Cinatra's
agents read and write those records during their work, and the full CRM browse
experience lives in Twenty itself.

This page explains how the two fit together from a user's point of view.

For the connector mechanics, see the developer reference
[CRM connector](../developer/crm-connector.md).

---

## Twenty is the CRM store

Your CRM records — **People** (contacts), **Companies** (accounts),
**Opportunities**, any **custom objects** you have defined, and **Lists** — are
stored in Twenty. Twenty owns the full record: every field, the record history,
and the UI for browsing and editing it.

Cinatra does not duplicate the CRM browse experience. When you want to look
through accounts and contacts as a human — filter, sort, edit fields by hand —
you do that in Twenty. Cinatra holds only the lightweight pointers it needs to
connect a record to the rest of your workspace's work (run history, derived
records, and search), and it reaches into Twenty for the heavier detail on demand.

Lists are saved views in Twenty: a List is a curated set of people or companies,
and adding a record to a List tags it so it shows up in that view.

---

## How agents use the CRM

Agents work with CRM records through a stable set of CRM actions, so an agent
never has to care about the storage details — it just operates on accounts,
contacts, and lists.

- **Reading.** An agent can search for a company, look up a person by email, fetch
  a batch of people, or read the members of a List. Discovery and research agents
  use this to find and pull context.
- **Writing.** An agent can create a company, create a contact attached to a
  company, update a record's fields, and add records to a List. Outreach and
  enrichment agents use this to grow and maintain the data.

A few practical notes that follow from how the CRM works:

- A contact is always attached to a company.
- Creating a record does not automatically de-duplicate on the CRM side. The
  discipline agents follow is *search first, then create* — and discovery runs
  can occasionally produce duplicate contacts that are cleaned up separately. If
  you re-run a discovery agent, expect to review for duplicates.
- Adding a record to a List is safe to repeat — adding the same record twice is a
  no-op.

Because the CRM connector is provider-neutral, the same agent actions keep working
regardless of which CRM provider sits behind them. Today that provider is Twenty.

---

## Working with CRM data in chat

Inside the chat assistant you can ask about CRM records directly — for example,
resolving a contact by email — and the assistant uses the CRM actions to answer.
This is the everyday way to touch CRM data from within Cinatra without leaving the
conversation: ask, and the assistant reads (or, when you direct it, writes)
through the CRM.

---

## Deep-linking into a record

When you need the full record — all fields, the edit form, the history — you open
it in Twenty. Twenty's record URLs follow a predictable shape (a companies path
and a people path keyed by the record's id), so a specific company or person opens
straight to its own page in the CRM. This is the bridge between "an agent just
touched this account" and "let me go see and edit the whole thing": the work
happens in Cinatra, and the canonical record opens in Twenty.

---

## Custom objects and Opportunities

Beyond People and Companies, Twenty supports **Opportunities** and your own
**custom objects**. These live in Twenty alongside the standard objects and are
reachable through the same connector surface, so agents that understand a custom
object can read and write it the same way they handle people and companies. The
shape of each custom object is defined in Twenty; Cinatra's agents operate against
whatever Twenty exposes.

---

## Related

- [User Guide home](README.md)
- [Data and objects](data-and-objects.md) — the unified Data surface and how Lists act as agent inputs and outputs
- [A connected ecosystem of capabilities](connected-ecosystem.md) — how connectors, agents, and data compose
- Developer reference: [CRM connector](../developer/crm-connector.md)
