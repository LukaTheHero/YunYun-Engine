// ──────────────────────────────────────────────
// Megumin Suite editor: Writing Style (DN ratio, precooked styles, the custom library, generators)
// ──────────────────────────────────────────────
// Picking a style saves only its id and clears aiRule: the server reads a precooked style's rule
// (server-only text) or the custom style's own rule by id. The AI generators need the Megumin task
// runner's style tasks, which a later phase adds, so they are shown but disabled.
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  MEGUMIN_DIRECT_STYLE_CATALOG,
  MEGUMIN_MAX_CUSTOM_STYLES,
  MEGUMIN_STYLE_TAG_CATEGORIES,
  MEGUMIN_STYLE_TEMPLATE_CATALOG,
  engineLocksStyle,
  lockedStyleIdFor,
  type MeguminCustomStyle,
} from "@marinara-engine/shared";
import { showConfirmDialog } from "../../../lib/app-dialogs";
import { cn, generateClientId } from "../../../lib/utils";
import { meguminStyleKey, meguminTagCategoryKey, meguminTemplateKey } from "../megumin-keys";
import {
  MeguminBadge,
  MeguminCallout,
  MeguminGrid,
  MeguminHeading,
  MeguminOptionCard,
  MeguminToggle,
} from "../megumin-ui";
import type { MeguminTabProps } from "./tab-props";

type Section = "precooked" | "library" | "generators";
type Draft = Pick<MeguminCustomStyle, "id" | "name" | "tags" | "notes" | "rule">;

