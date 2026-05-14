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

const INERTIA_THRESHOLD = 2;

/**
 * Check if a scene beat should be injected this turn.
 */
export function shouldInjectBeat(sceneInertiaCounter: number): boolean {
  return sceneInertiaCounter >= INERTIA_THRESHOLD;
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

  return {
    deviceId: selected.id,
    beatType: selected.type,
    description: selected.effect.sceneBeat,
    involvedNpcs: selected.effect.npcReactions?.map((r) => r.npcId) ?? [],
    stateDelta: {
      tension: selected.effect.stateDelta?.tension,
      danger: selected.effect.stateDelta?.danger,
      factReveals: selected.effect.stateDelta?.factReveals,
    },
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
