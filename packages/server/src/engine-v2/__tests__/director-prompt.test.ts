import { describe, expect, test } from "bun:test";
import type { CharacterDefinition, CharacterStateV2, OmniscientContext, PublicContext, ScenarioPack, WorldState } from "@hushline/shared";
import { buildDirectorMessages, buildDirectorSystemPrompt, invokeDirector, normalizeDirectorOutput } from "../director";

describe("director prompt", () => {
  test("prioritizes current scene causality over abrupt external events", () => {
    const prompt = buildDirectorSystemPrompt(minimalPack(), minimalOmniscientContext());

    expect(prompt).toContain("[전역 규칙 — 장면 인과와 이벤트 우선도]");
    expect(prompt).toContain("목표나 이벤트가 중요해도 현재 장면의 자연스러운 다음 beat를 이기면 안 된다.");
    expect(prompt).toContain("감정씬, 관계씬, 직접 대화가 진행 중이면 외부 설정 이벤트로 끊지 않는다.");
    expect(prompt).toContain("bridge 없이 새 설정을 꽂아 목표를 밀어붙이지 않는다.");
  });

  test("adds a per-turn current scene priority checklist", () => {
    const [message] = buildDirectorMessages(
      minimalPublicContext(),
      "잠깐만. 지금 그 말은 무슨 뜻이야?",
      "chat",
      minimalWorldState(),
    );

    expect(message).toContain("[현재 장면 우선도 체크]");
    expect(message).toContain("최신 유저 입력과 바로 이전 발화/행동에 자연스럽게 이어지는 반응을 먼저 선택한다.");
    expect(message).toContain("연결 사유가 '갑자기', '난데없이', '한편' 정도밖에 없다면 그 이벤트를 고르지 않는다.");
    expect(message).toContain("[최근 공개 이벤트]");
  });

  test("adds speaker diversity and interest-based reaction pressure", () => {
    const prompt = buildDirectorSystemPrompt(minimalPack(), minimalOmniscientContext());
    const [message] = buildDirectorMessages(
      minimalPublicContext(),
      "핸드폰 가지고 계시는 분 경찰 불러주세요.",
      "chat",
      {
        ...minimalWorldState(),
        recentSpeakerIds: ["ha-jinwoo", "ha-jinwoo"],
      },
    );

    expect(prompt).toContain("[전역 규칙 — 발화자 선택과 이해관계]");
    expect(prompt).toContain("유저의 명령을 자동으로 따르는 조수가 아니다");
    expect(prompt).toContain("최근 2턴 이상 같은 인물만 계속 speaker로 선택하지 않는다");
    expect(prompt).toContain("이해관계에 맞는 방식으로 각자 다르게");
    expect(message).toContain("[발화 분산 체크]");
    expect(message).toContain("같은 결론을 말투만 바꿔 반복하지 않는다");
  });

  test("normalizes fallback director output so group-addressed dry-run turns can produce multiple speakers", async () => {
    const pack = {
      ...minimalPack(),
      characters: [minimalCharacter("ha-jinwoo"), minimalCharacter("cho-minseo")],
    };
    const worldState = {
      ...minimalWorldState(),
      characterStates: {
        "ha-jinwoo": minimalCharacterState("ha-jinwoo", "버틴다", 2, 0.5),
        "cho-minseo": minimalCharacterState("cho-minseo", "관찰한다", -1, 0.8),
      },
      recentSpeakerIds: ["ha-jinwoo", "ha-jinwoo"],
    };

    const result = await invokeDirector(
      worldState,
      minimalOmniscientContext(),
      minimalPublicContext(),
      "다들 지금 본 거 각자 말해줘.",
      "chat",
      pack,
      undefined,
    );

    expect(result.source).toBe("fallback");
    expect(result.output.speakers).toEqual(["cho-minseo", "ha-jinwoo"]);
    expect(result.output.characterIntents["ha-jinwoo"]).toContain("다른 관점");
  });

  test("keeps group-addressed turns from collapsing to one speaker", () => {
    const characters = [minimalCharacter("ha-jinwoo"), minimalCharacter("cho-minseo")];
    const normalized = normalizeDirectorOutput(
      {
        speakers: ["ha-jinwoo"],
        silence: false,
        event: null,
        narratorInstruction: null,
        characterIntents: { "ha-jinwoo": "먼저 반응한다." },
        stateDelta: {},
        subObjectiveUpdate: null,
        relationshipUpdate: null,
        directives: [],
        delay: null,
      },
      characters,
      {
        ...minimalWorldState(),
        characterStates: {
          "ha-jinwoo": minimalCharacterState("ha-jinwoo", "버틴다", 2, 0.5),
          "cho-minseo": minimalCharacterState("cho-minseo", "관찰한다", -1, 0.8),
        },
        recentSpeakerIds: ["ha-jinwoo"],
      },
      "다들 지금 본 거 각자 말해줘.",
    );

    expect(normalized.speakers).toEqual(["ha-jinwoo", "cho-minseo"]);
    expect(normalized.characterIntents["cho-minseo"]).toContain("다른 관점");
  });
});

