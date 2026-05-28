import { describe, expect, test } from "bun:test";
import { buildSceneStateSnapshot } from "../scene-state-snapshot";

describe("scene state snapshot", () => {
  test("builds a safe summary from revealed facts and claims only", () => {
    const snapshot = buildSceneStateSnapshot({
      sessionId: "session-1",
      turnNumber: 12,
      locationId: "lodge-foyer",
      sceneMode: "dialogue",
      revealedFactIds: ["fact_table_key_seen"],
      revealedClueIds: ["clue_table"],
      claims: [{ id: "claim_1" }],
      propagatedClaims: [{ id: "prop_1" }],
      contradictions: [{ id: "contra_1", status: "candidate" }],
      ambiguousFacts: [{ id: "amb_key", playerVisibleStatus: "contested" }],
      npcKnowledgeDigest: { "shin-jiyeon": { knownFactIds: ["fact_table_key_seen"], knownClaimIds: ["claim_1"], suspectedFactIds: [], falseBeliefIds: [] } },
      npcTrustLevels: { "shin-jiyeon": 0 },
      playerHypotheses: [{ id: "hyp_1" }],
      playerDeductionAttempts: [{ id: "deduce_1" }],
      revealBudget: { scope: "per_fact", perFact: {} },
    });

    expect(snapshot.registeredClaims).toContain("claim_1");
    expect(snapshot.publicSummaryCache.safeCaseSummary).not.toContain("truth");
  });
});
