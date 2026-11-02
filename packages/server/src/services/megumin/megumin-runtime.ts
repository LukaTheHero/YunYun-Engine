// ──────────────────────────────────────────────
// Megumin Suite: the server host
// ──────────────────────────────────────────────
// Megumin's engine expects SillyTavern: one open chat, its messages, its
// chat_metadata, the profile in effect, and quiet prompts it can fire. Here each
// chat gets one live scope (shared by every operation on that chat, as
// SillyTavern shares its one open chat), and each operation runs inside
// AsyncLocalStorage so chats generating at the same time never see each other.
//
// Written back after every operation, and whenever Megumin saves:
//   • chat metadata — only keys starting with "megumin_";
//   • messages — only the text Megumin changed (image placeholders) and its
//     megumin_uid / megumin_seq stamps in `extra`;
//   • the suite store (megumin-store.ts).
import { AsyncLocalStorage } from "node:async_hooks";
import {
  MEGUMIN_METADATA_PREFIX,
  MeguminProfile,
  createRunState,
  setMeguminChildRunner,
  setMeguminScopeProvider,
  type MeguminChatMessage,
  type MeguminChatScope,
  type MeguminNotice,
  type MeguminRunState,
  type MeguminScope,
} from "@marinara-engine/shared/megumin";
import {
  characterDataSchema,
  resolveMacros,
  withoutUnreadableOnboarding,
  type MacroContext,
} from "@marinara-engine/shared";
import type { DB } from "../../db/connection.js";
import { logger } from "../../lib/logger.js";
import { createChatsStorage } from "../storage/chats.storage.js";
import { createCharactersStorage } from "../storage/characters.storage.js";
import { resolveChatUserIdentity } from "../chat-user-identity.js";
import {
  ensureMeguminStore,
  meguminSettingsRoot,
  mirrorMeguminPowerSwitch,
  scheduleMeguminStoreSave,
} from "./megumin-store.js";
import { createMeguminHostIo } from "./megumin-host-io.js";

const als = new AsyncLocalStorage<MeguminScope>();
setMeguminScopeProvider(() => als.getStore());
setMeguminChildRunner((run, fn) => {
  const current = als.getStore();
  if (!current) return fn();
  return als.run({ chat: current.chat, run }, fn);
});

type MessageSnapshot = { mes: string; stamps: string };

export interface MeguminNoticeRecord extends MeguminNotice {
  seq: number;
  at: number;
}

interface LiveChat {
  chatId: string;
  scope: MeguminChatScope;
  snapshots: Map<string, MessageSnapshot>;
  metadataSnapshot: string;
  persisting: Promise<void>;
  flushTimer: ReturnType<typeof setTimeout> | null;
  lastUsed: number;
  running: number;
  generating: number;
  version: number;
  notices: MeguminNoticeRecord[];
  noticeSeq: number;
  db: DB;
}

const liveChats = new Map<string, LiveChat>();
const loading = new Map<string, Promise<LiveChat>>();
const IDLE_EVICT_MS = 15 * 60_000;

function parseRecord(value: unknown): Record<string, any> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, any>;
  if (typeof value !== "string" || !value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, any>) : {};
  } catch {
    return {};
  }
}

function meguminKeysOf(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) if (key.startsWith(MEGUMIN_METADATA_PREFIX)) out[key] = value;
  return out;
}

function stampsOf(message: MeguminChatMessage): string {
  const pick = (extra: Record<string, unknown> | undefined) => ({
    uid: extra?.megumin_uid ?? null,
    seq: extra?.megumin_seq ?? null,
  });
  return JSON.stringify([pick(message.extra), ...message.swipe_info.map((s) => pick(s.extra))]);
}

interface CharacterInfo {
  id: string;
  name: string;
  description: string;
  personality: string;
  scenario: string;
  example: string;
}

async function loadCharacters(db: DB, ids: string[]): Promise<CharacterInfo[]> {
  const storage = createCharactersStorage(db);
  const out: CharacterInfo[] = [];
  for (const id of ids) {
    const row = await storage.getById(id);
    if (!row) continue;
    const parsed = characterDataSchema.safeParse(withoutUnreadableOnboarding(parseRecord(row.data)));
    if (!parsed.success) continue;
    const data = parsed.data;
    out.push({
      id,
      name: data.name,
      description: data.description ?? "",
      personality: data.personality ?? "",
      scenario: data.scenario ?? "",
      example: data.mes_example ?? "",
    });
  }
  return out;
}

