// ──────────────────────────────────────────────
// Phone Device — App availability & default selection
// ──────────────────────────────────────────────
// Pure functions (no React) so they can be unit-tested in isolation.
// The phone is an app device: the case file is the standing default app,
// the messenger is a conditional app that appears when the scenario/events
// produce phone-channel messages.
// ──────────────────────────────────────────────

import type { CaseBoardView, ChatMessage, ClientSessionState } from "@hushline/shared";
import { isPhoneChannelMessage } from "./stage-messages";

export type PhoneAppId = "casefile" | "messenger";

export type PhoneUiMode = ClientSessionState["scenario"]["uiMode"];

export interface PhoneAppAvailability {
  casefile: boolean;
  messenger: boolean;
  /** Only show the dock when more than one app is available. */
  showDock: boolean;
  available: PhoneAppId[];
}

/**
 * Decide which phone apps are available given the scenario signals.
 * - case file: scenario carries a mystery case layer (or has any dossier).
 * - messenger: any phone-channel message exists, or the scenario is messenger-first.
 */
export function getPhoneAppAvailability(
  caseBoard: CaseBoardView | null | undefined,
  uiMode: PhoneUiMode,
  phoneChannelCount: number,
): PhoneAppAvailability {
  const casefile = Boolean(caseBoard && (caseBoard.isCaseScenario || caseBoard.dossiers.length > 0));
  const messenger = phoneChannelCount > 0 || uiMode === "messenger-first";

  const available: PhoneAppId[] = [];
  if (casefile) available.push("casefile");
  if (messenger) available.push("messenger");

  return {
    casefile,
    messenger,
    showDock: available.length >= 2,
    available,
  };
}

/**
 * Pick the app that should be open when a session boots.
 * messenger-first scenarios open the messenger; otherwise the case file leads.
 */
export function getDefaultPhoneApp(
  availability: PhoneAppAvailability,
  uiMode: PhoneUiMode,
): PhoneAppId {
  if (uiMode === "messenger-first" && availability.messenger) return "messenger";
  if (availability.casefile) return "casefile";
  if (availability.messenger) return "messenger";
  return "casefile"; // empty-state fallback
}

export function shouldOpenMessengerForLatestOutgoingMessage(
  activeApp: PhoneAppId,
  availability: PhoneAppAvailability,
  latestVisibleMessage: ChatMessage | null | undefined,
): boolean {
  return (
    activeApp !== "messenger"
    && availability.messenger
    && latestVisibleMessage?.role === "user"
    && isPhoneChannelMessage(latestVisibleMessage)
  );
}

/** Count messages that belong to the phone messenger channel. */
export function countPhoneChannelMessages(messages: ChatMessage[]): number {
  return messages.filter(isPhoneChannelMessage).length;
}

/** A monotonic signature for case-file unread comparison. */
export function caseFileSignature(caseBoard: CaseBoardView | null | undefined): number {
  if (!caseBoard) return 0;
  return caseBoard.clues.length + caseBoard.contradictions.length + caseBoard.deductions.length;
}
