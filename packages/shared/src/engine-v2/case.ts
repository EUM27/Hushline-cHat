import type { WorldState } from "./base.js";
// ── Case Runtime ──

export type FactId = string;
export type ClaimId = string;
export type EvidenceId = string;
export type NpcId = string;
export type LocationId = string;
export type ObjectId = string;

export type CaseInquiryType =
  | "general_dialogue"
  | "case_briefing_request"
  | "case_summary_request"
  | "observable_scene_request"
  | "location_search"
  | "object_query"
  | "timeline_query"
  | "alibi_query"
  | "witness_testimony"
  | "accusation"
  | "truth_request"
  | "contradiction_challenge"
  | "deduction_attempt"
  | "hypothesis"
  | "evidence_presentation"
  | "ooc_meta_request"
  | "unknown";

export type CaseRequestedTruthLevel =
  | "none"
  | "public"
  | "observable"
  | "testimony"
  | "deduction"
  | "hidden_truth";

export type TruthStatus = "true" | "false" | "unknown" | "ambiguous";

export type CaseFactCategory =
  | "briefing"
  | "public"
  | "observable"
  | "timeline"
  | "object"
  | "location"
  | "witness"
  | "clue"
  | "hidden_truth"
  | "solution";

export interface CaseFact {
  id: FactId;
  text: string;
  tags: string[];
  category?: CaseFactCategory;
  truthStatus?: TruthStatus;
  importance?: "flavor" | "case_basic" | "clue" | "critical" | "solution";
  locationId?: LocationId;
  objectIds?: ObjectId[];
  knownBy?: string[] | "all";
  visibility?: {
    knownBy: Array<{
      agentId: string;
      source: "public" | "saw" | "heard" | "experienced" | "inferred" | "told" | "omniscient";
      confidence: number;
    }>;
    blockedFrom?: Array<{
      agentId: string;
      reason: string;
    }>;
  };
  evidence?: {
    sourceType: "shared_observation" | "physical_evidence" | "witness" | "document" | "deduction" | "hidden";
    reliability: number;
  };
}

export interface PublicCaseBriefing {
  caseId: string;
  title: string;
  genre: "mystery";
  publicSummary: CaseFact[];
  playerVisibleAtStart: FactId[];
}

export interface TimelineEntry {
  id: string;
  time: string;
  publicLabel?: string;
  eventRefs?: FactId[];
  locationStates?: Record<LocationId, {
    present?: NpcId[];
    observableObjects?: ObjectId[];
    observableFactIds?: FactId[];
  }>;
}

export interface CaseObject {
  id: ObjectId;
  name: string;
  tags: string[];
  initialLocationId?: LocationId;
  factRefs?: FactId[];
}

export interface CaseLocation {
  id: LocationId;
  name: string;
  tags: string[];
  observableFactIds?: FactId[];
  objectIds?: ObjectId[];
}

export interface TestimonySeed {
  id: string;
  npcId?: NpcId;
  characterId: string;
  factRefs?: FactId[];
  factIds: string[];
  topicTags: string[];
  defaultRevealLevel: RevealLevel;
  certainty: "certain" | "uncertain" | "denial";
  canSay: string[];
  mustNotSay: string[];
  condition?: {
    requiresQuestionSpecificity?: number;
    requiresTopicMention?: string[];
    requiresEvidence?: EvidenceId[];
    requiresPriorFact?: FactId[];
    requiresTrust?: number;
  };
  forbidden?: string[];
  revealWhen?: {
    inquiryTypes?: CaseInquiryType[];
    topicTags?: string[];
    objectIds?: ObjectId[];
    locationIds?: LocationId[];
  };
}

export interface HiddenTruthRef {
  id: string;
  label: string;
  tags: string[];
  blockedKeywords: string[];
}

export interface HiddenTruthVault {
  hiddenTruthIds: FactId[];
  blockedByDefault: FactId[];
  solutionGraph: SolutionGraph;
}

