// @ts-nocheck
// Vendored from Megumin Suite src/features/imagegen/comfyUrl.js @ b3656d12a39a — https://github.com/Arif-salah/Megumin-Suite
// © KazumaONIISAN, licensed CC BY-NC 4.0 (packages/shared/src/megumin/LICENSE.md). Changes: see
// scripts/megumin/sync-megumin.mjs. Generated — edit the sync script's patches, not this file.
// ────────────────────────────────────────────────────────────────────────────
// The ComfyUI address, ready to have "/path" added. Users often type it with a
// trailing slash ("http://host:8188/"); that made "//object_info", which
// ComfyUI answers with 404. Pure, so it is unit-tested.
// ────────────────────────────────────────────────────────────────────────────

export function comfyBase(url) {
    return String(url || "").trim().replace(/\/+$/, "");
}
