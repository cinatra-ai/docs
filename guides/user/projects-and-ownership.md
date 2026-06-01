# Projects and ownership

Cinatra is the open source AI workspace for teams. As soon as more than one
person shares it, two questions matter: *who can see and change a thing*, and
*how is related work kept together*. Cinatra answers the first with **ownership
tiers** and the second with **Projects**. They are separate ideas, and this page
keeps them separate.

This is a user-facing guide. If you need the data model and the access rules
behind the surface, see the developer reference,
[Project scoping](../../references/platform/project-scoping.md).

---

## The four ownership tiers

Everything you create in Cinatra — an agent, a skill, an output, a run, a list —
is owned at exactly one of four levels:

```
User  →  Team  →  Organization  →  Workspace
```

Read the arrow as "widening reach":

- **User** — owned by you. The implicit default for personal work. Only you
  (and admins) see it unless you share it.
- **Team** — owned by a team you belong to. Everyone on that team can reach it
  according to their team role.
- **Organization** — owned by an organization. Everyone in the organization can
  reach it according to their org role.
- **Workspace** — owned at the level of the whole running Cinatra instance.
  "Workspace" here means *everyone using this Cinatra*. When a skill or agent is
  set to Workspace, it is visible to every user in the workspace.

A thing always sits at one tier. Widening reach is a deliberate act, not an
accident — personal work stays personal until you (or an admin) raise it.

> **Two meanings of "workspace."** The *product* — the whole Cinatra you log
> into — is also called a workspace in everyday language. The *Workspace tier*
> above is the top ownership level. They overlap in spirit (the whole instance)
> but are not the same control. And note: the **Organization** management screen
> lives at the `/configuration/workspace` route in the sidebar even though it governs the
> Organization tier — the route name is historical; the thing it manages is your
> organization.

### Seeing ownership: the ScopeBadge

Wherever a resource shows its ownership tier, Cinatra uses one consistent
indicator — the **ScopeBadge**. It is a small pill reading `USER`, `TEAM`,
`ORGANIZATION`, `WORKSPACE`, or `PROJECT`, each with its own color so you can
scan a list and know reach at a glance. In list tables, team- and org-owned rows
also show the owning team or organization name next to the badge; user-owned rows
show only the badge, because the owner is implicitly you.

You will see ScopeBadges on skill and package cards, on the Projects list, and in
the principal pickers when you grant access.

---

## Projects: a bounded space for related work

A **Project** is a named space that holds related work — an enterprise account,
a product area, a legal matter, a long-running initiative. Projects are
first-class and long-lived; they are not "campaigns" or throwaway folders.

**A Project is *not* a fifth ownership tier.** Every Project itself lives at one
of the four tiers (it is owned by a user, a team, an organization, or the
workspace). On top of that owner, a Project grants access to *people, teams, and
organizations* directly.

### Access inside a Project

Access to a Project is granted per principal, with one of three roles:

- **Read** — can open the Project and see its work.
- **Write** — can also add and change work inside it.
- **Admin** — can also manage the Project's access grants and lifecycle.

A grant can target a **user**, a **team**, an **organization**, or the whole
**workspace**. So a team-owned Project can still grant read to a specific person
in another team, or write to a partner organization. The Project's owner always
keeps full access — the owner is implicit and never appears as a removable grant
row.

You manage these grants on the Project's **Permissions** screen
(`/projects/[projectId]/permissions`): pick the principal level, pick the role,
and revoke per row. The owner row is shown but read-only.

### Work made inside a Project stays in the Project

This is the point of a Project. When you run an agent *inside* a Project, the
outputs that run produces — generated files, drafts, derived records — are
**scoped to that Project**. They show up when you are working in the Project and
are kept together with the rest of that Project's work.

Work you do *outside* any Project is simply owned at your triggering level (you,
your team, your org, or the workspace) with no Project attached. Nothing forces
you into a Project; it is opt-in context.

A Project behaves like a sealed room: when you list its work you see that
Project's items, and only people with read access (or higher) can open it at all.

### Pinning agents to a Project

A Project can pin specific agent templates so the right agents are front-and-center
for that work, with a visibility setting and optional per-Project defaults. You
manage this on the Project's **Agents** screen (`/projects/[projectId]/agents`).
The agent templates themselves stay available everywhere — pinning is about
focus, not about hiding them from the rest of the workspace.

### Archiving a Project

Projects are archived, never deleted. Archiving freezes new writes while keeping
everything readable for people who have access — the work and its history stay
intact. A Project can be unarchived to resume. There is no "delete Project"
action; archive is the end-of-life state, and it is reversible.

Use the `?archived=1` toggle on the Projects list to see archived Projects.

---

## What you can do, and what to ask an admin for

You can:

- Create Projects and own them at your level.
- Grant and revoke read / write / admin on Projects you administer.
- Run agents inside a Project so their outputs stay scoped to it.
- Pin agent templates into a Project.
- Archive and unarchive Projects you administer.

Ask an admin when:

- You need a resource raised to a wider ownership tier (e.g. made
  organization- or workspace-visible) and you do not have the role to do it.
- You need access to a Project owned by another team or organization and no one
  with admin on it can grant you in.

---

## Related

- [User Guide home](README.md)
- [Concepts and glossary](../../references/glossary.md) — agents, skills, objects, lists, teams, organizations
- [Artifacts and files](artifacts-and-files.md) — the outputs that get scoped to a Project
- Developer reference: [Project scoping](../../references/platform/project-scoping.md) — the access model, sealed-room reads, and the full data model
