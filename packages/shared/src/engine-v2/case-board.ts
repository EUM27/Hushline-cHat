// ──────────────────────────────────────────────
// Engine v2 — Case Board (player-facing projection)
// ──────────────────────────────────────────────
// A player-safe view of the case state. NEVER contains hidden-truth
// prose, solution graphs, or omniscient data. Built server-side from
// worldState + scenario pack public/observable layers only.
// ──────────────────────────────────────────────

import type { CaseInquiryType } from "./case.js";

/** A clue the player has legitimately learned (briefing, public, or revealed observable). */
export interface CaseBoardClue {
  id: string;
  text: string;
  /** Coarse origin label for grouping in the UI. */
  source: "briefing" | "public" | "observed" | "testimony";
  tags: string[];
  /** Turn at which this clue first became visible to the player (0 = from start). */
  knownSinceTurn: number;
}

/** A public statement made by an NPC or the user during play. */
export interface CaseBoardStatement {
  id: string;
  /** speaker id (character id) or "user". */
  speakerId: string;
  speakerLabel: string;
  content: string;
  turn: number;
  claimType: string;
  /** Verification surface the player can perceive (never reveals hidden truth). */
  status: "unverified" | "supported" | "contradicted" | "partially_true";
}

/** A contradiction the player has noticed between statements/facts. */
export interface CaseBoardContradiction {
  id: string;
  conflictType: string;
  /** Statement ids involved, for cross-referencing in the UI. */
  statementIds: string[];
  detectedAtTurn: number;
  severity: 0 | 1 | 2 | 3;
}

/** An open question / ambiguity that has surfaced to the player. */
export interface CaseBoardOpenQuestion {
  id: string;
  text: string;
  tags: string[];
  status: "noticed" | "contested" | "nearly_resolved" | "resolved";
}

/** A deduction the player attempted, with the engine's safe verdict. */
export interface CaseBoardDeduction {
  id: string;
  turn: number;
  claim: string;
  verdict:
    | "not_a_deduction"
    | "insufficient"
    | "partially_correct"
    | "correct"
    | "wrong_conclusion"
    | "overreached";
  score: number;
}

/** Per-NPC dossier entry — surface info + what they have publicly said. */
export interface CaseBoardDossier {
  characterId: string;
  displayName: string;
  role: string;
  /** Surface personality / relationship tags safe to show. */
  surfaceTags: string[];
  /** Player-perceived relationship/trust toward the user (-10..10). */
  relationshipToUser: number;
  /** Whether this character's true identity/role has been revealed in play. */
  revealed: boolean;
  /** Statement ids this character contributed, newest last. */
  statementIds: string[];
}

export interface CaseBoardView {
  /** True when the scenario pack carries a mystery case layer. */
  isCaseScenario: boolean;
  caseTitle?: string;
  clues: CaseBoardClue[];
  statements: CaseBoardStatement[];
  contradictions: CaseBoardContradiction[];
  openQuestions: CaseBoardOpenQuestion[];
  deductions: CaseBoardDeduction[];
  dossiers: CaseBoardDossier[];
  /** Last inquiry type the engine routed (for subtle UI hinting). */
  lastInquiryType?: CaseInquiryType;
}
