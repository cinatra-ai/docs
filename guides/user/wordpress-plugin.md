# The Cinatra WordPress plugin

Cinatra is the open source AI workspace for teams, and the **Cinatra WordPress plugin** puts a Cinatra-driven AI assistant directly inside `wp-admin`. An administrator installs the plugin, connects it to your Cinatra instance once, and from then on administrators get a floating Cinatra button in the WordPress admin: click it, ask it to tighten a lead, add a section, or fix the metadata, and the changes land on the post you are already editing. (The widget is shown only to users with the `manage_options` capability — typically administrators; see [Permissions](#permissions-who-can-use-it).)

This page is for the people who **install, connect, and use** the WordPress plugin. It covers installing and activating it, connecting it to a Cinatra instance, what the admin assistant does, how the assistant is delivered to the browser and why that is safe, who can use it, what to do when it does not work, and what happens when you remove it.

For the in-CMS assistant story across both supported CMSes (WordPress and Drupal), see [Cinatra in your CMS](cinatra-in-your-cms.md). For the protocol-level mechanics, see [Integrating Cinatra with a CMS](../../references/platform/integrating-with-a-cms.md).

---

## What the plugin is

The plugin is a small WordPress plugin that does three things:

- **Ships the assistant widget.** The chat widget — the floating button and the panel it opens — is plain JavaScript that ships *inside the plugin itself*. Your browser never downloads executable code from your Cinatra instance; it runs the code that shipped with the plugin you installed. (See [Delivery and security model](#delivery-and-security-model) for why this matters and how it is enforced.)
- **Holds the connection settings.** A **Settings → Cinatra** admin page stores your Cinatra instance URL, the integration key, your agent instance ID, and an optional webhook secret.
- **Brokers the assistant's calls.** When an authorized administrator uses the assistant, the plugin's own server-side code exchanges your long-lived integration key for a short-lived, scoped token and hands only that token to the browser. The browser then streams the conversation directly to your Cinatra instance.

The plugin bundles no Cinatra platform code beyond the widget. The assistant's intelligence — reading the post, proposing edits, writing the diff — runs on **your** Cinatra instance, reached over HTTP.

---

## Install and activate

You can install the plugin two ways.

**From the WordPress.org Plugin Directory (once published):**

1. In `wp-admin`, go to **Plugins → Add New**.
2. Search for **Cinatra**.
3. Click **Install Now**, then **Activate**.

**From a zip (self-hosted / pre-release):**

1. Download the plugin zip.
2. In `wp-admin`, go to **Plugins → Add New → Upload Plugin**, choose the zip, and click **Install Now**.
3. Click **Activate**.

   Alternatively, unzip the plugin folder into `wp-content/plugins/cinatra/` and activate it from the **Plugins** screen.

**(Recommended) Install the WordPress MCP Adapter plugin** as well. The Cinatra assistant edits your posts by calling back into the WordPress REST API; the MCP Adapter gives Cinatra tool access to your site. The plugin shows an admin notice prompting you if it is not present. The assistant chat works without it, but the editing tools the assistant relies on need it.

Activating the plugin does not turn anything on by itself — the assistant does not appear until you connect it to a Cinatra instance, below.

---

## Connect to a Cinatra instance

The plugin needs to know which Cinatra instance to talk to and how to authenticate. You configure this once, as an administrator.

### 1. Generate the integration credentials in Cinatra

In your Cinatra instance, open the WordPress widget connector setup page — `/settings/connectors/wordpress-widget` (your administrator can also reach it from the connectors admin area). Generate the widget credentials. Cinatra returns:

- An **integration key** (sometimes shown as the API key) — the long-lived credential that authorises this WordPress site to use the assistant.
- A **webhook secret** — used to sign the requests Cinatra sends *back* to your site (for example, a notification that a Cinatra-side publish completed).

Keep these values handy; you paste them into WordPress next. Treat the integration key like a password.

### 2. Fill in Settings → Cinatra

In `wp-admin`, go to **Settings → Cinatra** (`options-general.php?page=cinatra`). The page has four fields:

| Field | What it is | Example |
|---|---|---|
| **Cinatra URL** | The base URL of your Cinatra instance — the address you visit to use Cinatra. | `https://app.cinatra.ai` |
| **API Key** | The integration key you generated in step 1. The plugin keeps this server-side and never sends it to the browser. | (a long opaque string) |
| **Agent Instance ID** | The identifier of the configured WordPress instance on the Cinatra side, so Cinatra knows which site is calling. | `wp-prod` |
| **Webhook Secret** | The HMAC secret Cinatra signs its inbound requests with (the `X-Cinatra-Sig-256` header). Optional unless you use Cinatra-side workflows that notify this site. | (a long opaque string) |

Click **Save Changes**. The credential paths shown in the field descriptions update to point at your Cinatra URL once you fill it in.

### 3. Confirm it connected

Reload an admin page. If everything is wired up, you see the floating Cinatra button in the bottom-right corner of `wp-admin`. Open it and send a message — if the assistant responds, you are connected. If the button does not appear or the chat errors, see [Troubleshooting](#troubleshooting).

---

## The admin assistant

Once connected, administrators see a floating Cinatra button in the WordPress admin. Click it and a chat panel opens. The assistant is **content-editor-shaped**: it reads the post you are working on and helps you write and revise it. From the panel you can:

- **Ask conversationally.** "Summarise this post in 50 words." "What tone is this written in?" The assistant reads the current post and answers in chat.
- **Request edits.** "Rewrite the lead to focus on small businesses." "Add a section on pricing." The assistant writes the change and shows you a typed diff — field × before × after — of what it changed. The post then reloads so the new content renders.
- **Apply across the document.** "Make every heading sentence-case." "Shorten every quote by half." The assistant works through the post and writes a single batched edit.

The assistant writes to a **draft** of the current post. While it applies edits, the post status switches to `draft`, which means the public front-end shows the last published version (or a 404 if the post was never published) until you republish from the WordPress editor. WordPress keeps the previous revision in its normal history, so you can roll back from the WordPress revisions UI at any time.

Writing back to your posts depends on the **WordPress MCP Adapter** plugin being installed and active (see [Install and activate](#install-and-activate)). Without it, the assistant can still chat and read the current post, but it cannot apply edits.

It is not a general-purpose Cinatra assistant — it edits WordPress content. For broader Cinatra work (research, outreach campaigns, dashboards), open the Cinatra workspace itself. See [Cinatra in your CMS](cinatra-in-your-cms.md) for the full editor walkthrough and how WordPress and Drupal differ.

### What stays inside WordPress

- **The chat history** lives only in your browser's session for the current page. It is sent to your Cinatra instance with each message so the assistant has context, but it is not stored on the Cinatra side as a separate chat thread. Close the tab and it is gone.
- **Field reads** happen at edit time against WordPress's normal authenticated REST API.
- **The audit trail.** Every content-editor run on Cinatra writes an audit record, so your administrators can see who edited what, when, in the Cinatra run history.

---

## Delivery and security model

This section is the user-facing privacy story for the plugin — it is the "External Services" disclosure in plain terms. The design exists to satisfy two requirements at once: keep your integration key out of the browser, and never run remote code in `wp-admin`.

### The widget ships locally; the instance is a data API

The assistant widget — the button and the chat panel — is JavaScript that **ships inside the plugin**. When you load `wp-admin`, WordPress serves that widget from your own site, exactly like any other plugin asset. Your browser does **not** fetch executable JavaScript from your Cinatra instance. Your Cinatra instance is used only as a **versioned data API**: the widget sends chat messages to it and streams the assistant's reply back. (Loading executable code from an admin-supplied, per-customer origin into `wp-admin` is exactly the pattern the WordPress.org Plugin Directory rejects; shipping the widget locally is what makes the plugin acceptable.)

### Your integration key never reaches the browser

The long-lived integration key you pasted into **Settings → Cinatra** is held **server-side** in WordPress (`wp_options`). It is **never** placed in any JavaScript variable, never sent to the browser, and never visible in a browser network request. It exists in exactly two places: your WordPress site's options, and your Cinatra instance's configuration. It travels only **server-to-server** — from WordPress's backend to Cinatra's token endpoint.

### The browser gets only a short-lived, scoped token

When an authorized administrator opens the assistant, this is what happens:

1. The widget asks the **plugin's own REST route** on your WordPress site for a token. (This route is permission- and nonce-protected — only a logged-in administrator can call it.)
2. The plugin's server-side code, holding your integration key, makes a **server-to-server** request to your Cinatra instance's token endpoint, passing the key and the site's origin.
3. Cinatra verifies the key, confirms the origin is a configured instance, and returns a **short-lived, single-purpose token** — valid for about **five minutes**, bound to your site's origin, and scoped to a single audience and capability: the `wordpress-content-editor` content-editor *stream* of this one agent (and nothing else). It cannot do anything else and it expires quickly.
4. The browser receives **only that short-lived token** and uses it to stream the conversation directly to your Cinatra instance.

Cinatra stores only a one-way **SHA-256 hash** of each issued token, never the token itself — so even a leak of Cinatra's own database or logs cannot yield a usable token. And because the token is bound to your origin, scoped to one stream, and expires in minutes, a leaked token is far less dangerous than a leaked long-lived key — rotating the integration key in Cinatra invalidates all outstanding short-lived tokens immediately.

### What is sent where

- **To your Cinatra instance (the URL you configured):** the message you type, the chat history for the current session, and the content/context of the post you are editing, so the assistant can read and revise it. The plugin's backend also sends your integration key to the instance's token endpoint server-to-server (never from the browser).
- **From your Cinatra instance back to your WordPress site:** webhook notifications (if you use Cinatra-side workflows that notify the site), signed with the webhook secret so your site can verify they are genuine.
- **Nowhere else.** The plugin contacts only the Cinatra instance you configured. It does not phone home to any fixed vendor domain.

The Cinatra instance is operated by you (or whoever hosts your Cinatra deployment). Your data is processed there under that deployment's terms; see your Cinatra deployment's privacy terms for how it handles content. This matches the **External services** disclosure in the plugin's `readme.txt` on WordPress.org.

---

## Permissions: who can use it

The assistant is **not** loaded for everyone. The widget appears only in the WordPress admin (`wp-admin`), and only for users with the `manage_options` capability — typically administrators. It is **not** loaded on the public front-end and is **not** shown to lower-privileged editors or to anonymous visitors.

The plugin's token route enforces the same gate: only a logged-in administrator (with a valid WordPress nonce) can obtain a token, so a lower-privileged user or an anonymous request cannot mint one.

If your team needs the assistant available to a different set of users or on different pages, that is a plugin-side capability change, not a Cinatra-side setting.

The integration key's scope is also narrow on the Cinatra side: it authorises the widget surface for this one configured instance only. It cannot run arbitrary Cinatra primitives or read content the configured WordPress site shouldn't see.

---

## Troubleshooting

**The Cinatra button never appears.**
- Confirm the plugin is **activated** (Plugins screen).
- Confirm you are logged in as a user with the `manage_options` capability and you are on a `wp-admin` page (the widget never loads on the public site or for lower-privileged users).
- Confirm **Settings → Cinatra** has a Cinatra URL and an API key saved.

**The button appears but the chat errors immediately ("instance unreachable").**
- Check the **Cinatra URL** is correct, reachable from the browser, and served over HTTPS.
- Confirm your Cinatra instance is up and that this WordPress site's origin is configured as a WordPress instance on the Cinatra side.

**"Unauthorized" / the assistant refuses to start.**
- The **API Key** in Settings → Cinatra may be wrong, blank, or rotated. Regenerate it in Cinatra at `/settings/connectors/wordpress-widget`, paste the new value, and save. (Rotating the key in Cinatra immediately stops the old one — and any short-lived tokens minted from it — from working.)
- Confirm the **Agent Instance ID** matches a configured WordPress instance in Cinatra.

**A "deprecated" or "update required" notice appears.**
- This means your WordPress site and your Cinatra instance disagree on the integration's version/contract — usually because one was upgraded and the other was not. Update the plugin (or ask your administrator to update the Cinatra instance) so both are on the same version. The assistant keeps working in a compatible mode where it can, but some affordances (such as applying changes) may be hidden until both sides match.

**Edits don't seem to apply / the assistant can read but not write.**
- Install and activate the **WordPress MCP Adapter** plugin (see [Install and activate](#install-and-activate)). The assistant needs it to write back to your posts.

If a problem persists, your administrator can check the Cinatra run history (every content-editor run is recorded) to see whether the request reached the instance and how it failed.

---

## Uninstall

Removing the plugin is the clean inverse of installing it:

1. **(Recommended) Rotate the integration key on the Cinatra side first** — at `/settings/connectors/wordpress-widget`. The old key stops working immediately, so even a cached copy can no longer reach your instance.
2. **Deactivate and delete** the plugin from the **Plugins** screen in `wp-admin`.

When the plugin is deleted, its uninstall routine removes the settings it stored (the Cinatra URL, the integration key, the instance ID, the webhook secret, and any webhook subscriptions) from `wp_options`. The floating button vanishes from `wp-admin` on the next reload.

Your existing content is untouched: posts and their WordPress revision history stay exactly as they were, and the audit trail of past assistant runs remains in your Cinatra instance.

---

## Where to go next

- The cross-CMS editor and admin story: [Cinatra in your CMS](cinatra-in-your-cms.md)
- How the assistant pauses for review before writing: [Human-in-the-loop by design](human-in-the-loop.md)
- Roll back an edit you didn't want: [Undo and history](undo-and-history.md)
- The protocol-level reference for the integration: [Integrating Cinatra with a CMS](../../references/platform/integrating-with-a-cms.md)
