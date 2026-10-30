// ──────────────────────────────────────────────
// Megumin Suite editor: Engine & Reasoning (engines, Story Config, chain of thought, layout)
// ──────────────────────────────────────────────
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  MEGUMIN_COT_FRAMEWORKS,
  MEGUMIN_COT_LANGUAGES,
  MEGUMIN_ENGINE_CATALOG,
  MEGUMIN_ENGINE_FAMILIES,
  MEGUMIN_THINK_EFFORTS,
  MEGUMIN_V7_MODULE_TOGGLES,
  countActiveConfigFields,
  isV10Engine,
  isV7Engine,
  lockedStyleIdFor,
  meguminAllowedCotFrameworks,
  meguminCotForMode,
  meguminCotFrameworkOf,
  meguminCotIdFor,
  type MeguminEngineFamily,
} from "@marinara-engine/shared";
import { cn } from "../../../lib/utils";
import {
  meguminCotDescriptionKey,
  meguminCotLanguageKey,
  meguminEngineDescriptionKey,
  meguminThinkEffortKey,
  meguminV7ModuleKey,
} from "../megumin-keys";
import {
  MeguminBadge,
  MeguminCallout,
  MeguminGrid,
  MeguminHeading,
  MeguminNumberField,
  MeguminOptionCard,
  MeguminToggle,
} from "../megumin-ui";
import { StoryConfigPanel } from "./StoryConfigPanel";
import type { MeguminTabProps } from "./tab-props";

const USER_TOKEN = { user: "{{user}}" };
type Section = "official" | "custom" | "storyConfig" | "reasoning" | "layout";

export function EngineTab(props: MeguminTabProps) {
  const { t } = useTranslation();
  const { profile, settings } = props;
  const [section, setSection] = useState<Section>("official");
  const configCount = countActiveConfigFields(profile.storyConfig);

  const sections: Array<{ id: Section; label: string; badge?: string }> = [
    { id: "official", label: t("megumin.engine.sections.official"), badge: String(MEGUMIN_ENGINE_CATALOG.length) },
    { id: "custom", label: t("megumin.engine.sections.custom"), badge: String(settings.customEngines.length) },
    {
      id: "storyConfig",
      label: t("megumin.engine.sections.storyConfig"),
      badge: configCount ? String(configCount) : undefined,
    },
    {
      id: "reasoning",
      label: t("megumin.engine.sections.reasoning"),
      badge: profile.cotEnabled ? t("megumin.common.on") : t("megumin.common.off"),
    },
    { id: "layout", label: t("megumin.engine.sections.layout") },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div
        role="group"
        aria-label={t("megumin.engine.sections.label")}
        className="flex min-w-0 gap-1 overflow-x-auto pb-1 [scrollbar-width:thin]"
      >
        {sections.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={section === item.id}
            onClick={() => setSection(item.id)}
            className={cn(
              "mari-editor-chip shrink-0 px-3 py-1.5 text-xs",
              section === item.id && "mari-editor-chip--accent",
            )}
          >
            {item.label}
            {item.badge && <span className="mari-editor-tab-badge">{item.badge}</span>}
          </button>
        ))}
      </div>
      {section === "official" && <OfficialEngines {...props} />}
      {section === "custom" && <CustomEngines {...props} />}
      {section === "storyConfig" && <StoryConfigPanel {...props} />}
      {section === "reasoning" && <Reasoning {...props} />}
      {section === "layout" && <Layout {...props} />}
    </div>
  );
}

function EnhancedDialogueSwitch({
  engineId,
  editor,
  profile,
}: Pick<MeguminTabProps, "editor" | "profile"> & { engineId: string }) {
  const { t } = useTranslation();
  const on = profile.enhancedDialogue[engineId] === true;
  // Off is saved as false: an entry left out would inherit "on" from the level below.
  return (
    <MeguminToggle
      label={t("megumin.engine.enhancedDialogue.label")}
      help={t("megumin.engine.enhancedDialogue.help")}
      checked={on}
      onChange={(value) => void editor.update({ enhancedDialogue: { ...profile.enhancedDialogue, [engineId]: value } })}
    />
  );
}

