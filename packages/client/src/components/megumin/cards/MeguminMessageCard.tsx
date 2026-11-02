// ──────────────────────────────────────────────
// Megumin Suite: the block card under a Roleplay reply
// ──────────────────────────────────────────────
// The port of Megumin's chat decorator (features/blocks/chat.js). The card is
// Megumin's own, built by its renderer (buildBlocksCard) from the reply's blocks
// plus what the engine stored for the reply (the World State board as it stood
// after it, the blocks Chomusuke wrote); the reply text above it is drawn
// without the block tags. The per-pane tools (World State, Notebook, Bonds, NPC
// panes) are React, mounted into the card's panes.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  buildBlocksCard,
  meguminCardBlocks,
  setChomusukeStatus,
  setChomusukeStopHandler,
} from "@marinara-engine/shared/megumin/client";
import { useChatStore } from "../../../stores/chat.store";
import { useGenerate } from "../../../hooks/use-generate";
import { useMeguminAction, type MeguminCardInputs, type MeguminView } from "../../../hooks/use-megumin";
import { MEGUMIN_DECORATED_BLOCKS, MeguminPaneDecoration } from "./MeguminPaneDecoration";

const EMPTY_INPUTS: MeguminCardInputs = {
  index: -1,
  worldStateText: "",
  storeBlocks: {},
  pending: false,
  world: null,
  notebook: null,
};

/** Rolls that already played their arrival animation (chat.js meguminPlayedRolls). */
const playedRolls = new Set<string>();

/**
 * A clicked choice fills the composer (appended, never replacing what is half-typed); Shift sends it as is,
 * unless the message would lead with a slash (chat.js meguminApplyChoice).
 */
function useApplyChoice(chatId: string) {
  const { generate } = useGenerate();
  return useCallback(
    (text: string, { send = false }: { send?: boolean } = {}) => {
      const state = useChatStore.getState();
      const composer = document.querySelector<HTMLTextAreaElement>("textarea[data-chat-composer]");
      const ownComposer = composer?.dataset.chatId === chatId ? composer : null;
      const existing = String(ownComposer ? ownComposer.value : (state.inputDrafts.get(chatId) ?? "")).replace(
        /\s+$/,
        "",
      );
      const next = existing ? `${existing} ${text}` : text;
      if (send && !/^\s*\//.test(next) && state.streamingChatId !== chatId) {
        if (ownComposer) {
          ownComposer.value = "";
          ownComposer.dispatchEvent(new Event("input", { bubbles: true }));
        }
        state.setInputDraft(chatId, "");
        void generate({ chatId, connectionId: null, userMessage: next });
        return;
      }
      if (ownComposer) {
        ownComposer.value = next;
        ownComposer.dispatchEvent(new Event("input", { bubbles: true }));
        ownComposer.focus();
        ownComposer.setSelectionRange(next.length, next.length);
      }
      state.setInputDraft(chatId, next);
    },
    [chatId, generate],
  );
}

interface PaneRef {
  el: HTMLElement;
  blockId: string;
  name: string;
  key: string;
}