export interface CaseKnowledge {
  briefing?: PublicCaseBriefing;
  facts?: CaseFact[];
  timeline?: TimelineEntry[];
  locations?: CaseLocation[];
  objects?: CaseObject[];
  hiddenTruthVault?: HiddenTruthVault;
  revealBudget?: RevealBudget;
  ambiguousFacts?: AmbiguousFact[];
  publicFacts: CaseFact[];
  observableFacts: CaseFact[];
  testimonySeeds: TestimonySeed[];
  hiddenTruths: HiddenTruthRef[];
}

export type CaseKnowledgeLayer = CaseKnowledge;

export interface CaseInquiryFrame {
  isCaseInquiry: boolean;
  inquiryType: CaseInquiryType;
  targetNpcId?: NpcId;
  targetCharacterId?: string;
  targetObjectId?: ObjectId;
  targetLocationId?: LocationId;
  topicTags: string[];
  timeWindow?: "before_blackout" | "during_blackout" | "after_blackout" | "current" | "unknown";
  referencedEvidenceIds: EvidenceId[];
  referencedClaimIds: ClaimId[];
  referencedFactIds?: FactId[];
  accusationTargetId?: NpcId;
  impliedAccusation?: boolean;
  requestedTruthLevel: CaseRequestedTruthLevel;
  truthLeakRisk: 0 | 1 | 2 | 3;
}

export interface CaseAllowedWitness {
  characterId: string;
  testimonySeedIds: string[];
  factIds: string[];
  canSay: string[];
  mustNotSay: string[];
  certainty: "certain" | "uncertain" | "denial";
  maxRevealLevel: RevealLevel;
}

export interface CaseAnswerScope {
  inquiryFrame: CaseInquiryFrame;
  publicFactIds: string[];
  observableFactIds: string[];
  allowedWitnesses: CaseAllowedWitness[];
  blockedFactIds: string[];
  blockedTruthIds: string[];
  recommendedSpeakerIds: string[];
  answerability: "none" | "partial" | "direct";
  publicFacts?: FactId[];
  observableFacts?: FactId[];
  testimonyCandidates?: Array<{
    npcId: NpcId;
    testimonySeedId: string;
    factIds: FactId[];
    revealLevel: RevealLevel;
    conditionSatisfied: boolean;
    missingConditions: string[];
  }>;
  blockedFacts?: Array<{
    factId: FactId;
    reason:
      | "hidden_truth"
      | "npc_does_not_know"
      | "not_observed"
      | "requires_evidence"
      | "requires_prior_fact"
      | "reveal_budget_exceeded"
      | "not_revealed_to_player";
  }>;
  recommendedSpeakers?: NpcId[];
  narratorCanAnswer?: boolean;
  directorCanSummarizePublicInfo?: boolean;
}

export interface CaseRevealPermission {
  allowedFactIds: string[];
  allowedClaimIds?: string[];
  allowedPropagatedClaimIds?: string[];
  blockedFactIds: string[];
  blockedTruthIds: string[];
  maxRevealLevel: RevealLevel;
  requiredBehavior?: string;
  forbiddenClaims?: string[];
  forbidden?: string[];
}

export type RevealPermission = CaseRevealPermission;
export type RevealPermissions = Record<NpcId, RevealPermission>;

export interface RevealInstruction {
  npcId: NpcId;
  allowedFactIds: FactId[];
  deniedFactIds: FactId[];
  responseMode: RevealLevel;
  behavior?: string;
  budgetUsed?: {
    factId: FactId;
    level: RevealLevel;
  };
}

export type ConflictType =
  | "location_conflict"
  | "timeline_conflict"
  | "object_conflict"
  | "action_conflict"
  | "identity_conflict"
  | "motive_conflict"
  | "alibi_conflict"
  | "perception_conflict";

export interface ContradictionRecord {
  id: string;
  claimAId: ClaimId;
  claimBId?: ClaimId;
  factId?: FactId;
  evidenceId?: EvidenceId;
  conflictType: ConflictType;
  severity: 0 | 1 | 2 | 3;
  detectedAtTurn: number;
  detectedBy: "engine" | "player" | "npc" | "director";
  playerNoticed: boolean;
  playerPresentedEvidenceIds: EvidenceId[];
  playerPresentedClaimIds: ClaimId[];
  involvedNpcIds: NpcId[];
  status: "candidate" | "confirmed" | "explained_away" | "false_alarm" | "resolved";
  npcReaction: Record<NpcId, {
    pressureLevel: 0 | 1 | 2 | 3;
    reaction:
      | "not_yet_confronted"
      | "deflected"
      | "doubled_down"
      | "cracked"
      | "explained_away"
      | "counter_accused"
      | "silenced";
    lastReactedTurn?: number;
  }>;
}

