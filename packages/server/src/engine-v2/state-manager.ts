// ──────────────────────────────────────────────
// Engine v2 — State Manager
// ──────────────────────────────────────────────
// Handles WorldState transitions, clamping, and updates.
// All mutations return new objects (immutable style).
// ──────────────────────────────────────────────

import type {
  WorldState,
  CharacterStateV2,
  CharacterDefinition,
  ScenarioPack,
  DirectorOutput,
  DirectorRelationshipUpdate,
  DirectorSubObjectiveUpdate,
  RelationshipEdge,
  NarrativeEvent,
  SubObjective,
  Objective,
} from "@hushline/shared";

const MAX_RECENT_EVENTS = 20;

// ──────────────────────────────────────────────
// Create Initial State
// ──────────────────────────────────────────────

export function createInitialWorldState(
  sessionId: string,
  pack: ScenarioPack,
): WorldState {
  const characterStates: Record<string, CharacterStateV2> = {};
  const relationshipGraph: RelationshipEdge[] = [];

  for (const charDef of pack.characters) {
    characterStates[charDef.id] = {
      id: charDef.id,
      currentObjective: charDef.handout.objective,
      knownFacts: [],
      relationshipToUser: charDef.handout.initialRelationshipToUser,
      lastSpokeTurn: -1,
      isRevealed: false,
      autonomy: charDef.autonomy,
    };

    for (const rel of charDef.relationships) {
      relationshipGraph.push({
        sourceId: charDef.id,
        targetId: rel.targetId,
        descriptor: rel.descriptor,
        intensity: rel.intensity,
      });
    }
  }

  return {
    sessionId,
    scenarioId: pack.manifest.id,
    sceneMode: pack.scenarioCard.initialSceneMode,
    locationId: pack.scenarioCard.initialLocationId,
    backgroundId: pack.scenarioCard.initialBackgroundId,
    tension: 3,
    danger: 2,
    turnNumber: 0,
    hasEnteredScene: true,
    mainObjective: {
      id: pack.mainObjective.id,
      description: pack.mainObjective.description,
      status: "active",
    },
    subObjectives: [],
    characterStates,
    relationshipGraph,
    recentEvents: [],
    recentSpeakerIds: [],
  };
}

// ──────────────────────────────────────────────
// Apply Director Output to State
// ──────────────────────────────────────────────

export function applyDirectorOutput(
  state: WorldState,
  directorOutput: DirectorOutput,
  speakerIds: string[],
): WorldState {
  let next = applyStateDelta(state, directorOutput.stateDelta);
  next = updateRecentSpeakers(next, speakerIds);
  next = incrementTurn(next);

  if (directorOutput.relationshipUpdate) {
    next = applyRelationshipUpdate(next, directorOutput.relationshipUpdate);
  }

  if (directorOutput.subObjectiveUpdate) {
    next = applySubObjectiveUpdate(next, directorOutput.subObjectiveUpdate);
  }

  if (directorOutput.event) {
    next = addNarrativeEvent(next, {
      id: crypto.randomUUID(),
      turnNumber: next.turnNumber,
      description: directorOutput.event,
      affectedCharacterIds: speakerIds,
    });
  }

  return next;
}

// ──────────────────────────────────────────────
// State Delta
// ──────────────────────────────────────────────

export function applyStateDelta(
  state: WorldState,
  delta: DirectorOutput["stateDelta"],
): WorldState {
  return {
    ...state,
    tension: clamp((state.tension + (delta.tension ?? 0)), 0, 10),
    danger: clamp((state.danger + (delta.danger ?? 0)), 0, 10),
    locationId: delta.locationId ?? state.locationId,
    backgroundId: delta.backgroundId ?? state.backgroundId,
    sceneMode: delta.sceneMode ?? state.sceneMode,
  };
}

// ──────────────────────────────────────────────
// Character State Updates
// ──────────────────────────────────────────────

export function markCharacterSpoke(
  state: WorldState,
  characterId: string,
): WorldState {
  const existing = state.characterStates[characterId];
  if (!existing) return state;

  return {
    ...state,
    characterStates: {
      ...state.characterStates,
      [characterId]: {
        ...existing,
        lastSpokeTurn: state.turnNumber,
      },
    },
  };
}

