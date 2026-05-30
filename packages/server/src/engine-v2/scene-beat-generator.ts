// ──────────────────────────────────────────────
// Engine v2 — Scene Beat Generator
// ──────────────────────────────────────────────
// Decides: "다음 장면 비트를 무엇으로 할 것인가"
// Replaces: ScenePressureGovernor / Anti-Stall
// ──────────────────────────────────────────────

import type { SceneOccurrenceDevice, WorldState } from "@hushline/shared";

export interface GeneratedBeat {
  deviceId: string;
  beatType: string;
  description: string;
  involvedNpcs: string[];
  stateDelta: {
    tension?: number;
    danger?: number;
    factReveals?: string[];
  };
}

const DEFAULT_INERTIA_THRESHOLD = 2;

/**
 * Check if a scene beat should be injected this turn.
 * @param sceneInertiaCounter turns elapsed without a meaningful event
 * @param threshold optional override (defaults to 2)
 */
export function shouldInjectBeat(sceneInertiaCounter: number, threshold = DEFAULT_INERTIA_THRESHOLD): boolean {
  return sceneInertiaCounter >= threshold;
}

/**
 * Decide whether the just-processed turn carried a meaningful event.
 * A meaningful event resets scene inertia.
 */
export function turnHadMeaningfulEvent(input: {
  hadCharacterSpeech: boolean;
  hadDirectorEvent: boolean;
  hadStateChange: boolean;
}): boolean {
  return input.hadCharacterSpeech || input.hadDirectorEvent || input.hadStateChange;
}

/**
 * Runtime leak guard: strip any hidden-truth fact ids from a beat's factReveals.
 * This is a defense-in-depth layer independent of scenario-load validation.
 */
export function sanitizeBeat(beat: GeneratedBeat, hiddenTruthIds: string[]): GeneratedBeat {
  const reveals = beat.stateDelta.factReveals;
  if (!reveals || reveals.length === 0) return beat;
  const blocked = new Set(hiddenTruthIds);
  const safe = reveals.filter((id) => !blocked.has(id));
  if (safe.length === reveals.length) return beat;
  const nextDelta = { ...beat.stateDelta };
  if (safe.length > 0) {
    nextDelta.factReveals = safe;
  } else {
    delete nextDelta.factReveals;
  }
  return { ...beat, stateDelta: nextDelta };
}

/**
 * Evaluate available devices and select the best beat to inject.
 */
export function selectBeat(
  devices: SceneOccurrenceDevice[],
  worldState: WorldState,
  recentBeatTypes: string[],
): GeneratedBeat | null {
  // Filter eligible devices
  const eligible = devices.filter((device) => {
    if (device.oneShot && isDeviceFired(device.id, worldState)) return false;
    if (!evaluateTrigger(device, worldState)) return false;
    return true;
  });

  if (eligible.length === 0) {
    // Fallback: quiet_texture
    return {
      deviceId: "fallback-quiet",
      beatType: "quiet_texture",
      description: "작은 환경 변화가 감지된다.",
      involvedNpcs: [],
      stateDelta: {},
    };
  }

  // Sort by priority, avoid recent beat types
  const sorted = eligible
    .filter((d) => !recentBeatTypes.slice(-2).includes(d.type))
    .sort((a, b) => (b.priority ?? 5) - (a.priority ?? 5));

  const selected = sorted[0] ?? eligible[0]!;

  const stateDelta: GeneratedBeat["stateDelta"] = {};
  if (selected.effect.stateDelta?.tension !== undefined) {
    stateDelta.tension = selected.effect.stateDelta.tension;
  }
  if (selected.effect.stateDelta?.danger !== undefined) {
    stateDelta.danger = selected.effect.stateDelta.danger;
  }
  if (selected.effect.stateDelta?.factReveals !== undefined) {
    stateDelta.factReveals = selected.effect.stateDelta.factReveals;
  }

  return {
    deviceId: selected.id,
    beatType: selected.type,
    description: selected.effect.sceneBeat,
    involvedNpcs: selected.effect.npcReactions?.map((r) => r.npcId) ?? [],
    stateDelta,
  };
}

/**
 * Increment or reset scene inertia counter.
 */
export function updateInertia(
  currentInertia: number,
  turnHadMeaningfulEvent: boolean,
): number {
  if (turnHadMeaningfulEvent) return 0;
  return currentInertia + 1;
}

// ── Helpers ──

function isDeviceFired(deviceId: string, worldState: WorldState): boolean {
  return worldState.recentEvents.some((e) => e.description.includes(deviceId));
}

function evaluateTrigger(device: SceneOccurrenceDevice, worldState: WorldState): boolean {
  // Simple condition evaluation — expand as needed
  const { conditionType, conditionValue } = device.trigger;
  
  if (conditionType === "state_threshold") {
    const val = conditionValue as { field: string; operator: string; value: number };
    const stateValue = (worldState as any)[val.field];
    if (val.operator === ">=" && typeof stateValue === "number") return stateValue >= val.value;
    if (val.operator === "<=" && typeof stateValue === "number") return stateValue <= val.value;
  }
  
  if (conditionType === "turn_count") {
    return worldState.turnNumber >= (conditionValue as number);
  }

  // Default: eligible
  return true;
}
