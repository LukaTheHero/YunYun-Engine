import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CHAT_PRESET_EXCLUDED_METADATA_KEYS,
  CHAT_PROFILE_FOLLOWER_SYNC_KEYS,
  MEGUMIN_COT_IDS,
  MEGUMIN_DIRECT_STYLE_CATALOG,
  MEGUMIN_ENGINE_CATALOG,
  MEGUMIN_FACTORY_PROFILE,
  MEGUMIN_PROFILE_METADATA_KEY,
  MEGUMIN_TEXT_MAX_CHARS,
  buildConfigBlock,
  characterDataSchema,
  meguminProfileKeyWriteScope,
  meguminProfileSchema,
  meguminSettingsSchema,
  meguminSettingsUpdateSchema,
  mergeMeguminProfile,
  parseMeguminProfile,
  parseMeguminSettings,
  resolveMeguminProfile,
  type MeguminProfile,
  type MeguminSettings,
} from "../../packages/shared/src/index.js";

// The Megumin settings store: factory defaults, validation and caps, how a chat's profile is
// resolved (factory → default → character → chat, with per-tab Global inheritance), and the
// routes' guards (writes need the switch on; a guest's joined room chat is the host's).

const rejects = (schema: { safeParse(value: unknown): { success: boolean } }, value: unknown, label: string) =>
  assert.equal(schema.safeParse(value).success, false, label);
const settingsWith = (patch: Partial<MeguminSettings>): MeguminSettings => ({
  ...parseMeguminSettings(null),
  ...patch,
});

// ── factory defaults (D9) ──
const defaults = parseMeguminSettings(null);
assert.deepEqual(defaults.global, {
  utilityConnectionId: null,
  taskConnections: {},
  enableUtilityPrefill: false,
  saveMode: "character",
  promptPreview: false,
});
assert.deepEqual(defaults.defaultProfile, {});
assert.deepEqual(defaults.characterProfiles, {});
assert.deepEqual(defaults.customEngines, []);
assert.deepEqual(defaults.configPresets, []);
assert.deepEqual(defaults.sharedFragments, {});
assert.deepEqual(defaults.globalTabs, {});
assert.equal(defaults.storyConfigGlobalSync, true);
assert.equal(MEGUMIN_FACTORY_PROFILE.mode, "v10-core");
assert.equal(MEGUMIN_FACTORY_PROFILE.model, "cot-v10-ukiyo-english");
assert.equal(MEGUMIN_FACTORY_PROFILE.activeStyleId, "dir_v10_ukiyo");
assert.ok(MEGUMIN_ENGINE_CATALOG.some((engine) => engine.id === MEGUMIN_FACTORY_PROFILE.mode));
assert.ok((MEGUMIN_COT_IDS as readonly string[]).includes(MEGUMIN_FACTORY_PROFILE.model));
assert.ok(MEGUMIN_DIRECT_STYLE_CATALOG.some((style) => style.id === MEGUMIN_FACTORY_PROFILE.activeStyleId));
assert.equal(MEGUMIN_FACTORY_PROFILE.layout, "universal");
assert.equal(MEGUMIN_FACTORY_PROFILE.userRuleReminder, false, "the never-write reminder is off by default (M3)");
assert.equal(MEGUMIN_FACTORY_PROFILE.sendCotPrefill, false);
assert.equal(buildConfigBlock(MEGUMIN_FACTORY_PROFILE.storyConfig).length, 763, "the default <config> block");
assert.ok(meguminProfileSchema.safeParse(MEGUMIN_FACTORY_PROFILE).success, "the factory profile is a valid profile");
assert.deepEqual(resolveMeguminProfile({ settings: defaults }).profile, MEGUMIN_FACTORY_PROFILE);

