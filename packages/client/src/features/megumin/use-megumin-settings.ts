import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  MEGUMIN_PROFILE_METADATA_KEY,
  meguminProfileKeyWriteScope,
  parseMeguminProfile,
  resolveMeguminProfile,
  type Chat,
  type MeguminProfile,
  type MeguminProfileKey,
  type MeguminProfileScope,
  type MeguminSettings,
  type MeguminSettingsResponse,
  type MeguminSettingsUpdate,
  type ResolvedMeguminProfileState,
} from "@marinara-engine/shared";
import { api, ApiError } from "../../lib/api-client";
import { chatKeys, useChat } from "../../hooks/use-chats";
import { parseChatMetadata } from "../../lib/chat-display";
import { getChatCharacterIds } from "../../lib/chat-macros";
import { patchChatMetadata } from "../../lib/chat-metadata-patch";
import { useChatStore } from "../../stores/chat.store";

export const meguminKeys = {
  all: ["megumin"] as const,
  settings: () => [...meguminKeys.all, "settings"] as const,
};

/** The install-wide Megumin store. Reads work while Megumin Mode is off. */
export function useMeguminSettings() {
  return useQuery({
    queryKey: meguminKeys.settings(),
    queryFn: () => api.get<MeguminSettingsResponse>("/megumin/settings"),
    staleTime: 5 * 60_000,
  });
}

/** What the editor shows: one Roleplay chat's profile, or the Global default profile. */
export type MeguminEditorView = "chat" | "default";

function chatProfileView(chat: Chat | null | undefined) {
  return chat ? { characterIds: getChatCharacterIds(chat), metadata: parseChatMetadata(chat.metadata) } : null;
}

function storedChatProfile(chat: Chat | null | undefined): MeguminProfile {
  return parseMeguminProfile(parseChatMetadata(chat?.metadata)[MEGUMIN_PROFILE_METADATA_KEY]) ?? {};
}

// One write at a time, each reading the caches as the previous one left them, so quick edits never
// merge into a stale profile and overwrite each other.
let writeQueue: Promise<unknown> = Promise.resolve();
function enqueueWrite(task: () => Promise<void>): Promise<void> {
  const run = writeQueue.then(task, task);
  writeQueue = run.catch(() => undefined);
  return run;
}

/** Optimistically apply a change to the cached settings and chat, then send it; roll back on failure. */
async function writeOptimistic(
  qc: QueryClient,
  chatId: string | null,
  change: { settings?: MeguminSettings; chat?: Chat | null },
  send: () => Promise<MeguminSettingsResponse | null>,
) {
  const settingsKey = meguminKeys.settings();
  const previousSettings = qc.getQueryData<MeguminSettingsResponse>(settingsKey);
  const previousChat = chatId ? qc.getQueryData<Chat>(chatKeys.detail(chatId)) : undefined;
  if (change.settings && previousSettings)
    qc.setQueryData(settingsKey, { ...previousSettings, settings: change.settings });
  if (chatId && change.chat) qc.setQueryData(chatKeys.detail(chatId), change.chat);
  try {
    const response = await send();
    if (response) qc.setQueryData(settingsKey, response);
  } catch (error) {
    if (previousSettings) qc.setQueryData(settingsKey, previousSettings);
    if (chatId && previousChat) qc.setQueryData(chatKeys.detail(chatId), previousChat);
    throw error;
  }
}

/**
 * Edit Megumin settings the way the server resolves them (resolveMeguminProfile in shared): each
 * changed profile key is saved to its write scope (the chat, the character or the Global default; a
 * Global tab's keys always go to the default), and the install-wide sections go to PUT /settings.
 */
