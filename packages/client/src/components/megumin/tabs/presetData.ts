// ──────────────────────────────────────────────────────────────────────────────
// Megumin Suite's library text and rules that its Preset & Thinking, Persona,
// Language & Add-ons and Model Setup tabs carry in their own code rather than
// in data/ (src/ui/tabs/coreAndCot.js, personality.js, globalAndBlocks.js,
// src/features/modelsetup/loadouts.js, data/cot/index.js meguminCotForMode).
// The descriptions are Megumin's library content, kept as written.
// Derived from Megumin Suite (CC BY-NC 4.0, see packages/shared/src/megumin/LICENSE.md).
// ──────────────────────────────────────────────────────────────────────────────
import { MeguminEngineFlags } from "@marinara-engine/shared/megumin/client";

export type MeguminEngine = Record<string, any>;
export type MeguminProfileLike = Record<string, any>;

/** The preset cards' descriptions (coreAndCot.js DESCRIPTIONS). */
export const ENGINE_DESCRIPTIONS: Record<string, string> = {
  balance: "The original Secret Sauce. NPCs react naturally — no simping, no needless hostility.",
  "balance Test": "New and improved balance mode that aims to use less tokens and more creativity.",
  cinematic: "Hollywood-inspired storytelling. Dramatic beats and heightened tension.",
  dark: "Balance but harsher. The world is unforgiving and consequences hit harder.",
  "v6-anime-director": "Advanced cinematic framing and pacing. Designed to emulate high-budget anime direction.",
  "v6-dream-team": "The ultimate 6-specialist writer room. Unprecedented narrative consistency and realism.",
  "v6-dream-team-lite": "A streamlined version of the Dream Team. Faster generation with lower token overhead.",
  "v7-core":
    "The V7 Core engine. The perfect middle ground: cinematic pacing, realistic friction, and relentless world progression.",
  "v7-reality": "The V7 Reality engine. Grounded, unrelenting simulation with zero narrative protection.",
  "v7-gentle": "The V7 Gentle engine. A softer, more intimate storytelling flow.",
  "v7.5":
    "The Kismet engine. Focused purely on inescapable narrative momentum, pushing the story forward as the unseen author of fate.",
  "v8-m":
    "Unmatched in complex human psychology, authentic flawed dialogue, and autonomous, multi-layered story plotting.",
  "v8-lite":
    "A streamlined, highly efficient version of Obsidian. Retains the core rules of psychology, dialogue, and momentum with a much lighter token footprint.",
  "v8-fusion":
    "The absolute pinnacle of the Megumin Suite. A hybrid engine mixing V8 Obsidian's deep psychology with V6 Dream Team's specialist writer room framework.",
  "v11-voice":
    "One storyteller writes the whole turn, plainly and with a voice of its own. Characters play their sheets at full strength, the world goes on without you, and a notebook keeps the story's hidden truths until they come out. The base for every model.",
  "v11-deepseek":
    "V11 Тайна with one more line for DeepSeek, which tends to treat the character as the player and leave them doing nothing: the character and everyone else in the story are the AI's to write and to move. Use it with Chomusuke writing the blocks, since DeepSeek leaves them out.",
  "v11-writers-room":
    "V11 Тайна written by a room of five: a director, a psychologist, a story architect, a storyteller and a dialogue writer talk the turn over in the thinking before it is written.",
  "v11-room":
    "The first V11 release, kept as it was. A writers' room of five: a director who keeps continuity and checks every draft, a psychologist for what each character wants, a story architect who keeps the author's notebook of hidden truths, a storyteller for the narration, and a dialogue writer for the voices. The reader gets one voice. Turns the Author's Notebook on by itself.",
  "v10-core":
    "The storyteller. Ukiyo is the looser of the two — a teller with a temperament, spinning the world and its history, following whatever in the scene is most alive. It trades a little polish for invention: the prose wanders, reaches for an image, and occasionally overreaches. Pick it for atmosphere, momentum and a world that feels told rather than composed. Neither V10 is a downgrade of the other — run a few scenes on each and keep the one that sounds like the story you want to read.",
  "v10-shura":
    "The writer. Shura is the stricter of the two — no slop, no AI tells, no line that exists to manage the scene. Every character is the protagonist of their own story, acting from their own values, and none of them is a villain in their own eyes; there is no objective right or wrong for the narration to take sides on. Pick it for prose that reads like a book and a cast that drives the story itself. Neither V10 is a downgrade of the other — run a few scenes on each and keep the one that sounds like the story you want to read.",
  "v10-core-cw":
    "Ukiyo, with the narrator writing {{user}} as well. It reads how you write — diction, rhythm, how boldly you act — and plays your character in that voice. Anything you write yourself is canon and is never overwritten or corrected. Your history stays yours; only the acting is shared.",
  "v10-shura-cw":
    "Shura with shared authorship: every character is a protagonist, {{user}} among them, and the narrator writes them all in your voice. It yields the moment you take a turn back, and never invents your past. For hands-off, cinematic play — watching the story rather than steering each beat.",
  "v9-core":
    "The definitive, final Megumin V9 Preset. V9 Mirage is the absolute pinnacle of narrative simulation, delivering hyper-realistic psychology, visceral atmospheric grounding, and dynamic world consequences. This is the ultimate, highly recommended preset.",
  "v9-lite":
    "An experimental beta engine with a slightly different, highly stylized narrative flow. Proved interesting enough to include for those who want an alternative storytelling rhythm. Note: this doesn't support custom Writing style it have it own one. ",
  "v9-director":
    "A unique beta hybrid blending the specialized writer-room mechanics of V8 Fusion with the raw psychological depth of V9 Xin. Highly experimental. Note: this doesn't support custom Writing style it have it own one.",
  "v9-immersion":
    "A streamlined, lightweight version of V9 Mirage. It retains the core philosophy and brutal realism of Mirage but runs with a smaller context footprint. V9 Mirage is still recommended if your model can handle it.",
};

