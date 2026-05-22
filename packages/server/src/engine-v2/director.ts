// ──────────────────────────────────────────────
// Engine v2 — Director Agent
// ──────────────────────────────────────────────
// The Director is the world's hostile will.
// It outputs structured JSON decisions only.
// ──────────────────────────────────────────────

import type {
  DirectorOutput,
  InputMode,
  ModelConnection,
  OmniscientContext,
  PublicContext,
  ScenarioPack,
  WorldState,
} from "@hushline/shared";
import { completeWithConnection, isConnectionReady } from "../providers/adapters/index.js";
import { validateDirectorOutput, getFallbackDirectorOutput } from "./output-sanitizer.js";
import type { PublicChatEntry } from "@hushline/shared";

export interface DirectorInvocationResult {
  output: DirectorOutput;
  source: "api" | "fallback";
  error?: string;
}

/**
 * Invoke the Director agent and return a validated DirectorOutput.
 */
export async function invokeDirector(
  worldState: WorldState,
  omniscientContext: OmniscientContext,
  publicContext: PublicContext,
  userInput: string,
  inputMode: InputMode,
  pack: ScenarioPack,
  connection?: ModelConnection,
): Promise<DirectorInvocationResult> {
  const characterIds = pack.characters.map((c) => c.id);

  if (!isConnectionReady(connection)) {
    return {
      output: getFallbackDirectorOutput(characterIds),
      source: "fallback",
      error: "No director connection configured",
    };
  }

  const systemPrompt = buildDirectorSystemPrompt(pack, omniscientContext);
  const messages = buildDirectorMessages(publicContext, userInput, inputMode, worldState);

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
      output: getFallbackDirectorOutput(characterIds),
      source: "fallback",
      error: reason instanceof Error ? reason.message : "Director API call failed",
    };
  }

  const validated = validateDirectorOutput(raw);
  if (!validated) {
    return {
      output: getFallbackDirectorOutput(characterIds),
      source: "fallback",
      error: "Director output failed JSON validation",
    };
  }

  // Ensure speakers reference valid character IDs
  validated.speakers = validated.speakers.filter((id) => characterIds.includes(id));
  if (validated.speakers.length === 0 && !validated.silence) {
    validated.speakers = characterIds.slice(0, 1);
  }

  return { output: validated, source: "api" };
}

// ──────────────────────────────────────────────
// Prompt Building
// ──────────────────────────────────────────────

export function buildDirectorSystemPrompt(
  pack: ScenarioPack,
  omniscient: OmniscientContext,
): string {
  const sections = [
    pack.directorPrompt,
    "",
    SCENE_CAUSALITY_PRIORITY_RULES,
    "",
    "[World State]",
    `시나리오: ${pack.scenarioCard.title} — ${pack.scenarioCard.subtitle}`,
    `장르: ${pack.manifest.genre}`,
    `긴장도: ${omniscient.mainObjective.status === "active" ? "진행 중" : omniscient.mainObjective.status}`,
    "",
    "[Character Summaries]",
    ...omniscient.characterSummaries.map((c) =>
      `- ${c.name} (autonomy: ${c.autonomy}) | 목표: ${c.currentObjective} | 비밀 힌트: ${c.secretHint} | 유저 관계: ${c.relationshipToUser}`,
    ),
    "",
    "[All Secrets — OMNISCIENT]",
    ...Object.entries(omniscient.allSecrets).map(([id, s]) => `- ${id}: ${s}`),
    "",
    "[Relationship Graph]",
    ...omniscient.fullRelationshipGraph.map((e) =>
      `- ${e.sourceId} → ${e.targetId}: ${e.descriptor} (${e.intensity}/10)`,
    ),
    "",
    "[Main Objective]",
    `${omniscient.mainObjective.id}: ${omniscient.mainObjective.description} [${omniscient.mainObjective.status}]`,
    "",
    "[Sub-Objectives]",
    omniscient.subObjectives.length > 0
      ? omniscient.subObjectives.map((o) => `- ${o.id}: ${o.description} [${o.status}]`).join("\n")
      : "(없음)",
    "",
    "[Event Triggers Available]",
    omniscient.eventTriggers.length > 0
      ? omniscient.eventTriggers.map((t) => `- ${t.id}: ${t.condition} → ${t.description}`).join("\n")
      : "(없음)",
    "",
    "[Recent Events]",
    omniscient.recentEvents.length > 0
      ? omniscient.recentEvents.slice(-5).map((e) => `- Turn ${e.turnNumber}: ${e.description}`).join("\n")
      : "(없음)",
    "",
    "[Genre Goals]",
    omniscient.genreGoals,
  ];

  return sections.join("\n");
}

