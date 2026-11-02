// ──────────────────────────────────────────────
// Megumin Suite: the side panel and the Present Characters bar
// ──────────────────────────────────────────────
// Port of Megumin Suite's side panel (src/sidepanel/panel.js, chrome.js) and
// Present Characters bar (presentBar.js). The tracker sections are drawn by
// Megumin's own section renderers (sidepanel/sections.js) from the latest
// reply, read the way the panel reads it (parsers.js parseMessage) — with the
// World State board as the engine's state store kept it after that reply and
// the blocks Chomusuke wrote for it, which YunYun has and SillyTavern's panel
// did not.
//
//   MeguminTrackerSections  the sections (also the Side Panel tab's live view)
//   MeguminSidePanelHost    the panel itself, docked to a screen edge or floating
//   MeguminPresentBar       the portrait strip by the composer, and its sheet
// Derived from Megumin Suite (CC BY-NC 4.0, see packages/shared/src/megumin/LICENSE.md).
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clapperboard,
  ClipboardList,
  ExternalLink,
  GripVertical,
  IdCard,
  Info,
  Pin,
  RefreshCw,
  Sparkles,
  Users,
  WandSparkles,
  X,
} from "lucide-react";
import { MeguminSidePanelParsers, MeguminSidePanelSections } from "@marinara-engine/shared/megumin/client";
import { cn } from "../../../lib/utils";
import { useChatMessagePeek } from "../../../hooks/use-chats";
import { useUIStore, type Panel } from "../../../stores/ui.store";
import {
  useMeguminEnabled,
  useMeguminScope,
  useMeguminView,
  useSaveMeguminGlobal,
  type MeguminView,
} from "../../../hooks/use-megumin";

// ── Settings ─────────────────────────────────────────────────────────────────

export interface MeguminSidePanelSettings {
  schemaVersion: number;
  enabled: boolean;
  mode: "docked" | "floating";
  position: "left" | "right";
  width: number;
  collapsed: boolean;
  hideInline: boolean;
  scale: number;
  autoHideEmpty: boolean;
  float: { x: number | null; y: number | null; w: number; h: number };
  sections: Record<string, { visible: boolean; open: boolean; order: number }>;
}

export interface MeguminPresentBarSettings {
  enabled: boolean;
  position: "above" | "below" | "off";
  cardWidth: number;
  cardHeight: number;
}

/** sidepanel/panel.js DEFAULTS (the engine backfills the same ones). */
export const SIDE_PANEL_DEFAULTS: MeguminSidePanelSettings = {
  schemaVersion: 2,
  enabled: false,
  mode: "docked",
  position: "right",
  width: 340,
  collapsed: false,
  hideInline: true,
  scale: 1.0,
  autoHideEmpty: true,
  float: { x: null, y: null, w: 620, h: 720 },
  sections: {
    worldState: { visible: true, open: true, order: 0 },
    innerChatter: { visible: true, open: true, order: 1 },
    newNpcs: { visible: true, open: true, order: 2 },
    storyPlan: { visible: true, open: false, order: 3 },
    npcBank: { visible: true, open: true, order: 4 },
    banList: { visible: true, open: false, order: 5 },
  },
};

/** sidepanel/presentBar.js DEFAULTS. */
export const PRESENT_BAR_DEFAULTS: MeguminPresentBarSettings = {
  enabled: true,
  position: "above",
  cardWidth: 120,
  cardHeight: 160,
};

type SectionDef = (typeof MeguminSidePanelSections.SECTION_REGISTRY)[number];
export const SIDE_PANEL_SECTIONS: SectionDef[] = MeguminSidePanelSections.SECTION_REGISTRY;

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** The side panel's settings with every key present (panel.js settings()). */
export function sidePanelSettingsOf(view: MeguminView | undefined): MeguminSidePanelSettings {
  const cur = { ...clone(SIDE_PANEL_DEFAULTS), ...((view?.sidePanel ?? {}) as Partial<MeguminSidePanelSettings>) };
  cur.float = { ...SIDE_PANEL_DEFAULTS.float, ...(cur.float ?? {}) };
  const sections = { ...(cur.sections ?? {}) } as Record<string, unknown>;
  for (const def of SIDE_PANEL_SECTIONS) {
    const v = sections[def.id];
    if (typeof v === "boolean") sections[def.id] = { visible: v, open: def.defaultOpen, order: def.order };
    else if (!v || typeof v !== "object") sections[def.id] = { visible: true, open: def.defaultOpen, order: def.order };
  }
  cur.sections = sections as MeguminSidePanelSettings["sections"];
  return cur;
}

export function presentBarSettingsOf(view: MeguminView | undefined): MeguminPresentBarSettings {
  const saved = ((view as (MeguminView & { presentBar?: Partial<MeguminPresentBarSettings> }) | undefined)
    ?.presentBar ?? {}) as Partial<MeguminPresentBarSettings>;
  const out = { ...PRESENT_BAR_DEFAULTS };
  for (const key of Object.keys(PRESENT_BAR_DEFAULTS) as Array<keyof MeguminPresentBarSettings>) {
    if (saved[key] !== undefined) (out as Record<string, unknown>)[key] = saved[key];
  }
  return out;
}

