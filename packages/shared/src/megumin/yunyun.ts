// ──────────────────────────────────────────────────────────────────────────────
// Megumin Suite on YunYun — the names both sides agree on.
// ──────────────────────────────────────────────────────────────────────────────

/** App setting that holds Megumin's whole store (SillyTavern's extension_settings["Megumin-Suite"]). */
export const MEGUMIN_STORE_KEY = "megumin";

/** The feature switch behind MEGUMINTOGGLE (Settings › Features, the top bar, the Megumin panel). */
export const MEGUMIN_FEATURE_SWITCH = "megumin" as const;

/** Chat metadata keys Megumin owns; nothing else in a chat's metadata is ever written by it. */
export const MEGUMIN_METADATA_PREFIX = "megumin_";

/** The bundled Megumin presets, by system key. V11 Universal is YunYun's default while MEGUMINTOGGLE is on. */
export const MEGUMIN_PRESETS = [
  {
    systemKey: "megumin-suite-v11-universal",
    file: "Megumin Suite V11 Universal.json",
    name: "Megumin Suite V11 Universal",
    description:
      "Megumin Suite's V11 Тайна engine: a prompt built fresh every turn. YunYun's default preset while Megumin is on.",
  },
  {
    systemKey: "megumin-suite-v10-cache-friendly",
    file: "Megumin Suite V10 Universal Cache Friendly.json",
    name: "Megumin Suite V10 Universal (Cache Friendly)",
    description: "Megumin Suite's V10 preset layout, for the older engines.",
  },
  {
    systemKey: "megumin-suite-v10-backwards-compatibility",
    file: "Megumin Suite V10 Universal backwards compatibility.json",
    name: "Megumin Suite V10 Universal (Backwards Compatibility)",
    description: "Megumin Suite's V10 preset layout with the old per-block slots.",
  },
] as const;

export type MeguminPresetSystemKey = (typeof MEGUMIN_PRESETS)[number]["systemKey"];

export const MEGUMIN_DEFAULT_PRESET_SYSTEM_KEY: MeguminPresetSystemKey = "megumin-suite-v11-universal";

export function isMeguminPresetSystemKey(key: unknown): key is MeguminPresetSystemKey {
  return typeof key === "string" && MEGUMIN_PRESETS.some((p) => p.systemKey === key);
}

/** Chomusuke's "use my current connection" value (engine/tasks.ts CURRENT_CONNECTION). */
export const MEGUMIN_CURRENT_CONNECTION = "__current__";
