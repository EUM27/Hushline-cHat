// ──────────────────────────────────────────────
// Engine v2 — Shared Types & Interfaces
// ──────────────────────────────────────────────

import type { GenerationModelSnapshot, InputMode, ModelConnection, ExpressionId, SpeakerKind } from "./index.js";

// ── Agent Slots ──

/** Connection routing slot identifiers. */
export type AgentSlot = "director" | "narrator" | (string & {});

// ── Scene Mode ──

/** Explicit scene mode managed by the Director. */
export type SceneMode =
  | "messenger"
  | "exploration"
  | "dialogue"
  | "tension"
  | "crisis"
  | "resolution";

// ── Objectives ──

export interface Objective {
  id: string;
  description: string;
  status: "active" | "completed" | "failed";
}

export interface SubObjective extends Objective {
  createdAtTurn: number;
  deliveredVia: "dialogue" | "narrator" | "event";
}

// ── Relationships ──

export interface RelationshipEdge {
  sourceId: string;
  targetId: string;
  descriptor: string; // e.g. "distrust", "curiosity", "hidden_affection"
  intensity: number; // 0–10
}

// ── Events ──

export interface NarrativeEvent {
  id: string;
  turnNumber: number;
  description: string;
  affectedCharacterIds: string[];
}

// ── Character State ──

export interface CharacterStateV2 {
  id: string;
  currentObjective: string;
  knownFacts: string[];
  relationshipToUser: number; // -10 to +10
  lastSpokeTurn: number;
  isRevealed: boolean;
  autonomy: number; // 0.0–1.0
}

// ── World State ──

export interface WorldState {
  sessionId: string;
  scenarioId: string;
  sceneMode: SceneMode;
  locationId: string;
  backgroundId: string;
  tension: number; // 0–10
  danger: number; // 0–10
  turnNumber: number;
  hasEnteredScene: boolean;
  mainObjective: Objective;
  subObjectives: SubObjective[];
  characterStates: Record<string, CharacterStateV2>;
  relationshipGraph: RelationshipEdge[];
  recentEvents: NarrativeEvent[];
  recentSpeakerIds: string[];
  claimLedger?: ClaimLedger;
  propagatedClaims?: PropagatedClaim[];
  ambiguousFacts?: AmbiguousFact[];
  playerHypotheses?: PlayerHypothesis[];
  playerDeductionAttempts?: DeductionAttempt[];
  sceneSnapshots?: SceneStateSnapshot[];
}

// ── Director Output ──

export interface DirectorStateDelta {
  tension?: number; // delta, not absolute
  danger?: number;
  locationId?: string;
  backgroundId?: string;
  sceneMode?: SceneMode;
}

export interface DirectorSubObjectiveUpdate {
  action: "create" | "progress" | "complete" | "fail";
  id?: string;
  description?: string;
  deliveredVia?: "dialogue" | "narrator" | "event";
}

export interface DirectorRelationshipUpdate {
  sourceId: string;
  targetId: string;
  descriptor: string;
  intensityDelta: number;
}

export interface DirectorDirective {
  effect: "fade_to_black" | "fade_from_black" | "screen_shake" | "blur" | "flash" | "silence_pause" | "vignette";
  duration?: number; // seconds
  intensity?: number; // 0–1
}

export interface DirectorMessagePlanItem {
  kind: "narrator" | "character" | "system";
  speakerId?: string;
}

export interface DirectorOutput {
  speakers: string[]; // 1–2 character IDs
  silence: boolean; // true = skip all character invocations
  event: string | null; // narrative event description
  narratorInstruction: string | null; // scene direction for narrator
  characterIntents: Record<string, string>; // characterId → intent string
  inquiry?: CaseInquiryFrame;
  answerScope?: CaseAnswerScope;
  revealPermissions?: Record<string, CaseRevealPermission>;
  caseDebug?: {
    selectedSpeakerReason?: string;
    blockedReasonSummary: string[];
    truthLeakRisk: 0 | 1 | 2 | 3;
  };
  contradictionPlan?: {
    contradictionIds: string[];
    pressureByNpc: Record<NpcId, 0 | 1 | 2 | 3>;
    allowedReactionByNpc: Record<NpcId, "deflect" | "doubled_down" | "cracked" | "explained_away" | "silence">;
  };
  deductionPlan?: {
    attemptId?: string;
    verdict?: DeductionValidationResult["verdict"];
    safeFeedbackFactIds: FactId[];
    missingProofNodeIds: string[];
    unlockTruthIds: FactId[];
  };
  narratorScope?: NarratorScope;
  devTrace?: {
    inquiryType: string;
    contradictionIds: string[];
    deductionVerdict?: string;
    ambiguityUpdates: string[];
    blockedTruthIds: FactId[];
    selectedSpeakerReason: string;
  };
  messagePlan?: DirectorMessagePlanItem[]; // optional display order for this turn
  stateDelta: DirectorStateDelta;
  subObjectiveUpdate: DirectorSubObjectiveUpdate | null;
  relationshipUpdate: DirectorRelationshipUpdate | null;
  directives: DirectorDirective[]; // visual/timing directives for client
  delay: number | null; // ms suggestion for client display timing
}

