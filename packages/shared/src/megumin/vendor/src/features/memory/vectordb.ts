// YunYun override of Megumin Suite src/features/memory/vectordb.js.
//
// Megumin's Semantic scanner keeps the long-term vault in SillyTavern's vector
// store and asks it for the archives nearest the latest message. YunYun embeds
// with its own embedding source (the chat's embedding connection or the local
// model) and ranks in process. Kept as in Megumin: the pieces a long entry is
// cut into, the query text, top 12 at a 0.2 threshold, at most 3 archives, and
// the TF-IDF fallback when nothing comes back.
// Derived from Megumin Suite (CC BY-NC 4.0, see LICENSE.md).
import { getContext, debounce } from "../../st.js";
import { localProfile } from "../../core/state.js";
import { meguminCleanChatHistoryText } from "../../engine/chatText.js";
import { memStringHash } from "./keywords.js";

const hashOf = (text: string): string => String(memStringHash(text));
import { maybeMeguminScope } from "../../../../host.js";

type VaultEntry = { id: string; text?: string; summary?: string; [k: string]: unknown };

type PieceVectors = Map<string, { textHash: string; vector: number[] }>;

const matchesByChat = new Map<string, VaultEntry[]>();
const queryTextByChat = new Map<string, string | null>();
/** chatId → the embedding space its vectors are in, and piece hash → { text hash, vector } */
const vectors = new Map<string, { space: string; pieces: PieceVectors }>();

function chatKey(): string {
  return maybeMeguminScope()?.chat.chatId ?? "";
}

function matchesNow(): VaultEntry[] {
  return matchesByChat.get(chatKey()) ?? [];
}

function setMatches(list: VaultEntry[]) {
  matchesByChat.set(chatKey(), list);
}

/** Megumin reads this as a live array; here it is the current chat's matches. */
export const currentSemanticMatches: VaultEntry[] = new Proxy([] as VaultEntry[], {
  get(_t, key) {
    const list = matchesNow();
    const value = (list as any)[key];
    return typeof value === "function" ? value.bind(list) : value;
  },
  has: (_t, key) => key in matchesNow(),
  ownKeys: () => Reflect.ownKeys(matchesNow()),
  getOwnPropertyDescriptor: (_t, key) => Object.getOwnPropertyDescriptor(matchesNow(), key),
});

export function memGetCollectionId(): string | null {
  const context = getContext();
  if (!context || !context.chatId) return null;
  return ("megumin_" + context.chatId).replace(/[^a-zA-Z0-9_]/g, "_");
}

export const MAX_EMBED_CHARS = 1200;
export const MAX_EMBED_PIECES = 128;

export function memEmbedPieces(chunk: VaultEntry): Array<{ id: string; text: string }> {
  const text = String(chunk?.text || chunk?.summary || "");
  if (text.length <= MAX_EMBED_CHARS) return [{ id: chunk.id, text }];
  const pieces: Array<{ id: string; text: string }> = [];
  let pos = 0;
  while (pos < text.length && pieces.length < MAX_EMBED_PIECES) {
    let end = Math.min(pos + MAX_EMBED_CHARS, text.length);
    if (end < text.length) {
      const sp = text.lastIndexOf(" ", end);
      if (sp > pos && end - sp <= 200) end = sp;
    }
    pieces.push({ id: chunk.id + "#" + pieces.length, text: text.slice(pos, end) });
    pos = end;
    while (text[pos] === " ") pos++;
  }
  return pieces;
}

/** The chat's vectors in this embedding space. Vectors from another space (the embedding model changed) are dropped. */
function chatVectors(space: string): PieceVectors {
  const key = chatKey();
  let entry = vectors.get(key);
  if (!entry || entry.space !== space) {
    entry = { space, pieces: new Map() };
    vectors.set(key, entry);
  }
  return entry.pieces;
}

/**
 * Embeds whatever pieces are missing or changed. False when there is no embedding source, or when `space` is given
 * and the source answered from another one (it changed meanwhile).
 */
async function ensureVectors(pieces: Array<{ id: string; text: string }>, space?: string): Promise<boolean> {
  const scope = maybeMeguminScope();
  if (!scope?.chat.embed) return false;
  const cached = vectors.get(chatKey());
  const have = cached && (space === undefined || cached.space === space) ? cached.pieces : undefined;
  const missing = pieces.filter((p) => {
    const v = have?.get(hashOf(p.id));
    return !v || v.textHash !== hashOf(p.text);
  });
  for (let i = 0; i < missing.length; i += 50) {
    const batch = missing.slice(i, i + 50);
    const out = await scope.chat.embed(batch.map((p) => p.text));
    if (!out || out.vectors.length !== batch.length) return false;
    if (space !== undefined && out.space !== space) return false;
    const map = chatVectors(out.space);
    batch.forEach((p, n) => map.set(hashOf(p.id), { textHash: hashOf(p.text), vector: out.vectors[n] as number[] }));
  }
  return true;
}

