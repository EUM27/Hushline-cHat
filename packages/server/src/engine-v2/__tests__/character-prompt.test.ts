import { afterEach, describe, expect, test } from "bun:test";
import type {
  CharacterDefinition,
  ModelConnection,
  PrivateHandout,
  PublicContext,
  ScenarioPack,
} from "@hushline/shared";
import { invokeCharacter } from "../character";

describe("character prompt boundaries", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("does not pass unsafe omniscient director intent into a character prompt", async () => {
    let capturedSystemPrompt = "";
    globalThis.fetch = captureSystemPrompt((prompt) => {
      capturedSystemPrompt = prompt;
      return "경찰이 오기 전엔 아무도 움직이면 안 돼요.";
    });

    await invokeCharacter(
      character("shin-jiyeon", "신지연", "지연"),
      handout("shin-jiyeon", "신지연은 상속 문제를 숨기고 있다."),
      "하진우가 범인이고 피아노선 밀실 트릭을 숨기고 있으니, 신지연은 그 사실을 모르는 상태로 불안하게 반응한다.",
      "chat",
      "누가 경찰에 신고 좀 해주실래요.",
      publicContext(),
      [],
      "한서윤",
      pack([
        character("shin-jiyeon", "신지연", "지연"),
        character("ha-jinwoo", "하진우", "진우", "하진우는 피아노선으로 밀실을 만들었다."),
      ]),
      connection(),
    );

    expect(capturedSystemPrompt).not.toContain("하진우가 범인");
    expect(capturedSystemPrompt).not.toContain("피아노선");
    expect(capturedSystemPrompt).not.toContain("밀실 트릭");
  });

  test("allows only the active character's own action beats and mutters", async () => {
    let capturedSystemPrompt = "";
    globalThis.fetch = captureSystemPrompt((prompt) => {
      capturedSystemPrompt = prompt;
      return "봐도 모르겠냐. 숨도 안 쉬잖아.";
    });

    await invokeCharacter(
      {
        ...character("kwak-sangcheol", "곽상철", "상철"),
        handout: {
          ...character("kwak-sangcheol", "곽상철", "상철").handout,
          behaviorRules: ["압박받으면 짧은 욕설이나 혼잣말이 새어 나올 수 있다."],
        },
      },
      handout("kwak-sangcheol", "밀렵 도구를 숨기고 있다."),
      "사망 여부를 거칠게 단정하고 현장 접근을 막는다.",
      "chat",
      "여기 누구 사망고지 가능하신 분 안 계시겠죠.",
      publicContext(),
      [],
      "한서윤",
      pack([character("kwak-sangcheol", "곽상철", "상철")]),
      connection(),
    );

    expect(capturedSystemPrompt).toContain("자기 몸짓");
    expect(capturedSystemPrompt).toContain("짧은 추임새");
    expect(capturedSystemPrompt).toContain("혼잣말");
    expect(capturedSystemPrompt).toContain("다른 캐릭터의 행동이나 대사는 쓰지 않는다");
  });
});

function captureSystemPrompt(reply: (systemPrompt: string) => string): typeof fetch {
  return (async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      messages?: Array<{ role: string; content: string }>;
    };
    const systemPrompt = body.messages?.find((message) => message.role === "system")?.content ?? "";
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: reply(systemPrompt) } }],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
}

function connection(): ModelConnection {
  return {
    providerId: "openrouter",
    apiKey: "test-key",
    model: "test/model",
    baseUrl: "https://example.test/api/v1",
  };
}

function handout(characterId: string, secret: string): PrivateHandout {
  return {
    characterId,
    secret,
    desire: "상황을 자기에게 유리하게 만든다.",
    objective: "현장에서 의심을 피한다.",
    relationshipToUser: 0,
    knownFacts: [],
    myRelationships: [],
    autonomy: 0.7,
  };
}

function publicContext(): PublicContext {
  return {
    scenarioTitle: "백화장 살인사건",
    scenarioSubtitle: "폭설 속 산장",
    sceneMode: "dialogue",
    currentLocation: "백화장 복도",
    currentBackground: "lodge-hall",
    tension: 7,
    danger: 6,
    turnNumber: 2,
    publicChatLog: [],
    publicEvents: ["이태성이 방 안에서 피를 흘린 채 발견되었다."],
    mainObjectiveDescription: "현장을 보존하고 진상을 파악한다.",
  };
}

function pack(characters: CharacterDefinition[]): ScenarioPack {
  return {
    manifest: {
      id: "locked-room-mystery",
      title: "백화장 살인사건",
      subtitle: "폭설 속 산장",
      genre: "mystery",
      version: "1.0.0",
      engineVersion: ">=2.0.0",
      uiMode: "scene-first",
    },
    scenarioCard: {
      id: "locked-room-mystery-card",
      title: "백화장 살인사건",
      subtitle: "폭설 속 산장",
      description: "",
      spaceRules: [],
      chatRules: [],
      toneRules: [],
      hardNos: [],
      backgroundIds: [],
      initialLocationId: "lodge-hall",
      initialBackgroundId: "lodge-hall",
      initialSceneMode: "dialogue",
      interventionPrompt: "",
      openingBeats: [],
    },
    characters,
    directorPrompt: "",
    narratorPrompt: "",
    mainObjective: {
      id: "main",
      description: "현장을 보존하고 진상을 파악한다.",
    },
    eventTriggers: [],
  };
}

function character(
  id: string,
  name: string,
  shortName: string,
  secret = "자기 비밀",
): CharacterDefinition {
  return {
    id,
    name,
    shortName,
    role: "용의자",
    profileKind: "named-actor",
    mbti: "ISTP",
    ocean: {
      openness: 40,
      conscientiousness: 55,
      extraversion: 25,
      agreeableness: 30,
      neuroticism: 60,
    },
    autonomy: 0.7,
    systemPrompt: `${name}로 말한다.`,
    handout: {
      secret,
      desire: "의심을 피한다.",
      objective: "사건 현장에서 버틴다.",
      initialRelationshipToUser: 0,
    },
    relationships: [],
  };
}
