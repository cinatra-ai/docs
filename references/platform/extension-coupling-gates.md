# Extension-coupling audit gates — classification, exemption policy, end-state

This document is the reference the extension-coupling gates point at. It
defines the shared reference taxonomy, the strict exemption policy, and the
**zero-floor end-state**: no hand-written host code imports or names a concrete
extension, no extension imports host `@/` modules / other extensions /
non-SDK first-party packages, and the gates are pinned so none ever can
again. The end-state was reached in BOTH directions of the
inversion-of-control (IoC) rule — core→extension and extension→host.

## The gates

| Gate | Direction | Unit | Baseline |
| --- | --- | --- | --- |
| `core-extension-instance-coupling-ban.mjs` | core (`src/` + `packages/`) naming a specific extension (string/JSX/prompt/metadata literal, path literal, or import) | `file :: kind :: value -> count` occurrences | `core-extension-instance-coupling-ban.baseline.json` — **PINNED EMPTY** |
| `core-extension-import-ban.mjs` | core (`src/`) importing an extension package | `file -> extension` edges | `core-extension-import-ban.baseline.json` — **PINNED EMPTY** |
| `extension-import-ban.mjs` | extensions importing host `@/` modules, other extensions, or non-SDK first-party packages | `extension -> module` edges in 3 dimensions | `extension-import-ban.baseline.json` — **PINNED EMPTY** |
| `required-extensions-cover-host-imports.mjs` | the prod bootable DECLARATION vs the live code surface | packages | live-derived (no baseline) + the **declaration equality guard** |

`discovery-dispatcher-bypass-ban.mjs` guards the runtime-discovery dispatcher
(its documented `SANCTIONED_READERS` allowlist is "sanctioned, never counted" —
distinct from the baseline, which is pinned EMPTY since the zero-tolerance flip).
`host-peer-value-import-ban.mjs` holds every serverEntry graph at 0 host-peer
value imports (SDK peers stay type-only).

## Enforcement model — the zero-floor end-state

FOUR baselines are PINNED EMPTY — zero is the floor AND the ceiling, in BOTH
directions of the IoC rule:

- **`core-extension-instance-coupling-ban`** (the instance-coupling flip): any
  non-comment occurrence of an extension package name or
  `extensions/<scope>/<name>/` path literal in core source fails CI
  immediately; a non-empty committed baseline is itself a failure;
  `--write-baseline` refuses non-empty output. The frozen `SCANNER_EPOCH`
  (=2) and the `CORE_EXT_INSTANCE_BAN_BASE` monotonic guard survive purely as
  tamper checks (fail-closed on unresolvable refs / any epoch mismatch).