/** panel.js getOrderedSections. */
export function orderedSections(cfg: MeguminSidePanelSettings): SectionDef[] {
  return [...SIDE_PANEL_SECTIONS].sort(
    (a, b) => (cfg.sections[a.id]?.order ?? a.order) - (cfg.sections[b.id]?.order ?? b.order),
  );
}

/** panel.js applySectionOrder: the visible ones in the given order, the hidden ones after them. */
export function withSectionOrder(cfg: MeguminSidePanelSettings, ids: string[]): MeguminSidePanelSettings {
  const next = clone(cfg);
  ids.forEach((id, i) => {
    if (next.sections[id]) next.sections[id]!.order = i;
  });
  let tail = ids.length;
  for (const def of orderedSections(cfg)) {
    if (!ids.includes(def.id) && next.sections[def.id]) next.sections[def.id]!.order = tail++;
  }
  return next;
}

/** panel.js resetSectionLayout. */
export function withSectionLayoutReset(cfg: MeguminSidePanelSettings): MeguminSidePanelSettings {
  const next = clone(cfg);
  for (const def of SIDE_PANEL_SECTIONS)
    next.sections[def.id] = { visible: true, open: def.defaultOpen, order: def.order };
  return next;
}

/** Saving goes through the store's install-wide parts; presentBar is one of them. */
export function useSaveSidePanel() {
  const save = useSaveMeguminGlobal();
  const mutate = save.mutate as (patch: Record<string, unknown>) => void;
  return {
    saveSidePanel: (next: MeguminSidePanelSettings) => mutate({ sidePanel: next }),
    savePresentBar: (next: MeguminPresentBarSettings) => mutate({ presentBar: next }),
    saveBoth: (sidePanel: MeguminSidePanelSettings, presentBar: MeguminPresentBarSettings) =>
      mutate({ sidePanel, presentBar }),
  };
}

/** Opens the Megumin panel on a tab from outside it (the panel listens for this event). */
export function openMeguminTab(tabId: string) {
  useUIStore.getState().openRightPanel("megumin" as Panel);
  window.dispatchEvent(new CustomEvent("megumin:open-tab", { detail: { tabId } }));
}

// ── What the panel reads ─────────────────────────────────────────────────────

type BankedNpc = Record<string, any> & { name?: string };

/** panel.js lookupBankedNpc: exact name, else the same first name. */
function lookupBankedNpc(profile: Record<string, any>, name: string): BankedNpc | null {
  if (!name) return null;
  const npcs = profile?.npcBank?.npcs;
  if (!Array.isArray(npcs)) return null;
  const target = name.trim().toLowerCase();
  for (const n of npcs as BankedNpc[]) {
    const nm = String(n.name || "")
      .trim()
      .toLowerCase();
    if (!nm) continue;
    if (nm === target) return n;
    if (nm.split(/\s+/)[0] === target.split(/\s+/)[0]) return n;
  }
  return null;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The latest reply as the panel parses it. The World State board is the store's (the reply's own block may be a
 * short update, or written by Chomusuke and not in the text at all), and Chomusuke's blocks are added back in.
 */
function trackerTextOf(mes: string, card: MeguminView["cards"][string] | undefined): string {
  let text = mes || "";
  if (!card) return text;
  if (card.worldStateText) {
    text = text.replace(/<World_(?:State|Update)\b[^>]*>[\s\S]*?<\/World_(?:State|Update)\s*>/gi, "");
    text = `${text}\n<World_State>\n${card.worldStateText}\n</World_State>`;
  }
  for (const [tag, body] of Object.entries(card.storeBlocks ?? {})) {
    if (!String(body || "").trim()) continue;
    if (new RegExp(`<${escapeRe(tag)}\\b`, "i").test(text)) continue;
    text = `${text}\n<${tag}>\n${body}\n</${tag}>`;
  }
  return text;
}

/** The newest reply with text, read straight from the chat's newest messages. */
export function useMeguminTrackerData(chatId: string | null, view: MeguminView | undefined, enabled: boolean) {
  const peek = useChatMessagePeek(chatId, 12, enabled && !!chatId);
  const { refetch } = peek;
  // The view changing means the chat or its after-reply work changed: read the messages again.
  useEffect(() => {
    if (enabled && chatId && view) void refetch();
  }, [chatId, enabled, refetch, view]);

  return useMemo(() => {
    const messages = peek.data ?? [];
    const cards = view?.cards ?? {};
    let found: { id: string; content: string } | null = null;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]!;
      if (!(m.id in cards)) continue;
      if (typeof m.content !== "string" || !m.content.trim()) continue;
      found = { id: m.id, content: m.content };
      break;
    }
    const text = found ? trackerTextOf(found.content, cards[found.id]) : "";
    let parsed: Record<string, any> = { hasAny: false };
    try {
      if (found) parsed = MeguminSidePanelParsers.parseMessage(text);
    } catch (error) {
      console.warn("[Megumin Side Panel] parse failure", error);
    }
    return { parsed, messageId: found?.id ?? null, text, refresh: refetch };
  }, [peek.data, refetch, view?.cards]);
}

