// ──────────────────────────────────────────────
// Roleplay chat: "Megumin Mode is off" banner (decision M2)
// ──────────────────────────────────────────────
// A chat assigned a Megumin preset keeps it while the switch is off, but generates with the starred
// preset (or the stock Universal one) instead, so the reader is told which and can turn the mode on.
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { useMeguminSwitch } from "./use-megumin-assign";
import { useMeguminMode } from "./use-megumin-mode";

export function MeguminOffBanner() {
  const { t } = useTranslation();
  const mode = useMeguminMode();
  const { setEnabled, pending, lockedBy } = useMeguminSwitch();
  if (mode.enabled || !mode.skippedMeguminPresetId) return null;

  return (
    <div
      role="status"
      data-megumin-off-banner
      className="mx-3 mb-1.5 flex flex-wrap items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs text-[var(--marinara-chat-chrome-text)]"
    >
      <Sparkles size="0.75rem" aria-hidden="true" className="shrink-0 text-[var(--primary)]" />
      <span className="min-w-0">
        {mode.usedPreset
          ? t("megumin.offBanner.message", { preset: mode.usedPreset.name })
          : t("megumin.offBanner.messageNoFallback")}
      </span>
      {!lockedBy && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            void setEnabled(true).catch(() => {
              toast.error(t("megumin.presetCard.saveFailed"));
            })
          }
          className="mari-chrome-control mari-chrome-control--small px-2 py-0.5 text-[0.6875rem] disabled:opacity-50"
        >
          {t("megumin.offBanner.turnOn")}
        </button>
      )}
    </div>
  );
}
