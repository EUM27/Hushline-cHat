import { describe, expect, test } from "bun:test";
import type { ClientSessionState } from "@hushline/shared";
import { buildPhoneMessages } from "../src/phone-feed";

function createSession(overrides: Partial<ClientSessionState> = {}): ClientSessionState {
  return {
    id: "session-1",
    title: "백화장 살인사건",
    scenarioPackId: "school-life-anomaly",
    scenario: {
      id: "school-life-anomaly",
      title: "백화장 살인사건",
      subtitle: "3f-study",
      interventionPrompt: "무엇을 조사하시겠습니까?",
      openingBeats: [],
    },
    scene: {
      sessionId: "session-1",
      scenarioId: "school-life-anomaly",
      locationId: "3f-study",
      backgroundId: "classroom-night",
      activeSpeakerId: "advisor-1",
      tension: 3,
      danger: 2,
      turnNumber: 4,
      hasEnteredScene: true,
      recentSpeakerIds: [],
      relationships: {},
    },
    persona: {
      id: "persona-1",
      name: "유저",
      shortName: "나",
      role: "플레이어",
      mbti: "INTP",
      relationshipTags: [],
    },
    characters: [],
    messages: [],
    handouts: {},
    summaries: [],
    worldState: {
      sessionId: "session-1",
      scenarioId: "school-life-anomaly",
      sceneMode: "dialogue",
      locationId: "3f-study",
      backgroundId: "classroom-night",
      tension: 3,
      danger: 2,
      turnNumber: 4,
      hasEnteredScene: true,
      mainObjective: {
        id: "main",
        description: "탈출",
        status: "active",
        priority: "critical",
      },
      subObjectives: [],
      characterStates: {},
      relationshipGraph: [],
      recentEvents: [
        {
          id: "event-1",
          turnNumber: 3,
          type: "discovery",
          description: "3층 복도 창문 두 개가 안쪽에서 잠겨 있다.",
          involvedCharacterIds: [],
          locationId: "3f-study",
          importance: "minor",
          createdAt: "2026-05-26T05:48:00.000Z",
        },
      ],
      recentSpeakerIds: [],
    },
    createdAt: "2026-05-26T05:40:00.000Z",
    updatedAt: "2026-05-26T05:48:00.000Z",
    ...overrides,
  } as ClientSessionState;
}

describe("buildPhoneMessages", () => {
  test("derives the auxiliary phone feed from engine messages and world events without echoing main user turns", () => {
    const session = createSession();
    const visibleMessages = [
      {
        id: "narrator-1",
        sessionId: session.id,
        role: "narrator",
        content: "쾅! 쾅! 도끼날이 문을 파고들었다.",
        createdAt: "2026-05-26T05:45:00.000Z",
      },
      {
        id: "user-1",
        sessionId: session.id,
        role: "user",
        content: "문자 확인했어?",
        createdAt: "2026-05-26T05:46:00.000Z",
        inputMode: "chat",
      },
      {
        id: "advisor-1",
        sessionId: session.id,
        role: "character",
        content: "복도 쪽은 지금 피해야 해.",
        createdAt: "2026-05-26T05:47:00.000Z",
        speakerKind: "advisor-slot",
        speakerLabel: "관찰자",
      },
    ] satisfies ClientSessionState["messages"];

    const phoneMessages = buildPhoneMessages(session, visibleMessages);

    expect(phoneMessages.map((message) => message.id)).toEqual([
      "scene-sync-4",
      "phone-user-1",
      "phone-advisor-1",
      "event-event-1",
    ]);
    expect(phoneMessages.find((message) => message.text.includes("도끼날"))).toBeUndefined();
    expect(phoneMessages.find((message) => message.text.includes("문자 확인"))).toBeDefined();
    expect(phoneMessages[0]?.text).toBe("현재 위치 3f-study. 긴장 3, 위험 2.");
    expect(phoneMessages[1]).toMatchObject({ sender: "나", side: "outbound", text: "문자 확인했어?" });
    expect(phoneMessages[2]).toMatchObject({ sender: "관찰자", side: "inbound", text: "복도 쪽은 지금 피해야 해." });
    expect(phoneMessages[3]).toMatchObject({ sender: "단서", side: "system" });
  });
});