// panel.js INLINE_BLOCK_LABELS / findUnreadableBlockTypes: a block that arrived and could not be read is named,
// instead of "no tracker data", which reads as "the AI sent nothing".
const INLINE_BLOCK_LABELS = [
  { type: "worldState", re: /World State/i },
  { type: "innerChatter", re: /NPC Inner Chatter/i },
  { type: "newNpc", re: /New NPC:/i },
];
function findUnreadableBlockTypes(mesText: string): string[] {
  const out: string[] = [];
  if (!mesText) return out;
  const parsed = MeguminSidePanelParsers.getParsedBlockTypes(mesText) as Set<unknown>;
  const scan = /<summary[^>]*>([\s\S]*?)<\/summary\s*>/gi;
  let m: RegExpExecArray | null;
  while ((m = scan.exec(mesText)) !== null) {
    const s = (m[1] || "").replace(/<[^>]*>/g, " ");
    let type = "unknown";
    for (const label of INLINE_BLOCK_LABELS) {
      const hit = s.match(label.re);
      if (hit && !/\p{L}/u.test(s.slice(0, hit.index))) {
        type = label.type;
        break;
      }
    }
    if (type === "unknown" || parsed.has(type) || out.includes(type)) continue;
    out.push(type);
  }
  return out;
}

// Badge counts, to pulse a badge whose number changed (panel.js lastBadgeCounts).
const lastBadgeCounts = new Map<string, unknown>();

// ── The sections ─────────────────────────────────────────────────────────────

function TrackerSection({
  def,
  open,
  content,
  badge,
  onToggle,
  onMove,
}: {
  def: SectionDef;
  open: boolean;
  content: Node;
  badge: unknown;
  onToggle: (open: boolean) => void;
  onMove: (delta: -1 | 1) => void;
}) {
  const { t } = useTranslation();
  const details = useRef<HTMLDetailsElement>(null);
  const [pulse, setPulse] = useState(false);

  // Megumin's renderers build DOM; the node goes straight under <details>, where the stylesheet expects it.
  useLayoutEffect(() => {
    const el = details.current;
    if (!el) return;
    el.appendChild(content);
    return () => {
      if (content.parentNode === el) el.removeChild(content);
    };
  }, [content]);

  useEffect(() => {
    if (badge === null || badge === undefined) return;
    const prev = lastBadgeCounts.get(def.id);
    lastBadgeCounts.set(def.id, badge);
    if (prev !== undefined && prev !== badge) setPulse(true);
  }, [badge, def.id]);

  return (
    <details
      ref={details}
      className="meg-sp-section"
      id={`meg-sp-section-${def.id}`}
      data-section-id={def.id}
      open={open}
      onToggle={(e) => {
        const now = (e.currentTarget as HTMLDetailsElement).open;
        if (now !== open) onToggle(now);
      }}
    >
      <summary className="meg-sp-summary">
        <span
          className="meg-sp-drag-handle"
          tabIndex={0}
          role="button"
          title={t("megumin.sidepanel.live.reorderHint")}
          aria-label={t("megumin.sidepanel.live.reorderHint")}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onKeyDown={(e) => {
            if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
            e.preventDefault();
            e.stopPropagation();
            onMove(e.key === "ArrowUp" ? -1 : 1);
          }}
        >
          <GripVertical size="0.75rem" />
        </span>
        <span className="meg-sp-summary-title">
          <i className={`fa-solid ${def.icon}`} /> {t(`megumin.sidepanel.section.${def.id}`)}
        </span>
        {badge !== null && badge !== undefined ? (
          <span className={cn("meg-sp-badge", pulse && "meg-sp-badge-pulse")} onAnimationEnd={() => setPulse(false)}>
            {String(badge)}
          </span>
        ) : null}
        <i className="fa-solid fa-chevron-down meg-sp-chevron" />
      </summary>
    </details>
  );
}

/**
 * The tracker sections in the reader's order (panel.js render()). Shared by the side panel and the Side Panel
 * tab's live view. `inline` drops the empty-state icon's size for the narrow tab.
 */
