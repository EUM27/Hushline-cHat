// ──────────────────────────────────────────────
// Engine v2 — Turn Pipeline Orchestrator
// ──────────────────────────────────────────────
// Main entry point for processing a user turn.
// Sequence: Input → Director → Narrator → Characters → State Update
// ──────────────────────────────────────────────

import type {
  DirectorOutput,
  GenerationModelSnapshot,
  InputMode,
  ModelConnection,
  PublicContext,
  ScenarioPack,
  SessionStateV2,
  TurnMessage,
  TurnOptionsV2,
  TurnResultV2,
  WorldState,
} from "@hushline/shared";

type TurnRuntimeOptionsV2 = TurnOptionsV2 & {
  scenarioPack?: ScenarioPack;
};

import { classifyInput } from "./input-classifier.js";
import { buildPublicContext, buildPrivateHandout, buildOmniscientContext } from "./context-builder.js";
import { invokeDirector } from "./director.js";
import { invokeNarrator } from "./narrator.js";
import { invokeCharacter } from "./character.js";
import { applyDirectorOutput, markCharacterSpoke } from "./state-manager.js";

/**
 * Run a complete turn through the v2 pipeline.
 *
 * Flow:
 * 1. Classify input (chat/action/whisper)
 * 2. Build contexts (public/omniscient/private)
 * 3. Invoke Director → JSON decision
 * 4. Invoke Narrator (conditional)
 * 5. Invoke Characters (1-2, parallel if 2)
 * 6. Apply state updates
 * 7. Assemble messages
 */
