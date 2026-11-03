// ──────────────────────────────────────────────
// Megumin panel: Chomusuke, the helper model
// ──────────────────────────────────────────────
// Port of Megumin's src/ui/tabs/chomusuke.js. Chomusuke runs Megumin's
// background jobs on a second YunYun connection, sent straight to it, so the
// story's connection never changes (YunYun never switches connections), or on
// the chat's own connection ("Use my current connection").
//
// The setup is install-wide (Megumin keeps it in its own store, not per
// character). It is edited through the profile's `chomusuke`, which Megumin's
// profile save moves into the store (core/profile.ts saveGlobalChomusuke), so
// a later profile save can never write an older copy back over it.
import { useState, type ComponentType, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  ArrowRight,
  Ban,
  BookOpen,
  BookUser,
  Boxes,
  Cat,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleX,
  Clapperboard,
  FlaskConical,
  Heart,
  Image,
  Layers,
  LifeBuoy,
  ListChecks,
  MemoryStick,
  MessagesSquare,
  Pin,
  Receipt,
  Shield,
  ShieldAlert,
  Square,
  Star,
  TriangleAlert,
  WandSparkles,
} from "lucide-react";
import { isChatProvider } from "@marinara-engine/shared";
import { MEGUMIN_CURRENT_CONNECTION } from "@marinara-engine/shared/megumin/client";
import { cn } from "../../../lib/utils";
import { useConnections } from "../../../hooks/use-connections";
import { useUIStore } from "../../../stores/ui.store";
import { closeMeguminWindow } from "../../../lib/megumin-tab-request";
import { SettingsSwitch } from "../../panels/settings/SettingControls";
import { useMeguminPanel } from "../megumin-panel-context";
import {
  MeguminButton,
  MeguminFeatureBar,
  MeguminGrid,
  MeguminHint,
  MeguminSection,
  MeguminSelect,
  type MeguminOption,
} from "../MeguminControls";
import type { MeguminProfile } from "../../../hooks/use-megumin";

type Icon = ComponentType<{ size?: string | number; className?: string }>;

type ChomusukeConfig = {
  enabled: boolean;
  profileId: string;
  primaryProfileId: string;
  features: Record<string, boolean | undefined>;
  blockRoutes: Record<string, boolean | undefined>;
  combine: { all?: boolean; worldFallback?: boolean; worldImage?: boolean };
};

const BLOCK_ROUTES: Array<{ id: "bonds" | "sheet" | "chatter" | "cyoa"; icon: Icon }> = [
  { id: "bonds", icon: Heart },
  { id: "sheet", icon: Shield },
  { id: "chatter", icon: MessagesSquare },
  { id: "cyoa", icon: ListChecks },
];

type Route = { key: string; icon: Icon; color: string; defaultOff?: boolean; note?: boolean };

// After every reply: a call on every reply while on (off by default, except Images).
const PER_REPLY: Route[] = [
  { key: "blocks", icon: Boxes, color: "text-rose-500", defaultOff: true },
  { key: "notebook", icon: BookOpen, color: "text-violet-500", defaultOff: true, note: true },
  { key: "imageGen", icon: Image, color: "text-cyan-500" },
];

// When the job runs: occasional, only when that job fires.
const OCCASIONAL: Route[] = [
  { key: "memory", icon: MemoryStick, color: "text-blue-500" },
  { key: "npc", icon: BookUser, color: "text-emerald-500" },
  { key: "storyPlan", icon: Clapperboard, color: "text-purple-500" },
  { key: "banList", icon: Ban, color: "text-red-500" },
  { key: "styleGen", icon: WandSparkles, color: "text-pink-500" },
];

