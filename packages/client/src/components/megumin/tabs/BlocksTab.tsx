// ──────────────────────────────────────────────
// Megumin panel: Blocks
// ──────────────────────────────────────────────
// Port of Megumin Suite's Blocks tab (src/features/blocks/ui.js): what goes in
// the master block under each reply and in what order, how each block shows,
// World State's own settings, the stat blocks' fields, custom blocks, and the
// live preview drawn by the same card renderer the chat uses.
// Derived from Megumin Suite (CC BY-NC 4.0, see packages/shared/src/megumin/LICENSE.md).
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Eraser,
  Eye,
  Layers,
  ListOrdered,
  PackageOpen,
  Pencil,
  Plus,
  RefreshCw,
  Star,
  WandSparkles,
  X,
} from "lucide-react";
import { buildBlocksCard, extractBlocks } from "@marinara-engine/shared/megumin/client";
import { cn } from "../../../lib/utils";
import { showConfirmDialog } from "../../../lib/app-dialogs";
import { useMeguminView, type MeguminProfile } from "../../../hooks/use-megumin";
import { useMeguminPanel } from "../megumin-panel-context";
import {
  MEGUMIN_INPUT_CLASS,
  MeguminButton,
  MeguminHint,
  MeguminRow,
  MeguminSection,
  MeguminSelect,
  MeguminToggle,
  useDraftText,
} from "../MeguminControls";
import { useMeguminReadAction } from "./use-megumin-read-action";

type BlockDef = Record<string, any> & { id: string; tag: string; label: string };
type StatField = {
  id: string;
  label: string;
  type: string;
  max?: number;
  start?: number;
  hint?: string;
  ownLine?: boolean;
};

/** core/profile.js: the stack an old profile may be missing. */
function stackOf(profile: MeguminProfile) {
  const stack = (profile.blockStack ?? {}) as {
    order?: string[];
    custom?: BlockDef[];
    overrides?: Record<string, any>;
  };
  return { order: stack.order ?? [], custom: stack.custom ?? [], overrides: stack.overrides ?? {} };
}

/** state/index.js WORLD_SETTINGS_DEFAULTS. */
const WORLD_DEFAULTS = {
  updateMode: "inline",
  injectionDetail: "full",
  showReturning: true,
  showChanges: true,
  journalDepth: 200,
};

/** registry.js RESERVED_BLOCK_TAGS. */
const RESERVED_BLOCK_TAGS = [
  "blocks",
  "details",
  "summary",
  "think",
  "thinking",
  "gametxt",
  "updatevariable",
  "combat_log",
  "location",
  "options",
  "disclaimer",
  "div",
  "span",
  "img",
  "p",
  "br",
  "notebook",
  "notebook_update",
];

/** registry.js `requires`: the feature a block belongs to (functions do not travel with the catalog). */
const BLOCK_REQUIRES: Record<string, (p: MeguminProfile) => boolean> = {
  dice: (p) => Boolean((p.addons || []).includes("dice")),
  worldUpdate: () => false,
  newNpc: (p) => Boolean(p.npcBank && p.npcBank.enabled),
  npcUpdate: (p) => Boolean(p.npcBank && p.npcBank.enabled && (p.npcBank.npcs || []).length > 0),
  tracker: (p) => Boolean(p.storyPlan && p.storyPlan.enabled),
};

/** How a tag reads on screen: `<World_State>`. */
const tagText = (tag: string) => "<" + tag + ">";

