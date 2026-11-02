// ──────────────────────────────────────────────────────────────────────────────
// The blocks a reply's card shows, as Megumin's applyBlocksToMessage gathers them
// (vendor/src/blocks/render.ts): the blocks in the reply's text, the World State
// board as it stood after the reply in place of a short update (and on every
// reply while World State is on), the blocks Chomusuke wrote for it, and runs of
// lead blocks (several <Dice> in a row) merged into one readout.
//
// SillyTavern's renderer then hides the paragraphs its sanitizer left behind;
// YunYun instead renders the reply without the block tags (stripBlocksForModel)
// and draws this list with buildBlocksCard, so nothing has to be found or hidden.
// Derived from Megumin Suite (CC BY-NC 4.0, see LICENSE.md).
// ──────────────────────────────────────────────────────────────────────────────
import { extractBlocks } from "./vendor/src/blocks/render.js";

export interface MeguminCardBlock {
  def: Record<string, any>;
  at: number;
  raw: string;
  name: string;
  body: string;
  truncated: boolean;
}

export function meguminCardBlocks(
  mes: string,
  registry: Array<Record<string, any>>,
  inputs: { worldStateText?: string; storeBlocks?: Record<string, string> } = {},
): MeguminCardBlock[] {
  const text = typeof mes === "string" ? mes : "";
  const blocks = extractBlocks(text, registry) as MeguminCardBlock[];
  const worldDef = registry.find((r) => r.id === "world");
  let hasWorld = false;
  for (const b of blocks) {
    if (b.def && (b.def.id === "world" || b.def.id === "worldUpdate")) {
      hasWorld = true;
      if (b.def.id === "worldUpdate" && worldDef) b.def = worldDef;
      if (inputs.worldStateText) b.body = inputs.worldStateText;
    }
  }
  if (!hasWorld && inputs.worldStateText && worldDef) {
    blocks.push({ def: worldDef, at: text.length, raw: "", name: "", body: inputs.worldStateText, truncated: false });
  }
  for (const [tag, body] of Object.entries(inputs.storeBlocks || {})) {
    const def = registry.find((r) => r.tag === tag);
    if (!def || !String(body || "").trim()) continue;
    if (blocks.some((b) => b.def === def)) continue;
    blocks.push({ def, at: text.length, raw: "", name: "", body: String(body), truncated: false });
  }

  // Lead blocks first (they were written before the prose), consecutive runs of one kind merged.
  const lead: MeguminCardBlock[] = [];
  for (const b of blocks.filter((x) => x.def.lead)) {
    const last = lead[lead.length - 1];
    if (last && last.def === b.def) {
      last.body = `${last.body}\n${b.body}`;
      last.truncated = last.truncated || b.truncated;
      continue;
    }
    lead.push({ ...b });
  }
  return [...lead, ...blocks.filter((x) => !x.def.lead)];
}
