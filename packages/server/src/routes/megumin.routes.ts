// ──────────────────────────────────────────────
// Routes: Megumin Suite (/api/megumin)
// ──────────────────────────────────────────────
// The panel's reads and writes. Everything a chat shows or changes runs inside
// that chat's Megumin scope, so it reads and saves exactly what the engine does.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  MEGUMIN_DEFAULT_PRESET_SYSTEM_KEY,
  MEGUMIN_PRESETS,
  MeguminBgPrompts,
  MeguminKeys,
  MeguminProfile,
  MeguminState,
  MeguminSync,
  MeguminTasks,
  MeguminMemory,
  MeguminMemoryVectors,
  MeguminMemoryKeywords,
  MeguminChatText,
  MeguminLibrary,
  MEGUMIN_BUILTIN_BAN_LIST,
  MEGUMIN_V11_BAN_LIST,
  meguminToastr,
  localProfile,
  meguminApplyLoadout,
  meguminBanListScan,
  meguminCatalog,
  meguminChatView,
  meguminCloneEngine,
  meguminDevModeData,
  applyMeguminProfileOps,
  isSafeMeguminProfilePath,
  MeguminProfileConflictError,
  type MeguminProfileOp,
  meguminChomusukeTest,
  meguminCotById,
  meguminEngineById,
  meguminGenerateImage,
  meguminGenerateTemplateStyle,
  meguminMemoryProcess,
  meguminNpcAdd,
  meguminNpcPortraitPrompt,
  meguminNpcPortraitRender,
  MeguminDict,
  MeguminBlocks,
  MeguminImagesV2,
  MeguminImagesLooks,
  meguminNpcScanStory,
  meguminNpcUndo,
  meguminNpcUpdateNow,
  meguminReadAgain,
  meguminRegenerateStyle,
  meguminStoryPlanGenerate,
  meguminStyleInsights,
  meguminStyleRule,
  getContext,
} from "@marinara-engine/shared/megumin";
import { isStockMarinaraUniversalPreset } from "@marinara-engine/shared";
import { createPromptsStorage } from "../services/storage/prompts.storage.js";
import { createChatsStorage } from "../services/storage/chats.storage.js";
import {
  ensureMeguminStore,
  isMeguminEnabled,
  meguminStoreObject,
  mirrorMeguminPowerSwitch,
  scheduleMeguminStoreSave,
} from "../services/megumin/megumin-store.js";
import {
  meguminChatActivity,
  reloadMeguminProfiles,
  shareMeguminProfileOps,
  withMeguminChat,
  withMeguminGlobal,
} from "../services/megumin/megumin-runtime.js";

const GLOBAL_KEYS = [
  "globalSettings",
  "chomusuke",
  "sidePanel",
  "presentBar",
  "sharedFragments",
  "customModes",
  "configPresets",
  "globalSyncTabs",
] as const;

const globalPatchSchema = z
  .object(
    Object.fromEntries(GLOBAL_KEYS.map((key) => [key, z.unknown().optional()])) as Record<
      (typeof GLOBAL_KEYS)[number],
      z.ZodOptional<z.ZodUnknown>
    >,
  )
  .strict();

const actionSchema = z.object({
  action: z.string().min(1).max(64),
  args: z.record(z.string(), z.unknown()).optional().default({}),
});

const profilePatchSchema = z.object({
  patch: z
    .array(
      z.union([
        z.object({ op: z.literal("set"), path: z.array(z.string()), value: z.unknown(), base: z.unknown().optional() }),
        z.object({ op: z.literal("unset"), path: z.array(z.string()) }),
      ]),
    )
    .max(2000),
});

/**
 * Applies what the panel changed to the scope's live profile, then saves it the way Megumin does. Only the
 * changed leaves are written: the rest of the profile (what Megumin's background work wrote meanwhile) and
 * every nested object's identity (which running jobs hold) are kept.
 */
