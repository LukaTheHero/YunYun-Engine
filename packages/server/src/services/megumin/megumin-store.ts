// ──────────────────────────────────────────────
// Megumin Suite: the suite's own settings store
// ──────────────────────────────────────────────
// SillyTavern keeps everything Megumin saves outside a chat in one object,
// extension_settings["Megumin-Suite"]: the profiles (global default, per
// character, per chat, per group), Chomusuke, the custom engines, the shared
// fragments, the Story Config presets, the side panel. YunYun keeps that object
// in one app setting and holds one live copy in memory, shared by every chat's
// scope exactly as SillyTavern shares its one extension_settings.
import { MEGUMIN_EXTENSION_NAME, MEGUMIN_STORE_KEY } from "@marinara-engine/shared/megumin";
import type { DB } from "../../db/connection.js";
import { logger } from "../../lib/logger.js";
import { createAppSettingsStorage } from "../storage/app-settings.storage.js";
import { isFeatureEnabled } from "../features/feature-settings.js";

/** SillyTavern's extension_settings, holding only Megumin's key. */
const settingsRoot: Record<string, unknown> = {};
let loaded: Promise<void> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let saving: Promise<void> = Promise.resolve();
/** Bumped whenever the store changes, so live chats sharing a profile load it again when idle. */
let revision = 0;

export function meguminStoreRevision(): number {
  return revision;
}

export function bumpMeguminStoreRevision(): void {
  revision += 1;
}

function parseStore(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    logger.warn("[megumin] The stored Megumin settings could not be read; starting from defaults");
    return {};
  }
}

export async function ensureMeguminStore(db: DB): Promise<Record<string, unknown>> {
  loaded ??= (async () => {
    const raw = await createAppSettingsStorage(db).get(MEGUMIN_STORE_KEY);
    settingsRoot[MEGUMIN_EXTENSION_NAME] = parseStore(raw);
  })();
  await loaded;
  return settingsRoot;
}

/** The live extension_settings object every Megumin scope reads. */
export function meguminSettingsRoot(): Record<string, unknown> {
  return settingsRoot;
}

export function meguminStoreObject(): Record<string, any> {
  const store = settingsRoot[MEGUMIN_EXTENSION_NAME];
  if (!store || typeof store !== "object") settingsRoot[MEGUMIN_EXTENSION_NAME] = {};
  return settingsRoot[MEGUMIN_EXTENSION_NAME] as Record<string, any>;
}

/** MEGUMINTOGGLE. On by default; off sends every prompt exactly as YunYun builds it. */
export function isMeguminEnabled(): boolean {
  return isFeatureEnabled("megumin");
}

/** Megumin's power switch reads globalSettings.suiteEnabled; YunYun's feature switch is the one source. */
export function mirrorMeguminPowerSwitch(): void {
  const store = meguminStoreObject();
  // Megumin's own first-run defaults (core/profile.js), set before any profile is loaded: its key for a
  // profile depends on saveMode, so a profile loaded before saveMode exists is keyed differently from
  // every later save of it, and Megumin declines those saves.
  if (!store.globalSettings || typeof store.globalSettings !== "object") {
    store.globalSettings = { promptPreview: false, enableUtilityPrefill: false, saveMode: "character" };
  } else if (!store.globalSettings.saveMode) {
    store.globalSettings.saveMode = "character";
  }
  store.globalSettings.suiteEnabled = isMeguminEnabled();
}

function serializeStore(): string {
  const store = { ...meguminStoreObject() };
  // The power switch is the feature switch's mirror, never a second saved copy.
  if (store.globalSettings && typeof store.globalSettings === "object") {
    const { suiteEnabled: _mirror, ...rest } = store.globalSettings as Record<string, unknown>;
    store.globalSettings = rest;
  }
  return JSON.stringify(store);
}

/** Writes the store back, coalescing bursts (a reply can save the profile several times). */
export function scheduleMeguminStoreSave(db: DB, delayMs = 400): void {
  revision += 1;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const value = serializeStore();
    saving = saving
      .then(() => createAppSettingsStorage(db).set(MEGUMIN_STORE_KEY, value))
      .catch((err) => logger.error(err, "[megumin] Saving the Megumin settings failed"));
  }, delayMs);
}

/** Writes the store now (shutdown, an explicit save from the panel). */
export async function flushMeguminStore(db: DB): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const value = serializeStore();
  saving = saving.then(() => createAppSettingsStorage(db).set(MEGUMIN_STORE_KEY, value));
  await saving;
}

/** Replaces the whole store (the panel's import, or a reset). */
export function replaceMeguminStore(next: Record<string, unknown>): void {
  revision += 1;
  const store = meguminStoreObject();
  for (const key of Object.keys(store)) delete store[key];
  Object.assign(store, next);
}
