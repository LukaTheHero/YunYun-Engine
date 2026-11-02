// ──────────────────────────────────────────────
// Megumin card: Bonds overview and the Bonds / Sheet editor
// ──────────────────────────────────────────────
// Ports of Megumin's features/bonds/overview.js (every character's bonds kept
// for this chat, the ones handed to the story right now first) and
// features/bonds/editor.js (each value editable, add a character, forget one;
// the player's sheet). An edit is kept as the user's own change, so swipes,
// rewinds and deletes never undo it.
import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { toast } from "sonner";
import { Heart, Pencil, ShieldHalf, Trash2 } from "lucide-react";
import { MeguminStatsParse } from "@marinara-engine/shared/megumin/client";
import { cn } from "../../../lib/utils";
import { api } from "../../../lib/api-client";
import { Modal } from "../../ui/Modal";
import { meguminKeys, useMeguminView, type MeguminView } from "../../../hooks/use-megumin";
import { CardButton, CardTag, CommitInput, useArmed, useCardActions } from "./megumin-card-kit";

interface StatValue {
  label: string;
  text: string;
  value?: number;
  max?: number;
}
interface StatFieldCfg {
  label: string;
  type?: string;
  max?: number;
  start?: number;
  hint?: string;
}
interface Person {
  name: string;
  fields: Record<string, StatValue>;
  seq?: number;
}
interface OverviewPerson {
  name: string;
  fields: StatValue[];
  inPlay: boolean;
  seq?: number;
}

const statKey = (s: string) => String(MeguminStatsParse.statKey(s));

function statFields(view: MeguminView | undefined, blockId: string): StatFieldCfg[] {
  const list = (view?.statFields?.[blockId] ?? []) as StatFieldCfg[];
  return Array.isArray(list) ? list.filter((f) => f && f.label) : [];
}

/** Is that stat block in the stack (state/index.js statBlockOn). */
function statBlockOn(view: MeguminView | undefined, id: string) {
  const profile = view?.profile;
  if (!profile) return false;
  if (id === "tracker") return Boolean(profile.storyPlan?.enabled);
  return ((profile.blockStack?.order as string[] | undefined) ?? []).includes(id);
}

// The configured fields first (in their order), then any the model added.
function fieldList(onFile: Record<string, StatValue> | undefined, cfgs: StatFieldCfg[]) {
  const cfg = cfgs.map((f) => ({ key: statKey(f.label), label: f.label, cfg: f as StatFieldCfg | null }));
  const extra = Object.entries(onFile || {})
    .filter(([k]) => !cfg.some((c) => c.key === k))
    .map(([k, f]) => ({ key: k, label: f.label, cfg: null as StatFieldCfg | null }));
  return [...cfg, ...extra];
}

function hintFor(cfg: StatFieldCfg | null, t: TFunction) {
  if (!cfg) return "";
  if (cfg.type === "meter") return t("megumin.bonds.editor.meterHint", { max: cfg.max || 100 });
  if (cfg.type === "number") return t("megumin.bonds.editor.numberHint");
  return cfg.hint || "";
}

/** One edited value as a field change; "" clears it. A meter keeps its max. Null when not understood. */
function fieldChange(f: { key: string; label: string; cfg: StatFieldCfg | null }, raw: string) {
  if (!raw) return { key: f.key, label: f.label, remove: true };
  const v = MeguminStatsParse.parseStatValue(raw) as
    (Omit<StatValue, "label"> & { delta?: number; reason?: string }) | null;
  if (!v) return null;
  if (f.cfg?.type === "meter" && v.value !== undefined && v.max === undefined && f.cfg.max) {
    v.max = Number(f.cfg.max);
    v.text = `${v.value}/${v.max}`;
  }
  return { key: f.key, label: f.label, ...v };
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="text-[0.625rem] leading-relaxed text-[var(--marinara-chat-chrome-panel-muted)]">{children}</p>;
}

