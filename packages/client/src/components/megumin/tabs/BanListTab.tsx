// ──────────────────────────────────────────────
// Megumin panel: Banned Phrases
// ──────────────────────────────────────────────
// Megumin's Dynamic Ban List (src/features/banlist/ui.js): the built-in list
// (on or off, full or short, its text editable once for the whole install),
// the AI Slop Detector that reads the chat for repeated phrasing and bans it,
// your own phrases (added by hand, imported, exported, cleared), and the
// detector's prompts.
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Ban, BookOpen, Cat, FileDown, FileUp, ListX, Pen, Plus, Radar, RotateCcw, Trash2, X } from "lucide-react";
import { cn } from "../../../lib/utils";
import { showConfirmDialog } from "../../../lib/app-dialogs";
import { downloadJsonFile } from "../../../lib/download-json";
import { Modal } from "../../ui/Modal";
import { useMeguminPanel } from "../megumin-panel-context";
import {
  MEGUMIN_INPUT_CLASS,
  MeguminButton,
  MeguminGrid,
  MeguminHint,
  MeguminNeedsChat,
  MeguminRow,
  MeguminSection,
} from "../MeguminControls";
import { MeguminPromptOverrides } from "./MeguminPromptOverrides";
import { Callout, Segmented, SwitchRow } from "./presetControls";

interface BuiltInList {
  /** The shared-fragment key the edited text is kept under (banlistBuiltIn / banlistBuiltInV11). */
  key: string;
  /** The shipped text. */
  original: string;
  /** The engine's name when the list is that engine's own (V11 Тайна). */
  name: string;
}

/** Megumin's editBuiltInList popup: the install-wide text of the built-in list. */
function BuiltInListEditor({ list, onClose }: { list: BuiltInList; onClose: () => void }) {
  const { t } = useTranslation();
  const { view, saveGlobal } = useMeguminPanel();
  const [text, setText] = useState(() => String(view.sharedFragments?.[list.key] || list.original));

  const save = () => {
    const isOriginal = text.replace(/\r\n/g, "\n").trim() === list.original.trim();
    const fragments = { ...(view.sharedFragments ?? {}) } as Record<string, unknown>;
    // Saving the original stores nothing, so a later update to the original still reaches this install.
    if (isOriginal || text.trim() === "") delete fragments[list.key];
    else fragments[list.key] = text;
    saveGlobal({ sharedFragments: fragments });
    if (!isOriginal && text.trim() === "") toast.info(t("megumin.banlist.builtInEmptied"));
    else toast.success(isOriginal ? t("megumin.banlist.builtInRestored") : t("megumin.banlist.builtInSaved"));
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={
        list.name ? t("megumin.banlist.builtInTitleNamed", { name: list.name }) : t("megumin.banlist.builtInTitle")
      }
      width="max-w-2xl"
    >
      <div className="flex flex-col gap-3">
        <MeguminHint>{t("megumin.banlist.builtInEditorHint")}</MeguminHint>
        <textarea
          className={cn(MEGUMIN_INPUT_CLASS, "min-h-72 resize-y font-mono text-[0.8125rem] leading-relaxed")}
          rows={18}
          value={text}
          aria-label={t("megumin.banlist.builtInTitle")}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <MeguminButton icon={<RotateCcw size="0.75rem" />} onClick={() => setText(list.original)}>
            {t("megumin.banlist.builtInPutBack")}
          </MeguminButton>
          <MeguminRow>
            <MeguminButton onClick={onClose}>{t("megumin.banlist.cancel")}</MeguminButton>
            <MeguminButton variant="primary" onClick={save}>
              {t("megumin.banlist.save")}
            </MeguminButton>
          </MeguminRow>
        </div>
      </div>
    </Modal>
  );
}

