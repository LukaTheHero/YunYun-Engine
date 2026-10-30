// ──────────────────────────────────────────────
// Megumin Mode: the content catalog (metadata only, no prompt text)
//
// Ported verbatim from Megumin Suite v10.0 by KazumaONIISAN (Arif-salah), https://github.com/Arif-salah/Megumin-Suite, CC BY-NC 4.0, used with the author's permission.
// Sources: data/modes/*.js, data/cot/*.js, data/directStyles.js, data/styles.js,
// data/styleTemplates.js, data/addons.js, data/toggles.js, data/personalities.js,
// data/blocks.js, src/features/blocks/registry.js, src/core/profile.js and
// src/ui/tabs/{coreAndCot,globalAndBlocks}.js.
//
// The ids, labels and flags the editor and the server both need. The prompt
// text itself is server-only (services/megumin/content/**), so this module stays
// small enough for the client bundle; the content regression keeps the two in
// step. Labels are upstream's English names: they are the English source for
// the editor's localization keys, and the client renders those keys.
// ──────────────────────────────────────────────

// ── Engines ──────────────────────────────────────

/** Generations, in the order upstream's filter pills list them. */
export const MEGUMIN_ENGINE_FAMILIES = ["V4", "V5", "V6", "V7", "V8", "V9", "V10"] as const;
export type MeguminEngineFamily = (typeof MEGUMIN_ENGINE_FAMILIES)[number];

/** A stock engine without its prompt text. Flags keep upstream's names, which the server's engine predicates read. */
export interface MeguminEngineMeta {
  id: string;
  label: string;
  /** Card accent colour. */
  color: string;
  family: MeguminEngineFamily;
  isNew?: boolean;
  isV8?: boolean;
  isV9?: boolean;
  isV10?: boolean;
  isCoreClone?: boolean;
  recommended?: boolean;
  /** Writes {{user}} as well as the world. */
  isCoWriter?: boolean;
  /** V4/V5: selectable, but not offered for editing in Dev Mode. */
  devLegacy?: boolean;
}

/** Every stock engine, in display order (newest generation first). */
export const MEGUMIN_ENGINE_CATALOG: readonly MeguminEngineMeta[] = [
  {
    id: "v10-core",
    label: "V10 Ukiyo",
    color: "#f43f5e",
    family: "V10",
    isNew: true,
    isV10: true,
    isCoreClone: true,
    recommended: true,
  },
  {
    id: "v10-core-cw",
    label: "V10 Ukiyo Co-writer",
    color: "#fb7185",
    family: "V10",
    isNew: true,
    isV10: true,
    isCoreClone: true,
    recommended: false,
    isCoWriter: true,
  },
  {
    id: "v10-shura",
    label: "V10 Shura",
    color: "#a855f7",
    family: "V10",
    isNew: true,
    isV10: true,
    isCoreClone: true,
    recommended: true,
  },
  {
    id: "v10-shura-cw",
    label: "V10 Shura Co-writer",
    color: "#c084fc",
    family: "V10",
    isNew: true,
    isV10: true,
    isCoreClone: true,
    recommended: false,
    isCoWriter: true,
  },
  { id: "v9-core", label: "V9 Mirage", color: "#f43f5e", family: "V9", isV9: true },
  { id: "v9-lite", label: "V9 Xin", color: "#f43f5e", family: "V9", isV9: true },
  { id: "v9-director", label: "V9 Kuromaku", color: "#f43f5e", family: "V9", isV9: true },
  { id: "v9-immersion", label: "V9 Cui", color: "#f43f5e", family: "V9", isV9: true },
  { id: "v8-fusion", label: "V8 Fusion", color: "#10b981", family: "V8", isV8: true },
  { id: "v8-m", label: "V8 Obsidian", color: "#f59e0b", family: "V8", isV8: true },
  { id: "v8-lite", label: "V8 Spark", color: "#f59e0b", family: "V8", isV8: true },
  { id: "v7.5", label: "V7.5 Kismet", color: "#f59e0b", family: "V7" },
  { id: "v7-core", label: "V7 Core", color: "#10b981", family: "V7" },
  { id: "v7-reality", label: "V7 Reality", color: "#3b82f6", family: "V7" },
  { id: "v7-gentle", label: "V7 Gentle", color: "#3b82f6", family: "V7" },
  { id: "v6-dream-team", label: "V6 Dream Team", color: "#a855f7", family: "V6" },
  { id: "v6-dream-team-lite", label: "V6 Dream Team Lite", color: "#a855f7", family: "V6" },
  { id: "balance Test", label: "V5 Slice of Reality", color: "#ff9a9e", family: "V5", devLegacy: true },
  { id: "balance", label: "V4.2 Balance", color: "#ff9a9e", family: "V4", devLegacy: true },
  { id: "cinematic", label: "V4 Cinematic", color: "#ff70a6", family: "V4", devLegacy: true },
  { id: "dark", label: "V4 Dark", color: "#c92a2a", family: "V4", devLegacy: true },
];

