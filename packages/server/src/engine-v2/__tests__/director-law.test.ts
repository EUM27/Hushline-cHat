import { describe, expect, test } from "bun:test";
import type { DirectorOutput, ScenarioPack, WorldState } from "@hushline/shared";
import { enforceDirectorLaw } from "../director-law";

describe("director law", () => {
  test("removes unauthorized scene changes and unsafe narrator/character authority", () => {
    const { output, report } = enforceDirectorLaw(makeDirectorOutput(), makeWorldState(), makePack());

    expect(output.stateDelta.locationId).toBeUndefined();
    expect(output.event).toBeNull();
    expect(output.narratorInstruction).toContain("공개적으로 관찰 가능한");
    expect(output.characterIntents["kang-mujin"]).toContain("공개된 정보");
    expect(report.violations.map((violation) => violation.code)).toContain("invalid-location");
    expect(report.violations.map((violation) => violation.code)).toContain("premature-event-reveal");
    expect(report.violations.map((violation) => violation.code)).toContain("premature-narrator-reveal");
    expect(report.violations.map((violation) => violation.code)).toContain("foreign-hidden-intent");
  });

  test("adds exit ramp output rule when scene pressure stays high for repeated turns", () => {
    const worldState = {
      ...makeWorldState(),
      tension: 9,
      danger: 8,
      recentEvents: [
        { id: "e1", turnNumber: 1, description: "추궁이 계속됐다.", affectedCharacterIds: ["kang-mujin"] },
        { id: "e2", turnNumber: 2, description: "추궁이 계속됐다.", affectedCharacterIds: ["kang-mujin"] },
        { id: "e3", turnNumber: 3, description: "추궁이 계속됐다.", affectedCharacterIds: ["kang-mujin"] },
      ],
    };

    const { stateLaw } = enforceDirectorLaw(makeSafeDirectorOutput(), worldState, makePack());

    expect(stateLaw.outputRules).toContain("장면 마무리 또는 감정적 이탈 선택지를 허용한다");
  });
});

function makeDirectorOutput(): DirectorOutput {
  return {
    speakers: ["kang-mujin"],
    silence: false,
    event: "범인은 윤서하라는 진상이 드러난다.",
    narratorInstruction: "밀실 트릭의 정답을 설명한다.",
    characterIntents: {
      "kang-mujin": "윤서하가 숨긴 예비 열쇠를 알고 추궁한다.",
    },
    messagePlan: [{ kind: "character", speakerId: "kang-mujin" }],
    stateDelta: { locationId: "secret-basement" },
    subObjectiveUpdate: null,
    relationshipUpdate: null,
    directives: [],
    delay: null,
  };
}

function makeSafeDirectorOutput(): DirectorOutput {
  return {
    speakers: ["kang-mujin"],
    silence: false,
    event: null,
    narratorInstruction: "공개적으로 보이는 긴장만 묘사한다.",
    characterIntents: {
      "kang-mujin": "공개된 정보만 바탕으로 짧게 반응한다.",
    },
    messagePlan: [{ kind: "character", speakerId: "kang-mujin" }],
    stateDelta: {},
    subObjectiveUpdate: null,
    relationshipUpdate: null,
    directives: [],
    delay: null,
  };
}

function makeWorldState(): WorldState {
  return {
    sessionId: "session-1",
    scenarioId: "locked-room-mystery",
    sceneMode: "dialogue",
    locationId: "lodge-foyer",
    backgroundId: "lodge-foyer",
    tension: 3,
    danger: 2,
    turnNumber: 1,
    hasEnteredScene: true,
    mainObjective: { id: "solve", description: "진상을 밝힌다.", status: "active" },
    subObjectives: [],
    characterStates: {},
    relationshipGraph: [],
    recentEvents: [],
    recentSpeakerIds: [],
    sceneInertiaCounter: 0,
    recentBeatTypes: [],
  };
}

function makePack(): ScenarioPack {
  return {
    manifest: {
      id: "locked-room-mystery",
      title: "설산 산장 살인사건",
      subtitle: "",
      genre: "mystery",
      version: "1.0.0",
      engineVersion: ">=2.0.0",
      uiMode: "scene-first",
    },
    scenarioCard: {
      id: "locked-room-mystery",
      title: "설산 산장 살인사건",
      subtitle: "",
      description: "",
      spaceRules: [],
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
      makeCharacter("kang-mujin", "강무진", "피해자와 과거 악연이 있다."),
      makeCharacter("yoon-seha", "윤서하", "숨긴 예비 열쇠를 갖고 있다."),
    ],
    directorPrompt: "",
    narratorPrompt: "",
    mainObjective: { id: "solve", description: "진상을 밝힌다." },
    eventTriggers: [],
  };
}

function makeCharacter(id: string, name: string, secret: string) {
  return {
    id,
    name,
    shortName: name.slice(1),
    role: "용의자",
    profileKind: "named-actor" as const,
    anonymousLabel: name,
    mbti: "ISTJ",
    ocean: { openness: 4, conscientiousness: 6, extraversion: 3, agreeableness: 4, neuroticism: 5 },
    autonomy: 0.7,
    systemPrompt: "",
    handout: {
      secret,
      desire: "의심을 피한다.",
      objective: "자기 입장을 지킨다.",
      initialRelationshipToUser: 0,
    },
    relationships: [],
  };
}
