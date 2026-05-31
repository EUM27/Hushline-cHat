import type { CaseInquiryFrame, CaseInquiryType, CaseKnowledge, CaseRequestedTruthLevel, ScenarioPack } from "@hushline/shared";

const TOPIC_MARKERS: Array<{ tag: string; markers: string[]; objectId?: string; locationId?: string }> = [
  { tag: "key", markers: ["열쇠", "키"], objectId: "study-key" },
  { tag: "table", markers: ["테이블", "탁자"], objectId: "lounge-table" },
  { tag: "book", markers: ["책", "책꾸러미", "책등", "메모지"], objectId: "seha-book-bundle" },
  { tag: "blackout", markers: ["정전", "불이 꺼", "불 꺼", "불꺼"] },
  { tag: "last_seen", markers: ["마지막", "최근", "직전", "근처", "누가 있었"] },
  { tag: "lounge", markers: ["라운지", "거실", "응접실"], locationId: "lodge-foyer" },
  { tag: "study", markers: ["서재"], locationId: "lodge-study-crime-scene" },
  { tag: "locked_room", markers: ["밀실", "잠긴", "문"] },
  { tag: "victim", markers: ["피해자", "윤태식", "시신", "죽은 사람", "죽은사람", "사망자"] },
  { tag: "killer", markers: ["범인", "살인범", "공범"] },
  { tag: "truth", markers: ["진상", "정답", "트릭"] },
];

export interface RouteCaseInquiryInput {
  content: string;
  inputMode: string;
  currentLocationId?: string;
  knownClaimIds: string[];
  revealedFactIds: string[];
  caseKnowledge?: CaseKnowledge | undefined;
}

export function routeCaseInquiry(input: string, pack: ScenarioPack): CaseInquiryFrame;
export function routeCaseInquiry(input: RouteCaseInquiryInput): CaseInquiryFrame;
export function routeCaseInquiry(input: string | RouteCaseInquiryInput, pack?: ScenarioPack): CaseInquiryFrame {
  const content = typeof input === "string" ? input : input.content;
  const caseKnowledge = typeof input === "string" ? pack?.caseKnowledge : input.caseKnowledge;
  const normalized = normalize(content);
  const topicTags = detectTopicTags(content, caseKnowledge);
  const targetCharacterId = pack ? detectCharacterTarget(content, pack) : undefined;
  const accusationTargetId = pack ? detectAccusationTarget(content, pack) : undefined;
  const targetObjectId = detectTargetObject(content, caseKnowledge);
  const targetLocationId = detectTargetLocation(content, caseKnowledge);
  const timeWindow = detectTimeWindow(content);
  const inquiryType = classifyInquiry(normalized, topicTags, Boolean(targetCharacterId), Boolean(accusationTargetId));
  const requestedTruthLevel = getRequestedTruthLevel(inquiryType);
  const truthLeakRisk = computeTruthLeakRisk({ inquiryType, topicTags, requestedTruthLevel });

  return {
    isCaseInquiry: inquiryType !== "general_dialogue",
    inquiryType,
    ...(targetCharacterId ? { targetNpcId: targetCharacterId } : {}),
    ...(targetCharacterId ? { targetCharacterId } : {}),
    ...(targetObjectId ? { targetObjectId } : {}),
    ...(targetLocationId ? { targetLocationId } : {}),
    topicTags,
    ...(timeWindow ? { timeWindow } : {}),
    referencedEvidenceIds: [],
    referencedClaimIds: [],
    referencedFactIds: detectReferencedFactIds(content, caseKnowledge),
    ...(accusationTargetId ? { accusationTargetId, impliedAccusation: true } : {}),
    requestedTruthLevel,
    truthLeakRisk,
  };
}

function classifyInquiry(
  normalized: string,
  topicTags: string[],
  hasTargetCharacter: boolean,
  hasAccusationTarget: boolean,
): CaseInquiryType {
  const hasTruthMarker = /범인|살인범|공범|진상|정답|누가죽였|트릭이뭐|트릭/.test(normalized);
  const hasReasoningMarker = /그러니까|즉|따라서|왜냐하면|증거|근거|모순|앞뒤|말했잖아|했잖아|으니|니까|동선|열쇠|정전/.test(normalized);
  const hasDeductionShape = hasReasoningMarker && /(사라졌|있었|없었|옮긴|가져간|말했|봤다면|맞다면|누군가)/.test(normalized);
  if (hasTruthMarker && hasReasoningMarker) return "deduction_attempt";
  if (hasDeductionShape && /(으니|그러니까|따라서|왜냐하면|맞다면|증거|근거)/.test(normalized)) return "deduction_attempt";
  if (hasTruthMarker && !hasReasoningMarker) return "truth_request";
  if (/모순|말이안|말이다르|말이달라|둘중하나|거짓말|앞뒤가|아까는|다르게말|없댔.*있|있댔.*없|없다고.*있다고|있다고.*없다고/.test(normalized)) return "contradiction_challenge";
  if (/정리|요약|현재까지|뭐가알려|사건.*설명/.test(normalized)) return "case_summary_request";
  if (/마지막|언제|시간|동선|전후|정전전|정전중|정전후/.test(normalized)) return "timeline_query";
  if ((hasTargetCharacter || /[가-힣]{2,4}[,아야씨]/.test(normalized)) && /봤|보았|목격|기억|말해|알아|들은|들었/.test(normalized)) return "witness_testimony";
  if (/봤|보았|들었|목격|증언|기억/.test(normalized)) return "witness_testimony";
  if (topicTags.includes("key") || topicTags.includes("table") || topicTags.includes("book")) return "object_query";
  if (/조사|뒤져|살펴|확인/.test(normalized) && topicTags.some((tag) => ["lounge", "study"].includes(tag))) return "location_search";
  if (hasAccusationTarget || /수상|의심|했지|가져갔|죽였/.test(normalized)) return "accusation";
  if (topicTags.includes("locked_room")) return "object_query";
  if (topicTags.length > 0 && /보여|있어|확인|조사|살펴/.test(normalized)) return "observable_scene_request";
  return "general_dialogue";
}

