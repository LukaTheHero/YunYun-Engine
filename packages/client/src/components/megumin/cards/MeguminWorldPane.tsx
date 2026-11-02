// ──────────────────────────────────────────────
// Megumin card: the World State pane's "what changed" strip
// ──────────────────────────────────────────────
// Port of Megumin's features/worldstate/card.js. The pane draws the scene board
// as it stood after this reply; on top of it go what this reply changed, the
// lines it wrote that were not understood, Revert/Restore, Read again (when
// Chomusuke reads replies for World State), Edit, and one question per
// character the reply brought in who may be someone already known.
import { useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  ArrowRight,
  BookOpenCheck,
  ChevronDown,
  CircleHelp,
  Equal,
  EyeOff,
  GitCompare,
  Link,
  Loader2,
  Pencil,
  Power,
  RotateCcw,
  RotateCw,
  TriangleAlert,
  UserPlus,
} from "lucide-react";
import { cn } from "../../../lib/utils";
import type { MeguminView } from "../../../hooks/use-megumin";
import { CardButton, stopCardClick, usePaneHost, useCardActions } from "./megumin-card-kit";
import { MeguminWorldEditor } from "./MeguminWorldEditor";

const SHOW_AT_MOST = 12;

// Strips the reader opened, by journal entry id, so a card redraw does not fold one shut while it is read.
const openStrips = new Set<string>();
// "New character" answers, by journal entry id + name: not asked again this session.
const keptApart = new Set<string>();

interface WorldChange {
  label: string;
  before?: string;
  after?: string;
}

interface WorldCardInfo {
  entry: { id: string; source?: string } | null;
  applied: WorldChange[];
  notes: string[];
  skipped: string[];
  newcomers?: Array<{ name: string; others: string[] }>;
  missing: boolean;
  disabled: boolean;
  noChanges: boolean;
  pending: boolean;
  unread: boolean;
  sideModel: boolean;
}

function ChangeRow({ change }: { change: WorldChange }) {
  const [who, field] = change.label.includes(" · ") ? change.label.split(" · ") : ["", change.label];
  return (
    <div className="flex flex-wrap items-center gap-1 text-[0.6875rem] leading-snug">
      {who ? <b className="font-semibold text-[var(--foreground)]">{who}</b> : null}
      <span className="text-[var(--muted-foreground)]">{field}</span>
      {change.before && change.after ? (
        <>
          <span className="text-[var(--muted-foreground)] line-through decoration-[var(--muted-foreground)]/60">
            {change.before}
          </span>
          <ArrowRight size="0.625rem" className="text-[var(--muted-foreground)]" />
        </>
      ) : null}
      {change.after ? (
        <span className="text-[var(--foreground)]">{change.after}</span>
      ) : (
        <span className="text-[var(--muted-foreground)] line-through decoration-[var(--muted-foreground)]/60">
          {change.before}
        </span>
      )}
    </div>
  );
}

