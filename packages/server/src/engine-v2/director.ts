// ──────────────────────────────────────────────
// Engine v2 — Director Agent
// ──────────────────────────────────────────────
// The Director is the world's hostile will.
// It outputs structured JSON decisions only.
// ──────────────────────────────────────────────

import type {
  CharacterDefinition,
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
    const fallback = getFallbackDirectorOutput(characterIds, worldState.recentSpeakerIds);
    return {
      output: normalizeDirectorOutput(fallback, pack.characters, worldState, userInput),
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
    const fallback = getFallbackDirectorOutput(characterIds, worldState.recentSpeakerIds);
    return {
      output: normalizeDirectorOutput(fallback, pack.characters, worldState, userInput),
      source: "fallback",
      error: reason instanceof Error ? reason.message : "Director API call failed",
    };
  }

  const validated = validateDirectorOutput(raw);
  if (!validated) {
    const fallback = getFallbackDirectorOutput(characterIds, worldState.recentSpeakerIds);
    return {
      output: normalizeDirectorOutput(fallback, pack.characters, worldState, userInput),
      source: "fallback",
      error: "Director output failed JSON validation",
    };
  }

  return {
    output: normalizeDirectorOutput(validated, pack.characters, worldState, userInput),
    source: "api",
  };
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
    SPEAKER_SELECTION_RULES,
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
    "[발화 분산 체크]",
    "1. 유저가 특정 인물을 이름으로 부르지 않았다면, 최근 2턴 이상 같은 인물만 반복해서 선택하지 않는다.",
    "2. 단체 요청/공개 사건/장면 변화에는 최근 침묵한 인물 중 이해관계가 있는 인물을 최소 1명 검토한다.",
    "3. 같은 요청에 여러 NPC가 반응할 때는 서로 다른 정보, 감정, 이해관계를 배정한다. 같은 결론을 말투만 바꿔 반복하지 않는다.",
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

const SPEAKER_SELECTION_RULES = [
  "[전역 규칙 — 발화자 선택과 이해관계]",
  "캐릭터는 유저의 명령을 자동으로 따르는 조수가 아니다. 각자 비밀, 욕망, 현재 목표, 현 감정 상태를 가진 용의자/인물이다.",
  "유저가 특정 인물을 명시 호출하지 않았다면 최근 2턴 이상 같은 인물만 계속 speaker로 선택하지 않는다.",
  "단체 요청, 공개 사건, 현장 변화에는 최근 말하지 않은 인물 중 이해관계가 강한 인물을 우선 검토한다.",
  "characterIntents에는 각 인물이 현재 장소·시간·관계·감정과 자기 이해관계 때문에 어떤 반응을 보이는지 명시한다. 반응 유형을 협조/비협조 중 하나로 미리 고정하지 않는다.",
  "모든 반응은 현재 장소·시간·관계·감정과 인물의 objective/이해관계에 맞는 방식으로 각자 다르게 나타나야 한다. 특정 감정(공포/두려움)이나 특정 태도(협조)를 기본값으로 하드코딩하지 않는다.",
].join("\n");

export function normalizeDirectorOutput(
  output: DirectorOutput,
  characters: CharacterDefinition[],
  worldState: WorldState,
  userInput: string,
): DirectorOutput {
  const characterIds = characters.map((character) => character.id);
  const uniqueSpeakers = [...new Set(output.speakers)].filter((id) => characterIds.includes(id));

  if (output.silence) {
    return { ...output, speakers: [] };
  }

  let speakers = uniqueSpeakers;
  const explicitTargets = findExplicitTargets(userInput, characters);
  const groupAddressed = isGroupAddressed(userInput);
  if (speakers.length === 0) {
    const fallback = pickLeastRecentCharacter(characterIds, worldState.recentSpeakerIds);
    speakers = fallback ? [fallback] : [];
  }

  const primarySpeaker = speakers[0];
  if (
    primarySpeaker
    && speakers.length === 1
    && !explicitTargets.has(primarySpeaker)
    && (groupAddressed || countConsecutiveRecentSpeaker(worldState.recentSpeakerIds, primarySpeaker) >= 2)
  ) {
    const diversitySpeaker = pickDiversitySpeaker(characters, speakers, worldState);
    if (diversitySpeaker) {
      speakers = [...speakers, diversitySpeaker].slice(0, 2);
    }
  }

  const characterIntents = { ...output.characterIntents };
  for (const speaker of speakers) {
    if (!characterIntents[speaker]) {
      characterIntents[speaker] = speaker === primarySpeaker
        ? "직전 입력에 짧게 반응하되, 현재 장소·시간·관계·감정과 자신의 목표에 맞는 태도로 반응한다."
        : "최근 말한 인물과 다른 관점에서, 현재 장소·시간·관계·감정과 자신의 이해관계에 맞게 각자 다른 방식으로 짧게 반응한다.";
    }
  }

  return {
    ...output,
    speakers,
    characterIntents,
  };
}

function findExplicitTargets(userInput: string, characters: CharacterDefinition[]): Set<string> {
  const targets = new Set<string>();
  const normalizedInput = userInput.replace(/\s+/g, "");

  for (const character of characters) {
    const aliases = [character.name, character.shortName, character.anonymousLabel]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.replace(/\s+/g, ""));
    if (aliases.some((alias) => alias && normalizedInput.includes(alias))) {
      targets.add(character.id);
    }
  }

  return targets;
}

