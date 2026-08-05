#!/usr/bin/env node
// ──────────────────────────────────────────────
// YunYun Engine rebrand — idempotent display-name substitution.
//
// Re-run this after every upstream Marinara merge to re-apply branding to
// newly-merged text (see MarinaraMYBRANCH.md → update process).
//
// Deliberately surgical. It cannot touch any of these, which MUST keep names:
//   @marinara-engine/*            package / import specifiers (lowercase + hyphen)
//   marinara:*                    localStorage + event keys (renaming wipes user state)
//   MarinaraEngine/${APP_VERSION} outbound User-Agent (providers may allowlist it)
//   --marinara-*                  CSS custom properties
//   Pasta-Devs/Marinara-Engine    upstream URLs + AGPL attribution (hyphen; must keep)
//   custom_components/marinara_engine  Home Assistant domain (renaming breaks installs)
//
// Usage:  node scripts/yunyun-rebrand.mjs [--dry] [--list]
// ──────────────────────────────────────────────
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const DRY = process.argv.includes("--dry");

// Rule 1 rewrites the full display name.
// Rule 2 rewrites the bare product word, e.g. "Refresh <product> to finish…".
//   \b...\b  → capital-M only, so it cannot touch the lowercase
//              --marinara-* CSS vars, marinara: keys, or data-marinara-*.
//              It also can't match MarinaraEngine / MarinaraLauncher, since
//              there is no word boundary before "Engine"/"Launcher".
//   (?!-)    → protects hyphenated upstream names: the Marinara-Engine URLs
//              and the Pasta-Devs/Marinara-Agents catalog.
const OLD_NAME = "Mari" + "nara";
const RULES = [
  [new RegExp(`${OLD_NAME} Engine`, "g"), "YunYun Engine"],
  [new RegExp(`\\b${OLD_NAME}\\b(?!-)`, "g"), "YunYun"],
];

// Phrases that must survive verbatim even though they contain the old name.
// These credit UPSTREAM's authored content — rewriting them would claim their
// work as ours, and the preset seeder matches on name+author, so renaming it
// also orphans existing users' presets and seeds a duplicate.
const PROTECT = [
  `${OLD_NAME}'s Universal Preset`,
  `${OLD_NAME}'s Universal Prompt Preset`,
  `${OLD_NAME}'s universal roleplay preset`,
  `${OLD_NAME}'s bundled universal roleplay preset`,
  `${OLD_NAME} universal preset`,
  `${OLD_NAME} Conversation prompt`,
  `PRESET_AUTHOR = "${OLD_NAME}"`,
  `MARINARA_UNIVERSAL_PRESET_AUTHOR = "${OLD_NAME}"`,
];
const SENTINEL = "YYP";

// LICENSE + CHANGELOG are historical/legal records — leave them verbatim.
// TRADEMARKS.md is UPSTREAM's policy about THEIR marks — rewriting it would
// misstate their policy and imply we claim their marks.
// default-preset.json is upstream's authored preset content (name/author/desc).
// THIS SCRIPT excludes itself: it is a tracked file, so without this it
// rebrands its own source and turns rule 1 into a no-op.
const SKIP = [
  /^LICENSE$/,
  /^CHANGELOG\.md$/,
  /^TRADEMARKS\.md$/,
  /^README\.md$/,
  /^packages\/server\/src\/db\/default-preset\.json$/,
  /^scripts\/yunyun-rebrand\.mjs$/,
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

  // Mask protected phrases so the rules below cannot touch them.
  const masked = [];
  for (const phrase of PROTECT) {
    if (out.includes(phrase)) {
      const token = `${SENTINEL}${masked.length}${SENTINEL}`;
      out = out.split(phrase).join(token);
      masked.push([token, phrase]);
    }
  }

  for (const [from, to] of RULES) {
    const n = (out.match(from) || []).length;
    if (n > 0) {
      out = out.replace(from, to);
      hits += n;
    }
  }

  // Restore protected phrases.
  for (const [token, phrase] of masked) out = out.split(token).join(phrase);

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
