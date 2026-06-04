import type {
  GenerationModelSnapshot,
  MemoryRetrievalCandidate,
  ModelConnection,
  ScenarioPack,
  TurnOptionsV2,
  WorldState,
} from "@hushline/shared";

export type TurnRuntimeOptionsV2 = TurnOptionsV2 & {
  scenarioPack?: ScenarioPack;
  memoryCandidates?: MemoryRetrievalCandidate[];
};

export function getConnection(
  connections: Record<string, ModelConnection>,
  slot: string,
): ModelConnection | undefined {
  return connections[slot] ?? connections.default;
}

export function snapshotGenerationModel(connection: ModelConnection | undefined): GenerationModelSnapshot | undefined {
  if (!connection?.model) {
    return undefined;
  }

  return {
    providerId: connection.providerId,
    model: connection.model,
  };
}

export function getAllowedBackgroundIds(pack: ScenarioPack, worldState: WorldState): string[] {
  const ids = pack.scenarioCard.backgroundIds.length > 0
    ? pack.scenarioCard.backgroundIds
    : [worldState.backgroundId];
  return [...new Set(ids.filter(Boolean))];
}
