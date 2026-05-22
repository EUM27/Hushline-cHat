// ──────────────────────────────────────────────
// Engine v2 — Context Builder
// ──────────────────────────────────────────────
// Assembles the three knowledge layers:
//   Public   → Narrator + Characters
//   Private  → One Character only
//   Omniscient → Director only
// ──────────────────────────────────────────────

import type {
  WorldState,
  PublicContext,
  PublicChatEntry,
  PrivateHandout,
  OmniscientContext,
  CharacterSummary,
  CharacterDefinition,
  ScenarioPack,
  TurnMessage,
  RelationshipEdge,
  EventTrigger,
  FactVisibility,
} from "@hushline/shared";
import { getAgentKnowledge } from "./visibility-graph.js";

const PUBLIC_CHAT_LOG_SIZE = 20;
const CHARACTER_CONTEXT_SIZE = 12;

type WorldStateWithVisibility = WorldState & {
  factVisibility?: FactVisibility[];
};

// ──────────────────────────────────────────────
// Public Context (Narrator + Characters see this)
// ──────────────────────────────────────────────

export function buildPublicContext(
  worldState: WorldState,
  messages: TurnMessage[],
  pack: ScenarioPack,
): PublicContext {
  const recentMessages = messages.slice(-PUBLIC_CHAT_LOG_SIZE);

  return {
    scenarioTitle: pack.scenarioCard.title,
    scenarioSubtitle: pack.scenarioCard.subtitle,
    sceneMode: worldState.sceneMode,
    currentLocation: worldState.locationId,
    currentBackground: worldState.backgroundId,
    tension: worldState.tension,
    danger: worldState.danger,
    turnNumber: worldState.turnNumber,
    publicChatLog: recentMessages.map(messageToPublicEntry),
    publicEvents: worldState.recentEvents.slice(-10).map((e) => e.description),
    mainObjectiveDescription: worldState.mainObjective.description,
  };
}

function messageToPublicEntry(message: TurnMessage): PublicChatEntry {
  return {
    role: message.role,
    label: message.speakerLabel ?? message.characterId ?? (message.role === "user" ? "유저" : ""),
    content: message.content,
    ...(message.inputMode ? { inputMode: message.inputMode } : {}),
  };
}

// ──────────────────────────────────────────────
// Private Handout (ONE Character only)
// ──────────────────────────────────────────────

export function buildPrivateHandout(
  characterId: string,
  worldState: WorldState,
  characters: CharacterDefinition[],
): PrivateHandout {
  const charDef = characters.find((c) => c.id === characterId);
  const charState = worldState.characterStates[characterId];

  if (!charDef || !charState) {
    return {
      characterId,
      secret: "",
      desire: "",
      objective: "",
      relationshipToUser: 0,
      knownFacts: [],
      myRelationships: [],
      autonomy: 0.5,
    };
  }

  // Only edges FROM this character
  const myRelationships = worldState.relationshipGraph.filter(
    (edge) => edge.sourceId === characterId,
  );

  const visibleFacts = getVisibleFactContents(worldState, characterId);

  return {
    characterId,
    secret: charDef.handout.secret,
    desire: charDef.handout.desire,
    objective: charState.currentObjective || charDef.handout.objective,
    relationshipToUser: charState.relationshipToUser,
    knownFacts: mergeKnownFacts(charState.knownFacts, visibleFacts),
    myRelationships,
    autonomy: charState.autonomy,
  };
}

function getVisibleFactContents(worldState: WorldState, characterId: string): string[] {
  const facts = (worldState as WorldStateWithVisibility).factVisibility ?? [];
  return getAgentKnowledge(facts, characterId).map((fact) => fact.content);
}

function mergeKnownFacts(existingFacts: string[], visibleFactContents: string[]): string[] {
  return [...new Set([...existingFacts, ...visibleFactContents])].slice(-30);
}

// ──────────────────────────────────────────────
// Omniscient Context (Director only)
// ──────────────────────────────────────────────

export function buildOmniscientContext(
  worldState: WorldState,
  characters: CharacterDefinition[],
  pack: ScenarioPack,
): OmniscientContext {
  const allSecrets: Record<string, string> = {};
  const allDesires: Record<string, string> = {};
  const allObjectives: Record<string, string> = {};

  for (const charDef of characters) {
    allSecrets[charDef.id] = charDef.handout.secret;
    allDesires[charDef.id] = charDef.handout.desire;
    const state = worldState.characterStates[charDef.id];
    allObjectives[charDef.id] = state?.currentObjective ?? charDef.handout.objective;
  }

  return {
    allSecrets,
    allDesires,
    allObjectives,
    fullRelationshipGraph: worldState.relationshipGraph,
    mainObjective: worldState.mainObjective,
    subObjectives: worldState.subObjectives,
    characterSummaries: buildCharacterSummaries(worldState, characters),
    eventTriggers: pack.eventTriggers,
    genreGoals: getGenreGoals(pack.manifest.genre),
    recentEvents: worldState.recentEvents.slice(-10),
  };
}

