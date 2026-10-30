import assert from "node:assert/strict";
import { MEGUMIN_COTS } from "../../packages/server/src/services/megumin/content/cot/index.js";
import { THINKING_CAP } from "../../packages/server/src/services/megumin/content/cot/v10.js";
import {
  MEGUMIN_ENGINES,
  type MeguminEngine,
} from "../../packages/server/src/services/megumin/content/engines/index.js";
import {
  applyEnhancedDialogue,
  coWriter,
  ENHANCED_DIALOGUE,
  SHURA_CO_WRITING,
  UKIYO_CO_WRITING,
} from "../../packages/server/src/services/megumin/content/engines/v10.js";
import {
  engineLocksStyle,
  engineUsesRenderLimits,
  isCoWriterEngine,
  isModernEngine,
  isV10Engine,
  lockedStyleIdFor,
  meguminCotEntryForMode,
  meguminCotForMode,
} from "../../packages/server/src/services/megumin/engine-predicates.js";

// Megumin Mode ships Megumin Suite's engine and chain-of-thought text verbatim.
// These sizes were measured from the upstream data files (data/modes/*.js,
// data/cot/*.js); a truncated or hand-mangled copy changes at least one.

const SLOT_SIZES: Record<string, [number, number, number, number, number, number]> = {
  "v10-core": [386, 0, 0, 7790, 0, 13327],
  "v10-core-cw": [946, 0, 0, 7777, 0, 13327],
  "v10-shura": [448, 0, 0, 6409, 0, 8999],
  "v10-shura-cw": [922, 0, 0, 6409, 0, 9057],
  "v9-core": [2240, 0, 0, 5214, 10097, 3322],
  "v9-lite": [991, 0, 0, 9000, 0, 17936],
  "v9-director": [1980, 0, 0, 34177, 0, 0],
  "v9-immersion": [949, 0, 0, 1251, 0, 3828],
  "v8-fusion": [414, 0, 765, 5176, 0, 2813],
  "v8-m": [247, 0, 0, 4328, 0, 8127],
  "v8-lite": [135, 0, 0, 1132, 0, 1653],
  "v7.5": [2312, 0, 0, 9886, 0, 0],
  "v7-core": [3617, 0, 0, 10303, 0, 0],
  "v7-reality": [3610, 0, 0, 9882, 0, 0],
  "v7-gentle": [2565, 0, 0, 9003, 0, 0],
  "v6-dream-team": [444, 0, 3208, 1219, 2583, 43],
  "v6-dream-team-lite": [252, 0, 1068, 238, 709, 43],
  "balance Test": [23, 191, 1114, 782, 1568, 31],
  balance: [14, 217, 5109, 297, 753, 374],
  cinematic: [27, 390, 1054, 297, 972, 256],
  dark: [27, 375, 2911, 10, 649, 256],
};

// Display order is newest generation first; the locked "Anime Director" stub is not ported.
assert.deepEqual(
  MEGUMIN_ENGINES.map((engine) => engine.id),
  Object.keys(SLOT_SIZES),
);
for (const engine of MEGUMIN_ENGINES) {
  const sizes = [engine.p1, engine.p2, engine.p3, engine.p4, engine.p5, engine.p6].map((text) => text.length);
  assert.deepEqual(sizes, SLOT_SIZES[engine.id], `${engine.id} slot sizes`);
}