export function MeguminMessageCard({
  chatId,
  messageId,
  content,
  msgIndex: fallbackIndex,
  isLast,
  view,
}: {
  chatId: string;
  messageId: string;
  content: string;
  msgIndex: number;
  isLast: boolean;
  view: MeguminView;
}) {
  const { t } = useTranslation();
  const hostRef = useRef<HTMLDivElement>(null);
  const [panes, setPanes] = useState<PaneRef[]>([]);
  const applyChoice = useApplyChoice(chatId);
  const action = useMeguminAction({ kind: "chat", chatId });
  const inputs = view.cards[messageId] ?? EMPTY_INPUTS;
  // Megumin's own count of the reply (the server's chat), else where the chat list put it.
  const msgIndex = inputs.index >= 0 ? inputs.index : fallbackIndex;
  const busy = isLast && !!(view.chomusukeStatus?.running || inputs.pending);

  const blocks = useMemo(
    () => meguminCardBlocks(content, view.registry as Array<Record<string, any>>, inputs),
    [content, inputs, view.registry],
  );

  // Blocks Chomusuke wrote for this reply (not in its text): each gets a Read again button.
  const workerBlockIds = useMemo(() => {
    const ids = new Set<string>();
    for (const tag of Object.keys(inputs.storeBlocks || {})) {
      if (tag === "Notebook_Update") continue;
      const def = view.registry.find((r) => r.tag === tag);
      if (def) ids.add(def.id);
    }
    return ids;
  }, [inputs.storeBlocks, view.registry]);

  const choiceRef = useRef(applyChoice);
  choiceRef.current = applyChoice;

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.replaceChildren();
    if (!blocks.length) {
      setPanes([]);
      return;
    }
    const card = buildBlocksCard(blocks, {
      msgIndex,
      omit: view.omit,
      statFields: view.statFields,
      onChoice: (text: string, opts?: { send?: boolean }) => choiceRef.current(text, opts),
      // Only the newest reply's roll animates, and only the first time it is drawn.
      shouldAnimate: isLast
        ? (block: { body?: string }) => {
            const key = `${messageId}:${String(block.body || "").slice(0, 120)}`;
            if (playedRolls.has(key)) return false;
            if (playedRolls.size > 400) playedRolls.clear();
            playedRolls.add(key);
            return true;
          }
        : null,
    }) as HTMLElement;
    host.appendChild(card);
    const found: PaneRef[] = [];
    card.querySelectorAll<HTMLElement>(".meg-block-body[data-block-id]").forEach((el) => {
      const blockId = el.getAttribute("data-block-id") || "";
      const key = el.dataset.key || blockId;
      const name = key.includes(":") ? key.slice(key.indexOf(":") + 1) : "";
      found.push({ el, blockId, name, key });
    });
    setPanes(found);
  }, [blocks, isLast, messageId, msgIndex, view.omit, view.statFields]);

  // The Chomusuke indicator on the newest card (body.meg-chomu-busy in SillyTavern).
  useEffect(() => {
    const card = hostRef.current?.querySelector("[data-meg-blocks]");
    card?.classList.toggle("meg-chomu-busy", busy);
  }, [busy, panes]);

  useEffect(() => {
    if (!isLast) return;
    setChomusukeStatus(view.chomusukeStatus ?? { running: null, waiting: 0 });
    setChomusukeStopHandler(() => action.mutate({ action: "chomusuke.stop" }));
  }, [action, isLast, view.chomusukeStatus]);

  const readAgain = (pending: boolean) => (
    <button
      type="button"
      className="meg-bonds-all meg-blocks-reread"
      disabled={pending || action.isPending}
      title={t("megumin.cards.readAgainTitle")}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        action.mutate({ action: "readAgain", args: { kind: "blocks", messageId } });
      }}
    >
      {pending ? t("megumin.cards.writing") : t("megumin.cards.readAgain")}
    </button>
  );

  return (
    <div data-component="MeguminMessageCard" className="meg-card-host">
      <div ref={hostRef} />
      {panes.map((pane) =>
        MEGUMIN_DECORATED_BLOCKS.has(pane.blockId) ? (
          <MeguminPaneDecoration
            key={`${pane.key}:${pane.blockId}`}
            pane={pane.el}
            blockId={pane.blockId}
            blockName={pane.name}
            chatId={chatId}
            messageId={messageId}
            msgIndex={msgIndex}
            inputs={inputs}
            view={view}
          />
        ) : workerBlockIds.has(pane.blockId) ? (
          <ReadAgainPortal key={`reread:${pane.key}`} pane={pane.el}>
            {readAgain(inputs.pending)}
          </ReadAgainPortal>
        ) : null,
      )}
    </div>
  );
}

/** A tools row at the top of a pane (chat.js blocksDecorateReadAgain). */
function ReadAgainPortal({ pane, children }: { pane: HTMLElement; children: ReactNode }) {
  const [row, setRow] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const el = document.createElement("div");
    el.className = "meg-bonds-tools";
    pane.prepend(el);
    setRow(el);
    return () => el.remove();
  }, [pane]);
  return row ? createPortal(children, row) : null;
}
