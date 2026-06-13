# Extension IoC Safeguards — keeping the extension system truly extensible

This page is the durable control that keeps the extension system extensible: an
**executable definition** of "extensible", the **CI gates** that make a
regression un-mergeable, and the **review contract** every change is held to. A
genuinely extensible system is the prerequisite for live runtime install and
uninstall — you cannot hot-uninstall a capability that core has statically wired.

## The principle

Core defines the **kinds** of extension (agent / connector / artifact / skill /
workflow) and discovers **instances** dynamically from the `installed_extension`
manifest. Core must **never** name, import, or hardcode a *specific* extension
instance. Capabilities come from the manifest plus the per-kind native stores via
the runtime-discovery dispatcher — never from `if (packageName ===
"@cinatra-ai/foo")`, a hardcoded `@scope/pkg` string, or an
`extensions/<scope>/<name>/…` path.

## The single active-manifest dispatcher (split-brain guard)

There is exactly one discovery dispatcher,
`discoverActiveExtensionCapabilities`, and it is the only authority on "what is
live right now". It resolves discovery as:

```
discovery = (installed_extension rows with status active|locked)
            ∩ (per-kind visible native rows for the actor/scope)
```

This intersection is the **split-brain guard**. The canonical
`installed_extension` manifest is the lifecycle authority; the per-kind native
store holds the kind's content (an agent template, a connector config, an
artifact renderer, a skill, a workflow template). Neither side alone may decide
visibility:

- An **archived or uninstalled** extension is suppressed from discovery even if a
  stale native row survives — the manifest side of the intersection is empty.
- A **`locked`** extension stays discoverable (it is still live) — `locked` is in
  the `active|locked` set.
- A native row with **no manifest row** is not discovered — discovery never
  surfaces ungoverned content.

Because every surface goes through this one dispatcher, archive / uninstall /
restore take effect immediately and uniformly, with no surface holding its own
divergent view of "what is installed".

## The executable definition of "extensible" (CI-enforced)

"Extensible" is the **conjunction of these four checks**, all required in CI. If
they pass, the system is extensible by definition; if any fails, it is not.

| Control | What it proves | Where |
|---|---|---|
| **Runtime contract** — golden conformance test | discovery = lifecycle-live manifests (`active\|locked`) ∩ per-kind visible native rows; archive / uninstall **suppress** stale native rows; `locked` stays discoverable | `packages/extensions/src/__tests__/extension-discovery-conformance.test.ts` (the **Canonical extension invariants** required job) |
| **Structural contract 1** — import-ban | **no** core `import` of a specific extension package | `scripts/audit/core-extension-import-ban.mjs` (baseline pinned EMPTY) |
| **Structural contract 2** — instance-coupling | **no** core **string / path** reference to a specific extension instance | `scripts/audit/core-extension-instance-coupling-ban.mjs` (baseline pinned EMPTY) |
| **Structural contract 3** — discovery-bypass | **no** surface reads a native store directly instead of the dispatcher | `scripts/audit/discovery-dispatcher-bypass-ban.mjs` (baseline pinned EMPTY) |

The runtime conformance test is the canonical **behavioral** truth: it asserts
the discovery = active-manifests ∩ visible-native-rows intersection directly,
including that an archived or uninstalled extension's stale native rows are
suppressed and that `locked` rows remain discoverable. The three structural gates
are the canonical **structural** truth.

### The static-list / instance-naming bans

The two coupling vectors that let core drift back toward naming a specific
extension are banned outright:

- **Import-ban** — no core `import` resolves to a specific extension package.
  Core depends on the SDK contract and the dispatcher, not on any one extension.
- **Instance-coupling ban** — no core **string literal, JSX text, schema
  description, prompt, path, or package-metadata branch** names a specific
  extension instance. This closes the gap that a pure import-ban misses (a
  hardcoded package name in a string, or a hand-built `extensions/<scope>/<name>`
  path).

