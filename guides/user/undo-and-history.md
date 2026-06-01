# Undo and history

Cinatra keeps a record of every change made to your data — whether you made
it by hand, an assistant made it in chat, or an autonomous agent made it
during a run. That record is what lets you look back at what happened and,
when it makes sense, undo it. Nothing changes your data silently, and nothing
is lost without a trail.

This page is for the people running the work: how to see what changed, how to
undo an agent-generated change, and what to expect when a change can — or
cannot — be fully reversed.

---

## The short version

- Every data item carries a **History** tab that lists each change to it, who
  made it, and when.
- A **Change history** view collects those changes into reviewable groups so
  you can see everything a run touched in one place.
- Most changes can be **rolled back in one step**. Undoing never erases the
  original history — it adds a new, reversing change on top, so the trail of
  what happened stays intact.
- A few kinds of change (a sent email, a published article) are **logged but
  can't be auto-reversed**. Cinatra tells you exactly why and what to do
  instead.

---

## Where history lives

### A single data item

Open any data item from the **Data** area and select the **History** tab.
It shows the change timeline for that item: each entry names the operation
(created, updated, deleted, restored), shows the version before and after,
names who did it, and links to the change group it belonged to.

If an assistant just changed an item and you want to land directly on its
history, the item's History tab is the place to look — the deep link
`/data/<id>?focus=history` opens the item with the History tab already
selected.

### Everything that changed (Change history)

The **Change history** view (`/data-safety/change-sets`) is the workspace-wide
list of change groups. Each row is one group of related changes — typically
everything a single agent action or run produced — with:

- when it was opened,
- its **effect** (reversible, irreversible, or compensating — explained
  below),
- whether it is **restorable**, and
- who or what made it.

You can filter the list by the item touched, the actor, the run, the effect,
the restorable flag, and a date window — useful when you want to find "what
did that run change last night?" Selecting a row opens the group's detail,
where you can review each change and, if eligible, restore the whole group.

Both surfaces show only what belongs to your active organization. If you have
no active organization selected, the list stays empty rather than showing
anything cross-tenant.

---

## Undoing a change

### Undo from chat

When an assistant makes a change for you in chat — say it updated a record or
created a draft — an **undo affordance** appears for that action shortly
after it lands. It points at the change the run just produced and opens the
restore review for it. The chat undo is scoped to recent, reversible changes
the run actually made, so it only shows up when undoing genuinely makes sense.
If the change isn't reversible, the undo affordance won't offer a one-click
reversal — the change-history detail explains why.

### Undo your last change to an item

On a data item's **History** tab, when your most recent change to that item
is still within the short undo window and can be reversed, an **undo your
last change** panel appears at the top of the tab. It previews what would be
reversed and lets you confirm. When there's nothing eligible to undo, the
panel simply doesn't appear.

### Roll back from the History tab

Each restore-eligible entry in the History panel offers **Restore to this
version**, which returns the item to that earlier state. The current version
never shows a restore button (there's nothing to undo), and the button only
appears at all if you have permission to change that item.

### Roll back a whole change group

From **Change history**, open a group and review its changes. If the group is
restorable, confirming the restore reverses every change in it together — all
or nothing. A partial reversal can't happen: either the whole group rolls back
or none of it does. The restore review shows a per-item preview of what will
change before you confirm.

Restoring does **not** rewrite or delete the original. It records a new,
reversing change group on top of the timeline, with a pointer back to the one
it reversed. The original group stays exactly as it was — so a restore is
itself fully visible in history, and itself reversible.

---

## What "reversible" actually means

Not every change is the same. Cinatra labels each change group with an
**effect** so you know up front what you can do with it.

| Effect | What it means | Can you undo it? |
|---|---|---|
| **Reversible** | A change to data Cinatra holds — a record edited, created, or deleted inside the workspace. | Yes — roll it back in one step. |
| **Irreversible (logged)** | An action that left the workspace and can't be quietly taken back — an email that was sent, an article that was published. | No automatic undo. The change is fully logged with the reason, so you always know it happened. |
| **Compensating action** | An irreversible action that has an approved follow-up to make it right — for example, sending a retraction. | Yes, once the follow-up is set up — undoing performs the compensating action rather than silently reversing the original. |

In plain terms:

- A change you can **fully reverse** is the common case — internal data edits.
  Roll it back and the item returns to its prior state.
- A change that is **logged but not auto-reversible** is something that already
  reached the outside world. Cinatra won't pretend it can un-send an email; it
  records exactly what happened and why it can't be auto-undone, so you can
  decide the right real-world response.
- A change that **needs a compensating action** sits in between: it can't be
  silently reversed, but there's an approved way to make it right (like a
  retraction), and undoing runs that follow-up.

A change group is non-restorable when it contains an irreversible action with
no approved compensating follow-up. The Change history view marks those rows
clearly, and the restore control stays disabled with an explanation when you
hover it.

### When a reversible change still can't be restored

Even a normally reversible change can be blocked from restore if the world
moved on — for example, a referenced item was permanently removed, or a change
that was published to a connected CMS has since been edited at the source. In
those cases Cinatra surfaces the conflict instead of silently overwriting
newer work. The change-group detail tells you which item is in the way and why,
so you can resolve it deliberately rather than clobber a fresher version.

---

## Merge proposals

Some agents — the ones that enrich your records with outside facts — never
overwrite your data directly. Instead they submit a **merge proposal**: a
suggested set of field changes, each with its source, waiting for a person to
review. You'll find pending proposals under
`/data-safety/merge-proposals`. Approving a proposal applies it as a normal,
reversible change (so it lands in history like anything else); rejecting it
leaves your record untouched. If the record changed since the proposal was
made, the review flags the conflict so you can decide whether to keep your
version, take the latest, or ask for a fresh proposal.

---

## What you can ask an admin for

- **Restore something you can't see or reach.** History and restore respect
  your permissions — you only see and can roll back items you're allowed to.
  If you need to recover something outside your access, ask an admin.
- **A blocked restore.** If a restore is blocked because an item was
  permanently removed or a connected source changed, an admin can help you
  understand the conflict and choose the right path.
- **Retry a connector restore.** When a rolled-back change involved a connected
  system (like a CMS) and the connector step didn't complete, retrying that
  step is an admin action.

---

## Related reading

- [User Guide overview](README.md)
- [Human-in-the-loop by design](human-in-the-loop.md) — reviewing and
  approving agent work before it lands
- [A connected ecosystem of capabilities](connected-ecosystem.md) — how objects
  and the data layer fit together
- For the engineering model behind undo and history (effect classes, change
  capture, the primitives involved), see the developer reference:
  [Data safety: undo and versioning](../../references/platform/data-safety-undo.md)
