// ──────────────────────────────────────────────────────────────────────────────
// Megumin Suite's library, as the panel lists it.
//
// What each tab offers to pick from — engines, chains of thought, styles,
// add-ons, blocks, Story Config fields, Dev Mode slots, loadouts — with every
// short field kept (ids, labels, hints, colours, flags) and the long prompt
// texts left out. The panel asks for one engine's or slot's full text when
// Dev Mode opens it.
// Derived from Megumin Suite (CC BY-NC 4.0, see LICENSE.md).
// ──────────────────────────────────────────────────────────────────────────────
import { hardcodedLogic } from "./vendor/data/database.js";
import { MEGUMIN_SLOT_REGISTRY, SLOT_GROUPS } from "./vendor/data/slots.js";
import {
  MEGUMIN_BLOCK_REGISTRY,
  BLOCK_VISIBILITY_CHOICES,
  STAT_FIELD_PACKS,
  STAT_FIELD_TYPES,
} from "./vendor/src/features/blocks/registry.js";
import { storyConfigFields, CONFIG_PREAMBLE } from "./vendor/src/features/storyconfig/config.js";
import { LOADOUTS, COMING_SOON } from "./vendor/src/features/modelsetup/loadouts.js";
import { SD_GENRES, SD_FLAVORS } from "./vendor/src/features/storyplan/ui.js";
import { NPC_DEFAULT_FIELDS } from "./vendor/src/features/npc/fields.js";
import { CHOMUSUKE_JOB_NAMES } from "./vendor/src/engine/chomusukeNotice.js";
import { BG_JOBS } from "./vendor/src/engine/bgPromptsCore.js";
import { KAZUMA_PLACEHOLDERS, RESOLUTIONS } from "./vendor/data/image_data.js";
import { DEFAULT_PROMPTS } from "./vendor/src/prompts/index.js";
import { V2_DEFAULTS } from "./vendor/src/features/imagegen/v2/index.js";

const SHORT = 400;

/** Every primitive field, strings only when short: labels and hints, never prompt bodies. */
function meta(item: unknown): Record<string, unknown> {
  if (!item || typeof item !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(item as Record<string, unknown>)) {
    if (typeof value === "string") {
      if (value.length <= SHORT) out[key] = value;
    } else if (typeof value === "number" || typeof value === "boolean" || value === null) {
      out[key] = value;
    } else if (Array.isArray(value) && value.every((v) => typeof v === "string" && v.length <= SHORT)) {
      out[key] = value;
    }
  }
  return out;
}

/** A JSON-safe copy (functions, like a block's `build`, are dropped). */
function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function meguminCatalog() {
  const lib = hardcodedLogic as Record<string, any>;
  return {
    engines: (lib.modes as unknown[]).map(meta),
    chainsOfThought: (lib.models as unknown[]).map(meta),
    personalities: (lib.personalities as unknown[]).map(meta),
    toggles: Object.entries(lib.toggles as Record<string, unknown>).map(([id, t]) => ({ id, ...meta(t) })),
    styles: (lib.styles as unknown[]).map((s) => ({ ...meta(s) })),
    directStyles: (lib.directStyles as unknown[]).map((s) => ({
      ...meta(s),
      rule: (s as { rule?: string }).rule ?? "",
    })),
    styleTemplates: plain(lib.styleTemplates),
    addons: (lib.addons as unknown[]).map(meta),
    blocks: MEGUMIN_BLOCK_REGISTRY.map(meta),
    blockVisibility: plain(BLOCK_VISIBILITY_CHOICES),
    statFieldPacks: plain(STAT_FIELD_PACKS),
    statFieldTypes: plain(STAT_FIELD_TYPES),
    storyConfigFields: plain(storyConfigFields),
    storyConfigPreamble: CONFIG_PREAMBLE,
    slots: MEGUMIN_SLOT_REGISTRY.map(meta),
    slotGroups: plain(SLOT_GROUPS),
    loadouts: plain(LOADOUTS),
    loadoutsComingSoon: plain(COMING_SOON),
    storyDirector: { genres: plain(SD_GENRES), flavors: plain(SD_FLAVORS) },
    npcDefaultFields: plain(NPC_DEFAULT_FIELDS),
    chomusukeJobs: plain(CHOMUSUKE_JOB_NAMES),
    backgroundJobs: plain(BG_JOBS),
    images: {
      placeholders: plain(KAZUMA_PLACEHOLDERS),
      resolutions: plain(RESOLUTIONS),
      v2Defaults: plain(V2_DEFAULTS),
    },
    defaultPrompts: plain(DEFAULT_PROMPTS),
  };
}

export type MeguminCatalog = ReturnType<typeof meguminCatalog>;

/** One engine whole (Dev Mode, cloning): the shipped one or a custom clone. */
export function meguminEngineById(id: string, customModes: unknown[] = []): Record<string, unknown> | null {
  const all = [...(hardcodedLogic.modes as unknown[]), ...customModes] as Array<Record<string, unknown>>;
  const found = all.find((m) => m.id === id);
  return found ? plain(found) : null;
}

/** One chain of thought whole. */
export function meguminCotById(id: string): Record<string, unknown> | null {
  const found = (hardcodedLogic.models as Array<Record<string, unknown>>).find((m) => m.id === id);
  return found ? plain(found) : null;
}
