import type {
  ActorReply,
  AdvisorDraft,
  CharacterProfile,
  ChatMessage,
  DirectorDecision,
  ModelConnection,
  SceneState,
  SessionState,
} from "@hushline/shared";
import {
  createAdvisorCharacters,
  defaultPersona,
  findCharacterByMention,
} from "./characters";
import { defaultScenarioCard } from "./scenarios";
import { completeWithConnection } from "../providers/adapters";

export interface TurnResult {
  state: SessionState;
  scene: SceneState;
  messages: ChatMessage[];
  directorDecision: DirectorDecision;
}

export interface TurnOptions {
  connections?: Record<string, ModelConnection>;
}

export interface CreateSessionOptions {
  persona?: Partial<Pick<SessionState["persona"], "name">>;
  advisors?: AdvisorDraft[];
}

export function createInitialSessionState(
  sessionId: string,
  options: CreateSessionOptions = {},
): SessionState {
  const now = new Date().toISOString();
  const persona = createPersona(options.persona);
  const characters = createAdvisorCharacters(persona, options.advisors);
  const relationships = Object.fromEntries(characters.map((character) => [character.id, 0]));
  const scenario = defaultScenarioCard;

  return {
    id: sessionId,
    title: scenario.title,
    persona,
    scenario,
    scene: {
      sessionId,
      scenarioId: scenario.id,
      locationId: scenario.initialLocationId,
      backgroundId: scenario.initialBackgroundId,
      activeSpeakerId: "room-master",
      tension: 3,
      danger: 2,
      turnNumber: 0,
      hasEnteredScene: true,
      recentSpeakerIds: [],
      relationships,
    },
    characters,
    messages: createOpeningMessages(sessionId, scenario.openingBeats, now),
    createdAt: now,
    updatedAt: now,
  };
}

export async function runDryTurn(
  state: SessionState,
  userInput: string,
): Promise<TurnResult> {
  return runTurn(state, userInput);
}

export async function runTurn(
  state: SessionState,
  userInput: string,
  options: TurnOptions = {},
): Promise<TurnResult> {
  const userMessage = createMessage(state.id, "user", userInput);
  const sceneWithTurn = {
    ...state.scene,
    turnNumber: state.scene.turnNumber + 1,
  };
  const directorDecision = makeDirectorDecision(state, sceneWithTurn, userInput);
  const scenarioMessages = makeScenarioBeats(state, sceneWithTurn, userInput);
  const primarySpeakerId = routeSpeaker(state, sceneWithTurn, userInput, directorDecision);
  const primaryReply = await makeActorReply(
    state,
    sceneWithTurn,
    directorDecision,
    primarySpeakerId,
    userInput,
    false,
    getConnectionForSpeaker(options.connections, primarySpeakerId),
  );
  const replies = [primaryReply];

  const followUpSpeakerId = routeFollowUpSpeaker(
    state,
    sceneWithTurn,
    primarySpeakerId,
    userInput,
    directorDecision,
  );

  if (followUpSpeakerId) {
    replies.push(
      await makeActorReply(
        state,
        sceneWithTurn,
        directorDecision,
        followUpSpeakerId,
        userInput,
        true,
        getConnectionForSpeaker(options.connections, followUpSpeakerId),
      ),
    );
  }

  const characterMessages = replies.map((reply) =>
    createActorMessage(state, reply),
  );
  const nextScene = analyzeScene(sceneWithTurn, directorDecision, replies);
  const nextMessages = [userMessage, ...scenarioMessages, ...characterMessages];
  const nextState: SessionState = {
    ...state,
    scene: nextScene,
    messages: [...state.messages, ...nextMessages],
    updatedAt: new Date().toISOString(),
  };

  const finalDecision: DirectorDecision = {
    ...directorDecision,
    primarySpeakerId,
    needsFollowUp: Boolean(followUpSpeakerId),
    ...(followUpSpeakerId ? { followUpSpeakerId } : {}),
  };

  return {
    state: nextState,
    scene: nextScene,
    messages: nextMessages,
    directorDecision: finalDecision,
  };
}

