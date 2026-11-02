// YunYun override of Megumin Suite src/features/blocks/chat.js. Megumin redraws
// the block cards in SillyTavern's DOM; on YunYun the open client redraws them
// when the server says the chat's blocks changed.
// Derived from Megumin Suite (CC BY-NC 4.0, see LICENSE.md).
import { maybeMeguminScope } from "../../../../host.js";

export function meguminScheduleBlocksRefresh(_delay = 60): void {
  maybeMeguminScope()?.chat.changed?.("blocks");
}

export function meguminRefreshBlocksInChat(): void {
  maybeMeguminScope()?.chat.changed?.("blocks");
}
