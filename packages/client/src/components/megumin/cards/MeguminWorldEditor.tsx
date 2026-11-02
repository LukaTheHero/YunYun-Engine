// ──────────────────────────────────────────────
// Megumin card: the World State editor
// ──────────────────────────────────────────────
// Port of Megumin's features/worldstate/editor.js. Two views over the chat's
// state store:
//   State   — the world as it stands now, every field editable. Each edit is
//             kept as the user's own journal entry: swipes, rewinds and deletes
//             never undo it, and it can be deleted from History.
//   History — every entry (replies, imports, edits), newest first, each one
//             switchable off and on, plus the chat's rewrite/re-read/reset.
// Edits commit on blur or Enter, never per keystroke, so one edit is one row.
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  BookOpen,
  Check,
  Clapperboard,
  History,
  Eraser,
  FileInput,
  Flame,
  Ghost,
  Hourglass,
  MapPinned,
  MessageSquare,
  PersonStanding,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Sprout,
  Pin,
  Trash2,
  TriangleAlert,
  UserPen,
  Users,
  X,
} from "lucide-react";
import { MeguminWorldModel, MeguminWorldRender } from "@marinara-engine/shared/megumin/client";
import { cn } from "../../../lib/utils";
import { Modal } from "../../ui/Modal";
import { useMeguminView } from "../../../hooks/use-megumin";
import { CardButton, CardTag, CommitInput, useArmed, useCardActions } from "./megumin-card-kit";

/** The player's key in the world state (state/modules/world/parse.js PC). */
const PC = "{{pc}}";

type Fields = Record<string, string>;
interface CastMember {
  name: string;
  aliases?: string[];
  present: boolean;
  offscreen?: string;
  fields: Fields;
}
interface WorldState {
  scene?: { time?: string; location?: string; weather?: string };
  arcPhase?: string;
  scenePhase?: string;
  pc?: { name?: string; fields?: Fields };
  cast?: Record<string, CastMember>;
  threads?: string[];
  seeds?: string[];
  timers?: string[];
}
type Change = Record<string, unknown>;

const LISTS = [
  { key: "threads", icon: Flame },
  { key: "seeds", icon: Sprout },
  { key: "timers", icon: Hourglass },
] as const;

const LIST_LIMITS = MeguminWorldModel.LIST_LIMITS as Record<string, number>;
const fieldLabel = (f: string) => String(MeguminWorldModel.fieldLabel(f));

function fieldKeys(fields: Fields | undefined, preferred: string[]) {
  const extra = Object.keys(fields || {}).filter((k) => !preferred.includes(k));
  return [...preferred, ...extra];
}

function Section({
  icon,
  title,
  tag,
  children,
}: {
  icon: ReactNode;
  title: ReactNode;
  tag?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-[var(--border)]/60 bg-[var(--background)]/35 p-2.5">
      <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-[var(--marinara-chat-chrome-panel-title)]">
        {icon}
        <span className="min-w-0">{title}</span>
        {tag}
      </div>
      {children}
    </section>
  );
}

