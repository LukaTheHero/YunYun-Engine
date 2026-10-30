// Megumin Mode, client side: the open chat's Megumin state matches the server's preset selection,
// every Megumin string has English copy, the dice add-ons stay exclusive, and the Megumin Suite
// editor behaves like the other main-area editors in the UI store.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  MARINARA_UNIVERSAL_PRESET_SYSTEM_KEY,
  MEGUMIN_ADDON_CATALOG,
  MEGUMIN_COT_FRAMEWORKS,
  MEGUMIN_COT_LANGUAGES,
  MEGUMIN_DIRECT_STYLE_CATALOG,
  MEGUMIN_ENGINE_CATALOG,
  MEGUMIN_PERSONALITY_CATALOG,
  MEGUMIN_STYLE_TAG_CATEGORIES,
  MEGUMIN_STYLE_TEMPLATE_CATALOG,
  MEGUMIN_SUITE_PRESET_SYSTEM_KEY,
  MEGUMIN_THINK_EFFORTS,
  MEGUMIN_TOGGLE_CATALOG,
  MEGUMIN_V7_MODULE_TOGGLES,
  STORY_CONFIG_BUILTIN_PRESETS,
  STORY_CONFIG_FIELDS,
} from "../../packages/shared/src/index.js";
import { resolveMeguminModeState } from "../../packages/client/src/features/megumin/megumin-mode-state.js";
import { toggleMeguminAddon } from "../../packages/client/src/features/megumin/megumin-addons.js";
import * as keys from "../../packages/client/src/features/megumin/megumin-keys.js";
import { UI_PERSISTENCE } from "../../packages/client/src/lib/ui-persistence.js";

const root = join(import.meta.dirname, "../..");
// The server helper warns for every missing candidate; the cases below miss on purpose.
process.env.LOG_LEVEL = "error";
const { buildGenerationPromptPresetCandidates, resolveGenerationPromptPreset } =
  await import("../../packages/server/src/routes/generate/prompt-preset-selection.js");

// ── 1. Client mode state = server preset selection ─────────────────────────
type Preset = { id: string; name: string; engineMode: string; systemKey: string; isDefault: string };
const preset = (id: string, engineMode = "", systemKey = "", isDefault = "false"): Preset => ({
  id,
  name: id,
  engineMode,
  systemKey,
  isDefault,
});
const universal = preset("universal", "", MARINARA_UNIVERSAL_PRESET_SYSTEM_KEY);
const stockMegumin = preset("megumin-stock", "megumin", MEGUMIN_SUITE_PRESET_SYSTEM_KEY);
const meguminCopy = preset("megumin-copy", "megumin");
const plain = preset("plain");
const starredPlain = { ...preset("starred-plain"), isDefault: "true" };
const starredMegumin = { ...meguminCopy, id: "starred-megumin", isDefault: "true" };

const presetLists: Record<string, Preset[]> = {
  "starred plain": [universal, stockMegumin, meguminCopy, plain, starredPlain],
  "starred megumin": [universal, stockMegumin, meguminCopy, plain, starredMegumin],
  "nothing starred": [universal, stockMegumin, meguminCopy, plain],
  "no universal": [stockMegumin, meguminCopy, plain],
};
const ids = [null, "missing", plain.id, stockMegumin.id, meguminCopy.id];

let cases = 0;
for (const enabled of [false, true]) {
  for (const chatMode of ["roleplay", "conversation", "game"]) {
    for (const [listName, presets] of Object.entries(presetLists)) {
      for (const connectionPresetId of ids) {
        for (const chatPresetId of ids) {
          const label = `${enabled ? "on" : "off"} ${chatMode} ${listName} connection=${connectionPresetId} chat=${chatPresetId}`;
          const server = await resolveGenerationPromptPreset({
            candidates: buildGenerationPromptPresetCandidates({
              chatMode,
              chatPromptPresetId: chatPresetId,
              connectionPromptPresetId: connectionPresetId,
            }),
            presetsStorage: {
              getById: async (id) => presets.find((entry) => entry.id === id) ?? null,
              getDefault: async () => presets.find((entry) => entry.isDefault === "true") ?? null,
              list: async () => presets,
            },
            meguminEnabled: enabled,
            chatMode,
            logLabel: "[megumin-client]",
          });
          const client = resolveMeguminModeState({
            enabled,
            chatMode,
            chatPromptPresetId: chatPresetId,
            connectionPromptPresetId: connectionPresetId,
            presets,
          });
          assert.equal(client.usedPreset?.id ?? null, server.presetId, `${label}: the preset used`);
          assert.equal(client.skippedMeguminPresetId, server.skippedMeguminPresetId, `${label}: the skipped preset`);
          assert.equal(client.active, server.isMeguminTurn, `${label}: whether Megumin runs`);
          if (enabled) {
            assert.equal(client.effectivePresetId, server.presetId, `${label}: switched on, effective = used`);
          }
          cases += 1;
        }
      }
    }
  }
}
assert.equal(cases, 2 * 3 * 4 * 25);

