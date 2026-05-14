// ──────────────────────────────────────────────
// Engine v2 — NPC Agenda Scheduler
// ──────────────────────────────────────────────
// Decides: "NPC가 왜 숨기거나 왜곡하거나 먼저 움직이는가"
// ──────────────────────────────────────────────

import type { CharacterDefinition, CharacterStateV2 } from "@hushline/shared";

export interface AgendaOutput {
  currentGoal: string;
  constraint: string;
  nextAction: string;
  hideMotivation: string;
  shouldActAutonomously: boolean;
}

/**
 * Get the current agenda for an NPC based on their state and definition.
 */
export function getCurrentAgenda(
  character: CharacterDefinition,
  state: CharacterStateV2,
): AgendaOutput {
  return {
    currentGoal: state.currentObjective || character.handout.objective,
    constraint: character.handout.behaviorRules?.join("; ") ?? "",
    nextAction: inferNextAction(character, state),
    hideMotivation: character.handout.secret ? "비밀 보호" : "",
    shouldActAutonomously: state.autonomy >= 0.7 && state.lastSpokeTurn < (state as any).turnNumber - 2,
  };
}

/**
 * Check if an NPC should take autonomous action this turn
 * (even without being selected by Director).
 */
export function shouldActAutonomously(
  state: CharacterStateV2,
  currentTurn: number,
): boolean {
  // High autonomy + hasn't spoken in 3+ turns = might act on own
  if (state.autonomy < 0.7) return false;
  if (currentTurn - state.lastSpokeTurn < 3) return false;
  return Math.random() < state.autonomy * 0.3; // Probabilistic
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
