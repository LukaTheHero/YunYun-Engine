import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { seedDefaultPreset, seedMeguminSuitePreset } from "../../packages/server/src/db/seed.js";
import { createFileNativeDB } from "../../packages/server/src/db/file-backed-store.js";
import { createAppSettingsStorage } from "../../packages/server/src/services/storage/app-settings.storage.js";
import { createPromptsStorage } from "../../packages/server/src/services/storage/prompts.storage.js";
import {
  MARINARA_UNIVERSAL_PRESET_SYSTEM_KEY,
  MEGUMIN_SUITE_PRESET_SYSTEM_KEY,
  STOCK_PRESET_SYSTEM_KEYS,
  isStockMarinaraUniversalPreset,
  isStockMeguminPreset,
  isStockPreset,
} from "../../packages/shared/src/types/prompt.js";

// ── isStockPreset covers every reserved key, and nothing else ──
assert.deepEqual([...STOCK_PRESET_SYSTEM_KEYS].sort(), [
  MARINARA_UNIVERSAL_PRESET_SYSTEM_KEY,
  MEGUMIN_SUITE_PRESET_SYSTEM_KEY,
]);
for (const systemKey of STOCK_PRESET_SYSTEM_KEYS) {
  assert.equal(isStockPreset({ systemKey }), true, `${systemKey} is a stock preset`);
}
for (const systemKey of ["", "megumin", "claimed", null, undefined, 1]) {
  assert.equal(isStockPreset({ systemKey }), false, `${String(systemKey)} is not a stock preset`);
}
assert.equal(isStockMeguminPreset({ systemKey: MEGUMIN_SUITE_PRESET_SYSTEM_KEY }), true);
assert.equal(isStockMeguminPreset({ systemKey: MARINARA_UNIVERSAL_PRESET_SYSTEM_KEY }), false);
assert.equal(isStockMarinaraUniversalPreset({ systemKey: MEGUMIN_SUITE_PRESET_SYSTEM_KEY }), false);

const dir = mkdtempSync(join(tmpdir(), "marinara-stock-preset-"));
process.env.FILE_STORAGE_DIR = dir;
process.env.DATA_DIR = dir;
const db = await createFileNativeDB();

try {
  const storage = createPromptsStorage(db);
  const appSettings = createAppSettingsStorage(db);
  await seedDefaultPreset(db);
  await seedMeguminSuitePreset(db);
  const original = (await storage.list()).find(isStockMarinaraUniversalPreset);
  assert.ok(original, "a fresh profile receives the stock Marinara universal preset");
  const megumin = (await storage.list()).find(isStockMeguminPreset);
  assert.ok(megumin, "a fresh profile receives the stock Megumin Suite preset");
  assert.equal(original.isDefault, "true", "the Universal preset is the fresh default");
  assert.equal(megumin.isDefault, "false", "the Megumin Suite preset is never the fresh default");

  // ── profile import keeps each local stock row and demotes foreign rows claiming either key ──
  const { normalizeProfilePromptPresetRow } = await import("../../packages/server/src/routes/backup.routes.js");
  const localStock = new Map([
    [MARINARA_UNIVERSAL_PRESET_SYSTEM_KEY, original.id],
    [MEGUMIN_SUITE_PRESET_SYSTEM_KEY, megumin.id],
  ]);
  assert.equal(
    normalizeProfilePromptPresetRow({ id: megumin.id, systemKey: "" }, localStock).systemKey,
    MEGUMIN_SUITE_PRESET_SYSTEM_KEY,
    "the local Megumin Suite row keeps its identity",
  );
  assert.equal(
    normalizeProfilePromptPresetRow({ id: original.id, systemKey: MEGUMIN_SUITE_PRESET_SYSTEM_KEY }, localStock)
      .systemKey,
    MARINARA_UNIVERSAL_PRESET_SYSTEM_KEY,
    "an import cannot swap the identity of a local stock row",
  );
  for (const systemKey of STOCK_PRESET_SYSTEM_KEYS) {
    assert.equal(
      normalizeProfilePromptPresetRow({ id: "foreign-stock", systemKey }, localStock).systemKey,
      "",
      `a foreign ${systemKey} row imports as an editable copy`,
    );
    assert.equal(
      normalizeProfilePromptPresetRow(
        { id: "foreign-stock", systemKey },
        new Map([...localStock].filter(([key]) => key !== systemKey)),
      ).systemKey,
      systemKey,
      `a foreign ${systemKey} row stays stock when this profile has none`,
    );
  }

  await storage.setSystemKey(original.id, "");
  await seedDefaultPreset(db);
  assert.equal(
    (await storage.list()).find(isStockMarinaraUniversalPreset)?.id,
    original.id,
    "snapshot evidence migrates a genuine legacy stock preset to the reserved identity",
  );

  await storage.update(original.id, { name: "Default" });
  await appSettings.remove("seed:marinara-universal-preset:snapshot-sha256");
  await appSettings.set("seed:marinara-universal-preset:sha256", "outdated-seed-hash");
  await seedDefaultPreset(db);
  assert.equal(
    (await storage.getById(original.id))?.name,
    "Marinara's Universal Preset",
    "legacy display names are normalized before no-snapshot reconciliation returns",
  );

  const originalDescription = original.description;
  await storage.update(original.id, { description: "My customized universal preset" });
  await seedDefaultPreset(db);

  const afterCustomization = await storage.list();
  const restored = afterCustomization.find(isStockMarinaraUniversalPreset);
  const editableCopy = afterCustomization.find((preset) => preset.name === "Marinara's Universal Preset (Copy)");
  assert.equal(restored?.description, originalDescription, "startup restores the bundled stock preset contents");
  assert.equal(
    editableCopy?.description,
    "My customized universal preset",
    "startup preserves attempted stock edits in an editable copy",
  );
  assert.equal(editableCopy?.systemKey, "", "editable copies do not inherit the reserved stock identity");

  assert.ok(restored && editableCopy, "both the restored stock preset and editable copy exist");
  const matchingUserPreset = await storage.create(
    {
      name: "Marinara's Universal Preset",
      author: "YunYun",
      description: "User-owned matching preset",
    },
    { createdAt: "2026-03-04T14:46:18.499Z", updatedAt: "2026-03-04T14:46:18.499Z" },
  );
  assert.ok(matchingUserPreset, "the matching-name user preset fixture is created");
  await storage.setDefault(editableCopy.id);
  await storage.remove(restored.id);
  await seedDefaultPreset(db);

  const afterDeletion = await storage.list();
  assert.equal(
    afterDeletion.filter(isStockMarinaraUniversalPreset).length,
    1,
    "startup recovers a deleted stock preset",
  );
  assert.equal(
    afterDeletion.find((preset) => preset.id === matchingUserPreset.id)?.systemKey,
    "",
    "a user preset with matching editable fields is never claimed as stock",
  );
  assert.equal(
    afterDeletion.find((preset) => preset.id === editableCopy.id)?.isDefault,
    "true",
    "recovering the stock preset preserves the user's chosen default",
  );
} finally {
  await db._fileStore.close();
  rmSync(dir, { recursive: true, force: true });
}

console.info("Stock preset protection regression checks passed.");
