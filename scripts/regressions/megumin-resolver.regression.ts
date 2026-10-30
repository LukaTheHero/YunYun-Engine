import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The Megumin slot resolver (the buildBaseDict port): golden dictionaries for V10 Ukiyo, Shura, the
// Co-writers and the legacy and V7/V9 engines, composed independently from the content library;
// every {{megumin_*}} variable defined; layout routing; dice from the secure roller and recorded;
// the reasoning effort, wrapper, prefill and thinking tags; the Story Config block; slot providers;
// and the bundled preset assembled through assemblePrompt with no slot leaking.

const dir = mkdtempSync(join(tmpdir(), "megumin-resolver-"));
process.env.DATA_DIR = dir;
process.env.FILE_STORAGE_DIR = join(dir, "storage");
process.env.NODE_ENV = "test";
process.env.MARINARA_LITE = "true";
process.env.LOG_LEVEL = "silent";

const { getDB, closeDB } = await import("../../packages/server/src/db/connection.js");
const { seedDefaultPreset, seedMeguminSuitePreset } = await import("../../packages/server/src/db/seed.js");
const { createPromptsStorage } = await import("../../packages/server/src/services/storage/prompts.storage.js");
const { createChatsStorage } = await import("../../packages/server/src/services/storage/chats.storage.js");
const { createCharactersStorage } = await import("../../packages/server/src/services/storage/characters.storage.js");
const { createAppSettingsStorage } = await import("../../packages/server/src/services/storage/app-settings.storage.js");
const { updateMeguminSettings } = await import("../../packages/server/src/services/megumin/settings.js");
const { buildMeguminDict } = await import("../../packages/server/src/services/megumin/build-dict.js");
const { resolveMeguminSlots, MEGUMIN_EXAMPLES_SECTION_IDENTIFIER } =
  await import("../../packages/server/src/services/megumin/resolve-slots.js");
const { MEGUMIN_VARIABLE_NAMES, MEGUMIN_VARIABLE_SLOTS } =
  await import("../../packages/server/src/services/megumin/slots.js");
const { MEGUMIN_SLOT_PROVIDERS, MEGUMIN_PROVIDER_ORDER } =
  await import("../../packages/server/src/services/megumin/providers.js");
const { meguminAllSlotTriggers } = await import("../../packages/server/src/services/megumin/content/slots.js");
const { MEGUMIN_ENGINES } = await import("../../packages/server/src/services/megumin/content/engines/index.js");
const { ENHANCED_DIALOGUE } = await import("../../packages/server/src/services/megumin/content/engines/v10.js");
const { MEGUMIN_COTS } = await import("../../packages/server/src/services/megumin/content/cot/index.js");
const { MEGUMIN_DIRECT_STYLES } = await import("../../packages/server/src/services/megumin/content/direct-styles.js");
const { MEGUMIN_ADDONS } = await import("../../packages/server/src/services/megumin/content/addons.js");
const { MEGUMIN_LEGACY_BLOCKS } = await import("../../packages/server/src/services/megumin/content/blocks.js");
const { MEGUMIN_PERSONALITIES } = await import("../../packages/server/src/services/megumin/content/personalities.js");
const { MEGUMIN_TOGGLES } = await import("../../packages/server/src/services/megumin/content/toggles.js");
const { assemblePrompt } = await import("../../packages/server/src/services/prompt/assembler.js");
const {
  FEATURE_SETTINGS_KEY,
  MEGUMIN_FACTORY_PROFILE,
  STORY_CONFIG_BUILTIN_PRESETS,
  STORY_CONFIG_FIELDS,
  applyStoryConfigDefaults,
  buildConfigBlock,
  characterDataSchema,
  isStockMeguminPreset,
  loadStoryConfigPreset,
  mergeMeguminProfile,
  meguminProfileSchema,
} = await import("../../packages/shared/src/index.js");

type Profile = typeof MEGUMIN_FACTORY_PROFILE;
const norm = (text: string) => text.replace(/\s+/g, " ").trim();
const engine = (id: string) => {
  const found = MEGUMIN_ENGINES.find((e) => e.id === id);
  assert.ok(found, `engine ${id}`);
  return found;
};
const cot = (id: string) => {
  const found = MEGUMIN_COTS.find((c) => c.id === id);
  assert.ok(found, `CoT ${id}`);
  return found;
};
const styleRule = (id: string) => {
  const found = MEGUMIN_DIRECT_STYLES.find((s) => s.id === id);
  assert.ok(found, `style ${id}`);
  return found.rule;
};
const profileWith = (diff: Record<string, unknown>): Profile =>
  mergeMeguminProfile(MEGUMIN_FACTORY_PROFILE as Profile, diff as never);
