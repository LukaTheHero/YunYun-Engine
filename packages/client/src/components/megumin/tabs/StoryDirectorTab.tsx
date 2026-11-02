// ──────────────────────────────────────────────
// Megumin panel: Story Director
// ──────────────────────────────────────────────
// Megumin's src/features/storyplan/ui.js: a director that reads the story and
// writes a narrative blueprint ([[storyplan]]) with a feedback tracker
// ([[storytracker]]). Content rating, pacing, genre, flavour tags, the
// unrestricted-content override, a Director's Note, the directive itself
// (generated, evolved or edited by hand), when it re-evolves, and its prompts.
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  ArrowRightLeft,
  Cat,
  CircleCheck,
  CircleX,
  Clapperboard,
  FastForward,
  Flame,
  Infinity as InfinityIcon,
  LockOpen,
  Moon,
  PenLine,
  ScrollText,
  Settings2,
  ShieldHalf,
  SlidersHorizontal,
  Wind,
  Zap,
} from "lucide-react";
import { cn } from "../../../lib/utils";
import { useChatMessageCount } from "../../../hooks/use-chats";
import { useMeguminPanel } from "../megumin-panel-context";
import {
  MeguminButton,
  MeguminHint,
  MeguminNeedsChat,
  MeguminNumber,
  MeguminRow,
  MeguminSection,
  MeguminSelect,
  MeguminText,
  MeguminToggle,
} from "../MeguminControls";
import { MeguminPromptOverrides } from "./MeguminPromptOverrides";

/** The select value for "the reader typed their own genre" (storyplan/ui.js SD_CUSTOM_GENRE). */
const SD_CUSTOM_GENRE = "custom";
const MAX_FLAVORS = 3;

/** Megumin's defaults for a Story Director saved before a field existed (core/profile.js). */
function withDefaults(sp: Record<string, any> | undefined) {
  const s = { ...(sp ?? {}) };
  if (s.enabled === undefined) s.enabled = false;
  if (s.triggerMode === undefined) s.triggerMode = "auto";
  if (s.autoFreq === undefined) s.autoFreq = 10;
  if (s.currentPlan === undefined) s.currentPlan = "";
  if (s.contentRating === undefined) s.contentRating = "none";
  if (s.pacing === undefined) s.pacing = "natural";
  if (s.primaryGenre === undefined) s.primaryGenre = "drama";
  if (typeof s.customGenre !== "string") s.customGenre = "";
  if (!Array.isArray(s.flavorTags)) s.flavorTags = [];
  if (s.directorsNote === undefined) s.directorsNote = "";
  if (s.unrestrictedContent === undefined) s.unrestrictedContent = false;
  if (s.contextLimit === undefined) s.contextLimit = 100;
  return s;
}

