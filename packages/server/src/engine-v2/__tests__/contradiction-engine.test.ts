import { describe, expect, test } from "bun:test";
import { computeContradictionPressure, detectContradictions, markPlayerNoticedContradiction } from "../contradiction-engine";

describe("contradiction engine", () => {
  test("detects same-object present/missing conflicts", () => {
    const contradictions = detectContradictions({
      claims: [
        makeClaim("claim_a", "hajinwoo", "열쇠는 정전 뒤 테이블에 없었습니다.", ["study-key"]),
        makeClaim("claim_b", "yura", "정전 뒤에도 열쇠는 테이블 위에 있었어요.", ["study-key"]),
      ],
      facts: [],
      existingContradictions: [],
      currentTurn: 9,
    });

    expect(contradictions[0]?.conflictType).toBe("object_conflict");
    expect(contradictions[0]?.claimAId).toBe("claim_a");
  });

  test("marks player-noticed contradiction challenges and computes pressure", () => {
    const contradiction = detectContradictions({
      claims: [
        makeClaim("claim_a", "hajinwoo", "열쇠는 정전 뒤 테이블에 없었습니다.", ["study-key"]),
        makeClaim("claim_b", "yura", "정전 뒤에도 열쇠는 테이블 위에 있었어요.", ["study-key"]),
      ],
      facts: [],
      existingContradictions: [],
      currentTurn: 9,
    })[0]!;

    const noticed = markPlayerNoticedContradiction({
      inquiryFrame: {
        isCaseInquiry: true,
        inquiryType: "contradiction_challenge",
        topicTags: ["key"],
        referencedEvidenceIds: [],
        referencedClaimIds: ["claim_a", "claim_b"],
        referencedFactIds: [],
        requestedTruthLevel: "deduction",
        truthLeakRisk: 2,
      },
      contradictions: [contradiction],
      currentTurn: 10,
    });

    expect(noticed[0]?.playerNoticed).toBe(true);
    expect(computeContradictionPressure({ contradiction: noticed[0]!, inquiryFrame: noticed[0]!.playerNoticed
      ? {
          isCaseInquiry: true,
          inquiryType: "contradiction_challenge",
          topicTags: ["key"],
          referencedEvidenceIds: [],
          referencedClaimIds: ["claim_a", "claim_b"],
          referencedFactIds: [],
          requestedTruthLevel: "deduction",
          truthLeakRisk: 2,
        }
      : undefined as never })).toBeGreaterThanOrEqual(1);
  });
});

function makeClaim(id: string, speakerId: string, content: string, objectIds: string[]) {
  return {
    id,
    speaker: speakerId,
    speakerId,
    turn: 1,
    turnNumber: 1,
    content,
    claimType: "witness" as const,
    verification: { status: "unverified" as const, contradictedBy: [], supportedBy: [] },
    userStance: "unknown" as const,
    references: objectIds,
    referencedFactIds: [],
    referencedObjectIds: objectIds,
    referencedLocationIds: [],
    verificationStatus: "unverified" as const,
    contradictedBy: [],
    supportedBy: [],
    playerStance: "unknown" as const,
  };
}
