import type { CaseFact, Claim, ClaimId, FactId, NpcId } from "@hushline/shared";
import { extractClaimFromApprovedDialogue } from "./claim-ledger.js";
import { containsUnintroducedUserName, maskUnintroducedUserName } from "./user-identity.js";

export type BoundaryViolation =
  | "embedded_narration"
  | "speaker_label"
  | "foreign_character_dialogue"
  | "foreign_character_action"
  | "user_agency_violation"
  | "unauthorized_fact"
  | "hidden_truth_leak"
  | "private_handout_leak"
  | "reveal_budget_exceeded"
  | "claim_contradiction_unhandled"
  | "unsupported_user_proposal"
  | "unintroduced_user_name"
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
  userInput?: string;
  userPersonaName?: string;
  userPersonaNames?: string[];
  userNameIntroduced?: boolean;
  privateLeakTexts?: string[];
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
  if (hasUnsupportedUserProposalAttribution(draft, input.userInput)) {
    violations.push("unsupported_user_proposal");
  }
  if (containsUnintroducedPersonaName(draft, input)) {
    violations.push("unintroduced_user_name");
  }
  if (mentionsHiddenTruth(draft, input.hiddenTruthIds, input.caseFacts)) {
    violations.push("hidden_truth_leak");
  }
  if (mentionsPrivateHandoutLeak(draft, input.privateLeakTexts ?? [])) {
    violations.push("private_handout_leak");
  }
  if (mentionsUnauthorizedFact(draft, input.allowedFactIds, input.blockedFactIds, input.caseFacts)) {
    violations.push("unauthorized_fact");
  }

  if (violations.includes("hidden_truth_leak") || violations.includes("private_handout_leak")) {
    return {
      status: "replace_with_deflection",
      finalText: "\"지금은 단정할 수 없습니다.\"",
      violations,
    };
  }
  if (violations.includes("unsupported_user_proposal")) {
    return {
      status: "replace_with_deflection",
      finalText: "\"...지금은 그렇게 단정하지 말자.\"",
      violations,
    };
  }
  if (violations.includes("unintroduced_user_name")) {
    return {
      status: "replace_with_deflection",
      finalText: maskUnintroducedPersonaNames(draft, input),
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

function containsUnintroducedPersonaName(
  draft: string,
  input: { userPersonaName?: string; userPersonaNames?: string[]; userNameIntroduced?: boolean },
): boolean {
  const names = personaNames(input);
  return names.some((name) => containsUnintroducedUserName(draft, name, input.userNameIntroduced ?? false));
}

function maskUnintroducedPersonaNames(
  draft: string,
  input: { userPersonaName?: string; userPersonaNames?: string[] },
): string {
  return personaNames(input).reduce(
    (text, name) => maskUnintroducedUserName(text, name, false, "당신"),
    draft,
  );
}

function personaNames(input: { userPersonaName?: string; userPersonaNames?: string[] }): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const value of [input.userPersonaName, ...(input.userPersonaNames ?? [])]) {
    const name = value?.trim();
    if (!name || seen.has(name)) {
      continue;
    }
    seen.add(name);
    names.push(name);
  }
  return names;
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

function hasUnsupportedUserProposalAttribution(text: string, userInput: string | undefined): boolean {
  if (!userInput) return false;
  const compactDraft = normalize(text);
  if (!mentionsExitProposalAttribution(compactDraft)) {
    return false;
  }
  return !mentionsExitProposal(normalize(userInput));
}

function mentionsExitProposalAttribution(compactText: string): boolean {
  return [
    "나가자는말",
    "나가자는건",
    "나가자고",
    "나가려는거",
    "나갈생각",
    "밖에나가자는",
    "밖으로나가자는",
    "하산하자는",
    "내려가자는",
  ].some((marker) => compactText.includes(marker));
}

function mentionsExitProposal(compactText: string): boolean {
  return [
    "나가자",
    "나가도",
    "나갈까요",
    "나갑시다",
    "나가려고",
    "나가야",
    "밖에나가",
    "밖으로나가",
    "하산하자",
    "내려가자",
    "산을내려",
  ].some((marker) => compactText.includes(marker));
}

function mentionsHiddenTruth(text: string, hiddenTruthIds: FactId[], facts: CaseFact[]): boolean {
  if (/(범인|살인범|공범|진상|정답|밀실\s*트릭|트릭\s*정답)/.test(text)) {
    return hiddenTruthIds.length > 0;
  }
  const hiddenFacts = facts.filter((fact) => hiddenTruthIds.includes(fact.id));
  return hiddenFacts.some((fact) => factMatchesText(fact, text));
}

function mentionsPrivateHandoutLeak(text: string, privateLeakTexts: string[]): boolean {
  if (!text.trim()) return false;
  const privateThoughts = extractPrivateThoughts(text);
  if (privateThoughts.some((thought) => hasPrivateStrategyMarker(thought))) {
    return true;
  }

  const privateTerms = extractPrivateLeakTerms(privateLeakTexts);
  if (privateThoughts.some((thought) => overlapsPrivateTerms(thought, privateTerms))) {
    return true;
  }

  return privateTerms.length > 0
    && hasExternalizedPrivateStrategyMarker(text)
    && overlapsPrivateTerms(text, privateTerms);
}

function extractPrivateThoughts(text: string): string[] {
  const thoughts: string[] = [];
  const pattern = /['‘]([^'’\n]{1,240})['’]/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    thoughts.push(match[1]?.trim() ?? "");
  }
  return thoughts.filter(Boolean);
}

