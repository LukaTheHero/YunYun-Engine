// YunYun override of Megumin Suite's src/core/state.js.
// SillyTavern keeps the active profile in a module global; here each chat has
// its own, so `localProfile` is a proxy onto the current scope's profile. Reads,
// writes, `Object.keys`, spreads and JSON.stringify all reach the real object.
// Derived from Megumin Suite (CC BY-NC 4.0, see LICENSE.md).
import { currentMeguminScope, maybeMeguminScope } from "../../../host.js";

function profileNow(): Record<string, any> {
  return currentMeguminScope().chat.profile as Record<string, any>;
}

export const localProfile: Record<string, any> = new Proxy({} as Record<string, any>, {
  get: (_t, key) => {
    const scope = maybeMeguminScope();
    if (!scope) return undefined;
    return (scope.chat.profile as Record<PropertyKey, unknown>)[key];
  },
  set: (_t, key, value) => {
    (profileNow() as Record<PropertyKey, unknown>)[key] = value;
    return true;
  },
  deleteProperty: (_t, key) => {
    delete (profileNow() as Record<PropertyKey, unknown>)[key];
    return true;
  },
  has: (_t, key) => key in profileNow(),
  ownKeys: () => Reflect.ownKeys(profileNow()),
  getOwnPropertyDescriptor: (_t, key) => {
    const target = profileNow();
    if (!(key in target)) return undefined;
    return { configurable: true, enumerable: true, writable: true, value: (target as Record<PropertyKey, unknown>)[key] };
  },
});

export function setLocalProfile(profile: Record<string, unknown>): void {
  currentMeguminScope().chat.profile = profile;
}

export function getLocalProfileObject(): Record<string, any> {
  return profileNow();
}

// The key of the profile this chat's scope loaded. SillyTavern keeps one global (one open chat); every chat
// here has its own, so Megumin's save guards (rewritten by the sync script to call loadedProfileKeyNow())
// compare a chat's live key with the profile that chat loaded, never with another chat's.
export function loadedProfileKeyNow(): string | null {
  return maybeMeguminScope()?.chat.loadedProfileKey ?? null;
}
export function setLoadedProfileKey(key: string | null): void {
  const scope = maybeMeguminScope();
  if (scope) scope.chat.loadedProfileKey = key;
}

// UI-only state in SillyTavern (the open settings tab, the Dev Mode dirty flag).
// Kept so ports that read them still import cleanly; YunYun's UI keeps its own.
export let currentTab = 0;
export function setCurrentTab(index: number): void {
  currentTab = index;
}

export let isDevEngineDirty = false;
export function setDevEngineDirty(dirty: boolean): void {
  isDevEngineDirty = dirty;
}