export interface SolutionGraph {
  caseId: string;
  requiredProofNodes: Array<{
    id: string;
    type:
      | "motive"
      | "means"
      | "opportunity"
      | "timeline"
      | "object_movement"
      | "contradiction"
      | "trick_mechanism"
      | "identity";
    requiredRefs: string[];
    weight: number;
  }>;
  optionalProofNodes: Array<{
    id: string;
    requiredRefs: string[];
    weight: number;
  }>;
  disqualifyingErrors: Array<{
    id: string;
    description: string;
    triggeredByWrongRefs: string[];
  }>;
  unlockThresholds: {
    partialTruth: number;
    finalTruth: number;
  };
}

export interface DeductionAttempt {
  id: string;
  turnNumber: number;
  playerClaim: string;
  accusationTargetId?: NpcId;
  evidenceRefs: EvidenceId[];
  claimRefs: ClaimId[];
  factRefs: FactId[];
  contradictionRefs: string[];
  logicalSteps: Array<{
    text: string;
    referencedIds: string[];
    stepType:
      | "fact_recall"
      | "claim_comparison"
      | "evidence_interpretation"
      | "causal_link"
      | "elimination"
      | "accusation"
      | "trick_explanation";
  }>;
  validationResult: DeductionValidationResult;
}

export interface DeductionValidationResult {
  score: number;
  requiredElementCoverage: Record<string, boolean>;
  missingEvidence: string[];
  missingClaims: string[];
  missingLogicalLinks: string[];
  wrongElements: string[];
  unsupportedAssumptions: string[];
  verdict:
    | "not_a_deduction"
    | "insufficient"
    | "partially_correct"
    | "correct"
    | "wrong_conclusion"
    | "overreached";
}

export interface KnowledgePropagationEvent {
  id: string;
  fromActorId: string;
  toActorId: NpcId;
  originalFactId?: FactId;
  originalClaimId?: ClaimId;
  turnNumber: number;
  propagationType:
    | "told_directly"
    | "overheard"
    | "inferred"
    | "witnessed_together"
    | "rumor_spread"
    | "public_announcement"
    | "document_shared";
  reliability: number;
  distortion:
    | "none"
    | "compressed"
    | "misremembered"
    | "biased"
    | "strategically_edited"
    | "rumor_mutated";
  propagatedContent: string;
  resultingKnowledge:
    | "known_claim"
    | "suspected_fact"
    | "false_belief"
    | "question_to_investigate";
  visibilityCondition?: {
    sameLocation?: boolean;
    audibleRange?: boolean;
    sameChatChannel?: boolean;
    privateWhisper?: boolean;
  };
}

export interface PropagatedClaim {
  id: string;
  sourceClaimId?: ClaimId;
  sourceFactId?: FactId;
  fromActorId: string;
  toActorId: NpcId;
  turnNumber: number;
  content: string;
  reliability: number;
  distortion: KnowledgePropagationEvent["distortion"];
}

export interface AmbiguousFact {
  id: string;
  text: string;
  topicTags: string[];
  possibleInterpretations: Array<{
    interpretationId: string;
    description: string;
    supportingFactIds: FactId[];
    supportingClaimIds: ClaimId[];
    supportingEvidenceIds: EvidenceId[];
    contradictingFactIds: FactId[];
    contradictingClaimIds: ClaimId[];
    contradictingEvidenceIds: EvidenceId[];
    probability: number;
    playerVisibleLabel?: string;
  }>;
  resolutionCondition: {
    requiredEvidenceIds?: EvidenceId[];
    requiredClaimIds?: ClaimId[];
    requiredContradictionIds?: string[];
    requiredLocationSearches?: LocationId[];
    requiredDeductionScore?: number;
  };
  resolvedTo?: string;
  resolvedAtTurn?: number;
  playerVisibleStatus: "unnoticed" | "noticed" | "contested" | "nearly_resolved" | "resolved";
}

