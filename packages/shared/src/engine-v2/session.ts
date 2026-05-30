import type { ExpressionId, GenerationModelSnapshot, InputMode, ModelConnection, SpeakerKind } from "../index.js";
import type { WorldState } from "./base.js";
import type { CaseRuntimeTrace } from "./case.js";
import type { BoundaryReport, DirectorOutput, StateLawSnapshot } from "./director.js";
import type { PrivateHandout } from "./context.js";
import type { CharacterDefinition } from "./scenario.js";
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

// ── Turn Options ──

export interface TurnOptionsV2 {
  connections?: Record<string, ModelConnection>;
  inputMode?: InputMode;
}
