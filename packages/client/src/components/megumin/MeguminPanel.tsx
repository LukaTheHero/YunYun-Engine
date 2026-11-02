// ──────────────────────────────────────────────
// Panel: Megumin Suite
// ──────────────────────────────────────────────
// Megumin's settings window as a YunYun right panel: the MEGUMINTOGGLE, which
// profile is being edited, the per-tab Global switch, and the dock of tabs in
// Megumin's own order and groups (src/ui/tabs.js).
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type LazyExoticComponent,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Ban,
  BookUser,
  BookOpen,
  Boxes,
  Cat,
  ChevronDown,
  Clapperboard,
  Code,
  Compass,
  Earth,
  Image,
  Loader2,
  MemoryStick,
  PenTool,
  Puzzle,
  RotateCcw,
  Server,
  Settings,
  SlidersHorizontal,
  Wrench,
  UserRound,
  PanelRight,
} from "lucide-react";
import { MeguminEngineFlags } from "@marinara-engine/shared/megumin/client";
import { cn } from "../../lib/utils";
import { showConfirmDialog } from "../../lib/app-dialogs";
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
import { MeguminPanelContext, type MeguminPanelApi } from "./megumin-panel-context";
import { MeguminPowerSwitch } from "./MeguminPowerSwitch";
import { MEGUMIN_OPEN_TAB_EVENT, takeRequestedMeguminTab } from "../../lib/megumin-tab-request";

