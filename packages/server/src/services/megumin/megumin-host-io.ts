// ──────────────────────────────────────────────
// Megumin Suite: what its engine asks of the outside world
// ──────────────────────────────────────────────
// Quiet prompts (Chomusuke's jobs, or the story's own connection), lorebook
// lookups, embeddings and images — answered with YunYun's own connections,
// lorebooks, embedding sources and image generation.
import {
  MeguminInjection,
  MeguminWorker,
  type MeguminChatMessage,
  type MeguminChatScope,
  type MeguminImageRequest,
  type MeguminImageRenderRequest,
  type MeguminLoreEntry,
  type MeguminRunState,
} from "@marinara-engine/shared/megumin";
import type { DB } from "../../db/connection.js";
import { logger, logDebugOverride } from "../../lib/logger.js";
import { isDebugAgentsEnabled } from "../../config/runtime-config.js";
import { createCapabilityLanguageModelHost } from "../capability-packages/capability-language-model.service.js";
import { createChatsStorage } from "../storage/chats.storage.js";
import { createLorebooksStorage } from "../storage/lorebooks.storage.js";
import { createConnectionsStorage } from "../storage/connections.storage.js";
import { createGalleryStorage } from "../storage/gallery.storage.js";
import { resolveMemoryRecallEmbeddingSource } from "../memory-recall-embedding.js";
import { resolveConnectionImageDefaults } from "../image/image-generation-defaults.js";

export interface HostIoContext {
  chatId: string;
  chatConnectionId: string | null;
  chatMetadata: Record<string, unknown>;
  characterIds: string[];
  personaId: string | null;
}

const QUIET_MAX_TOKENS = 4096;

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function parseRecord(value: unknown): Record<string, any> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, any>;
  if (typeof value !== "string" || !value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, any>) : {};
  } catch {
    return {};
  }
}

