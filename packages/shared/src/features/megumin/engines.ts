// ──────────────────────────────────────────────
// Megumin Mode: which generation an engine belongs to, and what that means
//
// Ported verbatim from Megumin Suite v10.0 by KazumaONIISAN (Arif-salah), https://github.com/Arif-salah/Megumin-Suite, CC BY-NC 4.0, used with the author's permission.
// Source: src/core/engines.js and meguminCotForMode() in data/cot/index.js.
//
// One spelling of each generation test, and behaviour asked for by name
// rather than by generation. A screen that wants to know what to CALL an
// engine reads `engine.label`; it never rebuilds the name from a flag (V10
// once carried `isV9` and every site that turned the flag into the word "V9"
// started lying). Shared so the editor's engine flow and the server's prompt
// builder answer the same way.
// ──────────────────────────────────────────────

import { MEGUMIN_COT_IDS } from "./catalog.js";

/** The fields the generation tests read. Stock engines, Dev Mode clones and imported engines all carry them. */
export type MeguminEngineRef =
  | {
      id?: string;
      isV7?: boolean;
      isV8?: boolean;
      isV9?: boolean;
      isV10?: boolean;
      isCoWriter?: boolean;
    }
  | null
  | undefined;

const engineId = (m: NonNullable<MeguminEngineRef>): string => String(m.id || "");

export const isV7Engine = (m: MeguminEngineRef): boolean => !!m && (engineId(m).startsWith("v7") || m.isV7 === true);
export const isV8Engine = (m: MeguminEngineRef): boolean => !!m && (engineId(m).startsWith("v8") || m.isV8 === true);
export const isV9Engine = (m: MeguminEngineRef): boolean => !!m && (engineId(m).startsWith("v9") || m.isV9 === true);
export const isV10Engine = (m: MeguminEngineRef): boolean => !!m && (engineId(m).startsWith("v10") || m.isV10 === true);

/**
 * The Co-writer variants, which author {{user}} as well as the world. Flag first
 * so a clone of one keeps answering true, id suffix second so an engine built
 * before the flag existed still reads correctly.
 */
export const isCoWriterEngine = (m: MeguminEngineRef): boolean =>
  !!m && (m.isCoWriter === true || engineId(m).endsWith("-cw"));

/**
 * Carries its own persona and narrative toggles, so [[main]], [[OOC]],
 * [[control]] and the acknowledgements are all blanked and the Narrator tab
 * shows its locked state. V10 inherits everything V9 does except the
 * Lean/Full render limits.
 */
export const isModernEngine = (m: MeguminEngineRef): boolean => isV8Engine(m) || isV9Engine(m) || isV10Engine(m);

/** Requires a narrative style directive, so "No Style (Off)" is refused. */
export const engineLocksStyle = (m: MeguminEngineRef): boolean => isV7Engine(m) || isModernEngine(m);

/** The Lean/Full word-count split. V9 ONLY: the one thing V10 does not take from V9. */
export const engineUsesRenderLimits = (m: MeguminEngineRef): boolean => isV9Engine(m) && !isV10Engine(m);

/** The built-in style an engine drops you on when you switch to it. */
export function lockedStyleIdFor(m: MeguminEngineRef): string | null {
  if (!m) return null;
  if (m.id === "v7-core") return "dir_v7_core";
  if (m.id === "v7-gentle") return "dir_v7_gentle";
  if (m.id === "v7.5") return "dir_v7.5";
  if (isV8Engine(m)) return "dir_v8";
  // Shura before the general V10 test: "v10-shura-cw" is both, and the more
  // specific answer is the right one.
  if (engineId(m).startsWith("v10-shura")) return "dir_v10_shura";
  if (isV10Engine(m)) return "dir_v10_ukiyo";
  if (isV9Engine(m)) return "dir_v9";
  if (isV7Engine(m)) return "dir_v7";
  return null;
}

/**
 * Which chain-of-thought an engine is written for, or null.
 *
 * The language only matters for the generations that were translated; v7, v8
 * and v10 exist in English alone, so they ignore it (v9 in practice too: only
 * its `-english` entries exist, so another language finds nothing).
 */
export function meguminCotForMode(modeId: string | null | undefined, lang = "english"): string | null {
  if (!modeId) return null;

  let prefix: string | null = null;
  if (modeId.includes("v6")) prefix = "cot-v6";
  else if (modeId === "v7.5") prefix = "cot-v7.5";
  else if (modeId.includes("v7")) prefix = "cot-v7";
  else if (modeId.includes("v8")) prefix = "cot-v8";
  // Shura first: "v10-shura" contains "v10", and the specific pairing wins.
  // The uncapped variant is the default either way -- the Thinking Cap is a
  // remedy for a model that over-thinks, not something to hand everyone.
  else if (modeId.includes("v10-shura")) prefix = "cot-v10-shura";
  else if (modeId.includes("v10")) prefix = "cot-v10-ukiyo";
  else if (modeId.includes("v9")) prefix = "cot-v9";
  if (!prefix) return null;

  const englishOnly = prefix.startsWith("cot-v10") || prefix.includes("v7") || prefix.includes("v8");
  const id = englishOnly ? `${prefix}-english` : `${prefix}-${lang}`;
  return (MEGUMIN_COT_IDS as readonly string[]).includes(id) ? id : null;
}
