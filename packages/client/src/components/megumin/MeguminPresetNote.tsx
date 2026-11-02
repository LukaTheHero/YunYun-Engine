// ──────────────────────────────────────────────
// Megumin Suite: which preset a Roleplay chat really runs on
// ──────────────────────────────────────────────
// MEGUMINTOGGLE swaps the stock preset for Megumin Suite V11 Universal (and a
// Megumin preset back to the stock one when off). The chat's own setting is
// left alone, so the preset picker says so here.
import { useTranslation } from "react-i18next";
import { WandSparkles } from "lucide-react";
import { useUIStore } from "../../stores/ui.store";
import { useMeguminEnabled, useMeguminStatus } from "../../hooks/use-megumin";

export function MeguminPresetNote({ promptPresetId }: { promptPresetId: string | null }) {
  const { t } = useTranslation();
  const enabled = useMeguminEnabled();
  const status = useMeguminStatus().data;
  if (!status) return null;
  const meguminIds = new Set(status.presets.map((p) => p.id).filter(Boolean));
  const defaultName = status.presets.find((p) => p.systemKey === status.defaultPresetSystemKey)?.name ?? "";
  const onStock = !promptPresetId || promptPresetId === status.stockPresetId;
  const onMegumin = !!promptPresetId && meguminIds.has(promptPresetId);

  const message =
    enabled && onStock
      ? t("megumin.presetNote.swappedIn", { name: defaultName })
      : !enabled && onMegumin
        ? t("megumin.presetNote.swappedOut")
        : enabled && onMegumin
          ? t("megumin.presetNote.active")
          : null;
  if (!message) return null;

  return (
    <div className="mt-2 flex items-start gap-2 rounded-lg bg-[var(--secondary)]/60 px-2.5 py-2 text-[0.6875rem] leading-relaxed text-[var(--muted-foreground)]">
      <WandSparkles size="0.8125rem" className="mt-0.5 shrink-0 text-rose-500" />
      <div className="min-w-0 flex-1">
        <p>{message}</p>
        <button
          type="button"
          onClick={() => useUIStore.getState().openRightPanel("megumin")}
          className="mt-1 font-medium text-[var(--primary)] hover:underline"
        >
          {t("megumin.presetNote.openPanel")}
        </button>
      </div>
    </div>
  );
}