/** Megumin's ComfyUI options, written into a workflow's own placeholders before YunYun fills %prompt% and the rest. */
export function applyMeguminComfyPlaceholders(workflow: string, s: Record<string, any>): string {
  const num = (v: unknown, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const values: Record<string, string | number> = {
    "%sampler%": String(s.selectedSampler || "euler"),
    "%model%": String(s.selectedModel || ""),
    "%steps%": Math.trunc(num(s.steps, 20)),
    "%scale%": num(s.cfg, 7),
    "%denoise%": num(s.denoise, 1),
    "%clip_skip%": -Math.abs(Math.trunc(num(s.clipSkip, 1))) || -1,
    "%lora1%": String(s.selectedLora || "None"),
    "%lora2%": String(s.selectedLora2 || "None"),
    "%lora3%": String(s.selectedLora3 || "None"),
    "%lora4%": String(s.selectedLora4 || "None"),
    "%lorawt1%": num(s.selectedLoraWt, 1),
    "%lorawt2%": num(s.selectedLoraWt2, 1),
    "%lorawt3%": num(s.selectedLoraWt3, 1),
    "%lorawt4%": num(s.selectedLoraWt4, 1),
  };
  let out = workflow;
  for (const [token, value] of Object.entries(values)) {
    if (token === "%model%" && !value) continue;
    // A number in a JSON string slot becomes a JSON number, as Megumin's node walk does.
    out = out.split(`"${token}"`).join(JSON.stringify(value)).split(token).join(String(value));
  }
  return out;
}

export function createMeguminHostIo(db: DB, ctx: HostIoContext) {
  const languageModels = createCapabilityLanguageModelHost(db);
  const debug = isDebugAgentsEnabled();

  async function quiet(text: string, run: MeguminRunState): Promise<string> {
    let messages: Array<{ role: string; content: unknown }>;
    if (MeguminWorker.isJobMarker(text)) {
      messages = [];
      await MeguminInjection.handlePromptInjection({ chat: messages, dryRun: false }, "quiet");
      if (!messages.length) return "";
    } else {
      messages = MeguminWorker.plainMessages(text);
      if (!messages.length) return "";
    }
    const connectionId = run.connectionId ?? ctx.chatConnectionId;
    const model = await languageModels.resolve(connectionId);
    logDebugOverride(
      debug,
      "[megumin] %s job → %s (%s): %s",
      run.job ?? "quiet",
      model.connectionId,
      model.model,
      JSON.stringify(messages).slice(0, 20_000),
    );
    const result = await model.chatComplete(messages as never, {
      maxTokens: model.maxOutputTokens ?? QUIET_MAX_TOKENS,
      signal: run.signal ?? undefined,
      debugMode: debug,
    });
    return MeguminWorker.answerOf(result as never);
  }

  /** What the lorebooks activated for the latest reply (its saved scan), as SillyTavern's dry run would. */
  async function worldInfo(_lines: string[]): Promise<{ before: string; after: string; depth: string[] }> {
    const chats = createChatsStorage(db);
    const rows = await chats.listMessages(ctx.chatId);
    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i]!;
      if (row.role !== "assistant" && row.role !== "narrator") continue;
      const swipes = await chats.getSwipes(row.id);
      const active = swipes.find((s: { index: number }) => s.index === row.activeSwipeIndex);
      const scan = parseRecord(active?.extra).lorebookScan ?? parseRecord(row.extra).lorebookScan;
      const entries: Array<{ content?: string }> = Array.isArray(scan?.activatedEntries) ? scan.activatedEntries : [];
      const texts = entries.map((e) => String(e.content ?? "").trim()).filter(Boolean);
      return { before: texts.join("\n\n"), after: "", depth: [] };
    }
    return { before: "", after: "", depth: [] };
  }

  /** Every enabled entry the chat's lorebooks offer, as SillyTavern's getSortedEntries. */
  async function loreEntries(): Promise<MeguminLoreEntry[]> {
    const lorebooks = createLorebooksStorage(db);
    const activeLorebookIds = parseStringArray(ctx.chatMetadata.activeLorebookIds);
    const entries = (await lorebooks.listActiveEntries({
      activeLorebookIds,
      characterIds: ctx.characterIds,
      personaId: ctx.personaId,
      chatId: ctx.chatId,
    })) as Array<Record<string, unknown>>;
    return entries
      .filter((e) => String(e.enabled ?? "true") !== "false")
      .sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0))
      .map((e) => ({
        key: parseStringArray(e.keys),
        keysecondary: parseStringArray(e.secondaryKeys),
        comment: String(e.name ?? ""),
        content: String(e.content ?? ""),
        disable: false,
      }));
  }

  async function embed(texts: string[]): Promise<{ space: string; vectors: number[][] } | null> {
    try {
      const source = await resolveMemoryRecallEmbeddingSource(db, {
        chatMetadata: ctx.chatMetadata,
        connectionId: ctx.chatConnectionId,
      });
      if (!source) return null;
      const vectors = await source.embed(texts);
      return vectors ? { space: source.spaceId ?? source.label, vectors } : null;
    } catch (err) {
      logger.warn(err, "[megumin] Embedding for the Semantic memory scanner failed; Megumin falls back to keywords");
      return null;
    }
  }

  async function imageConnectionId(settings: Record<string, any>): Promise<string | null> {
    const chosen = typeof settings.yunyunConnectionId === "string" ? settings.yunyunConnectionId.trim() : "";
    if (chosen) return chosen;
    const chatChoice = ctx.chatMetadata.illustratorImageConnectionId;
    if (typeof chatChoice === "string" && chatChoice.trim()) return chatChoice.trim();
    const all = (await createConnectionsStorage(db).list()) as Array<{ id: string; provider: string }>;
    return all.find((c) => c.provider === "image_generation")?.id ?? null;
  }

  type Notify = (level: "info" | "success" | "warning" | "error", message: string) => void;

  /** Megumin's ComfyUI call, through YunYun's image generation connection. Null when it could not run. */
  async function render(request: MeguminImageRenderRequest, notify: Notify) {
    const settings = request.settings as Record<string, any>;
    const connectionId = await imageConnectionId(settings);
    if (!connectionId) {
      notify("warning", "Pick an image connection in Megumin's Images tab before drawing.");
      return null;
    }
    const conn = (await createConnectionsStorage(db).getWithKey(connectionId)) as Record<string, any> | null;
    if (!conn) {
      notify("warning", "The image connection Megumin uses no longer exists.");
      return null;
    }
    const { generateImage: generate } = await import("../image/image-generation.js");
    const baseUrl = conn.baseUrl || "https://image.pollinations.ai";
    const model = String(conn.model || "");
    const serviceHint = String(conn.imageService || conn.imageGenerationSource || model);
    const workflow =
      typeof conn.comfyuiWorkflow === "string" && conn.comfyuiWorkflow.trim()
        ? applyMeguminComfyPlaceholders(conn.comfyuiWorkflow, settings)
        : undefined;
    const width = request.width ?? (Number(settings.imgWidth) || 1024);
    const height = request.height ?? (Number(settings.imgHeight) || 1024);
    const result = await generate(model, baseUrl, String(conn.apiKey || ""), serviceHint, {
      prompt: request.prompt,
      negativePrompt: request.negative || undefined,
      model,
      width,
      height,
      imageEndpointId: conn.imageEndpointId || undefined,
      comfyWorkflow: workflow,
      imageDefaults: resolveConnectionImageDefaults(conn as never),
      debugMode: isDebugAgentsEnabled(),
      admissionMode: { kind: "background" },
    });
    return { result, conn, model, width, height };
  }

  /** An image for the story, placed where Megumin places it. */
  async function generateImage(request: MeguminImageRequest, scope: MeguminChatScope): Promise<void> {
    const notify: Notify = (level, message) => scope.notify({ level, message, title: "Megumin Suite" });
    try {
      // The reply and swipe are fixed now: a regenerate or a swipe while the image draws must not move it.
      const anchor = await imageAnchor(scope, request);
      const drawn = await render(request, notify);
      if (!drawn) return;
      const { saveImageToDisk } = await import("../image/image-generation.js");
      const filePath = saveImageToDisk(ctx.chatId, drawn.result.base64, drawn.result.ext);
      const filename = filePath.split("/").pop()!;
      const url = `/api/gallery/file/${ctx.chatId}/${encodeURIComponent(filename)}`;
      const gallery = await createGalleryStorage(db).create({
        chatId: ctx.chatId,
        filePath,
        prompt: request.prompt,
        provider: String(drawn.conn.provider || ""),
        model: drawn.model,
        width: drawn.width,
        height: drawn.height,
      });
      if (!(await placeImage(scope, request, anchor, url, (gallery as { id?: string } | null)?.id ?? null))) {
        notify("warning", "The image was drawn, but its reply is gone, so it is only in the chat's gallery.");
        return;
      }
      notify(
        "success",
        request.target?.isInlineAuto && request.target.mode === "inline" ? "Image injected inline!" : "Image inserted!",
      );
    } catch (err) {
      logger.warn(err, "[megumin] Image generation failed");
      markImageFailed(scope, request);
      notify("error", `Image generation failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** An image handed back as data (an NPC portrait), never placed in the chat. */
  async function renderImage(
    request: MeguminImageRenderRequest,
    scope: MeguminChatScope,
  ): Promise<{ base64: string; mime: string } | null> {
    const notify: Notify = (level, message) => scope.notify({ level, message, title: "Megumin Suite" });
    try {
      const drawn = await render(request, notify);
      if (!drawn) return null;
      // A portrait is kept inside the profile, so it is shrunk the way Megumin shrinks one (256 px).
      try {
        const { getSharp } = await import("../image/sharp-runtime.js");
        const sharp = await getSharp();
        const small = await sharp(Buffer.from(drawn.result.base64, "base64"))
          .resize(256, 256, { fit: "cover" })
          .webp({ quality: 85 })
          .toBuffer();
        return { base64: small.toString("base64"), mime: "image/webp" };
      } catch (err) {
        logger.warn(err, "[megumin] Could not shrink an NPC portrait; keeping it at full size");
      }
      const ext = String(drawn.result.ext || "png").toLowerCase();
      const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png";
      return { base64: drawn.result.base64, mime };
    } catch (err) {
      logger.warn(err, "[megumin] Portrait generation failed");
      notify("error", `Image generation failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  function inlineTag(id: string, url: string, prompt: string) {
    const safe = prompt.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    return `<!-- kazuma-inline-start:${id} --><div id="${id}" class="kazuma-img-wrapper">\n<img src="${url}" title="${safe}" alt="KazumaInline" data-kazumaid="${id}" style="max-width: 100%; border-radius: 8px; display: block;" />\n</div><!-- kazuma-inline-end:${id} -->`;
  }

  type ImageAnchor = { message: MeguminChatMessage; swipeIndex: number };

  /**
   * The message an image belongs to (the target, or the latest reply) and the swipe stored as shown when the
   * image is asked for. Not the live message's swipe_id: a regenerate sets that to a swipe not saved yet.
   */
  async function imageAnchor(scope: MeguminChatScope, request: MeguminImageRequest): Promise<ImageAnchor | null> {
    const id = request.target?.messageId;
    // A named reply that is gone gets no image; only an image asked for no reply in particular goes on the latest.
    const message = id
      ? scope.chat.find((m) => m.id === id)
      : [...scope.chat].reverse().find((m) => !m.is_user && !m.is_system);
    if (!message) return null;
    const row = await createChatsStorage(db).getMessage(message.id);
    return row ? { message, swipeIndex: row.activeSwipeIndex ?? 0 } : null;
  }

  /** Puts the image on its message's swipe; false when that message or swipe is gone. */
  async function placeImage(
    scope: MeguminChatScope,
    request: MeguminImageRequest,
    anchor: ImageAnchor | null,
    url: string,
    galleryId: string | null,
  ): Promise<boolean> {
    if (!anchor) return false;
    const { message, swipeIndex } = anchor;
    const target = request.target;
    // Inline only while the message is still in the chat and still shows that swipe: its text is the one the
    // placeholder is in. A deleted reply falls through to the attachment path, which reports it is gone.
    if (
      target?.isInlineAuto &&
      target.mode === "inline" &&
      target.messageId === message.id &&
      scope.chat.includes(message) &&
      message.swipe_id === swipeIndex
    ) {
      const id = target.placeholderId || `kazuma-img-${Date.now()}`;
      const tag = inlineTag(id, url, request.prompt);
      const specific = new RegExp(`<div id="${id}"[^>]*>[\\s\\S]*?<\\/div>`);
      if (target.placeholderId && message.mes.includes(`id="${target.placeholderId}"`))
        message.mes = message.mes.replace(specific, () => tag);
      else message.mes = `${message.mes}\n\n${tag}`;
      scope.dirty.chat = true;
      return true;
    }
    // Anything else becomes an image on the message: YunYun's attachment, its gallery viewer.
    const attachment = {
      type: "image",
      url,
      filename: url.split("/").pop(),
      prompt: request.prompt,
      galleryId,
      source: "megumin",
    };
    const chats = createChatsStorage(db);
    // The swipe row is the lasting record; the message row mirrors it only while that swipe is shown.
    if (!(await chats.appendSwipeAttachment(message.id, swipeIndex, attachment))) return false;
    await chats.appendMessageAttachmentForActiveSwipe(message.id, swipeIndex, attachment);
    scope.changed?.(`message:${message.id}`);
    return true;
  }

  function markImageFailed(scope: MeguminChatScope, request: MeguminImageRequest) {
    const target = request.target;
    if (!target?.isInlineAuto || target.mode !== "inline" || !target.placeholderId) return;
    const message = scope.chat.find((m) => m.id === target.messageId);
    if (!message || !message.mes.includes(`id="${target.placeholderId}"`)) return;
    const safe = request.prompt.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    const failTag = `<!-- kazuma-inline-start:${target.placeholderId} --><div id="${target.placeholderId}" class="kazuma-img-wrapper" style="color:#ef4444; font-style: italic; margin: 10px 0;"><span>[Image Generation Failed]</span> <img alt="KazumaInline" data-kazumaid="${target.placeholderId}" title="${safe}" style="display:none;" /></div><!-- kazuma-inline-end:${target.placeholderId} -->`;
    message.mes = message.mes.replace(
      new RegExp(`<div id="${target.placeholderId}"[^>]*>[\\s\\S]*?<\\/div>`),
      () => failTag,
    );
    scope.dirty.chat = true;
  }

  return { quiet, worldInfo, loreEntries, embed, generateImage, renderImage };
}
