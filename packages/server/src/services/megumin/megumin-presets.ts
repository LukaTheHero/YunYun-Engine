// ──────────────────────────────────────────────
// Megumin Suite: its presets as YunYun presets
// ──────────────────────────────────────────────
// Megumin ships three SillyTavern presets made of [[slots]] its engine fills
// each turn. They are converted into YunYun presets at startup, kept under
// reserved system keys, and refreshed when a Megumin sync brings a new version
// (unless the person edited theirs, which is then left alone).
//
// MEGUMINTOGGLE decides which preset a Roleplay chat on a stock preset uses:
//   on  — the stock Marinara Universal preset runs as Megumin V11 Universal;
//   off — a Megumin preset runs as Marinara Universal, exactly as before.
// A preset the person made themselves is always used as chosen.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isStockMarinaraUniversalPreset, type MarkerConfig } from "@marinara-engine/shared";
import {
  MEGUMIN_DEFAULT_PRESET_SYSTEM_KEY,
  MEGUMIN_PRESETS,
  MeguminSlots,
  isMeguminPresetSystemKey,
} from "@marinara-engine/shared/megumin";
import type { DB } from "../../db/connection.js";
import { logger } from "../../lib/logger.js";
import { createPromptsStorage } from "../storage/prompts.storage.js";
import { createAppSettingsStorage } from "../storage/app-settings.storage.js";
import { isMeguminEnabled } from "./megumin-store.js";

const presetsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "db", "megumin-presets");

interface STPrompt {
  identifier: string;
  name?: string;
  role?: string;
  content?: string;
  marker?: boolean;
  injection_position?: number;
  injection_depth?: number;
}

interface STPreset {
  prompts?: STPrompt[];
  prompt_order?: Array<{ character_id: number; order: Array<{ identifier: string; enabled: boolean }> }>;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  min_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  reasoning_effort?: string;
  show_thoughts?: boolean;
}

/** SillyTavern's markers, each to the YunYun marker that sends the same thing. */
function markerFor(identifier: string): { name: string; config: MarkerConfig } | null {
  switch (identifier) {
    case "chatHistory":
      return { name: "Chat History", config: { type: "chat_history" } };
    case "charDescription":
      return {
        name: "Char Description",
        config: { type: "character", characterFields: ["description", "backstory", "appearance"] },
      };
    case "charPersonality":
      return { name: "Char Personality", config: { type: "character", characterFields: ["personality"] } };
    case "scenario":
      return { name: "Scenario", config: { type: "character", characterFields: ["scenario"] } };
    case "personaDescription":
      return { name: "Persona Description", config: { type: "persona" } };
    case "worldInfoBefore":
      return { name: "World Info (before)", config: { type: "world_info_before" } };
    case "worldInfoAfter":
      return { name: "World Info (after)", config: { type: "world_info_after" } };
    case "dialogueExamples":
      return { name: "Chat Examples", config: { type: "dialogue_examples" } };
    default:
      return null;
  }
}

export interface ConvertedMeguminPreset {
  sections: Array<{
    identifier: string;
    name: string;
    content: string;
    role: "system" | "user" | "assistant";
    enabled: boolean;
    isMarker: boolean;
    markerConfig: MarkerConfig | null;
    injectionPosition: "ordered" | "depth";
    injectionDepth: number;
  }>;
  parameters: Record<string, unknown>;
}

