// ──────────────────────────────────────────────────────────────────────────────
// Megumin host scope — the seam between Megumin Suite's engine and YunYun.
//
// Megumin was written for SillyTavern: one browser tab, one open chat, its state
// in module globals (localProfile, chat_metadata, the in-flight job markers). On
// YunYun's server many chats generate at once, so every value Megumin would read
// from a global is read from the *current scope* instead:
//
//   chat  — one live object per chat, shared by every run on that chat, exactly
//           like SillyTavern's single chat_metadata/localProfile (settings, the
//           chat's messages, its metadata, macro substitution, the job sender).
//   run   — one per operation (a prompt build, a post-reply pass, a job): the job
//           markers injection reads, so a background job on one chat can never
//           change the prompt shape of a generation running at the same time.
//
// The server installs an AsyncLocalStorage-backed provider; the client keeps one
// scope for the open chat. Megumin's own modules never see any of this: the
// shims (vendor/src/st.ts, core/state.ts, core/activeRequests.ts) read it.
// ──────────────────────────────────────────────────────────────────────────────

/** A message in the shape Megumin reads (SillyTavern's chat array), built from YunYun's rows. */
export interface MeguminChatMessage {
  /** YunYun message id. */
  id: string;
  role: string;
  characterId: string | null;
  name: string;
  is_user: boolean;
  is_system: boolean;
  mes: string;
  swipe_id: number;
  swipes: string[];
  swipe_info: Array<{ extra: Record<string, unknown> }>;
  extra: Record<string, unknown>;
  send_date?: string;
}

export interface MeguminCharacterRef {
  id: string;
  name: string;
  /** SillyTavern keys characters by avatar file; YunYun's character id plays that part. */
  avatar: string;
  description?: string;
  personality?: string;
  scenario?: string;
}

export interface MeguminLoreEntry {
  key: string[];
  keysecondary: string[];
  comment: string;
  content: string;
  disable: boolean;
}

/** One image Megumin asked for, with where it goes (SillyTavern's `target`). */
export interface MeguminImageRequest {
  prompt: string;
  negative: string;
  /** localProfile.imageGen at the time of the call. */
  settings: Record<string, unknown>;
  target: {
    messageId: string | null;
    mode: string | null;
    isInlineAuto: boolean;
    placeholderId: string | null;
    restoreHtml: string | null;
  } | null;
}

export type MeguminNoticeLevel = "info" | "success" | "warning" | "error";

export interface MeguminImageRenderRequest {
  prompt: string;
  negative: string;
  /** imageGen as Megumin keeps it (the connection id, sizes, ComfyUI placeholders). */
  settings: Record<string, unknown>;
  width?: number;
  height?: number;
}

export interface MeguminNotice {
  level: MeguminNoticeLevel;
  message: string;
  title?: string;
}

/** The per-chat live state. Megumin mutates `profile`, `metadata`, `settings` and `chat[].extra` in place. */
export interface MeguminChatScope {
  chatId: string | null;
  chat: MeguminChatMessage[];
  /** chat_metadata — only Megumin's own keys are ever written back. */
  metadata: Record<string, unknown>;
  /** extension_settings — `settings["Megumin-Suite"]` is the suite's whole store. */
  settings: Record<string, unknown>;
  /** localProfile — the profile in effect for this chat. */
  profile: Record<string, unknown>;
  loadedProfileKey: string | null;
  characters: MeguminCharacterRef[];
  characterId: number | undefined;
  groupId: string | null;
  groups: Array<{ id: string; name: string; members: string[] }>;
  /** The user's name ({{user}}). */
  name1: string;
  /** The character's name ({{char}}). */
  name2: string;
  /** SillyTavern's substituteParams: {{user}}, {{char}}, {{description}}, {{persona}}… */
  substitute(text: string): string;
  /** A quiet prompt on this chat's routing (marker → job messages, else one user message). */
  quiet(text: string, run: MeguminRunState): Promise<string>;
  /** A notice for the person using the chat (SillyTavern's toastr). */
  notify(notice: MeguminNotice): void;
  /** SillyTavern's checkWorldInfo dry run: what the lorebooks activate for these chat lines. */
  worldInfo?(chatLines: string[]): Promise<{ before: string; after: string; depth: string[] }>;
  /** SillyTavern's getSortedEntries: every enabled lorebook entry this chat can use, in order. */
  loreEntries?(): Promise<MeguminLoreEntry[]>;
  /**
   * Embeds texts with YunYun's embedding source (Memory's Semantic scanner). `space` names the source's vector
   * space: vectors from different spaces (another embedding model) must never be compared.
   */
  embed?(texts: string[]): Promise<{ space: string; vectors: number[][] } | null>;
  /** Draws an image for Megumin (its ComfyUI call) through YunYun's image generation and places it. */
  generateImage?(request: MeguminImageRequest): Promise<void>;
  /** Draws an image and hands it back instead of placing it (NPC portraits). */
  renderImage?(request: MeguminImageRenderRequest): Promise<{ base64: string; mime: string } | null>;
  /** Is the story model generating right now? */
  isGenerating?(): boolean;
  /** Something the open client should redraw (blocks, state, profile…). */
  changed?(what: string): void;
  dirty: { metadata: boolean; settings: boolean; chat: boolean; profile: boolean };
}