export function MeguminTrackerSections({
  view,
  chatId,
  cfg,
  onSave,
  onOpenNpcBook,
}: {
  view: MeguminView;
  chatId: string | null;
  cfg: MeguminSidePanelSettings;
  onSave: (next: MeguminSidePanelSettings) => void;
  onOpenNpcBook: (focusIdx?: number) => void;
}) {
  const { t } = useTranslation();
  const data = useMeguminTrackerData(chatId, view, true);
  const profile = useMemo(() => view.profile ?? {}, [view.profile]);
  const hasChat = !!chatId;

  const ctx = useMemo(
    () => ({
      parsed: data.parsed,
      hasChat,
      profile,
      cfg,
      openNpcBook: (focusIdx?: number) => onOpenNpcBook(focusIdx),
      lookupBankedNpc: (name: string) => lookupBankedNpc(profile, name),
    }),
    [cfg, data.parsed, hasChat, onOpenNpcBook, profile],
  );

  const rendered = useMemo(() => {
    const out: Array<{ def: SectionDef; content: Node; badge: unknown }> = [];
    for (const def of orderedSections(cfg)) {
      const st = cfg.sections[def.id];
      if (!st || st.visible === false) continue;
      let content: Node | null = null;
      try {
        content = (def.render(ctx) as Node | null) ?? null;
      } catch (error) {
        console.warn(`[Megumin Side Panel] section ${def.id} render failed`, error);
      }
      if (!content) {
        if (cfg.autoHideEmpty) continue;
        const muted = document.createElement("div");
        muted.className = "meg-sp-muted";
        muted.textContent = "—";
        content = muted;
      }
      const badge = typeof def.badge === "function" ? def.badge(ctx) : null;
      out.push({ def, content, badge });
    }
    return out;
  }, [cfg, ctx]);

  const unreadable = useMemo(() => findUnreadableBlockTypes(data.parsed?.rawText ?? ""), [data.parsed]);

  const move = (id: string, delta: -1 | 1) => {
    const visible = orderedSections(cfg).filter((d) => cfg.sections[d.id]?.visible !== false);
    const idx = visible.findIndex((d) => d.id === id);
    const swapWith = idx + delta;
    if (idx < 0 || swapWith < 0 || swapWith >= visible.length) return;
    const ids = visible.map((d) => d.id);
    [ids[idx], ids[swapWith]] = [ids[swapWith]!, ids[idx]!];
    onSave(withSectionOrder(cfg, ids));
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>(`#meg-sp-section-${id} .meg-sp-drag-handle`)?.focus(),
    );
  };

  if (!rendered.length) {
    // "No data yet" and "every section is hidden" are different answers. With no chat open the profile's data
    // belongs to nothing on screen, so it does not count.
    const prof = hasChat ? profile : {};
    const hasData =
      data.parsed?.hasAny ||
      (data.parsed?.newNpcs && data.parsed.newNpcs.length) ||
      (prof.storyPlan?.currentPlan && String(prof.storyPlan.currentPlan).trim()) ||
      (prof.npcBank?.npcs && prof.npcBank.npcs.length) ||
      (prof.banList && prof.banList.length);
    const notice = unreadable.length
      ? t(unreadable.length === 1 ? "megumin.sidepanel.live.unreadableOne" : "megumin.sidepanel.live.unreadableMany", {
          names: unreadable.map((type) => t(`megumin.sidepanel.blockType.${type}`)).join(", "),
        })
      : "";
    return (
      <div className="meg-sp-empty">
        <WandSparkles size="2rem" className="mx-auto mb-3 opacity-45" />
        <p>{hasData ? t("megumin.sidepanel.live.allHidden") : notice || t("megumin.sidepanel.live.noData")}</p>
      </div>
    );
  }

  return (
    <div className="meg-sp-sections">
      {rendered.map(({ def, content, badge }) => (
        <TrackerSection
          key={def.id}
          def={def}
          open={!!cfg.sections[def.id]?.open}
          content={content}
          badge={badge}
          onToggle={(open) => {
            const next = clone(cfg);
            if (next.sections[def.id]) next.sections[def.id]!.open = open;
            onSave(next);
          }}
          onMove={(delta) => move(def.id, delta)}
        />
      ))}
    </div>
  );
}

// ── The panel ────────────────────────────────────────────────────────────────

const MIN_W = 320;
const MIN_H = 240;
const VIEW_MARGIN = 8;
const FIRST_FLOAT_GUTTER = 48;
const FIRST_FLOAT_TOP = 96;

