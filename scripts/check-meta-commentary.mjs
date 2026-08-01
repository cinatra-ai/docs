#!/usr/bin/env node
// scripts/check-meta-commentary.mjs
//
// CI gate for cinatra-ai/docs#114: published, user-facing pages must not carry
// meta/implementation commentary about how the DOCS THEMSELVES are produced,
// compiled, mirrored, or maintained — generation mechanics ("this page is
// compiled from…"), "forthcoming"/placeholder transition notes, maintenance-
// process references, and editorial TODOs. Product content that happens to use
// words like "compiled" or "generated" to describe how CINATRA (the product)
// works is explicitly not in scope — see the allowlist for the verified false
// positives this repo actually has.
//
// The one sanctioned exception (owner ruling, #110 / #114): a page whose own
// purpose IS describing how to contribute to this docs site may discuss docs
// mechanics. Those paths are skipped entirely by design (SKIP_PATHS below) —
// not run through the pattern check at all, and not something a PR can widen
// by adding an allowlist entry.
//
// TWIN RELATIONSHIP (cinatra-ai/ci scripts/check-meta-commentary.mjs). The org
// reusable in cinatra-ai/ci is the vendored twin of this check: it is what every
// OTHER repo's published Markdown is scanned with, and a widened pattern list
// lands THERE first, because caller repos enforce the list at the SHA they pin.
// The two files were byte-identical through docs#119 and are NOT identical any
// more; what is kept in sync is the PATTERN LIST and the documented policy
// below, plus the line-pinned allowlist semantics and the reviewBy-expiry
// handling. The recorded, deliberate divergences:
//
//   - SCAN SCOPE. This check derives a fixed REPO_ROOT from its own location and
//     scans the WHOLE tracked tree — the docs repo IS the published surface. The
//     ci engine scans a caller-supplied `--docs <dir>` or a `--paths <spec>` SET,
//     resolved against the process cwd (the caller repo checkout), because a
//     caller repo publishes only part of its tree. `--paths` exists here too, but
//     only for the parity harness; the gate itself never passes it.
//   - PARITY IS ASSERTED, NOT ASSUMED (cinatra-ai/docs#160 AC2). The two engines
//     could always have drifted apart silently. scripts/check-meta-commentary-parity.mjs
//     now runs THIS engine over a corpus that is byte-identical in both repos and
//     requires it to reproduce a verdict that is also byte-identical in both. A
//     one-sided edit to the corpus, the verdict or the harness fails a digest
//     check in the repo that made it.
//   - SKIP_PATHS. This check skips the two contributor-docs pages above (the
//     owner-sanctioned #114 exception). The ci twin's set is deliberately EMPTY:
//     an integration `docs/` is the product-only page contract with no
//     docs-about-docs pages, so it is stricter, never weaker, on the same files.
//   - CLI SURFACE / EXIT CODES. This check takes only `--allowlist` / `--now`
//     and exits 0 or 1; the ci engine adds `--docs` / `--paths` / `--help` and a
//     config-error exit 2, which exist only because its scan scope is caller-
//     configured. There is nothing here to configure.
//   - ALLOWLIST WIRING. This repo's allowlist is a real, populated file at the
//     default path and its loader treats any read failure as an empty allowlist.
//     The ci engine's allowlist is OPTIONAL per caller repo, so it separates an
//     absent file (empty allowlist) from a present-but-unreadable one (a hard
//     config error). That loader difference is out of scope for a pattern sync
//     and is left as-is here.
//
// WHAT THE PATTERN LIST COVERS, AND WHAT IT DELIBERATELY DOES NOT (docs#156
// AC5). Three violation classes are enforced; the rule-outs are as much a part
// of the policy as the patterns, because a pattern that fires on ordinary
// product prose costs more than the violation it catches.
//
//   1. DOCS-PRODUCTION META (the original #114 class) — how the page itself is
//      produced: "compiled from", "published from", "do not hand-edit", "this
//      page is generated…", "canonical source".
//      This class covers ASSET-PRODUCTION notes too ("the banner PNGs are
//      generated from the brand kit — never hand-edit them"): a published
//      surface carries no production note, so such a note is REMOVED, not
//      exempted, and needs no separate pattern (`generated from` /
//      `do not hand-edit` already match it).
//
//   2. TRANSITION / IN-FLIGHT NOTES — prose that narrates work in flight rather
//      than the capability as it stands: "forthcoming", "coming soon",
//      "(pending)", "to be added", and the rephrasings AC5 adds — "still
//      landing", "not yet landed", "is landing separately/in a later release".
//      A published page states what the product does; a roadmap state ages into
//      a lie the moment the work ships.
//
//   3. PLANNING PROVENANCE — internal decision-process vocabulary in published
//      prose: a capability described by the work item that produced it or the
//      decision that approved it ("epic #123 … landed", "the ratified
//      claim-only mode", "the decisions below are ratified", "per the ruling")
//      instead of by what it does. A reader of a published guide is not a
//      participant in the planning process and cannot resolve those references.
//
// These are lexical heuristics, not semantic judgements. The check cannot know
// that "#1620" names a work item, that "landed" describes it, or that a
// "decision" is internal. What it requires instead is a BOUND ADJACENCY — a
// planning noun directly against the number, a history verb reachable from that
// reference across only punctuation and auxiliaries or a linking preposition,
// "ratified" inside a short unbroken window of internal decision vocabulary.
// That is a proxy for the relation, not proof of it; bare same-line proximity
// was rejected because it fails benign prose ("See issue #123 for
// troubleshooting. If the webhook has not landed after five minutes, retry.").
//
// RULED OUT — candidates considered for classes 2 and 3 and deliberately NOT
// patterned, each because it fires on legitimate published product prose:
//   - Bare "land"/"landed"/"landing". Real published pages say "the run tells
//     you when it lands", "an approval landed", "if you are landing here for
//     the first time". Class 3 therefore requires the bound work-item relation
//     described above; class 2 requires the explicit transition phrase.
//   - "still in flight", "yet to land" and bare "landing later" — commoner in
//     runtime prose ("requests still in flight are allowed to complete during
//     shutdown", "events yet to land remain queued", "delayed events are
//     landing later") than in roadmap prose.
//   - "no need to hand-edit X" — advisory product prose, not a production
//     instruction; only the prohibition spellings ("do not"/"never") are class 1.
//   - A CHANGELOG entry naming a released version — "streaming support landed
//     in 2.0" — is OUT (product history of the SOFTWARE, tied to a version a
//     reader can install). What stays IN, on a CHANGELOG as much as on a guide,
//     is history tied to an INTERNAL work item ("landed with epic #123"): the
//     reference is unresolvable to a reader either way.
//   - An UNQUALIFIED work-item link with no history claim (a "see #123 for the
//     design" cross-reference) stays OUT: a bare `#123` is ambiguous — it is
//     also a heading anchor, a CSS colour, a footnote — so a blocking pattern on
//     it would fire on ordinary text.
//     SUPERSEDED IN PART (cinatra-ai/docs#160 AC4): the REPO-QUALIFIED spelling
//     (`cinatra#1607`, `cinatra-ai/cinatra#1795`) is now IN — see
//     `qualified_workitem_citation` in the pattern list. docs#156 ruled the whole
//     class out on precision grounds; docs#160 re-decided it on evidence. The
//     qualified form is structurally unambiguous, it was the exact form every
//     real occurrence took across this corpus, and a reader of a published page
//     cannot resolve it — the same defect that makes an acceptance-criterion or
//     ruling citation a violation. The rule-out is NARROWED to the bare `#123`
//     form, not reaffirmed wholesale. All 13 qualified citations this repo
//     carried were removed in the same change; the ledger is at
//     .github/meta-commentary-sweep-ledger.json.
//   - Bare "ratified", and "ratified" next to EXTERNAL-standards vocabulary.
//     "The connector implements the ratified OAuth 2.1 specification" and "the
//     security policy was ratified by the standards committee" are ordinary
//     technical prose, so class 3 fires only when "ratified" sits within two
//     tokens of INTERNAL decision vocabulary (mode / decision / ruling), across
//     at most one hard wrap that does not cross into another list item,
//     heading, quote or table row. "Only ratified algorithms run in FIPS mode"
//     and "algorithms ratified\nby NIST run in FIPS mode" both stay green.
//   - Any compound noun starting "the decision …": "following the decision
//     tree, pick the matching branch", "following the decision returned by the
//     policy engine". The ruling pattern requires the reference to TERMINATE
//     at the noun (punctuation, end of line, "that", or a date), so every such
//     continuation stays green.
//   - CAPABILITY-BOUNDARY statements — "X is not yet supported", "not yet
//     available", "not yet shipped". These describe what the product does
//     TODAY, which is exactly what a published page is for; only the in-flight
//     narration ("… because the work is still landing") is the violation.
//
// Deliberately "cheap", not exhaustive (same spirit as check-cited-paths.mjs):
//   - Pattern-based phrase matching, not real NLP; a rephrased violation can
//     slip through, and a legitimate sentence can coincidentally match.
//   - A small hand-maintained allowlist file covers verified exceptions, each
//     pinned to the exact full source line the match sits on (so a second,
//     unrelated line matching the same phrase is NOT silently covered by the
//     first line's sign-off) and carrying an owner and a reviewBy date. Once
//     reviewBy passes, the entry stops suppressing — it does not silently
//     become permanent — see .github/meta-commentary-gate-allowlist.json.
//
// HTML SURFACES (cinatra-ai/docs#160). This repo does not publish only Markdown:
// the Application Design reference pages under references/design/ ship as HTML and
// are part of the published site. Tracked `.html` / `.htm` is therefore scanned
// with the same pattern list, the same line-pinned allowlist semantics and the
// same reviewBy expiry. HTML is reduced to its PROSE first by
// scripts/lib/html-text.mjs, whose header carries the full per-construct contract
// (visible text and comments IN, `<script>`/`<style>` and machine attributes OUT,
// entities decoded, inline tags transparent, block tags a hard separator). That
// file is byte-identical to the cinatra-ai/ci twin's copy. Reporting stays on the
// SOURCE file and line: every extracted character carries the source offset it
// came from, so a violation names a line a human can open and the allowlist still
// pins the full raw source line.
//
// Usage:
//   node scripts/check-meta-commentary.mjs [--allowlist <path>] [--now <ISO-date>]
//   node scripts/check-meta-commentary.mjs --print-files    # the exact read set
//
// Parity/testing only: `--paths <spec>` narrows the scan to a literal set, and
// `--scan-fixtures` turns off the fixture-prefix skip so the parity corpus can be
// scanned deliberately. The gate never passes either.

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { extractHtmlText, isHtmlPath } from "./lib/html-text.mjs";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

