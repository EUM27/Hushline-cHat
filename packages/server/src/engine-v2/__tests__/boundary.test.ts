import { describe, expect, test } from "bun:test";
import type { DirectorOutput, ScenarioPack, WorldState } from "@hushline/shared";
import {
  enforceCharacterBoundary,
  enforceDirectorBoundary,
  enforceNarratorBoundary,
} from "../boundary";

describe("engine v2 boundary layer", () => {
  test("removes unauthorized director location and background changes", () => {
    const { output, report } = enforceDirectorBoundary(
      makeDirectorOutput({
        stateDelta: {
          locationId: "secret-basement",
          backgroundId: "secret-basement",
        },
      }),
      makeWorldState(),
      makePack(),
    );

    expect(output.stateDelta.locationId).toBeUndefined();
    expect(output.stateDelta.backgroundId).toBeUndefined();
    expect(report.corrected).toBe(true);
    expect(report.violations.map((violation) => violation.code)).toContain("invalid-location");
    expect(report.violations.map((violation) => violation.code)).toContain("invalid-background");
  });

  test("replaces premature director truth reveals before investigation", () => {
    const { output, report } = enforceDirectorBoundary(
      makeDirectorOutput({
        event: "범인은 윤서하라는 진상이 드러난다.",
        narratorInstruction: "밀실 트릭의 정답을 설명한다.",
      }),
      makeWorldState(),
      makePack(),
    );

    expect(output.event).toBeNull();
    expect(output.narratorInstruction).toContain("공개적으로 관찰 가능한");
    expect(report.violations.map((violation) => violation.code)).toEqual([
      "premature-event-reveal",
      "premature-narrator-reveal",
    ]);
  });

  test("replaces character intents that leak another character's private handout", () => {
    const { output, report } = enforceDirectorBoundary(
      makeDirectorOutput({
        characterIntents: {
          "kang-mujin": "윤서하가 숨긴 예비 열쇠를 알고 추궁한다.",
        },
      }),
      makeWorldState(),
      makePack(),
    );

    expect(output.characterIntents["kang-mujin"]).toContain("공개된 정보");
    expect(report.violations[0]?.code).toBe("foreign-hidden-intent");
  });

  test("fallbacks narrator output that writes labeled character dialogue", () => {
    const { content, report } = enforceNarratorBoundary("강무진: \"경찰 올 때까지 기다려.\"");

    expect(content).toContain("공개적으로 보이는");
    expect(report.violations[0]?.code).toBe("dialogue-label");
  });

  test("fallbacks narrator output that performs unlabeled character dialogue", () => {
    const { content, report } = enforceNarratorBoundary("강무진은 낮게 말했다. \"경찰이 올 때까지 아무도 나가지 마.\"");

    expect(content).toContain("공개적으로 보이는");
    expect(report.violations[0]?.code).toBe("dialogue-prose");
  });

  test("fallbacks character output that writes another character's action or line", () => {
    const { content, report } = enforceCharacterBoundary(
      "윤서하: \"저는 몰라요.\" 강무진은 고개를 돌렸다.",
      "kang-mujin",
      makePack(),
      "...",
    );

    expect(content).toBe("...");
    expect(report.violations[0]?.code).toBe("foreign-dialogue");
  });

  test("fallbacks character output outside quote-based dialogue/thought format", () => {
    const { content, report } = enforceCharacterBoundary(
      "강무진, 지금 큰소리 내면 더 불안해져요.",
      "yoon-haeon",
      makePack(),
      "\"...잠깐만.\"",
    );

    expect(content).toBe("\"...잠깐만.\"");
    expect(report.violations.map((violation) => violation.code)).toContain("format-contract");
  });

  test("fallbacks character output that mixes dialogue with narration paragraphs", () => {
    const { content, report } = enforceCharacterBoundary(
      [
        "방금 내 입으로 그딴 헛소리 본 적 없다고 한 거 벌써 잊어버렸수?",
        "",
        "라이터 뚜껑을 탁 닫으며 험악하게 인상을 구겼다.",
        "",
        "\"어디 찌그러져 있었는지 서로 캐묻어서 사람 피 마르게 하지 말고, 다들 입 다물고 기다리쇼.\"",
      ].join("\n"),
      "kang-mujin",
      makePack(),
      "...",
    );

    expect(content).toBe("...");
    expect(report.violations.map((violation) => violation.code)).toContain("embedded-narration");
  });

  test("fallbacks output that decides user action", () => {
    const narrator = enforceNarratorBoundary("{{유저}}는 범인을 확신하고 열쇠를 집어 들었다.");
    const character = enforceCharacterBoundary("당신은 내 말을 듣고 고개를 끄덕였다.", "kang-mujin", makePack(), "...");

    expect(narrator.content).toContain("공개적으로 보이는");
    expect(character.content).toBe("...");
    expect(narrator.report.violations.some((violation) => violation.code === "user-agency")).toBe(true);
    expect(character.report.violations.some((violation) => violation.code === "user-agency")).toBe(true);
  });

  test("fallbacks character output that uses facts outside the answer scope", () => {
    const { content, report } = enforceCharacterBoundary(
      "정전 뒤엔 열쇠가 사라졌어요. 그건 제가 봤습니다.",
      "kang-mujin",
      {
        ...makePack(),
        caseKnowledge: {
          publicFacts: [],
          observableFacts: [
            {
              id: "fact_key_missing_after_blackout",
              text: "정전 뒤 라운지 테이블의 열쇠가 사라졌다.",
              tags: ["key", "table", "blackout"],
            },
          ],
          testimonySeeds: [],
          hiddenTruths: [],
        },
      },
      "...",
      {
        inquiryFrame: {
          isCaseInquiry: true,
          inquiryType: "witness_testimony",
          topicTags: ["key"],
          referencedEvidenceIds: [],
          referencedClaimIds: [],
          requestedTruthLevel: "testimony",
          truthLeakRisk: 1,
        },
        publicFactIds: [],
        observableFactIds: [],
        allowedWitnesses: [],
        blockedFactIds: ["fact_key_missing_after_blackout"],
        blockedTruthIds: [],
        recommendedSpeakerIds: ["kang-mujin"],
        answerability: "none",
      },
    );

    expect(content).toBe("...");
    expect(report.violations.map((violation) => violation.code)).toContain("unauthorized-fact");
  });
});

