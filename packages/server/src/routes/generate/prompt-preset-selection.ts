import { isMeguminPreset, isStockMarinaraUniversalPreset } from "@marinara-engine/shared";
import { logger } from "../../lib/logger.js";

/** "fallback": no candidate could run, so the default preset stands in (Megumin Mode switched off). */
export type PromptPresetCandidateSource = "impersonate" | "request" | "connection" | "chat" | "fallback";

export interface PromptPresetCandidate {
  id: string;
  source: PromptPresetCandidateSource;
}

export type PromptPresetChoices = Record<string, string | string[]>;

function asNonEmptyString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const id = (value as { id?: unknown }).id;
    if (typeof id === "string") {
      const trimmed = id.trim();
      return trimmed ? trimmed : null;
    }
  }
  return null;
}

function pushUnique(
  candidates: PromptPresetCandidate[],
  seen: Set<string>,
  id: string | null,
  source: PromptPresetCandidateSource,
) {
  if (!id || seen.has(id)) return;
  candidates.push({ id, source });
  seen.add(id);
}

export function supportsConnectionPromptPresetOverride(chatMode: unknown): boolean {
  return chatMode === "roleplay";
}

export function buildGenerationPromptPresetCandidates(args: {
  chatMode: unknown;
  chatPromptPresetId?: unknown;
  connectionPromptPresetId?: unknown;
  impersonate?: boolean;
  impersonatePromptPresetId?: unknown;
  requestPromptPresetId?: unknown;
}): PromptPresetCandidate[] {
  const candidates: PromptPresetCandidate[] = [];
  const seen = new Set<string>();

  if (args.impersonate) {
    pushUnique(candidates, seen, asNonEmptyString(args.impersonatePromptPresetId), "impersonate");
  }
  pushUnique(candidates, seen, asNonEmptyString(args.requestPromptPresetId), "request");

  if (supportsConnectionPromptPresetOverride(args.chatMode)) {
    pushUnique(candidates, seen, asNonEmptyString(args.connectionPromptPresetId), "connection");
  }

  pushUnique(candidates, seen, asNonEmptyString(args.chatPromptPresetId), "chat");
  return candidates;
}

export function resolveGenerationPromptPresetChoices(args: {
  presetSource: PromptPresetCandidateSource | null;
  selectedPresetDiffersFromChat: boolean;
  presetDefaultChoices: PromptPresetChoices;
  chatPresetChoices: PromptPresetChoices;
}): PromptPresetChoices {
  if (args.selectedPresetDiffersFromChat && args.presetSource !== "chat") {
    return args.presetDefaultChoices;
  }
  return { ...args.presetDefaultChoices, ...args.chatPresetChoices };
}

interface SelectablePromptPreset {
  id: string;
  engineMode?: unknown;
  systemKey?: unknown;
}

export interface GenerationPromptPresetSelection<P extends SelectablePromptPreset> {
  presetId: string | null;
  preset: P | null;
  source: PromptPresetCandidateSource | null;
  /** The Megumin preset passed over because Megumin Mode is off, if any. The chat keeps it assigned. */
  skippedMeguminPresetId: string | null;
  /**
   * Megumin runs this turn: the switch is on, the chat is Roleplay and the preset is a Megumin preset
   * whose sections are sent (an impersonation sends only a chat preset's markers).
   */
  isMeguminTurn: boolean;
}

/**
 * The prompt preset a generation (or its preview) uses: the first candidate that exists. While
 * Megumin Mode is off, a Roleplay chat passes over Megumin presets, whose {{megumin_*}} slots only
 * Megumin fills, and when nothing else is left it uses the starred default preset, or the stock
 * Universal preset when the starred one is itself a Megumin preset. Conversation and Game chats
 * never assemble a preset's sections, so they use theirs either way.
 */
export async function resolveGenerationPromptPreset<P extends SelectablePromptPreset>(args: {
  candidates: readonly PromptPresetCandidate[];
  presetsStorage: {
    getById(id: string): Promise<P | null>;
    getDefault(): Promise<P | null>;
    list(): Promise<P[]>;
  };
  meguminEnabled: boolean;
  chatMode: unknown;
  /** An impersonation keeps only the preset's markers unless the preset is its own impersonate preset. */
  impersonate?: boolean;
  /** Log prefix, e.g. "[generate]". */
  logLabel: string;
}): Promise<GenerationPromptPresetSelection<P>> {
  const passOverMegumin = !args.meguminEnabled && args.chatMode === "roleplay";
  let skippedMeguminPresetId: string | null = null;
  for (const candidate of args.candidates) {
    const preset = await args.presetsStorage.getById(candidate.id);
    if (preset && passOverMegumin && isMeguminPreset(preset)) {
      logger.debug("%s Megumin Mode is off; passing over the Megumin preset %s", args.logLabel, candidate.id);
      skippedMeguminPresetId ??= candidate.id;
      continue;
    }
    if (preset) {
      return {
        presetId: candidate.id,
        preset,
        source: candidate.source,
        skippedMeguminPresetId,
        isMeguminTurn:
          args.meguminEnabled &&
          args.chatMode === "roleplay" &&
          isMeguminPreset(preset) &&
          (args.impersonate !== true || candidate.source === "impersonate"),
      };
    }
    if (candidate.source !== "chat") {
      logger.warn(
        "%s %s prompt preset override %s was not found; falling back to the next preset candidate",
        args.logLabel,
        candidate.source,
        candidate.id,
      );
    }
  }
  if (skippedMeguminPresetId) {
    const starred = await args.presetsStorage.getDefault();
    const fallback =
      starred && !isMeguminPreset(starred)
        ? starred
        : ((await args.presetsStorage.list()).find(isStockMarinaraUniversalPreset) ?? null);
    if (fallback) {
      return {
        presetId: fallback.id,
        preset: fallback,
        source: "fallback",
        skippedMeguminPresetId,
        isMeguminTurn: false,
      };
    }
  }
  return { presetId: null, preset: null, source: null, skippedMeguminPresetId, isMeguminTurn: false };
}
