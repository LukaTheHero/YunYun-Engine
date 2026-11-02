// ──────────────────────────────────────────────────────────────────────────────
// Megumin Suite on YunYun — the engine side (server).
//
// `@marinara-engine/shared/megumin`. The server installs a scope provider
// (host.ts), then calls Megumin's own functions through the namespaces below.
// Kept out of the package's main index so the client bundle never pulls in the
// prompt library; the client uses `@marinara-engine/shared/megumin/client`.
// See LICENSE.md: the vendored code is Megumin Suite's (CC BY-NC 4.0).
// ──────────────────────────────────────────────────────────────────────────────
export * from "./host.js";
export * from "./yunyun.js";
export * from "./turn.js";

export * as MeguminProfile from "./vendor/src/core/profile.js";
export * as MeguminKeys from "./vendor/src/core/keys.js";
export * as MeguminPower from "./vendor/src/core/power.js";
export * as MeguminSync from "./vendor/src/core/sync.js";
export * as MeguminFragments from "./vendor/src/core/sharedFragments.js";
export * as MeguminEngines from "./vendor/src/core/engines.js";
export * as MeguminInjection from "./vendor/src/engine/injection.js";
export * as MeguminDict from "./vendor/src/engine/buildBaseDict.js";
export * as MeguminChatText from "./vendor/src/engine/chatText.js";
export * as MeguminTasks from "./vendor/src/engine/tasks.js";
export * as MeguminBgPrompts from "./vendor/src/engine/bgPrompts.js";
export * as MeguminWorker from "./vendor/src/engine/workerRequest.js";
export * as MeguminState from "./vendor/src/state/index.js";
export * as MeguminBlocks from "./vendor/src/features/blocks/registry.js";
export * as MeguminBlocksWorker from "./vendor/src/features/blocks/worker.js";
export * as MeguminNotebookWorker from "./vendor/src/features/notebook/worker.js";
export * as MeguminNpcData from "./vendor/src/features/npc/data.js";
export * as MeguminNpcFields from "./vendor/src/features/npc/fields.js";
export * as MeguminNpcUpdates from "./vendor/src/features/npc/updates.js";
export * as MeguminNpcUi from "./vendor/src/features/npc/ui.js";
export * as MeguminNpcPfp from "./vendor/src/features/npc/pfp.js";
export * as MeguminMemory from "./vendor/src/features/memory/index.js";
export * as MeguminMemoryVectors from "./vendor/src/features/memory/vectordb.js";
export * as MeguminStoryPlan from "./vendor/src/features/storyplan/ui.js";
export * as MeguminStoryConfig from "./vendor/src/features/storyconfig/config.js";
export * as MeguminStoryConfigUi from "./vendor/src/features/storyconfig/ui.js";
export * as MeguminBanList from "./vendor/src/features/banlist/ui.js";
export * as MeguminModelSetup from "./vendor/src/features/modelsetup/ui.js";
export * as MeguminLoadouts from "./vendor/src/features/modelsetup/loadouts.js";
export * as MeguminImages from "./vendor/src/features/imagegen/index.js";
export * as MeguminImagesAuto from "./vendor/src/features/imagegen/auto.js";
export * as MeguminImagesV2 from "./vendor/src/features/imagegen/v2/index.js";
export * as MeguminImagesLooks from "./vendor/src/features/imagegen/v2/looks.js";
export * as MeguminSlots from "./vendor/data/slots.js";
export * as MeguminSkeleton from "./vendor/data/skeleton.js";
export * as MeguminCot from "./vendor/data/cot/index.js";
export { hardcodedLogic as MeguminLibrary } from "./vendor/data/database.js";
export { DEFAULT_PROMPTS as MEGUMIN_DEFAULT_PROMPTS } from "./vendor/src/prompts/index.js";
export { extensionName as MEGUMIN_EXTENSION_NAME } from "./vendor/src/core/constants.js";
