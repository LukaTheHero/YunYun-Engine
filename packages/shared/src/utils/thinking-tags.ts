// ──────────────────────────────────────────────
// Inline Thinking Tags
// ──────────────────────────────────────────────

export interface ThinkingTagPair {
  open: string;
  close: string;
}

export interface LeadingThinkingExtraction {
  content: string;
  thinking: string;
  stripped: boolean;
}

export interface LeadingThinkingOptions {
  /**
   * Also lift reasoning the reply never opened: the text before the first known close tag, when
   * that tag starts within the first MAX_UNOPENED_THINKING_CHARS characters and its own opening
   * tag does not come before it. Only the reply's first block can be unopened. Megumin Mode turns
   * with reasoning on use it, for providers that swallow the opening `<think>`.
   */
  allowLeadingUnopenedClose?: boolean;
}

/** How far into a reply an unopened close tag may start and still end the reasoning. */
export const MAX_UNOPENED_THINKING_CHARS = 16_384;

type InternalThinkingTagPair = ThinkingTagPair & {
  openLower: string;
  closeLower: string;
  boundaryAfterOpen?: boolean;
};

export const BUILT_IN_THINKING_TAG_PAIRS: ThinkingTagPair[] = [
  { open: "<thinking>", close: "</thinking>" },
  { open: "<think>", close: "</think>" },
  { open: "<thought>", close: "</thought>" },
  { open: "<|think|>", close: "<|/think|>" },
  { open: "<|channel>thought", close: "<channel|>" },
  { open: "[thinking]", close: "[/thinking]" },
  { open: "[think]", close: "[/think]" },
  { open: "[thought]", close: "[/thought]" },
];

const MAX_CUSTOM_THINKING_TAGS = 20;
const MAX_THINKING_TAG_LENGTH = 120;

export function normalizeThinkingTagPairs(value: unknown): ThinkingTagPair[] {
  if (!Array.isArray(value)) return [];

  const out: ThinkingTagPair[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const raw = item as { open?: unknown; close?: unknown };
    const open = typeof raw.open === "string" ? raw.open.trim() : "";
    const close = typeof raw.close === "string" ? raw.close.trim() : "";
    if (!open || !close) continue;
    if (open.length > MAX_THINKING_TAG_LENGTH || close.length > MAX_THINKING_TAG_LENGTH) continue;
    const key = `${open.toLocaleLowerCase()}\u0000${close.toLocaleLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ open, close });
    if (out.length >= MAX_CUSTOM_THINKING_TAGS) break;
  }
  return out;
}

function toInternalThinkingTagPairs(customTags?: unknown): InternalThinkingTagPair[] {
  const pairs = [...BUILT_IN_THINKING_TAG_PAIRS, ...normalizeThinkingTagPairs(customTags)];
  const seen = new Set<string>();
  return pairs
    .map((pair) => ({
      ...pair,
      openLower: pair.open.toLocaleLowerCase(),
      closeLower: pair.close.toLocaleLowerCase(),
      boundaryAfterOpen: pair.open.toLocaleLowerCase() === "<|channel>thought",
    }))
    .filter((pair) => {
      const key = `${pair.openLower}\u0000${pair.closeLower}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.open.length - a.open.length);
}

function countLeadingWhitespace(value: string): number {
  let index = 0;
  while (index < value.length && /\s/.test(value[index]!)) index++;
  return index;
}

function hasOpeningBoundary(value: string, endIndex: number): boolean {
  const next = value[endIndex];
  return !next || !/[A-Za-z0-9_]/.test(next);
}

function findLeadingOpening(value: string, pairs: InternalThinkingTagPair[]) {
  const start = countLeadingWhitespace(value);
  const lower = value.toLocaleLowerCase();
  for (const pair of pairs) {
    if (!lower.startsWith(pair.openLower, start)) continue;
    const end = start + pair.open.length;
    if (pair.boundaryAfterOpen && !hasOpeningBoundary(value, end)) continue;
    return { pair, start, end };
  }
  return null;
}

function isPotentialLeadingOpening(value: string, pairs: InternalThinkingTagPair[]): boolean {
  const start = countLeadingWhitespace(value);
  if (start >= value.length) return true;
  const lower = value.slice(start).toLocaleLowerCase();
  return pairs.some((pair) => pair.openLower.startsWith(lower));
}

function indexOfInsensitive(value: string, needleLower: string, fromIndex = 0): number {
  return value.toLocaleLowerCase().indexOf(needleLower, fromIndex);
}

/**
 * The earliest close tag starting inside the unopened-reasoning window, and whether it really is
 * unopened: a close tag its own opening comes before is ordinary text, not reasoning.
 */
function findEarliestClose(value: string, pairs: InternalThinkingTagPair[]) {
  const lower = value.toLocaleLowerCase();
  let found: { index: number; pair: InternalThinkingTagPair } | null = null;
  for (const pair of pairs) {
    const index = lower.indexOf(pair.closeLower);
    if (index < 0 || index >= MAX_UNOPENED_THINKING_CHARS) continue;
    if (found && (index > found.index || (index === found.index && pair.close.length <= found.pair.close.length))) {
      continue;
    }
    found = { index, pair };
  }
  return found && { ...found, unopened: !lower.slice(0, found.index).includes(found.pair.openLower) };
}