function useIsMobile() {
  const query = "(max-width: 768px)";
  const [mobile, setMobile] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMobile(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return mobile;
}

/** The side panel's live data for the open Roleplay chat, outside the Megumin panel. */
function useHostState() {
  const enabled = useMeguminEnabled();
  const scope = useMeguminScope();
  const chatId = scope.kind === "chat" ? scope.chatId : null;
  const view = useMeguminView(scope, { enabled: enabled && !!chatId }).data;
  return { enabled, chatId, view: chatId ? view : undefined };
}

/**
 * The side panel itself (panel.js + chrome.js): docked to the left or right edge (resizable from its inner edge)
 * or floating (dragged by its header, resized from its corner), folded away behind its pull tab or button. Mount
 * once in the app shell; it draws only for a Roleplay chat in Megumin mode with the panel switched on.
 */
export function MeguminSidePanelHost() {
  const { t } = useTranslation();
  const { enabled, chatId, view } = useHostState();
  const { saveSidePanel } = useSaveSidePanel();
  const mobile = useIsMobile();
  const panelRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const saved = useMemo(() => sidePanelSettingsOf(view), [view]);
  // Geometry while a gesture runs; saved when it ends.
  const [live, setLive] = useState<Partial<MeguminSidePanelSettings> | null>(null);
  const cfg: MeguminSidePanelSettings = live ? { ...saved, ...live } : saved;
  const shown = enabled && !!chatId && !!view && cfg.enabled;
  const floating = cfg.mode === "floating" && !mobile;

  // A floating panel opened for the first time lands by the right edge (chrome.js applyLayout).
  const float = useMemo(() => {
    const f = { ...cfg.float };
    if (f.x === null || f.x === undefined) {
      f.w = f.w || 620;
      f.h = f.h || 720;
      f.x = Math.max(
        VIEW_MARGIN,
        (typeof window !== "undefined" ? window.innerWidth : 1280) - f.w - FIRST_FLOAT_GUTTER,
      );
      f.y = FIRST_FLOAT_TOP;
    }
    return f as { x: number; y: number; w: number; h: number };
  }, [cfg.float]);

  const save = useCallback(
    (patch: Partial<MeguminSidePanelSettings>) => saveSidePanel({ ...saved, ...patch }),
    [saveSidePanel, saved],
  );

  // panel.js syncBodyClasses: the floating button's dim cue.
  useEffect(() => {
    document.body.classList.toggle("meg-sp-panel-open", shown && !cfg.collapsed);
    return () => document.body.classList.remove("meg-sp-panel-open");
  }, [cfg.collapsed, shown]);

  // chrome.js clampToViewport: rescue a floating panel left off screen by a smaller window.
  useEffect(() => {
    if (!shown || !floating) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const clamp = () => {
      const f = { ...float };
      let changed = false;
      const maxW = window.innerWidth - 2 * VIEW_MARGIN;
      const maxH = window.innerHeight - 2 * VIEW_MARGIN;
      const set = (key: "x" | "y" | "w" | "h", value: number) => {
        f[key] = value;
        changed = true;
      };
      if (f.w > maxW) set("w", Math.max(MIN_W, maxW));
      if (f.h > maxH) set("h", Math.max(MIN_H, maxH));
      const maxX = window.innerWidth - f.w - VIEW_MARGIN;
      const maxY = window.innerHeight - 44;
      if (f.x > maxX) set("x", Math.max(VIEW_MARGIN, maxX));
      if (f.x < VIEW_MARGIN - (f.w - 96)) set("x", VIEW_MARGIN);
      if (f.y > maxY) set("y", Math.max(VIEW_MARGIN, maxY));
      if (f.y < 0) set("y", VIEW_MARGIN);
      if (changed) save({ float: f });
    };
    const onResize = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(clamp, 150);
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, [float, floating, save, shown]);

  /** One pointer gesture: `move` returns the live geometry, which is saved when the pointer lets go. */
  const gesture = (
    e: ReactPointerEvent<HTMLElement>,
    kind: "drag" | "dock" | "se",
    move: (dx: number, dy: number, ev: PointerEvent) => Partial<MeguminSidePanelSettings> | null,
  ) => {
    if (e.button !== 0) return;
    const target = e.currentTarget;
    const startX = e.clientX;
    const startY = e.clientY;
    const threshold = window.matchMedia("(pointer: coarse)").matches ? 8 : 4;
    let moved = kind !== "drag";
    let latest: Partial<MeguminSidePanelSettings> | null = null;
    target.setPointerCapture(e.pointerId);
    if (moved) document.body.classList.add("meg-sp-gesturing");
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < threshold) return;
      if (!moved) {
        moved = true;
        document.body.classList.add("meg-sp-gesturing");
      }
      latest = move(dx, dy, ev);
      if (latest) setLive(latest);
    };
    const end = (commit: boolean) => {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      target.removeEventListener("pointercancel", onCancel);
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("meg-sp-gesturing");
      panelRef.current?.classList.remove("meg-sp-dragging", "meg-sp-resizing");
      setLive(null);
      if (commit && moved && latest) save(latest);
    };
    const onUp = () => end(true);
    const onCancel = () => end(false);
    const onKey = (ke: KeyboardEvent) => {
      if (ke.key === "Escape") end(false);
    };
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
    target.addEventListener("pointercancel", onCancel);
    document.addEventListener("keydown", onKey);
    panelRef.current?.classList.add(kind === "drag" ? "meg-sp-dragging" : "meg-sp-resizing");
  };

  const onHeaderPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!floating) return;
    if ((e.target as Element).closest(".meg-sp-icon-btn")) return;
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    const headerH = headerRef.current?.getBoundingClientRect().height || 44;
    gesture(e, "drag", (dx, dy) => ({
      float: {
        ...float,
        x: Math.round(Math.max(-(rect.width - 96), Math.min(window.innerWidth - 96, rect.left + dx))),
        y: Math.round(Math.max(0, Math.min(window.innerHeight - headerH, rect.top + dy))),
      },
    }));
  };

  const onDockResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    gesture(e, "dock", (_dx, _dy, ev) => {
      const raw = cfg.position === "left" ? ev.clientX : window.innerWidth - ev.clientX;
      return { width: Math.round(Math.max(MIN_W, Math.min(Math.min(1100, window.innerWidth - 2 * VIEW_MARGIN), raw))) };
    });
  };

  const onCornerResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startW = float.w;
    const startH = float.h;
    gesture(e, "se", (dx, dy) => ({
      float: {
        ...float,
        w: Math.round(Math.max(MIN_W, Math.min(window.innerWidth - 2 * VIEW_MARGIN, startW + dx))),
        h: Math.round(Math.max(MIN_H, Math.min(window.innerHeight - 2 * VIEW_MARGIN, startH + dy))),
      },
    }));
  };

  if (!shown || !view) return null;

  const style = {
    "--meg-sp-scale": String(cfg.scale || 1),
    ...(floating
      ? {
          "--meg-sp-float-x": `${float.x}px`,
          "--meg-sp-float-y": `${float.y}px`,
          "--meg-sp-float-w": `${float.w}px`,
          "--meg-sp-float-h": `${float.h}px`,
        }
      : { "--meg-sp-width": `${cfg.width || 620}px` }),
  } as unknown as CSSProperties;

  const fabIcon = floating ? (
    <ClipboardList size="1rem" />
  ) : (cfg.position || "right") === "right" ? (
    cfg.collapsed ? (
      <ChevronLeft size="0.875rem" />
    ) : (
      <ChevronRight size="0.875rem" />
    )
  ) : cfg.collapsed ? (
    <ChevronRight size="0.875rem" />
  ) : (
    <ChevronLeft size="0.875rem" />
  );

  return createPortal(
    <aside
      ref={panelRef}
      id="meg-sp-panel"
      data-component="MeguminSidePanel"
      data-mode={floating ? "floating" : "docked"}
      aria-label={t("megumin.sidepanel.panel.title")}
      className={cn(
        "meg-sp-panel meg-sp-scope",
        !floating && `meg-sp-pos-${cfg.position || "right"}`,
        cfg.collapsed && "meg-sp-collapsed",
      )}
      style={style}
    >
      <div ref={headerRef} className="meg-sp-header" onPointerDown={onHeaderPointerDown}>
        <div className="meg-sp-header-bg" />
        <div className="meg-sp-header-overlay" />
        <div className="meg-sp-title">
          <Sparkles size="0.875rem" className="text-[var(--meg-gold-500)]" /> {t("megumin.sidepanel.panel.title")}
        </div>
        <div className="meg-sp-header-actions">
          <button
            type="button"
            className="meg-sp-icon-btn"
            title={t("megumin.sidepanel.panel.openNpcBook")}
            aria-label={t("megumin.sidepanel.panel.openNpcBook")}
            onClick={() => openMeguminTab("npc")}
          >
            <BookOpen size="0.8125rem" />
          </button>
          <button
            type="button"
            className="meg-sp-icon-btn"
            title={t("megumin.sidepanel.panel.refresh")}
            aria-label={t("megumin.sidepanel.panel.refresh")}
            onClick={() => window.dispatchEvent(new CustomEvent("megumin:side-panel-refresh"))}
          >
            <RefreshCw size="0.8125rem" />
          </button>
          {!mobile ? (
            <button
              type="button"
              className="meg-sp-icon-btn meg-sp-mode-btn"
              title={floating ? t("megumin.sidepanel.panel.dock") : t("megumin.sidepanel.panel.float")}
              aria-label={floating ? t("megumin.sidepanel.panel.dock") : t("megumin.sidepanel.panel.float")}
              onClick={() => save({ mode: floating ? "docked" : "floating" })}
            >
              {floating ? <Pin size="0.8125rem" /> : <ExternalLink size="0.8125rem" />}
            </button>
          ) : null}
          <button
            type="button"
            className="meg-sp-icon-btn"
            title={t("megumin.sidepanel.panel.collapse")}
            aria-label={t("megumin.sidepanel.panel.collapse")}
            onClick={() => save({ collapsed: true })}
          >
            <X size="0.8125rem" />
          </button>
        </div>
      </div>
      <div className="meg-sp-body">
        <HostSections view={view} chatId={chatId} cfg={cfg} onSave={(next) => saveSidePanel(next)} />
      </div>
      <button
        type="button"
        id="meg-sp-fab"
        className="meg-sp-fab"
        title={t("megumin.sidepanel.panel.fab")}
        aria-label={t("megumin.sidepanel.panel.fab")}
        aria-expanded={!cfg.collapsed}
        onClick={() => save({ collapsed: !cfg.collapsed })}
      >
        {fabIcon}
      </button>
      {!mobile && !cfg.collapsed ? (
        floating ? (
          <div className="meg-sp-rz meg-sp-rz-se" onPointerDown={onCornerResize} />
        ) : (
          <div
            className="meg-sp-rz meg-sp-rz-dock"
            style={cfg.position === "left" ? { right: 0 } : { left: 0 }}
            onPointerDown={onDockResize}
          />
        )
      ) : null}
    </aside>,
    document.body,
  );
}

