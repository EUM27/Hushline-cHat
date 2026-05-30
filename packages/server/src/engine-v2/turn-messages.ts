import type { DirectorOutput, TurnMessage } from "@hushline/shared";

export function composeSceneMessages(
  directorOutput: DirectorOutput,
  narratorMessage: TurnMessage | null,
  characterMessages: TurnMessage[],
  systemMessage: TurnMessage | null,
): TurnMessage[] {
  const plan = directorOutput.messagePlan;
  if (!plan || plan.length === 0) {
    return [
      ...(narratorMessage ? [narratorMessage] : []),
      ...characterMessages,
      ...(systemMessage ? [systemMessage] : []),
    ];
  }

  const result: TurnMessage[] = [];
  const remainingCharacters = new Map(characterMessages.map((message) => [message.characterId, message]));
  const speakerOrder = directorOutput.speakers.length > 0
    ? directorOutput.speakers
    : characterMessages.map((message) => message.characterId).filter((id): id is string => Boolean(id));
  const plannedCharacterIds = new Set(plan
    .filter((item) => item.kind === "character" && item.speakerId)
    .map((item) => item.speakerId!));
  let narratorUsed = false;
  let systemUsed = false;

  const pushCharacter = (speakerId: string | undefined) => {
    if (!speakerId) return;
    const message = remainingCharacters.get(speakerId);
    if (!message) return;
    result.push(message);
    remainingCharacters.delete(speakerId);
  };

  const pushUnplannedBefore = (speakerId: string) => {
    for (const orderedSpeakerId of speakerOrder) {
      if (orderedSpeakerId === speakerId) return;
      if (plannedCharacterIds.has(orderedSpeakerId)) continue;
      pushCharacter(orderedSpeakerId);
    }
  };

  const pushRemainingCharacters = () => {
    for (const speakerId of speakerOrder) {
      pushCharacter(speakerId);
    }
    for (const speakerId of remainingCharacters.keys()) {
      pushCharacter(speakerId);
    }
  };

  for (const item of plan) {
    if (item.kind === "narrator" && narratorMessage && !narratorUsed) {
      result.push(narratorMessage);
      narratorUsed = true;
      continue;
    }
    if (item.kind === "system" && systemMessage && !systemUsed) {
      result.push(systemMessage);
      systemUsed = true;
      continue;
    }
    if (item.kind === "character" && item.speakerId) {
      pushUnplannedBefore(item.speakerId);
      pushCharacter(item.speakerId);
    }
  }
  pushRemainingCharacters();

  if (result.length === 0) {
    return [
      ...(narratorMessage ? [narratorMessage] : []),
      ...characterMessages,
      ...(systemMessage ? [systemMessage] : []),
    ];
  }

  return result;
}

export function buildSystemMessageContent(directorOutput: DirectorOutput): string | null {
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