async function makeActorReply(
  state: SessionState,
  scene: SceneState,
  decision: DirectorDecision,
  characterId: string,
  input: string,
  isFollowUp: boolean,
  connection?: ModelConnection,
): Promise<ActorReply> {
  if (!connection?.apiKey || !connection.model) {
    return makeDryActorReply(state, characterId, input, isFollowUp);
  }

  const character = state.characters.find((candidate) => candidate.id === characterId);
  if (!character) {
    return makeDryActorReply(state, characterId, input, isFollowUp);
  }

  let content: string;
  try {
    content = await completeWithConnection({
      connection,
      systemPrompt: buildActorSystemPrompt(character, state, scene, decision, isFollowUp),
      messages: buildActorContextMessages(state, characterId, input),
    });
  } catch (reason: unknown) {
    return makeDryActorReply(
      state,
      characterId,
      input,
      isFollowUp,
      reason instanceof Error ? reason.message : "Provider request failed",
    );
  }

  return {
    characterId,
    content: content.trim() || makeDryActorReply(state, characterId, input, isFollowUp).content,
    expression: "thinking",
    intent: "answer",
    wantsFollowUp: false,
    generationSource: "api",
  };
}

function buildActorSystemPrompt(
  character: CharacterProfile,
  state: SessionState,
  scene: SceneState,
  decision: DirectorDecision,
  isFollowUp: boolean,
): string {
  const nextLocation = decision.stateDelta.locationId ?? scene.locationId;
  const nextBackground = decision.stateDelta.backgroundId ?? scene.backgroundId;
  const hasEnteredScene = decision.stateDelta.hasEnteredScene ?? scene.hasEnteredScene;
  const displayName = character.anonymousLabel ?? character.name;
  const sharedContract = [
    character.systemPrompt,
    "",
    "[Hushline actor contract]",
    `너는 오직 ${displayName}만 연기한다. 다른 익명 참가자, 방장, 현실 묘사를 대신 쓰지 않는다.`,
    "익명 조언자들은 서로 다른 인물이다. 이전 익명 참가자의 발화는 네 말이 아니라 관찰한 대화로만 취급한다.",
    "사용자가 모른다고 말해도 '이전 맥락 없음', '이전 대화 없음', '정보 부족' 같은 메타 답변으로 도망가지 않는다.",
    "사용자의 혼란은 장면 안에서 실제로 발생한 혼란으로 취급한다.",
    "한국어로만 답하고, 1~3문장으로 짧게 말한다.",
    "",
    "[current scene]",
    `시나리오: ${state.scenario.title} (${state.scenario.subtitle})`,
    `사용자 페르소나: ${state.persona.name} (${state.persona.role})`,
    `현재 위치: ${nextLocation}`,
    `배경: ${nextBackground}`,
    `장면 진입 여부: ${hasEnteredScene ? "이상공간 내부" : "메신저 화면 상태"}`,
    `긴장도: ${scene.tension}`,
    `위험도: ${scene.danger}`,
    `장면 지시: ${decision.note}`,
    isFollowUp ? "이번 발화는 후속 반응이다. 앞사람 말을 침범하지 말고 짧게 보탠다." : "",
    "",
    "[known facts]",
    "{{유저}}는 지금 상황을 완전히 알지 못한다.",
    ...state.scenario.spaceRules,
    ...state.scenario.chatRules,
    "",
    "[voice rules]",
    ...state.scenario.toneRules,
    ...state.scenario.hardNos.map((rule) => `금지: ${rule}`),
  ];

  return sharedContract.filter(Boolean).join("\n");
}

function buildActorContextMessages(
  state: SessionState,
  actorCharacterId: string,
  input: string,
): ChatMessage[] {
  const contextMessages = state.messages.slice(-12).map((message) => {
    if (message.role === "user") {
      return {
        ...message,
        content: `${state.persona.name}: ${message.content}`,
      };
    }

    if (message.role === "character" && message.characterId !== actorCharacterId) {
      return {
        ...message,
        role: "user" as const,
        content: `${getSpeakerLabel(state, message)}: ${message.content}`,
      };
    }

    if (message.role === "character") {
      return {
        ...message,
        content: `${getSpeakerLabel(state, message)}: ${message.content}`,
      };
    }

    if (message.speakerLabel) {
      return {
        ...message,
        role: "user" as const,
        content: `${message.speakerLabel}: ${message.content}`,
      };
    }

    return message;
  });

  return [...contextMessages, createMessage(state.id, "user", `${state.persona.name}: ${input}`)];
}

