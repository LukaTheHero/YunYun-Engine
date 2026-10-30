// ──────────────────────────────────────────────
// Megumin Mode content: the Memory Core prompts
//
// Ported verbatim from Megumin Suite v10.0 by KazumaONIISAN (Arif-salah), https://github.com/Arif-salah/Megumin-Suite, CC BY-NC 4.0, used with the author's permission.
// Source: src/prompts/memoryCore.js. Every prompt string is byte-identical to the source.
// ──────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// MemoryCore prompts.
//
// Memory Core — chunk summarisation and the long/short term templates.
//
// Text moved verbatim out of index.js — not reworded. These are the built-in
// defaults; user edits never change this file.
// ─────────────────────────────────────────────────────────────────────────────

/** The Memory Core keys. Placeholders keep upstream's {{token}} spelling. */
export type MeguminMemoryCorePromptKey = "systemPrompt" | "userPrompt" | "longTermTemplate" | "shortTermTemplate";

export const MEGUMIN_MEMORY_CORE_PROMPTS: Readonly<Record<MeguminMemoryCorePromptKey, string>> = {
  systemPrompt:
    "You are an expert narrative condenser. Your task is to read a chunk of chat history and summarize exactly what happened. Preserve important story details, but aggressively remove all 'purple prose' and flowery descriptions.\n\nFocus ONLY on impactful actions and meaningful dialogue:\n- Condense small talk (e.g., summarize a long, drawn-out greeting simply as 'He said hello').\n- Ignore trivial, unnecessary physical actions (e.g., grabbing a glass of water, shifting in a chair) unless they directly impact the story.\n- Do not quote dialogue directly; summarize the core point of the conversation.\n\nWrite a direct, clear narrative summary of what the characters did and what was communicated.\n\nCRITICAL: You must write the summary in {{targetLang}}.",
  userPrompt:
    "Summarize the impactful events and meaningful conversations from the following chat chunk. Strip out the purple prose and trivial actions.\n\n<chat>\n{{chatHistory}}\n</chat>\n\nOutput the summary in {{targetLang}}:",
  longTermTemplate:
    "[LONG-TERM MEMORY VAULT]\nThe following are raw archives of highly relevant past events. Use timestamps to prevent context collapse. Do not hallucinate them as currently happening.\n{{archiveXML}}",
  shortTermTemplate: "[SHORT-TERM MEMORY]\nRecent state extractions:\n{{shortXML}}",
};
