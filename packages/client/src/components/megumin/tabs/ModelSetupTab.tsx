// ──────────────────────────────────────────────
// Megumin panel: Model Setup
// ──────────────────────────────────────────────
// Pick your model, see the settings tested for it, and "Use this loadout"
// applies them, to every character unless you keep it to this one. A loadout
// not in use shows its own settings as a draft; the loadout in use shows the
// real settings, so changing one here changes it in its tab too.
// Megumin's src/features/modelsetup/ui.js (with loadouts.js and the Chomusuke
// setup steps of ui/modelGuide.js).
import { useMemo, useState, type ComponentType, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  ArrowRight,
  Cat,
  Check,
  ChevronDown,
  Cpu,
  Eye,
  Feather,
  Flame,
  Gem,
  Hourglass,
  Laptop,
  Lightbulb,
  Lock,
  Sprout,
  SquareArrowOutUpRight,
  TriangleAlert,
  Zap,
} from "lucide-react";
import { cn } from "../../../lib/utils";
import { useMeguminPanel } from "../megumin-panel-context";
import { MEGUMIN_INPUT_CLASS, MeguminButton, MeguminSection } from "../MeguminControls";
import { Badge, Callout, PickCard, RichText, Segmented, SwitchRow } from "./presetControls";
import {
  LOADOUT_SETTINGS,
  V11_ENGINES,
  V11_STYLE_IDS,
  changedFromLoadout,
  configOptions,
  meguminTabState,
  readLoadoutSetting,
  setPresetPage,
  upgradeConfigValue,
  writeLoadoutSetting,
  type LoadoutCtx,
  type LoadoutSettingKey,
  type MeguminEngine,
} from "./presetData";

const LOADOUT_ICONS: Record<string, ComponentType<{ size?: string | number; className?: string }>> = {
  "fa-gem": Gem,
  "fa-feather": Feather,
  "fa-dragon": Flame,
  "fa-bolt": Zap,
  "fa-hourglass-half": Hourglass,
  "fa-house-laptop": Laptop,
};

function LoadoutIcon({ icon }: { icon: unknown }) {
  const Icon = LOADOUT_ICONS[String(icon)] ?? Cpu;
  return <Icon size="0.75rem" className="shrink-0" />;
}

type Loadout = MeguminEngine & {
  id: string;
  name: string;
  why: string;
  models: string;
  notes: Array<{ tone: string; text: string; chomusuke?: boolean }>;
  settings: Record<string, unknown>;
};

/** The Model Setup page's view of the profile: Story Config's length by label, the CoT and style lists. */
function useLoadoutCtx(): LoadoutCtx {
  const { catalog } = useMeguminPanel();
  return useMemo(() => {
    const fields = (catalog.storyConfigFields ?? []) as Array<Record<string, any>>;
    const lengthField = fields.find((f) => f.key === "length") ?? { key: "length", options: [] };
    return {
      lengthLabel(v: unknown) {
        const value = upgradeConfigValue(lengthField, v || "");
        if (!value) return "";
        const o = configOptions(lengthField).find((x) => x.value === value);
        return o ? o.label : "custom";
      },
      lengthValue(label: string) {
        const o = configOptions(lengthField).find((x) => x.label === label);
        return o ? o.value : label;
      },
      cotIds: ((catalog.chainsOfThought ?? []) as MeguminEngine[]).map((c) => String(c.id)),
      directStyles: (catalog.directStyles ?? []) as MeguminEngine[],
    };
  }, [catalog.chainsOfThought, catalog.directStyles, catalog.storyConfigFields]);
}

