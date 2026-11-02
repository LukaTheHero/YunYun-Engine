// ──────────────────────────────────────────────
// Megumin panel: Dev Mode
// ──────────────────────────────────────────────
// Megumin's prompt editor (src/ui/devmode.js), with its two doors:
//
//   ADD-ONS   the pieces every engine shares (thinking tags, death and combat,
//             the ban list, the output blocks…), edited on their own, with a map
//             of where in the outgoing prompt each one lands. Saved at once to the
//             suite's sharedFragments, for every engine and character.
//   ENGINES   your own engines: a copy of a shipped one (or a blank one) drawn as
//             the real prompt document, in the real order, its own slots editable
//             and the add-ons shown as signposts where they sit. Saved to the
//             suite's customModes with Save Engine.
//
// The slot registry's computed parts (each slot's built-in text, whether its
// switch is on, its presets and pickers) and the preset skeleton come from the
// server, resolved against the profile in effect.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Cpu,
  Download,
  Eraser,
  FileUp,
  Globe,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Puzzle,
  RotateCcw,
  Save,
  Trash2,
  TriangleAlert,
  Wand2,
} from "lucide-react";
import { cn } from "../../../lib/utils";
import { api } from "../../../lib/api-client";
import { showConfirmDialog } from "../../../lib/app-dialogs";
import { meguminKeys, type MeguminScope } from "../../../hooks/use-megumin";
import { useMeguminPanel } from "../megumin-panel-context";
import { takePendingMeguminDevEngine } from "../megumin-devmode-open";
import {
  MEGUMIN_INPUT_CLASS,
  MeguminButton,
  MeguminHint,
  MeguminRow,
  MeguminSection,
  MeguminSelect,
} from "../MeguminControls";

// ── What the server sends ───────────────────────────────────────────────────

interface DevSlot {
  key: string | null;
  trigger: string;
  label: string;
  hint?: string;
  scope: "engine" | "shared" | "auto";
  group: string;
  carrier?: string | null;
  overridable?: boolean;
  hidden?: boolean;
  structural?: boolean;
  deprecated?: boolean;
  where?: string | null;
  gate: { label: string | null; where: string | null } | null;
  /** Its switch is on, so its text reaches the prompt (data/slots.js meguminSlotIsLive). */
  live: boolean;
  /** The shipped text for this profile (the slot's fallback). */
  builtin: string;
  presets: Array<{ label: string; value: string }>;
  picker: { label: string; options: Array<{ label: string; value: string }> } | null;
}

interface SkeletonCard {
  id: string;
  name: string;
  role: string;
  marker?: boolean;
  content: string;
}

interface DevModeData {
  slots: DevSlot[];
  skeleton: SkeletonCard[];
  skeletonV11?: SkeletonCard[];
  cacheFriendly?: boolean;
}

interface CustomModule {
  id: string;
  attachPoint: string;
  name: string;
  location: "settings" | "addons";
  content: string;
}

type ModeData = Record<string, any> & { id: string; label: string; customToggles?: CustomModule[] };

function devPath(scope: MeguminScope) {
  return scope.kind === "chat" ? `/megumin/chats/${scope.chatId}/devmode` : "/megumin/global/devmode";
}

function useDevModeData(scope: MeguminScope, signature: string) {
  return useQuery<DevModeData>({
    queryKey: [...meguminKeys.all, "devmode", scope.kind === "chat" ? scope.chatId : "global", signature],
    queryFn: () => api.get<DevModeData>(devPath(scope)),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

// ── The editing session ─────────────────────────────────────────────────────
//
// Module-level, as in devmode.js: the engine being edited survives a trip to an
// add-on page, and a trip to another tab of the panel, without losing its edits.

type DevView =
  { name: "landing" } | { name: "addons" } | { name: "addon"; key: string } | { name: "engines" } | { name: "editor" };

interface DevSession {
  view: DevView;
  engine: { modeData: ModeData; isNew: boolean; returnTo: "landing" | "preset" } | null;
  dirty: boolean;
  expanded: string[];
  showAuto: boolean;
}

let devSession: DevSession = { view: { name: "landing" }, engine: null, dirty: false, expanded: [], showAuto: false };

// ── Pure helpers (devmode.js, data/slots.js, core/sharedFragments.js) ───────

const SLOT_TAG = /\[\[[^\]\n]+\]\]/g;

/** Slots some other slot carries into the prompt (devmode.js CARRIERS). */
const CARRIER_TAGS: Record<string, string> = { blocks: "[[blocks]]", think: "[[THINK]]" };

/** Megumin's tab titles (as gates and slots name them) → this panel's tab ids. */
const WHERE_TAB: Record<string, string> = {
  "Preset & Thinking": "preset",
  Blocks: "blocks",
  "Add-ons": "addons",
  "Language & Add-ons": "addons",
  "Story Plan": "director",
  "Story Director": "director",
  "Writing Style": "style",
  "Banned Phrases": "banlist",
  Images: "images",
  "NPC Bank": "npc",
  Memory: "memory",
  Persona: "persona",
};

function onelineOf(value: unknown) {
  const flat = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!flat) return "";
  return flat.length > 110 ? `${flat.slice(0, 110)}…` : flat;
}

function resolveSlot(slot: DevSlot, modeData: ModeData | null, shared: Record<string, any>) {
  if (!slot.key) return { value: "", source: "builtin" as const };
  const fromEngine = modeData?.[slot.key];
  if (typeof fromEngine === "string" && fromEngine.trim() !== "")
    return { value: fromEngine, source: "engine" as const };
  const fromShared = String(shared[slot.key] || "");
  if (fromShared.trim() !== "") return { value: fromShared, source: "shared" as const };
  return { value: slot.builtin || "", source: "builtin" as const };
}

function engineShadowsShared(slot: DevSlot, modeData: ModeData | null) {
  if (!slot.key || !modeData || slot.scope !== "shared") return false;
  const v = modeData[slot.key];
  return typeof v === "string" && v.trim() !== "";
}

type StatusKind = "off" | "auto" | "custom" | "default" | "empty";

function statusOf(slot: DevSlot, modeData: ModeData | null, shared: Record<string, any>): StatusKind {
  if (!slot.live) return "off";
  if (slot.scope === "auto" && !slot.overridable) return "auto";
  const { source, value } = resolveSlot(slot, modeData, shared);
  if (source !== "builtin") return "custom";
  return value ? "default" : "empty";
}

const STATUS_CLASS: Record<StatusKind, string> = {
  off: "bg-[var(--muted)]/60 text-[var(--muted-foreground)]",
  auto: "bg-violet-500/15 text-violet-500",
  custom: "bg-emerald-500/15 text-emerald-500",
  default: "bg-[var(--secondary)] text-[var(--marinara-chat-chrome-panel-muted)]",
  empty: "bg-amber-500/15 text-amber-600",
};

function moduleTrigger(attachPoint: string | undefined) {
  if (!attachPoint) return null;
  if (attachPoint.startsWith("[[")) return attachPoint;
  return `[[prompt${String(attachPoint).replace(/^p/, "")}]]`;
}

function addonSlotsOf(slots: DevSlot[]) {
  return slots.filter((s) => !s.hidden && (s.scope === "shared" || (s.scope === "auto" && s.overridable)));
}

function engineSlotsOf(slots: DevSlot[]) {
  return slots.filter((s) => !s.hidden && s.scope === "engine");
}

function segmentCard(content: string) {
  const out: Array<{ type: "text"; text: string } | { type: "slot"; trigger: string }> = [];
  const re = new RegExp(SLOT_TAG.source, "g");
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (m.index > last) out.push({ type: "text", text: content.slice(last, m.index) });
    out.push({ type: "slot", trigger: m[0] });
    last = m.index + m[0].length;
  }
  if (last < content.length) out.push({ type: "text", text: content.slice(last) });
  return out;
}