/** registry.js blockTagFromName. */
function blockTagFromName(name: string) {
  return String(name || "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_]/g, "");
}

/**
 * registry.js meguminSyncLegacyBlockIds: the stack decides what is in the block, `profile.blocks` is what fills
 * the dict tags the envelope reads, so a stack change writes both.
 */
function syncLegacyBlockIds(draft: MeguminProfile, builtins: BlockDef[]) {
  const stack = stackOf(draft);
  const owned = builtins.flatMap((b) => (Array.isArray(b.legacyIds) ? (b.legacyIds as string[]) : []));
  const had: string[] = Array.isArray(draft.blocks) ? draft.blocks : [];
  const next = had.filter((id) => !owned.includes(id));
  for (const b of builtins) {
    const legacy = Array.isArray(b.legacyIds) ? (b.legacyIds as string[]) : [];
    if (!legacy.length || !stack.order.includes(b.id)) continue;
    next.push(legacy.find((id) => had.includes(id)) || legacy[0]!);
  }
  draft.blocks = [...new Set(next)];
}

/** Writes the stack back onto the draft (an old profile may have none). */
function ensureStack(draft: MeguminProfile) {
  draft.blockStack = { ...stackOf(draft), ...(draft.blockStack ?? {}) };
  const s = draft.blockStack as { order: string[]; custom: BlockDef[]; overrides: Record<string, any> };
  s.order = Array.isArray(s.order) ? s.order : [];
  s.custom = Array.isArray(s.custom) ? s.custom : [];
  s.overrides = s.overrides && typeof s.overrides === "object" ? s.overrides : {};
  return s;
}

function useBuiltins(): BlockDef[] {
  const { catalog } = useMeguminPanel();
  return (catalog.blocks ?? []) as BlockDef[];
}

export function BlocksTab() {
  const [editing, setEditing] = useState<string | null>(null);
  if (editing !== null) return <CustomBlockEditor editId={editing || null} onDone={() => setEditing(null)} />;
  return <BlocksOverview onEdit={(id) => setEditing(id ?? "")} />;
}

function BlocksOverview({ onEdit }: { onEdit: (id: string | null) => void }) {
  const { t } = useTranslation();
  const { profile, catalog, view, update } = useMeguminPanel();
  const builtins = useBuiltins();
  const stack = stackOf(profile);
  const byId = (id: string) => builtins.find((b) => b.id === id) ?? stack.custom.find((b) => b.id === id);
  const all = [...builtins, ...stack.custom].filter((b) => !b.system);
  const inStack = stack.order.map(byId).filter((b): b is BlockDef => !!b && !b.system);
  const available = all.filter((b) => !stack.order.includes(b.id));
  const visOf = (b: BlockDef) => (stack.overrides[b.id]?.visibility as string) || (b.visibility as string) || "open";

  // A block whose text was rewritten in Dev Mode says so (globalAndBlocks.js customBadge).
  const slots = (catalog.slots ?? []) as Array<{ trigger?: string; key?: string }>;
  const edited = (b: BlockDef) => {
    const slot = b.source ? slots.find((s) => s.trigger === b.source) : null;
    return !!slot?.key && String(view.sharedFragments?.[slot.key] ?? "").trim() !== "";
  };

  const changeStack = (change: (s: ReturnType<typeof ensureStack>, draft: MeguminProfile) => void) =>
    update((draft) => {
      const s = ensureStack(draft);
      change(s, draft);
      syncLegacyBlockIds(draft, builtins);
    });

  const move = (i: number, delta: number) =>
    changeStack((s) => {
      const j = i + delta;
      if (j < 0 || j >= s.order.length) return;
      const [id] = s.order.splice(i, 1);
      s.order.splice(j, 0, id!);
    });

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <MeguminHint>{t("megumin.blocks.intro")}</MeguminHint>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/12 px-2 py-0.5 text-[0.625rem] font-semibold text-amber-500 ring-1 ring-amber-500/25">
          <Layers size="0.625rem" />
          {t("megumin.blocks.inBlockCount", { count: inStack.length })}
        </span>
      </div>

      <MeguminToggle
        label={
          <span className="inline-flex flex-wrap items-center gap-1.5">
            {t("megumin.blocks.hideFromAi.label")}
            <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/12 px-1.5 py-px text-[0.5625rem] font-semibold text-emerald-500">
              <Star size="0.5rem" />
              {t("megumin.blocks.recommended")}
            </span>
          </span>
        }
        help={t("megumin.blocks.hideFromAi.help")}
        checked={profile.hideBlocksFromAI !== false}
        onChange={(v) => update((d) => void (d.hideBlocksFromAI = v))}
      />

      <MeguminSection title={t("megumin.blocks.stack.title")} icon={<ListOrdered size="0.875rem" />}>
        {!inStack.length ? <MeguminHint>{t("megumin.blocks.stack.empty")}</MeguminHint> : null}
        {inStack.map((b, i) => {
          const off = BLOCK_REQUIRES[b.id] ? !BLOCK_REQUIRES[b.id]!(profile) : false;
          const at = stack.order.indexOf(b.id);
          return (
            <div key={b.id} className="flex flex-col gap-2">
              <div
                title={b.desc || undefined}
                className={cn(
                  "flex flex-col gap-1.5 rounded-md border border-[var(--border)]/70 bg-[var(--background)]/40 p-2",
                  off && "opacity-60",
                )}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="text-base leading-none">{b.emoji || "📦"}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1 text-xs font-medium">
                      <span className="truncate">{b.label}</span>
                      {b.builtin ? null : (
                        <span className="rounded bg-sky-500/15 px-1 text-[0.5625rem] font-semibold text-sky-500">
                          {t("megumin.blocks.customFlag")}
                        </span>
                      )}
                      {edited(b) ? (
                        <span
                          title={t("megumin.blocks.editedTitle")}
                          className="rounded bg-purple-500/15 px-1 text-[0.5625rem] font-semibold text-purple-400"
                        >
                          {t("megumin.blocks.editedFlag")}
                        </span>
                      ) : null}
                    </div>
                    <div className="truncate font-mono text-[0.625rem] text-[var(--muted-foreground)]">
                      {tagText(b.tag)}
                      {off ? t("megumin.blocks.featureOff") : null}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <IconButton
                    label={t("megumin.blocks.moveUp")}
                    disabled={i === 0}
                    onClick={() => move(at, -1)}
                    icon={<ArrowUp size="0.75rem" />}
                  />
                  <IconButton
                    label={t("megumin.blocks.moveDown")}
                    disabled={i === inStack.length - 1}
                    onClick={() => move(at, 1)}
                    icon={<ArrowDown size="0.75rem" />}
                  />
                  <select
                    aria-label={t("megumin.blocks.visibility.label")}
                    className={cn(MEGUMIN_INPUT_CLASS, "w-auto flex-1 py-1")}
                    value={visOf(b) === "hidden" ? "hidden" : "open"}
                    onChange={(e) =>
                      changeStack((s) => {
                        s.overrides[b.id] = { ...(s.overrides[b.id] || {}), visibility: e.target.value };
                      })
                    }
                  >
                    <option value="open" title={t("megumin.blocks.visibility.openHint")}>
                      {t("megumin.blocks.visibility.open")}
                    </option>
                    <option value="hidden" title={t("megumin.blocks.visibility.hiddenHint")}>
                      {t("megumin.blocks.visibility.hidden")}
                    </option>
                  </select>
                  {b.builtin ? null : (
                    <IconButton
                      label={t("megumin.blocks.editCustom")}
                      onClick={() => onEdit(b.id)}
                      icon={<Pencil size="0.75rem" />}
                    />
                  )}
                  <IconButton
                    label={t("megumin.blocks.remove")}
                    danger
                    onClick={() => changeStack((s) => void (s.order = s.order.filter((x) => x !== b.id)))}
                    icon={<X size="0.75rem" />}
                  />
                </div>
              </div>
              {b.id === "world" ? <WorldStateSettings /> : null}
              {b.id === "bonds" || b.id === "sheet" ? <StatFieldEditor def={b} /> : null}
            </div>
          );
        })}
      </MeguminSection>

      <MeguminSection title={t("megumin.blocks.add.title")} icon={<Plus size="0.875rem" />}>
        {!available.length ? <MeguminHint>{t("megumin.blocks.add.allIn")}</MeguminHint> : null}
        <div className="flex flex-wrap gap-1.5">
          {available.map((b) => (
            <button
              key={b.id}
              type="button"
              title={b.desc || undefined}
              className="mari-chrome-control mari-chrome-control--small inline-flex items-center gap-1 text-[0.6875rem]"
              onClick={() =>
                changeStack((s) => {
                  if (b.preferFirst) s.order.unshift(b.id);
                  else s.order.push(b.id);
                })
              }
            >
              <span>{b.emoji || "📦"}</span>
              {b.label}
              {edited(b) ? (
                <span className="rounded bg-purple-500/15 px-1 text-[0.5625rem] font-semibold text-purple-400">
                  {t("megumin.blocks.editedFlag")}
                </span>
              ) : null}
            </button>
          ))}
          <button
            type="button"
            className="mari-chrome-control mari-chrome-control--small inline-flex items-center gap-1 text-[0.6875rem] text-emerald-500"
            onClick={() => onEdit(null)}
          >
            <WandSparkles size="0.75rem" />
            {t("megumin.blocks.add.createCustom")}
          </button>
        </div>
      </MeguminSection>

      <BlocksPreview />
    </>
  );
}

