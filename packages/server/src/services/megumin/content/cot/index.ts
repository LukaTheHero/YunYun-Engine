// ──────────────────────────────────────────────
// Megumin Mode content: every chain-of-thought entry, in display order
//
// Ported verbatim from Megumin Suite v10.0 by KazumaONIISAN (Arif-salah), https://github.com/Arif-salah/Megumin-Suite, CC BY-NC 4.0, used with the author's permission.
// Source: data/cot/index.js. meguminCotForMode() lives in engine-predicates.ts.
// ──────────────────────────────────────────────

import type { MeguminCot } from "./types.js";
import { LEGACY_COTS } from "./legacy.js";
import { V10_COTS } from "./v10.js";
import { V7_COTS } from "./v7.js";
import { V8_COTS } from "./v8.js";
import { V9_COTS } from "./v9.js";

export type { MeguminCot } from "./types.js";

export const MEGUMIN_COTS: readonly MeguminCot[] = [...V10_COTS, ...V9_COTS, ...V8_COTS, ...V7_COTS, ...LEGACY_COTS];
