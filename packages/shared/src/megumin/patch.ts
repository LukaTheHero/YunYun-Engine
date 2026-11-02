// ──────────────────────────────────────────────────────────────────────────────
// `@marinara-engine/shared/megumin/patch`: what the panel changed in a profile,
// as path-level operations, and applying them to the live profile in place.
//
// The server's live profile is also written by Megumin's own background work
// (Chomusuke's NPC updates, Memory's chunks, the Story Director's plan), and its
// jobs hold references to its nested objects. A panel save therefore never sends
// the whole profile back: it sends only the leaves the person changed, and the
// server sets exactly those, keeping every other value and every object's
// identity. Arrays and other non-plain values are leaves, and a list is only
// replaced when it is still the list the panel edited (Megumin may have added to
// it meanwhile): otherwise the save is refused as a conflict and the panel shows
// the current list, rather than silently dropping what Megumin wrote.
// ──────────────────────────────────────────────────────────────────────────────

export type MeguminProfilePath = string[];

export type MeguminProfileOp =
  | {
      op: "set";
      path: MeguminProfilePath;
      value: unknown;
      /** For a list: the list the edit was made on. The set only applies while the live value is still that. */
      base?: unknown;
    }
  | { op: "unset"; path: MeguminProfilePath };

/** A list changed on the server since the panel read it: the panel's copy would drop that change. */
export class MeguminProfileConflictError extends Error {
  readonly conflict = true;
  constructor(readonly path: MeguminProfilePath) {
    super(`Megumin changed "${path.join(".")}" while it was being edited. The panel now shows the current version.`);
  }
}

/** Path segments that could reach an object's prototype: never written. */
const FORBIDDEN = new Set(["__proto__", "constructor", "prototype"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/** The operations that turn `base` into `next` (both plain profiles). */
export function diffMeguminProfile(
  base: Record<string, unknown>,
  next: Record<string, unknown>,
  path: MeguminProfilePath = [],
): MeguminProfileOp[] {
  const ops: MeguminProfileOp[] = [];
  for (const key of Object.keys(next)) {
    const before = base[key];
    const after = next[key];
    if (after === undefined) {
      if (key in base) ops.push({ op: "unset", path: [...path, key] });
      continue;
    }
    if (isPlainObject(before) && isPlainObject(after)) ops.push(...diffMeguminProfile(before, after, [...path, key]));
    else if (!same(before, after)) {
      ops.push(
        Array.isArray(before)
          ? { op: "set", path: [...path, key], value: after, base: before }
          : { op: "set", path: [...path, key], value: after },
      );
    }
  }
  for (const key of Object.keys(base)) if (!(key in next)) ops.push({ op: "unset", path: [...path, key] });
  return ops;
}

const isWithin = (inner: MeguminProfilePath, outer: MeguminProfilePath) =>
  inner.length >= outer.length && outer.every((segment, i) => inner[i] === segment);

/**
 * Adds `later` after `earlier`, dropping earlier operations a later one overrides (the same path or inside it).
 * A list edited twice before saving keeps the first edit's base: that is the list the server still holds.
 */
export function appendMeguminProfileOps(earlier: MeguminProfileOp[], later: MeguminProfileOp[]): MeguminProfileOp[] {
  let out = earlier;
  for (const op of later) {
    const replaced = out.find((prev) => prev.op === "set" && "base" in prev && samePath(prev.path, op.path));
    const next = replaced && op.op === "set" && replaced.op === "set" ? { ...op, base: replaced.base } : op;
    out = [...out.filter((prev) => !isWithin(prev.path, op.path)), next];
  }
  return out;
}

const samePath = (a: MeguminProfilePath, b: MeguminProfilePath) =>
  a.length === b.length && a.every((segment, i) => segment === b[i]);

export function isSafeMeguminProfilePath(path: unknown): path is MeguminProfilePath {
  return (
    Array.isArray(path) &&
    path.length > 0 &&
    path.length <= 16 &&
    path.every((s) => typeof s === "string" && s.length > 0 && s.length <= 200 && !FORBIDDEN.has(s))
  );
}

/**
 * Applies operations to `target` in place: objects on the way are kept (created when missing), and only the
 * leaf at the end of each path is set or removed. Values are copied, never aliased to the request.
 */
export function applyMeguminProfileOps(
  target: Record<string, unknown>,
  ops: MeguminProfileOp[],
  options: { checkBase?: boolean } = {},
): void {
  const checkBase = options.checkBase !== false;
  // A list that changed underneath the edit refuses the whole save before anything is written.
  if (checkBase) {
    for (const op of ops) {
      if (op.op !== "set" || !("base" in op)) continue;
      if (!isSafeMeguminProfilePath(op.path)) throw new Error("A profile change has an invalid path.");
      let node: unknown = target;
      for (const segment of op.path) node = isPlainObject(node) ? node[segment] : undefined;
      if (!same(node, op.base)) throw new MeguminProfileConflictError(op.path);
    }
  }
  for (const op of ops) {
    if (!isSafeMeguminProfilePath(op.path)) throw new Error("A profile change has an invalid path.");
    let node: Record<string, unknown> = target;
    for (const segment of op.path.slice(0, -1)) {
      const child = node[segment];
      if (!isPlainObject(child)) {
        if (op.op === "unset") {
          node = {};
          break;
        }
        node[segment] = {};
      }
      node = node[segment] as Record<string, unknown>;
    }
    const leaf = op.path[op.path.length - 1]!;
    if (op.op === "unset") delete node[leaf];
    else node[leaf] = op.value === undefined ? undefined : (JSON.parse(JSON.stringify(op.value)) as unknown);
  }
}