/** Where a slot's tag sits in the preset (devmode.js findPlacement). Every card counts, on or off. */
function findPlacement(skeleton: SkeletonCard[], slot: DevSlot) {
  const trigger = slot.carrier && CARRIER_TAGS[slot.carrier] ? CARRIER_TAGS[slot.carrier]! : slot.trigger;
  for (let i = 0; i < skeleton.length; i++) {
    const card = skeleton[i]!;
    if (card.marker) continue;
    const tags: string[] = Array.from(card.content.match(SLOT_TAG) ?? []);
    const idx = tags.indexOf(trigger);
    if (idx > -1) return { card, cardIndex: i, tags, idx };
  }
  return null;
}

function downloadJson(name: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/\s+/g, "_") || "engine"}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── The tab ─────────────────────────────────────────────────────────────────

export function DevModeTab() {
  const { t } = useTranslation();
  const panel = useMeguminPanel();
  const { scope, view, profile, catalog, saveGlobal, openTab } = panel;
  const [session, setSessionState] = useState<DevSession>(() => devSession);
  const [cloning, setCloning] = useState<string | null>(null);

  const setSession = (change: (s: DevSession) => DevSession) =>
    setSessionState((prev) => {
      const next = change(prev);
      devSession = next;
      return next;
    });

  // What the slots' gates and built-in texts read; a change re-asks the server.
  const signature = JSON.stringify([
    profile.mode,
    profile.model,
    profile.cotEnabled,
    profile.addons,
    profile.blocks,
    profile.storyPlan?.enabled,
    profile.dnRatio?.enabled,
    profile.onomatopoeia?.enabled,
    profile.banListBuiltIn,
  ]);
  const data = useDevModeData(scope, signature);
  const shared = (view.sharedFragments ?? {}) as Record<string, any>;
  const customModes = (view.customModes ?? []) as ModeData[];

  const setShared = (key: string, value: string) => {
    const next = { ...shared };
    if (!value || value.trim() === "") delete next[key];
    else next[key] = value;
    saveGlobal({ sharedFragments: next });
  };

  const go = (next: DevView) => setSession((s) => ({ ...s, view: next }));

  const openEditor = (modeData: ModeData, isNew: boolean, returnTo: "landing" | "preset") =>
    setSession((s) => ({
      ...s,
      view: { name: "editor" },
      engine: { modeData: { ...modeData, customToggles: modeData.customToggles ?? [] }, isNew, returnTo },
      dirty: false,
      expanded: [],
    }));

  /** A shipped engine copied for editing (devmode.js renderDevMode("editor", coreId)). */
  const cloneEngine = async (engineId: string, returnTo: "landing" | "preset") => {
    setCloning(engineId);
    try {
      const base = scope.kind === "chat" ? `/megumin/chats/${scope.chatId}` : "/megumin/global";
      let clone: ModeData;
      try {
        clone = await api.get<ModeData>(`${base}/devmode/clone/${encodeURIComponent(engineId)}`);
      } catch {
        // Without the server's copy, copy the engine as shipped (its Chain of Thought stays the CoT tab's).
        const core = await api.get<ModeData>(`/megumin/engines/${encodeURIComponent(engineId)}`);
        clone = {
          ...structuredClone(core),
          id: `custom_${Date.now()}`,
          isCoreClone: true,
          isV7: String(core.id).startsWith("v7"),
          parentId: core.id,
        };
      }
      const coreLabel = (catalog.engines as Array<Record<string, any>>).find((e) => e.id === engineId)?.label;
      clone.label = t("megumin.devmode.engines.copyName", { name: coreLabel ?? clone.label ?? engineId });
      openEditor(clone, true, returnTo);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setCloning(null);
    }
  };

  // The Preset tab asked for an engine.
  useEffect(() => {
    const id = takePendingMeguminDevEngine();
    if (!id) return;
    const own = customModes.find((m) => m.id === id);
    if (own) openEditor(structuredClone(own), false, "preset");
    else void cloneEngine(id, "preset");
    // Once, when the tab opens with a request waiting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!data.data) {
    return data.isError ? (
      <MeguminHint tone="warning">{t("megumin.devmode.loadFailed")}</MeguminHint>
    ) : (
      <div className="flex items-center justify-center py-10 text-[var(--muted-foreground)]">
        <Loader2 size="1rem" className="animate-spin" />
      </div>
    );
  }

  const dev = data.data;
  const ctx: DevCtx = {
    dev,
    shared,
    setShared,
    session,
    setSession,
    go,
    openTab,
  };

  const v = session.view;
  if (v.name === "addons") return <AddonsList ctx={ctx} />;
  if (v.name === "addon") return <AddonPage ctx={ctx} slotKey={v.key} />;
  if (v.name === "engines" || (v.name === "editor" && !session.engine)) {
    return (
      <EnginesList
        ctx={ctx}
        customModes={customModes}
        builtins={(catalog.engines as Array<Record<string, any>>).filter((m) => m.devLegacy !== true)}
        cloning={cloning}
        onClone={(id) => void cloneEngine(id, "landing")}
        onNew={() =>
          openEditor(
            {
              id: `custom_${Date.now()}`,
              label: t("megumin.devmode.engines.newName"),
              isCoreClone: false,
              isV7: false,
              p1: "",
              p3: "",
              p4: "",
              p5: "",
              p6: "",
              cot: "",
              prefill: "",
              customToggles: [],
            },
            true,
            "landing",
          )
        }
        onEdit={(m) => openEditor(structuredClone(m), false, "landing")}
        saveModes={(next) => saveGlobal({ customModes: next })}
      />
    );
  }
  if (v.name === "editor" && session.engine) {
    return <EngineEditor ctx={ctx} customModes={customModes} saveModes={(next) => saveGlobal({ customModes: next })} />;
  }
  return <Landing ctx={ctx} customCount={customModes.length} />;
}

interface DevCtx {
  dev: DevModeData;
  shared: Record<string, any>;
  setShared: (key: string, value: string) => void;
  session: DevSession;
  setSession: (change: (s: DevSession) => DevSession) => void;
  go: (view: DevView) => void;
  openTab: (tabId: string) => void;
}

// ── Shared chrome ───────────────────────────────────────────────────────────

function Subtitle({ children }: { children: ReactNode }) {
  return (
    <p className="-mt-1 text-[0.625rem] leading-relaxed text-[var(--marinara-chat-chrome-panel-muted)]">{children}</p>
  );
}

function BackBar({ title, onBack, backLabel }: { title: string; onBack: () => void; backLabel?: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2">
      <MeguminButton icon={<ArrowLeft size="0.75rem" />} onClick={onBack}>
        {backLabel ?? t("megumin.devmode.back")}
      </MeguminButton>
      <div className="min-w-0 truncate text-xs font-semibold text-[var(--marinara-chat-chrome-panel-title)]">
        {title}
      </div>
    </div>
  );
}

function Note({
  tone,
  icon,
  children,
  action,
}: {
  tone: "off" | "shared" | "auto" | "warn";
  icon: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-md border px-2.5 py-2 text-[0.625rem] leading-relaxed",
        tone === "off" && "border-[var(--border)] bg-[var(--muted)]/30 text-[var(--muted-foreground)]",
        tone === "shared" && "border-emerald-500/30 bg-emerald-500/5 text-[var(--foreground)]",
        tone === "auto" && "border-violet-500/30 bg-violet-500/5 text-[var(--foreground)]",
        tone === "warn" && "border-amber-500/40 bg-amber-500/10 text-[var(--foreground)]",
      )}
    >
      <div className="flex items-start gap-1.5">
        <span className="mt-0.5 shrink-0">{icon}</span>
        <span className="min-w-0">{children}</span>
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

function CacheFriendlyNote() {
  const { t } = useTranslation();
  return (
    <Note tone="warn" icon={<TriangleAlert size="0.75rem" />}>
      <b>{t("megumin.devmode.cacheFriendly.title")}</b> {t("megumin.devmode.cacheFriendly.text")}
    </Note>
  );
}

function StatusBadge({ kind }: { kind: StatusKind }) {
  const { t } = useTranslation();
  return (
    <span className={cn("shrink-0 rounded px-1 py-px text-[0.5625rem] font-medium", STATUS_CLASS[kind])}>
      {t(`megumin.devmode.status.${kind}`)}
    </span>
  );
}

/** A tab Megumin names (a gate's or slot's `where`), with a button to it when this panel has it. */
function WhereLink({ where, openTab }: { where: string; openTab: (id: string) => void }) {
  const { t } = useTranslation();
  const tabId = WHERE_TAB[where];
  if (!tabId) return null;
  return (
    <MeguminButton icon={<ArrowRight size="0.75rem" />} onClick={() => openTab(tabId)}>
      {t("megumin.devmode.openTab", { tab: t(`megumin.tabs.${tabId}.title`) })}
    </MeguminButton>
  );
}

// ── Landing: the two doors ──────────────────────────────────────────────────

function Landing({ ctx, customCount }: { ctx: DevCtx; customCount: number }) {
  const { t } = useTranslation();
  const addonSlots = addonSlotsOf(ctx.dev.slots);
  const changed = addonSlots.filter((s) => s.key && String(ctx.shared[s.key] || "").trim() !== "").length;

  // Landing clears the session, as devmode.js renderLanding does.
  useEffect(() => {
    if (ctx.session.engine || ctx.session.dirty) {
      ctx.setSession((s) => ({ ...s, engine: null, dirty: false, expanded: [] }));
    }
    // Only on arriving here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const door = (
    id: "addons" | "engines",
    icon: ReactNode,
    title: string,
    desc: ReactNode,
    meta: string,
    tone: string,
  ) => (
    <button
      type="button"
      onClick={() => ctx.go({ name: id })}
      className={cn(
        "flex flex-col gap-1.5 rounded-lg border p-3 text-left transition-colors hover:bg-[var(--accent)]",
        tone,
      )}
    >
      <span className="flex items-center gap-2 text-sm font-semibold">
        {icon}
        {title}
      </span>
      <span className="text-[0.625rem] leading-relaxed text-[var(--marinara-chat-chrome-panel-muted)]">{desc}</span>
      <span className="flex items-center justify-between text-[0.625rem]">
        <span className="text-[var(--muted-foreground)]">{meta}</span>
        <span className="inline-flex items-center gap-1 font-medium">
          {t("megumin.devmode.landing.open")}
          <ArrowRight size="0.625rem" />
        </span>
      </span>
    </button>
  );

  return (
    <>
      <Subtitle>{t("megumin.devmode.landing.sub")}</Subtitle>
      {ctx.dev.cacheFriendly ? <CacheFriendlyNote /> : null}
      <div className="flex flex-col gap-2">
        {door(
          "addons",
          <Puzzle size="1rem" className="text-emerald-500" />,
          t("megumin.devmode.landing.addonsTitle"),
          <>
            {t("megumin.devmode.landing.addonsDesc")} <b>{t("megumin.devmode.landing.addonsDescStrong")}</b>
          </>,
          changed
            ? t("megumin.devmode.landing.addonsChanged", { count: changed })
            : t("megumin.devmode.landing.addonsTotal", { count: addonSlots.length }),
          "border-emerald-500/30",
        )}
        {door(
          "engines",
          <Cpu size="1rem" className="text-amber-500" />,
          t("megumin.devmode.landing.enginesTitle"),
          t("megumin.devmode.landing.enginesDesc"),
          customCount
            ? t("megumin.devmode.landing.enginesOwn", { count: customCount })
            : t("megumin.devmode.landing.enginesNone"),
          "border-amber-500/30",
        )}
      </div>
      <MeguminHint>
        {t("megumin.devmode.landing.hint")} <b>{t("megumin.devmode.landing.addonsTitle")}</b>
        {t("megumin.devmode.landing.hintEnd")}
      </MeguminHint>
    </>
  );
}

// ── The add-on list ─────────────────────────────────────────────────────────

function AddonsList({ ctx }: { ctx: DevCtx }) {
  const { t } = useTranslation();
  const { catalog } = useMeguminPanel();
  const slots = addonSlotsOf(ctx.dev.slots);
  const modeData = ctx.session.engine?.modeData ?? null;
  const groups = (catalog.slotGroups as Array<{ id: string; label: string; hint?: string }> | undefined) ?? [];

  return (
    <>
      <Subtitle>{t("megumin.devmode.addons.sub")}</Subtitle>
      <BackBar title={t("megumin.devmode.landing.addonsTitle")} onBack={() => ctx.go({ name: "landing" })} />
      {groups.map((group) => {
        const mine = slots.filter((s) => s.group === group.id);
        if (!mine.length) return null;
        return (
          <MeguminSection key={group.id} title={group.label} description={group.hint}>
            {mine.map((slot) => {
              const status = statusOf(slot, modeData, ctx.shared);
              const { value } = resolveSlot(slot, modeData, ctx.shared);
              return (
                <button
                  key={slot.trigger}
                  type="button"
                  onClick={() => slot.key && ctx.go({ name: "addon", key: slot.key })}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-md border px-2.5 py-2 text-left transition-colors hover:bg-[var(--accent)]",
                    status === "custom" ? "border-emerald-500/40" : "border-[var(--border)]/60",
                    status === "off" && "opacity-60",
                  )}
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-medium">{slot.label}</span>
                      <StatusBadge kind={status} />
                      {status === "custom" ? (
                        <span className="text-[0.5625rem] text-emerald-500">
                          {t("megumin.devmode.addons.yourVersion")}
                        </span>
                      ) : null}
                    </span>
                    {slot.hint ? (
                      <span className="text-[0.625rem] leading-snug text-[var(--marinara-chat-chrome-panel-muted)]">
                        {slot.hint}
                      </span>
                    ) : null}
                    {value ? (
                      <span className="truncate font-mono text-[0.5625rem] text-[var(--muted-foreground)]">
                        {onelineOf(value)}
                      </span>
                    ) : null}
                  </span>
                  <ChevronRight size="0.75rem" className="mt-0.5 shrink-0 text-[var(--muted-foreground)]" />
                </button>
              );
            })}
          </MeguminSection>
        );
      })}
    </>
  );
}

