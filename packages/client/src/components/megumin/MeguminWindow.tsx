// ──────────────────────────────────────────────
// Window: Megumin Suite
// ──────────────────────────────────────────────
// Megumin's settings window, laid out like Megumin's own (src/ui/tabs.js): the
// dock down the left in Megumin's order and groups, the profile being edited on
// top, then the open tab with its Global switch and Reset. Phones get the dock
// as a strip across the top. The window stays mounted once opened (hidden while
// closed), so a tab's unsaved typing and place survive closing it, as they did
// in the old right panel.
import {
  Activity,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type LazyExoticComponent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Ban,
  BookOpen,
  BookUser,
  Boxes,
  Cat,
  Clapperboard,
  Code,
  Compass,
  Earth,
  Image,
  Info,
  Loader2,
  MemoryStick,
  PanelRight,
  PenTool,
  Puzzle,
  RotateCcw,
  Server,
  Settings,
  UserRound,
  X,
} from "lucide-react";
import { MeguminEngineFlags } from "@marinara-engine/shared/megumin/client";
import { cn } from "../../lib/utils";
import { showConfirmDialog } from "../../lib/app-dialogs";
import { registerModalOverlay, type ModalOverlayRegistration } from "../../lib/modal-overlay-registry";
import { useBackDismiss } from "../../hooks/use-back-dismiss";
import { useBackdropDismiss } from "../../hooks/use-backdrop-dismiss";
import { useDialogFocusScope } from "../../hooks/use-dialog-focus-scope";
import { useChat } from "../../hooks/use-chats";
import { useCharacterSummaries } from "../../hooks/use-characters";
import {
  useMeguminAction,
  useMeguminCatalog,
  useMeguminEnabled,
  useMeguminProfileEditor,
  useMeguminScope,
  useMeguminView,
  useResetMeguminProfile,
  useSaveMeguminGlobal,
} from "../../hooks/use-megumin";
import { NEUTRAL_PANEL_SCROLL_AREA, NEUTRAL_PANEL_SHELL } from "../ui/neutral-surface-styles";
import { MeguminPanelContext, type MeguminPanelApi } from "./megumin-panel-context";
import { MeguminPowerSwitch } from "./MeguminPowerSwitch";
import { MEGUMIN_OPEN_TAB_EVENT, takeRequestedMeguminTab } from "../../lib/megumin-tab-request";

type TabIcon = ComponentType<{ size?: string | number; className?: string }>;

type TabDef = {
  id: string;
  /** Megumin's tab title: also the key of its Global switch (core/sync.js TAB_SYNC_KEYS). */
  syncTitle: string;
  icon: TabIcon;
  group?: "setup" | "tools";
  bottom?: boolean;
  component: LazyExoticComponent<ComponentType>;
};

const tab = (load: () => Promise<Record<string, ComponentType>>, name: string) =>
  lazy(() => load().then((m) => ({ default: m[name] as ComponentType })));