export interface CotType {
  id: string;
  label: string;
  desc: string;
  isNew?: boolean;
}

/** The thinking frameworks (coreAndCot.js COT_TYPES). */
export const COT_TYPES: CotType[] = [
  {
    id: "v11-voice",
    label: "CoT V11 Тайна",
    desc: "Five steps in order: read your turn and the history, decide what each other character does, decide what the turn adds and whether a hidden truth gets a clue, write, then check the draft. Made for V11 Тайна.",
    isNew: true,
  },
  {
    id: "v11-voice-cap",
    label: "CoT V11 Тайна — Thinking Cap",
    desc: "The same five steps with a hard ceiling on the thinking: one line of notes per step, and the reply is written only once, in the reply. For models that over-think, like DeepSeek, Kimi, GLM and Qwen.",
    isNew: true,
  },
  {
    id: "v11-wr",
    label: "CoT V11 Тайна · Writers' Room",
    desc: "The same five steps, worked by the room: the director reads, the psychologist decides what each other character does, the story architect picks what the turn adds, the storyteller and dialogue writer write, and the director checks.",
    isNew: true,
  },
  {
    id: "v11-wr-cap",
    label: "CoT V11 Тайна · Writers' Room — Thinking Cap",
    desc: "The room's five steps with a hard ceiling on the thinking: one line of notes per role, and the reply is written only once, in the reply. For models that over-think, like DeepSeek, Kimi, GLM and Qwen.",
    isNew: true,
  },
  {
    id: "v11",
    label: "CoT V11 Тайна Preview",
    desc: "The writers' room works the turn in order: the director reads the history, the psychologist decides what each character does, the story architect picks what is new and whether a hidden truth gets a clue or comes out, the writers draft, and the director checks it against the rules.",
    isNew: true,
  },
  {
    id: "v11-cap",
    label: "CoT V11 Тайна Preview — Thinking Cap",
    desc: "The same five steps with a hard ceiling on the thinking: one line of notes per step, and the reply is written only once, in the reply. For models that over-think, like DeepSeek, Kimi, GLM and Qwen.",
    isNew: true,
  },
  {
    id: "v10-ukiyo",
    label: "CoT V10 Ukiyo",
    desc: "The long-form reasoning built for Ukiyo. Thinks like a novelist muttering before a draft — present tense, a little messy, never a plan. No phases, no checklists, no audits.",
    isNew: true,
  },
  {
    id: "v10-ukiyo-cap",
    label: "CoT V10 Ukiyo — Thinking Cap",
    desc: "The same writer's mind with a hard ceiling on the thinking phase. For models that over-think.",
    isNew: true,
  },
  {
    id: "v10-shura",
    label: "CoT V10 Shura",
    desc: "Seven rules carried into the writing rather than a plan made before it. Built for V10 Shura, and the lightest of the four.",
    isNew: true,
  },
  {
    id: "v10-shura-cap",
    label: "CoT V10 Shura — Thinking Cap",
    desc: "The same seven rules with a hard ceiling on the thinking phase. For models that over-think.",
    isNew: true,
  },
  {
    id: "v1",
    label: "CoT V1 (Classic)",
    desc: "The original 8-step framework. Focuses heavily on the NPC's internal emotional landscape vs their observable actions.",
  },
  {
    id: "v2",
    label: "CoT V2 (New)",
    desc: "The new experimental framework. Stricter reality checks, info audits, better NPCs, and hook generation.",
  },
  {
    id: "v6",
    label: "CoT V6 (Dream Team)",
    desc: "The full 4-phase sequence designed specifically for V6 engines. Specialized validation and modeling.",
  },
  {
    id: "v6-lite",
    label: "CoT V6 (Lite)",
    desc: "A streamlined 3-phase sequence. Less token overhead while maintaining narrative rules.",
  },
  { id: "v7", label: "CoT V7", desc: "The new V7 sequence with 5-phase strict ground truth rebuilding." },
  { id: "v7-lite", label: "CoT V7 (Lite)", desc: "A streamlined 5-phase sequence for V7." },
  { id: "v7.5", label: "CoT V7.5 Kismet", desc: "The new V7.5 sequence focused on story engine mechanics." },
  { id: "v8", label: "CoT V8", desc: "The new V8 narrative processing sequence." },
  { id: "v8-fusion", label: "CoT V8 Fusion", desc: "The new V8 Fusion narrative processing sequence." },
  {
    id: "v9",
    label: "CoT V9 Mirage",
    desc: "The primary and most balanced reasoning sequence, purpose-built for the V9 Mirage engine. The gold standard for modern roleplay.",
    isNew: true,
  },
  {
    id: "v9-director",
    label: "CoT V9 Mirage Air",
    desc: "A lighter, version of CoT V9 Mirage, it give Different output Try and see if you like.",
    isNew: true,
  },
  {
    id: "v9-immersion",
    label: "CoT V9 Mirage Max",
    desc: "The heavy-duty, maximum-thinking sequence. Forces the AI to dive incredibly deep into sensory data and psychological realism before generating a single word.",
    isNew: true,
  },
  {
    id: "v9-hybrid",
    label: "CoT V9 Kuromaku",
    desc: "A specialized multi-agent reasoning sequence designed specifically to pair with the V9 Kuromaku engine.",
    isNew: true,
  },
  {
    id: "v9-lite",
    label: "CoT V9 Cui (Lite)",
    desc: "A highly streamlined, fast-executing reasoning sequence perfectly paired with the V9 Cui engine to save tokens.",
    isNew: true,
  },
];

