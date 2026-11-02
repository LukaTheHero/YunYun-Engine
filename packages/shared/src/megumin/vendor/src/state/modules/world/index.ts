// @ts-nocheck
// Vendored from Megumin Suite src/state/modules/world/index.js @ b3656d12a39a — https://github.com/Arif-salah/Megumin-Suite
// © KazumaONIISAN, licensed CC BY-NC 4.0 (packages/shared/src/megumin/LICENSE.md). Changes: see
// scripts/megumin/sync-megumin.mjs. Generated — edit the sync script's patches, not this file.
// World State as a state-store module. Prompt rendering and instructions join
// this in phase 2; phase 1 is the pure core the store needs.

import { parseWorldBlocks } from "./parse.js";
import { emptyWorld, applyWorldChanges } from "./model.js";

export const worldModule = {
    id: "world",
    // Raise when a parser change should reach entries already on file.
    // 2: 'Matthew "Matt"' is one character with a nickname, not "Matthew Matt".
    version: 2,
    empty: emptyWorld,
    parse: parseWorldBlocks,
    apply: applyWorldChanges
};
