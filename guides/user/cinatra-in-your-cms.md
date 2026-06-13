# Cinatra in your CMS

Cinatra ships **first-party integrations for WordPress and Drupal** that put a Cinatra-driven AI assistant directly inside the CMS your content editors already use. Authors open a WordPress post or a Drupal node, click the Cinatra widget in the corner, ask it to tighten the lead, add a section, or fix the metadata, and the changes appear on the page they're already editing. No second tab. No copy-paste. The assistant calls your Cinatra instance — same credentials, same skills, same audit trail as anywhere else.

This page covers what an editor sees, what an admin sets up, and how the two CMS integrations differ.

---

## What an editor sees

After your admin installs the Cinatra plugin or module on your CMS and connects it to your Cinatra instance, you see a floating Cinatra button in the corner of the page (you need to be logged in — anonymous visitors don't see it). Click it; a chat panel opens. From there you can:

- **Ask conversationally** — "summarise this post in 50 words" or "what tone is this written in?" The assistant reads the current node or post and answers in chat.
- **Request edits** — "rewrite the lead to focus on small businesses" or "add a section on pricing." The assistant writes the changes and shows you a diff of which fields it changed; the page then reloads so the new content renders.
- **Apply across batches** — "make every heading sentence-case" or "shorten every quote by half." The assistant works through the document and writes a single batched edit.

The assistant writes changes directly — to a new draft revision for Drupal, or to a draft of the current post for WordPress. Both CMSes preserve the previous revision in their history, so you can roll back from the CMS's normal revisions UI. On WordPress the post status switches to `draft` while edits are applied, which means the public front-end shows the last published version (or a 404 if the post wasn't published yet) until you republish from the WordPress editor. On Drupal the published version stays live while you work on the new draft revision.

## What an admin sets up

The integration has two halves: a plugin/module that lives inside the CMS, and a configuration page inside Cinatra at `/connectors/cinatra-ai/drupal-assistant-connector/setup` or `/connectors/cinatra-ai/wordpress-assistant-connector/setup`.

The Cinatra side is the same for both CMSes:

1. **Open the connectors admin page** and generate the widget credentials. Cinatra returns an **API key** that the CMS will send back on every request.
2. **Configure the assistant** at `/connectors/cinatra-ai/drupal-assistant-connector/setup` or `/connectors/cinatra-ai/wordpress-assistant-connector/setup` if you want a custom system prompt for the in-CMS chat.

The CMS side differs slightly between the two:

- **Drupal.** Install the `cinatra` module, then open **Configuration → Web services → Cinatra** (`/admin/config/services/cinatra`). Paste your Cinatra URL, the API key, and your instance ID. Save.
- **WordPress.** Install the Cinatra plugin, then open **Settings → Cinatra**. Paste the Cinatra URL, the API key, the instance ID, and (optionally) a webhook secret. Save.

After saving, the widget appears on supported pages — see below.

### Where the widget appears

The widget is intentionally not loaded everywhere:

- **Drupal.** The module attaches the widget to node canonical view (`/node/<id>`), node edit form, and the site front page — and only for authenticated users.
- **WordPress.** The plugin enqueues the widget on the WordPress admin (`wp-admin`), and only for users with the `manage_options` capability (typically administrators). It is not loaded for lower-privileged editors or on the public front-end at all.

If your team needs the widget on different pages, that's a plugin/module configuration change — not a Cinatra-side setting.

### Credential scope

The API key only works for the widget surface, only against the configured Cinatra instance. It cannot run arbitrary Cinatra primitives or read content the configured CMS instance shouldn't see.

For the Cinatra side of the marketplace, the [Admin Guide](../admin/README.md) walks through the general administration model.

## What the assistant can do

The CMS assistant is backed by a specialised agent (`drupal-content-editor` or `wordpress-content-editor`) that knows how to:

- Read the current post or node, including custom fields and metadata.
- Propose structural rewrites (re-order sections, change headings, tighten paragraphs).
- Apply per-field edits (just the title, just the excerpt, just the SEO meta description).
- Surface a typed diff before writing — every change is reviewable as field × before × after.
- Handle drafts and revisions correctly: Drupal gets a true draft revision; WordPress gets a draft-status post.

It is not a general-purpose Cinatra assistant — it is content-editor-shaped. For broader Cinatra workflows (running outreach campaigns, doing research, building dashboards), you open the Cinatra workspace itself.

## How WordPress and Drupal differ

The two integrations are intentionally symmetric, but the underlying CMSes have different content models. The relevant differences for an editor:

- **Drafts and revisions.** Drupal uses a true draft revision — the published version stays live untouched while you edit the draft. WordPress sets the post status back to `draft` while the assistant works and re-publishes when you confirm.
- **IDs.** Drupal node IDs can be alphanumeric in some configurations; WordPress post IDs are always integers. This matters only if you're automating against the assistant from outside the CMS.
- **Media.** WordPress has dedicated media-library primitives (uploads, metadata-only updates). Drupal handles media as part of the node structure.

Most editors won't notice any of these — the assistant adapts to each CMS's conventions automatically.

## What stays inside the CMS

The integration is read-and-write *inside the CMS you connected*. Cinatra does not exfiltrate content you didn't ask it to. Specifically:

- **The widget chat history** is held in your browser's `sessionStorage` for the current page session. It is sent to Cinatra with each request so the assistant has context, but it doesn't persist on the Cinatra side as a separate chat thread. Close the tab and the history goes away.
- **Field reads** happen at edit time, against the CMS's normal authenticated API. Cinatra doesn't index your content unless you've also wired the [Cinatra objects layer](connected-ecosystem.md) to a CMS source explicitly.
- **The audit trail.** Every content-editor run on Cinatra writes an `audit_events` row. You can see who edited what, when, in the run history.

## What an admin should know about removal

Disconnecting the widget cleanly is symmetric to installing it: rotate the API key on the Cinatra side (the old one stops working immediately), then uninstall the plugin or module on the CMS side. The widget vanishes from editor pages on next reload. Existing audit trails in Cinatra and existing drafts in the CMS are preserved.

---

## Where to go next

- The step-by-step WordPress setup: [The Cinatra WordPress plugin](wordpress-plugin.md) — install, connect, permissions, troubleshooting, and uninstall
- The capability fabric the in-CMS assistant rides on: [A connected ecosystem of capabilities](connected-ecosystem.md)
- How the assistant pauses for review before writing: [Human-in-the-loop by design](human-in-the-loop.md)
- The protocol-level reference for the integration: [Integrating Cinatra with a CMS](../../references/platform/integrating-with-a-cms.md) in the Developer Guide
