import type { SceneMode } from "./base.js";
import type {
  CaseAllowedWitness,
  CaseAnswerScope,
  CaseInquiryFrame,
  CaseInquiryType,
  CaseRevealPermission,
  DeductionValidationResult,
  FactId,
  LocationId,
  NarratorScope,
  NpcId,
  ObjectId,
  RevealPermissions,
} from "./case.js";
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
