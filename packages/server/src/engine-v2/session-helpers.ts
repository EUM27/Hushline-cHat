import type { ScenarioPack, SessionStateV2 } from "@hushline/shared";

/**
 * Reconstruct a minimal ScenarioPack from session data.
 * In production this would load from disk; here we reconstruct from persisted session.
 */
export function reconstructPack(session: SessionStateV2): ScenarioPack {
  return {
    manifest: {
      id: session.scenarioPackId,
      title: session.title,
      subtitle: "",
      genre: "horror",
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
    directorPrompt: "",
    narratorPrompt: "",
    mainObjective: {
      id: session.worldState.mainObjective.id,
      description: session.worldState.mainObjective.description,
    },
    eventTriggers: [],
    sceneDevices: [],
  };
}
