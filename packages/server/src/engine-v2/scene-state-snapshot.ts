import type {
  AmbiguousFact,
  Claim,
  ContradictionRecord,
  DeductionAttempt,
  LocationId,
  NpcId,
  PlayerHypothesis,
  PropagatedClaim,
  RevealBudget,
  SceneStateSnapshot,
} from "@hushline/shared";

export function buildSceneStateSnapshot(input: {
  sessionId: string;
  turnNumber: number;
  locationId: LocationId;
  sceneMode: string;
  revealedFactIds: string[];
  revealedClueIds: string[];
  claims: Array<Claim | { id: string }>;
  propagatedClaims: Array<PropagatedClaim | { id: string }>;
  contradictions: Array<ContradictionRecord | { id: string; status?: string }>;
  ambiguousFacts: Array<AmbiguousFact | { id: string; playerVisibleStatus?: string }>;
  npcKnowledgeDigest: SceneStateSnapshot["npcKnowledgeDigest"];
  npcTrustLevels: Record<NpcId, number>;
  playerHypotheses: Array<PlayerHypothesis | { id: string }>;
  playerDeductionAttempts: Array<DeductionAttempt | { id: string }>;
  revealBudget: Partial<RevealBudget> & { perFact?: SceneStateSnapshot["currentRevealBudget"]["perFact"] };
}): SceneStateSnapshot {
  const registeredClaims = input.claims.map((claim) => claim.id);
  const propagatedClaims = input.propagatedClaims.map((claim) => claim.id);
  const contradictionCandidates = input.contradictions
    .filter((contradiction) => !("status" in contradiction) || contradiction.status !== "confirmed")
    .map((contradiction) => contradiction.id);
  const confirmedContradictions = input.contradictions
    .filter((contradiction) => "status" in contradiction && contradiction.status === "confirmed")
    .map((contradiction) => contradiction.id);

  return {
    id: `turn_${input.turnNumber}_snapshot`,
    sessionId: input.sessionId,
    turnNumber: input.turnNumber,
    locationId: input.locationId,
    sceneMode: input.sceneMode,
    revealedFactIds: [...input.revealedFactIds],
    revealedClueIds: [...input.revealedClueIds],
    registeredClaims,
    propagatedClaims,
    contradictionCandidates,
    confirmedContradictions,
    ambiguousFactIds: input.ambiguousFacts.map((fact) => fact.id),
    npcKnowledgeDigest: input.npcKnowledgeDigest,
    npcTrustLevels: input.npcTrustLevels,
    playerHypotheses: input.playerHypotheses.map((hypothesis) => hypothesis.id),
    playerDeductionAttempts: input.playerDeductionAttempts.map((attempt) => attempt.id),
    currentRevealBudget: {
      perFact: input.revealBudget.perFact ?? {},
    },
    publicSummaryCache: {
      safeCaseSummary: buildSafeSummary(input.revealedFactIds, registeredClaims, input.ambiguousFacts),
      lastUpdatedTurn: input.turnNumber,
    },
  };
}

function buildSafeSummary(revealedFactIds: string[], claimIds: string[], ambiguousFacts: Array<AmbiguousFact | { id: string; playerVisibleStatus?: string }>): string {
  const parts = [
    revealedFactIds.length ? `revealed:${revealedFactIds.join(",")}` : "",
    claimIds.length ? `claims:${claimIds.join(",")}` : "",
    ambiguousFacts.length ? `ambiguity:${ambiguousFacts.map((fact) => fact.id).join(",")}` : "",
  ].filter(Boolean);
  return parts.join(" | ") || "아직 공개된 사건 정보가 없습니다.";
}
