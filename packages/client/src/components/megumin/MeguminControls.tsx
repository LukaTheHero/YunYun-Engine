// ──────────────────────────────────────────────
// Megumin Suite window: shared controls
// ──────────────────────────────────────────────
// Every tab is drawn from these, on top of Settings' own primitives, so the
// Megumin Suite window looks and behaves like the rest of YunYun. The window is
// wide, so the type is a step up from the dense right panels, and the layout
// helpers (MeguminGrid, a section's own container) put cards in columns when
// there is room and in one column on a phone.
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
  SettingsSwitch,
} from "../panels/settings/SettingControls";

export const MEGUMIN_INPUT_CLASS =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--background)]/60 px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-60";

/**
 * Column layouts that follow the room they get: the tab's width, or the width of the section they sit in.
 * `cards` for pickable cards and list items, `sections` for sections side by side, `fields` for form fields.
 */
const GRID_LAYOUTS = {
  cards: "grid-cols-1 @xl:grid-cols-2 @4xl:grid-cols-3",
  sections: "grid-cols-1 @4xl:grid-cols-2",
  fields: "grid-cols-1 @lg:grid-cols-2",
} as const;

export function MeguminGrid({
  layout = "cards",
  className,
  children,
}: {
  layout?: keyof typeof GRID_LAYOUTS;
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn("grid items-start gap-3", GRID_LAYOUTS[layout], className)}>{children}</div>;
}

/** A titled group inside a tab. Text is already translated. Its body is a container, so grids inside fit it. */
export function MeguminSection({
  title,
  description,
  help,
  icon,
  headerAction,
  children,
  tone = "default",
  className,
  contentClassName,
}: {
  title: string;
  description?: ReactNode;
  help?: string;
  icon?: ReactNode;
  headerAction?: ReactNode;
  children: ReactNode;
  tone?: "default" | "danger";
  className?: string;
  contentClassName?: string;
}) {
  const danger = tone === "danger";
  return (
    <section
      className={cn(
        "min-w-0 overflow-hidden rounded-xl border shadow-[inset_0_1px_0_color-mix(in_srgb,var(--foreground)_8%,transparent)]",
        danger
          ? "border-[var(--destructive)]/30 bg-[var(--destructive)]/5"
          : "border-[var(--border)]/70 bg-[var(--background)]/35",
        className,
      )}
    >
      <div className="flex flex-wrap items-start gap-3 px-4 py-3">
        {icon ? (
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1",
              danger
                ? "bg-[var(--destructive)]/10 text-[var(--destructive)] ring-[var(--destructive)]/25"
                : "bg-[var(--secondary)]/70 text-[var(--marinara-chat-chrome-button-text-active)] ring-[var(--border)]",
            )}
          >
            {icon}
          </span>
        ) : null}
        <div className="min-w-0 flex-1 basis-48">
          <h3
            className={cn(
              "inline-flex items-center gap-1.5 text-sm font-semibold",
              danger ? "text-[var(--destructive)]" : "text-[var(--marinara-chat-chrome-panel-title)]",
            )}
          >
            {title}
            {help ? <HelpTooltip text={help} /> : null}
          </h3>
          {description ? (
            <div className="mt-0.5 text-xs leading-relaxed text-[var(--marinara-chat-chrome-panel-muted)]">
              {description}
            </div>
          ) : null}
        </div>
        {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
      </div>
      <div
        className={cn(
          "@container flex flex-col gap-3 border-t border-[var(--border)]/60 px-4 pb-4 pt-3",
          contentClassName,
        )}
      >
        {children}
      </div>
    </section>
  );
}

/**
 * A tab's master switch, drawn as Megumin's highlighted bar ("Enable Memory Core"): what it turns on, what that
 * does, and the switch. Tinted while on.
 */