export function ModelSetupTab() {
  const { t } = useTranslation();
  const { profile, catalog } = useMeguminPanel();
  const loadouts = (catalog.loadouts ?? []) as Loadout[];
  const comingSoon = (catalog.loadoutsComingSoon ?? []) as MeguminEngine[];
  const byId = (id: unknown) => loadouts.find((l) => l.id === id);
  const fallback = byId(profile.loadout) ? String(profile.loadout) : (loadouts[0]?.id ?? null);
  const [picked, setPickedState] = useState<string | null>(
    meguminTabState.setupPicked && byId(meguminTabState.setupPicked) ? meguminTabState.setupPicked : fallback,
  );
  const setPicked = (id: string) => {
    meguminTabState.setupPicked = id;
    setPickedState(id);
  };
  const current = byId(picked) ?? byId(fallback);

  return (
    <div className="flex flex-col gap-3">
      <Callout tone="green">
        <strong className="font-semibold text-[var(--foreground)]">{t("megumin.setup.optionalLead")}</strong>{" "}
        {t("megumin.setup.optionalBody")}
      </Callout>

      <MeguminSection title={t("megumin.setup.pick.title")} description={t("megumin.setup.pick.description")}>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {loadouts.map((l) => (
            <PickCard
              key={l.id}
              active={l.id === current?.id}
              onPick={l.id === current?.id ? undefined : () => setPicked(l.id)}
              title={
                <span className="inline-flex items-center gap-1.5">
                  <LoadoutIcon icon={l.icon} />
                  {l.name}
                </span>
              }
              titleExtra={
                profile.loadout === l.id ? (
                  <Badge tone="active" icon={<Check size="0.5rem" />}>
                    {t("megumin.setup.inUse")}
                  </Badge>
                ) : null
              }
              description={l.models}
            />
          ))}
          {comingSoon.map((l) => (
            <PickCard
              key={String(l.name)}
              locked
              title={
                <span className="inline-flex items-center gap-1.5">
                  <LoadoutIcon icon={l.icon} />
                  {String(l.name)}
                </span>
              }
              description={String(l.models ?? "")}
              badges={
                <Badge tone="locked" icon={<Lock size="0.5rem" />}>
                  {t("megumin.setup.comingSoon")}
                </Badge>
              }
            />
          ))}
        </div>
      </MeguminSection>

      {current ? <LoadoutCard key={current.id} loadout={current} /> : null}
      <StyleCard />
      <HelpCard />
    </div>
  );
}

// ── The picked loadout ───────────────────────────────────────────────────