/** The in-flight job markers of SillyTavern's core/activeRequests.js, one set per run. */
export interface MeguminRunRequests {
  activeStoryPlanRequest: unknown;
  activeBanListChat: unknown;
  activeImageGenRequest: unknown;
  activeNpcScanRequest: unknown;
  activeNpcPfpRequest: unknown;
  activeNpcUpdateRequest: unknown;
  activeWorldExtractRequest: unknown;
  activeMemorySummarizationRequest: unknown;
  activeGenerationOrder: unknown;
}

export interface MeguminRunState {
  requests: MeguminRunRequests;
  npcImages: Array<{ name: string; base64: string }>;
  /** Set while a Chomusuke job runs on its own connection: quiet prompts go there. */
  quietRoute: ((text: string) => Promise<string>) | null;
  /** The Chomusuke job this run is doing, if any (for the background-prompt log). */
  job: string | null;
  signal: AbortSignal | null;
  /** The connection quiet prompts go to: a Chomusuke worker, or null for the chat's own. */
  connectionId: string | null;
}

export interface MeguminScope {
  chat: MeguminChatScope;
  run: MeguminRunState;
}

export function emptyRunRequests(): MeguminRunRequests {
  return {
    activeStoryPlanRequest: null,
    activeBanListChat: null,
    activeImageGenRequest: null,
    activeNpcScanRequest: null,
    activeNpcPfpRequest: null,
    activeNpcUpdateRequest: null,
    activeWorldExtractRequest: null,
    activeMemorySummarizationRequest: null,
    activeGenerationOrder: null,
  };
}

export function createRunState(overrides: Partial<MeguminRunState> = {}): MeguminRunState {
  return {
    requests: emptyRunRequests(),
    npcImages: [],
    quietRoute: null,
    job: null,
    signal: null,
    connectionId: null,
    ...overrides,
  };
}

type ScopeProvider = () => MeguminScope | undefined;

let provider: ScopeProvider = () => undefined;

/** The server passes an AsyncLocalStorage reader; the client a holder for the open chat. */
export function setMeguminScopeProvider(next: ScopeProvider): void {
  provider = next;
}

export function currentMeguminScope(): MeguminScope {
  const scope = provider();
  if (!scope) throw new Error("Megumin Suite was called outside a chat scope.");
  return scope;
}

export function maybeMeguminScope(): MeguminScope | undefined {
  return provider();
}

type ChildRunner = <T>(run: MeguminRunState, fn: () => Promise<T>) => Promise<T>;

let childRunner: ChildRunner = (_run, fn) => fn();

/** The server runs each Chomusuke job in its own run (its own job markers) on the same chat. */
export function setMeguminChildRunner(next: ChildRunner): void {
  childRunner = next;
}

/** Runs `fn` on the current chat with a fresh run state. */
export function runInChildRun<T>(overrides: Partial<MeguminRunState>, fn: () => Promise<T>): Promise<T> {
  return childRunner(createRunState(overrides), fn);
}
