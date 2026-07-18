# Artifacts and files

Cinatra is the open source AI workspace for teams, and a lot of the value of a
workspace is the *stuff* — the documents, drafts, images, PDFs, and references
that flow into and out of agent work. In Cinatra these are called **artifacts**.

This page explains what an artifact is, how to bring files in through the prompt
window, where artifacts live, and how to use them as inputs and outputs of agent
runs.

---

## What an artifact is

An **artifact** is a self-contained deliverable — something you open, read, edit,
publish, download, or attach. A PDF you uploaded, a markdown draft an agent wrote,
a generated image, an external link, a published document: each is an artifact.

Artifacts are different from *data objects* (contacts, accounts, lists, campaign
records). A data object is a record whose meaning is its relationships and status;
an artifact's meaning is its content and where it came from. For data objects, see
[Data and objects](data-and-objects.md).

Every artifact has:

- a stable identity that survives editing — the artifact keeps the same id as you
  revise it;
- immutable **versions**, so each revision is preserved rather than overwritten;
- an **origin** that records where it came from — an upload, an email attachment,
  agent-generated output, an external link, or a live generator;
- a viewer that matches its type, so you can read it in place.

---

## Uploading files in the prompt window

The fastest way to bring a file into a conversation is the prompt window itself.
Open the **plus (+)** menu beside the message box and choose **Upload files**. You
can select one or several files at once. The files attach to the message you are
about to send.

When you send the message, the assistant or agent receives those files as
attachments. What happens next depends on the file type:

- **Readable types** (for example text, markdown, PDFs, and images, within size
  limits) are passed to the model so it can actually work with the content.
- **Other types** are still attached — the model is told the file exists, its name,
  and that it could not read it directly. Nothing is silently dropped. You always
  know whether the model could see a file's contents.

Uploaded files become artifacts with an `upload` origin, so anything you attach in
chat is preserved and reachable later, not just consumed and forgotten.

---

## Where artifacts live

Artifacts have a home in the workspace — the **Artifacts** area (`/artifacts`).
From there you can browse the artifacts you have access to and open any one of
them.

Opening an artifact (`/artifacts/[id]`) shows it in a viewer chosen for its type:

- **Markdown** renders formatted, with the raw source available alongside.
- **Plain text** shows as readable text.
- **PDFs** open in the in-page viewer.
- **Images** display inline.
- **Other types** show a details card, with an external-open button when the
  artifact points at a connector-owned resource.

Every artifact detail view has a **Download** button so you can pull the file out
when you need the original.

Because artifacts ride on the same ownership and scope model as everything else in
Cinatra, an artifact made inside a Project stays with that Project's work. See
[Projects and ownership](projects-and-ownership.md).

---

## Artifacts as agent inputs and outputs

Artifacts move through agent work in two directions.

**As inputs (context).** When an agent run needs grounding material — a brief, a
source document, a prior draft — it consumes artifacts as **context**. The
reference is pinned to a specific version at the moment it is selected, so a run
always works from the exact content it was given, even if the artifact is edited
later. Some agents declare what kinds of artifact each input slot accepts, and the
workspace resolves the right artifact for the slot when the run starts.

**As outputs.** When an agent produces a deliverable — a written draft, a
generated image, a compiled document — it is written back as an artifact with an
`agent_generated` origin. It then behaves like any other artifact: you can open it,
read it, download it, edit it (creating a new version), and attach it to a later
conversation.

This is what lets work compound. An agent's output becomes the next agent's input;
a file you uploaded this morning grounds a run this afternoon; a draft you edited
by hand is the version the next step builds on.

---

## How different artifacts change

Not every artifact behaves the same way when you or an agent try to edit it —
what an artifact *is* decides whether it can change:

- **Drafts you refine, then send.** Something Cinatra authored for you — a social
  post, an email body — is a **draft** you can edit as many times as you like
  (each edit is a new version). The design is that once it is scheduled or
  published the draft **locks** and you keep a record of exactly what went out;
  publishing never turns the draft into the post on the other platform — it
  records that the post was made.
- **Records that never change.** Some artifacts capture something that already
  happened — an email that was *sent*, a reply that was *received*. These are
  **records**: you can open and read them, but they are kept exactly as they
  occurred and are never editable.
- **Links to things that live in another tool.** An artifact can be a **link** to
  content another system owns — a Google Doc, a WordPress post. You edit those in
  the tool that owns them, and because that tool is in charge, the link can go out
  of date or stop working if the original is changed or removed. When you need a
  fixed copy that will not drift, take a snapshot — that snapshot becomes its own
  record artifact.

*(Publish-and-lock for drafts is **not yet available** — it arrives with the
publication ledger and the connectors that produce these drafts. The machinery
that tracks an external link as it goes stale or is removed upstream has shipped,
but the connector sync that keeps those links current lands with those same
connectors.)*

## What an agent can find

An agent finds artifacts to work with in two different ways, and it helps to know
which is which:

- **By meaning.** Cinatra keeps a searchable memory of the *gist* of your work, so
  an agent can answer "find me the drafts about the spring launch" without knowing
  exact titles. Only a safe summary of an artifact is placed in this memory — never
  the raw contents.
- **By exact detail.** Data an agent pulls back from another service (a list of
  search results, a batch of records) is reachable by exact filters — a specific
  id, a date range — rather than open-ended "find me things like this" search. This
  keeps raw third-party data out of the general memory while still letting a run
  use it precisely.

---

## Sharing and permissions

Artifacts follow the same access rules as the rest of your work, so there is no
separate "artifact sharing" system to learn:

- An artifact is owned at one of the ownership tiers (user, team, organization, or
  workspace) — see [Projects and ownership](projects-and-ownership.md) for what
  those tiers mean.
- An artifact created inside a Project is scoped to that Project, and the people
  with access to the Project can reach it.
- Widening who can see an artifact is the same act as widening any owned resource —
  raise its tier or work inside a shared Project. If you need an artifact made
  visible more widely than your role allows, ask an admin.

Referenced artifacts are never hard-deleted out from under work that depends on
them — a version that a run or message points at is retained, so past work stays
reproducible.

---

## Related

- [User Guide home](README.md)
- [Data and objects](data-and-objects.md) — the typed records (contacts, accounts, lists) that are *not* artifacts
- [Projects and ownership](projects-and-ownership.md) — how artifacts get scoped and shared
- [Human-in-the-loop by design](human-in-the-loop.md) — reviewing and editing agent outputs before they land
- Developer reference: [Artifacts architecture](../../references/platform/artifacts.md) and [LLM attachments and prompt-window upload](../../references/platform/artifacts-attachments-and-prompt-window-upload.md) for the mechanics
