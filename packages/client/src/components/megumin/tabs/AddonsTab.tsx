// ──────────────────────────────────────────────
// Megumin panel: Language & Add-ons
// ──────────────────────────────────────────────
// The story's language and the user's pronouns, the gameplay add-ons, Cinematic
// Sounds, a custom engine's own setting toggles, and MVU (the one output format
// left here; the tracker blocks live in the Blocks tab).
// Megumin's src/ui/tabs/globalAndBlocks.js.
import { useTranslation } from "react-i18next";
import { Check, CodeXml, GitBranch, Lock, LockOpen, Pencil, Star } from "lucide-react";
import { MeguminEngineFlags } from "@marinara-engine/shared/megumin/client";
import { cn } from "../../../lib/utils";
import { useMeguminPanel } from "../megumin-panel-context";
import { MeguminGrid, MeguminNumber, MeguminSection, MeguminSelect, MeguminText } from "../MeguminControls";
import { Badge, Callout, PickCard, RichText, SwitchRow, engineHas } from "./presetControls";
import { ADDON_DESCRIPTIONS, FORMAT_BLOCKS_FALLBACK, FORMAT_DESCRIPTIONS, type MeguminEngine } from "./presetData";

const V9_LIMIT_DEFAULTS = { leanMin: 300, leanMax: 400, fullMin: 700, fullMax: 1200 } as const;
type V9LimitKey = keyof typeof V9_LIMIT_DEFAULTS;

/** "You have rewritten this one in Dev Mode": the add-on's slot has a shared-fragment override. */
function useCustomBadge() {
  const { t } = useTranslation();
  const { catalog, view } = useMeguminPanel();
  const slots = (catalog.slots ?? []) as MeguminEngine[];
  const fragments = (view.sharedFragments ?? {}) as Record<string, unknown>;
  return (trigger: unknown) => {
    const slot = slots.find((s) => s.trigger === trigger);
    if (!slot || !slot.key || !String(fragments[String(slot.key)] ?? "").trim()) return null;
    return (
      <Badge tone="custom" icon={<Pencil size="0.75rem" />} title={t("megumin.addons.customTitle")}>
        {t("megumin.addons.custom")}
      </Badge>
    );
  };
}

