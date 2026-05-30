import type { SceneMode } from "./base.js";
import type { CaseKnowledge, SceneOccurrenceDevice } from "./case.js";
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
  /** Optional scene occurrence devices used by the SceneBeatGenerator for anti-stall pacing. */
  sceneDevices?: SceneOccurrenceDevice[];
}
