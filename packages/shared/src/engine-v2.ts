// ──────────────────────────────────────────────
// Engine v2 — Shared Types & Interfaces
// ──────────────────────────────────────────────

import type { GenerationModelSnapshot, InputMode, ModelConnection, ExpressionId } from "./index.js";

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
  messagePlan?: DirectorMessagePlanItem[]; // optional display order for this turn
  stateDelta: DirectorStateDelta;
  subObjectiveUpdate: DirectorSubObjectiveUpdate | null;
  relationshipUpdate: DirectorRelationshipUpdate | null;
  directives: DirectorDirective[]; // visual/timing directives for client
  delay: number | null; // ms suggestion for client display timing
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
}

// ── Turn Result ──

export interface TurnResultV2 {
  worldState: WorldState;
  messages: TurnMessage[];
  directorOutput: DirectorOutput;
}

export interface TurnMessage {
  id: string;
  sessionId: string;
  role: "user" | "character" | "narrator" | "system";
  content: string;
  createdAt: string;
  characterId?: string;
  speakerLabel?: string;
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

export type RevealLevel = "none" | "hint" | "partial" | "full" | "lie" | "deflect" | "mistaken";

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
  perTurn: {
    maxFullReveals: number;
    maxPartialReveals: number;
    maxHints: number;
  };
  overrideConditions: string[];
}

// ── Claim Ledger ──

export type ClaimVerificationStatus = "unverified" | "confirmed" | "contradicted" | "partially_true";

export interface Claim {
  id: string;
  speaker: string; // npc_id or "user"
  turn: number;
  content: string;
  claimType: "alibi" | "accusation" | "testimony" | "denial" | "assertion";
  verification: {
    status: ClaimVerificationStatus;
    contradictedBy: string[];
    supportedBy: string[];
  };
  userStance: "accepted" | "doubted" | "challenged" | "unknown";
  references: string[]; // other claim/fact IDs
}

export interface ClaimLedger {
  claims: Claim[];
  contradictions: Array<{
    claims: string[];
    type: string;
    detectedAtTurn: number;
    resolved: boolean;
  }>;
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
