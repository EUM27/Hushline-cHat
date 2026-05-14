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
import { completeWithConnection } from "../providers/adapters/index.js";
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

  if (!connection?.apiKey || !connection.model) {
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

function buildDirectorSystemPrompt(
  pack: ScenarioPack,
  omniscient: OmniscientContext,
): string {
  const sections = [
    pack.directorPrompt,
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

function buildDirectorMessages(
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
    "",
    "[최근 대화]",
    chatSummary,
    "",
    `[유저 입력 (${inputMode})] ${userInput}`,
    "",
    "위 상황을 분석하고 DirectorOutput JSON을 출력하라.",
  ].join("\n");

  return [stateBlock];
}
