// ──────────────────────────────────────────────
// Megumin panel: shared controls
// ──────────────────────────────────────────────
// Every tab is drawn from these, on top of Settings' own primitives, so the
// Megumin panel looks and behaves like the rest of YunYun's panels.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { HelpTooltip } from "../ui/HelpTooltip";
import {
  SETTINGS_BUTTON_CLASS,
  SETTINGS_CHOICE_CARD_CLASS,
  SETTINGS_COMPACT_PRIMARY_BUTTON_CLASS,
  SETTINGS_PRIMARY_FULL_BUTTON_CLASS,
  SettingsSection,
  ToggleSetting,
} from "../panels/settings/SettingControls";

export const MEGUMIN_INPUT_CLASS =
  "w-full rounded-md border border-[var(--border)] bg-[var(--background)]/60 px-2 py-1.5 text-xs text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-60";

/** A titled group inside a tab (Settings' own section frame). Text is already translated. */
export function MeguminSection({
  title,
  description,
  help,
  icon,
  headerAction,
  children,
  tone,
}: {
  title: string;
  description?: ReactNode;
  help?: string;
  icon?: ReactNode;
  headerAction?: ReactNode;
  children: ReactNode;
  tone?: "default" | "danger";
}) {
  return (
    <SettingsSection
      title={title}
      description={description}
      help={help}
      icon={icon}
      headerAction={headerAction}
      tone={tone}
      contentClassName="flex flex-col gap-2"
    >
      {children}
    </SettingsSection>
  );
}