/** Megumin's dock, in its order (src/ui/tabs.js tabsUI), plus Dev Mode. */
const TABS: TabDef[] = [
  {
    id: "setup",
    syncTitle: "Model Setup",
    icon: Compass,
    component: tab(() => import("./tabs/ModelSetupTab"), "ModelSetupTab"),
  },
  {
    id: "preset",
    syncTitle: "Preset & Thinking",
    icon: Server,
    component: tab(() => import("./tabs/PresetTab"), "PresetTab"),
  },
  { id: "blocks", syncTitle: "Blocks", icon: Boxes, component: tab(() => import("./tabs/BlocksTab"), "BlocksTab") },
  {
    id: "notebook",
    syncTitle: "The Notebook",
    icon: BookOpen,
    component: tab(() => import("./tabs/NotebookTab"), "NotebookTab"),
  },
  { id: "npc", syncTitle: "NPC Bank", icon: BookUser, component: tab(() => import("./tabs/NpcBankTab"), "NpcBankTab") },
  { id: "images", syncTitle: "Images", icon: Image, component: tab(() => import("./tabs/ImagesTab"), "ImagesTab") },
  {
    id: "chomusuke",
    syncTitle: "Chomusuke",
    icon: Cat,
    component: tab(() => import("./tabs/ChomusukeTab"), "ChomusukeTab"),
  },
  {
    id: "style",
    syncTitle: "Writing Style",
    icon: PenTool,
    group: "setup",
    component: tab(() => import("./tabs/WritingStyleTab"), "WritingStyleTab"),
  },
  {
    id: "addons",
    syncTitle: "Language & Add-ons",
    icon: Puzzle,
    group: "setup",
    component: tab(() => import("./tabs/AddonsTab"), "AddonsTab"),
  },
  {
    id: "director",
    syncTitle: "Story Director",
    icon: Clapperboard,
    group: "tools",
    component: tab(() => import("./tabs/StoryDirectorTab"), "StoryDirectorTab"),
  },
  {
    id: "memory",
    syncTitle: "Memory",
    icon: MemoryStick,
    group: "tools",
    component: tab(() => import("./tabs/MemoryTab"), "MemoryTab"),
  },
  {
    id: "banlist",
    syncTitle: "Banned Phrases",
    icon: Ban,
    group: "tools",
    component: tab(() => import("./tabs/BanListTab"), "BanListTab"),
  },
  {
    id: "sidepanel",
    syncTitle: "Side Panel",
    icon: PanelRight,
    group: "tools",
    component: tab(() => import("./tabs/SidePanelTab"), "SidePanelTab"),
  },
  {
    id: "persona",
    syncTitle: "Persona",
    icon: UserRound,
    group: "tools",
    component: tab(() => import("./tabs/PersonaTab"), "PersonaTab"),
  },
  {
    id: "settings",
    syncTitle: "Settings",
    icon: Settings,
    bottom: true,
    component: tab(() => import("./tabs/SettingsTab"), "SettingsTab"),
  },
  {
    id: "devmode",
    syncTitle: "Dev Mode",
    icon: Code,
    bottom: true,
    component: tab(() => import("./tabs/DevModeTab"), "DevModeTab"),
  },
];

const GROUPS = ["setup", "tools"] as const;

/** Tabs whose settings live in the global store already (core/sync.js TABS_ALREADY_GLOBAL). */
const ALREADY_GLOBAL = new Set(["Side Panel", "Settings", "Chomusuke", "Dev Mode"]);
/** Tabs with something to copy to every profile (core/sync.js TAB_SYNC_KEYS). */
const SYNCABLE = new Set([
  "Preset & Thinking",
  "Persona",
  "Writing Style",
  "Language & Add-ons",
  "Blocks",
  "Story Director",
  "The Notebook",
  "Banned Phrases",
  "Images",
  "NPC Bank",
  "Memory",
]);

const PROFILE_LEVELS = new Set(["character", "chat", "group", "global"]);

function WindowLoading() {
  return (
    <div className="flex items-center justify-center py-16 text-[var(--muted-foreground)]">
      <Loader2 size="1.25rem" className="animate-spin" />
    </div>
  );
}

/**
 * The window frame: Modal's overlay behaviour (Escape and back close the topmost dialog, the backdrop closes,
 * focus stays inside), but hidden rather than unmounted while closed.
 */
