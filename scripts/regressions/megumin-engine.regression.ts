import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Megumin Suite's vendored engine, run the way YunYun's server hosts it: one chat
// scope, Megumin's own profile load, the V11 Universal preset filled for a turn,
// a reply's blocks recorded by the state store, and MEGUMINTOGGLE off leaving
// the prompt exactly as built.
const megumin = await import("../../packages/shared/src/megumin/index.js");
const {
  setMeguminScopeProvider,
  createRunState,
  MeguminProfile,
  MeguminInjection,
  MeguminState,
  MEGUMIN_EXTENSION_NAME,
  meguminOnReplyReceived,
} = megumin;

type Msg = {
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
};

function message(id: string, role: "user" | "assistant", text: string): Msg {
  return {
    id,
    role,
    characterId: role === "assistant" ? "char-1" : null,
    name: role === "user" ? "Kazuma" : "Aqua",
    is_user: role === "user",
    is_system: false,
    mes: text,
    swipe_id: 0,
    swipes: [text],
    swipe_info: [{ extra: {} }],
    extra: {},
  };
}

const notices: string[] = [];
const settings: Record<string, any> = {};
const chatScope: any = {
  chatId: "chat-1",
  chat: [message("m1", "assistant", "Aqua waves from the fountain."), message("m2", "user", "I walk over.")],
  metadata: {},
  settings,
  profile: {},
  loadedProfileKey: null,
  characters: [
    { id: "char-1", name: "Aqua", avatar: "char-1", description: "A goddess.", personality: "", scenario: "" },
  ],
  characterId: 0,
  groupId: null,
  groups: [],
  name1: "Kazuma",
  name2: "Aqua",
  substitute: (text: string) => text.replace(/\{\{user\}\}/g, "Kazuma").replace(/\{\{char\}\}/g, "Aqua"),
  quiet: async () => "",
  notify: (n: { message: string }) => notices.push(n.message),
  dirty: { metadata: false, settings: false, chat: false, profile: false },
};
const scope = { chat: chatScope, run: createRunState() };
setMeguminScopeProvider(() => scope);

// ── The profile: Megumin's own defaults (V11 Тайна, its chain of thought, Story Config on) ──
settings[MEGUMIN_EXTENSION_NAME] = { globalSettings: { suiteEnabled: true } };
MeguminProfile.initProfile();
assert.equal(chatScope.profile.mode, "v11-voice", "a new install starts on V11 Тайна");
assert.equal(chatScope.profile.model, "cot-v11-voice-english");
assert.ok(settings[MEGUMIN_EXTENSION_NAME].profiles?.default, "the global default profile is created");

// ── The V11 Universal preset as the server seeds it: the 100001 order, markers dropped ──
const preset = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL("../../packages/server/src/db/megumin-presets/Megumin Suite V11 Universal.json", import.meta.url),
    ),
    "utf8",
  ),
);
const byId = new Map<string, any>(preset.prompts.map((p: any) => [p.identifier, p]));
const order = preset.prompt_order.find((o: any) => o.character_id === 100001).order;
function buildPrompt(history: Array<{ role: string; content: string }>) {
  const out: Array<{ role: string; content: string }> = [];
  for (const entry of order) {
    if (!entry.enabled) continue;
    const p = byId.get(entry.identifier);
    if (!p) continue;
    if (entry.identifier === "chatHistory") {
      out.push(...history.map((m) => ({ ...m })));
      continue;
    }
    if (p.marker) continue;
    if (!p.content) continue;
    // YunYun's assembler resolves the preset's own macros before Megumin fills its slots.
    out.push({ role: p.role || "system", content: chatScope.substitute(p.content) });
  }
  return out;
}

const history = [
  { role: "assistant", content: "Aqua waves from the fountain." },
  { role: "user", content: "I walk over." },
];

// ── Toggle off: the prompt goes out exactly as built, slots and all ──
settings[MEGUMIN_EXTENSION_NAME].globalSettings.suiteEnabled = false;
const untouched = buildPrompt(history);
const before = JSON.stringify(untouched);
await MeguminInjection.handlePromptInjection({ messages: untouched }, "normal");
assert.equal(JSON.stringify(untouched), before, "MEGUMINTOGGLE off changes nothing");

