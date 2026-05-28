import { describe, expect, test } from "bun:test";
import { updateAmbiguityZone } from "../ambiguity-zone";

describe("ambiguity zone", () => {
  test("marks ambiguous facts as contested when new contradictions appear", () => {
    const updated = updateAmbiguityZone({
      ambiguousFacts: [{
        id: "amb_key_location_after_blackout",
        text: "정전 후 열쇠 위치",
        topicTags: ["key"],
        possibleInterpretations: [],
        resolutionCondition: { requiredContradictionIds: ["contra_key_after_blackout"] },
        playerVisibleStatus: "unnoticed",
      }],
      newClaims: [],
      contradictions: [{ id: "contra_key_after_blackout", playerNoticed: true }],
      currentTurn: 13,
    });

    expect(updated[0]?.playerVisibleStatus).toBe("contested");
  });
});