/** The thinking languages (coreAndCot.js ALL_LANGS); `rec` is starred. */
export const THINKING_LANGUAGES: Array<{ id: string; label: string; rec?: boolean }> = [
  { id: "english", label: "English" },
  { id: "arabic", label: "Arabic (العربية)", rec: true },
  { id: "spanish", label: "Spanish (Español)" },
  { id: "french", label: "French (Français)" },
  { id: "zh", label: "Mandarin (中文)" },
  { id: "ru", label: "Russian (Русский)" },
  { id: "jp", label: "Japanese (日本語)" },
  { id: "pt", label: "Portuguese (Português)" },
];

/** V7's own modules, drawn on the Preset page while a V7 preset is picked. */
export const V7_MODULES: Array<{ id: string; label: string; desc: string }> = [
  { id: "v7_ooc", label: "OOC Protocol", desc: "Allows out-of-character directives." },
  { id: "v7_pcsolo", label: "PC Solo Physicality", desc: "Narration of PC when unobserved." },
  { id: "v7_intro", label: "Introduction Protocol", desc: "How new NPCs enter the story." },
  { id: "v7_culture", label: "Cultural Anchoring", desc: "Real-world integration and references." },
  { id: "v7_scene", label: "Scene Choreography", desc: "Focus shifting and crowd management." },
];