/** SillyTavern's chat array, from YunYun's rows. Narrator and hidden messages read as system. */
async function readMessages(
  db: DB,
  chatId: string,
  names: { user: string; byCharacter: Map<string, string>; fallback: string },
) {
  const chats = createChatsStorage(db);
  const rows = await chats.listMessages(chatId);
  const swipesById = await chats.getSwipesByMessageId(rows.map((r) => r.id));
  return rows.map((row): MeguminChatMessage => {
    const extra = parseRecord(row.extra);
    const swipes = swipesById.get(row.id) ?? [];
    const contents = swipes.length ? swipes.map((s) => s.content ?? "") : [row.content ?? ""];
    const infos = swipes.length ? swipes.map((s) => ({ extra: parseRecord(s.extra) })) : [{ extra: { ...extra } }];
    const hidden = extra.hiddenFromAI === true;
    return {
      id: row.id,
      role: row.role,
      characterId: row.characterId ?? null,
      name:
        row.role === "user"
          ? names.user
          : (row.characterId && names.byCharacter.get(row.characterId)) ||
            (row.role === "narrator" ? "Narrator" : names.fallback),
      is_user: row.role === "user",
      is_system: row.role === "system" || row.role === "narrator" || hidden,
      mes: row.content ?? "",
      swipe_id: row.activeSwipeIndex ?? 0,
      swipes: contents,
      swipe_info: infos,
      extra,
      send_date: row.createdAt,
    };
  });
}

/** Refreshes the live chat array in place: a message keeps its object, so references held by running jobs stay valid. */
function mergeMessages(live: LiveChat, fresh: MeguminChatMessage[]) {
  const byId = new Map(live.scope.chat.map((m) => [m.id, m]));
  const next: MeguminChatMessage[] = [];
  for (const incoming of fresh) {
    const existing = byId.get(incoming.id);
    const snapshot = live.snapshots.get(incoming.id);
    if (!existing) {
      next.push(incoming);
      live.snapshots.set(incoming.id, { mes: incoming.mes, stamps: stampsOf(incoming) });
      continue;
    }
    // A stamp Megumin wrote but has not saved yet survives the reload.
    const pendingStamp = (from: Record<string, unknown>, into: Record<string, unknown>) => {
      if (from.megumin_uid && !into.megumin_uid) {
        into.megumin_uid = from.megumin_uid;
        into.megumin_seq = from.megumin_seq;
      }
    };
    pendingStamp(existing.extra, incoming.extra);
    incoming.swipe_info.forEach(
      (info, i) => existing.swipe_info[i] && pendingStamp(existing.swipe_info[i]!.extra, info.extra),
    );
    const textPending = snapshot && existing.mes !== snapshot.mes;
    Object.assign(existing, {
      role: incoming.role,
      characterId: incoming.characterId,
      name: incoming.name,
      is_user: incoming.is_user,
      is_system: incoming.is_system,
      swipe_id: incoming.swipe_id,
      swipes: incoming.swipes,
      swipe_info: incoming.swipe_info,
      extra: incoming.extra,
      send_date: incoming.send_date,
      mes: textPending ? existing.mes : incoming.mes,
    });
    if (!textPending) live.snapshots.set(incoming.id, { mes: incoming.mes, stamps: stampsOf(incoming) });
    next.push(existing);
  }
  for (const id of [...live.snapshots.keys()]) if (!fresh.some((m) => m.id === id)) live.snapshots.delete(id);
  live.scope.chat = next;
}

