// @ts-nocheck
// Vendored from Megumin Suite src/prompts/index.js @ b3656d12a39a — https://github.com/Arif-salah/Megumin-Suite
// © KazumaONIISAN, licensed CC BY-NC 4.0 (packages/shared/src/megumin/LICENSE.md). Changes: see
// scripts/megumin/sync-megumin.mjs. Generated — edit the sync script's patches, not this file.
// Barrel for the prompt layer. Import from here rather than reaching into the
// individual module files — it keeps the one-import-line convenience the old
// single-file layout had.

export { DEFAULT_PROMPTS, MEGUMIN_PROMPT_MODULES } from "./defaults.js";
export {
    meguminDiffPrompts,
    meguminFillPrompts,
    meguminSparsifyProfilePrompts,
    meguminRehydrateProfilePrompts,
} from "./storage.js";

// Individual blocks, for code that wants one module's prompts without pulling in
// the whole set.
export { storyPlanPrompts } from "./storyPlan.js";
export { banListPrompts } from "./banList.js";
export { imageGenPrompts } from "./imageGen.js";
export { memoryCorePrompts } from "./memoryCore.js";
export { npcBankPrompts } from "./npcBank.js";
