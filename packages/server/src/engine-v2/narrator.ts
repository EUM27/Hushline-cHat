// ──────────────────────────────────────────────
// Engine v2 — Narrator Agent
// ──────────────────────────────────────────────
// Produces 1-2 sentences of sensory/spatial narration.
// No dialogue, no character lines.
// ──────────────────────────────────────────────

import type {
  InputMode,
  ModelConnection,
  PublicContext,
  ScenarioPack,
} from "@hushline/shared";
import { completeWithConnection, isConnectionReady } from "../providers/adapters/index.js";
import { sanitizeNarratorOutput } from "./output-sanitizer.js";
import { OBSERVABLE_STORY_ADVANCEMENT_RULES, PERCEPTION_BOUNDARY_RULES } from "./perception-boundary-rules.js";

export interface NarratorInvocationResult {
  content: string | null;
  source: "api" | "fallback" | "skipped";
  error?: string;
}

/**
 * Invoke the Narrator agent.
 * Returns null content if narration is not needed this turn.
 */
export async function invokeNarrator(
  narratorInstruction: string | null,
  inputMode: InputMode,
  publicContext: PublicContext,
  userInput: string,
  pack: ScenarioPack,
  connection?: ModelConnection,
): Promise<NarratorInvocationResult> {
  // Skip conditions
  if (!narratorInstruction && inputMode !== "action") {
    return { content: null, source: "skipped" };
  }

  const instruction = narratorInstruction ?? "유저의 행동 결과를 감각적으로 묘사한다.";

  if (!isConnectionReady(connection)) {
    return {
      content: makeFallbackNarration(publicContext, inputMode),
      source: "fallback",
    };
  }

  const systemPrompt = buildNarratorSystemPrompt(pack, publicContext, instruction, inputMode);
  const messages = buildNarratorMessages(publicContext, userInput, inputMode);

  let raw: string;
  try {
    raw = await completeWithConnection({
      connection,
      systemPrompt,
      messages: messages.map((m) => ({
        id: "",
        sessionId: "",
        role: "user" as const,
        content: m,
        createdAt: "",
      })),
    });
  } catch (reason: unknown) {
    return {
      content: makeFallbackNarration(publicContext, inputMode),
      source: "fallback",
      error: reason instanceof Error ? reason.message : "Narrator API call failed",
    };
  }

  const cleaned = sanitizeNarratorOutput(raw);
  if (!cleaned) {
    return {
      content: makeFallbackNarration(publicContext, inputMode),
      source: "fallback",
      error: "Narrator output was empty after sanitization",
    };
  }

  return { content: cleaned, source: "api" };
}

// ──────────────────────────────────────────────
// Prompt Building
// ──────────────────────────────────────────────

function buildNarratorSystemPrompt(
  pack: ScenarioPack,
  publicContext: PublicContext,
  instruction: string,
  inputMode: InputMode,
): string {
  const sections = [
    pack.narratorPrompt,
    "",
    "[현재 장면]",
    `시나리오: ${publicContext.scenarioTitle} — ${publicContext.scenarioSubtitle}`,
    `위치: ${publicContext.currentLocation}`,
    `긴장도: ${publicContext.tension} / 위험도: ${publicContext.danger}`,
    `입력 유형: ${inputMode === "action" ? "행동 지문 — 결과를 묘사하라" : "채팅"}`,
    "",
    "[Director 장면 지시]",
    instruction,
    "",
    "[Narration Contract]",
    "나레이터는 대사를 쓰지 않는다.",
    "나레이션은 제한된 마크다운을 사용할 수 있다: **강조**, *감각/정서적 결*.",
    "마크다운은 묘사 강조에만 쓰고, 캐릭터의 말이나 생각을 표시하는 용도로 쓰지 않는다.",
    "캐릭터의 목소리, 말투, 문장 결정을 대신하지 않는다.",
    "따옴표 대사와 '말했다/중얼거렸다/대답했다' 발화문을 쓰지 않는다.",
    "허용: 공간, 감각, 물리적 결과, 공개적으로 관찰 가능한 변화.",
    "불가: 캐릭터 속마음, 동기 단정, 유저 행동 대행, 다른 캐릭터 연기.",
    "",
    ...PERCEPTION_BOUNDARY_RULES,
    ...OBSERVABLE_STORY_ADVANCEMENT_RULES,
    "",
    "[공간 규칙]",
    ...pack.scenarioCard.spaceRules,
    "",
    "[톤 규칙]",
    ...pack.scenarioCard.toneRules,
    ...pack.scenarioCard.hardNos.map((r) => `금지: ${r}`),
  ];

  return sections.join("\n");
}

function buildNarratorMessages(
  publicContext: PublicContext,
  userInput: string,
  inputMode: InputMode,
): string[] {
  const recent = publicContext.publicChatLog
    .slice(-6)
    .map((entry) => `${entry.label}: ${entry.content}`)
    .join("\n");

  const inputLabel = inputMode === "action"
    ? `[행동] ${userInput}`
    : `{{user}}: ${userInput}`;

  return [`${recent}\n\n${inputLabel}\n\n위 상황에 맞는 나레이션 1~2문장을 출력하라.`];
}

// ──────────────────────────────────────────────
// Fallback
// ──────────────────────────────────────────────

function makeFallbackNarration(publicContext: PublicContext, inputMode: InputMode): string {
  if (inputMode === "action") {
    return "행동의 여파가 어둠 속으로 퍼져 나간다.";
  }

  const location = publicContext.currentLocation;
  const tension = publicContext.tension;

  if (tension >= 7) {
    return "형광등이 한 번 깜빡인다. 복도 끝에서 무언가 스치는 소리.";
  }
  if (tension >= 4) {
    return "먼지 냄새가 짙어진다. 어딘가에서 물방울 떨어지는 소리.";
  }
  return "낡은 복도에 정적이 내려앉는다.";
}
