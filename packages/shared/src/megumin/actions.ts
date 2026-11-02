// ──────────────────────────────────────────────────────────────────────────────
// Megumin Suite's buttons, as functions.
//
// In SillyTavern these are the bodies of the settings window's click handlers
// (npc/ui.js, banlist/ui.js, storyconfig/ui.js, storyplan/ui.js,
// modelsetup/ui.js, ui/tabs/chomusuke.js). YunYun's panel calls them through
// the server, inside the chat's scope; each keeps Megumin's own steps and
// wording, and returns what happened instead of redrawing jQuery.
// Derived from Megumin Suite (CC BY-NC 4.0, see LICENSE.md).
// ──────────────────────────────────────────────────────────────────────────────
import {
  generateQuietPrompt,
  getContext,
  extension_settings,
  toastr,
  saveSettingsDebounced,
  meguminConsole,
} from "./vendor/src/st.js";
import { localProfile } from "./vendor/src/core/state.js";
import { extensionName } from "./vendor/src/core/constants.js";
import { meguminActiveDataIdentity } from "./vendor/src/core/keys.js";
import { saveProfileToMemory } from "./vendor/src/core/profile.js";
import {
  setActiveNpcScanRequest,
  setActiveNpcUpdateRequest,
  setActiveNpcPfpRequest,
} from "./vendor/src/core/activeRequests.js";
import {
  getChatForNpcScan,
  getCleanedChatHistory,
  cleanAIOutput,
  getChatForStoryDirector,
} from "./vendor/src/engine/chatText.js";
import { runWithChomusuke, runMeguminTask, analyzeSlopDirectly } from "./vendor/src/engine/tasks.js";
import { warnChomusuke, answerKind } from "./vendor/src/engine/chomusukeNotice.js";
import {
  meguminFindNpcDossiers,
  npcParseBlock,
  npcCreateRecord,
  npcBuildTextFromData,
} from "./vendor/src/features/npc/data.js";
import { npcBuildUpdatePrompt } from "./vendor/src/features/npc/fields.js";
import { npcParseUpdateBlocks, npcApplyUpdates, npcUndoHistoryEntry } from "./vendor/src/features/npc/updates.js";
import { maybeMeguminScope } from "./host.js";
import { generateStoryPlanLogic } from "./vendor/src/features/storyplan/ui.js";
import { memProcessPendingChunks } from "./vendor/src/features/memory/index.js";
import { storyConfigFields, upgradeConfigValue } from "./vendor/src/features/storyconfig/config.js";
import { LOADOUTS, applyLoadout, loadoutById, settingFor } from "./vendor/src/features/modelsetup/loadouts.js";
import { applyTabKeysToAllProfiles, meguminIsTabSynced } from "./vendor/src/core/sync.js";
import { hardcodedLogic } from "./vendor/data/database.js";
import { igManualGenerate } from "./vendor/src/features/imagegen/index.js";
import { blocksReadForReply } from "./vendor/src/features/blocks/worker.js";
import { notebookReadForReply } from "./vendor/src/features/notebook/worker.js";
import { worldExtractMessage } from "./vendor/src/state/index.js";

const chatNow = () => (getContext().chat || []) as any[];
const lastIndex = () => Math.max(0, chatNow().length - 1);

// ── NPC Bank ──────────────────────────────────────────────────────────────

