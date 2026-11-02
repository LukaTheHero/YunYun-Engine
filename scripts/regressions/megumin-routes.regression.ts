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
  turn!.finish(false);

  // ── The panel: the chat's view, a profile save, an action ──
  const view = await ok({ method: "GET", url: `/api/megumin/chats/${chat.id}/view` });
  assert.equal(view.profile.mode, "v11-voice");
  assert.equal(view.enabled, true);
  const profile = {
    ...view.profile,
    userLanguage: "FRENCH",
    blockStack: { ...view.profile.blockStack, order: ["world"] },
    blocks: ["info"],
  };
  const saved = await ok({ method: "PUT", url: `/api/megumin/chats/${chat.id}/profile`, payload: { profile } });
  assert.equal(saved.profile.userLanguage, "FRENCH");
  const appSettings = createAppSettingsStorage(db);
  await until(async () => String(await appSettings.get("megumin")).includes("FRENCH"), "the store to be written");

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
  live!.finish(true);
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

  console.log("megumin-routes regression passed");
} finally {
  await app.close();
  rmSync(dataDir, { recursive: true, force: true });
}
