import assert from "node:assert/strict";
import { MEGUMIN_ADDONS } from "../../packages/server/src/services/megumin/content/addons.js";
import { MEGUMIN_LEGACY_BLOCKS } from "../../packages/server/src/services/megumin/content/blocks.js";
import { MEGUMIN_COTS } from "../../packages/server/src/services/megumin/content/cot/index.js";
import { MEGUMIN_DIRECT_STYLES } from "../../packages/server/src/services/megumin/content/direct-styles.js";
import { MEGUMIN_ENGINES } from "../../packages/server/src/services/megumin/content/engines/index.js";
import {
  MEGUMIN_COMFY_PLACEHOLDERS,
  MEGUMIN_IMAGE_RESOLUTIONS,
} from "../../packages/server/src/services/megumin/content/image-data.js";
import { MEGUMIN_PERSONALITIES } from "../../packages/server/src/services/megumin/content/personalities.js";
import {
  MEGUMIN_DEFAULT_PROMPTS,
  MEGUMIN_PROMPT_MODULES,
} from "../../packages/server/src/services/megumin/content/prompts/defaults.js";
import {
  MEGUMIN_SKELETON,
  meguminSkeletonTriggersInOrder,
} from "../../packages/server/src/services/megumin/content/skeleton.js";
import {
  MEGUMIN_SLOT_REGISTRY,
  meguminAddonSlots,
  meguminAllSlotTriggers,
  meguminEngineSlots,
  meguminModuleTrigger,
  meguminOverridableSlots,
  meguminSlotByKey,
  meguminSlotByTrigger,
  meguminSlotIsLive,
} from "../../packages/server/src/services/megumin/content/slots.js";
import { MEGUMIN_STYLE_TEMPLATES } from "../../packages/server/src/services/megumin/content/style-templates.js";
import { MEGUMIN_STYLE_TAG_LIBRARY } from "../../packages/server/src/services/megumin/content/styles.js";
import { MEGUMIN_TOGGLES } from "../../packages/server/src/services/megumin/content/toggles.js";
import {
  MEGUMIN_ADDON_CATALOG,
  MEGUMIN_ADDON_EXCLUSIVE_GROUPS,
  MEGUMIN_COT_FRAMEWORKS,
  MEGUMIN_COT_IDS,
  MEGUMIN_COT_LANGUAGES,
  MEGUMIN_DEFAULT_STAT_FIELDS,
  MEGUMIN_DIRECT_STYLE_CATALOG,
  MEGUMIN_ENGINE_CATALOG,
  MEGUMIN_LEGACY_BLOCK_CATALOG,
  MEGUMIN_PERSONALITY_CATALOG,
  MEGUMIN_STAT_FIELD_PACKS,
  MEGUMIN_STYLE_TAG_CATEGORIES,
  MEGUMIN_STYLE_TEMPLATE_CATALOG,
  MEGUMIN_TOGGLE_CATALOG,
  meguminAllowedCotFrameworks,
  meguminCotFrameworkOf,
  meguminCotIdFor,
  mergeMeguminStatFieldPack,
} from "../../packages/shared/src/features/megumin/catalog.js";
import {
  applyStoryConfigDefaults,
  buildConfigBlock,
  CONFIG_PREAMBLE,
  countActiveConfigFields,
  isStandingConfigField,
  loadStoryConfigPreset,
  normalizeStoryConfig,
  STORY_CONFIG_BUILTIN_PRESETS,
  STORY_CONFIG_FIELDS,
  upgradeConfigValue,
} from "../../packages/shared/src/features/megumin/story-config.js";

// Megumin Mode ships Megumin Suite's styles, add-ons, block templates, task
// prompts and Story Config verbatim. The sizes below were measured from the
// upstream files (data/*.js, src/prompts/*.js, src/features/storyconfig/config.js)
// as JavaScript string lengths; a truncated or hand-edited copy changes one.

const sizes = <T>(list: readonly T[], key: (item: T) => string, text: (item: T) => string) =>
  Object.fromEntries(list.map((item) => [key(item), text(item).length]));

