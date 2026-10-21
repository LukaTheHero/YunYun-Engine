import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

// #7191: hiding a message from a whisper's recipient hides the narration, never the whisper.
const dir = mkdtempSync(join(tmpdir(), "marinara-whisper-hidden-"));
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
const { createChatsStorage } = await import("../../packages/server/src/services/storage/chats.storage.js");
const { createConnectionsStorage } = await import("../../packages/server/src/services/storage/connections.storage.js");
const { createCharactersStorage } = await import("../../packages/server/src/services/storage/characters.storage.js");
const { createPromptsStorage } = await import("../../packages/server/src/services/storage/prompts.storage.js");
const { selectAdvancedMemoryWhisperOnlyIds } = await import("../../packages/server/src/services/advanced-memory.js");
const { filterPromptHistoryByMessageIds } =
  await import("../../packages/server/src/services/generation/prompt-message-scope.js");
const { characterDataSchema, getRoleplayCommandActivity, getRoleplayWhispers, DEFAULT_ADVANCED_MEMORY_SETTINGS } =
  await import("../../packages/shared/dist/index.js");

const prompts: string[] = [];
let outputs: string[] = [];
const provider = createServer(async (request, response) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const body = JSON.parse(Buffer.concat(chunks).toString());
  // Advanced Memory checks for scene changes after a reply; this story has none.
  const sceneCheck = JSON.stringify(body.messages).includes("Identify scene transitions");
  if (!sceneCheck) prompts.push(JSON.stringify(body.messages));
  const content = sceneCheck
    ? body.messages[0].content.includes('"ends"')
      ? '{"ends":[]}'
      : '{"starts":[]}'
    : outputs.shift();
  assert.notEqual(content, undefined, "unexpected provider request");
  if (sceneCheck && !body.stream) {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({ choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }] }),
    );
    return;
  }
  response.writeHead(200, { "content-type": "text/event-stream" });
  response.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content }, finish_reason: null }] })}\n\n`);
  response.end(
    `data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`,
  );
});
const db = await getDB();
const chats = createChatsStorage(db);
const characters = createCharactersStorage(db);
const app = Fastify();
app.decorate("db", db);
app.decorate("activeGenerations", new Map());
await app.register(generateRoutes, { prefix: "/api/generate" });
await app.register(chatsRoutes, { prefix: "/api/chats" });
try {
  await new Promise<void>((done) => provider.listen(0, "127.0.0.1", done));
  const address = provider.address();
  assert(address && typeof address === "object");
  const connection = await createConnectionsStorage(db).create({
    name: "Hidden whisper fixture",
    provider: "custom",
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    model: "fixture",
    apiKey: "fixture",
    maxContext: 32768,
    maxTokensOverride: 512,
  });
  assert(connection);
  const [tobias, cornelius, narrator] = await Promise.all(
    ["Tobias", "Cornelius", "Narrator"].map((name) => characters.create(characterDataSchema.parse({ name }))),
  );
  assert(tobias && cornelius && narrator);
  const persona = await characters.createPersona("YunYun", "The player.");
  assert(persona);
  const presets = createPromptsStorage(db);
  const preset = await presets.create({
    name: "Hidden whisper fixture",
    parameters: { maxTokens: 512, maxContext: 32768, strictRoleFormatting: true },
    wrapFormat: "xml",
  });
  assert(preset);
  await presets.createSection({ presetId: preset.id, identifier: "rules", name: "Rules", content: "Be {{char}}." });
  await presets.createSection({
    presetId: preset.id,
    identifier: "history",
    name: "Chat History",
    isMarker: true,
    markerConfig: { type: "chat_history" },
  });
  const chat = await chats.create({
    name: "Hidden whisper proof",
    mode: "roleplay",
    characterIds: [tobias.id, cornelius.id, narrator.id],
    personaId: persona.id,
    connectionId: connection.id,
    promptPresetId: preset.id,
  });
  assert(chat);
  await chats.patchMetadata(chat.id, {
    enableAgents: false,
    enableTools: false,
    enableMemoryRecall: false,
    roleplayCommandsEnabled: true,
    roleplayCommandToggles: { whisper: true },
    roleplayCommandNarratorId: narrator.id,
    groupChatMode: "individual",
    groupResponseOrder: "manual",
  });
  await chats.createMessage({ chatId: chat.id, role: "user", content: "OPENING_LINE YunYun walks the empty pier." });
  const generate = async (output: string, forCharacterId: string, options: Record<string, unknown> = {}) => {
    outputs = [output];
    const response = await app.inject({
      method: "POST",
      url: "/api/generate/",
      payload: { chatId: chat.id, forCharacterId, ...options },
    });
    assert.equal(response.statusCode, 200, response.body);
    assert(!response.body.includes('"type":"error"'), response.body);
    assert.equal(outputs.length, 0);
    return prompts.at(-1)!;
  };
  const preview = async (forCharacterId: string, options: Record<string, unknown> = {}) => {
    const response = await app.inject({
      method: "POST",
      url: "/api/generate/dryRun",
      payload: { chatId: chat.id, forCharacterId, returnPrompt: true, ...options },
    });
    assert.equal(response.statusCode, 200, response.body);
    return JSON.stringify(response.json().prompt.messages);
  };
  const patchExtra = async (messageId: string, extra: Record<string, unknown>) => {
    const response = await app.inject({
      method: "PATCH",
      url: `/api/chats/${chat.id}/messages/${messageId}/extra`,
      payload: extra,
    });
    assert.equal(response.statusCode, 200, response.body);
  };

  // The narrator talks to YunYun alone, whispering to absent Tobias and to YunYun.
  await generate(
    'NARRATION_HEAD on the pier. [whisper: character="Tobias" text="TOBIAS_SECRET"] NARRATION_TAIL as the tide turns. [whisper: character="YunYun" text="PERSONA_SECRET"]',
    narrator.id,
  );
  const narration = (await chats.listMessages(chat.id)).at(-1)!;
  assert.equal(getRoleplayWhispers(JSON.parse(narration.extra)).length, 2);
  await patchExtra(narration.id, { hiddenFromAICharacterIds: [tobias.id, cornelius.id] });

  const corneliusLive = await generate("CORNELIUS_LATER_LINE.", cornelius.id);
  for (const content of [corneliusLive, await preview(cornelius.id)]) {
    assert(!content.includes("NARRATION_"), "Cornelius never sees the hidden narration");
    assert(!content.includes("SECRET") && !content.includes("[Private whisper"), "Cornelius gets no whisper or trace");
  }

  const tobiasLive = await generate("Tobias replies.", tobias.id);
  for (const content of [tobiasLive, await preview(tobias.id)]) {
    assert(content.includes("[Private whisper to Tobias"), "Tobias still receives the whisper fragment");
    assert(content.includes("TOBIAS_SECRET"));
    assert(!content.includes("NARRATION_"), "only the whisper survives the hide, never the narration");
    assert(!content.includes("PERSONA_SECRET"), "a stand-in carries only the viewer's own whispers");
    assert(
      content.indexOf("OPENING_LINE") < content.indexOf("TOBIAS_SECRET") &&
        content.indexOf("TOBIAS_SECRET") < content.indexOf("CORNELIUS_LATER_LINE"),
      "the whisper keeps the hidden message's place in the story",
    );
  }
  // Previews without a preset, or built from extension prompt parts, keep the stand-in's whisper too.
  for (const options of [{ skipPreset: true }, { promptParts: { presetText: "Parts preview." } }]) {
    const content = await preview(tobias.id, options);
    assert(content.includes("TOBIAS_SECRET") && !content.includes("NARRATION_"), JSON.stringify(options));
  }

  // The narrator and the persona keep today's views.
  const narratorLive = await generate("The narrator continues.", narrator.id);
  for (const content of [narratorLive, await preview(narrator.id)]) {
    assert(content.includes("NARRATION_HEAD") && content.includes("NARRATION_TAIL"));
    assert(content.includes("TOBIAS_SECRET") && content.includes("PERSONA_SECRET"));
  }
  const personaView = await preview(tobias.id, { impersonate: true });
  assert(personaView.includes("NARRATION_HEAD") && personaView.includes("PERSONA_SECRET"));
  assert(!personaView.includes("TOBIAS_SECRET"), "the persona does not gain Tobias's whisper");

  // Hiding the message from the narrator too gives the narrator nothing back.
  await patchExtra(narration.id, { hiddenFromAICharacterIds: [tobias.id, cornelius.id, narrator.id] });
  const narratorHidden = await preview(narrator.id);
  assert(!narratorHidden.includes("SECRET") && !narratorHidden.includes("NARRATION_"), "no narrator resurrection");
  assert((await preview(tobias.id)).includes("TOBIAS_SECRET"));
  await patchExtra(narration.id, { hiddenFromAICharacterIds: [tobias.id, cornelius.id] });

  // A message trimmed out of the history window takes its whisper with it.
  await chats.patchMetadata(chat.id, { contextMessageLimit: 2 });
  assert(!(await preview(tobias.id)).includes("TOBIAS_SECRET"), "the stand-in follows history trimming");
  await chats.patchMetadata(chat.id, { contextMessageLimit: null });

  // Hiding from everyone keeps today's rule: nothing comes back.
  await patchExtra(narration.id, { hiddenFromAI: true });
  for (const content of [await generate("Tobias shrugs.", tobias.id), await preview(tobias.id)]) {
    assert(!content.includes("TOBIAS_SECRET") && !content.includes("[Private whisper"));
  }
  await patchExtra(narration.id, { hiddenFromAI: false });
  assert((await preview(tobias.id)).includes("TOBIAS_SECRET"));

  // Emptying a whisper removes it from the message; other commands stay as they were.
  const before = getRoleplayCommandActivity(JSON.parse((await chats.getMessage(narration.id))!.extra));
  const tobiasIndex = before.findIndex(
    (item) => item.command.type === "whisper" && item.whisperRecipient?.id === tobias.id,
  );
  assert(tobiasIndex >= 0);
  await patchExtra(narration.id, {
    roleplayCommandActivity: before.map((item, index) =>
      index === tobiasIndex && item.command.type === "whisper"
        ? { ...item, command: { ...item.command, text: "  \n " } }
        : item,
    ),
  });
  const after = getRoleplayCommandActivity(JSON.parse((await chats.getMessage(narration.id))!.extra));
  assert.deepEqual(
    after,
    before.filter((_, index) => index !== tobiasIndex),
    "the emptied whisper is gone",
  );
  const emptied = await preview(tobias.id);
  assert(!emptied.includes("TOBIAS_SECRET") && !emptied.includes("[Private whisper"), "no blank whisper remains");
  assert((await preview(tobias.id, { impersonate: true })).includes("PERSONA_SECRET"));

  // With Advanced Memory on, a hidden message that opens Tobias's history keeps his whisper too.
  const memoryChat = await chats.create({
    name: "Hidden whisper memory",
    mode: "roleplay",
    characterIds: [tobias.id, narrator.id],
    personaId: persona.id,
    connectionId: connection.id,
    promptPresetId: preset.id,
  });
  assert(memoryChat);
  const memoryMetadata = {
    enableAgents: false,
    enableTools: false,
    enableMemoryRecall: false,
    roleplayCommandsEnabled: true,
    roleplayCommandToggles: { whisper: true },
    roleplayCommandNarratorId: narrator.id,
    groupChatMode: "individual",
    groupResponseOrder: "manual",
    advancedMemory: {
      ...DEFAULT_ADVANCED_MEMORY_SETTINGS,
      enabled: true,
      narratorCharacterId: narrator.id,
      knowledgeStarts: { [tobias.id]: null, [narrator.id]: null },
      knowledgeConfirmed: true,
    },
  };
  await chats.patchMetadata(memoryChat.id, memoryMetadata);
  await chats.createMessage({
    chatId: memoryChat.id,
    role: "assistant",
    characterId: narrator.id,
    content: "MEMORY_OPENER_NARRATION on the pier.",
    extra: { hiddenFromAICharacterIds: [tobias.id], roleplayCommandActivity: before },
  });
  await chats.createMessage({ chatId: memoryChat.id, role: "user", content: "MEMORY_VISIBLE_LINE YunYun calls out." });
  for (const content of [
    await generate("Tobias answers.", tobias.id, { chatId: memoryChat.id }),
    await preview(tobias.id, { chatId: memoryChat.id }),
  ]) {
    assert(content.includes("TOBIAS_SECRET"), "Advanced Memory keeps the whisper of the message that opens the window");
    assert(!content.includes("MEMORY_OPENER_NARRATION") && !content.includes("PERSONA_SECRET"));
    assert(content.includes("MEMORY_VISIBLE_LINE"));
  }

  // A message that holds only a whisper has no text to remember. Advanced Memory still delivers it.
  const whisperOnly = await app.inject({
    method: "POST",
    url: `/api/chats/${memoryChat.id}/messages`,
    payload: { role: "user", content: '[whisper: character="Narrator" text="USER_WHISPER_ONLY_SECRET"]' },
  });
  assert.equal(whisperOnly.statusCode, 200, whisperOnly.body);
  assert.equal(whisperOnly.json().content, "");
  for (const content of [
    await generate('[whisper: character="Tobias" text="NARRATOR_WHISPER_ONLY_SECRET"]', narrator.id, {
      chatId: memoryChat.id,
    }),
    await preview(narrator.id, { chatId: memoryChat.id }),
  ])
    assert(content.includes("USER_WHISPER_ONLY_SECRET"), "the narrator receives a whisper-only user message");
  const tobiasView = await preview(tobias.id, { chatId: memoryChat.id });
  assert(tobiasView.includes("NARRATOR_WHISPER_ONLY_SECRET"), "Tobias receives a whisper-only narrator reply");
  assert(!tobiasView.includes("USER_WHISPER_ONLY_SECRET"), "Tobias never receives the narrator's whisper");
  // Its whisper stays inside the last message's wrapper, even when memory leaves out an earlier message.
  for (const content of [tobiasView, await generate("Tobias reacts.", tobias.id, { chatId: memoryChat.id })]) {
    assert.equal(content.split("</last_message>").length, 2, "one closing tag");
    const secretAt = content.indexOf("NARRATOR_WHISPER_ONLY_SECRET");
    assert(content.lastIndexOf("<last_message>", secretAt) >= 0 && secretAt < content.indexOf("</last_message>"));
  }
  // A new conversation leaves earlier whisper-only messages behind, in Peek Prompt too.
  await chats.createMessage({
    chatId: memoryChat.id,
    role: "user",
    content: '[whisper: character="Narrator" text="OLD_WHISPER_ONLY_SECRET"]',
  });
  await chats.createMessage({
    chatId: memoryChat.id,
    role: "user",
    content: "NEW_CONVERSATION_LINE",
    extra: { isConversationStart: true },
  });
  for (const content of [
    await preview(narrator.id, { chatId: memoryChat.id }),
    await preview(tobias.id, { chatId: memoryChat.id }),
    await generate("A new day.", narrator.id, { chatId: memoryChat.id }),
  ]) {
    assert(content.includes("NEW_CONVERSATION_LINE"));
    assert(!content.includes("WHISPER_ONLY_SECRET") && !content.includes("[Private whisper"), "no earlier whisper");
  }

  // A chat can open with a message that is only a whisper. Memory then keeps no message to anchor it.
  const whisperFirstChat = await chats.create({
    name: "Whisper first",
    mode: "roleplay",
    characterIds: [tobias.id, narrator.id],
    personaId: persona.id,
    connectionId: connection.id,
    promptPresetId: preset.id,
  });
  assert(whisperFirstChat);
  await chats.patchMetadata(whisperFirstChat.id, memoryMetadata);
  await chats.createMessage({
    chatId: whisperFirstChat.id,
    role: "user",
    content: '[whisper: character="Narrator" text="FIRST_WHISPER_SECRET"]',
  });
  for (const content of [
    await generate("The story begins.", narrator.id, { chatId: whisperFirstChat.id }),
    await preview(narrator.id, { chatId: whisperFirstChat.id }),
  ])
    assert(content.includes("FIRST_WHISPER_SECRET"), "a chat's first whisper-only message reaches the narrator");
  // Whispers separated only by a space leave a blank body. They follow the placeholder, never split it.
  await chats.createMessage({
    chatId: whisperFirstChat.id,
    role: "user",
    content:
      '[whisper: character="Narrator" text="SPACED_NARRATOR_SECRET"] [whisper: character="Tobias" text="SPACED_TOBIAS_SECRET"]',
  });
  for (const [id, name] of [
    [narrator.id, "Narrator"],
    [tobias.id, "Tobias"],
  ] as const) {
    const content = await preview(id, { chatId: whisperFirstChat.id });
    assert(
      content.includes(`[Private whisper]\\n\\n[Private whisper to ${name} `),
      "the whisper follows a whole placeholder",
    );
  }
  // A whisper-only message can open a character's own conversation. Live and Peek Prompt both deliver it.
  await chats.createMessage({ chatId: whisperFirstChat.id, role: "user", content: "PERSONAL_EARLY_LINE" });
  await chats.createMessage({
    chatId: whisperFirstChat.id,
    role: "user",
    content: '[whisper: character="Tobias" text="PERSONAL_START_SECRET"]',
    extra: { conversationStartForCharacterIds: [tobias.id] },
  });
  for (const content of [
    await preview(tobias.id, { chatId: whisperFirstChat.id }),
    await generate("Tobias starts over.", tobias.id, { chatId: whisperFirstChat.id }),
  ]) {
    assert(content.includes("PERSONAL_START_SECRET"), "a whisper that opens Tobias's conversation reaches him");
    assert(!content.includes("PERSONAL_EARLY_LINE"));
  }
  // A notice memory never keeps, between a whisper-only message and later text, does not cut the whisper off.
  const noticeChat = await chats.create({
    name: "Whisper notice",
    mode: "roleplay",
    characterIds: [tobias.id, narrator.id],
    personaId: persona.id,
    connectionId: connection.id,
    promptPresetId: preset.id,
  });
  assert(noticeChat);
  await chats.patchMetadata(noticeChat.id, memoryMetadata);
  await chats.createMessage({
    chatId: noticeChat.id,
    role: "user",
    content: '[whisper: character="Narrator" text="BEFORE_NOTICE_SECRET"]',
  });
  await chats.createMessage({ chatId: noticeChat.id, role: "system", content: "You are now playing as YunYun." });
  await chats.createMessage({ chatId: noticeChat.id, role: "user", content: "AFTER_NOTICE_LINE" });
  for (const content of [
    await preview(narrator.id, { chatId: noticeChat.id }),
    await generate("The narrator notices.", narrator.id, { chatId: noticeChat.id }),
  ])
    assert(content.includes("BEFORE_NOTICE_SECRET") && content.includes("AFTER_NOTICE_LINE"), "notice in between");

  // A one-character chat with Advanced Memory delivers a whisper-only message too.
  const soloChat = await chats.create({
    name: "Whisper solo",
    mode: "roleplay",
    characterIds: [narrator.id],
    personaId: persona.id,
    connectionId: connection.id,
    promptPresetId: preset.id,
  });
  assert(soloChat);
  await chats.patchMetadata(soloChat.id, {
    ...memoryMetadata,
    groupChatMode: undefined,
    advancedMemory: { ...memoryMetadata.advancedMemory, knowledgeStarts: { [narrator.id]: null } },
  });
  await chats.createMessage({
    chatId: soloChat.id,
    role: "assistant",
    characterId: narrator.id,
    content: "SOLO_GREETING",
  });
  await chats.createMessage({
    chatId: soloChat.id,
    role: "user",
    content: '[whisper: character="Narrator" text="SOLO_SECRET"]',
  });
  for (const content of [
    await preview(narrator.id, { chatId: soloChat.id }),
    await generate("Solo reply.", narrator.id, { chatId: soloChat.id }),
  ])
    assert(content.includes("SOLO_SECRET"), "one-character chat");

  // A whisper-only message follows a character's knowledge start like any other message.
  const knowledgeChat = await chats.create({
    name: "Whisper knowledge",
    mode: "roleplay",
    characterIds: [tobias.id, narrator.id],
    personaId: persona.id,
    connectionId: connection.id,
    promptPresetId: preset.id,
  });
  assert(knowledgeChat);
  await chats.patchMetadata(knowledgeChat.id, memoryMetadata);
  await chats.createMessage({ chatId: knowledgeChat.id, role: "user", content: "KNOWLEDGE_EARLY_LINE" });
  const knowledgeWhisper = await chats.createMessage({
    chatId: knowledgeChat.id,
    role: "user",
    content: '[whisper: character="Tobias" text="KNOWLEDGE_SECRET"]',
  });
  const oldReply = await chats.createMessage({
    chatId: knowledgeChat.id,
    role: "assistant",
    characterId: tobias.id,
    content: "KNOWLEDGE_OLD_REPLY",
  });
  const anchor = await chats.createMessage({ chatId: knowledgeChat.id, role: "user", content: "KNOWLEDGE_ANCHOR" });
  assert(knowledgeWhisper && oldReply && anchor);
  const knowledgeFrom = (id: string) =>
    chats.patchMetadata(knowledgeChat.id, {
      advancedMemory: {
        ...memoryMetadata.advancedMemory,
        knowledgeStarts: { [tobias.id]: id, [narrator.id]: null },
      },
    });
  await knowledgeFrom(knowledgeWhisper.id);
  for (const content of [
    await preview(tobias.id, { chatId: knowledgeChat.id }),
    await generate("Tobias knows.", tobias.id, { chatId: knowledgeChat.id }),
  ]) {
    assert(content.includes("KNOWLEDGE_SECRET"), "Tobias's knowledge opens on the whisper");
    assert(!content.includes("KNOWLEDGE_EARLY_LINE"));
  }
  // Regenerating a reply from before Tobias's knowledge start gives him nothing from then.
  await knowledgeFrom(anchor.id);
  assert(
    !(
      await generate("Tobias again.", tobias.id, { chatId: knowledgeChat.id, regenerateMessageId: oldReply.id })
    ).includes("KNOWLEDGE_SECRET"),
    "regenerating before the knowledge start",
  );
  // Impersonating reads memory as its owner, without Tobias's knowledge range, in Peek Prompt as in the live route.
  assert(
    (await preview(tobias.id, { chatId: knowledgeChat.id, impersonate: true })).includes("KNOWLEDGE_EARLY_LINE"),
    "owner view",
  );

  // Advanced Memory keeps a stand-in only inside the retained window, which opens with the hidden
  // messages right before its first kept message.
  const history = (content: string, id?: string, whisperSourceId?: string) => ({
    role: "user" as const,
    content,
    contextKind: "history" as const,
    ...(id ? { id } : {}),
    ...(whisperSourceId ? { whisperSourceId } : {}),
  });
  const windowMessages = [
    history("EARLY_STAND_IN", undefined, "early"),
    history("OLD", "old"),
    history("OPENING_STAND_IN", undefined, "opening"),
    history("KEPT", "kept"),
    history("LATE_STAND_IN", undefined, "late"),
  ];
  const windowSources = new Set(["early", "old", "opening", "kept", "late"]);
  const windowed = filterPromptHistoryByMessageIds(windowMessages, new Set(["kept"]), windowSources);
  assert.deepEqual(
    windowed.map((message) => message.content),
    ["OPENING_STAND_IN", "KEPT", "LATE_STAND_IN"],
  );
  assert.deepEqual(filterPromptHistoryByMessageIds(windowMessages, new Set(), windowSources), []);
  // Whisper-only messages follow memory's reader rules: knowledge and conversation starts and hiding.
  const whisperExtra = (extra: Record<string, unknown> = {}) => ({
    ...extra,
    roleplayCommandActivity: [
      {
        command: { type: "whisper", character: "Tobias", text: "UNIT_SECRET" },
        raw: "",
        whisperRecipient: { id: tobias.id, kind: "character" },
      },
    ],
  });
  const line = (id: string, extra: Record<string, unknown> = {}) => ({ id, role: "user", content: id, extra });
  const whisper = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    role: "user",
    content: "",
    extra: whisperExtra(extra),
  });
  const whisperOnlyFor = (
    messages: Array<{ id: string; role: string; content: string; extra: Record<string, unknown> }>,
    knowledgeStarts: Record<string, string | null> = { [tobias.id]: null },
  ) => [
    ...selectAdvancedMemoryWhisperOnlyIds(
      messages,
      { ...DEFAULT_ADVANCED_MEMORY_SETTINGS, enabled: true, knowledgeStarts },
      [tobias.id],
      true,
    ),
  ];
  assert.deepEqual(whisperOnlyFor([line("a"), whisper("w")]), ["w"]);
  assert.deepEqual(whisperOnlyFor([line("a"), whisper("w")], { [tobias.id]: "w" }), ["w"], "knowledge opens on it");
  assert.deepEqual(whisperOnlyFor([whisper("w"), line("a")], { [tobias.id]: "later" }), [], "regenerating before it");
  assert.deepEqual(
    whisperOnlyFor([whisper("w"), line("a", { isConversationStart: true })]),
    [],
    "earlier conversation",
  );
  assert.deepEqual(
    whisperOnlyFor([line("a"), whisper("w", { conversationStartForCharacterIds: [tobias.id] })]),
    ["w"],
    "personal conversation start",
  );
  assert.deepEqual(whisperOnlyFor([whisper("w", { hiddenFromAICharacterIds: [tobias.id] })]), [], "hidden");
  console.log(
    "Hidden whisper recipient passed: recipient-only stand-in, position, other characters, narrator, persona, trimming, global hide, emptied whispers and memory window.",
  );
} finally {
  await app.close();
  provider.closeAllConnections();
  await new Promise<void>((done) => provider.close(() => done()));
  await closeDB();
  rmSync(dir, { recursive: true, force: true });
}
