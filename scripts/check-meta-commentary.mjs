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
  ["generated_from", /\bgenerated from\b/i, '"generated from"'],
  ["compiled_from", /\bcompiled from\b/i, '"compiled from"'],
  ["compiled_into_chapter", /\bcompiled into (?:this|the) chapter\b/i, '"compiled into (this|the) chapter"'],
  ["published_from", /\bpublished from\b/i, '"published from"'],
  ["published_mirror", /\bpublished mirror\b/i, '"published mirror"'],
  ["byte_for_byte_copy", /\bbyte-for-byte copy\b/i, '"byte-for-byte copy"'],
  ["do_not_hand_edit", /\b(?:do not|don't|does not) hand-edit\b/i, '"do not hand-edit"'],
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
  // git ls-files respects .gitignore (.planning/ etc.) and only returns
  // tracked files, so an untracked scratch file can never trip the gate.
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
    `\nPublished pages describe Cinatra the product, not how this documentation site itself ` +
      `is authored, generated, or maintained. Remove the meta/process content, or relocate it ` +
      `to guides/developer/contributing.md ("Contributing to this documentation site") if it is ` +
      `genuinely contributor-relevant.` +
      `\nA genuine false positive (real product content this pattern misfires on) goes in ` +
      `${allowlistPath} with an owner, a reviewBy date, and the exact full line as the snippet — see cinatra-ai/docs#114.`
  );
  process.exitCode = 1;
}

main();
