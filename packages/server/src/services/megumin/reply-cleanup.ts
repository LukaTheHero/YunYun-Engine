// ──────────────────────────────────────────────
// Megumin Mode: reply cleanup before a Megumin turn's reply is saved
//
// Megumin Suite hid two kinds of tags with regex scripts. The Dialogue & Narration add-on asks the
// model to wrap prose in <narration> and <dialogue > tags, which Megumin hid from the display and
// the prompt (script "narration|dialogue tags cleanup"). Chinese-community presets leave junk tags
// that Megumin kept out of the prompt ("Thinking cleanup B"). Here both are removed once, before
// the reply is saved, so the display, the prompt, exports and edits never see them.
// ──────────────────────────────────────────────

// Upstream's pattern, with the tag body kept to one line and stopped at the next "<" so a long
// line costs linear time.
const DIALOGUE_NARRATION_TAG = /(?:<|&lt;)\/?(?:narration|dialogue)[^<>\n]*?(?:>|&gt;)/giu;
// Upstream's alternation, one tag at a time (case-sensitive, as upstream). Its last branch, any
// <think> block, is not ported: a reply's leading reasoning is already lifted into the reasoning.
const JUNK_BLOCKS = ["disclaimer", "guifan", "danmu", "options"].map(
  (tag) => new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, "gu"),
);
const JUNK_MARKERS = /`<done>`|<done>|```start|```end/gu;

/** A Megumin reply without the Dialogue & Narration tags and the junk tags Megumin Suite cleared. */
export function cleanMeguminReply(text: string): string {
  let out = text.replace(DIALOGUE_NARRATION_TAG, "");
  for (const block of JUNK_BLOCKS) out = out.replace(block, "");
  out = out.replace(JUNK_MARKERS, "");
  return out === text ? text : out.replace(/\n{3,}/gu, "\n\n").trim();
}

/** Reasoning without the extra opening <think> tags the V10 prefill and the Gemini wrapper repeat. */
export function cleanMeguminThinking(thinking: string): string {
  return thinking.replace(/^(?:\s*<think>)+\s*/iu, "");
}
