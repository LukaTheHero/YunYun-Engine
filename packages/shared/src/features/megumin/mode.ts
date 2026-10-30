// ──────────────────────────────────────────────
// Megumin Mode: which prompt presets run the Megumin pipeline
// ──────────────────────────────────────────────

/** `engineMode` of a Megumin preset: the stock Megumin Suite preset and every copy or export of it. */
export const MEGUMIN_ENGINE_MODE = "megumin";

/** Every value `prompt_presets.engineMode` may hold. "" is an ordinary preset. */
export const PROMPT_PRESET_ENGINE_MODES = ["", MEGUMIN_ENGINE_MODE] as const;
export type PromptPresetEngineMode = (typeof PROMPT_PRESET_ENGINE_MODES)[number];

/** Read a stored or imported value. Anything unknown is an ordinary preset. */
export function normalizePromptPresetEngineMode(value: unknown): PromptPresetEngineMode {
  return value === MEGUMIN_ENGINE_MODE ? MEGUMIN_ENGINE_MODE : "";
}

/**
 * True for a preset built for Megumin Mode. A turn runs Megumin only when this holds for the
 * resolved preset, the `meguminMode` feature switch is on and the chat is in Roleplay mode.
 */
export function isMeguminPreset(preset: { engineMode?: unknown } | null | undefined): boolean {
  return preset?.engineMode === MEGUMIN_ENGINE_MODE;
}
