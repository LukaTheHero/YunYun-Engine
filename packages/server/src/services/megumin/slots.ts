// ──────────────────────────────────────────────
// Megumin Mode: the slot registry, one entry per {{megumin_*}} variable
//
// Built on content/slots.ts, the port of Megumin Suite's data/slots.js (Megumin Suite v10.0 by
// KazumaONIISAN (Arif-salah), https://github.com/Arif-salah/Megumin-Suite, CC BY-NC 4.0, used with
// the author's permission). That registry knows the [[trigger]] placeholders and their gates; this
// one maps each trigger onto the variable the bundled preset uses, says where the layout routes
// it and which payload category it counts towards. It is the single source for "every variable
// is defined": resolve-slots.ts writes each one, "" when its slot is gated off, so a preset never
// shows a literal {{megumin_x}}.
// ──────────────────────────────────────────────

import { meguminAddonSlots } from "./content/slots.js";

/** Which payload estimate a slot counts towards (upstream src/core/tokens.js categories, plus the live ones). */
export type MeguminTokenCategory = "engine" | "cot" | "style" | "addons" | "dynamic";

/** Who fills a slot: this resolver, or another area's slot provider. */
export type MeguminSlotArea = "resolver" | "memory" | "npc" | "director" | "banlist" | "images" | "blocks";

export type MeguminLayout = "universal" | "cache";

export interface MeguminVariableSlot {
  /** The variable is `megumin_<name>`, or `megumin_pre_<name>` and `megumin_tail_<name>` when volatile. */
  name: string;
  /** The buildBaseDict dictionary key it is filled from; null for a slot this port adds. */
  trigger: string | null;
  /**
   * Changes every turn, so the layout places it: before history in the Universal layout, in the
   * depth-1 Output RULES in the Cache Friendly one.
   */
  volatile?: boolean;
  tokenCategory: MeguminTokenCategory;
  area: MeguminSlotArea;
  /** Dev Mode offers it as an editable add-on (a shared fragment). */
  devEditable: boolean;
}

const DEV_EDITABLE_TRIGGERS = new Set(meguminAddonSlots().map((slot) => slot.trigger));

const slot = (
  name: string,
  trigger: string | null,
  tokenCategory: MeguminTokenCategory,
  extra: { volatile?: boolean; area?: MeguminSlotArea } = {},
): MeguminVariableSlot => ({
  name,
  trigger,
  tokenCategory,
  area: extra.area ?? "resolver",
  ...(extra.volatile ? { volatile: true } : {}),
  devEditable: trigger !== null && DEV_EDITABLE_TRIGGERS.has(trigger),
});

/** In the bundled preset's order: Main Prompt, Main 2, custom, persona-open, history-open, Output RULES. */
export const MEGUMIN_VARIABLE_SLOTS: readonly MeguminVariableSlot[] = [
  slot("prompt1", "[[prompt1]]", "engine"),
  slot("main", "[[main]]", "engine"),
  slot("prompt2", "[[prompt2]]", "engine"),
  slot("pronouns", "[[pronouns]]", "style"),
  slot("control", "[[control]]", "engine"),
  slot("ooc", "[[OOC]]", "engine"),
  slot("prompt3", "[[prompt3]]", "engine"),
  slot("prompt4", "[[prompt4]]", "engine"),
  slot("prompt5", "[[prompt5]]", "engine"),
  slot("death", "[[death]]", "addons"),
  slot("combat", "[[combat]]", "addons"),
  slot("npc_events", "[[npc_events]]", "addons"),
  slot("prompt6", "[[prompt6]]", "engine"),
  slot("aiprompt", "[[aiprompt]]", "style"),
  slot("onomato", "[[onomato]]", "style"),
  slot("img1", "[[img1]]", "dynamic", { volatile: true, area: "images" }),
  slot("npc_dossier", "[[npc_dossier]]", "dynamic", { volatile: true, area: "npc" }),
  slot("html", "[[html]]", "addons"),
  slot("dice", "[[dice]]", "addons", { volatile: true }),
  slot("banlist", "[[banlist]]", "dynamic", { area: "banlist" }),
  slot("custom_instructions", null, "style"),
  slot("story_plan", "[[storyplan]]", "dynamic", { volatile: true, area: "director" }),
  slot("relevant_npcs", "[[npc list]]", "dynamic", { volatile: true, area: "npc" }),
  slot("long_memory", "[[long-Memory]]", "dynamic", { area: "memory" }),
  slot("short_memory", "[[Short-memory]]", "dynamic", { area: "memory" }),
  slot("think", "[[THINK]]", "cot"),
  slot("dnratio", "[[DNRATIO]]", "style"),
  slot("color", "[[COLOR]]", "addons"),
  slot("direct", "[[Direct]]", "addons"),
  slot("dn", "[[DN]]", "addons"),
  slot("config", "[[config]]", "style"),
  slot("blocks", "[[blocks]]", "dynamic", { area: "blocks" }),
  slot("user_rule", "[[user]]", "engine"),
  slot("language", "[[Language]]", "style"),
  slot("mvu", "[[MVU]]", "addons"),
];

/** The variable a non-volatile slot fills, or the one a volatile slot fills under `layout`. */
export function meguminSlotVariable(entry: MeguminVariableSlot, layout?: MeguminLayout): string {
  if (!entry.volatile) return `megumin_${entry.name}`;
  return `megumin_${layout === "cache" ? "tail" : "pre"}_${entry.name}`;
}

/** Every variable a slot can fill: both placements of a volatile one. */
export function meguminSlotVariables(entry: MeguminVariableSlot): string[] {
  return entry.volatile
    ? [meguminSlotVariable(entry, "universal"), meguminSlotVariable(entry, "cache")]
    : [meguminSlotVariable(entry)];
}

/**
 * Every {{megumin_*}} variable, always defined on a Megumin turn. None is 21 characters long: the
 * macro engine reads {{<21 characters>}} as a card ID reference and never as a variable.
 */
export const MEGUMIN_VARIABLE_NAMES: readonly string[] = MEGUMIN_VARIABLE_SLOTS.flatMap(meguminSlotVariables);