// ── Server content ──────────────────────────────
assert.deepEqual(
  sizes(
    MEGUMIN_DIRECT_STYLES,
    (s) => s.id,
    (s) => s.rule,
  ),
  {
    dir_v10_ukiyo: 537,
    dir_v10_shura: 188,
    dir_v9: 1212,
    dir_v9lite: 606,
    dir_v8: 339,
    dir_v7_core: 1345,
    dir_v7_gentle: 1344,
    "dir_v7.5": 348,
    dir_v7: 1517,
    dir_simple: 217,
    dir_descriptive: 263,
    dir_dialogue: 217,
    dir_clinical: 235,
    dir_sensory: 217,
  },
);
assert.deepEqual(
  sizes(
    MEGUMIN_ADDONS,
    (a) => a.id,
    (a) => a.content,
  ),
  {
    dice: 1595,
    dice_all: 1767,
    html: 1132,
    death: 614,
    combat: 590,
    direct: 115,
    color: 196,
    npc_events: 900,
    dn: 176,
  },
);
assert.deepEqual(
  sizes(
    MEGUMIN_LEGACY_BLOCKS,
    (b) => b.id,
    (b) => b.content,
  ),
  { info: 1443, cyoa: 102, mvu: 155, npc_inner_chatter: 776 },
);
assert.deepEqual([MEGUMIN_TOGGLES.ooc.content.length, MEGUMIN_TOGGLES.control.content.length], [109, 110]);
assert.deepEqual(
  MEGUMIN_PERSONALITIES.map((p) => p.content.length),
  [96, 5, 13, 11],
);
assert.deepEqual(
  MEGUMIN_STYLE_TEMPLATES.map((t) => t.notes.length),
  [282, 215, 334, 233, 179, 269, 253, 481, 420],
);
assert.deepEqual(
  MEGUMIN_STYLE_TAG_LIBRARY.map((c) => [c.category, c.tags.length]),
  [
    ["Genre & Tone", 27],
    ["Narration", 12],
    ["Pacing", 9],
    ["POV", 4],
  ],
);
// The rolls the dice add-ons hand over, and the one exclusive group they form.
assert.deepEqual(
  MEGUMIN_ADDONS.filter((a) => a.exclusive).map((a) => [a.id, a.exclusive, a.rolls]),
  [
    ["dice", "dice", 3],
    ["dice_all", "dice", 6],
  ],
);
assert.ok(
  MEGUMIN_ADDONS.every((a) => !a.content.includes("[[dice_rolls]]") || a.rolls),
  "rolls feed [[dice_rolls]]",
);

const promptSizes = Object.fromEntries(
  Object.entries(MEGUMIN_DEFAULT_PROMPTS).map(([module, prompts]) => [
    module,
    Object.fromEntries(Object.entries(prompts).map(([key, text]) => [key, text.length])),
  ]),
);
assert.deepEqual(promptSizes, {
  storyPlan: {
    systemPrompt: 4386,
    userPrompt: 3074,
    thinkingPrompt: 1202,
    injectionTemplate: 509,
    trackerTemplate: 887,
    unrestrictedBlock: 680,
  },
  banList: { systemPrompt: 383, userPrompt: 193, thinkingPrompt: 466, injectionTemplate: 108 },
  imageGen: {
    systemPrompt: 304,
    userPrompt: 200,
    thinkingPrompt: 478,
    injectionTemplate: 247,
    rulesIllusPov: 1674,
    examplesIllusPov: 1499,
    rulesSdxlPov: 1415,
    examplesSdxlPov: 1750,
    rulesIllusCinematic: 1745,
    examplesIllusCinematic: 1315,
    rulesSdxlCinematic: 1101,
    examplesSdxlCinematic: 1414,
    rulesIllusPortrait: 1053,
    examplesIllusPortrait: 524,
    rulesSdxlPortrait: 920,
    examplesSdxlPortrait: 737,
  },
  memoryCore: { systemPrompt: 748, userPrompt: 209, longTermTemplate: 194, shortTermTemplate: 58 },
  npcBank: { systemPrompt: 389, userPrompt: 346, thinkingPrompt: 495, dossierRules: 1895 },
});
// banList is deliberately absent upstream: its overrides live one level up.
assert.deepEqual(MEGUMIN_PROMPT_MODULES, ["storyPlan", "imageGen", "memoryCore", "npcBank"]);
// Placeholders keep upstream's {{token}} spelling, so a saved Megumin edit still matches.
assert.ok(MEGUMIN_DEFAULT_PROMPTS.banList.injectionTemplate.endsWith("{{banItems}}"));
assert.ok(MEGUMIN_DEFAULT_PROMPTS.npcBank.dossierRules.includes("{{template}}"));

