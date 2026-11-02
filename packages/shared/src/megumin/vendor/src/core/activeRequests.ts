// YunYun override of Megumin Suite's src/core/activeRequests.js.
// The in-flight job markers live on the current run (host.ts), not in module
// globals, so a background job on one chat can never change the prompt shape of
// a generation running on another. Readers use the getters; the original
// `export let` names are kept as getters for code ported from Megumin.
// Derived from Megumin Suite (CC BY-NC 4.0, see LICENSE.md).
import { currentMeguminScope, maybeMeguminScope, type MeguminRunRequests } from "../../../host.js";

function requests(): MeguminRunRequests {
  return currentMeguminScope().run.requests;
}

function peek<K extends keyof MeguminRunRequests>(key: K): any {
  return maybeMeguminScope()?.run.requests[key] ?? null;
}

export const getActiveStoryPlanRequest = () => peek("activeStoryPlanRequest");
export function setActiveStoryPlanRequest(v: unknown): void {
  requests().activeStoryPlanRequest = v;
}

export const getActiveBanListChat = () => peek("activeBanListChat");
export function setActiveBanListChat(v: unknown): void {
  requests().activeBanListChat = v;
}

export const getActiveImageGenRequest = () => peek("activeImageGenRequest");
export function setActiveImageGenRequest(v: unknown): void {
  requests().activeImageGenRequest = v;
}

export const getActiveNpcScanRequest = () => peek("activeNpcScanRequest");
export function setActiveNpcScanRequest(v: unknown): void {
  requests().activeNpcScanRequest = v;
}

export const getActiveNpcPfpRequest = () => peek("activeNpcPfpRequest");
export function setActiveNpcPfpRequest(v: unknown): void {
  requests().activeNpcPfpRequest = v;
}

export const getActiveNpcUpdateRequest = () => peek("activeNpcUpdateRequest");
export function setActiveNpcUpdateRequest(v: unknown): void {
  requests().activeNpcUpdateRequest = v;
}

export const getActiveWorldExtractRequest = () => peek("activeWorldExtractRequest");
export function setActiveWorldExtractRequest(v: unknown): void {
  requests().activeWorldExtractRequest = v;
}

export const getActiveMemorySummarizationRequest = () => peek("activeMemorySummarizationRequest");
export function setActiveMemorySummarizationRequest(v: unknown): void {
  requests().activeMemorySummarizationRequest = v;
}

export const getActiveGenerationOrder = () => peek("activeGenerationOrder");
export function setActiveGenerationOrder(v: unknown): void {
  requests().activeGenerationOrder = v;
}

/** Read by the prompt engine only through getActiveNpcImages(); kept for imports. */
export const activeNpcImages: ReadonlyArray<{ name: string; base64: string }> = Object.freeze([]);
export function getActiveNpcImages(): Array<{ name: string; base64: string }> {
  return maybeMeguminScope()?.run.npcImages ?? [];
}
export function pushActiveNpcImage(img: { name: string; base64: string }): void {
  currentMeguminScope().run.npcImages.push(img);
}
export function clearActiveNpcImages(): void {
  const scope = maybeMeguminScope();
  if (scope) scope.run.npcImages = [];
}

/** Is a non-roleplay generation running in this run? Same OR-chain as Megumin's (no NPC scan). */
export function isBackgroundGenerationActive(): boolean {
  const r = maybeMeguminScope()?.run.requests;
  if (!r) return false;
  return Boolean(
    r.activeStoryPlanRequest ||
      r.activeBanListChat ||
      r.activeImageGenRequest ||
      r.activeNpcPfpRequest ||
      r.activeNpcUpdateRequest ||
      r.activeMemorySummarizationRequest ||
      r.activeWorldExtractRequest ||
      r.activeGenerationOrder,
  );
}