/** The persona cards' descriptions (personality.js). */
export const PERSONA_DESCRIPTIONS: Record<string, string> = {
  megumin:
    "A rebellious, dominant voice. Adds an edge of arrogance and chaos to the narration. Best for energetic or confrontational stories.",
  director: "Professional narrator. Clean, authoritative story direction with cinematic awareness.",
  Nora: "Nora should i say more.",
  engine:
    "No personality overlay at all. The engine speaks in its purest form — precise, neutral, and fully under your control. Recommended for most setups.",
};

/** The add-on cards' descriptions (globalAndBlocks.js). */
export const ADDON_DESCRIPTIONS: Record<string, string> = {
  death:
    "Enables permanent consequences. Characters — including yours — can die for real. No safety net, no plot armor.",
  combat:
    "Activates a grounded, tactical combat layer. Actions have real weight, positioning matters, and you can lose badly.",
  direct:
    "Forces AI to say words like D and P. No dancing around the subject, no polite deflection. you know what i mean. <b>Not needed on V10</b> — that engine already writes this way, so switching it on just repeats the instruction.",
  color: "Each character's dialogue is color-coded for easy visual parsing.",
  npc_events:
    "Requires all new story events to grow naturally from prior context or environmental cues — no random drama out of nowhere. V6 only.",
  html: "When a character reads something — a phone screen, a letter, a sign — the AI draws the thing itself as HTML instead of describing it. Rare by design: one per reply at most, and most replies have none.",
  dice_all:
    "Same d20 system, but everyone rolls — NPCs included. Any character who tries something that can fail gets a roll, all of them listed before the reply. Use this OR Dice, not both.",
  dice: "A d20 decides whether risky attempts land. The AI rolls before it writes the scene, so the story follows the die rather than the die following the story. The roll gets its own tab on the block card.",
};

/** Output formats still on Language & Add-ons: MVU only (globalAndBlocks.js blockDescriptions). */
export const FORMAT_DESCRIPTIONS: Record<string, string> = {
  mvu: "Add MVU Compatibility still in test read more here: <a href='https://github.com/KritBlade/MVU_Game_Maker' target='_blank'>https://github.com/KritBlade/MVU_Game_Maker</a>",
};

/** Used until the catalog lists data/blocks.js (the MVU contract's card). */
export const FORMAT_BLOCKS_FALLBACK: MeguminEngine[] = [{ id: "mvu", label: "MVU Compatibility", trigger: "[[MVU]]" }];

// ── Engines ──────────────────────────────────────────────────────────────────

