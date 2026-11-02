// ──────────────────────────────────────────────
// Megumin panel: the small pieces the Model Setup, Preset & Thinking, Persona
// and Language & Add-ons tabs share (Megumin's ui/controls.js and its card,
// badge and callout styles, drawn with YunYun's tokens).
// ──────────────────────────────────────────────
import { Fragment, type ReactNode } from "react";
import { Info, Lightbulb, ShieldCheck, TriangleAlert } from "lucide-react";
import { cn } from "../../../lib/utils";
import { SettingsSwitch } from "../../panels/settings/SettingControls";

/** Megumin's segmented row: a compact one-of-many (numbers, short words). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  disabled,
  ariaLabel,
}: {
  options: Array<{ id: T; label: string }>;
  value: T | string;
  onChange: (id: T) => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex flex-wrap gap-1 rounded-lg bg-[var(--background)]/50 p-1 ring-1 ring-[var(--border)]/60"
    >
      {options.map((o) => {
        const on = String(o.id) === String(value);
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(o.id)}
            className={cn(
              "min-w-0 flex-1 rounded-md px-2 py-1 text-[0.6875rem] transition-colors disabled:opacity-60",
              on
                ? "bg-[var(--primary)]/20 font-semibold text-[var(--foreground)] ring-1 ring-[var(--primary)]/45"
                : "text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)]",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** An on/off row with its description shown under the label (Megumin's switchRow). */
export function SwitchRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <SettingsSwitch
      label={label}
      description={description}
      checked={checked}
      onChange={onChange}
      disabled={disabled}
      labelPosition="start"
      className="justify-between gap-3 rounded-lg p-1.5"
      labelClassName="text-xs"
    />
  );
}

/**
 * Megumin's library and loadout notes carry a little inline markup (<b>, <i>, <a>). Drawn as React nodes,
 * never as HTML: bold and italic become elements, a link keeps only an http(s) href, every other tag is dropped.
 */
export function RichText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  const re = /<(b|strong|i|em)>([\s\S]*?)<\/\1>|<a\s+[^>]*href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/gi;
  const source = String(text ?? "");
  let last = 0;
  let key = 0;
  const plain = (s: string) => s.replace(/<[^>]*>/g, "");
  for (const m of source.matchAll(re)) {
    const at = m.index ?? 0;
    if (at > last) parts.push(<Fragment key={key++}>{plain(source.slice(last, at))}</Fragment>);
    if (m[1]) {
      const inner = plain(m[2] ?? "");
      const tag = m[1].toLowerCase();
      parts.push(
        tag === "b" || tag === "strong" ? (
          <strong key={key++} className="font-semibold text-[var(--foreground)]">
            {inner}
          </strong>
        ) : (
          <em key={key++}>{inner}</em>
        ),
      );
    } else {
      const href = m[3] ?? "";
      const inner = plain(m[4] ?? "");
      parts.push(
        /^https?:\/\//i.test(href) ? (
          <a key={key++} href={href} target="_blank" rel="noreferrer" className="underline">
            {inner}
          </a>
        ) : (
          <Fragment key={key++}>{inner}</Fragment>
        ),
      );
    }
    last = at + m[0].length;
  }
  if (last < source.length) parts.push(<Fragment key={key++}>{plain(source.slice(last))}</Fragment>);
  return <>{parts}</>;
}

export type BadgeTone = "rec" | "new" | "locked" | "active" | "warn" | "custom" | "override" | "ok" | "muted";

const BADGE_TONES: Record<BadgeTone, string> = {
  rec: "bg-amber-500/15 text-amber-500",
  new: "bg-sky-500/15 text-sky-500",
  locked: "bg-[var(--muted)]/40 text-[var(--muted-foreground)]",
  active: "bg-emerald-500/15 text-emerald-500",
  ok: "bg-emerald-500/15 text-emerald-500",
  warn: "bg-amber-500/15 text-amber-500",
  custom: "bg-violet-500/15 text-violet-500",
  override: "bg-fuchsia-500/15 text-fuchsia-500",
  muted: "bg-[var(--accent)] text-[var(--muted-foreground)]",
};

export function Badge({
  tone,
  icon,
  children,
  title,
}: {
  tone: BadgeTone;
  icon?: ReactNode;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.5625rem] font-semibold leading-none",
        BADGE_TONES[tone],
      )}
    >
      {icon}
      {children}
    </span>
  );
}

export type CalloutTone = "gold" | "green" | "blue" | "red" | "muted";

const CALLOUT_TONES: Record<CalloutTone, string> = {
  gold: "border-amber-500/30 bg-amber-500/10",
  green: "border-emerald-500/30 bg-emerald-500/10",
  blue: "border-sky-500/30 bg-sky-500/10",
  red: "border-[var(--destructive)]/35 bg-[var(--destructive)]/10",
  muted: "border-[var(--border)]/70 bg-[var(--background)]/40",
};

