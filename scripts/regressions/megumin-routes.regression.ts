import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Megumin Suite inside the real app: its presets are seeded as YunYun presets,
// MEGUMINTOGGLE swaps the stock preset for Megumin V11 Universal (and back), a
// Roleplay turn's slots are filled, a reply's World State lands in the chat's
// metadata through the after-reply work, and the panel's routes read and save.
const dataDir = mkdtempSync(join(tmpdir(), "yunyun-megumin-"));
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
const { createChatsStorage } = await import("../../packages/server/src/services/storage/chats.storage.js");
const { createAppSettingsStorage } = await import("../../packages/server/src/services/storage/app-settings.storage.js");
const { resetFeatureSettingsForTests } =
  await import("../../packages/server/src/services/features/feature-settings.js");
const { resolveMeguminPresetSwap } = await import("../../packages/server/src/services/megumin/megumin-presets.js");
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
  const chats = createChatsStorage(db);
  const ok = async (options: Record<string, unknown>) => {
    const res = await app.inject(options);
    assert.equal(res.statusCode, 200, `${options.method} ${options.url}: ${res.body}`);
    return res.json();
  };

  // ── Seeding: three Megumin presets, slots only, no wrapper tags of YunYun's ──
  const status = await ok({ method: "GET", url: "/api/megumin/status" });
  assert.equal(status.enabled, true, "MEGUMINTOGGLE ships on");
  assert.equal(status.presets.length, 3);
  for (const p of status.presets) assert.ok(p.id, `${p.name} is seeded`);
  const all = (await presets.list()) as Array<Record<string, any>>;
  const v11 = all.find((p) => p.systemKey === "megumin-suite-v11-universal")!;
  const stock = all.find((p) => isStockMarinaraUniversalPreset(p))!;
  assert.ok(v11 && stock);
  assert.equal(v11.wrapFormat, "none", "Megumin's sections carry their own tags");
  const sections = await presets.listSections(v11.id);
  assert.ok(sections.some((s: any) => s.isMarker === "true" && JSON.parse(s.markerConfig).type === "chat_history"));
  assert.ok(
    sections.some((s: any) => s.content.includes("[[this_turn]]")),
    "the turn notes slot is there",
  );
  assert.ok(sections.filter((s: any) => s.isMarker !== "true").every((s: any) => s.skipWrap === "true"));

  // ── MEGUMINTOGGLE's preset swap ──
  assert.equal((await resolveMeguminPresetSwap(db, { chatMode: "roleplay", resolved: stock }))?.id, v11.id);
  assert.equal(await resolveMeguminPresetSwap(db, { chatMode: "roleplay", resolved: v11 }), null, "already Megumin");
  assert.equal(
    await resolveMeguminPresetSwap(db, { chatMode: "roleplay", resolved: null }),
    null,
    "no preset (None) is the person's choice",
  );
  assert.equal(
    await resolveMeguminPresetSwap(db, { chatMode: "conversation", resolved: stock }),
    null,
    "Roleplay only",
  );
  const own = await presets.create({ name: "Mine" } as never);
  assert.equal(
    await resolveMeguminPresetSwap(db, { chatMode: "roleplay", resolved: own as never }),
    null,
    "a person's own preset stays",
  );
  resetFeatureSettingsForTests({ megumin: false });
  assert.equal(
    (await resolveMeguminPresetSwap(db, { chatMode: "roleplay", resolved: v11 }))?.id,
    stock.id,
    "off: back to the stock preset",
  );
  assert.equal(
    await resolveMeguminPresetSwap(db, { chatMode: "roleplay", resolved: stock }),
    null,
    "off: the stock preset as before",
  );
  resetFeatureSettingsForTests();

  // ── A Roleplay chat ──
  const chat = await ok({
    method: "POST",
    url: "/api/chats",
    payload: { name: "Axel", mode: "roleplay", characterIds: [], promptPresetId: stock.id },
  });
  await ok({
    method: "POST",
    url: `/api/chats/${chat.id}/messages`,
    payload: { role: "assistant", content: "Aqua waves." },
  });
  await ok({
    method: "POST",
    url: `/api/chats/${chat.id}/messages`,
    payload: { role: "user", content: "I walk over." },
  });

  // Toggle off: no Megumin turn at all.
  resetFeatureSettingsForTests({ megumin: false });
  assert.equal(
    await prepareMeguminTurn(db, { chatId: chat.id, chatMode: "roleplay", preset: v11, dryRun: true }),
    null,
  );
  resetFeatureSettingsForTests();

  // Toggle on: the preset's slots are filled for the turn.
  const turn = await prepareMeguminTurn(db, { chatId: chat.id, chatMode: "roleplay", preset: v11, dryRun: true });
  assert.ok(turn, "a Roleplay turn on the Megumin preset is Megumin's");
  const assembled = sections
    .filter((s: any) => s.enabled === "true" && s.isMarker !== "true" && s.content)
    .map((s: any) => ({ role: s.role, content: s.content }));
  const filled = await turn!.apply(assembled);
  const text = filled.map((m) => m.content).join("\n");
  assert.ok(!/\[\[[^\]\n]+\]\]/.test(text), "no slot reaches the model");
  assert.ok(text.includes("<role>"), "V11 Тайна's rules are in");
  turn!.finish();

  // ── The panel: the chat's view, a profile save, an action ──
  const view = await ok({ method: "GET", url: `/api/megumin/chats/${chat.id}/view` });
  assert.equal(view.profile.mode, "v11-voice");
  assert.equal(view.enabled, true);
  const patchUrl = (id: string) => `/api/megumin/chats/${id}/profile`;
  const setOps = (changes: Record<string, unknown>) =>
    Object.entries(changes).map(([path, value]) => ({ op: "set", path: path.split("."), value }));
  const saved = await ok({
    method: "PUT",
    url: patchUrl(chat.id),
    payload: { patch: setOps({ userLanguage: "FRENCH", "blockStack.order": ["world"], blocks: ["info"] }) },
  });
  assert.equal(saved.profile.userLanguage, "FRENCH");
  assert.deepEqual(saved.profile.blockStack.order, ["world"]);
  assert.ok(Array.isArray(saved.profile.blockStack.custom), "a nested save keeps the object's other fields");
  for (const bad of [
    { patch: [{ op: "set", path: ["__proto__", "polluted"], value: 1 }] },
    { patch: [{ op: "set", path: [], value: 1 }] },
    { profile: { ...view.profile } },
  ]) {
    const res = await app.inject({ method: "PUT", url: patchUrl(chat.id), payload: bad });
    assert.equal(res.statusCode, 400, `refused: ${JSON.stringify(bad).slice(0, 60)}`);
  }
  assert.equal(({} as Record<string, unknown>).polluted, undefined);

  // A save carries only what the panel changed: what Megumin's own work wrote meanwhile is kept.
  await ok({
    method: "POST",
    url: `/api/megumin/chats/${chat.id}/actions`,
    payload: { action: "npc.add", args: { name: "Darkness" } },
  });
  const afterSave = await ok({
    method: "PUT",
    url: patchUrl(chat.id),
    payload: { patch: setOps({ userPronouns: "she/her" }) },
  });
  assert.ok(
    afterSave.profile.npcBank.npcs.some((n: { name: string }) => n.name === "Darkness"),
    "an NPC banked after the view was read survives a panel save",
  );
  // A list edited on a stale copy is refused instead of dropping what Megumin added to it meanwhile.
  const staleNpcs = view.profile.npcBank?.npcs ?? [];
  const conflict = await app.inject({
    method: "PUT",
    url: patchUrl(chat.id),
    payload: { patch: [{ op: "set", path: ["npcBank", "npcs"], value: [], base: staleNpcs }] },
  });
  assert.equal(conflict.statusCode, 409, "a list changed since the panel read it is a conflict");
  const kept = await ok({ method: "GET", url: `/api/megumin/chats/${chat.id}/view` });
  assert.ok(kept.profile.npcBank.npcs.some((n: { name: string }) => n.name === "Darkness"));
  const current = kept.profile.npcBank.npcs;
  const renamed = current.map((n: { name: string }) => (n.name === "Darkness" ? { ...n, name: "Lalatina" } : n));
  const applied = await ok({
    method: "PUT",
    url: patchUrl(chat.id),
    payload: { patch: [{ op: "set", path: ["npcBank", "npcs"], value: renamed, base: current }] },
  });
  assert.ok(applied.profile.npcBank.npcs.some((n: { name: string }) => n.name === "Lalatina"));

  // Another chat on the same profile sees the change (both chats have no character: the default key).
  const twin = await ok({
    method: "POST",
    url: "/api/chats",
    payload: { name: "Twin", mode: "roleplay", characterIds: [], promptPresetId: stock.id },
  });
  const twinView = await ok({ method: "GET", url: `/api/megumin/chats/${twin.id}/view` });
  assert.equal(twinView.profile.userPronouns, "she/her", "a profile shared by two chats is the same in both");
  await ok({ method: "PUT", url: patchUrl(twin.id), payload: { patch: setOps({ userLanguage: "SPANISH" }) } });
  const backInFirst = await ok({ method: "GET", url: `/api/megumin/chats/${chat.id}/view` });
  assert.equal(backInFirst.profile.userLanguage, "SPANISH", "an idle chat loads the shared profile again");
  const appSettings = createAppSettingsStorage(db);
  await until(async () => String(await appSettings.get("megumin")).includes("SPANISH"), "the store to be written");

  const catalog = await ok({ method: "GET", url: "/api/megumin/catalog" });
  assert.ok(catalog.engines.some((e: any) => e.id === "v11-voice"));
  assert.ok(catalog.storyConfigFields.length > 5);

  // ── A reply's World State, read after the generation, lands in the chat ──
  const reply = await ok({
    method: "POST",
    url: `/api/chats/${chat.id}/messages`,
    payload: {
      role: "assistant",
      content:
        "Aqua grins.\n<Blocks>\n<World_State>\nTime: Morning | Loc: Axel fountain | Wx: sunny\nAqua.Outfit: blue dress\n</World_State>\n</Blocks>",
    },
  });
  const live = await prepareMeguminTurn(db, { chatId: chat.id, chatMode: "roleplay", preset: v11 });
  live!.noteSavedReply(reply.id);
  live!.finish();
  await until(async () => {
    const meta = JSON.parse(String((await chats.getById(chat.id))?.metadata ?? "{}"));
    return Boolean(meta.megumin_state?.journal?.length);
  }, "the World State journal");
  const after = await ok({ method: "GET", url: `/api/megumin/chats/${chat.id}/view` });
  assert.equal(after.world.state.scene.location, "Axel fountain");
  assert.ok(after.cards[reply.id], "the reply has a card");
  const stamped = JSON.parse(String((await chats.getMessage(reply.id))?.extra ?? "{}"));
  assert.ok(stamped.megumin_uid, "the reply is stamped");

  const edit = await ok({
    method: "POST",
    url: `/api/megumin/chats/${chat.id}/actions`,
    payload: { action: "world.edit", args: { changes: [{ type: "scene", field: "weather", value: "rain" }] } },
  });
  assert.equal(edit.ok, true);
  const bad = await app.inject({
    method: "POST",
    url: `/api/megumin/chats/${chat.id}/actions`,
    payload: { action: "nope" },
  });
  assert.equal(bad.statusCode, 400, "an unknown action is refused");

  // ── The panel's other reads and switches ──
  const act = async (action: string, args: Record<string, unknown> = {}) =>
    (await ok({ method: "POST", url: `/api/megumin/chats/${chat.id}/actions`, payload: { action, args } })).result;
  assert.ok(Array.isArray(await act("bonds.overview")));
  assert.equal(await act("world.rewrite", { on: true }), true);
  const queued = await ok({ method: "GET", url: `/api/megumin/chats/${chat.id}/view` });
  assert.equal(queued.world.pendingFullRewrite, true, "the full rewrite shows as queued");
  assert.equal(await act("world.rewrite", { on: false }), false);
  const banList = await act("banlist.builtInList");
  assert.equal(banList.key, "banlistBuiltInV11", "V11 Тайна has its own ban list");
  assert.ok(banList.original.length > 100);
  const scanner = await act("memory.testScanner");
  assert.equal(scanner.engine, "tfidf");
  assert.ok(Array.isArray(scanner.matches));
  assert.equal(await act("prompts.sync", { module: "storyPlan", key: "customPromptsEnabled", value: false }), true);
  const badSync = await app.inject({
    method: "POST",
    url: `/api/megumin/chats/${chat.id}/actions`,
    payload: { action: "prompts.sync", args: { module: "profiles", key: "x", value: 1 } },
  });
  assert.equal(badSync.statusCode, 400, "only the three prompt editors sync");
  assert.ok(typeof queued.memory.realMessages === "number" && queued.notebook.turns);

  // ── The per-tab Global switch: a synced tab is copied into every stored profile ──
  // Save per chat, so this chat's profile is its own and the default is another.
  const before = await ok({ method: "GET", url: "/api/megumin/global/view" });
  await ok({
    method: "PUT",
    url: "/api/megumin/global",
    payload: { globalSettings: { ...before.globalSettings, saveMode: "chat" } },
  });
  const chatProfileView = await ok({ method: "GET", url: `/api/megumin/chats/${chat.id}/view` });
  assert.equal(chatProfileView.profileLevel, "chat");
  // Each chat keeps saving its own profile after another chat loaded a different one.
  const twinPerChat = await ok({ method: "GET", url: `/api/megumin/chats/${twin.id}/view` });
  assert.equal(twinPerChat.profileLevel, "chat");
  await ok({ method: "GET", url: "/api/megumin/global/view" });
  await ok({ method: "PUT", url: patchUrl(chat.id), payload: { patch: setOps({ userLanguage: "GERMAN" }) } });
  await until(async () => {
    const store = JSON.parse(String((await appSettings.get("megumin")) ?? "{}"));
    return store.profiles?.[`chat::${chat.id}`]?.userLanguage === "GERMAN";
  }, "the first chat's own profile to be saved after other chats loaded theirs");
  const synced = await ok({
    method: "POST",
    url: `/api/megumin/chats/${chat.id}/actions`,
    payload: { action: "sync.tab", args: { title: "Language & Add-ons", on: true } },
  });
  assert.equal(synced.result, true);
  await until(async () => {
    const store = JSON.parse(String((await appSettings.get("megumin")) ?? "{}"));
    const profiles = Object.values(store.profiles ?? {}) as Array<{ userLanguage?: string }>;
    return profiles.length > 1 && profiles.every((p) => p.userLanguage === "GERMAN");
  }, "the synced tab in every profile");
  const unsynced = await ok({
    method: "POST",
    url: "/api/megumin/global/actions",
    payload: { action: "sync.tab", args: { title: "Language & Add-ons", on: false } },
  });
  assert.equal(unsynced.result, false);
  const refused = await app.inject({
    method: "POST",
    url: "/api/megumin/global/actions",
    payload: { action: "sync.tab", args: { title: "Settings", on: true } },
  });
  assert.equal(refused.statusCode, 400, "a tab stored globally already has nothing to sync");

  // ── Dev Mode: slots resolved against the profile, the skeleton, a clone of a shipped engine ──
  const dev = await ok({ method: "GET", url: `/api/megumin/chats/${chat.id}/devmode` });
  assert.ok(dev.slots.length > 10 && dev.slots.every((x: any) => typeof x.builtin === "string"));
  assert.ok(
    dev.skeleton.some((c: any) => c.content.includes("[[")),
    "the skeleton keeps its slots",
  );
  const clone = await ok({ method: "GET", url: "/api/megumin/global/devmode/clone/v11-voice" });
  assert.equal(clone.parentId, "v11-voice");
  assert.ok(String(clone.id).startsWith("custom_") && clone.isCoreClone === true);
  const missing = await app.inject({ method: "GET", url: "/api/megumin/global/devmode/clone/nope" });
  assert.equal(missing.statusCode, 404);

  // ── Reset: the global default goes back to Megumin's template ──
  const reset = await ok({ method: "POST", url: "/api/megumin/global/profile/reset" });
  assert.equal(reset.profile.mode, "v11-voice");
  assert.notEqual(reset.profile.userLanguage, "GERMAN");

  console.log("megumin-routes regression passed");
} finally {
  await app.close();
  rmSync(dataDir, { recursive: true, force: true });
}