/** Version of an official preset, for the Latest / All lists (coreAndCot.js versionOf). */
export function versionOf(m: MeguminEngine): string {
  const label = String(m.label || "");
  const id = String(m.id || "");
  if (label.includes("V4")) return "V4";
  if (label.includes("V5")) return "V5";
  if (id.includes("v6")) return "V6";
  if (id.includes("v7")) return "V7";
  if (id.includes("v8")) return "V8";
  if (id.includes("v11")) return "V11";
  if (id.includes("v10")) return "V10";
  if (id.includes("v9")) return "V9";
  return "all";
}

export const LATEST_VERSIONS = ["V11", "V10"];

/** Which framework a CoT id is, and its language (coreAndCot.js parseCot; longest prefix first). */
export function parseCot(model: unknown): { type: string; lang: string } {
  const m = String(model || "");
  if (m.startsWith("cot-v11-cap-")) return { type: "v11-cap", lang: "english" };
  if (m.startsWith("cot-v11-voice-cap-")) return { type: "v11-voice-cap", lang: "english" };
  if (m.startsWith("cot-v11-wr-cap-")) return { type: "v11-wr-cap", lang: "english" };
  if (m.startsWith("cot-v11-voice-")) return { type: "v11-voice", lang: "english" };
  if (m.startsWith("cot-v11-wr-")) return { type: "v11-wr", lang: "english" };
  if (m.startsWith("cot-v11-")) return { type: "v11", lang: "english" };
  if (m.startsWith("cot-v10-ukiyo-cap-")) return { type: "v10-ukiyo-cap", lang: "english" };
  if (m.startsWith("cot-v10-shura-cap-")) return { type: "v10-shura-cap", lang: "english" };
  if (m.startsWith("cot-v10-ukiyo-")) return { type: "v10-ukiyo", lang: "english" };
  if (m.startsWith("cot-v10-shura-")) return { type: "v10-shura", lang: "english" };
  const pref = [
    "v1",
    "v2",
    "v6-lite",
    "v6",
    "v7.5",
    "v7-lite",
    "v7",
    "v8-fusion",
    "v8",
    "v9-lite",
    "v9-director",
    "v9-immersion",
    "v9-hybrid",
    "v9",
  ];
  for (const p of pref) if (m.startsWith(`cot-${p}-`)) return { type: p, lang: m.replace(`cot-${p}-`, "") };
  return { type: "off", lang: "english" };
}

/** The frameworks made for a preset; null = any (older and your own presets). */
export function cotTypesFor(mode: unknown): string[] | null {
  const m = String(mode || "");
  if (m === "v11-voice" || m === "v11-deepseek") return ["v11-voice", "v11-voice-cap"];
  if (m === "v11-writers-room") return ["v11-wr", "v11-wr-cap"];
  if (m.includes("v11")) return ["v11", "v11-cap"];
  if (m.includes("v10")) return ["v10-ukiyo", "v10-ukiyo-cap", "v10-shura", "v10-shura-cap"];
  if (m.includes("v6")) return ["v6", "v6-lite"];
  if (m === "v7.5") return ["v7.5"];
  if (m.includes("v7")) return ["v7", "v7-lite"];
  if (m === "v8-fusion") return ["v8-fusion"];
  if (m.includes("v8")) return ["v8"];
  if (m.includes("v9")) return ["v9", "v9-lite", "v9-director", "v9-immersion", "v9-hybrid"];
  return null;
}

export const isEnglishOnlyCot = (t: string) =>
  t.startsWith("v11") ||
  t.startsWith("v10") ||
  t.startsWith("v9") ||
  ["v7", "v7-lite", "v7.5", "v8", "v8-fusion"].includes(t);

export function cotModelId(type: string, lang: string): string {
  if (type.startsWith("v11") || type.startsWith("v10") || type.startsWith("v9")) return `cot-${type}-english`;
  if (["v7", "v7.5", "v7-lite", "v8", "v8-fusion"].includes(type)) return `cot-${type}-english`;
  return `cot-${type}-${lang}`;
}

