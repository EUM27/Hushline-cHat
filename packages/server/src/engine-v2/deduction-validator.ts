import type {
  CaseInquiryFrame,
  Claim,
  ContradictionRecord,
  DeductionAttempt,
  DeductionValidationResult,
  FactId,
  SolutionGraph,
} from "@hushline/shared";

export function parseDeductionAttempt(input: {
  content: string;
  inquiryFrame: CaseInquiryFrame;
  revealedFactIds: FactId[];
  claims: Claim[];
  contradictions: ContradictionRecord[];
}): DeductionAttempt | null {
  const normalized = normalize(input.content);
  const hasLogic = /(왜냐하면|그러니까|따라서|으니|니까|맞다면|때문|근거|증거)/.test(normalized);
  const hasConclusion = /(범인|누군가|결국|옮긴|가져간|죽였|트릭|사라졌)/.test(normalized);
  if (input.inquiryFrame.inquiryType !== "deduction_attempt" && !(hasLogic && hasConclusion)) {
    return null;
  }

  const factRefs = [...new Set([...(input.inquiryFrame.referencedFactIds ?? []), ...input.revealedFactIds.filter((factId) => normalized.includes(normalize(factId)))])];
  const claimRefs = input.claims
    .filter((claim) => normalized.includes(normalize(claim.id)) || extractTerms(claim.content).some((term) => normalized.includes(normalize(term))))
    .map((claim) => claim.id);
  const contradictionRefs = input.contradictions
    .filter((contradiction) => normalized.includes(normalize(contradiction.id)))
    .map((contradiction) => contradiction.id);

  return {
    id: `deduce_${Date.now().toString(36)}`,
    turnNumber: 0,
    playerClaim: input.content,
    ...(input.inquiryFrame.accusationTargetId ? { accusationTargetId: input.inquiryFrame.accusationTargetId } : {}),
    evidenceRefs: [...input.inquiryFrame.referencedEvidenceIds],
    claimRefs: [...new Set([...input.inquiryFrame.referencedClaimIds, ...claimRefs])],
    factRefs,
    contradictionRefs,
    logicalSteps: buildLogicalSteps(input.content, [...factRefs, ...claimRefs, ...contradictionRefs]),
    validationResult: emptyResult("not_a_deduction"),
  };
}

export function validateDeductionAttempt(input: {
  attempt: DeductionAttempt;
  solutionGraph: SolutionGraph;
  revealedFactIds: FactId[];
  claims: Array<Claim | { id: string }>;
  contradictions: Array<ContradictionRecord | { id: string }>;
}): DeductionValidationResult {
  const playerCitedRefs = new Set([
    ...input.attempt.factRefs,
    ...input.attempt.claimRefs,
    ...input.attempt.evidenceRefs,
    ...input.attempt.contradictionRefs,
  ]);
  const knownRefs = new Set([
    ...input.revealedFactIds,
    ...input.attempt.evidenceRefs,
    ...input.claims.map((claim) => claim.id),
    ...input.contradictions.map((contradiction) => contradiction.id),
  ]);
  const scorableRefs = new Set([...playerCitedRefs].filter((ref) => knownRefs.has(ref)));

  const requiredElementCoverage: Record<string, boolean> = {};
  const missingRefs: string[] = [];
  let score = 0;
  for (const node of input.solutionGraph.requiredProofNodes) {
    const covered = node.requiredRefs.every((ref) => scorableRefs.has(ref));
    requiredElementCoverage[node.id] = covered;
    if (covered) {
      score += node.weight;
    } else {
      missingRefs.push(...node.requiredRefs.filter((ref) => !scorableRefs.has(ref)));
    }
  }

  const wrongElements = input.solutionGraph.disqualifyingErrors
    .filter((error) => error.triggeredByWrongRefs.some((ref) => scorableRefs.has(ref)))
    .map((error) => error.id);
  const normalizedScore = Math.min(1, score);
  const verdict = pickVerdict(normalizedScore, input.solutionGraph, wrongElements, input.attempt);

  return {
    score: normalizedScore,
    requiredElementCoverage,
    missingEvidence: missingRefs.filter((ref) => ref.startsWith("evidence_")),
    missingClaims: missingRefs.filter((ref) => ref.startsWith("claim_")),
    missingLogicalLinks: missingRefs.filter((ref) => !ref.startsWith("claim_") && !ref.startsWith("evidence_")),
    wrongElements,
    unsupportedAssumptions: findUnsupportedAssumptions(input.attempt, knownRefs),
    verdict,
  };
}

function pickVerdict(
  score: number,
  graph: SolutionGraph,
  wrongElements: string[],
  attempt: DeductionAttempt,
): DeductionValidationResult["verdict"] {
  if (wrongElements.length > 0) return "wrong_conclusion";
  if (attempt.logicalSteps.length === 0 && attempt.factRefs.length + attempt.claimRefs.length + attempt.contradictionRefs.length === 0) {
    return "not_a_deduction";
  }
  if (score >= graph.unlockThresholds.finalTruth) return "correct";
  if (score >= graph.unlockThresholds.partialTruth) return "partially_correct";
  return "insufficient";
}

function buildLogicalSteps(content: string, referencedIds: string[]): DeductionAttempt["logicalSteps"] {
  const steps: DeductionAttempt["logicalSteps"] = [];
  if (/(왜냐하면|근거|증거|아까|말했)/.test(content)) {
    steps.push({ text: content, referencedIds, stepType: "fact_recall" });
  }
  if (/(으니|니까|그러니까|따라서|맞다면)/.test(content)) {
    steps.push({ text: content, referencedIds, stepType: "causal_link" });
  }
  if (/(범인|누군가|결론)/.test(content)) {
    steps.push({ text: content, referencedIds, stepType: "accusation" });
  }
  return steps;
}

function emptyResult(verdict: DeductionValidationResult["verdict"]): DeductionValidationResult {
  return {
    score: 0,
    requiredElementCoverage: {},
    missingEvidence: [],
    missingClaims: [],
    missingLogicalLinks: [],
    wrongElements: [],
    unsupportedAssumptions: [],
    verdict,
  };
}

function findUnsupportedAssumptions(attempt: DeductionAttempt, availableRefs: Set<string>): string[] {
  return [...attempt.evidenceRefs, ...attempt.claimRefs, ...attempt.factRefs, ...attempt.contradictionRefs]
    .filter((ref) => !availableRefs.has(ref));
}

function extractTerms(text: string): string[] {
  return text.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((term) => term.length >= 3);
}

function normalize(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}