// ── validation and caps ──
const long = "x".repeat(MEGUMIN_TEXT_MAX_CHARS + 1);
rejects(meguminProfileSchema, { aiRule: long }, "a text field is capped at 50k characters");
assert.ok(meguminProfileSchema.safeParse({ aiRule: "x".repeat(MEGUMIN_TEXT_MAX_CHARS) }).success);
const style = (id: string) => ({ id, name: id, tags: [], notes: "", rule: "" });
assert.ok(
  meguminProfileSchema.safeParse({ customStyles: Array.from({ length: 200 }, (_, i) => style(`s${i}`)) }).success,
);
rejects(
  meguminProfileSchema,
  { customStyles: Array.from({ length: 201 }, (_, i) => style(`s${i}`)) },
  "at most 200 custom styles",
);
rejects(meguminProfileSchema, { customStyles: [style("a"), style("a")] }, "style ids are unique");
rejects(meguminProfileSchema, { addons: ["dice", "dice_all"] }, "dice and dice_all are exclusive");
rejects(meguminProfileSchema, { addons: ["dice", "dice"] }, "no duplicate add-ons");
rejects(meguminProfileSchema, { addons: ["not-an-addon"] }, "unknown add-ons are refused");
assert.ok(meguminProfileSchema.safeParse({ addons: ["dice", "html", "color"] }).success);
rejects(meguminProfileSchema, { thinkEffort: "999" }, "thinking effort is one of the catalog's");
rejects(meguminProfileSchema, { customThinkEffort: 0 }, "custom effort is at least 1 word");
rejects(meguminProfileSchema, { customThinkEffort: 5001 }, "custom effort is at most 5000 words");
rejects(meguminProfileSchema, { layout: "other" }, "layout is universal or cache");
rejects(meguminProfileSchema, { dnRatio: { dialogue: 101 } }, "the dialogue ratio is a percentage");
assert.ok(meguminProfileSchema.safeParse({ dnRatio: { dialogue: 70 } }).success, "nested settings may be sparse");

const engine = (id: string, extra: Record<string, unknown> = {}) => ({ id, label: id, ...extra });
const engineParse = meguminSettingsSchema.safeParse({ customEngines: [engine("custom_1")] });
assert.ok(engineParse.success);
assert.equal(engineParse.data.customEngines[0]?.p2, "", "a blank engine's missing slots default to empty");
assert.ok(
  meguminSettingsSchema.safeParse({ customEngines: Array.from({ length: 64 }, (_, i) => engine(`c${i}`)) }).success,
);
rejects(
  meguminSettingsSchema,
  { customEngines: Array.from({ length: 65 }, (_, i) => engine(`c${i}`)) },
  "at most 64 custom engines",
);
rejects(
  meguminSettingsSchema,
  {
    customEngines: [
      engine("custom_big", {
        p1: "x".repeat(45_000),
        p2: "x".repeat(45_000),
        p3: "x".repeat(45_000),
        p4: "x".repeat(45_000),
        p5: "x".repeat(45_000),
      }),
    ],
  },
  "a custom engine is at most 200 KB",
);
rejects(meguminSettingsSchema, { customEngines: [engine("v10-core")] }, "a custom engine cannot take a stock id");
rejects(meguminSettingsSchema, { customEngines: [engine("c"), engine("c")] }, "custom engine ids are unique");
rejects(
  meguminSettingsSchema,
  {
    configPresets: [
      { id: "p", name: "p", values: {} },
      { id: "p", name: "p", values: {} },
    ],
  },
  "config preset ids are unique",
);
const bigFragments = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`slot${i}`, "x".repeat(45_000)]));
rejects(meguminSettingsSchema, { sharedFragments: bigFragments }, "the whole store is at most 4 MB");
rejects(
  meguminSettingsSchema,
  { sharedFragments: Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`slot${i}`, ""])) },
  "at most 100 shared fragments",
);
rejects(meguminSettingsSchema, { globalTabs: { settings: true } }, "Settings has no Global switch");
rejects(meguminSettingsSchema, { global: { taskConnections: { "not-a-task": "c" } } }, "task ids are known");
rejects(meguminSettingsUpdateSchema, { characterProfiles: {} }, "profiles are not written through the settings route");
rejects(meguminSettingsUpdateSchema, { defaultProfile: {} }, "the default profile has its own route");
assert.deepEqual(
  parseMeguminSettings({ global: { saveMode: "nonsense" } }),
  defaults,
  "an invalid stored value reads as the defaults",
);
assert.equal(parseMeguminProfile({ layout: "other" }), null, "an invalid chat profile is ignored");
assert.equal(parseMeguminProfile(null), null);