assert.equal(MEGUMIN_COMFY_PLACEHOLDERS.length, 19);
assert.equal(MEGUMIN_COMFY_PLACEHOLDERS[0]?.key, '"%prompt%"');
assert.equal(MEGUMIN_IMAGE_RESOLUTIONS.length, 10);

// The skeleton: the upstream card order, minus the disabled USER Consent card (decision M4).
assert.equal(MEGUMIN_SKELETON.length, 18);
assert.ok(!MEGUMIN_SKELETON.some((card) => card.name === "USER Consent" || card.role === "user"));
assert.deepEqual(
  MEGUMIN_SKELETON.filter((card) => card.marker).map((card) => card.id),
  [
    "worldInfoBefore",
    "charDescription",
    "charPersonality",
    "dialogueExamples",
    "scenario",
    "worldInfoAfter",
    "personaDescription",
    "chatHistory",
  ],
);
const triggers = meguminSkeletonTriggersInOrder();
assert.equal(triggers.length, 35);
assert.deepEqual(triggers.slice(0, 3), ["[[prompt1]]", "[[main]]", "[[prompt2]]"]);
assert.deepEqual(triggers.slice(-4), ["[[user]]", "[[Language]]", "[[MVU]]", "[[prefill]]"]);

// ── Slot registry ───────────────────────────────
assert.equal(MEGUMIN_SLOT_REGISTRY.length, 43);
assert.equal(new Set(MEGUMIN_SLOT_REGISTRY.map((s) => s.trigger)).size, 43, "one entry per trigger");
// Every trigger the skeleton carries is registered, so none can leak raw.
const allTriggers = meguminAllSlotTriggers();
assert.equal(allTriggers.length, 62);
assert.deepEqual(
  triggers.filter((t) => !allTriggers.includes(t)),
  [],
);
assert.deepEqual(
  meguminOverridableSlots().map((s) => s.key),
  [
    "cot",
    "prefill",
    "think",
    "death",
    "combat",
    "html",
    "dice",
    "userControl",
    "direct",
    "dn",
    "dialogueColor",
    "onomato",
    "dnratio",
    "banlist",
    "info",
    "cyoa",
    "mvu",
    "npc_inner_chatter",
    "storytracker",
    "language",
    "pronouns",
    "count",
  ],
);
assert.equal(meguminAddonSlots().length, 20);
assert.deepEqual(
  meguminEngineSlots().map((s) => s.key),
  ["p1", "p3", "p4", "p5", "p6", "cot", "prefill"],
);
// Fallbacks are the add-on and block texts; the dice slot follows the variant that is on.
const diceSlot = meguminSlotByKey("dice");
assert.equal(diceSlot?.fallback?.(), MEGUMIN_ADDONS.find((a) => a.id === "dice")?.content);
assert.equal(diceSlot?.fallback?.({ addons: ["dice_all"] }), MEGUMIN_ADDONS.find((a) => a.id === "dice_all")?.content);
assert.equal(meguminSlotByKey("info")?.fallback?.(), MEGUMIN_LEGACY_BLOCKS.find((b) => b.id === "info")?.content);
// Upstream quirk kept: the "Simple" chatter preset names a block that does not exist, so it is empty.
assert.deepEqual(
  meguminSlotByKey("npc_inner_chatter")?.presets?.map((p) => [p.label, p.value().length]),
  [
    ["Default", 776],
    ["Simple", 0],
  ],
);
assert.equal(meguminSlotByKey("cot")?.picker?.options().length, MEGUMIN_COTS.length - 1, "every CoT but cot-off");
// Gates.
const userRule = meguminSlotByTrigger("[[user]]");
assert.equal(meguminSlotIsLive(userRule, { mode: "v10-core" }), true);
assert.equal(meguminSlotIsLive(userRule, { mode: "v10-shura-cw" }), false, "co-writers never get the rule");
assert.equal(meguminSlotIsLive(userRule, { mode: "my-clone" }), true);
assert.equal(
  meguminSlotIsLive(userRule, { mode: "my-clone" }, { customModes: [{ id: "my-clone", isCoWriter: true }] }),
  false,
  "a clone of a co-writer is still a co-writer",
);
assert.equal(meguminSlotIsLive(meguminSlotByKey("dice"), { addons: ["dice_all"] }), true);
assert.equal(meguminSlotIsLive(meguminSlotByKey("dice"), { addons: [] }), false);
assert.equal(meguminSlotIsLive(meguminSlotByKey("think"), {}), true, "CoT is on unless switched off");
assert.equal(meguminSlotIsLive(meguminSlotByKey("think"), { cotEnabled: false }), false);
assert.equal(meguminSlotIsLive(meguminSlotByKey("storytracker"), { storyPlan: { enabled: true } }), true);
assert.equal(meguminSlotIsLive(meguminSlotByKey("p1"), {}), true, "a slot with no gate is live");
assert.equal(meguminModuleTrigger("p3"), "[[prompt3]]");
assert.equal(meguminModuleTrigger("[[death]]"), "[[death]]");
assert.equal(meguminModuleTrigger(""), null);