const COT_SIZES: Record<string, number> = {
  "cot-v10-ukiyo-english": 2930,
  "cot-v10-ukiyo-cap-english": 3447,
  "cot-v10-shura-english": 1192,
  "cot-v10-shura-cap-english": 1428,
  "cot-v9-english": 3357,
  "cot-v9-lite-english": 2433,
  "cot-v9-director-english": 3167,
  "cot-v9-immersion-english": 10397,
  "cot-v9-hybrid-english": 5533,
  "cot-v8-fusion-english": 1271,
  "cot-v8-english": 988,
  "cot-v7.5-english": 834,
  "cot-v7-english": 7729,
  "cot-v7-lite-english": 2321,
  "cot-off": 0,
  "cot-v1-english": 1498,
  "cot-v1-arabic": 1588,
  "cot-v1-spanish": 1803,
  "cot-v1-french": 1972,
  "cot-v1-zh": 832,
  "cot-v1-ru": 1793,
  "cot-v1-jp": 1029,
  "cot-v1-pt": 1773,
  "cot-v2-english": 1451,
  "cot-v2-arabic": 1394,
  "cot-v2-spanish": 1752,
  "cot-v2-french": 1834,
  "cot-v2-zh": 783,
  "cot-v2-ru": 1659,
  "cot-v2-jp": 917,
  "cot-v2-pt": 1720,
  "cot-v6-english": 2686,
  "cot-v6-arabic": 2194,
  "cot-v6-spanish": 2799,
  "cot-v6-french": 2658,
  "cot-v6-zh": 890,
  "cot-v6-ru": 2342,
  "cot-v6-jp": 1080,
  "cot-v6-pt": 2715,
  "cot-v6-lite-english": 614,
  "cot-v6-lite-arabic": 512,
  "cot-v6-lite-spanish": 663,
  "cot-v6-lite-french": 677,
  "cot-v6-lite-zh": 235,
  "cot-v6-lite-ru": 583,
  "cot-v6-lite-jp": 319,
  "cot-v6-lite-pt": 629,
};

assert.deepEqual(
  MEGUMIN_COTS.map((cot) => cot.id),
  Object.keys(COT_SIZES),
);
for (const cot of MEGUMIN_COTS) assert.equal(cot.content.length, COT_SIZES[cot.id], `${cot.id} content size`);

// The Thinking Cap is written once and opens both capped V10 variants.
assert.equal(THINKING_CAP.length, 515);
for (const id of ["cot-v10-ukiyo-cap-english", "cot-v10-shura-cap-english"]) {
  assert.ok(
    MEGUMIN_COTS.find((cot) => cot.id === id)?.content.includes(`\n\n${THINKING_CAP}\n\n`),
    `${id} carries the cap`,
  );
}

// Co-writers are derived from their base engines, never copied. Upstream only
// logs a console warning when a patch stops matching, so this is the guard:
// all 8 patches must still match and the shipped Co-writers must equal the derivation.
assert.equal(UKIYO_CO_WRITING.length + SHURA_CO_WRITING.length, 8);
const engine = (id: string): MeguminEngine => {
  const found = MEGUMIN_ENGINES.find((candidate) => candidate.id === id);
  assert.ok(found, id);
  return found;
};
for (const [baseId, coWriterId, patches] of [
  ["v10-core", "v10-core-cw", UKIYO_CO_WRITING],
  ["v10-shura", "v10-shura-cw", SHURA_CO_WRITING],
] as const) {
  const base = engine(baseId);
  const shipped = engine(coWriterId);
  const derived = coWriter(base, shipped.id, shipped.label, shipped.color, patches);
  assert.deepEqual(derived.missedPatches, [], `${coWriterId}: every co-writing patch matches`);
  assert.deepEqual(derived.engine, shipped);
  assert.equal(shipped.isCoWriter, true);
  assert.equal(shipped.recommended, false);
  patches.forEach(([find, replace], index) => {
    const slots = (["p1", "p4", "p6"] as const).filter((slot) => base[slot].includes(find));
    assert.ok(slots.length > 0, `${coWriterId} patch ${index + 1} matches the base`);
    for (const slot of slots) {
      assert.ok(shipped[slot].includes(replace), `${coWriterId} patch ${index + 1} applied to ${slot}`);
      assert.ok(
        !shipped[slot].includes(find),
        `${coWriterId} patch ${index + 1} left no single-author copy in ${slot}`,
      );
    }
  });
}
assert.deepEqual(coWriter(engine("v9-core"), "x", "x", "x", UKIYO_CO_WRITING).missedPatches, [1, 2, 3, 4]);