export async function runTurnV2(
  session: SessionStateV2,
  rawInput: string,
  options: TurnRuntimeOptionsV2 = {},
): Promise<TurnResultV2> {
  const pack = options.scenarioPack ?? reconstructPack(session);
  const connections = options.connections ?? {};


  // ── Step 1: Input Classification ──
  const { mode: inputMode, content: userContent } = classifyInput(rawInput, options.inputMode);

  // ── Step 2: Context Assembly ──
  const publicContext = buildPublicContext(session.worldState, session.messages, pack);
  const omniscientContext = buildOmniscientContext(session.worldState, session.characters, pack);

  // ── Step 3: Director Invocation ──
  const directorConnection = getConnection(connections, "director");
  const directorResult = await invokeDirector(
    session.worldState,
    omniscientContext,
    publicContext,
    userContent,
    inputMode,
    pack,
    directorConnection,
  );
  const directorOutput = directorResult.output;

  // ── Step 4: Narrator Invocation (conditional) ──
  const narratorConnection = getConnection(connections, "narrator");
  const narratorInstruction = buildNarratorInstruction(
    directorOutput,
    inputMode,
    publicContext,
    pack,
  );
  const narratorResult = await invokeNarrator(
    narratorInstruction,
    inputMode,
    publicContext,
    userContent,
    pack,
    narratorConnection,
  );

  // ── Step 5: Character Invocations ──
  const characterMessages: TurnMessage[] = [];

  if (!directorOutput.silence && directorOutput.speakers.length > 0) {
    // Invoke characters — parallel if 2 speakers
    const characterResults = await Promise.all(
      directorOutput.speakers.map((speakerId) => {
        const character = session.characters.find((c) => c.id === speakerId);
        if (!character) return null;

        const handout = buildPrivateHandout(speakerId, session.worldState, session.characters);
        const intent = directorOutput.characterIntents[speakerId] ?? "상황에 맞게 자연스럽게 반응한다.";
        const charConnection = getConnection(connections, speakerId);

        return invokeCharacter(
          character,
          handout,
          intent,
          inputMode,
          userContent,
          publicContext,
          session.messages,
          session.persona.name,
          pack,
          charConnection,
        ).then((result) => ({ result, connection: charConnection }));
      }),
    );

    for (const characterResult of characterResults) {
      if (!characterResult) continue;
      const { result, connection } = characterResult;
      const generationModel = result.source === "api" ? snapshotGenerationModel(connection) : undefined;
      characterMessages.push({
        id: crypto.randomUUID(),
        sessionId: session.id,
        role: "character",
        content: result.content,
        characterId: result.characterId,
        speakerLabel: session.characters.find((c) => c.id === result.characterId)?.anonymousLabel
          ?? session.characters.find((c) => c.id === result.characterId)?.name
          ?? result.characterId,
        generationSource: result.source === "api" ? "api" : "dry-run",
        ...(generationModel ? { generationModel } : {}),
        ...(result.error ? { fallbackReason: result.error } : {}),
        createdAt: new Date().toISOString(),
      });
    }
  }

  // ── Step 6: State Update ──
  const speakerIds = characterMessages.map((m) => m.characterId!).filter(Boolean);
  let nextWorldState = applyDirectorOutput(session.worldState, directorOutput, speakerIds);

  // Mark characters as having spoken
  for (const speakerId of speakerIds) {
    nextWorldState = markCharacterSpoke(nextWorldState, speakerId);
  }

  // ── Step 7: Message Assembly ──
  const turnMessages: TurnMessage[] = [];

  // User message
  turnMessages.push({
    id: crypto.randomUUID(),
    sessionId: session.id,
    role: "user",
    content: userContent,
    inputMode,
    createdAt: new Date().toISOString(),
  });

  // Narrator message (if any)
  if (narratorResult.content) {
    const generationModel = narratorResult.source === "api" ? snapshotGenerationModel(narratorConnection) : undefined;
    turnMessages.push({
      id: crypto.randomUUID(),
      sessionId: session.id,
      role: "narrator",
      content: narratorResult.content,
      speakerLabel: "[나레이터]",
      generationSource: narratorResult.source === "api" ? "api" : "dry-run",
      ...(generationModel ? { generationModel } : {}),
      ...(narratorResult.error ? { fallbackReason: narratorResult.error } : {}),
      createdAt: new Date().toISOString(),
    });
  }

  // Character messages
  turnMessages.push(...characterMessages);

  const systemContent = buildSystemMessageContent(directorOutput);
  if (systemContent) {
    turnMessages.push({
      id: crypto.randomUUID(),
      sessionId: session.id,
      role: "system",
      content: systemContent,
      speakerLabel: "[시스템]",
      createdAt: new Date().toISOString(),
    });
  }

  return {
    worldState: nextWorldState,
    messages: turnMessages,
    directorOutput,
  };
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function getConnection(
  connections: Record<string, ModelConnection>,
  slot: string,
): ModelConnection | undefined {
  return connections[slot] ?? connections.default;
}

function snapshotGenerationModel(connection: ModelConnection | undefined): GenerationModelSnapshot | undefined {
  if (!connection?.model) {
    return undefined;
  }

  return {
    providerId: connection.providerId,
    model: connection.model,
  };
}

function buildNarratorInstruction(
  directorOutput: DirectorOutput,
  inputMode: InputMode,
  publicContext: PublicContext,
  pack: ScenarioPack,
): string | null {
  if (directorOutput.narratorInstruction) {
    return directorOutput.narratorInstruction;
  }

  if (directorOutput.event) {
    return `다음 장면 사건을 캐릭터 대사 없이 감각적 장면 서술 1~2문장으로 보여준다: ${directorOutput.event}`;
  }

  if (inputMode === "action") {
    return null;
  }

  if (!shouldCreateSceneNarration(publicContext, pack)) {
    return null;
  }

  return [
    "현재 장면에서 유저 입력 직후의 공간, 분위기, 인물들의 비언어적 반응을 1~2문장으로 묘사한다.",
    "캐릭터 대사는 쓰지 말고, 새 단서나 외부 사건을 만들지 말며, 현재 위치와 직전 입력에 붙인다.",
  ].join(" ");
}

function shouldCreateSceneNarration(publicContext: PublicContext, pack: ScenarioPack): boolean {
  if (pack.manifest.uiMode === "scene-first") {
    return true;
  }

  if (pack.manifest.uiMode === "messenger-first" && publicContext.sceneMode === "messenger") {
    return false;
  }

  return publicContext.sceneMode !== "messenger";
}

function buildSystemMessageContent(directorOutput: DirectorOutput): string | null {
  const lines: string[] = [];

  const stateChanges = formatStateDelta(directorOutput.stateDelta);
  if (stateChanges.length > 0) {
    lines.push(`상태 변화: ${stateChanges.join(", ")}`);
  }

  if (directorOutput.subObjectiveUpdate) {
    const objective = directorOutput.subObjectiveUpdate.description ?? directorOutput.subObjectiveUpdate.id ?? "목표";
    lines.push(`목표 ${directorOutput.subObjectiveUpdate.action}: ${objective}`);
  }

  if (directorOutput.relationshipUpdate) {
    lines.push(
      `관계 변화: ${directorOutput.relationshipUpdate.sourceId} → ${directorOutput.relationshipUpdate.targetId} `
      + `${directorOutput.relationshipUpdate.descriptor} (${directorOutput.relationshipUpdate.intensityDelta >= 0 ? "+" : ""}${directorOutput.relationshipUpdate.intensityDelta})`,
    );
  }

  if (directorOutput.directives.length > 0) {
    lines.push(`연출: ${directorOutput.directives.map((directive) => directive.effect).join(", ")}`);
  }

  return lines.length > 0 ? lines.join("\n") : null;
}

function formatStateDelta(delta: DirectorOutput["stateDelta"]): string[] {
  const changes: string[] = [];
  if (typeof delta.tension === "number" && delta.tension !== 0) {
    changes.push(`긴장 ${delta.tension > 0 ? "+" : ""}${delta.tension}`);
  }
  if (typeof delta.danger === "number" && delta.danger !== 0) {
    changes.push(`위험 ${delta.danger > 0 ? "+" : ""}${delta.danger}`);
  }
  if (delta.locationId) {
    changes.push(`위치 ${delta.locationId}`);
  }
  if (delta.backgroundId) {
    changes.push(`배경 ${delta.backgroundId}`);
  }
  if (delta.sceneMode) {
    changes.push(`모드 ${delta.sceneMode}`);
  }
  return changes;
}

/**
 * Reconstruct a minimal ScenarioPack from session data.
 * In production this would load from disk; here we reconstruct from persisted session.
 */
function reconstructPack(session: SessionStateV2): ScenarioPack {
  // The session stores characters and worldState but not the full pack prompts.
  // For now, return a minimal pack. The full implementation will cache loaded packs.
  return {
    manifest: {
      id: session.scenarioPackId,
      title: session.title,
      subtitle: "",
      genre: "horror", // TODO: persist genre in session
      version: "1.0.0",
      engineVersion: ">=2.0.0",
    },
    scenarioCard: {
      id: session.scenarioPackId,
      title: session.title,
      subtitle: "",
      description: "",
      spaceRules: [],
      chatRules: [],
      toneRules: [],
      hardNos: [],
      backgroundIds: [],
      initialLocationId: session.worldState.locationId,
      initialBackgroundId: session.worldState.backgroundId,
      initialSceneMode: "messenger",
      interventionPrompt: "",
      openingBeats: [],
    },
    characters: session.characters,
    directorPrompt: "", // Will be loaded from pack cache
    narratorPrompt: "",
    mainObjective: {
      id: session.worldState.mainObjective.id,
      description: session.worldState.mainObjective.description,
    },
    eventTriggers: [],
  };
}
