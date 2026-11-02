// YunYun override of Megumin Suite src/features/imagegen/comfy.js.
//
// Megumin sends its prompt to a ComfyUI workflow from the browser. YunYun draws
// through its own image generation (any image connection: ComfyUI, NovelAI,
// SD WebUI, OpenAI…), on the server. Kept from Megumin: the prompt every image
// goes through (V2's @Name resolution), the LoRA trigger words and the prefix,
// and where the finished image lands (inline in place of its placeholder, on
// the message, or after the chat).
// Derived from Megumin Suite (CC BY-NC 4.0, see LICENSE.md).
import { localProfile } from "../../core/state.js";
import { toastr } from "../../st.js";
import { maybeMeguminScope } from "../../../../host.js";

let promptResolver: (p: string) => string | Promise<string> = (p) => p;

/** Every image goes through this before it is drawn (V2: @Name → the stored look). */
export function setImagePromptResolver(fn: (p: string) => string | Promise<string>): void {
  promptResolver = fn;
}

export async function igGenerateWithComfy(positivePrompt: string, target: any = null): Promise<void> {
  const s = localProfile.imageGen || {};
  let finalPrompt = String((await promptResolver(positivePrompt)) || "");

  const loraTriggers: string[] = [];
  if (s.selectedLora && String(s.selectedLora).trim() !== "" && s.loraTrigger1) loraTriggers.push(String(s.loraTrigger1).trim());
  if (s.selectedLora2 && String(s.selectedLora2).trim() !== "" && s.loraTrigger2) loraTriggers.push(String(s.loraTrigger2).trim());
  if (s.selectedLora3 && String(s.selectedLora3).trim() !== "" && s.loraTrigger3) loraTriggers.push(String(s.loraTrigger3).trim());
  if (s.selectedLora4 && String(s.selectedLora4).trim() !== "" && s.loraTrigger4) loraTriggers.push(String(s.loraTrigger4).trim());
  if (loraTriggers.length > 0) {
    let combined = loraTriggers.join(", ");
    if (!combined.endsWith(",")) combined += ",";
    if (!finalPrompt.includes(combined)) finalPrompt = combined + " " + finalPrompt;
  }
  if (s.promptPrefix && String(s.promptPrefix).trim() !== "") {
    let prefix = String(s.promptPrefix).trim();
    if (!prefix.endsWith(",")) prefix += ",";
    if (!finalPrompt.startsWith(prefix)) finalPrompt = prefix + " " + finalPrompt;
  }
  finalPrompt = finalPrompt.trim();
  if (!finalPrompt) {
    toastr.warning("The image prompt came back empty, so no image was made.", "Megumin Suite");
    return;
  }

  const scope = maybeMeguminScope();
  if (!scope?.chat.generateImage) {
    toastr.warning("Images are not available here.", "Megumin Suite");
    return;
  }
  await scope.chat.generateImage({
    prompt: finalPrompt,
    negative: String(s.customNegative || ""),
    settings: JSON.parse(JSON.stringify(s)),
    target: target
      ? {
          messageId: target.message?.id ?? null,
          mode: target.mode ?? null,
          isInlineAuto: Boolean(target.isInlineAuto),
          placeholderId: target.placeholderId ?? null,
          restoreHtml: target.restoreHtml ?? null,
        }
      : null,
  });
}

// SillyTavern's retry buttons on inline images: YunYun's client draws its own.
export function addKazumaRetryButtons(..._args: unknown[]): void {}
export function kazumaRetrySweep(..._args: unknown[]): void {}
export async function igFetchComfyLists(): Promise<void> {}
export function toggleQuickGenButton(): void {}
export async function igTestConnection(): Promise<void> {}
export function igPopulateWorkflows(): void {}
export function igNewWorkflowClick(): void {}
export function igDeleteWorkflowClick(): void {}
export function igOpenWorkflowEditorClick(): void {}