function MeguminWindowFrame({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const overlayRegistrationRef = useRef<ModalOverlayRegistration | null>(null);
  const backdropDismiss = useBackdropDismiss(onClose);
  // Focus the window itself, not its first control (the MEGUMINTOGGLE, which Space would flip).
  useDialogFocusScope(
    open,
    panelRef,
    panelRef,
    undefined,
    undefined,
    () => overlayRegistrationRef.current?.isTopmost() ?? true,
  );
  useBackDismiss(open, onClose);

  useEffect(() => {
    if (!open) return;
    const registration = registerModalOverlay();
    overlayRegistrationRef.current = registration;
    return () => {
      registration.release();
      overlayRegistrationRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.isComposing || e.key !== "Escape") return;
      if (!overlayRegistrationRef.current?.isTopmost()) return;
      onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  return createPortal(
    <div
      // Only while shown: the omnibar asks the page whether a dialog is open.
      role={open ? "dialog" : undefined}
      aria-modal={open || undefined}
      aria-label={open ? title : undefined}
      aria-hidden={!open}
      data-component="MeguminWindow"
      className={cn(
        "mari-modal fixed inset-0 z-[10000] flex items-center justify-center p-0 sm:p-4",
        !open && "hidden",
      )}
      {...backdropDismiss}
    >
      <div
        data-backdrop-dismiss-surface="true"
        className="mari-modal-backdrop absolute inset-0 bg-black/55 backdrop-blur-[2px]"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          "mari-modal-panel",
          NEUTRAL_PANEL_SHELL,
          "relative flex h-full w-full flex-col overflow-hidden outline-none",
          "sm:h-[min(92dvh,62rem)] sm:max-w-[84rem]",
          "max-sm:rounded-none max-sm:border-0 max-sm:pt-[env(safe-area-inset-top)] max-sm:pb-[var(--mari-safe-area-inset-bottom,env(safe-area-inset-bottom))]",
        )}
      >
        <Activity mode={open ? "visible" : "hidden"}>{children}</Activity>
      </div>
    </div>,
    document.body,
  );
}

export function MeguminWindow({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  // A field commits its text when typing pauses or it loses focus: closing with Escape leaves the focus in it,
  // so blur it first and the profile save that runs as the window hides carries the last words typed.
  const close = useCallback(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.closest('[data-component="MeguminWindow"]')) active.blur();
    onClose();
  }, [onClose]);
  return (
    <MeguminWindowFrame open={open} onClose={close} title={t("megumin.window.title")}>
      <MeguminWindowBody onClose={close} />
    </MeguminWindowFrame>
  );
}

