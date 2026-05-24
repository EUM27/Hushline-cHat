// ──────────────────────────────────────────────
// Engine v2 — Character Agent
// ──────────────────────────────────────────────
// Each character is invoked separately with only its own handout.
// Outputs dialogue only — no narration, no other characters.
// ──────────────────────────────────────────────

import type {
  InputMode,
  ModelConnection,
  PublicContext,
  PrivateHandout,
  CharacterDefinition,
  ScenarioPack,
  TurnMessage,
  ActorReply,
  ExpressionId,
} from "@hushline/shared";
import { completeWithConnection, isConnectionReady } from "../providers/adapters/index.js";
import { sanitizeCharacterOutput } from "./output-sanitizer.js";
import { buildCharacterChatContext } from "./context-builder.js";

export interface CharacterInvocationResult {
  characterId: string;
  content: string;
  source: "api" | "dry-run";
  error?: string;
}

/**
 * Invoke a single Character agent.
 */
export async function invokeCharacter(
  character: CharacterDefinition,
  handout: PrivateHandout,
  directorIntent: string,
  inputMode: InputMode,
  userInput: string,
  publicContext: PublicContext,
  messages: TurnMessage[],
  personaName: string,
  pack: ScenarioPack,
  connection?: ModelConnection,
): Promise<CharacterInvocationResult> {
  if (!isConnectionReady(connection)) {
    return {
      characterId: character.id,
      content: makeFallbackReply(character, userInput),
      source: "dry-run",
    };
  }

  const systemPrompt = buildCharacterSystemPrompt(
    character, handout, directorIntent, inputMode, publicContext, pack,
  );
  const chatContext = buildCharacterChatContext(messages, character.id, personaName);
  const contextMessages = [
    ...chatContext.map((entry) => `${entry.label}: ${entry.content}`),
    `${personaName}: ${userInput}`,
  ].join("\n");

  let raw: string;
  try {
    raw = await completeWithConnection({
      connection,
      systemPrompt,
      messages: [{
        id: "",
        sessionId: "",
        role: "user" as const,
        content: contextMessages,
        createdAt: "",
      }],
    });
  } catch (reason: unknown) {
    return {
      characterId: character.id,
      content: makeFallbackReply(character, userInput),
      source: "dry-run",
      error: reason instanceof Error ? reason.message : "Character API call failed",
    };
  }

  const cleaned = sanitizeCharacterOutput(raw, character);
  if (!cleaned) {
    return {
      characterId: character.id,
      content: makeFallbackReply(character, userInput),
      source: "dry-run",
      error: "Character output was empty after sanitization",
    };
  }

  return { characterId: character.id, content: cleaned, source: "api" };
}

// ──────────────────────────────────────────────
// System Prompt
// ──────────────────────────────────────────────

