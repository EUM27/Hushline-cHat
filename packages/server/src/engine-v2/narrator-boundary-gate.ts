import type { CaseFact, FactId, NarratorScope } from "@hushline/shared";

export function validateNarratorDraft(input: {
  draft: string;
  scope: NarratorScope;
  hiddenTruthIds: FactId[];
  caseFacts: CaseFact[];
}): {
  status: "approved" | "regenerate_minimal" | "replace_with_observation";
  finalText?: string;
  violations: Array<"dialogue" | "hidden_truth" | "character_secret" | "user_agency" | "forbidden_inference" | "solution_hint">;
} {
  const violations: Array<"dialogue" | "hidden_truth" | "character_secret" | "user_agency" | "forbidden_inference" | "solution_hint"> = [];
  const draft = input.draft.trim();
  const inspectableDraft = draft.replace(/\[bg:[^\]]+\]/g, "").trim();
  if (/^\s*[가-힣A-Za-z0-9_\-[\] ]{1,24}\s*[:：]/m.test(inspectableDraft) || /["“][^"”]+["”]/.test(inspectableDraft)) {
    violations.push("dialogue");
  }
  if (/(범인|살인범|진상|정답|트릭\s*정답|밀실\s*트릭)/.test(inspectableDraft) && input.hiddenTruthIds.length > 0) {
    violations.push("hidden_truth");
  }
  if (/(당신|유저|\{\{user\}\})\s*(은|는|이|가)?[^.!?\n]*(생각|확신|움직|말했|집어)/i.test(inspectableDraft)) {
    violations.push("user_agency");
  }
  if (hasForbiddenInference(inspectableDraft, input.scope)) {
    violations.push("forbidden_inference");
  }
  if (/(뜻이었다|의미했다|말해주고있었다|죄책감|치밀한계획|급히빠져나갔)/.test(normalize(inspectableDraft))) {
    violations.push("forbidden_inference");
  }
  if (mentionsForbiddenFact(inspectableDraft, input.scope, input.caseFacts)) {
    violations.push("solution_hint");
  }

  if (violations.length === 0) {
    return { status: "approved", finalText: draft, violations };
  }
  return {
    status: violations.includes("dialogue") ? "regenerate_minimal" : "replace_with_observation",
    finalText: "관찰 가능한 사실만 남는다.",
    violations: [...new Set(violations)],
  };
}

function hasForbiddenInference(draft: string, scope: NarratorScope): boolean {
  const normalizedDraft = normalize(draft);
  return scope.forbiddenInferences.some((item) => {
    const terms = item.description.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((term) => term.length >= 2);
    return normalize(item.description).length > 0 && (
      normalizedDraft.includes(normalize(item.description))
      || terms.filter((term) => normalizedDraft.includes(normalize(term))).length >= Math.min(2, terms.length)
    );
  });
}

function mentionsForbiddenFact(draft: string, scope: NarratorScope, facts: CaseFact[]): boolean {
  const forbidden = new Set(scope.forbiddenFactIds);
  const normalizedDraft = normalize(draft);
  return facts.filter((fact) => forbidden.has(fact.id)).some((fact) =>
    fact.tags.some((tag) => normalizedDraft.includes(normalize(tag)))
    || fact.text.split(/\s+/).filter((term) => term.length >= 3).some((term) => normalizedDraft.includes(normalize(term))),
  );
}

function normalize(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}
