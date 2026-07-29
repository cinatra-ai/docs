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
//     scans the WHOLE tracked Markdown tree — the docs repo IS the published
//     surface. The ci engine scans a caller-supplied `--docs <dir>` or a
//     `--paths <spec>` SET, resolved against the process cwd (the caller repo
//     checkout), because a caller repo publishes only part of its tree.
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
//   - A BARE work-item link with no history claim (a "see #123 for the design"
//     cross-reference) is OUT: too many reference pages link an issue
//     legitimately, and the violation is the historical narration, not the
//     link. Such a link is still worth removing from a published page in
//     review — it is simply below the precision bar for a blocking pattern.
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
// Usage:
//   node scripts/check-meta-commentary.mjs [--allowlist <path>] [--now <ISO-date>]

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

// Pages whose own purpose is describing how to contribute to this docs site —
// the owner-sanctioned exception (cinatra-ai/docs#114). Skipped entirely, not
// allowlisted line-by-line: these pages are ABOUT docs mechanics on purpose.
const SKIP_PATHS = new Set([
  "guides/developer/contributing.md",
  "references/platform/integration-docs-contract.md",
]);

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
  // product decision removes such notes rather than exempting them, so the
  // pattern has to be able to see them. "no need to hand-edit" is deliberately
  // NOT included — that is advisory product prose ("no need to hand-edit field
  // mappings; the connector maintains them"), not a production instruction.
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
  // not yet landed, retry") would also fail. No such sentence exists on this
  // corpus today; one that appears later is a line-pinned allowlist entry,
  // which is exactly what that mechanism is for. Two further candidates were
  // dropped for being commoner in runtime prose than in roadmap prose: "still
  // in flight" ("requests still in flight are allowed to complete during
  // shutdown") and "yet to land" ("events yet to land remain queued").
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
  // These are LEXICAL PROXIMITY HEURISTICS, not semantic guarantees — the check
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
];

function parseArgs(argv) {
  const out = { allowlist: DEFAULT_ALLOWLIST_PATH, now: new Date() };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--allowlist") out.allowlist = argv[++i];
    if (argv[i] === "--now") out.now = new Date(argv[++i]); // testability only
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

function listMarkdownFiles() {
  // git ls-files respects gitignored paths and only returns tracked files,
  // so an untracked scratch file can never trip the gate.
  const out = execFileSync("git", ["ls-files", "--", "*.md"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  return out.split("\n").filter(Boolean);
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
  const { allowlist: allowlistPath, now } = parseArgs(process.argv.slice(2));
  const { live, expired } = loadAllowlist(allowlistPath, now);
  // Keyed by file+pattern+the FULL LINE the match sits on — not just the bare
  // matched phrase — so an allowlist entry only suppresses the SPECIFIC
  // verified occurrence. Two different sentences in the same file can both
  // contain e.g. "generated from"; pinning on the whole line means a second,
  // unrelated occurrence of the same phrase is NOT silently covered by the
  // first one's sign-off (it needs its own entry, or to be byte-identical).
  const allowed = new Set(live.map((e) => `${e.file} ${e.pattern} ${e.snippet}`));

  const violations = [];
  for (const file of listMarkdownFiles()) {
    if (SKIP_PATHS.has(file)) continue;
    const content = readFileSync(join(REPO_ROOT, file), "utf8");
    for (const [id, regex, description] of PATTERNS) {
      const flags = regex.flags.includes("g") ? regex.flags : `${regex.flags}g`;
      const re = new RegExp(regex.source, flags);
      let match;
      while ((match = re.exec(content)) !== null) {
        const lineText = lineTextAt(content, match.index);
        if (!allowed.has(`${file} ${id} ${lineText}`)) {
          violations.push({
            file,
            line: lineNumberAt(content, match.index),
            id,
            description,
            snippet: match[0],
          });
        }
        if (match.index === re.lastIndex) re.lastIndex++; // zero-width guard
      }
    }
  }

  if (violations.length === 0) {
    console.log(
      `[meta-commentary-gate] OK — 0 violations across tracked Markdown pages ` +
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