// Pages whose own purpose is describing how to contribute to this docs site —
// the owner-sanctioned exception (cinatra-ai/docs#114). Skipped entirely, not
// allowlisted line-by-line: these pages are ABOUT docs mechanics on purpose.
const SKIP_PATHS = new Set([
  "guides/developer/contributing.md",
  "references/platform/integration-docs-contract.md",
]);

// The parity corpus (docs#160 AC2) is a set of PLANTED violations whose whole
// purpose is to be red: it is test input, not a published page, and the site
// does not serve `scripts/`. Skipped by prefix so the corpus can grow without
// touching this list. This is the ONLY prefix skip, and it is not a policy
// exemption — no published tree lives under it.
const SKIP_PREFIXES = ["scripts/__fixtures__/"];

function isSkipped(file, scanFixtures) {
  if (SKIP_PATHS.has(file)) return true;
  // The fixture-prefix skip exists so planted test input does not red the gate.
  // The parity harness scans that input DELIBERATELY, so it — and only it —
  // turns the prefix skip off. The two contributor-docs SKIP_PATHS above are the
  // owner-sanctioned policy exception and are never switchable.
  if (scanFixtures) return false;
  return SKIP_PREFIXES.some((prefix) => file.startsWith(prefix));
}

const DEFAULT_ALLOWLIST_PATH = ".github/meta-commentary-gate-allowlist.json";

