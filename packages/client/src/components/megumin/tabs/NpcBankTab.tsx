// ──────────────────────────────────────────────
// Megumin panel: NPC Bank
// ──────────────────────────────────────────────
// Port of Megumin's src/features/npc/ui.js: the bank's switches, the scanner,
// the dossier field editor, the saved NPCs (edit, portrait, update, export,
// delete), import/export and the NPC prompts. The NPCs live in the profile
// (npcBank.npcs); scans, updates and portraits run on the server.
import { useCallback, useRef, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Anchor,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleX,
  Clock,
  Download,
  FileUp,
  Lock,
  Pencil,
  Plus,
  Radar,
  RefreshCw,
  RotateCcw,
  Trash2,
  Undo2,
  Upload,
  UserPlus,
  UserRoundSearch,
  WandSparkles,
  X,
} from "lucide-react";
import { cn } from "../../../lib/utils";
import { showChoiceDialog, showConfirmDialog, showPromptDialog } from "../../../lib/app-dialogs";
import { saveBlobToDevice } from "../../../lib/file-download";
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
  MeguminText,
  MeguminToggle,
  useDraftText,
} from "../MeguminControls";
import { MeguminPromptOverrides } from "./MeguminPromptOverrides";
import { useMeguminNpcFocus } from "../../../lib/megumin-tab-request";

type NpcField = {
  id: string;
  label: string;
  type?: "text" | "longtext" | "list";
  icon?: string;
  color?: string;
  persistent?: boolean;
  updatable?: boolean;
  placeholder?: string;
  fixed?: boolean;
  system?: "name" | "vitals" | "imageTags";
};

type NpcHistoryEntry = {
  id: string;
  msgIndex: number;
  at: number;
  field: string;
  label: string;
  op: string;
  text: string;
};

type Npc = Record<string, any> & {
  name: string;
  pfp?: string;
  imageOnly?: boolean;
  timestamp?: number;
  history?: NpcHistoryEntry[];
};

const FIELD_TYPES = ["text", "longtext", "list"] as const;

// A portrait is only drawn when it is exactly what an upload or a render stores: an image data URL.
const SAFE_PFP = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/;
const safePfp = (v: unknown) => (typeof v === "string" && SAFE_PFP.test(v) ? v : "");

/** Megumin's npcCleanImported: an imported NPC, reduced to the shape the bank expects. */
function cleanImported(raw: unknown): Npc | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(src)) {
    if (k === "history" || k === "pfp" || k === "imageOnly" || k === "timestamp" || k === "messageIndex") continue;
    if (typeof v === "string") out[k] = v;
    else if (typeof v === "number" || typeof v === "boolean") out[k] = String(v);
  }
  if (!String(out.name || "").trim()) return null;
  out.pfp = safePfp(src.pfp);
  out.imageOnly = src.imageOnly === true;
  out.timestamp = Number.isFinite(src.timestamp) ? src.timestamp : Date.now();
  out.messageIndex = Number.isInteger(src.messageIndex) && (src.messageIndex as number) >= 0 ? src.messageIndex : 0;
  out.history = Array.isArray(src.history)
    ? src.history.filter((e) => e && typeof e === "object" && !Array.isArray(e))
    : [];
  return out as Npc;
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  void saveBlobToDevice(blob, filename);
}

