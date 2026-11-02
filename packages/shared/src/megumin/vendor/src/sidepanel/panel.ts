// YunYun override of Megumin Suite src/sidepanel/panel.js. The side panel itself
// is drawn by YunYun's client (components/megumin); the engine only needs its
// settings, read and backfilled exactly as panel.js does it.
// Derived from Megumin Suite (CC BY-NC 4.0, see LICENSE.md).
import { extension_settings } from "../st.js";

const EXT_NAME = "Megumin-Suite";
const SETTINGS_KEY = "sidePanel";

/** sections.js SECTION_REGISTRY ids, their default open state and order. */
export const SIDE_PANEL_SECTIONS = [
  { id: "worldState", defaultOpen: true, order: 0 },
  { id: "innerChatter", defaultOpen: true, order: 1 },
  { id: "newNpcs", defaultOpen: true, order: 2 },
  { id: "storyPlan", defaultOpen: false, order: 3 },
  { id: "npcBank", defaultOpen: true, order: 4 },
  { id: "banList", defaultOpen: false, order: 5 },
] as const;

export const SIDE_PANEL_DEFAULTS = Object.freeze({
  schemaVersion: 2,
  enabled: false,
  mode: "docked",
  position: "right",
  width: 340,
  collapsed: false,
  hideInline: true,
  scale: 1.0,
  autoHideEmpty: true,
  float: { x: null, y: null, w: 620, h: 720 },
  sections: {
    worldState: { visible: true, open: true, order: 0 },
    innerChatter: { visible: true, open: true, order: 1 },
    newNpcs: { visible: true, open: true, order: 2 },
    storyPlan: { visible: true, open: false, order: 3 },
    npcBank: { visible: true, open: true, order: 4 },
    banList: { visible: true, open: false, order: 5 },
  },
});

const LEGACY_DEFAULTS: Record<string, unknown[]> = { width: [360] };

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

export function getSidePanelSettings(): any {
  if (!extension_settings[EXT_NAME]) extension_settings[EXT_NAME] = {};
  const store = extension_settings[EXT_NAME];
  if (!store[SETTINGS_KEY]) {
    store[SETTINGS_KEY] = clone(SIDE_PANEL_DEFAULTS);
    return store[SETTINGS_KEY];
  }
  const cur = store[SETTINGS_KEY];
  const def: Record<string, unknown> = SIDE_PANEL_DEFAULTS as unknown as Record<string, unknown>;
  for (const k of Object.keys(def)) {
    if (cur[k] === undefined) cur[k] = clone(def[k]);
  }
  if (!cur.sections) cur.sections = clone(SIDE_PANEL_DEFAULTS.sections);
  for (const [k, legacyVals] of Object.entries(LEGACY_DEFAULTS)) {
    if (legacyVals.includes(cur[k]) && cur[k] !== def[k]) cur[k] = def[k];
  }
  for (const sd of SIDE_PANEL_SECTIONS) {
    const v = cur.sections[sd.id];
    if (typeof v === "boolean") cur.sections[sd.id] = { visible: v, open: sd.defaultOpen, order: sd.order };
    else if (v === undefined) cur.sections[sd.id] = { visible: true, open: sd.defaultOpen, order: sd.order };
  }
  cur.schemaVersion = 2;
  if (!cur.float || typeof cur.float !== "object") cur.float = clone(SIDE_PANEL_DEFAULTS.float);
  return cur;
}

// The DOM side of the panel lives in the client; these keep imports from Megumin code working.
export function refreshSidePanel(): void {}
export function refreshPresentBar(): void {}