/** "Scan Story": dossiers for significant NPCs the bank does not have yet. */
export async function meguminNpcScanStory(): Promise<{ added: number }> {
  const chatText = getChatForNpcScan();
  if (chatText.length < 100) {
    toastr.warning("Not enough chat history to scan.");
    return { added: 0 };
  }
  const msgIndex = lastIndex();
  const existingNames = (localProfile.npcBank.npcs || []).map((n: any) => n.name).join(", ");
  try {
    const rawOutput = await runWithChomusuke("npc", () => {
      setActiveNpcScanRequest({ chatText, existingNames });
      return generateQuietPrompt({ prompt: "___PS_NPC_SCAN___" });
    });
    let added = 0;
    for (const dossier of meguminFindNpcDossiers(rawOutput)) {
      const name = String(dossier.name || "");
      if (!localProfile.npcBank.npcs) localProfile.npcBank.npcs = [];
      if (
        !localProfile.npcBank.npcs.find(
          (n: any) =>
            String(n.name || "")
              .trim()
              .toLowerCase() === name.toLowerCase(),
        )
      ) {
        localProfile.npcBank.npcs.push(
          npcCreateRecord({ parsed: npcParseBlock(dossier.raw), name, messageIndex: msgIndex }),
        );
        added++;
      }
    }
    if (added > 0) {
      saveProfileToMemory();
      toastr.success(`Found and added ${added} new NPC(s)!`);
    } else {
      toastr.info("No new significant NPCs found in the story.");
    }
    return { added };
  } catch {
    toastr.error("Failed to scan story for NPCs.");
    return { added: 0 };
  } finally {
    setActiveNpcScanRequest(null);
  }
}

/** "+" on the bank: an empty record, created at the latest message so a rewind past it removes it. */
export function meguminNpcAdd(name: string): boolean {
  const trimmed = String(name || "").trim();
  if (!trimmed) return false;
  if (!localProfile.npcBank.npcs) localProfile.npcBank.npcs = [];
  if (
    localProfile.npcBank.npcs.find(
      (n: any) =>
        String(n.name || "")
          .trim()
          .toLowerCase() === trimmed.toLowerCase(),
    )
  ) {
    toastr.warning(`"${trimmed}" is already in the bank.`);
    return false;
  }
  localProfile.npcBank.npcs.push(npcCreateRecord({ name: trimmed, messageIndex: lastIndex() }));
  saveProfileToMemory();
  toastr.success(`"${trimmed}" added. Open the card to fill in the details.`);
  return true;
}

/** The refresh button on an NPC card: ask about this one NPC against their whole record. */
export async function meguminNpcUpdateNow(index: number): Promise<{ applied: number }> {
  const target = localProfile.npcBank.npcs?.[index];
  if (!target) return { applied: 0 };
  const rules = npcBuildUpdatePrompt();
  if (!rules) {
    toastr.info("No field is marked Updatable, so there is nothing an update could change.", "Megumin Suite");
    return { applied: 0 };
  }
  const identity = meguminActiveDataIdentity();
  const request = { npcName: target.name, npcText: npcBuildTextFromData(target), chatText: getChatForNpcScan(), rules };
  try {
    const raw = await runWithChomusuke("npc", () => {
      setActiveNpcUpdateRequest(request);
      return generateQuietPrompt({ prompt: "___PS_NPC_UPDATE___" });
    });
    const cleaned = String(raw || "")
      .replace(/<think>[\s\S]*?<\/think>/g, "")
      .trim();
    if (meguminActiveDataIdentity() !== identity) return { applied: 0 };
    const updates = npcParseUpdateBlocks(cleaned);
    if (!updates.length) {
      toastr.info(`Nothing on ${target.name}'s record has changed.`, "Megumin Suite");
      return { applied: 0 };
    }
    updates.forEach((u: any) => {
      u.name = target.name;
    });
    const { applied } = npcApplyUpdates(updates, { messageIndex: lastIndex() });
    if (applied.length) {
      saveProfileToMemory();
      toastr.success(
        applied
          .map((a: any) => `${a.label}: ${a.op === "+" ? "added" : a.op === "-" ? "removed" : "replaced"}`)
          .join(" · "),
        `Megumin Suite — ${target.name} updated`,
      );
    } else {
      toastr.info(`Nothing on ${target.name}'s record has changed.`, "Megumin Suite");
    }
    return { applied: applied.length };
  } catch {
    toastr.error(`Could not update ${target.name}.`);
    return { applied: 0 };
  } finally {
    setActiveNpcUpdateRequest(null);
  }
}

