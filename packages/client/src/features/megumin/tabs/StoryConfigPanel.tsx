// ──────────────────────────────────────────────
// Megumin Suite editor: Story Config (standing settings that compile into the <config> block)
// ──────────────────────────────────────────────
// Option values, chips and notes are prompt text and stay in English; labels, hints and placeholders
// are localized. The preview is the exact block the resolver sends (buildConfigBlock, shared).
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ChevronDown } from "lucide-react";
import {
  MEGUMIN_MAX_CONFIG_PRESETS,
  STORY_CONFIG_BUILTIN_PRESETS,
  STORY_CONFIG_FIELDS,
  buildConfigBlock,
  isStandingConfigField,
  loadStoryConfigPreset,
  normalizeStoryConfig,
  type MeguminStoryConfig,
  type MeguminStoryConfigField,
} from "@marinara-engine/shared";
import { showConfirmDialog, showPromptDialog } from "../../../lib/app-dialogs";
import { generateClientId, cn } from "../../../lib/utils";
import { meguminStoryFieldKey, meguminStoryOptionKey, meguminStoryPresetKey } from "../megumin-keys";
import { MeguminHeading, MeguminTextField, MeguminToggle } from "../megumin-ui";
import type { MeguminTabProps } from "./tab-props";

const USER_TOKEN = { user: "{{user}}" };
const CUSTOM = "__custom";