export interface NarratorScope {
  allowedToDescribeFactIds: FactId[];
  allowedClueIds: string[];
  allowedLocations: LocationId[];
  allowedObjects: ObjectId[];
  forbiddenFactIds: FactId[];
  forbiddenInferences: Array<{
    id: string;
    description: string;
    blockedReason:
      | "hidden_truth"
      | "deduction_belongs_to_player"
      | "unsupported_inference"
      | "character_secret"
      | "future_event";
  }>;
  style: "neutral_observation" | "atmospheric" | "minimal" | "investigation_result";
  maxInferenceLevel: "none" | "sensory_only" | "obvious_physical_relation" | "publicly_reasonable";
}

export interface RevealBudgetSnapshot {
  perFact: Record<FactId, {
    hintCount: number;
    partialCount: number;
    fullCount: number;
    lastHintTurn?: number;
    lastPartialTurn?: number;
    fullRevealedAtTurn?: number;
  }>;
}

export interface SceneStateSnapshot {
  id: string;
  sessionId: string;
  turnNumber: number;
  locationId: LocationId;
  sceneMode: string;
  revealedFactIds: FactId[];
  revealedClueIds: string[];
  registeredClaims: ClaimId[];
  propagatedClaims: string[];
  contradictionCandidates: string[];
  confirmedContradictions: string[];
  ambiguousFactIds: string[];
  npcKnowledgeDigest: Record<NpcId, {
    knownFactIds: FactId[];
    knownClaimIds: ClaimId[];
    suspectedFactIds: FactId[];
    falseBeliefIds: string[];
  }>;
  npcTrustLevels: Record<NpcId, number>;
  playerHypotheses: string[];
  playerDeductionAttempts: string[];
  currentRevealBudget: RevealBudgetSnapshot;
  publicSummaryCache: {
    safeCaseSummary: string;
    lastUpdatedTurn: number;
  };
}

export interface CaseRuntimeTrace {
  inquiry: CaseInquiryFrame;
  answerScope: CaseAnswerScope;
  boundarySummary: string[];
  devTrace?: {
    inquiryType: string;
    truthLeakRisk: 0 | 1 | 2 | 3;
    allowedFacts: FactId[];
    blockedFacts: FactId[];
    contradictionIds: string[];
    deductionVerdict?: string;
    revealBudget?: unknown;
    characterGate?: unknown;
    narratorGate?: unknown;
    claimRegistered?: ClaimId;
    snapshotId?: string;
  };
}

// ── Fact Visibility Model ──

export interface FactVisibility {
  factId: string;
  content: string;
  factType: "event" | "relationship" | "object" | "location" | "motive" | "alibi";
  groundTruth: boolean;
  knownBy: Array<{ agentId: string; source: string; confidence: number }>;
  blockedFrom: Array<{ agentId: string; reason: string }>;
  autoPropagateOnReveal: Array<{ agentId: string; condition: string }>;
  linkedFacts: string[];
  contradicts: string[];
}

// ── Reveal Condition ──

export type RevealLevel = "none" | "hint" | "partial" | "full" | "lie" | "deflect" | "refuse" | "mistaken";

export interface RevealCondition {
  factId: string;
  npcId: string;
  revealLevel: RevealLevel;
  conditions: {
    requiresTopicMention?: string[];
    requiresQuestionSpecificity?: number; // 0-3
    requiresDirectAsk?: boolean;
    requiresEvidence?: string[];
    requiresPriorFact?: string[];
    requiresContradictionPresented?: boolean;
    requiresTrust?: number; // 0-100
    requiresAlone?: boolean;
    requiresLocation?: string;
    requiresMood?: string;
  };
  revealBehavior: {
    speechStyle: string;
    bodyLanguage?: string;
    followUp?: string;
  };
  onConditionNotMet: {
    responseType: "deflect" | "refuse" | "lie" | "partial_truth" | "counter_question";
    behavior: string;
  };
}

