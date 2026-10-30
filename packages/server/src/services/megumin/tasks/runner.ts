// ──────────────────────────────────────────────
// Megumin Mode: the auxiliary task runner
// ──────────────────────────────────────────────
// Megumin Suite's side tasks (Story Director, NPC scan and update, ban list, image and portrait
// prompts, memory summaries, style generators) ran a quiet prompt on the main connection, some
// after swapping in its "Megumin Engine" preset. Here each task is its own model call: the feature
// that owns it builds the messages and parses the reply; this runner picks the connection (the
// task's override, the Megumin utility connection, Default for agents, then the chat's), applies
// the sampler profile, adds the task's prefill when Utility Prefills is on, and removes the
// reply's leading reasoning. Nothing here runs while Megumin Mode is off.
import {
  DEFAULT_GENERATION_PARAMS,
  LOCAL_SIDECAR_CONNECTION_ID,
  extractLeadingThinkingBlocks,
  isMeguminPreset,
  isStockMeguminPreset,
  type ChatOptions,
  type GenerationParameters,
  type MeguminGlobalSettings,
  type MeguminTaskId,
} from "@marinara-engine/shared";
import { isDebugAgentsEnabled } from "../../../config/runtime-config.js";
import type { DB } from "../../../db/connection.js";
import { logDebugOverride, logger } from "../../../lib/logger.js";
import { appendGenerationTailMessages, type SimpleMessage } from "../../../routes/generate/generate-route-utils.js";
import { buildGenerationPromptPresetCandidates } from "../../../routes/generate/prompt-preset-selection.js";
import { isFeatureEnabled } from "../../features/feature-settings.js";
import { resolveBaseUrl } from "../../generation/connection-base-url.js";
import { resolveModelAccessPolicy } from "../../generation/model-access-policy.js";
import { clampGenerationMaxOutputTokens } from "../../generation/output-token-limits.js";
import { resolveGenerationParameters } from "../../generation/provider-generation-runtime.js";
import type { BaseLLMProvider } from "../../llm/base-provider.js";
import { withConnectionFallbackProvider } from "../../llm/connection-fallback-provider.js";
import { getLocalSidecarProvider, LOCAL_SIDECAR_MODEL } from "../../llm/local-sidecar.js";
import { createLLMProvider } from "../../llm/provider-registry.js";
import { parsePresetParameters } from "../../prompt/assembler.js";
import { sidecarModelService } from "../../sidecar/sidecar-model.service.js";
import { createChatsStorage } from "../../storage/chats.storage.js";
import { createConnectionsStorage } from "../../storage/connections.storage.js";
import { createPromptsStorage } from "../../storage/prompts.storage.js";
import { readMeguminSettings } from "../settings.js";

type ConnectionsStorage = ReturnType<typeof createConnectionsStorage>;
type ConnectionWithKey = NonNullable<Awaited<ReturnType<ConnectionsStorage["getWithKey"]>>>;

/** "direct" uses the chat's Megumin preset's samplers; "engine" the Megumin Engine preset's. */
export type MeguminTaskBackend = "direct" | "engine";

/** Upstream's "Megumin Engine" (and the identical "Megumin Image") task preset. */
export const MEGUMIN_ENGINE_PARAMETERS = {
  temperature: 1,
  topP: 1,
  maxTokens: 8000,
  reasoningEffort: "maximum",
} as const satisfies Partial<GenerationParameters>;

export type MeguminTaskErrorCode = "off" | "busy" | "chat-not-found" | "no-connection";

export class MeguminTaskError extends Error {
  constructor(
    readonly code: MeguminTaskErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "MeguminTaskError";
  }
}

// ── Connection ───────────────────────────────────
export type MeguminTaskConnectionSource = "task" | "utility" | "agent-default" | "chat";

export type ResolvedMeguminTaskConnection =
  | {
      ok: true;
      provider: BaseLLMProvider;
      connectionId: string;
      source: MeguminTaskConnectionSource;
      /** The connection row; null for the local model. */
      connection: ConnectionWithKey | null;
      model: string;
      warnings: string[];
    }
  | { ok: false; error: string; warnings: string[] };

