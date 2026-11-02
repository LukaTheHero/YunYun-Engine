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
// Upstream characters: the fork ships none of upstream's characters. After a
// merge, besides running this script, check by hand that the merge did not
// bring back any of them: Professor Mari's appearance packs (only "basic"
// ships, see src/lib/mari-work-animations.ts), the Dottore chat-widget style,
// Professor Mari's persona lore in seed-mari.ts / workspace-agent.service.ts,
// or new What's New announcements and their /releases/ media (the fork keeps
// RELEASE_ANNOUNCEMENTS empty because upstream writes them as Mari and
// illustrates them with its characters). Upstream's official agent covers
// (Marinara-Agents artwork/agent-covers/) all draw Mari too, so no text rule
// can help there: resolveCapabilityPackageIconUrl in package-manager.service.ts
// must keep returning no icon for them (capability-package-lifecycle pins it),
// and nothing else may build that artwork URL.
//
// README.md is the fork's own, hand-written, and lists only what this edition
// changes, so it has none of upstream's feature catalogs. A regression a merge
// brings in that searches README.md for upstream content must check the shipped
// docs/ guide instead, as the agent-catalog case in prompt.regression.ts does.
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
const OLD_ASSISTANT = "Mar" + "i";
const RULES = [
  [new RegExp(`${OLD_NAME} Engine`, "g"), "YunYun Engine"],
  [new RegExp(`\\b${OLD_NAME}\\b(?!-)`, "g"), "YunYun"],
  // The built-in assistant is "Professor YunYun". Capital-M + word boundaries
  // means this cannot touch the lowercase `mari` CLI binary, sprites/mari/,
  // .mari-workspace, Mari_profile.png (underscore is a word char),
  // PROFESSOR_MARI_ID, or the ProfessorMari* component identifiers.
  [new RegExp(`\\b${OLD_ASSISTANT}\\b`, "g"), "YunYun"],
  // Branding assets were renamed to fresh URLs (see commit 4d0751f) so no cache
  // could serve the pre-rebrand art. Upstream keeps adding files that reference
  // the OLD paths — NoodlerBulkCreatePanel.tsx arrived in v2.4.1 doing exactly
  // that, pointing at an asset we had deleted. Remap them here so every future
  // merge self-heals instead of silently shipping a 404'd image.
  // ── Deleted Marinara / Professor-Mari artwork ───────────────────────────
  // The fork ships none of upstream's Marinara-branded art: everything under
  // sprites/mari/ and the loose Professor-Mari / Marinara images were deleted,
  // and every slot that used them now shows the one static chibi YunYun image.
  // Upstream keeps adding files that point at the old paths, so collapse them
  // here and every future merge self-heals instead of shipping a broken image.
  // This matters more than a normal dead link: the SPA history fallback answers
  // a missing asset with 200 text/html, not 404, so a stale path fails silently.
  //
  // These are written WITHOUT a leading slash so one rule covers both the
  // served URL ("/sprites/mari/x.png") and the repository path that
  // readFileSync/existsSync use ("packages/client/public/sprites/mari/x.png").
  // Order matters: full paths collapse before bare basenames.

  // The profile slot wants a portrait, so it keeps its own image, not the chibi.
  [/sprites\/mari\/Mari_profile\.png/g, "sprites/yunyun/yunyun-profile.png"],
  // v2.5.1 split her art into appearance-pack folders (sprites/mari/<pack>/...).
  // The fork ships one pack, generated from its own art with the same file
  // names and frame layout, at sprites/yunyun/basic/ — so every pack folder,
  // Basic or one of upstream's costumes (Dottore, Golden, Safari, Raccoon),
  // maps onto it. This must run before the catch-all below, which would turn
  // "sprites/mari/basic/idle.webp" into "chibi-yunyun.png/idle.webp".
  [/sprites\/mari\/(?!generated\/)[a-z][a-z0-9-]*\//g, "sprites/yunyun/basic/"],
  // The memory wheel is a 1152 × 768 sheet of four frames that advanced-memory.css
  // crops with fixed geometry, so it gets its own generated sheet rather than the
  // plain chibi (which that crop would cut off). Before the catch-all below. The
  // second rule is the e2e spec's regex-literal spelling, with escaped slashes.
  [/sprites\/mari\/generated\/professor-mari-memory-wheel-v2\.(?:webp|png)/g, "sprites/yunyun/memory-wheel.webp"],
  [
    /sprites\\\/mari\\\/generated\\\/professor-mari-memory-wheel-v2\\\.(?:webp|png)/g,
    "sprites\\/yunyun\\/memory-wheel\\.webp",
  ],
  // Everything else under sprites/mari/ — the six assistant states, the chibi,
  // the pointing/waving tutorial sprites and the memory wheel's prompt note.
  [/sprites\/mari\/(?:generated\/)?[A-Za-z0-9_][A-Za-z0-9_.-]*/g, "sprites/yunyun/chibi-yunyun.png"],
  // The directory is also interpolated, e.g. `sprites/mari/${image}` in a
  // Playwright avatar helper, which the path rules above cannot match.
  [/sprites\/mari\//g, "sprites/yunyun/"],
  // Loose Marinara-branded images outside sprites/.
  [/illustrations\/marinara-universal-preset\.webp/g, "sprites/yunyun/chibi-yunyun.png"],
  [/releases\/2\.4\.2\/professor-mari-memories\.png/g, "sprites/yunyun/chibi-yunyun.png"],
  [/releases\/2\.5\.0\/chat-ui-mari\.jpg/g, "sprites/yunyun/chibi-yunyun.png"],
  [/images\/chat-widgets\/mari-primogem\.svg/g, "sprites/yunyun/chibi-yunyun.png"],
  [
    /assets\/imagegen\/home-v5-tabs\/professor-mari-(?:blink-source|idle-reference)\.png/g,
    "sprites/yunyun/chibi-yunyun.png",
  ],
  [/assets\/imagegen\/professor-mari-assistant-source\.png/g, "sprites/yunyun/chibi-yunyun.png"],
  // Playwright fixtures read this deleted source art from disk (readFileSync of
  // "../packages/client/assets/imagegen/..."), so it maps to a repository path
  // under public/. Full-body sprite and avatar fixtures get the chibi, which has
  // the same portrait aspect. The NovelAI style-plate upload instead needs an
  // edge over the 1536 px attachment limit, so it is re-encoded as JPEG: the
  // logo is the one tracked PNG that wide. That rule must run first.
  [
    /(name: "style-plate\.png",[\s\S]{0,200}?)\.\.\/packages\/client\/assets\/imagegen\/mari-generated-originals\/professor-mari-assistant-map-source\.png/g,
    "$1../packages/client/public/yunyun-logo.png",
  ],
  [
    /assets\/imagegen\/mari-generated-originals\/professor-mari-assistant-map-source\.png/g,
    "public/sprites/yunyun/chibi-yunyun.png",
  ],
  // Bare basenames, for the test helpers and CSS assertions that use the
  // filename on its own with no directory in front of it.
  [/\bMari_profile\.png/g, "yunyun-profile.png"],
  [
    /\bMari_(?:wave|greet|thinking|explaining|point_up_left|point_middle_left|point_down_left|noodler_teaser_locked|noodler_teaser_unlocked)\.(?:png|webp)/g,
    "chibi-yunyun.png",
  ],
  // Appears bare in an imagegen prompt note. NB: must stay anchored to ".png" so
  // it cannot touch the "marinara:chibi-professor-mari-toast-seen" localStorage
  // key in ChibiProfessorMariEasterEgg.tsx — renaming that wipes user state.
  [/\bchibi-professor-mari\.png/g, "chibi-yunyun.png"],
  // The memory-wheel sprite is asserted as a regex literal in an e2e spec, where
  // the dot arrives backslash-escaped, so accept both spellings.
  [/\bprofessor-mari-memory-wheel-v2\\?\.(?:webp|png)/g, "memory-wheel.webp"],
  [/\bmari-primogem\.svg/g, "chibi-yunyun.png"],
  // Upstream's Dottore art (the chat-widget crest and the support GIF) is not
  // shipped either.
  [/images\/chat-widgets\/dottore-crest\.svg/g, "sprites/yunyun/chibi-yunyun.png"],
  [/sprites\/dottore\/[A-Za-z0-9_.-]+/g, "sprites/yunyun/chibi-yunyun.png"],
  [/\bchat-ui-mari\.jpg/g, "chibi-yunyun.png"],
  [/\bprofessor-mari-memories\.png/g, "chibi-yunyun.png"],

  // Zero-width and soft-hyphen lookalikes of the assistant's name, used by the
  // multiplayer identity-conflict guard to prove an impersonating persona is
  // refused. The \uXXXX escapes sit inside the word, so rule 3's \b boundary
  // cannot match them: the fixture's real persona name gets rebranded while the
  // lookalikes keep spelling the old one, leaving them resembling nobody and the
  // guard passing vacuously. Rewrite the lookalikes to match.
  [/Ma(\\u[0-9A-Fa-f]{4})ri/g, "Yun$1Yun"],

  // A backslash escape in front of the name, such as \n inside a string or \b
  // inside a regex, makes the character before it a word character, so rules
  // 2 and 3 find no \b boundary and skip it — which silently desynchronised a
  // regression's expected output from its already-rebranded input (a /\bMari\b/
  // prompt script that no longer matched its rebranded messages). The trailing
  // \b is kept so this still cannot touch longer names that merely start with
  // it, such as the character "Marisol".
  [/(\\[A-Za-z])Marinara\b(?!-)/g, "$1YunYun"],
  [/(\\[A-Za-z])Mari\b/g, "$1YunYun"],
  // Rule 3 rebrands the mixed-case "Mari-Box" host in the request-host fixture,
  // but not the lowercase "mari-box" it must normalise to, so rename that too.
  [/\bmari-box\b/g, "yunyun-box"],
  [/\/illustrations\/professor-mari-whats-new\.webp/g, "/illustrations/yunyun-whats-new.webp"],
  [/"\/logo\.png"/g, '"/yunyun-logo.png"'],
  [/"\/logo-splash\.gif"/g, '"/yunyun-logo-splash.gif"'],
  [/"\/favicon\.png"/g, '"/yunyun-favicon.png"'],
  [/"\/icon-192\.png"/g, '"/yunyun-icon-192.png"'],
  [/"\/icon-512\.png"/g, '"/yunyun-icon-512.png"'],
  // The rules above are anchored to a quoted absolute URL, so they miss the
  // branding files when they are referenced as a path on disk instead — which
  // is how the Playwright fixtures load them, e.g.
  // readFileSync(new URL("../packages/client/public/icon-512.png", ...)).
  // Those reads throw at import time and take the whole spec file down with
  // them, so match the public/ form too.
  [/public\/logo\.png/g, "public/yunyun-logo.png"],
  [/public\/logo-splash\.gif/g, "public/yunyun-logo-splash.gif"],
  [/public\/favicon\.png/g, "public/yunyun-favicon.png"],
  [/public\/icon-192\.png/g, "public/yunyun-icon-192.png"],
  [/public\/icon-512\.png/g, "public/yunyun-icon-512.png"],
  // Upstream's community links. These are Marinara's own Discord and donation
  // page, so every merge that adds a new reference must be repointed at ours.
  [/https:\/\/discord\.com\/invite\/KdAkTg94ME/g, "https://discord.gg/canalpa"],
  [/https:\/\/ko-fi\.com\/marinara_spaghetti/g, "https://ko-fi.com/lukathehero"],

  // Upstream's recurring example cast. Their prompts, docs, help text and test
  // fixtures name these characters; the fork ships none of them, so every
  // mention is renamed to a neutral stand-in of the same length, gender and
  // opening letters (Do-, Mau-, P-), so fixed-width, token-count, sort-order
  // and partial-name fixtures keep lining up. The rules have
  // no word boundary on purpose: ids and camelCase identifiers ("dottoreId")
  // must be renamed together with the display names they pair with.
  // NB: this also renames upstream's "dottore" chat-widget preset id if a merge
  // brings it back. The fork removed that style; drop it again by hand.
  [/\bIl Dottore\b/g, "Dominic"],
  [/\bil dottore\b/g, "dominic"],
  [/Dottore/g, "Dominic"],
  [/dottore/g, "dominic"],
  [/DOTTORE/g, "DOMINIC"],
  [/Maukie/g, "Maurus"],
  [/maukie/g, "maurus"],
  [/MAUKIE/g, "MAURUS"],
  [/Pantalone/g, "Peregrine"],
  [/pantalone/g, "peregrine"],
  [/PANTALONE/g, "PEREGRINE"],
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
  // v2.4.2 moved the preset credit into shared constants. The seeder matches
  // stock presets on name+author, so renaming either orphans users' presets
  // and seeds a duplicate.
  `MARINARA_UNIVERSAL_PRESET_NAME = "${OLD_NAME}'s Universal Preset"`,
  // An `author: "Marinara"` field credits upstream (the stock preset, an
  // official agent), mostly in regression fixtures that stand in for the stock
  // preset. Rebranded, resolvePresetArtwork no longer recognises it, and the
  // checks that matching name+author fields never make a user preset stock pass
  // vacuously.
  `author: "${OLD_NAME}"`,
  // The workspace CLI binary is literally `mari`; describing it as anything
  // else in an agent prompt makes the model invoke a command that does not exist.
  `${OLD_ASSISTANT} CLI`,
  // Docs example demonstrating case-insensitive comparison — renaming one side
  // of it destroys the point being made.
  `\`${OLD_ASSISTANT}\` equals \`mari\``,
  // The assistant's identity block deliberately NAMES her former names so she
  // refuses them. Rebranding these turns the instruction into nonsense
  // ("never YunYun, never YunYun"), so they must survive verbatim.
  `Former names she must never use for herself: ${OLD_ASSISTANT}, ${OLD_NAME}, Professor ${OLD_ASSISTANT}.`,
  `Former names you must never use for yourself: ${OLD_ASSISTANT}, ${OLD_NAME}, Professor ${OLD_ASSISTANT}.`,
];
const SENTINEL = "YYP";

// Applied BEFORE the PROTECT mask, which would otherwise shield the "Mari CLI"
// inside these. The work card's "Prof. Mari CLI" names the character, not the
// binary; lowercase `mari` is the literal command, like the card's own
// "Running mari …" titles, and no rule above touches lowercase `mari`.
const PRE_MASK_RULES = [[new RegExp(`\\bProf\\. ${OLD_ASSISTANT} CLI\\b`, "g"), "mari CLI"]];

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

  for (const [from, to] of PRE_MASK_RULES) {
    const n = (out.match(from) || []).length;
    if (n > 0) {
      out = out.replace(from, to);
      hits += n;
    }
  }

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