// ── sparse profiles: merge ──
const base: MeguminProfile = { mode: "v9-hybrid", dnRatio: { enabled: true, dialogue: 40 }, addons: ["dice"] };
const baseCopy = structuredClone(base);
const diff: MeguminProfile = { dnRatio: { dialogue: 70 }, addons: ["html"] };
const merged = mergeMeguminProfile(base, diff);
assert.deepEqual(merged, { mode: "v9-hybrid", dnRatio: { enabled: true, dialogue: 70 }, addons: ["html"] });
assert.deepEqual(base, baseCopy, "merging leaves its inputs unchanged");
merged.addons?.push("color");
assert.deepEqual(diff.addons, ["html"], "the merged profile shares no lists with the diff");

// ── resolution order ──
const layered = settingsWith({
  defaultProfile: { mode: "v9-hybrid", userLanguage: "French", personality: "Nora" },
  characterProfiles: { solo: { mode: "v8-core", userLanguage: "Arabic" }, other: { mode: "v7.5" } },
});
const soloChat = { characterIds: ["solo"], metadata: {} };
const noChat = resolveMeguminProfile({ settings: layered });
assert.equal(noChat.profile.mode, "v9-hybrid", "without a chat the default profile applies");
assert.equal(noChat.writeScope, "default");
assert.deepEqual(noChat.layers, ["default"]);

const solo = resolveMeguminProfile({ settings: layered, chat: soloChat });
assert.equal(solo.profile.mode, "v8-core", "the character profile beats the default");
assert.equal(solo.profile.userLanguage, "Arabic");
assert.equal(solo.profile.personality, "Nora", "keys the character never set come from the default");
assert.equal(solo.profile.cotEnabled, true, "and the rest from the factory");
assert.equal(solo.writeScope, "character");
assert.equal(solo.characterId, "solo");
assert.deepEqual(solo.layers, ["default", "character"]);

const pinned = resolveMeguminProfile({
  settings: layered,
  chat: { characterIds: ["solo"], metadata: { [MEGUMIN_PROFILE_METADATA_KEY]: { mode: "v10-core-cw" } } },
});
assert.equal(pinned.profile.mode, "v10-core-cw", "the chat's own profile beats the character's");
assert.equal(pinned.profile.userLanguage, "Arabic", "and inherits what it does not set");
assert.equal(pinned.writeScope, "chat", "a chat with its own profile is edited in place");
assert.deepEqual(pinned.layers, ["default", "character", "chat"]);

const reset = resolveMeguminProfile({
  settings: layered,
  chat: { characterIds: ["solo"], metadata: { [MEGUMIN_PROFILE_METADATA_KEY]: null } },
});
assert.equal(reset.profile.mode, "v8-core", "a reset chat profile falls back to the character");
assert.equal(reset.writeScope, "character");

const group = resolveMeguminProfile({ settings: layered, chat: { characterIds: ["solo", "other"], metadata: {} } });
assert.equal(group.profile.mode, "v9-hybrid", "a group chat never reads a character profile");
assert.equal(group.characterId, null);
assert.equal(group.writeScope, "chat", "a group chat always saves to the chat");

const chatMode = resolveMeguminProfile({
  settings: { ...layered, global: { ...layered.global, saveMode: "chat" } },
  chat: soloChat,
});
assert.equal(chatMode.writeScope, "chat", "Per Chat save mode writes the chat's own profile");
assert.equal(chatMode.profile.mode, "v8-core", "and still falls back to the character, as upstream");