/**
 * Extract leading inline reasoning blocks that some models emit instead of
 * returning provider-native thinking channels.
 */
export function extractLeadingThinkingBlocks(
  text: string,
  customTags?: unknown,
  options?: LeadingThinkingOptions,
): LeadingThinkingExtraction {
  let remaining = text;
  let stripped = false;
  const chunks: string[] = [];
  const pairs = toInternalThinkingTagPairs(customTags);

  while (true) {
    const opening = findLeadingOpening(remaining, pairs);
    if (!opening) {
      const unopened = options?.allowLeadingUnopenedClose && !stripped ? findEarliestClose(remaining, pairs) : null;
      if (!unopened?.unopened) break;
      stripped = true;
      const thinking = remaining.slice(0, unopened.index).trim();
      if (thinking) chunks.push(thinking);
      remaining = remaining.slice(unopened.index + unopened.pair.close.length).trimStart();
      continue;
    }

    const closeIndex = indexOfInsensitive(remaining, opening.pair.closeLower, opening.end);
    if (closeIndex < 0) break;

    stripped = true;
    const thinking = remaining.slice(opening.end, closeIndex).trim();
    if (thinking) chunks.push(thinking);
    remaining = remaining.slice(closeIndex + opening.pair.close.length).trimStart();
  }

  return {
    content: remaining,
    thinking: chunks.join("\n\n"),
    stripped,
  };
}

export interface InlineThinkingStreamFilterResult {
  visible: string;
  thinking: string;
}

export interface InlineThinkingStreamFilter {
  push(chunk: string): InlineThinkingStreamFilterResult;
  flush(): InlineThinkingStreamFilterResult;
  reset(): void;
}

export function createInlineThinkingStreamFilter(
  customTags?: unknown,
  options?: LeadingThinkingOptions,
): InlineThinkingStreamFilter {
  const pairs = toInternalThinkingTagPairs(customTags);
  const maxDetectBuffer = Math.max(32, ...pairs.map((pair) => pair.open.length + 64));
  // Past this, no close tag can still start inside the unopened-reasoning window.
  const maxUnopenedBuffer = MAX_UNOPENED_THINKING_CHARS + Math.max(...pairs.map((pair) => pair.close.length));
  let state: "detect" | "inside" | "unopened" | "done" = "detect";
  let buffer = "";
  let activePair: InternalThinkingTagPair | null = null;
  let liftedBlock = false;

  const drain = (): InlineThinkingStreamFilterResult => {
    let visible = "";
    let thinking = "";

    while (true) {
      if (state === "done") {
        visible += buffer;
        buffer = "";
        break;
      }

      if (state === "detect") {
        const opening = findLeadingOpening(buffer, pairs);
        if (opening) {
          activePair = opening.pair;
          buffer = buffer.slice(opening.end);
          state = "inside";
          continue;
        }
        if (buffer.length <= maxDetectBuffer && isPotentialLeadingOpening(buffer, pairs)) break;
        state = options?.allowLeadingUnopenedClose && !liftedBlock ? "unopened" : "done";
        continue;
      }

      if (state === "unopened") {
        // Held back, not shown: until a close tag arrives this may be reasoning or the reply.
        const close = findEarliestClose(buffer, pairs);
        if (close?.unopened) {
          thinking += buffer.slice(0, close.index);
          buffer = buffer.slice(close.index + close.pair.close.length).trimStart();
          liftedBlock = true;
          state = "detect";
          continue;
        }
        if (!close && buffer.length < maxUnopenedBuffer) break;
        state = "done";
        continue;
      }

      if (!activePair) {
        state = "done";
        continue;
      }

      const closeIndex = indexOfInsensitive(buffer, activePair.closeLower);
      if (closeIndex >= 0) {
        thinking += buffer.slice(0, closeIndex);
        buffer = buffer.slice(closeIndex + activePair.close.length).trimStart();
        activePair = null;
        liftedBlock = true;
        state = "detect";
        continue;
      }

      const holdback = Math.max(0, activePair.close.length - 1);
      const emitLength = Math.max(0, buffer.length - holdback);
      if (emitLength > 0) {
        thinking += buffer.slice(0, emitLength);
        buffer = buffer.slice(emitLength);
      }
      break;
    }

    return { visible, thinking };
  };

  return {
    push(chunk: string) {
      if (!chunk) return { visible: "", thinking: "" };
      buffer += chunk;
      return drain();
    },
    flush() {
      // Unopened text still held when the reply ends had no close tag: it was the reply.
      if (state === "detect" || state === "unopened") {
        state = "done";
      }
      return drain();
    },
    reset() {
      state = "detect";
      buffer = "";
      activePair = null;
      liftedBlock = false;
    },
  };
}
