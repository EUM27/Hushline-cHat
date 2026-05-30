import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import type { ScenarioPack, SessionStateV2 } from "@hushline/shared";
import { loadScenarioPack, createInitialWorldState } from "../../engine-v2/index.js";
import { buildCaseBoard } from "../case-board.js";
import { recordRevealedCaseFacts } from "../../engine-v2/case-state.js";
import { getHiddenTruthIds } from "../../engine-v2/case-knowledge.js";

const scenariosDir = resolve(import.meta.dir, "../../../scenarios");

function loadPack(packId: string): ScenarioPack {
  const result = loadScenarioPack(resolve(scenariosDir, packId));
  if (!result.success) {
    throw new Error(`failed to load pack ${packId}: ${JSON.stringify(result.errors)}`);
  }
  return result.pack;
}

function makeSession(pack: ScenarioPack): SessionStateV2 {
  const sessionId = "test-session";
  const worldState = createInitialWorldState(sessionId, pack);
  return {
    id: sessionId,
    scenarioPackId: pack.manifest.id,
    title: pack.manifest.title,
    persona: { id: "user", name: "한서윤", shortName: "한서윤" },
    worldState,
    characters: pack.characters,
    messages: [],
    handouts: {},
    summaries: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe("buildCaseBoard", () => {
  test("non-case scenario returns an empty case board and no dossiers until encountered", () => {
    const pack = loadPack("school-life-anomaly");
    const session = makeSession(pack);
    const board = buildCaseBoard(session, pack);

    expect(board.isCaseScenario).toBe(false);
    expect(board.clues).toHaveLength(0);
    expect(board.statements).toHaveLength(0);
    // Progressive: nobody encountered yet → empty dossier list.
    expect(board.dossiers).toHaveLength(0);
  });

  test("mystery scenario starts with an empty clue ledger and no dossiers", () => {
    const pack = loadPack("locked-room-mystery");
    const session = makeSession(pack);
    const board = buildCaseBoard(session, pack);

    expect(board.isCaseScenario).toBe(true);
    // Progressive reveal: nothing investigated, nobody met yet.
    expect(board.clues).toHaveLength(0);
    expect(board.dossiers).toHaveLength(0);
  });

  test("dossiers appear only for encountered characters, ordered by first-seen turn", () => {
    const pack = loadPack("locked-room-mystery");
    const session = makeSession(pack);
    session.worldState.encounteredCharacters = {
      "yoon-haeon": 3,
      "kang-mujin": 1,
    };

    const board = buildCaseBoard(session, pack);
    const ids = board.dossiers.map((d) => d.characterId);

    expect(ids).toEqual(["kang-mujin", "yoon-haeon"]);
    expect(ids).not.toContain("yoon-seha"); // never encountered
  });

  test("a character that contributed a statement appears even without an encounter record", () => {
    const pack = loadPack("locked-room-mystery");
    const session = makeSession(pack);
    session.worldState.claimLedger = {
      claims: [
        {
          id: "claim-x",
          speaker: "yoon-seha",
          speakerId: "yoon-seha",
          turn: 2,
          turnNumber: 2,
          content: "그 시각 나는 주방에 있었다.",
          claimType: "alibi",
          verification: { status: "unverified", contradictedBy: [], supportedBy: [] },
          userStance: "unknown",
          references: [],
        },
      ],
      contradictions: [],
    };

    const board = buildCaseBoard(session, pack);
    expect(board.dossiers.map((d) => d.characterId)).toContain("yoon-seha");
  });

  test("clues fill in only after facts are revealed during play (monotonic, ordered)", () => {
    const pack = loadPack("locked-room-mystery");
    const session = makeSession(pack);

    // Simulate facts revealed across turns via the accumulated ledger.
    const publicId = pack.caseKnowledge!.publicFacts[0]!.id;
    const observableId = pack.caseKnowledge!.observableFacts[0]!.id;
    session.worldState.revealedCaseFacts = {
      [publicId]: 1,
      [observableId]: 3,
    };

    const board = buildCaseBoard(session, pack);

    expect(board.clues.map((clue) => clue.id)).toEqual([publicId, observableId]);
    expect(board.clues[0]?.knownSinceTurn).toBe(1);
    expect(board.clues[1]?.knownSinceTurn).toBe(3);
    // observable fact surfaces with the "observed" source label.
    expect(board.clues[1]?.source).toBe("observed");
  });

  test("NEVER leaks hidden-truth facts into any board section", () => {
    const pack = loadPack("locked-room-mystery");
    const hiddenTruthIds = new Set(getHiddenTruthIds(pack.caseKnowledge));
    expect(hiddenTruthIds.size).toBeGreaterThan(0);

    const session = makeSession(pack);
    // Simulate a ledger that (incorrectly) recorded a hidden truth id plus a safe fact —
    // the board must still filter the hidden truth out.
    session.worldState.revealedCaseFacts = {
      "fact_key_not_accounted_for": 2,
    };
    for (const hiddenId of hiddenTruthIds) {
      session.worldState.revealedCaseFacts[hiddenId] = 1;
    }
    // Also simulate a snapshot that tries to reveal hidden ids (legacy path).
    session.worldState.sceneSnapshots = [
      {
        id: "snap-1",
        sessionId: session.id,
        turnNumber: 1,
        locationId: session.worldState.locationId,
        sceneMode: session.worldState.sceneMode,
        revealedFactIds: [...hiddenTruthIds, "fact_key_not_accounted_for"],
        revealedClueIds: [],
        registeredClaims: [],
        propagatedClaims: [],
        contradictionCandidates: [],
        confirmedContradictions: [],
        ambiguousFactIds: [],
        npcKnowledgeDigest: {},
        npcTrustLevels: {},
        playerHypotheses: [],
        playerDeductionAttempts: [],
        currentRevealBudget: { perFact: {} },
        publicSummaryCache: { safeCaseSummary: "", lastUpdatedTurn: 1 },
      },
    ];

    const board = buildCaseBoard(session, pack);
    const allClueIds = board.clues.map((clue) => clue.id);
    for (const hiddenId of hiddenTruthIds) {
      expect(allClueIds).not.toContain(hiddenId);
    }
    // The safe fact still surfaces.
    expect(allClueIds).toContain("fact_key_not_accounted_for");

    // Hidden-truth prose must not appear anywhere serialized either.
    const serialized = JSON.stringify(board);
    expect(serialized).not.toContain("HIDDEN_TRUTH_REDACTED");
  });

  test("only player-noticed contradictions and surfaced questions appear", () => {
    const pack = loadPack("locked-room-mystery");
    const session = makeSession(pack);

    session.worldState.claimLedger = {
      claims: [
        {
          id: "claim-a",
          speaker: "kang-mujin",
          speakerId: "kang-mujin",
          turn: 1,
          turnNumber: 1,
          content: "정전 때 나는 라운지에 없었다.",
          claimType: "alibi",
          verification: { status: "unverified", contradictedBy: [], supportedBy: [] },
          userStance: "unknown",
          references: [],
        },
      ],
      contradictions: [
        {
          id: "contra-noticed",
          claimAId: "claim-a",
          claimBId: "claim-b",
          conflictType: "alibi_conflict",
          severity: 2,
          detectedAtTurn: 2,
          detectedBy: "engine",
          playerNoticed: true,
          playerPresentedEvidenceIds: [],
          playerPresentedClaimIds: [],
          involvedNpcIds: ["kang-mujin"],
          status: "candidate",
          npcReaction: {},
        },
        {
          id: "contra-hidden",
          claimAId: "claim-a",
          conflictType: "timeline_conflict",
          severity: 1,
          detectedAtTurn: 2,
          detectedBy: "engine",
          playerNoticed: false,
          playerPresentedEvidenceIds: [],
          playerPresentedClaimIds: [],
          involvedNpcIds: ["kang-mujin"],
          status: "candidate",
          npcReaction: {},
        },
      ],
    };

    const board = buildCaseBoard(session, pack);
    expect(board.statements.map((s) => s.id)).toContain("claim-a");
    expect(board.statements[0]?.speakerLabel).toBeTruthy();
    expect(board.contradictions.map((c) => c.id)).toEqual(["contra-noticed"]);
  });
});

describe("recordRevealedCaseFacts", () => {
  test("adds new facts and preserves the first-revealed turn", () => {
    const t1 = recordRevealedCaseFacts(undefined, ["fact_a"], new Set(), 1);
    expect(t1).toEqual({ fact_a: 1 });

    // Re-revealing fact_a at turn 4 must not overwrite its turn; fact_b is new.
    const t4 = recordRevealedCaseFacts(t1, ["fact_a", "fact_b"], new Set(), 4);
    expect(t4).toEqual({ fact_a: 1, fact_b: 4 });
  });

  test("never records hidden-truth fact ids", () => {
    const result = recordRevealedCaseFacts(
      undefined,
      ["fact_ok", "truth_killer_identity"],
      new Set(["truth_killer_identity"]),
      2,
    );
    expect(result).toEqual({ fact_ok: 2 });
  });
});