function getSpeakerLabel(state: SessionState, message: ChatMessage): string {
  if (message.speakerLabel) {
    return message.speakerLabel;
  }

  return (
    state.characters.find((character) => character.id === message.characterId)?.anonymousLabel ??
    state.characters.find((character) => character.id === message.characterId)?.name ??
    message.characterId ??
    "다른 인물"
  );
}

function getConnectionForSpeaker(
  connections: Record<string, ModelConnection> | undefined,
  speakerId: string,
): ModelConnection | undefined {
  return connections?.[speakerId] ?? connections?.default;
}

function createActorMessage(state: SessionState, reply: ActorReply): ChatMessage {
  const character = state.characters.find((candidate) => candidate.id === reply.characterId);
  return createMessage(
    state.id,
    "character",
    reply.content,
    reply.characterId,
    reply.expression,
    reply.generationSource,
    reply.fallbackReason,
    character?.profileKind ?? "advisor-slot",
    character?.anonymousLabel ?? character?.name ?? reply.characterId,
  );
}

function makeDirectorDecision(
  state: SessionState,
  scene: SceneState,
  input: string,
): DirectorDecision {
  const dangerWords = ["정전", "뒤", "천장", "소리", "비명", "피", "문", "팻말"];
  const isOpeningAnswer = scene.turnNumber === 1;
  const wantsEveryone = /다들|전부|모두|반응/.test(input);
  const dangerDelta = dangerWords.some((word) => input.includes(word)) ? 1 : 0;

  return {
    sceneSignal: isOpeningAnswer ? "answer_opening_prompt" : "raise_tension",
    candidateSpeakerIds: state.characters.map((character) => character.id),
    primarySpeakerId: state.characters[0]?.id ?? "advisor-1",
    needsFollowUp: wantsEveryone || input.includes("정전"),
    stateDelta: {
      locationId: state.scenario.initialLocationId,
      backgroundId: state.scenario.initialBackgroundId,
      hasEnteredScene: true,
      tension: isOpeningAnswer ? 2 : 1,
      danger: dangerDelta,
    },
    note: isOpeningAnswer
      ? "첫 개입 답변이다. 익명 군중이 즉시 반응하고 조언자 한 명이 생존 지시를 보탠다."
      : "시나리오 카드를 유지하되 최근 발화자를 피하고 익명 단톡방 압박을 이어간다.",
  };
}

function routeSpeaker(
  state: SessionState,
  scene: SceneState,
  input: string,
  decision: DirectorDecision,
): string {
  const mentioned = findCharacterByMention(input, state.characters);
  if (mentioned) {
    return mentioned;
  }

  const lastSpeaker = scene.recentSpeakerIds[0] ?? null;
  const candidates = decision.candidateSpeakerIds.filter((id) => id !== lastSpeaker);
  const pool = candidates.length > 0 ? candidates : decision.candidateSpeakerIds;

  if (input.includes("다른") || input.includes("생각") || input.includes("익명 9")) {
    return pool.includes("advisor-2") ? "advisor-2" : pool[0] ?? "advisor-2";
  }

  if (input.includes("소리") || input.includes("뒤") || input.includes("천장")) {
    return pool.includes("advisor-1") ? "advisor-1" : pool[0] ?? "advisor-1";
  }

  return pool[0] ?? "advisor-1";
}

function routeFollowUpSpeaker(
  state: SessionState,
  scene: SceneState,
  primarySpeakerId: string,
  input: string,
  decision: DirectorDecision,
): string | null {
  if (!decision.needsFollowUp) {
    return null;
  }

  const candidates = decision.candidateSpeakerIds.filter(
    (id) => id !== primarySpeakerId && id !== scene.recentSpeakerIds[0],
  );

  return (
    candidates[0] ??
    state.characters.find((character) => character.id !== primarySpeakerId)?.id ??
    null
  );
}