/** The sections inside the host, re-read when the header's Refresh is pressed. */
function HostSections({
  view,
  chatId,
  cfg,
  onSave,
}: {
  view: MeguminView;
  chatId: string | null;
  cfg: MeguminSidePanelSettings;
  onSave: (next: MeguminSidePanelSettings) => void;
}) {
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    const on = () => setNonce((n) => n + 1);
    window.addEventListener("megumin:side-panel-refresh", on);
    return () => window.removeEventListener("megumin:side-panel-refresh", on);
  }, []);
  return (
    <MeguminTrackerSections
      key={nonce}
      view={view}
      chatId={chatId}
      cfg={cfg}
      onSave={onSave}
      onOpenNpcBook={() => openMeguminTab("npc")}
    />
  );
}

// ── Present Characters bar ───────────────────────────────────────────────────

type CastEntry = { name: string; fields: Record<string, string>; banked: BankedNpc | null };

const isMaleSex = (sex: unknown) =>
  String(sex || "")
    .trim()
    .toLowerCase()
    .startsWith("m");

/**
 * The portrait strip by the composer (presentBar.js): the cast the latest World State says is present, portraits
 * from the NPC Bank, a click opens that character's sheet. Mount it once above the composer and once below; each
 * draws only where the setting puts it.
 */
