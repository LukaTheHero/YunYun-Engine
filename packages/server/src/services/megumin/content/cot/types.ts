// ──────────────────────────────────────────────
// Megumin Mode content: the shape of a chain-of-thought entry
//
// Ported verbatim from Megumin Suite v10.0 by KazumaONIISAN (Arif-salah), https://github.com/Arif-salah/Megumin-Suite, CC BY-NC 4.0, used with the author's permission.
// Source: the entries in data/cot/*.js (exported upstream as `models`).
// ──────────────────────────────────────────────

/** One reasoning framework. `content` is wrapped into {{megumin_think}}; `prefill` is the optional reasoning prefill. */
export interface MeguminCot {
  id: string;
  /** Upstream slot anchor, "[[COT]]". Never read; cot-v7-english has none. */
  trigger?: string;
  content: string;
  prefill: string;
}
