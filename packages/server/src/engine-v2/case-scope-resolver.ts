import type {
  CaseAnswerScope,
  CaseFact,
  CaseKnowledge,
  CaseInquiryFrame,
  CaseRevealPermission,
  Claim,
  FactId,
  RevealBudget,
  ScenarioPack,
  TestimonySeed,
} from "@hushline/shared";
import { getAllCaseFacts, getHiddenTruthIds } from "./case-knowledge.js";
import { isRevealBudgetExceeded } from "./reveal-budget-manager.js";

export interface ResolveCaseAnswerScopeInput {
  inquiryFrame: CaseInquiryFrame;
  caseKnowledge: CaseKnowledge;
  revealedFactIds: FactId[];
  claims: Claim[];
  currentTurn: number;
  revealBudget?: Partial<RevealBudget>;
}

export function resolveCaseAnswerScope(inquiryFrame: CaseInquiryFrame, pack: ScenarioPack): CaseAnswerScope;
export function resolveCaseAnswerScope(input: ResolveCaseAnswerScopeInput): CaseAnswerScope;
export function resolveCaseAnswerScope(input: CaseInquiryFrame | ResolveCaseAnswerScopeInput, pack?: ScenarioPack): CaseAnswerScope {
  if ("inquiryFrame" in input) {
    return resolveRuntimeCaseAnswerScope(input);
  }
  const inquiryFrame = input;
  if (!pack) {
    return emptyScope(inquiryFrame);
  }
  const knowledge = pack.caseKnowledge;
  if (!knowledge || !inquiryFrame.isCaseInquiry) {
    return emptyScope(inquiryFrame);
  }

  const publicFactIds = matchFacts(knowledge.publicFacts, inquiryFrame, inquiryFrame.inquiryType === "case_summary_request")
    .map((fact) => fact.id);
  const observableFactIds = matchFacts(knowledge.observableFacts, inquiryFrame, false)
    .map((fact) => fact.id);
  const allowedWitnesses = buildAllowedWitnesses(knowledge.testimonySeeds, inquiryFrame);
  const allowedFactIds = new Set([
    ...publicFactIds,
    ...observableFactIds,
    ...allowedWitnesses.flatMap((witness) => witness.factIds),
  ]);
  const allFactIds = [...knowledge.publicFacts, ...knowledge.observableFacts].map((fact) => fact.id);
  const blockedFactIds = allFactIds.filter((factId) => !allowedFactIds.has(factId));
  const blockedTruthIds = knowledge.hiddenTruths.map((truth) => truth.id);
  const recommendedSpeakerIds = getRecommendedSpeakers(inquiryFrame, allowedWitnesses.map((witness) => witness.characterId), pack);
  const answerability = getAnswerability(inquiryFrame, publicFactIds, observableFactIds, allowedWitnesses.length);

  return {
    inquiryFrame,
    publicFactIds,
    observableFactIds,
    allowedWitnesses,
    blockedFactIds,
    blockedTruthIds,
    recommendedSpeakerIds,
    answerability,
    publicFacts: publicFactIds,
    observableFacts: observableFactIds,
    testimonyCandidates: allowedWitnesses.flatMap((witness) => witness.testimonySeedIds.map((seedId) => ({
      npcId: witness.characterId,
      testimonySeedId: seedId,
      factIds: witness.factIds,
      revealLevel: witness.maxRevealLevel,
      conditionSatisfied: true,
      missingConditions: [],
    }))),
    blockedFacts: blockedFactIds.map((factId) => ({ factId, reason: "not_revealed_to_player" })),
    recommendedSpeakers: recommendedSpeakerIds,
    narratorCanAnswer: observableFactIds.length > 0 || publicFactIds.length > 0,
    directorCanSummarizePublicInfo: publicFactIds.length > 0,
  };
}

