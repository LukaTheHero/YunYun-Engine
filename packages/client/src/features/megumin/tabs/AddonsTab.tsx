// ──────────────────────────────────────────────
// Megumin Suite editor: Add-ons & Toggles (language, pronouns, add-ons, sounds, MVU, custom text)
// ──────────────────────────────────────────────
import { useTranslation } from "react-i18next";
import { MEGUMIN_ADDON_CATALOG, engineUsesRenderLimits, type MeguminResolvedProfile } from "@marinara-engine/shared";
import { toggleMeguminAddon } from "../megumin-addons";
import { meguminAddonKey } from "../megumin-keys";
import {
  MeguminBadge,
  MeguminCallout,
  MeguminGrid,
  MeguminHeading,
  MeguminNumberField,
  MeguminOptionCard,
  MeguminTextField,
  MeguminToggle,
} from "../megumin-ui";
import type { MeguminTabProps } from "./tab-props";

const MVU_PROJECT_URL = "https://github.com/KritBlade/MVU_Game_Maker";
const USER_TOKEN = { user: "{{user}}" };

export function AddonsTab({ editor, profile, engine }: MeguminTabProps) {
  const { t } = useTranslation();
  const isV6 = !!engine && (engine.id.includes("v6") || engine.label.includes("V6"));
  const customModules =
    engine && "customToggles" in engine
      ? (engine.customToggles ?? []).filter((module) => module.location === "settings")
      : [];

  return (
    <div className="flex flex-col gap-4">
      <MeguminHeading description={t("megumin.addons.description")}>{t("megumin.addons.title")}</MeguminHeading>
      <MeguminCallout>{t("megumin.addons.didYouKnow")}</MeguminCallout>

      <div className="flex flex-col gap-2">
        <MeguminHeading>{t("megumin.addons.preferences")}</MeguminHeading>
        {engineUsesRenderLimits(engine) && <RenderLimits editor={editor} profile={profile} />}
        <label className="mari-editor-panel flex flex-col gap-1.5 p-3 text-xs">
          <span className="font-medium">{t("megumin.addons.language.label")}</span>
          <span className="text-[0.6875rem] text-[var(--marinara-editor-muted)]">
            {t("megumin.addons.language.help")}
          </span>
          <MeguminTextField
            label={t("megumin.addons.language.label")}
            placeholder={t("megumin.addons.language.placeholder")}
            value={profile.userLanguage}
            maxLength={200}
            onCommit={(userLanguage) => void editor.update({ userLanguage })}
          />
        </label>
        <label className="mari-editor-panel flex flex-col gap-1.5 p-3 text-xs">
          <span className="font-medium">{t("megumin.addons.pronouns.label")}</span>
          <span className="text-[0.6875rem] text-[var(--marinara-editor-muted)]">
            {t("megumin.addons.pronouns.help")}
          </span>
          <select
            value={profile.userPronouns}
            onChange={(event) =>
              void editor.update({ userPronouns: event.target.value as MeguminResolvedProfile["userPronouns"] })
            }
            className="mari-editor-field px-2.5 py-2 text-xs"
          >
            <option value="off">{t("megumin.addons.pronouns.off")}</option>
            <option value="male">{t("megumin.addons.pronouns.male")}</option>
            <option value="female">{t("megumin.addons.pronouns.female")}</option>
          </select>
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <MeguminHeading>{t("megumin.addons.gameplay")}</MeguminHeading>
        <MeguminCallout tone="warning">{t("megumin.addons.pickFew")}</MeguminCallout>
        <MeguminGrid>
          {MEGUMIN_ADDON_CATALOG.map((addon) => {
            const on = profile.addons.includes(addon.id);
            const needsV6 = addon.requiresFamily === "V6" && !isV6;
            return (
              <MeguminOptionCard
                key={addon.id}
                title={t(meguminAddonKey(addon.id, "label"))}
                description={t(meguminAddonKey(addon.id, "description"))}
                selected={on}
                // A locked add-on that is still on can be switched off.
                disabled={needsV6 && !on}
                disabledReason={t("megumin.addons.requiresV6")}
                onSelect={() => void editor.update({ addons: toggleMeguminAddon(profile.addons, addon) })}
                badges={
                  addon.recommended || addon.requiresFamily ? (
                    <>
                      {addon.recommended && (
                        <MeguminBadge tone="accent">{t("megumin.common.recommended")}</MeguminBadge>
                      )}
                      {addon.requiresFamily && (
                        <MeguminBadge tone={needsV6 ? "warning" : "muted"}>
                          {needsV6 ? t("megumin.addons.requiresV6") : t("megumin.addons.v6Active")}
                        </MeguminBadge>
                      )}
                    </>
                  ) : undefined
                }
              />
            );
          })}
          <MeguminOptionCard
            title={t("megumin.addons.sounds.label")}
            description={t("megumin.addons.sounds.help")}
            selected={profile.onomatopoeia.enabled}
            onSelect={() =>
              void editor.update({
                onomatopoeia: { ...profile.onomatopoeia, enabled: !profile.onomatopoeia.enabled },
              })
            }
          >
            {profile.onomatopoeia.enabled && (
              <MeguminToggle
                label={t("megumin.addons.sounds.animate")}
                description={t("megumin.addons.sounds.animateHelp")}
                checked={profile.onomatopoeia.useStyling}
                onChange={(useStyling) => void editor.update({ onomatopoeia: { ...profile.onomatopoeia, useStyling } })}
              />
            )}
          </MeguminOptionCard>
        </MeguminGrid>
      </div>

      {customModules.length > 0 && (
        <div className="flex flex-col gap-2">
          <MeguminHeading>{t("megumin.addons.customModules")}</MeguminHeading>
          {customModules.map((module) => (
            <MeguminToggle
              key={module.id}
              label={module.name}
              description={t("megumin.addons.customModuleTarget", { target: module.attachPoint })}
              checked={profile.toggles[module.id] === true}
              onChange={(value) => void editor.update({ toggles: { ...profile.toggles, [module.id]: value } })}
            />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <MeguminHeading>{t("megumin.addons.outputFormats")}</MeguminHeading>
        <MeguminToggle
          label={t("megumin.addons.mvu.label")}
          description={
            <>
              {t("megumin.addons.mvu.help")}{" "}
              <a
                href={MVU_PROJECT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                {t("megumin.addons.mvu.link")}
              </a>
            </>
          }
          checked={profile.mvu}
          onChange={(mvu) => void editor.update({ mvu })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <MeguminHeading>{t("megumin.addons.extra")}</MeguminHeading>
        <MeguminToggle
          label={t("megumin.addons.userRule.label", USER_TOKEN)}
          description={t("megumin.addons.userRule.help", USER_TOKEN)}
          checked={profile.userRuleReminder}
          onChange={(userRuleReminder) => void editor.update({ userRuleReminder })}
        />
        <label className="mari-editor-panel flex flex-col gap-1.5 p-3 text-xs">
          <span className="font-medium">{t("megumin.addons.customPrompt.label")}</span>
          <span className="text-[0.6875rem] text-[var(--marinara-editor-muted)]">
            {t("megumin.addons.customPrompt.help")}
          </span>
          <MeguminTextField
            multiline
            rows={4}
            label={t("megumin.addons.customPrompt.label")}
            placeholder={t("megumin.addons.customPrompt.placeholder")}
            value={profile.customPrompt}
            className="mari-prompt-font"
            onCommit={(customPrompt) => void editor.update({ customPrompt })}
          />
        </label>
      </div>
    </div>
  );
}

function RenderLimits({ editor, profile }: Pick<MeguminTabProps, "editor" | "profile">) {
  const { t } = useTranslation();
  const limits = profile.v9Limits;
  const field = (key: keyof typeof limits, label: string) => (
    <MeguminNumberField
      label={label}
      value={limits[key]}
      min={1}
      max={100_000}
      onCommit={(value) => void editor.update({ v9Limits: { ...limits, [key]: value } })}
    />
  );
  return (
    <div className="mari-editor-panel flex flex-col gap-2 p-3 text-xs">
      <span className="font-medium">{t("megumin.addons.v9Limits.label")}</span>
      <span className="text-[0.6875rem] text-[var(--marinara-editor-muted)]">{t("megumin.addons.v9Limits.help")}</span>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <span className="font-semibold">{t("megumin.addons.v9Limits.lean")}</span>
          <span className="text-[0.625rem] text-[var(--marinara-editor-muted)]">
            {t("megumin.addons.v9Limits.leanHelp")}
          </span>
          <div className="flex items-center gap-2">
            {field("leanMin", t("megumin.addons.v9Limits.leanMin"))}
            <span>{t("megumin.addons.v9Limits.to")}</span>
            {field("leanMax", t("megumin.addons.v9Limits.leanMax"))}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <span className="font-semibold">{t("megumin.addons.v9Limits.full")}</span>
          <span className="text-[0.625rem] text-[var(--marinara-editor-muted)]">
            {t("megumin.addons.v9Limits.fullHelp")}
          </span>
          <div className="flex items-center gap-2">
            {field("fullMin", t("megumin.addons.v9Limits.fullMin"))}
            <span>{t("megumin.addons.v9Limits.to")}</span>
            {field("fullMax", t("megumin.addons.v9Limits.fullMax"))}
          </div>
        </div>
      </div>
    </div>
  );
}