const CALLOUT_ICONS: Record<CalloutTone, ReactNode> = {
  gold: <Lightbulb size="0.75rem" className="text-amber-500" />,
  green: <ShieldCheck size="0.75rem" className="text-emerald-500" />,
  blue: <Info size="0.75rem" className="text-sky-500" />,
  red: <TriangleAlert size="0.75rem" className="text-[var(--destructive)]" />,
  muted: <Info size="0.75rem" className="text-[var(--muted-foreground)]" />,
};

/** Megumin's mtab-callout: a tinted note with an icon. */
export function Callout({ tone, icon, children }: { tone: CalloutTone; icon?: ReactNode; children: ReactNode }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[0.6875rem] leading-relaxed text-[var(--marinara-chat-chrome-panel-muted)]",
        CALLOUT_TONES[tone],
      )}
    >
      <span className="mt-0.5 shrink-0">{icon ?? CALLOUT_ICONS[tone]}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Megumin's engine card (mtab-eng-card): one pickable thing with a title row, badges and a description. */
export function PickCard({
  active,
  locked,
  onPick,
  title,
  titleExtra,
  description,
  badges,
  accent,
  children,
}: {
  active?: boolean;
  locked?: boolean;
  onPick?: () => void;
  title: ReactNode;
  titleExtra?: ReactNode;
  description?: ReactNode;
  badges?: ReactNode;
  accent?: string;
  children?: ReactNode;
}) {
  const clickable = !!onPick && !locked;
  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-pressed={clickable ? !!active : undefined}
      aria-disabled={locked || undefined}
      onClick={clickable ? onPick : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.target !== e.currentTarget) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onPick?.();
              }
            }
          : undefined
      }
      className={cn(
        "relative flex flex-col gap-1 overflow-hidden rounded-lg border px-2.5 py-2 pl-3 text-left transition-colors",
        active
          ? "border-[var(--primary)]/55 bg-[var(--primary)]/10"
          : "border-[var(--border)]/70 bg-[var(--background)]/35",
        clickable && !active && "cursor-pointer hover:border-[var(--primary)]/35 hover:bg-[var(--accent)]/50",
        clickable && "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        locked && "opacity-55",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-y-0 left-0 w-0.5",
          !accent && (active ? "bg-[var(--primary)]" : "bg-[var(--border)]"),
        )}
        style={accent ? { backgroundColor: accent } : undefined}
      />
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-[var(--marinara-chat-chrome-panel-title)]">
          {title}
        </span>
        {titleExtra}
      </div>
      {description ? (
        <div className="text-[0.625rem] leading-relaxed text-[var(--marinara-chat-chrome-panel-muted)]">
          {description}
        </div>
      ) : null}
      {badges ? <div className="flex flex-wrap gap-1">{badges}</div> : null}
      {children}
    </div>
  );
}

/** A chip row of quick summaries (Megumin's igx-chips). */
export function SummaryChip({ tone, icon, children }: { tone?: "ok" | "warm"; icon?: ReactNode; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-1 rounded-full px-2 py-0.5 text-[0.625rem] ring-1",
        tone === "ok"
          ? "bg-emerald-500/10 text-emerald-500 ring-emerald-500/30"
          : tone === "warm"
            ? "bg-amber-500/10 text-amber-500 ring-amber-500/30"
            : "bg-[var(--background)]/40 text-[var(--muted-foreground)] ring-[var(--border)]/60",
      )}
    >
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}

/** Page buttons at the top of a tab (Megumin's igx-tabs). */
export function PageTabs<T extends string>({
  pages,
  value,
  onChange,
  ariaLabel,
}: {
  pages: Array<{ id: T; label: string; icon?: ReactNode }>;
  value: T;
  onChange: (id: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="flex gap-1 border-b border-[var(--border)]/60">
      {pages.map((p) => {
        const on = p.id === value;
        return (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(p.id)}
            className={cn(
              "-mb-px inline-flex min-w-0 flex-1 items-center justify-center gap-1 border-b-2 px-1.5 py-1.5 text-[0.6875rem] transition-colors",
              on
                ? "border-[var(--primary)] font-semibold text-[var(--foreground)]"
                : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
            )}
          >
            {p.icon}
            <span className="truncate">{p.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Whether an engine carries text for a key (a custom engine has it whole; a shipped one lists it in `filled`). */
export function engineHas(engine: Record<string, any> | undefined, key: string): boolean {
  if (!engine) return false;
  const value = engine[key];
  if (typeof value === "string") return value.trim() !== "";
  return Array.isArray(engine.filled) && engine.filled.includes(key);
}
