import { describe, expect, test } from "bun:test";
import { validateNarratorDraft } from "../narrator-boundary-gate";

describe("narrator boundary gate", () => {
  test("rejects forbidden inference in narration", () => {
    const result = validateNarratorDraft({
      draft: "문이 열린 채였다는 건 누군가 급히 빠져나갔다는 뜻이었다.",
      scope: {
        allowedToDescribeFactIds: [],
        allowedClueIds: [],
        allowedLocations: ["study"],
        allowedObjects: [],
        forbiddenFactIds: [],
        forbiddenInferences: [
          { id: "infer_escape", description: "누군가 급히 빠져나갔다", blockedReason: "unsupported_inference" },
        ],
        style: "neutral_observation",
        maxInferenceLevel: "sensory_only",
      },
      hiddenTruthIds: [],
      caseFacts: [],
    });

    expect(result.violations).toContain("forbidden_inference");
    expect(result.status).toBe("replace_with_observation");
  });

  test("approves neutral observable narration", () => {
    const result = validateNarratorDraft({
      draft: "문은 열린 채였다.",
      scope: {
        allowedToDescribeFactIds: [],
        allowedClueIds: [],
        allowedLocations: ["study"],
        allowedObjects: [],
        forbiddenFactIds: [],
        forbiddenInferences: [],
        style: "neutral_observation",
        maxInferenceLevel: "sensory_only",
      },
      hiddenTruthIds: [],
      caseFacts: [],
    });

    expect(result.status).toBe("approved");
  });
});
