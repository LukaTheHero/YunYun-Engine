// ──────────────────────────────────────────────
// Megumin Mode: localization keys for catalog entries
// ──────────────────────────────────────────────
// Catalog ids ("v10-core", "dir_v7.5", "balance Test") are not valid key segments, so each one is
// spelled as lower camel case. The megumin-client regression checks that every key built here exists
// in en.json, so a new catalog entry cannot ship without its copy.

/** "v10-core" → "v10Core", "dir_v7.5" → "dirV75", "100" → "n100". */
export function meguminKeySegment(id: string): string {
  const words = id.split(/[^A-Za-z0-9]+/u).filter(Boolean);
  const joined = words
    .map((word, index) =>
      index === 0 ? word.charAt(0).toLowerCase() + word.slice(1) : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join("");
  return /^[a-z]/u.test(joined) ? joined : `n${joined}`;
}

export const meguminEngineDescriptionKey = (engineId: string) =>
  `megumin.engines.${meguminKeySegment(engineId)}.description`;
export const meguminCotDescriptionKey = (frameworkId: string) =>
  `megumin.cot.frameworks.${meguminKeySegment(frameworkId)}.description`;
export const meguminCotLanguageKey = (languageId: string) => `megumin.cot.languages.${meguminKeySegment(languageId)}`;
export const meguminThinkEffortKey = (effortId: string) => `megumin.cot.efforts.${meguminKeySegment(effortId)}`;
export const meguminV7ModuleKey = (moduleId: string, part: "label" | "description") =>
  `megumin.engine.v7Modules.${meguminKeySegment(moduleId)}.${part}`;
export const meguminPersonalityKey = (id: string, part: "label" | "description") =>
  `megumin.narrator.personalities.${meguminKeySegment(id)}.${part}`;
export const meguminToggleKey = (id: string) => `megumin.narrator.toggles.${meguminKeySegment(id)}`;
export const meguminAddonKey = (id: string, part: "label" | "description") =>
  `megumin.addons.items.${meguminKeySegment(id)}.${part}`;
export const meguminStyleKey = (id: string, part: "name" | "description") =>
  `megumin.style.precooked.${meguminKeySegment(id)}.${part}`;
export const meguminTemplateKey = (name: string) => `megumin.style.templates.${meguminKeySegment(name)}`;
export const meguminTagCategoryKey = (category: string) => `megumin.style.tagCategories.${meguminKeySegment(category)}`;
export const meguminStoryFieldKey = (fieldKey: string, part: "label" | "hint" | "placeholder" | "defaultLabel") =>
  `megumin.storyConfig.fields.${fieldKey}.${part}`;
export const meguminStoryOptionKey = (fieldKey: string, label: string) =>
  `megumin.storyConfig.fields.${fieldKey}.options.${meguminKeySegment(label)}`;
export const meguminStoryPresetKey = (presetId: string) => `megumin.storyConfig.presets.${meguminKeySegment(presetId)}`;
