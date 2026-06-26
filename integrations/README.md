# Cinatra integrations

Cinatra is the open source AI workspace for teams, and it is designed to work *inside* the tools you already run — your CMS, your CRM, your project board — rather than asking you to move your work into Cinatra. An **integration** connects Cinatra to one of those external systems so that agents can read and write records there, embed an AI assistant in that system's own screens, or mirror Cinatra's work onto that system's board.

This chapter is the hub for Cinatra's **first-party integrations** — the ones the Cinatra team builds, supports, and ships as marketplace extensions. Each first-party integration has its own curated hub here, with a complete setup path you can finish without leaving the page. For everything else — extensions built by partners and the community — the [Cinatra Marketplace](https://marketplace.cinatra.ai/) is the home, and the shared [Install & manage any marketplace extension](install-and-manage-marketplace-extensions.md) page covers the install, trust, update, and removal flow that applies to *every* listing.

---

## First-party integration hubs

These integrations are built and supported by Cinatra. Each hub follows the same six-part shape — Overview, Quick start, Use it, Settings & permissions, Troubleshooting, and Advanced & reference — so you always know where to look.

- **WordPress** — `/integrations/wordpress/` — embed a Cinatra AI editing assistant inside `wp-admin`, so authors can tighten a lead, add a section, or fix metadata on the post they are already editing.
- **Drupal** — `/integrations/drupal/` — the same in-CMS editing assistant for Drupal sites, delivered as a first-party Drupal module.
- **Twenty** — `/integrations/twenty/` — connect Cinatra to Twenty, the open source CRM, so agents read and write People, Companies, Opportunities, and custom objects against your system of record.
- **Plane** — `/integrations/plane/` — mirror Cinatra's scheduled and ad-hoc agent runs into Plane as work items, so a run shows up on your project board, calendar, and timeline.

> [!NOTE]
> Each hub is published from its integration's own source repository at that integration's latest released version. A hub appears here once its integration has cut a release; until then, use the marketplace listing.

---

## Everything else: the marketplace

First-party hubs are a small, curated set. The full catalogue of Cinatra extensions — including partner-built and community-built integrations — lives in the [Cinatra Marketplace](https://marketplace.cinatra.ai/). Cinatra does not duplicate vendor documentation here: a marketplace listing links to the vendor's own README for what the extension does, and to the shared [Install & manage any marketplace extension](install-and-manage-marketplace-extensions.md) page for the parts that are the same for everything you install — installing, granting permissions, understanding the trust model, updating, and removing.

Marketplace listings carry an ownership label so you always know who stands behind an extension:

- **Built by Cinatra** — a first-party extension (the integrations above). Its docs home is this chapter.
- **Verified partner** — built by a partner Cinatra has reviewed. Its docs home is the vendor README linked from the listing.
- **Community** — built by the community. Its docs home is the vendor README linked from the listing.

---

## For integration authors

Building a first-party integration hub? The pages here follow a written **docs contract**: a fixed six-page shape plus required frontmatter, authored in the integration's own repository under `docs/` and compiled into this chapter at release time. The contract — what files are required, what frontmatter each page must carry, the link and trust rules — is documented in [The integration docs contract](../references/platform/integration-docs-contract.md). The contract is enforced automatically by a validator that runs in each integration repository's CI before a release can publish.