{
  const presets = presetLists["starred plain"]!;
  const forced = resolveMeguminModeState({
    enabled: true,
    chatMode: "roleplay",
    chatPromptPresetId: stockMegumin.id,
    connectionPromptPresetId: plain.id,
    presets,
  });
  assert.equal(forced.connectionForcesPreset, true, "a connection preset is reported as forced");
  assert.equal(forced.active, false, "a forced ordinary preset keeps Megumin off for the chat");
  const conversation = resolveMeguminModeState({
    enabled: true,
    chatMode: "conversation",
    chatPromptPresetId: stockMegumin.id,
    connectionPromptPresetId: plain.id,
    presets,
  });
  assert.equal(conversation.connectionForcesPreset, false, "connection presets only apply in Roleplay");
  assert.equal(conversation.active, false, "Megumin never runs in a Conversation chat");
}

// ── 2. Every Megumin string has English copy ─────────────────────────────────
const en = JSON.parse(readFileSync(join(root, "packages/client/src/localization/locales/en.json"), "utf8")) as Record<
  string,
  unknown
>;
const expectKey = (key: string, why: string) =>
  assert.equal(typeof en[key] === "string" && (en[key] as string).length > 0, true, `${why}: missing ${key}`);

assert.equal(keys.meguminKeySegment("v10-core"), "v10Core");
assert.equal(keys.meguminKeySegment("balance Test"), "balanceTest");
assert.equal(keys.meguminKeySegment("dir_v7.5"), "dirV75");
assert.equal(keys.meguminKeySegment("100"), "n100");
assert.equal(keys.meguminKeySegment("250–350 words"), "n250350Words");

for (const engine of MEGUMIN_ENGINE_CATALOG) expectKey(keys.meguminEngineDescriptionKey(engine.id), engine.id);
for (const framework of MEGUMIN_COT_FRAMEWORKS) expectKey(keys.meguminCotDescriptionKey(framework.id), framework.id);
for (const language of MEGUMIN_COT_LANGUAGES) expectKey(keys.meguminCotLanguageKey(language.id), language.id);
for (const effort of MEGUMIN_THINK_EFFORTS) expectKey(keys.meguminThinkEffortKey(effort.id), effort.id);
for (const module of MEGUMIN_V7_MODULE_TOGGLES) {
  expectKey(keys.meguminV7ModuleKey(module.id, "label"), module.id);
  expectKey(keys.meguminV7ModuleKey(module.id, "description"), module.id);
}
for (const personality of MEGUMIN_PERSONALITY_CATALOG) {
  expectKey(keys.meguminPersonalityKey(personality.id, "label"), personality.id);
  expectKey(keys.meguminPersonalityKey(personality.id, "description"), personality.id);
}
for (const toggle of MEGUMIN_TOGGLE_CATALOG) expectKey(keys.meguminToggleKey(toggle.id), toggle.id);
for (const addon of MEGUMIN_ADDON_CATALOG) {
  expectKey(keys.meguminAddonKey(addon.id, "label"), addon.id);
  expectKey(keys.meguminAddonKey(addon.id, "description"), addon.id);
}
for (const style of MEGUMIN_DIRECT_STYLE_CATALOG) {
  expectKey(keys.meguminStyleKey(style.id, "name"), style.id);
  expectKey(keys.meguminStyleKey(style.id, "description"), style.id);
}
for (const template of MEGUMIN_STYLE_TEMPLATE_CATALOG) expectKey(keys.meguminTemplateKey(template.name), template.name);
for (const category of MEGUMIN_STYLE_TAG_CATEGORIES)
  expectKey(keys.meguminTagCategoryKey(category.category), category.category);