export function BanListTab() {
  const { t } = useTranslation();
  const { profile, chatId, update, flush, run, running, openTab } = useMeguminPanel();
  const banList = (Array.isArray(profile.banList) ? profile.banList : []) as string[];
  const [phrase, setPhrase] = useState("");
  const [editing, setEditing] = useState<BuiltInList | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scanning = running("banlist.scan");
  const loadingList = running("banlist.builtInList");

  const setList = (next: string[]) =>
    update((draft) => {
      draft.banList = next;
    });

  const add = () => {
    const value = phrase.trim();
    if (!value || banList.includes(value)) return;
    setList([...banList, value]);
    setPhrase("");
  };

  const clearAll = async () => {
    if (banList.length === 0) return;
    const ok = await showConfirmDialog({
      title: t("megumin.banlist.clearTitle"),
      message: t("megumin.banlist.clearConfirm"),
      confirmLabel: t("megumin.banlist.clearAll"),
      cancelLabel: t("megumin.banlist.cancel"),
      tone: "destructive",
    });
    if (!ok) return;
    setList([]);
    toast.info(t("megumin.banlist.cleared"));
  };

  const exportList = () => {
    if (banList.length === 0) {
      toast.warning(t("megumin.banlist.exportEmpty"));
      return;
    }
    void downloadJsonFile(banList, `banlist_${String(profile.id || "export")}.json`);
  };

  const importList = async (file: File) => {
    let imported: unknown;
    try {
      imported = JSON.parse(await file.text());
    } catch {
      toast.error(t("megumin.banlist.importParseFailed"));
      return;
    }
    if (!Array.isArray(imported)) {
      toast.error(t("megumin.banlist.importInvalid"));
      return;
    }
    const next = [...banList];
    let added = 0;
    for (const p of imported) {
      if (typeof p !== "string") continue;
      const value = p.trim();
      if (value.length > 0 && !next.includes(value)) {
        next.push(value);
        added++;
      }
    }
    if (added > 0) {
      setList(next);
      toast.success(t("megumin.banlist.imported", { count: added }));
    } else {
      toast.info(t("megumin.banlist.importNone"));
    }
  };

  const openBuiltInEditor = async () => {
    try {
      // Which list is the engine's (V11 keeps its own) is read from the saved profile.
      await flush();
      const list = (await run("banlist.builtInList")) as BuiltInList | null;
      if (list && typeof list.original === "string") setEditing(list);
    } catch {
      /* the action reports its own failure */
    }
  };

  /** The scan adds to the saved list, so a pending edit to it is saved first. */
  const scan = () => {
    flush()
      .then(() => run("banlist.scan"))
      .catch(() => {
        /* the action reports its own failure */
      });
  };

  const builtInOn = profile.banListBuiltIn !== false;
  const shortList = profile.banListShort === true;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--destructive)]/10 px-2.5 py-1 text-xs font-semibold text-[var(--destructive)] ring-1 ring-[var(--destructive)]/25">
          <Ban size="0.75rem" />
          {t("megumin.banlist.bannedCount", { count: banList.length })}
        </span>
      </div>

      <MeguminGrid layout="sections" className="items-stretch gap-4">
        <MeguminSection title={t("megumin.banlist.builtIn")} icon={<BookOpen size="0.875rem" />}>
          <SwitchRow
            label={t("megumin.banlist.useBuiltIn")}
            description={t("megumin.banlist.useBuiltInHelp")}
            checked={builtInOn}
            onChange={(on) =>
              update((draft) => {
                draft.banListBuiltIn = on;
              })
            }
          />
          <div className="flex flex-col gap-2">
            <MeguminHint>{t("megumin.banlist.whichList")}</MeguminHint>
            <div className="w-full @2xl:max-w-md">
              <Segmented
                options={[
                  { id: "full", label: t("megumin.banlist.fullList") },
                  { id: "short", label: t("megumin.banlist.shortList") },
                ]}
                value={shortList ? "short" : "full"}
                onChange={(id) =>
                  update((draft) => {
                    draft.banListShort = id === "short";
                  })
                }
              />
            </div>
          </div>
          {!shortList ? (
            <div>
              <MeguminButton
                icon={<Pen size="0.75rem" />}
                pending={loadingList}
                onClick={() => void openBuiltInEditor()}
              >
                {t("megumin.banlist.editFullList")}
              </MeguminButton>
            </div>
          ) : null}
        </MeguminSection>

        <MeguminSection
          title={t("megumin.banlist.slopDetector")}
          icon={<Radar size="0.875rem" />}
          headerAction={
            <MeguminButton
              variant="primary"
              icon={<Radar size="0.75rem" />}
              pending={scanning}
              disabled={!chatId}
              onClick={scan}
            >
              {scanning ? t("megumin.banlist.analyzing") : t("megumin.banlist.analyze")}
            </MeguminButton>
          }
        >
          {!chatId ? <MeguminNeedsChat /> : null}
          <div className="flex items-start gap-3">
            <Cat size="1rem" className="mt-0.5 shrink-0 text-rose-500" />
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="text-[0.8125rem] font-medium text-[var(--marinara-chat-chrome-panel-title)]">
                {t("megumin.banlist.backgroundWorker")}
              </span>
              <MeguminHint>{t("megumin.banlist.backgroundWorkerDesc")}</MeguminHint>
              <div className="pt-1">
                <MeguminButton onClick={() => openTab("chomusuke")} icon={<Cat size="0.75rem" />}>
                  {t("megumin.banlist.openChomusuke")}
                </MeguminButton>
              </div>
            </div>
          </div>
        </MeguminSection>
      </MeguminGrid>

      <div className="grid grid-cols-1 items-start gap-4 @4xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <MeguminSection title={t("megumin.banlist.addPhrase")} icon={<Plus size="0.875rem" />}>
          <div className="flex flex-wrap gap-2">
            <input
              className={cn(MEGUMIN_INPUT_CLASS, "min-w-0 flex-[1_1_12rem]")}
              value={phrase}
              placeholder={t("megumin.banlist.addPlaceholder")}
              aria-label={t("megumin.banlist.addPlaceholder")}
              onChange={(e) => setPhrase(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
            />
            <MeguminButton onClick={add} disabled={!phrase.trim()}>
              {t("megumin.banlist.add")}
            </MeguminButton>
          </div>
        </MeguminSection>

        <MeguminSection
          title={t("megumin.banlist.active")}
          icon={<ListX size="0.875rem" />}
          headerAction={
            <MeguminRow>
              <input
                ref={fileRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void importList(file);
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                title={t("megumin.banlist.import")}
                aria-label={t("megumin.banlist.import")}
                className="mari-chrome-control mari-chrome-control--small mari-chrome-control--icon"
              >
                <FileUp size="0.875rem" />
              </button>
              <button
                type="button"
                onClick={exportList}
                title={t("megumin.banlist.export")}
                aria-label={t("megumin.banlist.export")}
                className="mari-chrome-control mari-chrome-control--small mari-chrome-control--icon"
              >
                <FileDown size="0.875rem" />
              </button>
              <button
                type="button"
                onClick={() => void clearAll()}
                title={t("megumin.banlist.clearAll")}
                aria-label={t("megumin.banlist.clearAll")}
                className="mari-chrome-control mari-chrome-control--small mari-chrome-control--icon mari-chrome-control--danger"
              >
                <Trash2 size="0.875rem" />
              </button>
            </MeguminRow>
          }
        >
          {banList.length === 0 ? (
            <MeguminHint>{t("megumin.banlist.empty")}</MeguminHint>
          ) : (
            <div className="flex flex-wrap gap-2">
              {banList.map((p) => (
                <button
                  key={p}
                  type="button"
                  title={t("megumin.banlist.removePhrase")}
                  aria-label={t("megumin.banlist.removePhraseNamed", { phrase: p })}
                  onClick={() => setList(banList.filter((x) => x !== p))}
                  className="group inline-flex min-h-9 max-w-full items-center gap-2 rounded-lg bg-[var(--destructive)]/10 px-3 py-1.5 text-left text-xs text-[var(--foreground)] ring-1 ring-[var(--destructive)]/25 transition-colors hover:bg-[var(--destructive)]/20 @xl:min-h-8"
                >
                  <span className="min-w-0 break-words">{p}</span>
                  <X size="0.75rem" className="shrink-0 text-[var(--destructive)]" />
                </button>
              ))}
            </div>
          )}
        </MeguminSection>
      </div>

      <MeguminPromptOverrides
        module="banList"
        fields={[
          {
            key: "systemPrompt",
            label: t("megumin.banlist.prompts.system"),
            hint: t("megumin.banlist.prompts.systemHint"),
          },
          {
            key: "userPrompt",
            label: t("megumin.banlist.prompts.user"),
            tokens: ["{{chatHistory}}"],
          },
          {
            key: "thinkingPrompt",
            label: t("megumin.banlist.prompts.thinking"),
            hint: t("megumin.banlist.prompts.thinkingHint"),
          },
          {
            key: "injectionTemplate",
            label: t("megumin.banlist.prompts.injection"),
            tokens: ["{{banItems}}"],
          },
        ]}
      />

      <Callout tone="muted">{t("megumin.banlist.betaNote")}</Callout>

      {editing ? <BuiltInListEditor list={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}