// [id, regex, human description]. Case-insensitive unless noted. Keep additions
// anchored to a real violation (issue #114) or a real reintroduction risk —
// a broad single-word match on "compiled"/"generated"/"sync"/"mirror" alone
// false-positives constantly against this repo's product/technical content
// (OAS compilation, connector sync, dashboard mirroring, and the like), which
// is why every pattern below is a multi-word phrase or a self-referential
// "this page ... is generated/compiled/..." combination.
const PATTERNS = [
  // docs#156 AC5: tolerate a single -ly adverb and AT MOST ONE hard wrap between
  // the two words — "generated deterministically\nfrom the design system" is the
  // same claim as "generated from", and hard-wrapped Markdown splits it
  // routinely. The gap is spaces/tabs plus at most one newline (never `\s+`,
  // which would join "## Generated" to a following block starting with "From").
  // This widens the SAME phrase; the adverb form does newly fail sentences like
  // "generated dynamically from the OpenAPI schema" whose un-adverbed twin the
  // pattern already failed — a genuine one goes in the allowlist, as before.
  ["generated_from", /\bgenerated(?:[ \t]+\w+ly)?(?:[ \t]+|[ \t]*\r?\n[ \t]*)from\b/i, '"generated (…ly) from"'],
  ["compiled_from", /\bcompiled from\b/i, '"compiled from"'],
  ["compiled_into_chapter", /\bcompiled into (?:this|the) chapter\b/i, '"compiled into (this|the) chapter"'],
  ["published_from", /\bpublished from\b/i, '"published from"'],
  ["published_mirror", /\bpublished mirror\b/i, '"published mirror"'],
  ["byte_for_byte_copy", /\bbyte-for-byte copy\b/i, '"byte-for-byte copy"'],
  // docs#156 AC5: "never hand-edit the PNGs" is the same PROHIBITION as "do not
  // hand-edit" and was the exact phrasing the staged-listing sweep found; the
  // ruling removes such notes rather than exempting them, so the pattern has to
  // be able to see them. "no need to hand-edit" is deliberately NOT included —
  // that is advisory product prose ("no need to hand-edit field mappings; the
  // connector maintains them"), not a production instruction.
  ["do_not_hand_edit", /\b(?:do not|don't|does not|never) hand-edit\b/i, '"do not / never hand-edit"'],
  ["overwritten_next_sync", /\boverwritten the next time\b/i, '"overwritten the next time"'],
  ["republished_from", /\brepublished from\b/i, '"republished from"'],
  ["synced_from_canonical", /\bsynced from the canonical\b/i, '"synced from the canonical"'],
  ["canonical_source_label", /\bcanonical source\b/i, '"canonical source"'],
  ["forthcoming", /\bforthcoming\b/i, '"forthcoming"'],
  ["coming_soon", /\bcoming soon\b/i, '"coming soon"'],
  ["will_be_added_when", /\bwill be added when\b/i, '"will be added when"'],
  ["to_be_added", /\bto be added\b/i, '"to be added"'],
  ["todo_marker", /\bTODO[:(]/, '"TODO:" / "TODO("'],
  ["tbd_marker", /\bTBD\b/, '"TBD"'],
  [
    "parenthetical_transition_note",
    /\((?:forthcoming|coming soon|pending|tbd|todo)\)/i,
    'parenthetical transition note, e.g. "(hub forthcoming)"',
  ],
  ["work_in_progress", /\bwork[- ]in[- ]progress\b/i, '"work in progress"'],
  ["stub_page", /\bstub page\b/i, '"stub page"'],
  ["documentation_pending", /\b(?:documentation|doc) pending\b/i, '"documentation pending"'],
  ["pending_documentation", /\bpending documentation\b/i, '"pending documentation"'],
  ["editorial_note", /\beditorial (?:note|todo)\b/i, '"editorial note/TODO"'],
  ["internal_note", /\binternal note\b/i, '"internal note"'],
  ["process_note", /\bprocess note\b/i, '"process note"'],
  [
    "self_referential_production",
    /\bthis (?:page|document|file|guide|chapter|hub|section)\b[^.\n]{0,80}\b(?:is|was)\b[^.\n]{0,40}\b(?:generated|compiled|mirrored|synced|republished|maintained|created)\b/i,
    '"this page/document/… is generated/compiled/mirrored/synced/maintained/created"',
  ],
  [
    "self_referential_by",
    /\bthis (?:page|document|file|guide|chapter|hub|section)\b[^.\n]{0,60}\b(?:maintained|created|generated|compiled) by\b/i,
    '"this page/document/… maintained/created/generated/compiled by"',
  ],

  // --- Class: TRANSITION / in-flight notes (docs#156 AC5) -------------------
  // The same family as "forthcoming" / "coming soon" / "to be added" above, in
  // the rephrasings those literal patterns miss: prose that narrates work IN
  // FLIGHT ("what you can write today versus what is still landing").
  // Anchored on the transition phrase, never on bare "land"/"landed"/
  // "landing" — published product prose legitimately says "the run tells you
  // when it lands", "an approval landed", "if you are landing here for the
  // first time".
  //
  // RESIDUAL RISK, recorded rather than hidden: "still landing" / "not yet
  // landed" are lexical, so a sentence about RUNTIME objects rather than work
  // ("if events are still landing in the old destination", "if the webhook has
  // not yet landed, retry") would also fail. No such sentence exists on any of
  // the 202 inventoried published surfaces today; one that appears later is a
  // line-pinned allowlist entry, which is exactly what that mechanism is for.
  // Two further candidates were dropped for being commoner in runtime prose
  // than in roadmap prose: "still in flight" ("requests still in flight are
  // allowed to complete during shutdown") and "yet to land" ("events yet to
  // land remain queued").
  ["still_landing", /\bstill landing\b/i, '"still landing"'],
  ["not_yet_landed", /\bnot yet landed\b/i, '"not yet landed"'],
  [
    // Either the literal "landing separately", or "landing in a <lifecycle
    // noun>" — the noun is REQUIRED there, or "audit events are landing in a
    // separate bucket" would fail. Bare "landing later" was dropped: "delayed
    // events are landing later" is ordinary runtime prose.
    "landing_separately",
    /\b(?:is|are|will be) landing (?:separately\b|in a (?:later|future|separate|subsequent) (?:release|version|rollout|phase|milestone|update|wave)\b)/i,
    '"is/are/will be landing separately | landing in a later release"',
  ],

  // --- Class: PLANNING PROVENANCE (docs#156 AC5) ---------------------------
  // Internal decision-process vocabulary in published prose: a capability
  // described by the work item that produced it or the decision that approved
  // it, rather than by what it does.
  //
  // These are LEXICAL PROXIMITY HEURISTICS, not semantic guarantees — the gate
  // cannot know that "#1620" is a work item or that "ratified" refers to an
  // internal decision. What it CAN require, and does, is an explicit relation:
  // a planning noun immediately bound to the number, and a history verb bound
  // to that reference by punctuation or a linking preposition. Bare proximity
  // on one physical line was deliberately rejected — it fails benign prose
  // like "See issue #123 for troubleshooting. If the webhook has not landed
  // after five minutes, retry it."
  [
    // "epic [#1620](https://…/1620), landed in S1/S2" — the work-item
    // reference, an optional Markdown link target, optional punctuation, up to
    // two auxiliaries, then the history verb. Nothing else may intervene, and
    // every gap is a BOUNDED run of spaces/tabs: never `\s*` (which would cross
    // a blank line and join "See issue #123" to a following paragraph starting
    // "Landed events…"), and never an unbounded run of adjacent optional
    // quantifiers (which backtracks quadratically on a long space run).
    "planning_workitem_landed",
    /\b(?:epic|issue|ticket|milestone|slice|phase|workstream)s?[ \t]{0,3}\[?[ \t]{0,3}#[ \t]{0,3}\d+\]?(?:\([^)\s]{0,200}\))?[ \t]{0,4}[,;:—–-]?[ \t]{0,4}(?:(?:has|had|is|are|was|were|which)[ \t]{1,4}){0,2}(?:landed|shipped|merged|implemented|delivered)\b/i,
    'work-item reference narrating implementation history, e.g. "epic #123, landed"',
  ],
  [
    // The reverse order, bound by an explicit relating preposition:
    // "landed with epic #1448", "shipped under epic #1620".
    "planning_landed_workitem",
    /\b(?:landed|shipped|merged|implemented|delivered)[ \t]{1,4}(?:in|with|under|via|as part of)[ \t]{1,4}(?:the[ \t]{1,4})?(?:epic|issue|ticket|milestone|slice|phase|workstream)s?[ \t]{0,3}\[?[ \t]{0,3}#[ \t]{0,3}\d+/i,
    'implementation history pinned to a work item, e.g. "landed with epic #123"',
  ],
  [
    // "ratified" bound to INTERNAL decision vocabulary only. `plan`,
    // `proposal`, `policy` and `scope` were dropped: "the ratified W3C
    // proposal" and "the security policy was ratified by the standards
    // committee" are ordinary prose about an EXTERNAL standards process.
    //
    // The gap is bounded by TOKENS, not characters: at most two intervening
    // words (a Markdown-emphasised modifier such as `**claim-only**` is one),
    // then the decision noun. A character window was tried first and rejected
    // — 24 characters still let "only ratified algorithms run in FIPS mode"
    // through, and no window both admits the real wrapped instance and
    // excludes that sentence. The gap may cross at most one hard wrap, and the
    // wrap guard runs BEFORE the indentation is consumed (and covers `-`, `*`,
    // `+`, `>`, `|`, `1.` and `1)` markers), so adjacent list items, headings,
    // quotes and table rows cannot be joined.
    "ratified_decision_vocab",
    /\bratified\b(?:[ \t]{1,2}[^\s.!?]{1,24}){0,2}(?:[ \t]{1,2}|[ \t]*\r?\n(?![ \t]*(?:[-*+>|]|\d+[.)]))[ \t]*)(?:mode|decision|decisions|ruling)\b/i,
    '"ratified" next to internal decision vocabulary, e.g. "the ratified claim-only mode"',
  ],
  [
    "decision_was_ratified",
    /\b(?:mode|decision|decisions|ruling)\b(?:[ \t]{1,2}[^\s.!?]{1,24}){0,2}(?:[ \t]{1,2}|[ \t]*\r?\n(?![ \t]*(?:[-*+>|]|\d+[.)]))[ \t]*)(?:is|are|was|were)[ \t]{1,4}ratified\b/i,
    '"the decision(s) … is/are/was/were ratified"',
  ],
  [
    // The reference must TERMINATE at the noun — punctuation, end of line, a
    // following "that", or a date. A finite blacklist of compound nouns was
    // tried first and rejected: it can never enumerate "the decision tree",
    // "the decision diagram", "the decision returned by the policy engine".
    // Requiring the phrase to end is structural, so all of those stay green
    // while "per the ruling," and "per the owner ruling 2026-07-22," fail.
    "ruling_reference",
    /\b(?:per|as per|following|under) the (?:owner |product )?(?:ruling|decision)\b(?=[ \t]{0,4}[,;:.)]|[ \t]{1,4}(?:that\b|\d{4}-\d{2}-\d{2})|[ \t]*(?:\r?\n|$))/i,
    '"per the ruling" / "per the decision"',
  ],

  // --- Class: PLANNING PROVENANCE, docs#160 additions -----------------------
  // The three citation shapes the HTML reference pages actually carried, and the
  // in-page annotation vocabulary that sat beside them. Each names a capability
  // by the internal artefact behind it — a work item, an acceptance criterion, a
  // decision — instead of by what the product does; none is resolvable by a
  // reader of the published site.
  [
    // REPO-QUALIFIED work-item citation: a slug (optionally org/repo-qualified),
    // "#", digits, and nothing that continues the token. This is the docs#160
    // AC4 decision, narrowing the docs#156 rule-out (see RULED OUT above).
    //
    // Precision is structural, not statistical. Five exclusions carry it:
    //   - The leading negative LOOKBEHIND refuses a "#" that is already inside a
    //     token or preceded by "/" or "." — so `cinatra-ai/cinatra#1795` matches
    //     ONCE, at the start, rather than again at each path segment.
    //   - The negative LOOKBEHIND IMMEDIATELY BEFORE THE "#" refuses a FILE
    //     ANCHOR (`overview.md#12`, `docs/guide.html#3`, `deck.pdf#7`): a
    //     fragment into a document is addressing, not a citation. It sits at the
    //     "#" rather than at the start of the token because the path depth is
    //     unbounded — a lookahead anchored at the token start cannot see past
    //     the first "/", so `docs/overview.md#12` slipped through it.
    //     The trailing `(?![\w-])` refuses a heading slug (`#12-installation`)
    //     on the same grounds.
    //   - The slug is LOWERCASE-only, and the pattern is case-SENSITIVE. A repo
    //     slug is written lowercase everywhere in this corpus; a Capitalised
    //     token immediately before a "#number" is a DISPLAY LABEL, not a repo.
    //     The real false positive that forced this: a published components page
    //     renders an agent-run table cell as `<span>Outreach</span><span>#2,318
    //     </span>`, and inline tags are transparent by the extraction contract,
    //     so the two cells arrive as the single token `Outreach#2,318`.
    //   - `(?!,\d)` refuses a THOUSANDS SEPARATOR after the digits, the other
    //     half of that same run-number shape.
    //   - AT LEAST TWO DIGITS. `label#2` / `run#7` is a display ordinal, not a
    //     work item; the lowest work-item number cited anywhere in this corpus is
    //     three digits, and this org's issue numbering passed 99 long ago.
    // RESIDUAL RISKS, recorded not hidden: a genuinely upper-case repo slug
    // (`cinatra-ai/Cinatra#123`), a one- or two-digit work item, and a lower-case
    // display label beside a 2+-digit ordinal (`invoice#42`) are all mis-called.
    // That is the deliberate trade this whole pattern list makes — a pattern that
    // fires on ordinary product prose costs more than the violation it catches.
    // A bare `#123` cannot match at all — there is no slug before the "#" — so
    // the deliberate docs#156 rule-out on the unqualified form is preserved
    // exactly. Every gap is a BOUNDED character run, so the pattern stays linear
    // on adversarial input.
    "qualified_workitem_citation",
    /(?<![\w./#-])[a-z][a-z0-9.-]{0,60}(?:\/[a-z0-9._-]{1,60}){0,2}(?<!\.(?:md|html?|json|ya?ml|toml|txt|pdf|zip|png|jpe?g|gif|svg|webp|css|js|mjs|cjs|ts|tsx|sh|py|rb|go|rs))#\d{2,}(?![\w-])(?!,\d)/,
    'repo-qualified work-item citation, e.g. "cinatra#1607" / "cinatra-ai/cinatra#1795"',
  ],
  [
    // ACCEPTANCE-CRITERION citation: "AC6", "AC2–AC5". Case-SENSITIVE and
    // digit-terminated, which keeps it off ordinary words and off hex-ish
    // identifiers (`0xAC12` has no word boundary before "AC"). An acceptance
    // criterion is an artefact of the review that approved the work; naming one
    // on a published page tells a reader nothing they can act on.
    // RESIDUAL RISK, recorded: a product/model code spelled the same way ("the
    // AC12 controller") would misfire. Nothing on the 202 inventoried surfaces
    // does today; one that appears later is a line-pinned allowlist entry, which
    // is exactly what that mechanism is for.
    "acceptance_criterion_citation",
    /\bAC\d{1,3}\b/,
    'acceptance-criterion citation, e.g. "AC6"',
  ],
  [
    // NUMBERED RULING citation: "ruling 4", "rulings 1–2". The unnumbered
    // "per the ruling" spelling is already covered by ruling_reference above;
    // this covers the numbered form those pages used as a shorthand index into
    // an internal decision log. RESIDUAL RISK, recorded: a page citing an
    // EXTERNAL numbered ruling (a regulator's "Ruling 4") would misfire; these
    // are technical product pages, and no such citation exists on the corpus.
    "numbered_ruling_citation",
    /\brulings?[ \t]{1,3}\d{1,3}\b/i,
    'numbered ruling citation, e.g. "ruling 4" / "rulings 1–2"',
  ],

  // --- Class: IN-PAGE AUTHORING / PUBLISH-STATUS ANNOTATION (docs#160) ------
  // Editorial scaffolding that survived into the published bytes: a note about
  // what the page decides to publish, what state the spec is in, what is
  // "outside the mock", or how the next publish is scheduled. It is the same
  // family as the class-1 production notes ("this page is compiled from…") —
  // prose about the page rather than about the product — in the vocabulary a
  // design spec accumulates.
  //
  // ALL THREE ARE DELIBERATELY NARROWED to the ANNOTATION form, because the bare
  // phrases are ordinary product vocabulary in a product that itself publishes,
  // reviews and versions things. "The publish decision is recorded on the run",
  // "review each publish decision before release", "check the spec status before
  // deploying" and "the design notes for this integration are in the appendix"
  // are all legitimate published prose, and every one of them fails an
  // unqualified pattern.
  //
  // The narrowing is POSITIVE, not a blacklist of continuations. A blacklist was
  // tried first and rejected: any finite list of following words still leaves
  // "…decision before release" and "…status before deploying" failing, and the
  // list can never be completed. What actually separates the two is STRUCTURAL —
  // an annotation TERMINATES (end of line, a separator glyph, a closing bracket,
  // an em/en dash introducing its value) or POINTS at a location in the document
  // ("publish decision in §VII"), whereas a sentence CONTINUES with the phrase as
  // an ordinary noun. That is checkable rather than enumerable. A rephrased
  // annotation is caught in review, not here — the same trade this list makes
  // everywhere else.
  //
  // RESIDUAL RISK, recorded rather than hidden (Codex review, docs#160). The
  // narrowing constrains what may FOLLOW the phrase, not what precedes it, so a
  // sentence that ENDS on the phrase still fails:
  //     "Before release, review the publish decision."
  //     "Before deploying, check spec status."
  //     "Please review the design notes for the mock."
  // No local lexical rule separates those from an annotation, because a terminal
  // noun phrase is exactly what an annotation is. They are left failing on
  // purpose: the escape is a line-pinned allowlist entry — reviewed, owned, and
  // expiring — which is preferable to an unenforced class. Nothing on the 202
  // inventoried published surfaces is phrased this way today.
  [
    "publish_decision",
    /\bpublish(?:ing)? decisions?(?=[ \t]*(?:[·•|)\]}—–─:]|\r?\n|$)|[ \t]+(?:in|per|recorded in)[ \t]*(?:§|section\b))/i,
    '"publish decision" as a page annotation',
  ],
  [
    "spec_status_annotation",
    /\bspec status(?=[ \t]*(?:[·•|)\]}—–─:]|\r?\n|$))/i,
    '"spec status" as a page annotation',
  ],
  [
    // "design note, outside the page mock" and its authoring twin. Deliberately
    // NOT extended to "review note" — a review note is a real Cinatra product
    // object, and a pattern that fires on the product's own vocabulary costs
    // more than the annotation it catches.
    "design_note_annotation",
    /\b(?:design|authoring) notes?\b[ \t]*[,;:—–-]?[ \t]*(?:outside\b|not (?:in|part of)\b|excluded from\b|for the mock\b)/i,
    '"design note / authoring note, outside …" (page-scoping authoring annotation)',
  ],
  [
    // Internal scheduling of a docs publish, stated on the published page ("a
    // separate, owner-gated publish"). The gating NOUN is required: "owner" is
    // an ordinary Cinatra role and "owner-gated" alone would reach real product
    // prose about owner-approved actions.
    "owner_gated_publish",
    /\bowner-gated[ \t]{1,3}(?:publish|release|rollout|deploy|deployment|decision)\b/i,
    '"owner-gated publish" (internal publish scheduling)',
  ],
];