export function StoryDirectorTab() {
  const { t } = useTranslation();
  const { profile, catalog, chatId, update, flush, run, running, openTab } = useMeguminPanel();
  const messageCount = useChatMessageCount(chatId).data?.count ?? 0;
  const sp = withDefaults(profile.storyPlan);
  const genres = ((catalog.storyDirector?.genres ?? {}) as Record<string, { label: string; desc: string }>) || {};
  const flavors = (catalog.storyDirector?.flavors ?? []) as string[];
  const isCustomGenre = sp.primaryGenre === SD_CUSTOM_GENRE;
  const generating = running("storyPlan.generate");

  // An old profile without a storyPlan gets Megumin's whole default block, as initProfile does.
  useEffect(() => {
    if (!profile.storyPlan || typeof profile.storyPlan !== "object") {
      update((draft) => {
        draft.storyPlan = withDefaults(undefined);
      });
    }
  }, [profile.storyPlan, update]);

  const setSp = (patch: Record<string, unknown>) =>
    update((draft) => {
      draft.storyPlan = { ...withDefaults(draft.storyPlan), ...patch };
    });

  const toggleFlavor = (flavor: string) => {
    const tags: string[] = [...sp.flavorTags];
    const at = tags.indexOf(flavor);
    if (at > -1) {
      tags.splice(at, 1);
    } else {
      if (tags.length >= MAX_FLAVORS) {
        toast.warning(t("megumin.director.flavorMax", { count: MAX_FLAVORS }));
        return;
      }
      tags.push(flavor);
    }
    setSp({ flavorTags: tags });
  };

  /** The Director reads its settings from the saved profile, so a pending edit is saved first. */
  const generate = () => {
    flush()
      .then(() => run("storyPlan.generate"))
      .catch(() => {
        /* the action reports its own failure */
      });
  };

  const ratings = [
    { id: "none", label: t("megumin.director.rating.none"), icon: InfinityIcon },
    { id: "sfw", label: t("megumin.director.rating.sfw"), icon: ShieldHalf },
    { id: "nsfw", label: t("megumin.director.rating.nsfw"), icon: Flame },
  ];
  const pacings = [
    {
      id: "slowburn",
      label: t("megumin.director.pacing.slowburn"),
      desc: t("megumin.director.pacing.slowburnDesc"),
      icon: Moon,
    },
    {
      id: "natural",
      label: t("megumin.director.pacing.natural"),
      desc: t("megumin.director.pacing.naturalDesc"),
      icon: Wind,
    },
    {
      id: "accelerate",
      label: t("megumin.director.pacing.accelerate"),
      desc: t("megumin.director.pacing.accelerateDesc"),
      icon: FastForward,
    },
  ];

  const genreDesc = isCustomGenre ? t("megumin.director.genreCustomDesc") : (genres[sp.primaryGenre]?.desc ?? "");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.625rem] font-semibold ring-1",
            sp.enabled
              ? "bg-emerald-500/10 text-emerald-500 ring-emerald-500/25"
              : "bg-[var(--secondary)]/50 text-[var(--muted-foreground)] ring-[var(--border)]",
          )}
        >
          {sp.enabled ? <CircleCheck size="0.625rem" /> : <CircleX size="0.625rem" />}
          {sp.enabled ? t("megumin.director.enabled") : t("megumin.director.disabled")}
        </span>
      </div>

      <MeguminHint tone="warning">{t("megumin.director.v10Callout")}</MeguminHint>

      <MeguminToggle
        label={
          <span className="inline-flex items-center gap-1.5">
            <Clapperboard size="0.75rem" className="text-amber-500" />
            {t("megumin.director.enable")}
          </span>
        }
        help={t("megumin.director.enableHelp")}
        checked={sp.enabled === true}
        onChange={(on) => setSp({ enabled: on })}
      />

      {sp.enabled ? (
        <>
          <MeguminSection title={t("megumin.director.console")} icon={<SlidersHorizontal size="0.875rem" />}>
            <div className="flex flex-col gap-1">
              <span className="text-[0.6875rem] font-medium text-[var(--marinara-chat-chrome-panel-title)]">
                {t("megumin.director.contentRating")}
              </span>
              <div className="grid grid-cols-3 gap-1" role="radiogroup">
                {ratings.map((r) => {
                  const Icon = r.icon;
                  const active = sp.contentRating === r.id;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      aria-pressed={active}
                      onClick={() => setSp({ contentRating: r.id })}
                      className="mari-chrome-control mari-chrome-control--card inline-flex items-center justify-center gap-1 text-[0.6875rem]"
                    >
                      <Icon size="0.75rem" />
                      {r.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[0.6875rem] font-medium text-[var(--marinara-chat-chrome-panel-title)]">
                {t("megumin.director.pacingLabel")}
              </span>
              <div className="grid grid-cols-3 gap-1" role="radiogroup">
                {pacings.map((p) => {
                  const Icon = p.icon;
                  const active = sp.pacing === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      aria-pressed={active}
                      onClick={() => setSp({ pacing: p.id })}
                      className="mari-chrome-control mari-chrome-control--card flex flex-col items-center gap-0.5 text-center text-[0.6875rem]"
                    >
                      <Icon size="0.875rem" />
                      <span className="font-semibold">{p.label}</span>
                      <span className="text-[0.5625rem] leading-tight text-[var(--marinara-chat-chrome-panel-muted)]">
                        {p.desc}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <MeguminSelect
              label={t("megumin.director.primaryGenre")}
              value={sp.primaryGenre}
              options={[
                ...Object.entries(genres).map(([id, g]) => ({ value: id, label: g.label })),
                { value: SD_CUSTOM_GENRE, label: t("megumin.director.genreCustom") },
              ]}
              onChange={(v) => setSp({ primaryGenre: v })}
            />
            {isCustomGenre ? (
              <MeguminText
                value={sp.customGenre}
                placeholder={t("megumin.director.genreCustomPlaceholder")}
                onChange={(v) => setSp({ customGenre: v })}
              />
            ) : null}
            {genreDesc ? <MeguminHint>{genreDesc}</MeguminHint> : null}

            <div className="flex flex-col gap-1">
              <span className="text-[0.6875rem] font-medium text-[var(--marinara-chat-chrome-panel-title)]">
                {t("megumin.director.flavorTags")}{" "}
                <span className="font-normal text-[var(--marinara-chat-chrome-panel-muted)]">
                  {t("megumin.director.flavorHint", { count: MAX_FLAVORS })}
                </span>
              </span>
              <div className="flex flex-wrap gap-1">
                {flavors.map((flavor) => {
                  const active = sp.flavorTags.includes(flavor);
                  return (
                    <button
                      key={flavor}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleFlavor(flavor)}
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[0.625rem] ring-1 transition-colors",
                        active
                          ? "bg-amber-500/15 font-semibold text-amber-500 ring-amber-500/40"
                          : "text-[var(--muted-foreground)] ring-[var(--border)] hover:bg-[var(--accent)]",
                      )}
                    >
                      {flavor}
                    </button>
                  );
                })}
              </div>
            </div>
          </MeguminSection>

          <MeguminToggle
            label={
              <span className="inline-flex items-center gap-1.5">
                <LockOpen size="0.75rem" className="text-[var(--destructive)]" />
                {t("megumin.director.unrestricted")}
              </span>
            }
            help={t("megumin.director.unrestrictedHelp")}
            checked={sp.unrestrictedContent === true}
            onChange={(on) => setSp({ unrestrictedContent: on })}
          />

          <MeguminSection
            title={t("megumin.director.directorsNote")}
            description={t("megumin.director.directorsNoteHint")}
            icon={<PenLine size="0.875rem" />}
          >
            <MeguminText
              multiline
              rows={3}
              value={sp.directorsNote}
              placeholder={t("megumin.director.directorsNotePlaceholder")}
              onChange={(v) => setSp({ directorsNote: v })}
            />
          </MeguminSection>

          <MeguminSection title={t("megumin.director.currentDirective")} icon={<ScrollText size="0.875rem" />}>
            {!chatId ? <MeguminNeedsChat /> : null}
            <MeguminRow>
              <MeguminButton
                variant="primary"
                icon={<Zap size="0.75rem" />}
                pending={generating}
                disabled={!chatId}
                onClick={generate}
              >
                {generating ? t("megumin.director.directing") : t("megumin.director.generate")}
              </MeguminButton>
              <MeguminButton
                icon={<ArrowRightLeft size="0.75rem" />}
                pending={generating}
                disabled={!chatId || !sp.currentPlan}
                onClick={generate}
              >
                {generating ? t("megumin.director.evolving") : t("megumin.director.evolve")}
              </MeguminButton>
            </MeguminRow>
            <MeguminText
              multiline
              rows={10}
              value={sp.currentPlan}
              placeholder={t("megumin.director.directivePlaceholder")}
              onChange={(v) =>
                setSp({
                  currentPlan: v,
                  // Megumin stamps a hand edit at the chat's current end, so the tracker counts from here.
                  planMessageIndex: Math.max(0, messageCount - 1),
                })
              }
            />
            <MeguminHint>{t("megumin.director.directiveCallout")}</MeguminHint>
          </MeguminSection>

          <MeguminSection title={t("megumin.director.engineSettings")} icon={<Settings2 size="0.875rem" />}>
            <div className="flex items-start gap-2">
              <Cat size="0.875rem" className="mt-0.5 shrink-0 text-rose-500" />
              <div className="flex flex-col gap-1">
                <span className="text-[0.6875rem] font-medium text-[var(--marinara-chat-chrome-panel-title)]">
                  {t("megumin.director.backgroundWorker")}
                </span>
                <MeguminHint>{t("megumin.director.backgroundWorkerDesc")}</MeguminHint>
                <div>
                  <MeguminButton onClick={() => openTab("chomusuke")} icon={<Cat size="0.75rem" />}>
                    {t("megumin.director.openChomusuke")}
                  </MeguminButton>
                </div>
              </div>
            </div>
            <MeguminSelect
              label={t("megumin.director.contextLimit")}
              help={t("megumin.director.contextLimitHelp")}
              value={String(sp.contextLimit)}
              options={[
                { value: "100", label: t("megumin.director.contextLast100") },
                { value: "0", label: t("megumin.director.contextFull") },
              ]}
              onChange={(v) => setSp({ contextLimit: parseInt(v, 10) })}
            />
            <MeguminSelect
              label={t("megumin.director.triggerMode")}
              help={t("megumin.director.triggerModeHelp")}
              value={sp.triggerMode}
              options={[
                { value: "manual", label: t("megumin.director.triggerManual") },
                { value: "auto", label: t("megumin.director.triggerAuto") },
                { value: "frequency", label: t("megumin.director.triggerFrequency") },
              ]}
              onChange={(v) => setSp({ triggerMode: v })}
            />
            {sp.triggerMode === "frequency" ? (
              <MeguminNumber
                label={t("megumin.director.frequency")}
                help={t("megumin.director.frequencyHelp")}
                value={Number(sp.autoFreq) || 10}
                min={1}
                onChange={(n) => setSp({ autoFreq: Math.max(1, Math.round(n) || 10) })}
              />
            ) : null}
          </MeguminSection>

          <MeguminPromptOverrides
            module="storyPlan"
            fields={[
              {
                key: "systemPrompt",
                label: t("megumin.director.prompts.system"),
                tokens: ["{{charLore}}", "{{userPersona}}", "{{chatHistory}}", "{{user}}"],
              },
              {
                key: "userPrompt",
                label: t("megumin.director.prompts.user"),
                tokens: ["{{user}}", "{{directorSettings}}"],
              },
              {
                key: "thinkingPrompt",
                label: t("megumin.director.prompts.thinking"),
                hint: t("megumin.director.prompts.thinkingHint"),
              },
              {
                key: "injectionTemplate",
                label: t("megumin.director.prompts.injection"),
                tokens: ["{{planText}}"],
              },
              {
                key: "trackerTemplate",
                label: t("megumin.director.prompts.tracker"),
                tokens: ["{{user}}"],
              },
            ]}
          />
        </>
      ) : null}
    </div>
  );
}