for (const field of STORY_CONFIG_FIELDS) {
  for (const part of ["label", "hint", "placeholder"] as const)
    expectKey(keys.meguminStoryFieldKey(field.key, part), field.key);
  if (field.type !== "select") continue;
  if (field.defaultLabel) expectKey(keys.meguminStoryFieldKey(field.key, "defaultLabel"), field.key);
  for (const option of field.options) expectKey(keys.meguminStoryOptionKey(field.key, option.label), option.label);
}
for (const builtin of STORY_CONFIG_BUILTIN_PRESETS) expectKey(keys.meguminStoryPresetKey(builtin.id), builtin.id);

// Keys written as plain strings (tab labels) are not seen by check-locales, so check every literal.
const featureDir = join(root, "packages/client/src/features/megumin");
const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
let literals = 0;
for (const file of sources(featureDir)) {
  for (const match of readFileSync(file, "utf8").matchAll(/"(megumin\.[A-Za-z0-9_.]+)"/g)) {
    expectKey(match[1]!, file);
    literals += 1;
  }
}
assert.ok(literals > 200, "the feature's literal keys were found");

// ── 3. Exclusive add-ons ─────────────────────────────────────────────────────
const dice = MEGUMIN_ADDON_CATALOG.find((addon) => addon.id === "dice")!;
const diceAll = MEGUMIN_ADDON_CATALOG.find((addon) => addon.id === "dice_all")!;
const color = MEGUMIN_ADDON_CATALOG.find((addon) => addon.id === "color")!;
assert.deepEqual(toggleMeguminAddon(["color", "dice"], diceAll), ["color", "dice_all"], "dice_all replaces dice");
assert.deepEqual(toggleMeguminAddon(["dice_all"], dice), ["dice"], "dice replaces dice_all");
assert.deepEqual(toggleMeguminAddon(["dice", "color"], dice), ["color"], "a second click turns it off");
assert.deepEqual(toggleMeguminAddon(["dice"], color), ["dice", "color"], "other add-ons stack");

// ── 4. The editor's navigation state ─────────────────────────────────────────
const stored = new Map<string, string>();
// The store's debounced writes land after the checks, so the stand-in storage stays for the whole run.
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
  },
});
{
  const { useUIStore, pickPersistedUIState, pickSyncedSettings } =
    await import("../../packages/client/src/stores/ui.store.js");
  const ui = () => useUIStore.getState();
  assert.equal(useUIStore.getInitialState().meguminSuiteTab, null, "the editor starts closed");

  ui().openPresetDetail("preset-1");
  ui().openMeguminSuite();
  assert.equal(ui().meguminSuiteTab, "engine", "it opens on Engine & Reasoning");
  assert.equal(ui().presetDetailId, null, "opening it closes the preset editor");
  assert.equal(ui().hasAnyDetailOpen(), true, "back and the sidebar treat it as an open editor");
  ui().setMeguminSuiteTab("style");
  assert.equal(pickPersistedUIState(ui()).meguminSuiteTab, "style", "the open tab survives a reload");
  assert.equal("meguminSuiteTab" in pickSyncedSettings(ui()), false, "navigation is not synced to other devices");

  ui().openCharacterDetail("character-1");
  assert.equal(ui().meguminSuiteTab, null, "opening another editor closes it");
  ui().openMeguminSuite("addons");
  assert.equal(ui().meguminSuiteTab, "addons");
  ui().closeAllDetails();
  assert.equal(ui().meguminSuiteTab, null, "closing all editors closes it");
  ui().openMeguminSuite("narrator");
  ui().closeMeguminSuite();
  assert.equal(ui().meguminSuiteTab, null);

  // The store mirrors every write to a host copy that wins over an older blob, so start each case clean.
  stored.clear();
  stored.set(
    UI_PERSISTENCE.name,
    JSON.stringify({ state: { meguminSuiteTab: "engine" }, version: UI_PERSISTENCE.version }),
  );
  await useUIStore.persist.rehydrate();
  assert.equal(ui().meguminSuiteTab, "engine", "a reload reopens the editor");

  // Migrating an older state with two open surfaces keeps only the first, as for every editor.
  stored.clear();
  stored.set(
    UI_PERSISTENCE.name,
    JSON.stringify({
      state: { presetDetailId: "preset-2", meguminSuiteTab: "engine" },
      version: UI_PERSISTENCE.version - 1,
    }),
  );
  await useUIStore.persist.rehydrate();
  assert.equal(ui().presetDetailId, "preset-2");
  assert.equal(ui().meguminSuiteTab, null, "only one main-area surface is restored");
}

console.info(`megumin client regression passed (${cases} preset-selection cases, ${literals} literal keys)`);
