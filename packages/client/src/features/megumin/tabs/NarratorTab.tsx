// ──────────────────────────────────────────────
// Megumin Suite editor: Narrator (the narrator persona and the OOC / control toggles)
// ──────────────────────────────────────────────
// Upstream calls this tab "Persona"; it is renamed so it never reads as YunYun's user personas.
// Personas only reach V4/V5 prompts; newer engines carry their own, which the tab says.
import { useTranslation } from "react-i18next";
import {
  MEGUMIN_PERSONALITY_CATALOG,
  MEGUMIN_TOGGLE_CATALOG,
  isModernEngine,
  isV7Engine,
} from "@marinara-engine/shared";
import { meguminPersonalityKey, meguminToggleKey } from "../megumin-keys";
import {
  MeguminBadge,
  MeguminCallout,
  MeguminGrid,
  MeguminHeading,
  MeguminOptionCard,
  MeguminToggle,
} from "../megumin-ui";
import type { MeguminTabProps } from "./tab-props";

export function NarratorTab({ editor, profile, engine }: MeguminTabProps) {
  const { t } = useTranslation();
  const engineName = engine?.label ?? profile.mode;
  const modern = isModernEngine(engine);
  // Both Dream Team engines, as upstream: the persona only reaches V4/V5 prompts.
  const dreamTeam = profile.mode.includes("v6-dream-team");
  const locked = modern
    ? t("megumin.narrator.locked.modern", { engine: engineName })
    : dreamTeam
      ? t("megumin.narrator.locked.dreamTeam")
      : isV7Engine(engine)
        ? t("megumin.narrator.locked.v7")
        : null;

  return (
    <div className="flex flex-col gap-4">
      <MeguminHeading description={t("megumin.narrator.description")}>{t("megumin.narrator.title")}</MeguminHeading>
      {locked ? (
        <MeguminCallout>
          <strong className="font-semibold">{t("megumin.narrator.locked.title")}</strong> {locked}
        </MeguminCallout>
      ) : (
        <div className="flex flex-col gap-2">
          <MeguminHeading>{t("megumin.narrator.personaTitle")}</MeguminHeading>
          <MeguminGrid>
            {MEGUMIN_PERSONALITY_CATALOG.map((personality) => (
              <MeguminOptionCard
                key={personality.id}
                title={t(meguminPersonalityKey(personality.id, "label"))}
                description={t(meguminPersonalityKey(personality.id, "description"))}
                selected={profile.personality === personality.id}
                onSelect={() => void editor.update({ personality: personality.id })}
                badges={
                  personality.recommended ? (
                    <MeguminBadge tone="accent">{t("megumin.common.recommended")}</MeguminBadge>
                  ) : undefined
                }
              />
            ))}
          </MeguminGrid>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <MeguminHeading description={modern ? t("megumin.narrator.togglesModern", { engine: engineName }) : undefined}>
          {t("megumin.narrator.togglesTitle")}
        </MeguminHeading>
        {MEGUMIN_TOGGLE_CATALOG.map((toggle) => (
          <MeguminToggle
            key={toggle.id}
            label={t(meguminToggleKey(toggle.id))}
            description={toggle.recommendedOff ? t("megumin.narrator.offByDefault") : undefined}
            checked={profile.toggles[toggle.id] === true}
            // V8 and newer blank both toggles, so switching them would change nothing.
            disabled={modern}
            onChange={(value) => void editor.update({ toggles: { ...profile.toggles, [toggle.id]: value } })}
          />
        ))}
      </div>
    </div>
  );
}