/** Old CoT ids, moved to their current names once (coreAndCot.js migrationMap). */
export const COT_MIGRATIONS: Record<string, string> = {
  "cot-english": "cot-v1-english",
  "cot-arabic": "cot-v1-arabic",
  "cot-spanish": "cot-v1-spanish",
  "cot-french": "cot-v1-french",
  "cot-zh": "cot-v1-zh",
  "cot-ru": "cot-v1-ru",
  "cot-jp": "cot-v1-jp",
  "cot-pt": "cot-v1-pt",
  "cot-english-test": "cot-v2-english",
};

/**
 * The thinking a preset is written for (data/cot/index.js meguminCotForMode). The CoT texts stay on the
 * server; `cotIds` is the catalog's list of their ids.
 */
export function meguminCotForMode(modeId: string, lang: string, cotIds: string[]): string | null {
  if (!modeId) return null;
  let prefix: string | null = null;
  if (modeId.includes("v6")) prefix = "cot-v6";
  else if (modeId === "v7.5") prefix = "cot-v7.5";
  else if (modeId.includes("v7")) prefix = "cot-v7";
  else if (modeId.includes("v8")) prefix = "cot-v8";
  else if (modeId === "v11-voice" || modeId === "v11-deepseek") prefix = "cot-v11-voice";
  else if (modeId === "v11-writers-room") prefix = "cot-v11-wr";
  else if (modeId.includes("v11")) prefix = "cot-v11";
  else if (modeId.includes("v10-shura")) prefix = "cot-v10-shura";
  else if (modeId.includes("v10")) prefix = "cot-v10-ukiyo";
  else if (modeId.includes("v9")) prefix = "cot-v9";
  if (!prefix) return null;
  const englishOnly =
    prefix.startsWith("cot-v11") || prefix.startsWith("cot-v10") || prefix.includes("v7") || prefix.includes("v8");
  const id = englishOnly ? `${prefix}-english` : `${prefix}-${lang}`;
  return cotIds.includes(id) ? id : null;
}

/** Writes the engine's own style when picking it changes the style (core/engines.js styleAfterPicking). */
export function applyStyleAfterPicking(p: MeguminProfileLike, engine: MeguminEngine, directStyles: MeguminEngine[]) {
  const isBuiltIn = directStyles.some((s) => s.id === p.activeStyleId);
  const styleId = MeguminEngineFlags.styleAfterPicking(engine, p.activeStyleId, isBuiltIn) as string | null;
  const ds = styleId ? directStyles.find((s) => s.id === styleId) : null;
  if (styleId) p.activeStyleId = styleId;
  if (ds) p.aiRule = ds.rule;
}

/** Picking a preset on the Preset page (coreAndCot.js pickPreset): its thinking comes with it, in your language. */
export function pickPreset(
  p: MeguminProfileLike,
  engine: MeguminEngine,
  directStyles: MeguminEngine[],
  cotIds: string[],
) {
  p.mode = engine.id;
  applyStyleAfterPicking(p, engine, directStyles);
  const model = String(p.model || "");
  const currentLang = model.includes("-") ? (model.split("-").pop() ?? "english") : "english";
  const targetCot = meguminCotForMode(String(engine.id), currentLang, cotIds);
  if (targetCot) p.model = targetCot;
}

// ── Model Setup (features/modelsetup/loadouts.js) ────────────────────────────

/** The engines the Preset row offers. Any other preset you are on is listed too. */
export const V11_ENGINES = ["v11-voice", "v11-writers-room", "v11-deepseek"];
export const V11_STYLE_IDS = ["dir_v11", "dir_v11_inside"];

export type LoadoutSettingKey = "mode" | "thinking" | "thinkingCap" | "length" | "banList" | "html" | "chomusuke";