function makeDryActorReply(
  state: SessionState,
  characterId: string,
  input: string,
  isFollowUp: boolean,
  fallbackReason?: string,
): ActorReply {
  if (characterId === "advisor-1") {
    const tense = input.includes("뒤") || input.includes("소리") || input.includes("천장");
    return {
      characterId,
      content: tense
        ? "뒤돌아보지 마. 팻말 확인했으면 벽에 등 붙이고, 천장 소리랑 눈 마주치지 마."
        : "팻말 먼저 봐. 몇 반인지, 복도 끝이 왼쪽으로 꺾이는지부터 말해.",
      expression: tense ? "thinking" : "neutral",
      intent: tense ? "warn" : "answer",
      wantsFollowUp: false,
      generationSource: "dry-run",
      ...(fallbackReason ? { fallbackReason } : {}),
    };
  }

  const scenarioPrompt = state.scenario.interventionPrompt;
  return {
    characterId,
    content: isFollowUp
      ? `나도 ${scenarioPrompt} 그거부터 봐야 한다고 생각해. 근데 복도 불빛이 꺼지는 칸은 세지 마.`
      : "혹시 교실 문 위에 붙은 팻말이면, 숫자 말하고 바로 고개 숙여. 유리창 쪽은 오래 보지 마.",
    expression: "worried",
    intent: "warn",
    wantsFollowUp: false,
    generationSource: "dry-run",
    ...(fallbackReason ? { fallbackReason } : {}),
  };
}

function analyzeScene(
  scene: SceneState,
  decision: DirectorDecision,
  replies: ActorReply[],
): SceneState {
  const primary = replies[0];
  const speakerIds = replies.map((reply) => reply.characterId);
  const tensionDelta = decision.stateDelta.tension ?? 0;
  const dangerDelta = decision.stateDelta.danger ?? 0;

  return {
    ...scene,
    locationId: decision.stateDelta.locationId ?? scene.locationId,
    backgroundId: decision.stateDelta.backgroundId ?? scene.backgroundId,
    activeSpeakerId: primary?.characterId ?? scene.activeSpeakerId,
    tension: clamp(scene.tension + tensionDelta, 0, 10),
    danger: clamp(scene.danger + dangerDelta, 0, 10),
    hasEnteredScene: decision.stateDelta.hasEnteredScene ?? scene.hasEnteredScene,
    recentSpeakerIds: [...speakerIds, ...scene.recentSpeakerIds].slice(0, 6),
  };
}

function createPersona(
  personaInput: CreateSessionOptions["persona"] = {},
): SessionState["persona"] {
  const trimmedName = personaInput.name?.trim();
  return {
    ...defaultPersona,
    name: trimmedName || defaultPersona.name,
    shortName: trimmedName || defaultPersona.shortName,
  };
}

function createOpeningMessages(
  sessionId: string,
  beats: SessionState["scenario"]["openingBeats"],
  createdAt: string,
): ChatMessage[] {
  return beats.map((beat) => ({
    id: crypto.randomUUID(),
    sessionId,
    role: beat.role,
    content: beat.content,
    speakerKind: beat.speakerKind,
    speakerLabel: beat.speakerLabel,
    isOpeningBeat: true,
    createdAt,
  }));
}

function makeScenarioBeats(
  state: SessionState,
  scene: SceneState,
  input: string,
): ChatMessage[] {
  const isOpeningAnswer = scene.turnNumber === 1;
  const speakerLabel = isOpeningAnswer ? "[익명 4]" : "[익명 7]";
  const content = isOpeningAnswer
    ? `${input.includes("2") ? "2반" : "거기"}이면 오른쪽 계단부터 보지 마. 방장이 처음에 그쪽으로 몰아넣어.`
    : "방금 그 말 채팅방에 올라온 순간, 복도 불빛이 한 칸씩 꺼졌어.";

  return [
    {
      id: crypto.randomUUID(),
      sessionId: state.id,
      role: "narrator",
      content,
      speakerKind: "scenario-crowd",
      speakerLabel,
      createdAt: new Date().toISOString(),
    },
  ];
}

function createMessage(
  sessionId: string,
  role: ChatMessage["role"],
  content: string,
  characterId?: string,
  expression?: ChatMessage["expression"],
  generationSource?: ChatMessage["generationSource"],
  fallbackReason?: string,
  speakerKind?: ChatMessage["speakerKind"],
  speakerLabel?: string,
): ChatMessage {
  return {
    id: crypto.randomUUID(),
    sessionId,
    role,
    content,
    createdAt: new Date().toISOString(),
    ...(characterId ? { characterId } : {}),
    ...(speakerKind ? { speakerKind } : {}),
    ...(speakerLabel ? { speakerLabel } : {}),
    ...(expression ? { expression } : {}),
    ...(generationSource ? { generationSource } : {}),
    ...(fallbackReason ? { fallbackReason } : {}),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