/** Megumin's SillyTavern preset as YunYun sections, in its 100001 (custom) order. */
export function convertMeguminPreset(raw: STPreset): ConvertedMeguminPreset {
  const prompts = new Map((raw.prompts ?? []).map((p) => [p.identifier, p]));
  const order = raw.prompt_order?.find((o) => o.character_id === 100001) ?? raw.prompt_order?.[0];
  const listed = order?.order ?? (raw.prompts ?? []).map((p) => ({ identifier: p.identifier, enabled: true }));
  const sections: ConvertedMeguminPreset["sections"] = [];
  for (const entry of listed) {
    const prompt = prompts.get(entry.identifier);
    if (!prompt) continue;
    const marker = prompt.marker ? markerFor(prompt.identifier) : null;
    if (prompt.marker && !marker) continue;
    const role = prompt.role === "user" || prompt.role === "assistant" ? prompt.role : "system";
    const depth = !marker && prompt.injection_position === 1;
    sections.push({
      identifier: `megumin:${prompt.identifier}`,
      name: marker ? marker.name : prompt.name || prompt.identifier,
      content: marker ? "" : (prompt.content ?? ""),
      role: marker ? "system" : role,
      enabled: entry.enabled !== false,
      isMarker: Boolean(marker),
      markerConfig: marker?.config ?? null,
      injectionPosition: depth ? "depth" : "ordered",
      injectionDepth: depth ? (prompt.injection_depth ?? 1) : 0,
    });
  }
  const parameters: Record<string, unknown> = {
    temperature: raw.temperature ?? 0.9,
    topP: raw.top_p ?? 0.95,
    topK: raw.top_k ?? 0,
    minP: raw.min_p ?? 0,
    frequencyPenalty: raw.frequency_penalty ?? 0,
    presencePenalty: raw.presence_penalty ?? 0,
    // Megumin asks for 20,000 tokens; YunYun keeps its own stock output budget, which fits a V11 turn and its thinking.
    maxTokens: 8192,
    maxContext: 128000,
    reasoningEffort: raw.reasoning_effort === "high" ? "high" : "maximum",
    showThoughts: raw.show_thoughts ?? true,
    squashSystemMessages: true,
    useMaxContext: true,
    strictRoleFormatting: true,
    singleUserMessage: false,
    stopSequences: [],
  };
  return { sections, parameters };
}

function readBundled(file: string): { raw: STPreset; hash: string } {
  const text = readFileSync(join(presetsDir, file), "utf8");
  return { raw: JSON.parse(text) as STPreset, hash: createHash("sha256").update(text).digest("hex") };
}

// What a person can change in a preset, as the stock seeder snapshots it (db/seed.ts buildPresetSnapshot). Row ids
// only change when the rows are recreated, which is an edit too, so they stand in for section and group identity.
const PRESET_FIELDS = [
  "name",
  "description",
  "conversationPrompt",
  "gamePrompt",
  "variableGroups",
  "variableValues",
  "parameters",
  "wrapFormat",
  "author",
  "defaultChoices",
  "sectionOrder",
  "groupOrder",
];
const SECTION_FIELDS = [
  "id",
  "identifier",
  "name",
  "content",
  "role",
  "enabled",
  "isMarker",
  "groupId",
  "markerConfig",
  "injectionPosition",
  "injectionDepth",
  "injectionOrder",
  "forbidOverrides",
  "skipWrap",
];
const GROUP_FIELDS = ["id", "name", "parentGroupId", "order", "enabled"];
const CHOICE_FIELDS = [
  "id",
  "variableName",
  "question",
  "options",
  "multiSelect",
  "separator",
  "randomPick",
  "displayMode",
  "optionSort",
  "sortOrder",
];

/** A fingerprint of everything a person can edit in the preset: a change means the preset is theirs now. */
async function presetHash(db: DB, presetId: string): Promise<string> {
  const storage = createPromptsStorage(db);
  const [preset, sections, groups, choices] = await Promise.all([
    storage.getById(presetId),
    storage.listSections(presetId),
    storage.listGroups(presetId),
    storage.listChoiceBlocksForPreset(presetId),
  ]);
  const pick = (fields: string[]) => (row: Record<string, unknown>) => fields.map((f) => row[f] ?? null);
  const byId = (a: Record<string, unknown>, b: Record<string, unknown>) => String(a.id).localeCompare(String(b.id));
  const shape = {
    preset: preset ? pick(PRESET_FIELDS)(preset) : null,
    sections: [...sections].sort(byId).map(pick(SECTION_FIELDS)),
    groups: [...groups].sort(byId).map(pick(GROUP_FIELDS)),
    choices: [...choices].sort(byId).map(pick(CHOICE_FIELDS)),
  };
  return createHash("sha256").update(JSON.stringify(shape)).digest("hex");
}

async function writeSections(db: DB, presetId: string, converted: ConvertedMeguminPreset) {
  const storage = createPromptsStorage(db);
  for (const existing of await storage.listSections(presetId)) await storage.removeSection(existing.id);
  const ids: string[] = [];
  for (const section of converted.sections) {
    const created = await storage.createSection({ presetId, ...section, skipWrap: true });
    if (created) ids.push(created.id);
  }
  await storage.reorderSections(presetId, ids);
}

