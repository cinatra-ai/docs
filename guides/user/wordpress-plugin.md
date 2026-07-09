# The Cinatra WordPress plugin

Cinatra is the open source AI workspace for teams, and the **Cinatra WordPress plugin** puts a Cinatra-driven AI assistant directly inside `wp-admin`. An administrator installs the plugin, connects it to your Cinatra instance once, and from then on administrators get a floating Cinatra button in the WordPress admin: click it, ask it to tighten a lead, add a section, or fix the metadata, and the changes land on the post you are already editing. (The widget is shown only to users with the `manage_options` capability — typically administrators; see [Permissions](#permissions-who-can-use-it).)

This page is for the people who **install, connect, and use** the WordPress plugin. It covers installing and activating it, connecting it to a Cinatra instance, what the admin assistant does, how the assistant is delivered to the browser and why that is safe, who can use it, how to also give your Cinatra agents tool access to your site, what to do when it does not work, and what happens when you remove it.

For the in-CMS assistant story across both supported CMSes (WordPress and Drupal), see [Cinatra in your CMS](cinatra-in-your-cms.md). For the protocol-level mechanics, see [Integrating Cinatra with a CMS](../../references/platform/integrating-with-a-cms.md).

---

## What the plugin is

The plugin is a small WordPress plugin that does three things:

- **Ships the assistant widget.** The chat widget — the floating button and the panel it opens — is plain JavaScript that ships *inside the plugin itself*. Your browser never downloads executable code from your Cinatra instance; it runs the code that shipped with the plugin you installed. (See [Delivery and security model](#delivery-and-security-model) for why this matters and how it is enforced.)
- **Holds the connection settings.** A **Settings → Cinatra** admin page stores your Cinatra instance URL, the integration credential, your agent instance ID, and an optional webhook secret. The recommended way to fill these in is one-click **Connect with Cinatra** (below) — you never copy or paste a key by hand.
- **Brokers the assistant's calls.** When an authorized administrator uses the assistant, the plugin's own server-side code exchanges your long-lived integration credential for a short-lived, scoped token and hands only that token to the browser. The browser then streams the conversation directly to your Cinatra instance.

The plugin bundles no Cinatra platform code beyond the widget. The assistant's intelligence — reading the post, proposing edits, writing the diff — runs on **your** Cinatra instance, reached over HTTP.

---

## Install and activate

You can install the plugin two ways.

**From the WordPress.org Plugin Directory:**

1. In `wp-admin`, go to **Plugins → Add New**.
2. Search for **Cinatra**.
3. Click **Install Now**, then **Activate**.

**From a zip (self-hosted / pre-release):**

1. Download the plugin zip.
2. In `wp-admin`, go to **Plugins → Add New → Upload Plugin**, choose the zip, and click **Install Now**.
3. Click **Activate**.

   Alternatively, unzip the plugin folder into `wp-content/plugins/cinatra/` and activate it from the **Plugins** screen.

**(Optional) The WordPress MCP Adapter is a separate plugin — and you do not need it for the assistant on this page.** The in-admin assistant reads and edits the post you are working on through the plugin's own secure connection to WordPress (see [Delivery and security model](#delivery-and-security-model)), not through the adapter. The adapter is for a different, broader job: letting your Cinatra **agents** use your WordPress site as a set of tools. If you want that, see [Give your Cinatra agents access to your WordPress site](#give-your-cinatra-agents-access-to-your-wordpress-site); otherwise you can skip it.

Activating the plugin does not turn anything on by itself — the assistant does not appear until you connect it to a Cinatra instance, below.

---

## Connect to a Cinatra instance

The plugin needs to know which Cinatra instance to talk to and how to authenticate. You configure this once, as an administrator. The recommended path is one-click **Connect with Cinatra** — you enter only the instance URL and approve a consent screen; the integration credential is provisioned automatically and stored on your server, so you never copy or paste a key.

### Recommended: one-click "Connect with Cinatra"

1. In `wp-admin`, go to **Settings → Cinatra** (`options-general.php?page=cinatra`).
2. In the **Connect to Cinatra** card at the top, enter your **Cinatra instance URL** (for example `https://app.cinatra.ai`) and click **Connect with Cinatra**.
3. You are redirected to Cinatra to approve the connection. Sign in as an org administrator if prompted, then approve the consent screen ("Allow this WordPress site to connect?").
4. Cinatra redirects you back to WordPress, which completes the exchange **server-side** and stores the credential. You see a "Connected to Cinatra" confirmation on the settings page.

No key is ever copied, pasted, or exposed to the browser — the credential is provisioned and held server-side. (Under the hood: WordPress sends an authorization-code request with PKCE, then exchanges the returned code for the credential server-to-server. If you reconnect later, the stored credential is replaced.)

**No browser redirect available?** Some environments cannot complete the redirect (for example, a locked-down admin network). In that case, in Cinatra generate a one-time **connection string**, then on the settings page expand **"No browser redirect? Use a connection string instead"**, paste the string, and click **Connect with code**. WordPress exchanges it server-side just like the redirect flow.

### Advanced: manual configuration

The settings page also has an **Advanced / manual configuration** section for environments where you set the connection by hand. Most sites should use **Connect** above and can ignore these fields.

| Field | What it is | Example |
|---|---|---|
| **Cinatra URL** | The base URL of your Cinatra instance — the address you visit to use Cinatra. | `https://app.cinatra.ai` |
| **API Key** | The long-lived integration credential. The plugin keeps this server-side and never sends it to the browser. For security it is **never pre-filled** into the form — the field shows "(stored — leave blank to keep)" when a value is already saved, and **leaving it blank keeps the stored value**. | (a long opaque string) |
| **Agent Instance ID** | The identifier of the configured WordPress instance on the Cinatra side, so Cinatra knows which site is calling. | `wp-prod` |
| **Webhook Secret** | A shared secret stored here and on your Cinatra instance. Cinatra uses it **on its own side** to sign requests; this plugin only stores the value and a subscription registry — it does **not** receive or verify inbound signed webhooks. Optional. Like the API Key, it is never pre-filled and blank means "keep the stored value". | (a long opaque string) |

To generate manual credentials, open the WordPress widget connector page in Cinatra — `/settings/connectors/wordpress-widget` — copy the values into the matching fields, and click **Save Changes**. Treat the integration credential like a password.

### Confirm it connected

Reload an admin page. If everything is wired up, you see the floating Cinatra button in the bottom-right corner of `wp-admin`. Open it and send a message — if the assistant responds, you are connected. If the button does not appear or the chat errors, see [Troubleshooting](#troubleshooting).

---

## The admin assistant

Once connected, administrators see a floating Cinatra button in the WordPress admin. Click it and a chat panel opens. The assistant is **content-editor-shaped**: it reads the post you are working on and helps you write and revise it. From the panel you can:

- **Ask conversationally.** "Summarise this post in 50 words." "What tone is this written in?" The assistant reads the current post and answers in chat.
- **Request edits.** "Rewrite the lead to focus on small businesses." "Add a section on pricing." The assistant writes the change and shows you a typed diff — field × before × after — of what it changed. The post then reloads so the new content renders.
- **Apply across the document.** "Make every heading sentence-case." "Shorten every quote by half." The assistant works through the post and writes a single batched edit.

The assistant writes to a **draft** of the current post. While it applies edits, the post status switches to `draft`, which means the public front-end shows the last published version (or a 404 if the post was never published) until you republish from the WordPress editor. WordPress keeps the previous revision in its normal history, so you can roll back from the WordPress revisions UI at any time.

Editing the post you are working on needs **no** extra plugin. The assistant reads the current post and writes its changes back through the plugin's own secure connection to WordPress — the short-lived token handshake described under [Delivery and security model](#delivery-and-security-model), which calls WordPress's own REST API. The separate **WordPress MCP Adapter** is **not** required for this in-admin editing; it is only for giving your Cinatra agents broader tool access to your site (see [Give your Cinatra agents access to your WordPress site](#give-your-cinatra-agents-access-to-your-wordpress-site)).

It is not a general-purpose Cinatra assistant — it edits WordPress content. For broader Cinatra work (research, outreach campaigns, dashboards), open the Cinatra workspace itself. See [Cinatra in your CMS](cinatra-in-your-cms.md) for the full editor walkthrough and how WordPress and Drupal differ.

### What stays inside WordPress

- **The chat history** lives only in your browser's session for the current page. It is sent to your Cinatra instance with each message so the assistant has context, but it is not stored on the Cinatra side as a separate chat thread. Close the tab and it is gone.
- **Field reads** happen at edit time against WordPress's normal authenticated REST API.
- **The audit trail.** Every content-editor run on Cinatra writes an audit record, so your administrators can see who edited what, when, in the Cinatra run history.

---

## Give your Cinatra agents access to your WordPress site

Everything above is the **in-admin assistant** — the floating button that edits the post you are on. It works on its own and needs no extra plugin.

Cinatra can also do something broader: let your **Cinatra agents** use your WordPress site as a set of tools, so an agent running anywhere in Cinatra — inside a workflow, a chat, or an autonomous task — can read and edit your WordPress content as part of a larger job, not only from the in-admin panel. This is **separate** from the in-admin assistant, and it needs one more plugin.

**This capability requires the WordPress MCP Adapter.** The adapter is a companion WordPress plugin that exposes your site's content tools so Cinatra can call them. Without it, your agents cannot reach into WordPress this way. (The in-admin assistant on this page is unaffected either way — it never uses the adapter.)

To turn it on:

1. **Install the WordPress MCP Adapter on the site.** The adapter is distributed on its GitHub releases page, not the WordPress.org Plugin Directory, so download the latest release ZIP and install it in `wp-admin` under **Plugins → Add New → Upload Plugin**, then click **Activate** — the same way you would install any plugin from a ZIP.
2. **Make sure the site is reachable at a public URL.** Cinatra's agents connect to your site over the internet, so a site that is only reachable locally or on a private network cannot be used this way. Put it on a public address (or expose it through a public tunnel) if it is not already.
3. **Confirm it is detected.** In Cinatra, the WordPress connector's settings page shows an adapter status for each connected site. Once the adapter is active and the site is reachable, it reads as detected and your agents can use the site's tools automatically.

If you only use the in-admin assistant, you can ignore this section entirely — none of it is needed to edit the post you are working on.

---

## Delivery and security model

This section is the user-facing privacy story for the plugin — it is the "External Services" disclosure in plain terms. The design exists to satisfy two requirements at once: keep your integration key out of the browser, and never run remote code in `wp-admin`.

### The widget ships locally; the instance is a data API

The assistant widget — the button and the chat panel — is JavaScript that **ships inside the plugin**. When you load `wp-admin`, WordPress serves that widget from your own site, exactly like any other plugin asset. Your browser does **not** fetch executable JavaScript from your Cinatra instance. Your Cinatra instance is used only as a **versioned data API**: the widget sends chat messages to it and streams the assistant's reply back. (Loading executable code from an admin-supplied, per-customer origin into `wp-admin` is exactly the pattern the WordPress.org Plugin Directory rejects; shipping the widget locally is what makes the plugin acceptable.)

### Your integration key never reaches the browser

The long-lived integration credential — whether it was provisioned by **Connect with Cinatra** or entered manually in **Settings → Cinatra** — is held **server-side** in WordPress (`wp_options`). It is **never** placed in any JavaScript variable, never sent to the browser, and never visible in a browser network request. It exists in exactly two places: your WordPress site's options, and your Cinatra instance's configuration. It travels only **server-to-server** — from WordPress's backend to Cinatra's token endpoint.

### The browser gets only a short-lived, scoped token

When an authorized administrator opens the assistant, this is what happens:

1. The widget asks the **plugin's own REST route** on your WordPress site for a token. (This route is permission- and nonce-protected — only a logged-in administrator can call it.)
2. The plugin's server-side code, holding your integration key, makes a **server-to-server** request to your Cinatra instance's token endpoint, passing the key and the site's origin.
3. Cinatra verifies the key, confirms the origin is a configured instance, and returns a **short-lived, single-purpose token** — valid for about **five minutes**, bound to your site's origin, and scoped to a single audience and capability: the `wordpress-content-editor` content-editor *stream* of this one agent (and nothing else). It cannot do anything else and it expires quickly.
4. The browser receives **only that short-lived token** and uses it to stream the conversation directly to your Cinatra instance.

Cinatra stores only a one-way **SHA-256 hash** of each issued token, never the token itself — so even a leak of Cinatra's own database or logs cannot yield a usable token. And because the token is bound to your origin, scoped to one stream, and expires in minutes, a leaked token is far less dangerous than a leaked long-lived key — rotating the integration key in Cinatra invalidates all outstanding short-lived tokens immediately.

### What is sent where

- **To your Cinatra instance (the URL you configured):** the message you type, the chat history for the current session, and the content/context of the post you are editing, so the assistant can read and revise it. The plugin's backend also sends your integration key to the instance's token endpoint server-to-server (never from the browser).
- **From your Cinatra instance back to your WordPress site:** if you use Cinatra-side workflows that send webhooks, Cinatra signs them with the shared webhook secret on its own side. Note that **this plugin does not itself receive or verify inbound signed webhooks** — it only stores the shared secret and a subscription registry; verification, if any, happens wherever the webhook is actually handled.
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
- The stored integration credential may be wrong, blank, or rotated. The simplest fix is to **Connect with Cinatra** again from Settings → Cinatra (it re-provisions and replaces the stored credential). Alternatively, regenerate the credential in Cinatra at `/settings/connectors/wordpress-widget`, paste it into the **API Key** field in the Advanced section, and save. (Rotating the credential in Cinatra immediately stops the old one — and any short-lived tokens minted from it — from working.)
- Confirm the **Agent Instance ID** matches a configured WordPress instance in Cinatra.

**A "deprecated" or "update required" notice appears.**
- This means your WordPress site and your Cinatra instance disagree on the integration's version/contract — usually because one was upgraded and the other was not. Update the plugin (or ask your administrator to update the Cinatra instance) so both are on the same version. The assistant keeps working in a compatible mode where it can, but some affordances (such as applying changes) may be hidden until both sides match.

**Edits don't seem to apply / the assistant can read but not write.**
- This is **not** the MCP Adapter — the in-admin assistant does not use it to edit. The usual cause is the WordPress connection itself: the stored integration credential is wrong, blank, or was rotated, or the account it uses does not have permission to edit that post. **Connect with Cinatra** again from **Settings → Cinatra** (or re-check the credential in Cinatra at `/settings/connectors/wordpress-widget`), and confirm the account has rights to edit the post in WordPress.
- If a "deprecated" or "update required" notice is showing, the apply action can be hidden until your plugin and Cinatra instance are on matching versions — see the notice entry above.

**Your Cinatra agents can't use your WordPress site as a tool.**
- This is the case that needs the **WordPress MCP Adapter**. Confirm the adapter plugin is installed and active on the site, and that the site is reachable at a **public** URL — agents cannot reach a local or private address. The WordPress connector's settings page in Cinatra shows whether the adapter is detected. See [Give your Cinatra agents access to your WordPress site](#give-your-cinatra-agents-access-to-your-wordpress-site).

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
