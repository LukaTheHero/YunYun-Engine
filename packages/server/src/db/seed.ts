// ──────────────────────────────────────────────
// Seed: the stock prompt presets
// Creates or refreshes Marinara's bundled universal roleplay preset and the
// bundled Megumin Suite preset. Reads each exported preset JSON and imports it
// via the standard importer.
// ──────────────────────────────────────────────
import { logger } from "../lib/logger.js";
import type { DB } from "./connection.js";
import { createPromptsStorage } from "../services/storage/prompts.storage.js";
import { createAppSettingsStorage } from "../services/storage/app-settings.storage.js";
import { importMarinara } from "../services/import/marinara.importer.js";
import { choiceBlocks, promptGroups, promptSections } from "./schema/index.js";
import {
  DEFAULT_CONVERSATION_PROMPT,
  DEFAULT_GAME_SYSTEM_PROMPT,
  MARINARA_UNIVERSAL_PRESET_AUTHOR,
  MARINARA_UNIVERSAL_PRESET_NAME,
  MARINARA_UNIVERSAL_PRESET_SYSTEM_KEY,
  MEGUMIN_SUITE_PRESET_AUTHOR,
  MEGUMIN_SUITE_PRESET_NAME,
  MEGUMIN_SUITE_PRESET_SYSTEM_KEY,
  normalizePromptPresetEngineMode,
} from "@marinara-engine/shared";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createHash } from "crypto";
import { eq } from "./file-query.js";
import { migrateLegacyDefaultConversationPromptLead } from "./default-conversation-prompt-migration.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LEGACY_MARINARA_PRESET_NAME = "Default";
const MARINARA_PRESET_DESCRIPTION = "Marinara's universal roleplay preset. Serves as a good base.";

/** One Engine-owned preset that startup creates, restores and keeps current. */
export interface StockPresetDefinition {
  /** Reserved identity; one of STOCK_PRESET_SYSTEM_KEYS. */
  systemKey: string;
  /** Absolute path of the bundled `marinara_preset` envelope. */
  file: string;
  /** App setting holding the SHA-256 of the last applied bundled file. */
  hashKey: string;
  /** App setting holding the snapshot hash of the stock row as last applied. */
  snapshotKey: string;
  /** Used when the envelope omits them. */
  name: string;
  author: string;
  description: string;
  /** Short name for log lines. */
  label: string;
  /** Make the row the default when it is seeded into a profile that has no presets at all. */
  makeDefaultOnFresh: boolean;
  /**
   * Older display names of a preset seeded before systemKey existed. A row named `name` or one of
   * these, by `author`, is claimed only on snapshot evidence, and an old name is renamed to `name`.
   * Without it a row is never claimed by name.
   */
  legacyNames?: readonly string[];
  /** Migrate the old Conversation prompt lead sentence (the Universal preset only). */
  migrateConversationPromptLead?: boolean;
}

export const MARINARA_UNIVERSAL_STOCK_PRESET: StockPresetDefinition = {
  systemKey: MARINARA_UNIVERSAL_PRESET_SYSTEM_KEY,
  file: join(__dirname, "default-preset.json"),
  hashKey: "seed:marinara-universal-preset:sha256",
  snapshotKey: "seed:marinara-universal-preset:snapshot-sha256",
  name: MARINARA_UNIVERSAL_PRESET_NAME,
  author: MARINARA_UNIVERSAL_PRESET_AUTHOR,
  description: MARINARA_PRESET_DESCRIPTION,
  label: "universal preset",
  makeDefaultOnFresh: true,
  legacyNames: [LEGACY_MARINARA_PRESET_NAME],
  migrateConversationPromptLead: true,
};

