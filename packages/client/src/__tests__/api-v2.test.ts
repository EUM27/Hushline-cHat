import { afterEach, describe, expect, test } from "bun:test";
import {
  createSessionV2,
  importCharacterCard,
  listCharacterCards,
  listPersonaProfiles,
  saveCharacterCard,
  savePersonaProfile,
  type ImportedCharacterCard,
} from "../api-v2";

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

  test("sends character overrides during session creation", async () => {
    let requestBody: unknown = null;
    globalThis.fetch = captureSessionCreate((body) => {
      requestBody = body;
    });

    await createSessionV2(
      "locked-room-mystery",
      { name: "한서윤" },
      undefined,
      undefined,
      [
        {
          targetId: "kang-mujin",
          character: {
            id: "imported-card",
            name: "백이현",
            shortName: "이현",
            role: "폭설 속 산장에 늦게 도착한 법의학자",
            mbti: "INTJ",
            autonomy: 0.72,
            ocean: {
              openness: 61,
              conscientiousness: 83,
              extraversion: 28,
              agreeableness: 39,
              neuroticism: 55,
            },
            systemPrompt: "너는 백이현이다. 감정보다 증거를 먼저 본다.",
            handout: {
              secret: "피해자를 오래전부터 알고 있었다.",
              desire: "사건 현장의 훼손을 막고 싶다.",
              objective: "시신 주변의 단서를 보존한다.",
              initialRelationshipToUser: -1,
            },
            relationships: [],
          },
        },
      ],
    );

    expect(requestBody).toMatchObject({
      scenarioPackId: "locked-room-mystery",
      persona: { name: "한서윤" },
      characterOverrides: [
        {
          targetId: "kang-mujin",
          character: {
            name: "백이현",
            shortName: "이현",
            role: "폭설 속 산장에 늦게 도착한 법의학자",
            systemPrompt: "너는 백이현이다. 감정보다 증거를 먼저 본다.",
          },
        },
      ],
    });
  });

  test("saves persona profiles and lists them from the reusable library", async () => {
    const requests: Array<{ url: string; body: unknown | null }> = [];
    globalThis.fetch = (async (input, init) => {
      requests.push({
        url: String(input),
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      if (String(input) === "/api/v2/personas" && init?.method === "POST") {
        return jsonResponse({
          persona: {
            id: "persona-1",
            label: "비 오는 밤 새 입주자",
            persona: {
              name: "정해윤",
              shortName: "해윤",
              role: "공유주택에 막 들어온 새 입주자",
              description: "경계심이 있지만 사람을 밀어내지는 않는다.",
              appearance: "비에 젖은 회색 후드와 낡은 운동화를 신고 있다.",
              portraitUrl: "https://example.test/haeyoon.png",
              relationshipTags: ["new-tenant"],
            },
            createdAt: "2026-06-02T00:00:00.000Z",
            updatedAt: "2026-06-02T00:00:00.000Z",
          },
        }, 201);
      }
      return jsonResponse({
        personas: [
          {
            id: "persona-1",
            label: "비 오는 밤 새 입주자",
            persona: {
              name: "정해윤",
              shortName: "해윤",
              role: "공유주택에 막 들어온 새 입주자",
              relationshipTags: ["new-tenant"],
            },
            createdAt: "2026-06-02T00:00:00.000Z",
            updatedAt: "2026-06-02T00:00:00.000Z",
          },
        ],
      });
    }) as typeof fetch;

    const saved = await savePersonaProfile({
      label: "비 오는 밤 새 입주자",
      persona: {
        name: "정해윤",
        shortName: "해윤",
        role: "공유주택에 막 들어온 새 입주자",
        description: "경계심이 있지만 사람을 밀어내지는 않는다.",
        appearance: "비에 젖은 회색 후드와 낡은 운동화를 신고 있다.",
        portraitUrl: "https://example.test/haeyoon.png",
        relationshipTags: ["new-tenant"],
      },
    });
    const listed = await listPersonaProfiles();

    expect(saved.id).toBe("persona-1");
    expect(listed).toHaveLength(1);
    expect(requests).toEqual([
      {
        url: "/api/v2/personas",
        body: {
          label: "비 오는 밤 새 입주자",
          persona: {
            name: "정해윤",
            shortName: "해윤",
            role: "공유주택에 막 들어온 새 입주자",
            description: "경계심이 있지만 사람을 밀어내지는 않는다.",
            appearance: "비에 젖은 회색 후드와 낡은 운동화를 신고 있다.",
            portraitUrl: "https://example.test/haeyoon.png",
            relationshipTags: ["new-tenant"],
          },
        },
      },
      {
        url: "/api/v2/personas",
        body: null,
      },
    ]);
  });

  test("saves and lists reusable character cards", async () => {
    const character = makeImportedCharacterCard();
    const sourceMetadata = makeSourceMetadata();
    const requests: Array<{ url: string; body: unknown | null }> = [];
    globalThis.fetch = (async (input, init) => {
      requests.push({
        url: String(input),
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      if (String(input) === "/api/v2/character-cards" && init?.method === "POST") {
        return jsonResponse({
          characterCard: {
            id: "card-1",
            name: "백이현",
            sourceFileName: "baek-ihyeon.json",
            sourceMetadata,
            character,
            createdAt: "2026-06-02T00:00:00.000Z",
            updatedAt: "2026-06-02T00:00:00.000Z",
          },
        }, 201);
      }
      return jsonResponse({
        characterCards: [
          {
            id: "card-1",
            name: "백이현",
            sourceFileName: "baek-ihyeon.json",
            sourceMetadata,
            character,
            createdAt: "2026-06-02T00:00:00.000Z",
            updatedAt: "2026-06-02T00:00:00.000Z",
          },
        ],
      });
    }) as typeof fetch;

    const saved = await saveCharacterCard({ character, sourceFileName: "baek-ihyeon.json", sourceMetadata });
    const listed = await listCharacterCards();

    expect(saved.id).toBe("card-1");
    expect(saved.sourceMetadata?.sourceFormat).toBe("json-v2");
    expect(listed[0]?.character.name).toBe("백이현");
    expect(listed[0]?.sourceMetadata?.creator).toBe("darkmountain");
    expect(requests).toMatchObject([
      {
        url: "/api/v2/character-cards",
        body: {
          name: "백이현",
          sourceFileName: "baek-ihyeon.json",
          sourceMetadata: {
            sourceFormat: "json-v2",
            creator: "darkmountain",
          },
          character: { name: "백이현" },
        },
      },
      {
        url: "/api/v2/character-cards",
        body: null,
      },
    ]);
  });

  test("returns character card import metadata", async () => {
    let requestBody: unknown = null;
    const character = makeImportedCharacterCard({ name: "Antonio", shortName: "Antonio" });
    const metadata = {
      ...makeSourceMetadata(),
      sourceFileName: "Antonio.json",
      sourceFormat: "json-v2" as const,
      cardSpec: "chara_card_v2",
      cardSpecVersion: "2.0",
      creator: "darkmountain",
      extensionKeys: ["janitor"],
      hasFirstMessage: true,
      alternateGreetingCount: 1,
      hasScenario: false,
      hasCharacterBook: false,
    };
    globalThis.fetch = (async (input, init) => {
      requestBody = init?.body ? JSON.parse(String(init.body)) : null;
      return jsonResponse({
        character,
        metadata,
        characterCard: {
          id: "card-antonio",
          name: "Antonio",
          sourceFileName: "Antonio.json",
          sourceMetadata: metadata,
          character,
          createdAt: "2026-06-03T00:00:00.000Z",
          updatedAt: "2026-06-03T00:00:00.000Z",
        },
      });
    }) as typeof fetch;

    const result = await importCharacterCard(
      new File([JSON.stringify({ spec: "chara_card_v2", data: { name: "Antonio" } })], "Antonio.json", {
        type: "application/json",
      }),
    );

    expect(result.character.name).toBe("Antonio");
    expect(result.metadata).toMatchObject({
      sourceFileName: "Antonio.json",
      sourceFormat: "json-v2",
      creator: "darkmountain",
      extensionKeys: ["janitor"],
    });
    expect(result.characterCard?.sourceMetadata?.cardSpec).toBe("chara_card_v2");
    expect(requestBody).toMatchObject({
      kind: "json",
      fileName: "Antonio.json",
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

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function makeImportedCharacterCard(patch: Partial<ImportedCharacterCard> = {}): ImportedCharacterCard {
  return {
    id: "imported-card",
    name: "백이현",
    shortName: "이현",
    role: "폭설 속 산장에 늦게 도착한 법의학자",
    mbti: "INTJ",
    autonomy: 0.72,
    ocean: {
      openness: 61,
      conscientiousness: 83,
      extraversion: 28,
      agreeableness: 39,
      neuroticism: 55,
    },
    systemPrompt: "너는 백이현이다. 감정보다 증거를 먼저 본다.",
    relationshipTags: ["evidence-first"],
    handout: {
      secret: "피해자를 오래전부터 알고 있었다.",
      desire: "사건 현장의 훼손을 막고 싶다.",
      objective: "시신 주변의 단서를 보존한다.",
      initialRelationshipToUser: -1,
    },
    relationships: [],
    ...patch,
  };
}

function makeSourceMetadata() {
  return {
    sourceFileName: "baek-ihyeon.json",
    sourceFormat: "json-v2" as const,
    cardSpec: "chara_card_v2",
    cardSpecVersion: "2.0",
    creator: "darkmountain",
    extensionKeys: ["janitor"],
    hasFirstMessage: true,
    alternateGreetingCount: 0,
    hasScenario: false,
    hasCharacterBook: false,
  };
}
