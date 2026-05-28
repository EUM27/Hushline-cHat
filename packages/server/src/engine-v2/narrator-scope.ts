import type { CaseAnswerScope, CaseInquiryFrame, CaseKnowledge, FactId, LocationId, NarratorScope } from "@hushline/shared";
import { getAllCaseFacts, getHiddenTruthIds } from "./case-knowledge.js";

export function resolveNarratorScope(input: {
  inquiryFrame: CaseInquiryFrame;
  caseScope: CaseAnswerScope;
  revealedFactIds: FactId[];
  currentLocationId: LocationId;
  caseKnowledge?: CaseKnowledge;
}): NarratorScope {
  const hiddenTruthIds = getHiddenTruthIds(input.caseKnowledge);
  const observableFactIds = new Set([
    ...input.revealedFactIds,
    ...input.caseScope.publicFactIds,
    ...input.caseScope.observableFactIds,
  ]);
  const allowedFacts = getAllCaseFacts(input.caseKnowledge).filter((fact) => observableFactIds.has(fact.id));
  return {
    allowedToDescribeFactIds: allowedFacts.map((fact) => fact.id),
    allowedClueIds: [],
    allowedLocations: [input.currentLocationId],
    allowedObjects: [...new Set(allowedFacts.flatMap((fact) => fact.objectIds ?? []))],
    forbiddenFactIds: [...new Set(hiddenTruthIds)],
    forbiddenInferences: [
      {
        id: "no_solution_hint",
        description: "범인, 트릭, 동기, 누가 급히 빠져나갔다는 식의 추론",
        blockedReason: "deduction_belongs_to_player",
      },
    ],
    style: input.inquiryFrame.inquiryType === "observable_scene_request" || input.inquiryFrame.inquiryType === "location_search"
      ? "investigation_result"
      : "neutral_observation",
    maxInferenceLevel: "sensory_only",
  };
}
