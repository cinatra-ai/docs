# Contributing to Cinatra

Thanks for your interest. Cinatra is the open source AI workspace for teams, and external contributions — bug reports, agent extensions, connectors, documentation, code — are welcome.

This document covers how to contribute. For the developer setup itself, see [Installation](../hosting/installation.md).

---

## Planning

Cinatra plans and drives work with GSD ("Git. Ship. Done") — the [open-gsd](https://github.com/open-gsd/gsd-core) spec-driven development framework (`@opengsd/gsd-core`). <!-- source-leak-allow -->
Its disciplined phase loop — discuss → plan → execute → verify — is how work moves from idea to merged PR: align on the problem in an issue, agree the approach, then implement and verify. The issue-first conventions below follow directly from that loop.

---

## Ways to contribute

### Reporting bugs

Open a GitHub issue with:

- What you expected to happen
- What actually happened
- The minimum reproduction (steps, sample input, environment)
- Versions: Node, pnpm, Docker, and the commit hash of the Cinatra working tree

For security issues, do not open a public issue. See [Security](../../references/platform/security.md#reporting-vulnerabilities) for the private disclosure path.

### Proposing features

Open a GitHub issue with the use case first. Explain the user problem and the shape of the solution; we will discuss the design before any implementation. Large feature work without prior alignment tends to require significant rework.

### Submitting code

Pull requests are welcome. Before working on a PR:

- For a bug fix: open an issue first only if the bug is non-obvious or you need clarification.
- For a feature or refactor: open an issue or discussion first. We will agree on the approach before you invest time.

PRs should:

- Pass `pnpm typecheck` and `pnpm lint` cleanly.
- Touch the smallest surface that achieves the goal. Bundle related changes; do not bundle unrelated changes.
- Update or add documentation when the change affects what an external user sees.
- Include tests when the change touches code that already has tests in its directory.

### Adding an agent extension

Cinatra is designed to host third-party agent extensions. To publish one:

1. Author the agent as an Open Agent Specification (OAS) Flow file under `agents/<vendor>/<slug>/cinatra/oas.json`.
2. Add a `package.json` with your namespace, version, and Cinatra metadata.
3. Test locally by installing into your dev instance.
4. Publish to the hosted public registry (or your private one). See [Building packages](building-packages.md) and [Developing agents](developing-agents.md) for the authoring conventions.

Agent extensions do not need to live in this repository — the platform installs from any compatible npm-style registry. Contributing a package to this repository is the right move only if it is broadly useful and you are willing to maintain it.

### Working on the WordPress plugin / Drupal module

The Cinatra WordPress plugin and Drupal module live in their own repos
(`cinatra-ai/wordpress-plugin`, `cinatra-ai/drupal-module`), consumed locally as
gitignored clones. **Where your commit goes** (extracted repo vs cinatra),
contract-version bumps, dirty-tree recovery, and the volume-scoped dev migration
are all covered in
[wp-drupal-plugin-development.md](wp-drupal-plugin-development.md).

**UAT override label.** PRs touching the contract / plugin-integration paths
trigger the Playwright UAT hard gate (`wp-drupal-uat.yml`). A planned migration
that knowingly breaks a UAT may land with the `override-wp-drupal-uat` label,
which requires **both owners' review** and a PR-body section stating: what
breaks, the expected follow-up PR(s), and the rollback path. Use it rarely.

---

## Working on the codebase

### Setup

See [Installation](../hosting/installation.md).

After the platform is running, verify the toolchain:

```bash
pnpm typecheck      # fast type check via tsgo
pnpm lint           # ESLint
pnpm build          # production build
```

### Keeping your checkout up to date

When you pull new code, your local dependencies and dev database schema can fall behind it — a forgotten `pnpm install` or schema migration is the usual cause of a "column does not exist" crash. Reconcile both with one command:

```bash
git pull
make refresh        # equivalently: pnpm refresh:dev  /  cinatra dev refresh
```

`make refresh` is **dev-only** and **never touches git** — you manage branches; it only brings dependencies and the dev database in sync with the code on disk. Concretely it:

- brings the bundled docker stack up (skipped automatically for isolated worktrees/clones and external infra; `--docker=always` forces it, `--no-docker` skips it),
- runs `pnpm install`,
- runs the idempotent dev setup (additive schema migrations + ensure-settings).

It does **not** rebuild images or run transformational one-shot migrations (renames/backfills) under `src/lib/migrations/` — those are applied by hand only when a release's notes call for them. Restart with `make dev` afterwards.

### Code style

The codebase follows the conventions documented in `AGENTS.md` at the repository root. Highlights:

- **TypeScript first.** Strict mode is on (`noImplicitAny: false`). Always use `import type` for type-only imports.
- **Kebab-case file names.** PascalCase types and components; camelCase functions and variables.
- **Packages communicate through capability surfaces**, not by importing each other's internals. If you need functionality from another package, call its Model Context Protocol (MCP) primitives through the deterministic client.
- **Server actions live next to the surface that uses them.** Never split a server action into a separate package just to "share" it; if it is shared, expose it through an MCP primitive.
- **UI uses shadcn/ui components.** Do not introduce raw HTML elements where a shadcn component exists. Do not hardcode Tailwind palette colors — use semantic tokens.

### Page layout

Every full-page screen wraps in the standard three-component shell (`Main`, `PageHeader`, `PageContent`). Do not bypass this with raw `<div>` wrappers; the layout primitives enforce visual consistency across the platform.

### Tests

Each package owns its tests in `__tests__/` or `tests/` subdirectories. Run them with `pnpm --filter <package> test`.

There is no global test runner currently — tests are package-local.

### Commits

- Commit messages describe the why, not just the what.
- Atomic commits are preferred over large bundles.
- Branch off `main`. The default branch protection requires linear history.

### Pull requests

PR titles should be short and descriptive. PR bodies should include:

- **Summary** — what changed and why
- **Testing** — what you did to verify it works
- **Screenshots** — for UI changes, before and after

Avoid merging your own PRs without review. Wait for a maintainer.

---

## Communication

- **GitHub issues** for bugs, feature requests, and design discussions
- **GitHub discussions** (when enabled on the repo) for open-ended questions
- Pull requests for code changes
- Email for private security disclosure ([Security](../../references/platform/security.md))

We aim to triage issues and PRs within a few business days. If something has been quiet for over a week, a polite ping is welcome.

---

## License

The Cinatra **code** (the [`cinatra-ai/cinatra`](https://github.com/cinatra-ai/cinatra) repository) is licensed under the [Apache License 2.0](https://github.com/cinatra-ai/cinatra/blob/main/LICENSE). By contributing code there, you agree that your contributions will be licensed under those same terms.

The **documentation content** in this repository is licensed under the [Creative Commons Attribution 4.0 International License (CC-BY-4.0)](../../LICENSE) — see the `LICENSE` file at this repository's root. Code snippets embedded in the documentation are licensed under Apache-2.0, matching the code repository. By contributing to the documentation, you agree that your prose and diagram contributions will be licensed under CC-BY-4.0 and any embedded code snippets under Apache-2.0.