async function buildLiveChat(db: DB, chatId: string): Promise<LiveChat> {
  await ensureMeguminStore(db);
  const chats = createChatsStorage(db);
  const chat = await chats.getById(chatId);
  if (!chat) throw new Error(`Chat not found: ${chatId}`);
  const meta = parseRecord(chat.metadata);
  let characterIds: string[] = [];
  try {
    characterIds = JSON.parse(String(chat.characterIds || "[]")) as string[];
  } catch {
    characterIds = [];
  }
  const characters = await loadCharacters(db, characterIds);
  const identity = await resolveChatUserIdentity(createCharactersStorage(db), chat).catch(() => null);
  const userName = identity?.name || "User";
  const first = characters[0];
  const groupKey = characters.length > 1 ? characterIds.slice().sort().join("_") : null;

  const macroContext = (): MacroContext => ({
    user: userName,
    char: first?.name ?? "",
    characters: characters.map((c) => c.name),
    variables: {},
    chatId,
    characterFields: first
      ? {
          description: first.description,
          personality: first.personality,
          scenario: first.scenario,
          example: first.example,
        }
      : undefined,
    personaFields: identity
      ? {
          description: identity.description,
          personality: identity.personality,
          scenario: identity.scenario,
          backstory: identity.backstory,
          appearance: identity.appearance,
        }
      : undefined,
  });

  const live: LiveChat = {
    chatId,
    db,
    snapshots: new Map(),
    metadataSnapshot: JSON.stringify(meguminKeysOf(meta)),
    persisting: Promise.resolve(),
    flushTimer: null,
    lastUsed: Date.now(),
    running: 0,
    generating: 0,
    version: 0,
    notices: [],
    noticeSeq: 0,
    scope: null as unknown as MeguminChatScope,
  };

  const io = createMeguminHostIo(db, {
    chatId,
    chatConnectionId: (chat.connectionId as string | null) ?? null,
    chatMetadata: meta,
    characterIds,
    personaId: identity?.source === "persona" ? identity.id : null,
  });

  live.scope = {
    chatId,
    chat: [],
    metadata: meguminKeysOf(meta),
    settings: meguminSettingsRoot(),
    profile: {},
    loadedProfileKey: null,
    characters: characters.map((c) => ({
      id: c.id,
      name: c.name,
      avatar: c.id,
      description: c.description,
      personality: c.personality,
      scenario: c.scenario,
    })),
    characterId: characters.length === 1 ? 0 : undefined,
    groupId: groupKey,
    groups: groupKey ? [{ id: groupKey, name: chat.name as string, members: characterIds }] : [],
    name1: userName,
    name2: first?.name ?? "",
    substitute: (text) => {
      try {
        return resolveMacros(text, macroContext());
      } catch {
        return text;
      }
    },
    quiet: (text, run) => io.quiet(text, run),
    notify: (notice) => {
      live.noticeSeq += 1;
      live.notices.push({ ...notice, seq: live.noticeSeq, at: Date.now() });
      if (live.notices.length > 60) live.notices.splice(0, live.notices.length - 60);
      live.version += 1;
    },
    worldInfo: (lines) => io.worldInfo(lines),
    loreEntries: () => io.loreEntries(),
    embed: (texts) => io.embed(texts),
    generateImage: (request) => io.generateImage(request, live.scope),
    isGenerating: () => live.generating > 0,
    changed: () => {
      live.version += 1;
    },
    dirty: { metadata: false, settings: false, chat: false, profile: false },
  };

  const names = {
    user: userName,
    byCharacter: new Map(characters.map((c) => [c.id, c.name])),
    fallback: first?.name ?? "Narrator",
  };
  (live as LiveChat & { names: typeof names }).names = names;
  live.scope.chat = await readMessages(db, chatId, names);
  for (const m of live.scope.chat) live.snapshots.set(m.id, { mes: m.mes, stamps: stampsOf(m) });

  // SillyTavern's CHAT_CHANGED: the profile for this chat, then the state store squared with the chat.
  mirrorMeguminPowerSwitch();
  await als.run({ chat: live.scope, run: createRunState() }, async () => {
    MeguminProfile.initProfile();
  });
  return live;
}

async function getLiveChat(db: DB, chatId: string): Promise<LiveChat> {
  const existing = liveChats.get(chatId);
  if (existing) return existing;
  const pending = loading.get(chatId);
  if (pending) return pending;
  const promise = buildLiveChat(db, chatId)
    .then((live) => {
      liveChats.set(chatId, live);
      return live;
    })
    .finally(() => loading.delete(chatId));
  loading.set(chatId, promise);
  return promise;
}