/** One row per setting; `tab` is the tab its button opens, `page` a page inside it, `global` stored once for all. */
export const LOADOUT_SETTINGS: Array<{
  key: LoadoutSettingKey;
  tab: string;
  page?: string;
  global?: boolean;
  hasDesc?: boolean;
}> = [
  { key: "mode", tab: "preset", page: "preset" },
  { key: "thinking", tab: "preset", page: "thinking" },
  { key: "thinkingCap", tab: "preset", page: "thinking", hasDesc: true },
  { key: "length", tab: "preset", page: "config" },
  { key: "banList", tab: "banlist" },
  { key: "html", tab: "addons" },
  { key: "chomusuke", tab: "chomusuke", global: true, hasDesc: true },
];

const isCapped = (model: unknown) => /^cot-.+-cap-/.test(String(model || ""));
const BLOCK_IDS = ["bonds", "sheet", "chatter", "cyoa"];

export interface LoadoutCtx {
  lengthLabel: (value: unknown) => string;
  lengthValue: (label: string) => string;
  cotIds: string[];
  directStyles: MeguminEngine[];
}

function setCap(p: MeguminProfileLike, on: boolean, cotIds: string[]) {
  const cot = meguminCotForMode(String(p.mode || ""), "english", cotIds);
  if (!cot) return;
  const capped = cot.replace(/-english$/, "-cap-english");
  p.model = on && cotIds.includes(capped) ? capped : cot;
}

/** Picks an engine the way Model Setup does: its thinking comes with it, and a Thinking Cap stays on. */
function pickEngine(p: MeguminProfileLike, id: string, ctx: LoadoutCtx) {
  const wasCapped = isCapped(p.model);
  p.mode = id;
  const cot = meguminCotForMode(id, "english", ctx.cotIds);
  if (cot) p.model = cot;
  if (wasCapped) setCap(p, true, ctx.cotIds);
  applyStyleAfterPicking(p, { id }, ctx.directStyles);
}

export function readLoadoutSetting(key: LoadoutSettingKey, p: MeguminProfileLike, ctx: LoadoutCtx): unknown {
  switch (key) {
    case "mode":
      return p.mode;
    case "thinking":
      return p.cotEnabled !== false;
    case "thinkingCap":
      return isCapped(p.model);
    case "length":
      return ctx.lengthLabel(p.storyConfig && p.storyConfig.length);
    case "banList":
      return p.banListBuiltIn === false ? "off" : p.banListShort ? "short" : "full";
    case "html":
      return Array.isArray(p.addons) && p.addons.includes("html");
    case "chomusuke": {
      const c = p.chomusuke || {};
      const f = c.features || {};
      const routes = c.blockRoutes || {};
      const on = [f.blocks === true, f.worldState === true, f.notebook === true, f.imageGen !== false];
      if (!on.some(Boolean)) return "story";
      return on.every(Boolean) && BLOCK_IDS.every((id) => routes[id] !== false) ? "chomusuke" : "mixed";
    }
  }
}

export function writeLoadoutSetting(key: LoadoutSettingKey, p: MeguminProfileLike, value: unknown, ctx: LoadoutCtx) {
  switch (key) {
    case "mode":
      pickEngine(p, String(value), ctx);
      return;
    case "thinking":
      p.cotEnabled = Boolean(value);
      return;
    case "thinkingCap":
      setCap(p, Boolean(value), ctx.cotIds);
      return;
    case "length":
      if (!p.storyConfig) p.storyConfig = {};
      p.storyConfig.length = ctx.lengthValue(String(value));
      return;
    case "banList":
      p.banListBuiltIn = value !== "off";
      if (value !== "off") p.banListShort = value === "short";
      return;
    case "html": {
      const list = (Array.isArray(p.addons) ? p.addons : []).filter((id: string) => id !== "html");
      if (value) list.push("html");
      p.addons = list;
      return;
    }
    case "chomusuke": {
      if (!p.chomusuke) p.chomusuke = { enabled: false, profileId: "", primaryProfileId: "", features: {} };
      if (!p.chomusuke.features) p.chomusuke.features = {};
      const on = value === "chomusuke";
      for (const f of ["blocks", "worldState", "notebook", "imageGen"]) p.chomusuke.features[f] = on;
      if (on) p.chomusuke.blockRoutes = Object.fromEntries(BLOCK_IDS.map((id) => [id, true]));
      return;
    }
  }
}

