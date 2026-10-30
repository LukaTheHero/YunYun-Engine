// ──────────────────────────────────────────────
// Megumin Mode: the placeholder dictionary the preset is filled from
//
// Ported from Megumin Suite v10.0 by KazumaONIISAN (Arif-salah), https://github.com/Arif-salah/Megumin-Suite, CC BY-NC 4.0, used with the author's permission.
// Source: src/engine/buildBaseDict.js. The steps keep upstream's order, which is load-bearing:
// later steps read and rewrite what earlier ones wrote. The dictionary is keyed by upstream's
// [[trigger]] spelling; resolve-slots.ts maps it onto the {{megumin_*}} variables.
//
// What differs from upstream, on purpose:
// - Inputs are explicit (profile, custom engines, shared fragments, providers, rng) instead of
//   SillyTavern globals, so the build is a pure function of them.
// - The live features (Story Director, Ban List, Image Gen, Memory Core, NPC Bank, Blocks) fill
//   their slots through providers.ts, called where buildBaseDict filled them.
// - Dice come from the server's secure roller, and the rolls are returned for the turn record.
// - The V7 module toggles count as on until switched off (upstream's tab wrote `true` on display).
// - The writing style falls back to the selected style's rule when the profile holds no rule text,
//   and to the engine's locked style when none was ever picked (upstream's Writing Style tab).
// ──────────────────────────────────────────────

import { buildConfigBlock, type MeguminCustomEngine, type MeguminResolvedProfile } from "@marinara-engine/shared";
import { logger } from "../../lib/logger.js";
import { rollDieSecurely, type DieRoller } from "../game/dice-rng.js";
import { MEGUMIN_ADDONS } from "./content/addons.js";
import { MEGUMIN_LEGACY_BLOCKS } from "./content/blocks.js";
import { MEGUMIN_COTS } from "./content/cot/index.js";
import { MEGUMIN_DIRECT_STYLES } from "./content/direct-styles.js";
import { MEGUMIN_ENGINES, type MeguminEngine } from "./content/engines/index.js";
import { applyEnhancedDialogue } from "./content/engines/v10.js";
import { MEGUMIN_PERSONALITIES } from "./content/personalities.js";
import {
  meguminModuleTrigger,
  meguminOverridableSlots,
  meguminSlotIsLive,
  type MeguminSlotDef,
} from "./content/slots.js";
import { MEGUMIN_TOGGLES } from "./content/toggles.js";
import {
  engineLocksStyle,
  engineUsesRenderLimits,
  isCoWriterEngine,
  isModernEngine,
  isV7Engine,
  lockedStyleIdFor,
} from "./engine-predicates.js";
import { MEGUMIN_SLOT_PROVIDERS, type MeguminSlotProvider, type MeguminSlotProviderContext } from "./providers.js";

/** A stock engine, or a Dev Mode clone / imported engine from the settings store. */
export type MeguminDictEngine = MeguminEngine | MeguminCustomEngine;

export interface MeguminDictInput {
  profile: MeguminResolvedProfile;
  customEngines?: readonly MeguminCustomEngine[];
  /** Dev Mode's install-wide slot text, keyed by slot key. */
  sharedFragments?: Readonly<Record<string, string>>;
  providers?: readonly MeguminSlotProvider[];
  /** What a provider gets besides the profile and the dictionary. */
  providerContext: Omit<MeguminSlotProviderContext, "profile" | "dict" | "now">;
  rng?: DieRoller;
  now?: () => Date;
}

export interface MeguminDictResult {
  dict: Record<string, string>;
  engine: MeguminDictEngine | null;
  /** This turn's d20s, in the order the dice add-on hands them over; null without dice. */
  diceRolls: number[] | null;
  /**
   * The reasoning framework sent: the picked one's id, "custom" when an engine or a Dev Mode
   * fragment replaced its text, null when no reasoning is sent.
   */
  cotId: string | null;
}

