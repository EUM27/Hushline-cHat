import { describe, expect, test } from "bun:test";
import type { SceneOccurrenceDevice, WorldState } from "@hushline/shared";
import {
  selectBeat,
  sanitizeBeat,
  shouldInjectBeat,
  turnHadMeaningfulEvent,
  updateInertia,
  type GeneratedBeat,
} from "../scene-beat-generator";

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

  test("does not select a one-shot device that already fired", () => {
    const oneShot = makeDevice("d-oneshot", "informational", { oneShot: true, priority: 9 });
    const fallback = makeDevice("d-fallback", "quiet_texture", { oneShot: false, priority: 1 });
    const world = minimalWorldState();
    // Mark the one-shot as fired by referencing its id in recentEvents.
    world.recentEvents = [{
      id: "e1",
      turnNumber: 1,
      description: "[scene-beat:d-oneshot] 이미 발동됨",
      affectedCharacterIds: [],
    }];

    const beat = selectBeat([oneShot, fallback], world, []);

    expect(beat?.deviceId).not.toBe("d-oneshot");
  });

  test("avoids beat types used in the two most recent beats", () => {
    const informational = makeDevice("d-info", "informational", { oneShot: false, priority: 9 });
    const social = makeDevice("d-social", "social", { oneShot: false, priority: 1 });

    const beat = selectBeat([informational, social], minimalWorldState(), ["informational"]);

    // The high-priority informational beat is avoided because it is recent.
    expect(beat?.beatType).toBe("social");
  });

  test("sanitizeBeat strips hidden-truth fact ids from factReveals", () => {
    const beat: GeneratedBeat = {
      deviceId: "d1",
      beatType: "informational",
      description: "단서가 드러난다.",
      involvedNpcs: [],
      stateDelta: { tension: 1, factReveals: ["fact_public", "truth_killer_identity"] },
    };

    const safe = sanitizeBeat(beat, ["truth_killer_identity", "truth_locked_room_trick"]);

    expect(safe.stateDelta.factReveals).toEqual(["fact_public"]);
  });

  test("sanitizeBeat removes the factReveals key entirely when all are hidden", () => {
    const beat: GeneratedBeat = {
      deviceId: "d1",
      beatType: "informational",
      description: "단서가 드러난다.",
      involvedNpcs: [],
      stateDelta: { tension: 1, factReveals: ["truth_killer_identity"] },
    };

    const safe = sanitizeBeat(beat, ["truth_killer_identity"]);

    expect(Object.hasOwn(safe.stateDelta, "factReveals")).toBe(false);
    expect(safe.stateDelta.tension).toBe(1);
  });

  test("inertia accumulates on idle turns and resets on meaningful turns", () => {
    let inertia = 0;
    inertia = updateInertia(inertia, turnHadMeaningfulEvent({ hadCharacterSpeech: false, hadDirectorEvent: false, hadStateChange: false }));
    expect(inertia).toBe(1);
    expect(shouldInjectBeat(inertia)).toBe(false);

    inertia = updateInertia(inertia, false);
    expect(inertia).toBe(2);
    expect(shouldInjectBeat(inertia)).toBe(true);

    inertia = updateInertia(inertia, turnHadMeaningfulEvent({ hadCharacterSpeech: true, hadDirectorEvent: false, hadStateChange: false }));
    expect(inertia).toBe(0);
  });

  test("shouldInjectBeat honors a manifest threshold override", () => {
    expect(shouldInjectBeat(2, 3)).toBe(false);
    expect(shouldInjectBeat(3, 3)).toBe(true);
  });
});

function makeDevice(
  id: string,
  type: SceneOccurrenceDevice["type"],
  opts: { oneShot: boolean; priority: number },
): SceneOccurrenceDevice {
  return {
    id,
    type,
    trigger: { conditionType: "always", conditionValue: null },
    effect: { sceneBeat: `${id} 비트`, stateDelta: { tension: 1 } },
    oneShot: opts.oneShot,
    priority: opts.priority,
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