function makeDirectorOutput(overrides: Partial<DirectorOutput> = {}): DirectorOutput {
  return {
    speakers: ["kang-mujin"],
    silence: false,
    event: null,
    narratorInstruction: null,
    characterIntents: {
      "kang-mujin": "상황을 경계한다.",
    },
    messagePlan: [{ kind: "character", speakerId: "kang-mujin" }],
    stateDelta: {},
    subObjectiveUpdate: null,
    relationshipUpdate: null,
    directives: [],
    delay: null,
    ...overrides,
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
    mainObjective: {
      id: "solve",
      description: "진상을 밝힌다.",
      status: "active",
    },
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
      {
        id: "yoon-seha",
        name: "윤서하",
        shortName: "서하",
        role: "운영 직원",
        profileKind: "named-actor",
        anonymousLabel: "윤서하",
        mbti: "INFJ",
        ocean: { openness: 6, conscientiousness: 6, extraversion: 2, agreeableness: 5, neuroticism: 7 },
        autonomy: 0.7,
        systemPrompt: "",
        handout: {
          secret: "숨긴 예비 열쇠를 갖고 있다.",
          desire: "예비 열쇠를 들키지 않는다.",
          objective: "의심을 피한다.",
          initialRelationshipToUser: 0,
        },
        relationships: [],
      },
    ],
    directorPrompt: "",
    narratorPrompt: "",
    mainObjective: {
      id: "solve",
      description: "진상을 밝힌다.",
    },
    eventTriggers: [],
  };
}
