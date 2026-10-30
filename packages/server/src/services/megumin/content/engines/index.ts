// ──────────────────────────────────────────────
// Megumin Mode content: every stock engine, in display order
//
// Ported verbatim from Megumin Suite v10.0 by KazumaONIISAN (Arif-salah), https://github.com/Arif-salah/Megumin-Suite, CC BY-NC 4.0, used with the author's permission.
// Source: data/modes/index.js.
// ──────────────────────────────────────────────

import type { MeguminEngine } from "./types.js";
import { LEGACY_ENGINES } from "./legacy.js";
import { V10_ENGINES } from "./v10.js";
import { V7_ENGINES } from "./v7.js";
import { V8_ENGINES } from "./v8.js";
import { V9_ENGINES } from "./v9.js";

export type { MeguminEngine } from "./types.js";

// Order matters: it is the order engines appear in the picker, and
// newest-first is deliberate. Adding a generation means adding a file and one
// line below; adding an engine to an existing generation means editing only
// that generation's file.
export const MEGUMIN_ENGINES: readonly MeguminEngine[] = [
  ...V10_ENGINES,
  ...V9_ENGINES,
  ...V8_ENGINES,
  ...V7_ENGINES,
  ...LEGACY_ENGINES,
];
