import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FEATURE_SETTINGS_KEY,
  FEATURE_SWITCH_DEFAULTS,
  resolveFeatureEnabled,
  type FeatureSettings,
  type FeatureSettingsResponse,
  type FeatureSwitchName,
} from "@marinara-engine/shared";
import { api } from "../lib/api-client";

const FEATURES_PATH = `/app-settings/${FEATURE_SETTINGS_KEY}`;

export const featureSettingsKeys = {
  all: [FEATURE_SETTINGS_KEY] as const,
};

/** Server-side Settings > Advanced > Features switches. Absent keys use the registry default (off). */
export function useFeatureSettings() {
  return useQuery<FeatureSettingsResponse>({
    queryKey: featureSettingsKeys.all,
    queryFn: () => api.get<FeatureSettingsResponse>(FEATURES_PATH),
    // Short, like the extension policy query: a .env change can lock or unlock a switch while Settings is open.
    staleTime: 30_000,
  });
}

/**
 * Whether a switch is in effect on the server: the environment value when one pins it, else the
 * saved setting, else the default. Returns the default (off) until the settings load.
 */
export function useFeatureEnabled(name: FeatureSwitchName): boolean {
  return readFeatureEnabled(useFeatureSettings().data, name);
}

/** useFeatureEnabled outside a component, from the loaded settings (off until they load). */
export function readFeatureEnabled(data: FeatureSettingsResponse | undefined, name: FeatureSwitchName): boolean {
  return data?.effective?.[name] ?? resolveFeatureEnabled(data?.settings, name);
}

/**
 * `settings` with `patch` applied, keeping only what differs from the defaults so a later default change
 * still reaches this install. `PUT /features` replaces the whole object, so every save sends this.
 */
export function mergeFeatureSettings(settings: FeatureSettings | undefined, patch: FeatureSettings): FeatureSettings {
  const next: FeatureSettings = { ...(settings ?? {}), ...patch };
  for (const key of Object.keys(next) as FeatureSwitchName[]) {
    if (next[key] === FEATURE_SWITCH_DEFAULTS[key]) delete next[key];
  }
  return next;
}

/** Save the complete switch object (omitted keys return to their defaults). */
export function useSaveFeatureSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: FeatureSettings) => api.put<FeatureSettingsResponse>(FEATURES_PATH, settings),
    onSuccess: async (response) => {
      await queryClient.cancelQueries({ queryKey: featureSettingsKeys.all });
      queryClient.setQueryData<FeatureSettingsResponse>(featureSettingsKeys.all, response);
    },
  });
}
