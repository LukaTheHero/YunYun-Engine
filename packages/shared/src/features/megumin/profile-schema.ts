// ──────────────────────────────────────────────
// Megumin Mode: settings, profiles and how a chat's profile is resolved
// ──────────────────────────────────────────────
// Megumin Suite keeps one profile per character (or per chat, or per group) and a few
// install-wide settings. Here they live in the `megumin` app setting (global settings, the
// default profile, per-character profiles keyed by character id, custom engines, Story Config
// presets, shared fragments, per-tab Global flags) and in `chat.metadata.meguminProfile`. Every
// stored profile is sparse: only what differs from the layer below it. Client and server resolve
// a chat's profile with the same function, resolveMeguminProfile, so they always agree.
//
// Other Megumin areas (Blocks, Story Director, Ban List, Images, NPC Bank, Memory Core) add their
// own profile sub-objects to meguminProfileShape and their keys to MEGUMIN_TAB_PROFILE_KEYS.
import { z } from "zod";
import {
  MEGUMIN_ADDON_CATALOG,
  MEGUMIN_ADDON_EXCLUSIVE_GROUPS,
  MEGUMIN_ENGINE_CATALOG,
  MEGUMIN_THINK_EFFORTS,
} from "./catalog.js";
import {
  STORY_CONFIG_FIELDS,
  applyStoryConfigDefaults,
  type MeguminStoryConfig,
  type MeguminStoryConfigFieldKey,
} from "./story-config.js";

/** App setting that holds the whole Megumin store. */
export const MEGUMIN_SETTINGS_KEY = "megumin";
/** Chat metadata key of the chat-level (and group) profile. */
export const MEGUMIN_PROFILE_METADATA_KEY = "meguminProfile";

// ── Caps ─────────────────────────────────────────
export const MEGUMIN_TEXT_MAX_CHARS = 50_000;
const MEGUMIN_SHORT_TEXT_MAX_CHARS = 200;
const MEGUMIN_LIST_MAX_ITEMS = 200;
export const MEGUMIN_MAX_CUSTOM_STYLES = 200;
export const MEGUMIN_MAX_CUSTOM_ENGINES = 64;
export const MEGUMIN_CUSTOM_ENGINE_MAX_BYTES = 200 * 1024;
export const MEGUMIN_MAX_CONFIG_PRESETS = 200;
export const MEGUMIN_MAX_SHARED_FRAGMENTS = 100;
/** The whole `megumin` value, and a chat's whole profile. */
export const MEGUMIN_SETTINGS_MAX_BYTES = 4 * 1024 * 1024;
/** Past this the editor warns that the store is getting large. */
export const MEGUMIN_SETTINGS_WARN_BYTES = 2 * 1024 * 1024;

/** UTF-8 size of a value as stored (JSON). */
export function meguminJsonByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value) ?? "").length;
}

/** Auxiliary model calls the task runner makes, one id per feature. */
export const MEGUMIN_TASK_IDS = [
  "director",
  "npc-scan",
  "npc-update",
  "ban-list",
  "image-prompt",
  "npc-portrait",
  "memory-summary",
  "style-order",
] as const;
export type MeguminTaskId = (typeof MEGUMIN_TASK_IDS)[number];

/** Editor tabs with a "Global" switch. Settings is install-wide already, so it has none. */
export const MEGUMIN_SYNC_TABS = [
  "engine",
  "narrator",
  "style",
  "addons",
  "blocks",
  "director",
  "banlist",
  "images",
  "npcs",
  "memory",
] as const;
export type MeguminSyncTab = (typeof MEGUMIN_SYNC_TABS)[number];

// ── Field schemas ────────────────────────────────
const text = z.string().max(MEGUMIN_TEXT_MAX_CHARS);
const shortText = z.string().max(MEGUMIN_SHORT_TEXT_MAX_CHARS);
const idSchema = z.string().trim().min(1).max(MEGUMIN_SHORT_TEXT_MAX_CHARS);
const shortList = z.array(shortText).max(MEGUMIN_LIST_MAX_ITEMS);
const flagMap = z.record(idSchema, z.boolean()).refine((map) => Object.keys(map).length <= MEGUMIN_LIST_MAX_ITEMS, {
  message: `At most ${MEGUMIN_LIST_MAX_ITEMS} entries`,
});
const wordLimit = z.number().int().min(1).max(100_000);

