import type {
  CaseFact,
  CaseInquiryFrame,
  CaseKnowledge,
  CaseLorebook,
  CaseLorebookActor,
  CaseLorebookEntry,
  CaseLorebookSecretLevel,
  CaseLorebookTreeNode,
  FactId,
  HiddenTruthRef,
  TestimonySeed,
} from "@hushline/shared";
import { getAllCaseFacts, getHiddenTruthIds } from "./case-knowledge.js";

export interface RetrieveCaseLoreInput {
  caseKnowledge?: CaseKnowledge | undefined;
  inquiryFrame: CaseInquiryFrame;
  actor: CaseLorebookActor;
  characterId?: string | undefined;
  revealedFactIds: FactId[];
  currentTurn: number;
}

export interface RetrievedCaseLore {
  entries: CaseLorebookEntry[];
  factIds: FactId[];
  blockedEntryIds: string[];
}

export function buildCaseLorebook(caseKnowledge?: CaseKnowledge): CaseLorebook {
  if (caseKnowledge?.lorebook) {
    return caseKnowledge.lorebook;
  }

  const entries = new Map<string, CaseLorebookEntry>();
  const hiddenTruthIds = new Set(getHiddenTruthIds(caseKnowledge));
  const publicFactIds = new Set((caseKnowledge?.publicFacts ?? []).map((fact) => fact.id));
  const observableFactIds = new Set((caseKnowledge?.observableFacts ?? []).map((fact) => fact.id));

  for (const fact of getAllCaseFacts(caseKnowledge)) {
    entries.set(fact.id, buildFactEntry(fact, {
      hiddenTruthIds,
      publicFactIds,
      observableFactIds,
      solutionFactIds: getSolutionFactIds(caseKnowledge),
    }));
  }

  for (const truth of caseKnowledge?.hiddenTruths ?? []) {
    if (!entries.has(truth.id)) {
      entries.set(truth.id, buildHiddenTruthEntry(truth, caseKnowledge));
    }
  }

  for (const seed of caseKnowledge?.testimonySeeds ?? []) {
    entries.set(seed.id, buildTestimonyEntry(seed));
  }

  const entryList = [...entries.values()];
  return {
    entries: entryList,
    tree: buildTree(entryList),
  };
}

export function retrieveCaseLore(input: RetrieveCaseLoreInput): RetrievedCaseLore {
  if (!input.inquiryFrame.isCaseInquiry) {
    return { entries: [], factIds: [], blockedEntryIds: [] };
  }

  const lorebook = buildCaseLorebook(input.caseKnowledge);
  const entries: CaseLorebookEntry[] = [];
  const blockedEntryIds: string[] = [];

  for (const entry of lorebook.entries) {
    if (!entryMatchesInquiry(entry, input.inquiryFrame)) {
      continue;
    }
    if (!entryConditionsMet(entry, input)) {
      continue;
    }
    if (!canActorRead(entry, input)) {
      blockedEntryIds.push(entry.id);
      continue;
    }
    entries.push(entry);
  }

  return {
    entries,
    factIds: unique(entries.flatMap((entry) => entry.linkedFactIds)),
    blockedEntryIds: unique(blockedEntryIds),
  };
}

function buildFactEntry(
  fact: CaseFact,
  input: {
    hiddenTruthIds: Set<string>;
    publicFactIds: Set<string>;
    observableFactIds: Set<string>;
    solutionFactIds: Set<string>;
  },
): CaseLorebookEntry {
  const secretLevel = getFactSecretLevel(fact, input);
  const readableBy = isSecretLevel(secretLevel)
    ? ["director", "deduction_validator"] satisfies CaseLorebookActor[]
    : ["director", "narrator", "character", "case_board", "deduction_validator"] satisfies CaseLorebookActor[];

  return {
    id: fact.id,
    title: fact.id,
    content: fact.text,
    tags: fact.tags,
    sourceType: "fact",
    secretLevel,
    linkedFactIds: [fact.id],
    visibility: {
      readableBy,
      ...(fact.knownBy ? { knownBy: fact.knownBy } : {}),
      ...(fact.visibility?.blockedFrom?.length
        ? { blockedFrom: fact.visibility.blockedFrom.map((block) => block.agentId) }
        : {}),
    },
    ...(fact.category ? { category: fact.category } : {}),
    ...(fact.locationId ? { locationId: fact.locationId } : {}),
    ...(fact.objectIds?.length ? { objectIds: fact.objectIds } : {}),
  };
}