/** An uploaded portrait, shrunk to 256px on its long side, as a JPEG data URL (as Megumin stores it). */
function compressPortrait(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("image"));
      img.onload = () => {
        const max = 256;
        let w = img.width;
        let h = img.height;
        if (w > h) {
          h = Math.round((h * max) / w);
          w = max;
        } else {
          w = Math.round((w * max) / h);
          h = max;
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d")?.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function NpcBankTab() {
  const { t } = useTranslation();
  const { profile, catalog, chatId, update, flush, run, running } = useMeguminPanel();
  // An action that changes the bank on the server must not race an edit still waiting to be saved.
  const act = async (name: string, args?: Record<string, unknown>) => {
    await flush();
    return run(name, args);
  };
  const importRef = useRef<HTMLInputElement>(null);
  const nb = (profile.npcBank ?? {}) as Record<string, any>;
  const npcs: Npc[] = Array.isArray(nb.npcs) ? nb.npcs : [];
  const defaultFields = (catalog.npcDefaultFields ?? []) as NpcField[];
  const fieldList: NpcField[] = Array.isArray(nb.fields) ? nb.fields : [];
  // npcFields(): the profile's list, or the defaults when it has none.
  const activeFields = (fieldList.length ? fieldList : defaultFields).filter((f) => f && f.id && f.label);
  const bodyFields = activeFields.filter((f) => f.system !== "name" && f.system !== "vitals");
  const vitalsFields = activeFields.filter((f) => f.system === "vitals");

  const editBank = (change: (bank: Record<string, any>) => void) =>
    update((draft) => {
      const bank = (draft.npcBank ??= {});
      if (!Array.isArray(bank.npcs)) bank.npcs = [];
      change(bank);
    });

  const injectionLimit = Number.isFinite(Number(nb.injectionLimit)) ? Number(nb.injectionLimit) : 3;

  const importFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      toast.error(t("megumin.npc.import.parseFailed"));
      return;
    }
    if (!Array.isArray(parsed)) {
      toast.error(t("megumin.npc.import.badFormat"));
      return;
    }
    const data = parsed.map(cleanImported).filter((n): n is Npc => !!n);
    if (!data.length) {
      toast.error(t("megumin.npc.import.empty"));
      return;
    }
    const choice = await showChoiceDialog({
      title: t("megumin.npc.import.title"),
      message: t("megumin.npc.import.message", { count: data.length }),
      choices: [
        { key: "merge", label: t("megumin.npc.import.merge") },
        { key: "replace", label: t("megumin.npc.import.replace"), tone: "destructive" },
      ],
    });
    if (choice !== "merge" && choice !== "replace") return;
    editBank((bank) => {
      bank.npcs = choice === "merge" ? [...bank.npcs, ...data] : data;
    });
    toast.success(t("megumin.npc.import.done"));
  };

  const addNpc = async () => {
    const name = (
      await showPromptDialog({ title: t("megumin.npc.add.title"), message: t("megumin.npc.add.message") })
    )?.trim();
    if (!name) return;
    if (
      npcs.some(
        (n) =>
          String(n.name || "")
            .trim()
            .toLowerCase() === name.toLowerCase(),
      )
    ) {
      toast.warning(t("megumin.npc.add.exists", { name }));
      return;
    }
    await act("npc.add", { name }).catch(() => undefined);
  };

  const clearAll = async () => {
    if (!npcs.length) return;
    const ok = await showConfirmDialog({
      title: t("megumin.npc.clear.title"),
      message: t("megumin.npc.clear.message"),
      confirmLabel: t("megumin.npc.clear.confirm"),
      tone: "destructive",
    });
    if (ok) editBank((bank) => (bank.npcs = []));
  };

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.625rem] font-medium ring-1",
            nb.enabled
              ? "bg-emerald-500/10 text-emerald-500 ring-emerald-500/30"
              : "text-[var(--muted-foreground)] ring-[var(--border)]",
          )}
        >
          {nb.enabled ? <CircleCheck size="0.625rem" /> : <CircleX size="0.625rem" />}
          {nb.enabled ? t("megumin.npc.badge.on") : t("megumin.npc.badge.off")}
        </span>
      </div>
      <MeguminSection title={t("megumin.npc.enable.title")} description={t("megumin.npc.enable.desc")}>
        <MeguminToggle
          label={t("megumin.npc.enable.label")}
          checked={!!nb.enabled}
          onChange={(on) => editBank((bank) => (bank.enabled = on))}
        />
      </MeguminSection>

      {nb.enabled ? (
        <>
          <MeguminSection title={t("megumin.npc.injection.title")}>
            <MeguminToggle
              label={t("megumin.npc.injection.ooc")}
              help={t("megumin.npc.injection.oocHelp")}
              checked={!!nb.oocTrigger}
              onChange={(on) => editBank((bank) => (bank.oocTrigger = on))}
            />
            <MeguminToggle
              label={t("megumin.npc.injection.portraits")}
              help={t("megumin.npc.injection.portraitsHelp")}
              checked={!!nb.sendPortraitsToAi}
              onChange={(on) => editBank((bank) => (bank.sendPortraitsToAi = on))}
            />
            <MeguminNumber
              label={t("megumin.npc.injection.limit")}
              help={t("megumin.npc.injection.limitHelp")}
              value={injectionLimit}
              min={1}
              max={20}
              onChange={(v) => editBank((bank) => (bank.injectionLimit = Math.max(1, Math.trunc(v) || 3)))}
            />
            <MeguminText
              label={t("megumin.npc.injection.ignore")}
              help={t("megumin.npc.injection.ignoreHelp")}
              placeholder={t("megumin.npc.injection.ignorePlaceholder")}
              value={String(nb.ignoredNames || "")}
              onChange={(v) => editBank((bank) => (bank.ignoredNames = v))}
            />
          </MeguminSection>

          <MeguminSection title={t("megumin.npc.scanner.title")}>
            <MeguminNumber
              label={t("megumin.npc.scanner.depth")}
              value={Number(nb.scanDepth) || 60}
              min={10}
              onChange={(v) => editBank((bank) => (bank.scanDepth = !Number.isFinite(v) || v < 1 ? 60 : Math.trunc(v)))}
            />
            <MeguminHint>{t("megumin.npc.scanner.depthHint")}</MeguminHint>
            <MeguminHint tone="warning">{t("megumin.npc.scanner.depthWarning")}</MeguminHint>
          </MeguminSection>

          <FieldEditor fields={fieldList} defaults={defaultFields} editBank={editBank} />

          <MeguminSection
            title={t("megumin.npc.list.title", { count: npcs.length })}
            headerAction={
              <div className="flex items-center gap-1">
                <input
                  ref={importRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={importFile}
                />
                <button
                  type="button"
                  title={t("megumin.npc.list.import")}
                  aria-label={t("megumin.npc.list.import")}
                  onClick={() => importRef.current?.click()}
                  className="mari-chrome-control mari-chrome-control--small mari-chrome-control--icon text-emerald-500"
                >
                  <FileUp size="0.75rem" />
                </button>
                <button
                  type="button"
                  title={t("megumin.npc.list.exportAll")}
                  aria-label={t("megumin.npc.list.exportAll")}
                  onClick={() => downloadJson("megumin_npc_bank.json", npcs)}
                  className="mari-chrome-control mari-chrome-control--small mari-chrome-control--icon text-blue-500"
                >
                  <Download size="0.75rem" />
                </button>
              </div>
            }
          >
            <MeguminRow>
              <MeguminButton
                icon={<UserPlus size="0.75rem" />}
                pending={running("npc.add")}
                onClick={() => void addNpc()}
              >
                {t("megumin.npc.list.add")}
              </MeguminButton>
              <MeguminButton
                variant="primary"
                icon={<Radar size="0.75rem" />}
                disabled={!chatId}
                pending={running("npc.scan")}
                onClick={() => void act("npc.scan").catch(() => undefined)}
              >
                {running("npc.scan") ? t("megumin.npc.list.scanning") : t("megumin.npc.list.scan")}
              </MeguminButton>
              <MeguminButton
                variant="danger"
                icon={<Trash2 size="0.75rem" />}
                disabled={!npcs.length}
                onClick={() => void clearAll()}
              >
                {t("megumin.npc.list.clearAll")}
              </MeguminButton>
            </MeguminRow>
            {!chatId ? <MeguminNeedsChat /> : null}
            {npcs.length === 0 ? (
              <p className="py-4 text-center text-[0.6875rem] text-[var(--muted-foreground)]">
                {t("megumin.npc.list.empty")}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {[...npcs].reverse().map((npc, revIdx) => {
                  const idx = npcs.length - 1 - revIdx;
                  return (
                    <NpcCard
                      key={`${idx}:${npc.name}:${npc.timestamp ?? ""}`}
                      npc={npc}
                      index={idx}
                      bodyFields={bodyFields}
                      vitalsFields={vitalsFields}
                      editBank={editBank}
                    />
                  );
                })}
              </div>
            )}
          </MeguminSection>

          <MeguminPromptOverrides
            module="npcBank"
            title={t("megumin.npc.prompts.title")}
            fields={[
              {
                key: "systemPrompt",
                label: t("megumin.npc.prompts.systemPrompt"),
                hint: t("megumin.npc.prompts.systemPromptHint"),
              },
              {
                key: "userPrompt",
                label: t("megumin.npc.prompts.userPrompt"),
                tokens: ["{{npcText}}", "{{styleStr}}", "{{perspStr}}", "{{extraStr}}"],
              },
              {
                key: "thinkingPrompt",
                label: t("megumin.npc.prompts.thinkingPrompt"),
                hint: t("megumin.npc.prompts.thinkingPromptHint"),
              },
              {
                key: "dossierRules",
                label: t("megumin.npc.prompts.dossierRules"),
                hint: t("megumin.npc.prompts.dossierRulesHint"),
                tokens: ["{{template}}", "{{persistenceRule}}"],
              },
            ]}
          />
        </>
      ) : null}
    </>
  );
}