function uniqueIds(items: ReadonlyArray<{ id: string }>): boolean {
  return new Set(items.map((item) => item.id)).size === items.length;
}

const storyConfigShape = Object.fromEntries(STORY_CONFIG_FIELDS.map((field) => [field.key, text])) as Record<
  MeguminStoryConfigFieldKey,
  typeof text
>;
/** Story Config values, one string per field; "" switches a field off. */
export const meguminStoryConfigSchema = z.object(storyConfigShape).partial();

export const meguminCustomStyleSchema = z.object({
  id: idSchema,
  name: shortText,
  tags: shortList,
  notes: text,
  rule: text,
  generatedOptions: shortList.optional(),
});
export type MeguminCustomStyle = z.infer<typeof meguminCustomStyleSchema>;

const dnRatioSchema = z.object({ enabled: z.boolean(), dialogue: z.number().int().min(0).max(100) });
const onomatopoeiaSchema = z.object({ enabled: z.boolean(), useStyling: z.boolean() });
const v9LimitsSchema = z.object({ leanMin: wordLimit, leanMax: wordLimit, fullMin: wordLimit, fullMax: wordLimit });

const addonsSchema = z
  .array(idSchema)
  .max(MEGUMIN_ADDON_CATALOG.length)
  .superRefine((ids, ctx) => {
    for (const id of ids) {
      if (!MEGUMIN_ADDON_CATALOG.some((addon) => addon.id === id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unknown add-on: ${id}` });
      }
    }
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate add-on" });
    for (const [group, members] of Object.entries(MEGUMIN_ADDON_EXCLUSIVE_GROUPS)) {
      if (members.filter((id) => ids.includes(id)).length > 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Only one ${group} add-on can be on` });
      }
    }
  });

/** Every profile field with its full (resolved) type. Stored profiles are the sparse form below. */
const meguminProfileShape = {
  // Engine & Reasoning
  mode: idSchema,
  model: idSchema,
  cotEnabled: z.boolean(),
  thinkEffort: z
    .string()
    .refine((id) => MEGUMIN_THINK_EFFORTS.some((effort) => effort.id === id), { message: "Unknown thinking effort" }),
  customThinkEffort: z.number().int().min(1).max(5000),
  thinkingV2: z.boolean(),
  sendCotPrefill: z.boolean(),
  layout: z.enum(["universal", "cache"]),
  enhancedDialogue: flagMap,
  storyConfig: meguminStoryConfigSchema,
  // Narrator
  personality: idSchema,
  toggles: flagMap,
  // Writing Style
  aiTags: shortList,
  aiGeneratedOptions: shortList,
  aiRule: text,
  customStyles: z
    .array(meguminCustomStyleSchema)
    .max(MEGUMIN_MAX_CUSTOM_STYLES)
    .refine(uniqueIds, { message: "Style ids must be unique" }),
  activeStyleId: idSchema.nullable(),
  dnRatio: dnRatioSchema,
  // Add-ons
  onomatopoeia: onomatopoeiaSchema,
  v9Limits: v9LimitsSchema,
  addons: addonsSchema,
  userLanguage: shortText,
  userPronouns: z.enum(["off", "male", "female"]),
  customPrompt: text,
  userRuleReminder: z.boolean(),
  /** The MVU output-format block, a contract with a SillyTavern extension YunYun does not run. */
  mvu: z.boolean(),
};

/** A stored profile: any subset of the fields, nested settings objects included. */
export const meguminProfileSchema = z
  .object({
    ...meguminProfileShape,
    dnRatio: dnRatioSchema.partial(),
    onomatopoeia: onomatopoeiaSchema.partial(),
    v9Limits: v9LimitsSchema.partial(),
  })
  .partial();
export type MeguminProfile = z.infer<typeof meguminProfileSchema>;
export type MeguminProfileKey = keyof MeguminProfile;

/** A profile after resolution: every field present. */
export type MeguminResolvedProfile = z.infer<z.ZodObject<typeof meguminProfileShape>> & {
  storyConfig: MeguminStoryConfig;
};

