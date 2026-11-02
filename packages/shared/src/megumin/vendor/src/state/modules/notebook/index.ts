// @ts-nocheck
// Vendored from Megumin Suite src/state/modules/notebook/index.js @ b3656d12a39a — https://github.com/Arif-salah/Megumin-Suite
// © KazumaONIISAN, licensed CC BY-NC 4.0 (packages/shared/src/megumin/LICENSE.md). Changes: see
// scripts/megumin/sync-megumin.mjs. Generated — edit the sync script's patches, not this file.
// Author's Notebook as a state-store module (plan 010). The store undoes it
// with swipes, edits and deletes, like World State. Phase 1: the pure core.

import { parseNotebook } from "./parse.js";
import { emptyNotebook, applyNotebook } from "./model.js";

export const notebookModule = {
    id: "notebook",
    version: 2,
    empty: emptyNotebook,
    parse: text => parseNotebook(text),
    apply: applyNotebook
};
