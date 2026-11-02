import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Megumin Suite's I/O on YunYun: the Semantic memory scanner never compares vectors
// from two embedding models, a person's rescan of one character's look applies what
// it found (a scan of everyone keeps established looks), and an image lands on the
// swipe that was shown when it was asked for, even if a regenerate adds a swipe
// while it draws.
const dataDir = mkdtempSync(join(tmpdir(), "yunyun-megumin-io-"));
process.env.DATA_DIR = dataDir;
process.env.FILE_STORAGE_DIR = join(dataDir, "storage");
process.env.MARINARA_ENV_FILE = join(dataDir, ".env");
writeFileSync(process.env.MARINARA_ENV_FILE, "");
process.env.NODE_ENV = "test";
process.env.MARINARA_LITE = "true";
process.env.IMAGE_LOCAL_URLS_ENABLED = "true";
process.env.LOG_LEVEL = "silent";

const {
  setMeguminScopeProvider,
  createRunState,
  MeguminProfile,
  MeguminMemoryVectors,
  MeguminImagesLooks,
  MEGUMIN_EXTENSION_NAME,
} = await import("../../packages/shared/src/megumin/index.js");

function message(id: string, role: "user" | "assistant", text: string) {
  return {
    id,
    role,
    characterId: role === "assistant" ? "char-1" : null,
    name: role === "user" ? "Kazuma" : "Aqua",
    is_user: role === "user",
    is_system: false,
    mes: text,
    swipe_id: 0,
    swipes: [text],
    swipe_info: [{ extra: {} }],
    extra: {},
  };
}

// ── Semantic memory: vectors are kept per embedding space ──
// Space A puts "dragon" texts on axis 0; space B (another model) puts them on axis 1.
let space = "A";
const embedded: string[] = [];
const axisOf = (text: string) => (/dragon/i.test(text) ? (space === "A" ? 0 : 1) : space === "A" ? 1 : 0);
const notices: Array<{ level: string; message: string }> = [];
let lookAnswer = "";
const settings: Record<string, any> = {};
const chatScope: any = {
  chatId: "chat-io",
  chat: [message("m1", "assistant", "Aqua waves."), message("m2", "user", "The dragon swoops over the village!")],
  metadata: {},
  settings,
  profile: {},
  loadedProfileKey: null,
  characters: [
    { id: "char-1", name: "Aqua", avatar: "char-1", description: "A goddess.", personality: "", scenario: "" },
  ],
  characterId: 0,
  groupId: null,
  groups: [],
  name1: "Kazuma",
  name2: "Aqua",
  substitute: (text: string) => text,
  quiet: async () => lookAnswer,
  notify: (n: { level: string; message: string }) => notices.push(n),
  embed: async (texts: string[]) => {
    embedded.push(...texts);
    return {
      space,
      vectors: texts.map((t) => {
        const v = [0, 0, 0];
        v[axisOf(t)] = 1;
        return v;
      }),
    };
  },
  dirty: { metadata: false, settings: false, chat: false, profile: false },
};
setMeguminScopeProvider(() => ({ chat: chatScope, run: createRunState() }));
settings[MEGUMIN_EXTENSION_NAME] = { globalSettings: { suiteEnabled: true } };
MeguminProfile.initProfile();

chatScope.profile.memoryCore = {
  ...(chatScope.profile.memoryCore || {}),
  scannerEngine: "semantic",
  longTermVault: [
    { id: "arc-dragon", text: "The dragon burned the old mill." },
    { id: "arc-bread", text: "Aqua baked bread for the guild." },
  ],
};
const matchedIds = () => [...MeguminMemoryVectors.currentSemanticMatches].map((m: any) => m.id);

await MeguminMemoryVectors.memUpdateSemanticQuery();
assert.deepEqual(matchedIds(), ["arc-dragon"], "space A: the dragon archive matches");
embedded.length = 0;
await MeguminMemoryVectors.memUpdateSemanticQuery();
assert.deepEqual(embedded, ["The dragon swoops over the village!"], "same space: only the query is embedded");

space = "B";
embedded.length = 0;
await MeguminMemoryVectors.memUpdateSemanticQuery();
assert.ok(embedded.includes("The dragon burned the old mill."), "another space: the vault is embedded again");
assert.deepEqual(matchedIds(), ["arc-dragon"], "space B: still the dragon archive, never one picked by stale vectors");

// ── Looks: a rescan of a named character applies; a scan of everyone keeps established looks ──
const looks = () => chatScope.profile.imageGen.characterTags as Record<string, any>;
const lookText = (name: string) => [looks()[name].tags, looks()[name].body].filter(Boolean).join(", ");
chatScope.profile.imageGen = { ...(chatScope.profile.imageGen || {}), characterTags: {} };
looks().Aqua = { tags: "blonde hair, red dress", body: "", natural: "", aliases: [], locked: false };