export function buildDirectorMessages(
  publicContext: PublicContext,
  userInput: string,
  inputMode: InputMode,
  worldState: WorldState,
): string[] {
  const chatSummary = publicContext.publicChatLog
    .slice(-10)
    .map((entry) => `${entry.label}: ${entry.content}`)
    .join("\n");

  const stateBlock = [
    `[현재 상태] 위치: ${publicContext.currentLocation} | 긴장: ${publicContext.tension} | 위험: ${publicContext.danger} | 턴: ${publicContext.turnNumber}`,
    `[최근 발화자] ${worldState.recentSpeakerIds.slice(0, 3).join(", ") || "없음"}`,
    `[입력 모드] ${inputMode}`,
    `[대목표] ${publicContext.mainObjectiveDescription}`,
    "",
    "[최근 공개 이벤트]",
    publicContext.publicEvents.length > 0 ? publicContext.publicEvents.slice(-5).map((event) => `- ${event}`).join("\n") : "(없음)",
    "",
    "[최근 대화]",
    chatSummary,
    "",
    `[유저 입력 (${inputMode})] ${userInput}`,
    "",
    "[현재 장면 우선도 체크]",
    "1. 최신 유저 입력과 바로 이전 발화/행동에 자연스럽게 이어지는 반응을 먼저 선택한다.",
    "2. 현재 감정/관계/행동 beat가 아직 닫히지 않았으면 외부 설정 이벤트보다 그 beat의 다음 반응을 우선한다.",
    "3. 이벤트가 필요해도 현재 위치, 현재 인물, 최근 대화, 최근 공개 이벤트, 활성 목표 중 최소 하나와 인과적으로 이어져야 한다.",
    "4. 연결 사유가 '갑자기', '난데없이', '한편' 정도밖에 없다면 그 이벤트를 고르지 않는다.",
    "5. 장면 인과가 약하면 event는 null로 두고 speaker의 반응 또는 narratorInstruction의 작은 bridge만 사용한다.",
    "",
    "위 상황을 분석하고 DirectorOutput JSON을 출력하라.",
  ].join("\n");

  return [stateBlock];
}

const SCENE_CAUSALITY_PRIORITY_RULES = [
  "[전역 규칙 — 장면 인과와 이벤트 우선도]",
  "목표나 이벤트가 중요해도 현재 장면의 자연스러운 다음 beat를 이기면 안 된다.",
  "Director의 첫 판단 기준은 '무엇이 중요한가'가 아니라 '지금 이 장면에서 무엇이 자연스럽게 다음에 오는가'다.",
  "",
  "우선순위:",
  "1. 최신 유저 입력에 대한 직접 반응.",
  "2. 현재 장면의 미해결 감정, 관계, 질문, 약속, 행동 결과.",
  "3. 현재 위치/현재 인물/현재 물건/최근 공개 이벤트에서 직접 나온 consequence 또는 reveal.",
  "4. 이미 예고되었거나 활성화 조건이 충족된 위협, 타이머, event trigger.",
  "5. 외부 연락, 설정 공개, 새 장소/기관/인물/규칙 이벤트.",
  "",
  "하드 게이트:",
  "- 감정씬, 관계씬, 직접 대화가 진행 중이면 외부 설정 이벤트로 끊지 않는다.",
  "- event, narratorInstruction, characterIntents는 직전 user input 또는 최근 대화와 인과적으로 연결되어야 한다.",
  "- '갑자기', '난데없이', '한편', '그 순간 외부에서'로만 설명되는 이벤트는 선택하지 않는다.",
  "- 새 장소, 새 기관, 새 인물, 새 규칙, 새 과거사는 현재 장면 안에 이미 신호가 있거나 bridge가 있을 때만 허용한다.",
  "- 연결이 약하면 큰 이벤트를 발생시키지 말고 event:null, 작은 감각 bridge, 또는 현재 speaker의 반응으로 처리한다.",
  "",
  "설정/외부 이벤트가 꼭 필요할 때:",
  "- 먼저 현재 장면의 원인망을 만든다: 최근 대화, 현재 위치, 현재 인물의 목표, 이미 등장한 물건, 최근 공개 이벤트 중 하나를 명시적으로 이어라.",
  "- bridge 없이 새 설정을 꽂아 목표를 밀어붙이지 않는다.",
  "- 장면을 움직이는 힘은 우선 현재 장면 내부에서 발생해야 한다.",
].join("\n");