const LANGUAGE = "[LANGUAGE RULE]\nALL OUTPUT EXCEPT THINKING MUST BE IN ENGLISH ONLY.";
const DEFAULT_CONFIG = buildConfigBlock(applyStoryConfigDefaults({}));
const USER_RULE = "4. NEVER write for or Control {{user}}";

try {
  const db = await getDB();
  await seedDefaultPreset(db);
  await seedMeguminSuitePreset(db);
  await createAppSettingsStorage(db).set(FEATURE_SETTINGS_KEY, JSON.stringify({ meguminMode: true }));
  const providerContext = { db, chatId: "", layout: "universal" as const, chatMessages: [], previewOnly: true };
  const fixedRolls = (...rolls: number[]) => {
    let i = 0;
    return (sides: number) => {
      assert.equal(sides, 20, "a d20");
      return rolls[i++ % rolls.length]!;
    };
  };
  /** The resolver's variables for a profile diff over the factory profile. */
  const resolve = (diff: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    resolveMeguminSlots({
      db,
      chatId: "",
      chatMessages: [],
      previewOnly: true,
      presetParameters: { customThinkingTags: [{ open: "<ksc>", close: "</ksc>" }] },
      options: { profileOverride: diff as never, rng: fixedRolls(11, 4, 17, 2, 20, 9), ...extra },
    });
  /** Compare every variable, whitespace-normalized; unlisted ones must be "". */
  const assertVariables = (variables: Record<string, string>, expected: Record<string, string>, label: string) => {
    assert.deepEqual(Object.keys(variables).sort(), [...MEGUMIN_VARIABLE_NAMES].sort(), `${label}: every variable`);
    for (const name of MEGUMIN_VARIABLE_NAMES) {
      assert.equal(norm(variables[name]!), norm(expected[name] ?? ""), `${label}: ${name}`);
    }
  };

  // ── The registry is the bundled preset's contract ──
  const bundled = JSON.parse(
    readFileSync(new URL("../../packages/server/src/db/megumin-suite-preset.json", import.meta.url), "utf8"),
  );
  const presetVariables = new Set<string>(
    JSON.stringify(bundled)
      .match(/\{\{(megumin_[a-z0-9_]+)\}\}/g)!
      .map((m: string) => m.slice(2, -2)),
  );
  assert.equal(MEGUMIN_VARIABLE_NAMES.length, 40);
  assert.deepEqual([...MEGUMIN_VARIABLE_NAMES].sort(), [...presetVariables].sort(), "registry = bundled preset slots");
  assert.deepEqual(
    MEGUMIN_VARIABLE_SLOTS.filter((s) => s.volatile).map((s) => s.name),
    ["img1", "npc_dossier", "dice", "story_plan", "relevant_npcs"],
    "the five volatile slots",
  );
  // {{<21 characters>}} is a card ID reference to the macro engine, never a variable.
  for (const name of MEGUMIN_VARIABLE_NAMES) assert.notEqual(name.length, 21, `${name} would never resolve`);
  for (const s of MEGUMIN_VARIABLE_SLOTS) {
    if (s.trigger) assert.ok(meguminAllSlotTriggers().includes(s.trigger), `${s.name} maps a known trigger`);
  }
  assert.equal(MEGUMIN_VARIABLE_SLOTS.find((s) => s.name === "dice")!.devEditable, true);
  assert.equal(MEGUMIN_VARIABLE_SLOTS.find((s) => s.name === "prompt4")!.devEditable, false);

  // ── V10 Ukiyo, the factory default (D9) ──
  const ukiyo = engine("v10-core");
  const ukiyoCot = cot("cot-v10-ukiyo-english");
  assert.ok(ukiyo.p4.includes("[[aiprompt]]"), "Ukiyo carries its style in p4");
  const ukiyoExpected = {
    megumin_prompt1: ukiyo.p1,
    megumin_prompt4: ukiyo.p4.split("[[aiprompt]]").join(styleRule("dir_v10_ukiyo")),
    megumin_prompt6: ukiyo.p6,
    megumin_think: `<think>\n${ukiyoCot.content}\n</think>`,
    megumin_config: DEFAULT_CONFIG,
    megumin_language: LANGUAGE,
  };
  const factory = await resolve({});
  assertVariables(factory.variables, ukiyoExpected, "Ukiyo");
  assert.equal(factory.variables.megumin_config!.length, 763, "the default <config> block");
  assert.deepEqual(factory.sectionEnabledOverrides, {}, "Universal keeps the examples");
  assert.deepEqual(factory.parameterPatch, {}, "no prefill, no new thinking tags");
  assert.equal(factory.turn.engineId, "v10-core");
  assert.equal(factory.turn.cotId, "cot-v10-ukiyo-english");
  assert.equal(factory.turn.layout, "universal");
  assert.equal(factory.turn.diceRolls, null);
  const tb = factory.turn.tokenBreakdown;
  assert.ok(tb.engine > 4000 && tb.cot > 400 && tb.style > 100, JSON.stringify(tb));
  assert.equal(tb.addons, 0);
  assert.equal(tb.dynamic, 0);
  assert.equal(tb.total, tb.engine + tb.cot + tb.style + tb.addons + tb.dynamic);

  // Enhanced Dialogue swaps Ukiyo's <dialogue> section, only on the engine it is switched on for.
  const enhanced = await resolve({ enhancedDialogue: { "v10-core": true } });
  const enhancedText = Object.values(enhanced.variables).join("\n");
  assert.ok(enhancedText.includes(ENHANCED_DIALOGUE), "Enhanced Dialogue is in");
  assert.equal(enhancedText.split("<dialogue>").length - 1, 1, "one dialogue section");
  assert.ok(
    !Object.values((await resolve({ enhancedDialogue: { "v10-shura": true } })).variables)
      .join("")
      .includes(ENHANCED_DIALOGUE),
  );

  // ── V10 Shura ──
  const shura = engine("v10-shura");
  const shuraCot = cot("cot-v10-shura-english");
  assert.ok(shura.p6.includes("[[aiprompt]]"), "Shura carries its style in p6");
  const shuraProfile = { mode: "v10-shura", model: "cot-v10-shura-english", activeStyleId: "dir_v10_shura" };
  assertVariables(
    (await resolve(shuraProfile)).variables,
    {
      megumin_prompt1: shura.p1,
      megumin_prompt4: shura.p4,
      megumin_prompt6: shura.p6.split("[[aiprompt]]").join(styleRule("dir_v10_shura")),
      megumin_think: `<think>\n${shuraCot.content}\n</think>`,
      megumin_config: DEFAULT_CONFIG,
      megumin_language: LANGUAGE,
    },
    "Shura",
  );

  // ── The Co-writers never get the never-write-for-{{user}} line; other engines do, on request (M3) ──
  for (const [id, base, cotId, styleId] of [
    ["v10-core-cw", "v10-core", "cot-v10-ukiyo-english", "dir_v10_ukiyo"],
    ["v10-shura-cw", "v10-shura", "cot-v10-shura-english", "dir_v10_shura"],
  ] as const) {
    const cw = engine(id);
    assert.equal(cw.isCoWriter, true);
    assert.notEqual(cw.p4 + cw.p6, engine(base).p4 + engine(base).p6, `${id} differs from ${base}`);
    const withStyle = (text: string) => text.split("[[aiprompt]]").join(styleRule(styleId));
    assertVariables(
      (await resolve({ mode: id, model: cotId, activeStyleId: styleId, userRuleReminder: true })).variables,
      {
        megumin_prompt1: cw.p1,
        megumin_prompt4: withStyle(cw.p4),
        megumin_prompt6: withStyle(cw.p6),
        megumin_think: `<think>\n${cot(cotId).content}\n</think>`,
        megumin_config: DEFAULT_CONFIG,
        megumin_language: LANGUAGE,
      },
      `${id} (no user rule)`,
    );
  }
  assert.equal((await resolve({ userRuleReminder: true })).variables.megumin_user_rule, USER_RULE);
  assert.equal(factory.variables.megumin_user_rule, "", "off by default");

  // ── Legacy V4.2 Balance: personality, toggles, raw style, V1 CoT with an effort cap ──
  const balance = engine("balance");
  const megumin = MEGUMIN_PERSONALITIES.find((p) => p.id === "megumin")!;
  const v1 = cot("cot-v1-english");
  assertVariables(
    (
      await resolve({
        mode: "balance",
        model: "cot-v1-english",
        personality: "megumin",
        toggles: { ooc: true, control: true },
        activeStyleId: "dir_simple",
        thinkEffort: "250",
        userPronouns: "female",
        userLanguage: "French",
      })
    ).variables,
    {
      megumin_prompt1: balance.p1,
      megumin_main: megumin.content,
      megumin_prompt2: balance.p2,
      megumin_prompt3: balance.p3,
      megumin_prompt4: balance.p4,
      megumin_prompt5: balance.p5,
      megumin_prompt6: balance.p6,
      megumin_pronouns: "{{user}} is female. Always portray and address her as such.",
      megumin_ooc: MEGUMIN_TOGGLES.ooc.content,
      megumin_control: MEGUMIN_TOGGLES.control.content,
      megumin_aiprompt: styleRule("dir_simple"),
      megumin_think: `<think>\nYour Thinking must not be more than 250 words.\n\n${v1.content}\n</think>`,
      megumin_config: DEFAULT_CONFIG,
      megumin_language: "[LANGUAGE RULE]\nALL OUTPUT EXCEPT THINKING MUST BE IN FRENCH ONLY.",
    },
    "V4.2 Balance",
  );

  // ── V7: module stripping (absent means on) and the style wrapper ──
  const v7core = engine("v7-core");
  assert.ok(v7core.p4.includes("<pc_solo_physicality"));
  const v7on = (await resolve({ mode: "v7-core", activeStyleId: "dir_v7_core" })).variables;
  assert.equal(norm(v7on.megumin_prompt4!), norm(v7core.p4), "V7 modules stay on until switched off");
  assert.equal(v7on.megumin_aiprompt, styleRule("dir_v7_core"), "V7's own style goes in unwrapped");
  assert.equal(v7on.megumin_main, "", "V7 blanks [[main]]");
  const v7off = (await resolve({ mode: "v7-core", activeStyleId: "dir_simple", toggles: { v7_pcsolo: false } }))
    .variables;
  assert.ok(!v7off.megumin_prompt4!.includes("<pc_solo_physicality"), "a switched-off V7 module is stripped");
  assert.ok(v7off.megumin_aiprompt!.startsWith(`<narrative_style>\n voice: ${styleRule("dir_simple")}`));

  // ── V9: render limits are filled into the engine text ──
  const v9 = (await resolve({ mode: "v9-core", v9Limits: { leanMin: 111, fullMax: 999 } })).variables;
  const v9text = Object.values(v9).join("\n");
  assert.ok(!/\[\[v9_/.test(v9text), "no render-limit tag left");
  assert.ok(v9text.includes("111") && v9text.includes("999") && v9text.includes("400"), "limits filled");
  assert.ok(!Object.values(factory.variables).join("").includes("[[v9_"), "V10 never carries them");

  // ── Add-ons, each alone ──
  for (const item of MEGUMIN_ADDONS) {
    const variables = (await resolve({ addons: [item.id] })).variables;
    const name =
      {
        "[[dice]]": "megumin_pre_dice",
        "[[COLOR]]": "megumin_color",
        "[[Direct]]": "megumin_direct",
        "[[DN]]": "megumin_dn",
      }[item.trigger] ?? `megumin_${item.trigger.slice(2, -2)}`;
    const expected = item.rolls
      ? item.content.replace("[[dice_rolls]]", [11, 4, 17, 2, 20, 9].slice(0, item.rolls).join(", "))
      : item.content;
    assert.equal(variables[name], expected, `add-on ${item.id}`);
  }
  assert.ok(!meguminProfileSchema.safeParse({ addons: ["dice", "dice_all"] }).success, "dice add-ons are exclusive");

  // ── Dice: the handed numbers are in the text and recorded; Cache Friendly moves them to the tail ──
  const dice = await resolve({ addons: ["dice"] });
  assert.deepEqual(dice.turn.diceRolls, [11, 4, 17]);
  assert.ok(dice.variables.megumin_pre_dice!.includes("this turn's rolls are 11, 4, 17."));
  assert.equal(dice.variables.megumin_tail_dice, "");
  const diceAll = await resolve({ addons: ["dice_all"], layout: "cache" });
  assert.deepEqual(diceAll.turn.diceRolls, [11, 4, 17, 2, 20, 9]);
  assert.equal(diceAll.variables.megumin_pre_dice, "");
  assert.ok(diceAll.variables.megumin_tail_dice!.includes("11, 4, 17, 2, 20, 9"));
  assert.ok(diceAll.turn.tokenBreakdown.addons > 0);
  // A shared dice rule that keeps the marker still gets this turn's numbers.
  await updateMeguminSettings(db, (s) => ({ ...s, sharedFragments: { dice: "Rolls: [[dice_rolls]]." } }));
  const sharedDice = await resolve({ addons: ["dice"] });
  assert.equal(sharedDice.variables.megumin_pre_dice, "Rolls: 11, 4, 17.");
  await updateMeguminSettings(db, (s) => ({ ...s, sharedFragments: {} }));
  // The default roller is the server's secure one: fair d20s, fresh every build.
  const seenRolls = new Set<number>();
  for (let i = 0; i < 40; i++) {
    const built = await buildMeguminDict({ profile: profileWith({ addons: ["dice_all"] }), providerContext });
    assert.equal(built.diceRolls?.length, 6);
    for (const roll of built.diceRolls!) {
      assert.ok(Number.isInteger(roll) && roll >= 1 && roll <= 20, `d20 roll ${roll}`);
      seenRolls.add(roll);
    }
  }
  assert.ok(seenRolls.size > 10, "the rolls vary");
  const buildDictSource = readFileSync(
    new URL("../../packages/server/src/services/megumin/build-dict.ts", import.meta.url),
    "utf8",
  );
  assert.match(buildDictSource, /const rng = input\.rng \?\? rollDieSecurely;/u);
  assert.doesNotMatch(buildDictSource, /Math\.random/u);

  // ── Layout routing for every volatile slot, and the examples marker ──
  const routed = [
    ...MEGUMIN_SLOT_PROVIDERS.filter((p) => p.area !== "director" && p.area !== "npc" && p.area !== "images"),
    {
      area: "director" as const,
      slots: ["[[storyplan]]", "[[storytracker]]"],
      order: MEGUMIN_PROVIDER_ORDER.director,
      resolve: async () => ({ "[[storyplan]]": "PLAN" }),
    },
    {
      area: "images" as const,
      slots: ["[[img1]]", "[[img2]]"],
      order: MEGUMIN_PROVIDER_ORDER.images,
      resolve: async () => ({ "[[img1]]": "IMAGE RULES", "[[img2]]": " and the 2 image tag" }),
    },
    {
      area: "npc" as const,
      slots: ["[[npc_dossier]]", "[[npc list]]"],
      order: MEGUMIN_PROVIDER_ORDER.npc,
      resolve: async () => ({ "[[npc_dossier]]": "DOSSIER RULES", "[[npc list]]": "[RELEVANT NPCs]" }),
    },
  ];
  for (const layout of ["universal", "cache"] as const) {
    const result = await resolve({ layout, addons: ["dice"] }, { providers: routed });
    const [here, there] = layout === "universal" ? ["pre", "tail"] : ["tail", "pre"];
    for (const [name, text] of [
      ["story_plan", "PLAN"],
      ["img1", "IMAGE RULES"],
      ["npc_dossier", "DOSSIER RULES"],
      ["relevant_npcs", "[RELEVANT NPCs]"],
      ["dice", "11, 4, 17"],
    ] as const) {
      assert.ok(result.variables[`megumin_${here}_${name}`]!.includes(text), `${layout}: ${name} goes ${here}`);
      assert.equal(result.variables[`megumin_${there}_${name}`], "", `${layout}: ${name} not ${there}`);
    }
    assert.equal(result.turn.layout, layout);
    assert.deepEqual(
      result.sectionEnabledOverrides,
      layout === "cache" ? { [MEGUMIN_EXAMPLES_SECTION_IDENTIFIER]: false } : {},
    );
    assert.ok(result.turn.tokenBreakdown.dynamic > 0, "live slots count as dynamic");
  }

  // ── Slot providers: order, ownership, failure, and blocks reading the finished dictionary ──
  const calls: string[] = [];
  let blocksSaw: Record<string, string> = {};
  const probe = (area: "director" | "banlist" | "images" | "memory" | "npc", slots: string[], values = {}) => ({
    area,
    slots,
    order: MEGUMIN_PROVIDER_ORDER[area],
    resolve: async () => {
      calls.push(area);
      return values;
    },
  });
  const providerResult = await resolve(
    { mvu: true },
    {
      providers: [
        {
          area: "blocks",
          slots: ["[[blocks]]"],
          order: MEGUMIN_PROVIDER_ORDER.blocks,
          resolve: async (ctx: { dict: Record<string, string> }) => {
            calls.push("blocks");
            blocksSaw = { ...ctx.dict };
            return { "[[blocks]]": "<Blocks>ENVELOPE</Blocks>" };
          },
        },
        probe("npc", ["[[npc list]]"], { "[[npc list]]": "NPCS", "[[THINK]]": "HIJACK" }),
        probe("memory", ["[[long-Memory]]"], { "[[long-Memory]]": "ARCHIVES" }),
        {
          area: "banlist",
          slots: ["[[banlist]]"],
          order: MEGUMIN_PROVIDER_ORDER.banlist,
          resolve: async () => {
            calls.push("banlist");
            throw new Error("ban list store unreadable");
          },
        },
        probe("images", ["[[img1]]", "[[img2]]"], { "[[img2]]": " and the 3 image tag" }),
        probe("director", ["[[storytracker]]"], {
          "[[storytracker]]": "# at the very end of the response put this block:\n<Story_Tracker>",
        }),
      ],
    },
  );
  assert.deepEqual(calls, ["director", "banlist", "images", "memory", "npc", "blocks"], "buildBaseDict order");
  assert.equal(providerResult.variables.megumin_banlist, "", "a failing provider leaves its slot empty");
  assert.equal(providerResult.variables.megumin_long_memory, "ARCHIVES");
  assert.equal(providerResult.variables.megumin_pre_relevant_npcs, "NPCS");
  assert.ok(
    providerResult.variables.megumin_think!.startsWith("<think>"),
    "a provider cannot write a slot it does not own",
  );
  assert.equal(providerResult.variables.megumin_blocks, "<Blocks>ENVELOPE</Blocks>");
  assert.equal(blocksSaw["[[npc list]]"], "NPCS", "blocks runs last, on the finished dictionary");
  assert.equal(blocksSaw["[[storytracker]]"], "<Story_Tracker>", "per-block headers are stripped");
  assert.equal(blocksSaw["[[storytracker2]]"], "[Story tracker here]");
  assert.equal(
    providerResult.variables.megumin_mvu,
    MEGUMIN_LEGACY_BLOCKS.find((b) => b.id === "mvu")!
      .content.replace("[[count]]", "")
      .replace("[[img2]]", " and the 3 image tag"),
    "MVU gets the early-resolved image count",
  );
  assert.deepEqual(
    MEGUMIN_SLOT_PROVIDERS.map((p) => p.area),
    ["director", "banlist", "images", "memory", "npc", "blocks"],
  );
  for (const p of MEGUMIN_SLOT_PROVIDERS) {
    assert.deepEqual(
      Object.values(await p.resolve({} as never)),
      p.slots.map(() => ""),
      `${p.area} is stubbed to ""`,
    );
  }

  // ── Reasoning: effort, wrapper, prefill, thinking tags ──
  const think = async (diff: Record<string, unknown>) => (await resolve(diff)).variables.megumin_think!;
  assert.ok(
    (await think({ thinkEffort: "100" })).startsWith("<think>\nYour Thinking must not be more than 100 words.\n\n"),
  );
  assert.ok(
    (await think({ thinkEffort: "custom", customThinkEffort: 77 })).startsWith(
      "<think>\nYour Thinking must not be more than 77 words.\n\n",
    ),
  );
  assert.equal(await think({ thinkingV2: true }), `<think>\n<think>\n<think>\n${ukiyoCot.content}\n</think>`);
  const noCot = await resolve({ cotEnabled: false, sendCotPrefill: true });
  assert.equal(noCot.variables.megumin_think, "");
  assert.equal(noCot.turn.cotId, null);
  assert.deepEqual(noCot.parameterPatch, {}, "no reasoning, no prefill");
  // A clone that pins its own reasoning: the turn record names no framework it did not send.
  await updateMeguminSettings(db, (s) => ({
    ...s,
    customEngines: [{ ...ukiyo, id: "my-clone", label: "Clone", parentId: "v10-core", cot: "CLONE COT" }],
  }));
  const clone = await resolve({ mode: "my-clone" });
  assert.equal(clone.variables.megumin_think, "<think>\nCLONE COT\n</think>");
  assert.equal(clone.turn.engineId, "my-clone");
  assert.equal(clone.turn.cotId, "custom", "the clone's own reasoning, not the picker's");
  assert.equal((await resolve({ mode: "my-clone", cotEnabled: false })).turn.cotId, null);
  await updateMeguminSettings(db, (s) => ({ ...s, customEngines: [] }));
  assert.deepEqual((await resolve({ sendCotPrefill: true })).parameterPatch, { assistantPrefill: ukiyoCot.prefill });
  assert.equal(ukiyoCot.prefill, "<think>\n<think>\n");
  assert.deepEqual((await resolve({ sendCotPrefill: true, thinkingV2: true })).parameterPatch, {
    assistantPrefill: "<think>\n<think>\n<think>",
  });
  await updateMeguminSettings(db, (s) => ({
    ...s,
    sharedFragments: { think: "<reasoning>\n{Thinking}\n</reasoning>" },
  }));
  const customWrapper = await resolve({});
  assert.equal(customWrapper.variables.megumin_think, `<reasoning>\n${ukiyoCot.content}\n</reasoning>`);
  assert.deepEqual(customWrapper.parameterPatch.customThinkingTags, [
    { open: "<ksc>", close: "</ksc>" },
    { open: "<reasoning>", close: "</reasoning>" },
  ]);
  await updateMeguminSettings(db, (s) => ({ ...s, sharedFragments: { think: "<ksc></ksc>" } }));
  const noMarker = await resolve({});
  assert.equal(noMarker.variables.megumin_think, `<ksc></ksc>\n${ukiyoCot.content}`, "the script is appended");
  assert.deepEqual(noMarker.parameterPatch, {}, "<ksc> is already the preset's");
  await updateMeguminSettings(db, (s) => ({ ...s, sharedFragments: {} }));

  // ── Story Config ──
  for (const preset of STORY_CONFIG_BUILTIN_PRESETS) {
    const values = loadStoryConfigPreset(preset);
    assert.equal(
      (await resolve({ storyConfig: values })).variables.megumin_config,
      buildConfigBlock(values),
      `config preset ${preset.name}`,
    );
  }
  const emptyConfig = Object.fromEntries(STORY_CONFIG_FIELDS.map((f) => [f.key, ""]));
  assert.equal((await resolve({ storyConfig: emptyConfig })).variables.megumin_config, "", "nothing set, no block");
  assert.ok(
    (await resolve({ storyConfig: { notes: "{{user}} hides a scar." } })).variables.megumin_config!.includes(
      "{{user}} hides a scar.",
    ),
    "macros stay for the assembler to resolve",
  );

  // ── Custom prompt, every variable defined across a busy profile ──
  const busy = await resolve({
    mode: "v8-fusion",
    model: "cot-v8-fusion-english",
    addons: ["dice_all", "html", "death", "combat", "direct", "color", "npc_events", "dn"],
    dnRatio: { enabled: true, dialogue: 70 },
    onomatopoeia: { enabled: true, useStyling: true },
    userPronouns: "male",
    customPrompt: "Keep it short.",
    mvu: true,
    layout: "cache",
  });
  assert.deepEqual(Object.keys(busy.variables).sort(), [...MEGUMIN_VARIABLE_NAMES].sort());
  assert.equal(busy.variables.megumin_custom_instructions, "Keep it short.");
  assert.equal(busy.variables.megumin_dnratio, "- Ratio: Maintain a balance of 70% Dialogue and 30% Narration.");
  assert.ok(busy.variables.megumin_onomato!.includes("animated and colored using HTML and CSS"));
  assert.equal(busy.variables.megumin_ooc, "", "modern engines blank OOC");
  for (const value of Object.values(busy.variables)) {
    assert.equal(typeof value, "string");
    assert.ok(!value.includes("[[aiprompt]]") && !value.includes("[[dice_rolls]]") && !value.includes("{Thinking}"));
  }

  // ── The bundled preset through assemblePrompt ──
  const presets = createPromptsStorage(db);
  const stock = (await presets.list()).find(isStockMeguminPreset)!;
  assert.ok(stock);
  const sections = await presets.listSections(stock.id);
  const character = await createCharactersStorage(db).create(
    characterDataSchema.parse({ name: "Aqua", description: "A goddess of water.", mes_example: "<START>\nAqua: Hi!" }),
  );
  assert.ok(character);
  const chat = await createChatsStorage(db).create({
    name: "Megumin assembly",
    mode: "roleplay",
    characterIds: [character.id],
    connectionId: null,
    promptPresetId: stock.id,
    personaId: null,
    groupId: null,
  });
  assert.ok(chat);
  const assemble = (megumin: Record<string, unknown>) =>
    assemblePrompt({
      db,
      preset: stock as never,
      sections: sections as never,
      groups: [],
      choiceBlocks: [],
      chatChoices: {},
      chatId: chat.id,
      characterIds: [character.id],
      personaName: "Kazuma",
      personaDescription: "An adventurer.",
      chatMessages: [
        { role: "user", content: "Hello there.", contextKind: "history" },
        { role: "assistant", content: "Hi.", contextKind: "history" },
        { role: "user", content: "Let's go.", contextKind: "history" },
      ] as never,
      megumin: { enabled: true, rng: fixedRolls(5, 6, 7), ...megumin },
    });
  const assembled = await assemble({ profileOverride: { addons: ["dice"], userRuleReminder: true } });
  const text = assembled.messages.map((m) => m.content).join("\n");
  assert.ok(!text.includes("{{megumin_"), `no slot macro leaks: ${text.match(/\{\{megumin_\w+\}\}/g)}`);
  assert.ok(!text.includes("{{user}}") && !text.includes("{{char}}"), "macros inside slot values resolve");
  assert.ok(!text.includes("{Thinking}"));
  for (const trigger of meguminAllSlotTriggers()) assert.ok(!text.includes(trigger), `no ${trigger} leaks`);
  assert.ok(text.includes(norm(ukiyo.p1).slice(0, 60)), "the engine text is in");
  assert.ok(text.includes("4. NEVER write for or Control Kazuma"));
  assert.ok(text.includes("this turn's rolls are 5, 6, 7."));
  assert.deepEqual(assembled.megumin?.diceRolls, [5, 6, 7], "the turn record carries the rolls");
  assert.equal(assembled.megumin?.engineId, "v10-core");
  // Output RULES sits at depth 1: right before the last history message.
  const rulesIndex = assembled.messages.findIndex((m) => m.content.includes("## FORMATTING RULES:"));
  assert.ok(rulesIndex > 0);
  assert.equal(assembled.messages[rulesIndex + 1]?.content, "Let's go.");
  assert.ok(text.includes("Aqua: Hi!"), "Universal sends the examples");
  const cache = await assemble({ profileOverride: { layout: "cache", addons: ["dice"] } });
  const cacheText = cache.messages.map((m) => m.content).join("\n");
  assert.ok(!cacheText.includes("Aqua: Hi!"), "Cache Friendly leaves the examples out");
  const cacheRules = cache.messages.find((m) => m.content.includes("## FORMATTING RULES:"))!.content;
  assert.ok(cacheRules.includes("this turn's rolls are 5, 6, 7."), "the dice move into Output RULES");
  assert.equal(cache.megumin?.layout, "cache");
  const prefilled = await assemble({ profileOverride: { sendCotPrefill: true } });
  assert.equal(prefilled.parameters.assistantPrefill, "<think>\n<think>\n");
  assert.deepEqual(prefilled.parameters.customThinkingTags, [{ open: "<ksc>", close: "</ksc>" }]);
  for (const off of [await assemble({ enabled: false }), await assemble({ enabled: undefined })]) {
    assert.equal(off.megumin, undefined, "not a Megumin turn (the caller says so, even with the switch on)");
    assert.ok(
      off.messages
        .map((m) => m.content)
        .join("\n")
        .includes("{{megumin_"),
      "and the slots stay literal",
    );
  }
  // The content library loads only for a Megumin turn.
  const assemblerSource = readFileSync(
    new URL("../../packages/server/src/services/prompt/assembler.ts", import.meta.url),
    "utf8",
  );
  assert.ok(!/^import [^;]*megumin\/resolve-slots\.js";$/mu.test(assemblerSource.replace(/^import type .*$/gmu, "")));
  assert.ok(assemblerSource.includes('await import("../megumin/resolve-slots.js")'));

  console.info("megumin resolver regression passed");
} finally {
  await closeDB();
  rmSync(dir, { recursive: true, force: true });
}
