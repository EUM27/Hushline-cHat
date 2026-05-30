import { describe, expect, test } from "bun:test";
import { toClientSession } from "../session-presenter";
import type { ScenarioPack, SessionStateV2 } from "@hushline/shared";

describe("app-v2 session presenter", () => {
  test("adds v1-compatible client fields without dropping canonical v2 state", () => {
    const session = {
      id: "session-1",
      scenarioPackId: "school-life-anomaly",
      title: "Fallback title",
      persona: {
        id: "user",
        name: "정해원",
        shortName: "해원",
      },
      worldState: {
        sessionId: "session-1",
        scenarioId: "school-life-anomaly",
        locationId: "room-1",
        backgroundId: "bg-1",
        sceneMode: "messenger",
        activeObjectiveId: "main",
        completedObjectiveIds: [],
        failedObjectiveIds: [],
        subObjectives: [],
        relationshipGraph: [],
        characterStates: {
          "advisor-1": {
            relationshipToUser: -2,
          },
        },
        recentSpeakerIds: ["advisor-1"],
        tension: 3,
        danger: 1,
        turnNumber: 7,
        hasEnteredScene: true,
        knownFacts: [],
        publicFacts: [],
        privatelyKnownFacts: {},
        eventLog: [],
      },
      characters: [
        {
          id: "advisor-1",
          name: "[익명 1]",
          shortName: "익명 1",
          role: "위험을 먼저 짚는 조언자",
          profileKind: "advisor-slot",
          anonymousLabel: "[익명 1]",
          mbti: "ISTP",
          ocean: {
            openness: 52,
            conscientiousness: 76,
            extraversion: 34,
            agreeableness: 46,
            neuroticism: 68,
          },
          systemPrompt: "위험 규칙 우선",
          autonomy: 0.55,
          handout: {
            secret: "문틈 규칙을 알고 있다.",
            desire: "사용자가 실수하지 않게 만든다.",
            objective: "팻말을 확인하게 만든다.",
            initialRelationshipToUser: -2,
            surfacePersonality: ["경고가 빠르다"],
          },
          relationships: [],
        },
      ],
      messages: [],
      handouts: {},
      summaries: [],
      createdAt: "2026-05-29T00:00:00.000Z",
      updatedAt: "2026-05-29T00:00:00.000Z",
    } as unknown as SessionStateV2;

    const scenarioPack = {
      manifest: {
        id: "school-life-anomaly-chat",
        title: "학교생활",
        version: "1.0.0",
        engineVersion: "2",
        uiMode: "messenger-first",
        scenarioCard: "scenario.json",
        characters: [],
        directorPrompt: "director.md",
        narratorPrompt: "narrator.md",
      },
      scenarioCard: {
        id: "school-life-anomaly",
        title: "학교생활",
        subtitle: "이상공간 단톡방",
        description: "닫힌 교실",
        spaceRules: ["규칙 확인"],
        chatRules: ["대리 금지"],
        toneRules: ["짧게"],
        hardNos: [],
        backgroundIds: ["bg-1"],
        initialLocationId: "room-1",
        initialBackgroundId: "bg-1",
        initialSceneMode: "messenger",
        uiMode: "messenger-first",
        interventionPrompt: "눈앞에 몇 반 팻말 보여?",
        openingBeats: [],
      },
    } as unknown as ScenarioPack;

    const clientSession = toClientSession(session, scenarioPack);

    expect(clientSession.worldState.sessionId).toBe("session-1");
    expect(clientSession.scene.sessionId).toBe("session-1");
    expect(clientSession.scene.activeSpeakerId).toBe("advisor-1");
    expect(clientSession.scene.relationships["advisor-1"]).toBe(-2);
    expect(clientSession.scenario.title).toBe("학교생활");
    expect(clientSession.scenario.uiMode).toBe("messenger-first");
    expect(clientSession.persona.role).toBe("");
    expect(clientSession.characters[0]?.model).toBe("dry-run/advisor-1");
    expect(clientSession.characters[0]?.relationshipTags).toEqual(["경고가 빠르다"]);
  });
});