function LoadoutCard({ loadout: l }: { loadout: Loadout }) {
  const { t } = useTranslation();
  const { profile, update, flush, run, running, openTab } = useMeguminPanel();
  const ctx = useLoadoutCtx();
  const inUse = profile.loadout === l.id;
  const [draft, setDraftState] = useState<Record<string, unknown>>(
    () => (meguminTabState.setupDrafts[l.id] ??= { ...l.settings }),
  );
  const [onlyThis, setOnlyThisState] = useState(meguminTabState.setupOnlyThisCharacter);
  const setOnlyThis = (on: boolean) => {
    meguminTabState.setupOnlyThisCharacter = on;
    setOnlyThisState(on);
  };
  const setDraft = (key: string, value: unknown) => {
    const next = { ...draft, [key]: value };
    meguminTabState.setupDrafts[l.id] = next;
    setDraftState(next);
  };

  const changed = inUse
    ? changedFromLoadout(profile, l, ctx)
    : Object.keys(l.settings).filter((k) => draft[k] !== l.settings[k]);
  const chomusuke = (profile.chomusuke ?? {}) as Record<string, any>;
  const chomusukeReady = Boolean(chomusuke.enabled && chomusuke.profileId);

  const applyLoadout = async () => {
    const settings = inUse ? l.settings : draft;
    try {
      // A row changed a moment ago must reach the profile before the loadout is written over it.
      await flush();
      await run("loadout.apply", { id: l.id, onlyThisCharacter: onlyThis, settings });
      delete meguminTabState.setupDrafts[l.id];
      setDraftState({ ...l.settings });
      if (onlyThis) {
        toast.success(
          "chomusuke" in settings
            ? t("megumin.setup.appliedThisChomusuke", { name: l.name })
            : t("megumin.setup.appliedThis", { name: l.name }),
        );
      } else {
        toast.success(t("megumin.setup.appliedAll", { name: l.name }));
      }
    } catch {
      /* the action reports its own error */
    }
  };

  return (
    <MeguminSection title={l.name} icon={<LoadoutIcon icon={l.icon} />} description={l.why}>
      {(l.notes ?? []).map((n, i) => (
        <Callout
          key={i}
          tone={n.tone === "red" ? "red" : "gold"}
          icon={
            n.tone === "red" ? (
              <TriangleAlert size="0.75rem" className="text-[var(--destructive)]" />
            ) : (
              <Lightbulb size="0.75rem" className="text-amber-500" />
            )
          }
        >
          <RichText text={n.text} />
          {n.chomusuke && !chomusukeReady ? (
            <>
              {" "}
              {t("megumin.setup.chomusukeNotSet")}
              <div className="mt-1">
                <MeguminButton icon={<ArrowRight size="0.75rem" />} onClick={() => openTab("chomusuke")}>
                  {t("megumin.setup.setUpChomusuke")}
                </MeguminButton>
              </div>
            </>
          ) : null}
        </Callout>
      ))}

      {!inUse ? (
        <Callout tone="muted" icon={<Eye size="0.75rem" className="text-[var(--muted-foreground)]" />}>
          <strong className="font-semibold text-[var(--foreground)]">{t("megumin.setup.notInUseLead")}</strong>{" "}
          {t("megumin.setup.notInUseBody")}
        </Callout>
      ) : null}

      <div className="flex flex-col gap-1.5">
        {Object.keys(l.settings).map((key) => {
          const def = LOADOUT_SETTINGS.find((s) => s.key === key);
          if (!def) return null;
          const value = inUse ? readLoadoutSetting(def.key, profile, ctx) : draft[key];
          const set = inUse
            ? (v: unknown) => update((p) => writeLoadoutSetting(def.key, p, v, ctx))
            : (v: unknown) => setDraft(key, v);
          return (
            <SettingRow
              key={key}
              settingKey={def.key}
              value={value}
              loadoutValue={l.settings[key]}
              isChanged={changed.includes(key)}
              hasDesc={!!def.hasDesc}
              onOpen={() => {
                if (def.tab === "preset") setPresetPage(def.page);
                openTab(def.tab);
              }}
              onChange={set}
            />
          );
        })}
      </div>

      <div className="flex flex-col gap-2 border-t border-[var(--border)]/50 pt-2">
        <SwitchRow
          label={t("megumin.setup.onlyThis")}
          description={onlyThis ? t("megumin.setup.onlyThisOn") : t("megumin.setup.onlyThisOff")}
          checked={onlyThis}
          onChange={setOnlyThis}
        />
        <MeguminButton
          variant="primaryFull"
          icon={<Check size="0.8125rem" />}
          pending={running("loadout.apply")}
          onClick={() => void applyLoadout()}
        >
          {t("megumin.setup.use")}
        </MeguminButton>
      </div>
    </MeguminSection>
  );
}

const TAB_TITLE_KEYS: Record<string, string> = {
  preset: "megumin.tabs.preset.title",
  banlist: "megumin.tabs.banlist.title",
  addons: "megumin.tabs.addons.title",
  chomusuke: "megumin.tabs.chomusuke.title",
  style: "megumin.tabs.style.title",
};

