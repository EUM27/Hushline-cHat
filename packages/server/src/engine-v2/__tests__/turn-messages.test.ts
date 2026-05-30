import { describe, expect, test } from "bun:test";
import type { DirectorOutput, TurnMessage } from "@hushline/shared";
import { buildSystemMessageContent, composeSceneMessages } from "../turn-messages";

const baseMessage = {
  id: "message",
  sessionId: "session",
  createdAt: "2026-05-29T00:00:00.000Z",
} satisfies Partial<TurnMessage>;

const baseDirectorOutput = {
  speakers: [],
  silence: false,
  event: null,
  narratorInstruction: null,
  characterIntents: {},
  stateDelta: {},
  subObjectiveUpdate: null,
  relationshipUpdate: null,
  directives: [],
  delay: null,
} satisfies DirectorOutput;

describe("turn message helpers", () => {
  test("orders narrator and character messages from the director message plan", () => {
    const narrator = { ...baseMessage, id: "narrator", role: "narrator", content: "복도 조명이 깜빡인다." } as TurnMessage;
    const advisor = { ...baseMessage, id: "advisor", role: "character", characterId: "advisor-1", content: "조심해." } as TurnMessage;
    const system = { ...baseMessage, id: "system", role: "system", content: "상태 변화: 긴장 +1" } as TurnMessage;

    const ordered = composeSceneMessages(
      {
        ...baseDirectorOutput,
        messagePlan: [
          { kind: "character", speakerId: "advisor-1" },
          { kind: "narrator" },
          { kind: "system" },
        ],
      },
      narrator,
      [advisor],
      system,
    );

    expect(ordered.map((message) => message.id)).toEqual(["advisor", "narrator", "system"]);
  });

  test("keeps generated speakers even when a partial message plan omits one", () => {
    const kang = { ...baseMessage, id: "kang", role: "character", characterId: "kang-mujin", content: "뭐가 시비라는 거야." } as TurnMessage;
    const haeon = { ...baseMessage, id: "haeon", role: "character", characterId: "yoon-haeon", content: "그만하세요." } as TurnMessage;

    const ordered = composeSceneMessages(
      {
        ...baseDirectorOutput,
        speakers: ["kang-mujin", "yoon-haeon"],
        messagePlan: [{ kind: "character", speakerId: "yoon-haeon" }],
      },
      null,
      [kang, haeon],
      null,
    );

    expect(ordered.map((message) => message.id)).toEqual(["kang", "haeon"]);
  });

  test("respects a complete character message plan even when speaker priority differs", () => {
    const kang = { ...baseMessage, id: "kang", role: "character", characterId: "kang-mujin", content: "뭐가 시비라는 거야." } as TurnMessage;
    const haeon = { ...baseMessage, id: "haeon", role: "character", characterId: "yoon-haeon", content: "그만하세요." } as TurnMessage;

    const ordered = composeSceneMessages(
      {
        ...baseDirectorOutput,
        speakers: ["kang-mujin", "yoon-haeon"],
        messagePlan: [
          { kind: "character", speakerId: "yoon-haeon" },
          { kind: "character", speakerId: "kang-mujin" },
        ],
      },
      null,
      [kang, haeon],
      null,
    );

    expect(ordered.map((message) => message.id)).toEqual(["haeon", "kang"]);
  });

  test("formats visible system state changes", () => {
    const content = buildSystemMessageContent({
      ...baseDirectorOutput,
      stateDelta: {
        tension: 1,
        danger: -1,
        locationId: "lodge-study",
      },
      subObjectiveUpdate: {
        id: "check-door",
        description: "문틈 확인",
        action: "progress",
      },
      relationshipUpdate: {
        sourceId: "advisor-1",
        targetId: "user",
        descriptor: "신뢰",
        intensityDelta: 2,
      },
      directives: [{ effect: "flash" }],
    });

    expect(content).toContain("긴장 +1");
    expect(content).toContain("위험 -1");
    expect(content).toContain("목표 progress: 문틈 확인");
    expect(content).toContain("관계 변화: advisor-1");
    expect(content).toContain("연출: flash");
  });
});
