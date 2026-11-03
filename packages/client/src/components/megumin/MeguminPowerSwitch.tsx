// ──────────────────────────────────────────────
// MEGUMINTOGGLE
// ──────────────────────────────────────────────
// The one switch for Megumin Suite. On (the default), Roleplay chats on the
// stock preset run in Megumin mode: its preset, its engine and its after-reply
// work. Off, every prompt is built exactly as YunYun builds it without Megumin.
// The switch is the server feature switch "megumin" (Settings › Advanced ›
// Features shows the same one).
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { WandSparkles } from "lucide-react";
import { FEATURE_SWITCH_DEFAULTS, type FeatureSettings } from "@marinara-engine/shared";
import { cn } from "../../lib/utils";
import { getPrivilegedActionErrorMessage } from "../../lib/api-client";
import { useFeatureSettings, useSaveFeatureSettings } from "../../hooks/use-feature-settings";
// Loaded with the top bar, so a card's "open this tab" request is heard before the panel exists.
import "../../lib/megumin-tab-request";

export function useMeguminPower() {
  const query = useFeatureSettings();
  const save = useSaveFeatureSettings();
  const settings = query.data?.settings;
  const locked = query.data?.envOverrides?.megumin ?? null;
  const enabled = query.data?.effective?.megumin ?? settings?.megumin ?? FEATURE_SWITCH_DEFAULTS.megumin;

  const setEnabled = (value: boolean, messages: { failed: string }) => {
    const next: FeatureSettings = { ...(settings ?? {}), megumin: value };
    // Store only what differs from the default, as Settings › Features does.
    if (next.megumin === FEATURE_SWITCH_DEFAULTS.megumin) delete next.megumin;
    save.mutate(next, {
      onError: (error) => toast.error(getPrivilegedActionErrorMessage(error, messages.failed)),
    });
  };

  return { enabled, locked, pending: save.isPending || !query.data, setEnabled };
}

/**
 * `large` is the Megumin Suite window's card; `compact` is the top bar's pill, which stays on phones too.
 */
export function MeguminPowerSwitch({
  size,
  onOpenPanel,
  panelOpen = false,
}: {
  size: "large" | "compact";
  /** The top bar shows a button opening the Megumin Suite window beside the switch. */
  onOpenPanel?: () => void;
  panelOpen?: boolean;
}) {
  const { t } = useTranslation();
  const { enabled, locked, pending, setEnabled } = useMeguminPower();
  const toggle = () => {
    if (locked) {
      toast.info(t("settings.features.envLocked", { name: locked }));
      return;
    }
    setEnabled(!enabled, { failed: t("megumin.toggle.saveFailed") });
  };
  const state = enabled ? t("megumin.toggle.on") : t("megumin.toggle.off");

  if (size === "compact") {
    return (
      <div data-component="MeguminToggle" className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={t("megumin.toggle.aria", { state })}
          title={enabled ? t("megumin.toggle.titleOn") : t("megumin.toggle.titleOff")}
          data-tour="megumin-toggle"
          disabled={pending}
          onClick={toggle}
          className={cn(
            "mari-megumin-toggle flex h-8 items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-[0.625rem] font-extrabold uppercase tracking-wider ring-1 transition-colors disabled:opacity-70 [@media(pointer:coarse)]:h-11",
            enabled
              ? "mari-megumin-toggle--on ring-transparent"
              : "text-[var(--muted-foreground)] ring-[var(--border)] hover:text-[var(--foreground)]",
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition-colors",
              enabled ? "bg-white/30" : "bg-[var(--border)]",
            )}
          >
            <span
              className={cn(
                "block h-3 w-3 rounded-full bg-white shadow-sm transition-transform",
                enabled ? "translate-x-3" : "translate-x-0",
              )}
            />
          </span>
          <span className="max-sm:hidden">{t("megumin.toggle.name")}</span>
          <span className="sm:hidden">{t("megumin.toggle.short")}</span>
        </button>
        {onOpenPanel ? (
          <button
            type="button"
            onClick={onOpenPanel}
            data-tour="panel-megumin"
            aria-pressed={panelOpen}
            title={t("megumin.toggle.openPanel")}
            aria-label={t("megumin.toggle.openPanel")}
            className={cn(
              "mari-topbar-action relative flex h-8 w-8 items-center justify-center rounded-lg p-0 text-[var(--muted-foreground)] transition-all hover:bg-[var(--accent)] hover:text-rose-400 active:scale-95 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11",
              panelOpen && "bg-[var(--accent)] text-rose-400 shadow-sm",
            )}
          >
            <WandSparkles size={15} />
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div
      data-component="MeguminPowerBanner"
      className={cn(
        "flex flex-col gap-2 rounded-xl p-3 ring-1 transition-colors",
        enabled ? "mari-megumin-toggle--on ring-transparent" : "bg-[var(--background)]/40 ring-[var(--border)]",
      )}
    >
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-sm font-extrabold uppercase tracking-wider">
            <WandSparkles size="0.875rem" />
            {t("megumin.toggle.name")}
          </div>
          <div
            className={cn(
              "text-[0.6875rem] font-semibold",
              enabled ? "text-white/85" : "text-[var(--muted-foreground)]",
            )}
          >
            {state}
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={t("megumin.toggle.aria", { state })}
          disabled={pending || !!locked}
          onClick={toggle}
          className={cn(
            "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 transition-colors disabled:opacity-60",
            enabled ? "bg-white/30" : "bg-[var(--border)]",
          )}
        >
          <span
            className={cn(
              "block h-6 w-6 rounded-full bg-white shadow-md transition-transform",
              enabled ? "translate-x-5" : "translate-x-0",
            )}
          />
        </button>
      </div>
      <div
        className={cn(
          "text-[0.6875rem] leading-relaxed [@media(max-height:50rem)]:hidden",
          enabled ? "text-white/85" : "text-[var(--muted-foreground)]",
        )}
      >
        {enabled ? t("megumin.toggle.descriptionOn") : t("megumin.toggle.descriptionOff")}
      </div>
      {locked ? (
        <div className="text-[0.6875rem] opacity-80">{t("settings.features.envLocked", { name: locked })}</div>
      ) : null}
    </div>
  );
}
