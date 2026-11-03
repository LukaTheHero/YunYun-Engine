// ──────────────────────────────────────────────
// Megumin panel: Persona
// ──────────────────────────────────────────────
// The narrator's personality and the global behaviour toggles, for the older
// presets that carry no persona of their own. Megumin's src/ui/tabs/personality.js.
import { useTranslation } from "react-i18next";
import { Check, Star, UserLock } from "lucide-react";
import { MeguminEngineFlags } from "@marinara-engine/shared/megumin/client";
import { useMeguminPanel } from "../megumin-panel-context";
import { MeguminGrid, MeguminSection } from "../MeguminControls";
import { Badge, PickCard, SwitchRow } from "./presetControls";
import { PERSONA_DESCRIPTIONS, type MeguminEngine } from "./presetData";

function LockedState({ title, children, tone }: { title: string; children: string; tone: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-[var(--border)]/70 bg-[var(--background)]/35 px-6 py-8 text-center">
      <UserLock size="1.75rem" className={tone} />
      <div className="text-sm font-semibold text-[var(--marinara-chat-chrome-panel-title)]">{title}</div>
      <p className="max-w-xl text-xs leading-relaxed text-[var(--marinara-chat-chrome-panel-muted)]">{children}</p>
    </div>
  );
}

export function PersonaTab() {
  const { t } = useTranslation();
  const { profile, view, catalog, update } = useMeguminPanel();
  const mode = String(profile.mode ?? "");
  const engines = [...((catalog.engines ?? []) as MeguminEngine[]), ...((view.customModes ?? []) as MeguminEngine[])];
  const engine = engines.find((m) => m.id === mode);
  const isV6DreamTeam = mode.includes("v6-dream-team");
  const isV7 = MeguminEngineFlags.isV7Engine(engine);
  const isModern = MeguminEngineFlags.isModernEngine(engine);
  const isLocked = isV6DreamTeam || isV7 || isModern;
  const personalities = (catalog.personalities ?? []) as MeguminEngine[];
  const toggleDefs = (catalog.toggles ?? []) as MeguminEngine[];
  const toggles = (profile.toggles ?? {}) as Record<string, boolean>;
  // Named from the engine itself, never rebuilt from a flag.
  const engineName = engine?.label ? String(engine.label) : t("megumin.persona.thisEngine");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end">
        <Badge tone="custom">{isLocked ? t("megumin.persona.locked") : String(profile.personality ?? "")}</Badge>
      </div>

      {isModern ? (
        <LockedState title={t("megumin.persona.lockedModern.title")} tone="text-amber-500">
          {t("megumin.persona.lockedModern.body", { engine: engineName })}
        </LockedState>
      ) : (
        <>
          {isV6DreamTeam ? (
            <LockedState title={t("megumin.persona.lockedSelection")} tone="text-violet-500">
              {t("megumin.persona.lockedV6")}
            </LockedState>
          ) : isV7 ? (
            <LockedState title={t("megumin.persona.lockedSelection")} tone="text-sky-500">
              {t("megumin.persona.lockedV7")}
            </LockedState>
          ) : (
            <MeguminSection title={t("megumin.persona.select")}>
              <MeguminGrid className="items-stretch">
                {personalities.map((p) => {
                  const isSel = profile.personality === p.id;
                  return (
                    <PickCard
                      key={String(p.id)}
                      active={isSel}
                      onPick={isSel ? undefined : () => update((d) => void (d.personality = p.id))}
                      title={String(p.label ?? p.id)}
                      titleExtra={
                        isSel ? (
                          <Badge tone="active" icon={<Check size="0.75rem" />}>
                            {t("megumin.persona.active")}
                          </Badge>
                        ) : null
                      }
                      description={PERSONA_DESCRIPTIONS[String(p.id)] ?? ""}
                      badges={
                        p.recommended ? (
                          <Badge tone="rec" icon={<Star size="0.75rem" />}>
                            {t("megumin.persona.recommended")}
                          </Badge>
                        ) : null
                      }
                    />
                  );
                })}
              </MeguminGrid>
            </MeguminSection>
          )}

          <MeguminSection title={t("megumin.persona.extraToggles")}>
            <MeguminGrid layout="fields" className="gap-x-6 gap-y-1">
              {toggleDefs.map((tog) => (
                <SwitchRow
                  key={String(tog.id)}
                  label={String(tog.label ?? tog.id)}
                  description={tog.recommendedOff ? t("megumin.persona.recommendedOff") : undefined}
                  checked={!!toggles[String(tog.id)]}
                  onChange={(on) =>
                    update((d) => {
                      d.toggles = { ...(d.toggles ?? {}), [String(tog.id)]: on };
                    })
                  }
                />
              ))}
            </MeguminGrid>
          </MeguminSection>
        </>
      )}
    </div>
  );
}
