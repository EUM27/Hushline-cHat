import type { CaseFact, CaseLocation, CaseObject, Claim, ClaimType, NpcId } from "@hushline/shared";

export function extractClaimFromApprovedDialogue(input: {
  text: string;
  speakerId: NpcId;
  turnNumber: number;
  caseFacts: CaseFact[];
  objects: CaseObject[];
  locations: CaseLocation[];
}): Claim | null {
  const claimType = classifyClaim(input.text);
  if (!claimType) {
    return null;
  }

  const referencedFactIds = input.caseFacts
    .filter((fact) => factMatchesText(fact.text, fact.tags, input.text))
    .map((fact) => fact.id);
  const referencedObjectIds = input.objects
    .filter((object) => textIncludesNameOrTags(input.text, object.name, object.tags))
    .map((object) => object.id);
  const referencedLocationIds = input.locations
    .filter((location) => textIncludesNameOrTags(input.text, location.name, location.tags))
    .map((location) => location.id);

  return {
    id: `claim_${input.turnNumber}_${input.speakerId}_${stableSuffix(input.text)}`,
    speaker: input.speakerId,
    speakerId: input.speakerId,
    turn: input.turnNumber,
    turnNumber: input.turnNumber,
    content: input.text,
    claimType,
    referencedFactIds,
    referencedObjectIds,
    referencedLocationIds,
    verificationStatus: "unverified",
    contradictedBy: [],
    supportedBy: [],
    playerStance: "unknown",
    verification: {
      status: "unverified",
      contradictedBy: [],
      supportedBy: [],
    },
    userStance: "unknown",
    references: [...referencedFactIds, ...referencedObjectIds, ...referencedLocationIds],
  };
}

function classifyClaim(text: string): ClaimType | null {
  const normalized = normalize(text);
  if (/혼자였|같이있었|어디에있었|있었습니다|없었습니다|정전중|정전동안|알리바이/.test(normalized)) {
    return "alibi";
  }
  if (/봤|보았|목격|들었|기억/.test(normalized)) {
    return "witness";
  }
  if (/아니야|안했|하지않|모른|없어|없었/.test(normalized)) {
    return "denial";
  }
  if (/범인|수상|의심|고발/.test(normalized)) {
    return "accusation";
  }
  if (/같아|듯해|생각|해석/.test(normalized)) {
    return "interpretation";
  }
  if (/소문|들리는말|카더라/.test(normalized)) {
    return "rumor";
  }
  return null;
}

function factMatchesText(factText: string, tags: string[], text: string): boolean {
  const haystack = normalize(text);
  const terms = [...extractTerms(factText), ...tags];
  const hits = [...new Set(terms.map(normalize).filter((term) => term.length >= 2))]
    .filter((term) => haystack.includes(term));
  return hits.length >= 2 || hits.some((term) => term.length >= 5);
}

function textIncludesNameOrTags(text: string, name: string, tags: string[]): boolean {
  const haystack = normalize(text);
  return haystack.includes(normalize(name)) || tags.some((tag) => haystack.includes(normalize(tag)));
}

function extractTerms(text: string): string[] {
  return text
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2);
}

function stableSuffix(text: string): string {
  let hash = 0;
  for (const char of text) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash.toString(36);
}

function normalize(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}
