// YunYun override of Megumin Suite src/features/imagegen/index.js: the same
// entry points, minus the jQuery tab (YunYun's Images tab is React).
// Derived from Megumin Suite (CC BY-NC 4.0, see LICENSE.md).
import { localProfile } from "../../core/state.js";
import { setActiveImageGenRequest } from "../../core/activeRequests.js";
import { toastr } from "../../st.js";
import { runWithChomusuke } from "../../engine/tasks.js";
import { igGenerateWithComfy, setImagePromptResolver } from "./comfy.js";
import { classicGenerateImagePromptText, classicInlineNpcTags } from "./classic/prompt.js";
import { v2GenerateImagePromptText, v2InlineInstruction, v2InlineSplit, v2ResolveForComfy, v2PrepareImagePrompt } from "./v2/index.js";
import { imageGenEngine } from "./engineChoice.js";

export { igGenerateWithComfy, addKazumaRetryButtons, kazumaRetrySweep } from "./comfy.js";
export { imageGenSelectedEngine, imageGenEngine } from "./engineChoice.js";
export { imageViaChomusuke, igAutoImageForReply } from "./auto.js";
export { combinedTurnWanted, runCombinedTurn } from "./combinedTurn.js";
export { v2LooksForArrivals } from "./v2/looks.js";

setImagePromptResolver((p) => (imageGenEngine() === "v2" ? v2ResolveForComfy(p) : p));

export async function prepareImagePrompt(): Promise<void> {
  if (imageGenEngine() === "v2") await v2PrepareImagePrompt();
}

export async function generateImagePromptText(opts: Record<string, unknown> = {}): Promise<string> {
  return imageGenEngine() === "v2" ? v2GenerateImagePromptText(opts) : classicGenerateImagePromptText(opts);
}

/** The NPC tag section for the Classic inline [[img1]] instruction. */
export function imageInjectionNpcTags(): string {
  return imageGenEngine() === "v2" ? "" : classicInlineNpcTags();
}

/** V2 replaces the whole inline instruction; null on Classic. */
export function imageV2InlineInstruction(opts: Record<string, unknown>): string | null {
  return imageGenEngine() === "v2" ? v2InlineInstruction(opts) : null;
}

/** V2's instruction split for the V11 preset; null on Classic. */
export function imageV2InlineSplit(opts: Record<string, unknown>): { rules: string; turn: string } | null {
  return imageGenEngine() === "v2" ? v2InlineSplit(opts) : null;
}

const IMG_TAG = /<img[^>]*?prompt=(["']?)([\s\S]*?)(?:\1\s*\/?>|\1\s*>|\1\s+[a-zA-Z]+=| \/>|>|$)/i;

/** The image button: write a prompt for the current scene and draw it. */
export async function igManualGenerate(extraInstruction = ""): Promise<boolean> {
  const s = localProfile?.imageGen;
  if (!s || !s.enabled) return false;
  try {
    await prepareImagePrompt();
    let promptText = await runWithChomusuke("imageGen", () => generateImagePromptText({ extraInstruction }));
    const match = String(promptText || "").match(IMG_TAG);
    if (match) promptText = match[2] ?? "";
    if (!String(promptText || "").trim()) {
      toastr.error("The model's answer came back empty, so no image was made.", "Megumin Suite");
      return false;
    }
    await igGenerateWithComfy(String(promptText), null);
    return true;
  } catch (e) {
    toastr.error(`Manual generation failed: ${String((e as Error)?.message || e)}`, "Megumin Suite");
    return false;
  } finally {
    setActiveImageGenRequest(null);
  }
}

export function renderImageGen(): void {}
