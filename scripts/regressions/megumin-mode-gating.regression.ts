import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Megumin Mode gating, through the real routes. With the switch off nothing Megumin runs: other
// presets assemble byte-identically on and off, and a chat assigned the Megumin preset falls back
// (starred default, else the stock Universal preset) in Peek Prompt and in generation alike, keeping
// its assignment. Conversation and Game chats are untouched. A connection's preset decides first.
// On a Megumin turn the reply records the turn (dice handed over, engine, reasoning, layout,
// payload) and the reasoning extras apply; on any other turn they do not.

const dir = mkdtempSync(join(tmpdir(), "megumin-mode-gating-"));
process.env.DATA_DIR = dir;
process.env.FILE_STORAGE_DIR = join(dir, "storage");
process.env.NODE_ENV = "test";
process.env.MARINARA_LITE = "true";
process.env.LOG_LEVEL = "silent";

const requireServer = createRequire(new URL("../../packages/server/package.json", import.meta.url));
const Fastify = requireServer("fastify") as typeof import("fastify").default;
const { getDB, closeDB } = await import("../../packages/server/src/db/connection.js");
const { generateRoutes } = await import("../../packages/server/src/routes/generate.routes.js");
const { chatsRoutes } = await import("../../packages/server/src/routes/chats.routes.js");
const { promptsRoutes } = await import("../../packages/server/src/routes/prompts.routes.js");
const { sceneRoutes } = await import("../../packages/server/src/routes/scene.routes.js");
const { seedDefaultPreset, seedMeguminSuitePreset } = await import("../../packages/server/src/db/seed.js");
const { createChatsStorage } = await import("../../packages/server/src/services/storage/chats.storage.js");
const { createCharactersStorage } = await import("../../packages/server/src/services/storage/characters.storage.js");
const { createConnectionsStorage } = await import("../../packages/server/src/services/storage/connections.storage.js");
const { createPromptsStorage } = await import("../../packages/server/src/services/storage/prompts.storage.js");
const { createAppSettingsStorage } = await import("../../packages/server/src/services/storage/app-settings.storage.js");
const { updateMeguminSettings } = await import("../../packages/server/src/services/megumin/settings.js");
const { resolveGenerationPromptPreset } =
  await import("../../packages/server/src/routes/generate/prompt-preset-selection.js");
const { MEGUMIN_ENGINES } = await import("../../packages/server/src/services/megumin/content/engines/index.js");
const {
  FEATURE_SETTINGS_KEY,
  MARINARA_UNIVERSAL_PRESET_SYSTEM_KEY,
  characterDataSchema,
  isStockMarinaraUniversalPreset,
  isStockMeguminPreset,
} = await import("../../packages/shared/src/index.js");

// ── The selection helper on its own ──
type Row = { id: string; engineMode: string; systemKey: string };
const row = (id: string, engineMode = "", systemKey = ""): Row => ({ id, engineMode, systemKey });
const storage = (rows: Row[], starred: string | null) => ({
  getById: async (id: string) => rows.find((r) => r.id === id) ?? null,
  getDefault: async () => rows.find((r) => r.id === starred) ?? null,
  list: async () => rows,
});
const universal = row("u", "", MARINARA_UNIVERSAL_PRESET_SYSTEM_KEY);
const megumin = row("m", "megumin");
const fixture = row("f");
const select = (
  candidates: Array<{ id: string; source: "connection" | "chat" | "request" | "impersonate" }>,
  opts: { on: boolean; mode?: string; rows?: Row[]; starred?: string | null; impersonate?: boolean },
) =>
  resolveGenerationPromptPreset({
    candidates,
    presetsStorage: storage(
      opts.rows ?? [universal, megumin, fixture],
      opts.starred === undefined ? "f" : opts.starred,
    ),
    meguminEnabled: opts.on,
    chatMode: opts.mode ?? "roleplay",
    impersonate: opts.impersonate,
    logLabel: "[test]",
  });