/** What a fresh install starts from (decision D9: V10 Ukiyo, its CoT and its locked style). */
export const MEGUMIN_FACTORY_PROFILE: Readonly<MeguminResolvedProfile> = {
  mode: "v10-core",
  model: "cot-v10-ukiyo-english",
  cotEnabled: true,
  thinkEffort: "unspecified",
  customThinkEffort: 100,
  thinkingV2: false,
  sendCotPrefill: false,
  layout: "universal",
  enhancedDialogue: {},
  storyConfig: applyStoryConfigDefaults({}),
  personality: "engine",
  toggles: { ooc: false, control: false },
  aiTags: [],
  aiGeneratedOptions: [],
  aiRule: "",
  customStyles: [],
  activeStyleId: "dir_v10_ukiyo",
  dnRatio: { enabled: false, dialogue: 50 },
  onomatopoeia: { enabled: false, useStyling: false },
  v9Limits: { leanMin: 300, leanMax: 400, fullMin: 700, fullMax: 1200 },
  addons: [],
  userLanguage: "",
  userPronouns: "off",
  customPrompt: "",
  userRuleReminder: false,
  mvu: false,
};

/** Profile keys each tab's Global switch shares from the default profile. Other areas add theirs. */
export const MEGUMIN_TAB_PROFILE_KEYS: Readonly<Record<MeguminSyncTab, readonly MeguminProfileKey[]>> = {
  engine: [
    "mode",
    "model",
    "cotEnabled",
    "thinkEffort",
    "customThinkEffort",
    "thinkingV2",
    "sendCotPrefill",
    "layout",
    "enhancedDialogue",
    "storyConfig",
  ],
  narrator: ["personality", "toggles"],
  style: ["activeStyleId", "aiRule", "customStyles", "dnRatio"],
  addons: [
    "addons",
    "userLanguage",
    "userPronouns",
    "onomatopoeia",
    "v9Limits",
    "customPrompt",
    "userRuleReminder",
    "mvu",
  ],
  blocks: [],
  director: [],
  banlist: [],
  images: [],
  npcs: [],
  memory: [],
};

// ── Install-wide parts ───────────────────────────
const customModuleSchema = z.object({
  id: idSchema,
  name: shortText,
  /** Which tab shows its switch: "settings" is the Add-ons tab, "addons" the Global tab (upstream names). */
  location: z.enum(["settings", "addons"]),
  attachPoint: shortText,
  content: text,
});

/** A Dev Mode clone or imported engine. Stock engine ids are reserved so a custom one never shadows them. */
export const meguminCustomEngineSchema = z
  .object({
    id: idSchema.refine((id) => !MEGUMIN_ENGINE_CATALOG.some((engine) => engine.id === id), {
      message: "A custom engine cannot use a built-in engine id",
    }),
    label: shortText,
    color: z.string().max(64).default(""),
    p1: text.default(""),
    p2: text.default(""),
    p3: text.default(""),
    p4: text.default(""),
    p5: text.default(""),
    p6: text.default(""),
    A1: text.optional(),
    A2: text.optional(),
    isNew: z.boolean().optional(),
    isV7: z.boolean().optional(),
    isV8: z.boolean().optional(),
    isV9: z.boolean().optional(),
    isV10: z.boolean().optional(),
    isCoreClone: z.boolean().optional(),
    recommended: z.boolean().optional(),
    isCoWriter: z.boolean().optional(),
    devLegacy: z.boolean().optional(),
    /** The stock engine a clone was made from. */
    parentId: idSchema.optional(),
    /** Reasoning the engine pins instead of following the CoT picker. */
    cot: text.optional(),
    prefill: text.optional(),
    customToggles: z.array(customModuleSchema).max(MEGUMIN_LIST_MAX_ITEMS).optional(),
  })
  .refine((engine) => meguminJsonByteLength(engine) <= MEGUMIN_CUSTOM_ENGINE_MAX_BYTES, {
    message: `A custom engine can be at most ${MEGUMIN_CUSTOM_ENGINE_MAX_BYTES / 1024} KB`,
  });
export type MeguminCustomEngine = z.infer<typeof meguminCustomEngineSchema>;

/** A Story Config preset the user saved. The built-in ones are code (STORY_CONFIG_BUILTIN_PRESETS). */
export const meguminConfigPresetSchema = z.object({ id: idSchema, name: shortText, values: meguminStoryConfigSchema });
export type MeguminConfigPreset = z.infer<typeof meguminConfigPresetSchema>;

