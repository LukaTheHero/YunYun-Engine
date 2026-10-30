// ──────────────────────────────────────────────
// Megumin Suite editor: Settings (install-wide: utility model, prefills, save mode, about)
// ──────────────────────────────────────────────
import { useTranslation } from "react-i18next";
import { ExternalLink } from "lucide-react";
import { NON_CHAT_PROVIDERS, type APIProvider, type MeguminSettings } from "@marinara-engine/shared";
import { useConnections } from "../../../hooks/use-connections";
import { MEGUMIN_SOURCE_URL } from "../megumin-assets";
import { MeguminBadge, MeguminCallout, MeguminHeading, MeguminToggle } from "../megumin-ui";
import type { MeguminEditor } from "../use-megumin-settings";

type ConnectionRow = { id?: unknown; name?: unknown; provider?: unknown };

export function SettingsTab({ editor, settings }: { editor: MeguminEditor; settings: MeguminSettings }) {
  const { t } = useTranslation();
  const { data: connections = [] } = useConnections();
  const global = settings.global;
  // The task runner skips image, video and other non-chat connections, so they are not offered.
  const chatConnections = (connections as ConnectionRow[]).filter(
    (row): row is { id: string; name?: unknown; provider?: unknown } =>
      typeof row.id === "string" && !NON_CHAT_PROVIDERS.includes(row.provider as APIProvider),
  );
  const saveGlobal = (patch: Partial<MeguminSettings["global"]>) =>
    void editor.saveSettings((current) => ({ global: { ...current.global, ...patch } }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <MeguminHeading description={t("megumin.settings.description")}>{t("megumin.settings.title")}</MeguminHeading>
        <MeguminBadge tone="accent">{t("megumin.settings.savedGlobally")}</MeguminBadge>
      </div>

      <div className="flex flex-col gap-2">
        <MeguminHeading>{t("megumin.settings.tasks")}</MeguminHeading>
        <label className="mari-editor-panel flex flex-col gap-1.5 p-3 text-xs">
          <span className="font-medium">{t("megumin.settings.utility.label")}</span>
          <span className="text-[0.6875rem] text-[var(--marinara-editor-muted)]">
            {t("megumin.settings.utility.help")}
          </span>
          <select
            value={global.utilityConnectionId ?? ""}
            onChange={(event) => saveGlobal({ utilityConnectionId: event.target.value || null })}
            className="mari-editor-field px-2.5 py-2 text-xs"
          >
            <option value="">{t("megumin.settings.utility.agentsDefault")}</option>
            {chatConnections.map((connection) => (
              <option key={connection.id} value={connection.id}>
                {typeof connection.name === "string" && connection.name ? connection.name : connection.id}
              </option>
            ))}
            {global.utilityConnectionId && !chatConnections.some((row) => row.id === global.utilityConnectionId) && (
              <option value={global.utilityConnectionId}>{t("megumin.settings.utility.missing")}</option>
            )}
          </select>
        </label>
        <MeguminCallout>{t("megumin.settings.samplers")}</MeguminCallout>
        <MeguminToggle
          label={t("megumin.settings.prefill.label")}
          description={t("megumin.settings.prefill.help")}
          checked={global.enableUtilityPrefill}
          onChange={(enableUtilityPrefill) => saveGlobal({ enableUtilityPrefill })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <MeguminHeading>{t("megumin.settings.data")}</MeguminHeading>
        <label className="mari-editor-panel flex flex-col gap-1.5 p-3 text-xs">
          <span className="font-medium">{t("megumin.settings.saveMode.label")}</span>
          <span className="text-[0.6875rem] text-[var(--marinara-editor-muted)]">
            {t("megumin.settings.saveMode.help")}
          </span>
          <select
            value={global.saveMode}
            onChange={(event) => saveGlobal({ saveMode: event.target.value === "chat" ? "chat" : "character" })}
            className="mari-editor-field px-2.5 py-2 text-xs"
          >
            <option value="character">{t("megumin.settings.saveMode.character")}</option>
            <option value="chat">{t("megumin.settings.saveMode.chat")}</option>
          </select>
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <MeguminHeading>{t("megumin.settings.about")}</MeguminHeading>
        <div className="mari-editor-panel flex flex-col gap-1 p-3 text-xs">
          <span className="text-sm font-semibold">{t("megumin.settings.aboutTitle")}</span>
          <span>{t("megumin.settings.aboutBy")}</span>
          <span className="text-[0.6875rem] text-[var(--marinara-editor-muted)]">
            {t("megumin.presetCard.license")}
          </span>
          <a
            href={MEGUMIN_SOURCE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 self-start underline underline-offset-2"
          >
            {t("megumin.settings.github")}
            <ExternalLink size="0.75rem" aria-hidden="true" />
          </a>
        </div>
      </div>
    </div>
  );
}
