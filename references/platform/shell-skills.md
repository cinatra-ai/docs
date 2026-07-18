# Sandboxed execution and shell skills

This document describes the **execution plane**: the core-owned, sandboxed place where models run shell commands, scripts, and package installs — and how skills execute on it. It covers the threat model, the container isolation contract, the egress posture, availability defaults, and the environment model (base image and per-run workspace).

Every model orchestrated through Cinatra — chat/assistant, agent runs, and deterministic tasks, across the OpenAI, Anthropic, and Gemini providers — reaches the same execution plane through one core execution capability: the provider-agnostic `sandbox_execute` tool, translated per provider (a native shell on shell-capable OpenAI models, a named function tool otherwise). There is one execution surface, not one per provider.

> **What replaced the old runtime.** Earlier releases described a connector-owned Docker shell: OpenAI's `shell_call` started a throwaway `--rm` container, the app **bind-mounted host workspace paths** into it, and the shell read skill files from those mounts. That path was network-off, non-persistent (installs could not stick), and effectively dormant. It has been **removed** — the `@cinatra-ai/openai-connector` is now a pure credential/provider connector with no shell surface. Everything below is the core execution plane that supersedes it.

---

## Rollout status

Be precise about what is enforced today versus what is staging in:

- **Shipped and enforced** (in `@cinatra-ai/execution-plane` and `@cinatra-ai/llm`): the `sandbox_execute` tool contract and single injection primitive; the execution-session mint/seal/verify spine; the broker (carrier verification, per-command run-liveness revalidation, per-org quotas and bounded queueing, audit and separated stdio retention, teardown hook); the local-dev sandbox worker (a fresh hardened container per command); the platform L0 base image and its hardened run profile; the per-run L2 workspace with an **enforced** disk quota; the attributing egress gateway; and read-only `/skills` staging with per-file digest verification.
- **Staging in** (later slices / deployment wiring): injection ships behind a **default-off rollout merge gate** (`CINATRA_EXECUTION_PLANE_ROLLOUT`, which enables only for the exact string `on`) — while off, orchestration is byte-identical to before and no `sandbox_execute` tool reaches any provider. The remaining app-layer wiring (the service boundary, durable job/audit tables, the platform-admin settings and health surfaces, and the gateway's read-through package-registry cache) lands in the following slices. The rollout flag is a temporary merge gate, **not** the availability default described below.
- **Later stages** (called out inline where relevant): **L1** declared environments and the trusted image builder land after S3 ([cinatra#1708](https://github.com/cinatra-ai/cinatra/issues/1708)); **L3** named persistent workspaces are phase 2; durable artifact export/import (and its taint enforcement) rides the objects/artifacts bridge.

The isolation contract, egress rules, and environment tiers below are described in the present tense because that is exactly what the shipped code enforces **when a command runs**. Reachability from a default install follows the rollout above.

---

## Threat model

The plane exists so that any model — including a prompt-injected one — that is steered toward running code executes in a place with no ambient authority, no secrets, and no host data. The design points, in order of importance:

### Never in the app process

Model-driven execution **never runs in the app process or on the app host**. A naive "just spawn it" would execute with the app container's ambient authority and environment. Instead, the injected capability hands the command to the broker, which dispatches it to a sandbox worker that runs it in an isolated container. The **app image ships no Docker CLI**, so an in-app executor is impossible by construction — granting the app container control of Docker is exactly the outcome this avoids.

### Empty workspace, no host mounts

A sandbox container has **no host bind mounts**; its only *persistent* writable mount is its own per-run workspace volume (see [L2](#l2-per-run-workspace), below), alongside a bounded, ephemeral `tmpfs` at `/tmp`. The old "mount the current working directory" default is gone. The run profile asserts this on every dispatch: every `--volume` must name a Docker volume (no path separator in the source) and there must be no `--mount type=bind`. A violation is treated as a bug, not a policy knob.

### Environment scrubbed by omission

The sandbox receives **no host environment**. `docker run` is given an explicit, enumerated environment — `HOME` and the user-space install prefixes inside the workspace, plus the egress proxy variables when egress rides the gateway — and nothing else. Scrubbing is structural: the worker never forwards its own environment, so a new host variable cannot leak in by default.

### No credentials, ever

Scoped business credentials **never enter a sandbox** (decision D5). The execution session binds only an attributable identity — `{orgId, userId, surface, runId?}` — sealed into an opaque, HMAC-SHA256-signed, expiring carrier that the broker verifies with a constant-time compare. The carrier is whitelisted to exactly those fields at a single choke point and re-validated on seal, so a caller cannot smuggle host data or a secret field into it. Authenticated actions stay in the MCP and connector tools; the system cue that makes the model aware of the sandbox says so explicitly ("contains no credentials and no host data — use the connector/MCP tools for authenticated actions, never the sandbox").

### Treat sandbox output as tainted

The sandbox is an **untrusted execution boundary**. Everything a model brings back out of it — command `stdout`/`stderr` today, and exported artifacts once the artifact bridge lands — is untrusted, model-produced content: never a trusted platform record and never the result of an authenticated action. Because the sandbox holds no credentials and no host data, exfiltration exposure is bounded to what is inside it: whatever the model pulled in over egress, plus the read-only skill snapshots the platform stages from the org's own catalog — never platform secrets, host data, or another org's data. Persisting sandbox outputs as durable objects rides the objects/artifacts bridge (no host mounts); that path carries the same taint posture and lands with that work.

### Command allow/block lists are hygiene, not the boundary

An optional command-policy hook can allow or block specific commands, but it is **hygiene, never the security boundary**. The boundary is the container profile plus the network layer. A blocked command is a convenience filter; a sandbox with no route out and no capabilities is the actual containment.

---

## Isolation contract

Every command runs in a fresh, hardened container built from the L0 base image. The run profile is the contract:

- **Non-root**: a fixed, contractual runtime UID/GID (`10001:10001`), passed explicitly with `--user` — the profile does not trust the image's `USER` directive.
- **Read-only root filesystem** (`--read-only`); the only writable locations are the per-run workspace volume and a bounded `tmpfs` at `/tmp`.
- **All capabilities dropped** (`--cap-drop ALL`) and **no privilege escalation** (`--security-opt no-new-privileges:true`). There is no root path inside a running sandbox — OS-level packages enter only at image build time (decision D2).
- **Resource quotas**: CPU, memory (swap pinned to the memory ceiling), and PID limits via cgroups; a wall-clock timeout the worker enforces host-side (a cgroup cannot express wall time); and per-stream `stdout`/`stderr` output caps.
- **Enforced disk quota**: a per-file `ulimit -f` cap rides inside the command, and the worker measures the workspace after every command and terminates the job if the total crosses the quota. This closes the historically stored-but-never-enforced write-cap gap — the quota is real, not a setting that is recorded and ignored.
- **Option-injection defense**: the image reference is validated against a leading `-` and out-of-charset characters, and a `--` argv separator ends option parsing before the image and command, so a misconfigured reference can never be re-read as a `docker run` option.

The default per-command quotas are 1 CPU, 1 GiB memory, 256 PIDs, a 2-minute wall clock, a 1 MiB per-stream output cap, and a 256 MiB workspace; the broker (and, in production, the deployment layer) can tighten them per job. Cross-org isolation is a tenancy property: mutually-untrusted organizations never share an instance, and hardened-container isolation is the accepted grade on every class (decision D1).

---

## Egress

Internet access is **on by default** (decision D3) — that parity with the assistant's web access is what lets a model download and install tools. But default-on does not mean a raw route out:

- **All egress transits an attributing gateway.** In `default_internet` and `allowlist` modes the sandbox attaches only to an `--internal` Docker network with no NAT route; the gateway container is the sole dual-homed path out. A process that ignores the proxy variables simply has no route — the enforcement is the network topology, not an environment hint.
- **`none` mode** maps to `--network none`: a kernel-level deny with nothing to bypass.
- The gateway enforces **mandatory per-job attribution** (each job's token and its policy are registered on a control-secret-authenticated channel the sandbox never sees; an unregistered token is rejected with `407`), the **host allowlist** in `allowlist` mode (exact or dot-suffix match; denied hosts are refused), a **per-job byte ceiling** metered in transit (a stream is severed when the cap is crossed), and **SSRF/pivot defense** — every destination host is DNS-resolved and rejected if it lands in a loopback, private, link-local, CGNAT, multicast, or cloud-metadata range (IPv4 and IPv6, including IPv4-mapped forms).

The restriction tiers are therefore **network-layer enforced**: `default_internet` (attributed, quota'd internet), `allowlist` (only listed hosts), and `none` (no network). A gateway-requiring mode with no gateway configured **fails closed** — the broker refuses the job rather than granting silent, unattributed egress. Command allow/block lists are not part of this — the network layer is the boundary. (The gateway's read-through package-registry cache is a later slice; attribution, allowlisting, and byte quotas are enforced today.)

---

## Availability

The execution capability is a property of the orchestration layer, on by default for **every agent and every assistant/chat surface** (decision D4), resolved once and injected exactly once alongside — and independent of — MCP tool injection. Two things can withhold it, each cleanly:

- **Opt-out**: a per-org or per-agent availability posture of `disabled` withholds the capability and surfaces a structured `capability_unavailable` signal; the model stays usable and simply proceeds without the tool. (The posture is honored at the injection point today; the admin settings surface that stores and resolves it lands with the app-layer wiring.)
- **Technical carve-outs**: explicit single-step or structured-output tasks have no post-tool turn in which a model could consume a result, so the capability is suppressed for them; and an **unidentifiable caller** — no attributable `orgId`/`userId`/`surface` — is denied outright (fail-closed: no identity, no capability), surfaced as a distinct `no_session` signal.

Neither path ever throws into the model call. Non-streaming injected calls are additionally given a tool-aware step budget (at least one post-tool step) so the model can act on the sandbox result.

---

## Environment model

Tool persistence is answered by a tiered environment model. Two tiers are live today; the others are called out as staged.

### L0 base image

The **L0 base image** is platform-owned, digest-pinned, and batteries-included — the only image the sandbox worker runs commands over. It is the successor to the removed connector skill-shell image. It ships a Python 3.12 base with `bash`, `curl`, `git`, `jq`, `ripgrep`, Node.js and `npm`, `pip`, and the common coreutils/findutils/grep/sed/unzip tooling, plus the fixed unprivileged runtime user. Popular tools graduate into it over releases. **OS-level dependencies enter only here, at build time, with root** — a running sandbox has no root path at all. Production resolves the image by digest (the deployment owns the pin); the worker records the resolved digest of whatever ran in every audit record, so the effective image is always attributable even under a mutable local-dev tag.

### L2 per-run workspace

The **L2 workspace** is a named Docker volume mounted read-write at `/workspace` — the only writable persistence a sandbox has. It follows the **run**: keyed on the run id when the session carries one (agent runs — so `pip install --user` and `npm install -g` persist across steps and turns within the run), and on the broker job id otherwise (chat and deterministic tasks). A new key is a fresh, empty volume: a workspace **never leaks** into another agent or a future run. This is also how a skill-less assistant installs and uses a tool ad hoc within a chat or task job — no declared environment is required.

Workspaces are labeled for retention GC — reaping an idle workspace is a retention concern, not a lifecycle transition. Hard removal of a run (force-delete/purge) puts its workspace on immediate GC via the broker's teardown hook; an in-flight run is not interrupted by an extension being archived (the sandbox follows the run's lifecycle, not the extension's).

### L1 declared environments — staged after S3

Declared, content-addressed environments (an agent's definition declaring required packages, built once by a trusted builder into immutable cached layers, with a human-approved promotion affordance for model-driven additions) are **not yet shipped**. They land after S3 ([cinatra#1708](https://github.com/cinatra-ai/cinatra/issues/1708)). Until then, ad-hoc installs into the L2 workspace are the mechanism — L1 is an optimization, never a precondition.

### L3 named persistent workspaces — phase 2

Named, persistent workspaces that outlive a single run are **deferred to phase 2** (decision D6). Stateful workflows will round-trip through artifact export/import rather than a shared durable workspace once that bridge ships.

---

## How skills execute

Skill **delivery** is unchanged — the catalog still exposes skill ids and descriptions, skill content stays **out of the prompt**, and Anthropic-native skill file handover is untouched (decision D7). What moved is skill **execution**: it now runs on the plane rather than in the removed connector shell.

When a request is execution-authorized, the catalog-resolved skill snapshots are **staged read-only** under `/skills/<slug>` inside the sandbox. Staging carries no host mounts: file content arrives as data (bytes plus SHA-256 digests), every file's digest is **re-verified before it is written**, paths are checked to be strictly relative and traversal-free, and the populated volume is mounted read-only — the sandbox cannot modify a snapshot. The model reads a skill lazily (`cat`/`head` the staged files) only when it applies, so skill content still never bloats the prompt.

Provider translation follows a **singular-native-shell** rule so a model is never handed two competing shells:

- **Skills + execution**, on a shell-capable OpenAI model ⇒ exactly **one** native shell bound to the session, with the staged skills listed on it.
- **Skills, but execution disabled** ⇒ a restricted `skill_file_read` **named function tool** (a catalog-scoped read-only reader), never a privileged shell.
- **A model that rejects the native shell** ⇒ both surfaces become named function tools.
- Anthropic and Gemini use a named function tool for execution; their skill delivery mechanics are unchanged.

A skill that genuinely needs to run scripts declares `requiresExecution`; agent configuration warns at attach time if such a skill is combined with execution disabled.

---

## Audit

The broker emits an audit record for **every** command — allowed, denied, and terminated alike — to a host-injected sink, mapped onto the platform's authz audit vocabulary with the model as the acting principal. The record carries the attributable identity (`orgId`/`userId`/`surface`/`runId`), the command and working directory, the decision and any refusal/termination reason, the resolved image digest, the effective policy (egress mode and resource limits), the gateway-attributed egress destinations and byte totals, wall time, and post-command workspace size. Command output (`stdout`/`stderr`) is **not** part of the audit record — it is held on a separate retention sink behind a redaction hook (defense-in-depth; the sandbox holds no secrets by construction). Durable persistence of these records into platform tables is part of the app-layer wiring noted under [Rollout status](#rollout-status).

---

## Where to go next

- The platform security model, including the sandboxing summary and threat patterns: [Security](security.md)
- Authoring skill extensions: [Authoring skill extensions](extension-kinds/authoring-skill-extensions.md)
- Skills lifecycle and catalog: [Skills lifecycle](skills-lifecycle.md)
