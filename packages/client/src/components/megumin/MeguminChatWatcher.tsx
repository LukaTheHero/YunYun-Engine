// ──────────────────────────────────────────────
// Megumin Suite: follows the open Roleplay chat's after-reply work
// ──────────────────────────────────────────────
// Megumin reads each reply after it is saved (World State, blocks, the Notebook,
// NPCs, images) on the server. While MEGUMINTOGGLE is on, this keeps the chat's
// cards current and turns Megumin's notices into toasts. Renders nothing.
import { useMeguminActivity, useMeguminEnabled } from "../../hooks/use-megumin";

export function MeguminChatWatcher({ chatId }: { chatId: string }) {
  const enabled = useMeguminEnabled();
  useMeguminActivity(chatId, enabled);
  return null;
}
