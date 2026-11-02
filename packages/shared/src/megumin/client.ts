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
export { stripBlocksForModel } from "./strip.js";
export * as MeguminTreatments from "./vendor/src/blocks/treatments.js";
export * as MeguminWorldRender from "./vendor/src/state/modules/world/render.js";
export * as MeguminWorldModel from "./vendor/src/state/modules/world/model.js";
export * as MeguminStatsRender from "./vendor/src/state/modules/stats/render.js";
export * as MeguminStatsModel from "./vendor/src/state/modules/stats/model.js";
export * as MeguminNotebookRender from "./vendor/src/state/modules/notebook/render.js";
export * as MeguminNotebookModel from "./vendor/src/state/modules/notebook/model.js";
export * as MeguminSidePanelParsers from "./vendor/src/sidepanel/parsers.js";
export * as MeguminSidePanelSections from "./vendor/src/sidepanel/sections.js";
export * as MeguminSidePanelDom from "./vendor/src/sidepanel/dom.js";
export { meguminCardBlocks, type MeguminCardBlock } from "./card.js";
export { meguminBlockTags } from "./strip.js";
export { setChomusukeStatus, setChomusukeStopHandler } from "./vendor/src/engine/chomusukeStatus.js";
export * as MeguminEngineFlags from "./vendor/src/core/engines.js";
export * as MeguminStatsParse from "./vendor/src/state/modules/stats/parse.js";
