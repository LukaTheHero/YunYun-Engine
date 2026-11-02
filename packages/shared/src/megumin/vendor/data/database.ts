// @ts-nocheck
// Vendored from Megumin Suite data/database.js @ b3656d12a39a — https://github.com/Arif-salah/Megumin-Suite
// © KazumaONIISAN, licensed CC BY-NC 4.0 (packages/shared/src/megumin/LICENSE.md). Changes: see
// scripts/megumin/sync-megumin.mjs. Generated — edit the sync script's patches, not this file.
// ─────────────────────────────────────────────────────────────────────────────
// hardcodedLogic — the extension's built-in content library.
//
// This was a single 338KB literal. It is now assembled from one file per
// section, and the presets and chain-of-thought sets are split again by
// generation, because those two were 1,300 of the 1,600 lines between them.
//
// The assembled object is IDENTICAL in shape and key order to what this file
// used to export, so nothing downstream changed. Import sites keep working:
//     import { hardcodedLogic } from "./data/database.js";
//
// To edit content, go to the section file — not here. This file only wires.
// ─────────────────────────────────────────────────────────────────────────────

import { modes } from "./modes/index.js";
import { personalities } from "./personalities.js";
import { toggles } from "./toggles.js";
import { styles } from "./styles.js";
import { styleTemplates } from "./styleTemplates.js";
import { directStyles } from "./directStyles.js";
import { addons } from "./addons.js";
import { blocks } from "./blocks.js";
import { models } from "./cot/index.js";

export const hardcodedLogic = {
    modes,
    personalities,
    toggles,
    styles,
    styleTemplates,
    directStyles,
    addons,
    blocks,
    models,
};

// Section-level exports, for code that wants one list without the whole library.
export { modes, personalities, toggles, styles, styleTemplates, directStyles, addons, blocks, models };