function resolveRuntimeCaseAnswerScope(input: ResolveCaseAnswerScopeInput): CaseAnswerScope {
  const { inquiryFrame, caseKnowledge } = input;
  if (!inquiryFrame.isCaseInquiry) {
    return emptyScope(inquiryFrame);
  }

  const facts = getAllCaseFacts(caseKnowledge);
  const hiddenTruthIds = new Set(getHiddenTruthIds(caseKnowledge));
  const matchingFacts = facts.filter((fact) => factMatchesInquiry(fact, inquiryFrame));
  const publicFactIds = matchingFacts
    .filter((fact) => isPublicFact(fact) && !hiddenTruthIds.has(fact.id))
    .map((fact) => fact.id);
  const observableFactIds = matchingFacts
    .filter((fact) => isObservableFact(fact) && !hiddenTruthIds.has(fact.id))
    .map((fact) => fact.id);
  const testimonyCandidates = (caseKnowledge.testimonySeeds ?? []).map((seed) => {
    const factIds = seedFactIds(seed);
    const missingConditions = getMissingSeedConditions(seed, input);
    const hasTopicMatch = seedMatchesInquiry(seed, inquiryFrame);
    return {
      npcId: seed.npcId ?? seed.characterId,
      testimonySeedId: seed.id,
      factIds,
      revealLevel: seed.defaultRevealLevel,
      conditionSatisfied: hasTopicMatch && missingConditions.length === 0,
      missingConditions: hasTopicMatch ? missingConditions : ["topic"],
    };
  }).filter((candidate) => candidate.conditionSatisfied || inquiryFrame.targetNpcId === candidate.npcId || inquiryFrame.targetCharacterId === candidate.npcId);

  const allowedFactIds = new Set([
    ...publicFactIds,
    ...observableFactIds,
    ...testimonyCandidates.filter((candidate) => candidate.conditionSatisfied).flatMap((candidate) => candidate.factIds),
  ]);
  const blockedFacts = facts
    .filter((fact) => !allowedFactIds.has(fact.id) || hiddenTruthIds.has(fact.id) || isBudgetExceededFact(fact.id, input))
    .map((fact) => ({
      factId: fact.id,
      reason: hiddenTruthIds.has(fact.id)
        ? "hidden_truth" as const
        : isBudgetExceededFact(fact.id, input)
          ? "reveal_budget_exceeded" as const
          : "not_revealed_to_player" as const,
    }));
  const allowedWitnesses = testimonyCandidates.filter((candidate) => candidate.conditionSatisfied).map((candidate) => ({
    characterId: candidate.npcId,
    testimonySeedIds: [candidate.testimonySeedId],
    factIds: candidate.factIds.filter((factId) => !hiddenTruthIds.has(factId)),
    canSay: caseKnowledge.testimonySeeds.find((seed) => seed.id === candidate.testimonySeedId)?.canSay ?? [],
    mustNotSay: [
      ...(caseKnowledge.testimonySeeds.find((seed) => seed.id === candidate.testimonySeedId)?.mustNotSay ?? []),
      ...(caseKnowledge.testimonySeeds.find((seed) => seed.id === candidate.testimonySeedId)?.forbidden ?? []),
    ],
    certainty: caseKnowledge.testimonySeeds.find((seed) => seed.id === candidate.testimonySeedId)?.certainty ?? "uncertain",
    maxRevealLevel: candidate.revealLevel,
  }));
  const recommendedSpeakerIds = [
    ...(inquiryFrame.targetNpcId ? [inquiryFrame.targetNpcId] : []),
    ...(inquiryFrame.targetCharacterId ? [inquiryFrame.targetCharacterId] : []),
    ...allowedWitnesses.map((witness) => witness.characterId),
  ].filter((value, index, values) => value && values.indexOf(value) === index);

  const answerability = inquiryFrame.inquiryType === "truth_request"
    ? "none"
    : allowedWitnesses.length > 0 || publicFactIds.length > 0 || observableFactIds.length > 0
      ? "partial"
      : "none";

  return {
    inquiryFrame,
    publicFactIds,
    observableFactIds,
    allowedWitnesses,
    blockedFactIds: blockedFacts.map((fact) => fact.factId),
    blockedTruthIds: [...hiddenTruthIds],
    recommendedSpeakerIds,
    answerability,
    publicFacts: publicFactIds,
    observableFacts: observableFactIds,
    testimonyCandidates,
    blockedFacts,
    recommendedSpeakers: recommendedSpeakerIds,
    narratorCanAnswer: observableFactIds.length > 0 || publicFactIds.length > 0,
    directorCanSummarizePublicInfo: publicFactIds.length > 0,
  };
}