function parseArgs(argv) {
  const out = { allowlist: DEFAULT_ALLOWLIST_PATH, now: new Date(), paths: [], printFiles: false, scanFixtures: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--allowlist") out.allowlist = argv[++i];
    if (argv[i] === "--now") out.now = new Date(argv[++i]); // testability only
    // --paths NARROWS the whole-tree scan to an explicit literal set. It exists
    // for the parity harness (docs#160 AC2), which runs BOTH twins over the same
    // committed corpus; the gate itself never passes it, so the default remains
    // "the whole tracked tree", which is what this repo publishes.
    if (argv[i] === "--paths") out.paths.push(...String(argv[++i] ?? "").split(/[\n,]/).map((x) => x.trim()).filter(Boolean));
    if (argv[i] === "--print-files") out.printFiles = true;
    if (argv[i] === "--scan-fixtures") out.scanFixtures = true;
  }
  return out;
}

// Loads the allowlist and splits entries into "live" (still suppressing) and
// "expired" (reviewBy has passed — cinatra-ai/docs#114 requires an exception to
// not become permanent silently, so an expired entry stops protecting: the
// violation it used to cover starts failing the gate again until a human either
// fixes the content or renews the date).
function loadAllowlist(path, now) {
  let raw;
  try {
    raw = readFileSync(join(REPO_ROOT, path), "utf8");
  } catch {
    return { live: [], expired: [] };
  }
  const parsed = JSON.parse(raw);
  const entries = parsed?.entries;
  if (!Array.isArray(entries)) throw new Error(`${path} must be a JSON object with an "entries" array`);
  const live = [];
  const expired = [];
  for (const entry of entries) {
    for (const key of ["file", "pattern", "snippet", "owner", "reviewBy", "note"]) {
      if (!entry[key]) {
        throw new Error(`${path}: allowlist entry missing "${key}": ${JSON.stringify(entry)}`);
      }
    }
    const reviewBy = new Date(entry.reviewBy);
    if (Number.isNaN(reviewBy.getTime())) {
      throw new Error(`${path}: entry for ${entry.file} has an unparseable reviewBy "${entry.reviewBy}"`);
    }
    (reviewBy < now ? expired : live).push(entry);
  }
  return { live, expired };
}