export const MEGUMIN_SUITE_STOCK_PRESET: StockPresetDefinition = {
  systemKey: MEGUMIN_SUITE_PRESET_SYSTEM_KEY,
  file: join(__dirname, "megumin-suite-preset.json"),
  hashKey: "seed:megumin-suite-preset:sha256",
  snapshotKey: "seed:megumin-suite-preset:snapshot-sha256",
  name: MEGUMIN_SUITE_PRESET_NAME,
  author: MEGUMIN_SUITE_PRESET_AUTHOR,
  description: "Megumin Suite by KazumaONIISAN (Arif-salah), ported with permission.",
  label: "Megumin Suite preset",
  // Megumin Mode is off by default: the stock row is never starred or assigned automatically.
  makeDefaultOnFresh: false,
};

type BundledPresetEnvelope = {
  type: "marinara_preset";
  version: 1;
  exportedAt: string;
  data: {
    preset: Record<string, unknown>;
    groups?: Record<string, unknown>[];
    sections?: Record<string, unknown>[];
    choiceBlocks?: Record<string, unknown>[];
  };
};

function readBundledPreset(jsonPath: string): { hash: string; envelope: BundledPresetEnvelope } {
  const raw = readFileSync(jsonPath, "utf-8");
  const envelope = JSON.parse(raw) as BundledPresetEnvelope;
  return {
    hash: createHash("sha256").update(raw).digest("hex"),
    envelope,
  };
}

function parseJsonField<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== "string") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function numberField(value: unknown, fallback: number): number {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(numeric) ? numeric : fallback;
}

function booleanField(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return fallback;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function contentHash(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function withoutRowIdentity(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => withoutRowIdentity(item));
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (["id", "presetId", "createdAt", "updatedAt", "parentGroupId", "groupId"].includes(key)) continue;
    out[key] = withoutRowIdentity(item);
  }
  return out;
}

function stableKeyMap<T extends { id?: unknown }>(
  rows: T[],
  prefix: string,
  getBase: (row: T) => string,
): Map<string, string> {
  const counts = new Map<string, number>();
  const sorted = [...rows].sort((a, b) => {
    const aBase = getBase(a);
    const bBase = getBase(b);
    if (aBase !== bBase) return aBase.localeCompare(bBase);
    return stableStringify(withoutRowIdentity(a)).localeCompare(stableStringify(withoutRowIdentity(b)));
  });
  const map = new Map<string, string>();
  for (const row of sorted) {
    if (typeof row.id !== "string") continue;
    const base = getBase(row).trim() || "unnamed";
    const count = counts.get(base) ?? 0;
    counts.set(base, count + 1);
    map.set(row.id, `${prefix}:${base}:${count}`);
  }
  return map;
}

function orderedStableKeys(value: unknown, keyMap: Map<string, string>): string[] {
  return parseJsonField<string[]>(value, [])
    .map((id) => keyMap.get(id))
    .filter((id): id is string => Boolean(id));
}

function bundledConversationPrompt(preset: Record<string, unknown>): string {
  return String(preset.conversationPrompt ?? preset.conversation_prompt ?? DEFAULT_CONVERSATION_PROMPT);
}

function bundledGamePrompt(preset: Record<string, unknown>): string {
  return String(preset.gamePrompt ?? preset.game_prompt ?? DEFAULT_GAME_SYSTEM_PROMPT);
}