export function StoryConfigPanel({ editor, profile, settings }: MeguminTabProps) {
  const { t } = useTranslation();
  // Older or imported values may still be an option's short label; show them as the option.
  const config = normalizeStoryConfig(profile.storyConfig);
  const [openField, setOpenField] = useState<string | null>(null);
  const [presetId, setPresetId] = useState("");
  const userPresets = settings.configPresets;
  const engineTabGlobal = settings.globalTabs.engine === true;

  const saveConfig = (next: MeguminStoryConfig) => void editor.update({ storyConfig: next });
  const setField = (key: MeguminStoryConfigField["key"], value: string) => saveConfig({ ...config, [key]: value });

  const presetName = (id: string) => {
    const builtin = STORY_CONFIG_BUILTIN_PRESETS.find((preset) => preset.id === id);
    return builtin
      ? t(meguminStoryPresetKey(builtin.id))
      : (userPresets.find((preset) => preset.id === id)?.name ?? "");
  };

  const loadPreset = () => {
    const preset =
      STORY_CONFIG_BUILTIN_PRESETS.find((entry) => entry.id === presetId) ??
      userPresets.find((entry) => entry.id === presetId);
    if (!preset) {
      toast.info(t("megumin.storyConfig.pickPresetFirst"));
      return;
    }
    saveConfig(loadStoryConfigPreset(preset));
    toast.success(t("megumin.storyConfig.loaded", { name: presetName(preset.id) }));
  };

  const savePreset = async () => {
    if (userPresets.length >= MEGUMIN_MAX_CONFIG_PRESETS) {
      toast.error(t("megumin.storyConfig.tooManyPresets"));
      return;
    }
    const name = (
      await showPromptDialog({
        title: t("megumin.storyConfig.saveTitle"),
        message: t("megumin.storyConfig.saveMessage"),
        placeholder: t("megumin.storyConfig.saveName"),
        confirmLabel: t("megumin.storyConfig.save"),
        cancelLabel: t("megumin.common.cancel"),
      })
    )?.trim();
    if (!name) return;
    const values = Object.fromEntries(STORY_CONFIG_FIELDS.map((field) => [field.key, config[field.key] || ""]));
    const id = `cfgp_${generateClientId()}`;
    const saved = await editor.saveSettings((current) => ({
      configPresets: [...current.configPresets, { id, name, values }],
    }));
    if (!saved) return;
    setPresetId(id);
    toast.success(t("megumin.storyConfig.saved", { name }));
  };

  const deletePreset = async () => {
    if (!presetId) {
      toast.info(t("megumin.storyConfig.pickPresetFirst"));
      return;
    }
    if (STORY_CONFIG_BUILTIN_PRESETS.some((preset) => preset.id === presetId)) {
      toast.warning(t("megumin.storyConfig.builtinUndeletable"));
      return;
    }
    const confirmed = await showConfirmDialog({
      title: t("megumin.storyConfig.deleteTitle"),
      message: t("megumin.storyConfig.deleteMessage", { name: presetName(presetId) }),
      confirmLabel: t("megumin.common.delete"),
      cancelLabel: t("megumin.common.cancel"),
      tone: "destructive",
    });
    if (!confirmed) return;
    const id = presetId;
    const deleted = await editor.saveSettings((current) => ({
      configPresets: current.configPresets.filter((preset) => preset.id !== id),
    }));
    if (deleted) setPresetId("");
  };

  const resetAll = async () => {
    const confirmed = await showConfirmDialog({
      title: t("megumin.storyConfig.resetTitle"),
      message: t("megumin.storyConfig.resetMessage"),
      confirmLabel: t("megumin.storyConfig.resetAll"),
      cancelLabel: t("megumin.common.cancel"),
      tone: "destructive",
    });
    if (confirmed) saveConfig(loadStoryConfigPreset({ values: {} }));
  };

  const preview = buildConfigBlock(config);

  return (
    <div className="flex flex-col gap-3">
      <MeguminHeading description={t("megumin.storyConfig.description")}>
        {t("megumin.storyConfig.title")}
      </MeguminHeading>
      <MeguminToggle
        label={t("megumin.storyConfig.sync.label")}
        description={
          !engineTabGlobal
            ? t("megumin.storyConfig.sync.inactive")
            : settings.storyConfigGlobalSync
              ? t("megumin.storyConfig.sync.on")
              : t("megumin.storyConfig.sync.off")
        }
        checked={settings.storyConfigGlobalSync}
        onChange={(value) => void editor.saveSettings(() => ({ storyConfigGlobalSync: value }))}
      />

      <div className="mari-editor-panel flex flex-wrap items-center gap-2 p-2.5">
        <select
          aria-label={t("megumin.storyConfig.presetSelect")}
          value={presetId}
          onChange={(event) => setPresetId(event.target.value)}
          className="mari-editor-field min-w-40 flex-1 px-2.5 py-2 text-xs"
        >
          <option value="">{t("megumin.storyConfig.presetPlaceholder")}</option>
          <optgroup label={t("megumin.storyConfig.builtinGroup")}>
            {STORY_CONFIG_BUILTIN_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {t(meguminStoryPresetKey(preset.id))}
              </option>
            ))}
          </optgroup>
          {userPresets.length > 0 && (
            <optgroup label={t("megumin.storyConfig.myGroup")}>
              {userPresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <button type="button" onClick={loadPreset} className="mari-editor-action inline-flex px-3 text-xs">
          {t("megumin.storyConfig.load")}
        </button>
        <button type="button" onClick={() => void savePreset()} className="mari-editor-action inline-flex px-3 text-xs">
          {t("megumin.storyConfig.saveCurrent")}
        </button>
        <button
          type="button"
          onClick={() => void deletePreset()}
          className="mari-editor-action mari-editor-action--danger inline-flex px-3 text-xs"
        >
          {t("megumin.common.delete")}
        </button>
        <button type="button" onClick={() => void resetAll()} className="mari-editor-action inline-flex px-3 text-xs">
          {t("megumin.storyConfig.resetAll")}
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        {STORY_CONFIG_FIELDS.map((field) => (
          <StoryConfigRow
            key={field.key}
            field={field}
            value={config[field.key] ?? ""}
            open={openField === field.key}
            onToggle={() => setOpenField((current) => (current === field.key ? null : field.key))}
            onChange={(value) => setField(field.key, value)}
          />
        ))}
      </div>

      <div className="flex flex-col gap-1">
        <h3 className="text-xs font-semibold">{t("megumin.storyConfig.previewTitle")}</h3>
        <pre
          data-megumin-config-preview
          className="mari-editor-panel mari-prompt-font max-h-72 overflow-auto whitespace-pre-wrap break-words p-3 text-[0.6875rem] leading-relaxed"
        >
          {preview || t("megumin.storyConfig.previewEmpty")}
        </pre>
      </div>
    </div>
  );
}

function StoryConfigRow({
  field,
  value,
  open,
  onToggle,
  onChange,
}: {
  field: MeguminStoryConfigField;
  value: string;
  open: boolean;
  onToggle: () => void;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const label = t(meguminStoryFieldKey(field.key, "label"));
  const trimmed = value.trim();
  const defaultLabel =
    field.type === "select" && field.defaultLabel
      ? t("megumin.storyConfig.presetDefaultNamed", { label: t(meguminStoryFieldKey(field.key, "defaultLabel")) })
      : t("megumin.storyConfig.presetDefault");
  const option = field.type === "select" ? field.options.find((entry) => entry.value === trimmed) : undefined;
  const summary = !trimmed
    ? defaultLabel
    : option
      ? t(meguminStoryOptionKey(field.key, option.label), USER_TOKEN)
      : trimmed;
  const panelId = `megumin-config-${field.key}`;

  return (
    <div className={cn("mari-editor-panel flex flex-col", trimmed && "border-[var(--marinara-editor-border-strong)]")}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className="flex min-w-0 items-center gap-2 px-3 py-2 text-left"
      >
        <span className="min-w-0 shrink-0 text-xs font-semibold">{label}</span>
        <span className="min-w-0 flex-1 truncate text-right text-[0.6875rem] text-[var(--marinara-editor-muted)]">
          {summary}
        </span>
        <ChevronDown
          size="0.875rem"
          aria-hidden="true"
          className={cn("shrink-0 transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <div id={panelId} className="flex flex-col gap-2 border-t border-[var(--marinara-editor-border)] px-3 py-2.5">
          <p className="text-[0.6875rem] leading-relaxed text-[var(--marinara-editor-muted)]">
            {t(meguminStoryFieldKey(field.key, "hint"), USER_TOKEN)}
          </p>
          <StoryConfigControl field={field} value={value} label={label} onChange={onChange} />
        </div>
      )}
    </div>
  );
}

function StoryConfigControl({
  field,
  value,
  label,
  onChange,
}: {
  field: MeguminStoryConfigField;
  value: string;
  label: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const placeholder = t(meguminStoryFieldKey(field.key, "placeholder"), USER_TOKEN);
  const trimmed = value.trim();
  const isCustomValue = field.type === "select" && !!trimmed && !field.options.some((entry) => entry.value === trimmed);
  const [customOpen, setCustomOpen] = useState(isCustomValue);

  if (field.type === "textarea") {
    return <MeguminTextField multiline label={label} value={value} placeholder={placeholder} onCommit={onChange} />;
  }

  if (field.type === "text") {
    const parts = trimmed
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    return (
      <div className="flex flex-col gap-2">
        <MeguminTextField label={label} value={value} placeholder={placeholder} onCommit={onChange} />
        {field.chips.length > 0 && (
          <div
            role="group"
            aria-label={t("megumin.storyConfig.chipsLabel", { field: label })}
            className="flex flex-wrap gap-1"
          >
            {field.chips.map((chip) => {
              const selected = parts.includes(chip);
              return (
                <button
                  key={chip}
                  type="button"
                  aria-pressed={selected}
                  onClick={() =>
                    onChange((selected ? parts.filter((part) => part !== chip) : [...parts, chip]).join(", "))
                  }
                  className={cn(
                    "mari-editor-chip px-2 py-0.5 text-[0.6875rem]",
                    selected && "mari-editor-chip--accent",
                  )}
                >
                  {chip}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const selectValue = customOpen || isCustomValue ? CUSTOM : trimmed;
  return (
    <div className="flex flex-col gap-2">
      <select
        aria-label={label}
        value={selectValue}
        onChange={(event) => {
          const next = event.target.value;
          if (next === CUSTOM) {
            setCustomOpen(true);
            return;
          }
          setCustomOpen(false);
          onChange(next);
        }}
        className="mari-editor-field w-full px-2.5 py-2 text-xs"
      >
        {/* A standing field always reaches the model, so it has no "leave it to the preset" row. */}
        {!isStandingConfigField(field.key) && (
          <option value="">
            {field.defaultLabel
              ? t("megumin.storyConfig.presetDefaultNamed", {
                  label: t(meguminStoryFieldKey(field.key, "defaultLabel")),
                })
              : t("megumin.storyConfig.presetDefault")}
          </option>
        )}
        {field.options.map((entry) => (
          <option key={entry.value} value={entry.value}>
            {t(meguminStoryOptionKey(field.key, entry.label), USER_TOKEN)}
          </option>
        ))}
        <option value={CUSTOM}>{t("megumin.storyConfig.writeOwn")}</option>
      </select>
      {(customOpen || isCustomValue) && (
        <MeguminTextField
          label={t("megumin.storyConfig.customLabel", { field: label })}
          value={isCustomValue ? value : ""}
          placeholder={placeholder}
          onCommit={onChange}
        />
      )}
    </div>
  );
}
