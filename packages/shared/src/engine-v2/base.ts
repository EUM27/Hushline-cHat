import type {
  AmbiguousFact,
  ClaimLedger,
  DeductionAttempt,
  PlayerHypothesis,
  PropagatedClaim,
  SceneStateSnapshot,
} from "./case.js";
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
  /** Turns elapsed without a meaningful event; drives SceneBeatGenerator injection. */
  sceneInertiaCounter: number;
  /** Recently injected scene-beat types (bounded), used to avoid repetition. */
  recentBeatTypes: string[];
  /** factId → turn first revealed to the player. Source of the progressive clue ledger. */
  revealedCaseFacts?: Record<string, number>;
  /** characterId → turn first encountered by the player. Source of the progressive dossier list. */
  encounteredCharacters?: Record<string, number>;
}