export async function memInsertToVectorDB(chunks: VaultEntry[], _expectIdentity?: string): Promise<boolean> {
  if (!chunks || chunks.length === 0) return true;
  if (!memGetCollectionId()) return false;
  return ensureVectors(chunks.flatMap((c) => memEmbedPieces(c)));
}

export async function memDeleteFromVectorDB(ids: string[], _expectIdentity?: string): Promise<void> {
  if (!ids || ids.length === 0) return;
  const map = vectors.get(chatKey())?.pieces;
  if (!map) return;
  for (const id of ids) {
    map.delete(hashOf(id));
    for (let n = 0; n < MAX_EMBED_PIECES; n++) map.delete(hashOf(id + "#" + n));
  }
}

export function memBuildQueryText(): string {
  const MAX_QUERY_CHARS = 1200;
  const MIN_MEANINGFUL = 16;
  const context = getContext();
  if (!context || !context.chat) return "";
  const nonSystem = context.chat.filter((m: any) => !m.is_system);
  const clean = (m: any) => meguminCleanChatHistoryText(m.mes);
  let userIdx = -1;
  for (let i = nonSystem.length - 1; i >= 0; i--) {
    if (nonSystem[i].is_user) {
      userIdx = i;
      break;
    }
  }
  const userText = userIdx >= 0 ? String(clean(nonSystem[userIdx])).trim() : "";
  const text =
    userText.length >= MIN_MEANINGFUL
      ? userText.slice(-MAX_QUERY_CHARS)
      : nonSystem.slice(-2).map(clean).join(" ").slice(-MAX_QUERY_CHARS);
  return text.trim();
}

function cosine(a: number[], b: number[]): number {
  // Vectors of different lengths come from different models: they share no meaning.
  if (a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export async function memUpdateSemanticQuery(): Promise<void> {
  const mem = localProfile?.memoryCore;
  const key = chatKey();
  if (!mem || mem.scannerEngine !== "semantic" || !mem.longTermVault || mem.longTermVault.length === 0) {
    setMatches([]);
    queryTextByChat.set(key, null);
    return;
  }
  const query = memBuildQueryText();
  if (!query || !memGetCollectionId()) {
    setMatches([]);
    queryTextByChat.set(key, null);
    return;
  }
  queryTextByChat.set(key, query);
  try {
    const vault: VaultEntry[] = mem.longTermVault;
    const pieces = vault.flatMap((v) => memEmbedPieces(v).map((p) => ({ ...p, entry: v })));
    // The query first: its space is the one the vault must be in (re-embedded when the source changed).
    const asked = await maybeMeguminScope()?.chat.embed?.([query]);
    const queryVector = asked?.vectors[0];
    if (!asked || !queryVector || !(await ensureVectors(pieces, asked.space))) {
      setMatches([]);
      return;
    }
    const map = chatVectors(asked.space);
    const ranked = pieces
      .map((p) => ({ p, score: cosine(queryVector, map.get(hashOf(p.id))?.vector ?? []) }))
      .filter((r) => r.score >= 0.2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);
    const seen = new Set<string>();
    const out: VaultEntry[] = [];
    for (const r of ranked) {
      if (seen.has(r.p.entry.id)) continue;
      seen.add(r.p.entry.id);
      out.push({ ...r.p.entry, score: 99, matchedWords: ["Semantic Embedding Match"] });
      if (out.length >= 3) break;
    }
    setMatches(out);
  } catch {
    setMatches([]);
  }
}

export const memUpdateSemanticQueryDebounced = debounce(memUpdateSemanticQuery, 800);

export async function memEnsureSemanticQueryFresh(): Promise<void> {
  const mem = localProfile?.memoryCore;
  if (!mem || mem.scannerEngine !== "semantic") return;
  if (!mem.longTermVault || mem.longTermVault.length === 0) return;
  const wanted = memBuildQueryText();
  if (!wanted) return;
  if (wanted === queryTextByChat.get(chatKey())) return;
  await memUpdateSemanticQuery();
}
