// ──────────────────────────────────────────────
// Megumin panel: "Advanced: Edit Prompts"
// ──────────────────────────────────────────────
// Megumin's reusable prompt-editing card (src/ui/promptEditor.js), used by the
// Story Director, Memory, Banned Phrases, NPC Bank and Images tabs. An override switch, one box
// per prompt with its own Reset, and Reset All. Like Megumin, every edit is
// pushed to every stored profile (core/sync.js syncPromptsGlobally), so a
// prompt rewrite follows the reader to every character.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Code, RotateCcw } from "lucide-react";
import { cn } from "../../../lib/utils";
import { useMeguminPanel } from "../megumin-panel-context";
import { MeguminButton, MeguminText, MeguminToggle } from "../MeguminControls";

/** The prompt modules Megumin keeps overrides for (prompts/defaults.js). */
export type MeguminPromptModule = "storyPlan" | "memoryCore" | "banList" | "imageGen" | "npcBank";

export interface MeguminPromptField {
  key: string;
  /** Translated label. */
  label: string;
  /** Translated hint, shown under the box. */
  hint?: string;
  /** Macro tokens the prompt understands, shown as code (data, not copy). */
  tokens?: string[];
}

/** Where a module keeps its overrides in the profile: storyPlan/memoryCore nest them, banList does not. */
function holderKeys(module: MeguminPromptModule) {
  return module === "banList"
    ? { prompts: "banListCustomPrompts", enabled: "banListCustomPromptsEnabled" }
    : { prompts: "customPrompts", enabled: "customPromptsEnabled" };
}

function holderOf(profile: Record<string, any>, module: MeguminPromptModule): Record<string, any> {
  if (module === "banList") return profile;
  if (!profile[module] || typeof profile[module] !== "object") profile[module] = {};
  return profile[module];
}

export function MeguminPromptOverrides({
  module,
  fields,
  title,
}: {
  module: MeguminPromptModule;
  fields: MeguminPromptField[];
  /** Translated card title; "Advanced: Edit Prompts" when left out. */
  title?: string;
}) {
  const { t } = useTranslation();
  const { profile, catalog, update, flush, run } = useMeguminPanel();
  const [open, setOpen] = useState(false);
  const keys = holderKeys(module);
  const defaults = ((catalog.defaultPrompts as Record<string, Record<string, string>> | undefined)?.[module] ??
    {}) as Record<string, string>;
  const holder = module === "banList" ? profile : ((profile[module] ?? {}) as Record<string, any>);
  const current = (
    holder[keys.prompts] && typeof holder[keys.prompts] === "object" ? holder[keys.prompts] : null
  ) as Record<string, string> | null;
  const enabled = holder[keys.enabled] === true;

  /** Megumin's syncPromptsGlobally: the value lands in every stored profile. */
  const syncEverywhere = (dataKey: string, value: unknown) => {
    flush()
      .then(() => run("prompts.sync", { module, key: dataKey, value }))
      .catch(() => {
        /* the action reports its own failure */
      });
  };

  const valueOf = (key: string) => {
    const v = current?.[key];
    return v === undefined || v === null || String(v).trim() === "" ? (defaults[key] ?? "") : String(v);
  };

  const saveField = (key: string, value: string) => {
    const next = { ...(current ?? structuredClone(defaults)), [key]: value };
    update((draft) => {
      holderOf(draft, module)[keys.prompts] = next;
    });
    syncEverywhere(keys.prompts, next);
  };

  const toggle = (on: boolean) => {
    update((draft) => {
      holderOf(draft, module)[keys.enabled] = on;
    });
    syncEverywhere(keys.enabled, on);
  };

  const resetAll = () => {
    update((draft) => {
      holderOf(draft, module)[keys.prompts] = null;
    });
    syncEverywhere(keys.prompts, null);
  };

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-[var(--border)]/70 bg-[var(--background)]/35 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--foreground)_8%,transparent)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full min-w-0 items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-[var(--marinara-chat-chrome-panel-title)] transition-colors hover:bg-[var(--accent)]/40"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--secondary)]/70 text-[var(--marinara-chat-chrome-button-text-active)] ring-1 ring-[var(--border)]">
          <Code size="0.9375rem" />
        </span>
        <span className="min-w-0 flex-1 truncate">{title ?? t("megumin.promptOverrides.title")}</span>
        <ChevronDown
          size="1rem"
          className={cn("shrink-0 text-[var(--muted-foreground)] transition-transform", open && "rotate-180")}
        />
      </button>
      {open ? (
        <div className="flex flex-col gap-4 border-t border-[var(--border)]/60 px-4 pb-4 pt-3">
          <MeguminToggle
            label={t("megumin.promptOverrides.enable")}
            help={t("megumin.promptOverrides.enableHelp")}
            checked={enabled}
            onChange={toggle}
          />
          <div className={cn("flex flex-col gap-4", !enabled && "pointer-events-none opacity-50")}>
            {fields.map((field) => (
              <div key={field.key} className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 text-[0.8125rem] font-medium text-[var(--marinara-chat-chrome-panel-title)]">
                    {field.label}
                  </span>
                  <button
                    type="button"
                    disabled={!enabled}
                    onClick={() => saveField(field.key, defaults[field.key] ?? "")}
                    title={t("megumin.promptOverrides.resetField")}
                    className="mari-chrome-control mari-chrome-control--small inline-flex items-center gap-1.5 text-xs"
                  >
                    <RotateCcw size="0.75rem" />
                    {t("megumin.promptOverrides.reset")}
                  </button>
                </div>
                <MeguminText
                  multiline
                  mono
                  rows={8}
                  disabled={!enabled}
                  value={valueOf(field.key)}
                  onChange={(value) => saveField(field.key, value)}
                />
                {field.hint || field.tokens?.length ? (
                  <div className="flex flex-wrap items-center gap-1.5 text-xs leading-relaxed text-[var(--marinara-chat-chrome-panel-muted)]">
                    {field.hint ? <span>{field.hint}</span> : null}
                    {field.tokens?.length ? (
                      <>
                        <span>{t("megumin.promptOverrides.tokens")}</span>
                        {field.tokens.map((token) => (
                          <code
                            key={token}
                            className="rounded bg-[var(--secondary)]/70 px-1.5 py-0.5 font-mono text-[0.6875rem] text-[var(--foreground)]"
                          >
                            {token}
                          </code>
                        ))}
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
            <div className="flex justify-end border-t border-[var(--border)]/50 pt-3">
              <MeguminButton onClick={resetAll} disabled={!enabled} icon={<RotateCcw size="0.75rem" />}>
                {t("megumin.promptOverrides.resetAll")}
              </MeguminButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
