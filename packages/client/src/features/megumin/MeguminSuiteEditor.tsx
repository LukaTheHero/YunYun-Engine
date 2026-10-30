// ──────────────────────────────────────────────
// Megumin Suite editor (main area, opened like the preset editor)
// ──────────────────────────────────────────────
// Every edit saves at once to the scope the server reads it from (this chat, the character or the
// Global default); the scope bar always says which. Writes need Megumin Mode on, reads do not.
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  ArrowLeft,
  Cpu,
  Loader2,
  PenLine,
  Puzzle,
  RotateCcw,
  Settings2,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import {
  MEGUMIN_ENGINE_CATALOG,
  MEGUMIN_SETTINGS_WARN_BYTES,
  MEGUMIN_SYNC_TABS,
  type MeguminSyncTab,
} from "@marinara-engine/shared";
import { EditorTabNavigation } from "../../components/ui/EditorTabNavigation";
import { showConfirmDialog } from "../../lib/app-dialogs";
import { cn } from "../../lib/utils";
import { getChatCharacterIds } from "../../lib/chat-macros";
import { useCharacterSummaries } from "../../hooks/use-characters";
import { useFeatureEnabled } from "../../hooks/use-feature-settings";
import { useDialogStore } from "../../stores/dialog.store";
import { useUIStore } from "../../stores/ui.store";
import { MEGUMIN_BANNER_URL } from "./megumin-assets";
import { MeguminCallout, MeguminToggle } from "./megumin-ui";
import { useMeguminSwitch } from "./use-megumin-assign";
import { useMeguminEditor, type MeguminEditorView } from "./use-megumin-settings";
import { AddonsTab } from "./tabs/AddonsTab";
import { EngineTab } from "./tabs/EngineTab";
import { NarratorTab } from "./tabs/NarratorTab";
import { SettingsTab } from "./tabs/SettingsTab";
import { StyleTab } from "./tabs/StyleTab";
import type { MeguminActiveEngine } from "./tabs/tab-props";

const TABS: ReadonlyArray<{
  id: "engine" | "narrator" | "style" | "addons" | "settings";
  icon: LucideIcon;
  labelKey: string;
}> = [
  { id: "engine", icon: Cpu, labelKey: "megumin.editor.tabs.engine" },
  { id: "narrator", icon: UserRound, labelKey: "megumin.editor.tabs.narrator" },
  { id: "style", icon: PenLine, labelKey: "megumin.editor.tabs.style" },
  { id: "addons", icon: Puzzle, labelKey: "megumin.editor.tabs.addons" },
  { id: "settings", icon: Settings2, labelKey: "megumin.editor.tabs.settings" },
];
type TabId = (typeof TABS)[number]["id"];

function normalizeTab(value: string | null): TabId {
  return TABS.some((tab) => tab.id === value) ? (value as TabId) : "engine";
}