// ── Scene Occurrence Device ──

export type SceneDeviceType = "relational" | "informational" | "npc_driven" | "social" | "logistical" | "quiet_texture" | "timed_optional";

export interface SceneOccurrenceDevice {
  id: string;
  type: SceneDeviceType;
  trigger: {
    conditionType: string;
    conditionValue: unknown;
    requiresAll?: string[];
    requiresAny?: string[];
    blocksIf?: string[];
  };
  effect: {
    sceneBeat: string;
    stateDelta?: {
      tension?: number;
      danger?: number;
      factReveals?: string[];
      relationshipChanges?: Array<{ sourceId: string; targetId: string; descriptor: string; intensityDelta: number }>;
    };
    npcReactions?: Array<{ npcId: string; reaction: string }>;
  };
  oneShot: boolean;
  cooldown?: number;
  priority?: number;
}

// ── Reveal Budget ──

export interface RevealBudget {
  scope?: "per_fact" | "per_npc" | "per_scene" | "per_session";
  perFact?: Record<FactId, {
    hintCount: number;
    partialCount: number;
    fullCount: number;
    maxHints?: number;
    maxPartial?: number;
    maxFull: number;
    hintCooldownTurns: number;
    partialCooldownTurns: number;
    lastHintTurn?: number;
    lastPartialTurn?: number;
    fullRevealedAtTurn?: number;
    fullResetPolicy: "never" | "on_scene_unlock" | "on_final_phase";
  }>;
  perTurn: {
    maxFullReveals: number;
    maxPartialReveals: number;
    maxHints: number;
  };
  overrideConditions: string[];
}

// ── Claim Ledger ──

export type ClaimVerificationStatus = "unverified" | "confirmed" | "contradicted" | "partially_true";

export type ClaimType =
  | "alibi"
  | "witness"
  | "accusation"
  | "denial"
  | "interpretation"
  | "rumor"
  | "revision"
  | "confession_fragment"
  | "testimony"
  | "assertion";

export interface Claim {
  id: string;
  speaker: string; // npc_id or "user"
  turn: number;
  content: string;
  claimType: ClaimType;
  verification: {
    status: ClaimVerificationStatus;
    contradictedBy: string[];
    supportedBy: string[];
  };
  userStance: "accepted" | "doubted" | "challenged" | "unknown";
  references: string[]; // other claim/fact IDs
  speakerId?: NpcId;
  turnNumber?: number;
  referencedFactIds?: FactId[];
  referencedObjectIds?: ObjectId[];
  referencedLocationIds?: LocationId[];
  verificationStatus?: "unverified" | "supported" | "contradicted" | "partially_true" | "false";
  contradictedBy?: string[];
  supportedBy?: string[];
  playerStance?: "unknown" | "accepted" | "doubted" | "challenged";
}

export interface ClaimLedger {
  claims: Claim[];
  contradictions: Array<{
    claims: string[];
    type: string;
    detectedAtTurn: number;
    resolved: boolean;
  }> | ContradictionRecord[];
}

export interface PlayerHypothesis {
  id: string;
  turn: number;
  turnNumber?: number;
  content: string;
  referencedFactIds?: FactId[];
  referencedClaimIds?: ClaimId[];
  referencedEvidenceIds?: EvidenceId[];
  status?: "open" | "partially_supported" | "contradicted" | "resolved";
  inquiryType: CaseInquiryType;
  targetCharacterId?: string;
  topicTags: string[];
}

// ── NPC Fact Ledger (for scenario pack) ──

export interface NpcFactLedger {
  knownFacts: Array<{ id: string; text: string; source: string }>;
  hiddenFacts: Array<{ id: string; text: string; reasonHidden: string }>;
  falseBeliefs: Array<{ id: string; text: string; source: string }>;
}

// ── Extended WorldState (v2.1) ──

export interface WorldStateV2Extended extends WorldState {
  factVisibility: FactVisibility[];
  claimLedger: ClaimLedger;
  sceneInertiaCounter: number;
  revealBudgetRemaining: RevealBudget["perTurn"];
}
