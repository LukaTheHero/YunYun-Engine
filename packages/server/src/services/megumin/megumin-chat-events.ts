// ──────────────────────────────────────────────
// Megumin Suite: SillyTavern's chat events, from YunYun's routes
// ──────────────────────────────────────────────
// MESSAGE_SWIPED, MESSAGE_EDITED, MESSAGE_DELETED and MESSAGE_SWIPE_DELETED
// keep Megumin's state store in step with the chat: a swipe switches which
// reply's changes count, an edit re-reads that reply, a rewind undoes what the
// removed replies did. Only for Roleplay chats Megumin has already worked in.
import {
  MEGUMIN_METADATA_PREFIX,
  getContext,
  meguminOnDeleted,
  meguminOnEdited,
  meguminOnSwipeDeleted,
  meguminOnSwiped,
} from "@marinara-engine/shared/megumin";
import type { DB } from "../../db/connection.js";
import { logger } from "../../lib/logger.js";
import { createChatsStorage } from "../storage/chats.storage.js";
import { isMeguminEnabled } from "./megumin-store.js";
import { withMeguminChat } from "./megumin-runtime.js";

export type MeguminChatEvent =
  | { kind: "swiped"; messageId: string }
  | { kind: "edited"; messageId: string }
  | { kind: "swipeDeleted"; messageId: string; swipeIndex: number }
  | { kind: "deleted" };

async function meguminWorksIn(db: DB, chatId: string): Promise<boolean> {
  if (!isMeguminEnabled()) return false;
  const chat = await createChatsStorage(db).getById(chatId);
  if (!chat || chat.mode !== "roleplay") return false;
  const meta = typeof chat.metadata === "string" ? chat.metadata : JSON.stringify(chat.metadata ?? {});
  return meta.includes(`"${MEGUMIN_METADATA_PREFIX}`);
}

/** Tells Megumin about a change the person made to the chat. Never throws, never delays the route. */
export function notifyMeguminChatEvent(db: DB, chatId: string, event: MeguminChatEvent): void {
  void (async () => {
    if (!(await meguminWorksIn(db, chatId))) return;
    await withMeguminChat(db, chatId, () => {
      const chat = getContext().chat as Array<{ id: string }>;
      if (event.kind === "deleted") return meguminOnDeleted();
      const index = chat.findIndex((m) => m.id === event.messageId);
      if (index < 0) return false;
      if (event.kind === "swiped") return meguminOnSwiped(index);
      if (event.kind === "edited") return meguminOnEdited(index);
      return meguminOnSwipeDeleted(index, event.swipeIndex);
    });
  })().catch((err) => logger.warn(err, "[megumin] Could not bring Megumin's state in step with chat %s", chatId));
}
