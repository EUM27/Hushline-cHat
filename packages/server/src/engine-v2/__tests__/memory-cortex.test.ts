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
          ocean: {
            openness: 0.5,
            conscientiousness: 0.5,
            extraversion: 0.5,
            agreeableness: 0.5,
            neuroticism: 0.5,
          },
          autonomy: 0.7,
          systemPrompt: "한유진으로 말한다.",
          relationships: [],
          handout: {
            secret: "비밀",
            desire: "욕망",
            objective: "목표",
            initialRelationshipToUser: 2,
          },
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
      components: {
        text: 0.3,
        entity: 0.2,
        relationship: 0,
        salience: 0.24,
        recency: 0.08,
        visibility: 0,
      },
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
      chunk: {
        ...publicCandidate.chunk,
        id: "private-1",
        visibility: "private-character",
        content: "비공개 핸드아웃",
      },
    };

    expect(clampMemoryScore(1.2)).toBe(1);
    expect(formatDirectorMemoryContext([privateCandidate, publicCandidate])).toEqual([
      "[Memory Cortex]",
      "- T4 한유진: 유진의 열쇠 증언 (score 0.82, public)",
    ]);
  });
});
