# Cinatra Documentation

Cinatra is the open source AI workspace for teams, built on [open AI standards](references/platform/open-standards.md) — a workspace where people, AI assistants, and autonomous agents work together on durable workflows.

> [!WARNING]
> **Cinatra is not production ready. We strongly recommend you do not use it in production.**
> It is under active development and has not been hardened, security-audited, or stability-tested for production workloads. Run it for evaluation, local development, and self-hosted experimentation only.

---

## New here?

Run your first agent with the [Quickstart](guides/hosting/quickstart.md), or read [Why Cinatra](resources/why-cinatra.md) for what the platform unlocks.

---

## Docs by audience

| You are… | Start here |
|---|---|
| **New operator** — installing Cinatra for the first time | [Quickstart](guides/hosting/quickstart.md) → [Installation](guides/hosting/installation.md) |
| **Operator** — configuring or upgrading a running instance | [Hosting Guide](guides/hosting/README.md) |
| **Admin** — managing marketplace, permissions, providers | [Admin Guide](guides/admin/README.md) |
| **End user** — running agents, reviewing dashboards, using the workspace | [User Guide](guides/user/README.md) |
| **Developer** — contributing code, writing agents, building extensions | [Developer Guide](guides/developer/README.md) |
| **MCP integrator** — connecting a client to the Cinatra MCP server | [MCP Guide](references/mcp/README.md) |
| **Designer** — the Cinatra design system and tokens | [Design Reference](references/design/README.md) |

---

## [Guides](guides/README.md)

- [User](guides/user/README.md) — running agents, chat, human-in-the-loop (HITL) review, dashboards, skills, cross-instance collaboration
- [Admin](guides/admin/README.md) — the `/configuration/*` area: marketplace, extensions, permissions, providers, telemetry, instance settings
- [Developer](guides/developer/README.md) — authoring agents and extensions, the contributor workflow (planned with GSD — "Git. Ship. Done", the open-gsd spec-driven development framework), and the day-to-day developer loop <!-- source-leak-allow -->
- [Hosting](guides/hosting/README.md) — installation, configuration, troubleshooting; what an operator needs to know

## [References](references/README.md)

- [Platform](references/platform/README.md) — architecture, subsystem contracts, the objects layer, security, connectors, artifacts, workflows, open standards, and CI policy
- [MCP](references/mcp/README.md) — the Model Context Protocol server (external + internal), authentication, primitives, and clients
- [Design](references/design/README.md) — the Cinatra design system: the normative spec, the design skill, and the operational rulebook
- [Glossary](references/glossary.md) — canonical concepts and terminology

## [Resources](resources/README.md)

- [Why Cinatra](resources/why-cinatra.md) — what the platform unlocks
- [Comparisons](resources/comparisons/README.md) — Cinatra vs ChatGPT Workspace Agents, Claude Cowork, Vercel Open Agents, Managed Agents, Amazon Quick, Runwork, Tasklet, Spawnlabs, and ServiceNow

---

## Development

This repository holds documentation only — Markdown files, one HTML design spec, and a few supporting assets. There is no build step to run documentation locally.

### Browse the docs

Open any Markdown file in your editor or browse them on GitHub. The `references/design/design-system.html` file is best viewed in a browser (`open references/design/design-system.html`).

### Contributing documentation

Contribution work follows the same process as Cinatra code:

1. **Open an issue first** for non-trivial changes — a sentence or two on what is wrong or missing and what fix you propose. For obvious typo/link fixes, a pull request alone is fine.
2. **Branch from `main`**, make your changes, and open a pull request.
3. **Keep links repo-relative** (`./` or `../` anchored to the Markdown file's location) so they resolve both locally and on GitHub. Do not use absolute filesystem paths.
4. **Run a local link check** if you add or move files. GitHub resolves relative Markdown links from the directory of the current file, so verify links render correctly on GitHub after moving or renaming documents.

For the full contributor workflow (including AI-assisted development with Cinatra dev-skills), see [Contributing](guides/developer/contributing.md).

### What belongs in this repository

This repository owns documentation that is public, audience-facing, and not tightly coupled to a specific code version. It does not own:

- Inline code comments or API doc-comments (those stay with the code).
- Per-instance operational runbooks or deployment manifests (those belong in your deployment repository).
- Branch-specific implementation doctrine consumed by code agents (that lives in the monorepo skill directory alongside the code it governs).

---

## Releases

Releases of the Cinatra platform (not of this docs repo) are tag-gated: a production deploy is triggered by pushing a semver version tag, not by merging a pull request. A merge to the main branch builds and publishes a branch image but does **not** deploy anything.

For the full release and deploy mechanics, see [Operations](guides/hosting/operations.md).

This documentation repository follows the same main-branch workflow: changes land on `main` and are immediately reflected on the published docs site. There is no separate release step for docs changes.

---

## Troubleshooting

If you cannot render or browse the docs locally:

- **Broken links in a browser or IDE** — GitHub resolves relative Markdown links from the directory of the current file, just as a local Markdown viewer does. If a link 404s on GitHub, the path is wrong relative to the current file's location (not the repo root).
- **`design-system.html` shows as raw HTML** — open it in a browser, not in a Markdown viewer. It is a self-contained HTML file.
- **A Markdown anchor link is broken** — GitHub generates heading anchors by lowercasing, replacing spaces with hyphens, stripping most punctuation, and appending `-1`/`-2` suffixes for duplicate headings. Use the exact generated anchor slug; small differences in punctuation or duplicate headings are a common cause of broken fragment links.

For problems running the Cinatra platform itself, see the [Troubleshooting guide](guides/hosting/troubleshooting.md).

---

## License

The documentation content in this repository is licensed under [CC-BY-4.0](https://github.com/cinatra-ai/docs/blob/main/LICENSE). Code snippets embedded in the documentation are licensed under [Apache-2.0](https://github.com/cinatra-ai/cinatra/blob/main/LICENSE), matching the Cinatra code repository.
