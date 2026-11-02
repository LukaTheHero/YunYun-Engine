// ──────────────────────────────────────────────
// Megumin panel: Images
// ──────────────────────────────────────────────
// Port of Megumin's src/features/imagegen/page.js and its pages (Characters,
// When & how, Generator; classic/ui.js, v2/characters.js). Megumin draws
// through a ComfyUI workflow from the browser; YunYun draws through one of its
// own image connections on the server (ComfyUI, SD WebUI, NovelAI, OpenAI…).
// So the Generator page picks that connection (profile.imageGen.yunyunConnectionId)
// where Megumin asked for a ComfyUI address and workflow, and each connection
// remembers its own settings as each Megumin workflow did. Megumin's model,
// sampler, steps, CFG, denoise, CLIP skip and LoRAs fill a ComfyUI workflow's
// placeholders; its quality tags, LoRA trigger words, negative prompt and size
// apply to every connection.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Cat,
  ChevronDown,
  ChevronRight,
  Dice5,
  Feather,
  IdCard,
  Lock,
  LockOpen,
  MessageSquareText,
  Pin,
  Plug,
  Plus,
  RefreshCw,
  ScanSearch,
  SlidersHorizontal,
  Trash2,
  TriangleAlert,
  Users,
  WandSparkles,
} from "lucide-react";
import { cn } from "../../../lib/utils";
import { showConfirmDialog, showPromptDialog } from "../../../lib/app-dialogs";
import {
  useConnectionModels,
  useConnections,
  useRefreshConnectionModels,
  useTestImageGeneration,
} from "../../../hooks/use-connections";
import { useUIStore } from "../../../stores/ui.store";
import { Modal } from "../../ui/Modal";
import { SettingsSwitch } from "../../panels/settings/SettingControls";
import { useMeguminPanel } from "../megumin-panel-context";
import {
  MEGUMIN_INPUT_CLASS,
  MeguminButton,
  MeguminHint,
  MeguminNeedsChat,
  MeguminNumber,
  MeguminRow,
  MeguminSection,
  MeguminSelect,
  MeguminText,
  MeguminToggle,
  useDraftText,
  type MeguminOption,
} from "../MeguminControls";
import { MeguminPromptOverrides } from "./MeguminPromptOverrides";
import type { MeguminProfile } from "../../../hooks/use-megumin";

type ImageSettings = Record<string, any>;
type Page = "chars" | "when" | "gen";

const WHEN = ["always", "frequency", "conditional", "manual"] as const;
const WHERE = ["inline", "new_msg"] as const;
const SHOTS = ["cinematic", "pov", "portrait"] as const;
const STYLES = ["tags", "natural"] as const;
const TEMPLATES = [
  "illus_cinematic",
  "sdxl_cinematic",
  "illus_pov",
  "sdxl_pov",
  "illus_portrait",
  "sdxl_portrait",
] as const;
const FOCUS = ["2", "3", "4", "all"] as const;
const COUNTS = [1, 2, 3, 4] as const;
const LORA_SLOTS = [1, 2, 3, 4] as const;

// ComfyUI's own sampler names, offered while the box accepts any other.
const SAMPLERS = [
  "euler",
  "euler_ancestral",
  "heun",
  "dpm_2",
  "dpm_2_ancestral",
  "lms",
  "dpm_fast",
  "dpm_adaptive",
  "dpmpp_2s_ancestral",
  "dpmpp_sde",
  "dpmpp_2m",
  "dpmpp_2m_sde",
  "dpmpp_3m_sde",
  "ddim",
  "uni_pc",
  "lcm",
];

// The settings a workflow remembers (generator.js WORKFLOW_KEYS); here, each image connection.
const WORKFLOW_KEYS = [
  "selectedModel",
  "selectedSampler",
  "steps",
  "cfg",
  "denoise",
  "clipSkip",
  "imgWidth",
  "imgHeight",
  "customSeed",
  "customNegative",
  "promptStyle",
  "promptPerspective",
  "promptExtra",
  "previewPrompt",
  "selectedLora",
  "selectedLoraWt",
  "loraTrigger1",
  "selectedLora2",
  "selectedLoraWt2",
  "loraTrigger2",
  "selectedLora3",
  "selectedLoraWt3",
  "loraTrigger3",
  "selectedLora4",
  "selectedLoraWt4",
  "loraTrigger4",
];

// The placeholders Megumin fills into a ComfyUI workflow from these settings (server: applyMeguminComfyPlaceholders).
const MEGUMIN_FILLED = [
  "%model%",
  "%sampler%",
  "%steps%",
  "%scale%",
  "%denoise%",
  "%clip_skip%",
  "%lora1%",
  "%lora2%",
  "%lora3%",
  "%lora4%",
  "%lorawt1%",
  "%lorawt2%",
  "%lorawt3%",
  "%lorawt4%",
];

// ── Megumin's quality prefix presets (qualityPrefix.js) ──
const QUALITY_TAGS = "masterpiece, best quality, score_9, score_8, newest";
const normSpaces = (s: unknown) =>
  String(s || "")
    .replace(/\s+/g, " ")
    .trim();
function withoutPreset(prefix: unknown) {
  const p = normSpaces(prefix);
  if (!p.toLowerCase().startsWith(QUALITY_TAGS.toLowerCase())) return null;
  return p
    .slice(QUALITY_TAGS.length)
    .replace(/^\s*,\s*/, "")
    .trim();
}
function prefixForStyle(style: string, current: unknown) {
  const rest = withoutPreset(current);
  if (style === "tags") return rest !== null ? String(current || "") : QUALITY_TAGS;
  return rest !== null ? rest : String(current || "");
}
/** "new_msg" → "newMsg": translation keys have no underscores. */
const camel = (value: string) => value.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
const styleOfTemplate = (template: unknown) => (String(template || "").startsWith("illus") ? "tags" : "natural");

// ── Version 2 looks (v2/looksCore.js) ──
type Look = {
  tags: string;
  body?: string;
  natural: string;
  aliases: string[];
  locked: boolean;
  source?: string;
  outfitTags?: { from: string; tags: string; locked: boolean } | null;
};
const lookKeyOf = (s: unknown) =>
  String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
