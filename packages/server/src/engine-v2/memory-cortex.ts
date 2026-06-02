import type {
  CharacterDefinition,
  MemoryChunk,
  MemoryEntity,
  MemoryRetrievalCandidate,
  MemoryRetrievalQuery,
  SessionStateV2,
  TurnMessage,
} from "@hushline/shared";

export function seedMemoryEntities(input: {
  sessionId: string;
  scenarioPackId: string;
  persona: SessionStateV2["persona"];
  characters: CharacterDefinition[];
  turnNumber: number;
}): MemoryEntity[] {
  const personaAliases = uniqueDefined([input.persona.name, input.persona.shortName]);
  const entities: MemoryEntity[] = [
    {
      id: `entity_${input.sessionId}_persona_user`,
      sessionId: input.sessionId,
      scenarioPackId: input.scenarioPackId,
      canonicalName: input.persona.name,
      kind: "persona",
      aliases: personaAliases,
      characterId: "user",
      firstSeenTurn: input.turnNumber,
      lastSeenTurn: input.turnNumber,
      salience: 0.8,
      isUserPersona: true,
    },
  ];

  for (const character of input.characters) {
    const aliases = uniqueDefined([character.name, character.shortName, character.anonymousLabel]);
    entities.push({
      id: `entity_${input.sessionId}_${character.id}`,
      sessionId: input.sessionId,
      scenarioPackId: input.scenarioPackId,
      canonicalName: character.name,
      kind: "character",
      aliases,
      characterId: character.id,
      firstSeenTurn: input.turnNumber,
      lastSeenTurn: input.turnNumber,
      salience: 0.7,
      isUserPersona: false,
    });
  }

  return entities;
}

export function buildMemoryChunksFromTurn(input: {
  sessionId: string;
  scenarioPackId: string;
  turnNumber: number;
  messages: TurnMessage[];
  createdAt: string;
}): MemoryChunk[] {
  return input.messages.map((message) => ({
    id: `chunk_${input.sessionId}_${message.id}`,
    sessionId: input.sessionId,
    scenarioPackId: input.scenarioPackId,
    turnNumber: input.turnNumber,
    messageId: message.id,
    role: message.role,
    speakerId: message.characterId ?? (message.role === "user" ? "user" : message.role),
    ...(message.speakerLabel ? { speakerLabel: message.speakerLabel } : {}),
    content: message.content,
    summary: summarizeMemoryContent(message.content),
    importance: inferMessageImportance(message),
    emotion: "neutral",
    visibility: "public",
    createdAt: input.createdAt,
  }));
}

export function scoreMemoryCandidate(input: {
  chunk: MemoryChunk;
  query: MemoryRetrievalQuery;
  linkedEntityAliases?: string[];
  relationshipRelevance?: number;
}): MemoryRetrievalCandidate {
  const visibilityAllowed = input.query.allowedVisibility.includes(input.chunk.visibility);
  const components = {
    text: scoreText(input.query.input, `${input.chunk.content} ${input.chunk.summary}`),
    entity: scoreEntityOverlap(input.query.entityAliases, input.linkedEntityAliases ?? []),
    relationship: clampMemoryScore(input.relationshipRelevance ?? 0),
    salience: clampMemoryScore(input.chunk.importance * 0.3),
    recency: scoreRecency(input.query.turnNumber, input.chunk.turnNumber),
    visibility: visibilityAllowed ? 0 : -1,
  };
  const rawScore = components.text
    + components.entity
    + components.relationship
    + components.salience
    + components.recency
    + components.visibility;

  return {
    chunkId: input.chunk.id,
    chunk: input.chunk,
    score: clampMemoryScore(rawScore),
    components,
    visibilityAllowed,
    reason: visibilityAllowed ? "text+entity+salience" : `blocked:${input.chunk.visibility}`,
  };
}

export function formatDirectorMemoryContext(candidates: MemoryRetrievalCandidate[]): string[] {
  const visible = candidates
    .filter((candidate) => candidate.visibilityAllowed)
    .sort((left, right) => right.score - left.score)
    .slice(0, 6);

  if (visible.length === 0) {
    return [];
  }

  return [
    "[Memory Cortex]",
    ...visible.map((candidate) => {
      const speaker = candidate.chunk.speakerLabel ?? candidate.chunk.speakerId ?? candidate.chunk.role;
      const summary = candidate.chunk.summary || candidate.chunk.content;
      return `- T${candidate.chunk.turnNumber} ${speaker}: ${summary} (score ${candidate.score.toFixed(2)}, ${candidate.chunk.visibility})`;
    }),
  ];
}

export function clampMemoryScore(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function inferMessageImportance(message: TurnMessage): number {
  if (message.role === "user" && message.inputMode === "action") {
    return 0.55;
  }
  if (message.role === "system") {
    return 0.5;
  }
  if (message.role === "narrator") {
    return 0.45;
  }
  if (message.role === "character") {
    return 0.6;
  }
  return 0.4;
}

function summarizeMemoryContent(content: string): string {
  const trimmed = content.replace(/\s+/g, " ").trim();
  return trimmed.length > 80 ? `${trimmed.slice(0, 77)}...` : trimmed;
}

function scoreText(query: string, content: string): number {
  const terms = tokenize(query);
  if (terms.length === 0) {
    return 0;
  }
  const haystack = normalize(content);
  const matches = terms.filter((term) => haystack.includes(term)).length;
  return clampMemoryScore((matches / terms.length) * 0.35);
}

function scoreEntityOverlap(queryAliases: string[], linkedAliases: string[]): number {
  const linked = new Set(linkedAliases.map(normalize).filter(Boolean));
  if (linked.size === 0) {
    return 0;
  }
  const matches = queryAliases.map(normalize).filter((alias) => linked.has(alias)).length;
  return clampMemoryScore(matches > 0 ? 0.25 : 0);
}

function scoreRecency(queryTurn: number, chunkTurn: number): number {
  const age = Math.max(0, queryTurn - chunkTurn);
  return clampMemoryScore(0.1 / (1 + age / 10));
}

function tokenize(value: string): string[] {
  return normalize(value).split(/[^0-9a-z가-힣]+/u).filter((term) => term.length > 0);
}

function normalize(value: string): string {
  return value.normalize("NFKC").toLowerCase().trim();
}

function uniqueDefined(values: Array<string | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}