export function buildRevealPermissions(scope: CaseAnswerScope): Record<string, CaseRevealPermission> {
  const permissions: Record<string, CaseRevealPermission> = {};
  for (const speakerId of scope.recommendedSpeakerIds) {
    const witness = scope.allowedWitnesses.find((candidate) => candidate.characterId === speakerId);
    permissions[speakerId] = {
      allowedFactIds: [
        ...scope.publicFactIds,
        ...scope.observableFactIds,
        ...(witness?.factIds ?? []),
      ],
      blockedFactIds: scope.blockedFactIds,
      blockedTruthIds: scope.blockedTruthIds,
      maxRevealLevel: witness?.maxRevealLevel ?? (scope.answerability === "direct" ? "partial" : "none"),
      ...(witness?.mustNotSay.length ? { forbiddenClaims: witness.mustNotSay } : {}),
      ...(witness ? { requiredBehavior: "허용된 증언 범위 안에서만 답한다." } : {}),
    };
  }
  return permissions;
}

export function summarizeCaseRuntimeBoundary(scope: CaseAnswerScope): string[] {
  if (!scope.inquiryFrame.isCaseInquiry) return [];
  return [
    `inquiry:${scope.inquiryFrame.inquiryType}`,
    `answerability:${scope.answerability}`,
    `blockedTruths:${scope.blockedTruthIds.length}`,
  ];
}

function emptyScope(inquiryFrame: CaseInquiryFrame): CaseAnswerScope {
  return {
    inquiryFrame,
    publicFactIds: [],
    observableFactIds: [],
    allowedWitnesses: [],
    blockedFactIds: [],
    blockedTruthIds: [],
    recommendedSpeakerIds: [],
    answerability: "none",
  };
}

function matchFacts(facts: CaseFact[], inquiryFrame: CaseInquiryFrame, includeAll: boolean): CaseFact[] {
  if (includeAll) return facts;
  if (inquiryFrame.topicTags.length === 0 && !inquiryFrame.targetObjectId && !inquiryFrame.targetLocationId) {
    return [];
  }
  return facts.filter((fact) =>
    intersects(fact.tags, inquiryFrame.topicTags)
    || Boolean(inquiryFrame.targetObjectId && fact.objectIds?.includes(inquiryFrame.targetObjectId))
    || Boolean(inquiryFrame.targetLocationId && fact.locationId === inquiryFrame.targetLocationId),
  );
}

function buildAllowedWitnesses(testimonySeeds: TestimonySeed[], inquiryFrame: CaseInquiryFrame): CaseAnswerScope["allowedWitnesses"] {
  const grouped = new Map<string, CaseAnswerScope["allowedWitnesses"][number]>();
  for (const seed of testimonySeeds) {
    if (inquiryFrame.targetCharacterId && seed.characterId !== inquiryFrame.targetCharacterId) {
      continue;
    }
    if (!seedMatchesInquiry(seed, inquiryFrame)) {
      continue;
    }
    const current = grouped.get(seed.characterId) ?? {
      characterId: seed.characterId,
      testimonySeedIds: [],
      factIds: [],
      canSay: [],
      mustNotSay: [],
      certainty: seed.certainty,
      maxRevealLevel: seed.defaultRevealLevel,
    };
    current.testimonySeedIds.push(seed.id);
    current.factIds.push(...seed.factIds.filter((factId) => !current.factIds.includes(factId)));
    current.canSay.push(...seed.canSay);
    current.mustNotSay.push(...seed.mustNotSay);
    grouped.set(seed.characterId, current);
  }
  return [...grouped.values()];
}

