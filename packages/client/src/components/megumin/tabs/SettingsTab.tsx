// ──────────────────────────────────────────────
// Megumin panel: Settings
// ──────────────────────────────────────────────
// Megumin's Settings tab (src/ui/tabs/globalSettings.js): the preferences that
// apply to every character and chat, the background prompt log, the card
// submission form, and the about card. Everything here lives in the suite's
// globalSettings, saved once for the whole install.
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ClipboardCopy, Earth, ExternalLink, Inbox, ListTree, Trash2 } from "lucide-react";
import { cn } from "../../../lib/utils";
import { useClearMeguminBackgroundLog, useMeguminBackgroundLog } from "../../../hooks/use-megumin";
import { useMeguminPanel } from "../megumin-panel-context";
import { useMeguminPower } from "../MeguminPowerSwitch";
import {
  MeguminButton,
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
    <>
      <div className="flex items-center justify-end">
        <span className="inline-flex items-center gap-1 rounded-full border border-[var(--primary)]/30 bg-[var(--primary)]/10 px-2 py-0.5 text-[0.625rem] font-medium text-[var(--primary)]">
          <Earth size="0.625rem" />
          {t("megumin.settings.savedGlobally")}
        </span>
      </div>

      <MeguminSection title={t("megumin.settings.behaviour.title")}>
        <MeguminToggle
          label={t("megumin.settings.suite.label")}
          checked={power.enabled}
          disabled={power.pending || !!power.locked}
          onChange={(value) => power.setEnabled(value, { failed: t("megumin.toggle.saveFailed") })}
        />
        <MeguminHint>{t("megumin.settings.suite.desc")}</MeguminHint>
        {power.locked ? (
          <MeguminHint tone="warning">{t("settings.features.envLocked", { name: power.locked })}</MeguminHint>
        ) : null}

        <MeguminToggle
          label={t("megumin.settings.promptPreview.label")}
          checked={gs.promptPreview === true}
          onChange={(value) => saveGs({ promptPreview: value })}
        />
        <MeguminHint>{t("megumin.settings.promptPreview.desc")}</MeguminHint>
        <MeguminHint tone="warning">{t("megumin.settings.promptPreview.yunyun")}</MeguminHint>

        <MeguminToggle
          label={t("megumin.settings.bgPreview.label")}
          checked={gs.bgPreview === true}
          onChange={(value) => saveGs({ bgPreview: value })}
        />
        <MeguminHint>{t("megumin.settings.bgPreview.desc")}</MeguminHint>
        <MeguminHint tone="warning">{t("megumin.settings.bgPreview.yunyun")}</MeguminHint>
        {gs.bgPreview === true ? (
          <fieldset className="flex flex-col gap-1 rounded-md border border-[var(--border)]/60 px-2.5 py-2">
            <legend className="px-1 text-[0.625rem] font-medium text-[var(--marinara-chat-chrome-panel-title)]">
              {t("megumin.settings.bgPreview.jobsTitle")}
            </legend>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1">
              {jobs.map((job) => (
                <label key={job.id} className="flex cursor-pointer items-center gap-1.5 text-[0.6875rem]">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-[var(--primary)]"
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

        <div className="flex flex-col gap-1.5 rounded-md border border-[var(--border)]/60 px-2.5 py-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-medium text-[var(--marinara-chat-chrome-panel-title)]">
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
          {!chatId ? <MeguminNeedsChat /> : null}
          {logOpen && chatId ? <BackgroundLog chatId={chatId} jobs={jobs} /> : null}
        </div>

        <MeguminToggle
          label={t("megumin.settings.utilityPrefill.label")}
          checked={gs.enableUtilityPrefill === true}
          onChange={(value) => saveGs({ enableUtilityPrefill: value })}
        />
        <MeguminHint>{t("megumin.settings.utilityPrefill.desc")}</MeguminHint>

        <MeguminToggle
          label={t("megumin.settings.chomusukeSwitch.label")}
          checked={gs.chomusukeSwitchConnection === true}
          disabled
          onChange={(value) => saveGs({ chomusukeSwitchConnection: value })}
        />
        <MeguminHint>{t("megumin.settings.chomusukeSwitch.desc")}</MeguminHint>
        <MeguminHint tone="warning">{t("megumin.settings.chomusukeSwitch.yunyun")}</MeguminHint>

        <MeguminToggle
          label={t("megumin.settings.loreInTasks.label")}
          checked={loreInTasks}
          onChange={(value) => saveGs({ loreInTasks: value })}
        />
        <MeguminHint>{t("megumin.settings.loreInTasks.desc")}</MeguminHint>
      </MeguminSection>

      <MeguminSection title={t("megumin.settings.data.title")}>
        <MeguminSelect
          label={t("megumin.settings.saveMode.label")}
          value={saveMode}
          onChange={(next) => void changeSaveMode(next)}
          options={[
            { value: "character", label: t("megumin.settings.saveMode.character") },
            { value: "chat", label: t("megumin.settings.saveMode.chat") },
          ]}
        />
        <MeguminHint>{t("megumin.settings.saveMode.desc")}</MeguminHint>
      </MeguminSection>

      {SUBMIT_FORM_URL ? (
        <MeguminSection title={t("megumin.settings.submit.title")} icon={<Inbox size="0.875rem" />}>
          <div className="text-xs font-medium text-[var(--marinara-chat-chrome-panel-title)]">
            {t("megumin.settings.submit.heading")}
          </div>
          <MeguminHint>{t("megumin.settings.submit.text")}</MeguminHint>
          <a
            href={SUBMIT_FORM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mari-chrome-control mari-chrome-control--primary inline-flex w-full items-center justify-center gap-1.5 text-xs"
          >
            <ExternalLink size="0.75rem" />
            {t("megumin.settings.submit.open")}
          </a>
          <MeguminHint>{t("megumin.settings.submit.note")}</MeguminHint>
        </MeguminSection>
      ) : null}

      <MeguminSection title={t("megumin.settings.about.title")}>
        <div>
          <div className="text-sm font-bold text-[var(--marinara-chat-chrome-panel-title)]">
            {t("megumin.settings.about.name", { version: SUITE_VERSION })}
          </div>
          <div className="text-[0.6875rem] text-[var(--muted-foreground)]">{t("megumin.settings.about.by")}</div>
        </div>
        <div className="flex flex-col gap-1.5">
          <a
            href={MEGUMIN_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-md border border-[var(--border)]/60 px-2.5 py-2 transition-colors hover:bg-[var(--accent)]"
          >
            <ExternalLink size="0.875rem" className="shrink-0 text-[var(--muted-foreground)]" />
            <span className="flex min-w-0 flex-col">
              <span className="text-xs font-semibold">{t("megumin.settings.about.github")}</span>
              <span className="text-[0.625rem] text-[var(--muted-foreground)]">
                {t("megumin.settings.about.githubHint")}
              </span>
            </span>
          </a>
          <div className="flex flex-col rounded-md border border-[var(--border)]/60 px-2.5 py-2">
            <span className="text-xs font-semibold">{t("megumin.settings.about.paypal")}</span>
            <span className="select-all break-all font-mono text-[0.625rem] text-[var(--muted-foreground)]">
              {PAYPAL}
            </span>
          </div>
          <div className="flex flex-col rounded-md border border-[var(--border)]/60 px-2.5 py-2">
            <span className="text-xs font-semibold">{t("megumin.settings.about.litecoin")}</span>
            <span className="select-all break-all font-mono text-[0.625rem] text-[var(--muted-foreground)]">
              {LITECOIN}
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-1 border-t border-[var(--border)]/50 pt-2">
          <div className="text-[0.6875rem] font-semibold text-[var(--marinara-chat-chrome-panel-title)]">
            {t("megumin.settings.about.licenseTitle")}
          </div>
          <MeguminHint>{t("megumin.settings.about.license")}</MeguminHint>
          <MeguminHint>{t("megumin.settings.about.port")}</MeguminHint>
          <a
            href={LICENSE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[0.625rem] text-[var(--primary)] underline-offset-2 hover:underline"
          >
            <ExternalLink size="0.625rem" />
            {t("megumin.settings.about.licenseLink")}
          </a>
        </div>
      </MeguminSection>
    </>
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
    <div className="flex flex-col gap-1.5">
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
          <details key={`${entry.at}-${i}`} className="group rounded-md border border-[var(--border)]/60">
            <summary className="flex cursor-pointer list-none flex-col gap-0.5 px-2 py-1.5 text-[0.6875rem]">
              <span className="flex items-center gap-1.5">
                <span className="font-semibold">{labelOf(entry.job)}</span>
                {entry.status === "cancelled" ? (
                  <span className="rounded bg-[var(--destructive)]/15 px-1 text-[0.5625rem] text-[var(--destructive)]">
                    {t("megumin.settings.bgLog.cancelled")}
                  </span>
                ) : entry.edited ? (
                  <span className="rounded bg-[var(--primary)]/15 px-1 text-[0.5625rem] text-[var(--primary)]">
                    {t("megumin.settings.bgLog.edited")}
                  </span>
                ) : null}
              </span>
              <span className="text-[0.625rem] text-[var(--muted-foreground)]">
                {t("megumin.settings.bgLog.meta", {
                  time: timeOf(entry.at),
                  connection: entry.connection ?? "",
                  tokens: Math.round(size / 4).toLocaleString(),
                })}
              </span>
            </summary>
            <div className="flex flex-col gap-1.5 border-t border-[var(--border)]/50 p-2">
              <MeguminRow>
                <MeguminButton icon={<ClipboardCopy size="0.75rem" />} onClick={() => void copy()}>
                  {t("megumin.settings.bgLog.copy")}
                </MeguminButton>
              </MeguminRow>
              <pre
                className={cn(
                  "max-h-72 overflow-auto whitespace-pre-wrap break-words rounded bg-[var(--background)]/60 p-2",
                  "font-mono text-[0.625rem] leading-relaxed text-[var(--foreground)]",
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
