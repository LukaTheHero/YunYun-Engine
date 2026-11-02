// YunYun override of Megumin Suite's src/st.js (its SillyTavern import shim).
// Same export names, so the vendored modules import from here unchanged; every
// call is answered from the current Megumin scope (../../host.ts) instead of
// SillyTavern's globals. Derived from Megumin Suite (CC BY-NC 4.0, see LICENSE.md).
import { currentMeguminScope, maybeMeguminScope, type MeguminNoticeLevel } from "../../host.js";

function scopeChat() {
  return currentMeguminScope().chat;
}

/** SillyTavern's extension_settings object: `extension_settings["Megumin-Suite"]` is the suite's store. */
export const extension_settings: Record<string, any> = new Proxy({} as Record<string, any>, {
  get: (_t, key) => (typeof key === "string" ? scopeChat().settings[key] : undefined),
  set: (_t, key, value) => {
    if (typeof key !== "string") return false;
    scopeChat().settings[key] = value;
    return true;
  },
  deleteProperty: (_t, key) => {
    if (typeof key === "string") delete scopeChat().settings[key];
    return true;
  },
  has: (_t, key) => typeof key === "string" && key in scopeChat().settings,
  ownKeys: () => Reflect.ownKeys(scopeChat().settings),
  getOwnPropertyDescriptor: (_t, key) => {
    if (typeof key !== "string" || !(key in scopeChat().settings)) return undefined;
    return { configurable: true, enumerable: true, writable: true, value: scopeChat().settings[key] };
  },
});

/** chat_metadata, read live from the scope. */
export const chat_metadata: Record<string, any> = new Proxy({} as Record<string, any>, {
  get: (_t, key) => (typeof key === "string" ? scopeChat().metadata[key] : undefined),
  set: (_t, key, value) => {
    if (typeof key !== "string") return false;
    scopeChat().metadata[key] = value;
    return true;
  },
  deleteProperty: (_t, key) => {
    if (typeof key === "string") delete scopeChat().metadata[key];
    return true;
  },
  has: (_t, key) => typeof key === "string" && key in scopeChat().metadata,
  ownKeys: () => Reflect.ownKeys(scopeChat().metadata),
  getOwnPropertyDescriptor: (_t, key) => {
    if (typeof key !== "string" || !(key in scopeChat().metadata)) return undefined;
    return { configurable: true, enumerable: true, writable: true, value: scopeChat().metadata[key] };
  },
});

const IGNORE_SYMBOL = Symbol.for("megumin.ignore");

/** SillyTavern's getContext(): the open chat, its characters and names. */
export function getContext(): any {
  const scope = maybeMeguminScope();
  if (!scope) return { chat: [], chatId: null, chatMetadata: null, characters: [], symbols: { ignore: IGNORE_SYMBOL } };
  const c = scope.chat;
  return {
    chat: c.chat,
    chatId: c.chatId,
    chatMetadata: c.chatId ? c.metadata : null,
    characters: c.characters,
    characterId: c.characterId,
    groupId: c.groupId,
    groups: c.groups,
    name1: c.name1,
    name2: c.name2,
    symbols: { ignore: IGNORE_SYMBOL },
  };
}

/** The user's name (SillyTavern's `name1` live binding, read per chat). */
export function currentName1(): string {
  return maybeMeguminScope()?.chat.name1 ?? "";
}

/** SillyTavern's macro substitution. */
export function substituteParams(text: string): string {
  const scope = maybeMeguminScope();
  if (!scope || typeof text !== "string") return text;
  return scope.chat.substitute(text);
}

/** A quiet (background) prompt. A Chomusuke job running on its own connection routes it there. */
export async function generateQuietPrompt(params: any = {}): Promise<string> {
  const text = typeof params === "string" ? params : String(params?.quietPrompt ?? params?.prompt ?? "");
  const scope = currentMeguminScope();
  if (scope.run.quietRoute) return scope.run.quietRoute(text);
  return scope.chat.quiet(text, scope.run);
}

/** While a job runs on its own connection (engine/tasks.ts), quiet prompts go here. */
export function setQuietRoute(fn: ((text: string) => Promise<string>) | null): void {
  currentMeguminScope().run.quietRoute = fn;
}

function markDirty(key: "metadata" | "settings" | "chat" | "profile") {
  const scope = maybeMeguminScope();
  if (scope) scope.chat.dirty[key] = true;
}

/** The host writes Megumin's settings store back after the operation. */
export function saveSettingsDebounced(): void {
  markDirty("settings");
}

export function saveMetadataDebounced(): void {
  markDirty("metadata");
}

export async function saveMetadata(): Promise<void> {
  markDirty("metadata");
}

/** Megumin writes its stamps into `extra`; the host saves the extras that changed. */
export function saveChatDebounced(): void {
  markDirty("chat");
}

export async function saveChat(): Promise<void> {
  markDirty("chat");
}

export function isGenerating(): boolean {
  return maybeMeguminScope()?.chat.isGenerating?.() ?? false;
}

function notify(level: MeguminNoticeLevel, message: unknown, title?: unknown) {
  const text = String(message ?? "");
  const scope = maybeMeguminScope();
  if (scope) scope.chat.notify({ level, message: text, title: typeof title === "string" ? title : undefined });
}