// ──────────────────────────────────────────────
// Character Summaries (for Director — no full prompts)
// ──────────────────────────────────────────────

export function buildCharacterSummaries(
  worldState: WorldState,
  characters: CharacterDefinition[],
): CharacterSummary[] {
  return characters.map((charDef) => {
    const state = worldState.characterStates[charDef.id];
    return {
      id: charDef.id,
      name: charDef.name,
      shortName: charDef.shortName,
      role: charDef.role,
      autonomy: charDef.autonomy,
      currentObjective: state?.currentObjective ?? charDef.handout.objective,
      secretHint: summarizeSecret(charDef.handout.secret),
      relationshipToUser: state?.relationshipToUser ?? charDef.handout.initialRelationshipToUser,
    };
  });
}

/**
 * Shorten a secret to a hint for Director context.
 * Director gets the full picture but in compressed form.
 */
function summarizeSecret(secret: string): string {
  if (secret.length <= 80) return secret;
  return secret.slice(0, 77) + "...";
}

// ──────────────────────────────────────────────
// Public Chat Log for Character Context
// ──────────────────────────────────────────────

/**
 * Build the chat context that a Character sees.
 * Uses a smaller window than Director and labels each message.
 */
export function buildCharacterChatContext(
  messages: TurnMessage[],
  characterId: string,
  personaName: string,
): PublicChatEntry[] {
  return messages.slice(-CHARACTER_CONTEXT_SIZE).map((message) => {
    let label: string;
    if (message.role === "user") {
      label = personaName;
    } else if (message.characterId === characterId) {
      label = "나";
    } else {
      label = message.speakerLabel ?? message.characterId ?? "";
    }
    return {
      role: message.role,
      label,
      content: message.content,
      ...(message.inputMode ? { inputMode: message.inputMode } : {}),
    };
  });
}

// ──────────────────────────────────────────────
// Genre Goals
// ──────────────────────────────────────────────

function getGenreGoals(genre: string): string {
  switch (genre) {
    case "horror":
      return [
        "유저를 고립시키고 불안하게 만든다.",
        "긴장을 점진적으로 올린다.",
        "캐릭터 조언이 완벽하게 통하지 않도록 상황을 비튼다.",
        "관계에 의심을 심는다.",
        "현실 침식을 진행한다.",
        "탈출을 지연시키되 항상 하나의 생존 경로를 남긴다.",
      ].join("\n");

    case "romance":
      return [
        "관계를 쉽게 이어주지 않는다.",
        "오해와 질투를 만든다.",
        "타이밍을 꼬이게 한다.",
        "감정을 증폭시킨다.",
        "고백/해소를 지연시킨다.",
        "캐릭터 간 삼각관계를 유도한다.",
      ].join("\n");

    case "mystery":
      return [
        "진실을 늦게 드러낸다.",
        "단서를 분산시킨다.",
        "거짓 정보를 섞는다.",
        "증거를 충돌시킨다.",
        "신뢰를 흔든다.",
        "조사를 보상하되 즉각적 해답은 주지 않는다.",
      ].join("\n");

    case "fantasy":
      return [
        "세계의 신비를 점진적으로 드러낸다.",
        "위험과 보상의 균형을 유지한다.",
        "파티 내 갈등을 유도한다.",
        "퀘스트 진행에 장애물을 배치한다.",
      ].join("\n");

    case "thriller":
      return [
        "시간 압박을 유지한다.",
        "배신 가능성을 암시한다.",
        "정보를 불완전하게 제공한다.",
        "위기를 연쇄적으로 발생시킨다.",
      ].join("\n");

    case "slice_of_life":
      return [
        "일상 속 작은 갈등을 만든다.",
        "관계 변화를 자연스럽게 유도한다.",
        "캐릭터 개인 사정을 드러낸다.",
        "평화로운 분위기를 유지하되 지루하지 않게 한다.",
      ].join("\n");

    default:
      return "스토리를 흥미롭게 진행하고 유저의 선택에 의미 있는 결과를 부여한다.";
  }
}
