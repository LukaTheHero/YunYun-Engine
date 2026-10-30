import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { isMeguminPreset, type Chat } from "@marinara-engine/shared";
import { showChoiceDialog } from "../../lib/app-dialogs";
import { parseChatMetadata } from "../../lib/chat-display";
import { useUpdateChat, useUpdateChatMetadata } from "../../hooks/use-chats";
import {
  mergeFeatureSettings,
  useFeatureEnabled,
  useFeatureSettings,
  useSaveFeatureSettings,
} from "../../hooks/use-feature-settings";
import { useChatStore } from "../../stores/chat.store";

/** The `meguminMode` feature switch, saved with the other switches (PUT /features replaces them all). */
export function useMeguminSwitch() {
  const { data } = useFeatureSettings();
  const save = useSaveFeatureSettings();
  const settings = data?.settings;
  const setEnabled = useCallback(
    (enabled: boolean) => save.mutateAsync(mergeFeatureSettings(settings, { meguminMode: enabled })),
    [save, settings],
  );
  return {
    setEnabled,
    ready: !!data,
    pending: save.isPending,
    /** The environment pins the switch, so the app cannot change it. */
    lockedBy: data?.envOverrides?.meguminMode ?? null,
  };
}

/**
 * Assign a preset to a chat the way the Presets tab does (stale preset choices cleared first) and
 * offer Undo, which puts back the previous preset and choices while the chat still has this one.
 */
export function useAssignChatPreset() {
  const { t } = useTranslation();
  const updateChat = useUpdateChat();
  const updateMetadata = useUpdateChatMetadata();
  return useCallback(
    async (chat: Chat, presetId: string, message: string) => {
      const previousPresetId = chat.promptPresetId ?? null;
      const previousChoices = parseChatMetadata(chat.metadata).presetChoices ?? {};
      await updateMetadata.mutateAsync({ id: chat.id, presetChoices: {} });
      await updateChat.mutateAsync({ id: chat.id, promptPresetId: presetId });
      toast.success(message, {
        action: {
          label: t("megumin.common.undo"),
          onClick: () => {
            const current = useChatStore.getState().activeChat;
            if (!current || current.id !== chat.id || current.promptPresetId !== presetId) {
              toast.info(t("megumin.common.undoUnavailable"));
              return;
            }
            updateMetadata.mutate({ id: chat.id, presetChoices: previousChoices });
            updateChat.mutate({ id: chat.id, promptPresetId: previousPresetId });
          },
        },
      });
    },
    [t, updateChat, updateMetadata],
  );
}

/**
 * Before a Megumin preset is assigned while Megumin Mode is off, ask whether to turn it on. Resolves
 * null when the reader cancels; assigning with the switch off is allowed (the chat falls back).
 * Otherwise it resolves the step to run once every other question is answered: it turns the
 * switch on when the reader chose that, and returns false when saving the switch failed.
 */
export function useMeguminAssignGuard() {
  const { t } = useTranslation();
  const enabled = useFeatureEnabled("meguminMode");
  const { setEnabled, lockedBy } = useMeguminSwitch();
  return useCallback(
    async (
      preset: { name?: string; engineMode?: unknown } | null | undefined,
    ): Promise<(() => Promise<boolean>) | null> => {
      const proceed = async () => true;
      if (enabled || !isMeguminPreset(preset)) return proceed;
      const choice = await showChoiceDialog({
        title: t("megumin.assign.title"),
        message: t("megumin.assign.message", { name: preset?.name ?? "" }),
        cancelLabel: t("megumin.common.cancel"),
        choices: [
          ...(lockedBy ? [] : [{ key: "turn-on", label: t("megumin.assign.turnOn") }]),
          { key: "keep-off", label: t("megumin.assign.keepOff") },
        ],
      });
      if (choice === null) return null;
      if (choice !== "turn-on") return proceed;
      return async () => {
        try {
          await setEnabled(true);
          return true;
        } catch {
          toast.error(t("megumin.presetCard.saveFailed"));
          return false;
        }
      };
    },
    [enabled, lockedBy, setEnabled, t],
  );
}
