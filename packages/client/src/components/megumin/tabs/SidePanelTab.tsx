// ──────────────────────────────────────────────
// Megumin panel: Side Panel
// ──────────────────────────────────────────────
// Port of Megumin Suite's Side Panel tab (src/ui/tabs/sidePanelTab.js): the
// tracker panel's settings (docked or floating, edge, width, scale, sections,
// the Present Characters bar, inline hiding), plus a live view of what the
// panel shows for the open chat.
// Derived from Megumin Suite (CC BY-NC 4.0, see packages/shared/src/megumin/LICENSE.md).
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  CircleCheck,
  CircleX,
  Crosshair,
  Layers,
  PanelRight,
  RefreshCw,
  RotateCcw,
  SquareUser,
  Trash2,
  Users,
  Wrench,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "../../../lib/utils";
import { showConfirmDialog } from "../../../lib/app-dialogs";
import { meguminKeys } from "../../../hooks/use-megumin";
import { chatKeys } from "../../../hooks/use-chats";
import { useMeguminPanel } from "../megumin-panel-context";
import {
  MEGUMIN_INPUT_CLASS,
  MeguminButton,
  MeguminFeatureBar,
  MeguminGrid,
  MeguminHint,
  MeguminNumber,
  useDraftText,
  MeguminSection,
  MeguminSelect,
  MeguminToggle,
} from "../MeguminControls";
import { Callout } from "./presetControls";
import {
  MeguminTrackerSections,
  PRESENT_BAR_DEFAULTS,
  SIDE_PANEL_DEFAULTS,
  orderedSections,
  presentBarSettingsOf,
  sidePanelSettingsOf,
  withSectionLayoutReset,
  type MeguminPresentBarSettings,
  type MeguminSidePanelSettings,
} from "../sidepanel/MeguminSidePanel";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function SidePanelTab() {
  const { t } = useTranslation();
  const { view, saveGlobal, chatId, openTab } = useMeguminPanel();
  const qc = useQueryClient();
  const cfg = sidePanelSettingsOf(view);
  const pb = presentBarSettingsOf(view);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const isDocked = cfg.mode !== "floating";

  const save = (patch: Partial<MeguminSidePanelSettings>) => saveGlobal({ sidePanel: { ...cfg, ...patch } });
  const savePb = (patch: Partial<MeguminPresentBarSettings>) => saveGlobal({ presentBar: { ...pb, ...patch } });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: [...meguminKeys.all, "view"] });
    if (chatId) void qc.invalidateQueries({ queryKey: chatKeys.messagePeek(chatId) });
    window.dispatchEvent(new CustomEvent("megumin:side-panel-refresh"));
    setRefreshNonce((n) => n + 1);
    toast.success(t("megumin.sidepanel.refreshed"));
  };

  const resetAll = async () => {
    const ok = await showConfirmDialog({
      title: t("megumin.sidepanel.resetAll.title"),
      message: t("megumin.sidepanel.resetAll.confirm"),
      confirmLabel: t("megumin.sidepanel.resetAll.button"),
      tone: "destructive",
    });
    if (!ok) return;
    saveGlobal({ sidePanel: clone(SIDE_PANEL_DEFAULTS), presentBar: clone(PRESENT_BAR_DEFAULTS) });
    toast.success(t("megumin.sidepanel.resetAll.done"));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <MeguminHint>{t("megumin.sidepanel.intro")}</MeguminHint>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold ring-1",
            cfg.enabled
              ? "bg-amber-500/12 text-amber-500 ring-amber-500/25"
              : "bg-[var(--accent)] text-[var(--muted-foreground)] ring-[var(--border)]",
          )}
        >
          {cfg.enabled ? <CircleCheck size="0.75rem" /> : <CircleX size="0.75rem" />}
          {cfg.enabled ? t("megumin.sidepanel.badgeEnabled") : t("megumin.sidepanel.badgeDisabled")}
        </span>
      </div>

      <Callout tone="red">
        <div className="flex flex-col gap-2">
          <span>
            <strong className="font-semibold text-[var(--foreground)]">
              {t("megumin.sidepanel.discontinued.title")}
            </strong>{" "}
            {t("megumin.sidepanel.discontinued.body")}
          </span>
          <span>{t("megumin.sidepanel.discontinued.body2")}</span>
        </div>
      </Callout>

      <MeguminFeatureBar
        icon={<PanelRight size="0.875rem" className="text-amber-500" />}
        title={t("megumin.sidepanel.enable.label")}
        description={t("megumin.sidepanel.enable.help")}
        checked={cfg.enabled}
        onChange={(v) => save({ enabled: v })}
      />

      {cfg.enabled ? (
        // Wide: the settings on the left, what the panel shows on the right at about a docked panel's width.
        <div className="grid grid-cols-1 items-start gap-4 @4xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
          <MeguminSection
            title={t("megumin.sidepanel.live.title")}
            description={t("megumin.sidepanel.live.description")}
            icon={<PanelRight size="0.875rem" />}
            className="@4xl:sticky @4xl:top-[5.5rem] @4xl:order-last @4xl:max-h-[calc(min(92dvh,62rem)-7rem)] @4xl:overflow-y-auto"
          >
            {chatId ? (
              <div className="meg-sp-scope meg-sp-inline">
                <div className="meg-sp-body">
                  <MeguminTrackerSections
                    key={refreshNonce}
                    view={view}
                    chatId={chatId}
                    cfg={cfg}
                    onSave={(next) => saveGlobal({ sidePanel: next })}
                    onOpenNpcBook={() => openTab("npc")}
                  />
                </div>
              </div>
            ) : (
              <MeguminHint tone="warning">{t("megumin.panel.needsChat")}</MeguminHint>
            )}
          </MeguminSection>

          <div className="@container flex min-w-0 flex-col gap-4">
            <MeguminSection title={t("megumin.sidepanel.panelGroup.title")} icon={<PanelRight size="0.875rem" />}>
              <MeguminGrid layout="fields" className="gap-x-4 gap-y-4">
                <MeguminSelect
                  label={t("megumin.sidepanel.mode.label")}
                  help={t("megumin.sidepanel.mode.help")}
                  value={isDocked ? "docked" : "floating"}
                  options={[
                    { value: "docked", label: t("megumin.sidepanel.mode.docked") },
                    { value: "floating", label: t("megumin.sidepanel.mode.floating") },
                  ]}
                  onChange={(v) => save({ mode: v === "floating" ? "floating" : "docked" })}
                />
                {isDocked ? (
                  <>
                    <MeguminSelect
                      label={t("megumin.sidepanel.position.label")}
                      help={t("megumin.sidepanel.position.help")}
                      value={cfg.position === "left" ? "left" : "right"}
                      options={[
                        { value: "right", label: t("megumin.sidepanel.position.right") },
                        { value: "left", label: t("megumin.sidepanel.position.left") },
                      ]}
                      onChange={(v) => save({ position: v === "left" ? "left" : "right" })}
                    />
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <span className="text-[0.8125rem] font-medium text-[var(--marinara-chat-chrome-panel-title)]">
                        {t("megumin.sidepanel.width.label")}
                      </span>
                      <MeguminHint>{t("megumin.sidepanel.width.help")}</MeguminHint>
                      <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
                        <ClampedNumberInput
                          label={t("megumin.sidepanel.width.label")}
                          value={cfg.width || 620}
                          min={320}
                          max={1100}
                          step={10}
                          fallback={620}
                          onCommit={(v) => save({ width: v })}
                        />
                        <span>{t("megumin.sidepanel.px")}</span>
                      </div>
                    </div>
                  </>
                ) : null}
                <MeguminNumber
                  label={t("megumin.sidepanel.scale.label")}
                  help={t("megumin.sidepanel.scale.help")}
                  value={Math.round((cfg.scale || 1) * 100)}
                  min={80}
                  max={140}
                  step={5}
                  slider
                  suffix="%"
                  onChange={(v) => save({ scale: v / 100 })}
                />
              </MeguminGrid>
              <div className="flex items-center justify-between gap-3 border-t border-[var(--border)]/50 pt-3">
                <MeguminHint>{t("megumin.sidepanel.floatReset.help")}</MeguminHint>
                <MeguminButton
                  icon={<Crosshair size="0.75rem" />}
                  onClick={() => {
                    save({ float: { x: null, y: null, w: 620, h: 720 } });
                    toast.success(t("megumin.sidepanel.floatReset.done"));
                  }}
                >
                  {t("megumin.sidepanel.floatReset.button")}
                </MeguminButton>
              </div>
            </MeguminSection>

            <MeguminSection title={t("megumin.sidepanel.sections.title")} icon={<Layers size="0.875rem" />}>
              <MeguminHint>{t("megumin.sidepanel.sections.help")}</MeguminHint>
              <div className="grid grid-cols-1 gap-x-4 gap-y-0.5 rounded-lg border border-[var(--border)]/50 bg-[var(--background)]/30 px-1 py-1 @lg:grid-cols-2">
                {orderedSections(cfg).map((def, i) => (
                  <MeguminToggle
                    key={def.id}
                    label={
                      <span className="inline-flex items-center gap-2">
                        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[var(--accent)] font-mono text-[0.6875rem]">
                          {i + 1}
                        </span>
                        <span className="meg-sp-scope">
                          <i className={`fa-solid ${def.icon}`} />
                        </span>
                        {t(`megumin.sidepanel.section.${def.id}`)}
                      </span>
                    }
                    checked={cfg.sections[def.id]?.visible !== false}
                    onChange={(v) => {
                      const next = clone(cfg);
                      if (!next.sections[def.id]) return;
                      next.sections[def.id]!.visible = v;
                      saveGlobal({ sidePanel: next });
                    }}
                  />
                ))}
              </div>
              <MeguminToggle
                label={t("megumin.sidepanel.autoHide.label")}
                help={t("megumin.sidepanel.autoHide.help")}
                checked={!!cfg.autoHideEmpty}
                onChange={(v) => save({ autoHideEmpty: v })}
              />
              <div className="flex items-center justify-between gap-3 border-t border-[var(--border)]/50 pt-3">
                <MeguminHint>{t("megumin.sidepanel.sectionsReset.help")}</MeguminHint>
                <MeguminButton
                  icon={<RotateCcw size="0.75rem" />}
                  onClick={() => {
                    saveGlobal({ sidePanel: withSectionLayoutReset(cfg) });
                    toast.success(t("megumin.sidepanel.sectionsReset.done"));
                  }}
                >
                  {t("megumin.sidepanel.sectionsReset.button")}
                </MeguminButton>
              </div>
            </MeguminSection>

            <MeguminSection title={t("megumin.sidepanel.bar.groupTitle")} icon={<Users size="0.875rem" />}>
              <MeguminToggle
                label={
                  <span className="inline-flex items-center gap-2">
                    <SquareUser size="0.875rem" />
                    {t("megumin.sidepanel.bar.enable")}
                  </span>
                }
                help={t("megumin.sidepanel.bar.enableHelp")}
                checked={pb.enabled}
                onChange={(v) => savePb({ enabled: v })}
              />
              <MeguminGrid layout="fields" className="gap-x-4 gap-y-4">
                <MeguminSelect
                  label={t("megumin.sidepanel.bar.position")}
                  help={t("megumin.sidepanel.bar.positionHelp")}
                  value={pb.position}
                  options={[
                    { value: "above", label: t("megumin.sidepanel.bar.above") },
                    { value: "below", label: t("megumin.sidepanel.bar.below") },
                    { value: "off", label: t("megumin.sidepanel.bar.off") },
                  ]}
                  onChange={(v) => savePb({ position: v === "below" ? "below" : v === "off" ? "off" : "above" })}
                />
                <div className="flex min-w-0 flex-col gap-1.5">
                  <span className="text-[0.8125rem] font-medium text-[var(--marinara-chat-chrome-panel-title)]">
                    {t("megumin.sidepanel.bar.cardSize")}
                  </span>
                  <MeguminHint>{t("megumin.sidepanel.bar.cardSizeHelp")}</MeguminHint>
                  <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
                    <ClampedNumberInput
                      label={t("megumin.sidepanel.bar.cardWidth")}
                      value={pb.cardWidth || 120}
                      min={80}
                      max={240}
                      step={5}
                      fallback={120}
                      onCommit={(v) => savePb({ cardWidth: v })}
                    />
                    <span aria-hidden="true">{t("megumin.sidepanel.bar.by")}</span>
                    <ClampedNumberInput
                      label={t("megumin.sidepanel.bar.cardHeight")}
                      value={pb.cardHeight || 160}
                      min={100}
                      max={320}
                      step={5}
                      fallback={160}
                      onCommit={(v) => savePb({ cardHeight: v })}
                    />
                    <span>{t("megumin.sidepanel.px")}</span>
                  </div>
                </div>
              </MeguminGrid>
            </MeguminSection>

            <MeguminSection title={t("megumin.sidepanel.advanced.title")} icon={<Wrench size="0.875rem" />}>
              <MeguminToggle
                label={t("megumin.sidepanel.hideInline.label")}
                help={t("megumin.sidepanel.hideInline.help")}
                checked={!!cfg.hideInline}
                onChange={(v) => save({ hideInline: v })}
              />
              <div className="flex items-center justify-between gap-3 border-t border-[var(--border)]/50 pt-3">
                <MeguminHint>{t("megumin.sidepanel.refresh.help")}</MeguminHint>
                <MeguminButton variant="primary" icon={<RefreshCw size="0.75rem" />} onClick={refresh}>
                  {t("megumin.sidepanel.refresh.button")}
                </MeguminButton>
              </div>
              <div className="flex items-center justify-between gap-3">
                <MeguminHint>{t("megumin.sidepanel.resetAll.help")}</MeguminHint>
                <MeguminButton variant="danger" icon={<Trash2 size="0.75rem" />} onClick={resetAll}>
                  {t("megumin.sidepanel.resetAll.button")}
                </MeguminButton>
              </div>
            </MeguminSection>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** A number typed in full before it is clamped and saved (Megumin clamps on every key, which a controlled field cannot). */
function ClampedNumberInput({
  label,
  value,
  min,
  max,
  step,
  fallback,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  fallback: number;
  onCommit: (value: number) => void;
}) {
  const { draft, change, flush } = useDraftText(
    String(value),
    (raw) => onCommit(Math.max(min, Math.min(max, parseInt(raw, 10) || fallback))),
    900,
  );
  return (
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      aria-label={label}
      className={cn(MEGUMIN_INPUT_CLASS, "w-20")}
      value={draft}
      onChange={(e) => change(e.target.value)}
      onBlur={flush}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}