export function MeguminPresentBar({ placement }: { placement: "above" | "below" }) {
  const { t } = useTranslation();
  const { enabled, chatId, view } = useHostState();
  const sp = useMemo(() => sidePanelSettingsOf(view), [view]);
  const pb = useMemo(() => presentBarSettingsOf(view), [view]);
  const shown = enabled && !!chatId && !!view && sp.enabled && pb.enabled && pb.position === placement;
  const data = useMeguminTrackerData(chatId, view, shown);
  const scroll = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [sheet, setSheet] = useState<string | null>(null);
  const profile = useMemo(() => view?.profile ?? {}, [view?.profile]);

  // panel.js buildPresentCast: World State's NPCs present, once each, with what the bank has on them.
  const cast = useMemo<CastEntry[]>(() => {
    const npcs = (data.parsed?.worldState?.npcs ?? []) as Array<{ name?: string; fields?: Record<string, string> }>;
    const out: CastEntry[] = [];
    const seen = new Set<string>();
    for (const npc of npcs) {
      const name = String(npc.name || "").trim();
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      out.push({ name, fields: npc.fields || {}, banked: lookupBankedNpc(profile, name) });
    }
    return out;
  }, [data.parsed, profile]);

  if (!shown) return null;
  const entry = sheet ? (cast.find((c) => c.name.toLowerCase() === sheet.toLowerCase()) ?? null) : null;

  return (
    <div
      id="meg-pb-wrapper"
      data-component="MeguminPresentBar"
      className="meg-pb-wrapper meg-sp-scope"
      style={{ "--meg-pb-card-w": `${pb.cardWidth}px`, "--meg-pb-card-h": `${pb.cardHeight}px` } as CSSProperties}
    >
      <button
        type="button"
        className={cn("meg-pb-toggle", !collapsed && "meg-pb-open")}
        title={t("megumin.sidepanel.bar.toggle")}
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((c) => !c)}
      >
        <span className="meg-pb-toggle-dots">
          <span className="meg-pb-toggle-dot" />
          <span className="meg-pb-toggle-dot" />
          <span className="meg-pb-toggle-dot" />
        </span>
        <span className="meg-pb-toggle-label">{t("megumin.sidepanel.bar.characters")}</span>
        <ChevronUp size="0.625rem" className="meg-pb-toggle-chevron" />
      </button>
      <div className={cn("meg-pb-bar", collapsed ? "meg-pb-collapsed" : "meg-pb-expanded")}>
        <div className="meg-pb-header">
          <span className="meg-pb-title">
            <Users size="0.75rem" /> {t("megumin.sidepanel.bar.title")}
          </span>
          <span className="meg-pb-count">{cast.length}</span>
        </div>
        <button
          type="button"
          tabIndex={-1}
          className="meg-pb-arrow meg-pb-left"
          aria-label={t("megumin.sidepanel.bar.scrollLeft")}
          onClick={() => scroll.current?.scrollBy({ left: -240, behavior: "smooth" })}
        >
          <ChevronLeft size="0.875rem" />
        </button>
        <button
          type="button"
          tabIndex={-1}
          className="meg-pb-arrow meg-pb-right"
          aria-label={t("megumin.sidepanel.bar.scrollRight")}
          onClick={() => scroll.current?.scrollBy({ left: 240, behavior: "smooth" })}
        >
          <ChevronRight size="0.875rem" />
        </button>
        <div className="meg-pb-scroll" ref={scroll}>
          {!cast.length ? <div className="meg-pb-empty">{t("megumin.sidepanel.bar.empty")}</div> : null}
          {cast.map((c) => (
            <PresentCard key={c.name} entry={c} onOpen={() => setSheet(c.name)} />
          ))}
        </div>
      </div>
      {entry ? <CharacterSheet entry={entry} onClose={() => setSheet(null)} /> : null}
    </div>
  );
}

function Portrait({ src, name, initialClass }: { src: string; name: string; initialClass: string }) {
  const [failed, setFailed] = useState(false);
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  if (!src || failed) return <div className={initialClass}>{initial}</div>;
  return <img src={src} alt={name} onError={() => setFailed(true)} />;
}

function PresentCard({ entry, onOpen }: { entry: CastEntry; onOpen: () => void }) {
  const male = entry.banked ? isMaleSex(entry.banked.sex) : null;
  return (
    <div
      role="button"
      tabIndex={0}
      className={cn("meg-pb-card", male === true && "meg-pb-card-male", male === false && "meg-pb-card-female")}
      data-name={entry.name}
      title={entry.name}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <Portrait src={String(entry.banked?.pfp || "")} name={entry.name} initialClass="meg-pb-card-emoji" />
      <div className="meg-pb-card-name">{entry.name}</div>
    </div>
  );
}

