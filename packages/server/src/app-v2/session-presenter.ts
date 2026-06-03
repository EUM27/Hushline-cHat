import type { ClientSessionState, ScenarioPack, SessionStateV2 } from "@hushline/shared";
import { buildCaseBoard } from "./case-board.js";

/**
 * Convert v2 session to v1-compatible shape for the existing client.
 * Client expects: session.scene, session.scenario, session.persona, session.characters, session.messages.
 */
export function toClientSession(session: SessionStateV2, scenarioPack?: ScenarioPack): ClientSessionState {
  const scenarioCard = scenarioPack?.scenarioCard;
  const { turnCheckpoints: _turnCheckpoints, ...clientSession } = session;

  return {
    ...clientSession,
    caseBoard: buildCaseBoard(session, scenarioPack),
    scene: {
      sessionId: session.worldState.sessionId,
      scenarioId: session.worldState.scenarioId,
      locationId: session.worldState.locationId,
      backgroundId: session.worldState.backgroundId,
      activeSpeakerId: session.worldState.recentSpeakerIds[0] ?? null,
      tension: session.worldState.tension,
      danger: session.worldState.danger,
      turnNumber: session.worldState.turnNumber,
      hasEnteredScene: session.worldState.hasEnteredScene,
      recentSpeakerIds: session.worldState.recentSpeakerIds,
      relationships: Object.fromEntries(
        Object.entries(session.worldState.characterStates).map(([id, state]) => [id, state.relationshipToUser]),
      ),
    },
    scenario: {
      id: session.scenarioPackId,
      title: scenarioCard?.title ?? session.title,
      subtitle: scenarioCard?.subtitle ?? "",
      description: scenarioCard?.description ?? "",
      spaceRules: scenarioCard?.spaceRules ?? [],
      chatRules: scenarioCard?.chatRules ?? [],
      toneRules: scenarioCard?.toneRules ?? [],
      hardNos: scenarioCard?.hardNos ?? [],
      backgroundIds: scenarioCard?.backgroundIds ?? [],
      initialLocationId: scenarioCard?.initialLocationId ?? session.worldState.locationId,
      initialBackgroundId: scenarioCard?.initialBackgroundId ?? session.worldState.backgroundId,
      initialSceneMode: scenarioCard?.initialSceneMode ?? session.worldState.sceneMode,
      uiMode: scenarioPack?.manifest.uiMode ?? (session.worldState.sceneMode === "messenger" ? "messenger-first" : "scene-first"),
      interventionPrompt: scenarioCard?.interventionPrompt ?? "",
      openingBeats: scenarioCard?.openingBeats ?? [],
    },
    persona: {
      ...session.persona,
      role: session.persona.role ?? "",
      mbti: "unspecified",
      relationshipTags: session.persona.relationshipTags ?? [],
      ...(session.persona.description ? { description: session.persona.description } : {}),
      ...(session.persona.appearance ? { appearance: session.persona.appearance } : {}),
    },
    characters: session.characters.map((character) => ({
      id: character.id,
      name: character.name,
      shortName: character.shortName,
      role: character.role,
      profileKind: character.profileKind,
      ...(character.anonymousLabel ? { anonymousLabel: character.anonymousLabel } : {}),
      revealed: false,
      provider: "dry-run" as const,
      model: `dry-run/${character.id}`,
      mbti: character.mbti,
      ocean: character.ocean,
      systemPrompt: character.systemPrompt,
      relationshipTags: character.relationshipTags ?? character.handout.surfacePersonality ?? [],
      ...(character.spriteSetId ? { spriteSetId: character.spriteSetId } : {}),
      ...(character.avatarId ? { avatarId: character.avatarId } : {}),
    })),
  };
}
