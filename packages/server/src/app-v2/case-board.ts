// ──────────────────────────────────────────────
// Engine v2 — Case Board builder (player-safe)
// ──────────────────────────────────────────────
// Projects worldState + scenario pack into a player-facing CaseBoardView.
// HARD INVARIANT: hidden-truth facts (category "hidden_truth" or anything
// in the hidden-truth vault) must NEVER appear in the board.
// ──────────────────────────────────────────────

import type {
  CaseBoardClue,
  CaseBoardContradiction,
  CaseBoardDeduction,
  CaseBoardDossier,
  CaseBoardOpenQuestion,
  CaseBoardStatement,
  CaseBoardView,
  CaseFact,
  Claim,
  ContradictionRecord,
  ScenarioPack,
  SessionStateV2,
} from "@hushline/shared";
import { getHiddenTruthIds } from "../engine-v2/case-knowledge.js";

function isContradictionRecord(value: unknown): value is ContradictionRecord {
  return Boolean(
    value
    && typeof value === "object"
    && "id" in value
    && "claimAId" in value
    && "conflictType" in value,
  );
}

function mapClaimStatus(claim: Claim): CaseBoardStatement["status"] {
  const status = claim.verificationStatus ?? claim.verification?.status ?? "unverified";
  switch (status) {
    case "confirmed":
    case "supported":
      return "supported";
    case "contradicted":
    case "false":
      return "contradicted";
    case "partially_true":
      return "partially_true";
    default:
      return "unverified";
  }
}

/**
 * Build a player-safe case board. Returns an empty (non-case) board when the
 * pack has no case knowledge layer.
 */
