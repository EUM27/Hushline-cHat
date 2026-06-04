import { afterEach, describe, expect, test } from "bun:test";
import type {
  CharacterDefinition,
  ModelConnection,
  PrivateHandout,
  PublicContext,
  ScenarioPack,
  SessionStateV2,
} from "@hushline/shared";
import { buildCharacterPersonaBrief } from "../context-builder";
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

  test("separates mixed user input from dialogue-only character output", async () => {
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
      "\"여기 누구 사망고지 가능하신 분 안 계시겠죠.\" 나는 휴대폰을 든 채 뒤로 물러섰다.",
      publicContext(),
      [],
      "한서윤",
      pack([character("kwak-sangcheol", "곽상철", "상철")]),
      connection(),
    );

    expect(capturedSystemPrompt).toContain("사용자 입력에는 대사와 행동 지문이 섞일 수 있다.");
    expect(capturedSystemPrompt).toContain("그 형식을 따라 하지 않는다.");
    expect(capturedSystemPrompt).toContain("최종 출력은 \"실제 발화\" 또는 '짧은 내면 반응'만 쓴다.");
    expect(capturedSystemPrompt).toContain("실제 입 밖으로 말한 대사는 반드시 큰따옴표로 감싼다");
    expect(capturedSystemPrompt).toContain("입 밖으로 말하지 않은 생각은 반드시 작은따옴표로 감싼다");
    expect(capturedSystemPrompt).toContain("사용자가 하지 않은 제안, 의도, 결정, 행동을 전제로 반응하지 않는다.");
    expect(capturedSystemPrompt).toContain("\"갇혀 있다\"는 말을 \"나가자\"는 제안으로 바꾸지 않는다.");
    expect(capturedSystemPrompt).toContain("[Perception Boundary — HARD]");
    expect(capturedSystemPrompt).toContain("Do not react to text the character cannot see.");
    expect(capturedSystemPrompt).toContain("Unheard information remains unheard.");
    expect(capturedSystemPrompt).toContain("Do not treat user actions that have not happened as completed.");
    expect(capturedSystemPrompt).toContain("[Private Thought Safety — HARD]");
    expect(capturedSystemPrompt).toContain("Private thoughts are not a channel for revealing secrets, evidence, solution logic, or avoidance strategy.");
    expect(capturedSystemPrompt).toContain("Never mention what has not been brought up yet in order to steer the user away from it.");
    expect(capturedSystemPrompt).not.toContain("자기 몸짓");
    expect(capturedSystemPrompt).not.toContain("짧은 추임새");
    expect(capturedSystemPrompt).toContain("혼잣말");
    expect(capturedSystemPrompt).toContain("다른 캐릭터의 행동이나 대사는 쓰지 않는다");
    expect(capturedSystemPrompt).toContain("무리하게 점잖게 정제하지 않는다");
  });

  test("injects answer scope into character prompt without hidden truth text", async () => {
    let capturedSystemPrompt = "";
    globalThis.fetch = captureSystemPrompt((prompt) => {
      capturedSystemPrompt = prompt;
      return "확실히 본 건 아닙니다.";
    });

    await invokeCharacter(
      character("yoon-haeon", "윤해온", "해온"),
      handout("yoon-haeon", "윤해온은 불안한 투숙객이다."),
      "허용된 목격 범위 안에서만 답한다.",
      "chat",
      "정전 전에 테이블 근처에서 뭐 봤어요?",
      publicContext(),
      [],
      "한서윤",
      pack([character("yoon-haeon", "윤해온", "해온")]),
      connection(),
      {
        inquiryFrame: {
          isCaseInquiry: true,
          inquiryType: "witness_testimony",
          topicTags: ["table", "blackout"],
          referencedEvidenceIds: [],
          referencedClaimIds: [],
          requestedTruthLevel: "testimony",
          truthLeakRisk: 1,
        },
        publicFactIds: [],
        observableFactIds: ["fact_lounge_shadow_before_blackout"],
        allowedWitnesses: [{
          characterId: "yoon-haeon",
          testimonySeedIds: ["testimony_haeon_lounge_shadow"],
          factIds: ["fact_lounge_shadow_before_blackout"],
          canSay: ["정전 직전 라운지 테이블 쪽에서 움직임을 본 것 같지만 얼굴은 못 봤다."],
          mustNotSay: ["누가 열쇠를 놓았는지 확정하지 않는다."],
          certainty: "uncertain",
          maxRevealLevel: "partial",
        }],
        blockedFactIds: [],
        blockedTruthIds: ["truth_killer_identity"],
        recommendedSpeakerIds: ["yoon-haeon"],
        answerability: "partial",
      },
    );

    expect(capturedSystemPrompt).toContain("[Answer Scope]");
    expect(capturedSystemPrompt).toContain("정전 직전 라운지 테이블 쪽에서 움직임을 본 것 같지만 얼굴은 못 봤다.");
    expect(capturedSystemPrompt).toContain("누가 열쇠를 놓았는지 확정하지 않는다.");
    expect(capturedSystemPrompt).toContain("차단된 진상 ID: truth_killer_identity");
    expect(capturedSystemPrompt).not.toContain("범인은");
  });

  test("separates user, current speaker, and independent characters in character payload", async () => {
    let capturedSystemPrompt = "";
    let capturedUserPayload = "";
    globalThis.fetch = capturePayload((payload) => {
      capturedSystemPrompt = payload.systemPrompt;
      capturedUserPayload = payload.userPayload;
      return "그 질문은 나한테 한 거지?";
    });

    await invokeCharacter(
      character("kang-mujin", "강무진", "무진"),
      handout("kang-mujin", "수사 자료 일부를 숨기고 있다."),
      "유저의 질문에 자기 입장으로 답한다.",
      "chat",
      "서하 씨 말고 무진 씨가 답해 주세요.",
      publicContext(),
      [
        {
          id: "m1",
          sessionId: "s1",
          role: "user",
          content: "나는 피곤한 얼굴로 이마를 문질렀다.",
          createdAt: "2026-05-28T00:00:00.000Z",
        },
        {
          id: "m2",
          sessionId: "s1",
          role: "character",
          characterId: "yoon-seha",
          speakerLabel: "윤서하",
          content: "저는 그 열쇠를 모릅니다.",
          createdAt: "2026-05-28T00:00:01.000Z",
        },
      ],
      "한서윤",
      pack([
        character("kang-mujin", "강무진", "무진"),
        character("yoon-seha", "윤서하", "서하"),
        character("yoon-haeon", "윤해온", "해온"),
      ]),
      connection(),
    );

    expect(capturedSystemPrompt).toContain("[상대 인물 정보]");
    expect(capturedSystemPrompt).toContain("표시: 상대 인물");
    expect(capturedSystemPrompt).not.toContain("[사용자/플레이어]");
    expect(capturedSystemPrompt).not.toContain("{{user}}는 사용자/플레이어다.");
    expect(capturedSystemPrompt).toContain("[그룹 인물 목록]");
    expect(capturedSystemPrompt).toContain("강무진: 현재 API 호출 대상");
    expect(capturedSystemPrompt).toContain("윤서하: 독립 캐릭터");
    expect(capturedSystemPrompt).toContain("윤해온: 독립 캐릭터");
    expect(capturedSystemPrompt).toContain("그룹 인물 목록의 각 이름은 서로 다른 인물이다.");
    expect(capturedUserPayload).toContain("{{user}}: 나는 피곤한 얼굴로 이마를 문질렀다.");
    expect(capturedUserPayload).toContain("{{user}}: 서하 씨 말고 무진 씨가 답해 주세요.");
    expect(capturedUserPayload).not.toContain("한서윤:");
  });

  test("marks persona name as unintroduced scene knowledge until the user introduces it", async () => {
    let capturedSystemPrompt = "";
    let capturedUserPayload = "";
    globalThis.fetch = capturePayload((payload) => {
      capturedSystemPrompt = payload.systemPrompt;
      capturedUserPayload = payload.userPayload;
      return "전화선 말고 지금 봐야 할 게 있겠지.";
    });

    await invokeCharacter(
      character("kang-mujin", "강무진", "무진"),
      handout("kang-mujin", "수사 자료 일부를 숨기고 있다."),
      "유저의 말에 냉소적으로 답한다.",
      "chat",
      "전화선이 완전히 죽었네요.",
      publicContext(),
      [
        {
          id: "opening-user",
          sessionId: "s1",
          role: "narrator",
          speakerKind: "named-actor",
          speakerLabel: "[정해윤]",
          content: "……정말 골치 아프네요. 전화도 안 됩니다.",
          isOpeningBeat: true,
          createdAt: "2026-05-28T00:00:00.000Z",
        },
      ],
      "정해윤",
      pack([character("kang-mujin", "강무진", "무진")]),
      connection(),
    );

    expect(capturedSystemPrompt).toContain("[상대 인물 정보]");
    expect(capturedSystemPrompt).toContain("표시: 상대 인물");
    expect(capturedSystemPrompt).toContain("이름 공개 상태: 미소개. 이름을 추측하거나 발화하지 않는다.");
    expect(capturedSystemPrompt).not.toContain("정해윤");
    expect(capturedSystemPrompt).not.toContain("현재 사용자 표시명: 정해윤");
    expect(capturedUserPayload).toContain("[{{user}}]: ……정말 골치 아프네요. 전화도 안 됩니다.");
    expect(capturedUserPayload).not.toContain("정해윤");
  });

  test("allows persona name after an explicit in-scene introduction", async () => {
    let capturedSystemPrompt = "";
    globalThis.fetch = captureSystemPrompt((prompt) => {
      capturedSystemPrompt = prompt;
      return "그래, 정해윤. 그럼 똑바로 봐.";
    });

    await invokeCharacter(
      character("kang-mujin", "강무진", "무진"),
      handout("kang-mujin", "수사 자료 일부를 숨기고 있다."),
      "유저의 말에 냉소적으로 답한다.",
      "chat",
      "일단 제 이름은 정해윤입니다.",
      publicContext(),
      [],
      "정해윤",
      pack([character("kang-mujin", "강무진", "무진")]),
      connection(),
    );

    expect(capturedSystemPrompt).toContain("[상대 인물 정보]");
    expect(capturedSystemPrompt).toContain("표시: 정해윤");
    expect(capturedSystemPrompt).toContain("이름 공개 상태: 장면 안에서 호칭을 들은 상태다.");
  });

  test("frames expanded persona as a scene counterpart without meta labels", async () => {
    let capturedSystemPrompt = "";
    globalThis.fetch = captureSystemPrompt((prompt) => {
      capturedSystemPrompt = prompt;
      return "처음 보는 얼굴이네.";
    });
    const persona: SessionStateV2["persona"] = {
      id: "user",
      name: "정해윤",
      shortName: "해윤",
      role: "공유주택에 막 들어온 새 입주자",
      description: "경계심이 있지만 사람을 밀어내지는 않는다.",
      appearance: "비에 젖은 회색 후드와 낡은 운동화를 신고 있다.",
      relationshipTags: ["new-tenant", "keeps-distance"],
    };

    await invokeCharacter(
      character("kang-minjae", "강민재", "민재"),
      handout("kang-minjae", "전 세입자와의 다툼을 숨기고 있다."),
      "낯선 새 입주자를 경계하되 대화를 끊지는 않는다.",
      "chat",
      "여기가 2층 방 맞나요?",
      publicContext(),
      [],
      "정해윤",
      pack([character("kang-minjae", "강민재", "민재")]),
      connection(),
      undefined,
      buildCharacterPersonaBrief(persona, false),
    );

    const personaSection = sectionBetween(capturedSystemPrompt, "[상대 인물 정보]", "[그룹 인물 목록]");
    expect(personaSection).toContain("표시: 상대 인물");
    expect(personaSection).toContain("공개 역할: 공유주택에 막 들어온 새 입주자");
    expect(personaSection).toContain("공개 설명: 경계심이 있지만 사람을 밀어내지는 않는다.");
    expect(personaSection).toContain("관찰 가능한 외형: 비에 젖은 회색 후드와 낡은 운동화를 신고 있다.");
    expect(personaSection).toContain("관계 태그: new-tenant, keeps-distance");
    expect(personaSection).not.toContain("정해윤");
    expect(personaSection).not.toMatch(/사용자|플레이어|유저|User Persona/);
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

function capturePayload(reply: (payload: { systemPrompt: string; userPayload: string }) => string): typeof fetch {
  return (async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      messages?: Array<{ role: string; content: string }>;
    };
    const systemPrompt = body.messages?.find((message) => message.role === "system")?.content ?? "";
    const userPayload = body.messages?.find((message) => message.role === "user")?.content ?? "";
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: reply({ systemPrompt, userPayload }) } }],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
}

function sectionBetween(text: string, start: string, end: string): string {
  const startIndex = text.indexOf(start);
  const endIndex = text.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) {
    return "";
  }
  return text.slice(startIndex, endIndex);
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
