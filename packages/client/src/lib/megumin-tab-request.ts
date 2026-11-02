// Requests to show part of the Megumin panel from elsewhere: a tab ("Open in NPC Bank" on a card, the side
// panel's "Open NPC Book") and the dossier to open in the NPC Bank. The panel may not be mounted yet when
// the request is made, so the last one is kept until the panel takes it.
import { useEffect } from "react";

export const MEGUMIN_OPEN_TAB_EVENT = "megumin:open-tab";
export const MEGUMIN_OPEN_NPC_EVENT = "megumin:open-npc";

let pendingTab: string | null = null;
let pendingNpc: { index: number | null; name: string } | null = null;

if (typeof window !== "undefined") {
  window.addEventListener(MEGUMIN_OPEN_TAB_EVENT, (event) => {
    const detail = (event as CustomEvent<unknown>).detail;
    // A tab id, or { tabId } (the side panel sends the object form).
    const tab =
      typeof detail === "string"
        ? detail
        : detail && typeof (detail as { tabId?: unknown }).tabId === "string"
          ? (detail as { tabId: string }).tabId
          : null;
    if (tab) pendingTab = tab;
  });
  window.addEventListener(MEGUMIN_OPEN_NPC_EVENT, (event) => {
    const detail = (event as CustomEvent<{ index?: unknown; name?: unknown } | null>).detail;
    if (!detail || typeof detail.name !== "string") return;
    pendingNpc = { index: typeof detail.index === "number" ? detail.index : null, name: detail.name };
  });
}

/** The tab asked for since the last call, if any. */
export function takeRequestedMeguminTab(): string | null {
  const tab = pendingTab;
  pendingTab = null;
  return tab;
}

/** Opens this dossier when the NPC Bank was asked to show it (now, or before the tab mounted). */
export function useMeguminNpcFocus(name: string, index: number, onFocus: () => void) {
  useEffect(() => {
    const take = () => {
      const want = pendingNpc;
      if (!want || (want.name !== name && want.index !== index)) return;
      pendingNpc = null;
      onFocus();
    };
    take();
    const onRequest = () => setTimeout(take, 0);
    window.addEventListener(MEGUMIN_OPEN_NPC_EVENT, onRequest);
    return () => window.removeEventListener(MEGUMIN_OPEN_NPC_EVENT, onRequest);
  }, [index, name, onFocus]);
}
