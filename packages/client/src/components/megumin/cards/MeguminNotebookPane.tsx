// ──────────────────────────────────────────────
// Megumin card: the notebook's tab in a reply's card
// ──────────────────────────────────────────────
// Port of Megumin's features/notebook/card.js. The tab shows what THIS reply did
// to the notebook (the truths it wrote, the clues, who learned what, what came
// out), drawn from the store, behind a blur. Showing it asks first, because
// reading it spoils what the story is building toward. A card redraw keeps a
// pane the reader already opened open. Revert/Restore and Read again sit under it.
import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  Eye,
  EyeOff,
  Flag,
  Loader2,
  Pencil,
  RotateCcw,
  RotateCw,
  Search,
  Trash2,
  TriangleAlert,
  UserCheck,
} from "lucide-react";
import { MeguminNotebookRender } from "@marinara-engine/shared/megumin/client";
import { cn } from "../../../lib/utils";
import { showConfirmDialog } from "../../../lib/app-dialogs";
import type { MeguminView } from "../../../hooks/use-megumin";
import { CardButton, stopCardClick, useCardActions, usePaneHost } from "./megumin-card-kit";

// Panes the reader chose to see, by journal entry (or message), so a redraw keeps them open.
const revealed = new Set<string>();

interface Truth {
  id: string;
  truth: string;
  hiddenFrom: string[];
  when?: string;
  changes?: string;
  clueIdeas?: string;
  clues: Array<{ seq: number; text: string; found?: boolean }>;
}

interface NotebookChange {
  op: string;
  id: string;
  text?: string;
  found?: boolean;
}

interface NotebookCardInfo {
  entry: { id: string; seq?: number } | null;
  applied: NotebookChange[];
  notes: string[];
  truths: Record<string, Truth>;
  disabled: boolean;
  pending: boolean;
  read: boolean;
  missing: boolean;
  canRead: boolean;
}

/** How each change looks on the card (Megumin's CHANGE_LOOK). */
const CHANGE_LOOK: Record<string, { icon: ReactNode; tone: string }> = {
  clue: { icon: <Search size="0.6875rem" />, tone: "text-sky-500" },
  learned: { icon: <UserCheck size="0.6875rem" />, tone: "text-violet-500" },
  out: { icon: <Flag size="0.6875rem" />, tone: "text-emerald-500" },
  edit: { icon: <Pencil size="0.6875rem" />, tone: "text-[var(--muted-foreground)]" },
  forget: { icon: <Trash2 size="0.6875rem" />, tone: "text-[var(--muted-foreground)]" },
  restore: { icon: <RotateCcw size="0.6875rem" />, tone: "text-[var(--muted-foreground)]" },
};

function Note({ children }: { children: ReactNode }) {
  return <div className="text-[0.6875rem] italic text-[var(--muted-foreground)]">{children}</div>;
}

function NotFound() {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center gap-0.5 text-[0.625rem] text-amber-500">
      <TriangleAlert size="0.625rem" />
      {t("megumin.cards.notebook.notFound")}
    </span>
  );
}

/** Turns a stored turn number into the reader's terms: "#15", "your edit", "a deleted message". */
function useTurnLabel(view: MeguminView) {
  const { t } = useTranslation();
  const turns = (view.notebook as { turns?: { seqToIndex?: Array<[number, number]>; userSeqs?: number[] } } | undefined)
    ?.turns;
  const seqToIndex = new Map(turns?.seqToIndex ?? []);
  const userSeqs = new Set(turns?.userSeqs ?? []);
  return (seq: number) =>
    seqToIndex.has(seq)
      ? t("megumin.cards.notebook.turn", { index: seqToIndex.get(seq) })
      : userSeqs.has(seq)
        ? t("megumin.cards.notebook.turnYourEdit")
        : turns
          ? t("megumin.cards.notebook.turnDeleted")
          : t("megumin.cards.notebook.turnSeq", { seq });
}