function hasPrivateStrategyMarker(text: string): boolean {
  const compact = normalize(text);
  return [
    /아직.*(언급|말|묻|조사|확인).*(않|안|전)/,
    /(관심|시선|주의).*(돌려|돌리|다른곳|분산)/,
    /(조사|질문|화제).*(멀어|피하|막아|막을|돌려|돌리)/,
    /(숨겨|감춰|들키|들키면|발각|회피|유도|몰아가|떠넘겨)/,
    /(말하면안|말해선안|말할수없|모른척|아닌척)/,
  ].some((pattern) => pattern.test(compact));
}

function hasExternalizedPrivateStrategyMarker(text: string): boolean {
  const compact = normalize(text);
  return [
    /(관심|시선|주의).*(돌려|돌리|다른곳|분산)/,
    /(조사|질문|화제).*(멀어|피하|막아|막을|돌려|돌리)/,
    /(숨겨|감춰|들키|들키면|발각|모른척|아닌척)/,
  ].some((pattern) => pattern.test(compact));
}

function extractPrivateLeakTerms(values: string[]): string[] {
  const terms = new Set<string>();
  for (const value of values) {
    for (const rawTerm of extractTerms(value)) {
      const term = stripKoreanParticles(rawTerm);
      if (term.length >= 2 && !COMMON_PRIVATE_TERMS.has(term)) {
        terms.add(normalize(term));
      }
    }
  }
  return [...terms].filter(Boolean);
}

function overlapsPrivateTerms(text: string, privateTerms: string[]): boolean {
  const haystack = normalize(text);
  const hits = privateTerms.filter((term) => haystack.includes(term));
  return hits.length >= 2 || hits.some((term) => term.length >= 5);
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

function stripKoreanParticles(value: string): string {
  return value.replace(/(으로|에게|에서|부터|까지|처럼|마다|보다|이다|했다|한다|된다|으로는|로는|은|는|이|가|을|를|의|로|과|와|다)$/u, "");
}

const COMMON_PRIVATE_TERMS = new Set([
  "상황",
  "장면",
  "사건",
  "반응",
  "자신",
  "자기",
  "유저",
  "사용자",
  "질문",
  "정보",
  "목표",
  "현재",
  "다른",
  "사람",
  "캐릭터",
  "상대",
  "대화",
]);

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
