import { describe, expect, test } from "bun:test";
import type { OmniscientContext, PublicContext, ScenarioPack, WorldState } from "@hushline/shared";
import { buildDirectorMessages, buildDirectorSystemPrompt } from "../director";

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