export function MeguminToggle({
  label,
  help,
  checked,
  onChange,
  disabled,
}: {
  label: ReactNode;
  help?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return <ToggleSetting label={label} help={help} checked={checked} onChange={onChange} disabled={disabled} />;
}

function FieldLabel({ label, help, htmlFor }: { label: ReactNode; help?: string; htmlFor?: string }) {
  return (
    <label
      htmlFor={htmlFor}
      className="inline-flex items-center gap-1 text-[0.6875rem] font-medium text-[var(--marinara-chat-chrome-panel-title)]"
    >
      {label}
      {help ? <HelpTooltip text={help} /> : null}
    </label>
  );
}

export interface MeguminOption {
  value: string;
  label: string;
  hint?: string;
  disabled?: boolean;
}

export function MeguminSelect({
  label,
  help,
  value,
  options,
  onChange,
  disabled,
}: {
  label?: ReactNode;
  help?: string;
  value: string;
  options: MeguminOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const known = options.some((o) => o.value === value);
  return (
    <div className="flex flex-col gap-1">
      {label ? <FieldLabel label={label} help={help} /> : null}
      <select
        className={MEGUMIN_INPUT_CLASS}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {!known && value ? <option value={value}>{value}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Text kept locally while typing and committed when typing pauses or the field loses focus, so a long
 * prompt is not saved (and the profile not copied) on every key.
 */
export function useDraftText(value: string, commit: (next: string) => void, delayMs = 600) {
  const [draft, setDraft] = useState(value);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitRef = useRef(commit);
  commitRef.current = commit;

  useEffect(() => {
    if (!dirty.current) setDraft(value);
  }, [value]);

  const flush = (next = draft) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!dirty.current) return;
    dirty.current = false;
    commitRef.current(next);
  };

  const change = (next: string) => {
    dirty.current = true;
    setDraft(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => flush(next), delayMs);
  };

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return { draft, change, flush: () => flush() };
}

export function MeguminText({
  label,
  help,
  value,
  onChange,
  placeholder,
  multiline,
  rows = 4,
  disabled,
  mono,
}: {
  label?: ReactNode;
  help?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  disabled?: boolean;
  mono?: boolean;
}) {
  const { draft, change, flush } = useDraftText(value ?? "", onChange);
  return (
    <div className="flex flex-col gap-1">
      {label ? <FieldLabel label={label} help={help} /> : null}
      {multiline ? (
        <textarea
          className={cn(MEGUMIN_INPUT_CLASS, "min-h-16 resize-y leading-relaxed", mono && "font-mono text-[0.6875rem]")}
          rows={rows}
          value={draft}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => change(e.target.value)}
          onBlur={flush}
        />
      ) : (
        <input
          className={MEGUMIN_INPUT_CLASS}
          value={draft}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => change(e.target.value)}
          onBlur={flush}
        />
      )}
    </div>
  );
}

export function MeguminNumber({
  label,
  help,
  value,
  onChange,
  min,
  max,
  step = 1,
  slider,
  disabled,
  suffix,
}: {
  label?: ReactNode;
  help?: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  slider?: boolean;
  disabled?: boolean;
  suffix?: string;
}) {
  const clamp = (n: number) => {
    if (!Number.isFinite(n)) return value;
    if (min !== undefined && n < min) return min;
    if (max !== undefined && n > max) return max;
    return n;
  };
  return (
    <div className="flex flex-col gap-1">
      {label ? (
        <div className="flex items-center justify-between gap-2">
          <FieldLabel label={label} help={help} />
          {slider ? (
            <span className="font-mono text-[0.6875rem] text-[var(--muted-foreground)]">
              {value}
              {suffix ?? ""}
            </span>
          ) : null}
        </div>
      ) : null}
      {slider ? (
        <input
          type="range"
          className="w-full accent-[var(--primary)]"
          value={value}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={(e) => onChange(clamp(Number(e.target.value)))}
        />
      ) : (
        <input
          type="number"
          className={MEGUMIN_INPUT_CLASS}
          value={Number.isFinite(value) ? value : ""}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={(e) => onChange(clamp(Number(e.target.value)))}
        />
      )}
    </div>
  );
}

/** One-of-N (or N-of-M with `multi`) choice cards: engines, CoTs, styles, add-ons. */
export function MeguminChoices({
  options,
  value,
  onChange,
  multi,
  columns = 1,
  disabled,
}: {
  options: Array<MeguminOption & { badge?: ReactNode; icon?: ReactNode }>;
  value: string | string[];
  onChange: (value: string) => void;
  multi?: boolean;
  columns?: 1 | 2;
  disabled?: boolean;
}) {
  const selected = (v: string) => (Array.isArray(value) ? value.includes(v) : value === v);
  return (
    <div
      className={cn("grid gap-1.5", columns === 2 ? "grid-cols-2" : "grid-cols-1")}
      role={multi ? "group" : "radiogroup"}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role={multi ? "checkbox" : "radio"}
          aria-checked={selected(o.value)}
          aria-pressed={selected(o.value)}
          disabled={disabled || o.disabled}
          onClick={() => onChange(o.value)}
          className={cn(SETTINGS_CHOICE_CARD_CLASS, "flex flex-col items-start gap-0.5 text-left")}
        >
          <span className="flex w-full items-center gap-1.5 font-medium">
            {o.icon}
            <span className="min-w-0 flex-1 truncate">{o.label}</span>
            {o.badge}
          </span>
          {o.hint ? (
            <span className="text-[0.625rem] leading-snug text-[var(--marinara-chat-chrome-panel-muted)]">
              {o.hint}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export function MeguminButton({
  children,
  onClick,
  pending,
  disabled,
  variant = "secondary",
  title,
  icon,
}: {
  children: ReactNode;
  onClick: () => void;
  pending?: boolean;
  disabled?: boolean;
  variant?: "secondary" | "primary" | "primaryFull" | "danger";
  title?: string;
  icon?: ReactNode;
}) {
  const className =
    variant === "primary"
      ? SETTINGS_COMPACT_PRIMARY_BUTTON_CLASS
      : variant === "primaryFull"
        ? SETTINGS_PRIMARY_FULL_BUTTON_CLASS
        : variant === "danger"
          ? cn(SETTINGS_BUTTON_CLASS, "mari-chrome-control--danger")
          : SETTINGS_BUTTON_CLASS;
  return (
    <button
      type="button"
      title={title}
      disabled={disabled || pending}
      onClick={onClick}
      className={cn(className, "inline-flex items-center justify-center gap-1.5")}
    >
      {pending ? <Loader2 size="0.75rem" className="animate-spin" /> : icon}
      {children}
    </button>
  );
}

/** Muted explanatory text inside a section. */
export function MeguminHint({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "warning" }) {
  return (
    <p
      className={cn(
        "text-[0.625rem] leading-relaxed",
        tone === "warning" ? "text-[var(--warning,#d97706)]" : "text-[var(--marinara-chat-chrome-panel-muted)]",
      )}
    >
      {children}
    </p>
  );
}

/** Shown in place of a chat-only control when no Roleplay chat is open. */
export function MeguminNeedsChat() {
  const { t } = useTranslation();
  return <MeguminHint tone="warning">{t("megumin.panel.needsChat")}</MeguminHint>;
}

/** A small row of buttons. */
export function MeguminRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-center gap-1.5", className)}>{children}</div>;
}
