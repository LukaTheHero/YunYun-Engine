// ──────────────────────────────────────────────
// Megumin Mode: engine predicates for the server
//
// Ported verbatim from Megumin Suite v10.0 by KazumaONIISAN (Arif-salah), https://github.com/Arif-salah/Megumin-Suite, CC BY-NC 4.0, used with the author's permission.
// Source: src/core/engines.js and data/cot/index.js.
//
// The predicates live in shared (features/megumin/engines.ts) so the editor's
// engine flow answers exactly as the prompt builder does; this module adds the
// lookup that needs the server-only CoT text.
// ──────────────────────────────────────────────

import { meguminCotForMode } from "@marinara-engine/shared";
import { MEGUMIN_COTS, type MeguminCot } from "./content/cot/index.js";

export {
  engineLocksStyle,
  engineUsesRenderLimits,
  isCoWriterEngine,
  isModernEngine,
  isV10Engine,
  isV7Engine,
  isV8Engine,
  isV9Engine,
  lockedStyleIdFor,
  meguminCotForMode,
  type MeguminEngineRef,
} from "@marinara-engine/shared";

/** The chain-of-thought entry an engine is written for, or null. */
export function meguminCotEntryForMode(modeId: string | null | undefined, lang = "english"): MeguminCot | null {
  const id = meguminCotForMode(modeId, lang);
  return id ? (MEGUMIN_COTS.find((cot) => cot.id === id) ?? null) : null;
}