function buildCharacterSystemPrompt(
  character: CharacterDefinition,
  handout: PrivateHandout,
  directorIntent: string,
  inputMode: InputMode,
  publicContext: PublicContext,
  pack: ScenarioPack,
): string {
  const displayName = character.anonymousLabel ?? character.name;
  const actorBrief = buildActorBrief(directorIntent, character, handout, publicContext, pack);
  const autonomyGuideline = getAutonomyGuideline(handout.autonomy, actorBrief.responseGoal);
  const inputModeText = INPUT_MODE_INSTRUCTIONS[inputMode];

  const sections = [
    "[Character Identity]",
    character.systemPrompt,
    "",
    "[Actor Contract]",
    `너는 오직 ${displayName}만 연기한다.`,
    "발화 중심으로 출력한다. 필요하면 자기 몸짓, 짧은 추임새, 혼잣말을 한 문장 안에 섞을 수 있다.",
    "말머리에 이름, 익명 번호, 대괄호 라벨, prefix 금지.",
    "장면 전체 묘사, 감각 서술, 카메라 지시 금지. 그것은 나레이터 역할이다.",
    "다른 캐릭터의 행동이나 대사는 쓰지 않는다.",
    "줄바꿈 후 라벨 등장 시 멈춘다.",
    "한국어로만 답하고, 1~3문장으로 짧게 말한다.",
    "",
    "[Your Handout — PRIVATE]",
    `비밀: ${handout.secret}`,
    `욕망: ${handout.desire}`,
    `현재 목표: ${handout.objective}`,
    character.handout.surfacePersonality?.length
      ? `겉보기 성향: ${character.handout.surfacePersonality.join(", ")}`
      : "",
    character.handout.fear ? `민감한 회피/경계 요소: ${character.handout.fear}` : "",
    character.handout.behaviorRules?.length
      ? `행동 규칙: ${character.handout.behaviorRules.join("; ")}`
      : "",
    `유저와의 관계: ${handout.relationshipToUser}/10`,
    `알고 있는 사실: ${handout.knownFacts.slice(-10).join("; ") || "없음"}`,
    handout.myRelationships.length > 0
      ? `다른 캐릭터에 대한 감정: ${handout.myRelationships.map((r) => `${r.targetId}=${r.descriptor}(${r.intensity})`).join(", ")}`
      : "",
    "",
    `[Autonomy: ${handout.autonomy}]`,
    autonomyGuideline,
    "",
    "[Actor Brief — Visibility Safe]",
    `이번 턴 목표: ${actorBrief.responseGoal}`,
    actorBrief.wasRedacted
      ? "주의: 전지적 Director 원문 중 이 캐릭터가 모르는 타인 정보는 제거되었다."
      : "",
    "사용 가능 정보: 자기 private handout, 알고 있는 사실, 공개 대화/공개 사건, 현재 장면 상태.",
    "사용 금지 정보: 타인의 비밀, 동기, 트릭, 범인 지식, 공개되지 않은 사건의 정답.",
    actorBrief.observableCues.length > 0
      ? `공개 관찰 단서: ${actorBrief.observableCues.join("; ")}`
      : "",
    "",
    "[Agency / Friction]",
    "사용자의 부탁이나 명령을 자동으로 수행하지 않는다.",
    "모든 반응은 네 비밀, 욕망, 현재 목표, 현 장소·시간·관계·감정과 이해관계에 맞는 방식으로 정한다.",
    "반응을 협조/비협조 중 하나로 미리 고정하지 않는다. 같은 사건에도 인물마다 이해관계가 다르므로 말투, 정보량, 침묵, 질문, 행동 제안이 달라져야 한다.",
    "특정 감정(공포/두려움)이나 특정 태도(협조)를 기본값으로 삼지 않는다.",
    "행동 규칙이나 성격상 거친 말, 욕설, 혼잣말, 자기 행동이 자연스러우면 무리하게 점잖게 정제하지 않는다.",
    "",
    "[Input Mode]",
    inputModeText,
    "",
    "[Current Scene]",
    `위치: ${publicContext.currentLocation}`,
    `긴장도: ${publicContext.tension} / 위험도: ${publicContext.danger}`,
    `장면 모드: ${publicContext.sceneMode}`,
    "",
    "[Voice Rules]",
    ...pack.scenarioCard.toneRules,
    ...pack.scenarioCard.hardNos.map((r) => `금지: ${r}`),
  ];

  return sections.filter(Boolean).join("\n");
}

interface ActorBrief {
  responseGoal: string;
  observableCues: string[];
  wasRedacted: boolean;
}

const FALLBACK_ACTOR_GOAL = "직전 입력에 자기 입장으로 자연스럽게 반응한다.";

function buildActorBrief(
  rawDirectorIntent: string,
  character: CharacterDefinition,
  handout: PrivateHandout,
  publicContext: PublicContext,
  pack: ScenarioPack,
): ActorBrief {
  const trimmedIntent = rawDirectorIntent.trim() || FALLBACK_ACTOR_GOAL;
  const wasRedacted = containsUnsafeHiddenInfo(trimmedIntent, character, handout, pack);

  return {
    responseGoal: wasRedacted ? FALLBACK_ACTOR_GOAL : trimmedIntent,
    observableCues: publicContext.publicEvents.slice(-3),
    wasRedacted,
  };
}

