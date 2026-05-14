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
import { completeWithConnection } from "../providers/adapters/index.js";
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
  if (!connection?.apiKey || !connection.model) {
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
  const autonomyGuideline = getAutonomyGuideline(handout.autonomy, directorIntent);
  const inputModeText = INPUT_MODE_INSTRUCTIONS[inputMode];

  const sections = [
    "[Character Identity]",
    character.systemPrompt,
    "",
    "[Actor Contract]",
    `너는 오직 ${displayName}만 연기한다.`,
    "대사만 출력한다. 나레이션/지문/다른 캐릭터 대사 금지.",
    "말머리에 이름, 익명 번호, 대괄호 라벨, prefix 금지.",
    "장면 묘사, 감각 서술 금지. 그것은 나레이터 역할이다.",
    "다른 캐릭터의 대사를 생성하지 않는다.",
    "줄바꿈 후 라벨 등장 시 멈춘다.",
    "한국어로만 답하고, 1~3문장으로 짧게 말한다.",
    "",
    "[Your Handout — PRIVATE]",
    `비밀: ${handout.secret}`,
    `욕망: ${handout.desire}`,
    `현재 목표: ${handout.objective}`,
    `유저와의 관계: ${handout.relationshipToUser}/10`,
    `알고 있는 사실: ${handout.knownFacts.slice(-10).join("; ") || "없음"}`,
    handout.myRelationships.length > 0
      ? `다른 캐릭터에 대한 감정: ${handout.myRelationships.map((r) => `${r.targetId}=${r.descriptor}(${r.intensity})`).join(", ")}`
      : "",
    "",
    `[Autonomy: ${handout.autonomy}]`,
    autonomyGuideline,
    "",
    "[Director's Intent for This Turn]",
    directorIntent,
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
