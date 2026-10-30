// ──────────────────────────────────────────────
// Megumin Mode: the settings store
// ──────────────────────────────────────────────
// One `megumin` app setting holds the install-wide part (see shared profile-schema.ts); a chat's
// own profile lives in its metadata. Every write is a read, change and save inside one queue, so
// two editors saving different profiles never overwrite each other.
import {
  MEGUMIN_SETTINGS_KEY,
  MEGUMIN_SETTINGS_MAX_BYTES,
  MEGUMIN_SETTINGS_WARN_BYTES,
  meguminJsonByteLength,
  meguminSettingsSchema,
  resolveMeguminProfile,
  type MeguminSettings,
  type MeguminSettingsResponse,
  type ResolvedMeguminProfileState,
} from "@marinara-engine/shared";
import type { DB } from "../../db/connection.js";
import { logger } from "../../lib/logger.js";
import { parseExtra } from "../generation/prompt-attachments.js";
import { createAppSettingsStorage } from "../storage/app-settings.storage.js";

let writeQueue: Promise<unknown> = Promise.resolve();

/**
 * A write refused (HTTP 423) because the stored settings, or a chat's stored profile, do not
 * validate: values a newer version or an import wrote. Saving would replace them with defaults.
 */
export class MeguminSettingsLockedError extends Error {
  readonly statusCode = 423;
  constructor() {
    super("The saved Megumin settings could not be read, so they were left unchanged.");
  }
}

/** `readable` is false when a stored value does not validate, so a write would lose what it holds. */
async function readStoredMeguminSettings(db: DB): Promise<{ settings: MeguminSettings; readable: boolean }> {
  const raw = await createAppSettingsStorage(db).get(MEGUMIN_SETTINGS_KEY);
  const defaults = () => meguminSettingsSchema.parse({});
  if (!raw) return { settings: defaults(), readable: true };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (err) {
    // Not JSON at all: nothing in it can be kept, so the next write may replace it.
    logger.warn(err, "[megumin] Ignoring unreadable stored settings");
    return { settings: defaults(), readable: true };
  }
  const parsed = meguminSettingsSchema.safeParse(value);
  if (parsed.success) return { settings: parsed.data, readable: true };
  logger.warn({ issues: parsed.error.issues.slice(0, 5) }, "[megumin] Ignoring invalid stored settings");
  return { settings: defaults(), readable: false };
}

/** The stored settings, or the defaults when there are none or they no longer validate. */
export async function readMeguminSettings(db: DB): Promise<MeguminSettings> {
  return (await readStoredMeguminSettings(db)).settings;
}

/**
 * Save `change(current)`, validated (a ZodError, a 400 on routes, when it breaks a cap), after
 * every earlier write has finished. While the stored value does not validate nothing is saved
 * (MeguminSettingsLockedError), so a write never replaces it with the defaults.
 */
export function updateMeguminSettings(
  db: DB,
  change: (current: MeguminSettings) => MeguminSettings,
): Promise<MeguminSettings> {
  const run = writeQueue
    .catch(() => undefined)
    .then(async () => {
      const stored = await readStoredMeguminSettings(db);
      if (!stored.readable) {
        logger.error("[megumin] The stored settings do not validate; refusing to save over them");
        throw new MeguminSettingsLockedError();
      }
      const next = meguminSettingsSchema.parse(change(stored.settings));
      const value = JSON.stringify(next);
      await createAppSettingsStorage(db).set(MEGUMIN_SETTINGS_KEY, value);
      const sizeBytes = meguminJsonByteLength(next);
      if (sizeBytes > MEGUMIN_SETTINGS_WARN_BYTES) {
        logger.warn("[megumin] Settings are %d bytes; the limit is %d", sizeBytes, MEGUMIN_SETTINGS_MAX_BYTES);
      }
      return next;
    });
  writeQueue = run;
  return run;
}

export function meguminSettingsResponse(settings: MeguminSettings): MeguminSettingsResponse {
  return { settings, sizeBytes: meguminJsonByteLength(settings) };
}

function readCharacterIds(value: unknown): string[] {
  try {
    const parsed: unknown = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string" && !!id.trim()) : [];
  } catch {
    return [];
  }
}

/** A chat's Megumin profile, from a chat row (characterIds and metadata as stored). */
export function resolveMeguminProfileForChat(
  settings: MeguminSettings,
  chat: { characterIds: unknown; metadata: unknown },
): ResolvedMeguminProfileState {
  return resolveMeguminProfile({
    settings,
    chat: { characterIds: readCharacterIds(chat.characterIds), metadata: parseExtra(chat.metadata) },
  });
}