function buildPresetSnapshot(args: {
  preset: Record<string, unknown>;
  groups: Record<string, unknown>[];
  sections: Record<string, unknown>[];
  choiceBlocks: Record<string, unknown>[];
}) {
  const { preset, groups, sections, choiceBlocks } = args;
  const groupKeyMap = stableKeyMap(groups, "group", (group) => String(group.name ?? ""));
  const sectionKeyMap = stableKeyMap(sections, "section", (section) =>
    String(section.identifier ?? section.name ?? ""),
  );
  const choiceKeyMap = stableKeyMap(choiceBlocks, "choice", (choice) => String(choice.variableName ?? ""));

  return {
    preset: {
      name: String(preset.name ?? ""),
      description: String(preset.description ?? ""),
      conversationPrompt: bundledConversationPrompt(preset),
      gamePrompt: bundledGamePrompt(preset),
      variableGroups: parseJsonField(preset.variableGroups, []),
      variableValues: parseJsonField(preset.variableValues, {}),
      parameters: parseJsonField(preset.parameters, {}),
      wrapFormat: String(preset.wrapFormat ?? "xml"),
      author: String(preset.author ?? ""),
      defaultChoices: parseJsonField(preset.defaultChoices, {}),
      sectionOrder: orderedStableKeys(preset.sectionOrder, sectionKeyMap),
      groupOrder: orderedStableKeys(preset.groupOrder, groupKeyMap),
      // Emitted only when set so snapshot hashes stored before this field existed still match.
      ...(normalizePromptPresetEngineMode(preset.engineMode) ? { engineMode: preset.engineMode } : {}),
    },
    groups: groups
      .map((group) => ({
        key: typeof group.id === "string" ? (groupKeyMap.get(group.id) ?? "") : "",
        name: String(group.name ?? ""),
        parentGroupKey: typeof group.parentGroupId === "string" ? (groupKeyMap.get(group.parentGroupId) ?? null) : null,
        order: numberField(group.order, 100),
        enabled: booleanField(group.enabled, true),
      }))
      .sort((a, b) => a.key.localeCompare(b.key)),
    sections: sections
      .map((section) => ({
        key: typeof section.id === "string" ? (sectionKeyMap.get(section.id) ?? "") : "",
        identifier: String(section.identifier ?? ""),
        name: String(section.name ?? ""),
        content: String(section.content ?? ""),
        role: String(section.role ?? "system"),
        enabled: booleanField(section.enabled, true),
        isMarker: booleanField(section.isMarker, false),
        groupKey: typeof section.groupId === "string" ? (groupKeyMap.get(section.groupId) ?? null) : null,
        markerConfig: section.markerConfig ? parseJsonField(section.markerConfig, null) : null,
        injectionPosition: String(section.injectionPosition ?? "ordered"),
        injectionDepth: numberField(section.injectionDepth, 0),
        injectionOrder: numberField(section.injectionOrder, 100),
        forbidOverrides: booleanField(section.forbidOverrides, false),
        // Emitted only when set so snapshot hashes stored before this field existed still match.
        ...(booleanField(section.skipWrap, false) ? { skipWrap: true } : {}),
      }))
      .sort((a, b) => a.key.localeCompare(b.key)),
    choiceBlocks: choiceBlocks
      .map((choice) => ({
        key: typeof choice.id === "string" ? (choiceKeyMap.get(choice.id) ?? "") : "",
        variableName: String(choice.variableName ?? ""),
        question: String(choice.question ?? ""),
        options: parseJsonField(choice.options, []),
        multiSelect: booleanField(choice.multiSelect, false),
        separator: String(choice.separator ?? ", "),
        randomPick: booleanField(choice.randomPick, false),
        displayMode: String(choice.displayMode ?? "auto"),
        optionSort: String(choice.optionSort ?? "manual"),
        sortOrder: numberField(choice.sortOrder, 0),
      }))
      .sort((a, b) => a.key.localeCompare(b.key)),
  };
}

export function computeBundledPresetSnapshotHash(envelope: BundledPresetEnvelope): string {
  const bundled = envelope.data;
  return contentHash(
    buildPresetSnapshot({
      preset: bundled.preset,
      groups: bundled.groups ?? [],
      sections: bundled.sections ?? [],
      choiceBlocks: bundled.choiceBlocks ?? [],
    }),
  );
}

export async function computePresetSnapshotHash(
  storage: ReturnType<typeof createPromptsStorage>,
  presetId: string,
): Promise<string | null> {
  const preset = await storage.getById(presetId);
  if (!preset) return null;
  const groups = await storage.listGroups(presetId);
  const sections = await storage.listSections(presetId);
  const choiceBlocksForPreset = await storage.listChoiceBlocksForPreset(presetId);
  return contentHash(
    buildPresetSnapshot({
      preset,
      groups,
      sections,
      choiceBlocks: choiceBlocksForPreset,
    }),
  );
}

