// ──────────────────────────────────────────────
// Megumin panel: Writing Style
// ──────────────────────────────────────────────
// Megumin's renderStoryConfig + renderStyleEditor (src/features/storyconfig/ui.js):
// the dialogue/narration ratio, the prose style in use (off, a precooked one,
// one from your library), the AI generators that write a style from a
// template, and the style editor (tags, AI author insights, the generated
// rule). Story Config's fields are drawn on the Preset & Thinking tab, as in
// Megumin.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  ArrowLeft,
  BookOpen,
  Check,
  Copy,
  Flame,
  Info,
  Lightbulb,
  Lock,
  Pen,
  PenTool,
  Plus,
  Power,
  RotateCw,
  Scale,
  ScrollText,
  Sparkles,
  Trash2,
  WandSparkles,
  Zap,
  Save,
} from "lucide-react";
import { MeguminEngineFlags } from "@marinara-engine/shared/megumin/client";
import { cn } from "../../../lib/utils";
import { showConfirmDialog } from "../../../lib/app-dialogs";
import { useMeguminPanel } from "../megumin-panel-context";
import {
  MEGUMIN_INPUT_CLASS,
  MeguminButton,
  MeguminHint,
  MeguminNeedsChat,
  MeguminRow,
  MeguminSection,
  MeguminText,
  MeguminToggle,
} from "../MeguminControls";

interface DirectStyle {
  id: string;
  name: string;
  desc?: string;
  rule: string;
}

interface StyleTemplate {
  name: string;
  tags: string[];
  notes: string;
}

interface StyleCategory {
  category: string;
  tags?: Array<{ id: string; hint?: string }>;
}

interface CustomStyle {
  id: string;
  name: string;
  tags: string[];
  generatedOptions?: string[];
  notes?: string;
  rule: string;
}

type Section = "precooked" | "library" | "generators";

const newStyleId = () => `style_${Date.now()}`;

/** The 0–100 ratio slider: drawn live while dragging, saved when let go (Megumin saves on "change"). */
function RatioSlider({ value, onCommit }: { value: number; onCommit: (value: number) => void }) {
  const { t } = useTranslation();
  const [live, setLive] = useState(value);
  const dragging = useRef(false);
  useEffect(() => {
    if (!dragging.current) setLive(value);
  }, [value]);
  const commit = () => {
    dragging.current = false;
    if (live !== value) onCommit(live);
  };
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-[var(--border)] bg-[var(--background)]/40 p-2.5">
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[0.5625rem] font-bold uppercase tracking-wide text-[var(--muted-foreground)]">
            {t("megumin.style.narration")}
          </div>
          <div className="text-sm font-extrabold leading-tight text-purple-500">
            {t("megumin.style.percent", { value: 100 - live })}
          </div>
        </div>
        <div className="min-w-0 text-right">
          <div className="text-[0.5625rem] font-bold uppercase tracking-wide text-[var(--muted-foreground)]">
            {t("megumin.style.dialogue")}
          </div>
          <div className="text-sm font-extrabold leading-tight text-emerald-500">
            {t("megumin.style.percent", { value: live })}
          </div>
        </div>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={10}
        value={live}
        aria-label={t("megumin.style.dnRatioSlider")}
        className="w-full accent-[var(--primary)]"
        onChange={(e) => {
          dragging.current = true;
          setLive(Number(e.target.value));
        }}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
      <div className="flex justify-between text-[0.5rem] uppercase tracking-wide text-[var(--muted-foreground)]">
        <span>{t("megumin.style.moreNarration")}</span>
        <span>{t("megumin.style.moreDialogue")}</span>
      </div>
    </div>
  );
}

/** A tag chip, as Megumin's .wstyle-tag. */
function TagChip({
  label,
  selected,
  title,
  onClick,
  sparkle,
}: {
  label: string;
  selected: boolean;
  title?: string;
  onClick: () => void;
  sparkle?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      title={title}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.625rem] ring-1 transition-colors",
        selected
          ? "bg-purple-500/15 font-semibold text-purple-400 ring-purple-500/40"
          : "text-[var(--muted-foreground)] ring-[var(--border)] hover:bg-[var(--accent)]",
      )}
    >
      {label}
      {sparkle ? <Sparkles size="0.5625rem" className="text-amber-500" /> : null}
    </button>
  );
}

