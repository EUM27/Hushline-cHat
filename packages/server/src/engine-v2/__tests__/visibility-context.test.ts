import { describe, expect, test } from "bun:test";
import type { CharacterDefinition, WorldState, FactVisibility } from "@hushline/shared";
import { buildPrivateHandout } from "../context-builder";

describe("visibility graph context integration", () => {
  test("private handouts include only facts visible to the active character", () => {
    const worldState = {
      ...minimalWorldState(),
      characterStates: {
        alice: {
          id: "alice",
          currentObjective: "상황을 파악한다.",
          knownFacts: ["legacy-state-fact"],
          relationshipToUser: 2,
          lastSpokeTurn: -1,
          isRevealed: true,
          autonomy: 0.6,
        },
        bob: {
          id: "bob",
          currentObjective: "숨긴다.",
          knownFacts: [],
          relationshipToUser: -1,
          lastSpokeTurn: -1,
          isRevealed: true,
          autonomy: 0.6,
        },
      },
      factVisibility: [
        visibleFact("alice-secret", "앨리스만 아는 열쇠 단서", ["alice"]),
        visibleFact("bob-secret", "밥만 아는 알리바이", ["bob"]),
        {
          ...visibleFact("blocked", "앨리스에게 차단된 독백", ["alice"]),
          blockedFrom: [{ agentId: "alice", reason: "not witnessed" }],
        },
      ],
    } satisfies WorldState & { factVisibility: FactVisibility[] };

    const handout = buildPrivateHandout("alice", worldState, [character("alice"), character("bob")]);

    expect(handout.knownFacts).toContain("legacy-state-fact");
    expect(handout.knownFacts).toContain("앨리스만 아는 열쇠 단서");
    expect(handout.knownFacts).not.toContain("밥만 아는 알리바이");
    expect(handout.knownFacts).not.toContain("앨리스에게 차단된 독백");
  });
});

function visibleFact(factId: string, content: string, knownBy: string[]): FactVisibility {
  return {
    factId,
    content,
    factType: "event",
    groundTruth: true,
    knownBy: knownBy.map((agentId) => ({ agentId, source: "setup", confidence: 1 })),
    blockedFrom: [],
    autoPropagateOnReveal: [],
    linkedFacts: [],
    contradicts: [],
  };
}

function character(id: string): CharacterDefinition {
  return {
    id,
    name: id,
    shortName: id,
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
    autonomy: 0.6,
    systemPrompt: `${id}로 말한다.`,
    handout: {
      secret: `${id} secret`,
      desire: `${id} desire`,
      objective: `${id} objective`,
      initialRelationshipToUser: 0,
    },
    relationships: [],
  };
}

function minimalWorldState(): WorldState {
  return {
    sessionId: "s1",
    scenarioId: "scenario",
    sceneMode: "messenger",
    locationId: "loc",
    backgroundId: "bg",
    tension: 0,
    danger: 0,
    turnNumber: 0,
    hasEnteredScene: false,
    mainObjective: {
      id: "main",
      description: "진행한다.",
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
