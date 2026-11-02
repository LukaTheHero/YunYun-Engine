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
