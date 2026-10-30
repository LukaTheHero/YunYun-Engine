// ──────────────────────────────────────────────
// Megumin Mode content: the shape of an engine ("mode" upstream)
//
// Ported verbatim from Megumin Suite v10.0 by KazumaONIISAN (Arif-salah), https://github.com/Arif-salah/Megumin-Suite, CC BY-NC 4.0, used with the author's permission.
// Source: the mode objects in data/modes/*.js. Field names are kept as upstream
// spells them, so engine-predicates.ts reads stock engines, Dev Mode clones and
// imported engine JSON the same way.
// ──────────────────────────────────────────────

/**
 * One narrative engine. p1..p6 fill the six prompt slots: p1..p3 sit in the
 * Main Prompt and p4..p6 in Main 2. Empty slots are "".
 */
export interface MeguminEngine {
  id: string;
  label: string;
  /** Card accent colour. */
  color: string;
  p1: string;
  p2: string;
  p3: string;
  p4: string;
  p5: string;
  p6: string;
  /** Upstream acknowledgement turns ([[AI1]]/[[AI2]]). Megumin Mode does not send them. */
  A1?: string;
  A2?: string;
  /** Shows the "New" badge. */
  isNew?: boolean;
  /** Generation flags. The id prefix answers too; see engine-predicates.ts. */
  isV7?: boolean;
  isV8?: boolean;
  isV9?: boolean;
  isV10?: boolean;
  /** Built from a stock engine, so a custom copy keeps [[main]]. */
  isCoreClone?: boolean;
  /** Shows the "Recommended" badge. */
  recommended?: boolean;
  /** Writes {{user}} as well as the world, so it never receives the "never write for {{user}}" rule. */
  isCoWriter?: boolean;
  /** V4/V5: selectable, but hidden from Dev Mode's clone list. */
  devLegacy?: boolean;
}
