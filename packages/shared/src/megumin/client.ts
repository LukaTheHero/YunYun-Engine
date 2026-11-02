// ──────────────────────────────────────────────────────────────────────────────
// Megumin Suite on YunYun — the drawing side (client).
//
// `@marinara-engine/shared/megumin/client`: Megumin's block card renderer and
// side-panel readers, which build DOM nodes from a message's raw text. They use
// the real browser document; nothing here touches the prompt library.
// See LICENSE.md: this code is Megumin Suite's (CC BY-NC 4.0).
// ──────────────────────────────────────────────────────────────────────────────
export { extractBlocks, parseChoices, buildBlocksCard, clearBlocksFromMessage } from "./vendor/src/blocks/render.js";
export { BLOCK_TREATMENTS } from "./vendor/src/blocks/treatments.js";
export { esc as meguminEscape, renderBody as meguminRenderBody } from "./vendor/src/blocks/text.js";
export * from "./yunyun.js";
