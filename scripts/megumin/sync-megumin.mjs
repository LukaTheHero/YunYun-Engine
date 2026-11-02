#!/usr/bin/env node
// ──────────────────────────────────────────────────────────────────────────────
// Vendors Megumin Suite's engine into packages/shared/src/megumin/vendor.
//
//   node scripts/megumin/sync-megumin.mjs <path-to-Megumin-Suite-checkout> [--check]
//
// Megumin Suite (https://github.com/Arif-salah/Megumin-Suite, CC BY-NC 4.0) is a
// SillyTavern preset + extension. Its engine is ES modules with a clean split:
// pure modules (prompt library, dictionary builder, block registry, state store,
// parsers, renderers) and SillyTavern-bound ones (jQuery UI, connection
// profiles, events). This script copies the pure modules as they are, so the
// port keeps Megumin's own logic and a later Megumin release can be pulled in by
// running it again. It never runs Megumin's code: it reads files as text.
//
// What it does to each file:
//   • .js → .ts with a header: `// @ts-nocheck`, where it came from, the licence.
//   • the patches below, each asserted to match exactly once. They only make the
//     code safe to run on a server shared by many chats (no `window`, no shared
//     memo across chats) — never a change of behaviour.
//
// The SillyTavern-bound modules the pure ones import (st.js, core/state.js,
// engine/tasks.js…) are YunYun's own files at the same paths (OVERRIDES). They
// are never overwritten; they route those calls into YunYun (see host.ts).
// The three SillyTavern preset files are copied to the server, which converts
// them into YunYun presets at startup (services/megumin/megumin-presets.ts).
//
// --check: exit 1 if the vendored tree differs from what a sync would write.
// ──────────────────────────────────────────────────────────────────────────────
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const VENDOR_DIR = join(repoRoot, "packages/shared/src/megumin/vendor");
const PRESET_DIR = join(repoRoot, "packages/server/src/db/megumin-presets");

/** The pure modules, copied as they are. Paths are relative to the Megumin checkout. */
export const VENDORED = [
  "data/addons.js",
  "data/blocks.js",
  "data/cot/index.js",
  "data/cot/legacy.js",
  "data/cot/v10.js",
  "data/cot/v11.js",
  "data/cot/v11taina.js",
  "data/cot/v7.js",
  "data/cot/v8.js",
  "data/cot/v9.js",
  "data/database.js",
  "data/directStyles.js",
  "data/image_data.js",
  "data/modes/index.js",
  "data/modes/legacy.js",
  "data/modes/v10.js",
  "data/modes/v11.js",
  "data/modes/v11taina.js",
  "data/modes/v7.js",
  "data/modes/v8.js",
  "data/modes/v9.js",
  "data/personalities.js",
  "data/skeleton.js",
  "data/slots.js",
  "data/styleTemplates.js",
  "data/styles.js",
  "data/toggles.js",
  "src/blocks/render.js",
  "src/blocks/text.js",
  "src/blocks/treatments.js",
  "src/core/constants.js",
  "src/core/engines.js",
  "src/core/keys.js",
  "src/core/lore.js",
  "src/core/migrations.js",
  "src/core/power.js",
  "src/core/profile.js",
  "src/core/refreshHooks.js",
  "src/core/sharedFragments.js",
  "src/core/sync.js",
  "src/engine/bgPromptsCore.js",
  "src/engine/buildBaseDict.js",
  "src/engine/chatText.js",
  "src/engine/chomusukeStatus.js",
  "src/engine/hideBlocks.js",
  "src/engine/injection.js",
  "src/engine/presetSections.js",
  "src/engine/thinkingNudge.js",
  "src/engine/workerRequest.js",
  "src/features/banlist/ui.js",
  "src/features/blocks/registry.js",
  "src/features/blocks/worker.js",
  "src/features/imagegen/auto.js",
  "src/features/imagegen/classic/prompt.js",
  "src/features/imagegen/combinedTurn.js",
  "src/features/imagegen/comfyProgress.js",
  "src/features/imagegen/comfyUrl.js",
  "src/features/imagegen/engineChoice.js",
  "src/features/imagegen/qualityPrefix.js",
  "src/features/imagegen/slot.js",
  "src/features/imagegen/v2/cast.js",
  "src/features/imagegen/v2/index.js",
  "src/features/imagegen/v2/lookParts.js",
  "src/features/imagegen/v2/looks.js",
  "src/features/imagegen/v2/looksCore.js",
  "src/features/imagegen/v2/prompt.js",
  "src/features/imagegen/v2/resolve.js",
  "src/features/imagegen/v2/waitFor.js",
  "src/features/memory/index.js",
  "src/features/memory/keywords.js",
  "src/features/modelsetup/loadouts.js",
  "src/features/modelsetup/ui.js",
  "src/features/notebook/worker.js",
  "src/features/npc/data.js",
  "src/features/npc/fields.js",
  "src/features/npc/pfp.js",
  "src/features/npc/ui.js",
  "src/features/npc/updates.js",
  "src/features/storyconfig/config.js",
  "src/features/storyconfig/ui.js",
  "src/features/storyplan/ui.js",
  "src/prompts/banList.js",
  "src/prompts/defaults.js",
  "src/prompts/imageGen.js",
  "src/prompts/imageGenV2.js",
  "src/prompts/index.js",
  "src/prompts/meguminEngine.js",
  "src/prompts/memoryCore.js",
  "src/prompts/notebook.js",
  "src/prompts/npcBank.js",
  "src/prompts/presetFrame.js",
  "src/prompts/storage.js",
  "src/prompts/storyPlan.js",
  "src/prompts/v11Rules.js",
  "src/sidepanel/dom.js",
  "src/sidepanel/parsers.js",
  "src/sidepanel/sections.js",
  "src/state/index.js",
  "src/state/modules/notebook/index.js",
  "src/state/modules/notebook/model.js",
  "src/state/modules/notebook/parse.js",
  "src/state/modules/notebook/render.js",
  "src/state/modules/notebook/worker.js",
  "src/state/modules/stats/index.js",
  "src/state/modules/stats/model.js",
  "src/state/modules/stats/parse.js",
  "src/state/modules/stats/render.js",
  "src/state/modules/stats/worker.js",
  "src/state/modules/world/index.js",
  "src/state/modules/world/model.js",
  "src/state/modules/world/parse.js",
  "src/state/modules/world/render.js",
  "src/state/store.js",
  "src/utils/dice.js",
  "src/utils/html.js",
  "src/utils/regex.js",
];