function isGroupAddressed(userInput: string): boolean {
  const normalizedInput = userInput.replace(/\s+/g, "").toLowerCase();
  return [
    "다들",
    "모두",
    "전부",
    "여러분",
    "얘들아",
    "단톡",
    "단체",
    "아무나",
    "누구든",
    "각자",
    "같이",
  ].some((marker) => normalizedInput.includes(marker));
}

function countConsecutiveRecentSpeaker(recentSpeakerIds: string[], speakerId: string): number {
  let count = 0;
  for (const id of recentSpeakerIds) {
    if (id !== speakerId) break;
    count += 1;
  }
  return count;
}

function pickDiversitySpeaker(
  characters: CharacterDefinition[],
  selectedSpeakers: string[],
  worldState: WorldState,
): string | undefined {
  const selected = new Set(selectedSpeakers);
  const candidates = characters.filter((character) => !selected.has(character.id));
  if (candidates.length === 0) return undefined;

  const recentIndex = new Map<string, number>();
  for (const [index, id] of worldState.recentSpeakerIds.entries()) {
    if (!recentIndex.has(id)) recentIndex.set(id, index);
  }

  return [...candidates].sort((a, b) => {
    const aRecent = recentIndex.has(a.id) ? recentIndex.get(a.id)! : Number.POSITIVE_INFINITY;
    const bRecent = recentIndex.has(b.id) ? recentIndex.get(b.id)! : Number.POSITIVE_INFINITY;
    if (aRecent !== bRecent) return bRecent - aRecent;
    const aAutonomy = worldState.characterStates[a.id]?.autonomy ?? a.autonomy;
    const bAutonomy = worldState.characterStates[b.id]?.autonomy ?? b.autonomy;
    return bAutonomy - aAutonomy;
  })[0]?.id;
}

function pickLeastRecentCharacter(
  characterIds: string[],
  recentSpeakerIds: string[],
): string | undefined {
  if (characterIds.length === 0) return undefined;
  const recentIndex = new Map<string, number>();
  for (const [index, id] of recentSpeakerIds.entries()) {
    if (!recentIndex.has(id)) recentIndex.set(id, index);
  }

  return [...characterIds].sort((a, b) => {
    const aRecent = recentIndex.has(a) ? recentIndex.get(a)! : Number.POSITIVE_INFINITY;
    const bRecent = recentIndex.has(b) ? recentIndex.get(b)! : Number.POSITIVE_INFINITY;
    if (aRecent !== bRecent) return bRecent - aRecent;
    return characterIds.indexOf(a) - characterIds.indexOf(b);
  })[0];
}
