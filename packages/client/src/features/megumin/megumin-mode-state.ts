// ──────────────────────────────────────────────
// Megumin Mode: what the open chat runs, mirrored from the server
// ──────────────────────────────────────────────
// The client copy of `resolveGenerationPromptPreset` (server routes/generate/prompt-preset-selection.ts):
// the connection's preset comes first in a Roleplay chat, then the chat's own, and the first that exists
// is used. While the switch is off a Roleplay chat passes over Megumin presets and, when nothing else is
// left, uses the starred preset or the stock Universal preset. The megumin-mode-state regression runs both
// over the same cases so they cannot drift.
import { isMeguminPreset, isStockMarinaraUniversalPreset } from "@marinara-engine/shared";

export interface MeguminModePreset {
  id: string;
  name?: string;
  engineMode?: unknown;
  systemKey?: unknown;
  isDefault?: unknown;
}

export interface MeguminModeState<P extends MeguminModePreset = MeguminModePreset> {
  /** The `meguminMode` feature switch. */
  enabled: boolean;
  /** Megumin runs for the open chat: the switch is on, the chat is Roleplay and its preset is a Megumin preset. */
  active: boolean;
  /** The chat's own choice: the connection's preset first in Roleplay, then the chat's, whichever exists first. */
  effectivePresetId: string | null;
  effectivePreset: P | null;
  /** The effective preset is the connection's, so assigning a preset to the chat changes nothing. */
  connectionForcesPreset: boolean;
  /** The preset a generation uses now. It differs from the effective one only while the switch is off. */
  usedPreset: P | null;
  /** The Megumin preset passed over because the switch is off; the chat keeps it assigned. */
  skippedMeguminPresetId: string | null;
}

function asId(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function resolveMeguminModeState<P extends MeguminModePreset>(args: {
  enabled: boolean;
  chatMode: string | null | undefined;
  chatPromptPresetId: unknown;
  connectionPromptPresetId: unknown;
  presets: readonly P[] | null | undefined;
}): MeguminModeState<P> {
  const roleplay = args.chatMode === "roleplay";
  const presets = args.presets ?? [];
  const byId = new Map(presets.map((preset) => [preset.id, preset]));
  const candidates: Array<{ id: string; fromConnection: boolean }> = [];
  const connectionId = roleplay ? asId(args.connectionPromptPresetId) : null;
  const chatId = asId(args.chatPromptPresetId);
  if (connectionId) candidates.push({ id: connectionId, fromConnection: true });
  if (chatId && chatId !== connectionId) candidates.push({ id: chatId, fromConnection: false });

  const effective = candidates.find((candidate) => byId.has(candidate.id)) ?? null;
  let used: P | null = null;
  let skippedMeguminPresetId: string | null = null;
  for (const candidate of candidates) {
    const preset = byId.get(candidate.id);
    if (!preset) continue;
    if (!args.enabled && roleplay && isMeguminPreset(preset)) {
      skippedMeguminPresetId ??= candidate.id;
      continue;
    }
    used = preset;
    break;
  }
  if (!used && skippedMeguminPresetId) {
    const starred = presets.find((preset) => String(preset.isDefault) === "true") ?? null;
    used = starred && !isMeguminPreset(starred) ? starred : (presets.find(isStockMarinaraUniversalPreset) ?? null);
  }

  return {
    enabled: args.enabled,
    active: args.enabled && roleplay && isMeguminPreset(used),
    effectivePresetId: effective?.id ?? null,
    effectivePreset: effective ? (byId.get(effective.id) ?? null) : null,
    connectionForcesPreset: effective?.fromConnection ?? false,
    usedPreset: used,
    skippedMeguminPresetId,
  };
}