export function MeguminFeatureBar({
  title,
  description,
  icon,
  checked,
  onChange,
  disabled,
  tone = "default",
  ariaLabel,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  /** The switch's own name when `title` changes with its state ("Images off" / "Images on"). */
  ariaLabel?: string;
  /** `danger` tints red while on, for a switch that takes guard rails away. */
  tone?: "default" | "danger";
}) {
  return (
    <SettingsSwitch
      label={
        <span className="inline-flex items-center gap-2 font-semibold text-[var(--marinara-chat-chrome-panel-title)]">
          {icon}
          {title}
        </span>
      }
      description={description}
      checked={checked}
      onChange={onChange}
      disabled={disabled}
      labelPosition="start"
      className={cn(
        "justify-between gap-4 rounded-xl border px-4 py-3",
        !checked
          ? "border-[var(--border)]/70 bg-[var(--background)]/35"
          : tone === "danger"
            ? "border-[var(--destructive)]/45 bg-[var(--destructive)]/10 hover:bg-[var(--destructive)]/15"
            : "border-amber-500/45 bg-amber-500/10 hover:bg-amber-500/15",
      )}
      labelClassName="text-sm"
      descriptionClassName="text-xs"
      inputAriaLabel={ariaLabel}
    />
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
  return (
    <SettingsSwitch
      label={label}
      help={help}
      checked={checked}
      onChange={onChange}
      disabled={disabled}
      labelPosition="start"
      className="justify-between gap-3 p-2"
      labelClassName="text-[0.8125rem]"
    />
  );
}

function FieldLabel({ label, help, htmlFor }: { label: ReactNode; help?: string; htmlFor?: string }) {
  return (
    <label
      htmlFor={htmlFor}
      className="inline-flex items-center gap-1 text-[0.8125rem] font-medium text-[var(--marinara-chat-chrome-panel-title)]"
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
    <div className="flex flex-col gap-1.5">
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
    <div className="flex flex-col gap-1.5">
      {label ? <FieldLabel label={label} help={help} /> : null}
      {multiline ? (
        <textarea
          className={cn(MEGUMIN_INPUT_CLASS, "min-h-20 resize-y leading-relaxed", mono && "font-mono text-[0.8125rem]")}
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
    <div className="flex flex-col gap-1.5">
      {label ? (
        <div className="flex items-center justify-between gap-2">
          <FieldLabel label={label} help={help} />
          {slider ? (
            <span className="font-mono text-xs text-[var(--muted-foreground)]">
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

/** One-of-N (or N-of-M with `multi`) choice cards: engines, CoTs, styles, add-ons. More columns as room allows. */
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
      className={cn(
        "grid gap-2",
        columns === 2
          ? "grid-cols-2 @2xl:grid-cols-3 @4xl:grid-cols-4"
          : "grid-cols-1 @xl:grid-cols-2 @4xl:grid-cols-3",
      )}
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
          className={cn(SETTINGS_CHOICE_CARD_CLASS, "flex flex-col items-start gap-1 text-left text-[0.8125rem]")}
        >
          <span className="flex w-full items-center gap-1.5 font-semibold">
            {o.icon}
            <span className="min-w-0 flex-1 truncate">{o.label}</span>
            {o.badge}
          </span>
          {o.hint ? (
            <span className="text-xs leading-snug text-[var(--marinara-chat-chrome-panel-muted)]">{o.hint}</span>
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
  className: extraClassName,
}: {
  children: ReactNode;
  onClick: () => void;
  pending?: boolean;
  disabled?: boolean;
  variant?: "secondary" | "primary" | "primaryFull" | "danger";
  title?: string;
  icon?: ReactNode;
  className?: string;
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
      // The chrome control's own rules sit outside Tailwind's layers, so the phone height needs `!`.
      className={cn(
        className,
        "inline-flex items-center justify-center gap-1.5 text-xs max-sm:min-h-9!",
        extraClassName,
      )}
    >
      {pending ? <Loader2 size="0.8125rem" className="animate-spin" /> : icon}
      {children}
    </button>
  );
}

/** Muted explanatory text inside a section. */
export function MeguminHint({
  children,
  tone = "muted",
  className,
}: {
  children: ReactNode;
  tone?: "muted" | "warning";
  className?: string;
}) {
  return (
    <p
      className={cn(
        "text-xs leading-relaxed",
        tone === "warning" ? "text-[var(--warning,#d97706)]" : "text-[var(--marinara-chat-chrome-panel-muted)]",
        className,
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
  return <div className={cn("flex flex-wrap items-center gap-2", className)}>{children}</div>;
}
