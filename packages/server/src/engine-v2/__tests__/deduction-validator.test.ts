import { describe, expect, test } from "bun:test";
import { parseDeductionAttempt, validateDeductionAttempt } from "../deduction-validator";

describe("deduction validator", () => {
  const solutionGraph = {
    caseId: "locked-room-mystery",
    requiredProofNodes: [
      { id: "opportunity_window", type: "timeline" as const, requiredRefs: ["fact_table_key_seen", "claim_key_missing"], weight: 0.4 },
      { id: "trick_mechanism", type: "trick_mechanism" as const, requiredRefs: ["contra_key_after_blackout"], weight: 0.6 },
    ],
    optionalProofNodes: [],
    disqualifyingErrors: [],
    unlockThresholds: { partialTruth: 0.4, finalTruth: 1 },
  };

  test("parses reasoned player deduction attempts", () => {
    const attempt = parseDeductionAttempt({
      content: "정전 전 열쇠가 있었고 정전 후 사라졌으니 누군가 정전 중 가져간 거야.",
      inquiryFrame: {
        isCaseInquiry: true,
        inquiryType: "deduction_attempt",
        topicTags: ["key", "blackout"],
        referencedEvidenceIds: [],
        referencedClaimIds: [],
        referencedFactIds: ["fact_table_key_seen"],
        requestedTruthLevel: "deduction",
        truthLeakRisk: 2,
      },
      revealedFactIds: ["fact_table_key_seen"],
      claims: [],
      contradictions: [],
    });

    expect(attempt?.logicalSteps.some((step) => step.stepType === "causal_link")).toBe(true);
  });

  test("scores partial proof node coverage without unlocking final truth", () => {
    const attempt = {
      id: "deduce_1",
      turnNumber: 3,
      playerClaim: "정전 중 누군가 열쇠를 가져갔다.",
      evidenceRefs: [],
      claimRefs: ["claim_key_missing"],
      factRefs: ["fact_table_key_seen"],
      contradictionRefs: [],
      logicalSteps: [],
      validationResult: {
        score: 0,
        requiredElementCoverage: {},
        missingEvidence: [],
        missingClaims: [],
        missingLogicalLinks: [],
        wrongElements: [],
        unsupportedAssumptions: [],
        verdict: "not_a_deduction" as const,
      },
    };

    const result = validateDeductionAttempt({
      attempt,
      solutionGraph,
      revealedFactIds: ["fact_table_key_seen"],
      claims: [{ id: "claim_key_missing" }],
      contradictions: [],
    });

    expect(result.verdict).toBe("partially_correct");
    expect(result.score).toBeGreaterThanOrEqual(0.4);
    expect(result.score).toBeLessThan(1);
  });
});
