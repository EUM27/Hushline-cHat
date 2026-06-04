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
  CaseAnswerScope,
  CharacterPersonaBrief,
} from "@hushline/shared";
import { completeWithConnection, isConnectionReady } from "../providers/adapters/index.js";
import { sanitizeCharacterOutput } from "./output-sanitizer.js";
import {
  assertNoHiddenTruthVault,
  assertNoOtherHandouts,
  assertNoSolutionGraph,
  buildCharacterChatContext,
} from "./context-builder.js";
import { hasUserIntroducedName, isPlaceholderPersonaName, normalizePersonaName } from "./user-identity.js";
import {
  OBSERVABLE_STORY_ADVANCEMENT_RULES,
  PERCEPTION_BOUNDARY_RULES,
  PRIVATE_THOUGHT_SAFETY_RULES,
} from "./perception-boundary-rules.js";

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
  answerScope?: CaseAnswerScope,
  personaBrief?: CharacterPersonaBrief,
): Promise<CharacterInvocationResult> {
  if (!isConnectionReady(connection)) {
    return {
      characterId: character.id,
      content: makeFallbackReply(character, userInput),
      source: "dry-run",
    };
  }

  const userNameIntroduced = hasUserIntroducedName(messages, personaName, userInput);
  const systemPrompt = buildCharacterSystemPrompt(
    character, handout, directorIntent, inputMode, publicContext, pack, personaName, userNameIntroduced, answerScope, personaBrief,
  );
  const chatContext = buildCharacterChatContext(messages, character.id, personaName, userNameIntroduced);
  const contextMessages = [
    ...chatContext.map((entry) => `${entry.label}: ${entry.content}`),
    `{{user}}: ${userInput}`,
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
  personaName: string,
  userNameIntroduced: boolean,
  answerScope?: CaseAnswerScope,
  personaBrief?: CharacterPersonaBrief,
): string {
  const displayName = character.anonymousLabel ?? character.name;
  const actorBrief = buildActorBrief(directorIntent, character, handout, publicContext, pack);
  assertNoOtherHandouts({ handout, answerScope, actorBrief });
  assertNoHiddenTruthVault({ handout, answerScope, actorBrief });
  assertNoSolutionGraph({ handout, answerScope, actorBrief });
  const autonomyGuideline = getAutonomyGuideline(handout.autonomy, actorBrief.responseGoal);
  const inputModeText = INPUT_MODE_INSTRUCTIONS[inputMode];
  const conversationTarget = inferConversationTargetLabelFromUserInput(directorIntent, pack) // directorIntent sometimes includes names
    || inferConversationTargetLabelFromUserInput(publicContext.publicChatLog.at(-1)?.content ?? "", pack)
    || "";

  const sections = [
    "[Character Identity]",
    character.systemPrompt,
    "",
    ...formatSceneCounterpartForCharacter(
      personaBrief ?? buildFallbackCharacterPersonaBrief(personaName, userNameIntroduced),
    ),
    "상대 인물과 모든 캐릭터는 서로 다른 인물이다.",
    "",
    "[그룹 인물 목록]",
    formatCharacterRoster(pack.characters, character.id),
    "그룹 인물 목록의 각 이름은 서로 다른 인물이다.",
    "현재 API 호출 대상만 네가 연기할 인물이다.",
    "",
    "[Conversation Target]",
    conversationTarget ? `이번 턴 입력의 수신자: ${conversationTarget}` : "이번 턴 입력의 수신자: (명시 없음)",
    "수신자가 특정 인물이라면 그 인물에게 답하듯 반응한다. 명시가 없으면 유저에게 답한다.",
    "'너' 같은 모호한 2인칭을 남발하지 말고, 필요하면 이름으로 대상을 명확히 한다. 단, 사용자 이름은 공개 소개된 경우에만 쓴다.",
    "",
    "[Actor Contract]",
    `너는 오직 ${displayName}만 연기한다.`,
    "[Output Role Contract — HARD]",
    "You are this character's line generator only.",
    "Output ONLY formatted character lines: spoken dialogue inside double quotes, and optional private thought inside single quotes.",
    "Allowed output examples: \"그게... 지금은 말 못 해요.\" or '진정해. 숨부터 고르자.'",
    "Never write text outside quote markers. Never use markdown; the client renders quote markers as formatting.",
    "Output NEVER narration, stage directions, body actions, facial expressions outside spoken dialogue, other character actions, other character dialogue, user actions, user thoughts, speaker labels, bracketed roleplay text, unauthorized case facts, or hidden truth implications.",
    "",
    ...PERCEPTION_BOUNDARY_RULES,
    ...OBSERVABLE_STORY_ADVANCEMENT_RULES,
    ...PRIVATE_THOUGHT_SAFETY_RULES,
    "",
    "사용자 입력에는 대사와 행동 지문이 섞일 수 있다.",
    "그 형식을 따라 하지 않는다.",
    "사용자가 하지 않은 제안, 의도, 결정, 행동을 전제로 반응하지 않는다.",
    "\"갇혀 있다\"는 말을 \"나가자\"는 제안으로 바꾸지 않는다.",
    "최종 출력은 \"실제 발화\" 또는 '짧은 내면 반응'만 쓴다.",
    "실제 입 밖으로 말한 대사는 반드시 큰따옴표로 감싼다: \"대사\".",
    "입 밖으로 말하지 않은 생각은 반드시 작은따옴표로 감싼다: '생각'.",
    "큰따옴표/작은따옴표 밖에는 한 글자도 쓰지 않는다.",
    "말머리에 이름, 익명 번호, 대괄호 라벨, prefix 금지.",
    "자기 행동 지문, 장면 전체 묘사, 감각 서술, 카메라 지시 금지. 그것은 나레이터 역할이다.",
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
    ...formatAnswerScopeForCharacter(character.id, answerScope),
    "",
    "[Agency / Friction]",
    "사용자의 부탁이나 명령을 자동으로 수행하지 않는다.",
    "모든 반응은 네 비밀, 욕망, 현재 목표, 현 장소·시간·관계·감정과 이해관계에 맞는 방식으로 정한다.",
    "반응을 협조/비협조 중 하나로 미리 고정하지 않는다. 같은 사건에도 인물마다 이해관계가 다르므로 말투, 정보량, 침묵, 질문, 행동 제안이 달라져야 한다.",
    "특정 감정(공포/두려움)이나 특정 태도(협조)를 기본값으로 삼지 않는다.",
    "행동 규칙이나 성격상 거친 말, 욕설, 혼잣말이 자연스러우면 무리하게 점잖게 정제하지 않는다.",
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

function formatSceneCounterpartForCharacter(persona: CharacterPersonaBrief): string[] {
  const lines = [
    "[상대 인물 정보]",
    "상대는 같은 장면 안의 독립된 인물이다.",
    `표시: ${persona.displayName}`,
    persona.nameKnown
      ? "이름 공개 상태: 장면 안에서 호칭을 들은 상태다."
      : "이름 공개 상태: 미소개. 이름을 추측하거나 발화하지 않는다.",
    ...(persona.role ? [`공개 역할: ${persona.role}`] : []),
    ...(persona.description ? [`공개 설명: ${persona.description}`] : []),
    ...(persona.appearance ? [`관찰 가능한 외형: ${persona.appearance}`] : []),
    ...(persona.relationshipTags?.length ? [`관계 태그: ${persona.relationshipTags.join(", ")}`] : []),
    "상대의 행동, 대사, 감정, 결정을 대신 서술하지 않는다.",
    "",
  ];
  return lines;
}

function buildFallbackCharacterPersonaBrief(
  personaName: string,
  userNameIntroduced: boolean,
): CharacterPersonaBrief {
  const normalizedName = normalizePersonaName(personaName);
  const nameKnown = userNameIntroduced && !isPlaceholderPersonaName(normalizedName);
  return {
    displayName: nameKnown ? normalizedName : "상대 인물",
    nameKnown,
  };
}

function formatAnswerScopeForCharacter(characterId: string, answerScope: CaseAnswerScope | undefined): string[] {
  if (!answerScope?.inquiryFrame.isCaseInquiry) {
    return [];
  }
  const witness = answerScope.allowedWitnesses.find((candidate) => candidate.characterId === characterId);
  const lines = [
    "[Answer Scope]",
    `질문 유형: ${answerScope.inquiryFrame.inquiryType}`,
    `답변 가능성: ${answerScope.answerability}`,
    "아래 허용 정보 안에서만 답한다. 확실하지 않은 정보는 확실하다고 말하지 않는다.",
    "허용된 fact_id 밖의 사건 정보, 차단된 진상 ID, 타인의 비밀은 말하지 않는다.",
    `허용 fact_id: ${[...answerScope.publicFactIds, ...answerScope.observableFactIds, ...(witness?.factIds ?? [])].join(", ") || "(없음)"}`,
    `차단된 fact_id: ${answerScope.blockedFactIds.join(", ") || "(없음)"}`,
    `차단된 진상 ID: ${answerScope.blockedTruthIds.join(", ") || "(없음)"}`,
  ];

  if (witness) {
    lines.push(`말해도 되는 내용: ${witness.canSay.join(" / ") || "(없음)"}`);
    lines.push(`말하면 안 되는 내용: ${witness.mustNotSay.join(" / ") || "(없음)"}`);
    lines.push(`확실성: ${witness.certainty} / 최대 공개: ${witness.maxRevealLevel}`);
  } else {
    lines.push("이 캐릭터에게 허용된 증언 seed가 없다. 모르면 모른다고 말하거나 답변을 피한다.");
  }

  return lines;
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

function inferConversationTargetLabelFromUserInput(text: string, pack: ScenarioPack): string {
  const normalized = normalizeForLeakCheck(text);
  if (!normalized) return "";
  for (const candidate of pack.characters) {
    for (const label of getCharacterLabels(candidate)) {
      const needle = normalizeForLeakCheck(label);
      if (needle && normalized.includes(needle)) {
        return candidate.name;
      }
    }
  }
  return "";
}

function formatCharacterRoster(characters: CharacterDefinition[], activeCharacterId: string): string {
  return characters
    .map((candidate) => {
      const label = candidate.anonymousLabel ?? candidate.name;
      const role = candidate.id === activeCharacterId ? "현재 API 호출 대상" : "독립 캐릭터";
      return `${label}: ${role}`;
    })
    .join("\n");
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
    return "\"일단 움직이지 마. 상황 봐야 해.\"";
  }
  if (character.id === "advisor-2") {
    return "\"...잠깐. 뭔가 이상해.\"";
  }
  return "\"...\"";
}
