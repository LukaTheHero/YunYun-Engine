// ──────────────────────────────────────────────────────────────────────────────
// What YunYun's client draws for a chat in Megumin mode: the profile in effect,
// the block registry the cards are read with, and for every reply the card's
// inputs exactly as Megumin's chat decorator (features/blocks/chat.js) hands
// them to its renderer — the World State board as it stood after that reply,
// the blocks Chomusuke wrote for it, the Notebook's changes.
// Derived from Megumin Suite (CC BY-NC 4.0, see LICENSE.md).
// ──────────────────────────────────────────────────────────────────────────────
import { getContext, extension_settings } from "./vendor/src/st.js";
import { localProfile } from "./vendor/src/core/state.js";
import { extensionName } from "./vendor/src/core/constants.js";
import { getCharacterKey, getProfileLevel } from "./vendor/src/core/keys.js";
import { suiteEnabled } from "./vendor/src/core/power.js";
import { getSidePanelSettings } from "./vendor/src/sidepanel/panel.js";
import {
  meguminRenderRegistry,
  meguminBlocksTakenByPanel,
  meguminStatFieldMap,
  meguminActiveBlocks,
} from "./vendor/src/features/blocks/registry.js";
import {
  worldEnabled,
  worldUpdateMode,
  getWorldState,
  worldHistory,
  worldCardTextAt,
  worldCardInfo,
  blocksCardTextAt,
  notebookCardTextAt,
  notebookCardInfo,
  notebookEnabled,
  notebookState,
  notebookCurrentPhase,
  statsState,
} from "./vendor/src/state/index.js";
import { chomusukeStatusFor } from "./vendor/src/engine/tasks.js";
import { memCalculateTokensSaved } from "./vendor/src/features/memory/index.js";

/** The two notebook panes (Megumin's features/notebook/card.js NOTEBOOK_CARD_DEFS). */
export const MEGUMIN_NOTEBOOK_CARD_DEFS = [
  { id: "notebook", tag: "Notebook", label: "Notebook", emoji: "📓", visibility: "open" },
  { id: "notebookUpdate", tag: "Notebook_Update", label: "Notebook", emoji: "📓", visibility: "open" },
];

export interface MeguminCardInputs {
  worldStateText: string;
  storeBlocks: Record<string, string>;
  /** Chomusuke is still writing one of this reply's blocks. */
  pending: boolean;
  world: unknown;
  notebook: unknown;
}

function plain<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

const DEF_KEYS = [
  "id",
  "tag",
  "label",
  "emoji",
  "icon",
  "color",
  "visibility",
  "repeating",
  "lead",
  "system",
  "builtin",
  "desc",
];

function renderDefs() {
  return [...meguminRenderRegistry(), ...MEGUMIN_NOTEBOOK_CARD_DEFS].map((def: Record<string, unknown>) => {
    const out: Record<string, unknown> = {};
    for (const key of DEF_KEYS) if (def[key] !== undefined && typeof def[key] !== "function") out[key] = def[key];
    return out;
  });
}

function cardInputsAt(index: number): MeguminCardInputs {
  const worldStateText = String(worldCardTextAt(index) || "");
  const fromWorker = (blocksCardTextAt(index) || {}) as Record<string, { status: string; body?: string; id: string }>;
  const storeBlocks: Record<string, string> = {};
  let pending = false;
  for (const [tag, b] of Object.entries(fromWorker)) {
    if (b.status === "pending") pending = true;
    storeBlocks[tag] =
      b.status === "ok"
        ? String(b.body || "")
        : b.status === "pending"
          ? String(b.body || "*Writing this block…*")
          : "*Nothing was written for this block. Use Read again.*";
  }
  const nbText = String(notebookCardTextAt(index) || "");
  if (nbText) storeBlocks.Notebook_Update = nbText;
  return {
    worldStateText,
    storeBlocks,
    pending,
    world: plain(worldCardInfo(index)),
    notebook: plain(notebookCardInfo(index)),
  };
}

export interface MeguminChatViewOptions {
  /** Include the World State history (the editor's list). */
  history?: boolean;
}

export function meguminChatView(options: MeguminChatViewOptions = {}) {
  const chat = (getContext().chat || []) as Array<{ id: string; is_user: boolean; is_system: boolean }>;
  const store = (extension_settings[extensionName] || {}) as Record<string, any>;
  const cards: Record<string, MeguminCardInputs> = {};
  chat.forEach((m, index) => {
    if (!m || m.is_user || m.is_system) return;
    cards[m.id] = cardInputsAt(index);
  });
  return {
    enabled: suiteEnabled(),
    profileKey: getCharacterKey() || "default",
    profileLevel: getProfileLevel(),
    profile: plain(localProfile),
    globalSettings: plain(store.globalSettings || {}),
    chomusuke: plain(store.chomusuke || localProfile.chomusuke || {}),
    sidePanel: plain(getSidePanelSettings()),
    customModes: plain(store.customModes || []),
    sharedFragments: plain(store.sharedFragments || {}),
    configPresets: plain(store.configPresets || []),
    globalSyncTabs: plain(store.globalSyncTabs || {}),
    registry: renderDefs(),
    activeBlocks: meguminActiveBlocks().map((b: { id: string }) => b.id),
    omit: meguminBlocksTakenByPanel(),
    statFields: plain(meguminStatFieldMap()),
    cards,
    world: {
      enabled: worldEnabled(),
      mode: worldUpdateMode(),
      state: plain(getWorldState()),
      history: options.history ? plain(worldHistory()) : undefined,
    },
    stats: {
      bonds: plain(statsState("bonds")),
      sheet: plain(statsState("sheet")),
      chatter: plain(statsState("chatter")),
      tracker: plain(statsState("tracker")),
      cyoa: plain(statsState("cyoa")),
    },
    notebook: {
      enabled: notebookEnabled(),
      phase: notebookCurrentPhase(),
      state: plain(notebookState()),
    },
    chomusukeStatus: chomusukeStatusFor(getContext().chatId ?? null),
    memory: { tokensSaved: Number(memCalculateTokensSaved()) || 0 },
  };
}

export type MeguminChatView = ReturnType<typeof meguminChatView>;