// ── Catalog against the content it describes ────
// Upstream's generation filter (coreAndCot.js).
const familyOf = (engine: { id: string; label: string }) =>
  engine.label.includes("V4")
    ? "V4"
    : engine.label.includes("V5")
      ? "V5"
      : engine.id.includes("v6")
        ? "V6"
        : engine.id.includes("v7")
          ? "V7"
          : engine.id.includes("v8")
            ? "V8"
            : engine.id.includes("v10")
              ? "V10"
              : "V9";
assert.deepEqual(
  MEGUMIN_ENGINE_CATALOG.map((meta) => ({ ...meta })),
  MEGUMIN_ENGINES.map((engine) => {
    const { p1: _p1, p2: _p2, p3: _p3, p4: _p4, p5: _p5, p6: _p6, A1: _a1, A2: _a2, ...meta } = engine;
    return { ...meta, family: familyOf(engine) };
  }),
);
assert.deepEqual(
  [...MEGUMIN_COT_IDS],
  MEGUMIN_COTS.map((cot) => cot.id),
);
assert.deepEqual(
  MEGUMIN_DIRECT_STYLE_CATALOG,
  MEGUMIN_DIRECT_STYLES.map(({ id, name }) => ({ id, name })),
);
assert.deepEqual(
  MEGUMIN_STYLE_TAG_CATEGORIES,
  MEGUMIN_STYLE_TAG_LIBRARY.map((c) => ({ category: c.category, tags: c.tags.map((t) => t.id) })),
);
assert.deepEqual(
  MEGUMIN_STYLE_TEMPLATE_CATALOG,
  MEGUMIN_STYLE_TEMPLATES.map(({ name, tags }) => ({ name, tags })),
);
assert.deepEqual(
  MEGUMIN_PERSONALITY_CATALOG,
  MEGUMIN_PERSONALITIES.map(({ content: _content, ...meta }) => meta),
);
assert.deepEqual(
  MEGUMIN_TOGGLE_CATALOG,
  Object.entries(MEGUMIN_TOGGLES).map(([id, { trigger: _trigger, content: _content, ...meta }]) => ({ id, ...meta })),
);
assert.deepEqual(
  MEGUMIN_ADDON_CATALOG.map(({ requiresFamily: _family, ...meta }) => meta),
  MEGUMIN_ADDONS.map(({ trigger: _trigger, content: _content, ...meta }) => meta),
);
assert.deepEqual(
  MEGUMIN_ADDON_CATALOG.filter((a) => a.requiresFamily).map((a) => [a.id, a.requiresFamily]),
  [["npc_events", "V6"]],
);
assert.deepEqual(MEGUMIN_ADDON_EXCLUSIVE_GROUPS, { dice: ["dice", "dice_all"] });
assert.deepEqual(
  MEGUMIN_LEGACY_BLOCK_CATALOG,
  MEGUMIN_LEGACY_BLOCKS.map(({ trigger: _trigger, content: _content, ...meta }) => meta),
);