function seedMatchesInquiry(seed: TestimonySeed, inquiryFrame: CaseInquiryFrame): boolean {
  if (seed.revealWhen?.inquiryTypes?.length && !seed.revealWhen.inquiryTypes.includes(inquiryFrame.inquiryType)) {
    return false;
  }
  if (seed.revealWhen?.objectIds?.length && inquiryFrame.targetObjectId) {
    return seed.revealWhen.objectIds.includes(inquiryFrame.targetObjectId);
  }
  if (seed.revealWhen?.locationIds?.length && inquiryFrame.targetLocationId) {
    return seed.revealWhen.locationIds.includes(inquiryFrame.targetLocationId);
  }
  const tags = seed.revealWhen?.topicTags?.length ? seed.revealWhen.topicTags : seed.topicTags;
  return intersects(tags, inquiryFrame.topicTags);
}

function seedFactIds(seed: TestimonySeed): string[] {
  return [...new Set([...(seed.factRefs ?? []), ...seed.factIds])];
}

function getMissingSeedConditions(seed: TestimonySeed, input: ResolveCaseAnswerScopeInput): string[] {
  const missing: string[] = [];
  if (seed.condition?.requiresPriorFact?.some((factId) => !input.revealedFactIds.includes(factId))) {
    missing.push("requires_prior_fact");
  }
  if (seed.condition?.requiresEvidence?.some((evidenceId) => !input.inquiryFrame.referencedEvidenceIds.includes(evidenceId))) {
    missing.push("requires_evidence");
  }
  if (seed.condition?.requiresTopicMention?.some((tag) => !input.inquiryFrame.topicTags.includes(tag))) {
    missing.push("requires_topic");
  }
  return missing;
}

function factMatchesInquiry(fact: CaseFact, inquiryFrame: CaseInquiryFrame): boolean {
  if (inquiryFrame.inquiryType === "case_summary_request" || inquiryFrame.inquiryType === "case_briefing_request") {
    return isPublicFact(fact);
  }
  return intersects(fact.tags, inquiryFrame.topicTags)
    || Boolean(inquiryFrame.targetObjectId && fact.objectIds?.includes(inquiryFrame.targetObjectId))
    || Boolean(inquiryFrame.targetLocationId && fact.locationId === inquiryFrame.targetLocationId);
}

function isPublicFact(fact: CaseFact): boolean {
  return fact.category === "public" || fact.category === "briefing" || fact.knownBy === "all";
}

function isObservableFact(fact: CaseFact): boolean {
  return fact.category === "observable"
    || fact.category === "object"
    || fact.category === "location"
    || fact.category === "timeline"
    || fact.category === "witness"
    || fact.category === "clue";
}

function isBudgetExceededFact(factId: string, input: ResolveCaseAnswerScopeInput): boolean {
  const budgetInput = {
    factId,
    level: "full",
    currentTurn: input.currentTurn,
  } as const;
  return input.revealBudget
    ? isRevealBudgetExceeded({ ...budgetInput, revealBudget: input.revealBudget })
    : isRevealBudgetExceeded(budgetInput);
}

function getRecommendedSpeakers(
  inquiryFrame: CaseInquiryFrame,
  witnessIds: string[],
  pack: ScenarioPack,
): string[] {
  if (inquiryFrame.targetCharacterId) return [inquiryFrame.targetCharacterId];
  if (witnessIds.length > 0) return [...new Set(witnessIds)].slice(0, 2);
  if (inquiryFrame.accusationTargetId) return [inquiryFrame.accusationTargetId];
  return pack.characters[0]?.id ? [pack.characters[0].id] : [];
}

function getAnswerability(
  inquiryFrame: CaseInquiryFrame,
  publicFactIds: string[],
  observableFactIds: string[],
  witnessCount: number,
): CaseAnswerScope["answerability"] {
  if (inquiryFrame.inquiryType === "truth_request") return "none";
  if (inquiryFrame.inquiryType === "case_summary_request" && publicFactIds.length > 0) return "direct";
  if (observableFactIds.length > 0 || witnessCount > 0 || publicFactIds.length > 0) return "partial";
  return "none";
}

function intersects(left: string[], right: string[]): boolean {
  return left.some((item) => right.includes(item));
}
