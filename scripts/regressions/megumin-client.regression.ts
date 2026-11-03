// Megumin Suite in the client: the activity poll's notice mark, and how a Roleplay reply draws Megumin's card.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readMeguminNotices } from "../../packages/client/src/hooks/use-megumin.ts";

const notice = (seq: number) => ({ seq, at: seq, level: "error" as const, message: `Notice ${seq}` });
const seqs = (step: { show: Array<{ seq: number }> }) => step.show.map((n) => n.seq);

// The first answer for a chat only sets the mark; later answers show what lies past it.
let step = readMeguminNotices({ after: 0, version: null }, { version: 14, notices: [notice(11), notice(12)] });
assert.deepEqual(step, { after: 12, show: [], restarted: false }, "notices from before the chat was opened stay quiet");
step = readMeguminNotices({ after: 12, version: 14 }, { version: 15, notices: [notice(12), notice(13)] });
assert.deepEqual([step.after, seqs(step), step.restarted], [13, [13], false], "a new notice is shown once");

// The server rebuilt the chat's scope (a restart, a live chat evicted after 15 idle minutes): its version and
// notice numbers start from 0 again. The mark starts over, so the rebuilt scope's notices are not hidden.
step = readMeguminNotices({ after: 13, version: 15 }, { version: 0, notices: [] });
assert.deepEqual(step, { after: 0, show: [], restarted: true }, "an evicted scope resets the mark");
step = readMeguminNotices({ after: 0, version: 0 }, { version: 2, notices: [notice(1), notice(2)] });
assert.deepEqual([step.after, seqs(step)], [2, [1, 2]], "the rebuilt scope's first notices are shown");

// A scope rebuilt before the poll looked: the answer was cut at the old mark, so it is asked again from 0.
step = readMeguminNotices({ after: 13, version: 15 }, { version: 4, notices: [] });
assert.equal(step.restarted, true, "a lower version is a rebuilt scope");
step = readMeguminNotices({ after: step.after, version: 4 }, { version: 4, notices: [notice(1), notice(2)] });
assert.deepEqual(seqs(step), [1, 2], "asked again, the notices hidden by the old mark are shown");

// The card's wiring in a Roleplay reply.
const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const chatMessage = read("packages/client/src/components/chat/ChatMessage.tsx");
assert.match(
  chatMessage,
  /<MeguminMessageCard[^>]*msgIndex=\{messageOrderIndex \?\? -1\}/,
  "the card's fallback index is Megumin's 0-based count, not the 1-based display number",
);
const vnStart = chatMessage.indexOf("  if (visualNovel) {\n    return (");
const vnBranch = chatMessage.slice(vnStart, chatMessage.indexOf("// ─── System messages", vnStart));
assert.ok(
  vnStart > 0 && /\{meguminCard && /.test(vnBranch),
  "the Visual Novel box strips the blocks and draws the card",
);
assert.match(
  read("packages/client/src/components/megumin/cards/MeguminMessageCard.tsx"),
  /onDoubleClick=\{\(e\) => \{\s*if \(e\.target instanceof Node && !e\.currentTarget\.contains\(e\.target\)\) e\.stopPropagation\(\);/,
  "a double-click in a pane editor's modal does not reach the reply's quick edit",
);
assert.match(
  read("packages/client/src/components/megumin/tabs/PresetTab.tsx"),
  /for \(const mod of V7_MODULES\) p\.toggles\[mod\.id\] \?\?= true;/,
  "V7 modules shown On are written On, as Megumin does, since the engine strips unset ones",
);

console.log("megumin-client regression passed");

// ── The panel's profile edits: a list edited twice keeps the base the server still holds ──
const { appendMeguminProfileOps, applyMeguminProfileOps, diffMeguminProfile, MeguminProfileConflictError } =
  await import("../../packages/shared/src/megumin/patch.ts");
const serverNpcs = [{ name: "Aqua" }];
const first = diffMeguminProfile(
  { npcBank: { npcs: serverNpcs } },
  { npcBank: { npcs: [{ name: "Aqua (goddess)" }] } },
);
const second = diffMeguminProfile(
  { npcBank: { npcs: [{ name: "Aqua (goddess)" }] } },
  { npcBank: { npcs: [{ name: "Aqua (useless goddess)" }] } },
);
const merged = appendMeguminProfileOps(first, second);
assert.equal(merged.length, 1);
assert.deepEqual((merged[0] as { base?: unknown }).base, serverNpcs, "the server's list stays the base");
const live = { npcBank: { npcs: [{ name: "Aqua" }] } };
applyMeguminProfileOps(live, merged);
assert.equal(live.npcBank.npcs[0]!.name, "Aqua (useless goddess)");
// Megumin added an NPC meanwhile: the stale list is refused, nothing is written.
const grown = { npcBank: { npcs: [{ name: "Aqua" }, { name: "Darkness" }] } };
assert.throws(() => applyMeguminProfileOps(grown, merged), MeguminProfileConflictError);
assert.equal(grown.npcBank.npcs.length, 2);
// Without a base check (the client rebuilding what it shows), the ops simply apply.
applyMeguminProfileOps(grown, merged, { checkBase: false });
assert.equal(grown.npcBank.npcs.length, 1);
// A nested object keeps its identity and its other fields.
const profile = { worldState: { enabled: true, mode: "update" } };
const nested = profile.worldState;
applyMeguminProfileOps(profile, diffMeguminProfile(profile, { worldState: { enabled: false, mode: "update" } }));
assert.equal(profile.worldState, nested);
assert.deepEqual(profile.worldState, { enabled: false, mode: "update" });

console.log("megumin-client profile patch cases passed");

// ── The Megumin Suite window: an "open on this tab" request opens it and lands on the tab ──
// A card's "Open in NPC Bank" asks before the window may exist; the request waits until the window takes it.
const fakeWindow = new EventTarget();
Object.assign(globalThis, { window: fakeWindow });
const { openMeguminWindow, takeRequestedMeguminTab } =
  await import("../../packages/client/src/lib/megumin-tab-request.ts");
const { useMeguminWindowStore } = await import("../../packages/client/src/stores/megumin-window.store.ts");
assert.equal(useMeguminWindowStore.getState().open, false, "the window starts closed");
openMeguminWindow("npc");
assert.equal(useMeguminWindowStore.getState().open, true, "asking for a tab opens the window");
assert.equal(takeRequestedMeguminTab(), "npc", "the window finds the tab it was asked for");
assert.equal(takeRequestedMeguminTab(), null, "a request is taken once");
// The side panel sends the object form.
fakeWindow.dispatchEvent(new CustomEvent("megumin:open-tab", { detail: { tabId: "memory" } }));
assert.equal(takeRequestedMeguminTab(), "memory");
useMeguminWindowStore.getState().setOpen(false);
openMeguminWindow();
assert.equal(takeRequestedMeguminTab(), null, "opening without a tab leaves the current tab alone");
assert.equal(useMeguminWindowStore.getState().open, true);

console.log("megumin-client window cases passed");