export function StyleTab({ editor, profile, engine }: MeguminTabProps) {
  const { t } = useTranslation();
  const locks = engineLocksStyle(engine);
  const activeId = profile.activeStyleId ?? (locks ? lockedStyleIdFor(engine) : null);
  const customStyles = profile.customStyles;
  const [section, setSection] = useState<Section>(activeId?.startsWith("style_") ? "library" : "precooked");
  const [draft, setDraft] = useState<Draft | null>(null);
  const takenNames = new Set(customStyles.map((style) => style.name));
  const templates = MEGUMIN_STYLE_TEMPLATE_CATALOG.filter((template) => !takenNames.has(template.name));

  const activeName = !activeId
    ? t("megumin.style.noStyle")
    : MEGUMIN_DIRECT_STYLE_CATALOG.some((style) => style.id === activeId)
      ? t(meguminStyleKey(activeId, "name"))
      : (customStyles.find((style) => style.id === activeId)?.name ?? activeId);

  const select = (styleId: string | null) => void editor.update({ activeStyleId: styleId, aiRule: "" });

  if (draft) {
    return (
      <StyleEditor
        draft={draft}
        onCancel={() => setDraft(null)}
        onSave={(saved) => {
          const name = saved.name.trim() || t("megumin.style.unnamed");
          const style = { ...saved, name, generatedOptions: [] };
          const exists = customStyles.some((entry) => entry.id === style.id);
          void editor.update({
            customStyles: exists
              ? customStyles.map((entry) => (entry.id === style.id ? { ...entry, ...style } : entry))
              : [...customStyles, style],
          });
          setDraft(null);
          setSection("library");
        }}
      />
    );
  }

  const sections: Array<{ id: Section; label: string; count: number }> = [
    { id: "precooked", label: t("megumin.style.sections.precooked"), count: MEGUMIN_DIRECT_STYLE_CATALOG.length },
    { id: "library", label: t("megumin.style.sections.library"), count: customStyles.length },
    { id: "generators", label: t("megumin.style.sections.generators"), count: templates.length },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <MeguminHeading description={t("megumin.style.description")}>{t("megumin.style.title")}</MeguminHeading>
        <MeguminBadge tone={activeId ? "accent" : "muted"}>{activeName}</MeguminBadge>
      </div>

      <DnRatio editor={editor} profile={profile} />

      <MeguminOptionCard
        compact
        title={t("megumin.style.off")}
        description={t("megumin.style.offHelp")}
        selected={!activeId}
        disabled={locks}
        disabledReason={t("megumin.style.offLocked")}
        onSelect={() => select(null)}
      />

      <div role="group" aria-label={t("megumin.style.sections.label")} className="flex flex-wrap gap-1">
        {sections.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={section === item.id}
            onClick={() => setSection(item.id)}
            className={cn("mari-editor-chip px-3 py-1.5 text-xs", section === item.id && "mari-editor-chip--accent")}
          >
            {item.label}
            <span className="mari-editor-tab-badge">{item.count}</span>
          </button>
        ))}
      </div>

      {section === "precooked" && (
        <MeguminGrid>
          {MEGUMIN_DIRECT_STYLE_CATALOG.map((style) => (
            <MeguminOptionCard
              key={style.id}
              title={t(meguminStyleKey(style.id, "name"))}
              description={t(meguminStyleKey(style.id, "description"))}
              selected={activeId === style.id}
              onSelect={() => select(style.id)}
            />
          ))}
        </MeguminGrid>
      )}

      {section === "library" && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={customStyles.length >= MEGUMIN_MAX_CUSTOM_STYLES}
            onClick={() => setDraft({ id: `style_${generateClientId()}`, name: "", tags: [], notes: "", rule: "" })}
            className="mari-editor-empty px-4 py-3 text-xs font-semibold disabled:opacity-50"
          >
            {t("megumin.style.create")}
          </button>
          <MeguminGrid>
            {customStyles.map((style) => (
              <MeguminOptionCard
                key={style.id}
                title={style.name}
                description={style.notes || t("megumin.style.customFallback")}
                selected={activeId === style.id}
                onSelect={() => select(style.id)}
              >
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => setDraft({ ...style })}
                    className="mari-editor-action inline-flex px-2.5 text-[0.6875rem]"
                  >
                    {t("megumin.style.edit")}
                  </button>
                  <button
                    type="button"
                    disabled
                    title={t("megumin.style.generatorsLater")}
                    className="mari-editor-action inline-flex px-2.5 text-[0.6875rem] disabled:opacity-50"
                  >
                    {t("megumin.style.regenerate")}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const confirmed = await showConfirmDialog({
                        title: t("megumin.style.deleteTitle"),
                        message: t("megumin.style.deleteMessage", { name: style.name }),
                        confirmLabel: t("megumin.common.delete"),
                        cancelLabel: t("megumin.common.cancel"),
                        tone: "destructive",
                      });
                      if (!confirmed) return;
                      void editor.update({
                        customStyles: customStyles.filter((entry) => entry.id !== style.id),
                        ...(profile.activeStyleId === style.id ? { activeStyleId: null, aiRule: "" } : {}),
                      });
                    }}
                    className="mari-editor-action mari-editor-action--danger inline-flex px-2.5 text-[0.6875rem]"
                  >
                    {t("megumin.common.delete")}
                  </button>
                </div>
              </MeguminOptionCard>
            ))}
          </MeguminGrid>
        </div>
      )}

      {section === "generators" && (
        <div className="flex flex-col gap-2">
          <MeguminCallout>{t("megumin.style.generatorsLater")}</MeguminCallout>
          <MeguminGrid>
            {templates.map((template) => (
              <div key={template.name} className="mari-editor-panel flex flex-col gap-2 p-3">
                <h3 className="text-sm font-semibold">{t(meguminTemplateKey(template.name))}</h3>
                <div className="flex flex-wrap gap-1">
                  {template.tags.map((tag) => (
                    <MeguminBadge key={tag}>{tag}</MeguminBadge>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    disabled
                    title={t("megumin.style.generatorsLater")}
                    className="mari-editor-action inline-flex px-2.5 text-[0.6875rem] disabled:opacity-50"
                  >
                    {t("megumin.style.generate")}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft({
                        id: `style_${generateClientId()}`,
                        name: t(meguminTemplateKey(template.name)),
                        tags: [...template.tags],
                        notes: "",
                        rule: "",
                      })
                    }
                    className="mari-editor-action inline-flex px-2.5 text-[0.6875rem]"
                  >
                    {t("megumin.style.startFrom")}
                  </button>
                </div>
              </div>
            ))}
          </MeguminGrid>
        </div>
      )}
    </div>
  );
}

