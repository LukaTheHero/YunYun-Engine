// ──────────────────────────────────────────────────────────────────────────────
// What Megumin does when a reply lands, a swipe changes, a message is edited or
// deleted — Megumin Suite's index.js event handlers (MESSAGE_RECEIVED,
// MESSAGE_SWIPED, MESSAGE_EDITED, MESSAGE_DELETED, CHAT_CHANGED), in the same
// order, calling the same vendored functions. SillyTavern's events become calls
// from YunYun's routes; the toasts become notices; every job the reply starts
// is returned so the operation is written back once they have all settled.
// Derived from Megumin Suite (CC BY-NC 4.0, see LICENSE.md).
// ──────────────────────────────────────────────────────────────────────────────
import { getContext, toastr } from "./vendor/src/st.js";
import { localProfile } from "./vendor/src/core/state.js";
import { suiteEnabled } from "./vendor/src/core/power.js";
import { meguminActiveDataIdentity } from "./vendor/src/core/keys.js";
import { pruneFutureData, saveProfileToMemory } from "./vendor/src/core/profile.js";
import { cleanAIOutput, getChatForStoryDirector } from "./vendor/src/engine/chatText.js";
import { runWithChomusuke } from "./vendor/src/engine/tasks.js";
import { warnChomusuke, answerKind } from "./vendor/src/engine/chomusukeNotice.js";
import {
  stateOnMessageReceived,
  stateOnSwiped,
  stateOnSwipeDeleted,
  stateOnEdited,
  stateOnDeleted,
  stateOnChatLoaded,
} from "./vendor/src/state/index.js";
import { blocksReadForReply, NOT_A_REPLY as BLOCKS_NOT_A_REPLY } from "./vendor/src/features/blocks/worker.js";
import { notebookReadForReply } from "./vendor/src/features/notebook/worker.js";
import {
  combinedTurnWanted,
  runCombinedTurn,
  igAutoImageForReply as igAutoImageForReplyTyped,
  generateImagePromptText,
  prepareImagePrompt,
  v2LooksForArrivals,
  igGenerateWithComfy,
} from "./vendor/src/features/imagegen/index.js";
import { generateStoryPlanLogic } from "./vendor/src/features/storyplan/ui.js";
import { isMessageArchived, memProcessPendingChunks } from "./vendor/src/features/memory/index.js";
import { meguminFindNpcDossiers, npcParseBlock, npcCreateRecord } from "./vendor/src/features/npc/data.js";
import { npcParseUpdateBlocks, npcApplyUpdates } from "./vendor/src/features/npc/updates.js";
import { maybeMeguminScope } from "./host.js";

/** SillyTavern's generation types, as Megumin reads them. */
export type MeguminReplyType =
  "normal" | "swipe" | "regenerate" | "continue" | "impersonate" | "quiet" | "first_message";

// Megumin's JS defaults (`prepare = null`) infer as `null` types; the calls below pass functions.
const igAutoImageForReply = igAutoImageForReplyTyped as unknown as (...args: unknown[]) => Promise<unknown>;

function later(fn: () => Promise<unknown>, delayMs: number): Promise<unknown> {
  return new Promise((resolve) => setTimeout(() => resolve(fn().catch(() => null)), delayMs));
}

