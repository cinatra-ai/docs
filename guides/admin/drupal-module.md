# The Cinatra Drupal module

This page is the canonical "how to use it" reference for the **Cinatra Drupal module** — the first-party module that embeds a Cinatra-driven AI editing assistant inside your Drupal site for your content editors. It is written for the site builder or administrator who installs and configures the module, with the editor-facing notes called out where they matter.

It covers the full lifecycle: install and enable, connect to a Cinatra instance, grant the permission that controls who sees the assistant, what the assistant does, the delivery and security model (how the widget reaches the browser and how the credential is kept off it), the external-services / privacy disclosure, and troubleshooting and uninstall.

For the editor-and-overview view of both CMS integrations, see [Cinatra in your CMS](../user/cinatra-in-your-cms.md). For the protocol-level reference, see [Integrating Cinatra with a CMS](../../references/platform/integrating-with-a-cms.md).

Back to the [Admin Guide](README.md).

---

## What the module does

The module puts a floating Cinatra button in the corner of node pages. A signed-in editor with the right permission clicks it, a chat panel opens, and they can ask the assistant to read the current node and draft or revise its content in place — tighten the lead, add a section, fix the metadata — without leaving the page they are editing.

Concretely, the module:

- Attaches the assistant widget on **node canonical view** (`/node/<id>`), the **node edit form**, and the **site front page**.
- Shows the widget only to users who hold the **`use cinatra assistant`** permission (see [Permissions](#permissions) below) — not to every authenticated user.
- Ships the assistant widget JavaScript **locally, inside the module** — the module does not load remote code from your Cinatra instance.
- Brokers each chat session to your Cinatra instance, which runs the `drupal-content-editor` agent and streams the result back to the editor's browser.

The module is a thin, first-party carrier. The intelligence — the agent, the model, the skills — lives in your Cinatra instance.

---

## Install and enable

You install the Cinatra module the same way you install any Drupal contributed module.

**Via Composer** (recommended):

```bash
composer require drupal/cinatra
drush en cinatra
```

The module is available on [Drupal.org](https://www.drupal.org/project/cinatra) and is compatible with Drupal 10.3 or later and Drupal 11.

**Manually**, if you are running a pre-release build or a fork:

1. Place the module under `modules/custom/cinatra/` (or any `modules/` path Drupal scans).
2. Enable it from **Extend** (`/admin/modules`) — tick **Cinatra** and save — or run `drush en cinatra`.

The module requires Drupal 10.3 or 11 and a Cinatra instance you can reach over HTTPS. It has no other Drupal dependencies.

> **Upgrading from the pre-release `cinatra_widget` module?** The module's install hook performs a one-shot copy of `cinatra_widget.settings` to `cinatra.settings`, so your existing Cinatra URL and credentials carry over. Disable and uninstall the old `cinatra_widget` module afterward.

---

## Connect to a Cinatra instance

Open **Configuration → Web services → Cinatra** (`/admin/config/services/cinatra`) in Drupal. The settings form is gated by the standard *Administer site configuration* permission and offers three ways to connect, in order of preference.

### One-click "Connect with Cinatra" (recommended)

In the **Connect to Cinatra** section, enter your Cinatra instance URL (for example `https://cinatra.example.com`) and click **Connect with Cinatra**. Your browser is sent to a Cinatra consent screen where an organization admin approves the connection; Drupal then provisions the integration credential automatically and stores it server-side. **You never copy or paste a key.**

Behind the scenes this is an OAuth-style handshake: the Connect button is CSRF-protected and mints a PKCE challenge plus a single-use `state`; Cinatra redirects back to the module's callback (`/admin/config/services/cinatra/connect/callback`); and Drupal exchanges the returned short-lived code **server-side** for the long-lived per-site credential. The credential never reaches the browser at any point. After a successful connection the form shows which instance you are connected to.

### Connection-string fallback (no browser redirect)

If the browser redirect is not viable (an air-gapped admin network, a headless setup), expand **No browser redirect? Use a connection string instead**, paste the one-line connection string generated in Cinatra, and click **Connect with code**. Drupal performs the same server-side exchange (using a one-time install code instead of a redirect) and stores the credential server-side.

### Manual configuration (advanced)

The **Manual configuration (advanced)** section lets you set the connection by hand if you already hold the values:

| Setting | What it is | What it does |
|---|---|---|
| **Cinatra URL** | The base URL of your Cinatra instance, e.g. `https://cinatra.example.com` | Where the module's server-side broker sends chat sessions, and the origin the widget streams from. |
| **API key** | The long-lived widget credential generated in Cinatra at `/settings/connectors/drupal-widget` | Authenticates this Drupal site to your Cinatra instance. Stored server-side as a credential and **never sent to the browser** (see [Delivery and security model](#delivery-and-security-model)). |
| **Cinatra instance ID** (optional) | The instance identifier shown in Cinatra | Scopes agent operations to this site. |

The Cinatra URL is validated as a safe HTTPS origin (plain HTTP is accepted only for local hosts such as `http://localhost:3000`), with no path, query, credentials, or fragment. The API key field is treated as a secret: it is stored server-side in `cinatra.settings`, rendered as a password field, and not echoed back into the form — leave it blank on a later edit to keep the current value. Drupal does not encrypt configuration at rest by default; if you need the key encrypted, configure Drupal's encrypted config / secret storage (for example the Key and Encrypt modules) at the site level. The key is never exposed to the browser regardless (see below).

Whichever path you use, once the connection is stored and at least one role holds the `use cinatra assistant` permission, the widget appears on supported pages for those users on the next page load.

---

## Permissions

The module defines one explicit permission, machine name `use cinatra assistant`, shown in the UI as **Use the Cinatra AI assistant**.

This permission is the gate for the assistant. The widget — and the server-side route that exchanges your integration key for a short-lived browser token — load **only** for users who hold it. This is deliberate: an AI editing assistant that can rewrite published content is not something every authenticated account should silently have.

Grant it at **People → Permissions** (`/admin/people/permissions`), in the **Cinatra** section. Recommended assignment:

- Give it to the roles that actually edit content — typically **Content editor**, **Author**, or a bespoke editorial role.
- Do **not** grant it to the *Authenticated user* role unless every signed-in account on your site is a trusted editor. Granting it broadly re-opens the "widget for everyone" behavior the permission exists to prevent.
- Note that Drupal's **Administrator** role bypasses permission checks, so administrators effectively have the assistant available regardless; this permission controls the *non-admin* roles. For least-privilege editorial separation, grant it to the specific editorial roles rather than relying on the admin role.

The permission is marked *restricted* in Drupal (it carries security implications), so Drupal warns when you assign it. That warning is expected.

The same permission gates the module's server-side token-broker route, so a user without it cannot mint a streaming token even by calling the route directly.

---

## What the assistant does

The widget is backed by the `drupal-content-editor` agent on your Cinatra instance — a content-editor-shaped assistant, not a general-purpose Cinatra chat. An editor can:

- **Ask conversationally** — "summarise this node in 50 words", "what tone is this written in?" The assistant reads the current node and answers in the chat panel.
- **Request edits** — "rewrite the lead for small businesses", "add a pricing section". The assistant writes the change and shows a typed diff (field × before × after) of exactly what it changed.
- **Apply batched edits** — "make every heading sentence-case" — as a single write.

The assistant writes to a **new draft revision**. Your published version stays live and untouched while the editor works on the draft; the change appears once they publish from Drupal's normal revisions UI, and Drupal's revision history lets you roll back like any other edit. The widget chat history lives only in the browser session — it is sent to Cinatra for context on each turn but is not persisted there as a separate thread, and it is gone when the editor closes the tab.

For broader Cinatra work (campaigns, research, dashboards) the editor opens the Cinatra workspace itself; the in-Drupal assistant stays focused on editing the node in front of them.

---

## Delivery and security model

This section is the important one for a security or privacy review. The module follows the delivery model inherited from the WordPress plugin: **the widget runs locally and the long-lived credential never reaches the browser.** Three properties hold.

### 1. The widget JavaScript ships locally

The assistant widget is vendored into the module as a local asset (`js/cinatra-widget.js`) and enqueued through Drupal's normal library system. The module does **not** load a remote `<script>` from your Cinatra instance. Your site serves only code that shipped in the module you installed and reviewed — no third-party script injection, and the widget keeps working even if the assistant bundle on the instance changes.

### 2. The Cinatra instance is used only as a versioned data API

The module treats your Cinatra instance purely as a data API behind a versioned contract (the module sends a `contractVersion` on every request; Cinatra validates it and rejects unknown versions with an admin-visible error). There is no remote-code-execution surface: the browser fetches the agent's streamed response, nothing more.

### 3. The long-lived key stays server-side; the browser gets a short-lived, scoped token

This is the core of the model. The long-lived integration key exists in exactly two places — Drupal's `cinatra.settings` config (server-side) and your Cinatra instance's connector config. It is **never** placed in `drupalSettings`, never in client JavaScript, and never sent in a request the browser makes.

When an editor opens the assistant, the flow is:

1. The browser asks the module's own server-side route for a streaming token.
2. That route — running on your Drupal server, gated by the `use cinatra assistant` permission and a CSRF token — reads the long-lived key from config and makes a **server-to-server** request to your Cinatra instance's token endpoint (`/api/agents/drupal-content-editor/token`), authenticating with `Authorization: Bearer <long-lived integration key>`.
3. Cinatra mints a **short-lived, scoped token** — an opaque, high-entropy token (5-minute lifetime) bound to your site's exact origin, to the Drupal content-editor stream endpoint only (its audience), and to that single scope (`drupal-content-editor.stream`) — and returns it.
4. The browser receives only that short-lived token and uses it to stream directly to Cinatra's content-editor stream endpoint with `Authorization: Bearer <token>`.

So the credential a browser ever holds is short-lived (expires in minutes), origin-bound, scope-bound, and useless for anything but this one assistant stream. The token is opaque and tracked server-side on the Cinatra instance — only a hash of it is stored at rest, so a log or database leak never yields a live token — and it can be revoked immediately: rotating the long-lived integration key invalidates every outstanding short-lived token at once, rather than waiting for expiry.

> The module negotiates the instance's capabilities at start-up. Against an instance that does not support the token exchange, the widget does **not** fall back to sending a key from the browser (no long-lived key is ever placed in the browser by design); instead it surfaces a one-line *“this Cinatra instance does not support the local widget — update Cinatra”* notice and does not stream. Upgrade the instance so the token exchange is available and the assistant can run.

### External services and privacy

The module connects your Drupal site to an **external service: your Cinatra instance**, at the URL you configure on the settings form. This must be disclosed to your users and matches the disclosure carried in the module's Drupal.org README.

When an editor uses the assistant:

- **What is sent, and where.** The current node's content and metadata, the editor's chat messages, and the page context are sent to the Cinatra instance at the configured URL so the assistant has the context to answer and edit. Nothing is sent until an editor opens the assistant and types.
- **What credential is used.** A short-lived, origin- and scope-bound token (exchanged server-side from your long-lived integration key, which never leaves your server) — see above.
- **Who operates the instance.** The Cinatra instance is operated by you or your hosting provider, not by a shared third party, unless you have pointed the module at a hosted Cinatra you do not control. Point it only at an instance you trust with your content.
- **Terms and privacy.** The instance's data handling is governed by its operator's terms; for the Cinatra project's stance see the [Cinatra privacy and terms](https://cinatra.ai). Review your instance operator's policy before enabling the module for editors.

This disclosure is the same story the WordPress plugin carries, and matches the disclosure in the module's README on Drupal.org.

---

## Troubleshooting

**The widget button never appears.**
- Confirm the user holds the **`use cinatra assistant`** permission — that is the most common cause after install.
- Confirm you are on a supported surface (node view, node edit form, or the front page) and signed in.
- Confirm the **Cinatra URL** is set on the settings form. With no URL the module attaches nothing.

**The button appears but the panel shows "cannot connect" / the assistant never responds.**
- The module attaches a fallback button whenever the URL is set, so a visible button with a connection error usually means the **integration key is missing or wrong**, or the **instance is unreachable**. Re-check both on the settings form.
- Verify the Cinatra URL is reachable from the browser over HTTPS and that the instance's CORS/origin allowlist includes your site's exact origin (`scheme://host[:port]`).
- If the key was rotated on the Cinatra side, paste the new one into the settings form — the old key (and any tokens minted from it) stop working immediately.

**Cinatra rejects the request with a version error.**
- This is a **contract version mismatch**: the module is newer or older than the instance's supported contract range. Cinatra surfaces an admin-visible error naming the supported versions. Align the two by upgrading the instance (preferred) or the module so their contract versions overlap.

**The widget loads but no diff is applied.**
- The assistant may have answered conversationally rather than editing (it decides per turn). Ask explicitly for an edit ("rewrite…", "add…"). If it still cannot, the agent could not produce a change for that request — try a narrower instruction.

**After an upgrade the old bundle is still loading.**
- The widget ships locally and is versioned with the module; clear Drupal's caches (`drush cr`) so the new library asset is picked up.

For instance-side issues (provider not configured, agent errors), see the [Hosting Guide → Troubleshooting](../hosting/troubleshooting.md).

---

## Uninstall and disconnect

Disconnecting is symmetric to connecting and is safe — your content and audit history are preserved.

**To disconnect without removing the module:** rotate the integration key on the Cinatra side (the Drupal-widget connector settings, `/settings/connectors/drupal-widget`). The old key stops working immediately, every outstanding short-lived token is invalidated, and the widget can no longer reach the instance. Note that blanking the **API key** field in **Manual configuration** does *not* clear the stored key — an empty submit keeps the current value. To stop the widget without uninstalling, clear the **Cinatra URL** (with no URL the module attaches nothing), or remove the stored key with config tooling (`drush cdel cinatra.settings api_key`). Reconnecting later — via **Connect with Cinatra** or a fresh connection string — provisions a new credential and replaces the stored one.

**To remove the module entirely:**

1. Uninstall it from **Extend → Uninstall** (`/admin/modules/uninstall`) or `drush pmu cinatra`. Drupal removes the `cinatra.settings` config, the `use cinatra assistant` permission, and the local widget library.
2. The widget vanishes from editor pages on the next page load.
3. Rotate the integration key in Cinatra so the no-longer-installed site cannot reach the instance even with a copied key.

What stays: existing node revisions the assistant created remain in Drupal's revision history, and the audit trail of content-editor runs remains in Cinatra. Uninstalling the module does not delete content or history.

---

## Where to go next

- The editor-and-overview view of both CMS integrations: [Cinatra in your CMS](../user/cinatra-in-your-cms.md)
- The protocol-level reference for the integration: [Integrating Cinatra with a CMS](../../references/platform/integrating-with-a-cms.md)
- The Drupal connector integration pattern: [Drupal Connector](../../references/platform/drupal-connector.md)
- The shared authorization and audit model: [Permissions](permissions.md) and [Security](../../references/platform/security.md)