function OfficialEngines({ editor, profile, engine }: MeguminTabProps) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<MeguminEngineFamily | "all">("all");
  const shown = MEGUMIN_ENGINE_CATALOG.filter((entry) => filter === "all" || entry.family === filter);
  const language = meguminCotFrameworkOf(profile.model)?.lang ?? "english";

  const selectEngine = (entry: (typeof MEGUMIN_ENGINE_CATALOG)[number]) => {
    // Picking an engine also picks its locked writing style and its chain of thought (upstream's
    // engine card). The style's rule text is server-side, so aiRule is cleared and the server reads
    // the precooked rule for activeStyleId.
    const lockedStyle = lockedStyleIdFor(entry);
    const cot = meguminCotForMode(entry.id, language);
    void editor.update({
      mode: entry.id,
      ...(lockedStyle ? { activeStyleId: lockedStyle, aiRule: "" } : {}),
      ...(cot ? { model: cot } : {}),
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <MeguminHeading description={t("megumin.engine.official.description")}>
        {t("megumin.engine.official.title")}
      </MeguminHeading>
      <div role="group" aria-label={t("megumin.engine.filterLabel")} className="flex flex-wrap gap-1">
        {(["all", ...MEGUMIN_ENGINE_FAMILIES] as const).map((family) => {
          const count =
            family === "all"
              ? MEGUMIN_ENGINE_CATALOG.length
              : MEGUMIN_ENGINE_CATALOG.filter((entry) => entry.family === family).length;
          return (
            <button
              key={family}
              type="button"
              aria-pressed={filter === family}
              onClick={() => setFilter(family)}
              className={cn(
                "mari-editor-chip px-2.5 py-1 text-[0.6875rem]",
                filter === family && "mari-editor-chip--accent",
              )}
            >
              {family === "all" ? t("megumin.engine.filterAll") : family}
              <span className="opacity-70">{count}</span>
            </button>
          );
        })}
      </div>
      <MeguminGrid>
        {shown.map((entry) => (
          <MeguminOptionCard
            key={entry.id}
            title={entry.label}
            description={t(meguminEngineDescriptionKey(entry.id), USER_TOKEN)}
            selected={profile.mode === entry.id}
            onSelect={() => selectEngine(entry)}
            badges={
              entry.recommended || entry.isNew ? (
                <>
                  {entry.recommended && <MeguminBadge tone="accent">{t("megumin.common.recommended")}</MeguminBadge>}
                  {entry.isNew && <MeguminBadge>{t("megumin.common.new")}</MeguminBadge>}
                </>
              ) : undefined
            }
          >
            {isV10Engine(entry) && <EnhancedDialogueSwitch engineId={entry.id} editor={editor} profile={profile} />}
          </MeguminOptionCard>
        ))}
      </MeguminGrid>
      {isV7Engine(engine) && (
        <div className="flex flex-col gap-2">
          <MeguminHeading description={t("megumin.engine.v7Modules.description")}>
            {t("megumin.engine.v7Modules.title")}
          </MeguminHeading>
          {MEGUMIN_V7_MODULE_TOGGLES.map((module) => (
            <MeguminToggle
              key={module.id}
              label={t(meguminV7ModuleKey(module.id, "label"))}
              description={t(meguminV7ModuleKey(module.id, "description"))}
              // A module is on until it is switched off.
              checked={profile.toggles[module.id] !== false}
              onChange={(value) => void editor.update({ toggles: { ...profile.toggles, [module.id]: value } })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CustomEngines({ editor, profile, settings }: MeguminTabProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-3">
      <MeguminHeading description={t("megumin.engine.custom.description")}>
        {t("megumin.engine.custom.title")}
      </MeguminHeading>
      {settings.customEngines.length === 0 ? (
        <p className="mari-editor-empty p-4 text-center text-xs">{t("megumin.engine.custom.empty")}</p>
      ) : (
        <MeguminGrid>
          {settings.customEngines.map((entry) => (
            <MeguminOptionCard
              key={entry.id}
              title={entry.label}
              description={t("megumin.engine.custom.cardDescription")}
              selected={profile.mode === entry.id}
              onSelect={() => void editor.update({ mode: entry.id })}
            >
              {isV10Engine(entry) && <EnhancedDialogueSwitch engineId={entry.id} editor={editor} profile={profile} />}
            </MeguminOptionCard>
          ))}
        </MeguminGrid>
      )}
    </div>
  );
}

function Reasoning({ editor, profile, engine }: MeguminTabProps) {
  const { t } = useTranslation();
  const current = meguminCotFrameworkOf(profile.model);
  const framework = current?.framework ?? null;
  const language = current?.lang ?? "english";
  const allowed = meguminAllowedCotFrameworks(profile.mode);
  const englishOnly = MEGUMIN_COT_FRAMEWORKS.find((entry) => entry.id === framework)?.englishOnly ?? true;
  const engineCot = engine && "cot" in engine && typeof engine.cot === "string" && engine.cot.trim() !== "";

  return (
    <div className="flex flex-col gap-4">
      <MeguminHeading>{t("megumin.cot.title")}</MeguminHeading>
      <MeguminToggle
        label={t("megumin.cot.enable.label")}
        description={t("megumin.cot.enable.help")}
        checked={profile.cotEnabled}
        onChange={(value) => void editor.update({ cotEnabled: value })}
      />
      {profile.cotEnabled && (
        <>
          {engineCot && <MeguminCallout>{t("megumin.cot.engineOwnsCot")}</MeguminCallout>}
          <div className="flex flex-col gap-2">
            <MeguminHeading>{t("megumin.cot.frameworkTitle")}</MeguminHeading>
            <MeguminGrid>
              {MEGUMIN_COT_FRAMEWORKS.map((entry) => {
                const warned = allowed !== null && !allowed.includes(entry.id);
                return (
                  <MeguminOptionCard
                    key={entry.id}
                    compact
                    title={entry.label}
                    description={t(meguminCotDescriptionKey(entry.id))}
                    selected={framework === entry.id}
                    onSelect={() => void editor.update({ model: meguminCotIdFor(entry.id, language) })}
                    badges={
                      warned ? (
                        <MeguminBadge tone="warning">{t("megumin.cot.incompatible")}</MeguminBadge>
                      ) : entry.isNew ? (
                        <MeguminBadge>{t("megumin.common.new")}</MeguminBadge>
                      ) : undefined
                    }
                  />
                );
              })}
            </MeguminGrid>
          </div>
          <div className="flex flex-col gap-2">
            <MeguminHeading description={t("megumin.cot.effortDescription")}>
              {t("megumin.cot.effortTitle")}
            </MeguminHeading>
            <MeguminGrid narrow>
              {MEGUMIN_THINK_EFFORTS.map((effort) => (
                <MeguminOptionCard
                  key={effort.id}
                  compact
                  title={t(meguminThinkEffortKey(effort.id))}
                  selected={profile.thinkEffort === effort.id}
                  onSelect={() => void editor.update({ thinkEffort: effort.id })}
                />
              ))}
            </MeguminGrid>
            {profile.thinkEffort === "custom" && (
              <label className="flex items-center gap-3 text-xs">
                <span>{t("megumin.cot.customWords")}</span>
                <MeguminNumberField
                  label={t("megumin.cot.customWords")}
                  value={profile.customThinkEffort}
                  min={1}
                  max={5000}
                  onCommit={(value) => void editor.update({ customThinkEffort: value })}
                />
              </label>
            )}
          </div>
          <MeguminToggle
            label={t("megumin.cot.gemini.label")}
            description={t("megumin.cot.gemini.help")}
            checked={profile.thinkingV2}
            onChange={(value) => void editor.update({ thinkingV2: value })}
          />
          <MeguminToggle
            label={t("megumin.cot.prefill.label")}
            description={t("megumin.cot.prefill.help")}
            checked={profile.sendCotPrefill}
            onChange={(value) => void editor.update({ sendCotPrefill: value })}
          />
          {framework && (
            <div className="flex flex-col gap-2">
              <MeguminHeading description={englishOnly ? t("megumin.cot.languageEnglishOnly") : undefined}>
                {t("megumin.cot.languageTitle")}
              </MeguminHeading>
              <MeguminGrid narrow>
                {MEGUMIN_COT_LANGUAGES.filter((entry) => !englishOnly || entry.id === "english").map((entry) => (
                  <MeguminOptionCard
                    key={entry.id}
                    compact
                    title={t(meguminCotLanguageKey(entry.id))}
                    selected={language === entry.id}
                    onSelect={() => void editor.update({ model: `cot-${framework}-${entry.id}` })}
                    badges={
                      entry.recommended && !englishOnly ? (
                        <MeguminBadge tone="accent">{t("megumin.cot.proTip")}</MeguminBadge>
                      ) : undefined
                    }
                  />
                ))}
              </MeguminGrid>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Layout({ editor, profile }: MeguminTabProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-3">
      <MeguminHeading description={t("megumin.layout.description")}>{t("megumin.layout.title")}</MeguminHeading>
      <MeguminGrid>
        <MeguminOptionCard
          title={t("megumin.layout.universal.label")}
          description={t("megumin.layout.universal.help")}
          selected={profile.layout === "universal"}
          onSelect={() => void editor.update({ layout: "universal" })}
        />
        <MeguminOptionCard
          title={t("megumin.layout.cache.label")}
          description={t("megumin.layout.cache.help")}
          selected={profile.layout === "cache"}
          onSelect={() => void editor.update({ layout: "cache" })}
        />
      </MeguminGrid>
      <MeguminCallout>{t("megumin.layout.cacheBreakers")}</MeguminCallout>
    </div>
  );
}