export function AddonsTab() {
  const { t } = useTranslation();
  const { profile, view, catalog, update, set } = useMeguminPanel();
  const customBadge = useCustomBadge();
  const engines = [...((catalog.engines ?? []) as MeguminEngine[]), ...((view.customModes ?? []) as MeguminEngine[])];
  const activeMode = engines.find((m) => m.id === profile.mode);
  const isV6 = !!activeMode && (String(activeMode.id).includes("v6") || String(activeMode.label ?? "").includes("V6"));
  // The Lean/Full split is the one thing V10 does not take from V9.
  const usesRenderLimits = MeguminEngineFlags.engineUsesRenderLimits(activeMode);
  const addons = (Array.isArray(profile.addons) ? profile.addons : []) as string[];
  const blocks = (Array.isArray(profile.blocks) ? profile.blocks : []) as string[];
  const addonDefs = (catalog.addons ?? []) as MeguminEngine[];
  const formatBlocks = ((catalog.formatBlocks as MeguminEngine[] | undefined) ?? FORMAT_BLOCKS_FALLBACK).filter(
    (b) => b.id === "mvu",
  );
  const limits = { ...V9_LIMIT_DEFAULTS, ...(profile.v9Limits ?? {}) } as Record<V9LimitKey, number>;
  const ono = { enabled: false, useStyling: false, ...(profile.onomatopoeia ?? {}) } as {
    enabled: boolean;
    useStyling: boolean;
  };
  const toggles = (profile.toggles ?? {}) as Record<string, boolean>;
  const customSettings = Array.isArray(activeMode?.customToggles)
    ? (activeMode.customToggles as MeguminEngine[]).filter((x) => x.location === "settings")
    : [];

  const setLimit = (key: V9LimitKey, n: number) =>
    update((p) => {
      p.v9Limits = {
        ...V9_LIMIT_DEFAULTS,
        ...(p.v9Limits ?? {}),
        [key]: Number.isFinite(n) && n ? n : V9_LIMIT_DEFAULTS[key],
      };
    });

  const toggleAddon = (a: MeguminEngine) =>
    update((p) => {
      const list = (Array.isArray(p.addons) ? p.addons : []) as string[];
      if (list.includes(a.id)) {
        p.addons = list.filter((i) => i !== a.id);
        return;
      }
      // Two add-ons in one `exclusive` group write to the same prompt anchor: picking one drops the other.
      const rivals = a.exclusive
        ? addonDefs.filter((o) => o.id !== a.id && o.exclusive === a.exclusive).map((o) => String(o.id))
        : [];
      p.addons = [...list.filter((i) => !rivals.includes(i)), a.id];
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end">
        <Badge tone="new">{t("megumin.addons.activeModules", { count: addons.length + blocks.length })}</Badge>
      </div>

      <Callout tone="blue">
        <strong className="font-semibold text-[var(--foreground)]">{t("megumin.addons.didYouKnowLead")}</strong>{" "}
        {t("megumin.addons.didYouKnowBody")}
      </Callout>

      <MeguminSection title={t("megumin.addons.preferences.title")}>
        {usesRenderLimits ? (
          <div className="flex flex-col gap-2 border-b border-[var(--border)]/50 pb-4">
            <div className="text-sm font-semibold text-rose-500">{t("megumin.addons.v9.title")}</div>
            <p className="text-xs leading-relaxed text-[var(--marinara-chat-chrome-panel-muted)]">
              {t("megumin.addons.v9.description")}
            </p>
            <MeguminGrid layout="fields" className="mt-1">
              {(
                [
                  ["lean", "leanMin", "leanMax", "text-violet-500"],
                  ["full", "fullMin", "fullMax", "text-emerald-500"],
                ] as const
              ).map(([kind, min, max, tone]) => (
                <div
                  key={kind}
                  className="flex h-full flex-col gap-1.5 rounded-xl border border-[var(--border)]/60 bg-[var(--background)]/30 px-4 py-3"
                >
                  <div className="text-xs font-bold uppercase tracking-wide text-[var(--muted-foreground)]">
                    {t(`megumin.addons.v9.${kind}`)}
                  </div>
                  <div className={cn("text-xs leading-snug", tone)}>{t(`megumin.addons.v9.${kind}Hint`)}</div>
                  <div className="mt-auto flex items-center gap-2 pt-1">
                    <div className="min-w-0 flex-1">
                      <MeguminNumber value={limits[min]} onChange={(n) => setLimit(min, n)} />
                    </div>
                    <span className="text-xs text-[var(--muted-foreground)]">{t("megumin.addons.v9.to")}</span>
                    <div className="min-w-0 flex-1">
                      <MeguminNumber value={limits[max]} onChange={(n) => setLimit(max, n)} />
                    </div>
                  </div>
                </div>
              ))}
            </MeguminGrid>
          </div>
        ) : null}
        <MeguminGrid layout="fields">
          <MeguminText
            label={t("megumin.addons.language.label")}
            help={t("megumin.addons.language.description")}
            value={String(profile.userLanguage ?? "")}
            placeholder={t("megumin.addons.language.placeholder")}
            onChange={(v) => set("userLanguage", v)}
          />
          <MeguminSelect
            label={t("megumin.addons.pronouns.label")}
            help={t("megumin.addons.pronouns.description")}
            value={String(profile.userPronouns ?? "off")}
            onChange={(v) => set("userPronouns", v)}
            options={[
              { value: "off", label: t("megumin.addons.pronouns.off") },
              { value: "male", label: t("megumin.addons.pronouns.male") },
              { value: "female", label: t("megumin.addons.pronouns.female") },
            ]}
          />
        </MeguminGrid>
      </MeguminSection>

      <MeguminSection title={t("megumin.addons.gameplay.title")}>
        <Callout tone="gold">{t("megumin.addons.gameplay.fewer")}</Callout>
        <MeguminGrid className="items-stretch">
          {addonDefs.map((a) => {
            const isSel = addons.includes(String(a.id));
            const v6Locked = a.id === "npc_events" && !isV6;
            return (
              <PickCard
                key={String(a.id)}
                active={isSel}
                locked={v6Locked}
                onPick={() => toggleAddon(a)}
                title={String(a.label ?? a.id)}
                titleExtra={
                  isSel ? (
                    <Badge tone="active" icon={<Check size="0.75rem" />}>
                      {t("megumin.addons.on")}
                    </Badge>
                  ) : null
                }
                description={<RichText text={ADDON_DESCRIPTIONS[String(a.id)] ?? ""} />}
                badges={
                  <>
                    {a.recommended ? (
                      <Badge tone="rec" icon={<Star size="0.75rem" />}>
                        {t("megumin.addons.recommended")}
                      </Badge>
                    ) : null}
                    {customBadge(a.trigger)}
                    {a.id === "npc_events" ? (
                      isV6 ? (
                        <Badge tone="ok" icon={<LockOpen size="0.75rem" />}>
                          {t("megumin.addons.v6Active")}
                        </Badge>
                      ) : (
                        <Badge tone="warn" icon={<Lock size="0.75rem" />}>
                          {t("megumin.addons.requiresV6")}
                        </Badge>
                      )
                    ) : null}
                  </>
                }
              />
            );
          })}

          <PickCard
            active={ono.enabled}
            onPick={() =>
              update((p) => {
                p.onomatopoeia = { enabled: false, useStyling: false, ...(p.onomatopoeia ?? {}) };
                p.onomatopoeia.enabled = !p.onomatopoeia.enabled;
              })
            }
            title={t("megumin.addons.sounds.title")}
            titleExtra={
              <>
                {ono.enabled ? (
                  <Badge tone="active" icon={<Check size="0.75rem" />}>
                    {t("megumin.addons.on")}
                  </Badge>
                ) : null}
                {customBadge("[[onomato]]")}
              </>
            }
            description={t("megumin.addons.sounds.description")}
          >
            {ono.enabled ? (
              <div
                className="mt-1 border-t border-dashed border-[var(--border)]/70 pt-2"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <SwitchRow
                  label={t("megumin.addons.sounds.animate")}
                  description={t("megumin.addons.sounds.animateDescription")}
                  checked={ono.useStyling}
                  onChange={(on) =>
                    update((p) => {
                      p.onomatopoeia = { enabled: true, ...(p.onomatopoeia ?? {}), useStyling: on };
                    })
                  }
                />
              </div>
            ) : null}
          </PickCard>
        </MeguminGrid>
      </MeguminSection>

      {customSettings.length ? (
        <MeguminSection title={t("megumin.addons.customModules")}>
          <MeguminGrid layout="fields" className="gap-x-6 gap-y-1">
            {customSettings.map((cs) => (
              <SwitchRow
                key={String(cs.id)}
                label={String(cs.name ?? cs.id)}
                description={t("megumin.addons.customModuleTarget", { slot: String(cs.attachPoint ?? "") })}
                checked={!!toggles[String(cs.id)]}
                onChange={(on) =>
                  update((p) => {
                    p.toggles = { ...(p.toggles ?? {}), [String(cs.id)]: on };
                  })
                }
              />
            ))}
          </MeguminGrid>
        </MeguminSection>
      ) : null}

      <MeguminSection title={t("megumin.addons.formats.title")} icon={<CodeXml size="1rem" />}>
        <MeguminGrid className="items-stretch">
          {formatBlocks.map((b) => {
            const isSel = blocks.includes(String(b.id));
            return (
              <PickCard
                key={String(b.id)}
                active={isSel}
                onPick={() =>
                  update((p) => {
                    const list = (Array.isArray(p.blocks) ? p.blocks : []) as string[];
                    p.blocks = list.includes(b.id) ? list.filter((i) => i !== b.id) : [...list, b.id];
                  })
                }
                title={String(b.label ?? b.id)}
                titleExtra={
                  <>
                    {isSel ? (
                      <Badge tone="active" icon={<Check size="0.75rem" />}>
                        {t("megumin.addons.on")}
                      </Badge>
                    ) : null}
                    {customBadge(b.trigger)}
                  </>
                }
                description={<RichText text={FORMAT_DESCRIPTIONS[String(b.id)] ?? ""} />}
                badges={
                  engineHas(activeMode, String(b.id)) ? (
                    <Badge tone="override" icon={<GitBranch size="0.75rem" />}>
                      {t("megumin.addons.engineOverride")}
                    </Badge>
                  ) : null
                }
              />
            );
          })}
        </MeguminGrid>
      </MeguminSection>
    </div>
  );
}