// CoT frameworks: every framework x language is a real CoT id, and parses back.
for (const framework of MEGUMIN_COT_FRAMEWORKS) {
  const langs = framework.englishOnly ? ["english"] : MEGUMIN_COT_LANGUAGES.map((l) => l.id);
  for (const lang of langs) {
    const id = meguminCotIdFor(framework.id, lang);
    assert.ok((MEGUMIN_COT_IDS as readonly string[]).includes(id), `${id} exists`);
    assert.deepEqual(meguminCotFrameworkOf(id), { framework: framework.id, lang });
  }
}
assert.equal(MEGUMIN_COT_IDS.length, 47);
assert.equal(meguminCotIdFor("v9", "arabic"), "cot-v9-english", "English-only frameworks ignore the language");
assert.deepEqual(meguminCotFrameworkOf("cot-v10-shura-cap-english"), { framework: "v10-shura-cap", lang: "english" });
assert.deepEqual(meguminCotFrameworkOf("cot-v6-lite-jp"), { framework: "v6-lite", lang: "jp" });
assert.equal(meguminCotFrameworkOf("cot-off"), null);
assert.deepEqual(meguminAllowedCotFrameworks("v10-shura-cw"), [
  "v10-ukiyo",
  "v10-ukiyo-cap",
  "v10-shura",
  "v10-shura-cap",
]);
assert.deepEqual(meguminAllowedCotFrameworks("v7.5"), ["v7.5"]);
assert.deepEqual(meguminAllowedCotFrameworks("v7-core"), ["v7", "v7-lite"]);
assert.deepEqual(meguminAllowedCotFrameworks("v8-fusion"), ["v8-fusion"], "badge quirk: its default CoT is cot-v8");
assert.deepEqual(meguminAllowedCotFrameworks("v6-dream-team-lite"), ["v6", "v6-lite"]);
assert.equal(meguminAllowedCotFrameworks("balance"), null);

// Stat field packs merge by label, case-insensitively, never replacing a field.
const bonds = MEGUMIN_DEFAULT_STAT_FIELDS.bonds;
const romance = MEGUMIN_STAT_FIELD_PACKS.bonds[0]!;
const merged = mergeMeguminStatFieldPack(bonds, romance);
assert.deepEqual(
  merged.map((f) => f.label),
  ["Mood", "Affection", "Trust", "Desire", "Tension"],
);
assert.equal(merged[1], bonds[1], "an existing field keeps its settings");
assert.notEqual(merged[4], romance.fields[3], "pack fields are copied");
assert.equal(bonds.length, 4, "the input list is not changed");
assert.deepEqual(
  mergeMeguminStatFieldPack([{ id: "x", label: "tension", type: "number" }], romance).map((f) => f.label),
  ["tension", "Affection", "Trust", "Desire"],
);
assert.deepEqual(
  mergeMeguminStatFieldPack(merged, MEGUMIN_STAT_FIELD_PACKS.bonds[1]!).map((f) => f.label),
  ["Mood", "Affection", "Trust", "Desire", "Tension", "Respect", "Fear", "Grudge"],
);
assert.deepEqual(
  MEGUMIN_STAT_FIELD_PACKS.sheet.map((p) => p.label),
  ["RPG", "Survival"],
);

