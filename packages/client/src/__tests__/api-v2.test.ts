import { afterEach, describe, expect, test } from "bun:test";
import { createSessionV2 } from "../api-v2";

describe("client api-v2", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("sends expanded persona objects during session creation", async () => {
    let requestBody: unknown = null;
    globalThis.fetch = captureSessionCreate((body) => {
      requestBody = body;
    });

    await createSessionV2("shared-house-romance", {
      name: "정해윤",
      shortName: "해윤",
      role: "공유주택에 막 들어온 새 입주자",
      description: "경계심이 있지만 사람을 밀어내지는 않는다.",
      appearance: "비에 젖은 회색 후드와 낡은 운동화를 신고 있다.",
      relationshipTags: ["new-tenant", "keeps-distance"],
    });

    expect(requestBody).toEqual({
      scenarioPackId: "shared-house-romance",
      persona: {
        name: "정해윤",
        shortName: "해윤",
        role: "공유주택에 막 들어온 새 입주자",
        description: "경계심이 있지만 사람을 밀어내지는 않는다.",
        appearance: "비에 젖은 회색 후드와 낡은 운동화를 신고 있다.",
        relationshipTags: ["new-tenant", "keeps-distance"],
      },
    });
  });

  test("trims empty relationship tags before creating a session", async () => {
    let requestBody: unknown = null;
    globalThis.fetch = captureSessionCreate((body) => {
      requestBody = body;
    });

    await createSessionV2("shared-house-romance", {
      name: "정해윤",
      relationshipTags: [" new-tenant ", "", " keeps-distance "],
    });

    expect(requestBody).toEqual({
      scenarioPackId: "shared-house-romance",
      persona: {
        name: "정해윤",
        relationshipTags: ["new-tenant", "keeps-distance"],
      },
    });
  });

  test("keeps the name-only session creation path compatible", async () => {
    let requestBody: unknown = null;
    globalThis.fetch = captureSessionCreate((body) => {
      requestBody = body;
    });

    await createSessionV2("school-life-anomaly", "정해윤");

    expect(requestBody).toEqual({
      scenarioPackId: "school-life-anomaly",
      persona: { name: "정해윤" },
    });
  });
});

function captureSessionCreate(onBody: (body: unknown) => void): typeof fetch {
  return (async (_input, init) => {
    onBody(JSON.parse(String(init?.body ?? "{}")));
    return new Response(
      JSON.stringify({
        session: {
          id: "session-1",
          persona: { id: "user", name: "정해윤", shortName: "해윤", role: "", mbti: "unspecified", relationshipTags: [] },
          scene: { sessionId: "session-1", scenarioId: "test", locationId: "test", backgroundId: "test", activeSpeakerId: null, tension: 0, danger: 0, turnNumber: 0, hasEnteredScene: false, recentSpeakerIds: [], relationships: {} },
          scenario: { id: "test", title: "test", subtitle: "", description: "", spaceRules: [], chatRules: [], toneRules: [], hardNos: [], backgroundIds: [], initialLocationId: "test", initialBackgroundId: "test", interventionPrompt: "", openingBeats: [] },
          characters: [],
          messages: [],
          worldState: {},
          handouts: {},
          summaries: [],
          scenarioPackId: "test",
          title: "test",
          createdAt: "2026-06-01T00:00:00.000Z",
          updatedAt: "2026-06-01T00:00:00.000Z",
        },
      }),
      { status: 201, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
}