type TabDef = {
  id: string;
  /** Megumin's tab title: also the key of its Global switch (core/sync.js TAB_SYNC_KEYS). */
  syncTitle: string;
  icon: ComponentType<{ size?: string | number; className?: string }>;
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

const GROUPS = [
  { id: "setup" as const, icon: SlidersHorizontal },
  { id: "tools" as const, icon: Wrench },
];

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

function PanelLoading() {
  return (
    <div className="flex items-center justify-center py-10 text-[var(--muted-foreground)]">
      <Loader2 size="1rem" className="animate-spin" />
    </div>
  );
}

export function MeguminPanel() {
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
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set());
  const [runningActions, setRunningActions] = useState<Record<string, number>>({});

  const view = viewQuery.data;
  const catalog = catalogQuery.data;
  const chatId = scope.kind === "chat" ? scope.chatId : null;

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

  const openTab = useCallback((id: string) => {
    setTabId(id);
    const def = TABS.find((x) => x.id === id);
    if (def?.group) setOpenGroups((s) => new Set(s).add(def.group!));
  }, []);

  // "Open in NPC Bank" and the like, from a card (asked before or after the panel mounted).
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

  const synced = !!view?.globalSyncTabs?.[current.syncTitle];
  const syncable = SYNCABLE.has(current.syncTitle);
  const alreadyGlobal = ALREADY_GLOBAL.has(current.syncTitle);

  const toggleSync = async () => {
    if (alreadyGlobal) {
      toast.info(t("megumin.panel.sync.alreadyGlobal"));
      return;
    }
    if (!syncable) {
      toast.info(current.id === "setup" ? t("megumin.panel.sync.loadoutHint") : t("megumin.panel.sync.nothing"));
      return;
    }
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

  const tabButton = (def: TabDef) => {
    const Icon = def.icon;
    const active = def.id === current.id;
    return (
      <button
        key={def.id}
        type="button"
        onClick={() => openTab(def.id)}
        aria-pressed={active}
        className={cn(
          "flex items-center gap-1.5 rounded-md px-2 py-1 text-left text-[0.6875rem] transition-colors",
          active
            ? "bg-[var(--primary)]/15 font-semibold text-[var(--foreground)] ring-1 ring-[var(--primary)]/40"
            : "text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)]",
        )}
      >
        <Icon size="0.75rem" className="shrink-0" />
        <span className="truncate">{t(`megumin.tabs.${def.id}.title`)}</span>
      </button>
    );
  };

  return (
    <div data-component="MeguminPanel" className="flex min-h-full flex-col gap-3 p-3">
      <MeguminPowerSwitch size="large" />

      {viewQuery.isError || catalogQuery.isError ? (
        <p className="text-xs text-[var(--destructive)]">{t("megumin.panel.loadFailed")}</p>
      ) : null}

      {view ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)]/60 bg-[var(--background)]/35 px-2.5 py-2">
          <div className="min-w-0 text-[0.625rem] leading-relaxed text-[var(--marinara-chat-chrome-panel-muted)]">
            <div className="font-medium text-[var(--marinara-chat-chrome-panel-title)]">
              {scope.kind === "chat" ? t("megumin.panel.scope.chat") : t("megumin.panel.scope.global")}
            </div>
            <div className="truncate">
              {t("megumin.panel.scope.savingTo", { level: t(`megumin.panel.level.${view.profileLevel || "default"}`) })}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={toggleSync}
              aria-pressed={synced}
              title={
                alreadyGlobal
                  ? t("megumin.panel.sync.alreadyGlobal")
                  : synced
                    ? t("megumin.panel.sync.onTitle", { tab: t(`megumin.tabs.${current.id}.title`) })
                    : t("megumin.panel.sync.offTitle", { tab: t(`megumin.tabs.${current.id}.title`) })
              }
              className={cn(
                "mari-chrome-control mari-chrome-control--small inline-flex items-center gap-1 text-[0.625rem]",
                (alreadyGlobal || !syncable) && "opacity-55",
                synced && "text-emerald-500",
              )}
            >
              <Earth size="0.75rem" />
              {syncable
                ? synced
                  ? t("megumin.panel.sync.labelOn")
                  : t("megumin.panel.sync.labelOff")
                : t("megumin.panel.sync.label")}
            </button>
            <button
              type="button"
              onClick={confirmReset}
              disabled={reset.isPending}
              title={t("megumin.panel.reset.title")}
              aria-label={t("megumin.panel.reset.title")}
              className="mari-chrome-control mari-chrome-control--small mari-chrome-control--icon"
            >
              <RotateCcw size="0.75rem" />
            </button>
          </div>
        </div>
      ) : null}

      <nav aria-label={t("megumin.panel.tabsLabel")} className="flex flex-col gap-1">
        <div className="grid grid-cols-2 gap-1">{visibleTabs.filter((x) => !x.group && !x.bottom).map(tabButton)}</div>
        {GROUPS.map((group) => {
          const GroupIcon = group.icon;
          const items = visibleTabs.filter((x) => x.group === group.id);
          const open = openGroups.has(group.id) || current.group === group.id;
          return (
            <div key={group.id} className="flex flex-col gap-1">
              <button
                type="button"
                aria-expanded={open}
                onClick={() =>
                  setOpenGroups((s) => {
                    const next = new Set(s);
                    if (next.has(group.id)) next.delete(group.id);
                    else next.add(group.id);
                    return next;
                  })
                }
                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[0.6875rem] font-medium text-[var(--marinara-chat-chrome-panel-title)] hover:bg-[var(--accent)]"
              >
                <GroupIcon size="0.75rem" />
                <span className="flex-1 text-left">{t(`megumin.groups.${group.id}`)}</span>
                <ChevronDown size="0.75rem" className={cn("transition-transform", open && "rotate-180")} />
              </button>
              {open ? <div className="grid grid-cols-2 gap-1 pl-2">{items.map(tabButton)}</div> : null}
            </div>
          );
        })}
        <div className="grid grid-cols-2 gap-1 border-t border-[var(--border)]/50 pt-1">
          {visibleTabs.filter((x) => x.bottom).map(tabButton)}
        </div>
      </nav>

      <header className="flex flex-col gap-0.5">
        <h3 className="text-sm font-semibold text-[var(--marinara-chat-chrome-panel-title)]">
          {t(`megumin.tabs.${current.id}.title`)}
        </h3>
        <p className="text-[0.625rem] leading-relaxed text-[var(--marinara-chat-chrome-panel-muted)]">
          {t(`megumin.tabs.${current.id}.sub`)}
        </p>
      </header>

      {api ? (
        <MeguminPanelContext.Provider value={api}>
          <div className="flex flex-col gap-3 pb-6">
            <Suspense fallback={<PanelLoading />}>
              <CurrentTab />
            </Suspense>
          </div>
        </MeguminPanelContext.Provider>
      ) : viewQuery.isError || catalogQuery.isError ? null : (
        <PanelLoading />
      )}
    </div>
  );
}
