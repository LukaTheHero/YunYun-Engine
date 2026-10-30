// ──────────────────────────────────────────────
// Routes: Megumin Mode settings and profiles
// ──────────────────────────────────────────────
// Reads always work, so the editor can show settings while Megumin Mode is off; writes need the
// switch on. A chat's profile is the room host's: a guest's joined chat cannot change it.
import type { FastifyInstance, FastifyReply } from "fastify";
import {
  MEGUMIN_PROFILE_METADATA_KEY,
  MEGUMIN_SETTINGS_MAX_BYTES,
  meguminProfileUpdateSchema,
  meguminSettingsUpdateSchema,
  parseMeguminProfile,
} from "@marinara-engine/shared";
import { logger } from "../lib/logger.js";
import { isFeatureEnabled } from "../services/features/feature-settings.js";
import { parseExtra } from "../services/generation/prompt-attachments.js";
import {
  MeguminSettingsLockedError,
  meguminSettingsResponse,
  readMeguminSettings,
  resolveMeguminProfileForChat,
  updateMeguminSettings,
} from "../services/megumin/settings.js";
import { createCharactersStorage } from "../services/storage/characters.storage.js";
import { createChatsStorage } from "../services/storage/chats.storage.js";

// A request may escape characters the stored JSON keeps as UTF-8, so allow twice the store's cap.
const WRITE_OPTIONS = { bodyLimit: MEGUMIN_SETTINGS_MAX_BYTES * 2 };

function refuseWhileOff(reply: FastifyReply) {
  return reply.status(409).send({ error: "Megumin Mode is off. Turn it on to change its settings." });
}

export async function meguminRoutes(app: FastifyInstance) {
  const chats = createChatsStorage(app.db);
  const characters = createCharactersStorage(app.db);

  app.get("/settings", async () => meguminSettingsResponse(await readMeguminSettings(app.db)));

  /** Each section sent replaces that section; profiles use the routes below. */
  app.put("/settings", WRITE_OPTIONS, async (req, reply) => {
    if (!isFeatureEnabled("meguminMode")) return refuseWhileOff(reply);
    const update = meguminSettingsUpdateSchema.parse(req.body ?? {});
    return meguminSettingsResponse(await updateMeguminSettings(app.db, (current) => ({ ...current, ...update })));
  });

  app.put("/profiles/default", WRITE_OPTIONS, async (req, reply) => {
    if (!isFeatureEnabled("meguminMode")) return refuseWhileOff(reply);
    const { profile } = meguminProfileUpdateSchema.parse(req.body);
    return meguminSettingsResponse(
      await updateMeguminSettings(app.db, (current) => ({ ...current, defaultProfile: profile ?? {} })),
    );
  });

  app.put<{ Params: { characterId: string } }>(
    "/profiles/characters/:characterId",
    WRITE_OPTIONS,
    async (req, reply) => {
      if (!isFeatureEnabled("meguminMode")) return refuseWhileOff(reply);
      const { profile } = meguminProfileUpdateSchema.parse(req.body);
      const { characterId } = req.params;
      if (!(await characters.getById(characterId))) return reply.status(404).send({ error: "Character not found" });
      const settings = await updateMeguminSettings(app.db, (current) => {
        const characterProfiles = Object.fromEntries(
          Object.entries(current.characterProfiles).filter(([id]) => id !== characterId),
        );
        if (profile) characterProfiles[characterId] = profile;
        return { ...current, characterProfiles };
      });
      return meguminSettingsResponse(settings);
    },
  );

  app.get<{ Params: { chatId: string } }>("/profiles/chats/:chatId", async (req, reply) => {
    const chat = await chats.getById(req.params.chatId);
    if (!chat) return reply.status(404).send({ error: "Chat not found" });
    return resolveMeguminProfileForChat(await readMeguminSettings(app.db), chat);
  });

  app.put<{ Params: { chatId: string } }>("/profiles/chats/:chatId", WRITE_OPTIONS, async (req, reply) => {
    if (!isFeatureEnabled("meguminMode")) return refuseWhileOff(reply);
    const { profile } = meguminProfileUpdateSchema.parse(req.body);
    const chat = await chats.getById(req.params.chatId);
    if (!chat) return reply.status(404).send({ error: "Chat not found" });
    const metadata = parseExtra(chat.metadata);
    const room = metadata.multiplayer as { role?: unknown } | undefined;
    if (room?.role === "guest") {
      return reply.status(403).send({ error: "This room's Megumin settings belong to its host." });
    }
    // A stored profile that no longer validates is kept until the chat is reset on purpose.
    const stored = metadata[MEGUMIN_PROFILE_METADATA_KEY];
    if (profile && stored != null && !parseMeguminProfile(stored)) {
      logger.error("[megumin] Chat %s has a profile that does not validate; refusing to save over it", chat.id);
      throw new MeguminSettingsLockedError();
    }
    const updated = await chats.patchMetadata(
      chat.id,
      { [MEGUMIN_PROFILE_METADATA_KEY]: profile },
      { touchUpdatedAt: false },
    );
    if (!updated) return reply.status(404).send({ error: "Chat not found" });
    return resolveMeguminProfileForChat(await readMeguminSettings(app.db), updated);
  });
}