// ── Chain of thought ─────────────────────────────

/** Every stock chain-of-thought id, in library order. "cot-off" is the legacy "no reasoning" entry. */
export const MEGUMIN_COT_IDS = [
  "cot-v10-ukiyo-english",
  "cot-v10-ukiyo-cap-english",
  "cot-v10-shura-english",
  "cot-v10-shura-cap-english",
  "cot-v9-english",
  "cot-v9-lite-english",
  "cot-v9-director-english",
  "cot-v9-immersion-english",
  "cot-v9-hybrid-english",
  "cot-v8-fusion-english",
  "cot-v8-english",
  "cot-v7.5-english",
  "cot-v7-english",
  "cot-v7-lite-english",
  "cot-off",
  "cot-v1-english",
  "cot-v1-arabic",
  "cot-v1-spanish",
  "cot-v1-french",
  "cot-v1-zh",
  "cot-v1-ru",
  "cot-v1-jp",
  "cot-v1-pt",
  "cot-v2-english",
  "cot-v2-arabic",
  "cot-v2-spanish",
  "cot-v2-french",
  "cot-v2-zh",
  "cot-v2-ru",
  "cot-v2-jp",
  "cot-v2-pt",
  "cot-v6-english",
  "cot-v6-arabic",
  "cot-v6-spanish",
  "cot-v6-french",
  "cot-v6-zh",
  "cot-v6-ru",
  "cot-v6-jp",
  "cot-v6-pt",
  "cot-v6-lite-english",
  "cot-v6-lite-arabic",
  "cot-v6-lite-spanish",
  "cot-v6-lite-french",
  "cot-v6-lite-zh",
  "cot-v6-lite-ru",
  "cot-v6-lite-jp",
  "cot-v6-lite-pt",
] as const;
export type MeguminCotId = (typeof MEGUMIN_COT_IDS)[number];

/** A reasoning framework: one CoT id per language, "cot-<id>-<language>". */
export interface MeguminCotFramework {
  id: string;
  label: string;
  isNew?: boolean;
  /** Written in English only, so the language picker offers English alone. */
  englishOnly: boolean;
}

/** The frameworks in picker order (coreAndCot.js "Select Framework"). */
export const MEGUMIN_COT_FRAMEWORKS: readonly MeguminCotFramework[] = [
  { id: "v10-ukiyo", label: "CoT V10 Ukiyo", isNew: true, englishOnly: true },
  { id: "v10-ukiyo-cap", label: "CoT V10 Ukiyo — Thinking Cap", isNew: true, englishOnly: true },
  { id: "v10-shura", label: "CoT V10 Shura", isNew: true, englishOnly: true },
  { id: "v10-shura-cap", label: "CoT V10 Shura — Thinking Cap", isNew: true, englishOnly: true },
  { id: "v1", label: "CoT V1 (Classic)", englishOnly: false },
  { id: "v2", label: "CoT V2 (New)", englishOnly: false },
  { id: "v6", label: "CoT V6 (Dream Team)", englishOnly: false },
  { id: "v6-lite", label: "CoT V6 (Lite)", englishOnly: false },
  { id: "v7", label: "CoT V7", englishOnly: true },
  { id: "v7-lite", label: "CoT V7 (Lite)", englishOnly: true },
  { id: "v7.5", label: "CoT V7.5 Kismet", englishOnly: true },
  { id: "v8", label: "CoT V8", englishOnly: true },
  { id: "v8-fusion", label: "CoT V8 Fusion", englishOnly: true },
  { id: "v9", label: "CoT V9 Mirage", isNew: true, englishOnly: true },
  { id: "v9-director", label: "CoT V9 Mirage Air", isNew: true, englishOnly: true },
  { id: "v9-immersion", label: "CoT V9 Mirage Max", isNew: true, englishOnly: true },
  { id: "v9-hybrid", label: "CoT V9 Kuromaku", isNew: true, englishOnly: true },
  { id: "v9-lite", label: "CoT V9 Cui (Lite)", isNew: true, englishOnly: true },
];