function FieldRow({ f }: { f: StatValue }) {
  if (f.max !== undefined && typeof f.value === "number") {
    const pct = Math.max(0, Math.min(100, (f.value / (f.max || 100)) * 100));
    return (
      <div className="grid grid-cols-[minmax(0,6rem)_1fr_auto] items-center gap-1.5 text-[0.6875rem]">
        <span className="truncate text-[var(--muted-foreground)]" title={f.label}>
          {f.label}
        </span>
        <span className="h-1.5 overflow-hidden rounded-full bg-[var(--accent)]">
          <span className="block h-full rounded-full bg-rose-500" style={{ width: `${pct.toFixed(0)}%` }} />
        </span>
        <span className="font-mono text-[0.625rem]">{f.text}</span>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-[minmax(0,6rem)_1fr] items-start gap-1.5 text-[0.6875rem]">
      <span className="truncate text-[var(--muted-foreground)]" title={f.label}>
        {f.label}
      </span>
      <span className="min-w-0 break-words">{f.text}</span>
    </div>
  );
}

/** Every character's bonds on file for this chat (Megumin's openBondsOverview). */
export function MeguminBondsOverview({
  chatId,
  onClose,
  onEdit,
}: {
  chatId: string;
  onClose: () => void;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  const view = useMeguminView({ kind: "chat", chatId }).data;
  const [search, setSearch] = useState("");
  // Who is handed to the story right now is worked out on the server (the scene's cast, the recent text).
  const overview = useQuery<OverviewPerson[]>({
    queryKey: [...meguminKeys.all, "bonds-overview", chatId, view?.stats?.bonds],
    queryFn: async () => {
      const res = await api.post<{ ok: true; result: OverviewPerson[] | null }>(`/megumin/chats/${chatId}/actions`, {
        action: "bonds.overview",
        args: {},
      });
      return Array.isArray(res.result) ? res.result : [];
    },
    retry: false,
    staleTime: 5_000,
  });

  const people = useMemo<OverviewPerson[]>(() => {
    if (overview.data) return overview.data;
    // Before (or without) the server's answer: everyone on file, newest first, none marked.
    const state = (view?.stats?.bonds ?? { people: {} }) as { people?: Record<string, Person> };
    return Object.values(state.people || {})
      .map((p) => ({ name: p.name, fields: Object.values(p.fields || {}), inPlay: false, seq: p.seq || 0 }))
      .sort((a, b) => (b.seq || 0) - (a.seq || 0) || a.name.localeCompare(b.name));
  }, [overview.data, view?.stats?.bonds]);

  const q = search.toLowerCase().trim();
  return (
    <Modal open onClose={onClose} title={t("megumin.bonds.overview.title")} width="max-w-2xl" mobileFullscreen>
      <div className="flex flex-col gap-2.5" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap items-center gap-1.5">
          <Heart size="0.875rem" className="text-rose-500" />
          <span className="text-xs text-[var(--muted-foreground)]">
            {t("megumin.bonds.overview.count", { count: people.length })}
          </span>
          <span className="flex-1" />
          {people.length > 6 ? (
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("megumin.bonds.searchPlaceholder")}
              className="w-40 rounded-md border border-[var(--border)] bg-[var(--background)]/60 px-2 py-1 text-xs"
            />
          ) : null}
          <CardButton onClick={onEdit} icon={<Pencil size="0.6875rem" />} title={t("megumin.bonds.overview.editTitle")}>
            {t("megumin.bonds.edit")}
          </CardButton>
        </div>
        <Hint>{t("megumin.bonds.overview.hint")}</Hint>
        {people.length ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {people
              .filter((p) => !q || p.name.toLowerCase().includes(q))
              .map((p) => (
                <div
                  key={p.name}
                  className={cn(
                    "flex flex-col gap-1 rounded-md border p-2",
                    p.inPlay ? "border-rose-500/40 bg-rose-500/5" : "border-[var(--border)]/60",
                  )}
                >
                  <div className="flex items-center gap-1.5 text-xs font-semibold">
                    <span className="min-w-0 truncate">{p.name}</span>
                    {p.inPlay ? (
                      <span title={t("megumin.bonds.overview.inPlayTitle")}>
                        <CardTag>{t("megumin.bonds.overview.inPlay")}</CardTag>
                      </span>
                    ) : null}
                  </div>
                  {p.fields.map((f, i) => (
                    <FieldRow key={`${f.label}:${i}`} f={f} />
                  ))}
                </div>
              ))}
          </div>
        ) : (
          <Hint>{t("megumin.bonds.empty")}</Hint>
        )}
      </div>
    </Modal>
  );
}