/** presentBar.js openCharacterSheet: the scene's fields, then the dossier from the bank. */
function CharacterSheet({ entry, onClose }: { entry: CastEntry; onClose: () => void }) {
  const { t } = useTranslation();
  const [shownClass, setShownClass] = useState(false);
  const banked = entry.banked;
  const male = banked ? isMaleSex(banked.sex) : null;

  useEffect(() => {
    const raf = requestAnimationFrame(() => setShownClass(true));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const row = (label: string, val: unknown) =>
    val === undefined || val === null || String(val).trim() === "" ? null : (
      <div key={label} className="meg-pb-sheet-field">
        <div className="meg-pb-sheet-field-key">{label}</div>
        <div className="meg-pb-sheet-field-val">{String(val)}</div>
      </div>
    );

  const sceneRows = Object.entries(entry.fields || {})
    .map(([k, v]) => row(k, v))
    .filter(Boolean);
  // V8's dossier fields, with V7's names for NPCs banked before the upgrade.
  const bankRows = banked
    ? [
        row(t("megumin.sidepanel.sheet.role"), banked.role || banked.occupation),
        row(t("megumin.sidepanel.sheet.orientation"), banked.orientation),
        row(t("megumin.sidepanel.sheet.whereToFind"), banked.whereToFind),
        row(t("megumin.sidepanel.sheet.appearance"), banked.appearance),
        row(t("megumin.sidepanel.sheet.voice"), banked.voice),
        row(t("megumin.sidepanel.sheet.personality"), banked.personality),
        row(t("megumin.sidepanel.sheet.innerCircle"), banked.innerCircle),
        row(t("megumin.sidepanel.sheet.background"), banked.background),
        row(t("megumin.sidepanel.sheet.readOnPc"), banked.readOnPc),
        row(t("megumin.sidepanel.sheet.agenda"), banked.agenda),
        row(t("megumin.sidepanel.sheet.secrets"), banked.secrets || banked.hiddenLayer),
        row(t("megumin.sidepanel.sheet.canonLock"), banked.canonLock),
      ].filter(Boolean)
    : [];
  const ageSex = [banked?.age, banked?.sex].filter(Boolean).join(" · ");

  return createPortal(
    <div
      id="meg-pb-sheet"
      className={cn(
        "meg-pb-sheet meg-sp-scope",
        male === true && "meg-pb-sheet-male",
        male === false && "meg-pb-sheet-female",
        shownClass && "meg-pb-sheet-shown",
      )}
      role="dialog"
      aria-modal="true"
      aria-label={entry.name}
    >
      <div className="meg-pb-sheet-backdrop" onClick={onClose} />
      <div className="meg-pb-sheet-card">
        <button
          type="button"
          className="meg-pb-sheet-close"
          aria-label={t("megumin.sidepanel.sheet.close")}
          title={t("megumin.sidepanel.sheet.close")}
          onClick={onClose}
        >
          <X size="0.875rem" />
        </button>
        <div className="meg-pb-sheet-head">
          <div className="meg-pb-sheet-portrait">
            <Portrait src={String(banked?.pfp || "")} name={entry.name} initialClass="meg-pb-sheet-initial" />
          </div>
          <div className="meg-pb-sheet-titles">
            <div className="meg-pb-sheet-name">{entry.name}</div>
            {ageSex ? <div className="meg-pb-sheet-meta">{ageSex}</div> : null}
            {banked?.role || banked?.occupation ? (
              <div className="meg-pb-sheet-occ">{String(banked.role || banked.occupation)}</div>
            ) : null}
          </div>
        </div>
        <div className="meg-pb-sheet-body">
          {sceneRows.length ? (
            <div className="meg-pb-sheet-section">
              <div className="meg-pb-sheet-section-head">
                <Clapperboard size="0.75rem" /> {t("megumin.sidepanel.sheet.thisScene")}
              </div>
              <div className="meg-pb-sheet-section-body">{sceneRows}</div>
            </div>
          ) : (
            <div className="meg-pb-sheet-empty">{t("megumin.sidepanel.sheet.noScene")}</div>
          )}
          {bankRows.length ? (
            <div className="meg-pb-sheet-section">
              <div className="meg-pb-sheet-section-head">
                <IdCard size="0.75rem" /> {t("megumin.sidepanel.sheet.dossier")}
              </div>
              <div className="meg-pb-sheet-section-body">{bankRows}</div>
            </div>
          ) : null}
        </div>
        <div className="meg-pb-sheet-footer">
          {banked ? (
            <button
              type="button"
              className="meg-pb-sheet-book-btn"
              onClick={() => {
                openMeguminTab("npc");
                onClose();
              }}
            >
              <BookOpen size="0.75rem" /> {t("megumin.sidepanel.sheet.openInBook")}
            </button>
          ) : (
            <div className="meg-pb-sheet-unbanked">
              <Info size="0.75rem" /> {t("megumin.sidepanel.sheet.unbanked")}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
