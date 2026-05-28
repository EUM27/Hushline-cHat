import type { CharacterDefinition, ScenarioPack, StateLawSnapshot, WorldState } from "@hushline/shared";

export function buildStateLawSnapshot(worldState: WorldState, pack: ScenarioPack): StateLawSnapshot {
  const allowedLocations = [
    worldState.locationId,
    pack.scenarioCard.initialLocationId,
    ...pack.scenarioCard.backgroundIds,
  ].filter(Boolean);
  const outputRules = [
    "유저 행동/생각/감정 대리 금지",
    "허용되지 않은 장소 이동 금지",
    "조사 전 진상/범인/트릭 확정 금지",
    "나레이터의 캐릭터 대사 작성 금지",
    "캐릭터의 타인 대사/행동 작성 금지",
  ];

  if (worldState.tension >= 8 && worldState.danger >= 7 && worldState.recentEvents.length >= 3) {
    outputRules.push("장면 마무리 또는 감정적 이탈 선택지를 허용한다");
  }

  return {
    immutableFacts: [
      `시나리오: ${pack.manifest.title}`,
      `현재 허용 장소: ${worldState.locationId}`,
      `허용 장소 후보: ${[...new Set(allowedLocations)].join(", ")}`,
      `주 목표: ${worldState.mainObjective.description}`,
    ],
    slowState: Object.values(worldState.characterStates).map((state) => {
      const character = pack.characters.find((candidate) => candidate.id === state.id);
      return `${getCharacterLabel(character, state.id)}: 신뢰도 ${state.relationshipToUser}`;
    }),
    scenePressure: [
      `긴장 ${worldState.tension} / 위험 ${worldState.danger}`,
      `장면 모드: ${worldState.sceneMode}`,
      `현재 위치: ${worldState.locationId}`,
    ],
    outputRules,
  };
}

function getCharacterLabel(character: CharacterDefinition | undefined, fallbackId: string): string {
  return character?.anonymousLabel ?? character?.name ?? fallbackId;
}
