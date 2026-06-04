import type { TurnMessage } from "./session.js";

export type MemoryVisibility = "public" | "director-only" | "private-character" | "vault-readonly";
export type MemoryEmotion = "neutral" | "warm" | "tense" | "danger" | "sad" | "angry";
export type MemoryEntityKind = "persona" | "character" | "location" | "object" | "concept" | "group";
export type MemoryRelationType = "relationship" | "owns" | "knows" | "saw" | "mentioned" | "located_at" | "objective";

export interface MemoryChunk {
  id: string;
  sessionId: string;
  scenarioPackId: string;
  turnNumber: number;
  messageId?: string;
  role: TurnMessage["role"] | "event" | "summary";
  speakerId?: string;
  speakerLabel?: string;
  content: string;
  summary: string;
  importance: number;
  emotion: MemoryEmotion;
  visibility: MemoryVisibility;
  createdAt: string;
  supersededAt?: string;
}

export interface MemoryEntity {
  id: string;
  sessionId: string;
  scenarioPackId: string;
  canonicalName: string;
  kind: MemoryEntityKind;
  aliases: string[];
  characterId?: string;
  firstSeenTurn: number;
  lastSeenTurn: number;
  salience: number;
  isUserPersona: boolean;
}

export interface MemoryRelation {
  id: string;
  sessionId: string;
  scenarioPackId: string;
  sourceEntityId: string;
  targetEntityId: string;
  relationType: MemoryRelationType;
  descriptor: string;
  intensity: number;
  confidence: number;
  evidenceChunkIds: string[];
  updatedTurn: number;
}

export interface MemoryChunkEntityLink {
  chunkId: string;
  entityId: string;
  roleInMemory: "speaker" | "target" | "mentioned" | "location";
}

export interface MemoryRetrievalQuery {
  sessionId: string;
  scenarioPackId: string;
  input: string;
  turnNumber: number;
  entityAliases: string[];
  allowedVisibility: MemoryVisibility[];
  locationId?: string;
  speakerIds?: string[];
}

export interface MemoryScoreComponents {
  text: number;
  entity: number;
  relationship: number;
  salience: number;
  recency: number;
  visibility: number;
}

export interface MemoryRetrievalCandidate {
  chunkId: string;
  chunk: MemoryChunk;
  score: number;
  components: MemoryScoreComponents;
  visibilityAllowed: boolean;
  reason: string;
}

export interface MemoryRetrievalTrace {
  id: string;
  sessionId: string;
  turnNumber: number;
  query: MemoryRetrievalQuery;
  candidateIds: string[];
  selectedIds: string[];
  scores: Record<string, MemoryScoreComponents>;
  createdAt: string;
}

export interface MemoryVault {
  id: string;
  title: string;
  sourceSessionId: string;
  scenarioPackId: string;
  summary: string;
  entities: MemoryEntity[];
  relations: MemoryRelation[];
  coreChunks: MemoryChunk[];
  createdAt: string;
}

export interface MemoryVaultLink {
  sessionId: string;
  vaultId: string;
  mode: "read_only";
  createdAt: string;
}