const invalidChat = resolveMeguminProfile({
  settings: layered,
  chat: { characterIds: ["solo"], metadata: { [MEGUMIN_PROFILE_METADATA_KEY]: { layout: "nonsense" } } },
});
assert.equal(invalidChat.profile.mode, "v8-core", "an invalid chat profile is skipped");
assert.equal(
  resolveMeguminProfile({ settings: layered, chat: { characterIds: ["constructor"], metadata: {} } }).profile.mode,
  "v9-hybrid",
  "a character id never reads inherited object properties",
);

// A blank standing Story Config field gets its default back when a profile resolves, as upstream on load.
const blanked = resolveMeguminProfile({
  settings: settingsWith({ defaultProfile: { storyConfig: { pov: "", pace: " ", length: "", genre: "noir" } } }),
});
assert.equal(blanked.profile.storyConfig.pov, MEGUMIN_FACTORY_PROFILE.storyConfig.pov);
assert.equal(blanked.profile.storyConfig.pace, MEGUMIN_FACTORY_PROFILE.storyConfig.pace);
assert.equal(blanked.profile.storyConfig.length, MEGUMIN_FACTORY_PROFILE.storyConfig.length);
assert.equal(blanked.profile.storyConfig.genre, "noir");
assert.ok(buildConfigBlock(blanked.profile.storyConfig).includes(MEGUMIN_FACTORY_PROFILE.storyConfig.pov));

// ── per-tab Global ──
const engineGlobal = { ...layered, globalTabs: { engine: true } };
const shared = resolveMeguminProfile({
  settings: engineGlobal,
  chat: {
    characterIds: ["solo"],
    metadata: { [MEGUMIN_PROFILE_METADATA_KEY]: { mode: "v10-core-cw", storyConfig: { genre: "noir" } } },
  },
});
assert.equal(shared.profile.mode, "v9-hybrid", "a Global tab's keys come from the default profile");
assert.equal(shared.profile.storyConfig.genre, "", "Story Config follows the Engine tab");
assert.equal(shared.profile.userLanguage, "Arabic", "other tabs stay per character");
assert.equal(meguminProfileKeyWriteScope(shared, "mode"), "default", "edits on a Global tab go to the default");
assert.equal(meguminProfileKeyWriteScope(shared, "userLanguage"), "chat");
const optOut = resolveMeguminProfile({
  settings: { ...engineGlobal, storyConfigGlobalSync: false },
  chat: {
    characterIds: ["solo"],
    metadata: { [MEGUMIN_PROFILE_METADATA_KEY]: { storyConfig: { genre: "noir" } } },
  },
});
assert.equal(optOut.profile.storyConfig.genre, "noir", "the Story Config opt-out keeps it per chat");
assert.equal(optOut.profile.mode, "v9-hybrid");

// ── Chat Settings Profiles carry the chat profile as configuration ──
assert.ok(CHAT_PROFILE_FOLLOWER_SYNC_KEYS.includes(MEGUMIN_PROFILE_METADATA_KEY));
assert.ok(!CHAT_PRESET_EXCLUDED_METADATA_KEYS.includes(MEGUMIN_PROFILE_METADATA_KEY));

// ── routes ──
const dataDir = mkdtempSync(join(tmpdir(), "megumin-settings-store-"));
const previousEnv = {
  DATA_DIR: process.env.DATA_DIR,
  FILE_STORAGE_DIR: process.env.FILE_STORAGE_DIR,
  MARINARA_FILE_STORAGE_DIR: process.env.MARINARA_FILE_STORAGE_DIR,
  NODE_ENV: process.env.NODE_ENV,
  MARINARA_LITE: process.env.MARINARA_LITE,
  LOG_LEVEL: process.env.LOG_LEVEL,
};
type InjectResponse = { statusCode: number; json(): any };
let app: {
  close(): Promise<void>;
  ready(): Promise<unknown>;
  inject(options: Record<string, unknown>): Promise<InjectResponse>;
} | null = null;