function ValueCell({
  f,
  onFile,
  onCommit,
}: {
  f: { key: string; label: string; cfg: StatFieldCfg | null };
  onFile: Record<string, StatValue> | undefined;
  onCommit: (raw: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <label className="flex min-w-0 flex-col gap-0.5">
      <span className="truncate text-[0.625rem] text-[var(--muted-foreground)]">{f.label}</span>
      <CommitInput value={onFile?.[f.key]?.text || ""} placeholder={hintFor(f.cfg, t)} onCommit={onCommit} />
    </label>
  );
}

/** Megumin's openStatsEditor: Bonds (every character) and the player's Sheet. */
export function MeguminStatsEditor({
  chatId,
  initialView = "bonds",
  onClose,
}: {
  chatId: string;
  initialView?: "bonds" | "sheet";
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const view = useMeguminView({ kind: "chat", chatId }).data;
  const { run } = useCardActions(chatId);
  const { armed, arm } = useArmed(3000);
  const [current, setCurrent] = useState<"bonds" | "sheet">(initialView);
  const [search, setSearch] = useState("");

  const commit = (moduleId: "bonds" | "sheet", parsed: Record<string, unknown>) => {
    void run("stats.edit", { moduleId, parsed });
  };

  const commitValue = (f: { key: string; label: string; cfg: StatFieldCfg | null }, raw: string, who: string) => {
    const change = fieldChange(f, raw);
    if (!change) {
      toast.warning(t("megumin.bonds.editor.notUnderstood"));
      return;
    }
    if (current === "sheet") commit("sheet", { kind: "delta", fields: [change] });
    else commit("bonds", { kind: "delta", people: [{ name: who, fields: [change] }] });
  };

  const addCharacter = (name: string) => {
    // Starts at the configured starting values.
    const fields = statFields(view, "bonds")
      .filter((f) => f.type === "meter" || f.type === "number")
      .map((f) => {
        const start = f.start !== undefined ? f.start : 0;
        return f.type === "meter"
          ? { key: statKey(f.label), label: f.label, text: `${start}/${f.max || 100}`, value: start, max: f.max || 100 }
          : { key: statKey(f.label), label: f.label, text: String(start), value: start };
      });
    if (!fields.length) {
      toast.warning(t("megumin.bonds.editor.noNumberFields"));
      return;
    }
    commit("bonds", { kind: "delta", people: [{ name, fields }] });
  };

  const tab = (id: "bonds" | "sheet", icon: ReactNode, label: string) => (
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
      {icon}
      {label}
    </button>
  );

  const bonds = () => {
    const state = (view?.stats?.bonds ?? { people: {} }) as { people?: Record<string, Person> };
    const people = Object.values(state.people || {}).sort(
      (a, b) => (b.seq || 0) - (a.seq || 0) || a.name.localeCompare(b.name),
    );
    const q = search.toLowerCase().trim();
    const cfgs = statFields(view, "bonds");
    return (
      <section className="flex flex-col gap-2 rounded-lg border border-[var(--border)]/60 bg-[var(--background)]/35 p-2.5">
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
          <Heart size="0.8125rem" />
          {t("megumin.bonds.editor.bonds")}
          <CardTag>{people.length}</CardTag>
          <span className="flex-1" />
          {people.length > 6 ? (
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("megumin.bonds.searchPlaceholder")}
              className="w-40 rounded-md border border-[var(--border)] bg-[var(--background)]/60 px-2 py-1 text-xs font-normal"
            />
          ) : null}
        </div>
        {!statBlockOn(view, "bonds") ? <Hint>{t("megumin.bonds.editor.bondsOff")}</Hint> : null}
        <CommitInput
          value=""
          clearOnCommit
          placeholder={t("megumin.bonds.editor.addCharacter")}
          onCommit={addCharacter}
        />
        {people.length ? (
          people
            .filter((p) => !q || p.name.toLowerCase().includes(q))
            .map((p) => (
              <div key={p.name} className="flex flex-col gap-1.5 rounded-md border border-[var(--border)]/50 p-2">
                <div className="flex items-center gap-1.5">
                  <b className="text-xs">{p.name}</b>
                  <span className="flex-1" />
                  <CardButton
                    onClick={() =>
                      arm(`forget:${p.name}`, () => commit("bonds", { kind: "delta", people: [], forget: [p.name] }))
                    }
                    tone={armed === `forget:${p.name}` ? "armed" : "default"}
                    icon={<Trash2 size="0.6875rem" />}
                    title={t("megumin.bonds.editor.forgetTitle")}
                  >
                    {armed === `forget:${p.name}` ? t("megumin.bonds.editor.forgetConfirm") : null}
                  </CardButton>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {fieldList(p.fields, cfgs).map((f) => (
                    <ValueCell key={f.key} f={f} onFile={p.fields} onCommit={(raw) => commitValue(f, raw, p.name)} />
                  ))}
                </div>
              </div>
            ))
        ) : (
          <Hint>{t("megumin.bonds.empty")}</Hint>
        )}
      </section>
    );
  };

  const sheet = () => {
    const state = (view?.stats?.sheet ?? { fields: {} }) as { fields?: Record<string, StatValue> };
    return (
      <section className="flex flex-col gap-2 rounded-lg border border-[var(--border)]/60 bg-[var(--background)]/35 p-2.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <ShieldHalf size="0.8125rem" />
          {t("megumin.bonds.editor.sheetOf")}
          <CardTag>{t("megumin.bonds.editor.playerTag")}</CardTag>
        </div>
        {!statBlockOn(view, "sheet") ? <Hint>{t("megumin.bonds.editor.sheetOff")}</Hint> : null}
        <div className="grid grid-cols-2 gap-1.5">
          {fieldList(state.fields, statFields(view, "sheet")).map((f) => (
            <ValueCell key={f.key} f={f} onFile={state.fields} onCommit={(raw) => commitValue(f, raw, "")} />
          ))}
        </div>
      </section>
    );
  };

  return (
    <Modal open onClose={onClose} title={t("megumin.bonds.editor.title")} width="max-w-2xl" mobileFullscreen>
      <div className="flex flex-col gap-2.5" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-1">
            {tab("bonds", <Heart size="0.75rem" />, t("megumin.bonds.editor.bonds"))}
            {tab("sheet", <ShieldHalf size="0.75rem" />, t("megumin.bonds.editor.sheet"))}
          </div>
          <Hint>{t("megumin.bonds.editor.keptHint")}</Hint>
        </div>
        {!view ? <Hint>{t("megumin.bonds.loading")}</Hint> : current === "bonds" ? bonds() : sheet()}
      </div>
    </Modal>
  );
}
