// ──────────────────────────────────────────────
// Megumin panel: The Notebook
// ──────────────────────────────────────────────
// Port of Megumin Suite's Notebook tab (src/features/notebook/ui.js): the
// Author's Notebook switch (always on for an engine that keeps one, V11), where
// the story stands, and the notebook itself.
//
//   Active — the live truths, behind a spoiler. Opening one asks first; an open
//            truth can be edited, marked revealed or deleted.
//   Past   — the truths that came out, as a timeline.
//
// Every change here is the user's own entry: swipes and rewinds never undo it.
// Derived from Megumin Suite (CC BY-NC 4.0, see packages/shared/src/megumin/LICENSE.md).
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  BookOpen,
  Eye,
  EyeOff,
  Flag,
  History,
  Info,
  RotateCcw,
  Trash2,
  TriangleAlert,
  VenetianMask,
  X,
} from "lucide-react";
import { MeguminEngineFlags, MeguminNotebookModel } from "@marinara-engine/shared/megumin/client";
import { cn } from "../../../lib/utils";
import { showConfirmDialog } from "../../../lib/app-dialogs";
import { useMeguminPanel } from "../megumin-panel-context";
import { MEGUMIN_INPUT_CLASS, MeguminButton, MeguminHint, MeguminSection, MeguminToggle } from "../MeguminControls";
import { useMeguminReadAction } from "./use-megumin-read-action";

type Clue = { seq: number; text: string; found?: boolean };
type Truth = {
  id: string;
  truth: string;
  hiddenFrom: string[];
  when?: string;
  changes?: string;
  clueIdeas?: string;
  clues: Clue[];
  createdSeq: number;
  revealedSeq?: number | null;
  revealedHow?: string | null;
};
type TurnLabels = Record<string, number | "user" | "deleted">;

const LIVE_CAP: number = MeguminNotebookModel.LIVE_CAP;

