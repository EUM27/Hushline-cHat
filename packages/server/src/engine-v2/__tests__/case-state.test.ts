import { describe, expect, test } from "bun:test";

import type { CaseInquiryFrame, TurnMessage, WorldState } from "@hushline/shared";
import { recordCaseClaims } from "../case-state.js";

describe("case state", () => {
  test("records NPC testimony as claims instead of world facts", () => {
    const worldState: WorldState & { clueLedger: { discovered: string[]; hypotheses: string[] } } = {
      sessionId: "session-1",
      scenarioId: "locked-room-mystery",
      locationId: "lodge-foyer",
      backgroundId: "lodge-foyer",
      tension: 2,
      danger: 1,
      turnNumber: 3,
      characterStates: {},
      relationshipGraph: [],
      recentEvents: [],
      recentSpeakerIds: [],
      sceneMode: "dialogue",
      hasEnteredScene: true,
      mainObjective: { id: "solve", description: "진상을 밝힌다.", status: "active" },
      subObjectives: [],
      sceneInertiaCounter: 0,
      recentBeatTypes: [],
      clueLedger: { discovered: [], hypotheses: [] },
    };
    const inquiry: CaseInquiryFrame = {
      isCaseInquiry: true,
      inquiryType: "witness_testimony",
      topicTags: ["key", "table"],
      referencedEvidenceIds: [],
      referencedClaimIds: [],
      requestedTruthLevel: "testimony",
      truthLeakRisk: 1,
    };
    const messages: TurnMessage[] = [
      {
        id: "message-1",
        sessionId: "session-1",
        role: "character",
        characterId: "yoon-haeon",
        speakerLabel: "윤해온",
        content: "정전 직전 테이블 쪽에서 움직임을 본 것 같아요.",
        createdAt: "2026-05-28T00:00:00.000Z",
      },
    ];

    const updated = recordCaseClaims(worldState, messages, inquiry);

    expect(updated.claimLedger?.claims).toHaveLength(1);
    expect(updated.claimLedger?.claims[0]).toMatchObject({
      speaker: "yoon-haeon",
      claimType: "testimony",
      content: "정전 직전 테이블 쪽에서 움직임을 본 것 같아요.",
      verification: { status: "unverified" },
    });
    expect((updated as typeof worldState).clueLedger.discovered).toEqual([]);
  });
});