// ── Toggle on: every slot filled, none left for the model to read ──
settings[MEGUMIN_EXTENSION_NAME].globalSettings.suiteEnabled = true;
chatScope.profile.blockStack.order = ["cyoa", "world"];
chatScope.profile.blocks = ["cyoa", "info"];
const filled = buildPrompt(history);
await MeguminInjection.handlePromptInjection({ messages: filled }, "normal");
const text = filled.map((m) => m.content).join("\n");
assert.ok(!/\[\[[^\]\n]+\]\]/.test(text), "no [[slot]] reaches the model");
assert.ok(text.includes("<role>"), "V11 Тайна's own rules are in the prompt");
assert.ok(text.includes("<think>"), "its chain of thought is asked for");
assert.ok(text.includes("<CYOA>"), "the CYOA block is asked for");
assert.ok(text.includes("<World_State>") || text.includes("World_State"), "the World State block is asked for");
assert.ok(!text.includes("{{user}}"), "macros in the filled text are substituted");
assert.ok(
  filled.some((m) => m.role === "user" && m.content.includes("I walk over.")),
  "the chat history is kept",
);

// ── A reply's World State is recorded and reaches the next prompt's Current Info ──
const reply =
  "Aqua grins.\n<Blocks>\n<World_State>\nTime: Morning | Loc: Axel fountain | Wx: sunny\nAqua.Outfit: blue dress\nAqua.Position: sitting on the fountain edge\n</World_State>\n<CYOA>\n1. **Wave back** — return the greeting\n2. **Ask for help** — she owes you\n</CYOA>\n</Blocks>";
chatScope.chat.push(message("m3", "assistant", reply));
await meguminOnReplyReceived(2, "normal");
const world = MeguminState.getWorldState();
assert.equal(world.scene.location, "Axel fountain", "the reply's location is the world's");
assert.ok(chatScope.chat[2].extra.megumin_uid, "the reply is stamped so swipes can undo it");
assert.ok(chatScope.metadata.megumin_state, "the state lives in the chat's metadata");

const next = buildPrompt([...history, { role: "assistant", content: reply }, { role: "user", content: "I wave." }]);
await MeguminInjection.handlePromptInjection({ messages: next }, "normal");
const nextText = next.map((m) => m.content).join("\n");
assert.ok(nextText.includes("<Current_Info>"), "Current Info carries the kept state");
assert.ok(nextText.includes("Axel fountain"), "with the world as it stands");
const replyInPrompt = next.find((m) => m.role === "assistant" && m.content.startsWith("Aqua grins."));
assert.ok(replyInPrompt && !replyInPrompt.content.includes("<Blocks>"), "old blocks are hidden from the model");

// ── A swipe to a fresh reply drops that reply's changes ──
chatScope.chat[2].swipe_id = 1;
chatScope.chat[2].swipes.push("Aqua ignores you.");
chatScope.chat[2].swipe_info.push({ extra: { ...chatScope.chat[2].extra } });
chatScope.chat[2].mes = "Aqua ignores you.";
MeguminState.stateOnSwiped(2);
assert.notEqual(MeguminState.getWorldState().scene.location, "Axel fountain", "the swiped-away reply no longer counts");

// ── The reply drawn above its card: only the block regions leave, nothing else changes ──
const { stripBlocksForDisplay } = await import("../../packages/shared/src/megumin/strip.js");
const tags = ["World_State", "CYOA", "Dice"];
const prose = "**Before.**\n\n\n> Extra blank lines stay.\n\n<details><summary>World State</summary>kept</details>";
assert.equal(stripBlocksForDisplay(prose, tags), prose, "a reply without blocks is drawn exactly as written");
assert.equal(
  stripBlocksForDisplay(
    "<Dice>d20: 14</Dice>\nAqua waves.\n\n\nShe grins.\n<Blocks>\n<CYOA>\n1. Go\n</CYOA>\n</Blocks>",
    tags,
  ),
  "Aqua waves.\n\n\nShe grins.",
  "lead and envelope blocks leave; the prose's own blank lines stay",
);
assert.equal(
  stripBlocksForDisplay("Aqua waves.\n\n<World_State>\nTime: Morning", tags),
  "Aqua waves.",
  "a block cut off at the end leaves too",
);

console.log("megumin-engine regression passed");