/**
 * YunYun's replacements for the SillyTavern-bound modules the vendored ones
 * import. Hand-written; a sync checks they exist and never touches them.
 */
export const OVERRIDES = [
  "src/st.ts",
  "src/core/state.ts",
  "src/core/activeRequests.ts",
  "src/engine/bgPrompts.ts",
  "src/engine/chomusukeNotice.ts",
  "src/engine/tasks.ts",
  "src/features/blocks/chat.ts",
  "src/features/imagegen/comfy.ts",
  "src/features/imagegen/index.ts",
  "src/features/memory/vectordb.ts",
  "src/sidepanel/panel.ts",
  "src/ui/controls.ts",
  "src/ui/modelGuide.ts",
  "src/ui/progress.ts",
  "src/ui/promptEditor.ts",
  "src/ui/tabs/coreAndCot.ts",
  "src/utils/download.ts",
];

/**
 * Modules that mix logic YunYun runs with jQuery/DOM UI YunYun draws itself.
 * They get no-op `$`, `window` and `document` stubs (vendor/src/st.ts), so the
 * logic runs and the UI calls do nothing. Never the modules the client renders
 * with (blocks/*, sidepanel/*): those keep the real DOM.
 */
export const DOM_STUBBED = [
  "src/core/power.js",
  "src/core/profile.js",
  "src/core/sync.js",
  "src/engine/injection.js",
  "src/features/banlist/ui.js",
  "src/features/imagegen/engineChoice.js",
  "src/features/imagegen/v2/looks.js",
  "src/features/memory/index.js",
  "src/features/modelsetup/ui.js",
  "src/features/npc/pfp.js",
  "src/features/npc/ui.js",
  "src/features/storyconfig/ui.js",
  "src/features/storyplan/ui.js",
];

// The job markers injection.js reads as SillyTavern live bindings; here they are per run.
const INJECTION_MARKERS = [
  "activeStoryPlanRequest",
  "activeBanListChat",
  "activeImageGenRequest",
  "activeNpcScanRequest",
  "activeNpcPfpRequest",
  "activeNpcUpdateRequest",
  "activeMemorySummarizationRequest",
  "activeWorldExtractRequest",
  "activeGenerationOrder",
  "activeNpcImages",
];