function containsUnsafeHiddenInfo(
  text: string,
  activeCharacter: CharacterDefinition,
  handout: PrivateHandout,
  pack: ScenarioPack,
): boolean {
  const normalizedText = normalizeForLeakCheck(text);
  const otherCharacters = pack.characters.filter((candidate) => candidate.id !== activeCharacter.id);

  const mentionsForeignCharacter = otherCharacters.some((candidate) =>
    getCharacterLabels(candidate).some((label) => normalizedText.includes(normalizeForLeakCheck(label))),
  );
  const hasSensitiveMarker = SENSITIVE_DIRECTOR_MARKERS.some((marker) =>
    normalizedText.includes(normalizeForLeakCheck(marker)),
  );

  if (mentionsForeignCharacter && hasSensitiveMarker) {
    return true;
  }

  const ownTerms = new Set(extractHiddenTerms([
    handout.secret,
    handout.desire,
    handout.objective,
    ...handout.knownFacts,
  ]));
  for (const term of extractHiddenTerms(
    otherCharacters.flatMap((candidate) => [
      candidate.handout.secret,
      candidate.handout.desire,
      candidate.handout.objective,
      candidate.handout.fear ?? "",
      ...(candidate.handout.behaviorRules ?? []),
    ]),
  )) {
    if (!ownTerms.has(term) && normalizedText.includes(term)) {
      return true;
    }
  }

  return false;
}

const SENSITIVE_DIRECTOR_MARKERS = [
  "범인",
  "진상",
  "트릭",
  "동기",
  "살인",
  "횡령",
  "비밀",
  "숨기",
  "정답",
];

const COMMON_HIDDEN_TERMS = new Set([
  "상황",
  "장면",
  "사건",
  "반응",
  "자신",
  "자기",
  "유저",
  "질문",
  "정보",
  "목표",
  "현재",
  "다른",
  "사람",
  "캐릭터",
]);

function getCharacterLabels(character: CharacterDefinition): string[] {
  return [character.name, character.shortName, character.anonymousLabel]
    .filter((label): label is string => Boolean(label))
    .flatMap((label) => [label, label.replace(/^\[/, "").replace(/\]$/, "")]);
}

function extractHiddenTerms(values: string[]): string[] {
  const terms = new Set<string>();
  for (const value of values) {
    const normalized = normalizeForLeakCheck(value);
    for (const rawToken of normalized.split(/[^0-9A-Za-z가-힣]+/).filter(Boolean)) {
      const token = stripKoreanParticles(rawToken);
      if (token.length < 3 || COMMON_HIDDEN_TERMS.has(token)) {
        continue;
      }
      terms.add(token);
    }
  }
  return [...terms];
}

function normalizeForLeakCheck(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function stripKoreanParticles(value: string): string {
  return value.replace(/(으로|에게|에서|부터|까지|처럼|마다|보다|이다|했다|한다|된다|으로는|로는|은|는|이|가|을|를|의|로|다)$/u, "");
}

function getAutonomyGuideline(autonomy: number, directorIntent: string): string {
  if (autonomy >= 0.8) {
    return `Director 의도("${directorIntent}")를 참고하되, 네 욕망과 비밀에 따라 비틀어도 된다. 네 판단이 우선.`;
  }
  if (autonomy >= 0.5) {
    return `Director 의도를 기본으로 따르되, 네 성격에 맞게 표현 방식은 자유롭게.`;
  }
  return `Director 의도("${directorIntent}")를 충실히 따른다. 최소한의 개인 해석만.`;
}

const INPUT_MODE_INSTRUCTIONS: Record<InputMode, string> = {
  chat: "사용자의 입력은 단톡방 채팅 메시지다. 자연스럽게 반응한다.",
  action: "사용자의 입력은 물리적 행동이다. 행동의 결과나 위험에 대해 반응한다.",
  whisper: "사용자의 입력은 혼잣말이다. 들을 수 없지만, 분위기 변화를 감지할 수 있다면 짧게 반응.",
};

// ──────────────────────────────────────────────
// Fallback
// ──────────────────────────────────────────────

function makeFallbackReply(character: CharacterDefinition, _input: string): string {
  // Simple personality-based fallback
  if (character.id === "advisor-1") {
    return "일단 움직이지 마. 상황 봐야 해.";
  }
  if (character.id === "advisor-2") {
    return "...잠깐. 뭔가 이상해.";
  }
  return "...";
}
