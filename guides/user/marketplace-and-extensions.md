# Marketplace and extensions

Cinatra is the open source AI workspace for teams, and most of what you can do in it arrives as an **extension**. Extensions add new things Cinatra can do: agents, connectors, skills, artifacts, and workflows. After an admin installs an extension, its approved features appear in the right places on the running workspace — the Agents area, connector setup screens, or skills matched into agent runs — without waiting for a rebuild or redeploy. If an admin archives it, normal access stops while past work remains available.

This page is for the people using the workspace day to day. It explains what extensions add, where their features show up, and why a feature you expect might not be there for you. Installing, approving, and visibility are admin decisions — see the [Admin Guide: marketplace](../admin/marketplace.md) for that side.

---

## The five kinds, in plain terms

The marketplace recognises five kinds of extension. You meet each kind in a different part of the workspace:

- **Agents** — an agent does a job for you: research a list of companies, draft a blog post, run an outreach campaign, review code. Installed agents appear in the **Agents** area and can be started from chat. This is the kind you interact with most.
- **Connectors** — a connector links Cinatra to an outside system (email, a CMS such as WordPress or Drupal, a prospecting source, and others). Once a connector extension is set up, agents and chat can read from and write to that system on your behalf.
- **Skills** — a skill is reusable guidance an agent reads while it works (a way of writing, a checklist, a house style). You do not run a skill directly; it is matched into an agent run when the run fits the skill's rules, sharpening the result.
- **Artifacts** — an artifact is a typed deliverable: a blog post, an ideal-customer profile, a product portfolio, a slide deck, and others. Agents produce artifacts; you open, read, edit, publish, download, or attach them, and you can feed them back into a later run as context.
- **Workflows** — a workflow is a multi-stage process (for example a multi-week release plan) you launch and then steer through its stages and approvals.

For the definitions behind these terms, see [Concepts and glossary](../../references/glossary.md#extension).

---

## Where installed features show up

You rarely visit "the extensions list" as a day-to-day user. Instead, an installed extension's features appear where you already work:

| Kind | Where you find it |
|---|---|
| Agent | The **Agents** area in the sidebar, and as something you can ask the chat assistant to start. |
| Connector | The connector setup and status screens, and as a capability your agents and chat can use once it is connected. |
| Skill | Inside an agent run — a matched skill is applied automatically; the **Skills** area lists the catalog and which skills matched. |
| Artifact | As a deliverable an agent produces — you open it from the run, the object workflows, or wherever the output is surfaced, then read, edit, publish, download, or attach it. |
| Workflow | The launcher you use to start a multi-stage process, after which you manage its stages and approvals. |

The shape of this is deliberate: when an admin installs an extension, the new capability activates on the running workspace and appears in these places without a redeploy. You may simply notice a new agent in the Agents area or a new connector option that was not there yesterday.

---

## Why a feature might not appear for you

If a teammate has an agent, connector, or skill that you cannot see, it is almost always one of these:

- **It is not installed on your workspace.** Extensions are installed per instance by an admin. If it was never installed here, no one on this workspace has it.
- **It is archived.** An admin can archive an extension to pause it. While archived, its features stop appearing for normal use, but any work it already produced stays available. If you need it back, ask an admin to restore it.
- **Its visibility or permissions exclude you.** Each extension carries an access level — and individual agents carry their own permissions. An agent might be visible to everyone in the workspace, scoped to a team or organisation, or limited to specific people and their co-owners. If you are outside that scope, the feature is hidden from you even though it is installed.
- **A connector is installed but not connected.** A connector extension can be present without a working credential. Until someone completes its setup screen, the actions it enables will not work.
- **Its code did not pass the host activation check.** Beyond visibility and permissions, an extension's features only appear once its code has activated on the running workspace. If the install did not clear the host's activation-trust check, the extension can be present without its features being live. An admin can confirm whether it activated.

When in doubt, ask an admin: they can tell you whether something is installed, archived, or simply scoped away from you, and they can grant access or finish setup.

---

## What happens when an extension changes

Extensions are maintained over time, and admins manage that on the running workspace:

- **Update** — when a newer version is published, an admin can update the installed extension in place. You keep using the same agent, connector, skill, or workflow; it just gets the newer behaviour. No interruption to your saved work.
- **Archive** — an admin can archive an extension to suspend it reversibly. Active access stops, but history and configuration are preserved. This is the safe "turn it off for now" action.
- **Restore** — an archived extension can be brought back. When it returns, its features reappear where they were, and the work it produced while active is still there.
- **Removal** — a full removal is heavier than archive: it also clears the extension's scoped settings and secrets. Admins use removal deliberately, not as the routine "turn off" step.

If an agent you rely on suddenly disappears, it was most likely archived or removed by an admin, or its access was changed. Past outputs from runs you already completed remain available either way.

---

## Asking an admin for access or setup

A few things are admin-only, and the right move is to ask:

- **"Please install this extension."** Browsing and installing from the marketplace is an admin task. If you found something in the marketplace you want, an admin reviews what it requests, approves the capabilities it may use, chooses who can see it, and completes any setup it needs.
- **"Please give me access."** If an extension is installed but scoped away from you, an admin (or the extension's owner) can grant you access or co-owner rights.
- **"Please finish connecting this."** A connector that is present but not yet connected needs its setup screen completed before it will work.
- **"Please restore this."** If something you used was archived, an admin can restore it.

---

## Where to go next

- [User Guide](README.md) — the rest of the day-to-day guide
- [Concepts and glossary](../../references/glossary.md#extension) — the precise meaning of agent, connector, skill, artifact, and workflow
- [A connected ecosystem of capabilities](connected-ecosystem.md) — how agents, connectors, skills, objects, and dashboards compose
- [Admin Guide: marketplace](../admin/marketplace.md) — the install, visibility, and lifecycle controls behind everything on this page