lookAnswer = '<Character_Visual name="Aqua">blue hair, white robe</Character_Visual>';
const everyone = await MeguminImagesLooks.scanLooks({ from: "chat" });
assert.deepEqual(everyone?.changed, [], "a scan of everyone keeps an established look");
assert.match(lookText("Aqua"), /blonde hair/);

const rescan = await MeguminImagesLooks.scanLooks({ from: "chat", targets: [{ name: "Aqua", aliases: [] }] });
assert.deepEqual(rescan?.changed, ["Aqua"], "the look editor's rescan applies what it found");
assert.match(lookText("Aqua"), /blue hair/);
assert.doesNotMatch(lookText("Aqua"), /blonde hair/);
assert.ok(notices.some((n) => /updated Aqua/.test(n.message)));

looks().Aqua.locked = true;
lookAnswer = '<Character_Visual name="Aqua">green hair, armor</Character_Visual>';
const locked = await MeguminImagesLooks.scanLooks({ from: "chat", targets: [{ name: "Aqua", aliases: [] }] });
assert.deepEqual(locked?.locked, ["Aqua"]);
assert.match(lookText("Aqua"), /blue hair/, "a locked look is never changed");

// ── Images: placed on the swipe shown when the image was asked for ──
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
let received: () => void = () => {};
let release: () => void = () => {};
const provider = createServer(async (request, response) => {
  for await (const _chunk of request);
  const gate = new Promise<void>((resolve) => (release = resolve));
  received();
  await gate;
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify({ data: [{ b64_json: png }] }));
});
await new Promise<void>((resolve) => provider.listen(0, "127.0.0.1", resolve));

const { getDB, closeDB } = await import("../../packages/server/src/db/connection.js");
const { createChatsStorage } = await import("../../packages/server/src/services/storage/chats.storage.js");
const { createConnectionsStorage } = await import("../../packages/server/src/services/storage/connections.storage.js");
const { createMeguminHostIo } = await import("../../packages/server/src/services/megumin/megumin-host-io.js");

try {
  const db = await getDB();
  const chats = createChatsStorage(db);
  const address = provider.address();
  assert.ok(address && typeof address === "object");
  const connection = await createConnectionsStorage(db).create({
    name: "Megumin images",
    provider: "image_generation",
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    model: "dall-e-3",
    imageService: "openai",
    imageGenerationSource: "openai",
    apiKey: "fixture",
  } as never);
  assert.ok(connection?.id);
  const chat = await chats.create({ name: "Images", mode: "roleplay" } as never);
  const reply = await chats.createMessage({ chatId: chat.id, role: "assistant", content: "The first reply." } as never);
  assert.ok(reply?.id);

  const io = createMeguminHostIo(db, {
    chatId: chat.id,
    chatConnectionId: null,
    chatMetadata: {},
    characterIds: [],
    personaId: null,
  });
  const live = { ...message(reply.id, "assistant", "The first reply."), name: "Aqua" };
  const imageNotices: Array<{ level: string; message: string }> = [];
  const imageScope: any = {
    ...chatScope,
    chatId: chat.id,
    chat: [live],
    notify: (n: { level: string; message: string }) => imageNotices.push(n),
    dirty: { metadata: false, settings: false, chat: false, profile: false },
  };
  const request = {
    prompt: "1girl, fountain",
    negative: "",
    settings: { yunyunConnectionId: connection.id },
    target: { messageId: reply.id, mode: "new_msg", isInlineAuto: true, placeholderId: null, restoreHtml: null },
  };
  const attachmentsOf = (extra: unknown) =>
    ((typeof extra === "string" ? JSON.parse(extra) : (extra ?? {})).attachments ?? []) as unknown[];

  // A regenerate starts while the image draws: the live message moves to the pending swipe, then the swipe is saved.
  let drawing = new Promise<void>((resolve) => (received = resolve));
  const done = io.generateImage(request as never, imageScope);
  await drawing;
  live.swipe_id = live.swipes.length;
  await chats.addSwipe(reply.id, "The regenerated reply.");
  release();
  await done;
  const swipes = await chats.getSwipes(reply.id);
  assert.equal(attachmentsOf(swipes[0]!.extra).length, 1, "the image is on the swipe it was asked for");
  assert.equal(attachmentsOf(swipes[1]!.extra).length, 0, "never on the regenerated reply");
  assert.equal(attachmentsOf((await chats.getMessage(reply.id))!.extra).length, 0, "the shown swipe has no image");
  assert.equal(imageNotices.at(-1)?.level, "success");

  // The reply is deleted while the image draws: the person is told, not told it was inserted.
  drawing = new Promise<void>((resolve) => (received = resolve));
  const gone = io.generateImage(request as never, imageScope);
  await drawing;
  await chats.removeMessage(reply.id);
  release();
  await gone;
  assert.equal(imageNotices.at(-1)?.level, "warning");

  console.log("megumin-io regression passed");
} finally {
  provider.closeAllConnections();
  await new Promise<void>((resolve) => provider.close(() => resolve()));
  await closeDB?.().catch(() => {});
  rmSync(dataDir, { recursive: true, force: true });
}
