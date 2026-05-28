import { describe, expect, test } from "bun:test";
import { propagateKnowledgeFromTurn } from "../knowledge-propagation";

describe("knowledge propagation", () => {
  test("stores user statements to present NPCs as propagated claims, not facts", () => {
    const result = propagateKnowledgeFromTurn({
      userInput: "하진우가 아까 열쇠 얘기를 다르게 했어.",
      approvedMessages: [],
      currentLocationId: "lodge-foyer",
      presentNpcIds: ["shin-jiyeon"],
      claims: [],
      facts: [],
      currentTurn: 11,
    });

    expect(result.propagatedClaims[0]?.toActorId).toBe("shin-jiyeon");
    expect(result.propagatedClaims[0]?.content).toContain("하진우");
    expect(result.events[0]?.resultingKnowledge).toBe("known_claim");
  });
});