// Tracked published-surface files: Markdown (`.md`) and, since docs#160, the
// published HTML reference pages (`.html` / `.htm`). Nothing else — an image, a
// stylesheet or a script is not a prose surface, and a scan that guessed would
// be a scan nobody can predict.
//
// `git ls-files` respects gitignored paths and only returns tracked files, so an
// untracked scratch file can never trip the gate. `--literal-pathspecs` keeps a
// configured entry a LITERAL path: a "*" in one must not silently widen the scan.
function listScanFiles(paths) {
  // Default: EVERY tracked file, filtered by extension below — this repo IS the
  // published surface, so the scan is the whole tree. A pathspec appears only
  // when the caller narrowed it explicitly, and then it is literal.
  const args = paths.length > 0 ? ["--literal-pathspecs", "ls-files", "-z", "--", ...paths] : ["ls-files", "-z"];
  const out = execFileSync("git", args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  return out
    .split("\0")
    .filter(Boolean)
    .filter((f) => f.toLowerCase().endsWith(".md") || isHtmlPath(f));
}

// The text patterns are matched against, plus the map back to source offsets.
// Markdown IS its own prose, so the map is the identity (null, read by the
// caller as "extracted index === source index"). HTML is reduced by the
// documented extraction contract in lib/html-text.mjs, and the returned map
// carries each extracted character's source offset so reporting and allowlist
// pinning stay on the SOURCE line.
function scannableText(file, source) {
  if (!isHtmlPath(file)) return { text: source, map: null };
  return extractHtmlText(source);
}

function lineNumberAt(content, index) {
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (content.charCodeAt(i) === 10) line++;
  }
  return line;
}

