import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Megumin's generation pipeline inside the real app: a bundled preset update
// leaves an edited preset alone, the preset swap covers impersonation and the
// parameter preview, a copy of a Megumin preset is filled, every saved reply is
// read (by its own place in the chat, and after a later failure), deleting the
// other swipes keeps the journal on the kept telling, and the peek preview drops
// what Memory archived.
const dataDir = mkdtempSync(join(tmpdir(), "yunyun-megumin-pipeline-"));
process.env.DATA_DIR = dataDir;
process.env.FILE_STORAGE_DIR = join(dataDir, "storage");
process.env.NODE_ENV = "test";
process.env.MARINARA_LITE = "true";
process.env.LOG_LEVEL = process.env.MEGUMIN_TEST_LOG || "silent";
process.env.DISABLE_REQUEST_LOGGING = "true";
process.env.AUTO_CREATE_DEFAULT_CONNECTION = "false";

type Response = { statusCode: number; body: string; json(): any };
type TestApp = {
  ready(): Promise<void>;
  close(): Promise<void>;
  inject(options: Record<string, unknown>): Promise<Response>;
};

const { buildApp } = await import("../../packages/server/src/app.js");
const { getDB } = await import("../../packages/server/src/db/connection.js");
const { createPromptsStorage } = await import("../../packages/server/src/services/storage/prompts.storage.js");
const { createAppSettingsStorage } = await import("../../packages/server/src/services/storage/app-settings.storage.js");
const { resetFeatureSettingsForTests } =
  await import("../../packages/server/src/services/features/feature-settings.js");
const { resolveMeguminPresetSwap, seedMeguminPresets } =
  await import("../../packages/server/src/services/megumin/megumin-presets.js");
const { prepareMeguminTurn } = await import("../../packages/server/src/services/megumin/megumin-generation.js");
const { isStockMarinaraUniversalPreset } = await import("../../packages/shared/src/index.js");

const app = (await buildApp()) as unknown as TestApp;
await app.ready();

const until = async (test: () => Promise<boolean>, what: string, ms = 8000) => {
  const started = Date.now();
  while (!(await test())) {
    if (Date.now() - started > ms) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 50));
  }
};