Both baselines are now **pinned EMPTY** — the zero-floor end-state. The
zero-tolerance ratchet already drove the residual coupling (hundreds of
occurrences at the start of the cutover) down to **zero**, and the gates have
since flipped to the honest-zero contract: **any** current core→extension
import or instance reference fails CI immediately (there is no tolerated set
left to diff against), a non-empty committed baseline is itself a hard failure,
and `--write-baseline` refuses to write a non-empty baseline. **Zero is the
floor and the ceiling.** The monotonic guards (`*_BASE` env compared against the
base ref, with a fail-closed `rev-parse`, plus the frozen scanner epoch) survive
only as tamper checks — a scanner fix that reveals a previously hidden reference
must land in the same change that removes it (or routes it into the documented,
currently-empty data-contract-ID allowlist).

### The `@/`-import ban (core stays decoupled from extensions)

Extensions are forbidden from reaching into core via the `@/` app alias. An
extension consumes the host only through the SDK port surface it is granted
(`ctx.settings`, `ctx.secrets`, `ctx.objects`, `ctx.mcp`, and the rest of the 14
host ports on SDK ABI 2), never through a direct `@/lib/...` or
`@/components/...` import. This keeps the dependency arrow pointing one way:
extensions depend on the SDK; core depends on neither a specific extension nor an
extension's internals. It is what makes an extension cleanly extractable into its
own package and cleanly removable at runtime.

## The standing review contract

Every change touching extensions or discovery is held to this checklist. A "no"
on any line blocks the change.

1. **No instance naming.** No core import, string literal, JSX text, schema
   description, prompt, path, or package-metadata branch names a *specific*
   extension instance. The only sanctioned exceptions are the explicit
   generator-emitted manifest files (the data-driven install list, not the whole
   `src/lib/generated/` directory) and the documented data-contract-ID allowlist
   (currently empty; entries are minted only by owner ruling). There is no
   tolerated "existing debt" set left — the baseline is empty.
2. **Discovery via the dispatcher.** Discovery surfaces call
   `discoverActiveExtensionCapabilities`; direct native readers are allowed
   **only** inside the sanctioned per-kind handler `listActive` facet.
3. **Scope preserved.** Discovery passes `actor` / `scope` and preserves
   visibility filtering; no unscoped native reads.
4. **Lifecycle authority.** Archive / uninstall / restore use the canonical
   `installed_extension` manifest as the lifecycle authority; stale native rows
   must not reappear in discovery (no split-brain).
5. **Kind-generic, not instance-specific.** Per-kind code is generic over the
   kind; instance behavior comes from the extension's manifest / capabilities /
   metadata, never `if packageName === …`.
6. **Generic routing.** UI / render / tool routing goes through generic
   capability and renderer registries; a package-prefixed renderer key in core
   is a banned instance reference (the empty instance-coupling baseline catches
   it) — route by capability/kind, not by package name.
7. **New kinds.** A genuinely new extension *kind* ships a conformant `listActive`
   facet plus a per-kind intersection test. (New *instances* need no code — that
   is the point.)
8. **Baselines stay at zero.** The structural baselines are pinned empty: a
   change may never introduce a core→extension import, instance reference, or
   discovery bypass, and may never produce a non-empty committed baseline. A
   scanner fix that surfaces a previously hidden reference lands in the same
   change that removes it (or owner-routes it into the data-contract-ID
   allowlist).
9. **CI wiring is part of the contract.** The gates and their tests stay required
   checks.

## How to decouple (the cutover pattern)

When a surface statically couples to an extension instance: replace the hardcoded
reference with a **manifest / registry lookup** (the dispatcher for discovery; the
catalog or native store via the kind handler for content). Because the baselines
are pinned empty, there is nothing to regenerate — the gate already refuses every
instance reference, so the decoupled state is the only state that passes. Each
removed reference is permanent: the zero floor cannot let it back.

---

See also: [developer guide index](../../guides/developer/README.md) ·
[Extensions engineering reference](./extensions.md) ·
[Extension lifecycle and distribution](./extension-lifecycle.md) ·
[Extension access contract](./extension-access-contract.md)
