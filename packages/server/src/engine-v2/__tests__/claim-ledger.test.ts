import { describe, expect, test } from "bun:test";
import { extractClaimFromApprovedDialogue } from "../claim-ledger";

describe("claim ledger", () => {
  test("stores NPC alibi dialogue as an unverified claim", () => {
    const claim = extractClaimFromApprovedDialogue({
      text: "나는 정전 중 혼자였어.",
      speakerId: "hajinwoo",
      turnNumber: 7,
      caseFacts: [],
      objects: [],
      locations: [],
    });

    expect(claim?.speakerId).toBe("hajinwoo");
    expect(claim?.claimType).toBe("alibi");
    expect(claim?.verificationStatus).toBe("unverified");
  });

  test("does not create NPC claims for non-testimony small talk", () => {
    const claim = extractClaimFromApprovedDialogue({
      text: "지금은 말하고 싶지 않아.",
      speakerId: "hajinwoo",
      turnNumber: 8,
      caseFacts: [],
      objects: [],
      locations: [],
    });

    expect(claim).toBeNull();
  });
});
