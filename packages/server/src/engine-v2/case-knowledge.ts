import type { CaseFact, CaseKnowledge, FactId, HiddenTruthVault } from "@hushline/shared";

export function getAllCaseFacts(caseKnowledge?: CaseKnowledge): CaseFact[] {
  if (!caseKnowledge) return [];
  const facts = [
    ...(caseKnowledge.facts ?? []),
    ...caseKnowledge.publicFacts,
    ...caseKnowledge.observableFacts,
  ];
  const byId = new Map<string, CaseFact>();
  for (const fact of facts) {
    byId.set(fact.id, fact);
  }
  return [...byId.values()];
}

export function getHiddenTruthIds(caseKnowledge?: CaseKnowledge): FactId[] {
  if (!caseKnowledge) return [];
  return [
    ...(caseKnowledge.hiddenTruthVault?.hiddenTruthIds ?? []),
    ...caseKnowledge.hiddenTruths.map((truth) => truth.id),
    ...getAllCaseFacts(caseKnowledge).filter((fact) => fact.category === "hidden_truth").map((fact) => fact.id),
  ];
}

export function buildHiddenTruthVault(caseKnowledge?: CaseKnowledge): HiddenTruthVault | undefined {
  if (caseKnowledge?.hiddenTruthVault) {
    return caseKnowledge.hiddenTruthVault;
  }
  const hiddenTruthIds = getHiddenTruthIds(caseKnowledge);
  if (hiddenTruthIds.length === 0) {
    return undefined;
  }
  return {
    hiddenTruthIds,
    blockedByDefault: hiddenTruthIds,
    solutionGraph: {
      caseId: "unknown",
      requiredProofNodes: [],
      optionalProofNodes: [],
      disqualifyingErrors: [],
      unlockThresholds: { partialTruth: 0.5, finalTruth: 1 },
    },
  };
}