export interface DirectorOutputV4 extends DirectorOutput {
  inquiry?: CaseInquiryFrame & {
    type?: CaseInquiryType;
    targetNpcId?: NpcId;
    targetObjectId?: ObjectId;
    targetLocationId?: LocationId;
    accusationTargetId?: NpcId;
    truthLeakRisk: 0 | 1 | 2 | 3;
  };
  answerScope?: CaseAnswerScope & {
    publicContext?: string[];
    unresolved?: string[];
    forbidden?: string[];
    allowedWitnesses: Array<CaseAllowedWitness & {
      canSayFactIds?: FactId[];
      mustNotSayFactIds?: FactId[];
    }>;
  };
  revealPermissions?: RevealPermissions;
  contradictionPlan?: {
    contradictionIds: string[];
    pressureByNpc: Record<NpcId, 0 | 1 | 2 | 3>;
    allowedReactionByNpc: Record<NpcId, "deflect" | "doubled_down" | "cracked" | "explained_away" | "silence">;
  };
  deductionPlan?: {
    attemptId?: string;
    verdict?: DeductionValidationResult["verdict"];
    safeFeedbackFactIds: FactId[];
    missingProofNodeIds: string[];
    unlockTruthIds: FactId[];
  };
  narratorScope?: NarratorScope;
  caseAnswerPlan?: {
    channel: "character" | "narrator" | "public_summary" | "refuse";
    playerSafeSummary?: string;
  };
  devTrace?: {
    inquiryType: string;
    contradictionIds: string[];
    deductionVerdict?: string;
    ambiguityUpdates: string[];
    blockedTruthIds: FactId[];
    selectedSpeakerReason: string;
  };
}

// ── Boundary Report ──

export type BoundaryLayer = "director" | "narrator" | "character";

export type BoundaryAction = "removed" | "replaced" | "fallback";

export interface BoundaryViolation {
  layer: BoundaryLayer;
  code: string;
  message: string;
  action: BoundaryAction;
  path?: string;
  characterId?: string;
}

export interface BoundaryReport {
  corrected: boolean;
  violations: BoundaryViolation[];
}

// ── State Law Snapshot ──

export interface StateLawSnapshot {
  immutableFacts: string[];
  slowState: string[];
  scenePressure: string[];
  outputRules: string[];
}

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

// ── Knowledge Layers ──

export interface PublicContext {
  scenarioTitle: string;
  scenarioSubtitle: string;
  sceneMode: SceneMode;
  currentLocation: string;
  currentBackground: string;
  tension: number;
  danger: number;
  turnNumber: number;
  publicChatLog: PublicChatEntry[];
  publicEvents: string[];
  mainObjectiveDescription: string;
}

export interface PublicChatEntry {
  role: "user" | "character" | "narrator" | "system";
  label: string;
  content: string;
  inputMode?: InputMode;
}

export interface PrivateHandout {
  characterId: string;
  secret: string;
  desire: string;
  objective: string;
  relationshipToUser: number;
  knownFacts: string[];
  myRelationships: RelationshipEdge[]; // only edges FROM this character
  autonomy: number;
}

export interface CharacterSummary {
  id: string;
  name: string;
  shortName: string;
  role: string;
  autonomy: number;
  currentObjective: string;
  secretHint: string; // short summary for Director, not full secret
  relationshipToUser: number;
}

export interface OmniscientContext {
  allSecrets: Record<string, string>;
  allDesires: Record<string, string>;
  allObjectives: Record<string, string>;
  fullRelationshipGraph: RelationshipEdge[];
  mainObjective: Objective;
  subObjectives: SubObjective[];
  characterSummaries: CharacterSummary[];
  eventTriggers: EventTrigger[];
  genreGoals: string;
  recentEvents: NarrativeEvent[];
}

