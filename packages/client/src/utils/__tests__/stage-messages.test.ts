import { describe, expect, test } from "bun:test";
import type { ChatMessage } from "@hushline/shared";
import { getStageCharacterId } from "../stage-messages";

describe("stage message helpers", () => {
  test("keeps normal character messages connected to their character id", () => {
    expect(
      getStageCharacterId({
        id: "turn-yujin",
        sessionId: "session-1",
        role: "character",
        content: "괜찮아요?",
        createdAt: "2026-05-31T00:00:00.000Z",
        characterId: "seo-yujin",
        speakerLabel: "서유진",
      } satisfies ChatMessage),
    ).toBe("seo-yujin");
  });

  test("resolves narrator opening beats to their packed character id", () => {
    expect(
      getStageCharacterId({
        id: "opening-yujin",
        sessionId: "session-1",
        role: "narrator",
        content: "짐 무겁죠, 들어드릴까요?",
        createdAt: "2026-05-31T00:00:00.000Z",
        characterId: "seo-yujin",
        speakerKind: "named-actor",
        speakerLabel: "서유진",
        isOpeningBeat: true,
      } satisfies ChatMessage),
    ).toBe("seo-yujin");
  });
});