export function appendKnownFact(
  state: WorldState,
  characterId: string,
  fact: string,
): WorldState {
  const existing = state.characterStates[characterId];
  if (!existing) return state;

  return {
    ...state,
    characterStates: {
      ...state.characterStates,
      [characterId]: {
        ...existing,
        knownFacts: [...existing.knownFacts, fact].slice(-30),
      },
    },
  };
}

export function updateCharacterObjective(
  state: WorldState,
  characterId: string,
  objective: string,
): WorldState {
  const existing = state.characterStates[characterId];
  if (!existing) return state;

  return {
    ...state,
    characterStates: {
      ...state.characterStates,
      [characterId]: {
        ...existing,
        currentObjective: objective,
      },
    },
  };
}

export function updateRelationshipToUser(
  state: WorldState,
  characterId: string,
  delta: number,
): WorldState {
  const existing = state.characterStates[characterId];
  if (!existing) return state;

  return {
    ...state,
    characterStates: {
      ...state.characterStates,
      [characterId]: {
        ...existing,
        relationshipToUser: clamp(existing.relationshipToUser + delta, -10, 10),
      },
    },
  };
}

// ──────────────────────────────────────────────
// Relationship Graph
// ──────────────────────────────────────────────

export function applyRelationshipUpdate(
  state: WorldState,
  update: DirectorRelationshipUpdate,
): WorldState {
  const graph = [...state.relationshipGraph];
  const existingIndex = graph.findIndex(
    (edge) => edge.sourceId === update.sourceId && edge.targetId === update.targetId,
  );

  if (existingIndex >= 0) {
    const existing = graph[existingIndex]!;
    graph[existingIndex] = {
      ...existing,
      descriptor: update.descriptor,
      intensity: clamp(existing.intensity + update.intensityDelta, 0, 10),
    };
  } else {
    graph.push({
      sourceId: update.sourceId,
      targetId: update.targetId,
      descriptor: update.descriptor,
      intensity: clamp(5 + update.intensityDelta, 0, 10),
    });
  }

  return { ...state, relationshipGraph: graph };
}

// ──────────────────────────────────────────────
// Sub-Objectives
// ──────────────────────────────────────────────

export function applySubObjectiveUpdate(
  state: WorldState,
  update: DirectorSubObjectiveUpdate,
): WorldState {
  const subObjectives = [...state.subObjectives];

  switch (update.action) {
    case "create": {
      const newObj: SubObjective = {
        id: update.id ?? crypto.randomUUID(),
        description: update.description ?? "",
        status: "active",
        createdAtTurn: state.turnNumber,
        deliveredVia: update.deliveredVia ?? "dialogue",
      };
      subObjectives.push(newObj);
      break;
    }
    case "progress": {
      // No status change, just acknowledgment that progress was made
      break;
    }
    case "complete": {
      const idx = subObjectives.findIndex((o) => o.id === update.id);
      if (idx >= 0) {
        subObjectives[idx] = { ...subObjectives[idx]!, status: "completed" };
      }
      break;
    }
    case "fail": {
      const idx = subObjectives.findIndex((o) => o.id === update.id);
      if (idx >= 0) {
        subObjectives[idx] = { ...subObjectives[idx]!, status: "failed" };
      }
      break;
    }
  }

  return { ...state, subObjectives };
}

// ──────────────────────────────────────────────
// Narrative Events
// ──────────────────────────────────────────────

export function addNarrativeEvent(
  state: WorldState,
  event: NarrativeEvent,
): WorldState {
  const recentEvents = [...state.recentEvents, event].slice(-MAX_RECENT_EVENTS);
  return { ...state, recentEvents };
}

// ──────────────────────────────────────────────
// Turn Management
// ──────────────────────────────────────────────

function incrementTurn(state: WorldState): WorldState {
  return { ...state, turnNumber: state.turnNumber + 1 };
}

function updateRecentSpeakers(state: WorldState, speakerIds: string[]): WorldState {
  const recentSpeakerIds = [...speakerIds, ...state.recentSpeakerIds].slice(0, 6);
  return { ...state, recentSpeakerIds };
}

// ──────────────────────────────────────────────
// Undo Support
// ──────────────────────────────────────────────

export function rollbackTurn(state: WorldState): WorldState {
  return {
    ...state,
    turnNumber: Math.max(0, state.turnNumber - 1),
  };
}

// ──────────────────────────────────────────────
// Utilities
// ──────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
