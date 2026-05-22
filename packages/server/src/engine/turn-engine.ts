import type {
  ActorReply,
  AdvisorDraft,
  CharacterProfile,
  ChatMessage,
  DirectorDecision,
  InputMode,
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
import { completeWithConnection, isConnectionReady } from "../providers/adapters";

export interface TurnResult {
  state: SessionState;
  scene: SceneState;
  messages: ChatMessage[];
  directorDecision: DirectorDecision;
}

export interface TurnOptions {
  connections?: Record<string, ModelConnection>;
  inputMode?: InputMode;
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
  const inputMode = options.inputMode ?? detectInputMode(userInput);
  const canonicalInput = stripInputModePrefix(userInput, inputMode);

  const userMessage = createMessage(state.id, "user", canonicalInput, undefined, undefined, undefined, undefined, undefined, undefined, inputMode);
  const sceneWithTurn = {
    ...state.scene,
    turnNumber: state.scene.turnNumber + 1,
  };
  const directorDecision = makeDirectorDecision(state, sceneWithTurn, canonicalInput, inputMode);

  // 나레이터: API 연결이 있으면 AI 생성, 없으면 하드코딩 폴백
  const narratorConnection = options.connections?.default;
  const scenarioMessages = await makeNarratorMessage(
    state,
    sceneWithTurn,
    canonicalInput,
    inputMode,
    directorDecision,
    narratorConnection,
  );
  const primarySpeakerId = routeSpeaker(state, sceneWithTurn, canonicalInput, directorDecision, inputMode);
  const primaryReply = await makeActorReply(
    state,
    sceneWithTurn,
    directorDecision,
    primarySpeakerId,
    canonicalInput,
    false,
    inputMode,
    getConnectionForSpeaker(options.connections, primarySpeakerId),
  );
  const replies = [primaryReply];

  const followUpSpeakerId = routeFollowUpSpeaker(
    state,
    sceneWithTurn,
    primarySpeakerId,
    canonicalInput,
    directorDecision,
  );

  if (followUpSpeakerId) {
    replies.push(
      await makeActorReply(
        state,
        sceneWithTurn,
        directorDecision,
        followUpSpeakerId,
        canonicalInput,
        true,
        inputMode,
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
  inputMode: InputMode,
  connection?: ModelConnection,
): Promise<ActorReply> {
  if (!isConnectionReady(connection)) {
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
      systemPrompt: buildActorSystemPrompt(character, state, scene, decision, isFollowUp, inputMode),
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

  const cleaned = stripSpeakerPrefix(content, character);
  return {
    characterId,
    content: cleaned || makeDryActorReply(state, characterId, input, isFollowUp).content,
    expression: "thinking",
    intent: "answer",
    wantsFollowUp: false,
    generationSource: "api",
  };
}

function stripSpeakerPrefix(raw: string, character: CharacterProfile): string {
  let text = raw.trim();
  // Drop up to 3 leading label lines in case the model replays context format.
  for (let index = 0; index < 3; index += 1) {
    const next = removeLeadingLabel(text, character);
    if (next === text) {
      break;
    }
    text = next.trim();
  }
  // Truncate at any point where another character's label appears mid-output.
  text = truncateAtForeignLabel(text, character);
  // Strip leading narration lines that precede the actual dialogue.
  text = stripLeadingNarration(text);
  return text;
}

/**
 * Some models (especially Kimi) prepend 1-2 lines of scene narration before their
 * actual character dialogue. This strips those leading narration lines.
 *
 * Heuristic: if the output has multiple paragraphs (separated by double newline)
 * and the first paragraph looks like narration (no direct speech markers, reads like
 * prose description), drop it and keep only the dialogue portion.
 */
function stripLeadingNarration(text: string): string {
  // Split on double newline or single newline followed by significant indent change
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim());
  if (paragraphs.length <= 1) {
    // Single paragraph — check if it's pure narration with no dialogue
    // If it contains direct speech patterns, keep it as-is
    return text;
  }

  // Check if first paragraph looks like narration (no dialogue markers)
  const first = paragraphs[0]?.trim() ?? "";
  const isNarration = looksLikeNarration(first);

  if (isNarration && paragraphs.length > 1) {
    // Drop the narration prefix, keep the rest
    return paragraphs.slice(1).join("\n\n").trim();
  }

  return text;
}

/**
 * Heuristic to detect if a text block is narration rather than dialogue.
 * Narration tends to: use descriptive/sensory language, end with periods,
 * not use casual speech patterns, not address anyone directly.
 */
function looksLikeNarration(text: string): boolean {
  // Sensory/descriptive keywords common in narration
  const narrationMarkers = [
    /냄새/, /소리/, /느껴/, /닿는다/, /스친다/, /들린다/, /보인다/,
    /어둠/, /빛/, /그림자/, /공기/, /바닥/, /천장/, /벽/,
    /~다\.$/, /~다\.\s/, /한다\./, /였다\./, /있다\./,
  ];
  // Dialogue markers — casual speech, questions to user, commands
  const dialogueMarkers = [
    /야\s/, /너\s/, /해\b/, /마\b/, /봐\b/, /말해/, /대답/,
    /\?$/, /ㅋ/, /ㅎ/, /ㅠ/, /시발/, /씨발/, /ㅈ/, /좆/,
    /~거든/, /~잖아/, /~인데/, /~는데/,
  ];

  const narrationScore = narrationMarkers.filter((p) => p.test(text)).length;
  const dialogueScore = dialogueMarkers.filter((p) => p.test(text)).length;

  // If narration signals outweigh dialogue signals, it's probably narration
  return narrationScore >= 2 && narrationScore > dialogueScore;
}

/**
 * If the model generated another character's label mid-output (e.g. "\n[익명 1]: ..."),
 * OR repeated its own label to continue writing (e.g. "\n[익명 9]: ..."),
 * cut everything from that point onward.
 * The first occurrence of the actor's own label at the very start is already handled
 * by removeLeadingLabel, so any subsequent label (own or foreign) means "new message"
 * which we don't allow.
 */
function truncateAtForeignLabel(text: string, _character: CharacterProfile): string {
  // Match newline followed by [라벨]: pattern — any label, including own
  const labelPattern = /\n\s*\[[^\]\n]{1,40}\]\s*[:：]?\s*/g;

  const match = labelPattern.exec(text);
  if (match && match.index > 0) {
    return text.slice(0, match.index).trim();
  }
  return text;
}

function removeLeadingLabel(text: string, character: CharacterProfile): string {
  // Matches `[익명 9]:`, `[익명 9] `, `익명 9:`, `홍길동:` at the very start.
  const bracketPattern = /^\s*\[[^\]\n]{1,40}\]\s*[:：>\-]?\s*/;
  if (bracketPattern.test(text)) {
    return text.replace(bracketPattern, "");
  }

  const names = new Set(
    [character.name, character.shortName, character.anonymousLabel]
      .filter((value): value is string => Boolean(value))
      .flatMap((value) => [value, value.replace(/^\[/, "").replace(/\]$/, "")]),
  );

  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const namePattern = new RegExp(`^\\s*${escaped}\\s*[:：>\\-]\\s*`);
    if (namePattern.test(text)) {
      return text.replace(namePattern, "");
    }
  }

  return text;
}

function buildActorSystemPrompt(
  character: CharacterProfile,
  state: SessionState,
  scene: SceneState,
  decision: DirectorDecision,
  isFollowUp: boolean,
  inputMode: InputMode,
): string {
  const nextLocation = decision.stateDelta.locationId ?? scene.locationId;
  const nextBackground = decision.stateDelta.backgroundId ?? scene.backgroundId;
  const hasEnteredScene = decision.stateDelta.hasEnteredScene ?? scene.hasEnteredScene;
  const displayName = character.anonymousLabel ?? character.name;

  const inputModeInstruction = INPUT_MODE_INSTRUCTIONS[inputMode];

  const sharedContract = [
    character.systemPrompt,
    "",
    "[Hushline actor contract]",
    `너는 오직 ${displayName}만 연기한다. 다른 익명 참가자, 방장, 현실 묘사를 대신 쓰지 않는다.`,
    "익명 조언자들은 서로 다른 인물이다. 이전 익명 참가자의 발화는 네 말이 아니라 관찰한 대화로만 취급한다.",
    "사용자가 모른다고 말해도 '이전 맥락 없음', '이전 대화 없음', '정보 부족' 같은 메타 답변으로 도망가지 않는다.",
    "사용자의 혼란은 장면 안에서 실제로 발생한 혼란으로 취급한다.",
    "한국어로만 답하고, 1~3문장으로 짧게 말한다.",
    "대사만 출력한다. 말머리에 네 이름, 익명 번호, 대괄호 라벨, '나:' 같은 prefix를 절대 붙이지 않는다.",
    "다른 사람의 라벨이 보이는 대화 로그는 참고용이다. 네 답변에 그 형식을 복제하지 않는다.",
    "장면 묘사, 감각 서술(냄새·소리·촉감), 지문(*행동*), 나레이션은 절대 출력하지 않는다. 그것은 별도 나레이터의 역할이다.",
    "너는 단톡방 참가자다. 채팅 메시지만 보낸다.",
    "절대로 다른 캐릭터의 대사를 생성하지 않는다. [익명 N]: 형태로 다른 사람의 말을 쓰면 안 된다. 네 발화만 출력한다.",
    "출력에 줄바꿈 후 다른 라벨이 등장하면 그 시점에서 멈춰야 한다.",
    "",
    "[user input mode]",
    inputModeInstruction,
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

/**
 * Per-mode instruction injected into every actor system prompt.
 * Tells the character how to interpret the user's latest input.
 */
const INPUT_MODE_INSTRUCTIONS: Record<InputMode, string> = {
  chat:
    "사용자의 입력은 단톡방에 타이핑한 채팅 메시지다. 다른 참가자들이 읽을 수 있는 발화로 취급한다. 채팅에 자연스럽게 반응한다.",
  action:
    "사용자의 입력은 장면 안에서 실제로 취한 행동 지문이다. 채팅 메시지가 아니라 물리적 행동이다. 그 행동의 결과나 반응을 장면 맥락에서 답한다. 행동이 위험하거나 규칙을 어기면 경고하거나 반응한다.",
  whisper:
    "사용자의 입력은 혼잣말 또는 내면의 독백이다. 단톡방에 올라온 메시지가 아니다. 다른 참가자는 이 내용을 들을 수 없다. 단, 너는 이 내면을 '감지'할 수 있는 특수한 존재라면 반응해도 된다. 그렇지 않다면 이 턴은 건너뛰거나 장면 분위기만 짧게 반영한다.",
};

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
  inputMode: InputMode,
): DirectorDecision {
  const dangerWords = ["정전", "뒤", "천장", "소리", "비명", "피", "문", "팻말"];
  const isOpeningAnswer = scene.turnNumber === 1;
  const wantsEveryone = /다들|전부|모두|반응/.test(input);
  const dangerDelta = dangerWords.some((word) => input.includes(word)) ? 1 : 0;

  // 행동 지문은 긴장도를 더 빠르게 올림
  const tensionBonus = inputMode === "action" ? 1 : 0;
  // 혼잣말은 캐릭터 반응을 줄임 (follow-up 억제)
  const suppressFollowUp = inputMode === "whisper";

  const modeNote =
    inputMode === "action"
      ? `사용자가 실제 행동을 취했다: "${input}". 행동의 결과와 위험을 반영해 반응한다.`
      : inputMode === "whisper"
        ? `사용자의 혼잣말이다: "${input}". 단톡방에 올라온 메시지가 아니므로 직접 반응은 최소화한다.`
        : "";

  return {
    sceneSignal: isOpeningAnswer ? "answer_opening_prompt" : "raise_tension",
    candidateSpeakerIds: state.characters.map((character) => character.id),
    primarySpeakerId: state.characters[0]?.id ?? "advisor-1",
    needsFollowUp: !suppressFollowUp && (wantsEveryone || input.includes("정전")),
    stateDelta: {
      locationId: state.scenario.initialLocationId,
      backgroundId: state.scenario.initialBackgroundId,
      hasEnteredScene: true,
      tension: isOpeningAnswer ? 2 : 1 + tensionBonus,
      danger: dangerDelta,
    },
    note: [
      isOpeningAnswer
        ? "첫 개입 답변이다. 익명 군중이 즉시 반응하고 조언자 한 명이 생존 지시를 보탠다."
        : "시나리오 카드를 유지하되 최근 발화자를 피하고 익명 단톡방 압박을 이어간다.",
      modeNote,
    ]
      .filter(Boolean)
      .join(" "),
  };
}

function routeSpeaker(
  state: SessionState,
  scene: SceneState,
  input: string,
  decision: DirectorDecision,
  inputMode: InputMode,
): string {
  const mentioned = findCharacterByMention(input, state.characters);
  if (mentioned) {
    return mentioned;
  }

  const lastSpeaker = scene.recentSpeakerIds[0] ?? null;
  const candidates = decision.candidateSpeakerIds.filter((id) => id !== lastSpeaker);
  const pool = candidates.length > 0 ? candidates : decision.candidateSpeakerIds;

  // 행동 지문이면 위험 감지형 캐릭터(advisor-1) 우선
  if (inputMode === "action") {
    return pool.includes("advisor-1") ? "advisor-1" : pool[0] ?? "advisor-1";
  }

  // 혼잣말이면 관찰형 캐릭터(advisor-2) 우선
  if (inputMode === "whisper") {
    return pool.includes("advisor-2") ? "advisor-2" : pool[0] ?? "advisor-2";
  }

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

async function makeNarratorMessage(
  state: SessionState,
  scene: SceneState,
  input: string,
  inputMode: InputMode,
  decision: DirectorDecision,
  connection?: ModelConnection,
): Promise<ChatMessage[]> {
  // 혼잣말은 나레이션 없음
  if (inputMode === "whisper") return [];

  // API 연결이 있으면 AI 나레이터 호출
  if (isConnectionReady(connection)) {
    try {
      const content = await completeWithConnection({
        connection,
        systemPrompt: buildNarratorSystemPrompt(state, scene, decision, inputMode),
        messages: buildNarratorContextMessages(state, input, inputMode),
      });
      const cleaned = content.trim();
      if (cleaned) {
        // 나레이터 출력에서 캐릭터 라벨이 나오면 그 이전까지만 사용
        const truncated = truncateNarratorAtCharacterLabel(cleaned);
        if (truncated) {
          return [
            {
              id: crypto.randomUUID(),
              sessionId: state.id,
              role: "narrator",
              content: truncated,
              speakerKind: "scenario-crowd",
              speakerLabel: "[나레이터]",
              generationSource: "api",
              createdAt: new Date().toISOString(),
            },
          ];
        }
      }
    } catch {
      // 폴백으로 진행
    }
  }

  // 폴백: 하드코딩 군중 반응
  return makeScenarioBeats(state, scene, input, inputMode);
}

/**
 * If the narrator model accidentally generated character dialogue (e.g. "[익명 1]: ..."),
 * truncate at that point so only pure narration remains.
 */
function truncateNarratorAtCharacterLabel(text: string): string {
  // Match [라벨]: pattern anywhere (including start of text after first sentence)
  const labelPattern = /\[익명\s*\d+\]\s*[:：]/;
  const match = labelPattern.exec(text);
  if (match && match.index > 0) {
    return text.slice(0, match.index).trim();
  }
  if (match && match.index === 0) {
    // Entire output starts with a character label — discard
    return "";
  }
  return text;
}

function buildNarratorSystemPrompt(
  state: SessionState,
  scene: SceneState,
  decision: DirectorDecision,
  inputMode: InputMode,
): string {
  const location = decision.stateDelta.locationId ?? scene.locationId;
  const lines = [
    "[나레이터 역할]",
    "너는 이 장면의 나레이터다. 캐릭터를 연기하지 않는다. 장면의 감각, 공간, 분위기, 사건의 결과만 서술한다.",
    "한국어로만 쓴다. 1~2문장, 단문 위주. 압박감 있는 서늘한 문체.",
    "캐릭터 대사를 쓰지 않는다. 익명 번호, 방장 발화를 흉내 내지 않는다.",
    "[익명 N]: 형태의 대사를 절대 생성하지 않는다. 대화체를 쓰지 않는다.",
    "출력은 나레이션 텍스트만. 라벨, prefix 없음.",
    "감각 묘사(시각, 청각, 촉각, 후각)와 공간 변화만 서술한다.",
    "",
    "[현재 장면]",
    `시나리오: ${state.scenario.title} — ${state.scenario.subtitle}`,
    `위치: ${location}`,
    `긴장도: ${scene.tension} / 위험도: ${scene.danger}`,
    `입력 유형: ${inputMode === "action" ? "행동 지문" : "채팅"}`,
    `장면 지시: ${decision.note}`,
    "",
    "[공간 규칙]",
    ...state.scenario.spaceRules,
    "",
    "[톤 규칙]",
    ...state.scenario.toneRules,
    ...state.scenario.hardNos.map((r) => `금지: ${r}`),
  ];
  return lines.join("\n");
}

function buildNarratorContextMessages(
  state: SessionState,
  input: string,
  inputMode: InputMode,
): ChatMessage[] {
  // 최근 메시지 6개 + 현재 입력
  const recent = state.messages.slice(-6).map((m) => {
    const label =
      m.role === "user"
        ? state.persona.name
        : (m.speakerLabel ?? m.characterId ?? "");
    return { ...m, role: "user" as const, content: `${label}: ${m.content}` };
  });

  const inputLabel =
    inputMode === "action" ? `[행동] ${input}` : `${state.persona.name}: ${input}`;

  return [
    ...recent,
    {
      id: crypto.randomUUID(),
      sessionId: state.id,
      role: "user" as const,
      content: inputLabel,
      createdAt: new Date().toISOString(),
    },
  ];
}

function makeScenarioBeats(
  state: SessionState,
  scene: SceneState,
  input: string,
  inputMode: InputMode,
): ChatMessage[] {
  const isOpeningAnswer = scene.turnNumber === 1;

  if (inputMode === "whisper") {
    // 혼잣말엔 군중 반응 없음
    return [];
  }

  const speakerLabel = isOpeningAnswer ? "[익명 4]" : "[익명 7]";
  const content = isOpeningAnswer
    ? `${input.includes("2") ? "2반" : "거기"}이면 오른쪽 계단부터 보지 마. 방장이 처음에 그쪽으로 몰아넣어.`
    : inputMode === "action"
      ? "채팅방에 아무 말도 없는데, 복도 불빛이 한 칸씩 꺼지기 시작했어."
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
  inputMode?: InputMode,
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
    ...(inputMode ? { inputMode } : {}),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ---------------------------------------------------------------------------
// Input mode detection — text convention parser
// ---------------------------------------------------------------------------
// These patterns let users type conventions directly without using the UI toggle.
// The UI button is the primary path; these are the secondary (text) path.
//
// Supported conventions:
//   action : *text*  //text  /me text
//   whisper: (text)  ((text))  [혼잣말] text
//   chat   : everything else (default)

const ACTION_PATTERNS = [
  /^\*[^*]+\*$/, // *행동*
  /^\/\//, // //행동
  /^\/me\s/i, // /me 행동
];

const WHISPER_PATTERNS = [
  /^\(+[^)]+\)+$/, // (혼잣말) 또는 ((혼잣말))
  /^\[혼잣말\]/,
  /^\[독백\]/,
  /^\[내면\]/,
];

/**
 * Detect InputMode from raw text when no explicit mode was sent by the client.
 * This is the "text convention" path — the UI toggle takes priority.
 */
export function detectInputMode(raw: string): InputMode {
  const trimmed = raw.trim();
  if (ACTION_PATTERNS.some((pattern) => pattern.test(trimmed))) return "action";
  if (WHISPER_PATTERNS.some((pattern) => pattern.test(trimmed))) return "whisper";
  return "chat";
}

/**
 * Strip the convention prefix/wrapper so the engine sees clean content.
 * e.g. "*계단 쪽으로 뛴다*" → "계단 쪽으로 뛴다"
 */
export function stripInputModePrefix(raw: string, mode: InputMode): string {
  const trimmed = raw.trim();
  if (mode === "action") {
    // *text* → text
    if (/^\*[^*]+\*$/.test(trimmed)) return trimmed.slice(1, -1).trim();
    // //text → text
    if (/^\/\//.test(trimmed)) return trimmed.slice(2).trim();
    // /me text → text
    if (/^\/me\s/i.test(trimmed)) return trimmed.replace(/^\/me\s+/i, "").trim();
  }
  if (mode === "whisper") {
    // (text) or ((text)) → text
    if (/^\(+([^)]+)\)+$/.test(trimmed)) {
      return trimmed.replace(/^\(+/, "").replace(/\)+$/, "").trim();
    }
    // [혼잣말] text → text
    if (/^\[(혼잣말|독백|내면)\]/.test(trimmed)) {
      return trimmed.replace(/^\[[^\]]+\]\s*/, "").trim();
    }
  }
  return trimmed;
}