// ── Scenario Pack ──

export type ScenarioGenre = "horror" | "romance" | "mystery" | "fantasy" | "scifi" | "slice_of_life" | "thriller";

export interface ScenarioManifest {
  id: string;
  title: string;
  subtitle: string;
  genre: ScenarioGenre;
  version: string;
  engineVersion: string; // semver range e.g. ">=2.0.0"
  uiMode?: "messenger-first" | "scene-first" | "hybrid";
}

export interface ScenarioOpeningBeatV2 {
  id: string;
  role: "narrator" | "system";
  speakerKind: "scenario-crowd" | "room-master" | "named-actor";
  speakerLabel: string;
  content: string;
  delay?: number; // ms before showing
}

export interface ScenarioCardV2 {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  spaceRules: string[];
  chatRules: string[];
  toneRules: string[];
  hardNos: string[];
  backgroundIds: string[];
  initialLocationId: string;
  initialBackgroundId: string;
  initialSceneMode: SceneMode;
  interventionPrompt: string;
  openingBeats: ScenarioOpeningBeatV2[];
}

export interface CharacterHandoutDefinition {
  secret: string;
  desire: string;
  objective: string;
  initialRelationshipToUser: number;
  /** Surface-level personality traits visible to others. */
  surfacePersonality?: string[];
  /** What this character fears most. */
  fear?: string;
  /** Behavioral rules the character follows. */
  behaviorRules?: string[];
}

export interface CharacterRelationshipDef {
  targetId: string;
  descriptor: string;
  intensity: number;
}

export interface CharacterDefinition {
  id: string;
  name: string;
  shortName: string;
  role: string;
  profileKind: "advisor-slot" | "named-actor";
  anonymousLabel?: string;
  mbti: string;
  ocean: {
    openness: number;
    conscientiousness: number;
    extraversion: number;
    agreeableness: number;
    neuroticism: number;
  };
  autonomy: number; // 0.0–1.0
  systemPrompt: string;
  relationshipTags?: string[];
  handout: CharacterHandoutDefinition;
  relationships: CharacterRelationshipDef[];
  spriteSetId?: string;
  avatarId?: string;
}

export interface EventTrigger {
  id: string;
  condition: string; // human-readable condition for Director context
  description: string; // what happens when triggered
  oneShot: boolean; // can only fire once
}

export interface ObjectiveDefinition {
  id: string;
  description: string;
}

export interface ScenarioPack {
  manifest: ScenarioManifest;
  scenarioCard: ScenarioCardV2;
  characters: CharacterDefinition[];
  directorPrompt: string;
  narratorPrompt: string;
  mainObjective: ObjectiveDefinition;
  eventTriggers: EventTrigger[];
  caseKnowledge?: CaseKnowledge;
}

// ── Turn Result ──

export interface TurnResultV2 {
  worldState: WorldState;
  messages: TurnMessage[];
  directorOutput: DirectorOutput;
  boundaryReport: BoundaryReport;
  stateLaw: StateLawSnapshot;
  caseRuntime?: CaseRuntimeTrace;
}

export interface TurnMessage {
  id: string;
  sessionId: string;
  role: "user" | "character" | "narrator" | "system";
  content: string;
  createdAt: string;
  characterId?: string;
  speakerKind?: SpeakerKind;
  speakerLabel?: string;
  isOpeningBeat?: boolean;
  inputMode?: InputMode;
  expression?: ExpressionId;
  generationSource?: "api" | "dry-run";
  generationModel?: GenerationModelSnapshot;
  fallbackReason?: string;
}

// ── Session State (v2) ──

export interface SessionStateV2 {
  id: string;
  scenarioPackId: string;
  title: string;
  persona: {
    id: string;
    name: string;
    shortName: string;
  };
  worldState: WorldState;
  characters: CharacterDefinition[];
  messages: TurnMessage[];
  handouts: Record<string, PrivateHandout>;
  summaries: SceneSummary[];
  createdAt: string;
  updatedAt: string;
}

export interface SceneSummary {
  id: string;
  turnRange: [number, number];
  narrative: string;
  keyDiscoveries: string[];
  relationshipChanges: string[];
  objectiveProgress: string;
  characterMoments: string[];
  createdAt: string;
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

// ── Turn Options ──

export interface TurnOptionsV2 {
  connections?: Record<string, ModelConnection>;
  inputMode?: InputMode;
}