function SettingRow({
  settingKey,
  value,
  loadoutValue,
  isChanged,
  hasDesc,
  onOpen,
  onChange,
}: {
  settingKey: LoadoutSettingKey;
  value: unknown;
  loadoutValue: unknown;
  isChanged: boolean;
  hasDesc: boolean;
  onOpen: () => void;
  onChange: (value: unknown) => void;
}) {
  const { t } = useTranslation();
  const { catalog, view } = useMeguminPanel();
  const def = LOADOUT_SETTINGS.find((s) => s.key === settingKey)!;
  const engines = [...((catalog.engines ?? []) as MeguminEngine[]), ...((view.customModes ?? []) as MeguminEngine[])];
  const engineLabel = (id: unknown) => String(engines.find((e) => e.id === id)?.label ?? id ?? "");
  const lengthOptions = configOptions(
    ((catalog.storyConfigFields ?? []) as Array<Record<string, any>>).find((f) => f.key === "length") ?? {},
  );

  // How a loadout value reads in the "Changed from the loadout" tooltip.
  const describe = (v: unknown) => {
    if (settingKey === "mode") return engineLabel(v);
    if (settingKey === "thinking" || settingKey === "thinkingCap" || settingKey === "html")
      return v ? t("megumin.setup.describe.on") : t("megumin.setup.describe.off");
    if (settingKey === "banList")
      return v === "short"
        ? t("megumin.setup.describe.short")
        : v === "off"
          ? t("megumin.setup.describe.ownOnly")
          : t("megumin.setup.describe.full");
    if (settingKey === "length") return String(v ?? "");
    return v === "chomusuke" ? t("megumin.setup.describe.chomusukeOn") : t("megumin.setup.describe.chomusukeOff");
  };

  let control: ReactNode;
  if (settingKey === "mode") {
    const id = String(value ?? "");
    const ids = V11_ENGINES.includes(id) ? V11_ENGINES : [...V11_ENGINES, id];
    control = (
      <select
        className={MEGUMIN_INPUT_CLASS}
        value={id}
        aria-label={t("megumin.setup.row.mode.label")}
        onChange={(e) => onChange(e.target.value)}
      >
        {ids.map((x) => (
          <option key={x} value={x}>
            {engineLabel(x)}
          </option>
        ))}
      </select>
    );
  } else if (settingKey === "thinking" || settingKey === "thinkingCap" || settingKey === "html") {
    control = (
      <SwitchRow
        label={value ? t("megumin.setup.describe.onCap") : t("megumin.setup.describe.offCap")}
        checked={Boolean(value)}
        onChange={(on) => onChange(on)}
      />
    );
  } else if (settingKey === "length") {
    const label = String(value ?? "");
    const unset = label === "custom" || label === "";
    control = (
      <select
        className={MEGUMIN_INPUT_CLASS}
        value={unset ? "" : label}
        aria-label={t("megumin.setup.row.length.label")}
        onChange={(e) => {
          if (e.target.value) onChange(e.target.value);
        }}
      >
        {unset ? (
          <option value="">{label === "custom" ? t("megumin.setup.lengthOwn") : t("megumin.setup.lengthUnset")}</option>
        ) : null}
        {lengthOptions.map((o) => (
          <option key={o.label} value={o.label}>
            {o.label}
          </option>
        ))}
      </select>
    );
  } else if (settingKey === "banList") {
    control = (
      <Segmented
        ariaLabel={t("megumin.setup.row.banList.label")}
        value={String(value ?? "")}
        onChange={(id) => onChange(id)}
        options={[
          { id: "full", label: t("megumin.setup.banList.full") },
          { id: "short", label: t("megumin.setup.banList.short") },
          { id: "off", label: t("megumin.setup.banList.ownOnly") },
        ]}
      />
    );
  } else {
    control = (
      <Segmented
        ariaLabel={t("megumin.setup.row.chomusuke.label")}
        value={String(value ?? "")}
        onChange={(id) => onChange(id)}
        options={[
          { id: "story", label: t("megumin.setup.describe.offCap") },
          { id: "chomusuke", label: t("megumin.setup.describe.onCap") },
        ]}
      />
    );
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-[var(--border)]/60 bg-[var(--background)]/30 px-2.5 py-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[0.6875rem] font-semibold text-[var(--marinara-chat-chrome-panel-title)]">
          {t(`megumin.setup.row.${settingKey}.label`)}
        </span>
        {value === "mixed" ? <Badge tone="warn">{t("megumin.setup.mixed")}</Badge> : null}
        {isChanged ? (
          <Badge tone="custom" title={t("megumin.setup.changedTitle", { value: describe(loadoutValue) })}>
            {t("megumin.setup.changed")}
          </Badge>
        ) : null}
        <button
          type="button"
          onClick={onOpen}
          title={t("megumin.setup.openTab", { tab: t(TAB_TITLE_KEYS[def.tab] ?? "megumin.tabs.preset.title") })}
          className="mari-chrome-control mari-chrome-control--small ml-auto inline-flex items-center gap-1 text-[0.625rem]"
        >
          <SquareArrowOutUpRight size="0.625rem" />
          {t(TAB_TITLE_KEYS[def.tab] ?? "megumin.tabs.preset.title")}
        </button>
      </div>
      {hasDesc ? (
        <p className="text-[0.625rem] leading-relaxed text-[var(--marinara-chat-chrome-panel-muted)]">
          {t(`megumin.setup.row.${settingKey}.description`)}
        </p>
      ) : null}
      {control}
    </div>
  );
}