function findLookKey(looks: Record<string, Look>, name: string, aliases: string[] = []) {
  const wanted = [name, ...aliases].map(lookKeyOf).filter(Boolean);
  for (const [k, v] of Object.entries(looks || {})) {
    if (!v) continue;
    const have = [k, ...(v.aliases || [])].map(lookKeyOf);
    if (wanted.some((w) => have.includes(w))) return k;
  }
  return null;
}
function outfitHash(text: unknown) {
  const s = String(text || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${(h >>> 0).toString(36)}:${s.length}`;
}
/** getLooks(): the stored looks, upgraded in place to the V2 shape. */
function getLooks(ig: ImageSettings): Record<string, Look> {
  if (!ig.characterTags || typeof ig.characterTags !== "object") ig.characterTags = {};
  for (const entry of Object.values(ig.characterTags as Record<string, any>)) {
    if (!entry || typeof entry !== "object") continue;
    if (typeof entry.tags !== "string") entry.tags = String(entry.tags || "");
    if (typeof entry.natural !== "string") entry.natural = "";
    if (!Array.isArray(entry.aliases)) entry.aliases = [];
    if (typeof entry.locked !== "boolean") entry.locked = Boolean(entry.locked);
    if (!entry.source) entry.source = entry.provisional ? "chat" : "manual";
  }
  return ig.characterTags as Record<string, Look>;
}

type CastMember = {
  name: string;
  aliases: string[];
  look: string;
  body: string;
  lookNatural: string;
  outfit: string;
  outfitText: string;
  outfitStale: boolean;
  position: string;
  isPc: boolean;
  inScene: boolean;
  mentioned: boolean;
  lookSource: string;
};
type CastResult = { cast: CastMember[]; hasCard: boolean };

const inStory = (m: CastMember) => m.isPc || m.inScene || m.mentioned;
const whereOf = (m: CastMember) => (m.isPc ? "you" : m.inScene ? "scene" : m.mentioned ? "mentioned" : "away");
const whereClass = (m: CastMember) =>
  m.isPc || m.inScene
    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
    : m.mentioned
      ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
      : "bg-[var(--background)]/60 text-[var(--muted-foreground)]";

/** Megumin's meguminSyncLegacyBlockIds(): the legacy block ids follow the block stack. */
function syncLegacyBlockIds(draft: MeguminProfile, registry: Array<{ id: string; legacyIds?: string[] }>) {
  const stack = draft.blockStack;
  if (!stack || !Array.isArray(stack.order)) return;
  const owned = registry.flatMap((b) => b.legacyIds || []);
  const had: string[] = Array.isArray(draft.blocks) ? draft.blocks : [];
  const next = had.filter((id) => !owned.includes(id));
  for (const b of registry) {
    if (!b.legacyIds?.length || !stack.order.includes(b.id)) continue;
    next.push(b.legacyIds.find((id) => had.includes(id)) || b.legacyIds[0]!);
  }
  draft.blocks = [...new Set(next)];
}

function Tiles<T extends string>({
  options,
  value,
  label,
  desc,
  onPick,
}: {
  options: readonly T[];
  value: string;
  label: (o: T) => string;
  desc?: (o: T) => string;
  onPick: (o: T) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5" role="radiogroup">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={value === o}
          aria-pressed={value === o}
          onClick={() => onPick(o)}
          className="mari-chrome-control mari-chrome-control--card flex flex-col items-start gap-0.5 text-left text-xs"
        >
          <b className="font-medium">{label(o)}</b>
          {desc ? (
            <span className="text-[0.625rem] leading-snug text-[var(--marinara-chat-chrome-panel-muted)]">
              {desc(o)}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

function Segmented<T extends string | number>({
  options,
  value,
  label,
  onPick,
}: {
  options: readonly T[];
  value: T;
  label: (o: T) => string;
  onPick: (o: T) => void;
}) {
  return (
    <div className="inline-flex flex-wrap overflow-hidden rounded-md border border-[var(--border)]" role="radiogroup">
      {options.map((o) => (
        <button
          key={String(o)}
          type="button"
          role="radio"
          aria-checked={String(value) === String(o)}
          onClick={() => onPick(o)}
          className={cn(
            "px-2.5 py-1 text-[0.6875rem] transition-colors",
            String(value) === String(o)
              ? "bg-[var(--primary)]/20 font-semibold text-[var(--foreground)]"
              : "text-[var(--muted-foreground)] hover:bg-[var(--accent)]",
          )}
        >
          {label(o)}
        </button>
      ))}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[0.6875rem] font-medium text-[var(--marinara-chat-chrome-panel-title)]">
        {label}
        {hint ? (
          <small className="ml-1 font-normal text-[var(--marinara-chat-chrome-panel-muted)]">{hint}</small>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function SwitchRow({
  label,
  desc,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  desc?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <div className={cn("flex items-start gap-2 rounded-lg p-1.5", disabled && "opacity-55")}>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium">{label}</div>
        {desc ? (
          <p className="text-[0.625rem] leading-relaxed text-[var(--marinara-chat-chrome-panel-muted)]">{desc}</p>
        ) : null}
      </div>
      <SettingsSwitch ariaLabel={label} checked={checked} disabled={disabled} onChange={onChange} />
    </div>
  );
}

/** A box that offers a list (models, samplers, LoRAs) but takes any value; saved on pause or blur. */
function ListInput({
  value,
  options,
  placeholder,
  onCommit,
  listId,
}: {
  value: string;
  options: string[];
  placeholder?: string;
  onCommit: (v: string) => void;
  listId: string;
}) {
  const { draft, change, flush } = useDraftText(value, onCommit);
  return (
    <>
      <input
        className={MEGUMIN_INPUT_CLASS}
        list={listId}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => change(e.target.value)}
        onBlur={flush}
      />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </>
  );
}

function Fold({ label, children, defaultOpen = false }: { label: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 self-start text-[0.6875rem] font-medium text-[var(--marinara-chat-chrome-panel-title)] hover:underline"
      >
        {open ? <ChevronDown size="0.75rem" /> : <ChevronRight size="0.75rem" />}
        {label}
      </button>
      {open ? <div className="flex flex-col gap-2">{children}</div> : null}
    </div>
  );
}

function useImageSettings() {
  const panel = useMeguminPanel();
  const s: ImageSettings = (panel.profile.imageGen ?? {}) as ImageSettings;
  const edit = useCallback(
    (change: (s: ImageSettings, draft: MeguminProfile) => void) =>
      panel.update((draft) => {
        change((draft.imageGen ??= {}), draft);
      }),
    [panel],
  );
  const v2 = { ...(panel.catalog.images?.v2Defaults ?? {}), ...((s.v2 as Record<string, unknown>) ?? {}) } as Record<
    string,
    any
  >;
  const worldOn = Array.isArray(panel.profile.blocks) && panel.profile.blocks.includes("info");
  return { ...panel, s, edit, v2, worldOn };
}

export function ImagesTab() {
  const { t } = useTranslation();
  const { s, edit, profile, catalog, worldOn, chatId, flush, run, running, openTab } = useImageSettings();
  const connectionsQuery = useConnections();
  const imageConnections = useMemo(
    () =>
      ((connectionsQuery.data as Array<{ id: string; name: string; provider: string }> | undefined) ?? []).filter(
        (c) => c.provider === "image_generation",
      ),
    [connectionsQuery.data],
  );
  const engine: "v2" | "classic" = s.engine === "v2" ? "v2" : "classic";
  const [page, setPage] = useState<Page>(engine === "v2" ? "chars" : "when");
  const pages: Page[] = engine === "v2" ? ["chars", "when", "gen"] : ["when", "gen"];
  const current = pages.includes(page) ? page : pages[0]!;
  const v2Inactive = engine === "v2" && !worldOn;
  const chosen = typeof s.yunyunConnectionId === "string" ? s.yunyunConnectionId : "";
  const connection = imageConnections.find((c) => c.id === chosen) ?? (chosen ? null : (imageConnections[0] ?? null));
  const viaChomusuke = (() => {
    const c = profile.chomusuke;
    return Boolean(c && c.enabled && c.profileId && (!c.features || c.features.imageGen !== false));
  })();
  const [extra, setExtra] = useState("");

  const enableWorldState = () => {
    let on = false;
    edit((_s, draft) => {
      const stack = draft.blockStack;
      if (!stack || !Array.isArray(stack.order)) return;
      if (!stack.order.includes("world")) stack.order.push("world");
      syncLegacyBlockIds(draft, (catalog.blocks ?? []) as Array<{ id: string; legacyIds?: string[] }>);
      on = Array.isArray(draft.blocks) && draft.blocks.includes("info");
    });
    return on;
  };

  const pickEngine = async (next: "v2" | "classic") => {
    if (next === engine) return;
    edit((ig) => (ig.engine = next));
    setPage(next === "v2" ? "chars" : "when");
    if (next === "v2" && !worldOn) {
      const ok = await showConfirmDialog({
        title: t("megumin.images.v2.askTitle"),
        message: t("megumin.images.v2.askMessage"),
        confirmLabel: t("megumin.images.v2.askConfirm"),
        cancelLabel: t("megumin.images.v2.askCancel"),
      });
      if (ok) enableWorldState();
    }
  };

  const generateNow = async () => {
    await flush();
    await run("image.generate", { extra: extra.trim() }).catch(() => undefined);
  };

  return (
    <>
      <div
        className={cn(
          "flex items-center justify-between gap-3 rounded-lg p-2.5 ring-1",
          s.enabled ? "bg-cyan-500/10 ring-cyan-500/40" : "bg-[var(--background)]/40 ring-[var(--border)]",
        )}
      >
        <span className="text-xs font-semibold">
          {s.enabled ? t("megumin.images.master.on") : t("megumin.images.master.off")}
        </span>
        <SettingsSwitch
          ariaLabel={t("megumin.images.master.aria")}
          checked={!!s.enabled}
          onChange={(on) => edit((ig) => (ig.enabled = on))}
        />
      </div>

      <MeguminSection title={t("megumin.images.version.title")}>
        <Segmented
          options={["classic", "v2"] as const}
          value={engine}
          label={(o) => t(`megumin.images.version.${o}`)}
          onPick={(o) => void pickEngine(o)}
        />
        <div className="flex flex-wrap gap-1">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.5625rem] font-medium",
              connection
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : "bg-amber-500/15 text-amber-600 dark:text-amber-400",
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", connection ? "bg-emerald-500" : "bg-amber-500")} />
            {connection
              ? t("megumin.images.chip.connection", { name: connection.name })
              : t("megumin.images.chip.noConnection")}
          </span>
          <button
            type="button"
            title={t("megumin.images.chip.chomusukeTitle")}
            onClick={() => openTab("chomusuke")}
            className="inline-flex items-center gap-1 rounded-full bg-[var(--background)]/60 px-2 py-0.5 text-[0.5625rem] font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            {viaChomusuke ? <Cat size="0.5625rem" /> : <Feather size="0.5625rem" />}
            {viaChomusuke ? t("megumin.images.chip.byChomusuke") : t("megumin.images.chip.byStory")}
          </button>
        </div>
        <MeguminHint>{t(`megumin.images.version.${engine}Desc`)}</MeguminHint>
        {v2Inactive ? (
          <div className="flex flex-col gap-1.5 rounded-md bg-[var(--destructive)]/10 p-2 text-[0.625rem] text-[var(--destructive)]">
            <span className="inline-flex items-start gap-1">
              <TriangleAlert size="0.6875rem" className="mt-px shrink-0" />
              <span>
                <b>{t("megumin.images.v2.needsWorld")}</b> {t("megumin.images.v2.needsWorldDesc")}
              </span>
            </span>
            <div>
              <MeguminButton
                icon={<Pin size="0.6875rem" />}
                onClick={() => {
                  if (enableWorldState()) toast.success(t("megumin.images.v2.worldOn"));
                }}
              >
                {t("megumin.images.v2.turnOnWorld")}
              </MeguminButton>
            </div>
          </div>
        ) : null}
        {connectionsQuery.isSuccess && !imageConnections.length ? (
          <div className="flex flex-col gap-1.5 rounded-md bg-[var(--background)]/50 p-2 text-[0.625rem] text-[var(--marinara-chat-chrome-panel-muted)]">
            <span className="inline-flex items-start gap-1">
              <Plug size="0.6875rem" className="mt-px shrink-0" />
              <span>
                <b>{t("megumin.images.notConnected.title")}</b> {t("megumin.images.notConnected.desc")}
              </span>
            </span>
            <div>
              <MeguminButton onClick={() => setPage("gen")}>
                {t("megumin.images.notConnected.openGenerator")}
              </MeguminButton>
            </div>
          </div>
        ) : null}
        <div className="flex flex-col gap-1 border-t border-[var(--border)]/50 pt-2">
          <Field label={t("megumin.images.now.title")} hint={t("megumin.images.now.hint")}>
            <div className="flex items-center gap-1.5">
              <input
                className={MEGUMIN_INPUT_CLASS}
                value={extra}
                placeholder={t("megumin.images.now.placeholder")}
                onChange={(e) => setExtra(e.target.value)}
              />
              <MeguminButton
                variant="primary"
                icon={<WandSparkles size="0.75rem" />}
                disabled={!chatId || !s.enabled}
                pending={running("image.generate")}
                onClick={() => void generateNow()}
              >
                {t("megumin.images.now.button")}
              </MeguminButton>
            </div>
          </Field>
          {!chatId ? (
            <MeguminNeedsChat />
          ) : !s.enabled ? (
            <MeguminHint>{t("megumin.images.now.offHint")}</MeguminHint>
          ) : null}
        </div>
      </MeguminSection>

      <div className="flex gap-1" role="tablist">
        {pages.map((p) => {
          const PageIcon = p === "chars" ? Users : p === "when" ? WandSparkles : SlidersHorizontal;
          return (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={current === p}
              onClick={() => setPage(p)}
              className={cn(
                "inline-flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[0.6875rem] transition-colors",
                current === p
                  ? "bg-[var(--primary)]/15 font-semibold ring-1 ring-[var(--primary)]/40"
                  : "text-[var(--muted-foreground)] hover:bg-[var(--accent)]",
              )}
            >
              <PageIcon size="0.75rem" />
              {t(`megumin.images.page.${p}`)}
            </button>
          );
        })}
      </div>

      {current === "chars" ? <CharactersPage /> : current === "when" ? <WhenHowPage engine={engine} /> : null}
      {current === "gen" ? <GeneratorPage connections={imageConnections} /> : null}
    </>
  );
}

// ── When & how ───────────────────────────────────────────────────────────
function WhenHowPage({ engine }: { engine: "v2" | "classic" }) {
  const { t } = useTranslation();
  const { s, edit, v2, catalog, profile } = useImageSettings();
  const triggerMode = String(s.triggerMode || "always");
  const injectMode = s.injectMode === "inline" ? "inline" : "new_msg";
  const setV2 = (patch: Record<string, unknown>) =>
    edit((ig) => {
      ig.v2 = { ...(catalog.images?.v2Defaults ?? {}), ...(ig.v2 ?? {}), ...patch };
    });
  const tagsStyle = v2.style === "tags";
  const method = v2.method === "reference" ? "reference" : "placeholders";

  return (
    <>
      <MeguminSection title={t("megumin.images.when.title")}>
        <Tiles
          options={WHEN}
          value={triggerMode}
          label={(o) => t(`megumin.images.when.${o}`)}
          desc={(o) => t(`megumin.images.when.${o}Desc`)}
          onPick={(o) => edit((ig) => (ig.triggerMode = o))}
        />
        {triggerMode === "frequency" ? (
          <MeguminNumber
            label={t("megumin.images.when.freq")}
            value={Number(s.autoGenFreq) || 1}
            min={1}
            onChange={(v) => edit((ig) => (ig.autoGenFreq = v >= 1 ? Math.trunc(v) : 1))}
          />
        ) : null}
      </MeguminSection>

      <MeguminSection title={t("megumin.images.where.title")}>
        <Tiles
          options={WHERE}
          value={injectMode}
          label={(o) => t(`megumin.images.where.${camel(o)}`)}
          desc={(o) => t(`megumin.images.where.${camel(o)}Desc`)}
          onPick={(o) => edit((ig) => (ig.injectMode = o))}
        />
        <div className="flex flex-wrap gap-3">
          {injectMode === "inline" ? (
            <Field label={t("megumin.images.where.place")} hint={t("megumin.images.where.placeHint")}>
              <Segmented
                options={["end", "random"] as const}
                value={s.autoPlacement === "random" ? "random" : "end"}
                label={(o) => t(o === "random" ? "megumin.images.where.placeRandom" : "megumin.images.where.placeEnd")}
                onPick={(o) => edit((ig) => (ig.autoPlacement = o))}
              />
            </Field>
          ) : null}
          <Field label={t("megumin.images.where.count")}>
            <Segmented
              options={COUNTS}
              value={(Number(s.imageCount) || 1) as (typeof COUNTS)[number]}
              label={(o) => String(o)}
              onPick={(o) => edit((ig) => (ig.imageCount = o))}
            />
          </Field>
        </div>
      </MeguminSection>

      <MeguminSection title={t("megumin.images.look.title")}>
        {engine === "v2" ? (
          <>
            <Field label={t("megumin.images.look.shot")}>
              <Tiles
                options={SHOTS}
                value={String(v2.shot || "cinematic")}
                label={(o) => t(`megumin.images.shot.${o}`)}
                desc={(o) => t(`megumin.images.shot.${o}Desc`)}
                onPick={(o) => setV2({ shot: o })}
              />
            </Field>
            <Field label={t("megumin.images.look.style")} hint={t("megumin.images.look.styleHint")}>
              <Tiles
                options={STYLES}
                value={String(v2.style || "tags")}
                label={(o) => t(`megumin.images.style.${o}`)}
                desc={(o) => t(`megumin.images.style.${o}Desc`)}
                onPick={(o) =>
                  edit((ig) => {
                    ig.v2 = { ...(catalog.images?.v2Defaults ?? {}), ...(ig.v2 ?? {}), style: o };
                    ig.promptPrefix = prefixForStyle(o, ig.promptPrefix);
                  })
                }
              />
            </Field>
            <MeguminText
              label={t("megumin.images.look.extra")}
              help={t("megumin.images.look.extraHint")}
              placeholder={t("megumin.images.look.extraPlaceholderV2")}
              value={String(v2.extra || "")}
              onChange={(v) => setV2({ extra: v })}
            />
          </>
        ) : (
          <>
            <MeguminSelect
              label={t("megumin.images.look.template")}
              help={t("megumin.images.look.templateHint")}
              value={String(s.promptTemplate || "illus_cinematic")}
              options={TEMPLATES.map((id) => ({ value: id, label: t(`megumin.images.template.${camel(id)}`) }))}
              onChange={(v) =>
                edit((ig) => {
                  ig.promptTemplate = v;
                  ig.promptPrefix = prefixForStyle(styleOfTemplate(v), ig.promptPrefix);
                })
              }
            />
            <MeguminText
              label={t("megumin.images.look.extra")}
              help={t("megumin.images.look.extraHint")}
              placeholder={t("megumin.images.look.extraPlaceholderClassic")}
              value={String(s.promptExtra || "")}
              onChange={(v) => edit((ig) => (ig.promptExtra = v))}
            />
          </>
        )}
        <SwitchRow
          label={t("megumin.images.look.preview")}
          desc={t("megumin.images.look.previewDesc")}
          checked={!!s.previewPrompt}
          onChange={(on) => edit((ig) => (ig.previewPrompt = on))}
        />
      </MeguminSection>

      <MeguminSection title={t("megumin.images.advanced.title")}>
        <Fold label={t("megumin.images.advanced.fold")}>
          {engine === "v2" ? (
            <>
              <Field label={t("megumin.images.v2adv.focus")} hint={t("megumin.images.v2adv.focusHint")}>
                <Segmented
                  options={FOCUS}
                  value={String(v2.focus || "3") as (typeof FOCUS)[number]}
                  label={(o) => (o === "all" ? t("megumin.images.v2adv.focusAll") : o)}
                  onPick={(o) => setV2({ focus: o })}
                />
              </Field>
              <Field label={t("megumin.images.v2adv.method")}>
                <Segmented
                  options={["placeholders", "reference"] as const}
                  value={method}
                  label={(o) => t(`megumin.images.v2adv.method${o === "reference" ? "Reference" : "Placeholders"}`)}
                  onPick={(o) => setV2({ method: o })}
                />
                <MeguminHint>
                  {t(`megumin.images.v2adv.method${method === "reference" ? "Reference" : "Placeholders"}Desc`)}
                </MeguminHint>
              </Field>
              <SwitchRow
                label={t("megumin.images.v2adv.outfitTags")}
                desc={
                  tagsStyle ? t("megumin.images.v2adv.outfitTagsDesc") : t("megumin.images.v2adv.outfitTagsOnlyTags")
                }
                checked={!!v2.outfitTags && tagsStyle}
                disabled={!tagsStyle}
                onChange={(on) => setV2({ outfitTags: on })}
              />
              <SwitchRow
                label={t("megumin.images.v2adv.autoLooks")}
                desc={t("megumin.images.v2adv.autoLooksDesc")}
                checked={v2.autoLooks !== false}
                onChange={(on) => setV2({ autoLooks: on })}
              />
              {profile.npcBank?.enabled ? (
                <MeguminSelect
                  label={t("megumin.images.v2adv.priority")}
                  value={v2.lookPriority === "npc" ? "npc" : "v2"}
                  options={[
                    { value: "v2", label: t("megumin.images.v2adv.priorityV2") },
                    { value: "npc", label: t("megumin.images.v2adv.priorityNpc") },
                  ]}
                  onChange={(v) => setV2({ lookPriority: v })}
                />
              ) : null}
            </>
          ) : (
            <>
              <SwitchRow
                label={t("megumin.images.classic.examples")}
                desc={t("megumin.images.classic.examplesDesc")}
                checked={!!s.includeExamples}
                onChange={(on) => edit((ig) => (ig.includeExamples = on))}
              />
              <SwitchRow
                label={t("megumin.images.classic.booru")}
                desc={t("megumin.images.classic.booruDesc")}
                checked={!!s.directLanguage}
                onChange={(on) => edit((ig) => (ig.directLanguage = on))}
              />
              <SwitchRow
                label={t("megumin.images.classic.npcTags")}
                desc={t("megumin.images.classic.npcTagsDesc")}
                checked={!!s.injectNpcTags}
                onChange={(on) => edit((ig) => (ig.injectNpcTags = on))}
              />
              <MeguminPromptOverrides
                module="imageGen"
                title={t("megumin.images.prompts.title")}
                fields={[
                  {
                    key: "systemPrompt",
                    label: t("megumin.images.prompts.systemPrompt"),
                    hint: t("megumin.images.prompts.systemPromptHint"),
                  },
                  {
                    key: "userPrompt",
                    label: t("megumin.images.prompts.userPrompt"),
                    tokens: [
                      "{{chatHistory}}",
                      "{{templateRules}}",
                      "{{extraStr}}",
                      "{{directLanguage}}",
                      "{{npcImageTags}}",
                      "{{templateExamples}}",
                    ],
                  },
                  {
                    key: "thinkingPrompt",
                    label: t("megumin.images.prompts.thinkingPrompt"),
                    hint: t("megumin.images.prompts.thinkingPromptHint"),
                  },
                  {
                    key: "injectionTemplate",
                    label: t("megumin.images.prompts.injectionTemplate"),
                    tokens: [
                      "{{conditionalText}}",
                      "{{templateRules}}",
                      "{{promptExtra}}",
                      "{{directLanguage}}",
                      "{{npcImageTags}}",
                      "{{templateExamples}}",
                    ],
                  },
                  ...(
                    ["IllusPov", "SdxlPov", "IllusCinematic", "SdxlCinematic", "IllusPortrait", "SdxlPortrait"] as const
                  ).flatMap((k) => [
                    { key: `rules${k}`, label: t(`megumin.images.prompts.rules${k}`) },
                    { key: `examples${k}`, label: t(`megumin.images.prompts.examples${k}`) },
                  ]),
                ]}
              />
            </>
          )}
        </Fold>
      </MeguminSection>
    </>
  );
}

// ── Generator ────────────────────────────────────────────────────────────
function GeneratorPage({ connections }: { connections: Array<{ id: string; name: string }> }) {
  const { t } = useTranslation();
  const { s, edit, catalog } = useImageSettings();
  const openRightPanel = useUIStore((st) => st.openRightPanel);
  const chosen = typeof s.yunyunConnectionId === "string" ? s.yunyunConnectionId : "";
  const effectiveId = chosen || connections[0]?.id || null;
  const models = useConnectionModels(effectiveId);
  const refreshModels = useRefreshConnectionModels();
  const testImage = useTestImageGeneration();
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string; image?: string } | null>(null);
  const modelNames = (models.data?.models ?? []).map((m) => m.id);
  const loraNames = (models.data?.loras ?? []).map((m) => m.id);
  const resolutions = (catalog.images?.resolutions ?? []) as Array<{ label: string; w: number; h: number }>;
  const placeholders = (catalog.images?.placeholders ?? []) as Array<{ key: string; desc: string }>;

  const connectionOptions: MeguminOption[] = [
    { value: "", label: t("megumin.images.gen.auto") },
    ...connections.map((c) => ({ value: c.id, label: c.name })),
  ];

  // Each connection remembers its own settings, as each Megumin workflow does.
  const pickConnection = (next: string) => {
    const stateKey = (id: string) => `yunyun:${id || "auto"}`;
    let restored = false;
    edit((ig) => {
      const prev = typeof ig.yunyunConnectionId === "string" ? ig.yunyunConnectionId : "";
      if (!ig.savedWorkflowStates || typeof ig.savedWorkflowStates !== "object") ig.savedWorkflowStates = {};
      ig.savedWorkflowStates[stateKey(prev)] = Object.fromEntries(WORKFLOW_KEYS.map((k) => [k, ig[k]]));
      ig.yunyunConnectionId = next;
      const saved = ig.savedWorkflowStates[stateKey(next)];
      if (saved && typeof saved === "object") {
        Object.assign(ig, saved);
        restored = true;
      }
    });
    setTestResult(null);
    if (restored) {
      const name = connections.find((c) => c.id === next)?.name ?? t("megumin.images.gen.auto");
      toast.success(t("megumin.images.gen.restored", { name }));
    }
  };

  const test = () => {
    if (!effectiveId) {
      toast.warning(t("megumin.images.gen.noConnectionToTest"));
      return;
    }
    setTestResult(null);
    testImage.mutate(effectiveId, {
      onSuccess: (r) =>
        setTestResult(
          r.success
            ? {
                ok: true,
                text: t("megumin.images.gen.testOk", { ms: r.latencyMs }),
                image: r.base64 ? `data:${r.mimeType || "image/png"};base64,${r.base64}` : undefined,
              }
            : { ok: false, text: t("megumin.images.gen.testFailed", { error: r.error || "" }) },
        ),
      onError: (error) =>
        setTestResult({
          ok: false,
          text: t("megumin.images.gen.testFailed", { error: error instanceof Error ? error.message : String(error) }),
        }),
    });
  };

  const num = (v: unknown, fallback: number) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

  return (
    <>
      <MeguminSection
        title={t("megumin.images.gen.connectionTitle")}
        description={t("megumin.images.gen.connectionSub")}
      >
        <div className="flex items-end gap-1.5">
          <div className="min-w-0 flex-1">
            <MeguminSelect value={chosen} options={connectionOptions} onChange={pickConnection} />
          </div>
          <MeguminButton icon={<Plug size="0.75rem" />} pending={testImage.isPending} onClick={test}>
            {t("megumin.images.gen.test")}
          </MeguminButton>
        </div>
        {chosen && !connections.some((c) => c.id === chosen) ? (
          <MeguminHint tone="warning">{t("megumin.images.gen.missing")}</MeguminHint>
        ) : null}
        <MeguminHint>{chosen ? t("megumin.images.gen.chosenHint") : t("megumin.images.gen.autoHint")}</MeguminHint>
        {testResult ? (
          <div
            className={cn(
              "flex flex-col gap-1 text-[0.625rem]",
              testResult.ok ? "text-emerald-500" : "text-[var(--destructive)]",
            )}
          >
            <span>{testResult.text}</span>
            {testResult.image ? <img src={testResult.image} alt="" className="max-h-40 self-start rounded-md" /> : null}
          </div>
        ) : null}
        <MeguminRow>
          <MeguminButton onClick={() => openRightPanel("connections")}>
            {t("megumin.images.gen.openConnections")}
          </MeguminButton>
        </MeguminRow>
        <Fold label={t("megumin.images.gen.placeholdersFold")}>
          <MeguminHint>{t("megumin.images.gen.placeholdersIntro")}</MeguminHint>
          <div className="flex flex-col gap-0.5">
            {placeholders.map((p) => (
              <div key={p.key} className="flex items-baseline justify-between gap-2 text-[0.625rem]">
                <code className="font-mono text-[0.5625rem]">{p.key}</code>
                <span className="text-right text-[var(--marinara-chat-chrome-panel-muted)]">{p.desc}</span>
              </div>
            ))}
          </div>
          <MeguminHint>{t("megumin.images.gen.placeholdersFilled", { list: MEGUMIN_FILLED.join(", ") })}</MeguminHint>
        </Fold>
      </MeguminSection>

      <MeguminSection title={t("megumin.images.gen.imageTitle")}>
        <Field label={t("megumin.images.gen.model")} hint={t("megumin.images.gen.modelHint")}>
          <div className="flex items-center gap-1.5">
            <div className="min-w-0 flex-1">
              <ListInput
                listId="megumin-image-models"
                value={String(s.selectedModel || "")}
                options={modelNames}
                placeholder={t("megumin.images.gen.noModel")}
                onCommit={(v) => edit((ig) => (ig.selectedModel = v))}
              />
            </div>
            <button
              type="button"
              disabled={!effectiveId || refreshModels.isPending}
              title={t("megumin.images.gen.refreshModels")}
              aria-label={t("megumin.images.gen.refreshModels")}
              onClick={() => effectiveId && refreshModels.mutate(effectiveId)}
              className="mari-chrome-control mari-chrome-control--small mari-chrome-control--icon"
            >
              <RefreshCw size="0.75rem" className={cn(refreshModels.isPending && "animate-spin")} />
            </button>
          </div>
        </Field>
        <Field label={t("megumin.images.gen.size")} hint={t("megumin.images.gen.sizeHint")}>
          <select
            className={MEGUMIN_INPUT_CLASS}
            value=""
            onChange={(e) => {
              const r = resolutions[Number(e.target.value)];
              if (r)
                edit((ig) => {
                  ig.imgWidth = r.w;
                  ig.imgHeight = r.h;
                });
            }}
          >
            <option value="">{t("megumin.images.gen.pickSize")}</option>
            {resolutions.map((r, i) => (
              <option key={r.label} value={i}>
                {r.label}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1.5">
            <MeguminNumber
              value={num(s.imgWidth, 1024)}
              min={64}
              step={8}
              onChange={(v) => edit((ig) => (ig.imgWidth = Math.trunc(v)))}
            />
            <span className="text-xs text-[var(--muted-foreground)]">×</span>
            <MeguminNumber
              value={num(s.imgHeight, 1024)}
              min={64}
              step={8}
              onChange={(v) => edit((ig) => (ig.imgHeight = Math.trunc(v)))}
            />
          </div>
        </Field>
        <SwitchRow
          label={t("megumin.images.gen.expert")}
          desc={t("megumin.images.gen.expertDesc")}
          checked={!!s.showExpert}
          onChange={(on) => edit((ig) => (ig.showExpert = on))}
        />
        {s.showExpert ? (
          <div className="flex flex-col gap-2.5 border-t border-[var(--border)]/50 pt-2">
            <Field label={t("megumin.images.gen.sampler")} hint={t("megumin.images.gen.comfyOnly")}>
              <ListInput
                listId="megumin-image-samplers"
                value={String(s.selectedSampler || "")}
                options={SAMPLERS}
                placeholder={t("megumin.images.gen.defaultSampler")}
                onCommit={(v) => edit((ig) => (ig.selectedSampler = v))}
              />
            </Field>
            <MeguminNumber
              slider
              label={t("megumin.images.gen.steps")}
              value={num(s.steps, 20)}
              min={1}
              max={100}
              step={1}
              onChange={(v) => edit((ig) => (ig.steps = Math.trunc(v)))}
            />
            <MeguminNumber
              slider
              label={t("megumin.images.gen.cfg")}
              value={num(s.cfg, 7)}
              min={1}
              max={30}
              step={0.5}
              onChange={(v) => edit((ig) => (ig.cfg = v))}
            />
            <MeguminNumber
              slider
              label={t("megumin.images.gen.denoise")}
              value={num(s.denoise, 0.5)}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) => edit((ig) => (ig.denoise = v))}
            />
            <MeguminNumber
              slider
              label={t("megumin.images.gen.clipSkip")}
              value={num(s.clipSkip, 1)}
              min={1}
              max={12}
              step={1}
              onChange={(v) => edit((ig) => (ig.clipSkip = Math.trunc(v)))}
            />
            <Field label={t("megumin.images.gen.seed")} hint={t("megumin.images.gen.seedHint")}>
              <div className="flex items-center gap-1.5">
                <MeguminNumber
                  value={num(s.customSeed, -1)}
                  onChange={(v) => edit((ig) => (ig.customSeed = Math.trunc(v)))}
                />
                <button
                  type="button"
                  title={t("megumin.images.gen.seedRandom")}
                  aria-label={t("megumin.images.gen.seedRandom")}
                  onClick={() => edit((ig) => (ig.customSeed = -1))}
                  className="mari-chrome-control mari-chrome-control--small mari-chrome-control--icon"
                >
                  <Dice5 size="0.75rem" />
                </button>
              </div>
            </Field>
            <MeguminText
              label={t("megumin.images.gen.prefix")}
              help={t("megumin.images.gen.prefixHint")}
              placeholder={t("megumin.images.gen.prefixPlaceholder")}
              value={String(s.promptPrefix || "")}
              onChange={(v) => edit((ig) => (ig.promptPrefix = v))}
            />
            <MeguminText
              label={t("megumin.images.gen.negative")}
              help={t("megumin.images.gen.negativeHint")}
              value={String(s.customNegative || "")}
              onChange={(v) => edit((ig) => (ig.customNegative = v))}
            />
            <Field label={t("megumin.images.gen.loras")} hint={t("megumin.images.gen.lorasHint")}>
              <div className="flex flex-col gap-2">
                {LORA_SLOTS.map((i) => {
                  const key = i === 1 ? "selectedLora" : `selectedLora${i}`;
                  const wtKey = i === 1 ? "selectedLoraWt" : `selectedLoraWt${i}`;
                  const trigKey = i === 1 ? "loraTrigger1" : `loraTrigger${i}`;
                  return (
                    <div key={i} className="flex flex-col gap-1 rounded-md border border-[var(--border)]/60 p-1.5">
                      <ListInput
                        listId="megumin-image-loras"
                        value={String(s[key] || "")}
                        options={loraNames}
                        placeholder={t("megumin.images.gen.noLora", { n: i })}
                        onCommit={(name) =>
                          edit((ig) => {
                            ig[key] = name;
                            // Each LoRA remembers its own trigger words.
                            ig[trigKey] =
                              name && ig.loraTriggersMap && ig.loraTriggersMap[name] !== undefined
                                ? ig.loraTriggersMap[name]
                                : "";
                          })
                        }
                      />
                      <MeguminText
                        value={String(s[trigKey] || "")}
                        placeholder={t("megumin.images.gen.triggers")}
                        onChange={(words) =>
                          edit((ig) => {
                            ig[trigKey] = words;
                            if (ig[key] && String(ig[key]).trim() !== "") {
                              if (!ig.loraTriggersMap || typeof ig.loraTriggersMap !== "object")
                                ig.loraTriggersMap = {};
                              ig.loraTriggersMap[ig[key]] = words;
                            }
                          })
                        }
                      />
                      <MeguminNumber
                        slider
                        label={t("megumin.images.gen.strength")}
                        value={num(s[wtKey], 1)}
                        min={-6}
                        max={6}
                        step={0.1}
                        onChange={(v) => edit((ig) => (ig[wtKey] = Math.round(v * 10) / 10))}
                      />
                    </div>
                  );
                })}
              </div>
            </Field>
            <MeguminHint>{t("megumin.images.gen.expertNote")}</MeguminHint>
          </div>
        ) : null}
      </MeguminSection>
    </>
  );
}

// ── Version 2: Characters ────────────────────────────────────────────────
function CharactersPage() {
  const { t } = useTranslation();
  const { s, edit, v2, chatId, flush, run, running } = useImageSettings();
  const [result, setResult] = useState<CastResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [awayOpen, setAwayOpen] = useState(false);

  const load = useCallback(async () => {
    if (!chatId) return;
    setLoading(true);
    try {
      const r = (await run("images.cast")) as CastResult | null;
      if (r && Array.isArray(r.cast)) setResult(r);
    } catch {
      /* toasted */
    } finally {
      setLoading(false);
    }
  }, [chatId, run]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  if (!chatId) {
    return (
      <MeguminSection title={t("megumin.images.chars.title")} description={t("megumin.images.chars.sub")}>
        <MeguminNeedsChat />
      </MeguminSection>
    );
  }

  const looks = getLooks(structuredClone({ characterTags: s.characterTags }) as ImageSettings);
  const cast = result?.cast ?? [];
  const castNow = cast.filter(inStory);
  const castAway = cast.filter((m) => !inStory(m));

  const after = async (action: string, args?: Record<string, unknown>) => {
    await flush();
    await run(action, args).catch(() => undefined);
    await load();
  };

  const readFromChat = async () => {
    const need = cast
      .filter((m) => !String(m.look || m.body || m.lookNatural || "").trim())
      .map((m) => ({ name: m.name, aliases: m.aliases || [] }));
    if (!need.length) {
      toast.info(t("megumin.images.chars.everyoneHasLook"));
      return;
    }
    await after("images.scanLooks", { from: "chat", targets: need });
  };

  const add = async () => {
    const name = String(
      (await showPromptDialog({
        title: t("megumin.images.chars.addTitle"),
        message: t("megumin.images.chars.addMessage"),
      })) || "",
    ).trim();
    if (!name) return;
    edit((ig) => {
      const all = getLooks(ig);
      if (!findLookKey(all, name)) all[name] = { tags: "", natural: "", aliases: [], locked: false, source: "manual" };
    });
    await flush();
    await load();
    setEditing(name);
  };

  const card = (m: CastMember) => {
    const k = findLookKey(looks, m.name, m.aliases || []);
    const stored = k ? looks[k] : null;
    const lookText = (
      stored?.tags ||
      m.look ||
      (v2.style === "natural" ? stored?.natural || m.lookNatural : "") ||
      ""
    ).trim();
    return (
      <button
        key={m.name}
        type="button"
        onClick={() => setEditing(m.name)}
        className={cn(
          "flex flex-col items-start gap-1 rounded-lg border border-[var(--border)]/70 bg-[var(--background)]/40 p-2 text-left transition-colors hover:border-[var(--primary)]/50",
          !inStory(m) && "opacity-70",
        )}
      >
        <span className="flex w-full items-center justify-between gap-1.5">
          <b className="min-w-0 truncate text-xs">{m.name}</b>
          <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[0.5625rem]", whereClass(m))}>
            {t(`megumin.images.whereNow.${whereOf(m)}`)}
          </span>
        </span>
        <span className="text-[0.625rem] leading-snug">
          <em className="mr-1 not-italic text-[var(--muted-foreground)]">{t("megumin.images.chars.look")}</em>
          {lookText || <i className="text-[var(--muted-foreground)]">{t("megumin.images.chars.noneYet")}</i>}
        </span>
        {inStory(m) ? (
          <span className="text-[0.625rem] leading-snug">
            <em className="mr-1 not-italic text-[var(--muted-foreground)]">{t("megumin.images.chars.wearing")}</em>
            {m.outfitText || m.outfit || (
              <i className="text-[var(--muted-foreground)]">{t("megumin.images.chars.notInWorld")}</i>
            )}
          </span>
        ) : null}
        {stored?.locked ? (
          <span className="inline-flex items-center gap-1 text-[0.5625rem] text-[var(--muted-foreground)]">
            <Lock size="0.5625rem" />
            {t("megumin.images.chars.locked")}
          </span>
        ) : null}
      </button>
    );
  };

  const member = editing ? (cast.find((m) => m.name === editing) ?? null) : null;

  return (
    <MeguminSection title={t("megumin.images.chars.title")} description={t("megumin.images.chars.sub")}>
      <MeguminRow>
        <MeguminButton
          icon={<IdCard size="0.75rem" />}
          title={t("megumin.images.chars.readCardTitle")}
          pending={running("images.scanLooks")}
          onClick={() => void after("images.scanLooks", { from: "sheet" })}
        >
          {t("megumin.images.chars.readCard")}
        </MeguminButton>
        <MeguminButton
          icon={<MessageSquareText size="0.75rem" />}
          title={t("megumin.images.chars.readChatTitle")}
          pending={running("images.scanLooks")}
          onClick={() => void readFromChat()}
        >
          {t("megumin.images.chars.readChat")}
        </MeguminButton>
        {v2.style === "natural" ? (
          <MeguminButton
            icon={<Feather size="0.75rem" />}
            title={t("megumin.images.chars.describeTitle")}
            pending={running("images.describeLooks")}
            onClick={() => void after("images.describeLooks")}
          >
            {t("megumin.images.chars.describe")}
          </MeguminButton>
        ) : null}
        <MeguminButton variant="primary" icon={<Plus size="0.75rem" />} onClick={() => void add()}>
          {t("megumin.images.chars.add")}
        </MeguminButton>
        <button
          type="button"
          title={t("megumin.images.chars.refresh")}
          aria-label={t("megumin.images.chars.refresh")}
          disabled={loading}
          onClick={() => void load()}
          className="mari-chrome-control mari-chrome-control--small mari-chrome-control--icon"
        >
          <RefreshCw size="0.75rem" className={cn(loading && "animate-spin")} />
        </button>
      </MeguminRow>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {castNow.map(card)}
        {!castNow.length && !loading ? <MeguminHint>{t("megumin.images.chars.nobody")}</MeguminHint> : null}
      </div>
      {castAway.length ? (
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            aria-expanded={awayOpen}
            onClick={() => setAwayOpen(!awayOpen)}
            className="inline-flex items-center gap-1 self-start text-[0.6875rem] font-medium hover:underline"
          >
            {awayOpen ? <ChevronDown size="0.75rem" /> : <ChevronRight size="0.75rem" />}
            {awayOpen
              ? t("megumin.images.chars.hideAway", { count: castAway.length })
              : t("megumin.images.chars.showAway", { count: castAway.length })}
          </button>
          {awayOpen ? (
            <>
              <MeguminHint>{t("megumin.images.chars.awayNote")}</MeguminHint>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">{castAway.map(card)}</div>
            </>
          ) : null}
        </div>
      ) : null}

      {editing ? (
        <LookEditor
          member={member}
          hasCard={!!result?.hasCard}
          onClose={async () => {
            setEditing(null);
            await flush();
            await load();
          }}
          onRescan={(from) =>
            after("images.scanLooks", {
              from,
              targets: member ? [{ name: member.name, aliases: member.aliases || [] }] : [],
            })
          }
        />
      ) : null}
    </MeguminSection>
  );
}

function LookEditor({
  member,
  hasCard,
  onClose,
  onRescan,
}: {
  member: CastMember | null;
  hasCard: boolean;
  onClose: () => void;
  onRescan: (from: "sheet" | "chat") => Promise<void>;
}) {
  const { t } = useTranslation();
  const { s, edit, v2, running } = useImageSettings();
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(timer);
  }, [armed]);

  if (!member) {
    return (
      <Modal open onClose={onClose} title={t("megumin.images.editor.goneTitle")} width="max-w-md">
        <MeguminHint>{t("megumin.images.editor.gone")}</MeguminHint>
      </Modal>
    );
  }

  const looks = getLooks(structuredClone({ characterTags: s.characterTags }) as ImageSettings);
  const k = findLookKey(looks, member.name, member.aliases || []);
  const stored = k ? looks[k] : null;
  const detailed = !!v2.outfitTags && v2.style === "tags";
  const outfitLocked = Boolean(stored?.outfitTags?.locked);
  const nicknames = [...new Set([...(stored?.aliases || []), ...(member.aliases || [])])].join(", ");
  const lookValue = stored ? stored.tags : member.look;
  const bodyValue = stored && stored.body !== undefined ? String(stored.body || "") : member.body;

  /** The stored look for this member, created on first edit (lookFor in characters.js). */
  const withLook = (change: (look: Look, key: string) => void) =>
    edit((ig) => {
      const all = getLooks(ig);
      let key = findLookKey(all, member.name, member.aliases || []);
      if (!key) {
        key = member.name;
        const fromNpc = member.lookSource === "npc";
        all[key] = {
          tags: fromNpc ? member.look : "",
          body: fromNpc ? member.body : "",
          natural: "",
          aliases: [],
          locked: false,
          source: "manual",
        };
      }
      change(all[key]!, key);
    });

  const forget = () => {
    if (!armed) {
      setArmed(true);
      return;
    }
    edit((ig) => {
      const all = getLooks(ig);
      const key = findLookKey(all, member.name, member.aliases || []);
      if (key) delete all[key];
    });
    toast.info(t("megumin.images.editor.deleted", { name: member.name }));
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={member.name} width="max-w-lg">
      <div className="flex flex-col gap-2.5">
        <div className="flex items-start justify-between gap-2 text-[0.6875rem] text-[var(--muted-foreground)]">
          <span>
            {member.lookSource
              ? t("megumin.images.editor.writtenAsWithSource", {
                  name: member.name,
                  source: t(`megumin.images.source.${member.lookSource}`, { defaultValue: member.lookSource }),
                })
              : t("megumin.images.editor.writtenAs", { name: member.name })}
          </span>
          <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[0.5625rem]", whereClass(member))}>
            {t(`megumin.images.whereNow.${whereOf(member)}`)}
          </span>
        </div>
        <MeguminText
          label={t("megumin.images.editor.nicknames")}
          help={t("megumin.images.editor.nicknamesHint")}
          placeholder={t("megumin.images.editor.nicknamesPlaceholder")}
          value={nicknames}
          onChange={(v) =>
            withLook((look, key) => {
              look.aliases = v
                .split(",")
                .map((a) => a.trim())
                .filter(
                  (a, i, all) =>
                    a &&
                    a.toLowerCase() !== key.toLowerCase() &&
                    all.findIndex((x) => x.toLowerCase() === a.toLowerCase()) === i,
                );
            })
          }
        />
        <MeguminText
          multiline
          rows={3}
          label={t("megumin.images.editor.look")}
          help={t("megumin.images.editor.lookHint")}
          placeholder={t("megumin.images.editor.lookPlaceholder")}
          value={String(lookValue || "")}
          onChange={(v) =>
            withLook((look) => {
              look.tags = v.trim();
              look.source = "manual";
            })
          }
        />
        <MeguminText
          multiline
          rows={2}
          label={t("megumin.images.editor.body")}
          help={t("megumin.images.editor.bodyHint")}
          placeholder={t("megumin.images.editor.bodyPlaceholder")}
          value={String(bodyValue || "")}
          onChange={(v) =>
            withLook((look) => {
              look.body = v.trim();
              look.source = "manual";
            })
          }
        />
        {v2.style === "natural" ? (
          <MeguminText
            multiline
            rows={2}
            label={t("megumin.images.editor.natural")}
            help={t("megumin.images.editor.naturalHint")}
            placeholder={t("megumin.images.editor.naturalPlaceholder")}
            value={String(stored?.natural || "")}
            onChange={(v) => withLook((look) => (look.natural = v.trim()))}
          />
        ) : null}
        <Field label={t("megumin.images.editor.wearing")} hint={t("megumin.images.editor.wearingHint")}>
          <div className="rounded-md bg-[var(--background)]/50 px-2 py-1.5 text-[0.6875rem]">
            {member.outfitText || member.outfit || (
              <i className="text-[var(--muted-foreground)]">{t("megumin.images.editor.wearingNone")}</i>
            )}
          </div>
        </Field>
        {detailed && member.outfitText ? (
          <Field
            label={t("megumin.images.editor.outfitTags")}
            hint={member.outfitStale ? t("megumin.images.editor.outfitStale") : t("megumin.images.editor.outfitFresh")}
          >
            <div className="flex items-center gap-1.5">
              <div className="min-w-0 flex-1">
                <MeguminText
                  value={member.outfitStale ? "" : member.outfit}
                  placeholder={t("megumin.images.editor.outfitPlaceholder")}
                  onChange={(v) =>
                    withLook((look) => {
                      const tags = v.trim();
                      const locked = Boolean(look.outfitTags?.locked);
                      look.outfitTags = tags ? { from: outfitHash(member.outfitText), tags, locked } : null;
                    })
                  }
                />
              </div>
              <button
                type="button"
                title={outfitLocked ? t("megumin.images.editor.outfitUnlock") : t("megumin.images.editor.outfitLock")}
                aria-label={
                  outfitLocked ? t("megumin.images.editor.outfitUnlock") : t("megumin.images.editor.outfitLock")
                }
                aria-pressed={outfitLocked}
                onClick={() => {
                  const cur = stored?.outfitTags || { from: outfitHash(member.outfitText), tags: "", locked: false };
                  if (!String(cur.tags || "").trim()) {
                    toast.info(t("megumin.images.editor.noOutfitTags"));
                    return;
                  }
                  withLook((look) => (look.outfitTags = { ...cur, locked: !cur.locked }));
                }}
                className="mari-chrome-control mari-chrome-control--small mari-chrome-control--icon"
              >
                {outfitLocked ? <Lock size="0.75rem" /> : <LockOpen size="0.75rem" />}
              </button>
            </div>
          </Field>
        ) : null}
        {member.position ? (
          <Field label={t("megumin.images.editor.where")}>
            <div className="rounded-md bg-[var(--background)]/50 px-2 py-1.5 text-[0.6875rem]">{member.position}</div>
          </Field>
        ) : null}
        <MeguminToggle
          label={t("megumin.images.editor.lockLook")}
          help={t("megumin.images.editor.lockLookHint")}
          checked={!!stored?.locked}
          onChange={(on) => withLook((look) => (look.locked = on))}
        />
        <MeguminRow>
          {hasCard ? (
            <MeguminButton
              icon={<IdCard size="0.75rem" />}
              title={t("megumin.images.editor.rescanCardTitle")}
              pending={running("images.scanLooks")}
              onClick={() => void onRescan("sheet")}
            >
              {t("megumin.images.editor.rescanCard")}
            </MeguminButton>
          ) : null}
          <MeguminButton
            icon={<ScanSearch size="0.75rem" />}
            pending={running("images.scanLooks")}
            onClick={() => void onRescan("chat")}
          >
            {t("megumin.images.editor.rescanChat")}
          </MeguminButton>
          {stored ? (
            <MeguminButton variant="danger" icon={<Trash2 size="0.75rem" />} onClick={forget}>
              {armed ? t("megumin.images.editor.deleteArmed") : t("megumin.images.editor.delete")}
            </MeguminButton>
          ) : null}
        </MeguminRow>
        <MeguminRow className="justify-end">
          <MeguminButton variant="primary" onClick={onClose}>
            {t("megumin.images.editor.done")}
          </MeguminButton>
        </MeguminRow>
      </div>
    </Modal>
  );
}
