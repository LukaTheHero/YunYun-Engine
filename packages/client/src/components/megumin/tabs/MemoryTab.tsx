// ──────────────────────────────────────────────
// Megumin panel: Memory
// ──────────────────────────────────────────────
// Megumin's Memory Core tab (renderMemoryCore and its dashboard, short-term
// accordion and vault in src/features/memory/index.js): three tiers of chat
// memory. Recent messages stay raw (Working), older ones are summarised in
// chunks (Short-Term), and the oldest move to the Long-Term Vault, where only
// the archives relevant to the scene are retrieved (TF-IDF or semantic
// embeddings). The chunks and the vault belong to the chat (chat metadata),
// carried here in the profile exactly as Megumin carries them.
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Archive,
  CircleCheck,
  CircleX,
  Cat,
  ChevronDown,
  Clock,
  Cpu,
  Database,
  Download,
  FileUp,
  ChartGantt,
  Info,
  Layers,
  RefreshCw,
  Radar,
  Save,
  Settings2,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { cn } from "../../../lib/utils";
import { showChoiceDialog, showConfirmDialog } from "../../../lib/app-dialogs";
import { downloadJsonFile } from "../../../lib/download-json";
import { useChatMessageCount } from "../../../hooks/use-chats";
import { useMeguminPanel } from "../megumin-panel-context";
import {
  MEGUMIN_INPUT_CLASS,
  MeguminButton,
  MeguminFeatureBar,
  MeguminGrid,
  MeguminHint,
  MeguminNeedsChat,
  MeguminRow,
  MeguminSection,
  MeguminSelect,
  useDraftText,
} from "../MeguminControls";
import { MeguminPromptOverrides } from "./MeguminPromptOverrides";
import { Badge, Callout } from "./presetControls";

interface MemoryChunk {
  id: string;
  summary?: string;
  text?: string;
  timestamp?: number;
}

interface ScannerMatch {
  id: string;
  score: number | string;
  matchedWords?: string[];
  text?: string;
  summary?: string;
}

interface ScannerResult {
  engine: "tfidf" | "semantic";
  vaultCount: number;
  semanticCount: number;
  keywords: string[];
  matches: ScannerMatch[];
}

const PAGE_SIZE = 20;
const FREQUENCIES = [5, 10, 15, 20, 30];

/** "12-21" → 10 messages. */
function spanOf(chunk: MemoryChunk) {
  const [a, b] = String(chunk.id || "").split("-");
  const from = parseInt(a ?? "", 10);
  const to = parseInt(b ?? "", 10);
  return Number.isFinite(from) && Number.isFinite(to) ? to - from + 1 : 0;
}

