import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Database } from "bun:sqlite";
import type { MemoryChunk, MemoryEntity, MemoryRetrievalTrace } from "@hushline/shared";

export interface MemoryCortexStore {
  saveEntities(entities: MemoryEntity[]): void;
  listEntities(sessionId: string): MemoryEntity[];
  saveChunks(chunks: MemoryChunk[]): void;
  listChunks(sessionId: string): MemoryChunk[];
  searchChunks(input: { sessionId: string; query: string; limit: number }): MemoryChunk[];
  deleteTurnsAfter(sessionId: string, turnNumber: number): void;
  deleteMessageIds(sessionId: string, messageIds: string[]): void;
  saveRetrievalTrace(trace: MemoryRetrievalTrace): void;
  getLatestRetrievalTrace(sessionId: string): MemoryRetrievalTrace | null;
}

export function createMemoryCortexStore(dbPath = defaultDbPath()): MemoryCortexStore {
  if (dbPath !== ":memory:") {
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_chunks (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      scenario_pack_id TEXT NOT NULL,
      turn_number INTEGER NOT NULL,
      message_id TEXT,
      role TEXT NOT NULL,
      speaker_id TEXT,
      speaker_label TEXT,
      content TEXT NOT NULL,
      summary TEXT NOT NULL,
      importance REAL NOT NULL,
      emotion TEXT NOT NULL,
      visibility TEXT NOT NULL,
      created_at TEXT NOT NULL,
      superseded_at TEXT
    );

    CREATE TABLE IF NOT EXISTS memory_entities (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      scenario_pack_id TEXT NOT NULL,
      canonical_name TEXT NOT NULL,
      kind TEXT NOT NULL,
      aliases_json TEXT NOT NULL,
      character_id TEXT,
      first_seen_turn INTEGER NOT NULL,
      last_seen_turn INTEGER NOT NULL,
      salience REAL NOT NULL,
      is_user_persona INTEGER NOT NULL
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS memory_chunks_fts USING fts5(
      id UNINDEXED,
      session_id UNINDEXED,
      content,
      summary
    );

    CREATE TABLE IF NOT EXISTS memory_retrieval_traces (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      turn_number INTEGER NOT NULL,
      query_json TEXT NOT NULL,
      candidate_ids_json TEXT NOT NULL,
      selected_ids_json TEXT NOT NULL,
      scores_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  if (dbPath !== ":memory:") {
    db.exec("PRAGMA journal_mode = WAL;");
  }

  const upsertEntity = db.query(`
    INSERT INTO memory_entities (
      id, session_id, scenario_pack_id, canonical_name, kind, aliases_json, character_id,
      first_seen_turn, last_seen_turn, salience, is_user_persona
    ) VALUES (
      $id, $sessionId, $scenarioPackId, $canonicalName, $kind, $aliasesJson, $characterId,
      $firstSeenTurn, $lastSeenTurn, $salience, $isUserPersona
    )
    ON CONFLICT(id) DO UPDATE SET
      canonical_name = excluded.canonical_name,
      aliases_json = excluded.aliases_json,
      last_seen_turn = excluded.last_seen_turn,
      salience = excluded.salience
  `);
  const listEntitiesQuery = db.query(`
    SELECT *
    FROM memory_entities
    WHERE session_id = $sessionId
    ORDER BY is_user_persona DESC, canonical_name ASC
  `);
  const upsertChunk = db.query(`
    INSERT INTO memory_chunks (
      id, session_id, scenario_pack_id, turn_number, message_id, role, speaker_id, speaker_label,
      content, summary, importance, emotion, visibility, created_at, superseded_at
    ) VALUES (
      $id, $sessionId, $scenarioPackId, $turnNumber, $messageId, $role, $speakerId, $speakerLabel,
      $content, $summary, $importance, $emotion, $visibility, $createdAt, $supersededAt
    )
    ON CONFLICT(id) DO UPDATE SET
      content = excluded.content,
      summary = excluded.summary,
      importance = excluded.importance,
      emotion = excluded.emotion,
      visibility = excluded.visibility,
      superseded_at = excluded.superseded_at
  `);
  const deleteFtsById = db.query("DELETE FROM memory_chunks_fts WHERE id = $id");
  const insertFts = db.query(`
    INSERT INTO memory_chunks_fts (id, session_id, content, summary)
    VALUES ($id, $sessionId, $content, $summary)
  `);
  const listChunksQuery = db.query(`
    SELECT *
    FROM memory_chunks
    WHERE session_id = $sessionId
      AND superseded_at IS NULL
    ORDER BY turn_number ASC, created_at ASC
  `);
  const searchQuery = db.query(`
    SELECT c.*
    FROM memory_chunks_fts f
    JOIN memory_chunks c ON c.id = f.id
    WHERE f.session_id = $sessionId
      AND memory_chunks_fts MATCH $query
      AND c.superseded_at IS NULL
    ORDER BY bm25(memory_chunks_fts)
    LIMIT $limit
  `);
  const deleteAfterFts = db.query(`
    DELETE FROM memory_chunks_fts
    WHERE id IN (
      SELECT id
      FROM memory_chunks
      WHERE session_id = $sessionId
        AND turn_number > $turnNumber
    )
  `);
  const deleteAfter = db.query(`
    DELETE FROM memory_chunks
    WHERE session_id = $sessionId
      AND turn_number > $turnNumber
  `);
  const deleteMessageFts = db.query(`
    DELETE FROM memory_chunks_fts
    WHERE id IN (
      SELECT id
      FROM memory_chunks
      WHERE session_id = $sessionId
        AND message_id = $messageId
    )
  `);
  const deleteMessage = db.query(`
    DELETE FROM memory_chunks
    WHERE session_id = $sessionId
      AND message_id = $messageId
  `);
  const insertTrace = db.query(`
    INSERT INTO memory_retrieval_traces (
      id, session_id, turn_number, query_json, candidate_ids_json, selected_ids_json, scores_json, created_at
    ) VALUES (
      $id, $sessionId, $turnNumber, $queryJson, $candidateIdsJson, $selectedIdsJson, $scoresJson, $createdAt
    )
    ON CONFLICT(id) DO UPDATE SET
      query_json = excluded.query_json,
      candidate_ids_json = excluded.candidate_ids_json,
      selected_ids_json = excluded.selected_ids_json,
      scores_json = excluded.scores_json
  `);
  const latestTrace = db.query(`
    SELECT *
    FROM memory_retrieval_traces
    WHERE session_id = $sessionId
    ORDER BY turn_number DESC, created_at DESC
    LIMIT 1
  `);

  return {
    saveEntities(entities): void {
      const save = db.transaction((items: MemoryEntity[]) => {
        for (const entity of items) {
          upsertEntity.run(toEntityParams(entity));
        }
      });
      save(entities);
    },

    listEntities(sessionId): MemoryEntity[] {
      return listEntitiesQuery.all({ $sessionId: sessionId }).map(rowToEntity);
    },

    saveChunks(chunks): void {
      const save = db.transaction((items: MemoryChunk[]) => {
        for (const chunk of items) {
          upsertChunk.run(toChunkParams(chunk));
          deleteFtsById.run({ $id: chunk.id });
          if (!chunk.supersededAt) {
            insertFts.run({
              $id: chunk.id,
              $sessionId: chunk.sessionId,
              $content: chunk.content,
              $summary: chunk.summary,
            });
          }
        }
      });
      save(chunks);
    },

    listChunks(sessionId): MemoryChunk[] {
      return listChunksQuery.all({ $sessionId: sessionId }).map(rowToChunk);
    },

    searchChunks(input): MemoryChunk[] {
      const query = toFtsMatchQuery(input.query);
      if (!query) {
        return [];
      }
      return searchQuery
        .all({
          $sessionId: input.sessionId,
          $query: query,
          $limit: input.limit,
        })
        .map(rowToChunk);
    },

    deleteTurnsAfter(sessionId, turnNumber): void {
      deleteAfterFts.run({ $sessionId: sessionId, $turnNumber: turnNumber });
      deleteAfter.run({ $sessionId: sessionId, $turnNumber: turnNumber });
    },

    deleteMessageIds(sessionId, messageIds): void {
      for (const messageId of messageIds) {
        deleteMessageFts.run({ $sessionId: sessionId, $messageId: messageId });
        deleteMessage.run({ $sessionId: sessionId, $messageId: messageId });
      }
    },

    saveRetrievalTrace(trace): void {
      insertTrace.run({
        $id: trace.id,
        $sessionId: trace.sessionId,
        $turnNumber: trace.turnNumber,
        $queryJson: JSON.stringify(trace.query),
        $candidateIdsJson: JSON.stringify(trace.candidateIds),
        $selectedIdsJson: JSON.stringify(trace.selectedIds),
        $scoresJson: JSON.stringify(trace.scores),
        $createdAt: trace.createdAt,
      });
    },

    getLatestRetrievalTrace(sessionId): MemoryRetrievalTrace | null {
      const row = latestTrace.get({ $sessionId: sessionId }) as TraceRow | null;
      return row ? rowToTrace(row) : null;
    },
  };
}

function toFtsMatchQuery(input: string): string {
  const tokens = input.match(/[\p{L}\p{N}_]+/gu) ?? [];
  return tokens
    .slice(0, 12)
    .map((token) => `"${token}"`)
    .join(" OR ");
}

type ChunkRow = {
  id: string;
  session_id: string;
  scenario_pack_id: string;
  turn_number: number;
  message_id: string | null;
  role: MemoryChunk["role"];
  speaker_id: string | null;
  speaker_label: string | null;
  content: string;
  summary: string;
  importance: number;
  emotion: MemoryChunk["emotion"];
  visibility: MemoryChunk["visibility"];
  created_at: string;
  superseded_at: string | null;
};

type EntityRow = {
  id: string;
  session_id: string;
  scenario_pack_id: string;
  canonical_name: string;
  kind: MemoryEntity["kind"];
  aliases_json: string;
  character_id: string | null;
  first_seen_turn: number;
  last_seen_turn: number;
  salience: number;
  is_user_persona: number;
};

type TraceRow = {
  id: string;
  session_id: string;
  turn_number: number;
  query_json: string;
  candidate_ids_json: string;
  selected_ids_json: string;
  scores_json: string;
  created_at: string;
};

function defaultDbPath(): string {
  return resolve(process.env.HUSHLINE_DB_PATH ?? "packages/server/data/hushline.db");
}

function toEntityParams(entity: MemoryEntity): Record<string, string | number | null> {
  return {
    $id: entity.id,
    $sessionId: entity.sessionId,
    $scenarioPackId: entity.scenarioPackId,
    $canonicalName: entity.canonicalName,
    $kind: entity.kind,
    $aliasesJson: JSON.stringify(entity.aliases),
    $characterId: entity.characterId ?? null,
    $firstSeenTurn: entity.firstSeenTurn,
    $lastSeenTurn: entity.lastSeenTurn,
    $salience: entity.salience,
    $isUserPersona: entity.isUserPersona ? 1 : 0,
  };
}

function toChunkParams(chunk: MemoryChunk): Record<string, string | number | null> {
  return {
    $id: chunk.id,
    $sessionId: chunk.sessionId,
    $scenarioPackId: chunk.scenarioPackId,
    $turnNumber: chunk.turnNumber,
    $messageId: chunk.messageId ?? null,
    $role: chunk.role,
    $speakerId: chunk.speakerId ?? null,
    $speakerLabel: chunk.speakerLabel ?? null,
    $content: chunk.content,
    $summary: chunk.summary,
    $importance: chunk.importance,
    $emotion: chunk.emotion,
    $visibility: chunk.visibility,
    $createdAt: chunk.createdAt,
    $supersededAt: chunk.supersededAt ?? null,
  };
}

function rowToEntity(row: unknown): MemoryEntity {
  const typed = row as EntityRow;
  return {
    id: typed.id,
    sessionId: typed.session_id,
    scenarioPackId: typed.scenario_pack_id,
    canonicalName: typed.canonical_name,
    kind: typed.kind,
    aliases: JSON.parse(typed.aliases_json) as string[],
    ...(typed.character_id ? { characterId: typed.character_id } : {}),
    firstSeenTurn: typed.first_seen_turn,
    lastSeenTurn: typed.last_seen_turn,
    salience: typed.salience,
    isUserPersona: typed.is_user_persona === 1,
  };
}

function rowToChunk(row: unknown): MemoryChunk {
  const typed = row as ChunkRow;
  return {
    id: typed.id,
    sessionId: typed.session_id,
    scenarioPackId: typed.scenario_pack_id,
    turnNumber: typed.turn_number,
    ...(typed.message_id ? { messageId: typed.message_id } : {}),
    role: typed.role,
    ...(typed.speaker_id ? { speakerId: typed.speaker_id } : {}),
    ...(typed.speaker_label ? { speakerLabel: typed.speaker_label } : {}),
    content: typed.content,
    summary: typed.summary,
    importance: typed.importance,
    emotion: typed.emotion,
    visibility: typed.visibility,
    createdAt: typed.created_at,
    ...(typed.superseded_at ? { supersededAt: typed.superseded_at } : {}),
  };
}

function rowToTrace(row: TraceRow): MemoryRetrievalTrace {
  return {
    id: row.id,
    sessionId: row.session_id,
    turnNumber: row.turn_number,
    query: JSON.parse(row.query_json) as MemoryRetrievalTrace["query"],
    candidateIds: JSON.parse(row.candidate_ids_json) as string[],
    selectedIds: JSON.parse(row.selected_ids_json) as string[],
    scores: JSON.parse(row.scores_json) as MemoryRetrievalTrace["scores"],
    createdAt: row.created_at,
  };
}
