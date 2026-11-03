// ──────────────────────────────────────────────
// Megumin card: the NPC Update and New NPC panes
// ──────────────────────────────────────────────
// Ports of features/npc/updateCard.js and features/npc/newCard.js.
//
// NPC Update: the registry draws the model's raw block, which includes
// operations that were refused. The pane is redrawn from the NPC Bank's
// changelog instead — what actually changed — with an Undo on each change and
// one for all of them. A reply with no changelog keeps the raw text.
//
// New NPC: "Open in NPC Bank" on top of the dossier card, or a note that the
// character is not banked yet.
import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ArrowLeftRight, BookUser, Minus, Pencil, Plus, RotateCcw } from "lucide-react";
import { openMeguminWindow } from "../../../lib/megumin-tab-request";
import type { MeguminView } from "../../../hooks/use-megumin";
import { CardButton, stopCardClick, useCardActions, usePaneHost } from "./megumin-card-kit";

interface NpcHistoryEntry {
  id: string;
  npc: string;
  label: string;
  op: string;
  text: string;
  msgIndex: number;
  at: number;
}

const OP_LOOK: Record<string, { icon: typeof Plus; color: string; word: "added" | "removed" | "replaced" }> = {
  "+": { icon: Plus, color: "#10b981", word: "added" },
  "-": { icon: Minus, color: "#ef4444", word: "removed" },
  "~": { icon: ArrowLeftRight, color: "#fbbf24", word: "replaced" },
};

const norm = (s: unknown) =>
  String(s || "")
    .replace(/\*\*/g, "")
    .trim()
    .toLowerCase();

type BankNpc = { name?: string; history?: NpcHistoryEntry[] };

function bankNpcs(view: MeguminView): BankNpc[] {
  const npcs = view.profile?.npcBank?.npcs;
  return Array.isArray(npcs) ? (npcs as BankNpc[]) : [];
}

/** Every change that arrived in one message, across all NPCs, oldest first (updates.js npcHistoryForMessage). */
function historyForMessage(view: MeguminView, msgIndex: number): NpcHistoryEntry[] {
  const out: NpcHistoryEntry[] = [];
  for (const npc of bankNpcs(view)) {
    for (const h of npc.history || []) if (h && h.msgIndex === msgIndex) out.push(h);
  }
  return out.sort((a, b) => a.at - b.at);
}

export function MeguminNpcUpdatePane({
  pane,
  chatId,
  msgIndex,
  view,
}: {
  pane: HTMLElement;
  chatId: string;
  msgIndex: number;
  view: MeguminView;
}) {
  const { t } = useTranslation();
  const { run, isRunning } = useCardActions(chatId);
  const entries = historyForMessage(view, msgIndex);
  // Undone here this session: once everything is gone, say so instead of showing the raw block again.
  const [undoneHere, setUndoneHere] = useState(false);
  const replaces = entries.length > 0 || undoneHere;
  const host = usePaneHost(replaces ? pane : null, "replace", "meg-npcupd flex flex-col gap-1.5");
  if (!host) return null;

  const undo = async (h: NpcHistoryEntry) => {
    const done = (await run("npc.undo", { entryId: h.id }, `undo:${h.id}`)) as {
      npc: string;
      label: string;
      alsoDropped: number;
    } | null;
    if (!done) return;
    setUndoneHere(true);
    // A later change to the same field had to go with it: saying so makes the undo trustworthy.
    toast.info(
      done.alsoDropped > 0
        ? t("megumin.cards.npcUpdate.restoredAlso", { npc: done.npc, label: done.label, count: done.alsoDropped })
        : t("megumin.cards.npcUpdate.restored", { npc: done.npc, label: done.label }),
    );
  };

  const undoAll = async () => {
    // Newest first, so undoing one never has to drop another in this set.
    for (const h of [...entries].reverse()) await run("npc.undo", { entryId: h.id }, "undo:all");
    setUndoneHere(true);
    toast.info(t("megumin.cards.npcUpdate.allUndone", { count: entries.length }));
  };

  return createPortal(
    <div onClick={stopCardClick} className="flex flex-col gap-1.5">
      {entries.length ? (
        entries.map((h) => {
          const look = OP_LOOK[h.op];
          const Icon = look?.icon ?? Pencil;
          const color = look?.color ?? "#94a3b8";
          return (
            <div key={h.id} className="flex flex-col gap-0.5 rounded-md border border-[var(--border)]/50 px-2 py-1.5">
              <div className="flex flex-wrap items-center gap-1.5 text-[0.6875rem]">
                <Icon size="0.6875rem" style={{ color }} />
                <b>{h.npc}</b>
                <span className="text-[var(--muted-foreground)]">{h.label}</span>
                <span style={{ color }}>{look ? t(`megumin.cards.npcUpdate.op.${look.word}`) : h.op}</span>
                <span className="flex-1" />
                <CardButton
                  onClick={() => void undo(h)}
                  pending={isRunning(`undo:${h.id}`)}
                  icon={<RotateCcw size="0.6875rem" />}
                  title={t("megumin.cards.npcUpdate.undoTitle")}
                >
                  {t("megumin.cards.npcUpdate.undo")}
                </CardButton>
              </div>
              <div className="whitespace-pre-wrap break-words text-[0.6875rem]">{h.text}</div>
            </div>
          );
        })
      ) : (
        <div className="text-[0.6875rem] italic text-[var(--muted-foreground)]">
          {t("megumin.cards.npcUpdate.empty")}
        </div>
      )}
      {entries.length > 1 ? (
        <CardButton
          onClick={() => void undoAll()}
          pending={isRunning("undo:all")}
          icon={<RotateCcw size="0.6875rem" />}
          className="self-start"
        >
          {t("megumin.cards.npcUpdate.undoAll", { count: entries.length })}
        </CardButton>
      ) : null}
    </div>,
    host,
  );
}

/** Opens the Megumin Suite window on the NPC Bank with that character in view. */
export function openMeguminNpcBank(index: number, name: string) {
  openMeguminWindow("npc");
  window.dispatchEvent(new CustomEvent("megumin:open-npc", { detail: { index, name } }));
}

export function MeguminNewNpcPane({
  pane,
  blockName,
  view,
}: {
  pane: HTMLElement;
  blockName: string;
  view: MeguminView;
}) {
  const { t } = useTranslation();
  // The dossier card the treatment drew; no card, no tools (newCard.js).
  const [name, setName] = useState<string | null>(null);
  useLayoutEffect(() => {
    const card = pane.querySelector(".meg-npc-card");
    setName(card ? card.getAttribute("data-npc-name") || blockName : null);
  }, [pane, blockName]);
  const host = usePaneHost(name !== null ? pane : null, "prepend", "meg-npc-tools mb-1.5");
  if (!host || name === null) return null;

  const idx = bankNpcs(view).findIndex((n) => norm(n.name) === norm(name));
  return createPortal(
    <div onClick={stopCardClick} className="flex flex-wrap items-center justify-end gap-1">
      {idx >= 0 ? (
        <CardButton
          onClick={() => openMeguminNpcBank(idx, name)}
          icon={<BookUser size="0.6875rem" />}
          title={t("megumin.cards.newNpc.openTitle", { name })}
        >
          {t("megumin.cards.newNpc.open")}
        </CardButton>
      ) : (
        <span className="text-[0.625rem] italic text-[var(--muted-foreground)]">
          {t("megumin.cards.newNpc.unbanked")}
        </span>
      )}
    </div>,
    host,
  );
}
