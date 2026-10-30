import { MEGUMIN_ADDON_CATALOG, type MeguminAddonMeta } from "@marinara-engine/shared";

/**
 * The add-on list after a click on `addon`: on becomes off, off becomes on. Add-ons of one exclusive
 * group share a prompt anchor, so turning one on turns the others off (the server refuses both).
 */
export function toggleMeguminAddon(
  addons: readonly string[],
  addon: Pick<MeguminAddonMeta, "id" | "exclusive">,
): string[] {
  if (addons.includes(addon.id)) return addons.filter((id) => id !== addon.id);
  const rivals = addon.exclusive
    ? MEGUMIN_ADDON_CATALOG.filter((entry) => entry.id !== addon.id && entry.exclusive === addon.exclusive).map(
        (entry) => entry.id,
      )
    : [];
  return [...addons.filter((id) => !rivals.includes(id)), addon.id];
}