/** Megumin's ensureConfig(): the setup with every part an old profile may lack. */
function ensureConfig(profile: MeguminProfile, fallback?: Record<string, any>): ChomusukeConfig {
  if (!profile.chomusuke || typeof profile.chomusuke !== "object") {
    profile.chomusuke =
      fallback && Object.keys(fallback).length
        ? structuredClone(fallback)
        : {
            enabled: false,
            profileId: "",
            primaryProfileId: "",
            features: {
              memory: true,
              storyPlan: true,
              npc: true,
              banList: true,
              imageGen: true,
              styleGen: true,
              worldState: false,
            },
          };
  }
  const cfg = profile.chomusuke as ChomusukeConfig;
  if (!cfg.features || typeof cfg.features !== "object") cfg.features = {};
  if (!cfg.blockRoutes || typeof cfg.blockRoutes !== "object")
    cfg.blockRoutes = { bonds: true, sheet: true, chatter: true, cyoa: true };
  if (!cfg.combine || typeof cfg.combine !== "object") cfg.combine = { all: false, worldFallback: false };
  // One switch now; the old "World State and image" switch carries over.
  if (cfg.combine.all === undefined) cfg.combine.all = cfg.combine.worldImage === true;
  return cfg;
}

const worldRouted = (cfg: ChomusukeConfig) => cfg.features.worldState === true;
const blockRouted = (cfg: ChomusukeConfig, id: string) => cfg.features.blocks === true && cfg.blockRoutes[id] !== false;
const anyBlockRouted = (cfg: ChomusukeConfig) => worldRouted(cfg) || BLOCK_ROUTES.some((b) => blockRouted(cfg, b.id));
// Most routes are on unless switched off; one that costs a call per reply is off unless switched on.
const routeOn = (cfg: ChomusukeConfig, route: Route) =>
  route.defaultOff ? cfg.features[route.key] === true : cfg.features[route.key] !== false;