async function migrateExistingConversationPromptLead(
  storage: ReturnType<typeof createPromptsStorage>,
  preset: { id: string; conversationPrompt?: unknown },
  bundledPrompt: string,
): Promise<boolean> {
  const currentPrompt = typeof preset.conversationPrompt === "string" ? preset.conversationPrompt : "";
  const migratedPrompt = migrateLegacyDefaultConversationPromptLead(currentPrompt, bundledPrompt);
  if (migratedPrompt === currentPrompt) return false;
  await storage.update(preset.id, { conversationPrompt: migratedPrompt });
  return true;
}

async function applyBundledPresetToExisting(
  db: DB,
  storage: ReturnType<typeof createPromptsStorage>,
  presetId: string,
  envelope: BundledPresetEnvelope,
  def: StockPresetDefinition,
) {
  const bundled = envelope.data;
  const preset = bundled.preset;

  await storage.update(presetId, {
    name: String(preset.name ?? def.name),
    description: String(preset.description ?? def.description),
    conversationPrompt: bundledConversationPrompt(preset),
    gamePrompt: bundledGamePrompt(preset),
    variableGroups: parseJsonField(preset.variableGroups, []),
    variableValues: parseJsonField(preset.variableValues, {}),
    parameters: parseJsonField(preset.parameters, {}),
    wrapFormat: (preset.wrapFormat as "xml" | "markdown" | "none" | undefined) ?? "xml",
    engineMode: normalizePromptPresetEngineMode(preset.engineMode),
    author: String(preset.author ?? def.author),
    defaultChoices: parseJsonField(preset.defaultChoices, {}),
  });

  await db.delete(choiceBlocks).where(eq(choiceBlocks.presetId, presetId));
  await db.delete(promptSections).where(eq(promptSections.presetId, presetId));
  await db.delete(promptGroups).where(eq(promptGroups.presetId, presetId));

  const groupMap = new Map<string, string>();
  for (const group of bundled.groups ?? []) {
    const newGroup = await storage.createGroup({
      presetId,
      name: String(group.name ?? ""),
      parentGroupId: null,
      order: numberField(group.order, 100),
      enabled: group.enabled === true || group.enabled === "true",
    });
    if (newGroup) groupMap.set(String(group.id), newGroup.id);
  }

  for (const group of bundled.groups ?? []) {
    if (!group.parentGroupId || !groupMap.has(String(group.parentGroupId))) continue;
    const newGroupId = groupMap.get(String(group.id));
    if (!newGroupId) continue;
    await storage.updateGroup(newGroupId, {
      parentGroupId: groupMap.get(String(group.parentGroupId))!,
    });
  }

  const sectionMap = new Map<string, string>();
  for (const section of bundled.sections ?? []) {
    const newSection = await storage.createSection({
      presetId,
      identifier: String(section.identifier ?? ""),
      name: String(section.name ?? ""),
      content: String(section.content ?? ""),
      role: (section.role as "system" | "user" | "assistant" | undefined) ?? "system",
      enabled: section.enabled === true || section.enabled === "true",
      isMarker: section.isMarker === true || section.isMarker === "true",
      groupId: section.groupId ? (groupMap.get(String(section.groupId)) ?? null) : null,
      markerConfig: section.markerConfig ? parseJsonField(section.markerConfig, null) : null,
      injectionPosition: (section.injectionPosition as "ordered" | "depth" | undefined) ?? "ordered",
      injectionDepth: numberField(section.injectionDepth, 0),
      injectionOrder: numberField(section.injectionOrder, 100),
      forbidOverrides: section.forbidOverrides === true || section.forbidOverrides === "true",
      skipWrap: section.skipWrap === true || section.skipWrap === "true",
    });
    if (newSection) sectionMap.set(String(section.id), newSection.id);
  }

  for (const choice of bundled.choiceBlocks ?? []) {
    await storage.createChoiceBlock({
      presetId,
      variableName: String(choice.variableName ?? ""),
      question: String(choice.question ?? ""),
      options: parseJsonField(choice.options, []),
      multiSelect: choice.multiSelect === true || choice.multiSelect === "true",
      separator: String(choice.separator ?? ", "),
      randomPick: choice.randomPick === true || choice.randomPick === "true",
      displayMode: choice.displayMode === "buttons" || choice.displayMode === "listbox" ? choice.displayMode : "auto",
      optionSort: choice.optionSort === "alphabetical" ? "alphabetical" : "manual",
    });
  }

  await storage.update(presetId, {
    sectionOrder: parseJsonField<string[]>(preset.sectionOrder, [])
      .map((sectionId) => sectionMap.get(sectionId))
      .filter((sectionId): sectionId is string => Boolean(sectionId)),
    groupOrder: parseJsonField<string[]>(preset.groupOrder, [])
      .map((groupId) => groupMap.get(groupId))
      .filter((groupId): groupId is string => Boolean(groupId)),
  });
}

