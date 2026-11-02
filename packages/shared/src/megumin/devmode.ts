// ──────────────────────────────────────────────────────────────────────────────
// Dev Mode's reads (Megumin src/ui/devmode.js), resolved on the server.
//
// The slot registry carries functions (a slot's built-in text for the profile in
// effect, its presets, its picker, whether it is live) and the preset skeleton
// lives in the library the client does not bundle, so Dev Mode asks for both as
// plain data, already resolved against the profile it is editing.
// Derived from Megumin Suite (CC BY-NC 4.0, see LICENSE.md).
// ──────────────────────────────────────────────────────────────────────────────
import { MEGUMIN_SLOT_REGISTRY, meguminSlotIsLive } from "./vendor/data/slots.js";
import { SKELETON } from "./vendor/data/skeleton.js";
import { hardcodedLogic } from "./vendor/data/database.js";
import { meguminCotEntryForMode } from "./vendor/data/cot/index.js";
import { expandPresetSections } from "./vendor/src/engine/presetSections.js";
import { localProfile } from "./vendor/src/core/state.js";

const CACHE_FRIENDLY_RE = /cache[\s_-]?friendly/i;

function text(fn: unknown, ...args: unknown[]): string {
  try {
    return typeof fn === "function" ? String(fn(...args) ?? "") : String(fn ?? "");
  } catch {
    return "";
  }
}

export function meguminDevModeData(opts: { presetName?: string } = {}) {
  const profile = localProfile as Record<string, any>;
  const skeleton = (frame?: "v11") =>
    (SKELETON as Array<Record<string, any>>).map((c) => ({
      id: c.id,
      name: c.name,
      role: c.role,
      marker: !!c.marker,
      enabled: c.enabled !== false,
      content: expandPresetSections(c.content, frame ? { frame } : {}),
    }));
  return {
    slots: (MEGUMIN_SLOT_REGISTRY as Array<Record<string, any>>).map((s) => {
      let options: unknown[] = [];
      try {
        options = s.picker && typeof s.picker.options === "function" ? s.picker.options() || [] : [];
      } catch {
        options = [];
      }
      return {
        key: s.key ?? null,
        trigger: s.trigger,
        label: s.label,
        hint: s.hint ?? "",
        scope: s.scope,
        group: s.group,
        carrier: s.carrier ?? null,
        overridable: !!s.overridable,
        hidden: !!s.hidden,
        structural: !!s.structural,
        deprecated: !!s.deprecated,
        where: s.where ?? null,
        gate: s.gate ? { label: s.gate.label ?? null, where: s.gate.where ?? null } : null,
        live: Boolean(meguminSlotIsLive(s, profile)),
        builtin: text(s.fallback, profile),
        presets: (s.presets || []).map((p: Record<string, unknown>) => ({ label: p.label, value: text(p.value) })),
        picker: s.picker ? { label: s.picker.label, options: JSON.parse(JSON.stringify(options)) } : null,
      };
    }),
    skeleton: skeleton(),
    skeletonV11: skeleton("v11"),
    // devmode.js isCacheFriendlyPreset(): the preset in use is the Cache Friendly one.
    cacheFriendly: CACHE_FRIENDLY_RE.test(opts.presetName ?? ""),
  };
}

/**
 * "Clone" on a shipped engine (devmode.js renderDevMode("editor", id)): a copy that remembers its parent
 * and pins the reasoning it shipped with. Null when the id is not a shipped engine.
 */
export function meguminCloneEngine(engineId: string): Record<string, any> | null {
  const core = (hardcodedLogic.modes as Array<Record<string, any>>).find((m) => m.id === engineId);
  if (!core) return null;
  const profile = localProfile as Record<string, any>;
  const copy = JSON.parse(JSON.stringify(core)) as Record<string, any>;
  copy.id = `custom_${Date.now()}`;
  copy.label = `${core.label} (Copy)`;
  copy.isCoreClone = true;
  copy.isV7 = String(core.id).startsWith("v7");
  copy.parentId = core.id;
  copy.customToggles = copy.customToggles ?? [];
  const lang =
    profile.model && String(profile.model).includes("-") ? String(profile.model).split("-").pop() : "english";
  const cot = meguminCotEntryForMode(core.id, lang) as Record<string, any> | null;
  if (cot) {
    if (!copy.cot) copy.cot = cot.content || "";
    if (!copy.prefill) copy.prefill = cot.prefill || "";
  }
  return copy;
}