/** Reasoning languages of the multilingual frameworks (V1, V2, V6, V6 Lite). */
export const MEGUMIN_COT_LANGUAGES: readonly { id: string; label: string; recommended?: boolean }[] = [
  { id: "english", label: "English" },
  { id: "arabic", label: "Arabic (العربية)", recommended: true },
  { id: "spanish", label: "Spanish (Español)" },
  { id: "french", label: "French (Français)" },
  { id: "zh", label: "Mandarin (中文)" },
  { id: "ru", label: "Russian (Русский)" },
  { id: "jp", label: "Japanese (日本語)" },
  { id: "pt", label: "Portuguese (Português)" },
];

/** Thinking effort: a word ceiling prepended to the CoT, or none ("unspecified"). */
export const MEGUMIN_THINK_EFFORTS: readonly { id: string; label: string }[] = [
  { id: "100", label: "100 Words" },
  { id: "250", label: "250 Words" },
  { id: "450", label: "450 Words" },
  { id: "custom", label: "Custom" },
  { id: "unspecified", label: "Unspecified" },
];

/**
 * CoT ids from before the V1 rename, and what they became. The legacy
 * "cot-off" id means `cotEnabled: false` (upstream then selects cot-v7.5-english).
 */
export const MEGUMIN_LEGACY_COT_IDS: Readonly<Record<string, MeguminCotId>> = {
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

// Longest prefix first: "cot-v10-shura-cap-" also starts with "cot-v10-shura-",
// and "cot-v9-lite-" with "cot-v9-", so the specific ids are tested first.
const COT_FRAMEWORK_PREFIX_ORDER = [
  "v10-ukiyo-cap",
  "v10-shura-cap",
  "v10-ukiyo",
  "v10-shura",
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
] as const;

/** Which framework and language a CoT id belongs to, or null (no reasoning, or not a stock id). */
export function meguminCotFrameworkOf(cotId: string | null | undefined): { framework: string; lang: string } | null {
  if (!cotId) return null;
  for (const framework of COT_FRAMEWORK_PREFIX_ORDER) {
    const prefix = `cot-${framework}-`;
    if (!cotId.startsWith(prefix)) continue;
    // The V10 sets exist in English alone.
    return { framework, lang: framework.startsWith("v10") ? "english" : cotId.slice(prefix.length) };
  }
  return null;
}

/** The CoT id picking a framework selects. English-only frameworks ignore the language. */
export function meguminCotIdFor(framework: string, lang = "english"): string {
  const englishOnly = MEGUMIN_COT_FRAMEWORKS.find((f) => f.id === framework)?.englishOnly ?? false;
  return `cot-${framework}-${englishOnly ? "english" : lang}`;
}

/**
 * The frameworks an engine is written for; any other shows "May be
 * incompatible". null means no restriction (V4/V5 and custom ids). By mode id,
 * as upstream: V8 Fusion's own default pairing (cot-v8-english) is outside its
 * set, which only affects the badge.
 */
export function meguminAllowedCotFrameworks(modeId: string | null | undefined): readonly string[] | null {
  const mode = modeId || "";
  if (mode.includes("v10")) return ["v10-ukiyo", "v10-ukiyo-cap", "v10-shura", "v10-shura-cap"];
  if (mode.includes("v6")) return ["v6", "v6-lite"];
  if (mode === "v7.5") return ["v7.5"];
  if (mode.includes("v7")) return ["v7", "v7-lite"];
  if (mode === "v8-fusion") return ["v8-fusion"];
  if (mode.includes("v8")) return ["v8"];
  if (mode.includes("v9")) return ["v9", "v9-lite", "v9-director", "v9-immersion", "v9-hybrid"];
  return null;
}

// ── Writing styles ───────────────────────────────

/** The precooked styles, in card order. */
export const MEGUMIN_DIRECT_STYLE_CATALOG: readonly { id: string; name: string }[] = [
  { id: "dir_v10_ukiyo", name: "V10 Ukiyo Default" },
  { id: "dir_v10_shura", name: "V10 Shura Default" },
  { id: "dir_v9", name: "V9 Default" },
  { id: "dir_v9lite", name: "V9 Lite Default" },
  { id: "dir_v8", name: "V8 Default" },
  { id: "dir_v7_core", name: "V7 Core Default" },
  { id: "dir_v7_gentle", name: "V7 Gentle Default" },
  { id: "dir_v7.5", name: "V7.5 Kismet Default" },
  { id: "dir_v7", name: "V7 Reality Default" },
  { id: "dir_simple", name: "Simple & Direct" },
  { id: "dir_descriptive", name: "Descriptive & Spatial" },
  { id: "dir_dialogue", name: "Dialogue-Centric" },
  { id: "dir_clinical", name: "Clinical & Objective" },
  { id: "dir_sensory", name: "Sensory-Rich" },
];

/** The style tag library by category. Each tag is also the word the style generators receive. */
export const MEGUMIN_STYLE_TAG_CATEGORIES: readonly { category: string; tags: readonly string[] }[] = [
  {
    category: "Genre & Tone",
    tags: [
      "Dark",
      "Gritty",
      "Horror",
      "Tragic",
      "Melancholic",
      "Cinematic",
      "Gothic",
      "Sci-Fi",
      "Cyberpunk",
      "Fantasy",
      "Action-Packed",
      "Mystery",
      "Slice-of-Life",
      "Romantic",
      "Sweet",
      "Fluffy",
      "Wholesome",
      "Comedy",
      "Surreal",
      "Lighthearted",
      "Psychological",
      "Scientific",
      "Thriller",
      "Philosophical",
      "Adventure",
      "Drama",
      "Banter",
    ],
  },
  {
    category: "Narration",
    tags: [
      "Purple Prose",
      "Descriptive",
      "Sensory-Rich",
      "Introspective",
      "Objective",
      "Subjective",
      "Editorializing",
      "Action-Driven",
      "Dialogue-Heavy",
      "Simple",
      "Minimalist",
      "Show-Don't-Tell",
    ],
  },
  {
    category: "Pacing",
    tags: [
      "Slow-Burn",
      "Leisurely",
      "Steady",
      "Methodical",
      "Episodic",
      "Fast-Paced",
      "Frenetic",
      "Time-Skips",
      "Dynamic",
    ],
  },
  { category: "POV", tags: ["First-Person", "Second-Person", "Third-Person Limited", "Third-Person Omniscient"] },
];

/** The style templates (their author-inspired notes are server content). */
export const MEGUMIN_STYLE_TEMPLATE_CATALOG: readonly { name: string; tags: readonly string[] }[] = [
  {
    name: "The Opinionated Storyteller",
    tags: ["Comedy", "Surreal", "Editorializing", "Third-Person Omniscient", "Banter"],
  },
  {
    name: "Deep Introspection",
    tags: ["Psychological", "Drama", "Introspective", "Subjective", "Slow-Burn", "Melancholic"],
  },
  { name: "The Snarky Observer", tags: ["Comedy", "Dark", "Editorializing", "Banter", "Objective"] },
  {
    name: "Grimdark Epic",
    tags: ["Dark", "Gritty", "Fantasy", "Drama", "Sensory-Rich", "Subjective", "Slow-Burn"],
  },
  {
    name: "Psychological Horror",
    tags: ["Horror", "Thriller", "Psychological", "Slice-of-Life", "Introspective", "Slow-Burn"],
  },
  { name: "Sweet Like Sugar", tags: ["Sweet", "Fluffy", "Editorializing", "Wholesome", "Subjective"] },
  { name: "Action Thriller", tags: ["Action-Packed", "Thriller", "Fast-Paced", "Dynamic", "Sensory-Rich"] },
  {
    name: "The Unreliable Memoirist",
    tags: ["Drama", "Psychological", "Introspective", "Subjective", "Slow-Burn", "Melancholic"],
  },
  {
    name: "The Southern Gothic Teller",
    tags: ["Gothic", "Tragic", "Drama", "Descriptive", "Sensory-Rich", "Slow-Burn", "Melancholic"],
  },
];

// ── Narrator, toggles, add-ons ───────────────────

/** Narrator personalities (V4/V5 only; inert on V6 and newer). */
export const MEGUMIN_PERSONALITY_CATALOG: readonly { id: string; label: string; recommended?: boolean }[] = [
  { id: "megumin", label: "Megumin" },
  { id: "Nora", label: "Nora" },
  { id: "director", label: "Director" },
  { id: "engine", label: "Engine", recommended: true },
];

/** The OOC and control toggles. Both default off and are blanked for V8 and newer. */
export const MEGUMIN_TOGGLE_CATALOG: readonly { id: "ooc" | "control"; label: string; recommendedOff?: boolean }[] = [
  { id: "ooc", label: "OOC Commentary" },
  { id: "control", label: "Stop the AI from Controling User", recommendedOff: true },
];

/** The V7 module toggles. Each defaults on; switching one off strips its section from a V7 engine. */
export const MEGUMIN_V7_MODULE_TOGGLES: readonly { id: string; label: string }[] = [
  { id: "v7_ooc", label: "OOC Protocol" },
  { id: "v7_pcsolo", label: "PC Solo Physicality" },
  { id: "v7_intro", label: "Introduction Protocol" },
  { id: "v7_culture", label: "Cultural Anchoring" },
  { id: "v7_scene", label: "Scene Choreography" },
];

export interface MeguminAddonMeta {
  id: string;
  label: string;
  /** Add-ons in one group share a prompt anchor, so turning one on turns the others off. */
  exclusive?: string;
  /** d20s rolled per turn for the model to use. */
  rolls?: number;
  recommended?: boolean;
  /** Offered only when the active engine is of this generation. */
  requiresFamily?: MeguminEngineFamily;
}

/** The add-ons, in card order. */
export const MEGUMIN_ADDON_CATALOG: readonly MeguminAddonMeta[] = [
  { id: "dice", label: "Dice", exclusive: "dice", rolls: 3 },
  { id: "dice_all", label: "Dice: Everyone", exclusive: "dice", rolls: 6 },
  { id: "html", label: "Immersive HTML" },
  { id: "death", label: "Death System" },
  { id: "combat", label: "Combat System" },
  { id: "direct", label: "Direct Language" },
  { id: "color", label: "Dialogue Colors", recommended: true },
  { id: "npc_events", label: "Organic NPCs & Events", requiresFamily: "V6" },
  { id: "dn", label: "Dialogue & Narration Format" },
];

/** Mutually exclusive add-on groups: at most one id of each may be on. */
export const MEGUMIN_ADDON_EXCLUSIVE_GROUPS: Readonly<Record<string, readonly string[]>> = {
  dice: ["dice", "dice_all"],
};

// ── Blocks ───────────────────────────────────────

/** The legacy block templates (data/blocks.js); V10 reads three of them into its <Blocks> envelope. */
export const MEGUMIN_LEGACY_BLOCK_CATALOG: readonly { id: string; label: string; recommended?: boolean }[] = [
  { id: "info", label: "World State Block", recommended: true },
  { id: "cyoa", label: "CYOA Block" },
  { id: "mvu", label: "MVU Compatibility" },
  { id: "npc_inner_chatter", label: "NPC Inner Chatter" },
];

/**
 * A built-in block of the <Blocks> envelope. `tag` is protocol text (the tag the
 * model writes); the gate (`requires`), the slot skeleton line and the template
 * builders belong to the blocks registry.
 */
export interface MeguminBlockMeta {
  id: string;
  tag: string;
  label: string;
  emoji: string;
  /** Font Awesome class upstream. */
  icon: string;
  color: string;
  visibility: "open" | "hidden";
  builtin: true;
  /** Not arranged by the reader: present whenever its feature is on, after the stack. */
  system?: boolean;
  /** May appear several times in one reply. */
  repeating?: boolean;
  /** Written first in the reply, before the prose, never in the envelope. */
  lead?: boolean;
  /** Put at the front of the stack when added. */
  preferFirst?: boolean;
  /** Emitted only on turns its feature asks for it: the envelope carries a skeleton line, not a template. */
  conditional?: boolean;
  /** The slot the body comes from. */
  source?: string;
  /** The legacy block ids (MEGUMIN_LEGACY_BLOCK_CATALOG) this block owns. */
  legacyIds?: readonly string[];
}

/** The built-in blocks, in registry order. */
export const MEGUMIN_BLOCK_CATALOG: readonly MeguminBlockMeta[] = [
  {
    id: "dice",
    tag: "Dice",
    label: "Roll",
    emoji: "🎲",
    icon: "fa-dice-d20",
    color: "#22d3ee",
    visibility: "open",
    builtin: true,
    system: true,
    repeating: true,
    lead: true,
  },
  {
    id: "cyoa",
    tag: "CYOA",
    label: "Choices",
    emoji: "🎲",
    icon: "fa-list-check",
    color: "#38bdf8",
    visibility: "open",
    builtin: true,
    preferFirst: true,
    source: "[[cyoa]]",
    legacyIds: ["cyoa"],
  },
  {
    id: "world",
    tag: "World_State",
    label: "World State",
    emoji: "📌",
    icon: "fa-thumbtack",
    color: "#f59e0b",
    visibility: "open",
    builtin: true,
    source: "[[infoblock]]",
    legacyIds: ["info"],
  },
  {
    id: "chatter",
    tag: "NPC_Inner_Chatter",
    label: "NPC Inner Chatter",
    emoji: "💭",
    icon: "fa-comment-dots",
    color: "#a855f7",
    visibility: "open",
    builtin: true,
    source: "[[npc_inner_chatter]]",
    legacyIds: ["npc_inner_chatter", "npc_inner_chatter_v2"],
  },
  {
    id: "bonds",
    tag: "Bonds",
    label: "Bonds",
    emoji: "❤️",
    icon: "fa-heart",
    color: "#f43f5e",
    visibility: "open",
    builtin: true,
  },
  {
    id: "sheet",
    tag: "Character_Sheet",
    label: "Character Sheet",
    emoji: "🎒",
    icon: "fa-shield-halved",
    color: "#38bdf8",
    visibility: "open",
    builtin: true,
  },
  {
    id: "newNpc",
    tag: "New_NPC",
    label: "New NPC Dossier",
    emoji: "🆕",
    icon: "fa-user-plus",
    color: "#10b981",
    visibility: "open",
    builtin: true,
    repeating: true,
    system: true,
    conditional: true,
  },
  {
    id: "npcUpdate",
    tag: "NPC_Update",
    label: "NPC Update",
    emoji: "🔄",
    icon: "fa-arrows-rotate",
    color: "#fbbf24",
    visibility: "open",
    builtin: true,
    repeating: true,
    system: true,
    conditional: true,
  },
  {
    id: "tracker",
    tag: "Story_Tracker",
    label: "Story Tracker",
    emoji: "🎬",
    icon: "fa-map",
    color: "#f43f5e",
    visibility: "open",
    builtin: true,
    system: true,
    source: "[[storytracker]]",
  },
];

// ── Stat fields (Bonds and Character Sheet) ──────

export type MeguminStatFieldType = "meter" | "number" | "text" | "list";
export type MeguminStatBlockId = "bonds" | "sheet";

/** One tracked field. Its prompt line is generated from `type`, `max`, `start` and `hint`. */
export interface MeguminStatField {
  id: string;
  label: string;
  type: MeguminStatFieldType;
  /** Meters only; 100 when absent. */
  max?: number;
  /** Meters and numbers: the seed when there is no previous value. */
  start?: number;
  /** Text and list fields: the placeholder the model sees. */
  hint?: string;
  /** Character Sheet: on its own line rather than the inline row. */
  ownLine?: boolean;
}

export interface MeguminStatFieldPack {
  id: string;
  label: string;
  fields: readonly MeguminStatField[];
}

/** meter: 0..max bar · number: uncapped count · text: a short line · list: comma separated. */
export const MEGUMIN_STAT_FIELD_TYPES: readonly { id: MeguminStatFieldType; label: string }[] = [
  { id: "meter", label: "Meter" },
  { id: "number", label: "Number" },
  { id: "text", label: "Text" },
  { id: "list", label: "List" },
];

/** The fields a new profile starts with. */
export const MEGUMIN_DEFAULT_STAT_FIELDS: Readonly<Record<MeguminStatBlockId, readonly MeguminStatField[]>> = {
  bonds: [
    { id: "mood", label: "Mood", type: "text", hint: "emotional surface" },
    { id: "affection", label: "Affection", type: "meter", max: 100, start: 20 },
    { id: "trust", label: "Trust", type: "meter", max: 100, start: 30 },
    { id: "desire", label: "Desire", type: "meter", max: 100, start: 0 },
  ],
  sheet: [
    { id: "hp", label: "HP", type: "meter", max: 100, start: 100 },
    { id: "stamina", label: "Stamina", type: "meter", max: 100, start: 100 },
    { id: "gold", label: "Gold", type: "number", start: 0 },
    { id: "status", label: "Status", type: "text", ownLine: true, hint: 'conditions, or "none"' },
    { id: "skills", label: "Skills", type: "list", ownLine: true, hint: "Name rank, comma separated" },
    { id: "inventory", label: "Inventory", type: "list", ownLine: true, hint: 'item, item xN, or "nothing"' },
  ],
};

/** Field packs. A pack is merged into the current list, not swapped for it, so Romance and Rivalry can both be on. */
export const MEGUMIN_STAT_FIELD_PACKS: Readonly<Record<MeguminStatBlockId, readonly MeguminStatFieldPack[]>> = {
  bonds: [
    {
      id: "pack_romance",
      label: "Romance",
      fields: [
        { id: "affection", label: "Affection", type: "meter", max: 100, start: 20 },
        { id: "trust", label: "Trust", type: "meter", max: 100, start: 30 },
        { id: "desire", label: "Desire", type: "meter", max: 100, start: 0 },
        { id: "tension", label: "Tension", type: "meter", max: 100, start: 10 },
      ],
    },
    {
      id: "pack_rivalry",
      label: "Rivalry",
      fields: [
        { id: "respect", label: "Respect", type: "meter", max: 100, start: 20 },
        { id: "fear", label: "Fear", type: "meter", max: 100, start: 0 },
        { id: "grudge", label: "Grudge", type: "meter", max: 100, start: 0 },
      ],
    },
    {
      id: "pack_social",
      label: "Social",
      fields: [
        { id: "reputation", label: "Reputation", type: "meter", max: 100, start: 50 },
        { id: "suspicion", label: "Suspicion", type: "meter", max: 100, start: 0 },
      ],
    },
  ],
  sheet: [
    {
      id: "pack_rpg",
      label: "RPG",
      fields: [
        { id: "hp", label: "HP", type: "meter", max: 100, start: 100 },
        { id: "stamina", label: "Stamina", type: "meter", max: 100, start: 100 },
        { id: "mana", label: "Mana", type: "meter", max: 100, start: 100 },
        { id: "gold", label: "Gold", type: "number", start: 0 },
        { id: "skills", label: "Skills", type: "list", ownLine: true, hint: "Name rank, comma separated" },
        { id: "inventory", label: "Inventory", type: "list", ownLine: true, hint: 'item, item xN, or "nothing"' },
      ],
    },
    {
      id: "pack_survival",
      label: "Survival",
      fields: [
        { id: "hunger", label: "Hunger", type: "meter", max: 100, start: 0 },
        { id: "thirst", label: "Thirst", type: "meter", max: 100, start: 0 },
        { id: "warmth", label: "Warmth", type: "meter", max: 100, start: 100 },
        { id: "injuries", label: "Injuries", type: "text", ownLine: true, hint: 'or "none"' },
      ],
    },
  ],
};

/**
 * Merge, never replace: a pack field is added only when no field already has
 * its label (case-insensitive), and a field already there keeps its settings.
 * Returns a new list; the pack's fields are copied.
 */
export function mergeMeguminStatFieldPack(
  fields: readonly MeguminStatField[],
  pack: Pick<MeguminStatFieldPack, "fields">,
): MeguminStatField[] {
  const out = [...fields];
  for (const pf of pack.fields) {
    if (!out.some((f) => String(f.label).toLowerCase() === pf.label.toLowerCase())) out.push({ ...pf });
  }
  return out;
}