const chatM = { id: "m", source: "chat" as const };
const pick = async (...args: Parameters<typeof select>) => {
  const s = await select(...args);
  return [s.presetId, s.source, s.skippedMeguminPresetId, s.isMeguminTurn];
};
assert.deepEqual(await pick([chatM], { on: true }), ["m", "chat", null, true], "on: a Megumin turn");
assert.deepEqual(await pick([chatM], { on: false }), ["f", "fallback", "m", false], "off: the starred default");
assert.deepEqual(await pick([chatM], { on: false, starred: "m" }), ["u", "fallback", "m", false], "starred is Megumin");
assert.deepEqual(await pick([chatM], { on: false, starred: null }), ["u", "fallback", "m", false], "nothing starred");
assert.deepEqual(
  await pick([chatM], { on: false, starred: null, rows: [megumin, fixture] }),
  [null, null, "m", false],
  "no stock preset left: preset-less, as before",
);
assert.deepEqual(
  await pick(
    [
      { id: "m", source: "connection" },
      { id: "f", source: "chat" },
    ],
    { on: false },
  ),
  ["f", "chat", "m", false],
  "off: a forced Megumin connection preset gives way to the chat's",
);
assert.deepEqual(
  await pick([{ id: "f", source: "connection" }, chatM], { on: true }),
  ["f", "connection", null, false],
  "a connection's preset decides first",
);
assert.deepEqual(
  await pick(
    [
      { id: "m", source: "connection" },
      { id: "f", source: "chat" },
    ],
    { on: true },
  ),
  ["m", "connection", null, true],
  "a Megumin connection preset makes the turn Megumin",
);
for (const mode of ["conversation", "game"]) {
  assert.deepEqual(await pick([chatM], { on: false, mode }), ["m", "chat", null, false], `${mode}, off: untouched`);
  assert.deepEqual(await pick([chatM], { on: true, mode }), ["m", "chat", null, false], `${mode}, on: not a turn`);
}
// An impersonation sends a chat preset's markers only, so no Megumin text goes out; its own
// impersonate preset is sent whole, so a Megumin one is a Megumin turn.
assert.deepEqual(
  await pick([chatM], { on: true, impersonate: true }),
  ["m", "chat", null, false],
  "impersonating on a Megumin chat",
);
assert.deepEqual(
  await pick([{ id: "m", source: "impersonate" }], { on: true, impersonate: true }),
  ["m", "impersonate", null, true],
  "a Megumin impersonate preset",
);
assert.deepEqual(
  await pick([{ id: "f", source: "impersonate" }, chatM], { on: true, impersonate: true }),
  ["f", "impersonate", null, false],
  "a non-Megumin impersonate preset is never a Megumin turn",
);
assert.deepEqual(await pick([], { on: false }), [null, null, null, false], "no preset stays no preset");
assert.deepEqual(
  await pick(
    [
      { id: "gone", source: "request" },
      { id: "u", source: "chat" },
    ],
    { on: false },
  ),
  ["u", "chat", null, false],
  "a missing candidate is passed over as before",
);

// ── Through the routes ──
const requests: Array<{ messages: Array<{ role: string; content: string }> }> = [];
let nextReply = "Rain hits the window.";
const provider = createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  requests.push(JSON.parse(Buffer.concat(chunks).toString()));
  res.setHeader("content-type", "application/json");
  res.end(
    JSON.stringify({
      choices: [{ message: { role: "assistant", content: nextReply }, finish_reason: "stop" }],
      usage: { total_tokens: 20 },
    }),
  );
});

const db = await getDB();
const app = Fastify();
app.decorate("db", db);
app.decorate("activeGenerations", new Map());
await app.register(generateRoutes, { prefix: "/api/generate" });
await app.register(chatsRoutes, { prefix: "/api/chats" });
await app.register(promptsRoutes, { prefix: "/api/prompts" });
await app.register(sceneRoutes, { prefix: "/api/scene" });

