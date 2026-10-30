import { isStockMarinaraUniversalPreset, isStockMeguminPreset } from "@marinara-engine/shared";
import { MEGUMIN_BANNER_URL } from "../features/megumin/megumin-assets";

export const MARINARA_UNIVERSAL_PRESET_ARTWORK = "/sprites/yunyun/chibi-yunyun.png";

/** A custom picture wins; otherwise a stock preset gets its artwork by reserved systemKey, so a rename cannot drop it. */
export function resolvePresetArtwork(preset: { imagePath?: string | null; systemKey?: string | null }): string | null {
  if (preset.imagePath) return preset.imagePath;
  if (isStockMarinaraUniversalPreset(preset)) return MARINARA_UNIVERSAL_PRESET_ARTWORK;
  if (isStockMeguminPreset(preset)) return MEGUMIN_BANNER_URL;
  return null;
}