/** Undo one change in an NPC's update history (and the later changes to the same field). */
export function meguminNpcUndo(entryId: string): { npc: string; label: string; alsoDropped: number } | null {
  const result = npcUndoHistoryEntry(entryId);
  if (result) saveProfileToMemory();
  return result;
}

/** The portrait button: a picture of this NPC drawn from their dossier. */
/**
 * An NPC portrait, step 1 (features/npc/pfp.js npcGeneratePfp): the model writes the portrait prompt, which
 * the panel shows for review before anything is drawn. Megumin asks for a ComfyUI workflow file here;
 * YunYun's image connection holds the workflow, so only Images being on is required.
 */
export async function meguminNpcPortraitPrompt(npcName: string): Promise<{ prompt: string }> {
  const s = (localProfile as any).imageGen;
  if (!s || !s.enabled) {
    toastr.warning("Turn on Images and pick an image connection in the Images tab first.");
    return { prompt: "" };
  }
  const npc = ((localProfile as any).npcBank?.npcs || []).find((n: any) => n.name === npcName);
  if (!npc) return { prompt: "" };
  const styleStr =
    s.promptStyle === "illustrious"
      ? "Use Danbooru-style tags separated by commas. Focus on anime art style."
      : s.promptStyle === "sdxl"
        ? "Use natural, descriptive prose and full sentences. Focus on photorealism."
        : "Use a comma-separated list of detailed keywords and visual descriptors.";
  const perspStr =
    "This is a CHARACTER PORTRAIT. Frame it as an upper-body/bust shot focused on the character's face and shoulders. Soft, flattering lighting. Clean or simple background. Capture their personality through expression and posture.";
  setActiveNpcPfpRequest({
    npcName,
    npcText: npcBuildTextFromData(npc),
    styleStr,
    perspStr,
    extraStr: s.promptExtra || "None",
  });
  try {
    const raw = String((await generateQuietPrompt({ prompt: "___PS_NPC_PFP___" })) || "");
    let prompt = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    const match = prompt.match(/<img[^>]*?prompt=(["']?)([\s\S]*?)(?:\1\s*\/?>|\1\s*>|\1\s+[a-zA-Z]+=| \/>|>|$)/i);
    if (match) prompt = match[2] ?? "";
    if (!prompt || prompt.length < 5) {
      toastr.error("AI returned an empty prompt.");
      return { prompt: "" };
    }
    return { prompt };
  } catch (e) {
    meguminConsole.error("NPC PFP prompt generation failed:", e);
    toastr.error("Failed to generate portrait prompt.");
    return { prompt: "" };
  } finally {
    setActiveNpcPfpRequest(null);
  }
}

/** An NPC portrait, step 2: the reviewed prompt drawn at 512×512 and stored on the dossier. */
export async function meguminNpcPortraitRender(npcName: string, prompt: string): Promise<{ ok: boolean }> {
  const s = ((localProfile as any).imageGen || {}) as Record<string, any>;
  const text = String(prompt || "").trim();
  if (!text) {
    toastr.warning("Prompt cannot be empty.");
    return { ok: false };
  }
  const scope = maybeMeguminScope();
  if (!scope?.chat.renderImage) {
    toastr.warning("Images are not available here.", "Megumin Suite");
    return { ok: false };
  }
  const identity = meguminActiveDataIdentity();
  const loraTriggers = [
    [s.selectedLora, s.loraTrigger1],
    [s.selectedLora2, s.loraTrigger2],
    [s.selectedLora3, s.loraTrigger3],
    [s.selectedLora4, s.loraTrigger4],
  ]
    .filter(([lora, trigger]) => lora && String(lora).trim() && trigger)
    .map(([, trigger]) => String(trigger).trim());
  let finalPrompt = text;
  if (loraTriggers.length) {
    let combined = loraTriggers.join(", ");
    if (!combined.endsWith(",")) combined += ",";
    if (!finalPrompt.includes(combined)) finalPrompt = `${combined} ${finalPrompt}`;
  }
  if (s.promptPrefix && String(s.promptPrefix).trim()) {
    let prefix = String(s.promptPrefix).trim();
    if (!prefix.endsWith(",")) prefix += ",";
    if (!finalPrompt.startsWith(prefix)) finalPrompt = `${prefix} ${finalPrompt}`;
  }
  toastr.info("Rendering the portrait...", "NPC Bank");
  const image = await scope.chat.renderImage({
    prompt: finalPrompt,
    negative: String(s.customNegative || ""),
    settings: JSON.parse(JSON.stringify(s)),
    width: 512,
    height: 512,
  });
  if (!image) return { ok: false };
  // The chat may have changed while it drew: the portrait belongs to the chat it was asked for in.
  if (meguminActiveDataIdentity() !== identity) {
    toastr.warning("The chat changed while the portrait was drawn, so it was not saved.", "NPC Bank");
    return { ok: false };
  }
  const npc = ((localProfile as any).npcBank?.npcs || []).find((n: any) => n.name === npcName);
  if (!npc) return { ok: false };
  npc.pfp = `data:${image.mime};base64,${image.base64}`;
  saveProfileToMemory();
  toastr.success(`Portrait for ${npcName} is ready!`, "NPC Bank");
  return { ok: true };
}

// ── Banned Phrases ────────────────────────────────────────────────────────

/** "Analyze Chat History": the phrases the model keeps repeating, added to the list. */
export async function meguminBanListScan(): Promise<{ added: number }> {
  const chatText = getCleanedChatHistory();
  if (chatText.length < 50) {
    toastr.warning("Not enough chat history to analyze!");
    return { added: 0 };
  }
  const raw = await runWithChomusuke("banList", () => analyzeSlopDirectly(chatText));
  if (!raw) return { added: 0 };
  if (!localProfile.banList) localProfile.banList = [];
  const phrases = String(raw)
    .split(/[,*\n-]/)
    .map((t) => t.trim().replace(/['"[\].]/g, ""))
    .filter((t) => t.length > 3);
  let added = 0;
  for (const p of phrases) {
    if (!localProfile.banList.includes(p)) {
      localProfile.banList.push(p);
      added++;
    }
  }
  if (added > 0) {
    saveProfileToMemory();
    toastr.success(`Caught and banned ${added} repetitive phrases!`);
  } else {
    toastr.info("No new repetitive phrases found.");
  }
  return { added };
}

// ── Writing Style generator (the Megumin Engine prompt) ───────────────────

/** "Generate This Style" on a template: a new custom style, put in use. */
export async function meguminGenerateTemplateStyle(templateName: string): Promise<boolean> {
  const tpl = (hardcodedLogic.styleTemplates as any[]).find((t) => t.name === templateName);
  if (!tpl) return false;
  const out = await runWithChomusuke("styleGen", async () => {
    const orderText = `Inspired by ${tpl.notes}. Write a writing style rule based on: ${tpl.tags.join(", ")}. Direct instructions only. 2-3 paragraphs. No fluff.`;
    const rule = await runMeguminTask(orderText);
    const id = "style_" + Date.now();
    const style = {
      id,
      name: tpl.name,
      tags: [...tpl.tags],
      notes: tpl.notes,
      rule: String(cleanAIOutput(rule)).trim(),
    };
    if (!Array.isArray(localProfile.customStyles)) localProfile.customStyles = [];
    localProfile.customStyles.push(style);
    localProfile.activeStyleId = id;
    localProfile.aiRule = style.rule;
    saveProfileToMemory();
    toastr.success(`${tpl.name} Added!`);
    return rule;
  });
  return Boolean(out);
}

/** The regenerate button on a custom style. */
export async function meguminRegenerateStyle(styleId: string): Promise<boolean> {
  const style = (localProfile.customStyles || []).find((s: any) => s.id === styleId);
  if (!style) return false;
  const out = await runWithChomusuke("styleGen", async () => {
    const orderText = `Inspired by ${style.notes}. Write a writing style rule based on: ${(style.tags || []).join(", ")}. Direct instructions only. 2-3 paragraphs. No fluff.`;
    const rule = await runMeguminTask(orderText);
    style.rule = String(cleanAIOutput(rule)).trim();
    if (localProfile.activeStyleId === style.id) localProfile.aiRule = style.rule;
    saveProfileToMemory();
    toastr.success("Rule Regenerated!");
    return rule;
  });
  return Boolean(out);
}

/** "Generate Insights": two author styles and five tags that fit this story. */
export async function meguminStyleInsights(): Promise<string[]> {
  let tags: string[] = [];
  await runWithChomusuke("styleGen", async () => {
    const orderText = `Based on the active characters and scenario, give me EXACTLY 2 famous author names or literary writing styles (e.g. Edgar Allan Poe, Jane Austen style, Dark Fantasy Author) and 5 tags that fit the rp (e.g. internet culture, femboy, virtual game) whose writing style perfectly fits the tone and world. Return ONLY the 7 items separated by a comma. Do not explain them.`;
    const raw = await runMeguminTask(orderText);
    tags = String(cleanAIOutput(raw))
      .split(",")
      .map((t) => t.trim().replace(/['"[\].]/g, ""))
      .filter((t) => t.length > 0);
    return raw;
  });
  return tags;
}

/** "Generate Writing Rule": one rule from the picked tags and notes. */
export async function meguminStyleRule(tags: string[], notes: string): Promise<string> {
  let out = "";
  await runWithChomusuke("styleGen", async () => {
    const orderText = `Create a writing style prompt based on these traits:\n\nSelected style tags: ${tags.join(", ")}\n\nAdditional user instructions: ${notes}\n\nWrite a concise, well-structured writing style rule (100 words max) that the AI must follow. Combine all tags into a cohesive directive. Write it as a direct instruction. Do not use bullet points or introductory text.`;
    const rule = await runMeguminTask(orderText);
    out = String(cleanAIOutput(rule)).trim();
    return rule;
  });
  return out;
}

// ── Story Director ────────────────────────────────────────────────────────

/** "Generate" / "Evolve": a new directive from the story so far. */
export async function meguminStoryPlanGenerate(): Promise<{ plan: string } | null> {
  const sp = localProfile.storyPlan;
  const chatText = getChatForStoryDirector();
  if (chatText.length < 100) {
    toastr.warning("Not enough chat history for the Story Director yet.");
    return null;
  }
  const identity = meguminActiveDataIdentity();
  const output: string | null = await runWithChomusuke("storyPlan", () => generateStoryPlanLogic(chatText));
  if (meguminActiveDataIdentity() !== identity) return null;
  const directive = output?.match(/<directive>([\s\S]*?)<\/directive>/i) || output?.match(/<plot>([\s\S]*?)<\/plot>/i);
  if (!directive) {
    if (output !== null) warnChomusuke(answerKind(output), ["storyPlan"], {});
    return null;
  }
  sp.currentPlan = directive[1]!.trim();
  sp.planMessageIndex = lastIndex();
  saveProfileToMemory();
  toastr.success("Narrative Directive Generated!", "Story Director");
  return { plan: sp.currentPlan };
}

// ── Memory ────────────────────────────────────────────────────────────────

/** "Apply & Extract Pending": summarise every chunk past the working window. */
export async function meguminMemoryProcess(): Promise<void> {
  await memProcessPendingChunks(false);
}

// ── Model Setup ───────────────────────────────────────────────────────────

const lengthField = () => (storyConfigFields as any[]).find((f) => f.key === "length");
const LOADOUT_CTX = {
  lengthLabel(v: string) {
    const f = lengthField();
    const value = upgradeConfigValue(f, v || "");
    if (!value) return "";
    const o = f.options.find((x: any) => x.value === value);
    return o ? o.label : "custom";
  },
  lengthValue(label: string) {
    const o = lengthField().options.find((x: any) => x.label === label);
    return o ? o.value : label;
  },
};

export function meguminLoadouts(): unknown[] {
  return LOADOUTS as unknown[];
}

/** "Use this loadout": every character (default), or only this one. */
/** The tab each loadout setting lives on (features/modelsetup/ui.js TABS). */
const LOADOUT_TABS: Record<string, string> = {
  preset: "Preset & Thinking",
  banlist: "Banned Phrases",
  addons: "Language & Add-ons",
  chomusuke: "Chomusuke",
  style: "Writing Style",
};

/**
 * "Use this loadout" (features/modelsetup/ui.js): on every character, or on this one only, in which case
 * the touched tabs that are set to Global still go to every character, as an edit there would. The panel
 * shows the result itself. Returns the tabs that went everywhere.
 */
export function meguminApplyLoadout(
  id: string,
  opts: { onlyThisCharacter?: boolean; settings?: Record<string, unknown> } = {},
): { applied: boolean; sent: string[] } {
  const loadout = loadoutById(id);
  if (!loadout) return { applied: false, sent: [] };
  const settings = opts.settings || loadout.settings;
  if (!opts.onlyThisCharacter) {
    Object.values(extension_settings[extensionName].profiles || {}).forEach((p: any) =>
      applyLoadout(p, loadout, LOADOUT_CTX, settings, { skipGlobal: true }),
    );
    saveSettingsDebounced();
  }
  const styleBefore = (localProfile as any).activeStyleId;
  applyLoadout(localProfile, loadout, LOADOUT_CTX, settings);
  saveProfileToMemory();
  if (!opts.onlyThisCharacter) return { applied: true, sent: [] };
  const tabs = new Set(
    Object.keys(settings)
      .map((key) => settingFor(key) as { global?: boolean; tab?: string } | null)
      .filter((s) => s && !s.global && s.tab)
      .map((s) => s!.tab as string),
  );
  if ((localProfile as any).activeStyleId !== styleBefore) tabs.add("style");
  const sent = [...tabs]
    .map((tab) => LOADOUT_TABS[tab])
    .filter((title): title is string => !!title && meguminIsTabSynced(title) && applyTabKeysToAllProfiles(title));
  return { applied: true, sent };
}

// ── Chomusuke ─────────────────────────────────────────────────────────────

/** The Test button: one tiny call on Chomusuke's connection. */
export async function meguminChomusukeTest(): Promise<{ ok: boolean; reply: string }> {
  const reply = await runWithChomusuke(
    "test",
    async () => {
      const r = await generateQuietPrompt({
        prompt: "Reply with the single word: OK",
        quietPrompt: "Reply with the single word: OK",
      });
      return String(r || "");
    },
    { force: true },
  );
  const text = String(reply || "").trim();
  return { ok: Boolean(text), reply: text.slice(0, 200) };
}

// ── Cards: Read again ─────────────────────────────────────────────────────

export async function meguminReadAgain(kind: "world" | "blocks" | "notebook", index: number): Promise<boolean> {
  if (kind === "world") return Boolean(await worldExtractMessage(index, { force: true }));
  if (kind === "blocks") return Boolean(await blocksReadForReply(index, { force: true }));
  return Boolean(await notebookReadForReply(index, { force: true }));
}

// ── Images ────────────────────────────────────────────────────────────────

/** The image button: a picture of the scene as it stands. */
export async function meguminGenerateImage(extraInstruction = ""): Promise<boolean> {
  return igManualGenerate(extraInstruction);
}
