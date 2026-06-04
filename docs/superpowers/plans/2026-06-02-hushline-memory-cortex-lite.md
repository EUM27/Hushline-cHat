# Hushline Memory Cortex Lite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a SQLite-backed Cortex-lite memory layer that captures structured turn memories, scores deterministic retrieval candidates, and injects safe memory context into the Director first.

**Architecture:** Add shared memory DTOs under engine v2, pure server-side extraction and scoring helpers, a separate SQLite store beside `sessions_v2`, and narrow session-route hooks for create/advance/reroll/undo. Keep player-facing UI unchanged until the store and Director retrieval path are verified.

**Tech Stack:** TypeScript, Bun test, Bun SQLite, Hono, Zod-free internal DTOs, existing `@hushline/shared` engine v2 exports.

---

## File Map

- Create `packages/shared/src/engine-v2/memory-cortex.ts`
  Defines memory chunk, entity, relation, score, retrieval trace, and vault DTOs shared by server/client diagnostics.
- Modify `packages/shared/src/engine-v2.ts`
  Re-export the new memory DTOs through the existing shared engine v2 barrel.
- Create `packages/server/src/engine-v2/memory-cortex.ts`
  Pure deterministic helpers: entity seed extraction, turn chunk creation, salience scoring, candidate scoring, visibility filters, context formatting.
- Create `packages/server/src/engine-v2/__tests__/memory-cortex.test.ts`
  TDD coverage for pure helpers before production code.
- Create `packages/server/src/store/memory-cortex-store.ts`
  SQLite schema, FTS table, CRUD helpers, rollback helpers, and latest trace retrieval.
- Create `packages/server/src/store/__tests__/memory-cortex-store.test.ts`
  TDD coverage for SQLite persistence, FTS retrieval, and rollback.
- Modify `packages/server/src/store/sqlite-store-v2.ts`
  Add an optional `db` factory helper only if the new store needs the same default DB path. Do not change `sessions_v2` behavior.
- Modify `packages/server/src/app-v2/session-routes.ts`
  Thread optional `memoryStore` into create/advance/reroll/undo and keep existing behavior identical when it is absent.
- Modify `packages/server/src/app-v2.ts`
  Create and pass `memoryStore` beside the session store.
- Modify `packages/server/src/engine-v2/pipeline.ts`
  Accept optional prebuilt `memoryContext` in runtime options and inject it into Director prompt only.
- Modify `packages/server/src/engine-v2/director.ts`
  Format a Director-safe `[Memory Cortex]` section when memory context is supplied.
- Update `packages/server/src/__tests__/api-v2.test.ts`
  Cover route-level ingestion without relying on model calls.

Avoid editing already-dirty client files until the DevPanel diagnostic task starts.

---

## Task 1: Shared DTOs and Pure Scoring

**Files:**
- Create: `packages/shared/src/engine-v2/memory-cortex.ts`
- Modify: `packages/shared/src/engine-v2.ts`
- Create: `packages/server/src/engine-v2/__tests__/memory-cortex.test.ts`
- Create: `packages/server/src/engine-v2/memory-cortex.ts`

- [ ] **Step 1: Write the failing shared/pure helper tests**

