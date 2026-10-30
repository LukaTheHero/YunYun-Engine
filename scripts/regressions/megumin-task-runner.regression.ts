import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The Megumin task runner against a stub OpenAI-compatible server: the connection chain (task
// override → utility connection → Default for agents → the chat's), random pool and skipped
// candidates, the Fallback for agents wrap, the Direct and Engine sampler profiles with the
// connection's saved parameters on top, Utility Prefills, the reasoning strip, the one-run-per-task
// lock, and that nothing runs while Megumin Mode is off.

const dir = mkdtempSync(join(tmpdir(), "megumin-task-runner-"));
process.env.DATA_DIR = dir;
process.env.FILE_STORAGE_DIR = join(dir, "storage");
process.env.MARINARA_FILE_STORAGE_DIR = join(dir, "storage");
process.env.NODE_ENV = "test";
process.env.MARINARA_LITE = "true";
process.env.LOG_LEVEL = "silent";

const [{ getDB, closeDB }, { createChatsStorage }, { createConnectionsStorage }, { createPromptsStorage }] =
  await Promise.all([
    import("../../packages/server/src/db/connection.js"),
    import("../../packages/server/src/services/storage/chats.storage.js"),
    import("../../packages/server/src/services/storage/connections.storage.js"),
    import("../../packages/server/src/services/storage/prompts.storage.js"),
  ]);
const { createAppSettingsStorage } = await import("../../packages/server/src/services/storage/app-settings.storage.js");
const { seedDefaultPreset, seedMeguminSuitePreset } = await import("../../packages/server/src/db/seed.js");
const { updateMeguminSettings } = await import("../../packages/server/src/services/megumin/settings.js");
const { MEGUMIN_ENGINE_PARAMETERS, MeguminTaskError, runMeguminTask } =
  await import("../../packages/server/src/services/megumin/tasks/runner.js");
const { FEATURE_SETTINGS_KEY } = await import("../../packages/shared/src/index.js");

type Seen = { name: string; body: any };
const seen: Seen[] = [];
const replies = new Map<string, string>();
let holdSlow: Promise<void> = Promise.resolve();
const server = createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const body = JSON.parse(Buffer.concat(chunks).toString());
  const name = req.url?.split("/")[1] ?? "";
  seen.push({ name, body });
  if (name === "broken") {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { message: "down" } }));
    return;
  }
  if (name === "slow") await holdSlow;
  const content = replies.get(name) ?? `<think>plan for ${name}</think>\nANSWER from ${name}`;
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }] }));
});

