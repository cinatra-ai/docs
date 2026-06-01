# Operations

This page covers how a production release is built and deployed, and the one operational fact that surprises operators most often: **merging is not deploying**.

For prerequisites and services, see [Installation](installation.md). For the environment variable matrix, see [Configuration](configuration.md). Back to the [Hosting Guide](README.md).

---

## Releases are tag-gated

Production deploys are gated on a release tag, not on a merge.

- Pushing a **version tag** (a `v`-prefixed semver tag such as `v1.4.0` or `v1.4.0.1`) builds the runtime image from the commit the tag points at, pushes it to the image registry, confirms the tagged image is resolvable, and then dispatches a deploy of **that exact image, referenced by digest**.
- Merging a pull request into the main line does **not** deploy anything. A merge to the main branch rebuilds and publishes the branch image (tagged for the branch, the commit SHA, and `latest`), but it triggers **no** deploy.

Only a version tag triggers a deploy. The image is deployed by digest, so what runs in production is byte-for-byte the image that was built and pushed for that tag — there is no separate "deploy build."

### Deploying ships the current main line, not one change

Because a release tag is taken at the **current head of the main line**, deploying ships everything merged up to that point — not a single pull request. A tag built from main HEAD carries every change that has merged since the previously deployed tag.

Before cutting a release tag, confirm what is between the currently deployed tag and main HEAD. The blast radius of a deploy is "everything since the last deployed tag," which can span far more than the one change you have in mind. Compare the deployed tag against main HEAD first, then decide.

### Not every `v`-prefixed tag deploys

The build runs for any `v`-prefixed tag, but only a **semver release tag** (matching `vMAJOR.MINOR` or `vMAJOR.MINOR.PATCH`, optionally with a suffix) dispatches a deploy. A non-semver marker or checkpoint tag (for example, a named pre-release checkpoint) still builds and pushes a checkpoint image to the registry for later reference, but it does **not** trigger a production deploy.

---

## The image registry

Runtime images are published to a container image registry (GitHub Container Registry, `ghcr.io`, under the repository's namespace). Each build publishes the image under several tags:

- The branch name and the commit SHA for ordinary main-line builds, plus `latest` for the default branch.
- The version tag and its semver value for release-tag builds.

The deploy references the image by **digest**, not by a mutable tag, so a re-tag or a later `latest` push cannot change what a given release runs.

---

## Promoting a release

To promote a release to production:

1. Confirm the difference between the currently deployed tag and the main-line HEAD you intend to ship. This is the real blast radius — review it before tagging.
2. Push a semver version tag (`vMAJOR.MINOR` or `vMAJOR.MINOR.PATCH`) at the commit you want to release.
3. The build produces the runtime image, publishes it to the registry under the version tag, and confirms the tagged image resolves.
4. Once the image is provably present, the deploy is dispatched against that image by digest.

If you need a build artifact without a deploy — to pin or archive a checkpoint — push a non-semver `v`-prefixed tag instead. It produces a registry image you can reference later, with no production deploy.

### Operator notes

- **A merge is not a release.** If you merged a fix and need it live, you still have to cut a tag.
- **Re-deploying the same tag re-deploys the same digest.** Tags resolve to a fixed digest at build time; pushing the same version tag again does not pick up newer commits.
- **Production deployment mechanics live in your own deployment material.** This repository owns the build-and-publish step and the tag-to-deploy dispatch; the specifics of where and how the image lands (orchestration, secrets injection, rollout strategy) live in your deployment environment, not here. See [Where production deployment material lives](README.md#where-production-deployment-material-lives).

---

## Where to go next

- The environment your image needs at runtime: [Configuration](configuration.md)
- The services that must be present for a deploy to be healthy: [Installation](installation.md)
- Reading logs and recovering from failures: [Troubleshooting](troubleshooting.md)
