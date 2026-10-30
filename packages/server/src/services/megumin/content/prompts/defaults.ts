// ──────────────────────────────────────────────
// Megumin Mode content: the built-in prompt set
//
// Ported verbatim from Megumin Suite v10.0 by KazumaONIISAN (Arif-salah), https://github.com/Arif-salah/Megumin-Suite, CC BY-NC 4.0, used with the author's permission.
// Source: src/prompts/defaults.js. Every prompt string is byte-identical to the source.
// ──────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// The built-in prompt set, reassembled from one file per module.
//
// MEGUMIN_DEFAULT_PROMPTS (DEFAULT_PROMPTS upstream) has exactly the shape it
// always had, so every reader downstream is unchanged. The split is purely so
// that editing the Story Director's system prompt doesn't mean scrolling past
// 17KB of image-gen rules.
// ─────────────────────────────────────────────────────────────────────────────

import { MEGUMIN_BAN_LIST_PROMPTS } from "./ban-list.js";
import { MEGUMIN_IMAGE_GEN_PROMPTS } from "./image-gen.js";
import { MEGUMIN_MEMORY_CORE_PROMPTS } from "./memory-core.js";
import { MEGUMIN_NPC_BANK_PROMPTS } from "./npc-bank.js";
import { MEGUMIN_STORY_PLAN_PROMPTS } from "./story-plan.js";

export const MEGUMIN_DEFAULT_PROMPTS = {
  storyPlan: MEGUMIN_STORY_PLAN_PROMPTS,
  banList: MEGUMIN_BAN_LIST_PROMPTS,
  imageGen: MEGUMIN_IMAGE_GEN_PROMPTS,
  memoryCore: MEGUMIN_MEMORY_CORE_PROMPTS,
  npcBank: MEGUMIN_NPC_BANK_PROMPTS,
} as const;

export type MeguminPromptModule = keyof typeof MEGUMIN_DEFAULT_PROMPTS;

// The modules whose prompts live under `profile[mod].customPrompts`.
//
// banList is deliberately absent: its overrides are stored one level up, on
// `profile.banListCustomPrompts`, so the sparsify/rehydrate helpers handle it as
// a separate case rather than in this loop.
export const MEGUMIN_PROMPT_MODULES: readonly MeguminPromptModule[] = [
  "storyPlan",
  "imageGen",
  "memoryCore",
  "npcBank",
];
