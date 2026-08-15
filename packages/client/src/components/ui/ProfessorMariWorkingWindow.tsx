import { Loader2, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { useReducedAmbientEffects } from "../../hooks/use-reduced-ambient-effects";
import { useTranslation as useUiTranslation } from "react-i18next";

interface ProfessorMariWorkingWindowProps {
  visible: boolean;
  onDismiss?: () => void;
  className?: string;
}

export function ProfessorMariWorkingWindow({ visible, onDismiss, className }: ProfessorMariWorkingWindowProps) {
  const { t: localizeUi } = useUiTranslation();
  const reduceAmbientEffects = useReducedAmbientEffects();
  if (!visible) return null;

  return (
    <aside
      className={cn(
        "pointer-events-auto relative inline-flex max-w-full items-center gap-2 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)]/85 px-2.5 py-2 text-[var(--foreground)] shadow-sm ring-1 ring-[var(--border)]/50",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <Loader2 size="1.5rem" className={cn("shrink-0 text-[var(--muted-foreground)]", !reduceAmbientEffects && "animate-spin")} />
      <p className={cn("min-w-0 text-xs font-medium leading-relaxed text-[var(--foreground)]", onDismiss && "pr-6")}>{localizeUi("ui.ui.professormariworkingwindow.profMariIsWorking")}</p>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="absolute right-1.5 top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/60"
          aria-label={localizeUi("ui.ui.professormariworkingwindow.hideProfessorMariWorkingIndicator")}
          title={localizeUi("ui.noodle.stageprofileview.hide")}
        >
          <X size="0.78rem" />
        </button>
      )}
    </aside>
  );
}
