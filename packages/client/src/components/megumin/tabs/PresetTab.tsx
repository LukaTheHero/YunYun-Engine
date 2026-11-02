// ──────────────────────────────────────────────
// Megumin panel: Preset & Thinking
// ──────────────────────────────────────────────
// Which preset tells the story, how it thinks before it writes, and the story's
// standing settings (Story Config). Megumin's src/ui/tabs/coreAndCot.js and the
// Story Config section of src/features/storyconfig/ui.js.
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  Compass,
  Download,
  Earth,
  Lock,
  MessageSquareText,
  Pencil,
  RotateCcw,
  Save,
  Server,
  SlidersHorizontal,
  Star,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { MeguminEngineFlags } from "@marinara-engine/shared/megumin/client";
import { cn } from "../../../lib/utils";
import { showConfirmDialog, showPromptDialog } from "../../../lib/app-dialogs";
import { useMeguminPanel } from "../megumin-panel-context";
import { MEGUMIN_INPUT_CLASS, MeguminButton, MeguminNumber, MeguminSection, useDraftText } from "../MeguminControls";
import { Badge, Callout, PageTabs, PickCard, Segmented, SummaryChip, SwitchRow, engineHas } from "./presetControls";
import {
  COT_MIGRATIONS,
  COT_TYPES,
  ENGINE_DESCRIPTIONS,
  LATEST_VERSIONS,
  STORY_CONFIG_DEFAULTS_FALLBACK,
  THINKING_LANGUAGES,
  V7_MODULES,
  applyStoryConfigDefaults,
  configOptions,
  cotModelId,
  cotTypesFor,
  countActiveConfigFields,
  isEnglishOnlyCot,
  meguminTabState,
  parseCot,
  pickPreset,
  versionOf,
  type MeguminEngine,
  type PresetPage,
} from "./presetData";
import { openMeguminDevEngine } from "../megumin-devmode-open";

const PRESET_TAB_TITLE = "Preset & Thinking";

export function PresetTab() {
  const { t } = useTranslation();
  const { profile, view, catalog, update, openTab } = useMeguminPanel();
  const [page, setPageState] = useState<PresetPage>(meguminTabState.presetPage);
  const setPage = (next: PresetPage) => {
    meguminTabState.presetPage = next;
    setPageState(next);
  };

  const official = (catalog.engines ?? []) as MeguminEngine[];
  const customModes = (view.customModes ?? []) as MeguminEngine[];
  const active = [...official, ...customModes].find((m) => m.id === profile.mode);
  const activeIsCustom = customModes.some((m) => m.id === profile.mode);
  const fields = (catalog.storyConfigFields ?? []) as Array<Record<string, any>>;

  // Megumin's one-time fixes when the tab opens: thinking on by default, old CoT ids renamed, "cot-off" unfolded.
  useEffect(() => {
    const model = String(profile.model || "");
    if (profile.cotEnabled !== undefined && !COT_MIGRATIONS[model] && model !== "cot-off") return;
    update((p) => {
      if (p.cotEnabled === undefined) p.cotEnabled = true;
      if (COT_MIGRATIONS[p.model]) p.model = COT_MIGRATIONS[p.model];
      if (p.model === "cot-off") {
        p.cotEnabled = false;
        p.model = "cot-v7.5-english";
      }
    });
  }, [profile.cotEnabled, profile.model, update]);

  const cot = parseCot(profile.model);
  const cotLabel = COT_TYPES.find((x) => x.id === cot.type)?.label ?? t("megumin.preset.summary.cotNone");
  const cfgCount = countActiveConfigFields(profile.storyConfig, fields);
  const thinkingOn = profile.cotEnabled !== false;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <SummaryChip tone="ok" icon={<Server size="0.625rem" />}>
          {active ? String(active.label) : String(profile.mode ?? "")}
        </SummaryChip>
        <SummaryChip tone={thinkingOn ? "warm" : undefined} icon={<Brain size="0.625rem" />}>
          {thinkingOn
            ? t("megumin.preset.summary.thinking", { name: cotLabel })
            : t("megumin.preset.summary.thinkingOff")}
        </SummaryChip>
        <SummaryChip icon={<SlidersHorizontal size="0.625rem" />}>
          {cfgCount
            ? t("megumin.preset.summary.configSet", { count: cfgCount })
            : t("megumin.preset.summary.configDefaults")}
        </SummaryChip>
        <MeguminButton
          icon={<Compass size="0.75rem" />}
          title={t("megumin.preset.modelSetupTitle")}
          onClick={() => openTab("setup")}
        >
          {t("megumin.preset.modelSetup")}
        </MeguminButton>
      </div>

      <PageTabs
        ariaLabel={t("megumin.preset.pagesLabel")}
        value={page}
        onChange={setPage}
        pages={[
          { id: "preset", label: t("megumin.preset.page.preset"), icon: <Server size="0.6875rem" /> },
          { id: "thinking", label: t("megumin.preset.page.thinking"), icon: <Brain size="0.6875rem" /> },
          { id: "config", label: t("megumin.preset.page.config"), icon: <SlidersHorizontal size="0.6875rem" /> },
        ]}
      />

      {page === "preset" ? (
        <PresetPageView active={active} activeIsCustom={activeIsCustom} official={official} customModes={customModes} />
      ) : page === "thinking" ? (
        <ThinkingPage active={active} cot={cot} />
      ) : (
        <StoryConfigSection />
      )}
    </div>
  );
}

