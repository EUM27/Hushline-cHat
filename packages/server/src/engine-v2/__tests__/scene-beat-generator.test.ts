import { describe, expect, test } from "bun:test";
import type { SceneOccurrenceDevice, WorldState } from "@hushline/shared";
import { selectBeat } from "../scene-beat-generator";

describe("scene beat generator", () => {
  test("omits absent state delta properties from generated beats", () => {
    const device: SceneOccurrenceDevice = {
      id: "d1",
      type: "quiet_texture",
      trigger: {
        conditionType: "always",
        conditionValue: null,
      },
      effect: {
        sceneBeat: "창밖에서 희미한 발소리가 들린다.",
        stateDelta: {
          tension: 1,
        },
      },
      oneShot: false,
    };

    const beat = selectBeat([device], minimalWorldState(), []);

    expect(beat?.stateDelta).toEqual({ tension: 1 });
    expect(Object.hasOwn(beat?.stateDelta ?? {}, "danger")).toBe(false);
    expect(Object.hasOwn(beat?.stateDelta ?? {}, "factReveals")).toBe(false);
  });
});

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
  };
}