try {
  await new Promise<void>((done) => provider.listen(0, "127.0.0.1", done));
  const address = provider.address();
  assert.ok(address && typeof address === "object");
  await seedDefaultPreset(db);
  await seedMeguminSuitePreset(db);
  const settings = createAppSettingsStorage(db);
  const setMegumin = (on: boolean) => settings.set(FEATURE_SETTINGS_KEY, JSON.stringify({ meguminMode: on }));
  const presets = createPromptsStorage(db);
  const all = await presets.list();
  const stockMegumin = all.find(isStockMeguminPreset)!;
  const stockUniversal = all.find(isStockMarinaraUniversalPreset)!;
  assert.ok(stockMegumin && stockUniversal);
  assert.equal((await presets.getDefault())?.id, stockUniversal.id, "Universal is starred on a fresh install");

  // A user preset that happens to use a Megumin macro: only a Megumin preset ever fills one.
  const fixturePreset = await presets.create({ name: "Fixture", parameters: {}, wrapFormat: "xml" });
  assert.ok(fixturePreset);
  await presets.createSection({
    presetId: fixturePreset.id,
    identifier: "lead",
    name: "Lead",
    content: "Fixture lead {{megumin_main}}.",
  });
  await presets.createSection({
    presetId: fixturePreset.id,
    identifier: "history",
    name: "History",
    isMarker: true,
    markerConfig: { type: "chat_history" },
  });

  const connections = createConnectionsStorage(db);
  const connection = async (name: string, promptPresetId: string | null = null) => {
    const created = await connections.create({
      name,
      provider: "custom",
      baseUrl: `http://127.0.0.1:${address.port}/v1`,
      model: "fixture",
      apiKey: "fixture",
      maxContext: 64000,
    } as never);
    assert.ok(created);
    if (promptPresetId) await connections.update(created.id, { promptPresetId } as never);
    return created;
  };
  const plain = await connection("Plain");
  const forcesMegumin = await connection("Forces Megumin", stockMegumin.id);
  const forcesFixture = await connection("Forces Fixture", fixturePreset.id);
  assert.equal((await connections.getById(forcesMegumin.id))?.promptPresetId, stockMegumin.id);

  const character = await createCharactersStorage(db).create(characterDataSchema.parse({ name: "Aqua" }));
  assert.ok(character);
  const chats = createChatsStorage(db);
  const chat = async (
    name: string,
    mode: "roleplay" | "conversation" | "game",
    promptPresetId: string,
    conn = plain,
  ) => {
    const created = await chats.create({
      name,
      mode,
      characterIds: [character.id],
      connectionId: conn.id,
      promptPresetId,
      personaId: null,
      groupId: null,
    });
    assert.ok(created);
    await chats.patchMetadata(created.id, { automaticSummaryEnabled: false, enableAgents: false });
    await chats.createMessage({ chatId: created.id, role: "user", content: "Hello there.", characterId: null });
    return created;
  };
  const universalChat = await chat("Universal", "roleplay", stockUniversal.id);
  // A fallback preset runs on its default choices, as any preset the chat did not pick does.
  await chats.patchMetadata(universalChat.id, { presetChoices: JSON.parse(stockUniversal.defaultChoices || "{}") });
  const meguminChat = await chat("Megumin", "roleplay", stockMegumin.id);
  const viaMeguminConnection = await chat("Via Megumin connection", "roleplay", fixturePreset.id, forcesMegumin);
  const viaFixtureConnection = await chat("Via Fixture connection", "roleplay", stockMegumin.id, forcesFixture);
  const conversation = await chat("Conversation", "conversation", stockMegumin.id);
  const game = await chat("Game", "game", stockMegumin.id);

  const peek = async (chatId: string) => {
    const response = await app.inject({
      method: "POST",
      url: "/api/generate/dryRun",
      payload: { chatId, returnPrompt: true },
    });
    assert.equal(response.statusCode, 200, response.body);
    return response.json().prompt.messages as Array<{ role: string; content: string }>;
  };
  const ukiyoLead = MEGUMIN_ENGINES.find((e) => e.id === "v10-core")!.p1.slice(0, 60);
  const text = (messages: Array<{ content: string }>) => messages.map((m) => m.content).join("\n");
  // Peek Prompt's own route: with no saved prompt yet (the last message is the user's) it assembles live.
  const peekPrompt = async (chatId: string) => {
    const response = await app.inject({ method: "POST", url: `/api/chats/${chatId}/peek-prompt`, payload: {} });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().source, "live_preview", response.body);
    return response.json().messages as Array<{ role: string; content: string }>;
  };
  const presetPreview = async (presetId: string, chatId: string, choices?: Record<string, unknown>) => {
    const response = await app.inject({
      method: "POST",
      url: `/api/prompts/${presetId}/preview`,
      payload: { chatId, ...(choices ? { choices } : {}) },
    });
    assert.equal(response.statusCode, 200, response.body);
    return response.json().messages as Array<{ role: string; content: string }>;
  };
  /** The scene planner's prompt when the reader picks this preset for the scene. */
  const scenePlan = async (chatId: string, promptPresetId: string) => {
    const before = requests.length;
    const response = await app.inject({
      method: "POST",
      url: "/api/scene/plan",
      payload: { chatId, prompt: "A rainy night.", promptPreferences: { promptPresetId } },
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(requests.length, before + 1, response.body);
    return text(requests.at(-1)!.messages);
  };
  const universalDefaults = JSON.parse(stockUniversal.defaultChoices || "{}");

  // ── Off ──
  await setMegumin(false);
  const universalOff = await peek(universalChat.id);
  assert.ok(!text(universalOff).includes("megumin"), "the Universal preset has no Megumin text");
  assert.deepEqual(await peek(meguminChat.id), universalOff, "off: a Megumin chat previews the starred default");
  assert.equal((await chats.getById(meguminChat.id))?.promptPresetId, stockMegumin.id, "its assignment is kept");
  const fixtureOff = text(await peek(viaMeguminConnection.id));
  assert.ok(fixtureOff.includes("Fixture lead {{megumin_main}}."), "the connection's Megumin preset gives way");
  const conversationOff = await peek(conversation.id);
  const gameOff = await peek(game.id);
  await presets.setDefault(stockMegumin.id);
  assert.deepEqual(await peek(meguminChat.id), universalOff, "a starred Megumin preset falls back to Universal");
  await presets.setDefault(stockUniversal.id);
  // Peek Prompt's live preview, the preset preview and the scene planner follow the same rule.
  assert.deepEqual(
    await peekPrompt(meguminChat.id),
    await peekPrompt(universalChat.id),
    "off: Peek Prompt previews the fallback too",
  );
  assert.deepEqual(
    await presetPreview(stockMegumin.id, meguminChat.id),
    await presetPreview(stockUniversal.id, meguminChat.id, universalDefaults),
    "off: the preset preview shows the fallback, on its default choices",
  );
  const sceneOff = await scenePlan(universalChat.id, stockMegumin.id);
  assert.ok(!sceneOff.includes("megumin_") && !sceneOff.includes(ukiyoLead), "off: no Megumin slot reaches a planner");
  assert.ok(!sceneOff.includes("<scene_writing_instructions>"), "the plan goes without the Megumin preset");

  // ── On ──
  await setMegumin(true);
  assert.deepEqual(await peek(universalChat.id), universalOff, "on: other presets are byte-identical");
  const meguminOn = text(await peek(meguminChat.id));
  assert.ok(meguminOn.includes(ukiyoLead), "on: the Megumin preset is filled");
  assert.ok(!meguminOn.includes("{{megumin_"), "every slot is defined");
  assert.ok(text(await peek(viaMeguminConnection.id)).includes(ukiyoLead), "a Megumin connection preset applies");
  const fixtureOn = text(await peek(viaFixtureConnection.id));
  assert.ok(fixtureOn.includes("Fixture lead {{megumin_main}}."), "a connection's own preset decides first");
  assert.ok(!fixtureOn.includes(ukiyoLead));
  assert.deepEqual(await peek(conversation.id), conversationOff, "Conversation is untouched on and off");
  assert.ok(!text(conversationOff).includes(ukiyoLead));
  assert.deepEqual(await peek(game.id), gameOff, "Game is untouched on and off");
  assert.ok(!text(gameOff).includes(ukiyoLead) && !text(gameOff).includes("megumin_"));
  const peekPromptOn = text(await peekPrompt(meguminChat.id));
  assert.ok(peekPromptOn.includes(ukiyoLead) && !peekPromptOn.includes("{{megumin_"), "on: Peek Prompt fills the slots");
  assert.ok(text(await peekPrompt(viaMeguminConnection.id)).includes(ukiyoLead), "and follows the connection's preset");
  const previewOn = text(await presetPreview(stockMegumin.id, meguminChat.id));
  assert.ok(previewOn.includes(ukiyoLead) && !previewOn.includes("{{megumin_"), "on: the preset preview is filled");
  assert.ok(
    !text(await presetPreview(stockMegumin.id, conversation.id)).includes(ukiyoLead),
    "a Conversation chat is never a Megumin turn",
  );
  const sceneOn = await scenePlan(universalChat.id, stockMegumin.id);
  assert.ok(sceneOn.includes(ukiyoLead) && !sceneOn.includes("{{megumin_"), "on: the scene's Megumin preset is filled");

  // ── Generation ──
  const generate = async (chatId: string) => {
    const before = requests.length;
    const response = await app.inject({
      method: "POST",
      url: "/api/generate",
      payload: { chatId, userMessage: "Look outside.", streaming: false },
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(requests.length, before + 1, response.body);
    const saved = (await chats.listMessages(chatId)).filter((m) => m.role === "assistant").at(-1);
    assert.ok(saved, response.body);
    const extra = typeof saved.extra === "string" ? JSON.parse(saved.extra) : saved.extra;
    return { sent: text(requests.at(-1)!.messages), saved, extra };
  };
  const unopened = "plan <font color=red>a red</font> beat.\n</think>\nRain hits the window.";
  nextReply = unopened;

  await setMegumin(false);
  const offTurn = await generate(meguminChat.id);
  assert.ok(!offTurn.sent.includes(ukiyoLead) && !offTurn.sent.includes("megumin_"), "off: the fallback is sent");
  assert.equal(offTurn.extra.meguminTurn, undefined, "off: no turn record");
  assert.ok(offTurn.saved.content.includes("</think>"), "off: no unopened-reasoning lift");

  await setMegumin(true);
  await updateMeguminSettings(db, (s) => ({ ...s, defaultProfile: { addons: ["dice"] } }));
  const onTurn = await generate(meguminChat.id);
  assert.ok(onTurn.sent.includes(ukiyoLead), "on: the Megumin prompt is sent");
  const handed = /this turn's rolls are (\d+), (\d+), (\d+)\./u.exec(onTurn.sent);
  assert.ok(handed, "the dice are handed over");
  const rolls = handed.slice(1).map(Number);
  for (const roll of rolls) assert.ok(roll >= 1 && roll <= 20);
  assert.deepEqual(onTurn.extra.meguminTurn.diceRolls, rolls, "the turn records exactly what was handed over");
  assert.equal(onTurn.extra.meguminTurn.engineId, "v10-core");
  assert.equal(onTurn.extra.meguminTurn.cotId, "cot-v10-ukiyo-english");
  assert.equal(onTurn.extra.meguminTurn.layout, "universal");
  assert.ok(onTurn.extra.meguminTurn.tokenBreakdown.total > 0);
  assert.equal(onTurn.saved.content, "Rain hits the window.", "on: reasoning the provider left unopened is lifted");
  assert.equal(onTurn.extra.thinking, "plan a red beat.", "and its <font> tags are stripped");

  // The preset's own <ksc> pair is lifted on the server, as before.
  nextReply = "<ksc>quiet</ksc>\nThe door opens.";
  const kscTurn = await generate(meguminChat.id);
  assert.equal(kscTurn.saved.content, "The door opens.");
  assert.equal(kscTurn.extra.thinking, "quiet");
  assert.equal(kscTurn.extra.meguminTurn.diceRolls.length, 3, "fresh dice every turn");

  // Peek shows what generation sends for the same turn; only the dice differ, rolled fresh each time.
  const dice = /this turn's rolls are \d+, \d+, \d+\./gu;
  const masked = (messages: Array<{ role: string; content: string }>) =>
    messages.map((m) => ({ role: m.role, content: m.content.replace(dice, "<rolls>") }));
  const parityPeek = await app.inject({
    method: "POST",
    url: "/api/generate/dryRun",
    payload: { chatId: meguminChat.id, returnPrompt: true, userMessage: "Look outside." },
  });
  assert.equal(parityPeek.statusCode, 200, parityPeek.body);
  const parityTurn = await generate(meguminChat.id);
  const peeked = parityPeek.json().prompt.messages as Array<{ role: string; content: string }>;
  assert.equal(text(peeked).match(dice)?.length, 1, "Peek hands over dice too");
  assert.deepEqual(masked(peeked), masked(requests.at(-1)!.messages), "Peek equals the sent prompt");
  assert.equal(parityTurn.extra.meguminTurn.diceRolls.length, 3);

  // Impersonating on a Megumin chat sends only the preset's markers: no Megumin text, so no turn.
  const impersonate = async (extra: Record<string, unknown>) => {
    const before = requests.length;
    const response = await app.inject({
      method: "POST",
      url: "/api/generate",
      payload: { chatId: meguminChat.id, streaming: false, impersonate: true, ...extra },
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(requests.length, before + 1, response.body);
    const saved = (await chats.listMessages(meguminChat.id)).at(-1)!;
    return {
      sent: text(requests.at(-1)!.messages),
      saved,
      extra: typeof saved.extra === "string" ? JSON.parse(saved.extra) : saved.extra,
    };
  };
  nextReply = unopened;
  const impersonated = await impersonate({});
  assert.equal(impersonated.saved.role, "user");
  assert.ok(!impersonated.sent.includes(ukiyoLead) && !impersonated.sent.includes("<banlist>"), "no Megumin text");
  assert.ok(!/this turn's rolls/u.test(impersonated.sent), "and no dice handed over");
  assert.equal(impersonated.extra.meguminTurn, undefined, "so no turn is recorded");
  assert.ok(impersonated.saved.content.includes("</think>"), "and no unopened-reasoning lift");
  const viaMeguminImpersonate = await impersonate({ impersonatePresetId: stockMegumin.id });
  assert.ok(viaMeguminImpersonate.sent.includes("<banlist>"), "a Megumin impersonate preset is sent whole");
  assert.equal(viaMeguminImpersonate.extra.meguminTurn.diceRolls.length, 3, "and that is a Megumin turn");

  // The tags Megumin Suite hid from the display and the prompt are gone before the reply is saved,
  // and the reasoning loses the repeated opening tags of the V10 prefill and the Gemini wrapper.
  nextReply = [
    "<think>\n<think>\n<think>\nplan\n</think>",
    "<narration>The rain stops.</narration>",
    '<dialogue >"Finally."</dialogue >',
    "<disclaimer>fiction</disclaimer>```end",
  ].join("\n");
  const tagged = await generate(meguminChat.id);
  assert.equal(tagged.saved.content, 'The rain stops.\n"Finally."');
  assert.equal(tagged.extra.thinking, "plan");
  const untagged = await generate(universalChat.id);
  assert.ok(untagged.saved.content.includes("<narration>The rain stops.</narration>"), "another preset keeps them");
  assert.ok(untagged.saved.content.includes("<disclaimer>fiction</disclaimer>"));

  // Reasoning off: no unopened lift, even on a Megumin turn.
  await updateMeguminSettings(db, (s) => ({ ...s, defaultProfile: { cotEnabled: false } }));
  nextReply = unopened;
  const noCot = await generate(meguminChat.id);
  assert.equal(noCot.extra.meguminTurn.cotId, null);
  assert.equal(noCot.extra.meguminTurn.diceRolls, null);
  assert.ok(noCot.saved.content.includes("</think>"), "no reasoning asked for, nothing lifted");

  // Not a Megumin turn while on: nothing changes for another preset.
  const other = await generate(universalChat.id);
  assert.equal(other.extra.meguminTurn, undefined);
  assert.ok(other.saved.content.includes("</think>"));
  assert.ok(!other.sent.includes(ukiyoLead));

  // Every reader of a turn's preset picks it the way generation does, Megumin Mode's fallback included.
  for (const file of [
    "routes/generate.routes.ts",
    "routes/generate/dry-run-route.ts",
    "routes/generate/parameter-preview-route.ts",
    "routes/generate/retry-agents-route.ts",
    "routes/chats.routes.ts",
    "routes/prompts.routes.ts",
    "services/mari-db/mari-db.service.ts",
  ]) {
    const source = readFileSync(new URL(`../../packages/server/src/${file}`, import.meta.url), "utf8");
    assert.ok(source.includes("resolveGenerationPromptPreset({"), `${file} uses the shared preset selection`);
  }

  console.info("megumin mode gating regression passed");
} finally {
  await app.close();
  provider.close();
  await closeDB();
  rmSync(dir, { recursive: true, force: true });
}
