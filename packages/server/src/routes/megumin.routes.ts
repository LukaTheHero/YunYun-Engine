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
  localProfile,
  meguminApplyLoadout,
  meguminBanListScan,
  meguminCatalog,
  meguminChatView,
  meguminChomusukeTest,
  meguminCotById,
  meguminEngineById,
  meguminGenerateImage,
  meguminGenerateTemplateStyle,
  meguminMemoryProcess,
  meguminNpcAdd,
  meguminNpcPortrait,
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
import { createPromptsStorage } from "../services/storage/prompts.storage.js";
import { createChatsStorage } from "../services/storage/chats.storage.js";
import {
  ensureMeguminStore,
  isMeguminEnabled,
  meguminStoreObject,
  scheduleMeguminStoreSave,
} from "../services/megumin/megumin-store.js";
import {
  meguminChatActivity,
  reloadMeguminProfiles,
  withMeguminChat,
  withMeguminGlobal,
} from "../services/megumin/megumin-runtime.js";

const GLOBAL_KEYS = [
  "globalSettings",
  "chomusuke",
  "sidePanel",
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

function replaceInPlace(target: Record<string, unknown>, next: Record<string, unknown>) {
  for (const key of Object.keys(target)) if (!(key in next)) delete target[key];
  Object.assign(target, next);
}

/** Writes a profile edited in the panel into the scope's live profile, then saves it the way Megumin does. */
function saveEditedProfile(next: unknown) {
  if (!next || typeof next !== "object" || Array.isArray(next)) throw new Error("A profile object is required.");
  const live = localProfile as Record<string, unknown>;
  replaceInPlace(live, JSON.parse(JSON.stringify(next)) as Record<string, unknown>);
  MeguminProfile.saveProfileToMemory();
  // A tab set to Global copies itself to every profile on each save (Megumin's TAB_PROPAGATE).
  const synced = (meguminStoreObject().globalSyncTabs || {}) as Record<string, boolean>;
  for (const [title, on] of Object.entries(synced)) if (on) MeguminSync.applyTabKeysToAllProfiles(title);
}

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
    // Bonds, Character Sheet, Inner Chatter, Story Tracker
    case "stats.edit":
      return MeguminState.statsEdit(str("moduleId"), args.parsed);
    case "stats.reset":
      MeguminState.stateStore.reset(str("moduleId"));
      return true;
    case "state.disableEntry":
      return MeguminState.stateStore.setDisabled(str("entryId"), args.disabled === true);
    // The Notebook
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
    case "npc.portrait":
      return meguminNpcPortrait(str("name"));
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
    default:
      throw new Error(`Unknown Megumin action: ${action}`);
  }
}

export async function meguminRoutes(app: FastifyInstance) {
  const presets = createPromptsStorage(app.db);
  const chats = createChatsStorage(app.db);

  /** MEGUMINTOGGLE and the bundled presets. */
  app.get("/status", async () => {
    const all = (await presets.list()) as Array<{ id: string; name: string; systemKey?: string }>;
    return {
      enabled: isMeguminEnabled(),
      defaultPresetSystemKey: MEGUMIN_DEFAULT_PRESET_SYSTEM_KEY,
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
    scheduleMeguminStoreSave(app.db, 50);
    reloadMeguminProfiles();
    return { ok: true };
  });

  /** The global default profile (the panel with no chat open). */
  app.get("/global/view", async () => withMeguminGlobal(app.db, () => meguminChatView()));

  app.put("/global/profile", async (req) =>
    withMeguminGlobal(app.db, () => {
      saveEditedProfile((req.body as { profile?: unknown })?.profile);
      return meguminChatView();
    }),
  );

  const requireChat = async (chatId: string) => {
    const chat = await chats.getById(chatId);
    return chat ?? null;
  };

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
        saveEditedProfile((req.body as { profile?: unknown })?.profile);
        return meguminChatView();
      });
    } catch (err) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : "Invalid profile" });
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