// ─────────────────────────────────────────────
//  Main seed functions
// ─────────────────────────────────────────────

/** Seed Marinara's Universal Preset. Runs before every other stock preset so a fresh profile stars it. */
export function seedDefaultPreset(db: DB) {
  return seedStockPreset(db, MARINARA_UNIVERSAL_STOCK_PRESET);
}

/** Seed the Megumin Suite preset. It is never made the default. */
export function seedMeguminSuitePreset(db: DB) {
  return seedStockPreset(db, MEGUMIN_SUITE_STOCK_PRESET);
}

export async function seedStockPreset(db: DB, def: StockPresetDefinition) {
  const storage = createPromptsStorage(db);
  const appSettings = createAppSettingsStorage(db);
  const bundled = readBundledPreset(def.file);

  const existing = await storage.list();
  const appliedHash = await appSettings.get(def.hashKey);
  const appliedSnapshotHash = await appSettings.get(def.snapshotKey);
  const bundledSnapshotHash = computeBundledPresetSnapshotHash(bundled.envelope);
  let stockPreset = existing.find((preset) => preset.systemKey === def.systemKey);

  // One-time migration for presets seeded before the reserved system key
  // existed. Match immutable seed evidence rather than editable name/author
  // alone so a user preset cannot accidentally become protected stock.
  if (!stockPreset && def.legacyNames) {
    const claimableNames = [def.name, ...def.legacyNames];
    const legacyCandidates = existing.filter(
      (preset) => claimableNames.includes(preset.name) && preset.author === def.author,
    );
    for (const candidate of legacyCandidates) {
      const candidateSnapshotHash = await computePresetSnapshotHash(storage, candidate.id);
      const matchesKnownSnapshot =
        candidateSnapshotHash === bundledSnapshotHash ||
        (appliedSnapshotHash !== null && candidateSnapshotHash === appliedSnapshotHash);
      if (!matchesKnownSnapshot) continue;
      const taggedPreset = await storage.setSystemKey(candidate.id, def.systemKey);
      if (taggedPreset) stockPreset = taggedPreset;
      break;
    }
  }

  // Normalize the old display name before any reconciliation branch can
  // return, including profiles without a prior snapshot marker.
  if (stockPreset && def.legacyNames?.includes(stockPreset.name)) {
    const renamedPreset = await storage.update(stockPreset.id, {
      name: def.name,
      description: String(bundled.envelope.data.preset.description ?? def.description),
    });
    if (renamedPreset) stockPreset = renamedPreset;
  }

  const bundledConversationPromptValue = bundledConversationPrompt(bundled.envelope.data.preset);
  const migrateConversationPromptLead = (preset: { id: string; conversationPrompt?: unknown }) =>
    def.migrateConversationPromptLead
      ? migrateExistingConversationPromptLead(storage, preset, bundledConversationPromptValue)
      : Promise.resolve(false);

  if (stockPreset && appliedSnapshotHash) {
    const currentSnapshotHash = await computePresetSnapshotHash(storage, stockPreset.id);
    if (currentSnapshotHash && currentSnapshotHash !== appliedSnapshotHash) {
      const wasDefault = stockPreset.isDefault === "true";
      const preserved = await storage.duplicate(stockPreset.id);
      await applyBundledPresetToExisting(db, storage, stockPreset.id, bundled.envelope, def);
      if (wasDefault) await storage.setDefault(stockPreset.id);
      await appSettings.set(def.hashKey, bundled.hash);
      const nextSnapshotHash = await computePresetSnapshotHash(storage, stockPreset.id);
      if (nextSnapshotHash) await appSettings.set(def.snapshotKey, nextSnapshotHash);
      logger.info(
        "[seed] Restored the stock %s and preserved customization as %s",
        def.label,
        preserved?.name ?? "an editable copy",
      );
      return;
    }
  }

  if (stockPreset && appliedHash !== bundled.hash) {
    if (!appliedSnapshotHash) {
      const migratedConversationPrompt = await migrateConversationPromptLead(stockPreset);
      await appSettings.set(def.hashKey, bundled.hash);
      await appSettings.set(def.snapshotKey, bundledSnapshotHash);
      logger.info(
        "[seed] Preserved existing %s without prior snapshot while recording bundled hash %s",
        def.label,
        bundled.hash.slice(0, 12),
      );
      if (migratedConversationPrompt) {
        logger.info("[seed] Updated the legacy Marinara Conversation prompt lead sentence");
      }
      return;
    }

    const wasDefault = stockPreset.isDefault === "true";
    await applyBundledPresetToExisting(db, storage, stockPreset.id, bundled.envelope, def);
    if (wasDefault) await storage.setDefault(stockPreset.id);
    await appSettings.set(def.hashKey, bundled.hash);
    const nextSnapshotHash = await computePresetSnapshotHash(storage, stockPreset.id);
    if (nextSnapshotHash) await appSettings.set(def.snapshotKey, nextSnapshotHash);
    logger.info("[seed] Updated bundled %s to %s", def.label, bundled.hash.slice(0, 12));
    return;
  }

  if (stockPreset && (await migrateConversationPromptLead(stockPreset))) {
    logger.info("[seed] Updated the legacy Marinara Conversation prompt lead sentence");
  }

  if (stockPreset && !appliedSnapshotHash) {
    await appSettings.set(def.snapshotKey, bundledSnapshotHash);
  }

  if (stockPreset) return;

  // Import using the standard importer
  const result = await importMarinara(bundled.envelope, db);
  if (!result.success || result.type !== "marinara_preset") {
    logger.error("[seed] Failed to import the bundled %s: %j", def.label, result);
    return;
  }

  // The first preset becomes the default. If the stock preset is being
  // recovered after deletion, preserve the user's current default.
  const presetId = (result as { id: string }).id;
  if (def.makeDefaultOnFresh && existing.length === 0) await storage.setDefault(presetId);
  await storage.setSystemKey(presetId, def.systemKey);
  await storage.update(presetId, {
    conversationPrompt: bundledConversationPrompt(bundled.envelope.data.preset),
    gamePrompt: bundledGamePrompt(bundled.envelope.data.preset),
    defaultChoices: parseJsonField(bundled.envelope.data.preset.defaultChoices, {}),
    // The importer drops parameters (an imported file never carries them); stock rows keep the bundled ones.
    parameters: parseJsonField(bundled.envelope.data.preset.parameters, {}),
  });
  await appSettings.set(def.hashKey, bundled.hash);
  const seededSnapshotHash = await computePresetSnapshotHash(storage, presetId);
  if (seededSnapshotHash) await appSettings.set(def.snapshotKey, seededSnapshotHash);
}