// ── Preset page ──────────────────────────────────────────────────────────

function PresetPageView({
  active,
  activeIsCustom,
  official,
  customModes,
}: {
  active: MeguminEngine | undefined;
  activeIsCustom: boolean;
  official: MeguminEngine[];
  customModes: MeguminEngine[];
}) {
  const { t } = useTranslation();
  const { profile, update } = useMeguminPanel();
  const initialFilter =
    meguminTabState.presetFilter ??
    (activeIsCustom ? "mine" : active && !LATEST_VERSIONS.includes(versionOf(active)) ? "all" : "latest");
  const [filter, setFilterState] = useState<"latest" | "all" | "mine">(initialFilter);
  const setFilter = (next: "latest" | "all" | "mine") => {
    meguminTabState.presetFilter = next;
    setFilterState(next);
  };

  const latest = official.filter((m) => LATEST_VERSIONS.includes(versionOf(m)));
  const list = filter === "mine" ? customModes : filter === "latest" ? latest : official;
  const toggles = (profile.toggles ?? {}) as Record<string, boolean>;

  return (
    <div className="flex flex-col gap-3">
      <Callout tone="gold">{t("megumin.preset.proTip")}</Callout>

      {active && MeguminEngineFlags.isV7Engine(active) ? (
        <MeguminSection title={t("megumin.preset.v7.title")} description={t("megumin.preset.v7.description")}>
          {V7_MODULES.map((mod) => (
            <SwitchRow
              key={mod.id}
              label={mod.label}
              description={mod.desc}
              checked={toggles[mod.id] !== false}
              onChange={(on) =>
                update((p) => {
                  p.toggles = { ...(p.toggles ?? {}), [mod.id]: on };
                })
              }
            />
          ))}
        </MeguminSection>
      ) : null}

      <MeguminSection title={t("megumin.preset.choose.title")}>
        <Segmented
          ariaLabel={t("megumin.preset.choose.filterLabel")}
          value={filter}
          onChange={setFilter}
          options={[
            { id: "latest", label: t("megumin.preset.choose.latest", { count: latest.length }) },
            { id: "all", label: t("megumin.preset.choose.all", { count: official.length }) },
            { id: "mine", label: t("megumin.preset.choose.mine", { count: customModes.length }) },
          ]}
        />
        <div className="grid grid-cols-1 gap-1.5">
          {filter === "mine" && !customModes.length ? (
            <p className="text-[0.625rem] text-[var(--marinara-chat-chrome-panel-muted)]">
              {t("megumin.preset.choose.noneMine")}
            </p>
          ) : null}
          {list.map((m) => (
            <PresetCard key={String(m.id)} engine={m} custom={filter === "mine"} />
          ))}
        </div>
      </MeguminSection>
    </div>
  );
}

