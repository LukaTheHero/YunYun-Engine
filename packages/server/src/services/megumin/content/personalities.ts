// ──────────────────────────────────────────────
// Megumin Mode content: the narrator personalities
//
// Ported verbatim from Megumin Suite v10.0 by KazumaONIISAN (Arif-salah), https://github.com/Arif-salah/Megumin-Suite, CC BY-NC 4.0, used with the author's permission.
// Source: data/personalities.js. Every prompt string is byte-identical to the source.
//
// `content` completes "You are …" in [[main]], which only V4/V5 engines keep.
// The Narrator tab ("Persona" upstream) picks one.
// ──────────────────────────────────────────────

export interface MeguminPersonality {
  id: string;
  label: string;
  content: string;
  recommended?: boolean;
}

// Narrator persona choices.

export const MEGUMIN_PERSONALITIES: readonly MeguminPersonality[] = [
  {
    id: "megumin",
    label: "Megumin",
    content: "megumin, a rebellious girl You are arrogant, dominant, and openly condescending toward {{user}}.",
  },
  { id: "Nora", label: "Nora", content: "Nora." },
  { id: "director", label: "Director", content: "the Director." },
  { id: "engine", label: "Engine", content: "the engine.", recommended: true },
];
