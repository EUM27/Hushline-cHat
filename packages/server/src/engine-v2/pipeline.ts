// ──────────────────────────────────────────────
// Engine v2 — Turn Pipeline Orchestrator
// ──────────────────────────────────────────────
// Main entry point for processing a user turn.
// Sequence: Input → Director → Narrator → Characters → State Update
// ──────────────────────────────────────────────

import type {
  DirectorOutput,
  InputMode,
  ModelConnection,
  ScenarioPack,
  SessionStateV2,
  TurnMessage,
  TurnOptionsV2,
  TurnResultV2,
  WorldState,
} from "@hushline/shared";

import { classifyInput } from "./input-classifier.js";
import { buildPublicContext, buildPrivateHandout, buildOmniscientContext } from "./context-builder.js";
import { invokeDirector } from "./director.js";
import { invokeNarrator } from "./narrator.js";
import { invokeCharacter } from "./character.js";
import { applyDirectorOutput, markCharacterSpoke } from "./state-manager.js";
import { getFallbackDirectorOutput } from "./output-sanitizer.js";

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
  options: TurnOptionsV2 = {},
): Promise<TurnResultV2> {
  const pack = reconstructPack(session);
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
  const narratorResult = await invokeNarrator(
    directorOutput.narratorInstruction,
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
        );
      }),
    );

    for (const result of characterResults) {
      if (!result) continue;
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
    turnMessages.push({
      id: crypto.randomUUID(),
      sessionId: session.id,
      role: "narrator",
      content: narratorResult.content,
      speakerLabel: "[나레이터]",
      generationSource: narratorResult.source === "api" ? "api" : "dry-run",
      ...(narratorResult.error ? { fallbackReason: narratorResult.error } : {}),
      createdAt: new Date().toISOString(),
    });
  }

  // Character messages
  turnMessages.push(...characterMessages);

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
