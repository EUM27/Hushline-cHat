// ──────────────────────────────────────────────
// UI Helpers — Barrel
// ──────────────────────────────────────────────
// Concern-specific helpers were split into focused modules.
// This barrel preserves the original import surface.
// ──────────────────────────────────────────────

export { createVisualThemeStyle } from "./theme";
export { looksLikeRichHtml, sanitizeRichHtml, sanitizeCssText, scopeCssToMessage } from "./rich-html";
export {
  getSourceBadge,
  getConnectionStatus,
  buildConnectionSlots,
  loadConnections,
  persistConnections,
  activeConnections,
  getSharedProviderApiKey,
} from "./connections";
export { createAdvisorDrafts, advisorDraftsFromSession, characterOverridesFromSession } from "./advisors";
export { formatKoreanTime, findBackgroundUrl, findCharacterSpriteUrl, findSpriteUrl } from "./assets";
export { getSessionShellMode, type SessionShellMode } from "./session-shell";
export {
  isPhoneChannelMessage,
  isStageMessage,
  getLatestStageMessage,
  getStageCharacterId,
  getStageExpression,
  getStageSpeakerLabel,
} from "./stage-messages";
export { parseMessageFormat, type MessageFormatToken } from "./message-format";
export { summarizeStateLawForDevPanel, summarizeCaseRuntimeForDevPanel } from "./dev-panel-format";
export {
  loadEnterToSend,
  parseOpenAiOAuthJson,
  detectInputModeFromText,
  hasUserMessages,
} from "./session-input";