const IMG_TAG_GLOBAL = /<img[^>]*?prompt=(["']?)([\s\S]*?)(?:\1\s*\/?>|\1\s*>|\1\s+[a-zA-Z]+=| \/>|>|$)/gi;

/**
 * MESSAGE_RECEIVED. `index` is the reply's position in the chat. Returns the
 * jobs the reply started (World State/Blocks/Notebook reads, images, the Story
 * Director, Memory); they run on Chomusuke's per-chat queue.
 */
export async function meguminOnReplyReceived(index: number, type: MeguminReplyType = "normal"): Promise<void> {
  if (!suiteEnabled()) return;
  const jobs: Array<Promise<unknown>> = [];
  const chatNow = () => (getContext().chat || []) as any[];

  const replyNow = chatNow()[index];
  const emptyReply = Boolean(
    replyNow &&
    !replyNow.is_user &&
    !replyNow.is_system &&
    !String(cleanAIOutput(String(replyNow.mes || "").replace(/<!--[\s\S]*?-->/g, ""))).trim(),
  );

  // ── World State, first, so everything below sees this reply's outfits ──
  const combinedTurn = emptyReply ? null : combinedTurnWanted(index, type);
  try {
    stateOnMessageReceived(index, type, { skipSideRead: emptyReply || Boolean(combinedTurn && combinedTurn.world) });
    v2LooksForArrivals();
  } catch (e) {
    console.error("[Megumin Suite] World State update failed", e);
  }

  // ── Blocks by Chomusuke ──
  if (!emptyReply && !BLOCKS_NOT_A_REPLY.has(type) && !(combinedTurn && combinedTurn.blocks)) {
    jobs.push(
      blocksReadForReply(index, { force: type === "continue" }).catch((e: unknown) =>
        console.error("[Megumin Suite] Blocks read failed", e),
      ),
    );
  }

  // ── The Notebook by Chomusuke ──
  if (!emptyReply && !BLOCKS_NOT_A_REPLY.has(type) && !(combinedTurn && combinedTurn.notebook)) {
    jobs.push(
      notebookReadForReply(index, { force: type === "continue" }).catch((e: unknown) =>
        console.error("[Megumin Suite] Notebook read failed", e),
      ),
    );
  }

  // ── The automatic image by Chomusuke ──
  if (!emptyReply) {
    jobs.push(
      (combinedTurn
        ? runCombinedTurn(index, type, combinedTurn)
        : igAutoImageForReply(index, type, generateImagePromptText, prepareImagePrompt)
      ).catch((e: unknown) => console.error("[Megumin Suite] Automatic image failed", e)),
    );
  }
  if (combinedTurn && !combinedTurn.image) {
    jobs.push(
      igAutoImageForReply(index, type, generateImagePromptText, prepareImagePrompt).catch((e: unknown) =>
        console.error("[Megumin Suite] Automatic image failed", e),
      ),
    );
  }

  // ── Story Director: the tracker, and the auto-evolve ──
  const sp = localProfile?.storyPlan;
  const spIdentity = meguminActiveDataIdentity();
  if (sp && sp.enabled) {
    const chat = chatNow();
    const lastMsg = chat[chat.length - 1];
    if (lastMsg && !lastMsg.is_user && !lastMsg.is_system) {
      const match = String(lastMsg.mes || "").match(/<Story_Tracker[^>]*>([\s\S]*?)<\/Story_Tracker\s*>/i);
      let needsEvolve = false;
      if (match) {
        sp.lastTrackerState = match[1]!.trim();
        saveProfileToMemory();
        if (sp.triggerMode !== "manual") {
          const status = sp.lastTrackerState.match(
            /(?:directive_status|arc_status):\s*\[?(completed|pivoted|progressing|nearing_completion|nearing_climax)\]?/i,
          );
          if (status && ["completed", "pivoted"].includes(status[1]!.toLowerCase())) needsEvolve = true;
        }
      }
      if (!needsEvolve && sp.triggerMode === "frequency") {
        const aiCount = chat.filter((m) => !m.is_user && !m.is_system).length;
        if (aiCount > 0 && aiCount % sp.autoFreq === 0) needsEvolve = true;
      }
      if (needsEvolve) {
        toastr.info("Auto-Evolving Narrative Directive...", "Story Director");
        jobs.push(
          later(async () => {
            if (meguminActiveDataIdentity() !== spIdentity) return;
            const chatText = getChatForStoryDirector();
            if (chatText.length < 100) return;
            try {
              const output: string | null = await runWithChomusuke("storyPlan", () => generateStoryPlanLogic(chatText));
              if (meguminActiveDataIdentity() !== spIdentity) return;
              const directive =
                output?.match(/<directive>([\s\S]*?)<\/directive>/i) || output?.match(/<plot>([\s\S]*?)<\/plot>/i);
              if (directive) {
                sp.currentPlan = directive[1]!.trim();
                sp.planMessageIndex = (chatNow().length || 1) - 1;
                saveProfileToMemory();
                toastr.success("Narrative Directive Evolved silently!", "Story Director");
              } else if (output !== null) {
                warnChomusuke(answerKind(output), ["storyPlan"], {});
              }
            } catch (e) {
              warnChomusuke("failed", ["storyPlan"], { error: e });
            }
          }, 2000),
        );
      }
    }
  }

  // ── Memory: the automatic scan ──
  const mem = localProfile?.memoryCore;
  if (mem && mem.enabled && (mem.triggerMode === "frequency" || mem.triggerMode === "every")) {
    const chat = chatNow();
    const aiCount = chat.filter((m) => !m.is_user && !m.is_system).length;
    const freq = mem.triggerMode === "every" ? 1 : mem.autoFreq || 10;
    if (aiCount > 0 && aiCount % freq === 0) {
      const workingLimit = mem.workingLimit || 30;
      const chunkSize = mem.chunkSize || 10;
      const real: Array<{ originalIndex: number }> = [];
      chat.forEach((m, i) => {
        if (!m.is_system) real.push({ originalIndex: i });
      });
      let hasWork = false;
      if (real.length > workingLimit) {
        const archivable = real.slice(0, real.length - workingLimit);
        hasWork = archivable.filter((item) => !isMessageArchived(item.originalIndex, mem)).length >= chunkSize;
      }
      if (hasWork) {
        toastr.info("Background Memory Scan Triggered...", "Megumin Suite");
        jobs.push(later(() => memProcessPendingChunks(true), 3000));
      }
    }
  }

  // ── NPC Bank: new dossiers and updates in the reply ──
  const npcBank = localProfile?.npcBank;
  if (npcBank && npcBank.enabled) {
    const chat = chatNow();
    const lastMsg = chat[chat.length - 1];
    if (lastMsg && !lastMsg.is_user && !lastMsg.is_system) {
      let added = false;
      for (const dossier of meguminFindNpcDossiers(lastMsg.mes)) {
        if (!npcBank.npcs) npcBank.npcs = [];
        const name = String(dossier.name || "");
        if (
          !npcBank.npcs.find(
            (n: any) =>
              String(n.name || "")
                .trim()
                .toLowerCase() === name.toLowerCase(),
          )
        ) {
          npcBank.npcs.push(
            npcCreateRecord({ parsed: npcParseBlock(dossier.raw), name, messageIndex: chat.length - 1 }),
          );
          added = true;
          toastr.success(`NPC added to Bank: ${name}`, "Megumin Suite");
        }
      }
      const updates = npcParseUpdateBlocks(lastMsg.mes);
      if (updates.length) {
        const { applied } = npcApplyUpdates(updates, { messageIndex: chat.length - 1 });
        if (applied.length) {
          added = true;
          const who = [...new Set(applied.map((e: any) => e.npc))].join(", ");
          toastr.info(
            applied
              .map((e: any) => `${e.label}: ${e.op === "+" ? "added" : e.op === "-" ? "removed" : "replaced"}`)
              .join(" · "),
            `Megumin Suite — ${who} updated`,
          );
        }
      }
      if (added) saveProfileToMemory();
    }
  }

  // ── Images the story model wrote in its reply (<img prompt="…">) ──
  const ig = localProfile?.imageGen;
  if (ig && ig.enabled) {
    const chat = chatNow();
    const msgIndex = chat.length - 1;
    const lastMsg = chat[msgIndex];
    if (lastMsg && !lastMsg.is_user && !lastMsg.is_system) {
      const all = [...String(lastMsg.mes || "").matchAll(IMG_TAG_GLOBAL)];
      const lastThinkEnd = String(lastMsg.mes || "").lastIndexOf("</think>");
      const matches = all.filter((m) => (m.index ?? 0) > lastThinkEnd);
      if (matches.length > 0) {
        const injectMode = ig.injectMode || "new_msg";
        const batchId = Date.now();
        let modified = String(lastMsg.mes);
        for (let i = matches.length - 1; i >= 0; i--) {
          const m = matches[i]!;
          const id = `kazuma-img-${batchId}-${i}`;
          const placeholder = `<div id="${id}" class="kazuma-img-placeholder" style="color:var(--gold); font-style: italic; margin: 10px 0;">[Generating Image...]</div>`;
          const at = m.index ?? 0;
          modified =
            injectMode === "inline"
              ? modified.substring(0, at) + placeholder + modified.substring(at + m[0].length)
              : modified.substring(0, at) + modified.substring(at + m[0].length);
        }
        lastMsg.mes = modified.trim();
        const scope = maybeMeguminScope();
        if (scope) scope.chat.dirty.chat = true;
        matches.forEach((m, idx) => {
          jobs.push(
            later(
              () =>
                igGenerateWithComfy(m[2] || "", {
                  message: lastMsg,
                  index: msgIndex,
                  mode: injectMode,
                  isInlineAuto: true,
                  placeholderId: `kazuma-img-${batchId}-${idx}`,
                }),
              500 + idx * 1500,
            ),
          );
        });
      }
    }
  }

  await Promise.allSettled(jobs);
}

/** MESSAGE_SWIPED. */
export function meguminOnSwiped(index: number): boolean {
  return Boolean(stateOnSwiped(index));
}

/** MESSAGE_SWIPE_DELETED. */
export function meguminOnSwipeDeleted(index: number, swipeId: number): boolean {
  return Boolean(stateOnSwipeDeleted({ messageId: index, swipeId }));
}

/** MESSAGE_EDITED. */
export function meguminOnEdited(index: number): boolean {
  return Boolean(stateOnEdited(index));
}

/** MESSAGE_DELETED: rewinding prunes what belonged to the removed messages. */
export function meguminOnDeleted(): boolean {
  pruneFutureData();
  return Boolean(stateOnDeleted());
}

/** CHAT_CHANGED (the chat was opened): stamp, square and, once, import the World State. */
export function meguminOnChatLoaded(): boolean {
  return Boolean(stateOnChatLoaded());
}