// ── Writing style ────────────────────────────────────────────────────────

function StyleCard() {
  const { t } = useTranslation();
  const { profile, catalog, update, openTab } = useMeguminPanel();
  const directStyles = (catalog.directStyles ?? []) as MeguminEngine[];
  return (
    <MeguminSection title={t("megumin.setup.style.title")} description={t("megumin.setup.style.description")}>
      <div className="grid grid-cols-1 gap-1.5">
        {V11_STYLE_IDS.map((id) => {
          const ds = directStyles.find((s) => s.id === id);
          if (!ds) return null;
          const on = profile.activeStyleId === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              onClick={() =>
                update((p) => {
                  p.activeStyleId = ds.id;
                  p.aiRule = ds.rule;
                })
              }
              className={cn(
                "flex flex-col items-start gap-0.5 rounded-lg border px-2.5 py-2 text-left transition-colors",
                on
                  ? "border-[var(--primary)]/55 bg-[var(--primary)]/10"
                  : "border-[var(--border)]/70 bg-[var(--background)]/35 hover:bg-[var(--accent)]/50",
              )}
            >
              <span className="text-xs font-semibold text-[var(--marinara-chat-chrome-panel-title)]">
                {String(ds.name)}
              </span>
              <span className="text-[0.625rem] leading-relaxed text-[var(--marinara-chat-chrome-panel-muted)]">
                {String(ds.desc ?? "")}
              </span>
            </button>
          );
        })}
      </div>
      <MeguminButton icon={<SquareArrowOutUpRight size="0.75rem" />} onClick={() => openTab("style")}>
        {t("megumin.tabs.style.title")}
      </MeguminButton>
    </MeguminSection>
  );
}

// ── Chomusuke setup and good habits (from Megumin's old Model guide) ─────

const SETUP_STEPS = ["connection", "sameModel", "pick", "jobs"] as const;
const HABITS = ["fewer", "hideBlocks", "combine"] as const;

function Fold({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-[var(--border)]/60 bg-[var(--background)]/30">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-[0.6875rem] font-semibold text-[var(--marinara-chat-chrome-panel-title)]"
      >
        {icon}
        <span className="flex-1">{title}</span>
        <ChevronDown size="0.75rem" className={cn("transition-transform", open && "rotate-180")} />
      </button>
      {open ? <div className="border-t border-[var(--border)]/50 px-2.5 py-2">{children}</div> : null}
    </div>
  );
}

function HelpCard() {
  const { t } = useTranslation();
  return (
    <MeguminSection title={t("megumin.setup.help.title")}>
      <Fold icon={<Cat size="0.75rem" />} title={t("megumin.setup.help.chomusuke")}>
        <ol className="flex list-decimal flex-col gap-1 pl-4 text-[0.625rem] leading-relaxed text-[var(--marinara-chat-chrome-panel-muted)]">
          {SETUP_STEPS.map((step) => (
            <li key={step}>{t(`megumin.setup.help.steps.${step}`)}</li>
          ))}
        </ol>
        <p className="mt-1.5 text-[0.625rem] leading-relaxed text-[var(--marinara-chat-chrome-panel-muted)]">
          {t("megumin.setup.help.modelAdvice")}
        </p>
      </Fold>
      <Fold icon={<Sprout size="0.75rem" />} title={t("megumin.setup.help.habits")}>
        <ul className="flex list-disc flex-col gap-1 pl-4 text-[0.625rem] leading-relaxed text-[var(--marinara-chat-chrome-panel-muted)]">
          {HABITS.map((habit) => (
            <li key={habit}>
              <strong className="font-semibold text-[var(--foreground)]">
                {t(`megumin.setup.help.habit.${habit}.lead`)}
              </strong>{" "}
              {t(`megumin.setup.help.habit.${habit}.body`)}
            </li>
          ))}
        </ul>
      </Fold>
    </MeguminSection>
  );
}