function saveEditedProfile(body: unknown) {
  const parsed = profilePatchSchema.safeParse(body ?? {});
  if (!parsed.success) throw new Error("A list of profile changes is required.");
  const ops = parsed.data.patch as MeguminProfileOp[];
  if (!ops.every((op) => isSafeMeguminProfilePath(op.path))) throw new Error("A profile change has an invalid path.");
  if (!ops.length) return;
  applyMeguminProfileOps(localProfile as Record<string, unknown>, ops);
  MeguminProfile.saveProfileToMemory();
  // Other open chats on this profile (same character, or the default) take the change now, so one still
  // working cannot save its older copy over it.
  shareMeguminProfileOps(getContext().chatId ?? null, MeguminKeys.getCharacterKey() || "default", ops);
  // A tab set to Global copies its keys to every profile when it is edited (Megumin's TAB_PROPAGATE).
  const touched = new Set(ops.map((op) => op.path[0]));
  const synced = (meguminStoreObject().globalSyncTabs || {}) as Record<string, boolean>;
  for (const [title, on] of Object.entries(synced)) {
    const keys = (MeguminSync.meguminTabSyncKeys(title) || []) as string[];
    if (on && keys.some((key) => touched.has(key))) MeguminSync.applyTabKeysToAllProfiles(title);
  }
}

const isProfileConflict = (err: unknown) =>
  err instanceof MeguminProfileConflictError || (err as { conflict?: unknown } | null)?.conflict === true;

function messageIndex(messageId: unknown): number {
  const chat = getContext().chat as Array<{ id: string }>;
  return chat.findIndex((m) => m.id === messageId);
}

