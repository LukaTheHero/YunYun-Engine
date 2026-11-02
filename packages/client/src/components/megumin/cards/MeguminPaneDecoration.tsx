// ──────────────────────────────────────────────
// Megumin card: one pane's decoration
// ──────────────────────────────────────────────
// What Megumin's features/blocks/chat.js adds on top of the generic block card,
// pane by pane. The card is Megumin's own DOM; the lead's message card mounts
// this once per decorated pane and it portals its React into that pane.
import type { ReactNode } from "react";
import type { MeguminCardInputs, MeguminView } from "../../../hooks/use-megumin";
import { MeguminWorldPane } from "./MeguminWorldPane";
import { MeguminNotebookPane } from "./MeguminNotebookPane";
import { MeguminBondsPane } from "./MeguminBondsPane";
import { MeguminNewNpcPane, MeguminNpcUpdatePane } from "./MeguminNpcPanes";

export interface MeguminPaneDecorationProps {
  /** The vendored card's `.meg-block-body[data-block-id=…]` element. */
  pane: HTMLElement;
  /** "world" | "notebook" | "notebookUpdate" | "bonds" | "sheet" | "npcUpdate" | "newNpc" */
  blockId: string;
  /** The pane's dossier name for repeating blocks (newNpc), else "". */
  blockName: string;
  chatId: string;
  messageId: string;
  /** The reply's index in the chat. */
  msgIndex: number;
  /** view.cards[messageId] */
  inputs: MeguminCardInputs;
  view: MeguminView;
}

/** The block ids that get a decoration (the panes chat.js decorates). */
export const MEGUMIN_DECORATED_BLOCKS = new Set([
  "world",
  "notebook",
  "notebookUpdate",
  "bonds",
  "sheet",
  "npcUpdate",
  "newNpc",
]);

export function MeguminPaneDecoration(props: MeguminPaneDecorationProps): ReactNode {
  const { pane, blockId, blockName, chatId, messageId, msgIndex, inputs, view } = props;
  switch (blockId) {
    case "world":
      return (
        <MeguminWorldPane pane={pane} chatId={chatId} messageId={messageId} info={inputs?.world ?? null} view={view} />
      );
    case "notebook":
    case "notebookUpdate":
      return (
        <MeguminNotebookPane
          pane={pane}
          chatId={chatId}
          messageId={messageId}
          msgIndex={msgIndex}
          info={inputs?.notebook ?? null}
          view={view}
        />
      );
    case "bonds":
    case "sheet":
      return <MeguminBondsPane pane={pane} chatId={chatId} kind={blockId} />;
    case "npcUpdate":
      return <MeguminNpcUpdatePane pane={pane} chatId={chatId} msgIndex={msgIndex} view={view} />;
    case "newNpc":
      return <MeguminNewNpcPane pane={pane} blockName={blockName} view={view} />;
    default:
      return null;
  }
}
