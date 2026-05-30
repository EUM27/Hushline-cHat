// ──────────────────────────────────────────────
// Engine v2 — NPC Agenda Scheduler
// ──────────────────────────────────────────────
// Decides: "NPC가 왜 숨기거나 왜곡하거나 먼저 움직이는가"
// ──────────────────────────────────────────────

import type { CharacterDefinition, CharacterStateV2, WorldState } from "@hushline/shared";

export interface AgendaOutput {
  currentGoal: string;
  constraint: string;
  nextAction: string;
  hideMotivation: string;
  shouldActAutonomously: boolean;
}

export interface AutonomyOptions {
  /** Minimum autonomy required to act on one's own (default 0.7). */
  minAutonomy?: number;
  /** Minimum turns of silence before acting autonomously (default 3). */
  minSilenceTurns?: number;
}

const DEFAULT_MIN_AUTONOMY = 0.7;
const DEFAULT_MIN_SILENCE_TURNS = 3;

/**
 * Get the current agenda for an NPC based on their state and definition.
 */
export function getCurrentAgenda(
  character: CharacterDefinition,
  state: CharacterStateV2,
  currentTurn: number,
): AgendaOutput {
  return {
    currentGoal: state.currentObjective || character.handout.objective,
    constraint: character.handout.behaviorRules?.join("; ") ?? "",
    nextAction: inferNextAction(character, state),
    hideMotivation: character.handout.secret ? "비밀 보호" : "",
    shouldActAutonomously: isAutonomyEligible(state, currentTurn),
  };
}

/**
 * Deterministic eligibility gate: is this NPC allowed to act on its own this turn?
 * No randomness — same inputs always produce the same result.
 */
export function isAutonomyEligible(
  state: CharacterStateV2,
  currentTurn: number,
  opts: AutonomyOptions = {},
): boolean {
  const minAutonomy = opts.minAutonomy ?? DEFAULT_MIN_AUTONOMY;
  const minSilence = opts.minSilenceTurns ?? DEFAULT_MIN_SILENCE_TURNS;
  if (state.autonomy < minAutonomy) return false;
  const silenceTurns = currentTurn - state.lastSpokeTurn;
  return silenceTurns >= minSilence;
}

/**
 * Check if an NPC should take autonomous action this turn
 * (even without being selected by Director).
 *
 * Deterministic wrapper around {@link isAutonomyEligible}.
 */
export function shouldActAutonomously(
  state: CharacterStateV2,
  currentTurn: number,
  opts: AutonomyOptions = {},
): boolean {
  return isAutonomyEligible(state, currentTurn, opts);
}

/**
 * Director가 아무도 선택하지 않은 턴에 자율 발화할 NPC 1명을 결정적으로 고른다.
 * 정렬: (1) 더 오래 침묵한 NPC → (2) autonomy 높은 NPC → (3) 정의 순서.
 */
export function selectAutonomousSpeaker(
  characters: CharacterDefinition[],
  worldState: WorldState,
  currentTurn: number,
  opts: AutonomyOptions = {},
): string | undefined {
  const eligible = characters.filter((character) => {
    const state = worldState.characterStates[character.id];
    return state ? isAutonomyEligible(state, currentTurn, opts) : false;
  });
  if (eligible.length === 0) return undefined;

  return [...eligible].sort((a, b) => {
    const stateA = worldState.characterStates[a.id]!;
    const stateB = worldState.characterStates[b.id]!;
    const silenceA = currentTurn - stateA.lastSpokeTurn;
    const silenceB = currentTurn - stateB.lastSpokeTurn;
    if (silenceA !== silenceB) return silenceB - silenceA;
    if (stateB.autonomy !== stateA.autonomy) return stateB.autonomy - stateA.autonomy;
    return characters.indexOf(a) - characters.indexOf(b);
  })[0]?.id;
}

/**
 * Update agenda after a goal is achieved or failed.
 */
export function updateAgendaOnEvent(
  state: CharacterStateV2,
  event: "goal_achieved" | "goal_failed" | "new_information" | "relationship_change",
  newObjective?: string,
): CharacterStateV2 {
  switch (event) {
    case "goal_achieved":
    case "goal_failed":
      return {
        ...state,
        currentObjective: newObjective ?? state.currentObjective,
      };
    case "new_information":
      // Agenda might shift based on new info
      return state;
    case "relationship_change":
      return state;
    default:
      return state;
  }
}

// ── Helpers ──

function inferNextAction(character: CharacterDefinition, state: CharacterStateV2): string {
  if (state.knownFacts.length === 0) {
    return "상황을 관찰하고 정보를 수집한다";
  }
  if (state.relationshipToUser < -3) {
    return "유저를 경계하며 거리를 둔다";
  }
  if (state.relationshipToUser > 5) {
    return "유저를 돕되 자신의 비밀은 지킨다";
  }
  return "현재 목표를 향해 조심스럽게 행동한다";
}