try {
  const db = await getDB();
  const presets = createPromptsStorage(db);
  const appSettings = createAppSettingsStorage(db);
  const ok = async (options: Record<string, unknown>) => {
    const res = await app.inject(options);
    assert.equal(res.statusCode, 200, `${options.method} ${options.url}: ${res.body}`);
    return res.json();
  };
  const all = (await presets.list()) as Array<Record<string, any>>;
  const bySystemKey = (key: string) => all.find((p) => p.systemKey === key)!;
  const v11 = bySystemKey("megumin-suite-v11-universal");
  const cacheFriendly = bySystemKey("megumin-suite-v10-cache-friendly");
  const backwards = bySystemKey("megumin-suite-v10-backwards-compatibility");
  const stock = all.find((p) => isStockMarinaraUniversalPreset(p))!;
  assert.ok(v11 && cacheFriendly && backwards && stock);

  // ── A bundled update leaves a preset the person edited alone, whatever they changed ──
  const sectionIds = async (id: string) => (await presets.listSections(id)).map((s: any) => s.id as string).sort();
  await presets.update(v11.id, { parameters: { temperature: 0.42 } } as never);
  const reversed = [...(JSON.parse(backwards.sectionOrder) as string[])].reverse();
  await presets.reorderSections(backwards.id, reversed);
  const v11Ids = await sectionIds(v11.id);
  const untouchedIds = await sectionIds(cacheFriendly.id);
  for (const p of [v11, cacheFriendly, backwards]) await appSettings.set(`seed:${p.systemKey}:sha256`, "older bundle");
  await seedMeguminPresets(db);
  assert.equal(
    JSON.parse(String((await presets.getById(v11.id))!.parameters)).temperature,
    0.42,
    "edited parameters survive a bundled update",
  );
  assert.deepEqual(await sectionIds(v11.id), v11Ids, "an edited preset's sections are not rewritten");
  assert.deepEqual(
    JSON.parse(String((await presets.getById(backwards.id))!.sectionOrder)),
    reversed,
    "a reordered preset keeps its order",
  );
  assert.notDeepEqual(await sectionIds(cacheFriendly.id), untouchedIds, "an unedited preset takes the update");

  // ── Impersonation: on, the stock preset stays; off, a Megumin preset is never used ──
  assert.equal(
    await resolveMeguminPresetSwap(db, { chatMode: "roleplay", resolved: stock, impersonate: true }),
    null,
    "on: an impersonation keeps the stock preset",
  );
  resetFeatureSettingsForTests({ megumin: false });
  assert.equal(
    (await resolveMeguminPresetSwap(db, { chatMode: "roleplay", resolved: v11, impersonate: true }))?.id,
    stock.id,
    "off: an impersonation on a Megumin preset runs on the stock one",
  );
  resetFeatureSettingsForTests();

  // ── The parameter preview shows the preset the generation will send ──
  const connection = await ok({
    method: "POST",
    url: "/api/connections",
    payload: { name: "Fixture", provider: "custom", baseUrl: "http://127.0.0.1:9/v1", apiKey: "", model: "fixture" },
  });
  const newChat = async (name: string, promptPresetId: string) =>
    ok({ method: "POST", url: "/api/chats", payload: { name, mode: "roleplay", characterIds: [], promptPresetId } });
  const temperatureOf = (preset: Record<string, any> | null) => JSON.parse(String(preset!.parameters)).temperature;
  const previewTemperature = async (chatId: string) =>
    (
      await ok({
        method: "POST",
        url: "/api/generate/parameters",
        payload: { connectionId: connection.id, chatId },
      })
    ).parameters.temperature.value;
  const onStock = await newChat("On stock", stock.id);
  const onMegumin = await newChat("On Megumin", v11.id);
  const v11Temperature = temperatureOf(await presets.getById(v11.id));
  assert.equal(await previewTemperature(onStock.id), v11Temperature, "on: the stock preset previews as Megumin's");
  resetFeatureSettingsForTests({ megumin: false });
  const stockTemperature = await previewTemperature(onStock.id);
  assert.notEqual(stockTemperature, v11Temperature);
  assert.equal(await previewTemperature(onMegumin.id), stockTemperature, "off: a Megumin preset previews as stock");
  resetFeatureSettingsForTests();

  // ── A copy of a Megumin preset (duplicated or imported, no reserved key) is filled too ──
  const copy = await ok({ method: "POST", url: `/api/prompts/${v11.id}/duplicate` });
  const copyTurn = await prepareMeguminTurn(db, {
    chatId: onStock.id,
    chatMode: "roleplay",
    preset: copy,
    dryRun: true,
  });
  assert.ok(copyTurn, "a copy that carries Megumin's slots is Megumin's");
  const copyPrompt = (await presets.listSections(copy.id))
    .filter((s: any) => s.enabled === "true" && s.isMarker !== "true" && s.content)
    .map((s: any) => ({ role: s.role, content: s.content as string }));
  const copyText = (await copyTurn!.apply(copyPrompt)).map((m) => m.content).join("\n");
  assert.ok(!/\[\[[^\]\n]+\]\]/.test(copyText), "no slot of the copy reaches the model");
  const own = await presets.create({ name: "Mine" } as never);
  assert.equal(
    await prepareMeguminTurn(db, { chatId: onStock.id, chatMode: "roleplay", preset: own as never, dryRun: true }),
    null,
    "a person's own preset without slots stays theirs",
  );

  const say = (chatId: string, role: string, content: string) =>
    ok({ method: "POST", url: `/api/chats/${chatId}/messages`, payload: { role, content } });
  const view = (chatId: string) => ok({ method: "GET", url: `/api/megumin/chats/${chatId}/view` });
  const world = (loc: string) =>
    `They look around.\n<Blocks>\n<World_State>\nTime: Morning | Loc: ${loc} | Wx: sunny\n</World_State>\n</Blocks>`;
  const setProfile = (chatId: string, changes: Record<string, unknown>) =>
    ok({
      method: "PUT",
      url: `/api/megumin/chats/${chatId}/profile`,
      payload: {
        patch: Object.entries(changes).map(([path, value]) => ({ op: "set", path: path.split("."), value })),
      },
    });

  // ── A reply saved before the generation failed is still read ──
  const failed = await newChat("Failed", stock.id);
  // The World State block on (every chat here shares the default profile).
  await setProfile(failed.id, { "blockStack.order": ["world"], blocks: ["info"] });
  await say(failed.id, "user", "I walk over.");
  const kept = await say(failed.id, "assistant", world("Axel fountain"));
  const failedTurn = await prepareMeguminTurn(db, { chatId: failed.id, chatMode: "roleplay", preset: v11 });
  failedTurn!.noteSavedReply(kept.id);
  failedTurn!.finish(); // the route's `finally`, after a later character's error
  await until(
    async () => (await view(failed.id)).world.state.scene.location === "Axel fountain",
    "the saved reply's World State",
  );

  // ── A group turn: each reply is read as the newest message it was ──
  const group = await newChat("Group", stock.id);
  await setProfile(group.id, { "npcBank.enabled": true });
  await say(group.id, "user", "We enter the guild.");
  const first = await say(
    group.id,
    "assistant",
    'Luna waves.\n<New_NPC name="Wiz">**Name:** Wiz | **Role:** shopkeeper</New_NPC>',
  );
  const second = await say(group.id, "assistant", "Aqua nods.");
  const groupTurn = await prepareMeguminTurn(db, { chatId: group.id, chatMode: "roleplay", preset: v11 });
  groupTurn!.noteSavedReply(first.id);
  groupTurn!.noteSavedReply(second.id);
  groupTurn!.finish();
  await until(
    async () => ((await view(group.id)).profile.npcBank?.npcs ?? []).some((n: any) => n.name === "Wiz"),
    "the first member's NPC to be banked",
  );
  const wiz = (await view(group.id)).profile.npcBank.npcs.find((n: any) => n.name === "Wiz");
  assert.equal(wiz.messageIndex, 1, "the NPC is filed under the reply that introduced it");

  // ── Deleting the other swipes keeps the World State on the kept telling ──
  const swiped = await newChat("Swipes", stock.id);
  await say(swiped.id, "user", "Where are we?");
  const told = await say(swiped.id, "assistant", world("Hall Zero"));
  const toldTurn = await prepareMeguminTurn(db, { chatId: swiped.id, chatMode: "roleplay", preset: v11 });
  toldTurn!.noteSavedReply(told.id);
  toldTurn!.finish();
  const location = async () => (await view(swiped.id)).world.state.scene.location;
  await until(async () => (await location()) === "Hall Zero", "the first telling");
  for (const [index, loc] of [
    [1, "Hall One"],
    [2, "Hall Two"],
  ] as const) {
    await ok({
      method: "POST",
      url: `/api/chats/${swiped.id}/messages/${told.id}/swipes`,
      payload: { content: world(loc) },
    });
    await ok({
      method: "PUT",
      url: `/api/chats/${swiped.id}/messages/${told.id}/active-swipe`,
      payload: { index },
    });
    await until(async () => (await location()) === loc, `swipe ${index}'s telling`);
  }
  await ok({ method: "DELETE", url: `/api/chats/${swiped.id}/messages/${told.id}/swipes/others/2` });
  await until(async () => (await location()) === "Hall Two", "the kept telling after the others were deleted");
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(await location(), "Hall Two", "a deleted telling never comes back");

  // ── The peek preview leaves out what Memory archived, as the generation does ──
  const peeked = await newChat("Peek", stock.id);
  for (const [role, content] of [
    ["user", "ARCHIVED-ONE"],
    ["assistant", "ARCHIVED-TWO"],
    ["user", "KEPT-THREE"],
    ["assistant", "KEPT-FOUR"],
    ["user", "KEPT-FIVE"],
  ] as const)
    await say(peeked.id, role, content);
  await setProfile(peeked.id, {
    "memoryCore.enabled": true,
    "memoryCore.workingLimit": 2,
    "memoryCore.shortTermChunks": [{ id: "0-1", summary: "They met.", timestamp: Date.now() }],
  });
  const peek = await ok({ method: "POST", url: `/api/chats/${peeked.id}/peek-prompt`, payload: {} });
  assert.equal(peek.source, "live_preview");
  const peekText = (peek.messages as Array<{ content: unknown }>).map((m) => JSON.stringify(m.content)).join("\n");
  assert.ok(peekText.includes("KEPT-THREE"), "the working history is shown");
  assert.ok(!peekText.includes("ARCHIVED-ONE") && !peekText.includes("ARCHIVED-TWO"), "archived turns are not");

  console.log("megumin-pipeline regression passed");
} finally {
  await app.close();
  rmSync(dataDir, { recursive: true, force: true });
}