/** The keys whose value differs from the loadout this profile last used (empty when it used another). */
export function changedFromLoadout(p: MeguminProfileLike, loadout: MeguminEngine, ctx: LoadoutCtx): string[] {
  if (!loadout || p.loadout !== loadout.id) return [];
  return Object.entries(loadout.settings as Record<string, unknown>)
    .filter(([key, value]) => readLoadoutSetting(key as LoadoutSettingKey, p, ctx) !== value)
    .map(([key]) => key);
}

// ── Story Config (features/storyconfig/config.js) ────────────────────────────

/** Used until the catalog lists them (config.js STORY_CONFIG_DEFAULTS). */
export const STORY_CONFIG_DEFAULTS_FALLBACK: Record<string, string> = {
  pov: "third person",
  pace: "steady",
  length: "flexible",
};

export type StoryConfigOption = string | { label: string; value: string; legacy?: string[] };

export function configOptions(field: Record<string, any>): Array<{ label: string; value: string; legacy?: string[] }> {
  return ((field.options || []) as StoryConfigOption[]).map((o) =>
    typeof o === "string" ? { label: o, value: o } : o,
  );
}

/** An older spelling or a bare label upgraded to the option's current value (config.js upgradeConfigValue). */
export function upgradeConfigValue(field: Record<string, any>, raw: unknown): string {
  const v = String(raw == null ? "" : raw).trim();
  if (!v || !field.options) return v;
  const opts = configOptions(field);
  if (opts.some((o) => o.value === v)) return v;
  const lower = v.toLowerCase();
  const hit = opts.find(
    (o) => String(o.label).toLowerCase() === lower || (o.legacy || []).some((l) => String(l).toLowerCase() === lower),
  );
  return hit ? hit.value : v;
}

/** Fills the standing fields left blank (config.js applyStoryConfigDefaults). */
export function applyStoryConfigDefaults(cfg: Record<string, any>, defaults: Record<string, string>) {
  for (const k of Object.keys(defaults)) {
    if (!String(cfg[k] == null ? "" : cfg[k]).trim()) cfg[k] = defaults[k];
  }
  return cfg;
}

export function countActiveConfigFields(cfg: Record<string, any> | undefined, fields: Array<Record<string, any>>) {
  if (!cfg) return 0;
  return fields.filter((f) => cfg[f.key] && String(cfg[f.key]).trim() !== "").length;
}

// ── Page state, kept while YunYun is open (Megumin keeps it while SillyTavern is) ──

export type PresetPage = "preset" | "thinking" | "config";

export const meguminTabState: {
  presetPage: PresetPage;
  presetFilter: "latest" | "all" | "mine" | null;
  showAllCot: boolean;
  thinkingAdvancedOpen: boolean;
  openConfigRow: string | null;
  setupPicked: string | null;
  setupOnlyThisCharacter: boolean;
  /** A loadout's settings as changed on Model Setup before using it, by loadout id. */
  setupDrafts: Record<string, Record<string, unknown>>;
} = {
  presetPage: "preset",
  presetFilter: null,
  showAllCot: false,
  thinkingAdvancedOpen: false,
  openConfigRow: null,
  setupPicked: null,
  setupOnlyThisCharacter: false,
  setupDrafts: {},
};

/** Which page Preset & Thinking opens on next (Model Setup's buttons land on the right one). */
export function setPresetPage(page: string | undefined) {
  if (page === "preset" || page === "thinking" || page === "config") meguminTabState.presetPage = page;
}