export const meguminGlobalSettingsSchema = z.object({
  /** "Utility model" for auxiliary tasks; null uses Default for agents. */
  utilityConnectionId: idSchema.nullable().default(null),
  /** Per-task connection overrides. */
  taskConnections: z.record(z.enum(MEGUMIN_TASK_IDS), idSchema).default({}),
  /** Utility Prefills: send each task's assistant prefill. Off by default, since some APIs reject one. */
  enableUtilityPrefill: z.boolean().default(false),
  /** Where a single-character chat's edits go: the character's profile or the chat's own. */
  saveMode: z.enum(["character", "chat"]).default("character"),
  /** Hold each Megumin prompt for review before it is sent. */
  promptPreview: z.boolean().default(false),
});
export type MeguminGlobalSettings = z.infer<typeof meguminGlobalSettingsSchema>;

const sectionSchemas = {
  global: meguminGlobalSettingsSchema.default({}),
  defaultProfile: meguminProfileSchema.default({}),
  characterProfiles: z.record(idSchema, meguminProfileSchema).default({}),
  customEngines: z
    .array(meguminCustomEngineSchema)
    .max(MEGUMIN_MAX_CUSTOM_ENGINES)
    .refine(uniqueIds, { message: "Custom engine ids must be unique" })
    .default([]),
  configPresets: z
    .array(meguminConfigPresetSchema)
    .max(MEGUMIN_MAX_CONFIG_PRESETS)
    .refine(uniqueIds, { message: "Config preset ids must be unique" })
    .default([]),
  /** Dev Mode's install-wide slot text, keyed by slot key. */
  sharedFragments: z
    .record(idSchema, text)
    .refine((map) => Object.keys(map).length <= MEGUMIN_MAX_SHARED_FRAGMENTS, {
      message: `At most ${MEGUMIN_MAX_SHARED_FRAGMENTS} shared fragments`,
    })
    .default({}),
  /** Tabs switched to Global: their keys come from the default profile for every chat. */
  globalTabs: z.record(z.enum(MEGUMIN_SYNC_TABS), z.boolean()).default({}),
  /** Story Config follows the Engine tab's Global switch unless this is false. */
  storyConfigGlobalSync: z.boolean().default(true),
};

function withinSizeCap(value: unknown): boolean {
  return meguminJsonByteLength(value) <= MEGUMIN_SETTINGS_MAX_BYTES;
}
const sizeCapMessage = { message: `Megumin settings can be at most ${MEGUMIN_SETTINGS_MAX_BYTES / 1024 / 1024} MB` };

export const meguminSettingsSchema = z.object(sectionSchemas).refine(withinSizeCap, sizeCapMessage);
export type MeguminSettings = z.infer<typeof meguminSettingsSchema>;

/**
 * PUT /api/megumin/settings: each section sent replaces that section. Profiles have their own
 * routes, so two editors saving different profiles never overwrite each other.
 */
export const meguminSettingsUpdateSchema = z
  .object({
    global: meguminGlobalSettingsSchema,
    customEngines: sectionSchemas.customEngines.removeDefault(),
    configPresets: sectionSchemas.configPresets.removeDefault(),
    sharedFragments: sectionSchemas.sharedFragments.removeDefault(),
    globalTabs: sectionSchemas.globalTabs.removeDefault(),
    storyConfigGlobalSync: z.boolean(),
  })
  .partial()
  .strict();
export type MeguminSettingsUpdate = z.infer<typeof meguminSettingsUpdateSchema>;

/** PUT body of a profile route; null resets that scope, so it inherits from the level below. */
export const meguminProfileUpdateSchema = z
  .object({ profile: meguminProfileSchema.nullable() })
  .strict()
  .refine((body) => withinSizeCap(body.profile), sizeCapMessage);

export interface MeguminSettingsResponse {
  settings: MeguminSettings;
  sizeBytes: number;
}

/** The stored value, or the defaults when it is missing or invalid. */
export function parseMeguminSettings(value: unknown): MeguminSettings {
  const parsed = meguminSettingsSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : meguminSettingsSchema.parse({});
}