function buildHiddenTruthEntry(truth: HiddenTruthRef, caseKnowledge?: CaseKnowledge): CaseLorebookEntry {
  const solutionFactIds = getSolutionFactIds(caseKnowledge);
  return {
    id: truth.id,
    title: truth.label,
    content: truth.label,
    tags: unique([...truth.tags, ...truth.blockedKeywords.map(normalizeTag)]).filter(Boolean),
    sourceType: "hidden_truth",
    secretLevel: solutionFactIds.has(truth.id) ? "solution" : "major_secret",
    linkedFactIds: [truth.id],
    visibility: {
      readableBy: ["director", "deduction_validator"],
    },
  };
}

function buildTestimonyEntry(seed: TestimonySeed): CaseLorebookEntry {
  const witnessId = seed.npcId ?? seed.characterId;
  const knownBy = unique([seed.characterId, ...(seed.npcId ? [seed.npcId] : [])]);
  return {
    id: seed.id,
    title: seed.id,
    content: seed.canSay.join(" "),
    tags: seed.topicTags,
    sourceType: "testimony",
    secretLevel: "testimony",
    linkedFactIds: seedFactIds(seed),
    npcId: witnessId,
    visibility: {
      readableBy: ["director", "character", "deduction_validator"],
      knownBy,
    },
    ...(seed.revealWhen ? { revealWhen: seed.revealWhen } : {}),
    ...(seed.condition ? { condition: seed.condition } : {}),
    ...(seed.canSay.length ? { canSay: seed.canSay } : {}),
    ...(seed.mustNotSay.length || seed.forbidden?.length
      ? { mustNotSay: [...seed.mustNotSay, ...(seed.forbidden ?? [])] }
      : {}),
  };
}

function buildTree(entries: CaseLorebookEntry[]): CaseLorebookTreeNode {
  const groups: Array<[CaseLorebookSecretLevel, string, string]> = [
    ["public", "Public", "Player-safe facts established at the case surface."],
    ["observable", "Observable", "Facts that can be found through scene inspection or direct observation."],
    ["testimony", "Testimony", "Witness-specific statements gated by speaker and topic."],
    ["private_npc", "Private NPC", "Character-private knowledge that is not global narration."],
    ["major_secret", "Major Secrets", "Hidden truth material blocked from normal narration and the case board."],
    ["solution", "Solution", "Solution-graph material for deduction validation."],
  ];

  const children = groups
    .map(([level, label, summary]) => ({
      id: `case-lorebook-${level}`,
      label,
      summary,
      entryIds: entries.filter((entry) => entry.secretLevel === level).map((entry) => entry.id),
      children: [],
    }))
    .filter((node) => node.entryIds.length > 0);

  return {
    id: "case-lorebook-root",
    label: "Case Lorebook",
    summary: "Tree index for case facts, testimony, and hidden truth access.",
    entryIds: entries.map((entry) => entry.id),
    children,
  };
}

function getFactSecretLevel(
  fact: CaseFact,
  input: {
    hiddenTruthIds: Set<string>;
    publicFactIds: Set<string>;
    observableFactIds: Set<string>;
    solutionFactIds: Set<string>;
  },
): CaseLorebookSecretLevel {
  if (input.solutionFactIds.has(fact.id) || fact.category === "solution" || fact.importance === "solution") {
    return "solution";
  }
  if (input.hiddenTruthIds.has(fact.id) || fact.category === "hidden_truth") {
    return "major_secret";
  }
  if (input.publicFactIds.has(fact.id) || fact.category === "public" || fact.category === "briefing" || fact.knownBy === "all") {
    return "public";
  }
  if (
    input.observableFactIds.has(fact.id)
    || fact.category === "observable"
    || fact.category === "object"
    || fact.category === "location"
    || fact.category === "timeline"
    || fact.category === "witness"
    || fact.category === "clue"
  ) {
    return "observable";
  }
  return "observable";
}

