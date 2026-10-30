// ──────────────────────────────────────────────
// Megumin Mode content: the OOC and control toggles
//
// Ported verbatim from Megumin Suite v10.0 by KazumaONIISAN (Arif-salah), https://github.com/Arif-salah/Megumin-Suite, CC BY-NC 4.0, used with the author's permission.
// Source: data/toggles.js. Every prompt string is byte-identical to the source.
//
// Both are blanked for V8 and newer engines (the slot resolver does that).
// ──────────────────────────────────────────────

export interface MeguminToggle {
  label: string;
  trigger: string;
  /** Off by default: most engines handle this natively. */
  recommendedOff?: boolean;
  content: string;
}

export type MeguminToggleId = "ooc" | "control";

// Global on/off behaviour toggles.

export const MEGUMIN_TOGGLES: Readonly<Record<MeguminToggleId, MeguminToggle>> = {
  ooc: {
    label: "OOC Commentary",
    trigger: "[[OOC]]",
    content:
      "OOC: you have the ability to talk to the user directly to comment on the story. the line should be between[].",
  },
  control: {
    label: "Stop the AI from Controling User",
    trigger: "[[control]]",
    recommendedOff: true,
    content:
      "Never write dialogue, actions, or decisions for {{user}}. You control the world. The user controls themselves.",
  },
};
