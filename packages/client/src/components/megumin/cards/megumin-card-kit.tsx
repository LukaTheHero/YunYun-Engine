// ──────────────────────────────────────────────
// Megumin cards: what every pane decoration shares
// ──────────────────────────────────────────────
// The block card itself is Megumin's own DOM (vendored buildBlocksCard). The
// decorations Megumin's features/blocks/chat.js adds on top of a pane are React
// here, portalled into that pane: a host element placed where Megumin put its
// own (prepended, appended, or in place of the pane's drawing).
import { useCallback, useLayoutEffect, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "../../../lib/utils";
import { useMeguminAction } from "../../../hooks/use-megumin";

export type PaneHostMode = "prepend" | "append" | "replace";

/**
 * A host element inside `pane` for a portal. `replace` hides the pane's own drawing while the host is
 * mounted and puts it back on unmount, so a redraw or an unmount never leaves the pane empty.
 */
export function usePaneHost(pane: HTMLElement | null, mode: PaneHostMode, className?: string): HTMLElement | null {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!pane) return;
    const doc = pane.ownerDocument || document;
    const el = doc.createElement("div");
    el.setAttribute("data-megumin-pane-host", mode);
    if (className) el.className = className;
    const hidden: Array<{ node: HTMLElement; display: string }> = [];
    if (mode === "replace") {
      for (const child of Array.from(pane.children)) {
        if (!(child instanceof HTMLElement) || child.hasAttribute("data-megumin-pane-host")) continue;
        hidden.push({ node: child, display: child.style.display });
        child.style.display = "none";
      }
      pane.appendChild(el);
    } else if (mode === "prepend") {
      pane.insertBefore(el, pane.firstChild);
    } else {
      pane.appendChild(el);
    }
    setHost(el);
    return () => {
      el.remove();
      for (const { node, display } of hidden) node.style.display = display;
      setHost(null);
    };
  }, [pane, mode, className]);

  return host;
}

/**
 * Runs a Megumin action in the chat's scope, tracking which ones are running so each button shows its
 * own spinner. Errors are toasted by the action hook; the promise resolves to null on failure.
 */
export function useCardActions(chatId: string) {
  const action = useMeguminAction({ kind: "chat", chatId });
  const [running, setRunning] = useState<Record<string, number>>({});

  const run = useCallback(
    async (name: string, args?: Record<string, unknown>, key = name): Promise<unknown> => {
      setRunning((s) => ({ ...s, [key]: (s[key] ?? 0) + 1 }));
      try {
        return await action.mutateAsync({ action: name, args });
      } catch {
        return null;
      } finally {
        setRunning((s) => ({ ...s, [key]: Math.max(0, (s[key] ?? 1) - 1) }));
      }
    },
    [action],
  );

  const isRunning = useCallback((key: string) => (running[key] ?? 0) > 0, [running]);
  return { run, isRunning };
}

/** A small card button (Megumin's .meg-wsdiff-btn / .meg-bonds-all / menu_button on cards). */
export function CardButton({
  children,
  onClick,
  title,
  disabled,
  pending,
  icon,
  tone = "default",
  className,
}: {
  children?: ReactNode;
  onClick: () => void;
  title?: string;
  disabled?: boolean;
  pending?: boolean;
  icon?: ReactNode;
  tone?: "default" | "danger" | "armed";
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled || pending}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[0.625rem] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55",
        tone === "danger" || tone === "armed"
          ? "border-[var(--destructive)]/40 text-[var(--destructive)] hover:bg-[var(--destructive)]/10"
          : "border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)]",
        tone === "armed" && "bg-[var(--destructive)]/10",
        className,
      )}
    >
      {pending ? <Loader2 size="0.6875rem" className="animate-spin" /> : icon}
      {children}
    </button>
  );
}

/** A two-click button: the first click arms it (for `ms`), the second acts (Megumin's data-armed buttons). */
export function useArmed(ms = 3000) {
  const [armed, setArmed] = useState<string | null>(null);
  const arm = useCallback(
    (key: string, act: () => void) => {
      if (armed === key) {
        setArmed(null);
        act();
        return;
      }
      setArmed(key);
      window.setTimeout(() => setArmed((cur) => (cur === key ? null : cur)), ms);
    },
    [armed, ms],
  );
  return { armed, arm };
}

/** Clicks inside a decoration must not reach the message under the card (React portals bubble through the tree). */
export const stopCardClick = (e: { stopPropagation: () => void }) => e.stopPropagation();

/** Megumin's input commit rule: on blur or Enter, only when the value really changed. */
export function CommitInput({
  value,
  onCommit,
  placeholder,
  className,
  clearOnCommit,
  type = "text",
  ariaLabel,
}: {
  value: string;
  onCommit: (next: string, was: string) => void;
  placeholder?: string;
  className?: string;
  /** For "add" rows: commit on Enter only, then empty the box. */
  clearOnCommit?: boolean;
  type?: "text" | "search";
  ariaLabel?: string;
}) {
  return (
    <input
      key={value}
      type={type}
      defaultValue={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onClick={stopCardClick}
      onBlur={(e) => {
        if (clearOnCommit) return;
        const next = e.currentTarget.value.trim();
        if (next !== value) onCommit(next, value);
      }}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        if (clearOnCommit) {
          const next = e.currentTarget.value.trim();
          if (next) {
            onCommit(next, value);
            e.currentTarget.value = "";
          }
          return;
        }
        e.currentTarget.blur();
      }}
      className={cn(
        "w-full min-w-0 rounded-md border border-[var(--border)] bg-[var(--background)]/60 px-2 py-1 text-xs text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        className,
      )}
    />
  );
}

/** Small uppercase tag (Megumin's .meg-wsed-tag / .meg-wsed-badge). */
export function CardTag({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "off" | "dim" | "warn";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1 py-px text-[0.5625rem] font-semibold uppercase tracking-wide",
        tone === "off" && "bg-[var(--destructive)]/15 text-[var(--destructive)]",
        tone === "dim" && "bg-[var(--muted)]/40 text-[var(--muted-foreground)]",
        tone === "warn" && "bg-amber-500/15 text-amber-500",
        tone === "default" && "bg-[var(--accent)] text-[var(--muted-foreground)]",
      )}
    >
      {children}
    </span>
  );
}