/** Creates or refreshes the bundled Megumin presets. Called at startup after the stock preset. */
export async function seedMeguminPresets(db: DB): Promise<void> {
  const storage = createPromptsStorage(db);
  const appSettings = createAppSettingsStorage(db);
  const existing = await storage.list();
  for (const def of MEGUMIN_PRESETS) {
    try {
      const { raw, hash } = readBundled(def.file);
      const converted = convertMeguminPreset(raw);
      const seedKey = `seed:${def.systemKey}:sha256`;
      const snapshotKey = `seed:${def.systemKey}:snapshot`;
      const found = existing.find((p) => (p as { systemKey?: string }).systemKey === def.systemKey);
      if (!found) {
        const created = await storage.create({
          name: def.name,
          description: def.description,
          parameters: converted.parameters as never,
          wrapFormat: "none",
          author: "KazumaONIISAN (Megumin Suite)",
        } as never);
        if (!created) continue;
        await storage.setSystemKey(created.id, def.systemKey);
        await writeSections(db, created.id, converted);
        await appSettings.set(seedKey, hash);
        await appSettings.set(snapshotKey, await presetHash(db, created.id));
        logger.info("[seed] Added the %s preset", def.name);
        continue;
      }
      if ((await appSettings.get(seedKey)) === hash) continue;
      const snapshot = await appSettings.get(snapshotKey);
      const current = await presetHash(db, found.id);
      if (snapshot && current !== snapshot) {
        // Edited by the person: their version stays, and the new one is not forced on them.
        await appSettings.set(seedKey, hash);
        logger.info("[seed] %s was edited, so the bundled update was not applied", def.name);
        continue;
      }
      await storage.update(found.id, { parameters: converted.parameters as never, description: def.description });
      await writeSections(db, found.id, converted);
      await appSettings.set(seedKey, hash);
      await appSettings.set(snapshotKey, await presetHash(db, found.id));
      logger.info("[seed] Refreshed the %s preset", def.name);
    } catch (err) {
      logger.error(err, "[seed] Could not seed the %s preset", def.name);
    }
  }
}

type PresetRow = { id: string; systemKey?: unknown } & Record<string, unknown>;

export function isMeguminPreset(preset: { systemKey?: unknown } | null | undefined): boolean {
  return Boolean(preset && isMeguminPresetSystemKey(preset.systemKey));
}

/**
 * A preset Megumin fills: one of its own, or a copy of one (duplicated or imported, so without the
 * reserved key) whose enabled sections carry Megumin's [[slots]], as SillyTavern fills them in any preset.
 */
export async function carriesMeguminSlots(
  db: DB,
  preset: { id?: unknown; systemKey?: unknown } | null | undefined,
): Promise<boolean> {
  if (!preset) return false;
  if (isMeguminPreset(preset)) return true;
  if (typeof preset.id !== "string") return false;
  const triggers = MeguminSlots.meguminAllSlotTriggers()
    .map(String)
    .filter((t) => t.startsWith("[["));
  const sections = await createPromptsStorage(db).listSections(preset.id);
  return sections.some(
    (s) => s.enabled === "true" && s.isMarker !== "true" && triggers.some((t) => s.content.includes(t)),
  );
}

/**
 * MEGUMINTOGGLE's preset swap for one Roleplay generation. Returns the preset to
 * use instead of `resolved`, or null to keep it.
 */
export async function resolveMeguminPresetSwap(
  db: DB,
  args: { chatMode: unknown; resolved: PresetRow | null; impersonate?: boolean },
): Promise<PresetRow | null> {
  if (args.chatMode !== "roleplay") return null;
  const storage = createPromptsStorage(db);
  const enabled = isMeguminEnabled();
  const resolved = args.resolved;
  // Only the stock preset is swapped: "None" is the person's own choice, like any preset they pick.
  // Megumin never writes the person's own line, so an impersonation keeps the stock preset; switched
  // off, though, a Megumin preset is never used, impersonation included.
  if (enabled && !args.impersonate && resolved && isStockMarinaraUniversalPreset(resolved)) {
    const all = (await storage.list()) as PresetRow[];
    return all.find((p) => p.systemKey === MEGUMIN_DEFAULT_PRESET_SYSTEM_KEY) ?? null;
  }
  if (!enabled && resolved && isMeguminPreset(resolved)) {
    const all = (await storage.list()) as PresetRow[];
    return all.find((p) => isStockMarinaraUniversalPreset(p)) ?? null;
  }
  return null;
}
