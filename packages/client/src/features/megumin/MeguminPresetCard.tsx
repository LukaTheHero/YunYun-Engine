// ──────────────────────────────────────────────
// Presets tab: the Megumin Suite card (the Megumin Mode switch and its entry points)
// ──────────────────────────────────────────────
// The only Megumin surface shown while the switch is off. Turning it on assigns the stock Megumin
// preset to the open Roleplay chat, with Undo; no other chat changes.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ExternalLink, Settings2, Sparkles, Star } from "lucide-react";
import { isMeguminPreset, isStockMeguminPreset } from "@marinara-engine/shared";
import { SettingsSwitch } from "../../components/panels/settings/SettingControls";
import { usePresets, useSetDefaultPreset } from "../../hooks/use-presets";
import { useChatStore } from "../../stores/chat.store";
import { useUIStore } from "../../stores/ui.store";
import { MEGUMIN_BANNER_URL, MEGUMIN_SOURCE_URL } from "./megumin-assets";
import { useAssignChatPreset, useMeguminAssignGuard, useMeguminSwitch } from "./use-megumin-assign";
import { useMeguminMode } from "./use-megumin-mode";

export function MeguminPresetCard() {
  const { t } = useTranslation();
  const chat = useChatStore((state) => state.activeChat);
  const openMeguminSuite = useUIStore((state) => state.openMeguminSuite);
  const { data: presets = [] } = usePresets();
  const setDefaultPreset = useSetDefaultPreset();
  const mode = useMeguminMode();
  const { setEnabled, ready, pending, lockedBy } = useMeguminSwitch();
  const assignPreset = useAssignChatPreset();
  const guardAssign = useMeguminAssignGuard();
  const [assigning, setAssigning] = useState(false);

  const stock = presets.find(isStockMeguminPreset) ?? null;
  const roleplayChat = chat?.mode === "roleplay" ? chat : null;
  const effectiveName = mode.effectivePreset?.name ?? "";
  const usesStock = !!stock && mode.effectivePresetId === stock.id;

  const status = !mode.enabled
    ? t("megumin.presetCard.status.off")
    : !roleplayChat
      ? t("megumin.presetCard.status.roleplayOnly")
      : mode.active
        ? t("megumin.presetCard.status.active")
        : mode.connectionForcesPreset
          ? t("megumin.presetCard.status.connectionForces", { preset: effectiveName })
          : effectiveName
            ? t("megumin.presetCard.status.chatUses", { preset: effectiveName })
            : t("megumin.presetCard.status.noPreset");

  const useDisabledReason = !roleplayChat
    ? t("megumin.presetCard.useInChatRoleplayOnly")
    : mode.connectionForcesPreset
      ? t("megumin.presetCard.useInChatConnection", { preset: effectiveName })
      : usesStock
        ? t("megumin.presetCard.useInChatAlready")
        : !stock
          ? t("megumin.presetCard.useInChatMissing")
          : null;

  const assignStock = async () => {
    if (!roleplayChat || !stock) return;
    setAssigning(true);
    try {
      await assignPreset(roleplayChat, stock.id, t("megumin.presetCard.toast.assigned", { name: roleplayChat.name }));
    } catch {
      toast.error(t("megumin.presetCard.assignFailed"));
    } finally {
      setAssigning(false);
    }
  };

  const toggle = async (next: boolean) => {
    try {
      await setEnabled(next);
    } catch {
      toast.error(t("megumin.presetCard.saveFailed"));
      return;
    }
    if (!next) return;
    // Decision M1: switching on also puts the open Roleplay chat on Megumin, unless its connection
    // forces a preset or it already runs a Megumin preset (a customised copy, say).
    if (roleplayChat && stock && !mode.connectionForcesPreset && !isMeguminPreset(mode.effectivePreset)) {
      setAssigning(true);
      try {
        await assignPreset(
          roleplayChat,
          stock.id,
          t("megumin.presetCard.toast.onForChat", { name: roleplayChat.name }),
        );
      } catch {
        toast.error(t("megumin.presetCard.assignFailed"));
      } finally {
        setAssigning(false);
      }
      return;
    }
    toast.success(t("megumin.presetCard.toast.on"));
  };

  return (
    <section
      data-megumin-preset-card
      aria-labelledby="megumin-preset-card-title"
      className="mb-1 flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-2.5"
    >
      <img
        src={MEGUMIN_BANNER_URL}
        alt={t("megumin.presetCard.bannerAlt")}
        width={720}
        height={325}
        loading="lazy"
        decoding="async"
        className="aspect-[720/325] w-full rounded-lg object-cover"
        draggable={false}
      />
      <div className="flex min-w-0 flex-col gap-0.5">
        <h3 id="megumin-preset-card-title" className="flex items-center gap-1.5 text-sm font-semibold">
          <Sparkles size="0.875rem" aria-hidden="true" className="text-[var(--primary)]" />
          {t("megumin.presetCard.title")}
        </h3>
        <p className="text-[0.6875rem] leading-relaxed text-[var(--muted-foreground)]">
          {t("megumin.presetCard.attribution")}{" "}
          <a
            href={MEGUMIN_SOURCE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-[var(--foreground)]"
          >
            {t("megumin.presetCard.sourceLink")}
            <ExternalLink size="0.625rem" aria-hidden="true" />
          </a>
        </p>
        <p className="text-[0.625rem] leading-relaxed text-[var(--muted-foreground)]">
          {t("megumin.presetCard.license")}
        </p>
      </div>

      <SettingsSwitch
        label={<span className="font-semibold">{t("megumin.presetCard.switchLabel")}</span>}
        description={t("megumin.presetCard.switchHelp")}
        checked={mode.enabled}
        onChange={(next) => void toggle(next)}
        disabled={!ready || pending || assigning || !!lockedBy}
        labelPosition="start"
        className="justify-between rounded-lg border border-[var(--border)] px-2.5 py-2"
        labelClassName="text-xs"
      />
      {lockedBy && (
        <p className="text-[0.625rem] text-[var(--muted-foreground)]">
          {t("megumin.presetCard.envLocked", { name: lockedBy })}
        </p>
      )}
      <p data-megumin-status role="status" className="text-[0.6875rem] text-[var(--muted-foreground)]">
        {status}
      </p>

      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          disabled={!!useDisabledReason || assigning}
          title={useDisabledReason ?? undefined}
          onClick={async () => {
            const confirm = await guardAssign(stock);
            if (confirm && (await confirm())) await assignStock();
          }}
          className="mari-chrome-control mari-chrome-control--primary text-xs disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("megumin.presetCard.useInChat")}
        </button>
        <button type="button" onClick={() => openMeguminSuite()} className="mari-chrome-control flex-1 text-xs">
          <Settings2 size="0.75rem" aria-hidden="true" />
          {t("megumin.presetCard.openSuite")}
        </button>
      </div>
      {useDisabledReason && !usesStock && (
        <p data-megumin-use-hint className="text-[0.625rem] leading-relaxed text-[var(--muted-foreground)]">
          {useDisabledReason}
        </p>
      )}
      {mode.enabled && stock && String(stock.isDefault) !== "true" && (
        <button
          type="button"
          onClick={() =>
            setDefaultPreset.mutate(stock.id, {
              onSuccess: () => toast.success(t("megumin.presetCard.toast.madeDefault")),
            })
          }
          className="inline-flex items-center gap-1 self-start text-[0.625rem] text-[var(--muted-foreground)] underline underline-offset-2 hover:text-[var(--foreground)]"
        >
          <Star size="0.625rem" aria-hidden="true" />
          {t("megumin.presetCard.makeDefault")}
        </button>
      )}
    </section>
  );
}
