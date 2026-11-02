// @ts-nocheck
// Vendored from Megumin Suite src/state/modules/stats/index.js @ b3656d12a39a — https://github.com/Arif-salah/Megumin-Suite
// © KazumaONIISAN, licensed CC BY-NC 4.0 (packages/shared/src/megumin/LICENSE.md). Changes: see
// scripts/megumin/sync-megumin.mjs. Generated — edit the sync script's patches, not this file.
// Bonds, Character Sheet, Inner Chatter and Story Tracker as state-store modules
// (plan 008). The store undoes them with swipes, edits and deletes, like World State.
// CYOA (plan 009): kept only so choices Chomusuke wrote survive reloads and swipes;
// it is never fed back to the story model.

import { parseBonds, parseSheet, parseLatest } from "./parse.js";
import { emptyBonds, emptySheet, emptyLatest, applyBonds, applySheet, applyLatest } from "./model.js";

export const bondsModule = { id: "bonds", version: 1, empty: emptyBonds, parse: parseBonds, apply: applyBonds };
export const sheetModule = { id: "sheet", version: 1, empty: emptySheet, parse: parseSheet, apply: applySheet };
export const chatterModule = { id: "chatter", version: 1, empty: emptyLatest, parse: t => parseLatest(t, "NPC_Inner_Chatter"), apply: applyLatest };
export const trackerModule = { id: "tracker", version: 1, empty: emptyLatest, parse: t => parseLatest(t, "Story_Tracker"), apply: applyLatest };
export const cyoaModule = { id: "cyoa", version: 1, empty: emptyLatest, parse: t => parseLatest(t, "CYOA"), apply: applyLatest };
