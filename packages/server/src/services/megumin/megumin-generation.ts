// ──────────────────────────────────────────────
// Megumin Suite: one Roleplay generation
// ──────────────────────────────────────────────
// What SillyTavern's events did around a generation, at the same points of
// YunYun's generate route:
//   GENERATION_STARTED          → the send guard: wait (up to 30s) for Chomusuke
//                                 to finish reading the last reply;
//   the generate interceptor    → messages Memory has archived leave the history;
//   CHAT_COMPLETION_PROMPT_READY→ handlePromptInjection fills the preset's slots;
//   MESSAGE_RECEIVED            → the reply's blocks, reads, images, Director,
//                                 Memory and NPC Bank (run after "done").
import {
  MeguminInjection,
  MeguminMemory,
  MeguminTasks,
  meguminOnReplyReceived,
  type MeguminReplyType,
} from "@marinara-engine/shared/megumin";
import { getContext, localProfile } from "@marinara-engine/shared/megumin";
import type { DB } from "../../db/connection.js";
import { logger } from "../../lib/logger.js";
import { isMeguminEnabled } from "./megumin-store.js";
import { isMeguminPreset } from "./megumin-presets.js";
import { markMeguminGenerating, withMeguminChat } from "./megumin-runtime.js";

const SEND_GUARD_MS = 30_000;

export interface MeguminGenerationTurn {
  /** Leaves out of the history the messages Memory has summarised into its archives. */
  filterArchived<T extends { id?: string | null }>(messages: T[]): void;
  /** Fills the assembled prompt's [[slots]] (the preset is a Megumin one). */
  apply<T extends { role: string; content: unknown }>(messages: T[]): Promise<T[]>;
  /** A reply was saved; Megumin reads it once the generation is done. */
  noteSavedReply(messageId: string | null | undefined): void;
  /** The generation ended: start the after-reply work for every saved reply. */
  finish(succeeded: boolean): void;
}

export function isMeguminGeneration(args: {
  chatMode: unknown;
  preset: { systemKey?: unknown } | null | undefined;
  impersonate?: boolean;
}) {
  return (
    isMeguminEnabled() && args.chatMode === "roleplay" && isMeguminPreset(args.preset) && args.impersonate !== true
  );
}

export async function prepareMeguminTurn(
  db: DB,
  args: {
    chatId: string;
    chatMode: unknown;
    preset: { systemKey?: unknown } | null | undefined;
    impersonate?: boolean;
    regenerateMessageId?: string | null;
    continueMessageId?: string | null;
    dryRun?: boolean;
  },
): Promise<MeguminGenerationTurn | null> {
  if (!isMeguminGeneration(args)) return null;
  const { chatId } = args;
  const pendingSwipeMessageId = args.regenerateMessageId ?? null;
  const replyType: MeguminReplyType = args.regenerateMessageId
    ? "swipe"
    : args.continueMessageId
      ? "continue"
      : "normal";

  if (!args.dryRun) {
    const held = MeguminTasks.chomusukeSessionPromise(chatId);
    if (held) {
      MeguminTasks.setReplyHeld(true);
      try {
        await Promise.race([held, new Promise((r) => setTimeout(r, SEND_GUARD_MS))]);
      } finally {
        MeguminTasks.setReplyHeld(false);
      }
    }
    await markMeguminGenerating(db, chatId, true);
  }

  let archived = new Set<string>();
  try {
    archived = await withMeguminChat(
      db,
      chatId,
      () => {
        const ids = new Set<string>();
        const mem = localProfile?.memoryCore;
        if (!mem?.enabled) return ids;
        const chat = getContext().chat as Array<{ id: string; is_system: boolean }>;
        chat.forEach((m, index) => {
          if (!m.is_system && MeguminMemory.isMessageArchived(index, mem)) ids.add(m.id);
        });
        return ids;
      },
      { pendingSwipeMessageId },
    );
  } catch (err) {
    logger.warn(err, "[megumin] Could not read the Memory archive for chat %s", chatId);
  }

  const saved: string[] = [];
  let finished = false;
  return {
    filterArchived(messages) {
      if (!archived.size) return;
      for (let i = messages.length - 1; i >= 0; i--) {
        const id = messages[i]?.id;
        if (id && archived.has(id)) messages.splice(i, 1);
      }
    },
    async apply(messages) {
      try {
        return await withMeguminChat(
          db,
          chatId,
          async () => {
            await MeguminInjection.handlePromptInjection({ messages }, args.dryRun ? "dryRun" : "normal");
            return messages;
          },
          { pendingSwipeMessageId },
        );
      } catch (err) {
        logger.error(err, "[megumin] Filling the Megumin preset failed; the prompt goes out as built");
        return messages;
      }
    },
    noteSavedReply(messageId) {
      if (messageId) saved.push(messageId);
    },
    finish(succeeded) {
      if (finished) return;
      finished = true;
      if (!args.dryRun) void markMeguminGenerating(db, chatId, false);
      if (!succeeded || !saved.length) return;
      void withMeguminChat(db, chatId, async () => {
        for (const id of saved) {
          const index = (getContext().chat as Array<{ id: string }>).findIndex((m) => m.id === id);
          if (index >= 0) await meguminOnReplyReceived(index, replyType);
        }
      }).catch((err) => logger.error(err, "[megumin] Megumin's after-reply work failed for chat %s", chatId));
    },
  };
}
