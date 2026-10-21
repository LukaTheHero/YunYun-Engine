/**
 * Professor YunYun's workspace session ids, and which YunYun chat a review card belongs to.
 *
 * Shared with the client (slice 62a, R9) so the omnibar can resolve which YunYun chat a
 * pending review belongs to without duplicating this logic. See the shared module for
 * the full rules.
 */
export {
  MARI_WORKSPACE_SESSION_ID,
  mariWorkspaceSessionId,
  chatIdForMariSession,
  isMariReviewVisibleInChat,
} from "@marinara-engine/shared";