function entryMatchesInquiry(entry: CaseLorebookEntry, inquiryFrame: CaseInquiryFrame): boolean {
  if (inquiryFrame.inquiryType === "case_summary_request" || inquiryFrame.inquiryType === "case_briefing_request") {
    return entry.secretLevel === "public";
  }

  if (intersects(entry.linkedFactIds, inquiryFrame.referencedFactIds ?? [])) {
    return true;
  }
  if (intersects(entry.tags, inquiryFrame.topicTags)) {
    return true;
  }
  if (inquiryFrame.targetObjectId && entry.objectIds?.includes(inquiryFrame.targetObjectId)) {
    return true;
  }
  if (inquiryFrame.targetLocationId && entry.locationId === inquiryFrame.targetLocationId) {
    return true;
  }
  if (
    entry.sourceType === "testimony"
    && inquiryFrame.inquiryType === "witness_testimony"
    && isEntryKnownBy(entry, inquiryFrame.targetCharacterId ?? inquiryFrame.targetNpcId)
    && inquiryFrame.topicTags.length === 0
  ) {
    return true;
  }
  if (inquiryFrame.inquiryType === "truth_request" && isSecretLevel(entry.secretLevel)) {
    return hasTruthTag(entry) || inquiryFrame.topicTags.some((tag) => tag === "killer" || tag === "truth");
  }
  return false;
}

function entryConditionsMet(entry: CaseLorebookEntry, input: RetrieveCaseLoreInput): boolean {
  const { inquiryFrame } = input;
  if (entry.revealWhen?.inquiryTypes?.length && !entry.revealWhen.inquiryTypes.includes(inquiryFrame.inquiryType)) {
    return false;
  }
  if (entry.revealWhen?.objectIds?.length && inquiryFrame.targetObjectId && !entry.revealWhen.objectIds.includes(inquiryFrame.targetObjectId)) {
    return false;
  }
  if (entry.revealWhen?.locationIds?.length && inquiryFrame.targetLocationId && !entry.revealWhen.locationIds.includes(inquiryFrame.targetLocationId)) {
    return false;
  }
  if (entry.revealWhen?.topicTags?.length && !intersects(entry.revealWhen.topicTags, inquiryFrame.topicTags)) {
    return false;
  }
  if (entry.condition?.requiresPriorFact?.some((factId) => !input.revealedFactIds.includes(factId))) {
    return false;
  }
  if (entry.condition?.requiresEvidence?.some((evidenceId) => !inquiryFrame.referencedEvidenceIds.includes(evidenceId))) {
    return false;
  }
  if (entry.condition?.requiresTopicMention?.some((tag) => !inquiryFrame.topicTags.includes(tag))) {
    return false;
  }
  return true;
}

function canActorRead(entry: CaseLorebookEntry, input: RetrieveCaseLoreInput): boolean {
  if (!entry.visibility.readableBy.includes(input.actor)) {
    return false;
  }
  if (entry.visibility.blockedFrom?.includes(input.actor)) {
    return false;
  }
  if (input.actor === "character") {
    if (!input.characterId) {
      return false;
    }
    if (entry.visibility.blockedFrom?.includes(input.characterId)) {
      return false;
    }
    if (entry.sourceType === "testimony" || entry.secretLevel === "private_npc") {
      return isEntryKnownBy(entry, input.characterId);
    }
  }
  return true;
}

function isEntryKnownBy(entry: CaseLorebookEntry, actorId?: string): boolean {
  if (!actorId) {
    return false;
  }
  if (entry.npcId === actorId) {
    return true;
  }
  const knownBy = entry.visibility.knownBy;
  return knownBy === "all" || Boolean(Array.isArray(knownBy) && knownBy.includes(actorId));
}

function getSolutionFactIds(caseKnowledge?: CaseKnowledge): Set<string> {
  const refs = [
    ...(caseKnowledge?.hiddenTruthVault?.solutionGraph.requiredProofNodes ?? []).flatMap((node) => node.requiredRefs),
    ...(caseKnowledge?.hiddenTruthVault?.solutionGraph.optionalProofNodes ?? []).flatMap((node) => node.requiredRefs),
  ];
  return new Set(refs);
}

function seedFactIds(seed: TestimonySeed): string[] {
  return unique([...(seed.factRefs ?? []), ...seed.factIds]);
}

function isSecretLevel(level: CaseLorebookSecretLevel): boolean {
  return level === "major_secret" || level === "solution";
}

function hasTruthTag(entry: CaseLorebookEntry): boolean {
  return entry.tags.some((tag) => tag === "killer" || tag === "truth");
}

function intersects(left: string[], right: string[]): boolean {
  return left.some((item) => right.includes(item));
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function normalizeTag(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, "_");
}