/** SillyTavern's toastr global. */
export const toastr = {
  info: (message: unknown, title?: unknown) => notify("info", message, title),
  success: (message: unknown, title?: unknown) => notify("success", message, title),
  warning: (message: unknown, title?: unknown) => notify("warning", message, title),
  error: (message: unknown, title?: unknown) => notify("error", message, title),
};

/** SillyTavern's utils debounce, with its cancel registry. */
const debounced = new WeakMap<(...args: any[]) => void, ReturnType<typeof setTimeout> | null>();
export function debounce<T extends (...args: any[]) => void>(fn: T, ms = 300): T {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const wrapped = ((...args: any[]) => {
    // Inside a scope (a server operation), a save must land before the operation
    // is written back, so it runs now rather than after a timer.
    if (maybeMeguminScope()) {
      fn(...args);
      return;
    }
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      debounced.set(wrapped, null);
      fn(...args);
    }, ms);
    debounced.set(wrapped, timer);
  }) as T;
  return wrapped;
}

export function cancelDebounce(fn: (...args: any[]) => void): void {
  const timer = debounced.get(fn);
  if (timer) clearTimeout(timer);
  debounced.set(fn, null);
}

/** SillyTavern's humanizedDateTime ("2026-11-2@14h05m07s"). */
export function humanizedDateTime(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}@${pad(d.getHours())}h${pad(d.getMinutes())}m${pad(d.getSeconds())}s`;
}

export async function waitUntilCondition(test: () => boolean, timeout = 1000, interval = 100): Promise<void> {
  const started = Date.now();
  while (!test()) {
    if (Date.now() - started > timeout) throw new Error("Timed out waiting for condition");
    await new Promise((r) => setTimeout(r, interval));
  }
}

// ── SillyTavern UI globals, for the modules that mix logic with jQuery UI ────
// YunYun draws Megumin's UI in React. These modules keep their logic; their UI
// calls reach these chainable no-op stubs (jQuery getters answer as an empty
// page would). `$.isLive` is false, so a patched module can tell.
const GETTERS_EMPTY = new Set(["val", "text", "html"]);
const GETTERS_FALSE = new Set(["is", "hasClass"]);
const GETTERS_BY_NAME = new Set(["attr", "prop", "data", "css"]);

export const domStub: any = new Proxy(function stub() {}, {
  get(_t, key) {
    if (key === "isLive") return false;
    if (key === "length") return 0;
    if (key === Symbol.iterator) return function* empty() {};
    if (key === Symbol.toPrimitive) return () => "";
    if (key === "then") return undefined;
    if (key === "value" || key === "textContent" || key === "innerHTML" || key === "innerText") return "";
    if (key === "checked" || key === "disabled") return false;
    if (key === "toArray" || key === "get") return () => [];
    if (typeof key === "string" && GETTERS_EMPTY.has(key)) return (...args: unknown[]) => (args.length ? domStub : "");
    if (typeof key === "string" && GETTERS_FALSE.has(key)) return () => false;
    if (typeof key === "string" && GETTERS_BY_NAME.has(key))
      return (...args: unknown[]) => (args.length === 1 && typeof args[0] === "string" ? undefined : domStub);
    return domStub;
  },
  apply: () => domStub,
  construct: () => domStub,
  set: () => true,
});

/** jQuery. */
export const $: any = domStub;
/** document. */
export const document: any = domStub;
const windowBag: Record<PropertyKey, unknown> = {};
/** window: a plain bag (Megumin parks one function on it); anything else is the stub. */
export const window: any = new Proxy(windowBag, {
  get: (t, key) => (key in t ? t[key] : domStub),
  set: (t, key, value) => {
    t[key] = value;
    return true;
  },
});

export const POPUP_TYPE = { TEXT: 1, CONFIRM: 2, INPUT: 3, DISPLAY: 4, CROP: 5 } as const;

/** SillyTavern's Popup: nobody is at a screen here, so every popup answers "cancel". */
export class Popup {
  constructor(..._args: unknown[]) {}
  async show(): Promise<false> {
    return false;
  }
}

/** SillyTavern's checkWorldInfo, answered from YunYun's lorebooks. */
export async function checkWorldInfo(chatLines: string[], _maxContext?: number, _dryRun?: boolean) {
  const scope = maybeMeguminScope();
  const res = scope?.chat.worldInfo ? await scope.chat.worldInfo(chatLines || []) : { before: "", after: "", depth: [] };
  return {
    worldInfoBefore: res.before,
    worldInfoAfter: res.after,
    WIDepthEntries: res.depth.length ? [{ entries: res.depth }] : [],
    ANBeforeEntries: [],
    ANAfterEntries: [],
  };
}

/** SillyTavern's getSortedEntries, answered from YunYun's lorebooks. */
export async function getSortedEntries() {
  const scope = maybeMeguminScope();
  return scope?.chat.loreEntries ? await scope.chat.loreEntries() : [];
}

/** Requests from Megumin to SillyTavern's own endpoints carry no headers on YunYun. */
export function getRequestHeaders(): Record<string, string> {
  return {};
}

/** A message's text changed: the host saves it and the client redraws it. */
export function updateMessageBlock(_index: number, message: any): void {
  const scope = maybeMeguminScope();
  if (!scope) return;
  scope.chat.dirty.chat = true;
  scope.chat.changed?.(`message:${message?.id ?? ""}`);
}
