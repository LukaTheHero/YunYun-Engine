// ──────────────────────────────────────────────
// Megumin Suite: its window and the surfaces outside it
// ──────────────────────────────────────────────
// The settings window loads the first time it opens. The side panel, the
// Present Characters bar and the World State editor carry
// Megumin's renderer, so each loads only when it has something to show: Megumin
// mode on, a Roleplay chat open, and (for the side panel and bar) the side
// panel switched on in its tab.
import { lazy, Suspense, useEffect, useState } from "react";
import { useMeguminEnabled, useMeguminScope, useMeguminView } from "../../hooks/use-megumin";
import { openMeguminWindow } from "../../lib/megumin-tab-request";
import { useMeguminWindowStore } from "../../stores/megumin-window.store";
import { useUIStore } from "../../stores/ui.store";

const SidePanelHost = lazy(() =>
  import("./sidepanel/MeguminSidePanel").then((m) => ({ default: m.MeguminSidePanelHost })),
);
const PresentBar = lazy(() => import("./sidepanel/MeguminSidePanel").then((m) => ({ default: m.MeguminPresentBar })));
const WorldEditor = lazy(() => import("./cards/MeguminWorldEditor").then((m) => ({ default: m.MeguminWorldEditor })));
const MeguminWindow = lazy(() => import("./MeguminWindow").then((m) => ({ default: m.MeguminWindow })));

/** The World State editor, opened from the Blocks tab's "Editor" button. */
export const MEGUMIN_OPEN_WORLD_EDITOR_EVENT = "megumin:open-world-editor";

function useMeguminChatView() {
  const enabled = useMeguminEnabled();
  const scope = useMeguminScope();
  const inChat = enabled && scope.kind === "chat";
  const view = useMeguminView(scope, { enabled: inChat }).data;
  return inChat ? view : undefined;
}

/** Once, in the app shell. */
export function MeguminSidePanelMount() {
  const view = useMeguminChatView();
  if (!view?.sidePanel?.enabled) return null;
  return (
    <Suspense fallback={null}>
      <SidePanelHost />
    </Suspense>
  );
}

/** Above and below the Roleplay composer; draws only where its setting puts the bar. */
export function MeguminPresentBarMount({ placement }: { placement: "above" | "below" }) {
  const view = useMeguminChatView();
  if (!view?.sidePanel?.enabled || view.presentBar?.enabled === false) return null;
  return (
    <Suspense fallback={null}>
      <PresentBar placement={placement} />
    </Suspense>
  );
}

/** Listens for the Blocks tab's "Editor" button (the chat cards open their own). */
export function MeguminWorldEditorMount() {
  const [chatId, setChatId] = useState<string | null>(null);
  useEffect(() => {
    const open = (event: Event) => {
      const detail = (event as CustomEvent<{ chatId?: unknown } | null>).detail;
      if (detail && typeof detail.chatId === "string" && detail.chatId) setChatId(detail.chatId);
    };
    window.addEventListener(MEGUMIN_OPEN_WORLD_EDITOR_EVENT, open);
    return () => window.removeEventListener(MEGUMIN_OPEN_WORLD_EDITOR_EVENT, open);
  }, []);
  if (!chatId) return null;
  return (
    <Suspense fallback={null}>
      <WorldEditor chatId={chatId} onClose={() => setChatId(null)} />
    </Suspense>
  );
}

/** Once, in the app shell: the Megumin Suite window, loaded the first time it is opened and kept after. */
export function MeguminWindowMount() {
  const open = useMeguminWindowStore((s) => s.open);
  const setOpen = useMeguminWindowStore((s) => s.setOpen);
  const [opened, setOpened] = useState(open);
  if (open && !opened) setOpened(true);
  if (!opened) return null;
  return (
    <Suspense fallback={null}>
      <MeguminWindow open={open} onClose={() => setOpen(false)} />
    </Suspense>
  );
}

/** The old right panel "megumin" (a saved layout, an extension's button) opens the window instead. */
export function MeguminPanelRedirect() {
  useEffect(() => {
    useUIStore.getState().closeRightPanel();
    openMeguminWindow();
  }, []);
  return null;
}