// The full source line containing a match (trimmed), used as the allowlist
// pinning key instead of the bare matched phrase. Two DIFFERENT sentences in
// the same file can both legitimately contain e.g. "generated from" (this repo
// has exactly that case), so pinning on the phrase alone would let one
// verified exception silently cover an unrelated, unverified second instance.
// Pinning on the whole line makes that collision require a byte-identical
// duplicate line, which an allowlist entry can then also list explicitly.
function lineTextAt(content, index) {
  const start = content.lastIndexOf("\n", index - 1) + 1;
  let end = content.indexOf("\n", index);
  if (end === -1) end = content.length;
  return content.slice(start, end).trim();
}

function main() {
  const { allowlist: allowlistPath, now, paths, printFiles, scanFixtures } = parseArgs(process.argv.slice(2));
  const { live, expired } = loadAllowlist(allowlistPath, now);
  // Keyed by file+pattern+the FULL LINE the match sits on — not just the bare
  // matched phrase — so an allowlist entry only suppresses the SPECIFIC
  // verified occurrence. Two different sentences in the same file can both
  // contain e.g. "generated from"; pinning on the whole line means a second,
  // unrelated occurrence of the same phrase is NOT silently covered by the
  // first one's sign-off (it needs its own entry, or to be byte-identical).
  const allowed = new Set(live.map((e) => `${e.file} ${e.pattern} ${e.snippet}`));

  const scanFiles = listScanFiles(paths).filter((f) => !isSkipped(f, scanFixtures));
  if (printFiles) for (const f of scanFiles) console.log(`[meta-commentary-gate] selected: ${f}`);

  const violations = [];
  for (const file of scanFiles) {
    const source = readFileSync(join(REPO_ROOT, file), "utf8");
    // For HTML the patterns run over the extracted PROSE; `map` translates a
    // match position back to the source offset so the report and the allowlist
    // key stay on the real file and line.
    const { text, map } = scannableText(file, source);
    for (const [id, regex, description] of PATTERNS) {
      const flags = regex.flags.includes("g") ? regex.flags : `${regex.flags}g`;
      const re = new RegExp(regex.source, flags);
      let match;
      while ((match = re.exec(text)) !== null) {
        const sourceIndex = map ? (map[match.index] ?? source.length) : match.index;
        const lineText = lineTextAt(source, sourceIndex);
        if (!allowed.has(`${file} ${id} ${lineText}`)) {
          violations.push({
            file,
            line: lineNumberAt(source, sourceIndex),
            id,
            description,
            // Reported from the EXTRACTED prose, so an entity-encoded or
            // tag-split match reads as the phrase it is.
            snippet: match[0].replace(/\s+/g, " ").trim(),
          });
        }
        if (match.index === re.lastIndex) re.lastIndex++; // zero-width guard
      }
    }
  }

  // Deterministic order regardless of pattern-list order: file, then source
  // line, then pattern id. An HTML page yields matches out of line order
  // otherwise (each pattern sweeps the whole page in turn).
  violations.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.id.localeCompare(b.id));

  if (violations.length === 0) {
    console.log(
      `[meta-commentary-gate] OK — 0 violations across ${scanFiles.length} tracked Markdown/HTML page(s) ` +
        `(allowlist: ${live.length} live entries, skipped: ${SKIP_PATHS.size} contributor-docs paths).`
    );
    if (expired.length > 0) {
      console.log(
        `[meta-commentary-gate] NOTE — ${expired.length} allowlist entry(ies) past their reviewBy ` +
          `date but no longer matching anything (safe to delete or renew): ` +
          expired.map((e) => `${e.file}:${e.pattern} (reviewBy ${e.reviewBy})`).join(", ")
      );
    }
    return;
  }

  console.error(`[meta-commentary-gate] FAIL — ${violations.length} violation(s):\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  [${v.id}] matched ${v.description} — "${v.snippet}"`);
  }
  if (expired.length > 0) {
    console.error(`\n${expired.length} allowlist entry(ies) are EXPIRED (past reviewBy) and no longer suppress anything:`);
    for (const e of expired) {
      console.error(`  ${e.file} [${e.pattern}] reviewBy ${e.reviewBy} owner ${e.owner} — ${e.note}`);
    }
    console.error(`Renew (bump reviewBy) only after re-confirming the match is still legitimate product content, or remove the entry.`);
  }
  console.error(
    `\nPublished pages describe Cinatra the product: not how this documentation site itself ` +
      `is authored, generated, or maintained; not what is still in flight ("still landing", ` +
      `"forthcoming"); and not the internal work item or decision a capability came from ` +
      `("epic #123, landed", "the ratified <X> mode"). Remove the meta/transition/provenance ` +
      `content and state the capability as it stands, or relocate it ` +
      `to guides/developer/contributing.md ("Contributing to this documentation site") if it is ` +
      `genuinely contributor-relevant.` +
      `\nA genuine false positive (real product content this pattern misfires on) goes in ` +
      `${allowlistPath} with an owner, a reviewBy date, and the exact full line as the snippet — see cinatra-ai/docs#114.`
  );
  process.exitCode = 1;
}

main();
