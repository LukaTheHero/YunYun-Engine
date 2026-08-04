#!/usr/bin/env node
// ──────────────────────────────────────────────
// YunYun Engine rebrand — idempotent display-name substitution.
//
// Re-run this after every upstream Marinara merge to re-apply branding to
// newly-merged text (see MarinaraMYBRANCH.md → update process).
//
// Deliberately surgical: it ONLY rewrites the display phrase
// "Marinara Engine" (capital-M, space, capital-E). That single rule is safe
// by construction — it cannot touch any of these, which MUST keep their names:
//   @marinara-engine/*            package / import specifiers (lowercase + hyphen)
//   marinara:*                    localStorage + event keys (renaming wipes user state)
//   MarinaraEngine/${APP_VERSION} outbound User-Agent (providers may allowlist it)
//   Pasta-Devs/Marinara-Engine    upstream URLs + AGPL attribution (hyphen; must keep)
//   custom_components/marinara_engine  Home Assistant domain (renaming breaks installs)
//
// Usage:  node scripts/yunyun-rebrand.mjs [--dry]
// ──────────────────────────────────────────────
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const DRY = process.argv.includes("--dry");
// Rule 1 rewrites the full display name.
// Rule 2 rewrites the bare product word, e.g. "Refresh Marinara to finish…".
//   \bMarinara\b   → capital-M only, so it cannot touch the 1248 lowercase
//                    --marinara-* CSS vars, marinara: keys, or data-marinara-*.
//                    It also can't match MarinaraEngine / MarinaraLauncher,
//                    since there is no word boundary before "Engine"/"Launcher".
//   (?!-)          → protects hyphenated upstream names: Marinara-Engine URLs
//                    and the Pasta-Devs/Marinara-Agents catalog.
const RULES = [
  [/Marinara Engine/g, "YunYun Engine"],
  [/\bMarinara\b(?!-)/g, "YunYun"],
];

// LICENSE + CHANGELOG are historical/legal records — leave them verbatim.
// TRADEMARKS.md is UPSTREAM's policy about THEIR marks (Marinara Engine /
// Pasta-Devs). Rewriting it would both misstate their policy and imply we
// claim their marks — it must stay exactly as upstream ships it.
const SKIP = [
  /^LICENSE$/,
  /^CHANGELOG\.md$/,
  /^TRADEMARKS\.md$/,
  /^README\.md$/,
  /\.(png|ico|gif|jpg|jpeg|webp|svg|woff2?|ttf|eot|zip|gz|lock|bin)$/i,
];

const files = execSync("git ls-files", { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
  .split("\n")
  .filter(Boolean)
  .filter((f) => !SKIP.some((re) => re.test(f)));

let changedFiles = 0;
let totalHits = 0;
const perFile = [];

for (const file of files) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  // Skip binaries that slipped past the extension filter.
  if (text.includes(String.fromCharCode(0))) continue;

  let out = text;
  let hits = 0;
  for (const [from, to] of RULES) {
    const n = (out.match(from) || []).length;
    if (n > 0) {
      out = out.replace(from, to);
      hits += n;
    }
  }

  if (hits > 0) {
    changedFiles++;
    totalHits += hits;
    perFile.push(`${hits}\t${file}`);
    if (!DRY) writeFileSync(file, out);
  }
}

if (process.argv.includes("--list")) {
  console.log(perFile.sort((a, b) => Number(b.split("\t")[0]) - Number(a.split("\t")[0])).join("\n"));
}
console.log(`${DRY ? "[dry-run] would rewrite" : "rewrote"} ${totalHits} occurrences across ${changedFiles} files`);
