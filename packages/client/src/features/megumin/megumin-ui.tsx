// ──────────────────────────────────────────────
// Megumin Suite editor: the small building blocks every tab shares
// ──────────────────────────────────────────────
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Info } from "lucide-react";
import { cn } from "../../lib/utils";
import { SettingsSwitch } from "../../components/panels/settings/SettingControls";

/** A selectable card: engines, frameworks, styles, add-ons. Extra controls go below the button, never inside it. */
export function MeguminOptionCard({
  title,
  description,
  selected,
  onSelect,
  badges,
  disabled = false,
  disabledReason,
  children,
  compact = false,
}: {
  title: ReactNode;
  description?: ReactNode;
  selected: boolean;
  onSelect: () => void;
  badges?: ReactNode;
  disabled?: boolean;
  disabledReason?: string;
  children?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "mari-editor-panel flex min-w-0 flex-col gap-2 transition-colors",
        compact ? "p-2.5" : "p-3",
        selected && "ring-2 ring-[var(--marinara-editor-accent)]",
        disabled && "opacity-60",
      )}
    >
      <button
        type="button"
        aria-pressed={selected}
        disabled={disabled}
        title={disabled ? disabledReason : undefined}
        onClick={onSelect}
        className="flex min-w-0 flex-col items-start gap-1 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--marinara-editor-focus-ring)] disabled:cursor-not-allowed"
      >
        <span className="flex w-full min-w-0 items-center gap-2">
          <span className={cn("min-w-0 flex-1 font-semibold", compact ? "text-xs" : "text-sm")}>{title}</span>
          {selected && (
            <Check size="0.875rem" aria-hidden="true" className="shrink-0 text-[var(--marinara-editor-accent)]" />
          )}
        </span>
        {description && (
          <span className="text-[0.6875rem] leading-relaxed text-[var(--marinara-editor-muted)]">{description}</span>
        )}
        {badges && <span className="flex flex-wrap gap-1">{badges}</span>}
        {disabled && disabledReason && (
          <span className="text-[0.625rem] leading-relaxed text-[var(--marinara-editor-muted)]">{disabledReason}</span>
        )}
      </button>
      {children}
    </div>
  );
}

export function MeguminBadge({
  tone = "muted",
  children,
}: {
  tone?: "muted" | "accent" | "warning";
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "mari-editor-chip px-2 py-0.5 text-[0.625rem]",
        tone === "accent" && "mari-editor-chip--accent",
        tone === "warning" && "mari-editor-chip--warning",
      )}
    >
      {children}
    </span>
  );
}

export function MeguminHeading({ children, description }: { children: ReactNode; description?: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <h2 className="text-sm font-semibold">{children}</h2>
      {description && (
        <p className="text-[0.6875rem] leading-relaxed text-[var(--marinara-editor-muted)]">{description}</p>
      )}
    </div>
  );
}

export function MeguminCallout({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warning" }) {
  return (
    <div
      className={cn(
        "mari-editor-panel mari-editor-panel--soft flex items-start gap-2 p-3 text-[0.6875rem] leading-relaxed",
        tone === "warning" && "border-[color-mix(in_srgb,var(--warning)_40%,transparent)]",
      )}
    >
      <Info size="0.875rem" aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--marinara-editor-accent)]" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function MeguminGrid({ children, narrow = false }: { children: ReactNode; narrow?: boolean }) {
  return (
    <div
      className={cn(
        "grid gap-2",
        narrow ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3",
      )}
    >
      {children}
    </div>
  );
}

/** A labelled switch row. */
export function MeguminToggle({
  label,
  description,
  help,
  checked,
  onChange,
  disabled,
}: {
  label: ReactNode;
  description?: ReactNode;
  /** Longer explanation behind a help tooltip, for switches inside cards. */
  help?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <SettingsSwitch
      label={label}
      description={description}
      help={help}
      helpPosition="label"
      checked={checked}
      onChange={onChange}
      disabled={disabled}
      labelPosition="start"
      className="mari-editor-panel justify-between px-3 py-2"
      labelClassName="text-xs font-medium"
    />
  );
}

/**
 * A text box that saves 500 ms after typing stops and on blur, so typing never waits on the server.
 * It follows the saved value again whenever nobody is editing it (a scope switch, an undo).
 */
export function MeguminTextField({
  value,
  onCommit,
  label,
  placeholder,
  multiline = false,
  rows = 3,
  className,
  maxLength,
}: {
  value: string;
  onCommit: (value: string) => void;
  label: string;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  className?: string;
  maxLength?: number;
}) {
  const [draft, setDraft] = useState(value);
  const timer = useRef<number | null>(null);
  const editing = useRef(false);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  useEffect(() => {
    if (!editing.current) setDraft(value);
  }, [value]);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const flush = (next: string) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    editing.current = false;
    if (next !== value) commitRef.current(next);
  };
  const change = (next: string) => {
    editing.current = true;
    setDraft(next);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => flush(next), 500);
  };
  const shared = {
    "aria-label": label,
    placeholder,
    value: draft,
    maxLength,
    onBlur: () => {
      if (editing.current) flush(draft);
    },
    className: cn("mari-editor-field w-full min-w-0 px-3 py-2 text-xs", className),
  };
  return multiline ? (
    <textarea {...shared} rows={rows} onChange={(event) => change(event.target.value)} />
  ) : (
    <input {...shared} type="text" onChange={(event) => change(event.target.value)} />
  );
}

/** A whole-number box that saves on blur or Enter, clamped to its range. */
export function MeguminNumberField({
  value,
  onCommit,
  label,
  min,
  max,
  className,
}: {
  value: number;
  onCommit: (value: number) => void;
  label: string;
  min: number;
  max: number;
  className?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const parsed = Math.round(Number(draft));
    const next = Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : value;
    setDraft(String(next));
    if (next !== value) onCommit(next);
  };
  return (
    <input
      type="number"
      inputMode="numeric"
      aria-label={label}
      min={min}
      max={max}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit();
      }}
      className={cn("mari-editor-field w-24 px-3 py-2 text-xs", className)}
    />
  );
}