function getRequestedTruthLevel(inquiryType: CaseInquiryType): CaseRequestedTruthLevel {
  if (inquiryType === "truth_request") return "hidden_truth";
  if (inquiryType === "deduction_attempt") return "deduction";
  if (inquiryType === "witness_testimony" || inquiryType === "timeline_query") return "testimony";
  if (inquiryType === "observable_scene_request" || inquiryType === "object_query") return "observable";
  return "public";
}

export function computeTruthLeakRisk(frame: Partial<CaseInquiryFrame> & { topicTags?: string[] }): 0 | 1 | 2 | 3 {
  const inquiryType = frame.inquiryType;
  const topicTags = frame.topicTags ?? [];
  if (inquiryType === "truth_request") return 3;
  if (frame.requestedTruthLevel === "hidden_truth") return 3;
  if (inquiryType === "deduction_attempt" || inquiryType === "contradiction_challenge" || topicTags.includes("killer") || topicTags.includes("truth")) return 2;
  if (inquiryType !== "general_dialogue") return 1;
  return 0;
}

function detectTopicTags(input: string, caseKnowledge?: CaseKnowledge): string[] {
  const tags = new Set<string>();
  const normalized = normalize(input);
  for (const entry of TOPIC_MARKERS) {
    if (entry.markers.some((marker) => normalized.includes(normalize(marker)))) {
      tags.add(entry.tag);
    }
  }
  for (const object of caseKnowledge?.objects ?? []) {
    if (normalized.includes(normalize(object.name)) || object.tags.some((tag) => normalized.includes(normalize(tag)))) {
      object.tags.forEach((tag) => tags.add(tag));
    }
  }
  for (const location of caseKnowledge?.locations ?? []) {
    if (normalized.includes(normalize(location.name)) || location.tags.some((tag) => normalized.includes(normalize(tag)))) {
      location.tags.forEach((tag) => tags.add(tag));
    }
  }

  // Only literal tags in the player input count here. Do not expand through
  // fact tag intersections, or broad tags such as "case_basic" can fan out into
  // unrelated clues that were never discussed.
  for (const fact of [...(caseKnowledge?.facts ?? []), ...(caseKnowledge?.publicFacts ?? []), ...(caseKnowledge?.observableFacts ?? [])]) {
    for (const tag of fact.tags) {
      const normalizedTag = normalize(tag);
      if (normalizedTag.length >= 2 && normalized.includes(normalizedTag)) {
        tags.add(tag);
      }
    }
  }
  return [...tags];
}

function detectCharacterTarget(input: string, pack: ScenarioPack): string | undefined {
  const normalized = normalize(input);
  return pack.characters.find((character) =>
    [character.name, character.shortName, character.anonymousLabel]
      .filter((label): label is string => Boolean(label))
      .some((label) => normalized.includes(normalize(label))),
  )?.id;
}

function detectAccusationTarget(input: string, pack: ScenarioPack): string | undefined {
  const target = detectCharacterTarget(input, pack);
  if (!target) return undefined;
  return /범인|살인범|수상|의심|가져갔|죽였|했지/.test(normalize(input)) ? target : undefined;
}

function detectTargetObject(input: string, caseKnowledge?: CaseKnowledge): string | undefined {
  const normalized = normalize(input);
  const objectMatch = caseKnowledge?.objects?.find((object) =>
    normalized.includes(normalize(object.name)) || object.tags.some((tag) => normalized.includes(normalize(tag))),
  );
  if (objectMatch) return objectMatch.id;
  return TOPIC_MARKERS.find((entry) =>
    entry.objectId && entry.markers.some((marker) => normalized.includes(normalize(marker))),
  )?.objectId;
}

function detectTargetLocation(input: string, caseKnowledge?: CaseKnowledge): string | undefined {
  const normalized = normalize(input);
  const locationMatch = caseKnowledge?.locations?.find((location) =>
    normalized.includes(normalize(location.name)) || location.tags.some((tag) => normalized.includes(normalize(tag))),
  );
  if (locationMatch) return locationMatch.id;
  return TOPIC_MARKERS.find((entry) =>
    entry.locationId && entry.markers.some((marker) => normalized.includes(normalize(marker))),
  )?.locationId;
}

function detectTimeWindow(input: string): CaseInquiryFrame["timeWindow"] {
  const normalized = normalize(input);
  if (/정전전|직전|전에는|전엔/.test(normalized)) return "before_blackout";
  if (/정전중|꺼졌을때|꺼진동안/.test(normalized)) return "during_blackout";
  if (/정전후|불이돌아|뒤에는|뒤엔/.test(normalized)) return "after_blackout";
  if (/언제|시간|마지막/.test(normalized)) return "unknown";
  return undefined;
}

function normalize(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

function detectReferencedFactIds(input: string, caseKnowledge?: CaseKnowledge): string[] {
  const normalized = normalize(input);
  const facts = [...(caseKnowledge?.facts ?? []), ...(caseKnowledge?.publicFacts ?? []), ...(caseKnowledge?.observableFacts ?? [])];
  return [...new Set(facts
    .filter((fact) =>
      fact.tags.some((tag) => normalized.includes(normalize(tag)))
      || fact.text.split(/\s+/).some((word) => word.length >= 3 && normalized.includes(normalize(word))),
    )
    .map((fact) => fact.id))];
}