/** The SillyTavern presets, converted to YunYun presets by the server at startup. */
export const PRESETS = [
  "Presets/Megumin Suite V11 Universal.json",
  "Presets/Megumin Suite V10 Universal Cache Friendly.json",
  "Presets/Megumin Suite V10 Universal backwards compatibility.json",
];

/** [file, find, replace]: each find must occur exactly once in that file. */
export const PATCHES = [
  // Node has no `window`; Intl is a global everywhere.
  [
    "src/features/memory/keywords.js",
    "if (window.Intl && Intl.Segmenter) {",
    "if (globalThis.Intl && Intl.Segmenter) {",
  ],
  // toastr is a SillyTavern global; YunYun's shim forwards it to the app's notices.
  [
    "src/state/index.js",
    'import { getContext, saveMetadataDebounced, saveChatDebounced, substituteParams, name1, generateQuietPrompt, extension_settings } from "../st.js";',
    'import { getContext, saveMetadataDebounced, saveChatDebounced, substituteParams, currentName1, generateQuietPrompt, extension_settings, toastr } from "../st.js";',
  ],
  // `name1` is a live binding in SillyTavern; on a server it is per chat, so it is read through a function.
  [
    "src/state/index.js",
    "try { if (name1) names.push(name1); }",
    "try { const n1 = currentName1(); if (n1) names.push(n1); }",
  ],
  // One store instance serves every chat on a server: its memo must be keyed by chat as well.
  [
    "src/state/store.js",
    'const key = version + "|" + swipeSignature();',
    'const key = (adapter.getChatId ? adapter.getChatId() : "") + "|" + version + "|" + swipeSignature();',
  ],
  // Prompt preview before sending is YunYun's own (the client shows the payload); the server never blocks on a popup.
  [
    "src/engine/injection.js",
    "if (extension_settings[extensionName]?.globalSettings?.promptPreview && !isBackgroundGen && !isSilentOrDry && !isSpam) {",
    "if (false && extension_settings[extensionName]?.globalSettings?.promptPreview && !isBackgroundGen && !isSilentOrDry && !isSpam) {",
  ],
  // The review popup for changed looks needs a person at a screen: on YunYun the scan keeps every established look.
  [
    "src/features/imagegen/v2/looks.js",
    "    if (!plan.change.length) return [];",
    "    if (!plan.change.length) return [];\n    if (!$.isLive) return [];",
  ],
  [
    "src/features/imagegen/engineChoice.js",
    "export async function askToEnableWorldState() {",
    "export async function askToEnableWorldState() {\n    if (!$.isLive) return false;",
  ],
  [
    "src/state/index.js",
    "    getChat: () => getContext()?.chat || [],",
    '    getChat: () => getContext()?.chat || [],\n    getChatId: () => getContext()?.chatId || "",',
  ],
];

function headerFor(path, commit) {
  return [
    "// @ts-nocheck",
    `// Vendored from Megumin Suite ${path} @ ${commit.slice(0, 12)} — https://github.com/Arif-salah/Megumin-Suite`,
    "// © KazumaONIISAN, licensed CC BY-NC 4.0 (packages/shared/src/megumin/LICENSE.md). Changes: see",
    "// scripts/megumin/sync-megumin.mjs. Generated — edit the sync script's patches, not this file.",
    "",
  ].join("\n");
}

/** injection.js: its markers become per-run getters (core/activeRequests.ts). */
function rewriteInjectionMarkers(source) {
  const importRe = /import \{[^}]*\} from "\.\.\/core\/activeRequests\.js";/;
  const match = source.match(importRe);
  if (!match) throw new Error("injection.js: the activeRequests import was not found");
  const getter = (name) => `get${name[0].toUpperCase()}${name.slice(1)}`;
  const names = [...INJECTION_MARKERS.map(getter), "clearActiveNpcImages", "isBackgroundGenerationActive"];
  let out = source.replace(importRe, `import { ${names.join(", ")} } from "../core/activeRequests.js";`);
  const [head, ...rest] = out.split(/(?=\nexport async function handlePromptInjection)/);
  let body = rest.join("");
  for (const name of INJECTION_MARKERS) {
    body = body.replace(new RegExp(`(?<![\\w$.])${name}(?![\\w$])`, "g"), `${getter(name)}()`);
  }
  return head + body;
}

/** A relative import of vendor/src/st.ts from `path`. */
function stImportPath(path) {
  const rel = posix.relative(posix.dirname(path), "src/st.js");
  return rel.startsWith(".") ? rel : `./${rel}`;
}

