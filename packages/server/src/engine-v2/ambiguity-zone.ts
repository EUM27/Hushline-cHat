import type { AmbiguousFact, Claim, ContradictionRecord, DeductionValidationResult, EvidenceId } from "@hushline/shared";

export function updateAmbiguityZone(input: {
  ambiguousFacts: AmbiguousFact[];
  newClaims: Claim[];
  contradictions: Array<ContradictionRecord | { id: string; playerNoticed?: boolean }>;
  deductionResult?: DeductionValidationResult;
  foundEvidenceIds?: EvidenceId[];
  currentTurn: number;
}): AmbiguousFact[] {
  return input.ambiguousFacts.map((fact) => {
    const requiredContradictions = fact.resolutionCondition.requiredContradictionIds ?? [];
    const requiredEvidence = fact.resolutionCondition.requiredEvidenceIds ?? [];
    const contradictionNoticed = input.contradictions.some((contradiction) =>
      requiredContradictions.includes(contradiction.id) && "playerNoticed" in contradiction && contradiction.playerNoticed,
    );
    const evidenceFound = requiredEvidence.length > 0
      && requiredEvidence.every((evidenceId) => (input.foundEvidenceIds ?? []).includes(evidenceId));
    const deductionNearlyResolves = typeof fact.resolutionCondition.requiredDeductionScore === "number"
      && (input.deductionResult?.score ?? 0) >= fact.resolutionCondition.requiredDeductionScore;

    if (evidenceFound) {
      return {
        ...fact,
        resolvedTo: fact.resolvedTo ?? fact.possibleInterpretations[0]?.interpretationId ?? "resolved",
        resolvedAtTurn: input.currentTurn,
        playerVisibleStatus: "resolved",
      };
    }
    if (deductionNearlyResolves || input.deductionResult?.verdict === "partially_correct") {
      return { ...fact, playerVisibleStatus: "nearly_resolved" };
    }
    if (contradictionNoticed || input.newClaims.length > 0) {
      return { ...fact, playerVisibleStatus: "contested" };
    }
    return fact;
  });
}