function MeguminWindowBody({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const enabled = useMeguminEnabled();
  const scope = useMeguminScope();
  const viewQuery = useMeguminView(scope);
  const catalogQuery = useMeguminCatalog();
  const editor = useMeguminProfileEditor(scope);
  const saveGlobal = useSaveMeguminGlobal();
  const action = useMeguminAction(scope);
  const reset = useResetMeguminProfile(scope);
  const [tabId, setTabId] = useState("preset");
  const [runningActions, setRunningActions] = useState<Record<string, number>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLElement>(null);

  const view = viewQuery.data;
  const catalog = catalogQuery.data;
  const chatId = scope.kind === "chat" ? scope.chatId : null;
  const chat = useChat(chatId).data;
  const characters = useCharacterSummaries(chat?.characterIds ?? [], !!chatId).data;

  const run = useCallback(
    async (name: string, args?: Record<string, unknown>) => {
      setRunningActions((s) => ({ ...s, [name]: (s[name] ?? 0) + 1 }));
      try {
        return await action.mutateAsync({ action: name, args });
      } finally {
        setRunningActions((s) => ({ ...s, [name]: Math.max(0, (s[name] ?? 1) - 1) }));
      }
    },
    [action],
  );

  const openTab = useCallback((id: string) => setTabId(id), []);

  // "Open in NPC Bank" and the like, from a card (asked before or after the window mounted).
  useEffect(() => {
    const take = () => {
      const requested = takeRequestedMeguminTab();
      if (requested) openTab(requested);
    };
    take();
    const onRequest = () => setTimeout(take, 0);
    window.addEventListener(MEGUMIN_OPEN_TAB_EVENT, onRequest);
    return () => window.removeEventListener(MEGUMIN_OPEN_TAB_EVENT, onRequest);
  }, [openTab]);

  const api = useMemo<MeguminPanelApi | null>(() => {
    if (!view || !catalog) return null;
    return {
      scope,
      chatId,
      enabled,
      view,
      catalog,
      profile: view.profile,
      update: editor.update,
      set: editor.set,
      flush: editor.flush,
      saveGlobal: (patch) => saveGlobal.mutate(patch),
      run,
      running: (name) => (runningActions[name] ?? 0) > 0,
      openTab,
    };
  }, [
    catalog,
    chatId,
    editor.flush,
    editor.set,
    editor.update,
    enabled,
    openTab,
    run,
    runningActions,
    saveGlobal,
    scope,
    view,
  ]);

  const engines = useMemo(
    () => [...((catalog?.engines as Array<Record<string, any>>) ?? []), ...(view?.customModes ?? [])],
    [catalog, view],
  );
  const activeEngine = engines.find((e) => e.id === view?.profile?.mode);
  // The Persona tab only matters on the old engines that carry no persona of their own (personaTabInUse).
  const personaShown = !!view && !MeguminEngineFlags.isModernEngine(activeEngine);
  const visibleTabs = TABS.filter((x) => x.id !== "persona" || personaShown);
  const current = visibleTabs.find((x) => x.id === tabId) ?? visibleTabs.find((x) => x.id === "preset")!;
  const CurrentTab = current.component;
  const CurrentIcon = current.icon;
  const tabTitle = (def: TabDef) => t(`megumin.tabs.${def.id}.title`);

  // A new tab starts at its top, and the phone strip keeps the open tab in view.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    stripRef.current
      ?.querySelector<HTMLElement>(`[data-megumin-tab="${current.id}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [current.id]);

  const synced = !!view?.globalSyncTabs?.[current.syncTitle];
  const syncable = SYNCABLE.has(current.syncTitle);
  const alreadyGlobal = ALREADY_GLOBAL.has(current.syncTitle);

  const toggleSync = async () => {
    await editor.flush();
    const on = !synced;
    try {
      await run("sync.tab", { title: current.syncTitle, on });
      toast.success(on ? t("megumin.panel.sync.on") : t("megumin.panel.sync.off"));
    } catch {
      /* the action toasts its own error */
    }
  };

  const confirmReset = async () => {
    const ok = await showConfirmDialog({
      title: t("megumin.panel.reset.title"),
      message: t("megumin.panel.reset.message"),
      confirmLabel: t("megumin.panel.reset.confirm"),
      tone: "destructive",
    });
    if (!ok) return;
    await editor.flush();
    reset.mutate(undefined, {
      onSuccess: () => toast.success(t("megumin.panel.reset.done")),
      onError: (error) => toast.error(error instanceof Error ? error.message : String(error)),
    });
  };

  const level = view && PROFILE_LEVELS.has(view.profileLevel) ? view.profileLevel : "global";
  const names = (characters ?? []).map((c) => c.name).filter(Boolean);
  const profileName =
    level === "global" ? t("megumin.window.globalName") : names.join(", ") || chat?.name || t("megumin.window.title");
  const heroAvatar = level === "global" ? null : (characters?.find((c) => c.avatarUrl)?.avatarUrl ?? null);

  const navButton = (def: TabDef, variant: "rail" | "strip") => {
    const Icon = def.icon;
    const active = def.id === current.id;
    const isSynced = !!view?.globalSyncTabs?.[def.syncTitle] && SYNCABLE.has(def.syncTitle);
    if (variant === "strip") {
      return (
        <button
          key={def.id}
          type="button"
          data-megumin-tab={def.id}
          onClick={() => openTab(def.id)}
          aria-current={active ? "page" : undefined}
          className={cn(
            "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[0.8125rem] transition-colors",
            active
              ? "mari-megumin-toggle--on font-semibold"
              : "bg-[var(--background)]/40 text-[var(--marinara-chat-chrome-panel-muted)] ring-1 ring-[var(--border)]/60 hover:text-[var(--foreground)]",
          )}
        >
          <Icon size="0.875rem" className="shrink-0" />
          {tabTitle(def)}
        </button>
      );
    }
    return (
      <button
        key={def.id}
        type="button"
        data-megumin-tab={def.id}
        onClick={() => openTab(def.id)}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg px-2 py-1 text-left text-[0.8125rem] transition-colors",
          active
            ? "bg-[var(--primary)]/12 font-semibold text-[var(--marinara-chat-chrome-panel-title)] ring-1 ring-[var(--primary)]/35"
            : "text-[var(--marinara-chat-chrome-panel-muted)] hover:bg-[var(--accent)] hover:text-[var(--foreground)]",
        )}
      >
        <span
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
            active ? "mari-megumin-toggle--on" : "bg-[var(--secondary)]/60 ring-1 ring-[var(--border)]/60",
          )}
        >
          <Icon size="0.875rem" />
        </span>
        <span className="min-w-0 flex-1 truncate">{tabTitle(def)}</span>
        {isSynced ? (
          <Earth
            size="0.75rem"
            className="shrink-0 text-emerald-500"
            aria-label={t("megumin.window.syncedTab", { tab: tabTitle(def) })}
          />
        ) : null}
      </button>
    );
  };

  const groupHeading = (label: string) => (
    <div className="px-2 pb-1 pt-3 text-[0.6875rem] font-semibold uppercase tracking-wider text-[var(--marinara-chat-chrome-panel-muted)]">
      {label}
    </div>
  );

  return (
    <div data-component="MeguminWindowBody" className="flex min-h-0 flex-1">
      {/* The dock (src/ui/tabs.js buildDock), always unfolded: the window has the room. */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-[var(--border)]/50 bg-[var(--background)]/30 max-md:hidden">
        <div className="px-3 pb-2 pt-3">
          <MeguminPowerSwitch size="large" />
        </div>
        <nav
          aria-label={t("megumin.panel.tabsLabel")}
          className={cn(NEUTRAL_PANEL_SCROLL_AREA, "flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-2")}
        >
          {visibleTabs.filter((x) => !x.group && !x.bottom).map((def) => navButton(def, "rail"))}
          {GROUPS.map((group) => {
            const items = visibleTabs.filter((x) => x.group === group);
            if (!items.length) return null;
            return (
              <div key={group} className="flex flex-col gap-0.5">
                {groupHeading(t(`megumin.groups.${group}`))}
                {items.map((def) => navButton(def, "rail"))}
              </div>
            );
          })}
        </nav>
        <div className="flex flex-col gap-0.5 border-t border-[var(--border)]/50 p-2">
          {visibleTabs.filter((x) => x.bottom).map((def) => navButton(def, "rail"))}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div
          ref={scrollRef}
          className={cn(
            NEUTRAL_PANEL_SCROLL_AREA,
            // Things scrolled into view stop below the phone strip and the sticky tab header.
            "relative min-h-0 flex-1 scroll-pt-16 overflow-y-auto overscroll-contain md:scroll-pt-24",
          )}
        >
          {/* Phones: the dock as a strip across the top. */}
          <nav
            ref={stripRef}
            aria-label={t("megumin.panel.tabsLabel")}
            className="sticky top-0 z-20 flex gap-1.5 overflow-x-auto border-b border-[var(--border)]/50 bg-[var(--marinara-chat-chrome-panel-bg)] px-3 py-2 backdrop-blur-md [scrollbar-width:none] md:hidden"
          >
            {visibleTabs.map((def) => navButton(def, "strip"))}
          </nav>

          {/* The profile being edited (Megumin's hero banner). */}
          <section className="relative overflow-hidden border-b border-[var(--border)]/50 px-6 py-5 max-md:px-4 max-md:py-4">
            {heroAvatar ? (
              <img
                src={heroAvatar}
                alt=""
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 right-0 h-full w-1/2 object-cover object-[center_20%] opacity-30 [mask-image:linear-gradient(to_left,black_15%,transparent)]"
              />
            ) : null}
            <div className="relative flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-rose-500">
                  {t(`megumin.window.kicker.${level}`)}
                </div>
                <div className="mt-0.5 truncate text-2xl font-extrabold leading-tight text-[var(--marinara-chat-chrome-panel-title)] max-md:text-xl">
                  {profileName}
                </div>
                {view ? (
                  <div className="mt-1 text-xs text-[var(--marinara-chat-chrome-panel-muted)]">
                    {t("megumin.panel.scope.savingTo", {
                      level: t(`megumin.panel.level.${view.profileLevel || "default"}`),
                    })}
                  </div>
                ) : null}
              </div>
              <div className="shrink-0 md:hidden">
                <MeguminPowerSwitch size="compact" />
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label={t("megumin.window.close")}
                title={t("megumin.window.close")}
                className="mari-chrome-control mari-chrome-control--icon relative shrink-0 self-start max-md:h-9 max-md:w-9"
              >
                <X size="1rem" />
              </button>
            </div>
          </section>

          {/* The open tab: its name, what it does, and its Global switch and Reset (Megumin's top bar). */}
          <header className="z-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--border)]/50 bg-[var(--marinara-chat-chrome-panel-bg)] px-6 py-3.5 backdrop-blur-md max-md:px-4 md:sticky md:top-0">
            <span className="mari-megumin-toggle--on flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
              <CurrentIcon size="1.125rem" />
            </span>
            <div className="min-w-0 flex-1 basis-56">
              <h2 className="text-lg font-bold leading-tight text-[var(--marinara-chat-chrome-panel-title)]">
                {tabTitle(current)}
              </h2>
              <p className="mt-0.5 text-xs leading-relaxed text-[var(--marinara-chat-chrome-panel-muted)]">
                {t(`megumin.tabs.${current.id}.sub`)}
              </p>
            </div>
            {view ? (
              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                {alreadyGlobal ? (
                  <span
                    title={t("megumin.panel.sync.alreadyGlobal")}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs text-emerald-500 ring-1 ring-emerald-500/35"
                  >
                    <Earth size="0.875rem" />
                    {t("megumin.window.sync.always")}
                  </span>
                ) : syncable ? (
                  <button
                    type="button"
                    onClick={toggleSync}
                    aria-pressed={synced}
                    disabled={runningActions["sync.tab"] > 0}
                    title={
                      synced
                        ? t("megumin.panel.sync.onTitle", { tab: tabTitle(current) })
                        : t("megumin.panel.sync.offTitle", { tab: tabTitle(current) })
                    }
                    className={cn(
                      "mari-chrome-control mari-chrome-control--small text-xs",
                      synced && "ring-1 ring-emerald-500/40",
                    )}
                  >
                    {/* Coloured inside: the chrome control's own colour wins over a utility on the button. */}
                    <span className={cn("inline-flex items-center gap-1.5", synced && "text-emerald-500")}>
                      <Earth size="0.875rem" className="shrink-0" />
                      {synced ? t("megumin.window.sync.on") : t("megumin.window.sync.off")}
                    </span>
                  </button>
                ) : current.id === "setup" ? (
                  <span className="inline-flex max-w-xs items-start gap-1.5 text-xs leading-relaxed text-[var(--marinara-chat-chrome-panel-muted)]">
                    <Info size="0.875rem" className="mt-0.5 shrink-0" />
                    {t("megumin.panel.sync.loadoutHint")}
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={confirmReset}
                  disabled={reset.isPending}
                  title={t("megumin.panel.reset.title")}
                  className="mari-chrome-control mari-chrome-control--small mari-chrome-control--danger text-xs"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <RotateCcw size="0.875rem" className="shrink-0" />
                    {t("megumin.window.reset")}
                  </span>
                </button>
              </div>
            ) : null}
          </header>

          <div
            data-megumin-tab-content={current.id}
            className="@container flex flex-col gap-4 px-6 pb-10 pt-5 max-md:px-4"
          >
            {viewQuery.isError || catalogQuery.isError ? (
              <p className="text-sm text-[var(--destructive)]">{t("megumin.panel.loadFailed")}</p>
            ) : api ? (
              <MeguminPanelContext.Provider value={api}>
                <Suspense fallback={<WindowLoading />}>
                  <CurrentTab />
                </Suspense>
              </MeguminPanelContext.Provider>
            ) : (
              <WindowLoading />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
