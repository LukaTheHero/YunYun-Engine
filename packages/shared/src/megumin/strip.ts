// ──────────────────────────────────────────────────────────────────────────────
// `@marinara-engine/shared/megumin/strip`: the one piece of Megumin the chat
// message itself needs — taking a reply's block tags out of the text drawn above
// its card (Megumin's own stripBlocksForModel, which has no imports). Kept apart
// from `megumin/client` so the chat bundle does not carry the card renderer.
// Derived from Megumin Suite (CC BY-NC 4.0, see LICENSE.md).
// ──────────────────────────────────────────────────────────────────────────────
import { stripBlocksForModel as stripBlocks } from "./vendor/src/engine/hideBlocks.js";

/** A reply's text without its Megumin blocks (the envelope, each block tag, a cut-off block, the old cards). */
export function stripBlocksForModel(text: string, tags: readonly string[]): string {
  return stripBlocks(text, tags as never[]) as string;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const REMOVED = "\u0000";

/**
 * A reply's text as drawn above its card: only the block regions Megumin's renderer takes into the card
 * (the envelope, each block tag, a block cut off at the end) are taken out. Unlike stripBlocksForModel,
 * nothing else changes — blank lines, spacing and `<details>` sections stay exactly as written, and a
 * reply without blocks comes back as the same string.
 */
export function stripBlocksForDisplay(text: string, tags: readonly string[]): string {
  if (!text || !text.includes("<")) return text;
  let out = text.replace(/<Blocks\b[^>]*>[\s\S]*?<\/Blocks\s*>/gi, REMOVED);
  for (const tag of tags) {
    const t = escapeRegExp(tag);
    out = out.replace(new RegExp(`<${t}\\b[^>]*>[\\s\\S]*?<\\/${t}\\s*>`, "gi"), REMOVED);
  }
  out = out.replace(/<Blocks\b[^>]*>[\s\S]*$/i, REMOVED);
  for (const tag of tags) out = out.replace(new RegExp(`<${escapeRegExp(tag)}\\b[^>]*>[\\s\\S]*$`, "i"), REMOVED);
  if (!out.includes(REMOVED)) return text;
  // Each removed region (and the blank lines around it) becomes one paragraph break; none at the edges.
  return out
    .replace(/[ \t]*\n*[ \t]*\u0000(?:\s*\u0000)*[ \t]*\n*/g, "\n\n")
    .replace(/^\n\n/, "")
    .replace(/\n\n$/, "");
}

/** Every block tag a reply can carry, from the registry the view hands out. */
export function meguminBlockTags(registry: ReadonlyArray<{ tag?: unknown }>): string[] {
  return registry.map((r) => String(r.tag || "")).filter(Boolean);
}