function IconButton({
  label,
  icon,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "mari-chrome-control mari-chrome-control--small mari-chrome-control--icon active:scale-90",
        danger && "text-[var(--destructive)]",
      )}
    >
      {icon}
    </button>
  );
}

/** World State's settings, under its row: they mean nothing apart from that block. */
function WorldStateSettings() {
  const { t } = useTranslation();
  const { profile, view, update, run, chatId, scope } = useMeguminPanel();
  const ws = { ...WORLD_DEFAULTS, ...(profile.worldState ?? {}) };
  const setWs = (key: string, value: unknown) =>
    update((d) => {
      d.worldState = { ...WORLD_DEFAULTS, ...(d.worldState ?? {}), [key]: value };
    });
  const pendingQuery = useMeguminReadAction<boolean>(scope, "world.rewritePending", {
    enabled: !!chatId,
    dependsOn: JSON.stringify(view.world?.state ?? null),
  });
  const pending = pendingQuery.data === true;
  const [busy, setBusy] = useState(false);

  const toggleRewrite = async () => {
    setBusy(true);
    try {
      await run("world.rewrite", { on: !pending });
      await pendingQuery.refetch();
    } catch {
      /* run toasts its own error */
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    const ok = await showConfirmDialog({
      title: t("megumin.blocks.world.resetTitle"),
      message: t("megumin.blocks.world.resetConfirm"),
      confirmLabel: t("megumin.blocks.world.reset"),
      tone: "destructive",
    });
    if (!ok) return;
    try {
      await run("world.reset");
      toast.info(t("megumin.blocks.world.resetDone"));
    } catch {
      /* run toasts its own error */
    }
  };

  return (
    <div className="ml-3 flex flex-col gap-2 border-l-2 border-amber-500/30 pl-3">
      <MeguminSelect
        label={t("megumin.blocks.world.updates")}
        value={ws.updateMode === "manual" ? "manual" : "inline"}
        options={[
          { value: "inline", label: t("megumin.blocks.world.updatesAutomatic") },
          { value: "manual", label: t("megumin.blocks.world.updatesManual") },
        ]}
        onChange={(v) => setWs("updateMode", v)}
      />
      <MeguminHint>
        {view.world?.mode === "sidemodel"
          ? t("megumin.blocks.world.updatesHintChomusuke")
          : t("megumin.blocks.world.updatesHintInline")}{" "}
        {t("megumin.blocks.world.updatesHintManual")}
      </MeguminHint>
      <MeguminSelect
        label={t("megumin.blocks.world.detail")}
        value={ws.injectionDetail === "scene" ? "scene" : "full"}
        options={[
          { value: "full", label: t("megumin.blocks.world.detailFull") },
          { value: "scene", label: t("megumin.blocks.world.detailScene") },
        ]}
        onChange={(v) => setWs("injectionDetail", v)}
      />
      <MeguminHint>{t("megumin.blocks.world.detailHint")}</MeguminHint>
      <MeguminToggle
        label={t("megumin.blocks.world.showChanges")}
        help={t("megumin.blocks.world.showChangesHelp")}
        checked={ws.showChanges !== false}
        onChange={(v) => setWs("showChanges", v)}
      />
      <MeguminToggle
        label={t("megumin.blocks.world.showReturning")}
        help={t("megumin.blocks.world.showReturningHelp")}
        checked={ws.showReturning !== false}
        onChange={(v) => setWs("showReturning", v)}
      />
      <MeguminRow>
        <MeguminButton
          disabled={!chatId}
          title={t("megumin.blocks.world.editorTitle")}
          icon={<Pencil size="0.75rem" />}
          onClick={() => window.dispatchEvent(new CustomEvent("megumin:open-world-editor", { detail: { chatId } }))}
        >
          {t("megumin.blocks.world.editor")}
        </MeguminButton>
        <MeguminButton
          disabled={!chatId}
          pending={busy}
          variant={pending ? "primary" : "secondary"}
          title={t("megumin.blocks.world.rewriteTitle")}
          icon={pending ? <Check size="0.75rem" /> : <RefreshCw size="0.75rem" />}
          onClick={toggleRewrite}
        >
          {pending ? t("megumin.blocks.world.rewriteQueued") : t("megumin.blocks.world.rewriteNext")}
        </MeguminButton>
        <MeguminButton
          disabled={!chatId}
          title={t("megumin.blocks.world.resetTitle")}
          icon={<Eraser size="0.75rem" />}
          onClick={reset}
        >
          {t("megumin.blocks.world.reset")}
        </MeguminButton>
      </MeguminRow>
      {!chatId ? <MeguminHint tone="warning">{t("megumin.panel.needsChat")}</MeguminHint> : null}
    </div>
  );
}

const FIELD_TYPES = ["meter", "number", "text", "list"] as const;

/** Bonds and Character Sheet are generated from a field list, so they get an editor for it. */
function StatFieldEditor({ def }: { def: BlockDef }) {
  const { t } = useTranslation();
  const { profile, catalog, update } = useMeguminPanel();
  const fields: StatField[] = profile.statBlocks?.[def.id]?.fields ?? [];
  const packs = (
    (catalog.statFieldPacks ?? {}) as Record<string, Array<{ id: string; label: string; fields: StatField[] }>>
  )[def.id];

  const changeFields = (change: (list: StatField[]) => void) =>
    update((d) => {
      d.statBlocks = d.statBlocks ?? {};
      const cfg = (d.statBlocks[def.id] = d.statBlocks[def.id] ?? { fields: [] });
      cfg.fields = Array.isArray(cfg.fields) ? cfg.fields : [];
      change(cfg.fields);
    });

  return (
    <div className="ml-3 flex flex-col gap-2 border-l-2 border-rose-500/30 pl-3">
      <div>
        <div className="text-[0.6875rem] font-medium text-[var(--marinara-chat-chrome-panel-title)]">
          {t("megumin.blocks.fields.title")}
        </div>
        <MeguminHint>
          {def.id === "bonds" ? t("megumin.blocks.fields.hintBonds") : t("megumin.blocks.fields.hintSheet")}
        </MeguminHint>
      </div>
      {fields.map((f, i) => (
        <div key={f.id || i} className="flex flex-col gap-1 rounded-md bg-[var(--background)]/40 p-1.5">
          <div className="flex items-center gap-1">
            <FieldLabelInput
              value={f.label}
              placeholder={t("megumin.blocks.fields.namePlaceholder")}
              onCommit={(v) => changeFields((list) => void (list[i] = { ...list[i]!, label: v }))}
            />
            <IconButton
              label={t("megumin.blocks.moveUp")}
              disabled={i === 0}
              onClick={() => changeFields((list) => void list.splice(i - 1, 0, list.splice(i, 1)[0]!))}
              icon={<ArrowUp size="0.75rem" />}
            />
            <IconButton
              label={t("megumin.blocks.fields.remove")}
              danger
              onClick={() => changeFields((list) => void list.splice(i, 1))}
              icon={<X size="0.75rem" />}
            />
          </div>
          <div className="flex items-center gap-1">
            <select
              aria-label={t("megumin.blocks.fields.type")}
              className={cn(MEGUMIN_INPUT_CLASS, "py-1")}
              value={f.type}
              onChange={(e) => changeFields((list) => void (list[i] = { ...list[i]!, type: e.target.value }))}
            >
              {FIELD_TYPES.map((type) => (
                <option key={type} value={type} title={t(`megumin.blocks.fieldType.${type}Hint`)}>
                  {t(`megumin.blocks.fieldType.${type}`)}
                </option>
              ))}
            </select>
            {f.type === "meter" ? (
              <input
                type="number"
                title={t("megumin.blocks.fields.max")}
                aria-label={t("megumin.blocks.fields.max")}
                className={cn(MEGUMIN_INPUT_CLASS, "w-16 py-1")}
                value={f.max || 100}
                onChange={(e) =>
                  changeFields((list) => void (list[i] = { ...list[i]!, max: parseInt(e.target.value, 10) || 100 }))
                }
              />
            ) : null}
            {f.type === "meter" || f.type === "number" ? (
              <input
                type="number"
                title={t("megumin.blocks.fields.start")}
                aria-label={t("megumin.blocks.fields.start")}
                className={cn(MEGUMIN_INPUT_CLASS, "w-16 py-1")}
                value={f.start !== undefined ? f.start : 0}
                onChange={(e) =>
                  changeFields((list) => void (list[i] = { ...list[i]!, start: parseInt(e.target.value, 10) || 0 }))
                }
              />
            ) : null}
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-1.5">
        <MeguminButton
          icon={<Plus size="0.75rem" />}
          onClick={() =>
            changeFields(
              (list) =>
                void list.push({
                  id: `f_${Date.now()}`,
                  label: t("megumin.blocks.fields.newField"),
                  type: "meter",
                  max: 100,
                  start: 0,
                }),
            )
          }
        >
          {t("megumin.blocks.fields.add")}
        </MeguminButton>
        {(packs ?? []).map((pack) => (
          <MeguminButton
            key={pack.id}
            icon={<PackageOpen size="0.75rem" />}
            onClick={() => {
              // Merged, never replaced: a field already there keeps its settings.
              changeFields((list) => {
                for (const pf of pack.fields) {
                  if (!list.some((f) => String(f.label).toLowerCase() === pf.label.toLowerCase())) list.push({ ...pf });
                }
              });
              toast.success(t("megumin.blocks.fields.packAdded", { pack: pack.label }));
            }}
          >
            {pack.label}
          </MeguminButton>
        ))}
      </div>
    </div>
  );
}

function FieldLabelInput({
  value,
  placeholder,
  onCommit,
}: {
  value: string;
  placeholder: string;
  onCommit: (value: string) => void;
}) {
  const { draft, change, flush } = useDraftText(value ?? "", onCommit, 500);
  return (
    <input
      className={cn(MEGUMIN_INPUT_CLASS, "flex-1 py-1")}
      value={draft}
      placeholder={placeholder}
      aria-label={placeholder}
      onChange={(e) => change(e.target.value)}
      onBlur={flush}
    />
  );
}

/**
 * The card the chat draws, from the templates the AI is asked to fill in (never a reply from the chat: this is
 * where the templates are edited, so it shows what is being sent). The sample comes from the engine's own dict.
 */
function BlocksPreview() {
  const { t } = useTranslation();
  const { scope, view } = useMeguminPanel();
  const { dataUpdatedAt } = useMeguminView(scope);
  const sample = useMeguminReadAction<string>(scope, "blocks.preview", { dependsOn: String(dataUpdatedAt) });
  const host = useRef<HTMLDivElement>(null);
  const active = view.activeBlocks ?? [];
  const blocks = useMemo(
    () => (sample.data ? (extractBlocks(sample.data, view.registry) as unknown[]) : []),
    [sample.data, view.registry],
  );

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    el.replaceChildren();
    if (!active.length || !blocks.length) return;
    try {
      // Open on arrival: the chat card rests shut, but a shut preview shows nothing.
      el.appendChild(buildBlocksCard(blocks, { preview: true, expanded: true, statFields: view.statFields }));
    } catch (error) {
      console.warn("[Megumin] Blocks preview failed", error);
    }
  }, [active.length, blocks, view.statFields]);

  return (
    <MeguminSection title={t("megumin.blocks.preview.title")} icon={<Eye size="0.875rem" />}>
      <MeguminHint>{t("megumin.blocks.preview.note")}</MeguminHint>
      {!active.length ? (
        <MeguminHint>{t("megumin.blocks.preview.noBlocks")}</MeguminHint>
      ) : sample.isError ? (
        <MeguminHint tone="warning">{t("megumin.blocks.preview.failed")}</MeguminHint>
      ) : sample.data !== undefined && !blocks.length ? (
        <MeguminHint>{t("megumin.blocks.preview.nothing")}</MeguminHint>
      ) : null}
      <div ref={host} className="min-w-0 overflow-x-auto" />
      {active.length && blocks.length ? <MeguminHint>{t("megumin.blocks.preview.source")}</MeguminHint> : null}
    </MeguminSection>
  );
}

/** A custom block: a name (its tag), an emoji, how it shows, and the template the AI fills in. */
function CustomBlockEditor({ editId, onDone }: { editId: string | null; onDone: () => void }) {
  const { t } = useTranslation();
  const { profile, update } = useMeguminPanel();
  const builtins = useBuiltins();
  const stack = stackOf(profile);
  const existing = editId ? stack.custom.find((b) => b.id === editId) : undefined;
  const [draftId] = useState(() => existing?.id ?? `blk_${Date.now()}`);
  const [label, setLabel] = useState<string>(existing?.label ?? "");
  const [emoji, setEmoji] = useState<string>(existing?.emoji ?? "📦");
  const [visibility, setVisibility] = useState<string>(existing?.visibility === "hidden" ? "hidden" : "open");
  const [content, setContent] = useState<string>(existing?.content ?? "");
  const tag = blockTagFromName(label);

  /** registry.js validateCustomBlock. */
  const problem = (): string => {
    if (!label.trim()) return t("megumin.blocks.custom.errorName");
    if (!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(tag)) return t("megumin.blocks.custom.errorTag");
    if (RESERVED_BLOCK_TAGS.includes(tag.toLowerCase())) return t("megumin.blocks.custom.errorReserved", { tag });
    const clash = [...builtins, ...stack.custom].find(
      (b) => b.id !== draftId && String(b.tag).toLowerCase() === tag.toLowerCase(),
    );
    if (clash) return t("megumin.blocks.custom.errorClash", { tag, block: clash.label });
    return "";
  };

  const save = () => {
    const trimmed = label.trim();
    const error = problem();
    if (error) {
      toast.warning(error);
      return;
    }
    const entry: BlockDef = {
      id: draftId,
      label: trimmed,
      tag: blockTagFromName(trimmed),
      emoji: emoji.trim() || "📦",
      icon: "fa-cube",
      color: "#38bdf8",
      visibility,
      builtin: false,
      content: content.trim(),
      // Custom blocks carry their own body rather than reading a dict tag.
      source: null,
    };
    update((draft) => {
      const s = ensureStack(draft);
      const at = s.custom.findIndex((b) => b.id === entry.id);
      if (at > -1) s.custom[at] = entry;
      else s.custom.push(entry);
      if (!s.order.includes(entry.id)) s.order.push(entry.id);
      syncLegacyBlockIds(draft, builtins);
    });
    toast.success(t("megumin.blocks.custom.saved", { name: trimmed }));
    onDone();
  };

  return (
    <MeguminSection
      title={existing ? t("megumin.blocks.custom.editTitle") : t("megumin.blocks.custom.newTitle")}
      description={t("megumin.blocks.custom.intro")}
      icon={<WandSparkles size="0.875rem" />}
    >
      <LocalField label={t("megumin.blocks.custom.name")} hint={t("megumin.blocks.custom.nameHint")}>
        <input
          className={MEGUMIN_INPUT_CLASS}
          value={label}
          placeholder={t("megumin.blocks.custom.namePlaceholder")}
          onChange={(e) => setLabel(e.target.value)}
        />
      </LocalField>
      <LocalField label={t("megumin.blocks.custom.emoji")} hint={t("megumin.blocks.custom.emojiHint")}>
        <input
          className={cn(MEGUMIN_INPUT_CLASS, "w-16 text-center")}
          value={emoji}
          aria-label={t("megumin.blocks.custom.emoji")}
          onChange={(e) => setEmoji(e.target.value)}
        />
      </LocalField>
      <MeguminSelect
        label={t("megumin.blocks.custom.shownAs")}
        help={t("megumin.blocks.custom.shownAsHint")}
        value={visibility}
        options={[
          { value: "open", label: t("megumin.blocks.visibility.open") },
          { value: "hidden", label: t("megumin.blocks.visibility.hidden") },
        ]}
        onChange={setVisibility}
      />
      <LocalField label={t("megumin.blocks.custom.template")} hint={t("megumin.blocks.custom.templateHint")}>
        <textarea
          className={cn(MEGUMIN_INPUT_CLASS, "min-h-32 resize-y font-mono text-[0.6875rem] leading-relaxed")}
          rows={8}
          value={content}
          placeholder={t("megumin.blocks.custom.templatePlaceholder")}
          aria-label={t("megumin.blocks.custom.template")}
          onChange={(e) => setContent(e.target.value)}
        />
      </LocalField>
      <MeguminHint>
        {t("megumin.blocks.custom.tag")} <code className="font-mono">{tagText(tag || "…")}</code>
      </MeguminHint>
      <MeguminRow>
        <MeguminButton variant="primary" icon={<Check size="0.75rem" />} onClick={save}>
          {t("megumin.blocks.custom.save")}
        </MeguminButton>
        <MeguminButton icon={<X size="0.75rem" />} onClick={onDone}>
          {t("megumin.blocks.custom.cancel")}
        </MeguminButton>
      </MeguminRow>
    </MeguminSection>
  );
}

function LocalField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[0.6875rem] font-medium text-[var(--marinara-chat-chrome-panel-title)]">{label}</span>
      {hint ? <MeguminHint>{hint}</MeguminHint> : null}
      {children}
    </div>
  );
}
