import { describe, expect, test } from "bun:test";
import type { ScenarioPack, WorldState } from "@hushline/shared";
import { buildStateLawSnapshot } from "../state-law";

describe("state law snapshot", () => {
  test("separates immutable facts, slow state, scene pressure, and output rules", () => {
    const snapshot = buildStateLawSnapshot(makeWorldState(), makePack());

    expect(snapshot.immutableFacts).toContain("시나리오: 설산 산장 살인사건");
    expect(snapshot.immutableFacts).toContain("현재 허용 장소: lodge-foyer");
    expect(snapshot.slowState).toContain("강무진: 신뢰도 0");
    expect(snapshot.scenePressure).toContain("긴장 6 / 위험 3");
    expect(snapshot.outputRules).toContain("유저 행동/생각/감정 대리 금지");
    expect(snapshot.outputRules).toContain("허용되지 않은 장소 이동 금지");
  });
});

function makeWorldState(): WorldState {
  return {
    sessionId: "s1",
    scenarioId: "locked-room-mystery",
    sceneMode: "dialogue",
    locationId: "lodge-foyer",
    backgroundId: "lodge-foyer",
    tension: 6,
    danger: 3,
    turnNumber: 4,
    hasEnteredScene: true,
    mainObjective: { id: "solve", description: "범인을 찾는다.", status: "active" },
    subObjectives: [],
    characterStates: {
      "kang-mujin": {
        id: "kang-mujin",
        currentObjective: "현장을 통제한다.",
        knownFacts: ["피해자가 서재에서 발견됐다."],
        relationshipToUser: 0,
        lastSpokeTurn: 3,
        isRevealed: true,
        autonomy: 0.8,
      },
    },
    relationshipGraph: [],
    recentEvents: [],
    recentSpeakerIds: ["kang-mujin"],
  };
}

function makePack(): ScenarioPack {
  return {
    manifest: {
      id: "locked-room-mystery",
      title: "설산 산장 살인사건",
      subtitle: "폭설 속 산장",
      genre: "mystery",
      version: "1.0.0",
      engineVersion: ">=2.0.0",
      uiMode: "scene-first",
    },
    scenarioCard: {
      id: "locked-room-mystery-card",
      title: "설산 산장 살인사건",
      subtitle: "폭설 속 산장",
      description: "",
      spaceRules: ["서재는 조사 전까지 직접 진입할 수 없다."],
      chatRules: [],
      toneRules: [],
      hardNos: [],
      backgroundIds: ["lodge-foyer", "lodge-study"],
      initialLocationId: "lodge-foyer",
      initialBackgroundId: "lodge-foyer",
      initialSceneMode: "dialogue",
      interventionPrompt: "",
      openingBeats: [],
    },
    characters: [
      {
        id: "kang-mujin",
        name: "강무진",
        shortName: "무진",
        role: "형사",
        profileKind: "named-actor",
        anonymousLabel: "강무진",
        mbti: "ISTJ",
        ocean: { openness: 4, conscientiousness: 8, extraversion: 3, agreeableness: 3, neuroticism: 4 },
        autonomy: 0.8,
        systemPrompt: "",
        handout: {
          secret: "피해자와 과거 악연이 있다.",
          desire: "현장을 통제한다.",
          objective: "범인을 찾는다.",
          initialRelationshipToUser: 0,
        },
        relationships: [],
      },
    ],
    directorPrompt: "",
    narratorPrompt: "",
    mainObjective: { id: "solve", description: "범인을 찾는다." },
    eventTriggers: [],
  };
}