function PresetCard({ engine: m, custom }: { engine: MeguminEngine; custom: boolean }) {
  const { t } = useTranslation();
  const { profile, catalog, update, openTab } = useMeguminPanel();
  const isLocked = !custom && m.locked === true;
  const isSel = profile.mode === m.id;
  const directStyles = (catalog.directStyles ?? []) as MeguminEngine[];
  const cotIds = useMemo(
    () => ((catalog.chainsOfThought ?? []) as MeguminEngine[]).map((c) => String(c.id)),
    [catalog.chainsOfThought],
  );
  const showEnhanced = MeguminEngineFlags.isV10Engine(m) && !isLocked;
  const enhancedOn = Boolean(profile.enhancedDialogue && profile.enhancedDialogue[m.id]);

  const badges = custom ? null : (
    <>
      {m.recommended ? (
        <Badge tone="rec" icon={<Star size="0.5rem" />}>
          {t("megumin.preset.badge.recommended")}
        </Badge>
      ) : null}
      {m.isNew && !isLocked ? <Badge tone="new">{t("megumin.preset.badge.new")}</Badge> : null}
      {isLocked ? (
        <Badge tone="locked" icon={<Lock size="0.5rem" />}>
          {t("megumin.preset.badge.comingSoon")}
        </Badge>
      ) : null}
    </>
  );

  return (
    <PickCard
      active={isSel}
      locked={isLocked}
      accent={typeof m.color === "string" ? m.color : undefined}
      onPick={isSel ? undefined : () => update((p) => pickPreset(p, m, directStyles, cotIds))}
      title={String(m.label ?? m.id)}
      titleExtra={
        <>
          {isSel ? (
            <Badge tone="active" icon={<Check size="0.5rem" />}>
              {t("megumin.preset.badge.active")}
            </Badge>
          ) : null}
          {custom ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openMeguminDevEngine(String(m.id), openTab);
              }}
              className="mari-chrome-control mari-chrome-control--small inline-flex items-center gap-1 text-[0.625rem]"
            >
              <Pencil size="0.625rem" />
              {t("megumin.preset.edit")}
            </button>
          ) : null}
        </>
      }
      description={custom ? t("megumin.preset.customDescription") : (ENGINE_DESCRIPTIONS[String(m.id)] ?? "")}
      badges={badges}
    >
      {showEnhanced ? (
        <button
          type="button"
          role="switch"
          aria-checked={enhancedOn}
          title={t("megumin.preset.enhancedDialogue.help")}
          onClick={(e) => {
            // Flipping a setting and switching preset are separate intentions.
            e.stopPropagation();
            update((p) => {
              const map = { ...(p.enhancedDialogue ?? {}) } as Record<string, boolean>;
              if (map[m.id]) delete map[m.id];
              else map[m.id] = true;
              p.enhancedDialogue = map;
            });
          }}
          className={cn(
            "mt-1 flex items-center justify-between gap-2 rounded-md border px-2 py-1 text-left text-[0.625rem]",
            enhancedOn ? "border-emerald-500/40 bg-emerald-500/10" : "border-[var(--border)]/60",
          )}
        >
          <span className="inline-flex items-center gap-1 font-medium">
            <MessageSquareText size="0.625rem" />
            {t("megumin.preset.enhancedDialogue.label")}
          </span>
          <span className={enhancedOn ? "text-emerald-500" : "text-[var(--muted-foreground)]"}>
            {enhancedOn ? t("megumin.preset.on") : t("megumin.preset.off")}
          </span>
        </button>
      ) : null}
    </PickCard>
  );
}

// ── Thinking page ────────────────────────────────────────────────────────

