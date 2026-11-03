// ──────────────────────────────────────────────
// Megumin panel: Settings
// ──────────────────────────────────────────────
// Megumin's Settings tab (src/ui/tabs/globalSettings.js): the preferences that
// apply to every character and chat, the background prompt log, the card
// submission form, and the about card. Everything here lives in the suite's
// globalSettings, saved once for the whole install.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  ClipboardCopy,
  ExternalLink,
  Inbox,
  Info,
  ListTree,
  Power,
  Save,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { cn } from "../../../lib/utils";
import { useClearMeguminBackgroundLog, useMeguminBackgroundLog } from "../../../hooks/use-megumin";
import { useMeguminPanel } from "../megumin-panel-context";
import { useMeguminPower } from "../MeguminPowerSwitch";
import {
  MeguminButton,
  MeguminFeatureBar,
  MeguminGrid,
  MeguminHint,
  MeguminNeedsChat,
  MeguminRow,
  MeguminSection,
  MeguminSelect,
  MeguminToggle,
} from "../MeguminControls";

/** The version on the about card (globalSettings.js SUITE_VERSION). */
const SUITE_VERSION = "V11";
/** "Send me a card" (globalSettings.js SUBMIT_FORM_URL): anonymous, no sign-in. */
const SUBMIT_FORM_URL = "https://tally.so/r/D46yNq";
/** Spent the first time the tab is drawn (globalSettings.js SETTINGS_NOTICE_ID). */
const SETTINGS_NOTICE_ID = "submit-card-v10";
const MEGUMIN_REPO_URL = "https://github.com/Arif-salah/Megumin-Suite";
const LICENSE_URL = "https://creativecommons.org/licenses/by-nc/4.0/";
const PAYPAL = "arifsalah10@gmail.com";
const LITECOIN = "LSjf1DczHxs3GEbkoMmi1UWH2GikmXDtis";

/** The background jobs Settings lists (engine/bgPromptsCore.js BG_JOBS), when the catalog has not loaded them. */
const FALLBACK_BG_JOBS = [
  "memory",
  "npc",
  "world",
  "blocks",
  "notebook",
  "combined",
  "images",
  "banlist",
  "director",
  "style",
].map((id) => ({ id, label: id }));

