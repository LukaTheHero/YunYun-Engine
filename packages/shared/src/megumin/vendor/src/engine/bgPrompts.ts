// YunYun override of Megumin Suite src/engine/bgPrompts.js.
// The log of the last background prompts is kept by the host (one per chat) and
// shown in YunYun's Megumin panel. The pre-send review of a background prompt
// needs a person at a screen while a server job waits; YunYun logs every job
// instead and shows the story prompt in its own preview.
// Derived from Megumin Suite (CC BY-NC 4.0, see LICENSE.md).
import {
  getActiveBanListChat,
  getActiveGenerationOrder,
  getActiveImageGenRequest,
  getActiveMemorySummarizationRequest,
  getActiveNpcPfpRequest,
  getActiveNpcScanRequest,
  getActiveNpcUpdateRequest,
  getActiveStoryPlanRequest,
  getActiveWorldExtractRequest,
} from "../core/activeRequests.js";
import { makeLogEntry } from "./bgPromptsCore.js";
import { maybeMeguminScope } from "../../../host.js";

export function bgPreviewOpen(): boolean {
  return false;
}

/** Which background job the prompt being built belongs to, or null for the story (Megumin's order). */
export function backgroundJobNow(): string | null {
  const world = getActiveWorldExtractRequest();
  const image = getActiveImageGenRequest();
  if (getActiveStoryPlanRequest()) return "director";
  if (getActiveNpcScanRequest()) return "npc";
  if (world) return world.job || "world";
  if (getActiveNpcUpdateRequest()) return "npc";
  if (getActiveBanListChat()) return "banlist";
  if (image) return (image.v2 && image.v2.job) || "images";
  if (getActiveNpcPfpRequest()) return "npc";
  if (getActiveMemorySummarizationRequest()) return "memory";
  if (getActiveGenerationOrder()) return "style";
  return null;
}

const logs = new Map<string, unknown[]>();

export async function readBackgroundLog(chatId?: string | null): Promise<unknown[]> {
  const key = chatId ?? maybeMeguminScope()?.chat.chatId ?? "";
  return logs.get(key) ?? [];
}

export async function clearBackgroundLog(chatId?: string | null): Promise<void> {
  logs.delete(chatId ?? maybeMeguminScope()?.chat.chatId ?? "");
}

/** Logs a background job's messages; always sends (returns true). */
export async function reviewBackgroundPrompt(messages: unknown[], job: string): Promise<boolean> {
  const scope = maybeMeguminScope();
  const key = scope?.chat.chatId ?? "";
  const connection = scope?.run.connectionId ? "Chomusuke" : "your current connection";
  const entry = makeLogEntry({ job, connection, messages, status: "sent", edited: false, at: Date.now() });
  const list = [entry, ...(logs.get(key) ?? [])].slice(0, 10);
  logs.set(key, list);
  scope?.chat.changed?.("bglog");
  return true;
}

export async function openBackgroundLog(): Promise<void> {}