// Enhanced Dialogue swaps the whole <dialogue> section: Ukiyo's sits in p6, Shura's in p4.
assert.equal(ENHANCED_DIALOGUE.length, 5850);
assert.equal(applyEnhancedDialogue(engine("v10-core").p6).length, 13327 + 1581);
assert.equal(applyEnhancedDialogue(engine("v10-core").p4), engine("v10-core").p4);
assert.equal(applyEnhancedDialogue(engine("v10-shura").p4).length, 6409 + 3437);
assert.equal(applyEnhancedDialogue(engine("v9-core").p4), engine("v9-core").p4, "no <dialogue> section, no change");

// Engine predicates and the engine → CoT / locked-style pairings.
const ids = (predicate: (candidate: MeguminEngine) => boolean) =>
  MEGUMIN_ENGINES.filter(predicate).map((candidate) => candidate.id);
assert.deepEqual(ids(isCoWriterEngine), ["v10-core-cw", "v10-shura-cw"]);
assert.deepEqual(ids(isModernEngine), Object.keys(SLOT_SIZES).slice(0, 11));
assert.deepEqual(ids(engineLocksStyle), Object.keys(SLOT_SIZES).slice(0, 15));
assert.deepEqual(ids(engineUsesRenderLimits), ["v9-core", "v9-lite", "v9-director", "v9-immersion"]);
assert.equal(
  engineUsesRenderLimits({ id: "custom_1", isV9: true, isV10: true }),
  false,
  "V10 never takes the V9 limits",
);
assert.equal(isV10Engine(null), false);
assert.equal(isCoWriterEngine({ id: "custom_1", isCoWriter: true }), true, "a clone keeps answering by flag");

const COT_FOR: Record<string, string | null> = {
  "v10-core": "cot-v10-ukiyo-english",
  "v10-core-cw": "cot-v10-ukiyo-english",
  "v10-shura": "cot-v10-shura-english",
  "v10-shura-cw": "cot-v10-shura-english",
  "v9-core": "cot-v9-english",
  "v9-lite": "cot-v9-english",
  "v9-director": "cot-v9-english",
  "v9-immersion": "cot-v9-english",
  "v8-fusion": "cot-v8-english",
  "v8-m": "cot-v8-english",
  "v8-lite": "cot-v8-english",
  "v7.5": "cot-v7.5-english",
  "v7-core": "cot-v7-english",
  "v7-reality": "cot-v7-english",
  "v7-gentle": "cot-v7-english",
  "v6-dream-team": "cot-v6-english",
  "v6-dream-team-lite": "cot-v6-english",
  "balance Test": null,
  balance: null,
  cinematic: null,
  dark: null,
};
const STYLE_FOR: Record<string, string | null> = {
  "v10-core": "dir_v10_ukiyo",
  "v10-core-cw": "dir_v10_ukiyo",
  "v10-shura": "dir_v10_shura",
  "v10-shura-cw": "dir_v10_shura",
  "v9-core": "dir_v9",
  "v9-lite": "dir_v9",
  "v9-director": "dir_v9",
  "v9-immersion": "dir_v9",
  "v8-fusion": "dir_v8",
  "v8-m": "dir_v8",
  "v8-lite": "dir_v8",
  "v7.5": "dir_v7.5",
  "v7-core": "dir_v7_core",
  "v7-reality": "dir_v7",
  "v7-gentle": "dir_v7_gentle",
};
for (const candidate of MEGUMIN_ENGINES) {
  assert.equal(meguminCotForMode(candidate.id), COT_FOR[candidate.id], `CoT for ${candidate.id}`);
  assert.equal(lockedStyleIdFor(candidate), STYLE_FOR[candidate.id] ?? null, `style for ${candidate.id}`);
}
// Only the translated generations honour the language (both V6 engines pair with the full V6 CoT,
// as upstream); V10 checks Shura before the general V10 prefix.
assert.equal(meguminCotForMode("v6-dream-team-lite", "jp"), "cot-v6-jp");
assert.equal(meguminCotForMode("v10-shura-cw", "arabic"), "cot-v10-shura-english");
assert.equal(meguminCotForMode("v9-core", "arabic"), null);
assert.equal(meguminCotForMode(undefined), null);
assert.equal(meguminCotEntryForMode("v10-core")?.prefill, "<think>\n<think>\n");

console.log("megumin content engines regression passed");