function DnRatio({ editor, profile }: Pick<MeguminTabProps, "editor" | "profile">) {
  const { t } = useTranslation();
  const [dialogue, setDialogue] = useState(profile.dnRatio.dialogue);
  const timer = useRef<number | null>(null);
  useEffect(() => setDialogue(profile.dnRatio.dialogue), [profile.dnRatio.dialogue]);
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );
  return (
    <div className="flex flex-col gap-2">
      <MeguminToggle
        label={t("megumin.style.dnRatio.label")}
        description={t("megumin.style.dnRatio.help")}
        checked={profile.dnRatio.enabled}
        onChange={(enabled) => void editor.update({ dnRatio: { ...profile.dnRatio, enabled } })}
      />
      {profile.dnRatio.enabled && (
        <div className="mari-editor-panel flex flex-col gap-1.5 p-3">
          <div className="flex justify-between text-[0.6875rem] font-semibold">
            <span>{t("megumin.style.dnRatio.narration", { value: 100 - dialogue })}</span>
            <span>{t("megumin.style.dnRatio.dialogue", { value: dialogue })}</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={10}
            value={dialogue}
            aria-label={t("megumin.style.dnRatio.slider")}
            aria-valuetext={t("megumin.style.dnRatio.dialogue", { value: dialogue })}
            onChange={(event) => {
              const next = Number(event.target.value);
              setDialogue(next);
              if (timer.current !== null) window.clearTimeout(timer.current);
              timer.current = window.setTimeout(
                () => void editor.update({ dnRatio: { ...profile.dnRatio, dialogue: next } }),
                400,
              );
            }}
            className="w-full accent-[var(--marinara-editor-accent)]"
          />
          <div className="flex justify-between text-[0.625rem] text-[var(--marinara-editor-muted)]">
            <span>{t("megumin.style.dnRatio.moreNarration")}</span>
            <span>{t("megumin.style.dnRatio.moreDialogue")}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function StyleEditor({
  draft,
  onSave,
  onCancel,
}: {
  draft: Draft;
  onSave: (draft: Draft) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [style, setStyle] = useState(draft);
  const toggleTag = (tag: string) =>
    setStyle((current) => ({
      ...current,
      tags: current.tags.includes(tag) ? current.tags.filter((entry) => entry !== tag) : [...current.tags, tag],
    }));

  return (
    <div className="flex flex-col gap-3" data-megumin-style-editor>
      <MeguminHeading description={t("megumin.style.editor.description")}>
        {t("megumin.style.editor.title")}
      </MeguminHeading>
      <select
        aria-label={t("megumin.style.editor.template")}
        value=""
        onChange={(event) => {
          const template = MEGUMIN_STYLE_TEMPLATE_CATALOG.find((entry) => entry.name === event.target.value);
          if (template) {
            setStyle((current) => ({
              ...current,
              name: t(meguminTemplateKey(template.name)),
              tags: [...template.tags],
              rule: "",
            }));
          }
        }}
        className="mari-editor-field px-2.5 py-2 text-xs"
      >
        <option value="">{t("megumin.style.editor.template")}</option>
        {MEGUMIN_STYLE_TEMPLATE_CATALOG.map((template) => (
          <option key={template.name} value={template.name}>
            {t(meguminTemplateKey(template.name))}
          </option>
        ))}
      </select>
      <input
        type="text"
        aria-label={t("megumin.style.editor.name")}
        placeholder={t("megumin.style.editor.name")}
        maxLength={200}
        value={style.name}
        onChange={(event) => setStyle((current) => ({ ...current, name: event.target.value }))}
        className="mari-editor-field px-3 py-2 text-sm font-semibold"
      />
      {MEGUMIN_STYLE_TAG_CATEGORIES.map((category) => (
        <div key={category.category} className="flex flex-col gap-1.5">
          <h3 className="text-xs font-semibold">{t(meguminTagCategoryKey(category.category))}</h3>
          <div role="group" aria-label={t(meguminTagCategoryKey(category.category))} className="flex flex-wrap gap-1">
            {category.tags.map((tag) => (
              <button
                key={tag}
                type="button"
                aria-pressed={style.tags.includes(tag)}
                onClick={() => toggleTag(tag)}
                className={cn(
                  "mari-editor-chip px-2 py-0.5 text-[0.6875rem]",
                  style.tags.includes(tag) && "mari-editor-chip--accent",
                )}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="mari-editor-panel flex flex-col gap-2 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-semibold">{t("megumin.style.editor.insights")}</h3>
          <button
            type="button"
            disabled
            title={t("megumin.style.generatorsLater")}
            className="mari-editor-action inline-flex px-2.5 text-[0.6875rem] disabled:opacity-50"
          >
            {t("megumin.style.editor.generateInsights")}
          </button>
        </div>
        <input
          type="text"
          aria-label={t("megumin.style.editor.notes")}
          placeholder={t("megumin.style.editor.notes")}
          value={style.notes}
          onChange={(event) => setStyle((current) => ({ ...current, notes: event.target.value }))}
          className="mari-editor-field px-3 py-2 text-xs"
        />
      </div>
      <div className="mari-editor-panel flex flex-col gap-2 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-semibold">{t("megumin.style.editor.rule")}</h3>
          <button
            type="button"
            disabled
            title={t("megumin.style.generatorsLater")}
            className="mari-editor-action inline-flex px-2.5 text-[0.6875rem] disabled:opacity-50"
          >
            {t("megumin.style.editor.generateRule")}
          </button>
        </div>
        <textarea
          aria-label={t("megumin.style.editor.rule")}
          placeholder={t("megumin.style.editor.rulePlaceholder")}
          rows={6}
          value={style.rule}
          onChange={(event) => setStyle((current) => ({ ...current, rule: event.target.value }))}
          className="mari-editor-field mari-prompt-font px-3 py-2 text-xs"
        />
        <p className="text-[0.625rem] text-[var(--marinara-editor-muted)]">{t("megumin.style.generatorsLater")}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onSave(style)}
          className="mari-editor-action mari-editor-action--primary inline-flex px-4"
        >
          {t("megumin.style.editor.save")}
        </button>
        <button type="button" onClick={onCancel} className="mari-editor-action inline-flex px-4">
          {t("megumin.style.editor.back")}
        </button>
      </div>
    </div>
  );
}
