// ──────────────────────────────────────────────
// Megumin panel: opening an engine in Dev Mode from another tab
// ──────────────────────────────────────────────
// The Preset & Thinking tab's "Edit" on an engine card (coreAndCot.js calls
// renderDevMode("editor", id, null, "tab")): Dev Mode opens that engine (a
// shipped one as a new copy, your own as is) and returns to the Preset tab when
// you leave it. Kept outside DevModeTab so the Preset tab does not load it.
let pendingEngineOpen: string | null = null;

export function openMeguminDevEngine(engineId: string, openTab: (tabId: string) => void) {
  pendingEngineOpen = engineId;
  openTab("devmode");
}

/** The engine a tab asked Dev Mode to open, once. */
export function takePendingMeguminDevEngine(): string | null {
  const id = pendingEngineOpen;
  pendingEngineOpen = null;
  return id;
}