export function MeguminSuiteEditor() {
  const { t } = useTranslation();
  const tab = normalizeTab(useUIStore((state) => state.meguminSuiteTab));
  const setTab = useUIStore((state) => state.setMeguminSuiteTab);
  const close = useUIStore((state) => state.closeMeguminSuite);
  const enabled = useFeatureEnabled("meguminMode");
  const { setEnabled, pending, lockedBy } = useMeguminSwitch();
  const [view, setView] = useState<MeguminEditorView>("chat");
  const editor = useMeguminEditor(view);
  const { settings, state, chat } = editor;
  const { data: characters } = useCharacterSummaries(state?.characterId ? [state.characterId] : []);
  const characterName = characters?.find((character) => character.id === state?.characterId)?.name ?? "";
  const titleRef = useRef<HTMLHeadingElement>(null);

  // No Roleplay chat to edit: the Global default is all there is.
  const effectiveView: MeguminEditorView = chat ? view : "default";
  const scope = effectiveView === "default" ? "default" : (state?.writeScope ?? "default");
  const syncTab = (MEGUMIN_SYNC_TABS as readonly string[]).includes(tab) ? (tab as MeguminSyncTab) : null;
  const tabIsGlobal = !!syncTab && settings?.globalTabs[syncTab] === true;

  const engine: MeguminActiveEngine | null = useMemo(() => {
    const mode = state?.profile.mode;
    if (!mode) return null;
    return (
      MEGUMIN_ENGINE_CATALOG.find((entry) => entry.id === mode) ??
      settings?.customEngines.find((entry) => entry.id === mode) ??
      null
    );
  }, [settings?.customEngines, state?.profile.mode]);

  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, []);

  // Escape closes the editor, unless a dialog, a menu or a text box has a use for it.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (useDialogStore.getState().dialog || useUIStore.getState().modal) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true'], [role='menu']")) return;
      if (document.querySelector("[data-megumin-suite-editor] [aria-expanded='true']")) return;
      close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close]);

  const tabs = useMemo(() => TABS.map((item) => ({ id: item.id, icon: item.icon, label: t(item.labelKey) })), [t]);

  const scopeLabel =
    scope === "chat"
      ? t("megumin.scope.chat")
      : scope === "character"
        ? t("megumin.scope.characterNamed", { name: characterName || t("megumin.scope.character") })
        : t("megumin.scope.default");

  const resetScope = async () => {
    const confirmed = await showConfirmDialog({
      title: t("megumin.editor.resetTitle"),
      message: t("megumin.editor.resetMessage", { scope: scopeLabel }),
      confirmLabel: t("megumin.editor.reset"),
      cancelLabel: t("megumin.common.cancel"),
      tone: "destructive",
    });
    if (confirmed) await editor.resetScope(scope);
  };

  const chooseCharacterScope = async () => {
    setView("chat");
    if (state?.writeScope !== "chat") return;
    const confirmed = await showConfirmDialog({
      title: t("megumin.scope.unpinTitle"),
      message: t("megumin.scope.unpinMessage", { name: characterName || t("megumin.scope.character") }),
      confirmLabel: t("megumin.scope.unpinConfirm"),
      cancelLabel: t("megumin.common.cancel"),
    });
    if (confirmed) await editor.resetScope("chat");
  };

  const chooseChatScope = async () => {
    setView("chat");
    if (state && state.writeScope !== "chat") await editor.pinChat();
  };

  // Single-character chats in Per Character mode without their own profile can use the character's.
  const characterScopeReason = !chat
    ? t("megumin.scope.needsChat")
    : getChatCharacterIds(chat).length !== 1
      ? t("megumin.scope.groupChat")
      : settings?.global.saveMode === "chat"
        ? t("megumin.scope.perChatMode")
        : null;

  const scopeButtons: Array<{ id: "chat" | "character" | "default"; label: string; reason: string | null }> = [
    { id: "chat", label: t("megumin.scope.chat"), reason: chat ? null : t("megumin.scope.needsChat") },
    {
      id: "character",
      label: characterName ? t("megumin.scope.characterNamed", { name: characterName }) : t("megumin.scope.character"),
      reason: characterScopeReason,
    },
    { id: "default", label: t("megumin.scope.default"), reason: null },
  ];

  return (
    <section
      data-megumin-suite-editor
      aria-labelledby="megumin-suite-title"
      className="mari-editor-shell mari-editor-legacy-bridge flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <header className="mari-editor-header mari-editor-header--with-nav">
        <div className="mari-editor-header-main">
          <button
            type="button"
            onClick={close}
            aria-label={t("megumin.editor.close")}
            title={t("megumin.editor.close")}
            className="mari-editor-action inline-flex"
          >
            <ArrowLeft size="1.125rem" />
          </button>
          <div className="mari-editor-icon-tile overflow-hidden">
            <img src={MEGUMIN_BANNER_URL} alt="" className="h-full w-full object-cover" draggable={false} />
          </div>
          <h1
            id="megumin-suite-title"
            ref={titleRef}
            tabIndex={-1}
            className="mari-editor-title min-w-0 flex-1 truncate focus:outline-none"
          >
            {t("megumin.editor.title")}
          </h1>
        </div>
        <EditorTabNavigation tabs={tabs} activeId={tab} onChange={setTab} />
        <div className="mari-editor-actions flex">
          {tab !== "settings" && (
            <button
              type="button"
              onClick={() => void resetScope()}
              disabled={!enabled || !state}
              className="mari-editor-action mari-editor-action--danger inline-flex disabled:opacity-50"
              title={t("megumin.editor.resetHelp")}
              aria-label={t("megumin.editor.resetHelp")}
            >
              <RotateCcw size="0.875rem" />
              <span className="mari-editor-save-label">{t("megumin.editor.reset")}</span>
            </button>
          )}
        </div>
      </header>

      <div className="mari-editor-content max-md:p-3">
        <div className="mari-editor-content-inner mari-editor-content-inner--wide flex flex-col gap-4 pb-8">
          {!enabled && (
            <div
              data-megumin-editor-off
              className="mari-editor-panel mari-editor-panel--soft flex flex-wrap items-center gap-3 p-3 text-xs"
            >
              <span className="min-w-0 flex-1">{t("megumin.editor.offNotice")}</span>
              {!lockedBy && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void setEnabled(true).catch(() => toast.error(t("megumin.presetCard.saveFailed")))}
                  className="mari-editor-action mari-editor-action--accent inline-flex px-3 disabled:opacity-50"
                >
                  {t("megumin.offBanner.turnOn")}
                </button>
              )}
            </div>
          )}

          {editor.isError && <MeguminCallout tone="warning">{t("megumin.editor.loadFailed")}</MeguminCallout>}
          {editor.sizeBytes > MEGUMIN_SETTINGS_WARN_BYTES && (
            <MeguminCallout tone="warning">{t("megumin.editor.sizeWarning")}</MeguminCallout>
          )}

          {tab !== "settings" && (
            <div data-megumin-scope className="mari-editor-panel flex flex-col gap-2 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold">{t("megumin.scope.label")}</span>
                <div role="group" aria-label={t("megumin.scope.label")} className="flex flex-wrap gap-1">
                  {scopeButtons.map((button) => (
                    <button
                      key={button.id}
                      type="button"
                      aria-pressed={scope === button.id}
                      disabled={!!button.reason}
                      title={button.reason ?? undefined}
                      onClick={() => {
                        // While the switch is off nothing can be saved, so the buttons only change the view.
                        if (button.id === "default" || !enabled) setView(button.id === "default" ? "default" : "chat");
                        else void (button.id === "chat" ? chooseChatScope() : chooseCharacterScope());
                      }}
                      className={cn(
                        "mari-editor-chip px-2.5 py-1 text-[0.6875rem] disabled:cursor-not-allowed disabled:opacity-50",
                        scope === button.id && "mari-editor-chip--accent",
                      )}
                    >
                      {button.label}
                    </button>
                  ))}
                </div>
              </div>
              <p
                data-megumin-scope-description
                className="text-[0.6875rem] leading-relaxed text-[var(--marinara-editor-muted)]"
              >
                {scope === "chat"
                  ? t("megumin.scope.chatHelp", { chat: chat?.name ?? "" })
                  : scope === "character"
                    ? t("megumin.scope.characterHelp", { name: characterName || t("megumin.scope.character") })
                    : t("megumin.scope.defaultHelp")}
                {tabIsGlobal && scope !== "default" && <> {t("megumin.scope.globalTabNote")}</>}
              </p>
            </div>
          )}

          {!settings || !state ? (
            <div className="flex justify-center p-6">
              <Loader2 size="1.25rem" className="animate-spin text-[var(--marinara-editor-muted)]" />
            </div>
          ) : (
            <fieldset disabled={!enabled} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
              {syncTab && (
                <MeguminToggle
                  label={t("megumin.editor.globalTab")}
                  description={t("megumin.editor.globalTabHelp")}
                  checked={tabIsGlobal}
                  onChange={(value) =>
                    void editor.saveSettings((current) => ({ globalTabs: { ...current.globalTabs, [syncTab]: value } }))
                  }
                />
              )}
              {tab === "engine" && (
                <EngineTab editor={editor} profile={state.profile} settings={settings} engine={engine} />
              )}
              {tab === "narrator" && (
                <NarratorTab editor={editor} profile={state.profile} settings={settings} engine={engine} />
              )}
              {tab === "style" && (
                <StyleTab editor={editor} profile={state.profile} settings={settings} engine={engine} />
              )}
              {tab === "addons" && (
                <AddonsTab editor={editor} profile={state.profile} settings={settings} engine={engine} />
              )}
              {tab === "settings" && <SettingsTab editor={editor} settings={settings} />}
            </fieldset>
          )}
        </div>
      </div>
    </section>
  );
}