const V7_UNWRAPPED_STYLE_IDS = new Set(["dir_v7", "dir_v7_core", "dir_v7_gentle"]);

/** Where a slot's text comes from: engine, then shared fragment. The built-in text is never written back. */
function resolveSlotOverride(
  slot: MeguminSlotDef,
  engine: MeguminDictEngine,
  sharedFragments: Readonly<Record<string, string>>,
): string | null {
  if (!slot.key) return null;
  const fromEngine = (engine as unknown as Record<string, unknown>)[slot.key];
  if (typeof fromEngine === "string" && fromEngine.trim() !== "") return fromEngine;
  const fromShared = sharedFragments[slot.key] ?? "";
  return fromShared.trim() !== "" ? fromShared : null;
}

/** The writing-style rule and the style it came from. */
function writingStyle(profile: MeguminResolvedProfile, engine: MeguminDictEngine | null) {
  if (profile.aiRule) return { styleId: profile.activeStyleId, rule: profile.aiRule };
  const styleId = profile.activeStyleId ?? (engineLocksStyle(engine) ? lockedStyleIdFor(engine) : null);
  if (!styleId) return { styleId, rule: "" };
  const rule =
    MEGUMIN_DIRECT_STYLES.find((style) => style.id === styleId)?.rule ??
    profile.customStyles.find((style) => style.id === styleId)?.rule ??
    "";
  return { styleId, rule };
}

async function runProviders(
  providers: readonly MeguminSlotProvider[],
  fromOrder: number,
  toOrder: number,
  dict: Record<string, string>,
  ctx: Omit<MeguminSlotProviderContext, "dict">,
): Promise<void> {
  const due = providers.filter((p) => p.order >= fromOrder && p.order <= toOrder).sort((a, b) => a.order - b.order);
  for (const provider of due) {
    let values: Partial<Record<string, string>>;
    try {
      values = await provider.resolve({ ...ctx, dict });
    } catch (err) {
      // A failing feature leaves its slots empty; the turn still goes out.
      logger.warn(err, "[megumin] The %s slot provider failed; its slots stay empty", provider.area);
      continue;
    }
    for (const trigger of provider.slots) {
      const value = values[trigger];
      if (typeof value === "string") dict[trigger] = value;
    }
  }
}

