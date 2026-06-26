# The integration docs contract

A first-party integration's documentation hub on docs.cinatra.ai — for example `/integrations/wordpress/` — is not authored in this repository. It is authored in the integration's **own** source repository under a `docs/` directory, and compiled into the [Cinatra integrations](../../integrations/README.md) chapter at the integration's latest released version.

This page is the written contract every such `docs/` directory must follow: the required pages, the required frontmatter, the content and link rules, and how the contract is enforced. It is the human-readable twin of the executable validator that runs in each integration repository's CI before a release can publish. Where this page and the validator could appear to disagree, the validator is authoritative — but they are written to say the same thing.

This contract applies to **first-party** integrations only. Partner and community extensions are documented in the vendor's own README, linked from the marketplace listing; they do not compile into this chapter and do not follow this contract.

---

## Why a contract

Integration docs live in the integration's repository so they version and ship with the code they describe, and so the team that owns the integration owns its docs. But that content then crosses from an integration repository into the trusted docs.cinatra.ai build. A fixed shape and a strict, machine-checked contract are what make that safe and consistent:

- **Consistent for readers** — every hub has the same six-part shape, so a reader always knows where to find the quick start or the troubleshooting steps.
- **Safe for the build** — the contract restricts content to Markdown and static assets with no executable surface, so untrusted-repository content cannot run code in the trusted build.
- **Stable for links** — fixed slugs and canonical URLs mean integration READMEs and marketplace listings can link to a hub without those links breaking across releases.

---

## Required pages

Every integration `docs/` directory must contain exactly these six pages, with these filenames:

| File | Page | Purpose |
|------|------|---------|
| `overview.md` | Overview | What the integration is, who it is for, and what it lets you do. |
| `quick-start.md` | Quick start | A complete, self-contained setup path. |
| `use-it.md` | Use it | What you do with the integration day to day, once it is set up. |
| `settings-and-permissions.md` | Settings & permissions | Configuration options, the permissions/trust model, and who can do what. |
| `troubleshooting.md` | Troubleshooting | Structured problem-solving (see the structured-troubleshooting rule below). |
| `advanced-and-reference.md` | Advanced & reference | Deeper material, and **absolute** links out to Guides/References — never duplication. |

The pages render in this order, controlled by each page's `navOrder` frontmatter.

**The quick start must be complete.** A reader must be able to finish setup using `quick-start.md` alone, without leaving the page to assemble steps from elsewhere. Link out for *deeper* material, not for *required* steps.

---

## Required frontmatter

Every one of the six pages must carry this frontmatter. All keys are required on every page.

| Key | What it is |
|-----|------------|
| `slug` | The integration's canonical slug. Must equal the registry slug (e.g. `wordpress`). Identical on all six pages. |
| `title` | The page title as shown in the hub. |
| `description` | A one-line description for search and social previews. |
| `navOrder` | The page's position within the hub (Overview first, Advanced & reference last). |
| `tier` | Must be `first-party`. Only first-party integrations compile into this chapter. |
| `lifecycle` | One of `draft`, `active`, `deprecated`, `retired`. Only `active` renders. |
| `cinatraCompat` | The range of Cinatra versions this integration is compatible with. |
| `integrationVersion` | The integration's released version/tag this documentation describes. |
| `sourceRepo` | The integration's source repository (e.g. `cinatra-ai/wordpress-plugin`). |
| `supportUrl` | Where a reader gets help for this integration. |
| `marketplaceUrl` | The integration's marketplace listing. |

### The registry overrides the frontmatter

The Integrations registry — the operational source of truth for which integrations publish, at what slug, tier, and lifecycle — is authoritative for the values it owns. For the keys the registry also defines (`slug`, `tier`, `lifecycle`, `sourceRepo`), the registry value wins: the compile validates the frontmatter against the registry and rejects content whose frontmatter drifts from it. Keep these values in sync with the registry rather than relying on the frontmatter alone.

### Latest version only, for now

The chapter publishes the **latest released version** of each integration. The `integrationVersion`, `cinatraCompat`, and related keys are required now so the metadata is version-ready: this lets multiple versions be offered later without re-authoring, but today exactly one version (the latest released) is rendered per integration.

---

## Content rules

### Markdown and static assets only

Pages are **Markdown only**. MDX, custom components, arbitrary imports, and any other executable or build-time-code surface are **not allowed** for the current version of the contract. This is a hard rule: content crosses from an integration repository into the trusted docs build, and the build must never execute integration-repository code.

Static assets (images and similar) are allowed under the rules below. No other content types are compiled.

### Assets are namespaced per integration

An integration's assets must be namespaced under the integration's own path — `/integrations/{slug}/...` — so that two integrations cannot collide on a shared asset filename when their content is flattened into the published site. Assets follow the path and size limits the validator enforces, and use stable filenames so asset URLs do not churn across releases.

### Stable filenames and URLs

The six page filenames are fixed, the slug is fixed, and asset filenames must be stable. The canonical URL for a hub is `/integrations/{slug}/` and the per-page URLs derive from it. Integration READMEs and marketplace listings link to these canonical URLs — never to release-specific URLs.

---

## Link policy

- **Inside an integration's own docs**, use **relative** links between the six pages.
- **Out to Guides and References** (cross-cutting Cinatra material that is not specific to one integration), use **absolute canonical** links to docs.cinatra.ai. Do not duplicate Guides/References material into a hub — link to it. The Advanced & reference page is the natural home for these outbound links.
- Links must not reach into private or non-public repositories. The compile runs without access to private repositories, and a link that depends on such access will fail the link check.

---

## Required sections

Two sections are mandatory in addition to the six-page shape:

**Permissions and trust.** Every hub must state, in `settings-and-permissions.md`, what permissions the integration requires and what its trust model is — what the integration can access, how that access is granted, and how it is governed. Readers must be able to understand what they are letting the integration do before they enable it.

**Structured troubleshooting.** `troubleshooting.md` must present problems in a structured form so a reader can self-serve: for each problem, give the **symptoms** (what the reader sees), the **cause** (why it happens), the **fix** (what to do), the **diagnostics** (how to confirm the cause and verify the fix), and the **escalation** path (where to go if the fix does not work).

---

## Per-page footer metadata

Each rendered hub page shows a footer derived from the frontmatter and the compile, so a reader always knows exactly what they are looking at:

- the integration version/tag the page documents (`integrationVersion`),
- the Cinatra compatibility range (`cinatraCompat`),
- the host-product compatibility — the version range of the external system the integration supports, stated in the page body (typically in Settings & permissions or Advanced & reference); the contract does not define a separate frontmatter key for it,
- the date the page was generated,
- a link to the source repository / release (`sourceRepo`).

---

## How the contract is enforced

The contract is checked by an executable validator that runs in **each integration repository's CI**, before a release can publish documentation into this chapter. The validator checks the six-page set, the required frontmatter and its allowed values, that `slug` matches the registry, the Markdown-and-static-assets-only rule, the link policy, and the asset path/size rules. A `docs/` directory that fails the validator does not publish; the chapter keeps the integration's last-good documentation rather than publishing broken or unsafe content.

Because the validator is the gate that protects the trusted build, this contract and that validator are kept in agreement deliberately. If you are authoring or changing an integration's `docs/`, run the validator locally before you tag a release.

---

## See also

- [Cinatra integrations](../../integrations/README.md) — the chapter this content compiles into.
- [Install & manage any marketplace extension](../../integrations/install-and-manage-marketplace-extensions.md) — the shared lifecycle every listing links.
- [Authoring connector extensions](extension-kinds/authoring-connector-extensions.md) — how to build the connector behind an integration.