function Cell({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-0.5", wide && "col-span-full")}>
      <span className="text-[0.625rem] text-[var(--muted-foreground)]">{label}</span>
      {children}
    </label>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="text-[0.625rem] leading-relaxed text-[var(--marinara-chat-chrome-panel-muted)]">{children}</p>;
}

function StateView({
  state,
  seedsHidden,
  commit,
}: {
  state: WorldState;
  seedsHidden: boolean;
  commit: (changes: Change[]) => void;
}) {
  const { t } = useTranslation();
  const { armed, arm } = useArmed(3000);
  const s = state.scene || {};
  const cast = Object.values(state.cast || {});
  const present = MeguminWorldModel.presentCast(state) as CastMember[];
  const away = cast.filter((c) => !c.present);
  const pcName = state.pc?.name || t("megumin.world.editor.player");

  const grid = (who: string, fields: Fields | undefined, preferred: string[]) => (
    <div className="grid grid-cols-2 gap-1.5">
      {fieldKeys(fields, preferred).map((f) => (
        <Cell key={f} label={fieldLabel(f)}>
          <CommitInput
            value={fields?.[f] || ""}
            onCommit={(value) => commit([{ type: "field", who, field: f, value, keepPresence: true }])}
          />
        </Cell>
      ))}
    </div>
  );

  const person = (c: CastMember) => (
    <div
      key={c.name}
      className={cn(
        "flex flex-col gap-1.5 rounded-md border border-[var(--border)]/50 p-2",
        !c.present && "opacity-80",
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <b className="text-xs">{c.name}</b>
        {(c.aliases || []).map((a) => (
          <CardTag key={a}>{t("megumin.world.editor.alias", { alias: a })}</CardTag>
        ))}
        <span className="flex-1" />
        <select
          value={c.present ? "in" : "away"}
          onChange={(e) =>
            commit([
              e.target.value === "in" ? { type: "enter", who: c.name } : { type: "leave", who: c.name, where: "" },
            ])
          }
          className="rounded border border-[var(--border)] bg-[var(--background)]/60 px-1 py-0.5 text-[0.6875rem]"
        >
          <option value="in">{t("megumin.world.editor.inScene")}</option>
          <option value="away">{t("megumin.world.editor.away")}</option>
        </select>
        <CardButton
          onClick={() => arm(`forget:${c.name}`, () => commit([{ type: "forget", who: c.name }]))}
          tone={armed === `forget:${c.name}` ? "armed" : "default"}
          icon={<Trash2 size="0.6875rem" />}
          title={t("megumin.world.editor.forgetTitle")}
        >
          {armed === `forget:${c.name}` ? t("megumin.world.editor.forgetConfirm") : null}
        </CardButton>
      </div>
      {!c.present ? (
        <Cell label={t("megumin.world.editor.whereabouts")} wide>
          <CommitInput
            value={c.offscreen || ""}
            placeholder={t("megumin.world.editor.whereaboutsPlaceholder")}
            onCommit={(value) => commit([{ type: "offscreen", who: c.name, value }])}
          />
        </Cell>
      ) : null}
      {grid(c.name, c.fields, MeguminWorldRender.NPC_FIELDS as string[])}
    </div>
  );

  const list = (l: (typeof LISTS)[number]) => {
    const Icon = l.icon;
    const items = state[l.key] || [];
    return (
      <div key={l.key} className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5 text-[0.6875rem] font-medium">
          <Icon size="0.75rem" />
          {t(`megumin.world.editor.lists.${l.key}.title`)}
          <span title={t("megumin.world.editor.listLimitTitle", { count: LIST_LIMITS[l.key] ?? 0 })}>
            <CardTag>{t("megumin.world.editor.listLimit", { count: LIST_LIMITS[l.key] ?? 0 })}</CardTag>
          </span>
        </div>
        {items.map((item, i) => (
          <div key={`${item}:${i}`} className="flex items-center gap-1">
            <CommitInput
              value={item}
              onCommit={(value, was) => {
                const ch: Change[] = [{ type: "list", list: l.key, op: "remove", value: was }];
                if (value) ch.push({ type: "list", list: l.key, op: "add", value });
                commit(ch);
              }}
            />
            <CardButton
              onClick={() => commit([{ type: "list", list: l.key, op: "remove", value: item }])}
              icon={<X size="0.6875rem" />}
              title={t("megumin.world.editor.remove")}
            />
          </div>
        ))}
        <CommitInput
          value=""
          clearOnCommit
          placeholder={t(`megumin.world.editor.lists.${l.key}.placeholder`)}
          onCommit={(value) => commit([{ type: "list", list: l.key, op: "add", value }])}
        />
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-2.5">
      <Section icon={<MapPinned size="0.8125rem" />} title={t("megumin.world.editor.scene")}>
        <div className="grid grid-cols-2 gap-1.5">
          {(["time", "location", "weather"] as const).map((key) => (
            <Cell key={key} label={t(`megumin.world.editor.sceneFields.${key}`)}>
              <CommitInput value={s[key] || ""} onCommit={(value) => commit([{ type: "scene", key, value }])} />
            </Cell>
          ))}
          <Cell label={t("megumin.world.editor.arcPhase")}>
            <CommitInput
              value={state.arcPhase || ""}
              placeholder={t("megumin.world.editor.arcPhasePlaceholder")}
              onCommit={(value) => commit([{ type: "phase", key: "arcPhase", value }])}
            />
          </Cell>
          <Cell label={t("megumin.world.editor.scenePhase")}>
            <CommitInput
              value={state.scenePhase || ""}
              placeholder={t("megumin.world.editor.scenePhasePlaceholder")}
              onCommit={(value) => commit([{ type: "phase", key: "scenePhase", value }])}
            />
          </Cell>
        </div>
      </Section>

      <Section
        icon={<PersonStanding size="0.8125rem" />}
        title={pcName}
        tag={<CardTag>{t("megumin.world.editor.playerTag")}</CardTag>}
      >
        {grid(PC, state.pc?.fields, MeguminWorldRender.PC_FIELDS as string[])}
      </Section>

      <Section
        icon={<Users size="0.8125rem" />}
        title={t("megumin.world.editor.present")}
        tag={<CardTag>{present.length}</CardTag>}
      >
        {present.length ? present.map(person) : <Hint>{t("megumin.world.editor.nobodyHere")}</Hint>}
        <CommitInput
          value=""
          clearOnCommit
          placeholder={t("megumin.world.editor.addCharacter")}
          onCommit={(who) => commit([{ type: "enter", who }])}
        />
      </Section>

      {away.length ? (
        <Section
          icon={<Clapperboard size="0.8125rem" />}
          title={t("megumin.world.editor.awayTitle")}
          tag={<CardTag>{away.length}</CardTag>}
        >
          <Hint>{t("megumin.world.editor.awayHint")}</Hint>
          {away.map(person)}
        </Section>
      ) : null}

      <Section icon={<BookOpen size="0.8125rem" />} title={t("megumin.world.editor.threads")}>
        {LISTS.filter((l) => !(l.key === "seeds" && seedsHidden)).map(list)}
      </Section>
    </div>
  );
}

interface HistoryRow {
  entry: {
    id: string;
    source?: string;
    orphan?: boolean;
    swipe: number;
    disabled?: boolean;
    missing?: boolean;
    parsed?: { kind?: string; skipped?: string[] };
  };
  active: boolean;
  index: number | null;
  shownSwipe: number | null;
  lines: string[];
}

function HistoryView({
  chatId,
  rows,
  pendingFullRewrite,
}: {
  chatId: string;
  rows: HistoryRow[];
  pendingFullRewrite: boolean;
}) {
  const { t } = useTranslation();
  const { run, isRunning } = useCardActions(chatId);
  const { armed, arm } = useArmed(4000);
  const [showAllSwipes, setShowAllSwipes] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const shown = rows.filter(
    (r) => showAllSwipes || r.active || r.entry.disabled || r.entry.source === "user" || r.entry.orphan,
  );

  const doImport = async () => {
    const a = parseInt(from, 10);
    const b = parseInt(to, 10);
    if (Number.isNaN(a) || Number.isNaN(b) || a < 0 || b < a) {
      toast.warning(t("megumin.world.editor.importRangeInvalid"));
      return;
    }
    const n = Number(await run("world.import", { from: a, to: b })) || 0;
    toast.info(
      n
        ? t("megumin.world.editor.imported", { count: n, from: a, to: b })
        : t("megumin.world.editor.importedNone", { from: a, to: b }),
    );
  };

  const where = (r: HistoryRow) => {
    const e = r.entry;
    if (e.source === "user")
      return (
        <>
          <UserPen size="0.6875rem" /> {t("megumin.world.editor.history.yourEdit")}
        </>
      );
    if (e.orphan)
      return (
        <>
          <Ghost size="0.6875rem" /> {t("megumin.world.editor.history.orphan")}
        </>
      );
    if (r.index == null)
      return (
        <>
          <MessageSquare size="0.6875rem" /> {t("megumin.world.editor.history.notFound")}
        </>
      );
    const swipe = r.shownSwipe !== e.swipe || e.swipe > 0;
    return (
      <>
        <MessageSquare size="0.6875rem" />{" "}
        {swipe
          ? t("megumin.world.editor.history.messageSwipe", { index: r.index, swipe: e.swipe + 1 })
          : t("megumin.world.editor.history.message", { index: r.index })}
      </>
    );
  };

  return (
    <div className="flex flex-col gap-2.5">
      <Section icon={<RefreshCw size="0.8125rem" />} title={t("megumin.world.editor.thisChat")}>
        <div className="flex flex-col gap-1.5">
          <CardButton
            onClick={() => run("world.rewrite", { on: !pendingFullRewrite })}
            pending={isRunning("world.rewrite")}
            icon={pendingFullRewrite ? <Check size="0.6875rem" /> : <RefreshCw size="0.6875rem" />}
            className="self-start"
          >
            {pendingFullRewrite ? t("megumin.world.editor.rewriteQueued") : t("megumin.world.editor.rewrite")}
          </CardButton>
          <div className="flex flex-wrap items-center gap-1.5 text-[0.6875rem]">
            <span>{t("megumin.world.editor.reread")}</span>
            <input
              type="number"
              min={0}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              placeholder={t("megumin.world.editor.from")}
              className="w-20 rounded border border-[var(--border)] bg-[var(--background)]/60 px-1.5 py-0.5 text-[0.6875rem]"
            />
            <input
              type="number"
              min={0}
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder={t("megumin.world.editor.to")}
              className="w-20 rounded border border-[var(--border)] bg-[var(--background)]/60 px-1.5 py-0.5 text-[0.6875rem]"
            />
            <CardButton onClick={doImport} pending={isRunning("world.import")} icon={<FileInput size="0.6875rem" />}>
              {t("megumin.world.editor.read")}
            </CardButton>
          </div>
          <CardButton
            onClick={() =>
              arm("reset", async () => {
                const ok = await run("world.reset");
                if (ok) toast.info(t("megumin.world.editor.cleared"));
              })
            }
            pending={isRunning("world.reset")}
            tone={armed === "reset" ? "armed" : "danger"}
            icon={armed === "reset" ? <TriangleAlert size="0.6875rem" /> : <Eraser size="0.6875rem" />}
            className="self-start"
          >
            {armed === "reset" ? t("megumin.world.editor.resetConfirm") : t("megumin.world.editor.reset")}
          </CardButton>
        </div>
        <Hint>{t("megumin.world.editor.rereadHint")}</Hint>
      </Section>

      <Section
        icon={<History size="0.8125rem" />}
        title={t("megumin.world.editor.history.title")}
        tag={
          <label className="ml-auto inline-flex items-center gap-1 text-[0.625rem] font-normal">
            <input
              type="checkbox"
              checked={showAllSwipes}
              onChange={(e) => setShowAllSwipes(e.target.checked)}
              className="h-3 w-3 accent-[var(--primary)]"
            />
            {t("megumin.world.editor.history.allSwipes")}
          </label>
        }
      >
        {shown.length ? (
          shown.map((r) => {
            const e = r.entry;
            return (
              <div
                key={e.id}
                className={cn(
                  "flex flex-col gap-1 rounded-md border border-[var(--border)]/50 p-2",
                  !r.active && "opacity-60",
                )}
              >
                <div className="flex flex-wrap items-center gap-1">
                  <span className="inline-flex items-center gap-1 text-[0.6875rem] font-medium">{where(r)}</span>
                  {e.source === "import" ? <CardTag>{t("megumin.world.editor.badge.imported")}</CardTag> : null}
                  {e.source === "sidemodel" ? <CardTag>{t("megumin.world.editor.badge.chomusuke")}</CardTag> : null}
                  {e.parsed?.kind === "snapshot" ? (
                    <CardTag>{t("megumin.world.editor.badge.fullState")}</CardTag>
                  ) : null}
                  {e.disabled ? (
                    <CardTag tone="off">{t("megumin.world.editor.badge.off")}</CardTag>
                  ) : !r.active ? (
                    <CardTag tone="dim">{t("megumin.world.editor.badge.notShowing")}</CardTag>
                  ) : null}
                  {e.missing ? <CardTag tone="warn">{t("megumin.world.editor.badge.noUpdate")}</CardTag> : null}
                  {e.parsed?.skipped?.length ? (
                    <CardTag tone="warn">
                      {t("megumin.world.editor.badge.notUnderstood", { count: e.parsed.skipped.length })}
                    </CardTag>
                  ) : null}
                  <span className="flex-1" />
                  {e.source === "user" ? (
                    <CardButton
                      onClick={() => run("world.removeUserEntry", { entryId: e.id })}
                      icon={<Trash2 size="0.6875rem" />}
                      tone="danger"
                      title={t("megumin.world.editor.history.deleteTitle")}
                    >
                      {t("megumin.world.editor.history.delete")}
                    </CardButton>
                  ) : !e.missing ? (
                    <CardButton
                      onClick={() => run("world.disable", { entryId: e.id, disabled: !e.disabled })}
                      icon={e.disabled ? <RotateCw size="0.6875rem" /> : <RotateCcw size="0.6875rem" />}
                    >
                      {e.disabled
                        ? t("megumin.world.editor.history.turnOn")
                        : t("megumin.world.editor.history.turnOff")}
                    </CardButton>
                  ) : null}
                </div>
                {r.lines.length ? (
                  <>
                    {r.lines.slice(0, 5).map((l, i) => (
                      <div key={i} className="text-[0.6875rem] leading-snug">
                        {l}
                      </div>
                    ))}
                    {r.lines.length > 5 ? (
                      <details className="text-[0.6875rem]">
                        <summary className="cursor-pointer text-[var(--muted-foreground)]">
                          {t("megumin.world.editor.history.more", { count: r.lines.length - 5 })}
                        </summary>
                        {r.lines.slice(5).map((l, i) => (
                          <div key={i} className="leading-snug">
                            {l}
                          </div>
                        ))}
                      </details>
                    ) : null}
                  </>
                ) : (
                  <div className="text-[0.6875rem] text-[var(--muted-foreground)]">
                    {e.missing
                      ? t("megumin.world.editor.history.noBlock")
                      : t("megumin.world.editor.history.noChanges")}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <Hint>{t("megumin.world.editor.history.empty")}</Hint>
        )}
      </Section>
    </div>
  );
}

/** Opens over the chat; the World State belongs to that chat. */
export function MeguminWorldEditor({ chatId, onClose }: { chatId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [current, setCurrent] = useState<"state" | "history">("state");
  const query = useMeguminView({ kind: "chat", chatId }, { history: current === "history" });
  const { run } = useCardActions(chatId);
  const view = query.data;
  const world = view?.world as { state?: WorldState; history?: HistoryRow[]; pendingFullRewrite?: boolean } | undefined;

  const commit = (changes: Change[]) => {
    if (!changes.length) return;
    void run("world.edit", { changes });
  };

  const tabButton = (id: "state" | "history", Icon: typeof Pin, label: string) => (
    <button
      type="button"
      aria-pressed={current === id}
      onClick={() => setCurrent(id)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors",
        current === id
          ? "bg-[var(--primary)]/15 font-semibold ring-1 ring-[var(--primary)]/40"
          : "text-[var(--muted-foreground)] hover:bg-[var(--accent)]",
      )}
    >
      <Icon size="0.75rem" />
      {label}
    </button>
  );

  return (
    <Modal open onClose={onClose} title={t("megumin.world.editor.title")} width="max-w-2xl" mobileFullscreen>
      <div className="flex flex-col gap-2.5" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-1">
            {tabButton("state", Pin, t("megumin.world.editor.tabState"))}
            {tabButton("history", History, t("megumin.world.editor.tabHistory"))}
          </div>
          <Hint>{t("megumin.world.editor.keptHint")}</Hint>
        </div>
        {!world ? (
          <Hint>{query.isError ? t("megumin.world.editor.loadFailed") : t("megumin.world.editor.loading")}</Hint>
        ) : current === "state" ? (
          <StateView state={world.state || {}} seedsHidden={!!view?.notebook?.enabled} commit={commit} />
        ) : (
          <HistoryView chatId={chatId} rows={world.history || []} pendingFullRewrite={!!world.pendingFullRewrite} />
        )}
      </div>
    </Modal>
  );
}
