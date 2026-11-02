// @ts-nocheck
// Vendored from Megumin Suite src/utils/regex.js @ b3656d12a39a — https://github.com/Arif-salah/Megumin-Suite
// © KazumaONIISAN, licensed CC BY-NC 4.0 (packages/shared/src/megumin/LICENSE.md). Changes: see
// scripts/megumin/sync-megumin.mjs. Generated — edit the sync script's patches, not this file.
// Escape a string for literal use inside a RegExp.
//
// Three callers in three different layers (the chat cleaner, the profile's NPC
// pruning, and the prompt injector's trigger stripping), so it belongs to none
// of them.

export function escapeRegex(string) { return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
