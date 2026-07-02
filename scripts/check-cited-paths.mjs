#!/usr/bin/env node
// scripts/check-cited-paths.mjs
//
// Cheap conformance gate for cinatra-ai/docs#70: this repo cites concrete
// `cinatra-ai/cinatra` file/directory paths in prose (e.g. "see
// `src/lib/foo.ts`"). Those citations silently go stale whenever the cited
// repo reorganizes — the failure mode this issue was filed to fix (a dead
// connector-migration runbook, a stale "agents live in the monorepo" model,
// dangling design-skill pointers). This script extracts backtick-quoted
// path-like citations from every Markdown file in this repo, checks each one
// against a real checkout of `cinatra-ai/cinatra` at a given ref (default:
// its default branch), and fails (non-zero exit) listing every citation that
// does not resolve to a real file or directory.
//
// Deliberately "cheap", not exhaustive:
//   - Only citations that look like a real repo-relative path are checked —
//     a backtick span starting with one of KNOWN_ROOTS below, containing a
//     `/`, and free of obvious template placeholders (`<x>`, `*`, `{x}`,
//     whitespace, `...`).
//   - False negatives are expected (prose can cite a path in ways this
//     regex-based extractor does not catch) — this is a floor, not a proof.
//   - A small hand-maintained ALLOWLIST below covers verified exceptions
//     (e.g. a path that is genuinely illustrative/non-literal even though it
//     matches the pattern) so the gate does not need silencing by removing
//     the underlying citation.
//
// Usage:
//   node scripts/check-cited-paths.mjs [--cinatra-checkout <path>] [--ref <git-ref>]
//
// If --cinatra-checkout is omitted, the script shallow-clones
// https://github.com/cinatra-ai/cinatra.git into a temp directory at --ref
// (default: the remote's default branch).

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";

// NOTE: deliberately excludes `extensions/` — that directory is git-ignored
// in the cinatra-ai/cinatra tree (agent/connector/artifact/skill/workflow
// packages are cloned in from their own companion repos at dev-sync/CI time,
// never committed here), so a citation under `extensions/` can never be
// checked against a plain clone of this one repo and would always false-fail.
const KNOWN_ROOTS = [
  "src/",
  "packages/",
  "scripts/",
  "migrations/",
  "docker/",
  ".github/",
  "docker-compose",
];

// Verified exceptions: a citation that matches the pattern but is not a real
// resolvable path on purpose (e.g. a Jinja/template placeholder embedded in
// a longer real-looking prefix, a per-package-relative convention example
// rather than a literal repo-root path, or a deliberate historical reference
// to a file that was intentionally removed). Keep this list short — prefer
// fixing the prose so the citation is unambiguous over adding an entry here.
const ALLOWLIST = new Set([
  // Illustrates the "each package exposes src/index.ts" convention — relative
  // to each package's own root, not the literal repo-root src/index.ts
  // (which does not exist). references/mcp/package-boundaries.md,
  // references/platform/extension-kinds/authoring-artifact-extensions.md.
  "src/index.ts",
  // working-with-the-design-skill.md's "Editorial-boundary register row
  // (HISTORICAL)" section documents that this file WAS deleted — the
  // citation is intentionally to a now-nonexistent path.
  "src/lib/blog/draft-editor.tsx",
  // Pre-existing citations discovered by this gate at the time it was added
  // (cinatra-ai/docs#70) that were out of scope for that issue's fix — not
  // verified as intentional, tracked as follow-up cleanup.
  "packages/agent-ui-protocol/src/a2ui-spec.ts",
  "scripts/claude-assistant-agent.mts",
  "src/components/data-table/",
]);

function parseArgs(argv) {
  const out = { checkout: null, ref: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--cinatra-checkout") out.checkout = argv[++i];
    else if (argv[i] === "--ref") out.ref = argv[++i];
  }
  return out;
}

function listMarkdownFiles(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) listMarkdownFiles(full, acc);
    else if (entry.isFile() && extname(entry.name) === ".md") acc.push(full);
  }
  return acc;
}

// Matches a backtick-quoted span, e.g. `src/lib/foo.ts` or `packages/agents/`.
const BACKTICK_SPAN_RE = /`([^`]+)`/g;

function looksLikeTemplatePlaceholder(span) {
  return /[<>*{}]/.test(span) || /\s/.test(span) || span.includes("...");
}

function extractCitations(markdown) {
  const citations = new Set();
  for (const match of markdown.matchAll(BACKTICK_SPAN_RE)) {
    const span = match[1];
    if (!span.includes("/")) continue;
    if (looksLikeTemplatePlaceholder(span)) continue;
    if (!KNOWN_ROOTS.some((root) => span.startsWith(root))) continue;
    // Strip a trailing path-fragment like ":123" (a line-number suffix) if present.
    const cleaned = span.replace(/:\d+(-\d+)?$/, "");
    citations.add(cleaned);
  }
  return [...citations];
}

function pathExistsInCheckout(checkoutDir, relPath) {
  // Reject any citation whose resolved path would escape checkoutDir (e.g. via
  // "../" segments) — never treat an escape as "exists" against the real
  // filesystem outside the checkout.
  const normalized = relPath.endsWith("/") ? relPath.slice(0, -1) : relPath;
  const resolvedCheckout = resolve(checkoutDir);
  const full = resolve(join(checkoutDir, normalized));
  if (full !== resolvedCheckout && !full.startsWith(resolvedCheckout + "/")) return false;
  return existsSync(full);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();

  let checkoutDir = args.checkout;
  let tempDir = null;
  if (!checkoutDir) {
    tempDir = mkdtempSync(join(tmpdir(), "cited-paths-cinatra-"));
    checkoutDir = tempDir;
    const cloneArgs = ["clone", "--depth", "1"];
    if (args.ref) cloneArgs.push("--branch", args.ref);
    cloneArgs.push("https://github.com/cinatra-ai/cinatra.git", checkoutDir);
    console.log(`Cloning cinatra-ai/cinatra (depth 1${args.ref ? `, ref ${args.ref}` : ""})...`);
    execFileSync("git", cloneArgs, { stdio: "inherit" });
  }
  if (!statSync(checkoutDir).isDirectory()) {
    throw new Error(`--cinatra-checkout ${checkoutDir} is not a directory`);
  }

  const markdownFiles = listMarkdownFiles(repoRoot);
  const misses = [];
  let totalCitations = 0;

  try {
    for (const file of markdownFiles) {
      const relFile = file.slice(repoRoot.length + 1);
      const content = readFileSync(file, "utf8");
      const citations = extractCitations(content);
      for (const citation of citations) {
        totalCitations++;
        if (ALLOWLIST.has(citation)) continue;
        if (!pathExistsInCheckout(checkoutDir, citation)) {
          misses.push({ file: relFile, citation });
        }
      }
    }
  } finally {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  }

  console.log(`Checked ${totalCitations} cinatra-path citation(s) across ${markdownFiles.length} Markdown file(s).`);

  if (misses.length > 0) {
    console.error(`\n${misses.length} citation(s) do not resolve against cinatra-ai/cinatra:\n`);
    for (const { file, citation } of misses) {
      console.error(`  ${file}: \`${citation}\``);
    }
    console.error(
      "\nEach path above is either stale (fix or retire the citing page) or a false positive " +
        "(add a narrowly-scoped entry to ALLOWLIST in scripts/check-cited-paths.mjs with a comment explaining why).",
    );
    process.exitCode = 1;
    return;
  }

  console.log("All cited cinatra paths resolved.");
}

main();