function minimalPack(): ScenarioPack {
  return {
    manifest: {
      id: "test-pack",
      title: "테스트",
      subtitle: "장면",
      genre: "horror",
      version: "1.0.0",
      engineVersion: ">=2.0.0",
    },
    scenarioCard: {
      id: "test-pack-card",
      title: "테스트",
      subtitle: "장면",
      description: "",
      spaceRules: [],
      chatRules: [],
      toneRules: [],
      hardNos: [],
      backgroundIds: [],
      initialLocationId: "kitchen",
      initialBackgroundId: "kitchen-bg",
      initialSceneMode: "dialogue",
      interventionPrompt: "",
      openingBeats: [],
    },
    characters: [],
    directorPrompt: "반드시 JSON만 출력한다.",
    narratorPrompt: "",
    mainObjective: {
      id: "main",
      description: "장면을 진행한다.",
    },
    eventTriggers: [],
  };
}

function minimalOmniscientContext(): OmniscientContext {
  return {
    allSecrets: {},
    allDesires: {},
    allObjectives: {},
    fullRelationshipGraph: [],
    mainObjective: {
      id: "main",
      description: "장면을 진행한다.",
      status: "active",
    },
    subObjectives: [],
    characterSummaries: [],
    eventTriggers: [],
    genreGoals: "장면 인과를 지킨다.",
    recentEvents: [],
  };
}

function minimalPublicContext(): PublicContext {
  return {
    scenarioTitle: "테스트",
    scenarioSubtitle: "장면",
    sceneMode: "dialogue",
    currentLocation: "kitchen",
    currentBackground: "kitchen-bg",
    tension: 4,
    danger: 2,
    turnNumber: 3,
    publicChatLog: [
      {
        role: "character",
        label: "지오반니",
        content: "그 일은 제가 처리하겠습니다.",
      },
    ],
    publicEvents: ["이전 턴에서 추적 알림이 대기 상태로 표시되었다."],
    mainObjectiveDescription: "장면을 진행한다.",
  };
}

function minimalCharacter(id: string): CharacterDefinition {
  return {
    id,
    name: id === "ha-jinwoo" ? "하진우" : "조민서",
    shortName: id === "ha-jinwoo" ? "진우" : "민서",
    role: "테스트 인물",
    profileKind: "named-actor",
    mbti: "INTJ",
    ocean: {
      openness: 50,
      conscientiousness: 50,
      extraversion: 50,
      agreeableness: 50,
      neuroticism: 50,
    },
    autonomy: id === "cho-minseo" ? 0.8 : 0.5,
    systemPrompt: "장면 안에서 반응한다.",
    handout: {
      secret: "비밀을 지킨다.",
      desire: "상황을 파악한다.",
      objective: "장면 안에서 반응한다.",
      initialRelationshipToUser: 0,
      fear: "노출을 피한다.",
    },
    relationships: [],
  };
}

function minimalCharacterState(
  id: string,
  currentObjective: string,
  lastSpokeTurn: number,
  autonomy: number,
): CharacterStateV2 {
  return {
    id,
    currentObjective,
    knownFacts: [],
    relationshipToUser: 0,
    lastSpokeTurn,
    isRevealed: true,
    autonomy,
  };
}

function minimalWorldState(): WorldState {
  return {
    sessionId: "s1",
    scenarioId: "test-pack",
    sceneMode: "dialogue",
    locationId: "kitchen",
    backgroundId: "kitchen-bg",
    tension: 4,
    danger: 2,
    turnNumber: 3,
    hasEnteredScene: true,
    mainObjective: {
      id: "main",
      description: "장면을 진행한다.",
      status: "active",
    },
    subObjectives: [],
    characterStates: {},
    relationshipGraph: [],
    recentEvents: [],
    recentSpeakerIds: ["giovanni"],
  };
}