export function buildCaseBoard(session: SessionStateV2, pack?: ScenarioPack): CaseBoardView {
  const caseKnowledge = pack?.caseKnowledge;
  if (!caseKnowledge) {
    return {
      isCaseScenario: false,
      clues: [],
      statements: [],
      contradictions: [],
      openQuestions: [],
      deductions: [],
      dossiers: buildDossiers(session, []),
    };
  }

  const hiddenTruthIds = new Set(getHiddenTruthIds(caseKnowledge));
  const isSafe = (fact: Pick<CaseFact, "id" | "category">): boolean =>
    fact.category !== "hidden_truth"
    && fact.category !== "solution"
    && !hiddenTruthIds.has(fact.id);

  // ── Clues: progressive ledger — only facts actually revealed during play ──
  // Build an index of every player-safe fact, then surface only those recorded
  // in worldState.revealedCaseFacts (monotonic; populated by the turn pipeline).
  interface IndexedFact {
    text: string;
    tags: string[];
    source: CaseBoardClue["source"];
  }
  const factIndex = new Map<string, IndexedFact>();

  const briefingFacts = caseKnowledge.briefing?.publicSummary ?? [];
  for (const fact of briefingFacts) {
    if (!isSafe(fact) || factIndex.has(fact.id)) continue;
    factIndex.set(fact.id, { text: fact.text, tags: fact.tags ?? [], source: "briefing" });
  }
  for (const fact of caseKnowledge.publicFacts) {
    if (!isSafe(fact) || factIndex.has(fact.id)) continue;
    factIndex.set(fact.id, {
      text: fact.text,
      tags: fact.tags ?? [],
      source: fact.category === "briefing" ? "briefing" : "public",
    });
  }
  for (const fact of caseKnowledge.observableFacts) {
    if (!isSafe(fact) || factIndex.has(fact.id)) continue;
    factIndex.set(fact.id, { text: fact.text, tags: fact.tags ?? [], source: "observed" });
  }

  const revealedCaseFacts = session.worldState.revealedCaseFacts ?? {};
  const clues: CaseBoardClue[] = Object.entries(revealedCaseFacts)
    .map(([factId, turn]): CaseBoardClue | null => {
      if (hiddenTruthIds.has(factId)) return null;
      const indexed = factIndex.get(factId);
      if (!indexed) return null;
      return {
        id: factId,
        text: indexed.text,
        source: indexed.source,
        tags: indexed.tags,
        knownSinceTurn: turn,
      };
    })
    .filter((clue): clue is CaseBoardClue => clue !== null)
    .sort((a, b) => a.knownSinceTurn - b.knownSinceTurn);

  // ── Statements: claims from the ledger (already boundary-gated NPC output) ──
  const claims = session.worldState.claimLedger?.claims ?? [];
  const labelFor = (speakerId: string): string => {
    if (speakerId === "user") return session.persona.name;
    const character = session.characters.find((c) => c.id === speakerId);
    return character?.anonymousLabel ?? character?.name ?? speakerId;
  };
  const statements: CaseBoardStatement[] = claims.map((claim) => {
    const speakerId = claim.speakerId ?? claim.speaker;
    return {
      id: claim.id,
      speakerId,
      speakerLabel: labelFor(speakerId),
      content: claim.content,
      turn: claim.turnNumber ?? claim.turn,
      claimType: claim.claimType,
      status: mapClaimStatus(claim),
    };
  });

  // ── Contradictions: only those the player has noticed ──
  const rawContradictions = session.worldState.claimLedger?.contradictions ?? [];
  const contradictions: CaseBoardContradiction[] = rawContradictions
    .filter(isContradictionRecord)
    .filter((record) => record.playerNoticed)
    .map((record) => ({
      id: record.id,
      conflictType: record.conflictType,
      statementIds: [record.claimAId, record.claimBId].filter((id): id is string => Boolean(id)),
      detectedAtTurn: record.detectedAtTurn,
      severity: record.severity,
    }));

  // ── Open questions: ambiguous facts the player has at least noticed ──
  const openQuestions: CaseBoardOpenQuestion[] = (session.worldState.ambiguousFacts ?? [])
    .filter((fact) => fact.playerVisibleStatus !== "unnoticed")
    .map((fact) => ({
      id: fact.id,
      text: fact.text,
      tags: fact.topicTags ?? [],
      status: fact.playerVisibleStatus as CaseBoardOpenQuestion["status"],
    }));

  // ── Deductions: player's attempts with safe verdicts ──
  const deductions: CaseBoardDeduction[] = (session.worldState.playerDeductionAttempts ?? []).map((attempt) => ({
    id: attempt.id,
    turn: attempt.turnNumber,
    claim: attempt.playerClaim,
    verdict: attempt.validationResult?.verdict ?? "insufficient",
    score: attempt.validationResult?.score ?? 0,
  }));

  return {
    isCaseScenario: true,
    ...(caseKnowledge.briefing?.title ? { caseTitle: caseKnowledge.briefing.title } : {}),
    clues,
    statements,
    contradictions,
    openQuestions,
    deductions,
    dossiers: buildDossiers(session, statements),
  };
}

function buildDossiers(session: SessionStateV2, statements: CaseBoardStatement[]): CaseBoardDossier[] {
  const encountered = session.worldState.encounteredCharacters ?? {};
  const statementSpeakers = new Set(statements.map((statement) => statement.speakerId));

  // Progressive: only show characters the player has met (encountered) or that have
  // contributed a statement. Sort by first-seen turn, then definition order.
  return session.characters
    .filter((character) => encountered[character.id] !== undefined || statementSpeakers.has(character.id))
    .sort((a, b) => {
      const seenA = encountered[a.id] ?? Number.POSITIVE_INFINITY;
      const seenB = encountered[b.id] ?? Number.POSITIVE_INFINITY;
      if (seenA !== seenB) return seenA - seenB;
      return session.characters.indexOf(a) - session.characters.indexOf(b);
    })
    .map((character) => {
      const state = session.worldState.characterStates[character.id];
      const statementIds = statements
        .filter((statement) => statement.speakerId === character.id)
        .map((statement) => statement.id);
      return {
        characterId: character.id,
        displayName: character.anonymousLabel ?? character.name,
        role: character.role,
        surfaceTags: character.handout.surfacePersonality ?? character.relationshipTags ?? [],
        relationshipToUser: state?.relationshipToUser ?? character.handout.initialRelationshipToUser,
        revealed: state?.isRevealed ?? false,
        statementIds,
      };
    });
}