export async function buildMeguminDict(input: MeguminDictInput): Promise<MeguminDictResult> {
  const { profile } = input;
  const sharedFragments = input.sharedFragments ?? {};
  const providers = input.providers ?? MEGUMIN_SLOT_PROVIDERS;
  const rng = input.rng ?? rollDieSecurely;
  const providerCtx = { ...input.providerContext, profile, now: input.now ?? (() => new Date()) };
  const dict: Record<string, string> = {};

  const customEngines = input.customEngines ?? [];
  const activeEngine: MeguminDictEngine | null =
    [...MEGUMIN_ENGINES, ...customEngines].find((m) => m.id === profile.mode) ?? null;
  const isV7 = isV7Engine(activeEngine);
  // Everything V8/V9 does, V10 does too. The one exception is the Lean/Full render
  // split below, which asks engineUsesRenderLimits() instead.
  const isModern = isModernEngine(activeEngine);
  // Upstream's legacy block list; only the MVU output format is still a loose slot here.
  // The envelope blocks are the Blocks provider's.
  const legacyBlocks = profile.mvu ? ["mvu"] : [];
  const gateProfile = { ...profile, blocks: legacyBlocks };
  const gateCtx = { customModes: customEngines };

  if (engineUsesRenderLimits(activeEngine)) {
    const v9l = profile.v9Limits;
    dict["[[v9_lean_min]]"] = String(v9l.leanMin || 300);
    dict["[[v9_lean_max]]"] = String(v9l.leanMax || 400);
    dict["[[v9_full_min]]"] = String(v9l.fullMin || 700);
    dict["[[v9_full_max]]"] = String(v9l.fullMax || 1200);
    dict["[[count]]"] = "";
  } else {
    dict["[[v9_lean_min]]"] = "";
    dict["[[v9_lean_max]]"] = "";
    dict["[[v9_full_min]]"] = "";
    dict["[[v9_full_max]]"] = "";
  }

  // 1. GLOBAL DEFAULTS (Language, Pronouns, Word Count)
  const targetLang = profile.userLanguage.trim() !== "" ? profile.userLanguage.toUpperCase() : "ENGLISH";
  dict["[[Language]]"] = `[LANGUAGE RULE]\nALL OUTPUT EXCEPT THINKING MUST BE IN ${targetLang} ONLY.`;

  if (profile.userPronouns === "male")
    dict["[[pronouns]]"] = `{{user}} is male. Always portray and address him as such.`;
  else if (profile.userPronouns === "female")
    dict["[[pronouns]]"] = `{{user}} is female. Always portray and address her as such.`;

  // The legacy word count is gone; length lives in the Story Config block.
  dict["[[count]]"] = "";

  // Story Config (<config> block). Empty when every field is off.
  dict["[[config]]"] = buildConfigBlock(profile.storyConfig);

  // 2. STANDARD STAGE SELECTIONS
  // Personality: overwritten later for custom engines and blanked for V6+.
  const pData = MEGUMIN_PERSONALITIES.find((p) => p.id === profile.personality);
  dict["[[main]]"] = pData ? pData.content : "";
  dict["[[AI1]]"] = "Understood.";
  dict["[[AI2]]"] = "Understood.";
  if (profile.personality === "megumin") {
    dict["[[AI1]]"] = "Fine i read the rules.";
    dict["[[AI2]]"] = "OK i Understnd it.";
  }

  if (profile.toggles.ooc) dict["[[OOC]]"] = MEGUMIN_TOGGLES.ooc.content;
  if (profile.toggles.control) dict["[[control]]"] = MEGUMIN_TOGGLES.control.content;
  // POV moved out of the style library and into the Story Config block.
  const povInjectionStr = "";

  const style = writingStyle(profile, activeEngine);
  if (profile.mode === "v7.5") {
    const narratorPersona = style.rule
      ? style.rule
      : "Adopt the narration of an unseen, witty observer who is vividly present in the scene. The narrator has a distinct personality—dry, occasionally judgmental, quietly amused, or sharply critical. Feel free to throw subtle shade at terrible decisions, point out the absurdity of a situation, or comment on the scene's chaos with a bit of comedic flair.";
    dict["[[aiprompt]]"] =
      `<Narration_style>\n narrator_persona: "${povInjectionStr}${narratorPersona}"\n quarantine_rule: "CRITICAL: This opinionated voice applies STRICTLY and EXCLUSIVELY to the narration. It MUST NOT bleed into <NPC_dialogue>. NPCs do not share the narrator's wit or perspective; their dialogue remains entirely bound by their own demographics, stress levels, and individual flaws."\n proportional_prose: "Match narrative intensity to the event. A spilled coffee is just a minor annoyance, not a catalyst for dramatic prose. Zero purple prose. Use grounded metaphors sparingly to anchor a scene, not distract from it."\n</Narration_style>`;
  } else if (style.rule) {
    if (isV7 && !V7_UNWRAPPED_STYLE_IDS.has(style.styleId ?? "")) {
      dict["[[aiprompt]]"] =
        `<narrative_style>\n voice: ${povInjectionStr}${style.rule}\n  pacing: "Unhurried where it should be. A quiet moment can take a paragraph. A violent one can take a sentence. Match the rhythm to the content."\n  length_directive: "Typical outputs should run 3–6 substantial paragraphs, scaling with scene density. Lean toward the higher end during rich, atmospheric, or multi-character scenes. Go shorter — even a single paragraph — only when the moment genuinely demands economy: a held breath, a door closing, a line that hits harder alone. Never pad, never rush."\n</narrative_style>`;
    } else {
      dict["[[aiprompt]]"] = povInjectionStr + style.rule;
    }
  }
  for (const aId of profile.addons) {
    const item = MEGUMIN_ADDONS.find((a) => a.id === aId);
    if (item) dict[item.trigger] = item.content;
  }

  // Stage 5 (format blocks)
  for (const bId of legacyBlocks) {
    const item = MEGUMIN_LEGACY_BLOCKS.find((b) => b.id === bId);
    if (item) dict[item.trigger] = item.content;
  }

  // Stage 6 (CoT framework)
  const modData = MEGUMIN_COTS.find((m) => m.id === profile.model);
  if (profile.cotEnabled !== false && modData) {
    dict["[[COT]]"] = modData.content;
    if (modData.prefill) dict["[[prefill]]"] = modData.prefill;
  } else {
    dict["[[COT]]"] = "";
    dict["[[prefill]]"] = "";
  }

  if (profile.dnRatio.enabled) {
    const d = profile.dnRatio.dialogue;
    const n = 100 - d;
    dict["[[DNRATIO]]"] = `- Ratio: Maintain a balance of ${d}% Dialogue and ${n}% Narration.`;
  } else {
    dict["[[DNRATIO]]"] = "";
  }

  if (profile.onomatopoeia.enabled) {
    let onoRule = `- Narration must utilize onomatopoeia. Use precise, context-specific phonetic representations for physical interactions (e.g., the click of a latch, the thud of a heavy object, the soughing of wind) rather than abstract descriptions of sound.`;
    if (profile.onomatopoeia.useStyling) {
      onoRule += `\nAll onomatopoeic words must animated and colored using HTML and CSS. The selected style tag and color must objectively correspond to the physical nature or movement of the sound produced; for example, a repetitive friction sound such as "shush-shush" must utilize a sliding animation tag to represent the physical action.`;
    }
    dict["[[onomato]]"] = onoRule;
  } else {
    dict["[[onomato]]"] = "";
  }

  // MVU: length is a Story Config field now, so the block never carries a word count.
  if (legacyBlocks.includes("mvu")) {
    const baseMvu = MEGUMIN_LEGACY_BLOCKS.find((b) => b.id === "mvu")?.content ?? "";
    dict["[[MVU]]"] = baseMvu.replace("[[count]]", "");
  } else {
    dict["[[MVU]]"] = "";
  }

  // 3. ENGINE OVERRIDES: runs last so it can overwrite the stage choices.
  const isCustom = !!activeEngine && !MEGUMIN_ENGINES.some((x) => x.id === activeEngine.id);
  if (activeEngine) {
    // Enhanced Dialogue is keyed on the engine's own id, so a clone has its own switch; a no-op
    // on engines whose prompts carry no <dialogue> section.
    const enhanced = profile.enhancedDialogue[activeEngine.id] === true;
    const prompts: Record<string, unknown> = activeEngine as unknown as Record<string, unknown>;
    for (let i = 1; i <= 6; i++) {
      const raw = prompts[`p${i}`];
      let val = typeof raw === "string" ? raw : "";
      if (enhanced) val = applyEnhancedDialogue(val);
      dict[`[[prompt${i}]]`] = val;
      dict[`[prompt${i}]`] = val;
    }

    // Custom engines kill [[main]] only when built from scratch.
    if (isCustom && activeEngine.isCoreClone !== true) dict["[[main]]"] = "";

    if (activeEngine.A1) dict["[[AI1]]"] = activeEngine.A1;
    if (activeEngine.A2) dict["[[AI2]]"] = activeEngine.A2;

    // The rule keeping the model's hands off {{user}}: every engine except the Co-writers, which
    // are built to write {{user}}. Above the override pass, so a shared fragment still wins.
    dict["[[user]]"] = isCoWriterEngine(activeEngine) ? "" : "4. NEVER write for or Control {{user}}";

    // Slot overrides: engine → shared fragment. The built-in text is already in the dictionary.
    for (const slot of meguminOverridableSlots()) {
      if (!meguminSlotIsLive(slot, gateProfile, gateCtx)) continue;
      const value = resolveSlotOverride(slot, activeEngine, sharedFragments);
      if (value !== null) dict[slot.trigger] = value;
    }

    // Custom engine modules, each hung off the slot it names.
    for (const ct of ("customToggles" in activeEngine ? activeEngine.customToggles : undefined) ?? []) {
      if (!profile.toggles[ct.id]) continue;
      const targetKey = meguminModuleTrigger(ct.attachPoint);
      if (targetKey && dict[targetKey] !== undefined) dict[targetKey] += `\n\n${ct.content}`;
    }

    // V7 dynamic stripping
    if (isV7) {
      const prompt1 = dict["[[prompt1]]"];
      if (profile.toggles.v7_ooc === false && prompt1) {
        dict["[[prompt1]]"] = prompt1.replace(/<ooc_protocol>[\s\S]*?<\/ooc_protocol>/g, "");
      }
      let prompt4 = dict["[[prompt4]]"];
      if (prompt4) {
        if (profile.toggles.v7_pcsolo === false) {
          prompt4 = prompt4.replace(/<pc_solo_physicality[\s\S]*?<\/pc_solo_physicality>/g, "");
        }
        if (profile.toggles.v7_culture === false) {
          prompt4 = prompt4.replace(/<cultural_anchoring>[\s\S]*?<\/cultural_anchoring>/g, "");
        }
        if (profile.toggles.v7_scene === false) {
          prompt4 = prompt4.replace(/<scene_choreography>[\s\S]*?<\/scene_choreography>/g, "");
        }
        if (profile.toggles.v7_intro === false) {
          prompt4 = prompt4.replace(/\s*introduction_protocol:\s*"[^"]*"/g, "");
        }
        dict["[[prompt4]]"] = prompt4;
      }
    }

    // V8/V9/V10: the style goes inside the engine text where the engine asks for it, and the loose
    // slot is wiped so it is not sent twice.
    if (isModern) {
      const aiPromptVal = dict["[[aiprompt]]"] || "";
      for (let i = 1; i <= 6; i++) {
        const text = dict[`[[prompt${i}]]`];
        if (text && text.includes("[[aiprompt]]"))
          dict[`[[prompt${i}]]`] = text.split("[[aiprompt]]").join(aiPromptVal);
      }
      dict["[[aiprompt]]"] = "";
    }
  }

  // Dice: filled AFTER the override pass, so an edited dice rule that keeps the [[dice_rolls]]
  // marker still gets this turn's numbers. Fresh numbers every build: a swipe re-rolls.
  const diceRolls: number[] = [];
  for (const aId of profile.addons) {
    const item = MEGUMIN_ADDONS.find((a) => a.id === aId);
    const text = item?.rolls ? dict[item.trigger] : undefined;
    if (!item?.rolls || !text || !text.includes("[[dice_rolls]]")) continue;
    const rolls = Array.from({ length: item.rolls }, () => rng(20));
    diceRolls.push(...rolls);
    dict[item.trigger] = text.replace("[[dice_rolls]]", rolls.join(", "));
  }

  // Wipe the main persona for V6, V7 and the modern engines.
  if (profile.mode.includes("v6-dream-team") || isV7 || isModern) dict["[[main]]"] = "";

  // Wipe the persona and toggle tags for V8, V9 and V10.
  if (isModern) {
    dict["[[OOC]]"] = "";
    dict["[[control]]"] = "";
    dict["[[AI1]]"] = "";
    dict["[[AI2]]"] = "";
  }

  const cotText = profile.cotEnabled !== false ? (dict["[[COT]]"] ?? "") : "";
  const cotId = !cotText ? null : cotText === modData?.content ? profile.model : "custom";

  // Thinking effort, at the very top of the active reasoning script.
  const effort = profile.thinkEffort || "unspecified";
  if (effort !== "unspecified" && dict["[[COT]]"]) {
    const words = effort === "custom" ? profile.customThinkEffort || 100 : effort;
    dict["[[COT]]"] = `Your Thinking must not be more than ${words} words.\n\n` + dict["[[COT]]"];
  }

  // [[THINK]]: the reasoning script travels inside the think wrapper ({Thinking} marks its place),
  // never under its own tag. An edited wrapper without the marker still receives the script.
  if (profile.cotEnabled !== false && dict["[[COT]]"]) {
    const defaultWrapper = profile.thinkingV2
      ? "<think>\n<think>\n<think>\n{Thinking}\n</think>"
      : "<think>\n{Thinking}\n</think>";
    const current = dict["[[THINK]]"];
    let wrapper = current && current.trim() !== "" ? current : defaultWrapper;
    if (!wrapper.includes("{Thinking}")) wrapper += "\n{Thinking}";
    dict["[[THINK]]"] = wrapper.split("{Thinking}").join(dict["[[COT]]"]);
    dict["[[COT]]"] = "";
  } else {
    dict["[[THINK]]"] = "";
  }

  // 4. Story Director, Ban List and Image Gen.
  for (const trigger of ["[[storyplan]]", "[[storytracker]]", "[[banlist]]", "[[img1]]", "[[img2]]"])
    dict[trigger] = "";
  await runProviders(providers, 11, 13, dict, providerCtx);

  const prefill = dict["[[prefill]]"];
  if (profile.thinkingV2 && prefill) dict["[[prefill]]"] = prefill.replace(/\n<think>[\s\S]*/, "\n<think>\n<think>");

  dict["[[cyoa2]]"] = dict["[[cyoa]]"] ? "[CYOA block here]" : "";
  dict["[[infoblock2]]"] = dict["[[infoblock]]"] ? "[World state block here]" : "";
  dict["[[storytracker2]]"] = dict["[[storytracker]]"] ? "[Story tracker here]" : "";
  dict["[[npc_inner_chatter2]]"] = dict["[[npc_inner_chatter]]"] ? "[Npc inner chatter here]" : "";

  // Early tokens, resolved inside every other value so none is missed.
  const earlyTokens = [
    "[[count]]",
    "[[Language]]",
    "[[pronouns]]",
    "[[DNRATIO]]",
    "[[img2]]",
    "[[v9_lean_min]]",
    "[[v9_lean_max]]",
    "[[v9_full_min]]",
    "[[v9_full_max]]",
  ];
  for (const et of earlyTokens) {
    const val = dict[et];
    if (val === undefined) continue;
    for (const [k, text] of Object.entries(dict)) {
      if (k !== et && text.includes(et)) dict[k] = text.split(et).join(val);
    }
  }

  // ponytail: the compact World State swap belongs to the Blocks provider, which owns the World State
  // block and its cadence; nothing here holds that block until phase B lands.

  // Per-block headers: the envelope carries its own, once.
  for (const block of ["[[infoblock]]", "[[npc_inner_chatter]]", "[[cyoa]]", "[[storytracker]]"]) {
    const text = dict[block];
    if (text && text.trim() !== "")
      dict[block] = text.replace(/# at the very end of the response put this block:\s*/gi, "");
  }

  // 5. Memory Core, then the NPC Bank.
  for (const trigger of ["[[long-Memory]]", "[[Short-memory]]"]) dict[trigger] = "";
  for (const trigger of ["[[npc_dossier]]", "[[npc_dossier2]]", "[[npc list]]", "[[npc_updates]]"]) dict[trigger] = "";
  await runProviders(providers, 14, 19, dict, providerCtx);

  // The block envelope, LAST: it reads the finished dictionary.
  dict["[[blocks]]"] = "";
  await runProviders(providers, 20, Number.POSITIVE_INFINITY, dict, providerCtx);

  return { dict, engine: activeEngine, diceRolls: diceRolls.length > 0 ? diceRolls : null, cotId };
}