/** A stored chat profile, or null when there is none or it is invalid. */
export function parseMeguminProfile(value: unknown): MeguminProfile | null {
  if (value === null || value === undefined) return null;
  const parsed = meguminProfileSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

// ── Sparse profiles ──────────────────────────────
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function mergeValues(base: Record<string, unknown>, diff: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = structuredClone(base);
  for (const [key, value] of Object.entries(diff)) {
    if (value === undefined) continue;
    out[key] = isPlainObject(value) && isPlainObject(out[key]) ? mergeValues(out[key], value) : structuredClone(value);
  }
  return out;
}

/** `base` with `diff` on top. Settings objects merge key by key; lists and values replace. Inputs are not changed. */
export function mergeMeguminProfile<T extends MeguminProfile>(base: T, diff: MeguminProfile | null | undefined): T {
  return (diff ? mergeValues(base, diff) : structuredClone(base)) as T;
}

// ── Resolution ───────────────────────────────────
export type MeguminProfileScope = "default" | "character" | "chat";

/** The parts of a chat the resolver reads. */
export interface MeguminProfileChat {
  characterIds: readonly string[];
  metadata?: Record<string, unknown> | null;
}

export interface ResolvedMeguminProfileState {
  profile: MeguminResolvedProfile;
  /** Where an edit to a per-chat key is saved (see meguminProfileKeyWriteScope). */
  writeScope: MeguminProfileScope;
  /** The character whose profile applies: single-character chats only. */
  characterId: string | null;
  /** Scopes that hold a stored profile and took part, lowest first. */
  layers: MeguminProfileScope[];
  /** Keys taken from the default profile because their tab is Global. */
  globalKeys: MeguminProfileKey[];
}

/** Keys shared from the default profile because their tab's Global switch is on. */
export function meguminGlobalProfileKeys(
  settings: Pick<MeguminSettings, "globalTabs" | "storyConfigGlobalSync">,
): MeguminProfileKey[] {
  const keys = new Set<MeguminProfileKey>();
  for (const tab of MEGUMIN_SYNC_TABS) {
    if (settings.globalTabs[tab] !== true) continue;
    for (const key of MEGUMIN_TAB_PROFILE_KEYS[tab]) keys.add(key);
  }
  if (settings.storyConfigGlobalSync === false) keys.delete("storyConfig");
  return [...keys];
}

/**
 * A chat's profile, lowest layer first: factory defaults, the default profile, the character's
 * profile (single-character chats, as upstream's avatar key), then the chat's own. A group chat
 * never reads a character profile, as upstream's group key. Keys of a Global tab then come from
 * the default profile alone: upstream copied them into every profile; here they are inherited.
 * Without a chat it is the default profile (the editor's "Global default").
 */
export function resolveMeguminProfile(args: {
  settings: MeguminSettings;
  chat?: MeguminProfileChat | null;
}): ResolvedMeguminProfileState {
  const { settings, chat } = args;
  const characterId = chat?.characterIds.length === 1 ? (chat.characterIds[0] ?? null) : null;
  const characterProfile =
    characterId && Object.hasOwn(settings.characterProfiles, characterId)
      ? (settings.characterProfiles[characterId] ?? null)
      : null;
  const chatProfile = chat ? parseMeguminProfile(chat.metadata?.[MEGUMIN_PROFILE_METADATA_KEY]) : null;

  const base = mergeMeguminProfile(MEGUMIN_FACTORY_PROFILE as MeguminResolvedProfile, settings.defaultProfile);
  const profile = mergeMeguminProfile(mergeMeguminProfile(base, characterProfile), chatProfile);
  const globalKeys = meguminGlobalProfileKeys(settings);
  for (const key of globalKeys) (profile as Record<string, unknown>)[key] = structuredClone(base[key]);
  // As upstream on every profile load: a blank standing field (pov, pace, length) gets its default back.
  profile.storyConfig = applyStoryConfigDefaults(profile.storyConfig);

  const layers: MeguminProfileScope[] = [];
  if (Object.keys(settings.defaultProfile).length > 0) layers.push("default");
  if (characterProfile) layers.push("character");
  if (chatProfile) layers.push("chat");

  let writeScope: MeguminProfileScope = "default";
  if (chat) {
    if (chatProfile || chat.characterIds.length > 1 || settings.global.saveMode === "chat") writeScope = "chat";
    else if (characterId) writeScope = "character";
  }
  return { profile, writeScope, characterId, layers, globalKeys };
}

/** Where an edit to `key` is saved: the default profile for a Global tab's key, else the write scope. */
export function meguminProfileKeyWriteScope(
  state: Pick<ResolvedMeguminProfileState, "writeScope" | "globalKeys">,
  key: MeguminProfileKey,
): MeguminProfileScope {
  return state.globalKeys.includes(key) ? "default" : state.writeScope;
}
