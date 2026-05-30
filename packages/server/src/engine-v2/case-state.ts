import type { CaseInquiryFrame, TurnMessage, WorldState } from "@hushline/shared";

const CLAIM_INQUIRY_TYPES = new Set([
  "witness_testimony",
  "timeline_query",
  "object_query",
  "contradiction_challenge",
]);

/**
 * Accumulate revealed case facts into a monotonic ledger (factId → first-revealed turn).
 * Hidden-truth facts are never recorded. Existing first-reveal turns are preserved.
 */
export function recordRevealedCaseFacts(
  prev: Record<string, number> | undefined,
  revealedFactIds: readonly string[],
  hiddenTruthIds: ReadonlySet<string>,
  currentTurn: number,
): Record<string, number> {
  const next = { ...(prev ?? {}) };
  for (const factId of revealedFactIds) {
    if (hiddenTruthIds.has(factId)) continue;
    if (next[factId] === undefined) {
      next[factId] = currentTurn;
    }
  }
  return next;
}

/**
 * Accumulate characters the player has encountered (monotonic; characterId → first-seen turn).
 * Used to build the progressive dossier list — only met/mentioned characters appear.
 */
export function recordEncounteredCharacters(
  prev: Record<string, number> | undefined,
  encounteredCharacterIds: readonly string[],
  currentTurn: number,
): Record<string, number> {
  const next = { ...(prev ?? {}) };
  for (const characterId of encounteredCharacterIds) {
    if (!characterId) continue;
    if (next[characterId] === undefined) {
      next[characterId] = currentTurn;
    }
  }
  return next;
}

export function recordCaseClaims(
  worldState: WorldState,
  characterMessages: TurnMessage[],
  inquiry: CaseInquiryFrame,
  userInput = "",
): WorldState {
  if (!inquiry.isCaseInquiry || !CLAIM_INQUIRY_TYPES.has(inquiry.inquiryType) || characterMessages.length === 0) {
    return recordPlayerHypothesis(worldState, inquiry, userInput);
  }

  const existingLedger = worldState.claimLedger ?? { claims: [], contradictions: [] };
  const claims = characterMessages.map((message, index) => ({
    id: `claim_${worldState.turnNumber + 1}_${message.characterId ?? "unknown"}_${index + 1}`,
    speaker: message.characterId ?? "unknown",
    turn: worldState.turnNumber + 1,
    content: message.content,
    claimType: inquiry.inquiryType === "accusation" ? "accusation" as const : "testimony" as const,
    verification: {
      status: "unverified" as const,
      contradictedBy: [],
      supportedBy: [],
    },
    userStance: "unknown" as const,
    references: [
      ...inquiry.referencedEvidenceIds,
      ...inquiry.referencedClaimIds,
    ],
  }));

  return {
    ...worldState,
    claimLedger: {
      ...existingLedger,
      claims: [...existingLedger.claims, ...claims],
    },
  };
}

export function recordPlayerHypothesis(
  worldState: WorldState,
  inquiry: CaseInquiryFrame,
  content: string,
): WorldState {
  if (inquiry.inquiryType !== "accusation" && inquiry.inquiryType !== "deduction_attempt") {
    return worldState;
  }
  const hypotheses = worldState.playerHypotheses ?? [];
  return {
    ...worldState,
    playerHypotheses: [
      ...hypotheses,
      {
        id: `hypothesis_${worldState.turnNumber + 1}_${hypotheses.length + 1}`,
        turn: worldState.turnNumber + 1,
        content,
        inquiryType: inquiry.inquiryType,
        ...(inquiry.accusationTargetId ? { targetCharacterId: inquiry.accusationTargetId } : {}),
        topicTags: inquiry.topicTags,
      },
    ],
  };
}