// ── One add-on ──────────────────────────────────────────────────────────────

function AddonPage({ ctx, slotKey }: { ctx: DevCtx; slotKey: string }) {
  const { t } = useTranslation();
  const slot = ctx.dev.slots.find((s) => s.key === slotKey);
  const engine = ctx.session.engine;
  const cameFromEngine = !!engine;
  const back = () => ctx.go(cameFromEngine ? { name: "editor" } : { name: "addons" });

  if (!slot) {
    return (
      <>
        <BackBar title={t("megumin.devmode.landing.addonsTitle")} onBack={back} />
        <MeguminHint>{t("megumin.devmode.addon.missing")}</MeguminHint>
      </>
    );
  }

  return (
    <>
      <Subtitle>
        {cameFromEngine
          ? t("megumin.devmode.addon.subFromEngine", { engine: engine.modeData.label })
          : t("megumin.devmode.addon.sub")}
      </Subtitle>
      <BackBar
        title={slot.label}
        onBack={back}
        backLabel={cameFromEngine ? t("megumin.devmode.addon.backToEngine") : t("megumin.devmode.addon.allAddons")}
      />
      <SlotEditor
        ctx={ctx}
        slot={slot}
        modeData={engine?.modeData ?? null}
        onEngineChange={(key, value) =>
          ctx.setSession((s) =>
            s.engine
              ? { ...s, engine: { ...s.engine, modeData: { ...s.engine.modeData, [key]: value } }, dirty: true }
              : s,
          )
        }
        onUnshadow={(key) =>
          ctx.setSession((s) => {
            if (!s.engine) return s;
            const modeData = { ...s.engine.modeData };
            delete modeData[key];
            return { ...s, engine: { ...s.engine, modeData }, dirty: true };
          })
        }
      />
      <MeguminSection title={t("megumin.devmode.placement.title")} icon={<MapPin size="0.875rem" />}>
        <PlacementText dev={ctx.dev} slot={slot} />
        {ctx.dev.cacheFriendly ? (
          <Note tone="auto" icon={<CircleHelp size="0.75rem" />}>
            {t("megumin.devmode.cacheFriendly.positions")}
          </Note>
        ) : null}
        <PlacementMap dev={ctx.dev} slot={slot} />
      </MeguminSection>
    </>
  );
}