/** One setting of the Behaviour section (Megumin's mtab-toggle-row): the switch, then what it does. */
function SettingTile({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1 rounded-xl border border-[var(--border)]/60 bg-[var(--background)]/30 p-2",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** The hints under a tile's switch, lined up with its label. */
function TileHints({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-1.5 px-2 pb-1.5">{children}</div>;
}

interface BackgroundLogEntry {
  at: number;
  job: string;
  connection?: string;
  status: "sent" | "cancelled";
  edited?: boolean;
  messages: Array<{ role?: string; text: string }>;
}

/** A job is shown unless its switch was turned off (bgPromptsCore.js bgJobWanted). */
function bgJobWanted(jobs: Record<string, boolean> | undefined, id: string) {
  return !(jobs && jobs[id] === false);
}

function timeOf(at: number) {
  return new Date(at).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function SettingsTab() {
  const { t } = useTranslation();
  const api = useMeguminPanel();
  const { view, catalog, chatId, saveGlobal } = api;
  const power = useMeguminPower();
  const [logOpen, setLogOpen] = useState(false);

  // The power switch is MEGUMINTOGGLE's mirror: never saved back as a second copy.
  const gs: Record<string, any> = { ...(view.globalSettings ?? {}) };
  delete gs.suiteEnabled;
  const saveGs = (patch: Record<string, unknown>) => saveGlobal({ globalSettings: { ...gs, ...patch } });

  // Opening the tab spends the notice (the dot Megumin puts on the gear).
  const noticeSpent = useRef(false);
  useEffect(() => {
    if (noticeSpent.current || !SUBMIT_FORM_URL) return;
    if (gs.settingsNoticeSeen === SETTINGS_NOTICE_ID) return;
    noticeSpent.current = true;
    saveGs({ settingsNoticeSeen: SETTINGS_NOTICE_ID });
    // Once per visit; saveGs reads the settings of this render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gs.settingsNoticeSeen]);

  const jobs = ((catalog.backgroundJobs as Array<{ id: string; label: string }> | undefined) ?? FALLBACK_BG_JOBS).map(
    (j) => ({ id: j.id, label: t(`megumin.settings.bgJob.${j.id}`, { defaultValue: j.label }) }),
  );
  const loreInTasks = gs.loreInTasks === undefined ? true : gs.loreInTasks === true;
  const saveMode = gs.saveMode === "chat" ? "chat" : "character";

  const changeSaveMode = async (next: string) => {
    if (next === saveMode) return;
    // Megumin writes a pending edit under the key it was made on before the mode moves where saves land.
    await api.flush();
    saveGs({ saveMode: next });
    toast.success(
      next === "chat" ? t("megumin.settings.saveMode.changedChat") : t("megumin.settings.saveMode.changedCharacter"),
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <MeguminSection title={t("megumin.settings.behaviour.title")} icon={<SlidersHorizontal size="1rem" />}>
        <MeguminFeatureBar
          icon={<Power size="0.875rem" />}
          title={t("megumin.settings.suite.label")}
          description={t("megumin.settings.suite.desc")}
          checked={power.enabled}
          disabled={power.pending || !!power.locked}
          onChange={(value) => power.setEnabled(value, { failed: t("megumin.toggle.saveFailed") })}
        />
        {power.locked ? (
          <MeguminHint tone="warning">{t("settings.features.envLocked", { name: power.locked })}</MeguminHint>
        ) : null}

        <div className="grid grid-cols-1 items-stretch gap-3 @3xl:grid-cols-2">
          <SettingTile>
            <MeguminToggle
              label={t("megumin.settings.promptPreview.label")}
              checked={gs.promptPreview === true}
              onChange={(value) => saveGs({ promptPreview: value })}
            />
            <TileHints>
              <MeguminHint>{t("megumin.settings.promptPreview.desc")}</MeguminHint>
              <MeguminHint tone="warning">{t("megumin.settings.promptPreview.yunyun")}</MeguminHint>
            </TileHints>
          </SettingTile>

          <SettingTile>
            <MeguminToggle
              label={t("megumin.settings.bgPreview.label")}
              checked={gs.bgPreview === true}
              onChange={(value) => saveGs({ bgPreview: value })}
            />
            <TileHints>
              <MeguminHint>{t("megumin.settings.bgPreview.desc")}</MeguminHint>
              <MeguminHint tone="warning">{t("megumin.settings.bgPreview.yunyun")}</MeguminHint>
              {gs.bgPreview === true ? (
                <fieldset className="mt-1 flex flex-col gap-1 rounded-lg border border-[var(--border)]/60 px-3 pb-2.5 pt-1.5">
                  <legend className="px-1 text-xs font-medium text-[var(--marinara-chat-chrome-panel-title)]">
                    {t("megumin.settings.bgPreview.jobsTitle")}
                  </legend>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                    {jobs.map((job) => (
                      <label
                        key={job.id}
                        className="flex min-w-0 cursor-pointer items-center gap-2 py-1 text-[0.8125rem]"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 shrink-0 accent-[var(--primary)]"
                          checked={bgJobWanted(gs.bgPreviewJobs, job.id)}
                          onChange={(e) =>
                            saveGs({ bgPreviewJobs: { ...(gs.bgPreviewJobs || {}), [job.id]: e.target.checked } })
                          }
                        />
                        <span className="min-w-0 truncate">{job.label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : null}
            </TileHints>
          </SettingTile>

          <SettingTile className={cn("gap-2", logOpen && chatId && "@3xl:col-span-2")}>
            <div className="flex items-start justify-between gap-3 px-2 py-1.5">
              <div className="flex min-w-0 flex-col gap-1">
                <div className="text-[0.8125rem] text-[var(--marinara-chat-chrome-panel-title)]">
                  {t("megumin.settings.bgLog.title")}
                </div>
                <MeguminHint>{t("megumin.settings.bgLog.desc")}</MeguminHint>
              </div>
              <MeguminButton
                icon={<ListTree size="0.75rem" />}
                disabled={!chatId}
                onClick={() => setLogOpen((open) => !open)}
              >
                {logOpen ? t("megumin.settings.bgLog.hide") : t("megumin.settings.bgLog.show")}
              </MeguminButton>
            </div>
            <div className="flex flex-col gap-2 px-2 pb-1.5 empty:hidden">
              {!chatId ? <MeguminNeedsChat /> : null}
              {logOpen && chatId ? <BackgroundLog chatId={chatId} jobs={jobs} /> : null}
            </div>
          </SettingTile>

          <SettingTile>
            <MeguminToggle
              label={t("megumin.settings.utilityPrefill.label")}
              checked={gs.enableUtilityPrefill === true}
              onChange={(value) => saveGs({ enableUtilityPrefill: value })}
            />
            <TileHints>
              <MeguminHint>{t("megumin.settings.utilityPrefill.desc")}</MeguminHint>
            </TileHints>
          </SettingTile>

          <SettingTile>
            <MeguminToggle
              label={t("megumin.settings.chomusukeSwitch.label")}
              checked={gs.chomusukeSwitchConnection === true}
              disabled
              onChange={(value) => saveGs({ chomusukeSwitchConnection: value })}
            />
            <TileHints>
              <MeguminHint>{t("megumin.settings.chomusukeSwitch.desc")}</MeguminHint>
              <MeguminHint tone="warning">{t("megumin.settings.chomusukeSwitch.yunyun")}</MeguminHint>
            </TileHints>
          </SettingTile>

          <SettingTile>
            <MeguminToggle
              label={t("megumin.settings.loreInTasks.label")}
              checked={loreInTasks}
              onChange={(value) => saveGs({ loreInTasks: value })}
            />
            <TileHints>
              <MeguminHint>{t("megumin.settings.loreInTasks.desc")}</MeguminHint>
            </TileHints>
          </SettingTile>
        </div>
      </MeguminSection>

      <MeguminGrid layout="sections" className="items-stretch">
        <MeguminSection title={t("megumin.settings.data.title")} icon={<Save size="1rem" />} className="h-full">
          <div className="@2xl:max-w-md">
            <MeguminSelect
              label={t("megumin.settings.saveMode.label")}
              value={saveMode}
              onChange={(next) => void changeSaveMode(next)}
              options={[
                { value: "character", label: t("megumin.settings.saveMode.character") },
                { value: "chat", label: t("megumin.settings.saveMode.chat") },
              ]}
            />
          </div>
          <MeguminHint>{t("megumin.settings.saveMode.desc")}</MeguminHint>
        </MeguminSection>

        {SUBMIT_FORM_URL ? (
          <MeguminSection title={t("megumin.settings.submit.title")} icon={<Inbox size="1rem" />} className="h-full">
            <div className="text-sm font-semibold text-[var(--marinara-chat-chrome-panel-title)]">
              {t("megumin.settings.submit.heading")}
            </div>
            <MeguminHint>{t("megumin.settings.submit.text")}</MeguminHint>
            <a
              href={SUBMIT_FORM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mari-chrome-control mari-chrome-control--primary inline-flex w-full items-center justify-center gap-1.5 text-xs @xl:w-auto @xl:self-start @xl:px-6"
            >
              <ExternalLink size="0.875rem" />
              {t("megumin.settings.submit.open")}
            </a>
            <MeguminHint>{t("megumin.settings.submit.note")}</MeguminHint>
          </MeguminSection>
        ) : null}
      </MeguminGrid>

      <MeguminSection title={t("megumin.settings.about.title")} icon={<Info size="1rem" />}>
        <div className="flex flex-col gap-0.5">
          <div className="text-base font-bold text-[var(--marinara-chat-chrome-panel-title)]">
            {t("megumin.settings.about.name", { version: SUITE_VERSION })}
          </div>
          <div className="text-xs text-[var(--muted-foreground)]">{t("megumin.settings.about.by")}</div>
        </div>
        <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-3">
          <a
            href={MEGUMIN_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-w-0 items-center gap-3 rounded-xl border border-[var(--border)]/60 px-4 py-3 transition-colors hover:bg-[var(--accent)]"
          >
            <ExternalLink size="1rem" className="shrink-0 text-[var(--muted-foreground)]" />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-semibold">{t("megumin.settings.about.github")}</span>
              <span className="text-xs text-[var(--muted-foreground)]">{t("megumin.settings.about.githubHint")}</span>
            </span>
          </a>
          <div className="flex min-w-0 flex-col gap-0.5 rounded-xl border border-[var(--border)]/60 px-4 py-3">
            <span className="text-sm font-semibold">{t("megumin.settings.about.paypal")}</span>
            <span className="select-all break-all font-mono text-xs text-[var(--muted-foreground)]">{PAYPAL}</span>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5 rounded-xl border border-[var(--border)]/60 px-4 py-3">
            <span className="text-sm font-semibold">{t("megumin.settings.about.litecoin")}</span>
            <span className="select-all break-all font-mono text-xs text-[var(--muted-foreground)]">{LITECOIN}</span>
          </div>
        </div>
        <div className="flex flex-col gap-1.5 border-t border-[var(--border)]/50 pt-3">
          <div className="text-[0.8125rem] font-semibold text-[var(--marinara-chat-chrome-panel-title)]">
            {t("megumin.settings.about.licenseTitle")}
          </div>
          <MeguminHint>{t("megumin.settings.about.license")}</MeguminHint>
          <MeguminHint>{t("megumin.settings.about.port")}</MeguminHint>
          <a
            href={LICENSE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 self-start text-xs text-[var(--primary)] underline-offset-2 hover:underline"
          >
            <ExternalLink size="0.75rem" />
            {t("megumin.settings.about.licenseLink")}
          </a>
        </div>
      </MeguminSection>
    </div>
  );
}

/** The last background prompts sent for this chat (bgPrompts.js openBackgroundLog), newest first. */
function BackgroundLog({ chatId, jobs }: { chatId: string; jobs: Array<{ id: string; label: string }> }) {
  const { t } = useTranslation();
  const log = useMeguminBackgroundLog(chatId);
  const clear = useClearMeguminBackgroundLog(chatId);
  const entries = (log.data?.entries ?? []) as unknown as BackgroundLogEntry[];
  const labelOf = (id: string) => jobs.find((j) => j.id === id)?.label ?? id;

  if (log.isLoading) return <MeguminHint>{t("megumin.settings.bgLog.loading")}</MeguminHint>;
  if (log.isError) return <MeguminHint tone="warning">{t("megumin.settings.bgLog.loadFailed")}</MeguminHint>;
  if (!entries.length) return <MeguminHint>{t("megumin.settings.bgLog.empty")}</MeguminHint>;

  return (
    <div className="flex flex-col gap-2">
      {entries.map((entry, i) => {
        const size = entry.messages.reduce((n, m) => n + String(m.text ?? "").length, 0);
        const text = entry.messages
          .map((m) => `========== [ ${String(m.role || "").toUpperCase()} ] ==========\n${m.text}`)
          .join("\n\n");
        const copy = async () => {
          try {
            await navigator.clipboard.writeText(text);
            toast.success(t("megumin.settings.bgLog.copied"));
          } catch {
            toast.error(t("megumin.settings.bgLog.copyFailed"));
          }
        };
        return (
          <details key={`${entry.at}-${i}`} className="group rounded-lg border border-[var(--border)]/60">
            <summary className="flex cursor-pointer list-none flex-col gap-1 px-3 py-2 text-[0.8125rem]">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{labelOf(entry.job)}</span>
                {entry.status === "cancelled" ? (
                  <span className="rounded-full bg-[var(--destructive)]/15 px-2 py-0.5 text-[0.6875rem] font-semibold text-[var(--destructive)]">
                    {t("megumin.settings.bgLog.cancelled")}
                  </span>
                ) : entry.edited ? (
                  <span className="rounded-full bg-[var(--primary)]/15 px-2 py-0.5 text-[0.6875rem] font-semibold text-[var(--primary)]">
                    {t("megumin.settings.bgLog.edited")}
                  </span>
                ) : null}
              </span>
              <span className="text-xs text-[var(--muted-foreground)]">
                {t("megumin.settings.bgLog.meta", {
                  time: timeOf(entry.at),
                  connection: entry.connection ?? "",
                  tokens: Math.round(size / 4).toLocaleString(),
                })}
              </span>
            </summary>
            <div className="flex flex-col gap-2 border-t border-[var(--border)]/50 p-3">
              <MeguminRow>
                <MeguminButton icon={<ClipboardCopy size="0.75rem" />} onClick={() => void copy()}>
                  {t("megumin.settings.bgLog.copy")}
                </MeguminButton>
              </MeguminRow>
              <pre
                className={cn(
                  "max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[var(--background)]/60 p-3",
                  "font-mono text-xs leading-relaxed text-[var(--foreground)]",
                )}
              >
                {text}
              </pre>
            </div>
          </details>
        );
      })}
      <MeguminRow>
        <MeguminButton
          variant="danger"
          icon={<Trash2 size="0.75rem" />}
          pending={clear.isPending}
          onClick={() =>
            clear.mutate(undefined, {
              onError: (error) => toast.error(error instanceof Error ? error.message : String(error)),
            })
          }
        >
          {t("megumin.settings.bgLog.clear")}
        </MeguminButton>
      </MeguminRow>
    </div>
  );
}