function RouteRow({
  route,
  title,
  desc,
  note,
  on,
  onToggle,
  offChip,
  children,
}: {
  route: Route;
  title: string;
  desc: string;
  note?: string;
  on: boolean;
  onToggle: (next: boolean) => void;
  offChip?: ReactNode;
  /** Drawn under the description, inside the row (the Blocks row's block chips). */
  children?: ReactNode;
}) {
  const RouteIcon = route.icon;
  return (
    <div
      className={cn(
        "flex h-full min-w-0 items-start gap-3 rounded-xl border px-3.5 py-3 transition-colors",
        on
          ? "border-[var(--primary)]/40 bg-[var(--primary)]/5"
          : "border-[var(--border)]/70 bg-[var(--background)]/30 hover:bg-[var(--accent)]/40",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-[var(--marinara-chat-chrome-panel-title)]">
          <RouteIcon size="0.9375rem" className={cn("shrink-0", route.color)} />
          <span>{title}</span>
          {offChip}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-[var(--marinara-chat-chrome-panel-muted)]">{desc}</p>
        {note ? (
          <p className="mt-1.5 inline-flex items-start gap-1.5 text-xs font-medium leading-relaxed text-amber-500">
            <Star size="0.75rem" className="mt-0.5 shrink-0" />
            {note}
          </p>
        ) : null}
        {children}
      </div>
      <SettingsSwitch ariaLabel={title} checked={on} onChange={onToggle} />
    </div>
  );
}

export function ChomusukeTab() {
  const { t } = useTranslation();
  const { profile, view, update, flush, run, running, openTab } = useMeguminPanel();
  const connectionsQuery = useConnections();
  const openRightPanel = useUIStore((s) => s.openRightPanel);
  const [setupOpen, setSetupOpen] = useState<boolean | null>(null);
  const [testStatus, setTestStatus] = useState<{ ok: boolean; text: string } | null>(null);

  // Read through a copy so drawing never writes into the cached view.
  const cfg = ensureConfig(structuredClone({ chomusuke: profile.chomusuke }) as MeguminProfile, view.chomusuke);
  const edit = (change: (cfg: ChomusukeConfig) => void) =>
    update((draft) => {
      change(ensureConfig(draft, view.chomusuke));
    });

  const allConnections =
    (connectionsQuery.data as Array<{ id: string; name: string; provider: string }> | undefined) ?? [];
  const connections = allConnections.filter((c) => isChatProvider(c.provider));
  const onCurrent = cfg.profileId === MEGUMIN_CURRENT_CONNECTION;
  const worker = connections.find((c) => c.id === cfg.profileId);
  const missingWorker = !!cfg.profileId && !onCurrent && !worker && connectionsQuery.isSuccess;
  const ready = Boolean(cfg.enabled && cfg.profileId);

  // What is switched on in its own tab (featureOff in chomusuke.js).
  const stack: string[] = Array.isArray(profile.blockStack?.order) ? profile.blockStack.order : [];
  const worldOn = Array.isArray(profile.blocks) && profile.blocks.includes("info");
  const notebookOn = !!view.notebook?.enabled;
  const imageGen = profile.imageGen ?? {};
  const featureOff = (key: string): { text: string; tab: string } | null => {
    switch (key) {
      case "blocks":
        return worldOn || BLOCK_ROUTES.some((b) => stack.includes(b.id))
          ? null
          : { text: t("megumin.chomusuke.off.blocks"), tab: "blocks" };
      case "notebook":
        return notebookOn ? null : { text: t("megumin.chomusuke.off.notebook"), tab: "notebook" };
      case "imageGen":
        return imageGen.enabled ? null : { text: t("megumin.chomusuke.off.imageGen"), tab: "images" };
      case "memory":
        return profile.memoryCore?.enabled ? null : { text: t("megumin.chomusuke.off.memory"), tab: "memory" };
      case "npc":
        return profile.npcBank?.enabled ? null : { text: t("megumin.chomusuke.off.npc"), tab: "npc" };
      case "storyPlan":
        return profile.storyPlan?.enabled ? null : { text: t("megumin.chomusuke.off.storyPlan"), tab: "director" };
      default:
        return null;
    }
  };
  const offChip = (key: string) => {
    const off = featureOff(key);
    if (!off) return null;
    return (
      <button
        type="button"
        title={t("megumin.chomusuke.off.openTab")}
        onClick={(e) => {
          e.stopPropagation();
          openTab(off.tab);
        }}
        className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[0.6875rem] font-semibold text-amber-600 hover:bg-amber-500/25 dark:text-amber-400"
      >
        {off.text}
        <ArrowRight size="0.6875rem" />
      </button>
    );
  };

  // How many Chomusuke calls a reply can cost right now (callsPerReply).
  let calls = 0;
  if (worldRouted(cfg) && worldOn) calls++;
  if (BLOCK_ROUTES.some((b) => blockRouted(cfg, b.id) && stack.includes(b.id))) calls++;
  if (cfg.features.notebook === true && notebookOn) calls++;
  if (cfg.features.imageGen !== false && imageGen.enabled && (imageGen.triggerMode || "always") !== "manual") calls++;
  const routedPerReply = [
    worldRouted(cfg),
    cfg.features.blocks === true,
    cfg.features.notebook === true,
    cfg.features.imageGen !== false,
  ].filter(Boolean).length;
  const combineReady = ready && routedPerReply >= 2;
  const cost = !ready
    ? t("megumin.chomusuke.cost.off")
    : calls === 0
      ? t("megumin.chomusuke.cost.none")
      : calls === 1
        ? t("megumin.chomusuke.cost.one")
        : cfg.combine.all && combineReady
          ? t("megumin.chomusuke.cost.combined", { count: calls })
          : t("megumin.chomusuke.cost.many", { count: calls });

  const connectionOptions: MeguminOption[] = [
    { value: "", label: t("megumin.chomusuke.connection.pick") },
    { value: MEGUMIN_CURRENT_CONNECTION, label: t("megumin.chomusuke.connection.current") },
    ...connections.map((c) => ({ value: c.id, label: c.name })),
  ];

  const readyText = ready
    ? onCurrent
      ? t("megumin.chomusuke.status.readyCurrent")
      : t("megumin.chomusuke.status.readyOn", { name: worker?.name ?? t("megumin.chomusuke.status.yourWorker") })
    : cfg.enabled
      ? t("megumin.chomusuke.status.pick")
      : t("megumin.chomusuke.status.off");

  const test = async () => {
    if (!cfg.profileId) {
      toast.warning(t("megumin.chomusuke.test.pickFirst"));
      return;
    }
    setTestStatus(null);
    try {
      // The test reads the saved setup: a connection picked a moment ago must be saved first.
      await flush();
      const result = (await run("chomusuke.test")) as { ok?: boolean; reply?: string } | null;
      if (result?.ok) {
        setTestStatus({ ok: true, text: t("megumin.chomusuke.test.ok") });
        toast.success(t("megumin.chomusuke.test.okToast"));
      } else {
        setTestStatus({ ok: false, text: t("megumin.chomusuke.test.empty") });
      }
    } catch (error) {
      setTestStatus({
        ok: false,
        text: t("megumin.chomusuke.test.failed", { error: error instanceof Error ? error.message : String(error) }),
      });
    }
  };

  const status = view.chomusukeStatus;
  const busy = !!status?.running || (status?.waiting ?? 0) > 0;
  const showSetup = setupOpen === null ? connections.length === 0 : setupOpen;

  return (
    <div className="flex flex-col gap-4">
      <MeguminFeatureBar
        ariaLabel={t("megumin.chomusuke.master.aria")}
        icon={
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-rose-500 to-rose-700 text-white">
            <Cat size="0.875rem" />
          </span>
        }
        title={cfg.enabled ? t("megumin.chomusuke.master.on") : t("megumin.chomusuke.master.off")}
        checked={cfg.enabled}
        onChange={(next) =>
          edit((c) => {
            c.enabled = next;
          })
        }
      />

      {busy ? (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-[0.8125rem]">
          <span className="inline-flex min-w-0 flex-1 items-center gap-2">
            <Cat size="0.875rem" className="shrink-0 animate-pulse text-rose-500" />
            <span className="truncate">
              {status?.running
                ? t("megumin.chomusuke.busy.running", { jobs: status.running.jobs.join(", ") })
                : t("megumin.chomusuke.busy.waiting", { count: status?.waiting ?? 0 })}
            </span>
          </span>
          <MeguminButton
            variant="danger"
            icon={<Square size="0.75rem" />}
            pending={running("chomusuke.stop")}
            onClick={() => void run("chomusuke.stop").catch(() => undefined)}
          >
            {t("megumin.chomusuke.busy.stop")}
          </MeguminButton>
        </div>
      ) : null}

      <MeguminSection
        title={t("megumin.chomusuke.connection.title")}
        description={t("megumin.chomusuke.connection.sub")}
      >
        {connectionsQuery.isSuccess && !connections.length ? (
          <Banner tone="danger" icon={<TriangleAlert size="0.875rem" />}>
            {t("megumin.chomusuke.connection.none")}
          </Banner>
        ) : null}
        {missingWorker ? (
          <Banner tone="danger" icon={<TriangleAlert size="0.875rem" />}>
            {t("megumin.chomusuke.connection.missing")}
          </Banner>
        ) : null}
        <Banner icon={<ShieldAlert size="0.875rem" />}>{t("megumin.chomusuke.connection.censorship")}</Banner>
        <div className="flex flex-wrap items-stretch gap-2">
          <div className="min-w-0 flex-[1_1_16rem] @2xl:max-w-md">
            <MeguminSelect
              value={cfg.profileId}
              options={connectionOptions}
              onChange={(value) =>
                edit((c) => {
                  c.profileId = value;
                })
              }
            />
          </div>
          <MeguminButton
            icon={<FlaskConical size="0.8125rem" />}
            pending={running("chomusuke.test")}
            onClick={() => void test()}
          >
            {t("megumin.chomusuke.test.button")}
          </MeguminButton>
        </div>
        {testStatus ? (
          <p
            className={cn(
              "inline-flex items-start gap-1.5 text-xs leading-relaxed",
              testStatus.ok ? "text-emerald-500" : "text-[var(--destructive)]",
            )}
          >
            {testStatus.ok ? (
              <CircleCheck size="0.875rem" className="mt-px shrink-0" />
            ) : (
              <CircleX size="0.875rem" className="mt-px shrink-0" />
            )}
            {testStatus.text}
          </p>
        ) : (
          <MeguminHint>{readyText}</MeguminHint>
        )}
        <div className="flex flex-col gap-2 border-t border-[var(--border)]/50 pt-3">
          <button
            type="button"
            aria-expanded={showSetup}
            onClick={() => setSetupOpen(!showSetup)}
            className="inline-flex min-h-8 items-center gap-1.5 self-start text-[0.8125rem] font-semibold text-[var(--marinara-chat-chrome-panel-title)] hover:underline"
          >
            {showSetup ? <ChevronDown size="0.875rem" /> : <ChevronRight size="0.875rem" />}
            {t("megumin.chomusuke.setup.title")}
          </button>
          {showSetup ? (
            <div className="flex flex-col items-start gap-3 rounded-lg border border-[var(--border)]/60 bg-[var(--background)]/40 px-4 py-3">
              <ol className="ml-5 flex list-decimal flex-col gap-1.5 text-[0.8125rem] leading-relaxed text-[var(--marinara-chat-chrome-panel-muted)] marker:font-semibold marker:text-amber-500">
                <li>{t("megumin.chomusuke.setup.step1")}</li>
                <li>{t("megumin.chomusuke.setup.step2")}</li>
                <li>{t("megumin.chomusuke.setup.step3")}</li>
              </ol>
              <MeguminButton
                onClick={() => {
                  closeMeguminWindow();
                  openRightPanel("connections");
                }}
              >
                {t("megumin.chomusuke.setup.openConnections")}
              </MeguminButton>
            </div>
          ) : null}
        </div>
      </MeguminSection>

      <MeguminSection title={t("megumin.chomusuke.perReply.title")} description={t("megumin.chomusuke.perReply.sub")}>
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-[0.8125rem] leading-relaxed">
          <Receipt size="0.875rem" className="mt-0.5 shrink-0 text-amber-500" />
          <span>{cost}</span>
        </div>
        {/* Blocks takes a full row so its block chips sit side by side; the other two share the next row. */}
        <div className="grid grid-cols-1 items-stretch gap-3 @2xl:grid-cols-2">
          {PER_REPLY.map((route) => {
            const isBlocks = route.key === "blocks";
            const on = isBlocks ? anyBlockRouted(cfg) : routeOn(cfg, route);
            return (
              <div key={route.key} className={cn("flex min-w-0 flex-col", isBlocks && "@2xl:col-span-2")}>
                <RouteRow
                  route={route}
                  title={t(`megumin.chomusuke.route.${route.key}.title`)}
                  desc={t(`megumin.chomusuke.route.${route.key}.desc`)}
                  note={route.note ? t("megumin.chomusuke.route.notebook.note") : undefined}
                  on={on}
                  offChip={offChip(route.key)}
                  onToggle={() =>
                    edit((c) => {
                      if (isBlocks) {
                        // The row turns every block on or off; the chips pick single ones.
                        c.features.worldState = !on;
                        c.features.blocks = !on;
                        if (!on) BLOCK_ROUTES.forEach((b) => (c.blockRoutes[b.id] = true));
                      } else {
                        c.features[route.key] = !on;
                      }
                    })
                  }
                >
                  {isBlocks ? (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      <BlockChip
                        icon={Pin}
                        label={t("megumin.chomusuke.blocks.world")}
                        checked={worldRouted(cfg)}
                        inStack={worldOn}
                        offTitle={t("megumin.chomusuke.blocks.worldNotOn")}
                        notOn={t("megumin.chomusuke.blocks.notOn")}
                        onChange={(checked) =>
                          edit((c) => {
                            c.features.worldState = checked;
                          })
                        }
                      />
                      {BLOCK_ROUTES.map((b) => (
                        <BlockChip
                          key={b.id}
                          icon={b.icon}
                          label={t(`megumin.chomusuke.blocks.${b.id}`)}
                          checked={blockRouted(cfg, b.id)}
                          inStack={stack.includes(b.id)}
                          offTitle={t("megumin.chomusuke.blocks.blockNotOn")}
                          notOn={t("megumin.chomusuke.blocks.notOn")}
                          onChange={(checked) =>
                            edit((c) => {
                              if (checked && c.features.blocks !== true) {
                                // The first block ticked turns the route on with just that block.
                                c.features.blocks = true;
                                BLOCK_ROUTES.forEach((x) => (c.blockRoutes[x.id] = x.id === b.id));
                              } else {
                                c.blockRoutes[b.id] = checked;
                                if (!BLOCK_ROUTES.some((x) => c.blockRoutes[x.id] !== false)) c.features.blocks = false;
                              }
                            })
                          }
                        />
                      ))}
                    </div>
                  ) : null}
                </RouteRow>
              </div>
            );
          })}
        </div>

        <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-t border-[var(--border)]/50 pt-3">
          <div className="text-sm font-semibold text-[var(--marinara-chat-chrome-panel-title)]">
            {t("megumin.chomusuke.combine.title")}
          </div>
          {!combineReady ? <MeguminHint>{t("megumin.chomusuke.combine.needs")}</MeguminHint> : null}
        </div>
        <div className="grid grid-cols-1 items-stretch gap-3 @2xl:grid-cols-2">
          <RouteRow
            route={{ key: "combineAll", icon: Layers, color: "text-amber-500" }}
            title={t("megumin.chomusuke.combine.all")}
            desc={t("megumin.chomusuke.combine.allDesc")}
            on={cfg.combine.all === true && combineReady}
            onToggle={(next) => {
              if (!combineReady) return;
              edit((c) => {
                c.combine.all = next;
                if (!next) c.combine.worldFallback = false;
              });
            }}
          />
          <div className={cn("pl-5 @2xl:pl-0", !(combineReady && cfg.combine.all === true) && "opacity-55")}>
            <RouteRow
              route={{ key: "worldFallback", icon: LifeBuoy, color: "text-emerald-500" }}
              title={t("megumin.chomusuke.combine.fallback")}
              desc={t("megumin.chomusuke.combine.fallbackDesc")}
              on={cfg.combine.worldFallback === true && combineReady && cfg.combine.all === true}
              onToggle={(next) => {
                if (!(combineReady && cfg.combine.all === true)) return;
                edit((c) => {
                  c.combine.worldFallback = next;
                });
              }}
            />
          </div>
        </div>
      </MeguminSection>

      <MeguminSection
        title={t("megumin.chomusuke.occasional.title")}
        description={t("megumin.chomusuke.occasional.sub")}
      >
        <MeguminGrid layout="cards" className="items-stretch">
          {OCCASIONAL.map((route) => {
            const on = routeOn(cfg, route);
            return (
              <RouteRow
                key={route.key}
                route={route}
                title={t(`megumin.chomusuke.route.${route.key}.title`)}
                desc={t(`megumin.chomusuke.route.${route.key}.desc`)}
                on={on}
                offChip={offChip(route.key)}
                onToggle={() =>
                  edit((c) => {
                    c.features[route.key] = !on;
                  })
                }
              />
            );
          })}
        </MeguminGrid>
      </MeguminSection>

      <MeguminHint>
        <span className="inline-flex items-start gap-1.5">
          <Cat size="0.875rem" className="mt-px shrink-0 text-rose-500" />
          {t("megumin.chomusuke.direct")}
        </span>
      </MeguminHint>
    </div>
  );
}

function Banner({ children, icon, tone }: { children: ReactNode; icon: ReactNode; tone?: "danger" }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-[0.8125rem] leading-relaxed",
        tone === "danger"
          ? "border-[var(--destructive)]/35 bg-[var(--destructive)]/10 text-[var(--destructive)]"
          : "border-[var(--border)]/60 bg-[var(--background)]/50 text-[var(--marinara-chat-chrome-panel-muted)]",
      )}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

function BlockChip({
  icon: ChipIcon,
  label,
  checked,
  inStack,
  offTitle,
  notOn,
  onChange,
}: {
  icon: Icon;
  label: string;
  checked: boolean;
  inStack: boolean;
  offTitle: string;
  notOn: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      title={inStack ? undefined : offTitle}
      className={cn(
        "inline-flex min-h-7 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
        checked
          ? "border-[var(--primary)]/50 bg-[var(--primary)]/10 text-[var(--foreground)]"
          : "border-[var(--border)] text-[var(--muted-foreground)]",
        !inStack && "opacity-60",
      )}
    >
      <input
        type="checkbox"
        className="h-3.5 w-3.5 accent-[var(--primary)]"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <ChipIcon size="0.75rem" />
      {label}
      {inStack ? null : <small className="text-[0.6875rem] opacity-80">{notOn}</small>}
    </label>
  );
}