// ── The dossier field editor ─────────────────────────────────────────────
// Only the fields that are a matter of taste: the dossier's skeleton (`fixed`) is not listed.
function FieldEditor({
  fields,
  defaults,
  editBank,
}: {
  fields: NpcField[];
  defaults: NpcField[];
  editBank: (change: (bank: Record<string, any>) => void) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const editable = fields.map((f, realIndex) => ({ f, realIndex })).filter((x) => !x.f.fixed);

  const editField = (realIndex: number, change: (f: NpcField) => void) =>
    editBank((bank) => {
      const f = bank.fields?.[realIndex];
      if (f) change(f);
    });

  const remove = async (realIndex: number, label: string) => {
    const ok = await showConfirmDialog({
      title: t("megumin.npc.fields.removeTitle", { label }),
      message: t("megumin.npc.fields.removeMessage"),
      confirmLabel: t("megumin.npc.fields.removeConfirm"),
      tone: "destructive",
    });
    if (ok) editBank((bank) => bank.fields.splice(realIndex, 1));
  };

  const reset = async () => {
    const ok = await showConfirmDialog({
      title: t("megumin.npc.fields.resetTitle"),
      message: t("megumin.npc.fields.resetMessage"),
      confirmLabel: t("megumin.npc.fields.resetConfirm"),
    });
    if (!ok) return;
    editBank((bank) => (bank.fields = structuredClone(defaults)));
    toast.info(t("megumin.npc.fields.resetDone"));
  };

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)]/70 bg-[var(--background)]/35">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs font-semibold text-[var(--marinara-chat-chrome-panel-title)]"
      >
        {open ? <ChevronDown size="0.75rem" /> : <ChevronRight size="0.75rem" />}
        {t("megumin.npc.fields.title")}
      </button>
      {open ? (
        <div className="flex flex-col gap-2 border-t border-[var(--border)]/60 px-3 pb-3 pt-2.5">
          <MeguminHint>{t("megumin.npc.fields.intro")}</MeguminHint>
          <MeguminHint>
            <span className="font-semibold text-emerald-500">{t("megumin.npc.fields.lasting")}</span>{" "}
            {t("megumin.npc.fields.lastingHint")}{" "}
            <span className="font-semibold text-amber-500">{t("megumin.npc.fields.updatable")}</span>{" "}
            {t("megumin.npc.fields.updatableHint")}
          </MeguminHint>
          {!editable.length ? <MeguminHint>{t("megumin.npc.fields.none")}</MeguminHint> : null}
          {editable.map(({ f, realIndex }, i) => (
            <div
              key={`${f.id}:${realIndex}`}
              className="flex flex-col gap-1.5 rounded-md border border-[var(--border)]/60 p-2"
            >
              <div className="flex items-center gap-1">
                <div className="min-w-0 flex-1">
                  <MeguminText
                    value={f.label}
                    placeholder={t("megumin.npc.fields.labelPlaceholder")}
                    onChange={(v) => editField(realIndex, (x) => (x.label = v))}
                  />
                </div>
                <button
                  type="button"
                  disabled={i === 0}
                  title={t("megumin.npc.fields.moveUp")}
                  aria-label={t("megumin.npc.fields.moveUp")}
                  className="mari-chrome-control mari-chrome-control--small mari-chrome-control--icon"
                  onClick={() =>
                    editBank((bank) => {
                      // Swap with the previous EDITABLE field: the skeleton between them stays put.
                      const prev = editable[i - 1];
                      if (!prev) return;
                      const tmp = bank.fields[realIndex];
                      bank.fields[realIndex] = bank.fields[prev.realIndex];
                      bank.fields[prev.realIndex] = tmp;
                    })
                  }
                >
                  <ArrowUp size="0.75rem" />
                </button>
                <button
                  type="button"
                  title={t("megumin.npc.fields.remove")}
                  aria-label={t("megumin.npc.fields.remove")}
                  className="mari-chrome-control mari-chrome-control--small mari-chrome-control--icon mari-chrome-control--danger"
                  onClick={() => void remove(realIndex, f.label)}
                >
                  <X size="0.75rem" />
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <select
                  className={cn(MEGUMIN_INPUT_CLASS, "w-auto")}
                  value={f.type || "text"}
                  title={t("megumin.npc.fields.typeHelp")}
                  onChange={(e) => editField(realIndex, (x) => (x.type = e.target.value as NpcField["type"]))}
                >
                  {FIELD_TYPES.map((type) => (
                    <option key={type} value={type} title={t(`megumin.npc.fieldType.${type}.hint`)}>
                      {t(`megumin.npc.fieldType.${type}.label`)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  title={t("megumin.npc.fields.lastingTitle")}
                  onClick={() => editField(realIndex, (x) => (x.persistent = !x.persistent))}
                  className={cn(
                    "mari-chrome-control mari-chrome-control--small inline-flex items-center gap-1 text-[0.625rem]",
                    f.persistent ? "text-emerald-500" : "text-[var(--muted-foreground)]",
                  )}
                >
                  {f.persistent ? <Anchor size="0.625rem" /> : <Clock size="0.625rem" />}
                  {f.persistent ? t("megumin.npc.fields.lasting") : t("megumin.npc.fields.current")}
                </button>
                <button
                  type="button"
                  title={t("megumin.npc.fields.updatableTitle")}
                  onClick={() => editField(realIndex, (x) => (x.updatable = !x.updatable))}
                  className={cn(
                    "mari-chrome-control mari-chrome-control--small inline-flex items-center gap-1 text-[0.625rem]",
                    f.updatable ? "text-amber-500" : "text-[var(--muted-foreground)]",
                  )}
                >
                  {f.updatable ? <Pencil size="0.625rem" /> : <Lock size="0.625rem" />}
                  {f.updatable ? t("megumin.npc.fields.updatable") : t("megumin.npc.fields.fixed")}
                </button>
              </div>
              <MeguminText
                value={f.placeholder || ""}
                placeholder={t("megumin.npc.fields.placeholderPlaceholder")}
                onChange={(v) => editField(realIndex, (x) => (x.placeholder = v))}
              />
            </div>
          ))}
          <MeguminRow>
            <MeguminButton
              icon={<Plus size="0.75rem" />}
              onClick={() =>
                editBank((bank) => {
                  if (!Array.isArray(bank.fields)) bank.fields = [];
                  // Lasting and Fixed by default: the safe answers.
                  bank.fields.push({
                    id: `npc_f_${Date.now()}`,
                    label: t("megumin.npc.fields.newLabel"),
                    type: "text",
                    icon: "fa-circle-dot",
                    color: "#94a3b8",
                    persistent: true,
                    updatable: false,
                    placeholder: "",
                  });
                })
              }
            >
              {t("megumin.npc.fields.add")}
            </MeguminButton>
            <MeguminButton variant="danger" icon={<RotateCcw size="0.75rem" />} onClick={() => void reset()}>
              {t("megumin.npc.fields.reset")}
            </MeguminButton>
          </MeguminRow>
        </div>
      ) : null}
    </div>
  );
}

// ── One saved NPC ────────────────────────────────────────────────────────
function NpcCard({
  npc,
  index,
  bodyFields,
  vitalsFields,
  editBank,
}: {
  npc: Npc;
  index: number;
  bodyFields: NpcField[];
  vitalsFields: NpcField[];
  editBank: (change: (bank: Record<string, any>) => void) => void;
}) {
  const { t } = useTranslation();
  const { chatId, flush, run, running } = useMeguminPanel();
  const act = async (name: string, args?: Record<string, unknown>) => {
    await flush();
    return run(name, args);
  };
  const [open, setOpen] = useState(false);
  const [vitalsOpen, setVitalsOpen] = useState(false);
  const [portraitPrompt, setPortraitPrompt] = useState<string | null>(null);
  const [writingPortrait, setWritingPortrait] = useState(false);
  const [updating, setUpdating] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  // "Open in NPC Bank" on a chat card opens this dossier.
  const focusCard = useCallback(() => {
    setOpen(true);
    requestAnimationFrame(() => cardRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  }, []);
  useMeguminNpcFocus(String(npc.name ?? ""), index, focusCard);

  const pfp = safePfp(npc.pfp);
  const isMale = String(npc.sex || "")
    .trim()
    .toLowerCase()
    .startsWith("m");
  const accent = isMale ? "text-blue-500" : "text-rose-500";
  const ring = isMale ? "border-blue-500/25 hover:border-blue-500/50" : "border-rose-500/25 hover:border-rose-500/50";
  const header = isMale ? "from-blue-500/15 to-blue-700/5" : "from-rose-500/15 to-rose-700/5";
  const date = npc.timestamp ? new Date(npc.timestamp).toLocaleDateString() : "";
  const history = Array.isArray(npc.history) ? npc.history : [];

  const editNpc = (change: (n: Npc) => void) =>
    editBank((bank) => {
      const n = bank.npcs[index];
      if (n) change(n);
    });

  const rename = async () => {
    const next = (
      await showPromptDialog({
        title: t("megumin.npc.card.renameTitle"),
        message: t("megumin.npc.card.renameMessage"),
        defaultValue: npc.name,
      })
    )?.trim();
    if (next && next !== npc.name) editNpc((n) => (n.name = next));
  };

  const remove = async () => {
    const ok = await showConfirmDialog({
      title: t("megumin.npc.card.deleteTitle", { name: npc.name || t("megumin.npc.card.thisNpc") }),
      message: t("megumin.npc.card.deleteMessage"),
      confirmLabel: t("megumin.npc.card.deleteConfirm"),
      tone: "destructive",
    });
    if (ok) editBank((bank) => bank.npcs.splice(index, 1));
  };

  const toggleImageOnly = () => {
    const next = !npc.imageOnly;
    editNpc((n) => (n.imageOnly = next));
    toast.info(next ? t("megumin.npc.card.imageOnlyOn") : t("megumin.npc.card.imageOnlyOff"));
  };

  const upload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const data = await compressPortrait(file);
      editNpc((n) => (n.pfp = data));
      toast.success(t("megumin.npc.card.uploaded"));
    } catch {
      toast.error(t("megumin.npc.card.uploadFailed"));
    }
  };

  // Megumin writes the portrait prompt, lets you read and change it, then renders it.
  const generatePortrait = async () => {
    setWritingPortrait(true);
    try {
      const result = (await run("npc.portraitPrompt", { name: npc.name })) as { prompt?: string } | null;
      const prompt = String(result?.prompt || "").trim();
      if (prompt.length < 5) {
        toast.error(t("megumin.npc.card.portraitEmpty"));
        return;
      }
      setPortraitPrompt(prompt);
    } catch {
      /* the action toasts its own error */
    } finally {
      setWritingPortrait(false);
    }
  };

  const renderPortrait = async (prompt: string) => {
    setPortraitPrompt(null);
    if (!prompt.trim()) {
      toast.warning(t("megumin.npc.card.portraitPromptEmpty"));
      return;
    }
    await act("npc.portraitRender", { name: npc.name, prompt: prompt.trim() }).catch(() => undefined);
  };

  const forceUpdate = async () => {
    setUpdating(true);
    try {
      await act("npc.updateNow", { index });
    } catch {
      /* toasted */
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div
      ref={cardRef}
      className={cn("overflow-hidden rounded-xl border bg-[var(--background)]/40 transition-colors", ring)}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(!open);
          }
        }}
        className={cn("flex cursor-pointer select-none flex-col gap-1.5 bg-gradient-to-br px-2.5 py-2", header)}
      >
        <div className="flex min-w-0 items-center gap-1.5">
          {open ? (
            <ChevronDown size="0.625rem" className={accent} />
          ) : (
            <ChevronRight size="0.625rem" className={accent} />
          )}
          {pfp ? <img src={pfp} alt="" className="h-7 w-7 shrink-0 rounded-md object-cover" /> : null}
          <span className={cn("min-w-0 truncate text-[0.8125rem] font-bold", accent)}>{npc.name}</span>
          <button
            type="button"
            title={t("megumin.npc.card.rename")}
            aria-label={t("megumin.npc.card.rename")}
            onClick={(e) => {
              e.stopPropagation();
              void rename();
            }}
            className="shrink-0 p-0.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            <Pencil size="0.625rem" />
          </button>
          <button
            type="button"
            title={t("megumin.npc.card.vitalsTitle")}
            onClick={(e) => {
              e.stopPropagation();
              setVitalsOpen(true);
            }}
            className="inline-flex shrink-0 items-center gap-1 rounded bg-black/20 px-1.5 py-0.5 text-[0.5625rem] text-[var(--muted-foreground)]"
          >
            {t("megumin.npc.card.vitals", { age: npc.age || "?", sex: npc.sex || "?" })}
            <Pencil size="0.5rem" className="opacity-60" />
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-1.5 pl-4">
          <label
            onClick={(e) => e.stopPropagation()}
            title={t("megumin.npc.card.imageOnlyTitle")}
            className={cn(
              "inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-black/15 px-1.5 py-0.5 text-[0.5625rem] font-bold",
              npc.imageOnly ? "text-emerald-500" : "text-[var(--muted-foreground)]",
            )}
          >
            {t("megumin.npc.card.imageOnly")}
            <SettingsSwitch
              ariaLabel={t("megumin.npc.card.imageOnly")}
              checked={!!npc.imageOnly}
              onChange={toggleImageOnly}
            />
          </label>
          <div className="flex items-center gap-1">
            {date ? <span className="text-[0.5625rem] text-[var(--muted-foreground)]">{date}</span> : null}
            <button
              type="button"
              disabled={!chatId || updating}
              title={t("megumin.npc.card.update")}
              aria-label={t("megumin.npc.card.update")}
              onClick={(e) => {
                e.stopPropagation();
                void forceUpdate();
              }}
              className="p-1 text-amber-500 disabled:opacity-40"
            >
              <RefreshCw size="0.75rem" className={cn(updating && "animate-spin")} />
            </button>
            <button
              type="button"
              title={t("megumin.npc.card.export")}
              aria-label={t("megumin.npc.card.export")}
              onClick={(e) => {
                e.stopPropagation();
                const safe = String(npc.name || "npc")
                  .replace(/[^a-z0-9]/gi, "_")
                  .toLowerCase();
                downloadJson(`megumin_npc_${safe}.json`, [npc]);
              }}
              className="p-1 text-blue-500"
            >
              <Download size="0.75rem" />
            </button>
            <button
              type="button"
              title={t("megumin.npc.card.delete")}
              aria-label={t("megumin.npc.card.delete")}
              onClick={(e) => {
                e.stopPropagation();
                void remove();
              }}
              className="p-1 text-[var(--destructive)]"
            >
              <Trash2 size="0.75rem" />
            </button>
          </div>
        </div>
      </div>

      {open ? (
        <div className="flex flex-col gap-2.5 border-t border-[var(--border)]/40 p-2.5 sm:flex-row">
          <div className="flex shrink-0 flex-col items-center gap-1.5 sm:w-32">
            <div className="flex h-44 w-32 items-center justify-center overflow-hidden rounded-lg border border-[var(--border)] bg-black/30">
              {pfp ? (
                <img src={pfp} alt={npc.name} className="h-full w-full object-cover" />
              ) : (
                <UserRoundSearch size="2rem" className={accent} />
              )}
            </div>
            <div className={cn("text-center text-sm font-extrabold", accent)}>{npc.name}</div>
            <input ref={uploadRef} type="file" accept="image/*" className="hidden" onChange={upload} />
            <div className="flex w-full flex-col gap-1">
              <MeguminButton icon={<Upload size="0.6875rem" />} onClick={() => uploadRef.current?.click()}>
                {t("megumin.npc.card.upload")}
              </MeguminButton>
              <MeguminButton
                icon={<WandSparkles size="0.6875rem" />}
                disabled={!chatId}
                pending={writingPortrait || running("npc.portraitRender")}
                title={t("megumin.npc.card.generateTitle")}
                onClick={() => void generatePortrait()}
              >
                {t("megumin.npc.card.generate")}
              </MeguminButton>
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            {bodyFields.map((f) => (
              <NpcFieldBox
                key={f.id}
                field={f}
                value={String(npc[f.id] ?? "")}
                onCommit={(v) => editNpc((n) => (n[f.id] = v))}
              />
            ))}
            {history.length ? (
              <div className="mt-1 flex flex-col gap-1 rounded-md bg-[var(--background)]/40 p-1.5">
                <div className="text-[0.625rem] font-semibold text-[var(--marinara-chat-chrome-panel-title)]">
                  {t("megumin.npc.card.history")}
                </div>
                {history
                  .slice(-6)
                  .reverse()
                  .map((h) => (
                    <div key={h.id} className="flex items-start justify-between gap-1.5 text-[0.5625rem] leading-snug">
                      <span className="min-w-0 text-[var(--marinara-chat-chrome-panel-muted)]">
                        <b>{h.label}</b>{" "}
                        {h.op === "+"
                          ? t("megumin.npc.card.historyAdded")
                          : h.op === "-"
                            ? t("megumin.npc.card.historyRemoved")
                            : t("megumin.npc.card.historyReplaced")}
                        {h.text ? t("megumin.npc.card.historyText", { text: h.text }) : null}
                      </span>
                      <button
                        type="button"
                        title={t("megumin.npc.card.undoTitle")}
                        onClick={() => void act("npc.undo", { entryId: h.id }).catch(() => undefined)}
                        className="inline-flex shrink-0 items-center gap-0.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                      >
                        <Undo2 size="0.5625rem" />
                        {t("megumin.npc.card.undo")}
                      </button>
                    </div>
                  ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {vitalsOpen ? (
        <VitalsModal
          npc={npc}
          fields={vitalsFields}
          onClose={() => setVitalsOpen(false)}
          onSave={(values) => {
            editNpc((n) => {
              for (const f of vitalsFields) n[f.id] = (values[f.id] ?? "").trim();
            });
            setVitalsOpen(false);
          }}
        />
      ) : null}
      {portraitPrompt !== null ? (
        <PortraitPromptModal
          name={npc.name}
          prompt={portraitPrompt}
          onCancel={() => {
            setPortraitPrompt(null);
            toast.info(t("megumin.npc.card.portraitCancelled"));
          }}
          onRender={(prompt) => void renderPortrait(prompt)}
        />
      ) : null}
    </div>
  );
}

function NpcFieldBox({ field, value, onCommit }: { field: NpcField; value: string; onCommit: (v: string) => void }) {
  const tall = field.type === "longtext" || field.type === "list" || field.system === "imageTags";
  const { draft, change, flush } = useDraftText(value, onCommit);
  return (
    <div className="flex flex-col gap-0.5">
      <span className="inline-flex items-center gap-1 text-[0.625rem] font-semibold">
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: field.color || "#94a3b8" }}
        />
        {field.label}
      </span>
      <textarea
        className={cn(MEGUMIN_INPUT_CLASS, "resize-y text-[0.6875rem] leading-snug", tall ? "min-h-16" : "min-h-8")}
        rows={tall ? 3 : 1}
        value={draft}
        onChange={(e) => change(e.target.value)}
        onBlur={flush}
      />
    </div>
  );
}

function VitalsModal({
  npc,
  fields,
  onClose,
  onSave,
}: {
  npc: Npc;
  fields: NpcField[];
  onClose: () => void;
  onSave: (values: Record<string, string>) => void;
}) {
  const { t } = useTranslation();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.id, String(npc[f.id] ?? "")])),
  );
  return (
    <Modal open onClose={onClose} title={t("megumin.npc.vitals.title", { name: npc.name })} width="max-w-sm">
      <div className="flex flex-col gap-2.5">
        {fields.map((f) => (
          <label key={f.id} className="flex flex-col gap-1 text-[0.6875rem] text-[var(--muted-foreground)]">
            {f.label}
            <input
              className={MEGUMIN_INPUT_CLASS}
              value={values[f.id] ?? ""}
              placeholder={f.placeholder || ""}
              onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))}
            />
          </label>
        ))}
        <MeguminRow className="justify-end">
          <MeguminButton onClick={onClose}>{t("megumin.npc.vitals.cancel")}</MeguminButton>
          <MeguminButton variant="primary" onClick={() => onSave(values)}>
            {t("megumin.npc.vitals.save")}
          </MeguminButton>
        </MeguminRow>
      </div>
    </Modal>
  );
}

function PortraitPromptModal({
  name,
  prompt,
  onCancel,
  onRender,
}: {
  name: string;
  prompt: string;
  onCancel: () => void;
  onRender: (prompt: string) => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(prompt);
  return (
    <Modal open onClose={onCancel} title={t("megumin.npc.portrait.title", { name })} width="max-w-lg">
      <div className="flex flex-col gap-2.5">
        <p className="text-xs text-[var(--muted-foreground)]">{t("megumin.npc.portrait.message")}</p>
        <textarea
          className={cn(MEGUMIN_INPUT_CLASS, "min-h-36 resize-y font-mono text-[0.75rem]")}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <MeguminRow className="justify-end">
          <MeguminButton onClick={onCancel}>{t("megumin.npc.portrait.cancel")}</MeguminButton>
          <MeguminButton variant="primary" icon={<WandSparkles size="0.75rem" />} onClick={() => onRender(text)}>
            {t("megumin.npc.portrait.render")}
          </MeguminButton>
        </MeguminRow>
      </div>
    </Modal>
  );
}
