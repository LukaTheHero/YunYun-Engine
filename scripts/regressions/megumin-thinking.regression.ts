import assert from "node:assert/strict";

// The unopened-reasoning option of the inline thinking extractor and its stream filter: off by
// default (nothing changes for anyone else), the first close tag only, within the window, never a
// close tag its own opening precedes, and the stream filter agreeing with the extractor for any
// chunking. Megumin turns with reasoning on are the only callers (see megumin-mode-gating).

const { MAX_UNOPENED_THINKING_CHARS, createInlineThinkingStreamFilter, extractLeadingThinkingBlocks } =
  await import("../../packages/shared/src/index.js");

const KSC = [{ open: "<ksc>", close: "</ksc>" }];
const ON = { allowLeadingUnopenedClose: true };

// Off by default: an unopened close tag is ordinary text.
const orphan = "the scene needs a slower beat.\n</think>\nRain hits the window.";
assert.deepEqual(extractLeadingThinkingBlocks(orphan), { content: orphan, thinking: "", stripped: false });

// On: everything before the first close tag is reasoning.
assert.deepEqual(extractLeadingThinkingBlocks(orphan, [], ON), {
  content: "Rain hits the window.",
  thinking: "the scene needs a slower beat.",
  stripped: true,
});
// Custom pairs count, case-insensitively, and the first close tag wins.
assert.deepEqual(extractLeadingThinkingBlocks("plan</KSC>\nStory with a </think> in it.", KSC, ON), {
  content: "Story with a </think> in it.",
  thinking: "plan",
  stripped: true,
});
// An opened block still works as before, and an unopened one is never looked for after it.
assert.deepEqual(extractLeadingThinkingBlocks("<think>a</think>\nb</think>\nc", [], ON), {
  content: "b</think>\nc",
  thinking: "a",
  stripped: true,
});
// After an unopened block, an opened one right behind it is lifted too.
assert.deepEqual(extractLeadingThinkingBlocks("a</think>\n<thinking>b</thinking>\nc", [], ON), {
  content: "c",
  thinking: "a\n\nb",
  stripped: true,
});
// A close tag its own opening comes before is the reply's text.
const quoted = "She wrote <think>x</think> on the board.";
assert.deepEqual(extractLeadingThinkingBlocks(quoted, [], ON), { content: quoted, thinking: "", stripped: false });
// The window bounds the match.
const late = `${"r".repeat(MAX_UNOPENED_THINKING_CHARS)}</think>reply`;
assert.equal(extractLeadingThinkingBlocks(late, [], ON).stripped, false, "a close tag past the window is text");
const edge = `${"r".repeat(MAX_UNOPENED_THINKING_CHARS - 1)}</think>reply`;
assert.equal(extractLeadingThinkingBlocks(edge, [], ON).content, "reply", "inside the window it is reasoning");
// No close tag at all: nothing to lift.
assert.equal(extractLeadingThinkingBlocks("Just a reply.", [], ON).stripped, false);

// The stream filter agrees with the extractor, whatever the chunking.
function streamed(text: string, size: number, options?: typeof ON) {
  const filter = createInlineThinkingStreamFilter(KSC, options);
  let visible = "";
  let thinking = "";
  for (let i = 0; i < text.length; i += size) {
    const out = filter.push(text.slice(i, i + size));
    visible += out.visible;
    thinking += out.thinking;
  }
  const out = filter.flush();
  return { visible: visible + out.visible, thinking: thinking + out.thinking };
}
for (const text of [
  orphan,
  "plan</KSC>\nStory with a </think> in it.",
  "<think>a</think>\nb</think>\nc",
  "a</think>\n<thinking>b</thinking>\nc",
  quoted,
  late,
  edge,
  "Just a reply.",
  "",
]) {
  const extracted = extractLeadingThinkingBlocks(text, KSC, ON);
  for (const size of [1, 3, 7, 64, 100_000]) {
    const out = streamed(text, size, ON);
    // Small chunks can carry the whitespace after a close tag through, as they always have.
    assert.equal(out.visible.trimStart(), extracted.content, `visible text, ${size}-char chunks: ${text.slice(0, 40)}`);
    const squash = (value: string) => value.replace(/\s+/g, "");
    assert.equal(squash(out.thinking), squash(extracted.thinking), `reasoning, ${size}-char chunks`);
    // And without the option the filter is unchanged: nothing unopened is held or lifted.
    const plain = extractLeadingThinkingBlocks(text, KSC);
    assert.equal(streamed(text, size).visible.trimStart(), plain.content, `option off, ${size}-char chunks`);
  }
}

// reset() forgets a lifted block.
const filter = createInlineThinkingStreamFilter([], ON);
filter.push("a</think>b");
filter.reset();
assert.deepEqual(filter.push("c</think>d"), { visible: "d", thinking: "c" });

console.info("megumin thinking regression passed");
