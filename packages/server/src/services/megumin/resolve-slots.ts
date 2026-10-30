// ──────────────────────────────────────────────
// Megumin Mode: the slot resolver, what the prompt assembler calls on a Megumin turn
//
// Loads the chat's Megumin profile, builds the dictionary (build-dict.ts), and turns it into the
// {{megumin_*}} preset variables: every registered variable is defined, "" when its slot is gated
// off, and each volatile slot goes where the layout puts it. It also returns the section switches
// and parameter changes the layout and the reasoning settings need, and the record of the turn.
// ──────────────────────────────────────────────

import {
  BUILT_IN_THINKING_TAG_PAIRS,
  estimateTextTokens,
  mergeMeguminProfile,
  normalizeThinkingTagPairs,
  resolveMeguminProfile,
  type ChatMLMessage,
  type GenerationParameters,
  type MeguminProfile,
  type ThinkingTagPair,
} from "@marinara-engine/shared";
import type { DB } from "../../db/connection.js";
import type { DieRoller } from "../game/dice-rng.js";
import { createChatsStorage } from "../storage/chats.storage.js";
import { buildMeguminDict } from "./build-dict.js";
import type { MeguminSlotProvider } from "./providers.js";
import { readMeguminSettings, resolveMeguminProfileForChat } from "./settings.js";
import {
  MEGUMIN_VARIABLE_SLOTS,
  meguminSlotVariable,
  meguminSlotVariables,
  type MeguminLayout,
  type MeguminTokenCategory,
} from "./slots.js";

/** The bundled preset's dialogue-examples marker: Cache Friendly leaves the examples out. */
export const MEGUMIN_EXAMPLES_SECTION_IDENTIFIER = "megumin-examples";

/** What the assembler's caller may set for a Megumin turn. Everything but `enabled` is for tests. */
export interface MeguminAssemblerOptions {
  /** This is a Megumin turn (isMeguminTurn); unset means it is not, so the slots stay literal. */
  enabled?: boolean;
  rng?: DieRoller;
  now?: () => Date;
  /** Applied over the chat's resolved profile. */
  profileOverride?: MeguminProfile;
  providers?: readonly MeguminSlotProvider[];
}

/** Estimated tokens of the Megumin payload per category (the preset's static text and the chat are not counted). */
export type MeguminTokenBreakdown = Record<MeguminTokenCategory, number> & { total: number };

/** The per-turn record, saved on the reply as `extra.meguminTurn`. */
export interface MeguminTurnResult {
  /** The d20s handed to the model, in order; null when no dice add-on is on. */
  diceRolls: number[] | null;
  engineId: string | null;
  /** The reasoning framework sent ("custom" when an engine or a Dev Mode fragment wrote it); null when off. */
  cotId: string | null;
  layout: MeguminLayout;
  tokenBreakdown: MeguminTokenBreakdown;
}

export interface MeguminSlotResolution {
  variables: Record<string, string>;
  /** Keyed by section identifier. */
  sectionEnabledOverrides: Record<string, boolean>;
  parameterPatch: Partial<Pick<GenerationParameters, "assistantPrefill" | "customThinkingTags">>;
  turn: MeguminTurnResult;
}

/**
 * A think wrapper edited to other tags (a Dev Mode shared fragment) still has its reasoning lifted
 * out of the reply: its tag pair joins the preset's custom thinking tags. Null when nothing is new.
 */
function thinkingTagsFor(think: string, current: readonly ThinkingTagPair[] | undefined): ThinkingTagPair[] | null {
  const open = /^\s*(<[A-Za-z][\w.-]*>)/u.exec(think)?.[1];
  if (!open) return null;
  const close = `</${open.slice(1)}`;
  if (!think.toLocaleLowerCase().includes(close.toLocaleLowerCase())) return null;
  const known = [...BUILT_IN_THINKING_TAG_PAIRS, ...(current ?? [])].some(
    (pair) =>
      pair.open.toLocaleLowerCase() === open.toLocaleLowerCase() &&
      pair.close.toLocaleLowerCase() === close.toLocaleLowerCase(),
  );
  return known ? null : normalizeThinkingTagPairs([...(current ?? []), { open, close }]);
}

export async function resolveMeguminSlots(args: {
  db: DB;
  chatId: string;
  chatMessages: readonly ChatMLMessage[];
  previewOnly?: boolean;
  /** The preset's parameters, so the patch extends its thinking tags instead of replacing them. */
  presetParameters: Pick<GenerationParameters, "customThinkingTags">;
  options?: MeguminAssemblerOptions;
}): Promise<MeguminSlotResolution> {
  const settings = await readMeguminSettings(args.db);
  const chat = args.chatId ? await createChatsStorage(args.db).getById(args.chatId) : null;
  const resolved = chat ? resolveMeguminProfileForChat(settings, chat) : resolveMeguminProfile({ settings });
  const profile = args.options?.profileOverride
    ? mergeMeguminProfile(resolved.profile, args.options.profileOverride)
    : resolved.profile;
  const layout: MeguminLayout = profile.layout;

  const { dict, engine, diceRolls, cotId } = await buildMeguminDict({
    profile,
    customEngines: settings.customEngines,
    sharedFragments: settings.sharedFragments,
    providers: args.options?.providers,
    providerContext: {
      db: args.db,
      chatId: args.chatId,
      layout,
      chatMessages: args.chatMessages,
      previewOnly: args.previewOnly === true,
    },
    rng: args.options?.rng,
    now: args.options?.now,
  });

  const variables: Record<string, string> = {};
  const counted: Record<MeguminTokenCategory, string[]> = { engine: [], cot: [], style: [], addons: [], dynamic: [] };
  for (const entry of MEGUMIN_VARIABLE_SLOTS) {
    let value = entry.trigger ? (dict[entry.trigger] ?? "") : "";
    // The shipped preset sends the never-write-for-{{user}} line only on request (decision M3).
    if (entry.name === "user_rule" && !profile.userRuleReminder) value = "";
    if (entry.name === "custom_instructions") value = profile.customPrompt;
    for (const name of meguminSlotVariables(entry)) variables[name] = "";
    variables[meguminSlotVariable(entry, layout)] = value;
    if (value) counted[entry.tokenCategory].push(value);
  }

  const tokenBreakdown = Object.fromEntries(
    Object.entries(counted).map(([category, texts]) => [category, estimateTextTokens(texts.join(" "))]),
  ) as Record<MeguminTokenCategory, number>;
  const total = Object.values(tokenBreakdown).reduce((sum, tokens) => sum + tokens, 0);

  const parameterPatch: MeguminSlotResolution["parameterPatch"] = {};
  // The reasoning prefill goes out as the assistant prefill, never as a macro: the route streams
  // the prefill raw, so a macro there would leak into the saved reply.
  const prefill = dict["[[prefill]]"];
  if (profile.sendCotPrefill && prefill) parameterPatch.assistantPrefill = prefill;
  const think = dict["[[THINK]]"] ?? "";
  const thinkingTags = thinkingTagsFor(think, args.presetParameters.customThinkingTags);
  if (thinkingTags) parameterPatch.customThinkingTags = thinkingTags;

  return {
    variables,
    sectionEnabledOverrides: layout === "cache" ? { [MEGUMIN_EXAMPLES_SECTION_IDENTIFIER]: false } : {},
    parameterPatch,
    turn: {
      diceRolls,
      engineId: engine?.id ?? null,
      cotId,
      layout,
      tokenBreakdown: { ...tokenBreakdown, total },
    },
  };
}