function readId(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * The connection a task runs on. Candidates in order: the task's own override, the Megumin
 * utility connection, Default for agents (the local model when it is the agents' default), then
 * the chat's connection. "random" draws from the random pool; image and video connections and
 * missing rows are skipped with a warning. Fallback for agents backs up whichever is chosen.
 */
export async function resolveMeguminTaskConnection(args: {
  task: MeguminTaskId;
  global: Pick<MeguminGlobalSettings, "utilityConnectionId" | "taskConnections">;
  chatConnectionId: string | null;
  connections: Pick<
    ConnectionsStorage,
    "getWithKey" | "listRandomPool" | "getDefaultForAgents" | "getFallbackForAgents"
  >;
  localSidecarIsAgentsDefault: boolean;
}): Promise<ResolvedMeguminTaskConnection> {
  const warnings: string[] = [];
  const candidates: Array<{ id: string; source: MeguminTaskConnectionSource }> = [];
  const push = (id: string | null, source: MeguminTaskConnectionSource) => {
    if (id && !candidates.some((candidate) => candidate.id === id)) candidates.push({ id, source });
  };
  push(readId(args.global.taskConnections[args.task]), "task");
  push(readId(args.global.utilityConnectionId), "utility");
  push(
    args.localSidecarIsAgentsDefault
      ? LOCAL_SIDECAR_CONNECTION_ID
      : ((await args.connections.getDefaultForAgents())?.id ?? null),
    "agent-default",
  );
  push(readId(args.chatConnectionId), "chat");

  const fallbackConnection = await args.connections.getFallbackForAgents();
  const wrap = (primary: BaseLLMProvider, primaryConnectionId: string) =>
    withConnectionFallbackProvider({
      primary,
      primaryConnectionId,
      fallbackConnection,
      fallbackBaseUrl: fallbackConnection ? resolveBaseUrl(fallbackConnection) : "",
      category: "agents",
    });

  for (const candidate of candidates) {
    if (candidate.id === LOCAL_SIDECAR_CONNECTION_ID) {
      return {
        ok: true,
        provider: wrap(getLocalSidecarProvider(), LOCAL_SIDECAR_CONNECTION_ID),
        connectionId: LOCAL_SIDECAR_CONNECTION_ID,
        source: candidate.source,
        connection: null,
        model: LOCAL_SIDECAR_MODEL,
        warnings,
      };
    }
    let conn: ConnectionWithKey | null;
    if (candidate.id === "random") {
      const pool = await args.connections.listRandomPool();
      conn = pool[Math.floor(Math.random() * pool.length)] ?? null;
      if (!conn) warnings.push("No connections in random pool");
    } else {
      conn = await args.connections.getWithKey(candidate.id);
      if (!conn) warnings.push(`Connection ${candidate.id} was not found`);
    }
    if (!conn) continue;
    if (conn.provider === "image_generation" || conn.provider === "video_generation") {
      warnings.push(`Connection ${conn.id} does not generate text`);
      continue;
    }
    const baseUrl = resolveBaseUrl(conn);
    if (!baseUrl) {
      warnings.push(`Connection ${conn.id} has no base URL`);
      continue;
    }
    const provider = createLLMProvider(
      conn.provider,
      baseUrl,
      conn.apiKey,
      conn.maxContext,
      conn.openrouterProvider,
      conn.maxTokensOverride,
      conn.claudeFastMode === "true",
      conn.treatAsLocalEndpoint === "true",
      conn.defaultParameters,
    );
    return {
      ok: true,
      provider: wrap(provider, conn.id),
      connectionId: conn.id,
      source: candidate.source,
      connection: conn,
      model: conn.model,
      warnings,
    };
  }
  return { ok: false, error: "No usable text connection for Megumin tasks", warnings };
}

// ── Sampler profile ──────────────────────────────
/** The parameters a task starts from: the Megumin Engine values, or the chat's Megumin preset's ("direct"). */
export function meguminTaskParameters(
  backend: MeguminTaskBackend,
  presetParameters: GenerationParameters | null,
): GenerationParameters {
  if (backend === "engine") return { ...DEFAULT_GENERATION_PARAMS, ...MEGUMIN_ENGINE_PARAMETERS };
  return presetParameters ?? DEFAULT_GENERATION_PARAMS;
}

/**
 * Chat options for a task: the profile's samplers with the connection's saved parameters on top
 * and the provider's rules applied, through the same layering as the main chat. A task never
 * takes the preset's prefill or thinking tags; its only prefill is its own (Utility Prefills).
 */
export function buildMeguminTaskChatOptions(
  parameters: GenerationParameters,
  connection: {
    provider: string;
    model: string;
    maxTokensOverride?: number | null;
    maxContext?: unknown;
    defaultParameters?: unknown;
  },
): ChatOptions {
  const modelAccessPolicy = resolveModelAccessPolicy(connection);
  const resolved = resolveGenerationParameters({
    connection,
    chatMode: "agent",
    isSceneChat: false,
    chatParameters: null,
    managedParameterDefinitions: [],
    modelAccessPolicy,
    initial: {
      temperature: parameters.temperature,
      maxTokens: parameters.maxTokens,
      topP: parameters.topP,
      topK: parameters.topK,
      minP: parameters.minP,
      frequencyPenalty: parameters.frequencyPenalty,
      presencePenalty: parameters.presencePenalty,
      showThoughts: parameters.showThoughts,
      reasoningEffort: parameters.reasoningEffort,
      verbosity: parameters.verbosity,
      serviceTier: parameters.serviceTier,
      assistantPrefill: "",
      assistantReasoningPrefill: "",
      customThinkingTags: [],
      customParameters: parameters.customParameters,
      enabledParameters: parameters.enabledParameters,
      stopSequences: parameters.stopSequences,
      effectiveMaxContext: undefined,
    },
  });
  return {
    model: connection.model,
    temperature: resolved.temperature,
    maxTokens: clampGenerationMaxOutputTokens({ ...connection, maxTokens: resolved.maxTokens }),
    topP: resolved.topP,
    topK: resolved.providerTopK,
    minP: resolved.minP || undefined,
    frequencyPenalty: resolved.frequencyPenalty || undefined,
    presencePenalty: resolved.presencePenalty || undefined,
    reasoningEffort: resolved.providerReasoningEffort,
    enableThinking: resolved.enableThinking,
    verbosity: resolved.verbosity ?? undefined,
    serviceTier: resolved.serviceTier,
    stop: resolved.stopSequences.length > 0 ? resolved.stopSequences : undefined,
    customParameters: resolved.customParameters,
    enabledParameters: resolved.enabledParameters,
    suppressModelParameters: modelAccessPolicy.suppressModelParameters,
  };
}

/** The chat's Megumin preset (connection override first, as generation picks it), else the stock one. */
async function resolveMeguminPresetParameters(
  db: DB,
  chat: { mode: unknown; promptPresetId: unknown },
  connectionPromptPresetId: unknown,
): Promise<GenerationParameters | null> {
  const presets = createPromptsStorage(db);
  for (const candidate of buildGenerationPromptPresetCandidates({
    chatMode: chat.mode,
    chatPromptPresetId: chat.promptPresetId,
    connectionPromptPresetId,
  })) {
    const preset = await presets.getById(candidate.id);
    if (!preset) continue;
    if (isMeguminPreset(preset)) return parsePresetParameters(preset.parameters);
    break;
  }
  const stock = (await presets.list()).find(isStockMeguminPreset);
  return stock ? parsePresetParameters(stock.parameters) : null;
}

// ── Running a task ───────────────────────────────
export type MeguminTaskMessage = Pick<SimpleMessage, "role" | "content">;

export interface MeguminTaskRequest {
  chatId: string;
  task: MeguminTaskId;
  backend: MeguminTaskBackend;
  /** Built by the feature that owns the task. */
  messages: MeguminTaskMessage[];
  /** The task's assistant prefill, sent only while Utility Prefills is on. */
  prefill?: string;
  signal?: AbortSignal;
  /** UI debug mode: log the prompt even when the log level hides debug lines. */
  debug?: boolean;
}

export interface MeguminTaskResult {
  /** The reply without its leading reasoning. */
  content: string;
  thinking: string;
  connectionId: string;
  source: MeguminTaskConnectionSource;
  model: string;
  warnings: string[];
}

/** One run per chat and task at a time; a second is refused rather than queued. */
const runningTasks = new Set<string>();

export async function runMeguminTask(db: DB, request: MeguminTaskRequest): Promise<MeguminTaskResult> {
  if (!isFeatureEnabled("meguminMode")) throw new MeguminTaskError("off", "Megumin Mode is off");
  const runKey = `${request.chatId}\u0000${request.task}`;
  if (runningTasks.has(runKey)) {
    throw new MeguminTaskError("busy", `The Megumin ${request.task} task is already running for this chat`);
  }
  runningTasks.add(runKey);
  try {
    const chat = await createChatsStorage(db).getById(request.chatId);
    if (!chat) throw new MeguminTaskError("chat-not-found", "Chat not found");
    const settings = await readMeguminSettings(db);
    const connections = createConnectionsStorage(db);
    const chatConnection = chat.connectionId ? await connections.getWithKey(chat.connectionId) : null;
    const resolved = await resolveMeguminTaskConnection({
      task: request.task,
      global: settings.global,
      chatConnectionId: chat.connectionId,
      connections,
      localSidecarIsAgentsDefault:
        sidecarModelService.getConfig().useAsAgentsDefault && sidecarModelService.getConfiguredModelRef() !== null,
    });
    if (!resolved.ok) throw new MeguminTaskError("no-connection", resolved.error);
    if (resolved.warnings.length > 0) {
      logger.warn(
        { chatId: request.chatId, task: request.task, warnings: resolved.warnings },
        "[megumin] Task connection resolved after skipping candidates",
      );
    }

    const presetParameters =
      request.backend === "direct"
        ? await resolveMeguminPresetParameters(db, chat, chatConnection?.promptPresetId)
        : null;
    const options = buildMeguminTaskChatOptions(
      meguminTaskParameters(request.backend, presetParameters),
      resolved.connection ?? { provider: LOCAL_SIDECAR_CONNECTION_ID, model: resolved.model },
    );

    const messages: SimpleMessage[] = request.messages.map((message) => ({ ...message }));
    if (settings.global.enableUtilityPrefill) {
      appendGenerationTailMessages(messages, {
        assistantPrefill: request.prefill ?? "",
        assistantReasoningPrefill: "",
        supportsAssistantReasoningPrefill: false,
        followUpIteration: 0,
        impersonate: false,
        isGoogleProvider: false,
        regenerateUserMessage: null,
      });
    }

    const debug = request.debug === true || isDebugAgentsEnabled();
    logDebugOverride(
      debug,
      "[debug/megumin/task:%s] connection=%s (%s) model=%s backend=%s prompt:\n%s",
      request.task,
      resolved.connectionId,
      resolved.source,
      resolved.model,
      request.backend,
      messages.map((message) => `[${message.role}]\n${message.content}`).join("\n\n"),
    );
    let raw: string;
    try {
      raw = (await resolved.provider.chatComplete(messages, { ...options, signal: request.signal })).content ?? "";
    } catch (err) {
      logger.error(err, "[megumin] Task %s failed on connection %s", request.task, resolved.connectionId);
      throw err;
    }
    logDebugOverride(debug, "[debug/megumin/task:%s] response:\n%s", request.task, raw);

    const { content, thinking } = extractLeadingThinkingBlocks(raw);
    return {
      content: content.trim(),
      thinking,
      connectionId: resolved.connectionId,
      source: resolved.source,
      model: resolved.model,
      warnings: resolved.warnings,
    };
  } finally {
    runningTasks.delete(runKey);
  }
}