try {
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const db = await getDB();
  await seedDefaultPreset(db);
  await seedMeguminSuitePreset(db);
  const connections = createConnectionsStorage(db);
  const connection = async (name: string, extra: Record<string, unknown> = {}) => {
    const row = await connections.create({
      name,
      provider: "custom",
      baseUrl: `http://127.0.0.1:${address.port}/${name}/v1`,
      model: `${name}-model`,
      apiKey: "fixture",
      ...extra,
    } as never);
    assert.ok(row, `connection ${name}`);
    return row;
  };
  const chatConnection = await connection("chat");
  const utility = await connection("utility");
  const taskConnection = await connection("task");
  const tuned = await connection("tuned");
  await connections.updateDefaultParameters(tuned.id, { temperature: 0.3 });
  const broken = await connection("broken");
  const slow = await connection("slow");
  const pooled = await connection("pooled", { useForRandom: true });
  const image = await connections.create({
    name: "image",
    provider: "image_generation",
    baseUrl: `http://127.0.0.1:${address.port}/image/v1`,
    model: "image-model",
    apiKey: "fixture",
  } as never);
  assert.ok(image);

  const presets = createPromptsStorage(db);
  const userMegumin = await presets.create({
    name: "My Megumin",
    engineMode: "megumin",
    parameters: {
      temperature: 0.7,
      topP: 0.8,
      maxTokens: 1234,
      assistantPrefill: "PRESET_PREFILL",
      customThinkingTags: [{ open: "<x>", close: "</x>" }],
    },
  } as never);
  const ordinary = await presets.create({ name: "Ordinary", parameters: { temperature: 0.2 } } as never);
  assert.ok(userMegumin && ordinary);

  const chats = createChatsStorage(db);
  const chat = await chats.create({
    name: "Task chat",
    mode: "roleplay",
    characterIds: [],
    connectionId: chatConnection.id,
    promptPresetId: userMegumin.id,
  } as never);
  assert.ok(chat);

  const messages = [
    { role: "system" as const, content: "You are a prompt engineer." },
    { role: "user" as const, content: "Write a rule." },
  ];
  const run = (extra: Record<string, unknown> = {}) =>
    runMeguminTask(db, { chatId: chat.id, task: "director", backend: "engine", messages, ...extra } as never);
  const lastRequest = () => seen.at(-1)!;
  const setGlobal = (global: Record<string, unknown>) =>
    updateMeguminSettings(db, (current) => ({ ...current, global: { ...current.global, ...global } }));

  // ── nothing runs while Megumin Mode is off ──
  await assert.rejects(run(), (err: unknown) => err instanceof MeguminTaskError && err.code === "off");
  assert.equal(seen.length, 0, "no model call while off");
  await createAppSettingsStorage(db).set(FEATURE_SETTINGS_KEY, JSON.stringify({ meguminMode: true }));

  // ── connection chain ──
  let result = await run();
  assert.equal(result.source, "chat", "with nothing else set, the chat's connection runs the task");
  assert.equal(lastRequest().name, "chat");
  assert.equal(result.content, "ANSWER from chat", "the leading reasoning is removed");
  assert.equal(result.thinking, "plan for chat");

  const agents = await connection("agents", { defaultForAgents: true });
  result = await run();
  assert.equal(result.source, "agent-default", "Default for agents comes before the chat's connection");
  assert.equal(result.connectionId, agents.id);
  assert.equal(lastRequest().body.model, "agents-model");

  await setGlobal({ utilityConnectionId: image.id });
  result = await run();
  assert.equal(result.source, "agent-default", "an image connection is skipped");
  assert.match(result.warnings.join("\n"), /does not generate text/);
  await setGlobal({ utilityConnectionId: "missing-connection" });
  result = await run();
  assert.equal(result.source, "agent-default", "a missing connection is skipped");
  assert.match(result.warnings.join("\n"), /missing-connection was not found/);

  await setGlobal({ utilityConnectionId: utility.id });
  result = await run();
  assert.equal(result.source, "utility", "the Megumin utility connection comes before Default for agents");
  assert.equal(lastRequest().name, "utility");

  await setGlobal({ taskConnections: { director: taskConnection.id } });
  result = await run();
  assert.equal(result.source, "task", "a task's own override comes first");
  assert.equal(lastRequest().name, "task");
  result = await run({ task: "ban-list" });
  assert.equal(result.source, "utility", "an override applies to its task only");

  await setGlobal({ taskConnections: { director: "random" } });
  result = await run();
  assert.equal(result.connectionId, pooled.id, "random draws from the random pool");

  await setGlobal({ taskConnections: { director: broken.id } });
  await assert.rejects(run(), "without a fallback a failing connection fails the task");
  const fallback = await connection("fallback", { fallbackForAgents: true });
  result = await run();
  assert.equal(lastRequest().name, "fallback", "Fallback for agents backs up the chosen connection");
  assert.equal(result.content, "ANSWER from fallback");
  assert.ok(fallback);

  // ── sampler profiles ──
  await setGlobal({ taskConnections: {} });
  await run();
  let body = lastRequest().body;
  assert.equal(body.temperature, MEGUMIN_ENGINE_PARAMETERS.temperature, "Engine: temperature 1");
  assert.equal(body.top_p, MEGUMIN_ENGINE_PARAMETERS.topP, "Engine: top_p 1");
  assert.equal(body.max_tokens, MEGUMIN_ENGINE_PARAMETERS.maxTokens, "Engine: 8000 tokens");

  await run({ backend: "direct" });
  body = lastRequest().body;
  assert.equal(body.temperature, 0.7, "Direct: the chat's Megumin preset's temperature");
  assert.equal(body.top_p, 0.8);
  assert.equal(body.max_tokens, 1234);
  assert.notEqual(body.messages.at(-1).role, "assistant", "a task never sends the preset's prefill");
  assert.ok(!JSON.stringify(body).includes("PRESET_PREFILL"));

  await chats.update(chat.id, { promptPresetId: ordinary.id } as never);
  await run({ backend: "direct" });
  body = lastRequest().body;
  assert.equal(body.temperature, 0.9, "Direct on a non-Megumin preset uses the stock Megumin preset");
  assert.equal(body.top_p, 0.95);
  assert.equal(body.max_tokens, 16384);

  await connections.update(chatConnection.id, { promptPresetId: userMegumin.id } as never);
  await run({ backend: "direct" });
  assert.equal(lastRequest().body.temperature, 0.7, "a connection's preset override is the effective preset");

  await setGlobal({ utilityConnectionId: tuned.id });
  await run();
  body = lastRequest().body;
  assert.equal(lastRequest().name, "tuned");
  assert.equal(body.temperature, 0.3, "the connection's saved parameters apply on top of the profile");
  assert.equal(body.max_tokens, MEGUMIN_ENGINE_PARAMETERS.maxTokens);
  await setGlobal({ utilityConnectionId: utility.id });

  // ── Utility Prefills ──
  await run({ prefill: "So, I realize \n" });
  assert.equal(lastRequest().body.messages.at(-1).role, "user", "the prefill stays off by default");
  await setGlobal({ enableUtilityPrefill: true });
  await run({ prefill: "So, I realize \n" });
  assert.deepEqual(lastRequest().body.messages.at(-1), { role: "assistant", content: "So, I realize" });
  await run();
  assert.equal(lastRequest().body.messages.at(-1).role, "user", "a task without a prefill sends none");
  await setGlobal({ enableUtilityPrefill: false });

  // ── one run per chat and task ──
  await setGlobal({ utilityConnectionId: slow.id });
  let release!: () => void;
  holdSlow = new Promise<void>((done) => {
    release = done;
  });
  const first = run();
  const second = run().then(
    () => "ran",
    (err: unknown) => err,
  );
  const otherTask = run({ task: "ban-list" });
  release();
  const secondOutcome = await second;
  assert.ok(
    secondOutcome instanceof MeguminTaskError && secondOutcome.code === "busy",
    "a second run of the same task on the same chat is refused",
  );
  assert.equal((await first).content, "ANSWER from slow");
  assert.equal((await otherTask).content, "ANSWER from slow", "another task on the same chat is not blocked");
  assert.equal((await run()).content, "ANSWER from slow", "the lock is released after a run");

  await assert.rejects(
    runMeguminTask(db, { chatId: "missing", task: "director", backend: "engine", messages }),
    (err: unknown) => err instanceof MeguminTaskError && err.code === "chat-not-found",
  );
} finally {
  server.close();
  await closeDB();
  rmSync(dir, { recursive: true, force: true });
}

console.info("Megumin task runner regression passed.");