// ── Story Config ────────────────────────────────
assert.deepEqual(
  STORY_CONFIG_FIELDS.map((f) => f.key),
  [
    "genre",
    "culture",
    "era",
    "pov",
    "focus",
    "tone",
    "narratorPresence",
    "npcSpeechStyle",
    "npcDisposition",
    "difficulty",
    "friction",
    "explicitness",
    "pace",
    "length",
    "notes",
  ],
);
assert.equal(CONFIG_PREAMBLE.length, 161);
assert.equal(buildConfigBlock({}), "", "nothing set, no block");
assert.equal(buildConfigBlock(null), "");
// The default block carries pov, pace and length only.
const defaults = applyStoryConfigDefaults({});
const defaultBlock = buildConfigBlock(defaults);
assert.equal(defaultBlock.length, 763);
assert.ok(defaultBlock.startsWith(`<config>\n${CONFIG_PREAMBLE}\n\n- pov: third person limited, locked to`));
assert.deepEqual(
  defaultBlock
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .map((line) => line.split(":")[0]),
  ["- pov", "- pace", "- length"],
);
assert.equal(countActiveConfigFields(defaults), 3);
assert.deepEqual(
  STORY_CONFIG_FIELDS.filter((f) => isStandingConfigField(f.key)).map((f) => f.key),
  ["pov", "pace", "length"],
);
// Text fields carry their aiNote; select values never do.
assert.equal(
  buildConfigBlock({ genre: "  noir  ", difficulty: "harsh" }),
  `<config>\n${CONFIG_PREAMBLE}\n\n- genre: noir *sets the conventions the story plays straight, never comments on*\n` +
    "- difficulty: competence is required and failure is common. Mistakes carry a cost that persists past the scene they happen in\n</config>",
);
// Labels and legacy spellings upgrade to the sentence the model reads; custom text is kept.
const difficulty = STORY_CONFIG_FIELDS.find((f) => f.key === "difficulty")!;
assert.equal(
  upgradeConfigValue(difficulty, "FORGIVING (most attempts land)"),
  upgradeConfigValue(difficulty, "forgiving"),
);
assert.equal(
  upgradeConfigValue(difficulty, "hard. the world is against {{user}}"),
  "hard. the world is against {{user}}",
);
// A named default ("light", "ordinary", "realistic", "normal") drops the line.
const folded = normalizeStoryConfig({
  narratorPresence: "Light (one beat per response)",
  friction: "normal",
  enabled: true,
});
assert.equal(folded.narratorPresence, "");
assert.equal(folded.friction, "");
assert.equal(folded.enabled, true, "other keys are kept");
assert.equal(folded.genre, "", "every field is present");
// Nothing is mutated.
const input = { pov: "first person" };
normalizeStoryConfig(input);
buildConfigBlock(input);
assert.deepEqual(input, { pov: "first person" });

// The built-in presets: a missing key loads as "" (Cozy Slice of Life clears culture).
assert.deepEqual(
  STORY_CONFIG_BUILTIN_PRESETS.map((p) => [p.name, buildConfigBlock(loadStoryConfigPreset(p)).length]),
  [
    ["Grimdark Survival", 1511],
    ["Cozy Slice of Life", 1647],
    ["Noir Mystery", 1500],
    ["Slow Dread Horror", 1526],
    ["Slow Burn Romance", 920],
  ],
);
const cozy = STORY_CONFIG_BUILTIN_PRESETS.find((p) => p.id === "cfg_cozy")!;
assert.equal("culture" in cozy.values, false);
assert.equal(loadStoryConfigPreset(cozy).culture, "");
assert.equal(countActiveConfigFields(loadStoryConfigPreset(cozy)), 12);
// Romance leaves npcDisposition on the preset default and fills nothing it does not set.
assert.equal(countActiveConfigFields(loadStoryConfigPreset(STORY_CONFIG_BUILTIN_PRESETS[4]!)), 6);

console.log("megumin content library regression passed");