function ThinkingPage({ active, cot }: { active: MeguminEngine | undefined; cot: { type: string; lang: string } }) {
  const { t } = useTranslation();
  const { profile, update, set } = useMeguminPanel();
  const [showAll, setShowAllState] = useState(meguminTabState.showAllCot);
  const [advancedOpen, setAdvancedOpenState] = useState(meguminTabState.thinkingAdvancedOpen);
  const setShowAll = (on: boolean) => {
    meguminTabState.showAllCot = on;
    setShowAllState(on);
  };
  const setAdvancedOpen = (on: boolean) => {
    meguminTabState.thinkingAdvancedOpen = on;
    setAdvancedOpenState(on);
  };

  const thinkingOn = profile.cotEnabled !== false;
  const allowed = cotTypesFor(profile.mode);
  const visible = COT_TYPES.filter((x) => !allowed || showAll || allowed.includes(x.id) || x.id === cot.type);
  const effort = String(profile.thinkEffort || "unspecified");
  const customEffort = String(profile.customThinkEffort || "100");

  return (
    <div className="flex flex-col gap-3">
      <MeguminSection title={t("megumin.preset.thinking.title")}>
        <SwitchRow
          label={t("megumin.preset.thinking.think")}
          description={t("megumin.preset.thinking.thinkDescription")}
          checked={thinkingOn}
          onChange={(on) => set("cotEnabled", on)}
        />
      </MeguminSection>

      {thinkingOn ? (
        <>
          {engineHas(active, "cot") ? <Callout tone="green">{t("megumin.preset.thinking.ownThinking")}</Callout> : null}

          <MeguminSection
            title={t("megumin.preset.thinking.framework")}
            description={
              allowed ? t("megumin.preset.thinking.frameworkMade") : t("megumin.preset.thinking.frameworkAny")
            }
          >
            <div className="grid grid-cols-1 gap-1.5">
              {visible.map((x) => {
                const isSel = cot.type === x.id;
                const warned = !!allowed && !allowed.includes(x.id);
                return (
                  <PickCard
                    key={x.id}
                    active={isSel}
                    onPick={isSel ? undefined : () => set("model", cotModelId(x.id, cot.lang))}
                    title={x.label}
                    titleExtra={
                      isSel ? (
                        <Badge tone="custom" icon={<Check size="0.5rem" />}>
                          {t("megumin.preset.badge.active")}
                        </Badge>
                      ) : null
                    }
                    description={x.desc}
                    badges={
                      warned ? (
                        <Badge tone="warn" icon={<TriangleAlert size="0.5rem" />}>
                          {t("megumin.preset.thinking.otherPreset")}
                        </Badge>
                      ) : x.isNew ? (
                        <Badge tone="new">{t("megumin.preset.badge.new")}</Badge>
                      ) : null
                    }
                  />
                );
              })}
            </div>
            {allowed ? (
              <SwitchRow
                label={t("megumin.preset.thinking.showAll")}
                description={t("megumin.preset.thinking.showAllDescription")}
                checked={showAll}
                onChange={setShowAll}
              />
            ) : null}
          </MeguminSection>

          {cot.type.endsWith("-cap") ? (
            <MeguminSection
              title={t("megumin.preset.thinking.length")}
              description={t("megumin.preset.thinking.capLength")}
            >
              <Callout tone="gold">{t("megumin.preset.thinking.capTip")}</Callout>
            </MeguminSection>
          ) : (
            <MeguminSection title={t("megumin.preset.thinking.length")}>
              <Segmented
                ariaLabel={t("megumin.preset.thinking.length")}
                value={effort}
                onChange={(id) =>
                  update((p) => {
                    p.thinkEffort = id;
                    if (!p.customThinkEffort) p.customThinkEffort = "100";
                  })
                }
                options={[
                  { id: "100", label: t("megumin.preset.thinking.words", { count: 100 }) },
                  { id: "250", label: t("megumin.preset.thinking.words", { count: 250 }) },
                  { id: "450", label: t("megumin.preset.thinking.words", { count: 450 }) },
                  { id: "custom", label: t("megumin.preset.thinking.custom") },
                  { id: "unspecified", label: t("megumin.preset.thinking.noLimit") },
                ]}
              />
              {effort === "custom" ? (
                <MeguminNumber
                  label={t("megumin.preset.thinking.customWords")}
                  value={Number(customEffort) || 0}
                  min={1}
                  onChange={(n) => set("customThinkEffort", String(n))}
                />
              ) : null}
            </MeguminSection>
          )}

          {!isEnglishOnlyCot(cot.type) && cot.type !== "off" ? (
            <MeguminSection
              title={t("megumin.preset.thinking.language")}
              description={t("megumin.preset.thinking.languageDescription")}
            >
              <Segmented
                ariaLabel={t("megumin.preset.thinking.language")}
                value={cot.lang}
                onChange={(id) => set("model", `cot-${cot.type}-${id}`)}
                options={THINKING_LANGUAGES.map((l) => ({ id: l.id, label: l.rec ? `${l.label} ★` : l.label }))}
              />
            </MeguminSection>
          ) : null}

          <div className="rounded-lg border border-[var(--border)]/70 bg-[var(--background)]/35 px-3 py-2">
            <button
              type="button"
              aria-expanded={advancedOpen}
              onClick={() => setAdvancedOpen(!advancedOpen)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--marinara-chat-chrome-panel-title)]"
            >
              {advancedOpen ? <ChevronDown size="0.75rem" /> : <ChevronRight size="0.75rem" />}
              {t("megumin.preset.thinking.advanced")}
            </button>
            {advancedOpen ? (
              <div className="mt-2 flex flex-col gap-1">
                <SwitchRow
                  label={t("megumin.preset.thinking.gemini")}
                  description={t("megumin.preset.thinking.geminiDescription")}
                  checked={profile.thinkingV2 === true}
                  onChange={(on) => set("thinkingV2", on)}
                />
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

// ── Story Config ─────────────────────────────────────────────────────────

function useStoryConfigDefaults(): Record<string, string> {
  const { catalog } = useMeguminPanel();
  return (catalog.storyConfigDefaults as Record<string, string> | undefined) ?? STORY_CONFIG_DEFAULTS_FALLBACK;
}

function StoryConfigSection() {
  const { t } = useTranslation();
  const { profile, view, catalog, update, saveGlobal } = useMeguminPanel();
  const defaults = useStoryConfigDefaults();
  const fields = (catalog.storyConfigFields ?? []) as Array<Record<string, any>>;
  const builtIn = (catalog.storyConfigPresets ?? []) as Array<Record<string, any>>;
  const saved = (view.configPresets ?? []) as Array<Record<string, any>>;
  const presets = [...builtIn, ...saved];
  const [pick, setPick] = useState("");
  const [openRow, setOpenRowState] = useState<string | null>(meguminTabState.openConfigRow);
  const setOpenRow = (key: string | null) => {
    meguminTabState.openConfigRow = key;
    setOpenRowState(key);
  };

  // The standing fields can never be drawn blank: their dropdown has no "Preset default" row to select.
  const cfg = applyStoryConfigDefaults({ ...(profile.storyConfig ?? {}) }, defaults);

  const setField = (key: string, value: string) =>
    update((p) => {
      p.storyConfig = { ...(p.storyConfig ?? {}), [key]: value };
    });

  const load = () => {
    if (!pick) {
      toast.info(t("megumin.preset.config.pickFirst"));
      return;
    }
    const preset = presets.find((x) => x.id === pick);
    if (!preset) return;
    update((p) => {
      const next = { ...(p.storyConfig ?? {}) };
      for (const f of fields) next[f.key] = (preset.values ?? {})[f.key] || "";
      p.storyConfig = applyStoryConfigDefaults(next, defaults);
    });
    toast.success(t("megumin.preset.config.loaded", { name: String(preset.name) }));
  };

  const saveCurrent = async () => {
    const name = await showPromptDialog({
      title: t("megumin.preset.config.saveTitle"),
      message: t("megumin.preset.config.saveMessage"),
    });
    if (!name || !name.trim()) return;
    const values: Record<string, string> = {};
    for (const f of fields) values[f.key] = String(cfg[f.key] || "");
    saveGlobal({
      configPresets: [...saved, { id: `cfgp_${Date.now()}`, name: name.trim(), builtin: false, values }],
    });
    toast.success(t("megumin.preset.config.saved", { name: name.trim() }));
  };

  const remove = async () => {
    if (!pick) {
      toast.info(t("megumin.preset.config.pickFirst"));
      return;
    }
    const preset = presets.find((x) => x.id === pick);
    if (!preset) return;
    if (preset.builtin) {
      toast.warning(t("megumin.preset.config.builtInDelete"));
      return;
    }
    const ok = await showConfirmDialog({
      title: t("megumin.preset.config.deleteTitle"),
      message: t("megumin.preset.config.deleteMessage", { name: String(preset.name) }),
      tone: "destructive",
    });
    if (!ok) return;
    saveGlobal({ configPresets: saved.filter((x) => x.id !== pick) });
    setPick("");
    toast.success(t("megumin.preset.config.deleted"));
  };

  const resetAll = async () => {
    const ok = await showConfirmDialog({
      title: t("megumin.preset.config.resetTitle"),
      message: t("megumin.preset.config.resetMessage"),
      tone: "destructive",
    });
    if (!ok) return;
    update((p) => {
      const next = { ...(p.storyConfig ?? {}) };
      for (const f of fields) next[f.key] = "";
      p.storyConfig = applyStoryConfigDefaults(next, defaults);
    });
  };

  return (
    <MeguminSection
      title={t("megumin.preset.config.title")}
      description={t("megumin.preset.config.description")}
      icon={<SlidersHorizontal size="0.875rem" />}
    >
      <ConfigSyncRow />

      <div className="flex flex-col gap-1.5">
        <select
          className={MEGUMIN_INPUT_CLASS}
          value={pick}
          aria-label={t("megumin.preset.config.loadPlaceholder")}
          onChange={(e) => setPick(e.target.value)}
        >
          <option value="">{t("megumin.preset.config.loadPlaceholder")}</option>
          {builtIn.length ? (
            <optgroup label={t("megumin.preset.config.builtIn")}>
              {builtIn.map((p) => (
                <option key={String(p.id)} value={String(p.id)}>
                  {String(p.name)}
                </option>
              ))}
            </optgroup>
          ) : null}
          {saved.length ? (
            <optgroup label={t("megumin.preset.config.mine")}>
              {saved.map((p) => (
                <option key={String(p.id)} value={String(p.id)}>
                  {String(p.name)}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
        <div className="flex flex-wrap gap-1.5">
          <MeguminButton icon={<Download size="0.75rem" />} onClick={load}>
            {t("megumin.preset.config.load")}
          </MeguminButton>
          <MeguminButton icon={<Save size="0.75rem" />} onClick={() => void saveCurrent()}>
            {t("megumin.preset.config.saveCurrent")}
          </MeguminButton>
          <button
            type="button"
            onClick={() => void remove()}
            aria-label={t("megumin.preset.config.delete")}
            title={t("megumin.preset.config.delete")}
            className="mari-chrome-control mari-chrome-control--small mari-chrome-control--icon mari-chrome-control--danger"
          >
            <Trash2 size="0.75rem" />
          </button>
          <MeguminButton icon={<RotateCcw size="0.75rem" />} onClick={() => void resetAll()}>
            {t("megumin.preset.config.resetAll")}
          </MeguminButton>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        {fields.map((f) => (
          <ConfigFieldRow
            key={String(f.key)}
            field={f}
            value={String(cfg[f.key] ?? "")}
            standing={Object.prototype.hasOwnProperty.call(defaults, f.key)}
            open={openRow === f.key}
            onToggle={() => setOpenRow(openRow === f.key ? null : String(f.key))}
            onChange={(v) => setField(String(f.key), v)}
          />
        ))}
      </div>
    </MeguminSection>
  );
}

/** "Share Story Config with every character": whether these fields ride on this tab's Global switch. */
function ConfigSyncRow() {
  const { t } = useTranslation();
  const { view, flush, run } = useMeguminPanel();
  const [local, setLocal] = useState<boolean | null>(null);
  const on = local ?? (view as Record<string, any>).storyConfigGlobalSync !== false;
  const hostOn = !!view.globalSyncTabs?.[PRESET_TAB_TITLE];

  const toggle = async () => {
    const next = !on;
    setLocal(next);
    try {
      await flush();
      await run("sync.storyConfig", { on: next });
      if (!hostOn) toast.info(t("megumin.preset.config.sync.savedLater"));
      else toast.success(next ? t("megumin.preset.config.sync.nowShared") : t("megumin.preset.config.sync.nowLocal"));
    } catch {
      setLocal(null);
    }
  };

  return (
    <div className="flex items-start gap-2 rounded-lg border border-[var(--border)]/60 bg-[var(--background)]/40 px-2.5 py-2">
      <div className="min-w-0 flex-1">
        <div className="inline-flex items-center gap-1 text-[0.6875rem] font-semibold text-[var(--marinara-chat-chrome-panel-title)]">
          <Earth size="0.6875rem" />
          {t("megumin.preset.config.sync.label")}
        </div>
        <div className="mt-0.5 text-[0.625rem] leading-relaxed text-[var(--marinara-chat-chrome-panel-muted)]">
          {hostOn
            ? on
              ? t("megumin.preset.config.sync.onDescription")
              : t("megumin.preset.config.sync.offDescription")
            : t("megumin.preset.config.sync.hostOff")}
        </div>
      </div>
      <button
        type="button"
        aria-pressed={on}
        onClick={() => void toggle()}
        className={cn(
          "mari-chrome-control mari-chrome-control--small inline-flex shrink-0 items-center gap-1 text-[0.625rem]",
          hostOn ? (on ? "text-emerald-500" : "text-amber-500") : "opacity-55",
        )}
      >
        <Earth size="0.625rem" />
        {on ? t("megumin.preset.on") : t("megumin.preset.off")}
      </button>
    </div>
  );
}

function ConfigFieldRow({
  field: f,
  value,
  standing,
  open,
  onToggle,
  onChange,
}: {
  field: Record<string, any>;
  value: string;
  standing: boolean;
  open: boolean;
  onToggle: () => void;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const isOn = value.trim() !== "";
  const options = configOptions(f);
  const summary = (() => {
    const v = value.trim();
    if (!v) {
      return f.defaultLabel
        ? t("megumin.preset.config.defaultNamed", { name: String(f.defaultLabel) })
        : t("megumin.preset.config.default");
    }
    // The option's short label rather than the long text the model reads.
    return options.find((o) => o.value === v)?.label ?? v;
  })();
  const placeholder = t("megumin.preset.config.placeholder", { example: String(f.placeholder ?? "") });

  return (
    <div
      className={cn(
        "rounded-lg border transition-colors",
        isOn
          ? "border-[var(--primary)]/35 bg-[var(--primary)]/5"
          : "border-[var(--border)]/60 bg-[var(--background)]/30",
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full min-w-0 items-center gap-2 px-2.5 py-1.5 text-left"
      >
        <span
          aria-hidden="true"
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: typeof f.color === "string" ? f.color : undefined }}
        />
        <span className="shrink-0 text-[0.6875rem] font-semibold text-[var(--marinara-chat-chrome-panel-title)]">
          {String(f.label)}
        </span>
        <span className="min-w-0 flex-1 truncate text-right text-[0.625rem] text-[var(--marinara-chat-chrome-panel-muted)]">
          {summary}
        </span>
        <ChevronDown size="0.75rem" className={cn("shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="flex flex-col gap-1.5 border-t border-[var(--border)]/50 px-2.5 py-2">
          {f.hint ? (
            <p className="text-[0.625rem] leading-relaxed text-[var(--marinara-chat-chrome-panel-muted)]">
              {String(f.hint)}
            </p>
          ) : null}
          {f.type === "select" ? (
            <ConfigSelect field={f} value={value} standing={standing} onChange={onChange} />
          ) : (
            <ConfigText field={f} value={value} placeholder={placeholder} onChange={onChange} />
          )}
        </div>
      ) : null}
    </div>
  );
}

const CUSTOM = "__custom";

function ConfigSelect({
  field: f,
  value,
  standing,
  onChange,
}: {
  field: Record<string, any>;
  value: string;
  standing: boolean;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const options = configOptions(f);
  const isOn = value.trim() !== "";
  const isCustomValue = isOn && !options.some((o) => o.value === value);
  const [customOpen, setCustomOpen] = useState(isCustomValue);
  const showCustom = customOpen || isCustomValue;
  const custom = useDraftText(isCustomValue ? value : "", onChange, 500);
  const selected = showCustom ? CUSTOM : value;

  return (
    <>
      <select
        className={MEGUMIN_INPUT_CLASS}
        value={selected}
        aria-label={String(f.label)}
        onChange={(e) => {
          const v = e.target.value;
          if (v === CUSTOM) {
            setCustomOpen(true);
            onChange(custom.draft || "");
          } else {
            setCustomOpen(false);
            onChange(v);
          }
        }}
      >
        {standing ? null : (
          <option value="">
            {f.defaultLabel
              ? t("megumin.preset.config.defaultNamed", { name: String(f.defaultLabel) })
              : t("megumin.preset.config.default")}
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        <option value={CUSTOM}>{t("megumin.preset.config.writeOwn")}</option>
      </select>
      {showCustom ? (
        <input
          className={MEGUMIN_INPUT_CLASS}
          value={custom.draft}
          placeholder={
            typeof f.customPlaceholder === "string" ? f.customPlaceholder : t("megumin.preset.config.ownWay")
          }
          onChange={(e) => custom.change(e.target.value)}
          onBlur={custom.flush}
        />
      ) : null}
    </>
  );
}

function ConfigText({
  field: f,
  value,
  placeholder,
  onChange,
}: {
  field: Record<string, any>;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const text = useDraftText(value, onChange, 500);
  const chips = ((f.chips ?? []) as Array<string | { label: string; value: string; replace?: boolean }>).map((raw) =>
    typeof raw === "string" ? { label: raw, value: raw, replace: false } : { ...raw, replace: !!raw.replace },
  );
  const current = text.draft.trim();
  const parts = current
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const clickChip = (chip: { value: string; replace: boolean }) => {
    let next: string;
    if (chip.replace) {
      // Clicking it again clears the field.
      next = current === chip.value ? "" : chip.value;
    } else {
      const list = [...parts];
      const at = list.indexOf(chip.value);
      if (at > -1) list.splice(at, 1);
      else list.push(chip.value);
      next = list.join(", ");
    }
    text.change(next);
  };

  return (
    <>
      {f.type === "textarea" ? (
        <textarea
          className={cn(MEGUMIN_INPUT_CLASS, "min-h-16 resize-y leading-relaxed")}
          rows={3}
          value={text.draft}
          placeholder={placeholder}
          onChange={(e) => text.change(e.target.value)}
          onBlur={text.flush}
        />
      ) : (
        <input
          className={MEGUMIN_INPUT_CLASS}
          value={text.draft}
          placeholder={placeholder}
          onChange={(e) => text.change(e.target.value)}
          onBlur={text.flush}
        />
      )}
      {chips.length ? (
        <div className="flex flex-wrap gap-1">
          {chips.map((chip) => {
            const on = chip.replace ? current === chip.value : parts.includes(chip.value);
            return (
              <button
                key={`${chip.label}:${chip.value}`}
                type="button"
                aria-pressed={on}
                onClick={() => clickChip(chip)}
                className={cn(
                  "rounded-full px-2 py-0.5 text-[0.625rem] ring-1 transition-colors",
                  on
                    ? "bg-[var(--primary)]/20 text-[var(--foreground)] ring-[var(--primary)]/45"
                    : "text-[var(--muted-foreground)] ring-[var(--border)]/70 hover:bg-[var(--accent)]",
                )}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </>
  );
}
