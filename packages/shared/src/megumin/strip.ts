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

/** Every block tag a reply can carry, from the registry the view hands out. */
export function meguminBlockTags(registry: ReadonlyArray<{ tag?: unknown }>): string[] {
  return registry.map((r) => String(r.tag || "")).filter(Boolean);
}