// notebook/parse.js splitNames: "Aqua, Darkness and the reader (who saw it)" → ["Aqua", "Darkness", "the reader"].
const REASON =
  /(?:^|\s)(?:because|becuase|becasue|becaus|becouse|bc|cuz|coz|cause|since|as|who|whom|which|until|unless|but|though|although|while|yet|so|has|have|had|is|are|was|were|does|did|knows?|cannot|never|not|(?:has|have|is|are|was|were|does|do|did|ca|wo)n['’]t)(?=\s|$).*$/i;
const MAX_NAME_WORDS = 6;
function splitNames(text: string): string[] {
  const seen = new Set<string>();
  return String(text || "")
    .replace(/\([^)]*\)?|\[[^\]]*\]?/g, " ")
    .split(/\s*(?:,|;|\/|\band\b|&)\s*/i)
    .map((s) =>
      s
        .replace(/[.*_"“”]/g, "")
        .replace(/\s[—–-]\s.*$/, "")
        .replace(REASON, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .map((s) => (/^(?:the\s+)?reader\b/i.test(s) ? "the reader" : s))
    .filter((s) => s && !/^(no ?one|nobody|none|-)$/i.test(s) && s.split(" ").length <= MAX_NAME_WORDS)
    .filter((s) => !seen.has(s.toLowerCase()) && !!seen.add(s.toLowerCase()));
}

// Truths the reader chose to open, by chat + id, so a redraw keeps them open (Megumin's `opened`).
const opened = new Set<string>();

const FIELDS = [
  { key: "truth", rows: 3 },
  { key: "hiddenFrom", rows: 0 },
  { key: "when", rows: 2 },
  { key: "changes", rows: 2 },
  { key: "clueIdeas", rows: 2 },
] as const;

export function NotebookTab() {
  const { t } = useTranslation();
  const { profile, catalog, view, update, run, chatId, scope } = useMeguminPanel();
  const [, redraw] = useState(0);

  const engines = [...((catalog.engines ?? []) as Array<Record<string, any>>), ...(view.customModes ?? [])];
  const activeEngine = engines.find((m) => m.id === profile.mode);
  const v11 = MeguminEngineFlags.engineKeepsNotebook(activeEngine);
  const nb = (profile.notebook ?? {}) as { enabled?: boolean; offForV11?: boolean };
  const on = v11 ? !nb.offForV11 : Boolean(nb.enabled);
  const hasChat = !!chatId;
  const phase = hasChat ? view.notebook?.phase : "off";
  const state = (hasChat ? view.notebook?.state : null) as { truths?: Record<string, Truth> } | null;
  const live: Truth[] = state ? (MeguminNotebookModel.liveTruths(state) as Truth[]) : [];
  const past: Truth[] = state ? (MeguminNotebookModel.pastTruths(state) as Truth[]) : [];

  const labelsQuery = useMeguminReadAction<TurnLabels>(scope, "notebook.turnLabels", {
    enabled: hasChat && !!state,
    dependsOn: JSON.stringify(state ?? null),
  });
  const labels = labelsQuery.data ?? {};
  // Where a turn number points, as the reader sees it ("#15", "your edit").
  const at = (seq: number | null | undefined) => {
    const v = seq == null ? undefined : labels[String(seq)];
    if (typeof v === "number") return t("megumin.notebook.turnMessage", { n: v });
    if (v === "user") return t("megumin.notebook.turnYourEdit");
    if (v === "deleted") return t("megumin.notebook.turnDeleted");
    return t("megumin.notebook.turnUnknown");
  };
  // "in #15", or "by your edit" for a change made here.
  const where = (seq: number | null | undefined) =>
    seq != null && labels[String(seq)] === "user"
      ? t("megumin.notebook.byYourEdit")
      : t("megumin.notebook.inTurn", { turn: at(seq) });

  const status =
    !on && v11
      ? t("megumin.notebook.status.offV11")
      : !on
        ? t("megumin.notebook.status.off")
        : !hasChat
          ? t("megumin.notebook.status.noChat")
          : phase === "setup"
            ? t("megumin.notebook.status.setup")
            : past.length
              ? t("megumin.notebook.status.runningWithPast", { live: live.length, cap: LIVE_CAP, past: past.length })
              : t("megumin.notebook.status.running", { live: live.length, cap: LIVE_CAP });

  const toggle = async () => {
    if (v11) {
      if (on) {
        const ok = await showConfirmDialog({
          title: t("megumin.notebook.offV11.title"),
          message: t("megumin.notebook.offV11.message"),
          confirmLabel: t("megumin.notebook.offV11.confirm"),
          cancelLabel: t("megumin.notebook.offV11.cancel"),
          tone: "destructive",
        });
        if (!ok) return;
      }
      update((d) => void (d.notebook = { ...(d.notebook || {}), offForV11: on }));
    } else {
      update((d) => void (d.notebook = { ...(d.notebook || {}), enabled: !on }));
    }
  };

  const commit = async (op: Record<string, unknown>) => {
    try {
      await run("notebook.edit", { op });
    } catch {
      /* run toasts its own error */
    }
  };

  const liveSorted = [...live].sort((a, b) => a.createdSeq - b.createdSeq);
  const pastSorted = [...past].sort(
    (a, b) => Number(a.revealedSeq) - Number(b.revealedSeq) || a.createdSeq - b.createdSeq,
  );

  return (
    <>
      <MeguminHint>{t("megumin.notebook.intro")}</MeguminHint>
      <div title={v11 ? t("megumin.notebook.v11SwitchTitle") : undefined}>
        <MeguminToggle
          label={on ? t("megumin.notebook.switchOn") : t("megumin.notebook.switchOff")}
          checked={on}
          onChange={() => void toggle()}
        />
      </div>

      <div className="flex items-start gap-1.5 rounded-md bg-[var(--background)]/40 px-2 py-1.5 text-[0.6875rem] text-[var(--marinara-chat-chrome-panel-muted)]">
        <Info size="0.75rem" className="mt-0.5 shrink-0" />
        <span>{status}</span>
      </div>

      {state && (liveSorted.length || pastSorted.length) ? (
        <>
          <MeguminSection
            title={t("megumin.notebook.active.title")}
            icon={<VenetianMask size="0.875rem" />}
            headerAction={
              <span className="text-[0.625rem] text-[var(--muted-foreground)]">
                {t("megumin.notebook.active.count", { live: liveSorted.length, cap: LIVE_CAP })}
              </span>
            }
          >
            {!on ? <MeguminHint>{t("megumin.notebook.active.keptWhileOff")}</MeguminHint> : null}
            {liveSorted.length ? (
              <>
                <div className="flex items-start gap-1.5 text-[0.625rem] leading-relaxed text-amber-500">
                  <TriangleAlert size="0.75rem" className="mt-0.5 shrink-0" />
                  <span>{t("megumin.notebook.active.spoilerWarning")}</span>
                </div>
                {liveSorted.map((truth) => (
                  <LiveTruthCard
                    key={truth.id}
                    truth={truth}
                    isOpen={opened.has(`${chatId}|${truth.id}`)}
                    where={where}
                    at={at}
                    onOpen={async () => {
                      const ok = await showConfirmDialog({
                        title: t("megumin.notebook.reveal.title"),
                        message: t("megumin.notebook.reveal.message"),
                        confirmLabel: t("megumin.notebook.reveal.confirm"),
                        cancelLabel: t("megumin.notebook.reveal.cancel"),
                      });
                      if (!ok) return;
                      opened.add(`${chatId}|${truth.id}`);
                      redraw((n) => n + 1);
                    }}
                    onHide={() => {
                      opened.delete(`${chatId}|${truth.id}`);
                      redraw((n) => n + 1);
                    }}
                    onCommit={commit}
                    onForget={() => {
                      opened.delete(`${chatId}|${truth.id}`);
                      void commit({ op: "forget", id: truth.id });
                    }}
                  />
                ))}
              </>
            ) : (
              <MeguminHint>{t("megumin.notebook.active.none")}</MeguminHint>
            )}
          </MeguminSection>

          {pastSorted.length ? (
            <MeguminSection
              title={t("megumin.notebook.past.title")}
              icon={<History size="0.875rem" />}
              headerAction={<span className="text-[0.625rem] text-[var(--muted-foreground)]">{pastSorted.length}</span>}
            >
              <div className="flex flex-col gap-2 border-l-2 border-emerald-500/30 pl-3">
                {pastSorted.map((truth) => (
                  <PastTruth
                    key={truth.id}
                    truth={truth}
                    where={where}
                    at={at}
                    onRestore={() => {
                      if (liveSorted.length >= LIVE_CAP) {
                        toast.warning(t("megumin.notebook.past.capReached", { cap: LIVE_CAP }));
                        return;
                      }
                      void commit({ op: "restore", id: truth.id });
                    }}
                    onForget={() => void commit({ op: "forget", id: truth.id })}
                  />
                ))}
              </div>
            </MeguminSection>
          ) : null}
        </>
      ) : null}
    </>
  );
}

/** Delete asks twice: click once to arm, again within 3 s to delete. */
function DeleteButton({ onDelete, title }: { onDelete: () => void; title: string }) {
  const { t } = useTranslation();
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  return (
    <MeguminButton
      variant={armed ? "danger" : "secondary"}
      title={title}
      icon={<Trash2 size="0.75rem" />}
      onClick={() => {
        if (!armed) {
          setArmed(true);
          timer.current = setTimeout(() => setArmed(false), 3000);
          return;
        }
        if (timer.current) clearTimeout(timer.current);
        setArmed(false);
        onDelete();
      }}
    >
      {armed ? t("megumin.notebook.deleteForGood") : t("megumin.notebook.delete")}
    </MeguminButton>
  );
}

function ClueList({
  truth,
  at,
  onRemove,
}: {
  truth: Truth;
  at: (seq: number) => string;
  onRemove?: (index: number) => void;
}) {
  const { t } = useTranslation();
  if (!truth.clues.length) return <MeguminHint>{t("megumin.notebook.noClues")}</MeguminHint>;
  return (
    <ul className="flex flex-col gap-1">
      {truth.clues.map((clue, i) => (
        <li key={`${clue.seq}-${i}`} className="flex items-start gap-1.5 text-[0.6875rem]">
          <span className="shrink-0 rounded bg-[var(--accent)] px-1 font-mono text-[0.5625rem] text-[var(--muted-foreground)]">
            {at(clue.seq)}
          </span>
          <span className="min-w-0 flex-1">
            {clue.text}
            {clue.found === false ? (
              <span
                title={t("megumin.notebook.clueNotFoundTitle")}
                className="ml-1 inline-flex items-center gap-0.5 text-[0.5625rem] text-amber-500"
              >
                <TriangleAlert size="0.5625rem" />
                {t("megumin.notebook.clueNotFound")}
              </span>
            ) : null}
          </span>
          {onRemove ? (
            <button
              type="button"
              title={t("megumin.notebook.removeClue")}
              aria-label={t("megumin.notebook.removeClue")}
              onClick={() => onRemove(i)}
              className="mari-chrome-control mari-chrome-control--small mari-chrome-control--icon text-[var(--destructive)] active:scale-90"
            >
              <X size="0.625rem" />
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function LiveTruthCard({
  truth,
  isOpen,
  where,
  at,
  onOpen,
  onHide,
  onCommit,
  onForget,
}: {
  truth: Truth;
  isOpen: boolean;
  where: (seq: number | null | undefined) => string;
  at: (seq: number) => string;
  onOpen: () => void;
  onHide: () => void;
  onCommit: (op: Record<string, unknown>) => Promise<void>;
  onForget: () => void;
}) {
  const { t } = useTranslation();
  const valueOf = (key: (typeof FIELDS)[number]["key"]) =>
    key === "hiddenFrom" ? truth.hiddenFrom.join(", ") : String(truth[key] || "");

  // Saved as soon as the reader leaves a box, like the Bonds editor.
  const save = (key: (typeof FIELDS)[number]["key"], el: HTMLInputElement | HTMLTextAreaElement) => {
    const raw = String(el.value || "").trim();
    const fields: Record<string, unknown> = {};
    if (key === "hiddenFrom") {
      const names = splitNames(raw);
      if (names.join("|") !== truth.hiddenFrom.join("|")) fields.hiddenFrom = names;
    } else if (raw !== String(truth[key] || "")) {
      fields[key] = raw;
    }
    if (fields.truth === "") {
      toast.warning(t("megumin.notebook.emptyTruth"));
      el.value = truth.truth;
      return;
    }
    if (!Object.keys(fields).length) return;
    void onCommit({ op: "edit", id: truth.id, fields });
    if (Array.isArray(fields.hiddenFrom) && !fields.hiddenFrom.length) {
      toast.info(t("megumin.notebook.hiddenFromNoOne", { id: truth.id }));
    }
  };

  const blurOnEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") e.currentTarget.blur();
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border border-purple-500/25 bg-[var(--background)]/40 p-2">
      <div className="flex flex-wrap items-center gap-1.5 text-[0.6875rem]">
        <b>{truth.id}</b>
        <span className="text-[0.625rem] text-[var(--muted-foreground)]">
          {t("megumin.notebook.written", { where: where(truth.createdSeq) })}
        </span>
        <span className="text-[0.625rem] text-[var(--muted-foreground)]">
          {t("megumin.notebook.clueCount", { count: truth.clues.length })}
        </span>
      </div>
      {isOpen ? (
        <div className="flex flex-wrap gap-1">
          <MeguminButton icon={<EyeOff size="0.75rem" />} onClick={onHide}>
            {t("megumin.notebook.hide")}
          </MeguminButton>
          <MeguminButton
            title={t("megumin.notebook.markRevealedTitle")}
            icon={<Flag size="0.75rem" />}
            onClick={() => void onCommit({ op: "reveal", id: truth.id })}
          >
            {t("megumin.notebook.markRevealed")}
          </MeguminButton>
          <DeleteButton title={t("megumin.notebook.deleteTitle")} onDelete={onForget} />
        </div>
      ) : null}
      {isOpen ? (
        <div className="flex flex-col gap-2">
          {FIELDS.map((f) => (
            <label key={f.key} className="flex flex-col gap-1">
              <span className="text-[0.625rem] font-medium text-[var(--marinara-chat-chrome-panel-title)]">
                {t(`megumin.notebook.field.${f.key}`)}
              </span>
              {f.rows ? (
                <textarea
                  key={`${truth.id}-${f.key}-${valueOf(f.key)}`}
                  className={cn(MEGUMIN_INPUT_CLASS, "resize-y leading-relaxed")}
                  rows={f.rows}
                  defaultValue={valueOf(f.key)}
                  onBlur={(e) => save(f.key, e.currentTarget)}
                />
              ) : (
                <input
                  key={`${truth.id}-${f.key}-${valueOf(f.key)}`}
                  className={MEGUMIN_INPUT_CLASS}
                  defaultValue={valueOf(f.key)}
                  placeholder={t("megumin.notebook.field.hiddenFromHint")}
                  onBlur={(e) => save(f.key, e.currentTarget)}
                  onKeyDown={blurOnEnter}
                />
              )}
            </label>
          ))}
          <div className="flex flex-col gap-1">
            <span className="text-[0.625rem] font-medium text-[var(--marinara-chat-chrome-panel-title)]">
              {t("megumin.notebook.field.clues")}
            </span>
            <ClueList
              truth={truth}
              at={at}
              onRemove={(i) =>
                void onCommit({ op: "edit", id: truth.id, fields: { clues: truth.clues.filter((_, j) => j !== i) } })
              }
            />
          </div>
          <MeguminHint>{t("megumin.notebook.savesOnLeave")}</MeguminHint>
        </div>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          className="flex items-center justify-center gap-1.5 rounded-md border border-dashed border-purple-500/40 bg-purple-500/5 px-2 py-3 text-[0.6875rem] text-purple-400 backdrop-blur hover:bg-purple-500/10"
        >
          <Eye size="0.75rem" />
          {t("megumin.notebook.showTruth")}
        </button>
      )}
    </div>
  );
}

function PastTruth({
  truth,
  where,
  at,
  onRestore,
  onForget,
}: {
  truth: Truth;
  where: (seq: number | null | undefined) => string;
  at: (seq: number) => string;
  onRestore: () => void;
  onForget: () => void;
}) {
  const { t } = useTranslation();
  const how =
    truth.revealedHow === "out" || truth.revealedHow === "learned" || truth.revealedHow === "user"
      ? t(`megumin.notebook.how.${truth.revealedHow}`)
      : t("megumin.notebook.how.default");
  return (
    <div className="relative flex flex-col gap-1">
      <span className="absolute -left-[1.0625rem] top-1 h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
      <div className="flex flex-wrap items-center gap-1.5 text-[0.6875rem]">
        <b>{truth.id}</b>
        <span className="text-[0.625rem] text-[var(--muted-foreground)]">
          {t("megumin.notebook.written", { where: where(truth.createdSeq) })}
        </span>
        <span className="text-[0.625rem] text-[var(--muted-foreground)]">
          {t("megumin.notebook.cameOut", { where: where(truth.revealedSeq) })}
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        <MeguminButton
          title={t("megumin.notebook.restoreTitle")}
          icon={<RotateCcw size="0.75rem" />}
          onClick={onRestore}
        >
          {t("megumin.notebook.restore")}
        </MeguminButton>
        <DeleteButton title={t("megumin.notebook.deletePastTitle")} onDelete={onForget} />
      </div>
      <div className="text-[0.6875rem] leading-relaxed">{truth.truth}</div>
      {truth.hiddenFrom.length ? (
        <div className="text-[0.625rem] text-[var(--muted-foreground)]">
          <i>{t("megumin.notebook.stillHiddenFrom")}</i> {truth.hiddenFrom.join(", ")}
        </div>
      ) : null}
      <div className="flex items-center gap-1 text-[0.625rem] italic text-emerald-500">
        <BookOpen size="0.625rem" />
        {how}
      </div>
      <ClueList truth={truth} at={at} />
    </div>
  );
}