/** "Where does this actually go?" in a sentence or three (devmode.js describePlacement). */
function PlacementText({ dev, slot }: { dev: DevModeData; slot: DevSlot }) {
  const { t } = useTranslation();
  const skeleton = dev.skeleton;
  const historyIndex = skeleton.findIndex((c) => c.id === "chatHistory");
  const p = findPlacement(skeleton, slot);
  const lines: string[] = [];
  const carried = slot.carrier && CARRIER_TAGS[slot.carrier] ? slot.carrier : null;

  if (carried) {
    lines.push(t(`megumin.devmode.placement.carrier.${carried}`));
    if (p) {
      lines.push(
        historyIndex > -1 && p.cardIndex > historyIndex
          ? t("megumin.devmode.placement.carriedInAfter", { card: p.card.name })
          : t("megumin.devmode.placement.carriedIn", { card: p.card.name }),
      );
    }
  } else if (!p) {
    lines.push(t("megumin.devmode.placement.wherever", { trigger: slot.trigger }));
  } else {
    lines.push(t("megumin.devmode.placement.sentIn", { card: p.card.name }));
    if (historyIndex > -1) {
      lines.push(
        p.cardIndex > historyIndex
          ? t("megumin.devmode.placement.afterHistory")
          : t("megumin.devmode.placement.beforeHistory"),
      );
    }
    const before = p.tags[p.idx - 1];
    const after = p.tags[p.idx + 1];
    if (before && after) lines.push(t("megumin.devmode.placement.between", { before, after }));
    else if (before) lines.push(t("megumin.devmode.placement.after", { before }));
    else if (after) lines.push(t("megumin.devmode.placement.before", { after }));
  }
  return <p className="text-[0.6875rem] leading-relaxed">{lines.join(" ")}</p>;
}