/** Megumin logs with console; YunYun's server logs through Pino, so every call goes to the host's logger. */
function routeConsole(source) {
  return source.replace(/(?<![\w$.])console\.(log|debug|info|warn|error|group|groupEnd)\(/g, "meguminConsole.$1(");
}

/** Imports for SillyTavern globals the module uses but never imports: toastr everywhere, the DOM stubs where listed. */
function addGlobalImports(path, source) {
  const names = [];
  if (/(?<![\w$.])meguminConsole\./.test(source)) names.push("meguminConsole");
  const importsName = (n) => new RegExp(`import\\s*\\{[^}]*\\b${n}\\b[^}]*\\}\\s*from`).test(source);
  if (/\btoastr\s*[.[]/.test(source) && !importsName("toastr")) names.push("toastr");
  if (DOM_STUBBED.includes(path)) {
    if (/(^|[^\w$.])\$(\(|\.)/m.test(source) && !importsName("\\$")) names.push("$");
    if (/(^|[^\w$.])window\./m.test(source)) names.push("window");
    if (/(^|[^\w$.])document\./m.test(source)) names.push("document");
  }
  if (!names.length) return source;
  return `import { ${names.join(", ")} } from "${stImportPath(path)}";\n${source}`;
}

function applyPatches(path, source) {
  let out = source;
  for (const [file, find, replace] of PATCHES) {
    if (file !== path) continue;
    const count = out.split(find).length - 1;
    if (count !== 1) throw new Error(`Patch for ${path} matched ${count} times (expected 1): ${find.slice(0, 80)}`);
    out = out.replace(find, () => replace);
  }
  return out;
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function upstreamCommit(src) {
  try {
    return execFileSync("git", ["-C", src, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function buildOutputs(src) {
  const commit = upstreamCommit(src);
  const outputs = new Map();
  const manifest = { source: "https://github.com/Arif-salah/Megumin-Suite", commit, files: {} };
  for (const path of VENDORED) {
    const from = join(src, path);
    if (!existsSync(from)) throw new Error(`Missing in the Megumin checkout: ${path}`);
    const raw = readFileSync(from, "utf8");
    let body = applyPatches(path, raw.replace(/\r+\n/g, "\n"));
    if (path === "src/engine/injection.js") body = rewriteInjectionMarkers(body);
    body = routeConsole(body);
    body = addGlobalImports(path, body);
    const target = join(VENDOR_DIR, path.replace(/\.js$/, ".ts"));
    outputs.set(target, headerFor(path, commit) + body);
    manifest.files[path] = sha256(raw);
  }
  for (const path of PRESETS) {
    const from = join(src, path);
    if (!existsSync(from)) throw new Error(`Missing in the Megumin checkout: ${path}`);
    const raw = readFileSync(from, "utf8");
    outputs.set(join(PRESET_DIR, path.slice("Presets/".length)), raw);
    manifest.files[path] = sha256(raw);
  }
  outputs.set(join(VENDOR_DIR, "MANIFEST.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return outputs;
}

function listVendoredFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listVendoredFiles(full));
    else out.push(full);
  }
  return out;
}

function main() {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const src = args.find((a) => !a.startsWith("--"));
  if (!src) {
    console.error("Usage: node scripts/megumin/sync-megumin.mjs <path-to-Megumin-Suite-checkout> [--check]");
    process.exit(2);
  }
  for (const path of OVERRIDES) {
    if (!existsSync(join(VENDOR_DIR, path))) throw new Error(`Missing YunYun override: ${path}`);
  }
  const outputs = buildOutputs(resolve(src));
  const overrideSet = new Set(OVERRIDES.map((p) => join(VENDOR_DIR, p)));
  const stale = listVendoredFiles(VENDOR_DIR).filter((f) => !outputs.has(f) && !overrideSet.has(f));

  if (check) {
    const drift = [...outputs].filter(([file, text]) => !existsSync(file) || readFileSync(file, "utf8") !== text);
    for (const [file] of drift) console.error(`drift: ${relative(repoRoot, file)}`);
    for (const file of stale) console.error(`stale: ${relative(repoRoot, file)}`);
    process.exit(drift.length || stale.length ? 1 : 0);
  }
  for (const file of stale) rmSync(file);
  for (const [file, text] of outputs) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  console.log(
    `Vendored ${VENDORED.length} modules and ${PRESETS.length} presets (${stale.length} stale files removed).`,
  );
}

main();