export function useMeguminEditor(view: MeguminEditorView) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const settingsQuery = useMeguminSettings();
  const activeChatId = useChatStore((state) => state.activeChatId);
  const { data: activeChat } = useChat(view === "chat" ? activeChatId : null);
  const chat = view === "chat" && activeChat?.mode === "roleplay" ? activeChat : null;
  const chatId = chat?.id ?? null;
  const settings = settingsQuery.data?.settings ?? null;

  const state: ResolvedMeguminProfileState | null = useMemo(
    () => (settings ? resolveMeguminProfile({ settings, chat: chatProfileView(chat) }) : null),
    [chat, settings],
  );

  const reportFailure = useCallback(
    (error: unknown) => {
      const status = error instanceof ApiError ? error.status : null;
      toast.error(
        status === 409
          ? t("megumin.editor.offNotice")
          : status === 423
            ? t("megumin.editor.storeLocked")
            : t("megumin.editor.saveFailed"),
      );
    },
    [t],
  );

  const writeScope = useCallback(
    async (scope: MeguminProfileScope, profile: MeguminProfile | null) => {
      const current = qc.getQueryData<MeguminSettingsResponse>(meguminKeys.settings())?.settings;
      if (!current) return;
      if (scope === "chat") {
        if (!chatId) return;
        const cachedChat = qc.getQueryData<Chat>(chatKeys.detail(chatId));
        await writeOptimistic(
          qc,
          chatId,
          { chat: patchChatMetadata(cachedChat, { [MEGUMIN_PROFILE_METADATA_KEY]: profile }) },
          async () => {
            await api.put(`/megumin/profiles/chats/${encodeURIComponent(chatId)}`, { profile });
            return null;
          },
        );
        return;
      }
      if (scope === "character") {
        const characterId = resolveMeguminProfile({
          settings: current,
          chat: chatProfileView(chatId ? qc.getQueryData<Chat>(chatKeys.detail(chatId)) : null),
        }).characterId;
        if (!characterId) return;
        const characterProfiles = { ...current.characterProfiles };
        if (profile) characterProfiles[characterId] = profile;
        else delete characterProfiles[characterId];
        await writeOptimistic(qc, null, { settings: { ...current, characterProfiles } }, () =>
          api.put<MeguminSettingsResponse>(`/megumin/profiles/characters/${encodeURIComponent(characterId)}`, {
            profile,
          }),
        );
        return;
      }
      await writeOptimistic(qc, null, { settings: { ...current, defaultProfile: profile ?? {} } }, () =>
        api.put<MeguminSettingsResponse>("/megumin/profiles/default", { profile }),
      );
    },
    [chatId, qc],
  );

  /** Save profile keys, each to the scope an edit of it belongs to. */
  const update = useCallback(
    (patch: MeguminProfile) =>
      enqueueWrite(async () => {
        const current = qc.getQueryData<MeguminSettingsResponse>(meguminKeys.settings())?.settings;
        if (!current) return;
        const cachedChat = chatId ? qc.getQueryData<Chat>(chatKeys.detail(chatId)) : null;
        const resolved = resolveMeguminProfile({ settings: current, chat: chatProfileView(cachedChat) });
        const parts = new Map<MeguminProfileScope, MeguminProfile>();
        for (const [key, value] of Object.entries(patch)) {
          const scope =
            view === "default" ? "default" : meguminProfileKeyWriteScope(resolved, key as MeguminProfileKey);
          parts.set(scope, { ...parts.get(scope), [key]: value });
        }
        for (const [scope, part] of parts) {
          const stored =
            scope === "default"
              ? current.defaultProfile
              : scope === "character"
                ? resolved.characterId
                  ? current.characterProfiles[resolved.characterId]
                  : undefined
                : storedChatProfile(cachedChat);
          await writeScope(scope, { ...stored, ...part });
        }
      }).catch(reportFailure),
    [chatId, qc, reportFailure, view, writeScope],
  );

  /** Drop a scope's own profile so it inherits from the level below again. */
  const resetScope = useCallback(
    (scope: MeguminProfileScope) => enqueueWrite(() => writeScope(scope, null)).catch(reportFailure),
    [reportFailure, writeScope],
  );

  /** Give the chat its own profile (empty: it starts from what it inherits). */
  const pinChat = useCallback(
    () => enqueueWrite(() => writeScope("chat", {})).catch(reportFailure),
    [reportFailure, writeScope],
  );

  /** Save install-wide sections (global settings, Global tabs, Story Config presets). False when it failed. */
  const saveSettings = useCallback(
    (build: (current: MeguminSettings) => MeguminSettingsUpdate) =>
      enqueueWrite(async () => {
        const current = qc.getQueryData<MeguminSettingsResponse>(meguminKeys.settings())?.settings;
        if (!current) return;
        const update = build(current);
        await writeOptimistic(qc, null, { settings: { ...current, ...update } }, () =>
          api.put<MeguminSettingsResponse>("/megumin/settings", update),
        );
      }).then(
        () => true,
        (error: unknown) => {
          reportFailure(error);
          return false;
        },
      ),
    [qc, reportFailure],
  );

  return {
    settings,
    sizeBytes: settingsQuery.data?.sizeBytes ?? 0,
    isLoading: settingsQuery.isLoading,
    isError: settingsQuery.isError,
    chat,
    state,
    update,
    resetScope,
    pinChat,
    saveSettings,
  };
}

export type MeguminEditor = ReturnType<typeof useMeguminEditor>;