try {
  const fileStorageDir = join(dataDir, "file-storage");
  process.env.DATA_DIR = dataDir;
  process.env.FILE_STORAGE_DIR = fileStorageDir;
  process.env.MARINARA_FILE_STORAGE_DIR = fileStorageDir;
  process.env.NODE_ENV = "test";
  process.env.MARINARA_LITE = "true";
  process.env.LOG_LEVEL = "silent";

  const [{ buildApp }, { getDB }, { createChatsStorage }, { createCharactersStorage }, { updateMeguminSettings }] =
    await Promise.all([
      import("../../packages/server/src/app.js"),
      import("../../packages/server/src/db/connection.js"),
      import("../../packages/server/src/services/storage/chats.storage.js"),
      import("../../packages/server/src/services/storage/characters.storage.js"),
      import("../../packages/server/src/services/megumin/settings.js"),
    ]);
  app = (await buildApp()) as unknown as NonNullable<typeof app>;
  await app.ready();
  const db = await getDB();
  const chats = createChatsStorage(db);
  const characters = createCharactersStorage(db);
  const request = (method: string, url: string, payload?: unknown) =>
    app!.inject({ method, url: `/api/megumin${url}`, ...(payload === undefined ? {} : { payload }) });

  const alice = await characters.create(characterDataSchema.parse({ name: "Alice" }));
  const bob = await characters.create(characterDataSchema.parse({ name: "Bob" }));
  assert.ok(alice && bob);
  const newChat = async (characterIds: string[]) => {
    const chat = await chats.create({ name: "Megumin chat", mode: "roleplay", characterIds, connectionId: null });
    assert.ok(chat);
    return chat;
  };
  const aliceChat = await newChat([alice.id]);

  // Reads work while the switch is off; writes do not.
  const initial = await request("GET", "/settings");
  assert.equal(initial.statusCode, 200);
  assert.deepEqual(initial.json().settings, defaults);
  assert.equal(typeof initial.json().sizeBytes, "number");
  for (const [method, url, payload] of [
    ["PUT", "/settings", { global: { ...defaults.global, enableUtilityPrefill: true } }],
    ["PUT", "/profiles/default", { profile: { mode: "v9-hybrid" } }],
    ["PUT", `/profiles/characters/${alice.id}`, { profile: { mode: "v9-hybrid" } }],
    ["PUT", `/profiles/chats/${aliceChat.id}`, { profile: { mode: "v9-hybrid" } }],
  ] as const) {
    assert.equal((await request(method, url, payload)).statusCode, 409, `${url} refuses writes while off`);
  }
  assert.equal((await request("GET", `/profiles/chats/${aliceChat.id}`)).statusCode, 200);
  assert.deepEqual((await request("GET", "/settings")).json().settings, defaults, "nothing was written");

  const features = await app.inject({
    method: "PUT",
    url: "/api/app-settings/features",
    payload: { meguminMode: true },
  });
  assert.equal(features.statusCode, 200);

  // Settings sections replace what they name; profiles cannot go through this route.
  const globalUpdate = await request("PUT", "/settings", {
    global: { ...defaults.global, enableUtilityPrefill: true, utilityConnectionId: "conn-1" },
    globalTabs: { narrator: true },
  });
  assert.equal(globalUpdate.statusCode, 200);
  assert.equal(globalUpdate.json().settings.global.enableUtilityPrefill, true);
  assert.deepEqual(globalUpdate.json().settings.globalTabs, { narrator: true });
  assert.equal((await request("PUT", "/settings", { characterProfiles: {} })).statusCode, 400);
  assert.equal((await request("PUT", "/settings", { global: { saveMode: "never" } })).statusCode, 400);
  assert.equal(
    (await request("PUT", "/settings", { sharedFragments: bigFragments })).statusCode,
    400,
    "the 4 MB cap holds on the route",
  );

  // Default and character profiles.
  assert.equal((await request("PUT", "/profiles/default", { profile: { mode: "v9-hybrid" } })).statusCode, 200);
  assert.equal(
    (await request("PUT", "/profiles/default", { profile: { addons: ["dice", "dice_all"] } })).statusCode,
    400,
  );
  assert.equal((await request("PUT", "/profiles/default", {})).statusCode, 400, "the body names the profile");
  assert.equal(
    (await request("PUT", "/profiles/characters/missing", { profile: { mode: "v8-core" } })).statusCode,
    404,
    "a character profile needs a real character",
  );
  // Two editors saving different characters at once both land.
  const [saveAlice, saveBob] = await Promise.all([
    request("PUT", `/profiles/characters/${alice.id}`, { profile: { mode: "v8-core" } }),
    request("PUT", `/profiles/characters/${bob.id}`, { profile: { mode: "v7.5" } }),
  ]);
  assert.equal(saveAlice.statusCode, 200);
  assert.equal(saveBob.statusCode, 200);
  // Many saves at once: each reads, changes and writes inside the queue, so none is lost.
  await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      updateMeguminSettings(db, (current) => ({
        ...current,
        sharedFragments: { ...current.sharedFragments, [`slot${i}`]: `text ${i}` },
      })),
    ),
  );
  const afterBoth = (await request("GET", "/settings")).json().settings as MeguminSettings;
  assert.equal(Object.keys(afterBoth.sharedFragments).length, 8, "concurrent saves all land");
  assert.deepEqual(afterBoth.characterProfiles, { [alice.id]: { mode: "v8-core" }, [bob.id]: { mode: "v7.5" } });
  assert.deepEqual(afterBoth.defaultProfile, { mode: "v9-hybrid" });
  assert.equal(afterBoth.global.utilityConnectionId, "conn-1", "profile saves leave the other sections alone");

  let state = (await request("GET", `/profiles/chats/${aliceChat.id}`)).json();
  assert.equal(state.profile.mode, "v8-core");
  assert.equal(state.writeScope, "character");
  assert.deepEqual(state.layers, ["default", "character"]);

  // The chat's own profile.
  const pin = await request("PUT", `/profiles/chats/${aliceChat.id}`, { profile: { mode: "v10-core-cw" } });
  assert.equal(pin.statusCode, 200);
  assert.equal(pin.json().profile.mode, "v10-core-cw");
  assert.equal(pin.json().writeScope, "chat");
  const storedChat = await chats.getById(aliceChat.id);
  assert.deepEqual(JSON.parse(storedChat!.metadata as string)[MEGUMIN_PROFILE_METADATA_KEY], { mode: "v10-core-cw" });
  assert.equal(
    (await request("PUT", `/profiles/chats/${aliceChat.id}`, { profile: { userPronouns: "they" } })).statusCode,
    400,
  );
  const unpin = await request("PUT", `/profiles/chats/${aliceChat.id}`, { profile: null });
  assert.equal(unpin.json().profile.mode, "v8-core", "resetting the chat falls back to the character");
  assert.equal(unpin.json().writeScope, "character");
  assert.equal((await request("PUT", "/profiles/chats/missing", { profile: {} })).statusCode, 404);

  // Resetting a character profile deletes it.
  await request("PUT", `/profiles/characters/${alice.id}`, { profile: null });
  state = (await request("GET", `/profiles/chats/${aliceChat.id}`)).json();
  assert.equal(state.profile.mode, "v9-hybrid");
  assert.deepEqual(Object.keys((await request("GET", "/settings")).json().settings.characterProfiles), [bob.id]);

  // A chat profile that no longer validates (a newer version wrote it) is kept: an edit is refused,
  // and only an explicit reset replaces it.
  const futureChat = await newChat([alice.id]);
  const futureProfile = { mode: "v8-core", addons: ["future_addon"] };
  await chats.patchMetadata(futureChat.id, { [MEGUMIN_PROFILE_METADATA_KEY]: futureProfile });
  const overFuture = await request("PUT", `/profiles/chats/${futureChat.id}`, { profile: { layout: "cache" } });
  assert.equal(overFuture.statusCode, 423, "an edit over an unreadable chat profile is refused");
  assert.deepEqual(
    JSON.parse((await chats.getById(futureChat.id))!.metadata as string)[MEGUMIN_PROFILE_METADATA_KEY],
    futureProfile,
    "and leaves it as it was",
  );
  const resetFuture = await request("PUT", `/profiles/chats/${futureChat.id}`, { profile: null });
  assert.equal(resetFuture.statusCode, 200, "a reset discards it on purpose");

  // The whole store: one entry a newer version wrote (an add-on this build does not know) makes the
  // stored value invalid. Reads fall back to the defaults, and no write may save them over it.
  const { createAppSettingsStorage } = await import("../../packages/server/src/services/storage/app-settings.storage.js");
  const appSettings = createAppSettingsStorage(db);
  const goodStore = (await request("GET", "/settings")).json().settings as MeguminSettings;
  const futureStore = {
    ...goodStore,
    defaultProfile: { mode: "v10-shura" },
    characterProfiles: { ...goodStore.characterProfiles, [alice.id]: { mode: "v8-core", addons: ["future_addon"] } },
  };
  await appSettings.set("megumin", JSON.stringify(futureStore));
  assert.deepEqual((await request("GET", "/settings")).json().settings, defaults, "reads fall back to the defaults");
  for (const [method, url, payload] of [
    ["PUT", "/settings", { global: { ...defaults.global, enableUtilityPrefill: true } }],
    ["PUT", "/profiles/default", { profile: null }],
    ["PUT", `/profiles/characters/${bob.id}`, { profile: { mode: "v9-hybrid" } }],
  ] as const) {
    const refused = await request(method, url, payload);
    assert.equal(refused.statusCode, 423, `${url} refuses to save over an unreadable store`);
    assert.match(refused.json().error, /could not be read/u);
  }
  await assert.rejects(
    updateMeguminSettings(db, (current) => current),
    (err: Error & { statusCode?: number }) => err.statusCode === 423,
  );
  assert.deepEqual(JSON.parse((await appSettings.get("megumin"))!), futureStore, "the stored value is untouched");
  await appSettings.set("megumin", JSON.stringify(goodStore));
  assert.equal((await request("PUT", "/profiles/default", { profile: { mode: "v9-hybrid" } })).statusCode, 200);
  await appSettings.set("megumin", "not json");
  assert.equal(
    (await request("PUT", "/profiles/default", { profile: { mode: "v9-hybrid" } })).statusCode,
    200,
    "a value that is not JSON holds nothing to keep, so a write replaces it",
  );

  // A guest's joined room chat belongs to the host; the host's own room chat does not.
  const guestChat = await newChat([alice.id]);
  await chats.patchMetadata(guestChat.id, {
    multiplayer: { version: 1, role: "guest", roomId: "room", hostFingerprint: "fp", status: "joined" },
  });
  const guestWrite = await request("PUT", `/profiles/chats/${guestChat.id}`, { profile: { mode: "v8-core" } });
  assert.equal(guestWrite.statusCode, 403);
  const guestMeta = JSON.parse((await chats.getById(guestChat.id))!.metadata as string);
  assert.equal(guestMeta[MEGUMIN_PROFILE_METADATA_KEY], undefined, "a refused write changes nothing");
  const hostChat = await newChat([alice.id]);
  await chats.patchMetadata(hostChat.id, {
    multiplayer: { version: 1, role: "host", roomId: "room", status: "lobby" },
  });
  assert.equal(
    (await request("PUT", `/profiles/chats/${hostChat.id}`, { profile: { mode: "v8-core" } })).statusCode,
    200,
    "the host edits its room chat",
  );
} finally {
  await app?.close();
  for (const [key, value] of Object.entries(previousEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  rmSync(dataDir, { recursive: true, force: true });
}

console.info("Megumin settings store regression passed.");
