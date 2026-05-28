import type { ScenarioPack } from "@hushline/shared";

export function makeCasePack(): ScenarioPack {
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
        mbti: "ISTJ",
        ocean: { openness: 4, conscientiousness: 8, extraversion: 3, agreeableness: 3, neuroticism: 4 },
        autonomy: 0.8,
        systemPrompt: "강무진으로 말한다.",
        handout: {
          secret: "수사 자료 일부를 숨기고 있다.",
          desire: "현장을 통제한다.",
          objective: "범인을 찾는다.",
          initialRelationshipToUser: 0,
        },
        relationships: [],
      },
      {
        id: "yoon-haeon",
        name: "윤해온",
        shortName: "해온",
        role: "투숙객",
        profileKind: "named-actor",
        mbti: "INFP",
        ocean: { openness: 6, conscientiousness: 4, extraversion: 2, agreeableness: 5, neuroticism: 7 },
        autonomy: 0.7,
        systemPrompt: "윤해온으로 말한다.",
        handout: {
          secret: "",
          desire: "의심을 피한다.",
          objective: "밤을 넘긴다.",
          initialRelationshipToUser: 0,
        },
        relationships: [],
      },
    ],
    directorPrompt: "",
    narratorPrompt: "",
    mainObjective: { id: "solve", description: "진상을 밝힌다." },
    eventTriggers: [],
    caseKnowledge: {
      publicFacts: [
        {
          id: "pub_key_after_blackout",
          text: "정전 뒤 라운지 테이블 위에서 출처 불명의 열쇠가 발견됐다.",
          tags: ["key", "table", "blackout", "lounge"],
          objectIds: ["study-key", "lounge-table"],
          locationId: "lodge-foyer",
        },
      ],
      observableFacts: [
        {
          id: "fact_lounge_shadow_before_blackout",
          text: "정전 직전 라운지 테이블 근처에서 누군가 움직인 듯한 그림자가 보였다.",
          tags: ["table", "blackout", "lounge", "last_seen"],
          objectIds: ["lounge-table"],
          locationId: "lodge-foyer",
        },
      ],
      testimonySeeds: [
        {
          id: "testimony_haeon_lounge_shadow",
          characterId: "yoon-haeon",
          factIds: ["fact_lounge_shadow_before_blackout"],
          topicTags: ["table", "blackout", "lounge", "last_seen"],
          defaultRevealLevel: "partial",
          certainty: "uncertain",
          canSay: ["정전 직전 라운지 테이블 쪽에서 움직임을 본 것 같지만 얼굴은 못 봤다."],
          mustNotSay: ["누가 열쇠를 놓았는지 확정하지 않는다."],
        },
      ],
      hiddenTruths: [
        {
          id: "truth_killer_identity",
          label: "범인 정체",
          tags: ["killer", "truth"],
          blockedKeywords: ["범인", "살인범", "진상"],
        },
      ],
    },
  };
}