Create `packages/server/src/engine-v2/__tests__/memory-cortex.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type { MemoryChunk, MemoryRetrievalCandidate } from "@hushline/shared";
import {
  buildMemoryChunksFromTurn,
  clampMemoryScore,
  formatDirectorMemoryContext,
  scoreMemoryCandidate,
  seedMemoryEntities,
} from "../memory-cortex";

describe("memory cortex pure helpers", () => {
  test("seeds persona and scenario characters as canonical entities", () => {
    const entities = seedMemoryEntities({
      sessionId: "session-1",
      scenarioPackId: "locked-room-mystery",
      persona: {
        id: "user",
        name: "윤서",
        shortName: "서",
        role: "탐정",
        relationshipTags: ["전학생"],
      },
      characters: [
        {
          id: "alice",
          name: "한유진",
          shortName: "유진",
          role: "룸메이트",
          profileKind: "named-actor",
          mbti: "INTJ",
          ocean: { openness: 0.5, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.5, neuroticism: 0.5 },
          autonomy: 0.7,
          systemPrompt: "한유진으로 말한다.",
          relationships: [],
          handout: { secret: "비밀", desire: "욕망", objective: "목표", initialRelationshipToUser: 2 },
          anonymousLabel: "[익명 A]",
        },
      ],
      turnNumber: 0,
    });

    expect(entities.map((entity) => entity.canonicalName)).toEqual(["윤서", "한유진"]);
    expect(entities[0]?.aliases).toEqual(["윤서", "서"]);
    expect(entities[1]?.aliases).toContain("[익명 A]");
    expect(entities[0]?.isUserPersona).toBe(true);
  });

  test("builds visible memory chunks from accepted turn messages", () => {
    const chunks = buildMemoryChunksFromTurn({
      sessionId: "session-1",
      scenarioPackId: "locked-room-mystery",
      turnNumber: 3,
      messages: [
        {
          id: "m1",
          sessionId: "session-1",
          role: "user",
          content: "유진에게 열쇠를 보여준다.",
          inputMode: "action",
          createdAt: "2026-06-02T00:00:00.000Z",
        },
        {
          id: "m2",
          sessionId: "session-1",
          role: "character",
          characterId: "alice",
          speakerLabel: "한유진",
          content: "\"그 열쇠, 아까 책상 밑에서 본 것 같아.\"",
          createdAt: "2026-06-02T00:00:01.000Z",
        },
      ],
      createdAt: "2026-06-02T00:00:02.000Z",
    });

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatchObject({
      messageId: "m1",
      role: "user",
      speakerId: "user",
      visibility: "public",
      importance: 0.55,
    });
    expect(chunks[1]).toMatchObject({
      messageId: "m2",
      role: "character",
      speakerId: "alice",
      speakerLabel: "한유진",
      visibility: "public",
    });
  });

  test("scores candidate by text, entity overlap, salience, recency, and visibility", () => {
    const chunk: MemoryChunk = {
      id: "chunk-1",
      sessionId: "session-1",
      scenarioPackId: "locked-room-mystery",
      turnNumber: 7,
      messageId: "m7",
      role: "character",
      speakerId: "alice",
      speakerLabel: "한유진",
      content: "유진은 열쇠가 책상 밑에 있었다고 말했다.",
      summary: "유진이 열쇠 위치를 증언했다.",
      importance: 0.8,
      emotion: "tense",
      visibility: "public",
      createdAt: "2026-06-02T00:00:00.000Z",
    };

    const candidate = scoreMemoryCandidate({
      chunk,
      query: {
        sessionId: "session-1",
        scenarioPackId: "locked-room-mystery",
        input: "열쇠 유진",
        turnNumber: 10,
        entityAliases: ["유진"],
        allowedVisibility: ["public"],
      },
      linkedEntityAliases: ["유진"],
    });

    expect(candidate.score).toBeGreaterThan(0.7);
    expect(candidate.components.text).toBeGreaterThan(0);
    expect(candidate.components.entity).toBeGreaterThan(0);
    expect(candidate.visibilityAllowed).toBe(true);
  });

  test("filters disallowed visibility and formats Director memory context", () => {
    const publicCandidate: MemoryRetrievalCandidate = {
      chunkId: "public-1",
      score: 0.82,
      visibilityAllowed: true,
      reason: "text+entity+salience",
      components: { text: 0.3, entity: 0.2, relationship: 0, salience: 0.24, recency: 0.08, visibility: 0 },
      chunk: {
        id: "public-1",
        sessionId: "session-1",
        scenarioPackId: "locked-room-mystery",
        turnNumber: 4,
        role: "character",
        speakerId: "alice",
        speakerLabel: "한유진",
        content: "유진이 열쇠를 봤다고 말했다.",
        summary: "유진의 열쇠 증언",
        importance: 0.8,
        emotion: "neutral",
        visibility: "public",
        createdAt: "2026-06-02T00:00:00.000Z",
      },
    };
    const privateCandidate: MemoryRetrievalCandidate = {
      ...publicCandidate,
      chunkId: "private-1",
      score: 0.9,
      visibilityAllowed: false,
      reason: "blocked:private",
      chunk: { ...publicCandidate.chunk, id: "private-1", visibility: "private-character", content: "비공개 핸드아웃" },
    };

    expect(clampMemoryScore(1.2)).toBe(1);
    expect(formatDirectorMemoryContext([privateCandidate, publicCandidate])).toEqual([
      "[Memory Cortex]",
      "- T4 한유진: 유진의 열쇠 증언 (score 0.82, public)",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify RED**

Run:

```powershell
corepack pnpm --filter @hushline/server exec bun test ./src/engine-v2/__tests__/memory-cortex.test.ts
```

Expected: FAIL because `../memory-cortex` and shared memory DTOs do not exist.

- [ ] **Step 3: Add shared DTOs**

Create `packages/shared/src/engine-v2/memory-cortex.ts`:

```ts
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
```

Modify `packages/shared/src/engine-v2.ts`:

```ts
export * from "./engine-v2/memory-cortex.js";
```

Insert that export beside the other `engine-v2/*` exports.

- [ ] **Step 4: Add pure helper implementation**

Create `packages/server/src/engine-v2/memory-cortex.ts`:

```ts
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
  const entities: MemoryEntity[] = [];
  entities.push({
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
  });

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
  const rawScore = components.text + components.entity + components.relationship + components.salience + components.recency + components.visibility;
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
  if (visible.length === 0) return [];
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
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function inferMessageImportance(message: TurnMessage): number {
  if (message.role === "user" && message.inputMode === "action") return 0.55;
  if (message.role === "system") return 0.5;
  if (message.role === "narrator") return 0.45;
  if (message.role === "character") return 0.6;
  return 0.4;
}

function summarizeMemoryContent(content: string): string {
  const trimmed = content.replace(/\s+/g, " ").trim();
  return trimmed.length > 80 ? `${trimmed.slice(0, 77)}...` : trimmed;
}

function scoreText(query: string, content: string): number {
  const terms = tokenize(query);
  if (terms.length === 0) return 0;
  const haystack = normalize(content);
  const matches = terms.filter((term) => haystack.includes(term)).length;
  return clampMemoryScore((matches / terms.length) * 0.35);
}

function scoreEntityOverlap(queryAliases: string[], linkedAliases: string[]): number {
  const linked = new Set(linkedAliases.map(normalize).filter(Boolean));
  if (linked.size === 0) return 0;
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
```

- [ ] **Step 5: Run test to verify GREEN**

Run:

```powershell
corepack pnpm --filter @hushline/server exec bun test ./src/engine-v2/__tests__/memory-cortex.test.ts
```

Expected: PASS for all `memory cortex pure helpers` tests.

- [ ] **Step 6: Run shared/server type check**

Run:

```powershell
corepack pnpm --filter @hushline/shared check
corepack pnpm --filter @hushline/server check
```

Expected: both commands exit 0.

- [ ] **Step 7: Commit Task 1**

Stage only these files:

```powershell
git add -- packages/shared/src/engine-v2/memory-cortex.ts packages/shared/src/engine-v2.ts packages/server/src/engine-v2/memory-cortex.ts packages/server/src/engine-v2/__tests__/memory-cortex.test.ts
git diff --cached --check
git commit -m "feat: add memory cortex scoring helpers"
```

Expected: commit contains only Task 1 files.

---

## Task 2: SQLite Memory Store

**Files:**
- Create: `packages/server/src/store/memory-cortex-store.ts`
- Create: `packages/server/src/store/__tests__/memory-cortex-store.test.ts`

- [ ] **Step 1: Write failing SQLite store tests**

Create `packages/server/src/store/__tests__/memory-cortex-store.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { createMemoryCortexStore } from "../memory-cortex-store";

describe("memory cortex sqlite store", () => {
  test("saves chunks, searches text, and records retrieval traces", () => {
    const store = createMemoryCortexStore(":memory:");
    store.saveEntities([
      {
        id: "entity-1",
        sessionId: "session-1",
        scenarioPackId: "scenario-1",
        canonicalName: "한유진",
        kind: "character",
        aliases: ["한유진", "유진"],
        characterId: "alice",
        firstSeenTurn: 0,
        lastSeenTurn: 0,
        salience: 0.7,
        isUserPersona: false,
      },
    ]);
    store.saveChunks([
      {
        id: "chunk-1",
        sessionId: "session-1",
        scenarioPackId: "scenario-1",
        turnNumber: 2,
        messageId: "m1",
        role: "character",
        speakerId: "alice",
        speakerLabel: "한유진",
        content: "책상 밑에서 녹슨 열쇠를 봤다.",
        summary: "유진이 열쇠 위치를 말했다.",
        importance: 0.8,
        emotion: "tense",
        visibility: "public",
        createdAt: "2026-06-02T00:00:00.000Z",
      },
    ]);

    expect(store.listEntities("session-1").map((entity) => entity.canonicalName)).toEqual(["한유진"]);
    const matches = store.searchChunks({ sessionId: "session-1", query: "열쇠", limit: 5 });
    expect(matches.map((chunk) => chunk.id)).toEqual(["chunk-1"]);

    store.saveRetrievalTrace({
      id: "trace-1",
      sessionId: "session-1",
      turnNumber: 3,
      query: {
        sessionId: "session-1",
        scenarioPackId: "scenario-1",
        input: "열쇠 어디",
        turnNumber: 3,
        entityAliases: ["유진"],
        allowedVisibility: ["public"],
      },
      candidateIds: ["chunk-1"],
      selectedIds: ["chunk-1"],
      scores: {
        "chunk-1": { text: 0.3, entity: 0.2, relationship: 0, salience: 0.2, recency: 0.1, visibility: 0 },
      },
      createdAt: "2026-06-02T00:00:01.000Z",
    });

    expect(store.getLatestRetrievalTrace("session-1")?.id).toBe("trace-1");
  });

  test("removes chunks and traces after an undo turn boundary", () => {
    const store = createMemoryCortexStore(":memory:");
    store.saveChunks([
      {
        id: "chunk-1",
        sessionId: "session-1",
        scenarioPackId: "scenario-1",
        turnNumber: 1,
        role: "user",
        speakerId: "user",
        content: "이전 발화",
        summary: "이전 발화",
        importance: 0.4,
        emotion: "neutral",
        visibility: "public",
        createdAt: "2026-06-02T00:00:00.000Z",
      },
      {
        id: "chunk-2",
        sessionId: "session-1",
        scenarioPackId: "scenario-1",
        turnNumber: 4,
        role: "user",
        speakerId: "user",
        content: "되돌릴 발화",
        summary: "되돌릴 발화",
        importance: 0.4,
        emotion: "neutral",
        visibility: "public",
        createdAt: "2026-06-02T00:00:01.000Z",
      },
    ]);

    store.deleteTurnsAfter("session-1", 2);
    expect(store.listChunks("session-1").map((chunk) => chunk.id)).toEqual(["chunk-1"]);
  });
});
```

- [ ] **Step 2: Run test to verify RED**

Run:

```powershell
corepack pnpm --filter @hushline/server exec bun test ./src/store/__tests__/memory-cortex-store.test.ts
```

Expected: FAIL because `../memory-cortex-store` does not exist.

- [ ] **Step 3: Implement SQLite schema and CRUD**

Create `packages/server/src/store/memory-cortex-store.ts` with:

```ts
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
  if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true });
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
  if (dbPath !== ":memory:") db.exec("PRAGMA journal_mode = WAL;");

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
  const listEntitiesQuery = db.query("SELECT * FROM memory_entities WHERE session_id = $sessionId ORDER BY is_user_persona DESC, canonical_name ASC");
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
  const listChunksQuery = db.query("SELECT * FROM memory_chunks WHERE session_id = $sessionId AND superseded_at IS NULL ORDER BY turn_number ASC, created_at ASC");
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
  const deleteAfter = db.query("DELETE FROM memory_chunks WHERE session_id = $sessionId AND turn_number > $turnNumber");
  const deleteAfterFts = db.query(`
    DELETE FROM memory_chunks_fts
    WHERE id IN (SELECT id FROM memory_chunks WHERE session_id = $sessionId AND turn_number > $turnNumber)
  `);
  const deleteMessage = db.query("DELETE FROM memory_chunks WHERE session_id = $sessionId AND message_id = $messageId");
  const deleteMessageFts = db.query("DELETE FROM memory_chunks_fts WHERE id IN (SELECT id FROM memory_chunks WHERE session_id = $sessionId AND message_id = $messageId)");
  const insertTrace = db.query(`
    INSERT INTO memory_retrieval_traces (
      id, session_id, turn_number, query_json, candidate_ids_json, selected_ids_json, scores_json, created_at
    ) VALUES ($id, $sessionId, $turnNumber, $queryJson, $candidateIdsJson, $selectedIdsJson, $scoresJson, $createdAt)
    ON CONFLICT(id) DO UPDATE SET
      query_json = excluded.query_json,
      candidate_ids_json = excluded.candidate_ids_json,
      selected_ids_json = excluded.selected_ids_json,
      scores_json = excluded.scores_json
  `);
  const latestTrace = db.query("SELECT * FROM memory_retrieval_traces WHERE session_id = $sessionId ORDER BY turn_number DESC, created_at DESC LIMIT 1");

  return {
    saveEntities(entities): void {
      const save = db.transaction((items: MemoryEntity[]) => {
        for (const entity of items) upsertEntity.run(toEntityParams(entity));
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
          if (!chunk.supersededAt) insertFts.run({ $id: chunk.id, $sessionId: chunk.sessionId, $content: chunk.content, $summary: chunk.summary });
        }
      });
      save(chunks);
    },
    listChunks(sessionId): MemoryChunk[] {
      return listChunksQuery.all({ $sessionId: sessionId }).map(rowToChunk);
    },
    searchChunks(input): MemoryChunk[] {
      const query = input.query.trim().replace(/"/g, "");
      if (!query) return [];
      return searchQuery.all({ $sessionId: input.sessionId, $query: query.split(/\s+/).join(" OR "), $limit: input.limit }).map(rowToChunk);
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

function defaultDbPath(): string {
  return resolve(process.env.HUSHLINE_DB_PATH ?? "packages/server/data/hushline.db");
}
```

Add row mapper helpers in the same file:

```ts
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
```

- [ ] **Step 4: Run store test to verify GREEN**

Run:

```powershell
corepack pnpm --filter @hushline/server exec bun test ./src/store/__tests__/memory-cortex-store.test.ts
```

Expected: PASS for store tests.

- [ ] **Step 5: Commit Task 2**

```powershell
git add -- packages/server/src/store/memory-cortex-store.ts packages/server/src/store/__tests__/memory-cortex-store.test.ts
git diff --cached --check
git commit -m "feat: add memory cortex sqlite store"
```

Expected: commit contains only Task 2 files.

---

## Task 3: Route-Level Ingestion Hooks

**Files:**
- Modify: `packages/server/src/app-v2.ts`
- Modify: `packages/server/src/app-v2/session-routes.ts`
- Modify: `packages/server/src/__tests__/api-v2.test.ts`

- [ ] **Step 1: Inspect current dirty diffs before editing**

Run:

```powershell
git diff -- packages/server/src/app-v2.ts packages/server/src/app-v2/session-routes.ts packages/server/src/__tests__/api-v2.test.ts
```

Expected: understand existing user-owned changes before patching. If `app-v2.ts` is clean, edit normally. If `session-routes.ts` or `api-v2.test.ts` contain unrelated changes, preserve them and patch only the memory injection area.

- [ ] **Step 2: Write failing API ingestion test**

Add to `packages/server/src/__tests__/api-v2.test.ts`:

```ts
test("v2 session routes ingest opening and accepted turn memories when memory store is configured", async () => {
  const memoryStore = createMemoryCortexStore(":memory:");
  const app = createAppV2({
    store: createSqliteStoreV2(":memory:"),
    memoryStore,
    scenariosDir: testScenariosDir,
  });

  const created = await app.request("/api/v2/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scenarioPackId: "locked-room-mystery", persona: { name: "윤서", shortName: "서" } }),
  });
  expect(created.status).toBe(201);
  const createdJson = await created.json();
  const sessionId = createdJson.session.id;
  expect(memoryStore.listChunks(sessionId).some((chunk) => chunk.role === "narrator")).toBe(true);

  const advanced = await app.request(`/api/v2/sessions/${sessionId}/advance`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content: "유진에게 열쇠를 보여준다.", inputMode: "action" }),
  });
  expect(advanced.status).toBe(200);
  expect(memoryStore.listChunks(sessionId).some((chunk) => chunk.content.includes("열쇠"))).toBe(true);
});
```

Also import:

```ts
import { createMemoryCortexStore } from "../store/memory-cortex-store";
```

- [ ] **Step 3: Run test to verify RED**

Run:

```powershell
corepack pnpm --filter @hushline/server exec bun test ./src/__tests__/api-v2.test.ts
```

Expected: FAIL because `createAppV2` and route options do not accept `memoryStore`, or memory chunks are not ingested.

- [ ] **Step 4: Add optional memory store to app and routes**

In `packages/server/src/app-v2.ts`, create the memory store beside the v2 session store and pass it into `registerSessionRoutes`.

In `packages/server/src/app-v2/session-routes.ts`, extend options:

```ts
import type { MemoryCortexStore } from "../store/memory-cortex-store.js";
import { buildMemoryChunksFromTurn, seedMemoryEntities } from "../engine-v2/memory-cortex.js";

export interface RegisterSessionRoutesOptions {
  store: SessionStoreV2;
  memoryStore?: MemoryCortexStore;
  scenariosDir: string;
}
```

After create-session opening messages and before response:

```ts
options.memoryStore?.saveChunks(buildMemoryChunksFromTurn({
  sessionId,
  scenarioPackId,
  turnNumber: 0,
  messages: openingMessages,
  createdAt: session.createdAt,
}));
options.memoryStore?.saveEntities(seedMemoryEntities({
  sessionId,
  scenarioPackId,
  persona: session.persona,
  characters: session.characters,
  turnNumber: 0,
}));
```

After `turnResult` and before `store.saveSession(nextSession)` in advance and reroll:

```ts
options.memoryStore?.saveChunks(buildMemoryChunksFromTurn({
  sessionId: nextSession.id,
  scenarioPackId: nextSession.scenarioPackId,
  turnNumber: turnResult.worldState.turnNumber,
  messages: turnResult.messages,
  createdAt: nextSession.updatedAt,
}));
```

On undo:

```ts
options.memoryStore?.deleteTurnsAfter(nextSession.id, nextSession.worldState.turnNumber);
```

- [ ] **Step 5: Run API test to verify GREEN**

Run:

```powershell
corepack pnpm --filter @hushline/server exec bun test ./src/__tests__/api-v2.test.ts
```

Expected: PASS for API v2 tests.

- [ ] **Step 6: Commit Task 3**

```powershell
git add -- packages/server/src/app-v2.ts packages/server/src/app-v2/session-routes.ts packages/server/src/__tests__/api-v2.test.ts
git diff --cached --check
git commit -m "feat: ingest memory cortex turns"
```

Expected: commit includes only route ingestion changes and their test.

---

## Task 4: Director Retrieval Context

**Files:**
- Modify: `packages/server/src/engine-v2/pipeline.ts`
- Modify: `packages/server/src/engine-v2/director.ts`
- Modify: `packages/server/src/engine-v2/runtime-options.ts`
- Modify: `packages/server/src/engine-v2/__tests__/director-prompt.test.ts`
- Modify: `packages/server/src/app-v2/session-routes.ts`

- [ ] **Step 1: Write failing Director prompt test**

Add to `packages/server/src/engine-v2/__tests__/director-prompt.test.ts`:

```ts
test("director prompt includes visible memory cortex context", () => {
  const prompt = buildDirectorSystemPrompt(testPack, testOmniscientContext, [
    "[Memory Cortex]",
    "- T4 한유진: 유진의 열쇠 증언 (score 0.82, public)",
  ]);

  expect(prompt).toContain("[Memory Cortex]");
  expect(prompt).toContain("유진의 열쇠 증언");
});
```

- [ ] **Step 2: Run test to verify RED**

Run:

```powershell
corepack pnpm --filter @hushline/server exec bun test ./src/engine-v2/__tests__/director-prompt.test.ts
```

Expected: FAIL because `buildDirectorSystemPrompt` does not accept memory context.

- [ ] **Step 3: Add optional memory context to runtime options and Director prompt**

In `packages/server/src/engine-v2/runtime-options.ts`, add:

```ts
import type { MemoryRetrievalCandidate } from "@hushline/shared";

export interface TurnRuntimeOptionsV2 {
  connections?: Record<string, ModelConnection>;
  inputMode?: InputMode;
  scenarioPack?: ScenarioPack;
  memoryCandidates?: MemoryRetrievalCandidate[];
}
```

In `packages/server/src/engine-v2/director.ts`, change the prompt builder signature:

```ts
export function buildDirectorSystemPrompt(
  pack: ScenarioPack,
  omniscient: OmniscientContext,
  memoryContext: string[] = [],
): string {
```

Insert the memory context after `[Recent Events]` and before `[Genre Goals]`:

```ts
"",
...memoryContext,
"",
```

In `invokeDirector`, pass the optional memory context parameter through.

- [ ] **Step 4: Build retrieval candidates in session route before runTurnV2**

In `packages/server/src/app-v2/session-routes.ts`, before `runTurnV2`:

```ts
const memoryChunks = options.memoryStore?.searchChunks({
  sessionId: session.id,
  query: parsed.data.content,
  limit: 12,
}) ?? [];
const memoryCandidates = memoryChunks
  .map((chunk) => scoreMemoryCandidate({
    chunk,
    query: {
      sessionId: session.id,
      scenarioPackId: session.scenarioPackId,
      input: parsed.data.content,
      turnNumber: session.worldState.turnNumber + 1,
      entityAliases: [],
      allowedVisibility: ["public", "director-only", "vault-readonly"],
    },
  }))
  .filter((candidate) => candidate.visibilityAllowed)
  .sort((left, right) => right.score - left.score)
  .slice(0, 6);
```

Pass into `runTurnV2`:

```ts
memoryCandidates,
```

In `runTurnV2`, convert candidates using `formatDirectorMemoryContext(options.memoryCandidates ?? [])` and pass to `invokeDirector`.

- [ ] **Step 5: Save retrieval trace**

After `turnResult`, save a trace when `memoryCandidates.length > 0`:

```ts
options.memoryStore?.saveRetrievalTrace({
  id: crypto.randomUUID(),
  sessionId: session.id,
  turnNumber: session.worldState.turnNumber + 1,
  query: {
    sessionId: session.id,
    scenarioPackId: session.scenarioPackId,
    input: parsed.data.content,
    turnNumber: session.worldState.turnNumber + 1,
    entityAliases: [],
    allowedVisibility: ["public", "director-only", "vault-readonly"],
  },
  candidateIds: memoryCandidates.map((candidate) => candidate.chunkId),
  selectedIds: memoryCandidates.filter((candidate) => candidate.visibilityAllowed).map((candidate) => candidate.chunkId),
  scores: Object.fromEntries(memoryCandidates.map((candidate) => [candidate.chunkId, candidate.components])),
  createdAt: new Date().toISOString(),
});
```

- [ ] **Step 6: Run focused tests**

Run:

```powershell
corepack pnpm --filter @hushline/server exec bun test ./src/engine-v2/__tests__/memory-cortex.test.ts ./src/store/__tests__/memory-cortex-store.test.ts ./src/engine-v2/__tests__/director-prompt.test.ts ./src/__tests__/api-v2.test.ts
```

Expected: PASS for all focused tests.

- [ ] **Step 7: Commit Task 4**

```powershell
git add -- packages/server/src/engine-v2/pipeline.ts packages/server/src/engine-v2/director.ts packages/server/src/engine-v2/runtime-options.ts packages/server/src/engine-v2/__tests__/director-prompt.test.ts packages/server/src/app-v2/session-routes.ts
git diff --cached --check
git commit -m "feat: inject memory cortex into director context"
```

Expected: commit includes only Director retrieval changes.

---

## Milestone 1 Verification

- [ ] Run pure memory tests:

```powershell
corepack pnpm --filter @hushline/server exec bun test ./src/engine-v2/__tests__/memory-cortex.test.ts
```

- [ ] Run store tests:

```powershell
corepack pnpm --filter @hushline/server exec bun test ./src/store/__tests__/memory-cortex-store.test.ts
```

- [ ] Run API v2 tests:

```powershell
corepack pnpm --filter @hushline/server exec bun test ./src/__tests__/api-v2.test.ts
```

- [ ] Run server type check:

```powershell
corepack pnpm --filter @hushline/server check
```

- [ ] Run scoped diff whitespace check:

```powershell
git diff --cached --check
git diff --check -- packages/shared/src/engine-v2.ts packages/shared/src/engine-v2/memory-cortex.ts packages/server/src/engine-v2/memory-cortex.ts packages/server/src/store/memory-cortex-store.ts
```

If unrelated dirty files make full `git diff --check` fail, record that and use staged diff checks for the milestone commit scope.

---

## Deferred Tasks After Milestone 1

### Task 5: Character and Narrator Visibility Retrieval

Add visibility-filtered memory context to Character and Narrator prompts. Tests must prove private character memory is blocked for other characters and narrator receives only observable continuity.

### Task 6: DevPanel Memory Cortex Diagnostics

Expose latest retrieval trace, selected chunks, score components, entity aliases, relation rows, and vault links in DevPanel. This task may touch dirty client files only after inspecting their current diffs.

### Task 7: Read-Only Vault Export and Attachment

Add vault tables, export endpoint, attach endpoint, and retrieval participation for `read_only` vault links.

### Task 8: Manual Entity and Relation Editing

Add dev-facing endpoints to list/update/suppress entities, relations, and chunks. Manual edits must be recorded with evidence and should not mutate hidden truth state.
