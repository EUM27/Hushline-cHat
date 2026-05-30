import { describe, expect, test } from "bun:test";
import type { CharacterDefinition, CharacterStateV2, WorldState } from "@hushline/shared";
import {
  isAutonomyEligible,
  selectAutonomousSpeaker,
  shouldActAutonomously,
  getCurrentAgenda,
} from "../agenda-scheduler";

describe("agenda scheduler", () => {
  test("isAutonomyEligible is false below the autonomy threshold", () => {
    const state = makeState({ autonomy: 0.5, lastSpokeTurn: 0 });
    expect(isAutonomyEligible(state, 10)).toBe(false);
  });

  test("isAutonomyEligible is false when the NPC spoke recently", () => {
    const state = makeState({ autonomy: 0.9, lastSpokeTurn: 9 });
    expect(isAutonomyEligible(state, 10)).toBe(false); // only 1 turn of silence
  });

  test("isAutonomyEligible is true for a quiet high-autonomy NPC", () => {
    const state = makeState({ autonomy: 0.9, lastSpokeTurn: 5 });
    expect(isAutonomyEligible(state, 10)).toBe(true); // 5 turns of silence >= 3
  });

  test("isAutonomyEligible is deterministic across repeated calls", () => {
    const state = makeState({ autonomy: 0.8, lastSpokeTurn: 3 });
    const results = Array.from({ length: 20 }, () => isAutonomyEligible(state, 10));
    expect(new Set(results).size).toBe(1);
  });

  test("shouldActAutonomously delegates to the deterministic gate", () => {
    const eligible = makeState({ autonomy: 0.9, lastSpokeTurn: 2 });
    const ineligible = makeState({ autonomy: 0.3, lastSpokeTurn: 2 });
    expect(shouldActAutonomously(eligible, 10)).toBe(true);
    expect(shouldActAutonomously(ineligible, 10)).toBe(false);
  });

  test("getCurrentAgenda uses the passed currentTurn instead of a non-existent field", () => {
    const character = makeCharacter("npc-a", 0.9);
    const state = makeState({ autonomy: 0.9, lastSpokeTurn: 1, currentObjective: "관찰한다" });
    const agenda = getCurrentAgenda(character, state, 10);
    expect(agenda.shouldActAutonomously).toBe(true);
    expect(agenda.currentGoal).toBe("관찰한다");
  });

  test("selectAutonomousSpeaker picks the longest-silent eligible NPC", () => {
    const characters = [makeCharacter("npc-a", 0.9), makeCharacter("npc-b", 0.9), makeCharacter("npc-c", 0.4)];
    const world = makeWorld({
      "npc-a": makeState({ autonomy: 0.9, lastSpokeTurn: 6 }),
      "npc-b": makeState({ autonomy: 0.9, lastSpokeTurn: 2 }), // quieter → preferred
      "npc-c": makeState({ autonomy: 0.4, lastSpokeTurn: 0 }), // low autonomy → ineligible
    });

    expect(selectAutonomousSpeaker(characters, world, 10)).toBe("npc-b");
  });

  test("selectAutonomousSpeaker breaks ties by autonomy then definition order", () => {
    const characters = [makeCharacter("npc-a", 0.8), makeCharacter("npc-b", 0.95)];
    const world = makeWorld({
      "npc-a": makeState({ autonomy: 0.8, lastSpokeTurn: 4 }),
      "npc-b": makeState({ autonomy: 0.95, lastSpokeTurn: 4 }), // same silence, higher autonomy
    });

    expect(selectAutonomousSpeaker(characters, world, 10)).toBe("npc-b");
  });

  test("selectAutonomousSpeaker returns undefined when nobody is eligible", () => {
    const characters = [makeCharacter("npc-a", 0.5)];
    const world = makeWorld({ "npc-a": makeState({ autonomy: 0.5, lastSpokeTurn: 0 }) });
    expect(selectAutonomousSpeaker(characters, world, 10)).toBeUndefined();
  });
});

function makeState(over: Partial<CharacterStateV2>): CharacterStateV2 {
  return {
    id: over.id ?? "npc",
    currentObjective: over.currentObjective ?? "버틴다",
    knownFacts: over.knownFacts ?? [],
    relationshipToUser: over.relationshipToUser ?? 0,
    lastSpokeTurn: over.lastSpokeTurn ?? -1,
    isRevealed: over.isRevealed ?? true,
    autonomy: over.autonomy ?? 0.5,
  };
}

function makeCharacter(id: string, autonomy: number): CharacterDefinition {
  return {
    id,
    name: id,
    shortName: id,
    role: "테스트",
    profileKind: "named-actor",
    mbti: "INTJ",
    ocean: { openness: 50, conscientiousness: 50, extraversion: 50, agreeableness: 50, neuroticism: 50 },
    autonomy,
    systemPrompt: "반응한다.",
    handout: { secret: "비밀", desire: "", objective: "버틴다", initialRelationshipToUser: 0 },
    relationships: [],
  };
}

function makeWorld(characterStates: Record<string, CharacterStateV2>): WorldState {
  return {
    sessionId: "s1",
    scenarioId: "scenario",
    sceneMode: "dialogue",
    locationId: "loc",
    backgroundId: "bg",
    tension: 0,
    danger: 0,
    turnNumber: 0,
    hasEnteredScene: true,
    mainObjective: { id: "main", description: "진행한다.", status: "active" },
    subObjectives: [],
    characterStates,
    relationshipGraph: [],
    recentEvents: [],
    recentSpeakerIds: [],
    sceneInertiaCounter: 0,
    recentBeatTypes: [],
  };
}
