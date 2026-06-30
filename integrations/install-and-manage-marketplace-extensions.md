# Install & manage any marketplace extension

Every Cinatra extension — whether it is a first-party integration, a verified-partner extension, or a community extension — installs, runs, and is removed the same way. This page is that shared flow: install, permissions, trust, updates, and removal. Each [Cinatra Marketplace](https://marketplace.cinatra.ai/) listing links here for the parts that are identical across extensions, and links to its own documentation for the parts that are specific to it.

If you are looking for a first-party integration's own setup, start from its hub in [Cinatra integrations](README.md) instead — those hubs include a complete quick start. This page is the general lifecycle that applies to *anything* you install from the marketplace.

---

## Install

You install an extension from the **Marketplace** area inside Cinatra, under `/configuration/marketplace`. Installing requires the admin permission for managing extensions (see [Permissions](#permissions-who-can-install-and-what-an-extension-can-do)).

1. Open `/configuration/marketplace` in your Cinatra instance.
2. Find the extension — browse the catalogue or search by name. Each listing card shows its name and kind, its ownership label (**Built by Cinatra**, **Verified partner**, or **Community**), a link to its documentation, and — at a glance — a square **icon** in a coloured banner, a **compatibility badge**, and an **install count** (see [Reading a listing card](#reading-a-listing-card)).
3. Read what it does and what it asks for. Open the listing to review its description, the permissions it requests, and its documentation link before installing.
4. Install it. Cinatra fetches the extension at its published version and registers it with your instance.
5. Configure it if it needs configuration. Some extensions need a connection (an API key, a base URL, an account link) before they do anything — the listing and the extension's own docs describe what is required.

Installing an extension does not, by itself, let it act. What an extension can do is governed by the permissions you grant it.

### Reading a listing card

Each marketplace card carries a few signals that help you size up an extension before opening it:

- **Icon and banner.** The card leads with a square icon in a coloured banner. An extension that ships its own artwork shows it; otherwise the icon falls back to the vendor's logo or a built-in icon for the extension's kind, so the card is always legible. The extension's detail view can also carry a wide banner image.
- **Compatibility badge.** A 3-state badge tells you whether the extension fits *this* instance's version of the extension SDK, derived locally on your instance from the range the author declared:
  - **Compatible** — the author declared an SDK range that includes this instance's SDK; it should install and run here.
  - **Incompatible** — built for a different SDK range; the host would refuse it until it is updated.
  - **Unknown** — the author declared no SDK range, so compatibility cannot be confirmed. This is not a deferred check — it just means no range was stated, so the badge cannot read "Compatible". The instance's other install-time checks (permissions, dependencies, trust) still apply.
- **Install count.** A rough count of how many instances have installed it (e.g. "2.1k installations") — a quick popularity signal that may be small or absent for newer extensions.

The badge and count are informational signals to read before installing; see [Trust](#trust-knowing-what-you-are-running) for what an instance still verifies at install time.

---

## Permissions: who can install, and what an extension can do

There are two distinct permission questions, and it helps to keep them separate.

**Who can install and manage extensions.** Installing, updating, and removing extensions is an administrator action, governed by the extension-management permission in your instance. See [Permissions](../guides/admin/permissions.md) for how Cinatra's permission model is administered.

**What an installed extension is allowed to do.** An extension declares the capabilities it needs — for example, reading or writing particular objects, calling out to an external system, or embedding a surface in another tool. Cinatra surfaces those requested capabilities at install time and governs them through the same permission and access model as the rest of the platform. An extension only gets the access you grant it, and that access is auditable.

Review the requested capabilities before you install, and grant the narrowest set that lets the extension do its job.

---

## Trust: knowing what you are running

Cinatra is honest about where an extension comes from, so you can decide how much to trust it.

- **Ownership label.** Every listing carries one of three labels — **Built by Cinatra** (first-party), **Verified partner** (built by a partner Cinatra has reviewed), or **Community** (built by the community). The label tells you who stands behind the extension and where its documentation lives.
- **Source and version.** A listing links to the extension's source and shows the version you are installing. First-party extensions link to their hub in this chapter; partner and community extensions link to the vendor's own README.
- **Declared capabilities.** What an extension can touch is what it declared and what you granted — nothing is implicit.

A higher-trust label is not a guarantee of fitness for your use; it is a statement about provenance and review. Apply the same judgement you would for any software you add to a system that holds your data.

---

## Updates

Extensions are versioned, and updates are explicit — Cinatra does not silently swap a version underneath you.

- Cinatra surfaces when a newer version of an installed extension is available.
- Review what changed (the listing and the extension's docs describe the release) before updating, especially if the new version requests additional capabilities.
- Apply the update from `/configuration/marketplace`. The new version is fetched and registered, replacing the old one for your instance.

If an update requests capabilities the previous version did not, Cinatra surfaces that so you can re-confirm before granting.

---

## Removal

You can remove any installed extension from `/configuration/marketplace`.

- Removing an extension revokes its access and stops it from acting in your instance.
- Removal does not delete data the extension wrote into your system of record (for example, records an integration created in an external CRM remain in that CRM). It removes the *extension*, not the work it did.
- If an extension stored its own configuration (such as a saved connection), removing the extension clears that configuration; reinstalling it later means reconnecting.

After removal, the extension no longer appears as installed and no longer has any granted capability.

---

## Support

Where to get help depends on who owns the extension — which is exactly what the ownership label tells you.

- **Built by Cinatra** — use the integration's hub in [Cinatra integrations](README.md); its Troubleshooting and Advanced & reference sections, and the support link in the listing, point to Cinatra support channels.
- **Verified partner** and **Community** — use the support link in the listing and the vendor's own README. Cinatra surfaces the listing and the trust label, but the partner or community maintainer supports their extension.

For problems with the marketplace itself — browsing, installing, or managing extensions — see the [Marketplace admin guide](../guides/admin/marketplace.md).