- **`core-extension-import-ban`** (the import honest-zero flip, landed WITH
  the shared-lexer adoption + the last transport edges' removal): any
  core->extension import edge fails immediately; same non-empty-baseline and
  `--write-baseline` refusals; `CORE_EXT_BAN_BASE` kept as a tamper check.
- **`discovery-dispatcher-bypass-ban`** (the zero-tolerance flip): any
  non-sanctioned direct native-reader reference fails immediately.
- **`extension-import-ban`** (the extension→host direction, completing the IoC
  rule's zero floor in both directions): any current `hostInternal`,
  `crossExtension`, or `sdkOnly` edge fails immediately (the committed
  baseline is no longer consulted for violation detection); a committed
  baseline with any non-empty dimension is itself a failure;
  `--write-baseline` refuses non-empty output; `--strict-sdk-only` is retained
  as an accepted no-op (the `sdkOnly` dimension is unconditionally
  zero-tolerance — neither passing nor omitting the flag can weaken
  enforcement); the owner-ruled `STRICT_SDK_ONLY_ALLOWLIST` (EMPTY,
  self-policing via the stale-carve-out hard failure) is the only carve-out
  mechanism, scoped to the `sdkOnly` dimension exclusively; `IMPORT_BAN_BASE`
  survives purely as a fail-closed tamper check.

On top of the pinned-empty gates:
- the cover gate enforces the **declaration equality**
  `requiredExtensions == systemExtensions == lock` ON TOP of its live
  bootable-coverage derivation: the prod bootable declaration may not grow
  beyond the system set without an owner ruling that also declares the package
  a systemExtension. The equality pins the DECLARATIONS only — regrowth of
  hard-coded extension names in code is caught by the two pinned-empty
  coupling gates, and an undeclared hard import is caught by the live coverage
  derivation, not by the equality.

Changing any of this requires editing the gate code and its tests in a
reviewed PR — there is no data path (baseline, epoch, seed, regenerate) that
can raise a floor.

## Reference classification (shared taxonomy)

Defined in `scripts/audit/lib/extension-reference-classification.mjs` and used
by the coupling gates:

- **runtime-coupling** — core selects/loads/branches on a specific extension
  at runtime (named imports, loader maps, provider registration,
  prompt/dispatch literals). The default class; ZERO occurrences remain — any
  reappearance fails the pinned-empty gates.
- **mechanical** — re-export facades, hand-written inventories/catalogs, and
  dev-name lists. Counted exactly like runtime-coupling — never exempt; at
  ZERO since the mechanical-cleanup phase.
- **permanent-exempt** — never counted. Strict, owner-ruled set; see below.

## Strict exemption policy

Permanently exempt are ONLY:

1. **The generator-emitted file list** — the exact files
   `scripts/extensions/generate-extension-manifest.mjs` emits (the shared
   `GENERATED_MANIFEST_FILES` list: `extensions.server.ts`,
   `connector-setup-pages.ts`, `extensions.client.tsx`,
   `widget-stream-public-paths.ts`, `agent-bindings.ts` under
   `src/lib/generated/`, plus the ONE package-local emission
   `packages/objects/src/generated/artifact-floor.ts` — the semantic-floor
   binding lives inside `packages/objects` because that package is consumed
   from graphs where the host `@/` alias does not resolve; same generator,
   same byte pin, same explicit-list discipline — the exempt class is the
   EMITTED LIST, not a directory). Names there are generator output — the
   legitimate data-driven install list, not hand-coupling. The owner ruling
   made the generator-emitted set the ONE permanent-exempt class (the sibling
   generated maps are part of it, not a separate concession), unifying the
   instance-coupling and import-ban exempt sets. Two integrity guards keep the
   exemption honest:
   - the exemption is an EXPLICIT file list, never a directory prefix — a
     hand-added extra file under `src/lib/generated/` (or any `generated/`
     dir) is counted (default class runtime-coupling → hard fail);
   - the listed files are pinned to the generator's byte-exact output by the
     FAIL-CLOSED `generate-extension-manifest.mjs --check` CI step (drift,
     missing file, or catalog-parity break fails CI).
2. **The documented data-contract-ID allowlist**
   (`DATA_CONTRACT_ID_ALLOWLIST`) — stable string identifiers that embed an
   extension name as a frozen serialization/compatibility contract, NOT as
   runtime selection. Every entry must carry a written justification (the gate
   hard-fails on an unjustified entry), entries are added only with an owner
   ruling, stale entries hard-fail until removed, and allowlisted occurrences
   are reported separately from counted ones. IDs may contain ONLY the
   boundary alphabet `[A-Za-z0-9_.:/@-]` (`DATA_CONTRACT_ID_ALPHABET_RE`) —
   enforced as a structural defect — so the exact-ID masking can never
   prefix-mask a longer ID past a non-alphabet character. **EMPTY at the
   zero-floor end-state** — it stays empty unless an owner ruling mints an
   entry.
3. Test files (`*.test.*`, `*.spec.*`, `__tests__/`, `__mocks__/`, `tests/`)
   and the `extensions/` tree itself (an extension naming itself is fine).

No facades, no inventories, no dev-name lists are exempt — they are counted
(`mechanical`) and hard-fail if they ever reappear.

Known, documented residual lexer limitation: JSX TEXT is not modeled by
`lib/strip-comments.mjs` (that needs a JSX-aware parser), so a named-extension
reference appearing in JSX text AFTER a bare non-URL `//` on the same line
would be under-counted. No such case exists in the tree. There is no
epoch-recompute path: if a future JSX-aware lexer reveals references, they
must be fixed in the same PR that lands the lexer (the floor cannot rise).
That policy was exercised by the import-ban scanner itself: its legacy regex
stripper (blind after a line comment containing a literal `/*`) was replaced
by the shared lexer in the SAME PR that removed the four transport-DI edges
it had been hiding — every CORE-side coupling scanner (instance-coupling,
import-ban, the cover gate's hard-import scan) now runs the shared lexer.
(`extension-import-ban` — the reverse direction — still strips comments via
its own inventory tooling; its floors are PINNED EMPTY since the
extension→host flip, so a stripper correction there that reveals edges must
land WITH those edges' removal in the same PR — the identical
fix-with-the-reveal policy, with no floor that can rise.)

## Pinned floors — the zero-floor end-state

| Gate | Pinned floor | Direction |
| --- | --- | --- |
| `core-extension-instance-coupling-ban` | **0 occurrences / 0 keys / 0 files** | PINNED EMPTY |
| `core-extension-import-ban` | **0 edges / 0 files** | PINNED EMPTY (honest under the shared lexer) |
| `discovery-dispatcher-bypass-ban` | **0 files** (5 documented sanctioned readers, justified in-gate) | PINNED EMPTY |
| `extension-import-ban` | **0 `@/` + 0 cross-extension + 0 sdkOnly** (allowlist EMPTY) | PINNED EMPTY |
| `host-peer-value-import-ban` | **0** over all serverEntry graphs | hold at 0 |
| cover gate declarations | **requiredExtensions == systemExtensions == lock == 8** (0 hard-imported, 8 generated-required, 0 root-dep; every other extension guardedOptional/acquirable-on-demand) | equality, live-enforced |
| Root + package-level concrete connector `workspace:*` deps | **0** | hold at 0 |

The journey (for the record): the corrected instance-coupling baseline started
at **349 occurrences / 96 import edges**; over multiple decoupling phases —
plus a lazy/guarded cutover — it was driven down through an intermediate
166/41 floor and finally emptied to zero pinned floors across all six gates.
The core→extension direction was emptied in stages: a nango serverEntry cutover
(import-ban 10→0), provider-adapter extraction, a transport dependency-injection
inversion (import-ban pinned empty + shared lexer adopted), connector-edge and
catalog-metadata cleanup (the `requiredExtensions` floor of 8 reached),
agent-identity decoupling (the single largest drop), and an
artifact/blog/seed tail that emptied the baseline; a final flip pinned the
zero and the declaration equality. `requiredExtensions` shrank 16 → 8 ==
`systemExtensions` along the same train.

The REVERSE direction (extension→host) drove `extension-import-ban`'s
`hostInternal` dimension **16 → 12 → 8 → 4 → 0 → PINNED EMPTY** across five
stages: CRM ctx-port adoption plus two test re-groundings; the Drupal family
(a Drupal MCP service extension + a new Drupal widget-auth service); the
WordPress family (a WordPress MCP connection-admin extension + new
WordPress content and widget-auth services); the transport tail (new GitHub /
LinkedIn / YouTube connection services + the external-MCP-registry read
surface); and the pinned-empty flip (`crossExtension` and `sdkOnly` were
already empty). All FOUR coupling baselines are pinned empty from that flip
onward.

## End-state record — how core reaches extensions now

The residual floor register is retired (nothing residual is left). The
SANCTIONED inversion-of-control paths, each with its own guard:

- **The generated manifest tree** (`GENERATED_MANIFEST_FILES`): the generator
  — driven by extension `package.json` declarations — is the ONE place
  concrete extension names appear outside `extensions/` and tests. Byte-pinned
  by the fail-closed `generate-extension-manifest.mjs --check` CI step;
  loader entries carry generator-owned `resolution` metadata
  (`required` for `cinatra.systemExtensions` members, else `guardedOptional`
  routed through the standardized degraded-result guard and proven degradable
  by the generated test). The presence-degraded build job asserts the
  regime-aware emission (system-only universe ⇒ zero guarded loaders).
- **The capability registry**: connectors/agents self-register surfaces from
  their `serverEntry` `register(ctx)` (nango-system, llm-provider-surface,
  crm-list-reader, email-sender-identities, appointment-schedules, transport
  deps, …); the host publishes per-concern `@cinatra-ai/host:*` services
  (`register-host-connector-services.ts` — names NO extension package) and
  resolves extension surfaces at call time with established fail-loud or
  degrade-to-empty semantics per consumer. The legacy delegating-adapter
  capability id is FULLY retired (contract removal followed by compat-shim
  removal — the id resolves to nothing; a pre-removal runtime package-store
  digest gets a capability-resolution miss at call time and must be refreshed
  from the marketplace).
- **Manifest metadata bindings**: `cinatra.fieldRenderers`, `cinatra.roles`,
  `cinatra.facadePrimitives`, `cinatra.devCliModules` — validated fail-closed
  at generation (`scripts/extensions/agent-binding-kinds.mjs` etc.), emitted
  as pure data (`agent-bindings.ts`, `artifact-floor.ts`), resolved by
  neutral host primitives (`agent-roles.ts`, `extension-roles.ts` — fail-loud
  for system-required roles, degrade for optional ones). Runtime-installed
  packages contribute renderer bindings through the installed-package
  collector (Source B); roles bind from build-time presence (documented
  limitation).
- **Presence-conditional host surfaces**: seeds
  (`scripts/seed-lib/extension-presence.mjs` — skip-with-notice, determinism
  pinned for both universes), the connectors catalog (derives
  `primitiveOverrides` from manifests), `/connectors` readiness (generated
  loader maps).

**How extensions reach host capability now (the end-state — the former "one
standing non-zero floor" register entry is retired; the owner ruled
zero-floor in both directions and the staged work delivered it):** the
SANCTIONED extension→host paths, each grant- or contract-guarded:

- **`register(ctx)` host ports** (`ExtensionHostContext`,
  `packages/sdk-extensions/src/host-context.ts`): `authSession`, `jobs`,
  `nango`, `capabilities`, `mcp`, … — grant-gated by manifest
  `requestedHostPorts`.
- **Per-concern `@cinatra-ai/host:*` services** published at boot by
  `src/lib/register-host-connector-services.ts` (SDK contract types in
  `packages/sdk-extensions/src/host-connector-services-contract.ts`,
  publication asserted member-by-member by
  `src/lib/__tests__/host-connector-services-publication.test.ts`), consumed
  through each connector's `deps.ts` slot (namespaced+versioned `globalThis`
  Symbol, bound lazily and fail-loud by the serverEntry `register(ctx)`;
  SDK imports in serverEntry graphs stay type-only — held at 0 by
  `host-peer-value-import-ban`). Connectors keep STRUCTURAL local types, so
  no SDK type import is needed to compile against an older host.
- **Frozen pure-data contract ids** (queue names, config keys): inlined
  connector-local constants documented as serialization contracts (e.g. the
  `twenty-pointer-repair` job name), with the host registry
  (`BACKGROUND_JOB_NAMES`, …) staying the single authority.

## Scanner correctness (historical)

The instance-coupling scanner previously stripped comments with a regex pair
that was not lexical-context aware; the shared single-pass lexer
`scripts/audit/lib/strip-comments.mjs` fixed two failure classes that hid
real references (a `/*` inside a line comment swallowing following code; a
`//` inside a string swallowing the line). The recomputed baseline after the
fix was a one-time RISE sanctioned by bumping `SCANNER_EPOCH` 1 → 2 in the
same PR. The zero-tolerance flip FROZE the epoch at 2 and retired the
growth allowance; the zero-floor flip pinned the empty baseline, so the
epoch survives purely as a tamper check on the committed baseline document.

## Reproduction

```sh
# end-state (all should pass / print the pinned floors above)
node scripts/audit/core-extension-instance-coupling-ban.mjs
node scripts/audit/core-extension-import-ban.mjs
node scripts/audit/discovery-dispatcher-bypass-ban.mjs
node scripts/audit/extension-import-ban.mjs --strict-sdk-only
node scripts/audit/host-peer-value-import-ban.mjs
node scripts/audit/required-extensions-cover-host-imports.mjs   # 8 == 8 == 8
node scripts/extensions/generate-extension-manifest.mjs --check # fail-closed integrity of the exempt generated tree

# with the CI monotonic base-ref tamper checks
CORE_EXT_INSTANCE_BAN_BASE=origin/main node scripts/audit/core-extension-instance-coupling-ban.mjs
CORE_EXT_BAN_BASE=origin/main node scripts/audit/core-extension-import-ban.mjs
DISCOVERY_BYPASS_BASE=origin/main node scripts/audit/discovery-dispatcher-bypass-ban.mjs
IMPORT_BAN_BASE=origin/main node scripts/audit/extension-import-ban.mjs --strict-sdk-only

# regenerating a pinned-empty baseline REFUSES non-empty output
node scripts/audit/core-extension-instance-coupling-ban.mjs --write-baseline
node scripts/audit/core-extension-import-ban.mjs --write-baseline
node scripts/audit/extension-import-ban.mjs --write-baseline
```

The extension source tree must be cloned back first
(`node scripts/ci/sync-dev-extensions.mjs`) or the gates fail closed.