async function persist(live: LiveChat): Promise<void> {
  const scope = live.scope;
  const db = live.db;
  const chats = createChatsStorage(db);
  const work = async () => {
    // Chat metadata: Megumin's keys only, including the ones it removed.
    const nextMeta = meguminKeysOf(scope.metadata);
    const nextMetaJson = JSON.stringify(nextMeta);
    if (nextMetaJson !== live.metadataSnapshot) {
      await chats.patchMetadata(
        live.chatId,
        (current: Record<string, unknown>) => {
          const merged: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(current))
            if (!key.startsWith(MEGUMIN_METADATA_PREFIX)) merged[key] = value;
          return { ...merged, ...nextMeta };
        },
        { touchUpdatedAt: false },
      );
      live.metadataSnapshot = nextMetaJson;
    }
    // Messages: text Megumin rewrote, and its stamps.
    for (const message of scope.chat) {
      const snapshot = live.snapshots.get(message.id);
      if (!snapshot) continue;
      if (message.mes !== snapshot.mes) {
        await chats.updateMessageContent(message.id, message.mes);
      }
      const stamps = stampsOf(message);
      if (stamps !== snapshot.stamps) {
        if (message.extra.megumin_uid) {
          await chats.updateMessageExtra(message.id, {
            megumin_uid: message.extra.megumin_uid,
            megumin_seq: message.extra.megumin_seq,
          });
        }
        for (let i = 0; i < message.swipe_info.length; i++) {
          if (i === message.swipe_id) continue;
          const extra = message.swipe_info[i]!.extra;
          if (extra.megumin_uid) {
            await chats.updateSwipeExtra(message.id, i, {
              megumin_uid: extra.megumin_uid,
              megumin_seq: extra.megumin_seq,
            });
          }
        }
      }
      live.snapshots.set(message.id, { mes: message.mes, stamps });
    }
    if (scope.dirty.settings || scope.dirty.profile) scheduleMeguminStoreSave(db);
    scope.dirty = { metadata: false, settings: false, chat: false, profile: false };
  };
  live.persisting = live.persisting
    .then(work)
    .catch((err) => logger.error(err, "[megumin] Saving Megumin's chat state failed"));
  await live.persisting;
}

function schedulePersist(live: LiveChat) {
  if (live.flushTimer) return;
  live.flushTimer = setTimeout(() => {
    live.flushTimer = null;
    void persist(live);
  }, 120);
}

export interface MeguminOperationOptions {
  /** Regenerating this message: Megumin sees it on a new, still-empty swipe (SillyTavern's swipe-to-generate). */
  pendingSwipeMessageId?: string | null;
  /** Re-read the chat's messages from storage first (default true). */
  refresh?: boolean;
}

/** Runs `fn` with Megumin's scope for this chat, then writes back what changed. */
export async function withMeguminChat<T>(
  db: DB,
  chatId: string,
  fn: () => Promise<T> | T,
  options: MeguminOperationOptions = {},
): Promise<T> {
  const live = await getLiveChat(db, chatId);
  live.lastUsed = Date.now();
  live.running += 1;
  try {
    if (options.refresh !== false) {
      const names = (live as LiveChat & { names: Parameters<typeof readMessages>[2] }).names;
      mergeMessages(live, await readMessages(db, chatId, names));
    }
    if (options.pendingSwipeMessageId) {
      const msg = live.scope.chat.find((m) => m.id === options.pendingSwipeMessageId);
      if (msg) msg.swipe_id = msg.swipes.length;
    }
    mirrorMeguminPowerSwitch();
    const run: MeguminRunState = createRunState();
    return await als.run({ chat: live.scope, run }, async () => {
      const watcher = setInterval(() => {
        const d = live.scope.dirty;
        if (d.metadata || d.chat || d.settings || d.profile) schedulePersist(live);
      }, 250);
      try {
        return await fn();
      } finally {
        clearInterval(watcher);
      }
    });
  } finally {
    live.running -= 1;
    await persist(live);
  }
}

/** The story model is writing in this chat (Chomusuke's traffic guard waits for it). */
export async function markMeguminGenerating(db: DB, chatId: string, on: boolean): Promise<void> {
  const live = liveChats.get(chatId) ?? (on ? await getLiveChat(db, chatId).catch(() => null) : null);
  if (!live) return;
  live.generating = Math.max(0, live.generating + (on ? 1 : -1));
}

/** Notices since `afterSeq` and the chat's change counter, for the client's poll. */
export function meguminChatActivity(chatId: string, afterSeq = 0) {
  const live = liveChats.get(chatId);
  if (!live) return { version: 0, notices: [] as MeguminNoticeRecord[], running: false };
  return {
    version: live.version,
    notices: live.notices.filter((n) => n.seq > afterSeq),
    running: live.running > 0,
  };
}

/** Drops the cached scope (chat deleted, or settings replaced wholesale). */
export function forgetMeguminChat(chatId: string): void {
  liveChats.delete(chatId);
}

/** Every chat's profile is re-read on its next operation (the suite store was replaced). */
export function reloadMeguminProfiles(): void {
  for (const live of liveChats.values()) {
    void als.run({ chat: live.scope, run: createRunState() }, async () => {
      MeguminProfile.initProfile();
    });
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [chatId, live] of liveChats) {
    if (live.running === 0 && live.generating === 0 && now - live.lastUsed > IDLE_EVICT_MS) {
      void persist(live).finally(() => liveChats.delete(chatId));
    }
  }
}, 60_000).unref();
