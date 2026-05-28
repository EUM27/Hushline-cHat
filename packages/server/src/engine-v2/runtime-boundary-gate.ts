import type { CaseFact, Claim, ClaimId, FactId, NpcId } from "@hushline/shared";
import { extractClaimFromApprovedDialogue } from "./claim-ledger.js";

export type BoundaryViolation =
  | "embedded_narration"
  | "speaker_label"
  | "foreign_character_dialogue"
  | "foreign_character_action"
  | "user_agency_violation"
  | "unauthorized_fact"
  | "hidden_truth_leak"
  | "reveal_budget_exceeded"
  | "claim_contradiction_unhandled"
  | "format_violation";

export interface BoundaryGateResult {
  status: "approved" | "truncate" | "regenerate" | "replace_with_deflection" | "drop";
  finalText?: string;
  violations: BoundaryViolation[];
  registeredClaim?: Claim;
}

export function validateCharacterDraft(input: {
  draft: string;
  npcId: NpcId;
  allowedFactIds: FactId[];
  blockedFactIds: FactId[];
  hiddenTruthIds: FactId[];
  knownClaimIds: ClaimId[];
  caseFacts: CaseFact[];
  currentTurn: number;
}): BoundaryGateResult {
  const violations: BoundaryViolation[] = [];
  const draft = input.draft.trim();

  if (!draft) {
    return { status: "drop", violations: ["format_violation"] };
  }
  if (hasSpeakerLabel(draft)) {
    violations.push("speaker_label");
  }
  if (hasEmbeddedNarration(draft)) {
    violations.push("embedded_narration");
  }
  if (hasForeignActorPattern(draft, input.npcId)) {
    violations.push("foreign_character_action");
  }
  if (hasUserAgencyViolation(draft)) {
    violations.push("user_agency_violation");
  }
  if (mentionsHiddenTruth(draft, input.hiddenTruthIds, input.caseFacts)) {
    violations.push("hidden_truth_leak");
  }
  if (mentionsUnauthorizedFact(draft, input.allowedFactIds, input.blockedFactIds, input.caseFacts)) {
    violations.push("unauthorized_fact");
  }

  if (violations.includes("hidden_truth_leak")) {
    return {
      status: "replace_with_deflection",
      finalText: "그건... 지금 말할 수 없습니다.",
      violations,
    };
  }
  if (violations.length > 0) {
    return {
      status: violations.includes("embedded_narration") || violations.includes("speaker_label")
        ? "regenerate"
        : "replace_with_deflection",
      finalText: "그건... 확실히 말할 수 없습니다.",
      violations,
    };
  }

  const registeredClaim = extractClaimFromApprovedDialogue({
    text: draft,
    speakerId: input.npcId,
    turnNumber: input.currentTurn,
    caseFacts: input.caseFacts,
    objects: [],
    locations: [],
  }) ?? undefined;

  return {
    status: "approved",
    finalText: draft,
    violations,
    ...(registeredClaim ? { registeredClaim } : {}),
  };
}

function hasSpeakerLabel(text: string): boolean {
  return /^\s*[가-힣A-Za-z0-9_\-[\] ]{1,24}\s*[:：]/m.test(text);
}

function hasEmbeddedNarration(text: string): boolean {
  return /(\*[^*]{1,120}\*)|(\([^)]{1,120}\))|(\[[^\]]{1,120}\])/.test(text)
    || /(고개를|시선을|라이터|문 쪽|돌리며|바라보|쳐다보|손을|숨을|침묵했다|찡그렸|웃었다|일어섰)/.test(text);
}

function hasForeignActorPattern(text: string, npcId: string): boolean {
  const normalizedNpc = normalize(npcId);
  return /[가-힣A-Za-z0-9_-]{2,24}\s*(은|는|이|가)\s*(고개|시선|말했|대답했|움직|문|손)/.test(text)
    && !normalize(text).includes(normalizedNpc);
}

function hasUserAgencyViolation(text: string): boolean {
  return /(당신|유저|\{\{user\}\}|\{\{유저\}\})\s*(은|는|이|가)?[^.!?\n]*(생각|확신|말했|대답했|움직|집어|고개|웃었|울었)/i.test(text);
}

function mentionsHiddenTruth(text: string, hiddenTruthIds: FactId[], facts: CaseFact[]): boolean {
  if (/(범인|살인범|공범|진상|정답|밀실\s*트릭|트릭\s*정답)/.test(text)) {
    return hiddenTruthIds.length > 0;
  }
  const hiddenFacts = facts.filter((fact) => hiddenTruthIds.includes(fact.id));
  return hiddenFacts.some((fact) => factMatchesText(fact, text));
}

function mentionsUnauthorizedFact(
  text: string,
  allowedFactIds: FactId[],
  blockedFactIds: FactId[],
  facts: CaseFact[],
): boolean {
  const allowed = new Set(allowedFactIds);
  const blocked = new Set(blockedFactIds);
  return facts
    .filter((fact) => blocked.has(fact.id) || (!allowed.has(fact.id) && fact.category !== "public" && fact.category !== "briefing"))
    .some((fact) => factMatchesText(fact, text));
}

function factMatchesText(fact: CaseFact, text: string): boolean {
  const haystack = normalize(text);
  const terms = [
    ...extractTerms(fact.text),
    ...fact.tags.flatMap(tagMarkers),
  ];
  const unique = [...new Set(terms.map(normalize).filter((term) => term.length >= 2))];
  const hits = unique.filter((term) => haystack.includes(term));
  return hits.length >= 2 || hits.some((term) => term.length >= 5);
}

function extractTerms(text: string): string[] {
  return text
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2);
}

function tagMarkers(tag: string): string[] {
  const markers: Record<string, string[]> = {
    key: ["열쇠", "키"],
    table: ["테이블", "탁자"],
    blackout: ["정전"],
    before_blackout: ["정전직전", "정전전"],
    after_blackout: ["정전후"],
    killer: ["범인", "살인범"],
    truth: ["진상", "정답"],
  };
  return markers[tag] ?? [tag];
}

function normalize(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}