async function runAction(action: string, args: Record<string, unknown>): Promise<unknown> {
  const str = (key: string) => (typeof args[key] === "string" ? (args[key] as string) : "");
  const num = (key: string) => (typeof args[key] === "number" ? (args[key] as number) : Number(args[key]));
  switch (action) {
    // World State
    case "world.edit":
      return MeguminState.worldEdit(Array.isArray(args.changes) ? args.changes : []);
    case "world.disable":
      return MeguminState.worldSetEntryDisabled(str("entryId"), args.disabled === true);
    case "world.removeUserEntry":
      return MeguminState.worldRemoveUserEntry(str("entryId"));
    case "world.sameCharacter":
      return MeguminState.worldSameCharacter(str("name"), str("into"));
    case "world.import":
      return MeguminState.worldImportRange(num("from"), num("to"));
    case "world.reset":
      MeguminState.stateStore.reset("world");
      return true;
    case "world.rewritePending":
      return MeguminState.stateStore.isPendingFullRewrite("world");
    // History › "Rewrite the full state next reply"
    case "world.rewrite":
      MeguminState.stateStore.setPendingFullRewrite("world", args.on === true);
      return MeguminState.stateStore.isPendingFullRewrite("world");
    // Bonds, Character Sheet, Inner Chatter, Story Tracker
    case "stats.edit":
      return MeguminState.statsEdit(str("moduleId"), args.parsed);
    case "stats.reset":
      MeguminState.stateStore.reset(str("moduleId"));
      return true;
    // Every character's bonds on file, marked when they are in the last few messages (bonds/overview.js)
    case "bonds.overview": {
      const chat = (getContext().chat || []) as Array<{ is_system?: boolean; mes?: string }>;
      const parts: string[] = [];
      for (let i = chat.length - 1; i >= 0 && parts.length < 3; i--) {
        const m = chat[i];
        if (!m || m.is_system) continue;
        parts.push(MeguminChatText.meguminCleanChatHistoryText(String(m.mes || "")));
      }
      return MeguminState.bondsOverview({ recentText: parts.join("\n") });
    }
    case "state.disableEntry":
      return MeguminState.stateStore.setDisabled(str("entryId"), args.disabled === true);
    // The Notebook
    // A clue's turn number → the reply it came from, "user" (your edit) or "deleted" (state/index.js notebookTurnLabel)
    case "notebook.turnLabels": {
      const chat = getContext().chat as Array<{ is_user?: boolean; extra?: Record<string, any> }>;
      const seqToIndex = new Map<number, number>();
      chat.forEach((m, i) => {
        if (m && !m.is_user && typeof m.extra?.megumin_seq === "number") seqToIndex.set(m.extra.megumin_seq, i);
      });
      const userSeqs = new Set(
        ((MeguminState.stateStore.listEntries("notebook") || []) as Array<{ entry: { source?: string; seq: number } }>)
          .filter((x) => x.entry.source === "user")
          .map((x) => x.entry.seq),
      );
      const state = (MeguminState.notebookState() || { truths: {} }) as { truths?: Record<string, any> };
      const out: Record<string, number | "user" | "deleted"> = {};
      const add = (seq: unknown) => {
        if (typeof seq !== "number") return;
        out[seq] = seqToIndex.has(seq) ? seqToIndex.get(seq)! : userSeqs.has(seq) ? "user" : "deleted";
      };
      for (const t of Object.values(state.truths || {})) {
        add(t.createdSeq);
        add(t.revealedSeq);
        for (const c of t.clues || []) add(c.seq);
      }
      return out;
    }
    case "notebook.edit":
      return MeguminState.notebookEdit(args.op);
    case "notebook.disable":
      return MeguminState.notebookSetEntryDisabled(str("entryId"), args.disabled === true);
    case "notebook.reset":
      MeguminState.stateStore.reset("notebook");
      return true;
    // Cards
    case "readAgain": {
      const kind = str("kind");
      if (kind !== "world" && kind !== "blocks" && kind !== "notebook") throw new Error("Unknown card.");
      return meguminReadAgain(kind, messageIndex(args.messageId));
    }
    // NPC Bank
    case "npc.scan":
      return meguminNpcScanStory();
    case "npc.add":
      return meguminNpcAdd(str("name"));
    case "npc.updateNow":
      return meguminNpcUpdateNow(num("index"));
    case "npc.undo":
      return meguminNpcUndo(str("entryId"));
    // NPC portrait in two steps: the prompt (reviewed in the panel), then the drawing
    case "npc.portraitPrompt":
      return meguminNpcPortraitPrompt(str("name"));
    case "npc.portraitRender":
      return meguminNpcPortraitRender(str("name"), str("prompt"));
    // Blocks tab preview (features/blocks/ui.js renderBlocksPreview): the templates the AI fills, as one envelope
    case "blocks.preview": {
      let dict: Record<string, string> = {};
      try {
        dict = (MeguminDict.buildBaseDict(true) || {}) as Record<string, string>;
      } catch {
        dict = {};
      }
      const active = MeguminBlocks.meguminActiveBlocks() as Array<Record<string, any>>;
      const parts = active.map((b) => {
        let raw: unknown;
        if (b.slot) raw = "[Only appears when the story introduces a new NPC.]";
        else if (typeof b.build === "function") raw = b.build();
        else if (b.source) raw = dict[b.source] || "";
        else raw = b.content || "";
        const body = b.slot
          ? String(raw)
          : MeguminBlocks.normalizeBlockBody(
              String(raw).replace(/^#{1,3}\s*At the end of your response[^\n]*\n?/i, ""),
              b.tag,
            );
        return body ? `<${b.tag}>\n${body}\n</${b.tag}>` : "";
      });
      return `<Blocks>\n${parts.filter(Boolean).join("\n")}\n</Blocks>`;
    }
    // Images › Version 2 › Characters
    case "images.cast":
      return { cast: MeguminImagesV2.currentImageCast(), hasCard: Boolean(MeguminImagesLooks.sheetSource()) };
    case "images.scanLooks": {
      const from = str("from") === "sheet" ? "sheet" : "chat";
      const targets = Array.isArray(args.targets)
        ? (args.targets as Array<{ name?: unknown; aliases?: unknown }>)
            .filter((x) => typeof x?.name === "string")
            .map((x) => ({ name: String(x.name), aliases: Array.isArray(x.aliases) ? x.aliases.map(String) : [] }))
        : [];
      return (await MeguminImagesLooks.scanLooks({ from, targets: targets as never[] })) ?? null;
    }
    case "images.describeLooks": {
      const names = Array.isArray(args.names) ? (args.names as unknown[]).map(String) : null;
      return (await MeguminImagesLooks.describeLooks(names as never)) ?? null;
    }
    // Banned Phrases
    case "banlist.scan":
      return meguminBanListScan();
    // Writing Style generator
    case "style.template":
      return meguminGenerateTemplateStyle(str("name"));
    case "style.regenerate":
      return meguminRegenerateStyle(str("id"));
    case "style.insights":
      return meguminStyleInsights();
    case "style.rule":
      return meguminStyleRule(Array.isArray(args.tags) ? (args.tags as string[]) : [], str("notes"));
    // Story Director
    case "storyPlan.generate":
      return meguminStoryPlanGenerate();
    // Memory
    case "memory.process":
      return meguminMemoryProcess();
    case "memory.migrate":
      return MeguminMemory.memRunVaultMigration();
    case "memory.scrub":
      return MeguminMemory.memScrubOverlappingArchives({ notify: true });
    // "Apply & Extract Pending": new limits, then extraction when the chat is already past them
    case "memory.applyLimits": {
      MeguminMemory.memSyncLimits();
      const mem = (localProfile as Record<string, any>).memoryCore || {};
      const real = (getContext().chat as Array<{ is_system?: boolean }>).filter((m) => !m.is_system).length;
      if (real > (mem.workingLimit || 30)) {
        meguminToastr.info("Starting automatic extraction to fill new limits...");
        await MeguminMemory.memProcessPendingChunks();
      }
      return true;
    }
    // Picking Semantic: the vault is embedded, then the current query is matched
    case "memory.vectorSync": {
      const vault = ((localProfile as Record<string, any>).memoryCore?.longTermVault || []) as unknown[];
      if (!vault.length) return { count: 0, inserted: false };
      const inserted = await MeguminMemoryVectors.memInsertToVectorDB(vault as never);
      await MeguminMemoryVectors.memUpdateSemanticQuery();
      return { count: vault.length, inserted };
    }
    case "memory.vectorInsert": {
      const ids = new Set(Array.isArray(args.ids) ? (args.ids as string[]) : []);
      const vault = ((localProfile as Record<string, any>).memoryCore?.longTermVault || []) as Array<{ id: string }>;
      return MeguminMemoryVectors.memInsertToVectorDB(vault.filter((v) => ids.has(v.id)) as never);
    }
    case "memory.vectorDelete":
      await MeguminMemoryVectors.memDeleteFromVectorDB(Array.isArray(args.ids) ? (args.ids as string[]) : []);
      return true;
    // "Test Scanner": what retrieval would pick right now
    case "memory.testScanner": {
      const mem = (localProfile as Record<string, any>).memoryCore || {};
      const engine = mem.scannerEngine || "tfidf";
      if (engine === "semantic") await MeguminMemoryVectors.memUpdateSemanticQuery();
      const semanticCount = MeguminMemoryVectors.currentSemanticMatches.length;
      const keywords =
        engine === "tfidf" || semanticCount === 0
          ? MeguminMemoryKeywords.memGetCachedKeywords(getContext().chat, 4).keywords
          : [];
      const matches = (MeguminMemory.memGetRelevantVaultEntries() as Array<Record<string, any>>).map((m) => ({
        id: m.id,
        score: m.score,
        matchedWords: m.matchedWords || [],
        text: m.text || m.summary || "",
      }));
      return { engine, vaultCount: (mem.longTermVault || []).length, semanticCount, keywords, matches };
    }
    // The three prompt editors' "use these prompts everywhere" (core/sync.js syncPromptsGlobally)
    case "prompts.sync":
    case "prompts.syncGlobal": {
      const module = str("module");
      const key = str("key");
      const keys: Record<string, string[]> = {
        storyPlan: ["customPrompts", "customPromptsEnabled"],
        memoryCore: ["customPrompts", "customPromptsEnabled"],
        imageGen: ["customPrompts", "customPromptsEnabled"],
        npcBank: ["customPrompts", "customPromptsEnabled"],
        banList: ["banListCustomPrompts", "banListCustomPromptsEnabled"],
      };
      if (!keys[module]?.includes(key)) throw new Error("Unknown prompt setting.");
      MeguminSync.syncPromptsGlobally(module, key, args.value);
      return true;
    }
    // The built-in ban list the "Edit the full list" popup edits (banlist/ui.js fullList)
    case "banlist.builtInList": {
      const store = meguminStoreObject();
      const modes = [...(MeguminLibrary.modes as unknown[]), ...((store.customModes as unknown[]) || [])] as Array<
        Record<string, any>
      >;
      const engine = modes.find((m) => m.id === (localProfile as Record<string, any>).mode);
      return engine?.turnFrame === "v11"
        ? { key: "banlistBuiltInV11", original: MEGUMIN_V11_BAN_LIST, name: engine.label ?? "" }
        : { key: "banlistBuiltIn", original: MEGUMIN_BUILTIN_BAN_LIST, name: "" };
    }
    // Model Setup
    case "loadout.apply":
      return meguminApplyLoadout(str("id"), {
        onlyThisCharacter: args.onlyThisCharacter === true,
        settings:
          args.settings && typeof args.settings === "object" ? (args.settings as Record<string, unknown>) : undefined,
      });
    // Chomusuke
    case "chomusuke.test":
      return meguminChomusukeTest();
    case "chomusuke.stop": {
      const chatId = getContext().chatId;
      return MeguminTasks.stopChomusukeJobs((e) => e.chatId === chatId);
    }
    // Images
    case "image.generate":
      return meguminGenerateImage(str("extra"));
    // The panel's per-tab Global switch (ui/tabs.js toggleTabGlobalSync)
    case "sync.tab": {
      const title = str("title");
      if (!MeguminSync.meguminTabSyncKeys(title)?.length) throw new Error("This tab has nothing to sync.");
      const map = MeguminSync.meguminGlobalSyncMap() as Record<string, boolean>;
      map[title] = args.on === true;
      if (map[title] && !MeguminSync.applyTabKeysToAllProfiles(title)) {
        map[title] = false;
        throw new Error("The settings could not be copied to every character.");
      }
      return map[title];
    }
    // Story Config's own opt-out from the Preset & Thinking tab's Global switch
    case "sync.storyConfig": {
      const on = args.on === true;
      MeguminSync.meguminSetStoryConfigSyncs(on);
      // Turned back on: the current values go out again (storyconfig/ui.js buildConfigSyncRow).
      if (on && MeguminSync.meguminIsTabSynced("Preset & Thinking")) {
        MeguminSync.applyTabKeysToAllProfiles("Preset & Thinking");
      }
      MeguminProfile.saveProfileToMemory();
      return MeguminSync.meguminStoryConfigSyncs();
    }
    default:
      throw new Error(`Unknown Megumin action: ${action}`);
  }
}

export async function meguminRoutes(app: FastifyInstance) {
  const presets = createPromptsStorage(app.db);
  const chats = createChatsStorage(app.db);

  const requireChat = async (chatId: string) => {
    const chat = await chats.getById(chatId);
    return chat ?? null;
  };

  /** MEGUMINTOGGLE and the bundled presets. */
  app.get("/status", async () => {
    const all = (await presets.list()) as Array<{ id: string; name: string; systemKey?: string }>;
    return {
      enabled: isMeguminEnabled(),
      defaultPresetSystemKey: MEGUMIN_DEFAULT_PRESET_SYSTEM_KEY,
      // The preset MEGUMINTOGGLE swaps for Megumin's (and back to, when off).
      stockPresetId: all.find((p) => isStockMarinaraUniversalPreset(p as never))?.id ?? null,
      presets: MEGUMIN_PRESETS.map((def) => {
        const row = all.find((p) => p.systemKey === def.systemKey);
        return { systemKey: def.systemKey, name: def.name, description: def.description, id: row?.id ?? null };
      }),
    };
  });

  /** The library every tab picks from (engines, CoTs, styles, add-ons, blocks, slots, loadouts…). */
  app.get("/catalog", async () => meguminCatalog());

  app.get<{ Params: { id: string } }>("/engines/:id", async (req, reply) => {
    await ensureMeguminStore(app.db);
    const engine = meguminEngineById(req.params.id, (meguminStoreObject().customModes as unknown[]) || []);
    if (!engine) return reply.status(404).send({ error: "Engine not found" });
    return engine;
  });

  app.get<{ Params: { id: string } }>("/cots/:id", async (req, reply) => {
    const cot = meguminCotById(req.params.id);
    if (!cot) return reply.status(404).send({ error: "Chain of thought not found" });
    return cot;
  });

  /** Install-wide parts of the store: Chomusuke, the side panel, Settings, Dev Mode's fragments and engines. */
  app.put("/global", async (req, reply) => {
    const parsed = globalPatchSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: "Invalid Megumin settings" });
    await ensureMeguminStore(app.db);
    const store = meguminStoreObject();
    for (const [key, value] of Object.entries(parsed.data)) {
      if (value === undefined) continue;
      store[key] = JSON.parse(JSON.stringify(value)) as unknown;
    }
    // A globalSettings write never carries the power switch: put MEGUMINTOGGLE's mirror back at once.
    mirrorMeguminPowerSwitch();
    scheduleMeguminStoreSave(app.db, 50);
    reloadMeguminProfiles();
    return { ok: true };
  });

  /** The global default profile (the panel with no chat open). */
  app.get("/global/view", async () => withMeguminGlobal(app.db, () => meguminChatView()));

  app.put("/global/profile", async (req, reply) => {
    try {
      return await withMeguminGlobal(app.db, () => {
        saveEditedProfile(req.body);
        return meguminChatView();
      });
    } catch (err) {
      return reply
        .status(isProfileConflict(err) ? 409 : 400)
        .send({ error: err instanceof Error ? err.message : "Invalid profile changes" });
    }
  });

  /** "Reset" on the global default profile. */
  app.post("/global/profile/reset", async () =>
    withMeguminGlobal(app.db, () => {
      const store = meguminStoreObject();
      if (store.profiles && typeof store.profiles === "object")
        delete (store.profiles as Record<string, unknown>).default;
      scheduleMeguminStoreSave(app.db, 50);
      MeguminProfile.initProfile();
      return meguminChatView();
    }),
  );

  /** Dev Mode: the slot registry and the preset skeleton, resolved against the profile in effect. */
  app.get("/global/devmode", async () => withMeguminGlobal(app.db, () => meguminDevModeData()));

  app.get<{ Params: { chatId: string } }>("/chats/:chatId/devmode", async (req, reply) => {
    const chat = await requireChat(req.params.chatId);
    if (!chat) return reply.status(404).send({ error: "Chat not found" });
    const presetId = (chat as { promptPresetId?: string | null }).promptPresetId;
    const preset = presetId ? ((await presets.getById(presetId)) as { name?: string } | null) : null;
    return withMeguminChat(app.db, req.params.chatId, () => meguminDevModeData({ presetName: preset?.name ?? "" }));
  });

  /** Dev Mode's "Clone" on a shipped engine. */
  app.get<{ Params: { engineId: string } }>("/global/devmode/clone/:engineId", async (req, reply) => {
    const copy = await withMeguminGlobal(app.db, () => meguminCloneEngine(req.params.engineId));
    return copy ?? reply.status(404).send({ error: "Engine not found" });
  });

  app.get<{ Params: { chatId: string; engineId: string } }>(
    "/chats/:chatId/devmode/clone/:engineId",
    async (req, reply) => {
      if (!(await requireChat(req.params.chatId))) return reply.status(404).send({ error: "Chat not found" });
      const copy = await withMeguminChat(app.db, req.params.chatId, () => meguminCloneEngine(req.params.engineId));
      return copy ?? reply.status(404).send({ error: "Engine not found" });
    },
  );

  /** A panel button with no Roleplay chat open (the Global switch, Story Config's sync). */
  app.post("/global/actions", async (req, reply) => {
    const parsed = actionSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: "An action name is required" });
    try {
      const result = await withMeguminGlobal(app.db, () => runAction(parsed.data.action, parsed.data.args));
      scheduleMeguminStoreSave(app.db, 50);
      return { ok: true, result: result === undefined ? null : JSON.parse(JSON.stringify(result)) };
    } catch (err) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : "The action failed" });
    }
  });

  /** Everything the panel and the cards draw for a chat. */
  app.get<{ Params: { chatId: string }; Querystring: { history?: string } }>(
    "/chats/:chatId/view",
    async (req, reply) => {
      if (!(await requireChat(req.params.chatId))) return reply.status(404).send({ error: "Chat not found" });
      return withMeguminChat(app.db, req.params.chatId, () => meguminChatView({ history: req.query.history === "1" }));
    },
  );

  /** Saves the profile in effect for this chat (per character, per chat or the default, by save mode). */
  app.put<{ Params: { chatId: string } }>("/chats/:chatId/profile", async (req, reply) => {
    if (!(await requireChat(req.params.chatId))) return reply.status(404).send({ error: "Chat not found" });
    try {
      return await withMeguminChat(app.db, req.params.chatId, () => {
        saveEditedProfile(req.body);
        return meguminChatView();
      });
    } catch (err) {
      return reply
        .status(isProfileConflict(err) ? 409 : 400)
        .send({ error: err instanceof Error ? err.message : "Invalid profile" });
    }
  });

  /** "Reset": this chat's (or character's) profile goes back to the default template. */
  app.post<{ Params: { chatId: string } }>("/chats/:chatId/profile/reset", async (req, reply) => {
    if (!(await requireChat(req.params.chatId))) return reply.status(404).send({ error: "Chat not found" });
    return withMeguminChat(app.db, req.params.chatId, () => {
      // Megumin's Reset: drop the profile saved under this chat's key and load it afresh.
      const store = meguminStoreObject();
      const key = MeguminKeys.getCharacterKey() || "default";
      if (store.profiles && typeof store.profiles === "object") delete (store.profiles as Record<string, unknown>)[key];
      scheduleMeguminStoreSave(app.db, 50);
      MeguminProfile.initProfile();
      return meguminChatView();
    });
  });

  /** A button in the panel or on a card. */
  app.post<{ Params: { chatId: string } }>("/chats/:chatId/actions", async (req, reply) => {
    const parsed = actionSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: "An action name is required" });
    if (!(await requireChat(req.params.chatId))) return reply.status(404).send({ error: "Chat not found" });
    try {
      const result = await withMeguminChat(app.db, req.params.chatId, () =>
        runAction(parsed.data.action, parsed.data.args),
      );
      // Some actions change the suite's store without saving it (the Global switch writes profiles directly).
      scheduleMeguminStoreSave(app.db, 50);
      return { ok: true, result: result === undefined ? null : JSON.parse(JSON.stringify(result)) };
    } catch (err) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : "The action failed" });
    }
  });

  /** Notices and the change counter since the client's last poll, and what Chomusuke is doing. */
  app.get<{ Params: { chatId: string }; Querystring: { after?: string } }>("/chats/:chatId/activity", async (req) => {
    const after = Number(req.query.after) || 0;
    const activity = meguminChatActivity(req.params.chatId, after);
    return {
      ...activity,
      chomusuke: MeguminTasks.chomusukeStatusFor(req.params.chatId),
      waitingForReads: Boolean(MeguminTasks.chomusukeSessionPromise(req.params.chatId)),
    };
  });

  /** The last background prompts Megumin sent for this chat (Settings › Background prompts). */
  app.get<{ Params: { chatId: string } }>("/chats/:chatId/background-log", async (req) => ({
    entries: await MeguminBgPrompts.readBackgroundLog(req.params.chatId),
  }));

  app.delete<{ Params: { chatId: string } }>("/chats/:chatId/background-log", async (req) => {
    await MeguminBgPrompts.clearBackgroundLog(req.params.chatId);
    return { ok: true };
  });
}
