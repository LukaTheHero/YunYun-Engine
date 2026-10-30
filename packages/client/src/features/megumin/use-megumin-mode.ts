import { useMemo } from "react";
import type { PromptPreset } from "@marinara-engine/shared";
import { useFeatureEnabled } from "../../hooks/use-feature-settings";
import { useConnection } from "../../hooks/use-connections";
import { usePresets } from "../../hooks/use-presets";
import { useChatStore } from "../../stores/chat.store";
import { resolveMeguminModeState, type MeguminModeState } from "./megumin-mode-state";

/**
 * Whether Megumin Mode is on and whether it runs for the open chat. Every Megumin surface reads this
 * one hook, so they all agree with the server about the chat's preset (connection override first).
 */
export function useMeguminMode(): MeguminModeState<PromptPreset> {
  const enabled = useFeatureEnabled("meguminMode");
  const chat = useChatStore((state) => state.activeChat);
  const roleplay = chat?.mode === "roleplay";
  const { data: connection } = useConnection(roleplay ? (chat?.connectionId ?? null) : null);
  const { data: presets } = usePresets();
  const connectionPromptPresetId = roleplay ? connection?.promptPresetId : null;
  return useMemo(
    () =>
      resolveMeguminModeState({
        enabled,
        chatMode: chat?.mode,
        chatPromptPresetId: chat?.promptPresetId,
        connectionPromptPresetId,
        presets,
      }),
    [chat?.mode, chat?.promptPresetId, connectionPromptPresetId, enabled, presets],
  );
}
