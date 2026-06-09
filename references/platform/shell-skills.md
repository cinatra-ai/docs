# Shell Skills Runtime

This document covers the Docker-based shell skills runtime — how skills are accessed, why they are not baked into the image, and the local-shell security model.

## How shell skills are accessed

The skills are not copied into the Docker image. Instead, Cinatra accesses them at runtime through bind mounts.

This is how it works:

- installed skills are discovered from the local skill catalog in the app database
- each installed skill points to a local folder on disk inside one of the installed skills packages
- when OpenAI returns a `shell_call`, Cinatra starts a throwaway Docker container
- the app bind-mounts the approved workspace paths into that container
- the shell tool reads the selected skill files from those mounted paths
- Cinatra returns the resulting `shell_call_output` to OpenAI so the model can continue and produce a final answer

In the current workspace, that means the container needs read access to the GitHub-installed skill extensions under `data/skills/` (operator-installed at runtime via the extensions upload flow at `/configuration/extensions/upload`).

This is why Docker must be able to access the local project directory on your machine.

## Why skills are not baked into the image

The shell runtime image is intentionally generic. The installed skills remain on the host filesystem rather than being copied into the image.

That design has a few benefits:

- you can update or replace installed skill extensions without rebuilding the Docker image
- the runtime image stays small and reusable
- Cinatra can mount only the skills selected for a given run
- the image remains execution infrastructure, while skills remain application content

The tradeoff is that Docker needs filesystem access to the workspace at runtime.

If you prefer, you could build a custom image that embeds the skills, but then every skills change would require rebuilding and redeploying the image.

## Local-shell security model

The containerized local shell is designed to reduce risk, not to grant direct host-shell access.

The Docker runtime is used to provide:

- non-root execution
- read-only root filesystem
- capability dropping
- `no-new-privileges`
- network disabled by default
- isolated temp storage
- bounded CPU, memory, PID, output, and execution-time limits

The current runtime executes with bind-mounted approved paths, not with full unrestricted host access. For safe use, keep the configured read/write roots narrow and only mount the directories the skills runner actually needs.

If you want to use shell skills, Docker must be installed and running. The local-shell image is built from the first installed `extensions/*/*/runtime/Dockerfile` during `make setup` and is invoked by the OpenAI connector's shell tool at runtime.
