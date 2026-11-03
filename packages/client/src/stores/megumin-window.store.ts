// ──────────────────────────────────────────────
// Store: whether the Megumin Suite window is open
// ──────────────────────────────────────────────
// Not persisted: the window opens when asked (the top bar's wand, a card's "Open in NPC Bank") and starts
// closed after a reload.
import { create } from "zustand";

interface MeguminWindowState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useMeguminWindowStore = create<MeguminWindowState>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
