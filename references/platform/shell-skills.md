# Sandboxed execution and shell skills

This document describes the **execution plane**: the core-owned, sandboxed place where models run shell commands, scripts, and package installs — and how skills execute on it.

Every model orchestrated through Cinatra — chat/assistant, agent runs, and deterministic tasks, across the OpenAI, Anthropic, and Gemini providers — reaches the same execution plane through one core execution capability: the provider-agnostic `sandbox_execute` tool, translated per provider (a native shell on shell-capable OpenAI models, a named function tool otherwise). There is one execution surface, not one per provider.

> **The connector shell path is gone.** Older releases described a connector-owned Docker shell: the `@cinatra-ai/openai-connector` declared a `shellTools` capability, shipped its own `runtime/Dockerfile`, exposed a **Local shell** configuration tab, and started a throwaway `--rm` container with host workspace paths bind-mounted into it. That path is **retired** — the capability, the executor, the tab, and the runtime image are all removed from the connector, which is now a pure credential/provider surface. Nothing on this page describes that path as current; everything below is the core execution plane that replaced it.

---

## How to read this page

Security prose goes stale in one specific way: intent gets written in the present tense and then reads as a guarantee. This page separates the two, and marks a third state for anything that exists in code but is not reachable on a default install.

| Tier | What it means |
|---|---|
| **A — Intended contract** | What the plane is *designed* to guarantee. Design intent. Do not read a Tier A statement as a control that runs today. |
| **B — Enforced by merged code** | A control the merged code applies when a command runs. Every Tier B claim names the enforcing symbol and links to it at a pinned commit — see [the claims table](#enforced-claims-table). |
| **C — Gated** | Behind the opt-in rollout flag, or landing in a later slice. Present in the tree, not reachable on a default install. |

Source citations below are pinned to `cinatra-ai/cinatra` at commit [`6285e014`](https://github.com/cinatra-ai/cinatra/commit/6285e0141cf2a34b4476832f698a3f0f6cf32890). A pinned link keeps the citation honest even after the file moves.

---

## Tier A — the intended security contract

This section is **intent**. It is what the plane exists to achieve; the code that currently backs each point is in [Tier B](#tier-b--enforced-by-merged-code), and the parts not yet reachable are in [Tier C](#tier-c--gated-behind-the-rollout-flag-or-a-later-slice).

- **Never in the app process.** Model-driven execution must never run in the app process or on the app host, where it would carry the app container's ambient authority and environment. The app image ships no Docker CLI, so an in-app executor would require handing the app container control of Docker — the outcome the design refuses.
- **Tenancy.** Mutually-untrusted organizations never share an instance; organizations on one instance are mutually trusting. Hardened-container isolation is the accepted grade on every class — no microVM requirement.
- **No credentials, ever.** Scoped business credentials never enter a sandbox. Authenticated actions stay in the MCP and connector tools. This is load-bearing: it is what bounds the blast radius of default-on internet access.
- **Egress is attributed, not blocked.** Internet access is on by default — parity with the assistant's web access is what lets a model download and install tools — but all of it transits an enforcing gateway that attributes, meters, and (in the restricted tiers) filters. Command allow/block lists are hygiene, never the security boundary.
- **Availability.** The capability is a property of the orchestration layer: on for every agent and every assistant/chat surface, with a per-org and per-agent opt-out. Only two carve-outs: single-step/structured-output tasks (no post-tool turn exists in which a model could use a result), and unidentifiable callers (no attributable identity, no capability).
- **Tool persistence without a shared host.** An agent that needs `pandoc` should declare it once and get it on every run, without a durable machine anyone can accumulate state on. That is the tiered environment model (L0/L1/L2, with named persistent workspaces deferred).
- **Sandbox output is tainted.** Anything a model brings back out of a sandbox is untrusted, model-produced content — never a trusted platform record and never the result of an authenticated action.
- **Reviewed environment changes.** A declared environment is a supply-chain surface. Changes to it ride the agent's existing review path, and a model never edits its own environment; a promotion proposal is a reviewable diff a human accepts.

---

## Tier B — enforced by merged code

Everything in this section is applied by merged code **when a command runs**. Reachability from a default install is a separate question, answered in [Tier C](#tier-c--gated-behind-the-rollout-flag-or-a-later-slice).

### The sandbox boundary

Every command runs in a fresh, hardened container built from the L0 base image, dispatched by the local-dev sandbox worker (`LocalDevSandboxWorker`, [`packages/execution-plane/src/worker.ts`](https://github.com/cinatra-ai/cinatra/blob/6285e0141cf2a34b4476832f698a3f0f6cf32890/packages/execution-plane/src/worker.ts#L64)). The run profile is the contract:

- **Non-root at a fixed, contractual UID/GID** (`10001:10001`), passed explicitly with `--user` — `buildHardenedRunArgs` does not trust the image's own `USER` directive.
- **Read-only root filesystem** (`--read-only`). The profile grants exactly two writable mounts: the per-run workspace volume at `/workspace` and a 128 MiB `tmpfs` at `/tmp`. (Docker still provides its own container runtime mounts, such as `/dev/shm`; those are outside the profile's argv.)
- **All capabilities dropped** (`--cap-drop ALL`) and **no privilege escalation** (`--security-opt no-new-privileges:true`). There is no root path inside a running sandbox; OS-level packages enter only at image build time.
- **No host bind mounts.** `assertNoBindMounts` is called on every dispatch: every `--volume` must name a Docker volume (no path separator in the source) and no `--mount type=bind` may appear. A violation raises, rather than degrading to a policy warning.
- **Environment scrubbed by omission.** `sandboxEnvironment` returns an explicit, enumerated environment — `HOME`, the user-space install prefixes inside the workspace, and the egress proxy variables when egress rides the gateway — and nothing else. The worker never forwards its own environment, so a new host variable cannot leak in by default.
- **Resource quotas**: CPU, memory (swap pinned to the memory ceiling) and PID limits via cgroups; a wall-clock timeout the worker enforces host-side; per-stream `stdout`/`stderr` output caps.
- **A measured disk quota.** A per-file `ulimit -f` cap rides inside the wrapped command (`wrapSandboxCommand`), and after every command the worker measures the workspace with `measureWorkspaceKb` — run over the trusted L0 base, never the agent's own L1 layer, so an L1 build cannot install a `du` that under-reports. Two conditions are worth knowing exactly: the worker raises `disk_quota_exceeded` (which terminates the job) only for a command that otherwise **exited normally** — a command already terminated by the wall clock or the output cap keeps that termination class — and a measurement that fails is recorded as `0` KiB, so the command is treated as within quota and the next command re-measures.
- **Option-injection defense.** `assertSafeImageRef` rejects an image reference with a leading `-` or out-of-charset characters, and a `--` argv separator ends option parsing before the image and command.

The default per-command quotas are 1 CPU, 1 GiB memory, 256 PIDs, a 2-minute wall clock, a 1 MiB per-stream output cap, and a 256 MiB workspace. They are a **per-broker** setting, not a per-job one: the broker merges its construction override over the defaults once and applies the result to every job it runs.

### Execution-session binding

The execution session is the trust root. `mintExecutionSession` normalizes a session down to exactly `{orgId, userId, surface, runId?}` at a single choke point and **raises `UnidentifiableExecutionCallerError`** when `orgId` or `userId` is empty — no attributable identity, no capability. The orchestration layer turns that into a structured `no_session` signal rather than an exception into the model call.

The minted session is sealed by `sealExecutionSession` into an opaque, HMAC-SHA256-signed, expiring carrier, and only the broker opens it (`openSealedSession`, constant-time compare). Because the whitelist runs at seal time as well, a caller cannot smuggle a secret or host-data field into the carrier. The carrier rides on the internal `sandbox_execution` tool member and never reaches a provider: the adapter translates that member into a native `type: "shell"` declaration (or a `sandbox_execute` function tool) carrying only a description and a skill listing, and on every non-injected path the orchestration entry points call `stripSandboxExecutionTools` before handing tools to an adapter, so a smuggled or stale sandbox tool cannot slip through.

Surface issuers mint through one shared seam, `resolveSurfaceExecutionBinding` ([`src/lib/execution/surface-execution-session.ts`](https://github.com/cinatra-ai/cinatra/blob/6285e0141cf2a34b4476832f698a3f0f6cf32890/src/lib/execution/surface-execution-session.ts#L42)). Be precise about the division of labour: that seam **mints from the identity its caller hands it** — it does not itself authenticate anything. The proving happens upstream, at each issuer. Chat mints from the auth-derived org and the authenticated user, with no run binding. The agent-run path (`/api/llm-bridge`) mints from the run it has already resolved and authorized for this request, never from a caller-supplied body id. The broker then re-checks per command: its run-liveness probe re-reads the run row and answers `gone` both when the row is missing and when its org or owner has diverged from the identity sealed into the carrier.

### Egress

`resolveEgress` maps the policy tier onto a network configuration; `buildHardenedRunArgs` turns that into the container's `--network` argument; and `ExecutionBroker.exec` is where a failure to resolve or register becomes a refusal. The three tiers:

- **`none`** → `resolveEgress` returns `kind: "none"` and the run profile emits `--network none`: a kernel-level deny with nothing to bypass.
- **`default_internet` and `allowlist`** → `resolveEgress` names a network and the profile attaches the container to it. What makes that network safe is a separate symbol: `ensureInternalNetwork` (called by `startLocalGateway`) creates it with `docker network create --internal` — no NAT route — and **refuses** an existing network of the same name that is not internal. The gateway container is then attached to it as the sole dual-homed path out. A process that ignores the proxy variables has no route: the enforcement is the network topology, not an environment hint.
- **A gateway-requiring tier with no gateway configured** → `resolveEgress` raises `EgressGatewayRequiredError`, which `ExecutionBroker.exec` converts into a refusal. It does not silently grant direct egress, and it does not silently downgrade to no network (which would misreport the policy).

`registerJobEgress` posts the per-job token and its resolved policy to the gateway's control-secret-authenticated channel **before** the sandbox runs; a failed registration raises `EgressRegistrationError`, and again it is `ExecutionBroker.exec` that turns that into a refused command rather than a dispatch the gateway would reject anyway.

**The gateway denies by default.** Its `decide()` function ([`packages/execution-plane/runtime/egress-gateway.cjs`](https://github.com/cinatra-ai/cinatra/blob/6285e0141cf2a34b4476832f698a3f0f6cf32890/packages/execution-plane/runtime/egress-gateway.cjs#L292)) is an allow-list of positive outcomes; every other path is a refusal:

| Condition | Outcome |
|---|---|
| No proxy credential on the request | `407`, reason `unattributed` |
| A token the control channel never registered | `407`, reason `unregistered_token` |
| Host not on the allowlist (in `allowlist` mode) | `403`, reason `denied_by_allowlist` |
| Per-job byte ceiling already crossed | `403`, reason `byte_quota_exceeded` |
| Destination resolves into a protected range | `403` (see below) |

A sandbox therefore cannot forge attribution and cannot reach anything merely by not being registered. It also cannot pivot by name: `resolvePinnedAddress` resolves every destination host and **pins the resolved IP** for the connection, so the policy decision and the actual connection cannot diverge through DNS rebinding, and `isProtectedAddress` rejects the destination — in every mode, including allow-all. What that check covers, exactly: for IPv4, loopback, `0.0.0.0/8`, the RFC 1918 private ranges, link-local (which includes the `169.254.169.254` cloud-metadata address), CGNAT, and everything from `224.0.0.0` up; for IPv6, the unspecified and loopback addresses, `fe80::/10` link-local, `fc00::/7` unique-local, and IPv4-mapped and IPv4-compatible forms re-checked numerically against the IPv4 rules. An address that cannot be parsed is rejected.

Allowlist matching in the gateway (`hostAllowed`) is exact or dot-suffix: `pypi.org` allows `pypi.org` and `files.pypi.org`, never `notpypi.org` or `pypi.org.evil.example`. A leading `*.` on an entry is stripped, so `*.example.com` and `example.com` behave identically.

### The audit record — exactly what is kept, and what is not

The broker emits an audit record for **every** command — executed, refused, and terminated alike — and `toAuthzAuditEventInput` maps it onto the platform's existing authz audit vocabulary, with the model as the acting principal. That mapper is the boundary that decides what a durable row can ever contain, and it is the right thing to read when the question is "what could this record possibly leak".

**Retained** — the top-level event: `organizationId`, `actorPrincipalId` (the session's `userId`), `actorPrincipalType: "model"`, `authSource: "agent"`, `resourceType: "execution_sandbox"`, `resourceId` (the broker job id), `operation: "sandbox_execute"`, `decision`, and `runId` when the session carried one. Its `metadata` object carries exactly ten keys: `surface`, `cwd`, `reason`, `exitCode`, `termination`, `imageDigest`, `egressMode`, `egressTotalBytes`, `wallMs`, `workspaceKb`.

**Read `decision` precisely.** It answers "did the broker let this command run", not "did it end well". A command the broker **refused** — no live run, an untrusted environment, a worker error, a policy refusal — is `denied` with its refusal class in `reason`. A command that actually ran is `allowed` **even when it was then terminated** by the wall clock, the output cap, or the disk quota; the termination class is in `termination`, not in `decision`.

**Excluded** — the mapper drops the fields that exist on the in-memory record but must never reach a durable row:

- **The executed command text.** The broker holds `command` for the command-policy hook and stdio correlation; it is not mapped.
- **The per-destination egress list.** `egressDestinations` (host, port, allowed) is dropped; only the tier and the byte total survive.
- **Command output.** `stdout`/`stderr` never enter an audit record. The broker has an optional stdio-retention seam for them, and the local-dev construction supplies no sink — so today command output is retained nowhere by the plane.
- **Prompt text and credentials** are never part of the record in the first place; the sandbox holds no credentials by construction.

The exclusions are pinned negatively, not merely by convention: `audit-metadata-only.test.ts` asserts the mapped output contains neither property and that a hostile record's command string, bearer token, and destination hosts appear nowhere in the serialized event.

**The write itself is best-effort.** The mapper's guarantee is about *content*; delivery is a separate question, and the honest answer is that this is a decision record, not a guaranteed-complete ledger. `logAuditEvent` never throws by contract, the plane's sink additionally swallows any transport failure so an audit problem cannot propagate into a model's tool loop, and the kernel cooldown-suppresses repeated **denied** events with the same key for 60 seconds (allowed events are never suppressed). The broker has already enforced its decision before the sink runs — a missing row never means a command escaped a control.

The org-admin read path (`readExecutionAuditRows`) is a second, independent allowlist: it projects named columns and named metadata keys only, and it returns an empty list rather than throwing when the store is unavailable. Its `orgId` argument scopes the read to one organization; called without one it reads instance-wide, which is why that form is reserved for the platform-admin surface. The function performs no authorization itself — the caller is the gate.

### Readiness is gated on a completed handshake

Readiness cannot be asserted by configuration. `runBrokerHandshake` performs a real round trip: it seals a fresh carrier under a reserved non-tenant identity, opens a broker job, runs a probe command in a real container over the L0 image, and requires `termination: "exited"`, exit code `0`, and the expected stdout. Only on that completed handshake does the boot phase call `registerExecutionExecutorFactory` (`executionBrokerPhases`, [`src/lib/boot/phases/execution-broker.ts`](https://github.com/cinatra-ai/cinatra/blob/6285e0141cf2a34b4476832f698a3f0f6cf32890/src/lib/boot/phases/execution-broker.ts#L44)). Every other outcome registers nothing and leaves the fail-closed posture untouched. The health surface re-runs the same handshake on load (memoized, single-flighted) rather than reporting a cached boot verdict.

`resolveExecutionEnvironmentReadiness` then resolves one of three states, and never invents a fourth:

- **`disabled`** — the instance never opted into the plane.
- **`unavailable`** — opted in, but no provenance key, or no executor factory (flag off, mode `disabled`/`remote`, or the handshake did not complete).
- **`ready`** — opted in, provenance key present, and an executor binding available.

The consequence is the run seam's matrix (`resolveRunExecutionBinding`): an agent that declares **no** environment runs on L0 in every state; an agent that **declares** one runs its built layer only in `ready`, and is **refused** — audited, never silently downgraded to L0 — in every other state, including when its declaration is invalid.

### Skills execute on the plane

Skill **delivery** is unchanged by the plane; what moved is skill **execution**. Delivery is per-provider, and it is worth being exact rather than sweeping:

- **OpenAI** — the catalog exposes ids and descriptions; the model reads a skill's files lazily, so content stays out of the request.
- **Anthropic** — skills are referenced as pre-synced Custom Skills through the provider's container-skills surface; content likewise stays out of the request, and this mechanism is untouched by the plane.
- **Gemini** — skill content is read and **inlined into the system prompt**. On this path skill content is in the request by design; "content stays out of the prompt" is an OpenAI/Anthropic property, not a platform-wide one.

**Staging into the sandbox is the OpenAI shell-delivery path.** When such a request is execution-authorized, the catalog-resolved snapshots carried on its shell tool are staged read-only under `/skills/<slug>`. Staging carries no host mounts: content arrives as data (bytes plus SHA-256 digests), **`stageSkillsVolume` recomputes and compares every file's digest before it is written**, and paths must be strictly relative and traversal-free. The read-only mount is a separate control in a separate symbol: the run profile mounts the populated volume with `:/skills:ro`, so the sandbox cannot modify a snapshot. A digest mismatch, an unsafe path, or a Docker failure refuses the staging outright.

Provider translation follows a **singular-native-shell** rule, so a model is never handed two competing shells:

- **Skills + execution** on a shell-capable OpenAI model ⇒ exactly one native shell bound to the session, with the staged skills listed on it.
- **Skills, execution disabled** ⇒ a restricted `skill_file_read` named function tool — a catalog-scoped read-only reader, never a privileged shell.
- **A model that rejects the native shell** ⇒ both surfaces become named function tools.
- Anthropic and Gemini use a named function tool for execution; their skill-delivery mechanics are unchanged.

A skill that genuinely needs to run scripts declares `requiresExecution`. Attaching one to an agent while the **instance** rollout flag is off returns an advisory warning that the skill's shell/script steps will not run — it is advisory only, never a gate, and it keys on the instance flag, not on the agent's own execution posture or on executor readiness.

### Enforced-claims table

Every statement above, mapped to the symbol that enforces it, pinned at commit [`6285e014`](https://github.com/cinatra-ai/cinatra/commit/6285e0141cf2a34b4476832f698a3f0f6cf32890).

| Enforced statement | Enforcing symbol | Pinned source |
|---|---|---|
| A sandbox has no host bind mounts, asserted on every dispatch | `assertNoBindMounts`, called by `LocalDevSandboxWorker.runCommand` | [`l0-profile.ts`](https://github.com/cinatra-ai/cinatra/blob/6285e0141cf2a34b4476832f698a3f0f6cf32890/packages/execution-plane/src/l0-profile.ts#L214) · [call site](https://github.com/cinatra-ai/cinatra/blob/6285e0141cf2a34b4476832f698a3f0f6cf32890/packages/execution-plane/src/worker.ts#L124) |
| Non-root fixed UID, read-only rootfs, all caps dropped, no-new-privileges | `buildHardenedRunArgs`, `SANDBOX_RUNTIME_UID` | [`l0-profile.ts`](https://github.com/cinatra-ai/cinatra/blob/6285e0141cf2a34b4476832f698a3f0f6cf32890/packages/execution-plane/src/l0-profile.ts#L151) |
| No host environment crosses into the sandbox | `sandboxEnvironment` | [`l0-profile.ts`](https://github.com/cinatra-ai/cinatra/blob/6285e0141cf2a34b4476832f698a3f0f6cf32890/packages/execution-plane/src/l0-profile.ts#L100) |
| An image reference cannot be re-read as a `docker run` option | `assertSafeImageRef` | [`l0-profile.ts`](https://github.com/cinatra-ai/cinatra/blob/6285e0141cf2a34b4476832f698a3f0f6cf32890/packages/execution-plane/src/l0-profile.ts#L53) |
| The workspace is measured after every command; a normally-exited command over quota terminates the job (an unmeasurable workspace counts as within quota) | `measureWorkspaceKb`, applied in `LocalDevSandboxWorker.runCommand` | [`workspace.ts`](https://github.com/cinatra-ai/cinatra/blob/6285e0141cf2a34b4476832f698a3f0f6cf32890/packages/execution-plane/src/workspace.ts#L64) · [`worker.ts`](https://github.com/cinatra-ai/cinatra/blob/6285e0141cf2a34b4476832f698a3f0f6cf32890/packages/execution-plane/src/worker.ts#L164) |
| A caller with no attributable identity is refused the capability | `mintExecutionSession`, `UnidentifiableExecutionCallerError` | [`session.ts`](https://github.com/cinatra-ai/cinatra/blob/6285e0141cf2a34b4476832f698a3f0f6cf32890/packages/llm/src/execution-plane/session.ts#L140) |
| The session rides an HMAC-signed expiring carrier only the broker opens | `sealExecutionSession`, `openSealedSession` | [`session.ts`](https://github.com/cinatra-ai/cinatra/blob/6285e0141cf2a34b4476832f698a3f0f6cf32890/packages/llm/src/execution-plane/session.ts#L219) |
| A sandbox tool never reaches a provider on a non-injected path | `stripSandboxExecutionTools` | [`tool.ts`](https://github.com/cinatra-ai/cinatra/blob/6285e0141cf2a34b4476832f698a3f0f6cf32890/packages/llm/src/execution-plane/tool.ts#L136) |
| One shared seam mints every surface's session from the identity its issuer resolved (the issuer authorizes; this does not) | `resolveSurfaceExecutionBinding` | [`surface-execution-session.ts`](https://github.com/cinatra-ai/cinatra/blob/6285e0141cf2a34b4476832f698a3f0f6cf32890/src/lib/execution/surface-execution-session.ts#L42) |
| `none` puts the container on no network at all | `resolveEgress` (resolves the tier) + `buildHardenedRunArgs` (emits `--network none`) | [`egress.ts`](https://github.com/cinatra-ai/cinatra/blob/6285e0141cf2a34b4476832f698a3f0f6cf32890/packages/execution-plane/src/egress.ts#L64) · [`l0-profile.ts`](https://github.com/cinatra-ai/cinatra/blob/6285e0141cf2a34b4476832f698a3f0f6cf32890/packages/execution-plane/src/l0-profile.ts#L151) |
| The network a gateway tier attaches to is created `--internal` (no NAT), and an existing same-named network that is NOT internal is refused | `ensureInternalNetwork`, called by `startLocalGateway` | [`local-gateway.ts`](https://github.com/cinatra-ai/cinatra/blob/6285e0141cf2a34b4476832f698a3f0f6cf32890/packages/execution-plane/src/local-gateway.ts#L41) |
| A gateway-requiring tier with no gateway refuses the job | `resolveEgress` raises `EgressGatewayRequiredError`; `ExecutionBroker.exec` refuses on it | [`egress.ts`](https://github.com/cinatra-ai/cinatra/blob/6285e0141cf2a34b4476832f698a3f0f6cf32890/packages/execution-plane/src/egress.ts#L46) · [`broker.ts`](https://github.com/cinatra-ai/cinatra/blob/6285e0141cf2a34b4476832f698a3f0f6cf32890/packages/execution-plane/src/broker.ts#L367) |
| Per-job policy is registered before the sandbox runs; a failed registration refuses the command | `registerJobEgress` (the POST) + `ExecutionBroker.exec` (the ordering and the refusal) | [`egress.ts`](https://github.com/cinatra-ai/cinatra/blob/6285e0141cf2a34b4476832f698a3f0f6cf32890/packages/execution-plane/src/egress.ts#L121) · [`broker.ts`](https://github.com/cinatra-ai/cinatra/blob/6285e0141cf2a34b4476832f698a3f0f6cf32890/packages/execution-plane/src/broker.ts#L367) |
| The gateway denies by default (unattributed/unregistered 407; allowlist and quota 403) | `decide` | [`egress-gateway.cjs`](https://github.com/cinatra-ai/cinatra/blob/6285e0141cf2a34b4476832f698a3f0f6cf32890/packages/execution-plane/runtime/egress-gateway.cjs#L292) |
| Every destination is resolved and IP-pinned; the listed protected ranges are refused, even in allow-all | `resolvePinnedAddress`, `isProtectedAddress` | [`egress-gateway.cjs`](https://github.com/cinatra-ai/cinatra/blob/6285e0141cf2a34b4476832f698a3f0f6cf32890/packages/execution-plane/runtime/egress-gateway.cjs#L173) |
| Gateway allowlist matching is exact or dot-suffix only | `hostAllowed` (the gateway's own matcher) | [`egress-gateway.cjs`](https://github.com/cinatra-ai/cinatra/blob/6285e0141cf2a34b4476832f698a3f0f6cf32890/packages/execution-plane/runtime/egress-gateway.cjs#L70) |
| An audit row can only ever carry the listed identity/outcome fields and ten metadata keys | `toAuthzAuditEventInput` | [`broker.ts`](https://github.com/cinatra-ai/cinatra/blob/6285e0141cf2a34b4476832f698a3f0f6cf32890/packages/execution-plane/src/broker.ts#L144) |
| The executed command and the per-destination egress list never reach a durable row | `toAuthzAuditEventInput`, pinned negatively | [`audit-metadata-only.test.ts`](https://github.com/cinatra-ai/cinatra/blob/6285e0141cf2a34b4476832f698a3f0f6cf32890/packages/execution-plane/src/__tests__/audit-metadata-only.test.ts) |
| The audit write is best-effort: a sink failure never propagates, and repeated denied events are cooldown-suppressed | `createExecutionAuditSink` over `logAuditEvent` | [`execution-broker-construct.ts`](https://github.com/cinatra-ai/cinatra/blob/6285e0141cf2a34b4476832f698a3f0f6cf32890/src/lib/execution/execution-broker-construct.ts#L121) · [`audit.ts`](https://github.com/cinatra-ai/cinatra/blob/6285e0141cf2a34b4476832f698a3f0f6cf32890/src/lib/authz/audit.ts#L103) |
| The org-admin audit read projects a named column + metadata allowlist and scopes to the supplied org | `readExecutionAuditRows` (the caller is the authorization gate) | [`execution-audit-read.ts`](https://github.com/cinatra-ai/cinatra/blob/6285e0141cf2a34b4476832f698a3f0f6cf32890/src/lib/execution/execution-audit-read.ts#L73) |
| The executor registers only past a completed broker↔worker handshake | `runBrokerHandshake`, `executionBrokerPhases` | [`execution-broker-construct.ts`](https://github.com/cinatra-ai/cinatra/blob/6285e0141cf2a34b4476832f698a3f0f6cf32890/src/lib/execution/execution-broker-construct.ts#L331) · [`execution-broker.ts`](https://github.com/cinatra-ai/cinatra/blob/6285e0141cf2a34b4476832f698a3f0f6cf32890/src/lib/boot/phases/execution-broker.ts#L44) |
| Readiness is tri-state and fails closed to `unavailable` | `resolveExecutionEnvironmentReadiness` | [`environment-execution-service.ts`](https://github.com/cinatra-ai/cinatra/blob/6285e0141cf2a34b4476832f698a3f0f6cf32890/src/lib/execution/environment-execution-service.ts#L90) |
| A declared environment is refused, never silently downgraded to L0 | `resolveRunExecutionBinding` | [`resolve-run-execution-binding.ts`](https://github.com/cinatra-ai/cinatra/blob/6285e0141cf2a34b4476832f698a3f0f6cf32890/src/lib/execution/resolve-run-execution-binding.ts#L46) |
| An L1 layer mounts only after its signed provenance re-verifies, by digest | `resolveEnvironmentMount`, `verifyEnvironmentProvenance` | [`mount.ts`](https://github.com/cinatra-ai/cinatra/blob/6285e0141cf2a34b4476832f698a3f0f6cf32890/packages/execution-plane/src/environment/mount.ts#L81) · [`provenance.ts`](https://github.com/cinatra-ai/cinatra/blob/6285e0141cf2a34b4476832f698a3f0f6cf32890/packages/execution-plane/src/environment/provenance.ts#L79) |
| A build's `--build-arg` names are restricted to the proxy set, and `--secret`/`--ssh` are refused | `assertNoCredentialBuildArgs` (a name check, not a value check) | [`builder.ts`](https://github.com/cinatra-ai/cinatra/blob/6285e0141cf2a34b4476832f698a3f0f6cf32890/packages/execution-plane/src/environment/builder.ts#L101) |
| The cache key is the full effective build recipe | `computeEnvironmentRecipeKey` | [`recipe.ts`](https://github.com/cinatra-ai/cinatra/blob/6285e0141cf2a34b4476832f698a3f0f6cf32890/packages/execution-plane/src/environment/recipe.ts#L170) |
| One layer per (recipe, partition); references dedup across nullable holders | `environmentLayerStoreSchemaQueries` | [`environment-layer-schema.ts`](https://github.com/cinatra-ai/cinatra/blob/6285e0141cf2a34b4476832f698a3f0f6cf32890/src/lib/execution/environment-layer-schema.ts#L41) |
| A declaration is parsed fail-closed — one bad entry rejects the declaration | `parseExecutionEnvironment` | [`execution-environment.ts`](https://github.com/cinatra-ai/cinatra/blob/6285e0141cf2a34b4476832f698a3f0f6cf32890/packages/sdk-extensions/src/execution-environment.ts#L122) |
| A package-declared (or unreadable) manifest owns the environment and renders read-only; every other case is editable config | `resolveAgentEnvironmentAuthority` | [`execution-config.ts`](https://github.com/cinatra-ai/cinatra/blob/6285e0141cf2a34b4476832f698a3f0f6cf32890/packages/agents/src/execution-config.ts#L90) |
| An instance-local declaration on a packaged agent is labelled as such | `buildAgentExecutionConfigView` (`localDeclarationNote`) | [`agent-execution-config-view.ts`](https://github.com/cinatra-ai/cinatra/blob/6285e0141cf2a34b4476832f698a3f0f6cf32890/src/lib/execution/agent-execution-config-view.ts#L170) |
| Execution off plus a declared environment is refused at authoring and at the run seam | `parseAgentExecutionConfigSubmission`, `resolveRunExecutionBinding` | [`execution-config.ts`](https://github.com/cinatra-ai/cinatra/blob/6285e0141cf2a34b4476832f698a3f0f6cf32890/packages/agents/src/execution-config.ts#L266) |
| Staged skill files are digest-verified before write, and the volume is mounted read-only | `stageSkillsVolume` (digests) + `buildHardenedRunArgs` (`:/skills:ro`) | [`staging.ts`](https://github.com/cinatra-ai/cinatra/blob/6285e0141cf2a34b4476832f698a3f0f6cf32890/packages/execution-plane/src/staging.ts#L68) · [`l0-profile.ts`](https://github.com/cinatra-ai/cinatra/blob/6285e0141cf2a34b4476832f698a3f0f6cf32890/packages/execution-plane/src/l0-profile.ts#L151) |
| Injection is off unless the rollout flag is exactly `on` | `isExecutionPlaneRolloutEnabled` | [`policy.ts`](https://github.com/cinatra-ai/cinatra/blob/6285e0141cf2a34b4476832f698a3f0f6cf32890/packages/llm/src/execution-plane/policy.ts#L38) |

---

## Tier C — gated behind the rollout flag or a later slice

### The rollout flag is opt-in, and off by default

The plane's activation is a single environment variable, `CINATRA_EXECUTION_PLANE_ROLLOUT`, and it is **opt-in**: `isExecutionPlaneRolloutEnabled` enables the plane only for the exact string `on`. Unset, empty, `off`, `true`, `1`, `ON`, and `"on "` all leave it off. On an instance that has not set it:

- `executionBrokerPhases()` returns an **empty phase list** — not a phase that skips, no phase at all — so the boot sequence, the boot-state snapshot and `/api/health` are unchanged.
- No executor factory is registered, so `resolveExecutionEnvironmentReadiness` resolves `disabled` (or `unavailable` on an instance that opted in without a working handshake), and no `sandbox_execute` tool reaches any provider.
- Orchestration behaviour is byte-identical to an install without the plane.

This flag is a rollout gate, not the availability policy. The Tier A availability posture (on for every agent and chat surface, with a per-org/per-agent opt-out) describes what the plane does once an operator turns it on — it is not what a default install does today.

### What is wired, and what is not

- **Placement modes.** The persisted vocabulary is `remote | local-dev | disabled` (`readExecutionPlaneSettings`). Only `local-dev` and `disabled` are operable: `remote` renders on the settings screen, is not selectable, and the write path refuses it — the remote broker's service boundary lands with the CLI slice.
- **Admin surfaces.** `/configuration/execution` holds the placement/egress settings and a health page that re-runs the handshake and reads back org-scoped audit rows. The **per-org/per-agent availability opt-out** posture is honored at the injection point, and the per-agent posture is stored on the agent template; the org-level settings surface that resolves it lands later.
- **L1 declaration sources at the agent-run seam.** The declaration surfaces, the fail-closed parser, the immutable version snapshot, the trusted content-addressed builder, the durable layer store, and the per-agent configuration UI are merged, and a resolved declaration does build and mount. What is not fully wired is which declarations that seam can see: the agent-run bridge (`/api/llm-bridge`) passes only the **live template's** declared environment and the per-agent posture into `resolveRunExecutionBinding` — it does not pass the run's pinned version snapshot, and the seam takes no packaged-manifest input at all. A packaged-manifest or pinned-snapshot declaration therefore still resolves absent on that path and the run proceeds on L0.
- **The gateway's read-through package-registry cache** is a later slice. Attribution, allowlisting, byte quotas and SSRF defense are enforced today.
- **Durable artifact export/import** from a sandbox rides the objects/artifacts bridge and lands with that work. Until then, `stdout`/`stderr` are what a model brings back.
- **L3 named persistent workspaces** are deferred to a second phase; stateful workflows round-trip through artifact export/import rather than a shared durable workspace.

---

## The environment model

Tool persistence is answered by a tiered environment model. The layer vocabulary comes from the environment-layer store and the run profile, not from prose:

| Layer | What it is | Lifetime |
|---|---|---|
| **L0** | The platform-owned base sandbox image **every run gets**. The only image the worker runs commands over. | Platform release |
| **L1** | A **declared per-agent environment layered on L0** — an immutable, content-addressed image built `FROM` the digest-pinned L0 base. | Cached until the retention GC reaps it |
| **L2** | The per-run writable workspace volume. | The run |
| **L3** | Named persistent workspaces. Deferred to a second phase. | — |

### L0 — the base image

L0 is platform-owned, digest-pinned, and batteries-included. It ships a Python 3.12 base with `bash`, `curl`, `git`, `jq`, `ripgrep`, Node.js and `npm`, `pip`, and the common coreutils/findutils/grep/sed/unzip tooling, plus the fixed unprivileged runtime user ([`docker/sandbox/Dockerfile`](https://github.com/cinatra-ai/cinatra/blob/6285e0141cf2a34b4476832f698a3f0f6cf32890/docker/sandbox/Dockerfile)). Popular tools graduate into it over releases. **OS-level dependencies enter only here, at build time, with root** — a running sandbox has no root path at all. Production resolves the image by digest (`resolveL0ImageRef` reads `CINATRA_SANDBOX_L0_IMAGE`; the deployment owns the pin), and the worker records the digest that actually ran in every audit record, so the effective image is attributable even under a mutable local-dev tag.

### L1 — declared environments

An agent's runs often depend on a specific tool being present — "this agent does not work without `pandoc`". L1 is the answer: an agent declares the packages its runs require once, a trusted builder turns the declaration into an immutable, content-addressed layer, and every later run — and every same-recipe agent — mounts that layer instead of re-installing.

**Two authoring surfaces, one internal type.** A packaged agent declares `cinatra.execution.environment` in its manifest; a project agent declares the same thing in its in-app definition, stored on `agent_templates.execution_environment` (JSON as text, alongside the nullable `execution_enabled` posture — see [`migrations/core/core__0085_agent-template-execution-config.mjs`](https://github.com/cinatra-ai/cinatra/blob/6285e0141cf2a34b4476832f698a3f0f6cf32890/migrations/core/core__0085_agent-template-execution-config.mjs)). Both normalize through one fail-closed parser, `parseExecutionEnvironment`, to one canonical spec with three optional package managers:

- `os` — OS-level (Debian/apt) packages, installed **only** by the trusted builder as root at build time.
- `pip` — Python requirement specifiers; **registry installs only** — no direct-URL, VCS, or local-path forms, because the builder's egress is registry-allowlisted.
- `npm` — npm specifiers, under the same registry-only restriction.

Only an **agent** manifest may declare an environment. The parser is deliberately fail-closed: an unknown key, a malformed entry, or a declaration root that is present but not an object **rejects the whole declaration** rather than dropping a package — a silently-dropped dependency would produce a layer missing exactly what the author asked for. The per-manager grammars allowlist a conservative charset (shell metacharacters, option-injection dashes, and path/URL forms are refused at parse, never sanitized later), and per-manager entry counts and lengths are bounded.

**Package-declared vs instance-local.** Authority is resolved, never merged (`resolveAgentEnvironmentAuthority`):

| Situation | Authority | What the configuration surface does |
|---|---|---|
| The package manifest declares an environment | `manifest` | Renders **read-only** and names the review path: edit the manifest and publish a new version, riding the extension's own review and lock choreography. |
| The package manifest could not be read | `manifest` | Read-only, and the declaration is reported **unknown** — never as "declares nothing", which would render a confident empty recipe for a package that may well declare one. |
| A project agent, or a packaged agent whose manifest declares nothing | `config` | Editable in place, admin-gated; the next immutable version snapshot captures it. |

The third row is the **instance-local** case, and the surface says so plainly: a declaration added to a packaged agent that declares none of its own applies on this instance only, and a future package version that declares its own environment takes over. An operator must never read a local addition as something the package asked for.

**Starter templates.** Authoring a recipe from an empty box means guessing package names, so the configuration surface offers six named starting points — `Empty`, `Document conversion` (`pandoc`, `poppler-utils`, `texlive-xetex`), `Data analysis` (`matplotlib`, `numpy`, `openpyxl`, `pandas`), `Web fetching` (`beautifulsoup4`, `httpx`, `lxml`), `Media processing` (`ffmpeg`, `imagemagick`), and `Node tooling` (`prettier`, `typescript`). They carry **no privilege and no special cache treatment**: each is an ordinary declaration, and a saved one goes through exactly the same `parseExecutionEnvironment` call as a hand-typed entry. A test-time gate (`assertStarterTemplatesValid`) additionally holds every preset to that parser and to canonical form, so a preset can never hash differently from the same recipe typed by hand; it is a test, not a runtime check. Picking one prefills the editor; nothing is stored until a human saves.

**Execution off plus a declared environment is a contradiction, and it is refused.** The per-agent posture is three-valued — `inherit` (the stored column is `NULL`), `on`, `off`. An agent explicitly switched **off** cannot also declare an environment: `parseAgentExecutionConfigSubmission` refuses the save with an explanation rather than storing a recipe that could only be silently ignored, and `resolveRunExecutionBinding` carries the defence-in-depth arm — a run in that state is refused with `environment_agent_disabled`, never run without the packages it declared it cannot work without. An unrecognized posture value is refused too, never coerced to the permissive default.

**Content-addressed identity.** Canonicalization is identity-bearing — the spec is trimmed, deduped, and sorted — so two agents that declare the same packages in a different order share one cache entry. The cache key is the **full effective build recipe**: the canonical spec plus the L0 base digest, the builder version, the platform/arch, the resolved lock-manifest digests, and the build policy (`computeEnvironmentRecipeKey`). Any input change is a different layer, and same-recipe agents single-flight one build.

**The durable layer store** ([`src/lib/execution/environment-layer-schema.ts`](https://github.com/cinatra-ai/cinatra/blob/6285e0141cf2a34b4476832f698a3f0f6cf32890/src/lib/execution/environment-layer-schema.ts#L41)) makes the cache cross-process: `environment_layers` holds one row per `(recipe_key, partition)` with the image ref, image digest, signed provenance and last-used timestamp; `environment_layer_references` holds org-scoped references from the packages, templates and versions that hold a recipe. `partition` is `instance` (the shared sentinel) or `org:<id>` — the same recipe can exist as an instance-shared layer and as one or more org-partitioned layers for private packages, and one org's write can never clobber another's.

**Immutable version snapshots.** For a project agent the resolved spec is captured into the agent template's immutable version snapshot in canonical form. A run pinned to a version resolves its environment **exclusively from that snapshot, never the live template row**, so editing the template cannot swap the environment under a pinned run; a new version is a new recipe and a new cache key.

**The trusted builder.** It renders an image `FROM` the digest-pinned L0 base, uses root only at build time, and pins the fixed non-root runtime UID back on the final layer. Its egress is registry-allowlisted through the same attributing gateway the sandbox uses, on a verified internal network — a build with no gateway fails closed. **A build's arguments are restricted to proxy plumbing.** `assertNoCredentialBuildArgs` refuses any `--build-arg` whose *name* is outside the enumerated proxy set, and refuses `--secret`/`--ssh` forwarding outright. Read that as what it is — a **name** check, not a value check. It guarantees that nothing but proxy variables is passed; it cannot tell whether a credential was embedded inside an allowed proxy URL, so keeping one out of that value is the caller's responsibility. Every layer carries signed provenance — an HMAC over the recipe, image digest, partition and builder identity — that is re-verified before the layer is mounted, and the mount contract is that signed digest, never a mutable tag.

**Partitions, references, GC.** Layers are instance-shared by default; a recipe that installs a private-scoped package is org-partitioned with an instance-level share toggle. References are org-scoped: archiving an org drops only that org's references, never a shared layer (a restore is a cache hit or a lazy rebuild), and retention GC reaps only layers with no references left.

**Promotion.** When an agent repeatedly installs the same tool ad hoc — "`pandoc` on 6 of the last 10 runs" — the configuration surface renders the observation as a promotion candidate and offers one-click **Add**, which *prefills* the editor. The human still saves: an environment change is never silent and never model-driven, and an accepted promotion rides the agent's existing review path, landing as a new version → new recipe → new cache key. With the plane off there are no runs and therefore no observations, and the affordance renders an honest empty state rather than an invented suggestion.

### L2 — the per-run workspace

The L2 workspace is a named Docker volume mounted read-write at `/workspace` — the only writable persistence a sandbox has. It follows the **run**: keyed on the run id when the session carries one (so `pip install --user` and `npm install -g` persist across steps and turns within an agent run), and on the broker job id otherwise (chat and deterministic tasks). A new key is a fresh, empty volume: a workspace never leaks into another agent or a future run. This is also how a skill-less assistant installs and uses a tool ad hoc within one conversation — L1 is an optimization, never a precondition.

Workspaces are labeled for retention GC. Hard removal of a run puts its workspace on immediate GC via the broker's teardown hook; an in-flight run is not interrupted by an extension being archived, because the sandbox follows the run's lifecycle, not the extension's.

---

## Where to go next

- The platform security model, including the sandboxing summary and threat patterns: [Security](security.md)
- Authoring skill extensions: [Authoring skill extensions](extension-kinds/authoring-skill-extensions.md)
- Skills lifecycle and catalog: [Skills lifecycle](skills-lifecycle.md)
