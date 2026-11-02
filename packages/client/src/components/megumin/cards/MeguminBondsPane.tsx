// ──────────────────────────────────────────────
// Megumin card: tools on the Bonds and Character Sheet panes
// ──────────────────────────────────────────────
// Port of bondsDecoratePane / sheetDecoratePane (features/bonds/overview.js):
// "All characters" and "Edit" on top of a reply's Bonds pane, "Edit sheet" on
// top of its Character Sheet pane.
import { useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Pencil, Users } from "lucide-react";
import { CardButton, stopCardClick, usePaneHost } from "./megumin-card-kit";
import { MeguminBondsOverview, MeguminStatsEditor } from "./MeguminStatsEditor";

export function MeguminBondsPane({
  pane,
  chatId,
  kind,
}: {
  pane: HTMLElement;
  chatId: string;
  kind: "bonds" | "sheet";
}) {
  const { t } = useTranslation();
  const host = usePaneHost(pane, "prepend", "meg-bonds-tools-host mb-1.5");
  const [open, setOpen] = useState<null | "overview" | "bonds" | "sheet">(null);

  return (
    <>
      {host
        ? createPortal(
            <div onClick={stopCardClick} className="flex flex-wrap items-center justify-end gap-1">
              {kind === "bonds" ? (
                <>
                  <CardButton
                    onClick={() => setOpen("overview")}
                    icon={<Users size="0.6875rem" />}
                    title={t("megumin.bonds.allTitle")}
                  >
                    {t("megumin.bonds.all")}
                  </CardButton>
                  <CardButton
                    onClick={() => setOpen("bonds")}
                    icon={<Pencil size="0.6875rem" />}
                    title={t("megumin.bonds.editTitle")}
                  >
                    {t("megumin.bonds.edit")}
                  </CardButton>
                </>
              ) : (
                <CardButton
                  onClick={() => setOpen("sheet")}
                  icon={<Pencil size="0.6875rem" />}
                  title={t("megumin.bonds.editSheetTitle")}
                >
                  {t("megumin.bonds.editSheet")}
                </CardButton>
              )}
            </div>,
            host,
          )
        : null}
      {open === "overview" ? (
        <MeguminBondsOverview chatId={chatId} onClose={() => setOpen(null)} onEdit={() => setOpen("bonds")} />
      ) : null}
      {open === "bonds" || open === "sheet" ? (
        <MeguminStatsEditor chatId={chatId} initialView={open} onClose={() => setOpen(null)} />
      ) : null}
    </>
  );
}