/** Megumin's memNormalizeForSearch: typography and line wraps are not differences the reader typed. */
function normalizeForSearch(s: string) {
  return String(s)
    .toLowerCase()
    .replace(/…/g, "...")
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** A changed chunk list invalidates Megumin's caches of what is archived and what it saved. */
function markDirty(mem: Record<string, any>) {
  delete mem._archivedSet;
  mem._tokensDirty = true;
}

/** A range input drawn live and saved as it moves; `onSettle` runs once the reader lets go. */
function LimitSlider({
  label,
  hint,
  value,
  min,
  max,
  step,
  onChange,
  onSettle,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  onSettle?: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[0.8125rem] font-medium text-[var(--marinara-chat-chrome-panel-title)]">{label}</span>
        <span className="font-mono text-[0.8125rem] font-bold">{value}</span>
      </div>
      <input
        type="range"
        className="w-full accent-[var(--primary)]"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        onPointerUp={onSettle}
        onKeyUp={onSettle}
      />
      <MeguminHint>{hint}</MeguminHint>
    </div>
  );
}

/** One summary or archive, edited in place. Saved when typing pauses (chunks) or on leaving the box (vault). */
function ChunkEditor({
  value,
  onSave,
  ariaLabel,
  rows,
}: {
  value: string;
  onSave: (value: string) => void;
  ariaLabel: string;
  rows: number;
}) {
  const { draft, change, flush } = useDraftText(value, onSave, 800);
  return (
    <textarea
      className={cn(MEGUMIN_INPUT_CLASS, "resize-y font-mono text-[0.8125rem] leading-relaxed")}
      rows={rows}
      value={draft}
      aria-label={ariaLabel}
      onChange={(e) => change(e.target.value)}
      onBlur={flush}
    />
  );
}

export function MemoryTab() {
  const { t } = useTranslation();
  const { profile, view, chatId, update, flush, run, running, openTab } = useMeguminPanel();
  const messageCount = useChatMessageCount(chatId).data?.count ?? 0;
  const mem = (profile.memoryCore ?? {}) as Record<string, any>;
  const chunkSize = Number(mem.chunkSize) || 10;
  const workingLimit = Number(mem.workingLimit) || 30;
  const shortTermLimit = Number(mem.shortTermLimit) || 70;
  const isRawLong = mem.architecture === "raw_long";
  const shortChunks = useMemo(
    () => (Array.isArray(mem.shortTermChunks) ? mem.shortTermChunks : []) as MemoryChunk[],
    [mem.shortTermChunks],
  );
  const vault = useMemo(
    () => (Array.isArray(mem.longTermVault) ? mem.longTermVault : []) as MemoryChunk[],
    [mem.longTermVault],
  );
  const semantic = mem.scannerEngine === "semantic";

  const [openChunks, setOpenChunks] = useState<Set<string>>(() => new Set());
  const [shortShown, setShortShown] = useState(PAGE_SIZE);
  const [vaultShown, setVaultShown] = useState(PAGE_SIZE);
  const [search, setSearch] = useState("");
  const [scanner, setScanner] = useState<ScannerResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const migrateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (migrateTimer.current) clearTimeout(migrateTimer.current);
    },
    [],
  );

  const setMem = (change: (m: Record<string, any>) => void) =>
    update((draft) => {
      if (!draft.memoryCore || typeof draft.memoryCore !== "object") draft.memoryCore = {};
      change(draft.memoryCore);
    });

  /** Runs an action on the settings just edited here: the pending profile save goes first. */
  const quiet = async (action: string, args?: Record<string, unknown>) => {
    try {
      await flush();
      return await run(action, args);
    } catch {
      /* the action reports its own failure */
      return null;
    }
  };

  /** Megumin pushes chunks down the tiers once a limit settles (memRunVaultMigration). */
  const migrateSoon = () => {
    if (!chatId) return;
    if (migrateTimer.current) clearTimeout(migrateTimer.current);
    migrateTimer.current = setTimeout(() => void quiet("memory.migrate"), 700);
  };

  // ── Dashboard (memRenderDashboard) ──
  const realMessages = Number((view.memory as Record<string, unknown>)?.realMessages ?? messageCount) || 0;
  const dash = useMemo(() => {
    const working = Math.min(realMessages, workingLimit);
    const vaultSize = vault.reduce((n, c) => n + spanOf(c), 0);
    const shortSize = isRawLong ? 0 : shortChunks.reduce((n, c) => n + spanOf(c), 0);
    const pending = Math.max(0, realMessages - working - vaultSize - shortSize);
    const scale = Math.max(realMessages, 1);
    return {
      working,
      vaultSize,
      shortSize,
      pending,
      pVault: (vaultSize / scale) * 100,
      pShort: (shortSize / scale) * 100,
      pPend: (pending / scale) * 100,
      pWork: (working / scale) * 100,
    };
  }, [isRawLong, realMessages, shortChunks, vault, workingLimit]);

  const toggleEnabled = (on: boolean) => {
    let firstEnable = false;
    setMem((m) => {
      m.enabled = on;
      // Switching on with nothing archived yet starts sweeping after every reply.
      if (on && !(m.shortTermChunks?.length > 0) && !(m.longTermVault?.length > 0) && m.triggerMode === "frequency") {
        m.triggerMode = "every";
        firstEnable = true;
      }
    });
    if (firstEnable) toast.success(t("megumin.memory.firstEnable"));
  };

  const changeChunkSize = (size: number) =>
    setMem((m) => {
      m.chunkSize = size;
      // The limits are counted in whole chunks, so they snap to the new size.
      m.workingLimit = Math.max(size, Math.round((Number(m.workingLimit) || 30) / size) * size);
      m.shortTermLimit = Math.max(size, Math.round((Number(m.shortTermLimit) || 70) / size) * size);
    });

  const changeScanner = async (engine: string) => {
    setMem((m) => {
      m.scannerEngine = engine;
    });
    if (engine !== "semantic" || !chatId) return;
    if (vault.length === 0) {
      toast.info(t("megumin.memory.semanticEmpty"));
      return;
    }
    toast.info(t("megumin.memory.semanticSyncing"));
    const result = (await quiet("memory.vectorSync")) as { count?: number; inserted?: boolean } | null;
    if (!result) return;
    if (result.inserted) toast.success(t("megumin.memory.semanticSynced", { count: result.count ?? vault.length }));
    else toast.error(t("megumin.memory.semanticSyncFailed"));
  };

  const applyLimits = () => {
    void quiet("memory.applyLimits");
  };

  const clearShort = async () => {
    if (shortChunks.length === 0) {
      toast.info(t("megumin.memory.shortAlreadyEmpty"));
      return;
    }
    const ok = await showConfirmDialog({
      title: t("megumin.memory.clearShortTitle"),
      message: t("megumin.memory.clearShortConfirm"),
      confirmLabel: t("megumin.memory.clearAll"),
      cancelLabel: t("megumin.memory.cancel"),
      tone: "destructive",
    });
    if (!ok) return;
    setMem((m) => {
      m.shortTermChunks = [];
      markDirty(m);
    });
    toast.success(t("megumin.memory.shortCleared"));
  };

  const clearVault = async () => {
    if (vault.length === 0) {
      toast.info(t("megumin.memory.vaultAlreadyEmpty"));
      return;
    }
    const ok = await showConfirmDialog({
      title: t("megumin.memory.clearVaultTitle"),
      message: t("megumin.memory.clearVaultConfirm"),
      confirmLabel: t("megumin.memory.clearAll"),
      cancelLabel: t("megumin.memory.cancel"),
      tone: "destructive",
    });
    if (!ok) return;
    // In semantic mode the archives are wiped from the vector index too.
    if (semantic && chatId) await quiet("memory.vectorDelete", { ids: vault.map((v) => v.id) });
    setMem((m) => {
      m.longTermVault = [];
      markDirty(m);
    });
    toast.success(t("megumin.memory.vaultCleared"));
  };

  const deleteChunk = async (chunk: MemoryChunk) => {
    const ok = await showConfirmDialog({
      title: t("megumin.memory.deleteChunkTitle"),
      message: t("megumin.memory.deleteChunkConfirm", { range: chunk.id }),
      confirmLabel: t("megumin.memory.delete"),
      cancelLabel: t("megumin.memory.cancel"),
      tone: "destructive",
    });
    if (!ok) return;
    setMem((m) => {
      m.shortTermChunks = (m.shortTermChunks ?? []).filter((c: MemoryChunk) => c.id !== chunk.id);
      markDirty(m);
    });
  };

  const editChunk = (id: string, summary: string) =>
    setMem((m) => {
      const target = (m.shortTermChunks ?? []).find((c: MemoryChunk) => c.id === id);
      if (!target) return;
      target.summary = summary;
      m._tokensDirty = true;
    });

  const editArchive = (id: string, text: string) => {
    setMem((m) => {
      const target = (m.longTermVault ?? []).find((c: MemoryChunk) => c.id === id);
      if (!target) return;
      target.text = text;
      markDirty(m);
    });
    // The changed archive is re-embedded so semantic search finds what it now says.
    if (semantic && chatId) void quiet("memory.vectorInsert", { ids: [id] });
  };

  const deleteArchive = async (id: string) => {
    const ok = await showConfirmDialog({
      title: t("megumin.memory.deleteArchiveTitle"),
      message: t("megumin.memory.deleteArchiveConfirm"),
      confirmLabel: t("megumin.memory.delete"),
      cancelLabel: t("megumin.memory.cancel"),
      tone: "destructive",
    });
    if (!ok) return;
    if (semantic && chatId) void quiet("memory.vectorDelete", { ids: [id] });
    setMem((m) => {
      m.longTermVault = (m.longTermVault ?? []).filter((c: MemoryChunk) => c.id !== id);
      markDirty(m);
    });
  };

  const exportMemory = () => {
    void downloadJsonFile({ shortTermChunks: shortChunks, longTermVault: vault }, "megumin_memory_core.json");
  };

  const importMemory = async (file: File) => {
    let data: { shortTermChunks?: MemoryChunk[]; longTermVault?: MemoryChunk[] };
    try {
      data = JSON.parse(await file.text());
    } catch {
      toast.error(t("megumin.memory.importParseFailed"));
      return;
    }
    if (!data || (!data.shortTermChunks && !data.longTermVault)) {
      toast.error(t("megumin.memory.importNotMemory"));
      return;
    }
    const choice = await showChoiceDialog({
      title: t("megumin.memory.importTitle"),
      message: t("megumin.memory.importMessage"),
      cancelLabel: t("megumin.memory.cancel"),
      choices: [
        { key: "merge", label: t("megumin.memory.importMerge"), description: t("megumin.memory.importMergeDesc") },
        {
          key: "overwrite",
          label: t("megumin.memory.importOverwrite"),
          description: t("megumin.memory.importOverwriteDesc"),
          tone: "destructive",
        },
      ],
    });
    if (!choice) return;
    setMem((m) => {
      if (choice === "merge") {
        if (data.shortTermChunks) m.shortTermChunks = [...(m.shortTermChunks ?? []), ...data.shortTermChunks];
        if (data.longTermVault) m.longTermVault = [...(m.longTermVault ?? []), ...data.longTermVault];
      } else {
        m.shortTermChunks = data.shortTermChunks ?? [];
        m.longTermVault = data.longTermVault ?? [];
      }
      markDirty(m);
    });
    toast.success(t("megumin.memory.imported"));
  };

  const testScanner = async () => {
    const result = (await quiet("memory.testScanner")) as ScannerResult | null;
    if (!result) return;
    if (result.engine === "semantic" && result.semanticCount === 0) {
      if (result.vaultCount === 0) toast.info(t("megumin.memory.scannerVaultEmpty"));
      else toast.warning(t("megumin.memory.scannerSemanticNothing", { count: result.vaultCount }));
    }
    setScanner(result);
  };

  const filteredVault = useMemo(() => {
    const needle = normalizeForSearch(search);
    return vault.filter((c) => normalizeForSearch(c.text || c.summary || "").includes(needle)).reverse();
  }, [search, vault]);
  const newestFirstChunks = useMemo(() => [...shortChunks].reverse(), [shortChunks]);

  return (
    <div className="flex flex-col gap-4">
      <Callout tone="gold" icon={<TriangleAlert size="0.9375rem" className="text-amber-500" />}>
        <div className="font-semibold text-[var(--marinara-chat-chrome-panel-title)]">
          {t("megumin.memory.calloutTitle")}
        </div>
        <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-4">
          <li>{t("megumin.memory.calloutCache")}</li>
          <li>{t("megumin.memory.calloutSemantic")}</li>
        </ul>
      </Callout>

      {/* Megumin's "Turn on Memory" bar, with the tab's Enabled/Disabled badge beside its name. */}
      <MeguminFeatureBar
        icon={<Cpu size="1rem" className="shrink-0 text-emerald-500" />}
        title={
          <>
            {t("megumin.memory.enable")}
            <Badge
              tone={mem.enabled ? "active" : "muted"}
              icon={mem.enabled ? <CircleCheck size="0.6875rem" /> : <CircleX size="0.6875rem" />}
            >
              {mem.enabled ? t("megumin.memory.enabled") : t("megumin.memory.disabled")}
            </Badge>
          </>
        }
        description={t("megumin.memory.enableHelp")}
        checked={mem.enabled === true}
        onChange={toggleEnabled}
      />

      {mem.enabled ? (
        <>
          {!chatId ? <MeguminNeedsChat /> : null}

          <MeguminSection
            title={t("megumin.memory.dashboard")}
            icon={<ChartGantt size="0.9375rem" />}
            headerAction={
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-500 ring-1 ring-emerald-500/30">
                <Save size="0.75rem" />
                {t("megumin.memory.tokensSaved", { count: view.memory?.tokensSaved ?? 0 })}
              </span>
            }
          >
            {/* The legend is spread over the bar, oldest on the left to newest on the right, like its segments. */}
            <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-[var(--muted-foreground)]">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-blue-500" />
                {t("megumin.memory.legendVault")}
              </span>
              {!isRawLong ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  {t("megumin.memory.legendShort")}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-700" />
                {t("megumin.memory.legendPending")}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                {t("megumin.memory.legendWorking")}
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-black/50">
                <div
                  className="bg-blue-500 transition-[width]"
                  style={{ width: `${dash.pVault}%` }}
                  title={t("megumin.memory.barVault")}
                />
                {!isRawLong ? (
                  <div
                    className="bg-amber-500 transition-[width]"
                    style={{ width: `${dash.pShort}%` }}
                    title={t("megumin.memory.barShort")}
                  />
                ) : null}
                <div
                  className="transition-[width] [background:repeating-linear-gradient(45deg,#047857,#047857_10px,#10b981_10px,#10b981_20px)]"
                  style={{ width: `${dash.pPend}%` }}
                  title={t("megumin.memory.barPending")}
                />
                <div
                  className="bg-emerald-500 transition-[width]"
                  style={{ width: `${dash.pWork}%` }}
                  title={t("megumin.memory.barWorking")}
                />
              </div>
              <div className="flex justify-between gap-3 text-xs font-semibold text-[var(--muted-foreground)] opacity-80">
                <span>{t("megumin.memory.oldest")}</span>
                <span className="text-right">{t("megumin.memory.newest")}</span>
              </div>
            </div>
            {/* The counts, and the file actions for what the chat has archived. */}
            <div className="flex flex-col items-center gap-3 border-t border-dashed border-[var(--border)]/70 pt-3 @2xl:flex-row @2xl:justify-between">
              <div className="text-center text-xs text-[var(--muted-foreground)] @2xl:text-left">
                {isRawLong
                  ? t("megumin.memory.statusRawLong", {
                      total: realMessages,
                      vault: dash.vaultSize,
                      pending: dash.pending,
                      working: dash.working,
                    })
                  : t("megumin.memory.status", {
                      total: realMessages,
                      vault: dash.vaultSize,
                      short: dash.shortSize,
                      pending: dash.pending,
                      working: dash.working,
                    })}
              </div>
              <MeguminRow className="shrink-0">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void importMemory(file);
                  }}
                />
                <MeguminButton
                  icon={<FileUp size="0.75rem" />}
                  title={t("megumin.memory.import")}
                  onClick={() => fileRef.current?.click()}
                >
                  {t("megumin.memory.import")}
                </MeguminButton>
                <MeguminButton
                  icon={<Download size="0.75rem" />}
                  title={t("megumin.memory.export")}
                  onClick={exportMemory}
                >
                  {t("megumin.memory.export")}
                </MeguminButton>
              </MeguminRow>
            </div>
          </MeguminSection>

          <MeguminSection
            title={t("megumin.memory.engineSettings")}
            icon={<Settings2 size="0.9375rem" />}
            contentClassName="gap-4"
          >
            <Callout tone="gold" icon={<Info size="0.9375rem" className="text-amber-500" />}>
              <div className="mb-1 font-semibold text-amber-500">{t("megumin.memory.howToTitle")}</div>
              <ol className="flex list-decimal flex-col gap-0.5 pl-4">
                <li>{t("megumin.memory.howTo1")}</li>
                <li>{t("megumin.memory.howTo2")}</li>
                <li>{t("megumin.memory.howTo3")}</li>
              </ol>
            </Callout>

            {/* The four choices side by side, then the tier sizes, then who does the summarising. */}
            <MeguminGrid layout="fields" className="gap-x-4 gap-y-4">
              <MeguminSelect
                label={t("megumin.memory.architecture")}
                help={t("megumin.memory.architectureHelp")}
                value={mem.architecture || "raw_short_long"}
                options={[
                  { value: "raw_short_long", label: t("megumin.memory.architectureFull") },
                  { value: "raw_long", label: t("megumin.memory.architectureRawLong") },
                ]}
                onChange={(v) => {
                  setMem((m) => {
                    m.architecture = v;
                  });
                  migrateSoon();
                }}
              />

              <MeguminSelect
                label={t("megumin.memory.scannerEngine")}
                help={t("megumin.memory.scannerEngineHelp")}
                value={mem.scannerEngine || "tfidf"}
                options={[
                  { value: "tfidf", label: t("megumin.memory.scannerTfidf") },
                  { value: "semantic", label: t("megumin.memory.scannerSemantic") },
                ]}
                onChange={(v) => void changeScanner(v)}
              />

              <MeguminSelect
                label={t("megumin.memory.triggerMode")}
                help={t("megumin.memory.triggerModeHelp")}
                value={mem.triggerMode || "frequency"}
                options={[
                  { value: "manual", label: t("megumin.memory.triggerManual") },
                  { value: "every", label: t("megumin.memory.triggerEvery") },
                  { value: "frequency", label: t("megumin.memory.triggerFrequency") },
                ]}
                onChange={(v) =>
                  setMem((m) => {
                    m.triggerMode = v;
                  })
                }
              />
              {mem.triggerMode === "frequency" ? (
                <MeguminSelect
                  label={t("megumin.memory.frequency")}
                  value={String(mem.autoFreq || 10)}
                  options={FREQUENCIES.map((n) => ({ value: String(n), label: String(n) }))}
                  onChange={(v) =>
                    setMem((m) => {
                      m.autoFreq = parseInt(v, 10);
                    })
                  }
                />
              ) : null}
            </MeguminGrid>

            <div className="flex flex-col gap-4 rounded-lg border border-[var(--border)]/70 bg-[var(--background)]/40 p-4">
              <div
                className={cn(
                  "grid grid-cols-1 items-start gap-x-6 gap-y-4 @lg:grid-cols-2",
                  !isRawLong && "@3xl:grid-cols-3",
                )}
              >
                <LimitSlider
                  label={t("megumin.memory.workingLimit")}
                  hint={t("megumin.memory.workingLimitHint")}
                  value={workingLimit}
                  min={chunkSize}
                  max={300}
                  step={chunkSize}
                  onChange={(v) =>
                    setMem((m) => {
                      m.workingLimit = v;
                    })
                  }
                  onSettle={migrateSoon}
                />
                {!isRawLong ? (
                  <LimitSlider
                    label={t("megumin.memory.shortTermLimit")}
                    hint={t("megumin.memory.shortTermLimitHint")}
                    value={shortTermLimit}
                    min={chunkSize}
                    max={1000}
                    step={chunkSize}
                    onChange={(v) =>
                      setMem((m) => {
                        m.shortTermLimit = v;
                      })
                    }
                    onSettle={migrateSoon}
                  />
                ) : null}
                <LimitSlider
                  label={t("megumin.memory.chunkSize")}
                  hint={t("megumin.memory.chunkSizeHint")}
                  value={chunkSize}
                  min={10}
                  max={40}
                  step={10}
                  onChange={changeChunkSize}
                  onSettle={migrateSoon}
                />
              </div>
              <div className="flex justify-end border-t border-dashed border-[var(--border)]/70 pt-3">
                <MeguminButton
                  icon={<RefreshCw size="0.75rem" />}
                  pending={running("memory.applyLimits")}
                  disabled={!chatId}
                  onClick={applyLimits}
                >
                  {t("megumin.memory.applyLimits")}
                </MeguminButton>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-[var(--border)]/50 pt-4 @xl:flex-row @xl:items-center">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <Cat size="1rem" className="mt-0.5 shrink-0 text-rose-500" />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[0.8125rem] font-semibold text-[var(--marinara-chat-chrome-panel-title)]">
                    {t("megumin.memory.backgroundWorker")}
                  </span>
                  <MeguminHint>{t("megumin.memory.backgroundWorkerDesc")}</MeguminHint>
                </div>
              </div>
              <div className="shrink-0 pl-7 @xl:pl-0">
                <MeguminButton onClick={() => openTab("chomusuke")} icon={<Cat size="0.75rem" />}>
                  {t("megumin.memory.openChomusuke")}
                </MeguminButton>
              </div>
            </div>
          </MeguminSection>

          <MeguminSection
            title={t("megumin.memory.shortTerm")}
            icon={<Archive size="0.9375rem" />}
            headerAction={
              <MeguminButton variant="danger" icon={<Trash2 size="0.75rem" />} onClick={() => void clearShort()}>
                {t("megumin.memory.clearAll")}
              </MeguminButton>
            }
            contentClassName="gap-2"
          >
            {newestFirstChunks.length === 0 ? (
              <MeguminHint>{t("megumin.memory.shortEmpty")}</MeguminHint>
            ) : (
              newestFirstChunks.slice(0, shortShown).map((chunk) => {
                const open = openChunks.has(chunk.id);
                return (
                  <div
                    key={chunk.id}
                    className="overflow-hidden rounded-lg border border-[var(--border)]/70 bg-[var(--background)]/30"
                  >
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() =>
                        setOpenChunks((s) => {
                          const next = new Set(s);
                          if (next.has(chunk.id)) next.delete(chunk.id);
                          else next.add(chunk.id);
                          return next;
                        })
                      }
                      className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2.5 text-left text-[0.8125rem] font-semibold hover:bg-[var(--accent)]/50"
                    >
                      <span className="inline-flex items-center gap-2">
                        <Layers size="0.875rem" className="text-amber-500" />
                        {t("megumin.memory.chunkMessages", { range: chunk.id })}
                      </span>
                      <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-normal text-[var(--muted-foreground)]">
                        <Clock size="0.75rem" />
                        {chunk.timestamp ? new Date(chunk.timestamp).toLocaleString() : ""}
                        <ChevronDown size="0.875rem" className={cn("transition-transform", open && "rotate-180")} />
                      </span>
                    </button>
                    {open ? (
                      <div className="flex flex-col gap-2 border-t border-[var(--border)]/60 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <MeguminHint>{t("megumin.memory.chunkEditHint")}</MeguminHint>
                          <button
                            type="button"
                            onClick={() => void deleteChunk(chunk)}
                            title={t("megumin.memory.deleteChunk")}
                            aria-label={t("megumin.memory.deleteChunk")}
                            className="mari-chrome-control mari-chrome-control--small mari-chrome-control--icon mari-chrome-control--danger shrink-0"
                          >
                            <Trash2 size="0.875rem" />
                          </button>
                        </div>
                        <ChunkEditor
                          rows={6}
                          value={chunk.summary ?? ""}
                          ariaLabel={t("megumin.memory.chunkMessages", { range: chunk.id })}
                          onSave={(v) => editChunk(chunk.id, v)}
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
            {newestFirstChunks.length > shortShown ? (
              <MeguminButton icon={<ChevronDown size="0.75rem" />} onClick={() => setShortShown((n) => n + PAGE_SIZE)}>
                {t("megumin.memory.loadMore", { count: newestFirstChunks.length - shortShown })}
              </MeguminButton>
            ) : null}
          </MeguminSection>

          <MeguminSection
            title={t("megumin.memory.vault")}
            icon={<Database size="0.9375rem" />}
            headerAction={
              <span className="inline-flex items-center rounded-full bg-[var(--accent)] px-2.5 py-1 text-xs text-[var(--muted-foreground)]">
                {t("megumin.memory.vaultCount", { count: vault.length })}
              </span>
            }
          >
            {/* Search, then the scanner and the wipe, on one line when there is room (Megumin's vault bar). */}
            <div className="flex flex-col gap-2 @xl:flex-row @xl:items-center">
              <div className="min-w-0 flex-1">
                <input
                  className={MEGUMIN_INPUT_CLASS}
                  value={search}
                  placeholder={t("megumin.memory.vaultSearch")}
                  aria-label={t("megumin.memory.vaultSearch")}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setVaultShown(PAGE_SIZE);
                  }}
                />
              </div>
              <MeguminRow className="shrink-0">
                <MeguminButton
                  icon={<Radar size="0.75rem" />}
                  title={t("megumin.memory.testScannerTitle")}
                  pending={running("memory.testScanner")}
                  disabled={!chatId}
                  onClick={() => void testScanner()}
                >
                  {t("megumin.memory.testScanner")}
                </MeguminButton>
                <MeguminButton
                  variant="danger"
                  icon={<Trash2 size="0.75rem" />}
                  title={t("megumin.memory.clearVaultTitle")}
                  onClick={() => void clearVault()}
                >
                  {t("megumin.memory.clearAll")}
                </MeguminButton>
              </MeguminRow>
            </div>

            {scanner ? (
              <div className="flex flex-col gap-3 rounded-lg border border-[var(--border)]/70 bg-[var(--background)]/50 p-3">
                <div className="flex items-center justify-between gap-2 text-sm font-semibold text-[var(--marinara-chat-chrome-panel-title)]">
                  <span>{t("megumin.memory.scannerResults")}</span>
                  <button
                    type="button"
                    onClick={() => setScanner(null)}
                    title={t("megumin.memory.scannerClose")}
                    aria-label={t("megumin.memory.scannerClose")}
                    className="mari-chrome-control mari-chrome-control--small mari-chrome-control--icon"
                  >
                    <X size="0.875rem" />
                  </button>
                </div>
                {scanner.engine === "semantic" && scanner.semanticCount > 0 ? (
                  <div className="rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-2.5 text-xs leading-relaxed">
                    <div className="text-[0.8125rem] font-bold text-purple-400">
                      {t("megumin.memory.scannerSemanticActive")}
                    </div>
                    <div className="text-[var(--muted-foreground)]">{t("megumin.memory.scannerSemanticDesc")}</div>
                  </div>
                ) : null}
                {scanner.engine === "tfidf" || scanner.semanticCount === 0 ? (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-xs leading-relaxed">
                    <div className="text-[0.8125rem] font-bold text-emerald-500">
                      {t("megumin.memory.scannerKeywords")}
                    </div>
                    <div className="text-[var(--muted-foreground)]">
                      {scanner.keywords.length ? scanner.keywords.join(", ") : t("megumin.memory.scannerNone")}
                    </div>
                  </div>
                ) : null}
                {scanner.matches.length === 0 ? (
                  <MeguminHint>{t("megumin.memory.scannerNoMatches")}</MeguminHint>
                ) : (
                  <>
                    <MeguminHint>{t("megumin.memory.scannerWillInject")}</MeguminHint>
                    {scanner.matches.map((m) => (
                      <div
                        key={m.id}
                        className={cn(
                          "flex flex-col gap-1 rounded-lg border bg-black/20 p-3",
                          scanner.engine === "semantic" ? "border-purple-500/35" : "border-blue-500/35",
                        )}
                      >
                        <div
                          className={cn(
                            "text-xs font-bold",
                            scanner.engine === "semantic" ? "text-purple-400" : "text-blue-400",
                          )}
                        >
                          {t("megumin.memory.scannerMatch", { score: m.score, id: m.id })}
                        </div>
                        {m.matchedWords?.length ? (
                          <div className="text-xs font-bold text-amber-500">
                            {t("megumin.memory.scannerTriggers", { words: m.matchedWords.join(", ") })}
                          </div>
                        ) : null}
                        <div className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md bg-black/20 px-3 py-2 text-[0.8125rem] leading-relaxed">
                          {m.text || m.summary}
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            ) : null}

            {vault.length === 0 ? (
              <MeguminHint>{t("megumin.memory.vaultEmpty", { count: workingLimit + shortTermLimit })}</MeguminHint>
            ) : (
              <div className="flex max-h-[36rem] flex-col gap-2 overflow-y-auto">
                {filteredVault.slice(0, vaultShown).map((chunk) => (
                  <div
                    key={chunk.id}
                    className="flex flex-col gap-2 rounded-lg border border-[var(--border)]/70 bg-black/10 p-3"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs font-bold tracking-wide text-blue-400">
                      <span>{t("megumin.memory.archiveLabel", { id: chunk.id })}</span>
                      <span className="inline-flex items-center gap-2">
                        {chunk.timestamp ? new Date(chunk.timestamp).toLocaleDateString() : ""}
                        <button
                          type="button"
                          onClick={() => void deleteArchive(chunk.id)}
                          title={t("megumin.memory.deleteArchive")}
                          aria-label={t("megumin.memory.deleteArchive")}
                          className="mari-chrome-control mari-chrome-control--small mari-chrome-control--icon mari-chrome-control--danger"
                        >
                          <Trash2 size="0.875rem" />
                        </button>
                      </span>
                    </div>
                    <ChunkEditor
                      rows={6}
                      value={chunk.text || chunk.summary || ""}
                      ariaLabel={t("megumin.memory.archiveLabel", { id: chunk.id })}
                      onSave={(v) => editArchive(chunk.id, v)}
                    />
                  </div>
                ))}
                {filteredVault.length > vaultShown ? (
                  <MeguminButton
                    icon={<ChevronDown size="0.75rem" />}
                    onClick={() => setVaultShown((n) => n + PAGE_SIZE)}
                  >
                    {t("megumin.memory.loadMore", { count: filteredVault.length - vaultShown })}
                  </MeguminButton>
                ) : null}
              </div>
            )}
          </MeguminSection>

          <MeguminPromptOverrides
            module="memoryCore"
            fields={[
              {
                key: "systemPrompt",
                label: t("megumin.memory.prompts.system"),
                hint: t("megumin.memory.prompts.systemHint"),
              },
              {
                key: "userPrompt",
                label: t("megumin.memory.prompts.user"),
                tokens: ["{{chatHistory}}", "{{targetLang}}"],
              },
              {
                key: "longTermTemplate",
                label: t("megumin.memory.prompts.longTerm"),
                tokens: ["{{archiveXML}}"],
              },
              {
                key: "shortTermTemplate",
                label: t("megumin.memory.prompts.shortTerm"),
                tokens: ["{{shortXML}}"],
              },
            ]}
          />
        </>
      ) : null}
    </div>
  );
}
