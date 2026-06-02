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
    const sentenceMatches = store.searchChunks({ sessionId: "session-1", query: "유진에게 열쇠를 보여준다.", limit: 5 });
    expect(sentenceMatches.map((chunk) => chunk.id)).toEqual(["chunk-1"]);

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
        "chunk-1": {
          text: 0.3,
          entity: 0.2,
          relationship: 0,
          salience: 0.2,
          recency: 0.1,
          visibility: 0,
        },
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
