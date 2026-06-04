import type { InputMode } from "../index.js";
import type { NarrativeEvent, Objective, RelationshipEdge, SceneMode, SubObjective } from "./base.js";
import type { EventTrigger } from "./scenario.js";
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

/** Director-only player persona identity. May use player-agency framing. */
export interface DirectorPersonaBrief {
  name: string;
  shortName: string;
  role?: string;
  description?: string;
  appearance?: string;
  relationshipTags?: string[];
}

/** Character-visible persona identity, framed as a world-internal counterpart. */
export interface CharacterPersonaBrief {
  displayName: string;
  nameKnown: boolean;
  role?: string;
  description?: string;
  appearance?: string;
  relationshipTags?: string[];
}

/** Narrator-visible persona identity. Limited to observable continuity. */
export interface NarratorPersonaBrief {
  displayName: string;
  nameKnown: boolean;
  role?: string;
  appearance?: string;
}

/** Runtime guard aliases for user agency protection. */
export interface PersonaGuardContext {
  names: string[];
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
  /** Director-only player persona identity. */
  persona?: DirectorPersonaBrief;
}
