// ──────────────────────────────────────────────
// Megumin Mode: slot providers, the live slots other areas fill
//
// buildBaseDict filled the Story Director, Ban List, Image Gen, Memory Core, NPC Bank and Blocks
// slots inline, each from its own feature. Here each of those areas plugs a provider in instead.
// build-dict.ts calls them at the points buildBaseDict filled their slots (`order` is the
// buildBaseDict step) and blocks last, because the envelope reads the finished dictionary.
//
// Until an area lands, its provider is a stub that sends nothing, which is what Megumin Suite sends
// while the feature is switched off.
// ──────────────────────────────────────────────

import type { ChatMLMessage, MeguminResolvedProfile } from "@marinara-engine/shared";
import type { DB } from "../../db/connection.js";
import type { MeguminLayout, MeguminSlotArea } from "./slots.js";

export interface MeguminSlotProviderContext {
  db: DB;
  chatId: string;
  profile: MeguminResolvedProfile;
  layout: MeguminLayout;
  /** The prompt's chat history, oldest first. */
  chatMessages: readonly ChatMLMessage[];
  /** Peek Prompt and previews: read, never persist. */
  previewOnly: boolean;
  /** The dictionary built so far, keyed by [[trigger]]. */
  dict: Readonly<Record<string, string>>;
  now: () => Date;
}

export interface MeguminSlotProvider {
  area: Exclude<MeguminSlotArea, "resolver">;
  /** The dictionary keys ([[trigger]]) it fills. Anything else it returns is ignored. */
  slots: readonly string[];
  /** The buildBaseDict step it stands in for (MEGUMIN_PROVIDER_ORDER). */
  order: number;
  resolve(ctx: MeguminSlotProviderContext): Promise<Partial<Record<string, string>>>;
}

/** Where each provider runs in buildBaseDict's order. Blocks must stay last. */
export const MEGUMIN_PROVIDER_ORDER = {
  director: 11,
  banlist: 12,
  images: 13,
  memory: 18,
  npc: 19,
  blocks: 20,
} as const satisfies Record<MeguminSlotProvider["area"], number>;

function stubProvider(area: MeguminSlotProvider["area"], slots: readonly string[]): MeguminSlotProvider {
  return {
    area,
    slots,
    order: MEGUMIN_PROVIDER_ORDER[area],
    resolve: async () => Object.fromEntries(slots.map((trigger) => [trigger, ""])),
  };
}

// ponytail: every area is a stub until its phase lands (Director, Ban List, Images and Blocks in
// phases B and D, NPC Bank and Memory Core in phase C); each replaces its line with its provider.
// Blocks also needs what buildBaseDict did for its bodies ([[cyoa]], [[infoblock]],
// [[npc_inner_chatter]]): the active engine's own text, else a Dev Mode shared fragment, then the
// per-block header strip. The context then gains the active engine and the shared fragments.
export const MEGUMIN_SLOT_PROVIDERS: readonly MeguminSlotProvider[] = [
  stubProvider("director", ["[[storyplan]]", "[[storytracker]]"]),
  stubProvider("banlist", ["[[banlist]]"]),
  stubProvider("images", ["[[img1]]", "[[img2]]"]),
  stubProvider("memory", ["[[long-Memory]]", "[[Short-memory]]"]),
  stubProvider("npc", ["[[npc_dossier]]", "[[npc_dossier2]]", "[[npc list]]", "[[npc_updates]]"]),
  stubProvider("blocks", ["[[blocks]]"]),
];
