// ──────────────────────────────────────────────
// Megumin panel: what every tab reads and writes
// ──────────────────────────────────────────────
import { createContext, useContext } from "react";
import type { MeguminCatalog, MeguminProfile, MeguminScope, MeguminView } from "../../hooks/use-megumin";

export interface MeguminPanelApi {
  /** The open Roleplay chat's scope, or the global default profile. */
  scope: MeguminScope;
  /** Set when a Roleplay chat is open: actions (scans, generators, Read again) need one. */
  chatId: string | null;
  /** MEGUMINTOGGLE. */
  enabled: boolean;
  view: MeguminView;
  catalog: MeguminCatalog;
  /** The profile in effect (view.profile). */
  profile: MeguminProfile;
  /** Edit the profile: mutate the draft (or return a new object). Saved a moment later. */
  update: (change: (draft: MeguminProfile) => MeguminProfile | void) => void;
  /** Set one top-level profile key. */
  set: (key: string, value: unknown) => void;
  /** Save a pending profile edit now (before a save-mode change or anything that reloads the profile). */
  flush: () => Promise<void>;
  /** Save the install-wide store parts (globalSettings, chomusuke, sidePanel, customModes, sharedFragments, configPresets, globalSyncTabs). */
  saveGlobal: (patch: Record<string, unknown>) => void;
  /** Run a server action in the chat's scope; resolves with its result. Rejects (and toasts) on failure. */
  run: (action: string, args?: Record<string, unknown>) => Promise<unknown>;
  /** Whether that action is running. */
  running: (action: string) => boolean;
  /** Switch to another tab of the panel. */
  openTab: (tabId: string) => void;
}

export const MeguminPanelContext = createContext<MeguminPanelApi | null>(null);

export function useMeguminPanel(): MeguminPanelApi {
  const api = useContext(MeguminPanelContext);
  if (!api) throw new Error("useMeguminPanel must be used inside the Megumin panel");
  return api;
}