function NewcomerRow({
  chatId,
  entryId,
  newcomer,
  onApart,
}: {
  chatId: string;
  entryId: string;
  newcomer: { name: string; others: string[] };
  onApart: () => void;
}) {
  const { t } = useTranslation();
  const { run, isRunning } = useCardActions(chatId);
  const [pick, setPick] = useState("");
  const same = async () => {
    if (!pick) return;
    const done = await run("world.sameCharacter", { name: newcomer.name, into: pick });
    if (done) toast.success(t("megumin.world.newcomer.merged", { name: newcomer.name, into: pick }));
  };
  return (
    <div
      onClick={stopCardClick}
      className="flex flex-wrap items-center gap-1.5 rounded-md border border-[var(--border)]/60 bg-[var(--background)]/40 px-2 py-1 text-[0.6875rem]"
    >
      <span className="inline-flex items-center gap-1">
        <UserPlus size="0.6875rem" className="text-[var(--muted-foreground)]" />
        {t("megumin.world.newcomer.question", { name: newcomer.name })}
      </span>
      <select
        value={pick}
        onChange={(e) => setPick(e.target.value)}
        title={t("megumin.world.newcomer.pickTitle", { name: newcomer.name })}
        className="min-w-0 rounded border border-[var(--border)] bg-[var(--background)]/60 px-1 py-0.5 text-[0.6875rem]"
      >
        <option value="">{t("megumin.world.newcomer.pickPlaceholder")}</option>
        {newcomer.others.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <CardButton
        onClick={same}
        disabled={!pick}
        pending={isRunning("world.sameCharacter")}
        icon={<Link size="0.6875rem" />}
        title={t("megumin.world.newcomer.sameTitle", { name: newcomer.name })}
      >
        {t("megumin.world.newcomer.same")}
      </CardButton>
      <CardButton
        onClick={() => {
          keptApart.add(`${entryId}|${newcomer.name}`);
          onApart();
        }}
        title={t("megumin.world.newcomer.apartTitle", { name: newcomer.name })}
      >
        {t("megumin.world.newcomer.apart")}
      </CardButton>
    </div>
  );
}

export function MeguminWorldPane({
  pane,
  chatId,
  messageId,
  info,
  view,
}: {
  pane: HTMLElement;
  chatId: string;
  messageId: string;
  info: WorldCardInfo | null;
  view: MeguminView;
}) {
  const { t } = useTranslation();
  const host = usePaneHost(pane, "prepend", "meg-wsdiff-host mb-2 flex flex-col gap-1.5");
  const { run, isRunning } = useCardActions(chatId);
  const [editorOpen, setEditorOpen] = useState(false);
  const [, setApartTick] = useState(0);
  const entryId = info?.entry?.id ?? "";
  const [open, setOpen] = useState(() => !!entryId && openStrips.has(entryId));

  const showChanges = (view.profile?.worldState?.showChanges ?? true) !== false;
  const editor = editorOpen ? <MeguminWorldEditor chatId={chatId} onClose={() => setEditorOpen(false)} /> : null;
  if (!host || !showChanges || !info) return editor;

  const { applied = [], skipped = [], notes = [], missing, disabled, noChanges, pending, unread, sideModel } = info;

  let icon;
  let title: string;
  let hasBody = false;
  if (pending) {
    icon = <Loader2 size="0.75rem" className="animate-spin" />;
    title = t("megumin.world.strip.pending");
  } else if (unread) {
    icon = <EyeOff size="0.75rem" />;
    title = t("megumin.world.strip.unread");
  } else if (disabled) {
    icon = <Power size="0.75rem" />;
    title = t("megumin.world.strip.disabled");
  } else if (missing) {
    icon = <CircleHelp size="0.75rem" />;
    title = sideModel ? t("megumin.world.strip.missingSide") : t("megumin.world.strip.missing");
  } else if (!applied.length) {
    icon = <Equal size="0.75rem" />;
    title = noChanges ? t("megumin.world.strip.noChanges") : t("megumin.world.strip.nothingChanged");
  } else {
    icon = <GitCompare size="0.75rem" />;
    title = t("megumin.world.strip.changed");
    hasBody = true;
  }

  const issues = [
    ...skipped.map((text) => ({ text, kind: "skip" as const })),
    ...notes.map((text) => ({ text, kind: "note" as const })),
  ];
  const foldable = hasBody || issues.length > 0;
  const canToggle = !pending && !unread && !missing && (disabled || applied.length > 0);
  const canRead = sideModel && !pending && (unread || missing || info.entry?.source === "sidemodel");
  const quiet = pending || unread || missing || (!applied.length && !disabled);

  const toggleOpen = () => {
    if (!foldable) return;
    const next = !open;
    setOpen(next);
    if (!entryId) return;
    if (next) openStrips.add(entryId);
    else openStrips.delete(entryId);
  };

  const issueSummary = [
    skipped.length ? t("megumin.world.strip.notUnderstood", { count: skipped.length }) : "",
    notes.length ? t("megumin.world.strip.notes", { count: notes.length }) : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const strip = (
    <div
      onClick={stopCardClick}
      className={cn(
        "rounded-md border px-2 py-1.5",
        disabled
          ? "border-[var(--destructive)]/30 bg-[var(--destructive)]/5"
          : "border-[var(--border)]/60 bg-[var(--background)]/40",
        quiet && "opacity-80",
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={toggleOpen}
          aria-expanded={foldable ? open : undefined}
          disabled={!foldable}
          className="inline-flex min-w-0 flex-1 items-center gap-1.5 text-left text-[0.6875rem] font-medium text-[var(--foreground)] disabled:cursor-default"
        >
          {icon}
          <span className="min-w-0">{title}</span>
          {hasBody ? (
            <span className="rounded-full bg-[var(--accent)] px-1.5 text-[0.5625rem] font-semibold">
              {applied.length}
            </span>
          ) : null}
          {foldable ? (
            <ChevronDown size="0.6875rem" className={cn("shrink-0 transition-transform", open && "rotate-180")} />
          ) : null}
        </button>
        <span className="flex flex-wrap items-center gap-1">
          {canToggle && entryId ? (
            <CardButton
              onClick={() => run("world.disable", { entryId, disabled: !disabled })}
              pending={isRunning("world.disable")}
              icon={disabled ? <RotateCw size="0.6875rem" /> : <RotateCcw size="0.6875rem" />}
              title={disabled ? t("megumin.world.strip.restoreTitle") : t("megumin.world.strip.revertTitle")}
            >
              {disabled ? t("megumin.world.strip.restore") : t("megumin.world.strip.revert")}
            </CardButton>
          ) : null}
          {canRead ? (
            <CardButton
              onClick={() => run("readAgain", { kind: "world", messageId })}
              pending={isRunning("readAgain")}
              icon={<BookOpenCheck size="0.6875rem" />}
              title={t("megumin.world.strip.readTitle")}
            >
              {unread ? t("megumin.world.strip.readNow") : t("megumin.world.strip.readAgain")}
            </CardButton>
          ) : null}
          <CardButton
            onClick={() => setEditorOpen(true)}
            icon={<Pencil size="0.6875rem" />}
            title={t("megumin.world.strip.editTitle")}
          >
            {t("megumin.world.strip.edit")}
          </CardButton>
        </span>
      </div>
      {foldable && open ? (
        <div className="mt-1.5 flex flex-col gap-1 border-t border-[var(--border)]/50 pt-1.5">
          {hasBody
            ? applied.slice(0, SHOW_AT_MOST).map((a, i) => <ChangeRow key={`${a.label}:${i}`} change={a} />)
            : null}
          {hasBody && applied.length > SHOW_AT_MOST ? (
            <div className="text-[0.625rem] text-[var(--muted-foreground)]">
              {t("megumin.world.strip.more", { count: applied.length - SHOW_AT_MOST })}
            </div>
          ) : null}
          {issues.length ? (
            <details className="text-[0.625rem]">
              <summary className="inline-flex cursor-pointer items-center gap-1 text-amber-500">
                <TriangleAlert size="0.625rem" />
                {issueSummary}
              </summary>
              <div className="mt-1 flex flex-col gap-0.5">
                {issues.map((issue, i) =>
                  issue.kind === "skip" ? (
                    <code key={`s${i}`} className="break-words rounded bg-[var(--accent)] px-1 py-px font-mono">
                      {issue.text}
                    </code>
                  ) : (
                    <div key={`n${i}`} className="text-[var(--muted-foreground)]">
                      {issue.text}
                    </div>
                  ),
                )}
              </div>
            </details>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  const newcomers =
    !disabled && entryId ? (info.newcomers ?? []).filter((n) => !keptApart.has(`${entryId}|${n.name}`)) : [];

  return (
    <>
      {createPortal(
        <>
          {strip}
          {newcomers.map((n) => (
            <NewcomerRow
              key={n.name}
              chatId={chatId}
              entryId={entryId}
              newcomer={n}
              onApart={() => setApartTick((x) => x + 1)}
            />
          ))}
        </>,
        host,
      )}
      {editor}
    </>
  );
}
