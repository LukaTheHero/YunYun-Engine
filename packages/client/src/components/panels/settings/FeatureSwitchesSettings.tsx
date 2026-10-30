import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { resolveFeatureEnabled, type FeatureSettings, type FeatureSwitchName } from "@marinara-engine/shared";
import { getPrivilegedActionErrorMessage } from "../../../lib/api-client";
import { mergeFeatureSettings, useFeatureSettings, useSaveFeatureSettings } from "../../../hooks/use-feature-settings";
import { ToggleSetting } from "./SettingControls";

export const FEATURE_SWITCHES_CONTROL_ID = "feature-switches";

/** Server switches in display order. */
const SERVER_SWITCHES: ReadonlyArray<FeatureSwitchName> = [
  "stableLorebookGroupPicks",
  "providerRetry",
  "usageAndActivationStats",
  "messageTrash",
  "meguminMode",
];

/**
 * Settings > Advanced > Features: optional server behaviours. Every switch starts off, which keeps
 * the standard behaviour; a switch pinned by a server environment variable is shown locked.
 */
export function FeatureSwitchesSettings({ anchorId }: { anchorId?: string }) {
  const { t } = useTranslation();
  const query = useFeatureSettings();
  const save = useSaveFeatureSettings();
  const settings = query.data?.settings;
  const envOverrides = query.data?.envOverrides ?? {};
  const envEffective = query.data?.effective ?? {};
  const disabled = !query.data || save.isPending;

  const update = (patch: FeatureSettings) => {
    save.mutate(mergeFeatureSettings(settings, patch), {
      onError: (error) => toast.error(getPrivilegedActionErrorMessage(error, t("settings.features.saveFailed"))),
    });
  };

  return (
    <div id={anchorId} className="flex scroll-mt-3 flex-col gap-1">
      {query.isError ? (
        <p className="px-1.5 text-[0.625rem] leading-relaxed text-[var(--destructive)]">
          {t("settings.features.loadFailed")}
        </p>
      ) : null}
      {SERVER_SWITCHES.map((name) => {
        // A switch pinned by an environment variable shows the value in effect, not the saved one.
        const enabled = envEffective[name] ?? resolveFeatureEnabled(settings, name);
        const envVar = envOverrides[name];
        const locked = envVar ? t("settings.features.envLocked", { name: envVar }) : null;
        return (
          <div key={name} className="flex flex-col">
            <ToggleSetting
              label={t(`settings.features.${name}.label`)}
              checked={enabled}
              disabled={disabled || !!locked}
              onChange={(value) => update({ [name]: value })}
              help={t(`settings.features.${name}.help`)}
            />
            {locked ? (
              <p className="px-1.5 pb-1 text-[0.625rem] leading-relaxed text-[var(--muted-foreground)]">{locked}</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