function TruthCard({ truth, label }: { truth: Truth; label: (seq: number) => string }) {
  const { t } = useTranslation();
  const rows: Array<[string, ReactNode]> = [];
  if (truth.hiddenFrom?.length)
    rows.push([
      t("megumin.cards.notebook.hiddenFrom"),
      <span key="names" className="flex flex-wrap gap-1">
        {truth.hiddenFrom.map((n) => (
          <span key={n} className="rounded bg-[var(--accent)] px-1">
            {n}
          </span>
        ))}
      </span>,
    ]);
  if (truth.when) rows.push([t("megumin.cards.notebook.comesOutWhen"), truth.when]);
  if (truth.changes) rows.push([t("megumin.cards.notebook.whatItChanges"), truth.changes]);
  if (truth.clueIdeas) rows.push([t("megumin.cards.notebook.clueIdeas"), truth.clueIdeas]);
  return (
    <div className="flex flex-col gap-1 rounded-md border border-[var(--border)]/60 bg-[var(--background)]/40 p-2">
      <div className="flex items-center gap-1.5 text-[0.625rem] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
        <span className="rounded bg-[var(--primary)]/15 px-1 font-mono text-[var(--foreground)]">{truth.id}</span>
        {t("megumin.cards.notebook.newTruth")}
      </div>
      <blockquote className="border-l-2 border-[var(--primary)]/50 pl-2 text-xs italic">{truth.truth}</blockquote>
      {rows.length ? (
        <div className="flex flex-col gap-0.5">
          {rows.map(([k, v]) => (
            <div key={k} className="flex flex-wrap gap-1.5 text-[0.6875rem]">
              <span className="text-[var(--muted-foreground)]">{k}</span>
              <span>{v}</span>
            </div>
          ))}
        </div>
      ) : null}
      {truth.clues?.length ? (
        <ul className="ml-3 list-disc text-[0.6875rem]">
          {truth.clues.map((c, i) => (
            <li key={i}>
              <span className="mr-1 font-mono text-[0.625rem] text-[var(--muted-foreground)]">{label(c.seq)}</span>
              {c.text} {c.found === false ? <NotFound /> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ChangeLine({ change }: { change: NotebookChange }) {
  const { t } = useTranslation();
  const look = CHANGE_LOOK[change.op];
  if (!look) {
    const line = String(MeguminNotebookRender.describeNotebookChange(change) || "");
    return line ? <div className="text-[0.6875rem] text-[var(--muted-foreground)]">{line}</div> : null;
  }
  return (
    <div className={cn("flex flex-wrap items-center gap-1 text-[0.6875rem]", look.tone)}>
      {look.icon}
      <span className="rounded bg-[var(--accent)] px-1 font-mono text-[0.625rem] text-[var(--foreground)]">
        {change.id}
      </span>
      <span className="font-medium">{t(`megumin.cards.notebook.change.${change.op}`)}</span>
      {change.text ? <span className="text-[var(--foreground)]">{change.text}</span> : null}
      {change.found === false ? <NotFound /> : null}
    </div>
  );
}

/** The pane's content, or null to draw the block's own text (Megumin's fallbackHtml). */
function notebookContent(
  info: NotebookCardInfo | null,
  t: TFunction,
  label: (seq: number) => string,
): ReactNode | null {
  if (!info) return null;
  if (info.disabled) return <Note>{t("megumin.cards.notebook.reverted")}</Note>;
  if (info.pending) return <Note>{t("megumin.cards.notebook.pending")}</Note>;
  const truths: ReactNode[] = [];
  const events: ReactNode[] = [];
  info.applied.forEach((a, i) => {
    const truth = info.truths?.[a.id];
    if (a.op === "entry" && truth) truths.push(<TruthCard key={`t${i}`} truth={truth} label={label} />);
    else events.push(<ChangeLine key={`e${i}`} change={a} />);
  });
  const extra = [
    ...info.notes.map((n, i) => <Note key={`n${i}`}>{t("megumin.cards.notebook.leftOut", { note: n })}</Note>),
    ...(info.missing ? [<Note key="missing">{t("megumin.cards.notebook.missing")}</Note>] : []),
  ];
  if (!truths.length && !events.length && !extra.length) {
    return info.read ? <Note>{t("megumin.cards.notebook.nothingChanged")}</Note> : null;
  }
  return (
    <div className="flex flex-col gap-1.5">
      {truths}
      {events.length ? <div className="flex flex-col gap-1">{events}</div> : null}
      {extra}
    </div>
  );
}

export function MeguminNotebookPane({
  pane,
  chatId,
  messageId,
  msgIndex,
  info,
  view,
}: {
  pane: HTMLElement;
  chatId: string;
  messageId: string;
  msgIndex: number;
  info: NotebookCardInfo | null;
  view: MeguminView;
}) {
  const { t } = useTranslation();
  // The block's own drawing, kept for a pane with nothing from the store to show (Megumin's fallbackHtml).
  // Read before the host below hides it (layout effects run in order), so the copy is not hidden too.
  const [fallbackHtml, setFallbackHtml] = useState("");
  useLayoutEffect(() => {
    const own = Array.from(pane.children).filter((c) => !c.hasAttribute("data-megumin-pane-host"));
    setFallbackHtml(own.map((c) => c.outerHTML).join(""));
  }, [pane]);
  const host = usePaneHost(pane, "replace", "meg-nb-host flex flex-col gap-1.5");
  const { run, isRunning } = useCardActions(chatId);
  const key = info?.entry?.id || `msg:${msgIndex}`;
  const [shown, setShown] = useState(() => revealed.has(key));
  const label = useTurnLabel(view);

  if (!host) return null;
  // Nothing to spoil while Chomusuke is still reading.
  const visible = shown || Boolean(info?.pending);
  const content = notebookContent(info, t, label);

  const reveal = async () => {
    const ok = await showConfirmDialog({
      title: t("megumin.cards.notebook.revealTitle"),
      message: t("megumin.cards.notebook.revealMessage"),
      confirmLabel: t("megumin.cards.notebook.revealConfirm"),
      cancelLabel: t("megumin.cards.notebook.revealCancel"),
    });
    if (!ok) return;
    revealed.add(key);
    setShown(true);
  };

  return createPortal(
    <div onClick={stopCardClick} className="flex flex-col gap-1.5">
      <div className="relative">
        <div
          aria-hidden={!visible}
          className={cn("transition-[filter]", !visible && "pointer-events-none select-none blur-sm")}
        >
          {content ?? (
            // Megumin's own escaped block drawing (renderBody), as its card.js keeps it.
            <div dangerouslySetInnerHTML={{ __html: fallbackHtml }} />
          )}
        </div>
        {!visible ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void reveal();
            }}
            className="absolute inset-0 flex items-center justify-center gap-1.5 rounded-md bg-[var(--background)]/40 text-[0.6875rem] font-medium text-[var(--foreground)] hover:bg-[var(--background)]/55"
          >
            <Eye size="0.75rem" />
            {t("megumin.cards.notebook.reveal")}
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {visible && !info?.pending ? (
          <CardButton
            onClick={() => {
              revealed.delete(key);
              setShown(false);
            }}
            icon={<EyeOff size="0.6875rem" />}
          >
            {t("megumin.cards.notebook.hide")}
          </CardButton>
        ) : null}
        {info?.entry ? (
          <CardButton
            onClick={() => run("notebook.disable", { entryId: info.entry?.id, disabled: !info.disabled })}
            pending={isRunning("notebook.disable")}
            icon={info.disabled ? <RotateCw size="0.6875rem" /> : <RotateCcw size="0.6875rem" />}
            title={info.disabled ? t("megumin.cards.notebook.restoreTitle") : t("megumin.cards.notebook.revertTitle")}
          >
            {info.disabled ? t("megumin.cards.notebook.restore") : t("megumin.cards.notebook.revert")}
          </CardButton>
        ) : null}
        {info && (info.canRead || info.pending) ? (
          <CardButton
            onClick={() => run("readAgain", { kind: "notebook", messageId })}
            disabled={Boolean(info.pending)}
            pending={isRunning("readAgain")}
            icon={info.pending ? <Loader2 size="0.6875rem" className="animate-spin" /> : <RotateCw size="0.6875rem" />}
            title={t("megumin.cards.notebook.readAgainTitle")}
          >
            {info.pending ? t("megumin.cards.notebook.reading") : t("megumin.cards.notebook.readAgain")}
          </CardButton>
        ) : null}
      </div>
    </div>,
    host,
  );
}