/** Megumin's renderStyleEditor: one style, built from tags (and AI insights) into a rule. */
function StyleEditor({
  initial,
  editId,
  onDone,
}: {
  initial: CustomStyle;
  /** The library entry being edited; null saves a new one. */
  editId: string | null;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { catalog, chatId, update, run, running } = useMeguminPanel();
  const [style, setStyle] = useState<CustomStyle>(() => structuredClone(initial));
  const [templateIndex, setTemplateIndex] = useState("");
  const templates = (catalog.styleTemplates ?? []) as StyleTemplate[];
  const categories = (catalog.styles ?? []) as StyleCategory[];
  const insighting = running("style.insights");
  const ruling = running("style.rule");

  const toggleTag = (tag: string) =>
    setStyle((s) => ({ ...s, tags: s.tags.includes(tag) ? s.tags.filter((x) => x !== tag) : [...s.tags, tag] }));

  const loadTemplate = (value: string) => {
    setTemplateIndex(value);
    const tpl = templates[Number(value)];
    if (!tpl) return;
    setStyle((s) => ({ ...s, name: tpl.name, tags: [...tpl.tags], notes: tpl.notes, rule: "", generatedOptions: [] }));
    toast.info(t("megumin.style.templateLoaded", { name: tpl.name }));
  };

  const save = () => {
    const saved: CustomStyle = { ...style, name: style.name.trim() === "" ? t("megumin.style.unnamed") : style.name };
    update((draft) => {
      if (!Array.isArray(draft.customStyles)) draft.customStyles = [];
      if (!editId) {
        draft.customStyles.push(saved);
      } else {
        const idx = draft.customStyles.findIndex((x: CustomStyle) => x.id === editId);
        if (idx > -1) draft.customStyles[idx] = saved;
      }
      if (draft.activeStyleId === saved.id) draft.aiRule = saved.rule;
    });
    toast.success(t("megumin.style.saved", { name: saved.name }));
    onDone();
  };

  const insights = async () => {
    if (!chatId) {
      toast.warning(t("megumin.style.insightsNeedChat"));
      return;
    }
    try {
      const tags = (await run("style.insights")) as string[] | null;
      if (Array.isArray(tags) && tags.length > 0) {
        setStyle((s) => ({
          ...s,
          // The insights from a previous run go; the new ones are offered with a sparkle.
          tags: s.tags.filter((tag) => !tag.endsWith("✨")),
          generatedOptions: tags.map((tag) => `${tag} ✨`),
        }));
        toast.success(t("megumin.style.insightsDone", { count: tags.length }));
      }
    } catch {
      /* the action reports its own failure */
    }
  };

  const generateRule = async () => {
    if (style.tags.length === 0) {
      toast.warning(t("megumin.style.selectTagsFirst"));
      return;
    }
    try {
      const rule = (await run("style.rule", { tags: style.tags, notes: style.notes ?? "" })) as string | null;
      if (typeof rule === "string" && rule) {
        setStyle((s) => ({ ...s, rule }));
        toast.success(t("megumin.style.ruleGenerated"));
      }
    } catch {
      /* the action reports its own failure */
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <select
        className={cn(MEGUMIN_INPUT_CLASS, "font-semibold text-amber-500")}
        value={templateIndex}
        aria-label={t("megumin.style.loadTemplate")}
        onChange={(e) => loadTemplate(e.target.value)}
      >
        <option value="" disabled>
          {t("megumin.style.loadTemplate")}
        </option>
        {templates.map((tpl, index) => (
          <option key={tpl.name} value={String(index)}>
            {tpl.name}
          </option>
        ))}
      </select>

      <div className="flex flex-wrap items-center gap-1.5">
        <PenTool size="0.875rem" className="shrink-0 text-purple-500" />
        <input
          className={cn(MEGUMIN_INPUT_CLASS, "min-w-0 flex-1")}
          value={style.name}
          placeholder={t("megumin.style.namePlaceholder")}
          aria-label={t("megumin.style.namePlaceholder")}
          onChange={(e) => setStyle((s) => ({ ...s, name: e.target.value }))}
        />
        <MeguminButton variant="primary" icon={<Save size="0.75rem" />} onClick={save}>
          {t("megumin.style.save")}
        </MeguminButton>
        <MeguminButton icon={<ArrowLeft size="0.75rem" />} onClick={onDone}>
          {t("megumin.style.back")}
        </MeguminButton>
      </div>

      <div className="flex flex-col gap-3">
        {categories.map((cat) => (
          <div key={cat.category} className="flex flex-col gap-1">
            <div className="text-[0.625rem] font-bold uppercase tracking-wide text-[var(--marinara-chat-chrome-panel-title)]">
              {cat.category}
            </div>
            <div className="flex flex-wrap gap-1">
              {(cat.tags ?? []).map((tag) => (
                <TagChip
                  key={tag.id}
                  label={tag.id}
                  title={tag.hint}
                  selected={style.tags.includes(tag.id)}
                  onClick={() => toggleTag(tag.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <MeguminSection
        title={t("megumin.style.authorMatches")}
        icon={<Sparkles size="0.875rem" />}
        headerAction={
          <MeguminButton
            icon={<Lightbulb size="0.75rem" />}
            pending={insighting}
            disabled={!chatId}
            onClick={() => void insights()}
          >
            {insighting ? t("megumin.style.brainstorming") : t("megumin.style.generateInsights")}
          </MeguminButton>
        }
      >
        {!chatId ? <MeguminNeedsChat /> : null}
        <div className="flex min-h-5 flex-wrap gap-1">
          {(style.generatedOptions ?? []).map((tag) => (
            <TagChip
              key={tag}
              label={tag.replace(" ✨", "")}
              sparkle
              selected={style.tags.includes(tag)}
              onClick={() => toggleTag(tag)}
            />
          ))}
        </div>
        <MeguminText
          value={style.notes ?? ""}
          placeholder={t("megumin.style.notesPlaceholder")}
          onChange={(v) => setStyle((s) => ({ ...s, notes: v }))}
        />
      </MeguminSection>

      <MeguminSection
        title={t("megumin.style.generatedRule")}
        icon={<ScrollText size="0.875rem" />}
        headerAction={
          <MeguminButton
            variant="primary"
            icon={<Zap size="0.75rem" />}
            pending={ruling}
            disabled={!chatId}
            onClick={() => void generateRule()}
          >
            {ruling ? t("megumin.style.finalizing") : t("megumin.style.generateRule")}
          </MeguminButton>
        }
      >
        <textarea
          className={cn(MEGUMIN_INPUT_CLASS, "min-h-32 resize-y leading-relaxed")}
          rows={7}
          value={style.rule}
          placeholder={t("megumin.style.rulePlaceholder")}
          aria-label={t("megumin.style.generatedRule")}
          onChange={(e) => setStyle((s) => ({ ...s, rule: e.target.value }))}
        />
        <MeguminHint>
          <Info size="0.625rem" className="mr-1 inline" />
          {t("megumin.style.saveCallout")}
        </MeguminHint>
      </MeguminSection>
    </div>
  );
}

export function WritingStyleTab() {
  const { t } = useTranslation();
  const { profile, view, catalog, chatId, update, flush, run, running } = useMeguminPanel();
  const directStyles = useMemo(() => (catalog.directStyles ?? []) as DirectStyle[], [catalog.directStyles]);
  const templates = (catalog.styleTemplates ?? []) as StyleTemplate[];
  const customStyles = (Array.isArray(profile.customStyles) ? profile.customStyles : []) as CustomStyle[];
  const dnRatio = (profile.dnRatio ?? { enabled: false, dialogue: 50 }) as { enabled: boolean; dialogue: number };

  const engine = useMemo(
    () =>
      [...((catalog.engines ?? []) as Array<Record<string, any>>), ...(view.customModes ?? [])].find(
        (m) => m.id === profile.mode,
      ),
    [catalog.engines, profile.mode, view.customModes],
  );
  const lockedStyleEngine = MeguminEngineFlags.engineLocksStyle(engine) as boolean;

  const [section, setSection] = useState<Section>(() =>
    String(profile.activeStyleId ?? "").startsWith("style_") ? "library" : "precooked",
  );
  const [editing, setEditing] = useState<{ style: CustomStyle; editId: string | null } | null>(null);

  // A modern engine needs a style directive: one with none lands on the engine's own (renderStoryConfig).
  useEffect(() => {
    if (!lockedStyleEngine || profile.activeStyleId) return;
    const target = (MeguminEngineFlags.lockedStyleIdFor(engine) as string | null) || "dir_v7";
    const ds = directStyles.find((x) => x.id === target);
    update((draft) => {
      draft.activeStyleId = target;
      if (ds) draft.aiRule = ds.rule;
    });
  }, [directStyles, engine, lockedStyleEngine, profile.activeStyleId, update]);

  const isOff = !profile.activeStyleId;
  const existingNames = customStyles.map((s) => s.name);
  const generatorTemplates = templates.filter((tpl) => !existingNames.includes(tpl.name));
  const activeStyleName = isOff
    ? t("megumin.style.noStyle")
    : (directStyles.find((d) => d.id === profile.activeStyleId)?.name ??
      customStyles.find((s) => s.id === profile.activeStyleId)?.name ??
      t("megumin.style.noStyle"));

  const select = (id: string | null, rule: string) =>
    update((draft) => {
      draft.activeStyleId = id;
      draft.aiRule = rule;
    });

  const removeStyle = async (style: CustomStyle) => {
    const ok = await showConfirmDialog({
      title: t("megumin.style.deleteTitle"),
      message: t("megumin.style.deleteConfirm", { name: style.name }),
      confirmLabel: t("megumin.style.delete"),
      cancelLabel: t("megumin.style.cancel"),
      tone: "destructive",
    });
    if (!ok) return;
    update((draft) => {
      draft.customStyles = (draft.customStyles ?? []).filter((s: CustomStyle) => s.id !== style.id);
      if (draft.activeStyleId === style.id) {
        draft.activeStyleId = null;
        draft.aiRule = "";
      }
    });
  };

  /** The generators write into the saved library, so a pending edit to it is saved first. */
  const runQuietly = (action: string, args: Record<string, unknown>) => {
    flush()
      .then(() => run(action, args))
      .catch(() => {
        /* the action reports its own failure */
      });
  };

  if (editing) {
    return (
      <StyleEditor
        key={editing.style.id}
        initial={editing.style}
        editId={editing.editId}
        onDone={() => {
          setEditing(null);
          setSection("library");
        }}
      />
    );
  }

  const navButton = (id: Section, icon: ReactNode, label: string, count: number) => (
    <button
      type="button"
      aria-pressed={section === id}
      onClick={() => setSection(id)}
      className={cn(
        "flex items-center justify-between gap-1.5 rounded-md px-2 py-1.5 text-[0.6875rem] transition-colors",
        section === id
          ? "bg-[var(--primary)]/15 font-semibold text-[var(--foreground)] ring-1 ring-[var(--primary)]/40"
          : "text-[var(--muted-foreground)] hover:bg-[var(--accent)]",
      )}
    >
      <span className="inline-flex min-w-0 items-center gap-1.5">
        {icon}
        <span className="truncate">{label}</span>
      </span>
      <span className="rounded-full bg-[var(--secondary)]/70 px-1.5 text-[0.5625rem]">{count}</span>
    </button>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <span
          className={cn(
            "inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-0.5 text-[0.625rem] font-semibold ring-1",
            isOff
              ? "text-[var(--muted-foreground)] ring-[var(--border)]"
              : "bg-emerald-500/10 text-emerald-500 ring-emerald-500/25",
          )}
        >
          {isOff ? <Power size="0.625rem" /> : <PenTool size="0.625rem" />}
          {activeStyleName}
        </span>
      </div>

      <MeguminSection title={t("megumin.style.dnRatio")} icon={<Scale size="0.875rem" />}>
        <MeguminToggle
          label={t("megumin.style.dnRatioEnable")}
          help={t("megumin.style.dnRatioHelp")}
          checked={dnRatio.enabled === true}
          onChange={(on) =>
            update((draft) => {
              draft.dnRatio = { ...(draft.dnRatio ?? { dialogue: 50 }), enabled: on };
            })
          }
        />
        {dnRatio.enabled ? (
          <RatioSlider
            value={Number(dnRatio.dialogue) || 0}
            onCommit={(dialogue) =>
              update((draft) => {
                draft.dnRatio = { ...(draft.dnRatio ?? { enabled: true }), dialogue };
              })
            }
          />
        ) : null}
      </MeguminSection>

      <div className="flex flex-col gap-1">
        <div className="text-[0.625rem] font-bold uppercase tracking-wide text-[var(--marinara-chat-chrome-panel-title)]">
          {t("megumin.style.writingStyle")}
        </div>
        <button
          type="button"
          aria-pressed={isOff}
          disabled={lockedStyleEngine}
          title={lockedStyleEngine ? t("megumin.style.offLocked") : undefined}
          onClick={() => select(null, "")}
          className={cn(
            "flex items-center justify-between gap-1.5 rounded-md px-2 py-1.5 text-[0.6875rem] transition-colors disabled:cursor-not-allowed disabled:opacity-60",
            isOff
              ? "bg-emerald-500/10 font-semibold text-emerald-500 ring-1 ring-emerald-500/30"
              : "text-[var(--muted-foreground)] hover:bg-[var(--accent)]",
          )}
        >
          <span className="inline-flex items-center gap-1.5">
            <Power size="0.75rem" className={cn(lockedStyleEngine && "text-[var(--destructive)]")} />
            {t("megumin.style.off")}
          </span>
          {lockedStyleEngine ? <Lock size="0.625rem" className="text-[var(--destructive)]" /> : null}
        </button>
        <div className="mt-1 grid grid-cols-1 gap-1">
          {navButton("precooked", <Flame size="0.75rem" />, t("megumin.style.precooked"), directStyles.length)}
          {navButton("library", <BookOpen size="0.75rem" />, t("megumin.style.library"), customStyles.length)}
          {navButton(
            "generators",
            <WandSparkles size="0.75rem" />,
            t("megumin.style.generators"),
            generatorTemplates.length,
          )}
        </div>
      </div>

      {section === "precooked" ? (
        <MeguminSection title={t("megumin.style.precookedTitle")} icon={<Flame size="0.875rem" />}>
          {directStyles.map((ds) => {
            const selected = profile.activeStyleId === ds.id;
            return (
              <div
                key={ds.id}
                className={cn(
                  "flex flex-col gap-1 rounded-lg border p-2.5 transition-colors",
                  selected
                    ? "border-emerald-500/50 bg-emerald-500/5"
                    : "border-[var(--border)]/70 hover:bg-[var(--accent)]/50",
                )}
              >
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => select(ds.id, ds.rule)}
                  className="flex flex-col gap-1 text-left"
                >
                  <span className="flex w-full items-center justify-between gap-2 text-xs font-semibold">
                    <span className={cn(selected && "text-emerald-500")}>{ds.name}</span>
                    {selected ? <Check size="0.75rem" className="text-emerald-500" /> : null}
                  </span>
                  {ds.desc ? (
                    <span className="text-[0.625rem] leading-relaxed text-[var(--marinara-chat-chrome-panel-muted)]">
                      {ds.desc}
                    </span>
                  ) : null}
                  <span className="line-clamp-4 whitespace-pre-wrap rounded bg-[var(--background)]/50 p-1.5 font-mono text-[0.5625rem] leading-relaxed text-[var(--muted-foreground)]">
                    {ds.rule}
                  </span>
                </button>
                <div>
                  <MeguminButton
                    icon={<Copy size="0.75rem" />}
                    onClick={() => {
                      setEditing({
                        editId: null,
                        style: {
                          id: newStyleId(),
                          name: t("megumin.style.customCopyName", { name: ds.name }),
                          tags: [],
                          generatedOptions: [],
                          notes: ds.desc ?? "",
                          rule: ds.rule,
                        },
                      });
                    }}
                  >
                    {t("megumin.style.editAsCustom")}
                  </MeguminButton>
                </div>
              </div>
            );
          })}
        </MeguminSection>
      ) : null}

      {section === "library" ? (
        <MeguminSection title={t("megumin.style.libraryTitle")} icon={<BookOpen size="0.875rem" />}>
          <button
            type="button"
            onClick={() =>
              setEditing({
                editId: null,
                style: { id: newStyleId(), name: "", tags: [], generatedOptions: [], notes: "", rule: "" },
              })
            }
            className="flex min-h-16 items-center justify-center gap-1.5 rounded-lg border border-dashed border-emerald-500/50 text-xs font-semibold text-emerald-500 hover:bg-emerald-500/5"
          >
            <Plus size="0.875rem" />
            {t("megumin.style.createNew")}
          </button>
          {customStyles.map((style) => {
            const selected = profile.activeStyleId === style.id;
            const action = "style.regenerate";
            return (
              <div
                key={style.id}
                className={cn(
                  "flex flex-col gap-1 rounded-lg border p-2.5 transition-colors",
                  selected
                    ? "border-emerald-500/50 bg-emerald-500/5"
                    : "border-[var(--border)]/70 hover:bg-[var(--accent)]/50",
                )}
              >
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => select(style.id, style.rule)}
                  className="flex flex-col gap-1 text-left"
                >
                  <span className="flex w-full items-center justify-between gap-2 text-xs font-semibold">
                    <span className={cn(selected && "text-emerald-500")}>{style.name}</span>
                    {selected ? <Check size="0.75rem" className="text-emerald-500" /> : null}
                  </span>
                  <span className="line-clamp-2 text-[0.625rem] leading-relaxed text-[var(--marinara-chat-chrome-panel-muted)]">
                    {style.notes || t("megumin.style.customFallbackNotes")}
                  </span>
                </button>
                <MeguminRow>
                  <MeguminButton
                    icon={<Pen size="0.75rem" />}
                    onClick={() => setEditing({ editId: style.id, style: structuredClone(style) })}
                  >
                    {t("megumin.style.edit")}
                  </MeguminButton>
                  <MeguminButton
                    icon={<RotateCw size="0.75rem" />}
                    title={t("megumin.style.regenerate")}
                    pending={running(action)}
                    disabled={!chatId}
                    onClick={() => runQuietly(action, { id: style.id })}
                  >
                    {t("megumin.style.regenerateShort")}
                  </MeguminButton>
                  <MeguminButton
                    variant="danger"
                    icon={<Trash2 size="0.75rem" />}
                    title={t("megumin.style.delete")}
                    onClick={() => void removeStyle(style)}
                  >
                    {t("megumin.style.delete")}
                  </MeguminButton>
                </MeguminRow>
              </div>
            );
          })}
          {customStyles.length > 0 && !chatId ? <MeguminNeedsChat /> : null}
        </MeguminSection>
      ) : null}

      {section === "generators" ? (
        <MeguminSection title={t("megumin.style.generatorsTitle")} icon={<WandSparkles size="0.875rem" />}>
          {!chatId ? <MeguminNeedsChat /> : null}
          {generatorTemplates.length === 0 ? <MeguminHint>{t("megumin.style.generatorsEmpty")}</MeguminHint> : null}
          {generatorTemplates.map((tpl) => (
            <div
              key={tpl.name}
              className="flex flex-col gap-1.5 rounded-lg border border-dashed border-purple-500/40 bg-purple-500/[0.02] p-2.5"
            >
              <div className="text-xs font-semibold text-purple-400">{tpl.name}</div>
              <div className="text-[0.625rem] leading-relaxed text-[var(--marinara-chat-chrome-panel-muted)]">
                {tpl.notes}
              </div>
              <MeguminButton
                icon={<Zap size="0.75rem" />}
                pending={running("style.template")}
                disabled={!chatId}
                onClick={() => runQuietly("style.template", { name: tpl.name })}
              >
                {running("style.template") ? t("megumin.style.generating") : t("megumin.style.generateThis")}
              </MeguminButton>
            </div>
          ))}
        </MeguminSection>
      ) : null}
    </div>
  );
}