/** The outgoing messages, with this slot's position marked (devmode.js renderPlacementMap). */
function PlacementMap({ dev, slot }: { dev: DevModeData; slot: DevSlot }) {
  const p = findPlacement(dev.skeleton, slot);
  const ownTag = slot.carrier && CARRIER_TAGS[slot.carrier] ? CARRIER_TAGS[slot.carrier]! : slot.trigger;
  const byTrigger = new Map(dev.slots.map((s) => [s.trigger, s]));
  return (
    <div className="flex flex-col gap-0.5">
      {dev.skeleton.map((card, i) => {
        const hit = !!p && i === p.cardIndex;
        return (
          <div key={`${card.id}-${i}`} className="flex flex-col gap-1">
            <div
              className={cn(
                "flex items-center justify-between gap-2 rounded px-2 py-1 text-[0.625rem]",
                hit
                  ? "bg-[var(--primary)]/15 font-semibold ring-1 ring-[var(--primary)]/40"
                  : "bg-[var(--background)]/40",
                card.marker && "italic text-[var(--muted-foreground)]",
              )}
            >
              <span className="min-w-0 truncate">{card.name}</span>
              <span className="shrink-0 font-mono text-[0.5625rem] text-[var(--muted-foreground)]">{card.role}</span>
            </div>
            {hit && p ? (
              <div className="flex flex-wrap gap-1 pl-3">
                {p.tags.map((tag, ti) => {
                  const target = tag === ownTag || ti === p.idx;
                  return (
                    <span
                      key={`${tag}-${ti}`}
                      className={cn(
                        "rounded px-1 py-px text-[0.5625rem]",
                        target
                          ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                          : "bg-[var(--secondary)] text-[var(--muted-foreground)]",
                      )}
                    >
                      {byTrigger.get(tag)?.label ?? tag}
                    </span>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

// ── The editing surface for one slot (devmode.js renderSlotEditor) ──────────

function SlotEditor({
  ctx,
  slot,
  modeData,
  onEngineChange,
  onUnshadow,
}: {
  ctx: DevCtx;
  slot: DevSlot;
  modeData: ModeData | null;
  onEngineChange: (key: string, value: string) => void;
  onUnshadow: (key: string) => void;
}) {
  const { t } = useTranslation();
  const { value, source } = resolveSlot(slot, modeData, ctx.shared);
  const builtin = slot.builtin || "";
  const shadowed = engineShadowsShared(slot, modeData);
  const isSharedWrite = slot.scope === "shared" || (slot.scope === "auto" && !!slot.overridable);
  // The box opens holding the built-in text, not empty: editing it is why the reader is here.
  const editable = source === "builtin" ? builtin : value;
  const [draft, setDraft] = useState(editable);
  const editing = useRef(false);

  useEffect(() => {
    if (!editing.current) setDraft(editable);
  }, [editable]);

  const commit = (raw: string) => {
    if (!slot.key) return;
    // Identical to the shipped text means "no override": storing it would freeze today's wording.
    const next = builtin && raw.trim() === builtin.trim() ? "" : raw;
    if (isSharedWrite) {
      const had = String(ctx.shared[slot.key] || "");
      if (had === next || (had.trim() === "" && next.trim() === "")) return;
      ctx.setShared(slot.key, next);
      if (next) toast.success(t("megumin.devmode.slot.savedShared", { label: slot.label }));
      else if (had.trim() !== "") toast.info(t("megumin.devmode.slot.backToBuiltin", { label: slot.label }));
    } else if (modeData) {
      if (String(modeData[slot.key] ?? "") === next) return;
      onEngineChange(slot.key, next);
    }
  };

  const setAndCommit = (next: string) => {
    editing.current = false;
    setDraft(next);
    commit(next);
  };

  const presets = slot.presets.length
    ? slot.presets
    : builtin
      ? [{ label: t("megumin.devmode.slot.builtinDefault"), value: builtin }]
      : [];
  const gateLabel = slot.gate?.label || slot.label;
  const gateWhere = slot.gate?.where ?? "";

  return (
    <div className="flex flex-col gap-2">
      {slot.hint ? <MeguminHint>{slot.hint}</MeguminHint> : null}

      {!slot.live && slot.gate ? (
        <Note
          tone="off"
          icon={<CircleHelp size="0.75rem" />}
          action={gateWhere ? <WhereLink where={gateWhere} openTab={ctx.openTab} /> : undefined}
        >
          {t("megumin.devmode.slot.offNote", { label: gateLabel, where: gateWhere })}
        </Note>
      ) : null}

      {slot.scope === "shared" ? (
        <Note tone="shared" icon={<Globe size="0.75rem" />}>
          <b>{t("megumin.devmode.slot.sharedTitle")}</b> {t("megumin.devmode.slot.sharedText")}
        </Note>
      ) : null}

      {slot.scope === "auto" && slot.overridable ? (
        <Note
          tone="auto"
          icon={<Wand2 size="0.75rem" />}
          action={slot.where ? <WhereLink where={slot.where} openTab={ctx.openTab} /> : undefined}
        >
          {slot.where
            ? t("megumin.devmode.slot.autoNoteWhere", { where: slot.where })
            : t("megumin.devmode.slot.autoNote")}
        </Note>
      ) : null}

      {shadowed ? (
        <Note
          tone="warn"
          icon={<TriangleAlert size="0.75rem" />}
          action={
            <MeguminButton onClick={() => slot.key && onUnshadow(slot.key)}>
              {t("megumin.devmode.slot.useShared")}
            </MeguminButton>
          }
        >
          {t("megumin.devmode.slot.shadowed")}
        </Note>
      ) : null}

      <textarea
        className={cn(MEGUMIN_INPUT_CLASS, "min-h-40 resize-y font-mono text-[0.6875rem] leading-relaxed")}
        spellCheck={false}
        rows={10}
        value={draft}
        placeholder={t("megumin.devmode.slot.placeholder")}
        onFocus={() => {
          editing.current = true;
        }}
        onChange={(e) => {
          setDraft(e.target.value);
          // An engine's own text is part of the unsaved engine from the first key.
          if (!isSharedWrite && modeData && slot.key) commit(e.target.value);
        }}
        onBlur={(e) => {
          editing.current = false;
          commit(e.target.value);
        }}
      />

      {slot.picker && slot.picker.options.length ? (
        <MeguminSelect
          label={slot.picker.label}
          value=""
          onChange={(index) => {
            if (index === "") return;
            const option = slot.picker?.options[Number(index)];
            if (option) setAndCommit(option.value);
          }}
          options={[
            { value: "", label: t("megumin.devmode.slot.pickerChoose") },
            ...slot.picker.options.map((o, i) => ({ value: String(i), label: o.label })),
          ]}
        />
      ) : null}

      {presets.length || (source !== "builtin" && builtin) || builtin ? (
        <MeguminRow>
          {presets.map((preset) => (
            <MeguminButton key={preset.label} onClick={() => setAndCommit(preset.value)}>
              {preset.label}
            </MeguminButton>
          ))}
          {source !== "builtin" && builtin ? (
            <MeguminButton icon={<RotateCcw size="0.75rem" />} onClick={() => setAndCommit(builtin)}>
              {t("megumin.devmode.slot.reset")}
            </MeguminButton>
          ) : null}
          {builtin ? (
            <MeguminButton icon={<Eraser size="0.75rem" />} onClick={() => setAndCommit("")}>
              {t("megumin.devmode.slot.clear")}
            </MeguminButton>
          ) : null}
        </MeguminRow>
      ) : null}
    </div>
  );
}

// ── The engine list ─────────────────────────────────────────────────────────

function EnginesList({
  ctx,
  customModes,
  builtins,
  cloning,
  onClone,
  onNew,
  onEdit,
  saveModes,
}: {
  ctx: DevCtx;
  customModes: ModeData[];
  builtins: Array<Record<string, any>>;
  cloning: string | null;
  onClone: (id: string) => void;
  onNew: () => void;
  onEdit: (m: ModeData) => void;
  saveModes: (next: ModeData[]) => void;
}) {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);

  // The list clears an open engine (devmode.js renderEnginesList).
  useEffect(() => {
    if (ctx.session.engine || ctx.session.dirty) ctx.setSession((s) => ({ ...s, engine: null, dirty: false }));
    // Only on arriving here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const importFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(String(reader.result)) as ModeData;
        if (!imported || typeof imported !== "object" || Array.isArray(imported)) throw new Error("not an engine");
        imported.id = `custom_${Date.now()}`;
        saveModes([...customModes, imported]);
        toast.success(t("megumin.devmode.engines.imported", { name: imported.label ?? imported.id }));
      } catch {
        toast.error(t("megumin.devmode.engines.invalidJson"));
      }
    };
    reader.readAsText(file);
  };

  const remove = async (m: ModeData) => {
    const ok = await showConfirmDialog({
      title: t("megumin.devmode.engines.deleteTitle"),
      message: t("megumin.devmode.engines.deleteMessage", { name: m.label }),
      confirmLabel: t("megumin.devmode.engines.deleteConfirm"),
      cancelLabel: t("megumin.devmode.engines.keep"),
      tone: "destructive",
    });
    if (!ok) return;
    saveModes(customModes.filter((x) => x.id !== m.id));
  };

  return (
    <>
      <Subtitle>{t("megumin.devmode.engines.sub")}</Subtitle>
      <BackBar title={t("megumin.devmode.landing.enginesTitle")} onBack={() => ctx.go({ name: "landing" })} />
      <MeguminRow>
        <MeguminButton variant="primary" icon={<Wand2 size="0.75rem" />} onClick={onNew}>
          {t("megumin.devmode.engines.createBlank")}
        </MeguminButton>
        <MeguminButton icon={<FileUp size="0.75rem" />} onClick={() => fileRef.current?.click()}>
          {t("megumin.devmode.engines.import")}
        </MeguminButton>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) importFile(file);
            e.target.value = "";
          }}
        />
      </MeguminRow>

      <MeguminSection title={t("megumin.devmode.engines.yours")} icon={<Cpu size="0.875rem" />}>
        {!customModes.length ? <MeguminHint>{t("megumin.devmode.engines.noneYet")}</MeguminHint> : null}
        {customModes.map((m) => (
          <div key={m.id} className="flex flex-col gap-1.5 rounded-md border border-emerald-500/30 px-2.5 py-2">
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-emerald-500">{m.label}</div>
              <div className="text-[0.625rem] text-[var(--muted-foreground)]">
                {m.parentId
                  ? t("megumin.devmode.engines.copyOf", { id: m.parentId })
                  : t("megumin.devmode.engines.ownEngine")}
              </div>
            </div>
            <MeguminRow>
              <button
                type="button"
                title={t("megumin.devmode.engines.export")}
                aria-label={t("megumin.devmode.engines.export")}
                className="mari-chrome-control mari-chrome-control--small mari-chrome-control--icon"
                onClick={() => downloadJson(String(m.label || "engine"), m)}
              >
                <Download size="0.75rem" />
              </button>
              <MeguminButton variant="primary" icon={<Pencil size="0.75rem" />} onClick={() => onEdit(m)}>
                {t("megumin.devmode.engines.edit")}
              </MeguminButton>
              <button
                type="button"
                title={t("megumin.devmode.engines.delete")}
                aria-label={t("megumin.devmode.engines.delete")}
                className="mari-chrome-control mari-chrome-control--small mari-chrome-control--icon mari-chrome-control--danger"
                onClick={() => void remove(m)}
              >
                <Trash2 size="0.75rem" className="text-[var(--destructive)]" />
              </button>
            </MeguminRow>
          </div>
        ))}
      </MeguminSection>

      <MeguminSection title={t("megumin.devmode.engines.builtins")}>
        {builtins.map((m) => (
          <div key={m.id} className="flex items-center gap-2 rounded-md border border-[var(--border)]/60 px-2.5 py-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium">{m.label}</div>
              <div className="text-[0.625rem] text-[var(--muted-foreground)]">
                {t("megumin.devmode.engines.builtinDesc")}
              </div>
            </div>
            <MeguminButton pending={cloning === m.id} disabled={!!cloning} onClick={() => onClone(String(m.id))}>
              {t("megumin.devmode.engines.makeCopy")}
            </MeguminButton>
          </div>
        ))}
      </MeguminSection>
    </>
  );
}

// ── The engine editor: the document ─────────────────────────────────────────

function EngineEditor({
  ctx,
  customModes,
  saveModes,
}: {
  ctx: DevCtx;
  customModes: ModeData[];
  saveModes: (next: ModeData[]) => void;
}) {
  const { t } = useTranslation();
  const engine = ctx.session.engine!;
  const { modeData, isNew, returnTo } = engine;
  const slots = ctx.dev.slots;
  const byTrigger = useMemo(() => new Map(slots.map((s) => [s.trigger, s])), [slots]);
  const skeleton = modeData.turnFrame === "v11" && ctx.dev.skeletonV11?.length ? ctx.dev.skeletonV11 : ctx.dev.skeleton;

  const setMode = (change: (m: ModeData) => ModeData) =>
    ctx.setSession((s) =>
      s.engine ? { ...s, engine: { ...s.engine, modeData: change(s.engine.modeData) }, dirty: true } : s,
    );
  const setSlot = (key: string, value: string) => setMode((m) => ({ ...m, [key]: value }));
  const toggleExpanded = (trigger: string) =>
    ctx.setSession((s) => ({
      ...s,
      expanded: s.expanded.includes(trigger) ? s.expanded.filter((x) => x !== trigger) : [...s.expanded, trigger],
    }));

  const leave = () => {
    ctx.setSession((s) => ({
      ...s,
      engine: null,
      dirty: false,
      expanded: [],
      view: returnTo === "preset" ? { name: "landing" } : { name: "engines" },
    }));
    if (returnTo === "preset") ctx.openTab("preset");
  };

  const back = async () => {
    if (ctx.session.dirty) {
      const ok = await showConfirmDialog({
        title: t("megumin.devmode.editor.unsavedTitle"),
        message: t("megumin.devmode.editor.unsavedMessage"),
        confirmLabel: t("megumin.devmode.editor.discard"),
        cancelLabel: t("megumin.devmode.editor.stay"),
        tone: "destructive",
      });
      if (!ok) return;
    }
    leave();
  };

  const save = () => {
    const toSave: ModeData = { ...modeData, label: modeData.label || t("megumin.devmode.engines.newName") };
    const all = [...customModes];
    const i = all.findIndex((m) => m.id === toSave.id);
    if (isNew && i === -1) all.push(toSave);
    else if (i > -1) all[i] = toSave;
    else all.push(toSave);
    saveModes(all);
    toast.success(t("megumin.devmode.editor.saved"));
    leave();
  };

  const drawn = new Set<string>();

  const engineSlot = (slot: DevSlot) => (
    <EngineSlot
      key={slot.trigger}
      ctx={ctx}
      slot={slot}
      modeData={modeData}
      open={ctx.session.expanded.includes(slot.trigger)}
      onToggle={() => toggleExpanded(slot.trigger)}
      onChange={setSlot}
      onUnshadow={(key) =>
        setMode((m) => {
          const next = { ...m };
          delete next[key];
          return next;
        })
      }
    />
  );

  const cards = skeleton.map((card, ci) => {
    if (card.marker) {
      return (
        <div
          key={`${card.id}-${ci}`}
          className="flex items-center justify-between gap-2 rounded-md border border-dashed border-[var(--border)] px-2.5 py-1.5 text-[0.625rem] text-[var(--muted-foreground)]"
        >
          <span className="min-w-0 truncate font-medium">{card.name}</span>
          <span className="shrink-0">{t("megumin.devmode.editor.hostFills")}</span>
        </div>
      );
    }
    const parts: ReactNode[] = [];
    segmentCard(card.content).forEach((seg, si) => {
      if (seg.type === "text") {
        if (!seg.text.trim()) return;
        parts.push(
          <pre
            key={`t${si}`}
            className="whitespace-pre-wrap break-words rounded bg-[var(--background)]/50 px-2 py-1 font-mono text-[0.5625rem] leading-relaxed text-[var(--muted-foreground)]"
          >
            {seg.text.replace(/^\n+|\n+$/g, "")}
          </pre>,
        );
        return;
      }
      const slot = byTrigger.get(seg.trigger);
      if (!slot) {
        parts.push(
          <div
            key={`u${si}`}
            className="flex items-start gap-1.5 rounded-md border border-[var(--border)] px-2 py-1.5 text-[0.625rem] text-[var(--muted-foreground)]"
          >
            <CircleHelp size="0.75rem" className="mt-0.5 shrink-0" />
            <span>
              <b>{t("megumin.devmode.editor.unknownSlot")}</b>{" "}
              {t("megumin.devmode.editor.unknownSlotText", { trigger: seg.trigger })}
            </span>
          </div>,
        );
        return;
      }
      if (slot.hidden) return;
      drawn.add(slot.trigger);
      if (slot.scope === "engine") {
        parts.push(engineSlot(slot));
        if (/^\[\[prompt[1-6]\]\]$/.test(slot.trigger)) {
          parts.push(<Modules key={`m${si}`} slot={slot} modeData={modeData} setMode={setMode} />);
        }
      } else if (slot.scope === "shared") {
        parts.push(<AddonChip key={`a${si}`} ctx={ctx} slot={slot} modeData={modeData} />);
        // What this add-on carries is drawn beneath it, at its real position (the CoT rides in Thinking Tags).
        slots
          .filter(
            (car) =>
              !car.hidden &&
              car.scope === "engine" &&
              car.carrier &&
              CARRIER_TAGS[car.carrier] &&
              CARRIER_TAGS[car.carrier] === slot.trigger,
          )
          .forEach((car) => {
            drawn.add(car.trigger);
            parts.push(
              <div key={`c${si}-${car.trigger}`} className="border-l-2 border-amber-500/40 pl-2">
                {engineSlot(car)}
              </div>,
            );
          });
      } else {
        if (!ctx.session.showAuto) return;
        parts.push(
          <div
            key={`x${si}`}
            className="flex items-start gap-1.5 rounded-md border border-violet-500/30 bg-violet-500/5 px-2 py-1.5 text-[0.625rem]"
          >
            <Wand2 size="0.75rem" className="mt-0.5 shrink-0 text-violet-500" />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="flex items-center gap-1.5">
                <span className="font-medium">{slot.label}</span>
                <StatusBadge kind="auto" />
              </span>
              {slot.hint ? <span className="text-[var(--muted-foreground)]">{slot.hint}</span> : null}
            </span>
          </div>,
        );
      }
    });
    if (!parts.length) return null;
    return (
      <div key={`${card.id}-${ci}`} className="flex flex-col gap-1.5 rounded-md border border-[var(--border)]/70 p-2">
        <div className="flex items-center justify-between gap-2 text-[0.625rem]">
          <span className="min-w-0 truncate font-semibold text-[var(--marinara-chat-chrome-panel-title)]">
            {card.name}
          </span>
          <span className="shrink-0 font-mono text-[0.5625rem] text-[var(--muted-foreground)]">{card.role}</span>
        </div>
        {parts}
      </div>
    );
  });

  // A safety net: any engine slot the walk did not place still gets a box.
  const orphans = engineSlotsOf(slots).filter((s) => !drawn.has(s.trigger));

  return (
    <>
      <Subtitle>{t("megumin.devmode.editor.sub")}</Subtitle>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          <MeguminButton icon={<ArrowLeft size="0.75rem" />} onClick={() => void back()}>
            {t("megumin.devmode.back")}
          </MeguminButton>
          <input
            className={cn(MEGUMIN_INPUT_CLASS, "min-w-0 flex-1")}
            value={modeData.label ?? ""}
            aria-label={t("megumin.devmode.editor.name")}
            placeholder={t("megumin.devmode.editor.name")}
            onChange={(e) => setMode((m) => ({ ...m, label: e.target.value }))}
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <label className="flex cursor-pointer items-center gap-1.5 text-[0.6875rem]">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-[var(--primary)]"
              checked={ctx.session.showAuto}
              onChange={(e) => {
                const on = e.target.checked;
                ctx.setSession((s) => ({ ...s, showAuto: on }));
              }}
            />
            {t("megumin.devmode.editor.showAuto")}
          </label>
          <MeguminButton variant="primary" icon={<Save size="0.75rem" />} onClick={save}>
            {t("megumin.devmode.editor.save")}
          </MeguminButton>
        </div>
        {ctx.session.dirty ? <MeguminHint tone="warning">{t("megumin.devmode.editor.dirty")}</MeguminHint> : null}
      </div>

      <div className="flex flex-wrap gap-1 text-[0.5625rem]">
        <span className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5">
          <Cpu size="0.625rem" /> {t("megumin.devmode.legend.engine")}
        </span>
        <span className="inline-flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5">
          <Puzzle size="0.625rem" /> {t("megumin.devmode.legend.shared")}
        </span>
        <span className="inline-flex items-center gap-1 rounded border border-violet-500/40 bg-violet-500/10 px-1.5 py-0.5">
          <Wand2 size="0.625rem" /> {t("megumin.devmode.legend.auto")}
        </span>
      </div>

      {ctx.dev.cacheFriendly ? <CacheFriendlyNote /> : null}
      <div className="flex flex-col gap-2">{cards}</div>
      {orphans.length ? (
        <div className="flex flex-col gap-1.5 rounded-md border border-[var(--border)]/70 p-2">
          <div className="text-[0.625rem] font-semibold text-[var(--marinara-chat-chrome-panel-title)]">
            {t("megumin.devmode.editor.otherSettings")}
          </div>
          {orphans.map(engineSlot)}
        </div>
      ) : null}
    </>
  );
}

/** One of the engine's own slots, folded until opened (devmode.js renderEngineSlot). */
function EngineSlot({
  ctx,
  slot,
  modeData,
  open,
  onToggle,
  onChange,
  onUnshadow,
}: {
  ctx: DevCtx;
  slot: DevSlot;
  modeData: ModeData;
  open: boolean;
  onToggle: () => void;
  onChange: (key: string, value: string) => void;
  onUnshadow: (key: string) => void;
}) {
  const { t } = useTranslation();
  const status = statusOf(slot, modeData, ctx.shared);
  const { value } = resolveSlot(slot, modeData, ctx.shared);
  return (
    <div className={cn("rounded-md border border-amber-500/30", open && "bg-amber-500/5")}>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full items-start gap-1.5 px-2 py-1.5 text-left"
      >
        {open ? (
          <ChevronDown size="0.75rem" className="mt-0.5 shrink-0" />
        ) : (
          <ChevronRight size="0.75rem" className="mt-0.5 shrink-0" />
        )}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-[0.6875rem] font-medium">{slot.label}</span>
            <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/15 px-1 py-px text-[0.5625rem] text-amber-600">
              <Cpu size="0.5625rem" />
              {t("megumin.devmode.legend.engineShort")}
            </span>
            <StatusBadge kind={status} />
          </span>
          {!open && value ? (
            <span className="truncate font-mono text-[0.5625rem] text-[var(--muted-foreground)]">
              {onelineOf(value)}
            </span>
          ) : null}
        </span>
      </button>
      {open ? (
        <div className="border-t border-amber-500/20 p-2">
          <SlotEditor ctx={ctx} slot={slot} modeData={modeData} onEngineChange={onChange} onUnshadow={onUnshadow} />
        </div>
      ) : null}
    </div>
  );
}

/** An add-on seen from inside the engine document: a signpost to its page (devmode.js renderAddonChip). */
function AddonChip({ ctx, slot, modeData }: { ctx: DevCtx; slot: DevSlot; modeData: ModeData }) {
  const { t } = useTranslation();
  const status = statusOf(slot, modeData, ctx.shared);
  const { value } = resolveSlot(slot, modeData, ctx.shared);
  return (
    <button
      type="button"
      onClick={() => slot.key && ctx.go({ name: "addon", key: slot.key })}
      className={cn(
        "flex w-full items-start gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2 py-1.5 text-left transition-colors hover:bg-emerald-500/10",
        status === "off" && "opacity-60",
      )}
    >
      <Puzzle size="0.75rem" className="mt-0.5 shrink-0 text-emerald-500" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-[0.6875rem] font-medium">{slot.label}</span>
          <StatusBadge kind={status} />
        </span>
        {value ? (
          <span className="truncate font-mono text-[0.5625rem] text-[var(--muted-foreground)]">{onelineOf(value)}</span>
        ) : null}
      </span>
      <span className="inline-flex shrink-0 items-center gap-0.5 text-[0.625rem] font-medium">
        {t("megumin.devmode.editor.editAddon")}
        <ArrowRight size="0.625rem" />
      </span>
    </button>
  );
}

// ── Custom modules: your own text bolted onto an engine prompt ──────────────

function Modules({
  slot,
  modeData,
  setMode,
}: {
  slot: DevSlot;
  modeData: ModeData;
  setMode: (change: (m: ModeData) => ModeData) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const mods = (modeData.customToggles ?? []).filter((m) => moduleTrigger(m.attachPoint) === slot.trigger);

  const saveModule = (next: Omit<CustomModule, "id" | "attachPoint">, existing: CustomModule | null) => {
    setMode((m) => {
      const list = [...(m.customToggles ?? [])];
      if (existing) {
        const i = list.findIndex((x) => x.id === existing.id);
        if (i > -1) list[i] = { ...existing, ...next };
      } else {
        list.push({ id: `mod_${Date.now()}`, attachPoint: slot.trigger, ...next });
      }
      return { ...m, customToggles: list };
    });
    setEditing(null);
  };

  const remove = async (mod: CustomModule) => {
    const ok = await showConfirmDialog({
      title: t("megumin.devmode.modules.removeTitle"),
      message: t("megumin.devmode.modules.removeMessage", { name: mod.name }),
      confirmLabel: t("megumin.devmode.modules.remove"),
      cancelLabel: t("megumin.devmode.modules.keep"),
      tone: "destructive",
    });
    if (!ok) return;
    setMode((m) => ({ ...m, customToggles: (m.customToggles ?? []).filter((x) => x.id !== mod.id) }));
  };

  return (
    <div className="flex flex-col gap-1 pl-2">
      {mods.map((mod) =>
        editing === mod.id ? (
          <ModuleForm
            key={mod.id}
            initial={mod}
            onCancel={() => setEditing(null)}
            onSave={(next) => saveModule(next, mod)}
          />
        ) : (
          <div key={mod.id} className="flex flex-col gap-0.5 rounded-md border border-[var(--border)]/60 px-2 py-1.5">
            <div className="flex items-center gap-1.5 text-[0.625rem]">
              <Puzzle size="0.625rem" className="shrink-0" />
              <span className="min-w-0 flex-1 truncate font-medium">{mod.name}</span>
              <span className="shrink-0 text-[var(--muted-foreground)]">
                {mod.location === "addons"
                  ? t("megumin.devmode.modules.inGlobal")
                  : t("megumin.devmode.modules.inAddons")}
              </span>
              <button
                type="button"
                title={t("megumin.devmode.modules.edit")}
                aria-label={t("megumin.devmode.modules.edit")}
                className="mari-chrome-control mari-chrome-control--small mari-chrome-control--icon"
                onClick={() => setEditing(mod.id)}
              >
                <Pencil size="0.625rem" />
              </button>
              <button
                type="button"
                title={t("megumin.devmode.modules.remove")}
                aria-label={t("megumin.devmode.modules.remove")}
                className="mari-chrome-control mari-chrome-control--small mari-chrome-control--icon mari-chrome-control--danger"
                onClick={() => void remove(mod)}
              >
                <Trash2 size="0.625rem" className="text-[var(--destructive)]" />
              </button>
            </div>
            <div className="truncate font-mono text-[0.5625rem] text-[var(--muted-foreground)]">
              {onelineOf(mod.content)}
            </div>
          </div>
        ),
      )}
      {editing === "new" ? (
        <ModuleForm initial={null} onCancel={() => setEditing(null)} onSave={(next) => saveModule(next, null)} />
      ) : (
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="inline-flex items-center gap-1 self-start rounded-md border border-dashed border-[var(--border)] px-2 py-1 text-[0.625rem] text-[var(--muted-foreground)] hover:bg-[var(--accent)]"
        >
          <Plus size="0.625rem" />
          {t("megumin.devmode.modules.add")}
        </button>
      )}
    </div>
  );
}

function ModuleForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: CustomModule | null;
  onSave: (next: Omit<CustomModule, "id" | "attachPoint">) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name ?? "");
  const [location, setLocation] = useState<CustomModule["location"]>(initial?.location ?? "settings");
  const [content, setContent] = useState(initial?.content ?? "");

  const save = () => {
    if (!content.trim()) {
      toast.warning(t("megumin.devmode.modules.emptyWarning"));
      return;
    }
    onSave({ name: name || t("megumin.devmode.modules.defaultName"), location, content });
  };

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-[var(--primary)]/40 p-2">
      <div className="text-[0.6875rem] font-semibold">
        {initial ? t("megumin.devmode.modules.editTitle") : t("megumin.devmode.modules.addTitle")}
      </div>
      <label className="flex flex-col gap-1 text-[0.625rem]">
        {t("megumin.devmode.modules.nameLabel")}
        <input
          className={MEGUMIN_INPUT_CLASS}
          value={name}
          placeholder={t("megumin.devmode.modules.namePlaceholder")}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <MeguminSelect
        label={t("megumin.devmode.modules.locationLabel")}
        value={location}
        onChange={(v) => setLocation(v === "addons" ? "addons" : "settings")}
        options={[
          { value: "settings", label: t("megumin.devmode.modules.locationAddons") },
          { value: "addons", label: t("megumin.devmode.modules.locationGlobal") },
        ]}
      />
      <label className="flex flex-col gap-1 text-[0.625rem]">
        {t("megumin.devmode.modules.contentLabel")}
        <textarea
          className={cn(MEGUMIN_INPUT_CLASS, "min-h-32 resize-y font-mono text-[0.6875rem]")}
          rows={7}
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
      </label>
      <MeguminRow>
        <MeguminButton variant="primary" icon={<Save size="0.75rem" />} onClick={save}>
          {t("megumin.devmode.modules.save")}
        </MeguminButton>
        <MeguminButton onClick={onCancel}>{t("megumin.devmode.modules.cancel")}</MeguminButton>
      </MeguminRow>
    </div>
  );
}
