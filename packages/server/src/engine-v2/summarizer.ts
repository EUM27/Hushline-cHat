// ──────────────────────────────────────────────
// Engine v2 — Scene Summarizer
// ──────────────────────────────────────────────
// Periodically summarizes conversation history to:
// 1. Keep context window manageable
// 2. Track objective progress
// 3. Record key events and relationship changes
// ──────────────────────────────────────────────

import type {
  ModelConnection,
  TurnMessage,
  WorldState,
  SessionStateV2,
  SubObjective,
} from "@hushline/shared";
import { completeWithConnection } from "../providers/adapters/index.js";

/** How often to auto-summarize (every N turns) */
export const SUMMARY_INTERVAL = 8;

export interface SceneSummary {
  id: string;
  turnRange: [number, number]; // [fromTurn, toTurn]
  narrative: string; // 무슨 일이 있었는지
  keyDiscoveries: string[]; // 중요 발견/단서
  relationshipChanges: string[]; // 관계 변화
  objectiveProgress: string; // 목표 진행 상황
  characterMoments: string[]; // 캐릭터 간 중요 순간
  createdAt: string;
}

export interface SummaryResult {
  summary: SceneSummary;
  source: "api" | "fallback";
}

/**
 * Check if a summary should be generated this turn.
 */
export function shouldSummarize(worldState: WorldState, existingSummaries: SceneSummary[]): boolean {
  const lastSummaryTurn = existingSummaries.length > 0
    ? existingSummaries[existingSummaries.length - 1]!.turnRange[1]
    : 0;
  return worldState.turnNumber - lastSummaryTurn >= SUMMARY_INTERVAL;
}

/**
 * Generate a scene summary for the recent turns.
 */
export async function generateSummary(
  session: SessionStateV2,
  existingSummaries: SceneSummary[],
  connection?: ModelConnection,
): Promise<SummaryResult> {
  const lastSummaryTurn = existingSummaries.length > 0
    ? existingSummaries[existingSummaries.length - 1]!.turnRange[1]
    : 0;
  const currentTurn = session.worldState.turnNumber;

  // Get messages from the unsummarized range
  const recentMessages = session.messages.filter((m) => {
    // Rough filter — messages after last summary
    return true; // In practice, filter by turn number if stored on messages
  }).slice(-(SUMMARY_INTERVAL * 4)); // ~4 messages per turn average

  if (!connection?.apiKey || !connection.model) {
    return {
      summary: makeFallbackSummary(lastSummaryTurn, currentTurn, recentMessages, session.worldState),
      source: "fallback",
    };
  }

  const systemPrompt = buildSummaryPrompt(session, existingSummaries);
  const messagesContext = recentMessages
    .map((m) => `[${m.role}${m.speakerLabel ? ` ${m.speakerLabel}` : ""}] ${m.content}`)
    .join("\n");

  try {
    const raw = await completeWithConnection({
      connection,
      systemPrompt,
      messages: [{
        id: "",
        sessionId: "",
        role: "user" as const,
        content: messagesContext + "\n\n위 대화를 요약하고 목표 진행 상황을 정리하라. JSON으로 출력.",
        createdAt: "",
      }],
    });

    const parsed = parseSummaryJson(raw, lastSummaryTurn, currentTurn);
    if (parsed) {
      return { summary: parsed, source: "api" };
    }
  } catch {
    // Fallback
  }

  return {
    summary: makeFallbackSummary(lastSummaryTurn, currentTurn, recentMessages, session.worldState),
    source: "fallback",
  };
}

/**
 * Build the summarizer system prompt.
 */
function buildSummaryPrompt(session: SessionStateV2, existingSummaries: SceneSummary[]): string {
  const previousSummary = existingSummaries.length > 0
    ? existingSummaries[existingSummaries.length - 1]!.narrative
    : "없음";

  return [
    "너는 스토리 요약 에이전트다. 최근 대화를 분석하여 구조화된 요약을 생성한다.",
    "",
    "[출력 형식 — JSON]",
    "{",
    '  "narrative": "무슨 일이 있었는지 2~3문장 요약",',
    '  "keyDiscoveries": ["발견된 단서나 정보"],',
    '  "relationshipChanges": ["관계 변화 설명"],',
    '  "objectiveProgress": "대목표 진행 상황",',
    '  "characterMoments": ["캐릭터 간 중요 순간"]',
    "}",
    "",
    "[현재 상태]",
    `대목표: ${session.worldState.mainObjective.description}`,
    `긴장도: ${session.worldState.tension} / 위험도: ${session.worldState.danger}`,
    `이전 요약: ${previousSummary}`,
    "",
    "[규칙]",
    "- 객관적으로 요약한다. 추측하지 않는다.",
    "- 유저의 행동과 NPC의 반응을 구분한다.",
    "- 새로 발견된 단서를 명확히 기록한다.",
    "- 관계 변화가 있으면 기록한다.",
    "- JSON만 출력한다.",
  ].join("\n");
}

/**
 * Parse summary JSON from model output.
 */
function parseSummaryJson(raw: string, fromTurn: number, toTurn: number): SceneSummary | null {
  try {
    // Extract JSON from potentially messy output
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) return null;

    const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
    return {
      id: crypto.randomUUID(),
      turnRange: [fromTurn, toTurn],
      narrative: parsed.narrative ?? "",
      keyDiscoveries: Array.isArray(parsed.keyDiscoveries) ? parsed.keyDiscoveries : [],
      relationshipChanges: Array.isArray(parsed.relationshipChanges) ? parsed.relationshipChanges : [],
      objectiveProgress: parsed.objectiveProgress ?? "",
      characterMoments: Array.isArray(parsed.characterMoments) ? parsed.characterMoments : [],
      createdAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/**
 * Fallback summary when API is unavailable.
 */
function makeFallbackSummary(
  fromTurn: number,
  toTurn: number,
  messages: TurnMessage[],
  worldState: WorldState,
): SceneSummary {
  const userMessages = messages.filter((m) => m.role === "user");
  const narratorMessages = messages.filter((m) => m.role === "narrator");

  return {
    id: crypto.randomUUID(),
    turnRange: [fromTurn, toTurn],
    narrative: `턴 ${fromTurn}~${toTurn}: 유저가 ${userMessages.length}회 행동, 나레이터 ${narratorMessages.length}회 묘사.`,
    keyDiscoveries: [],
    relationshipChanges: [],
    objectiveProgress: `대목표 "${worldState.mainObjective.description}" 진행 중. 긴장도 ${worldState.tension}.`,
    characterMoments: [],
    createdAt: new Date().toISOString(),
  };
}
