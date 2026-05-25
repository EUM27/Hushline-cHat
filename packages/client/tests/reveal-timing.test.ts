import { describe, expect, test } from "bun:test";
import {
  calculateRevealDelay,
  calculateStreamStepSize,
  sliceStreamedText,
  shouldStreamMessageContent,
} from "../src/reveal-timing";

describe("calculateRevealDelay", () => {
  test("holds dense opening narration longer than the old fixed opening delay", () => {
    const delay = calculateRevealDelay({
      role: "narrator",
      isOpeningBeat: true,
      content: "쾅! 쾅! 관리인 곽상철이 내려찍는 도끼날이 참나무 문을 파고들 때마다 날카로운 나무 부스러기가 복도로 튀어 올랐다.",
    });

    expect(delay).toBeGreaterThan(1250);
  });

  test("holds short dramatic lines instead of rushing them", () => {
    const delay = calculateRevealDelay({
      role: "narrator",
      isOpeningBeat: true,
      content: "...회장님.",
    });

    expect(delay).toBeGreaterThanOrEqual(1600);
  });

  test("adds punctuation and line break pauses", () => {
    const plain = calculateRevealDelay({
      role: "narrator",
      content: "문이 열렸다 피 냄새가 번졌다",
    });
    const punctuated = calculateRevealDelay({
      role: "narrator",
      content: "문이 열렸다.\n피 냄새가, 번졌다...",
    });

    expect(punctuated).toBeGreaterThan(plain);
  });

  test("streams assistant-side scene text but keeps user messages instant", () => {
    expect(shouldStreamMessageContent({ role: "narrator", content: "문이 열렸다." })).toBe(true);
    expect(shouldStreamMessageContent({ role: "character", content: "봐도 모르겠냐." })).toBe(true);
    expect(shouldStreamMessageContent({ role: "user", content: "아무도 들어가지 마세요." })).toBe(false);
  });

  test("slices streamed text by visible characters", () => {
    expect(sliceStreamedText("으... 으아아악!", 5)).toBe("으... ");
    expect(sliceStreamedText("쾅! 쾅!", 999)).toBe("쾅! 쾅!");
  });

  test("chunks long narration faster than short dramatic lines", () => {
    const shortStep = calculateStreamStepSize({ role: "narrator", content: "...회장님." });
    const longStep = calculateStreamStepSize({
      role: "narrator",
      content: "문이 열리자 가장 먼저 덮쳐오는 것은 벽난로의 열기와, 비릿한 피 냄새였다. 서재 중앙에는 이태성이 쓰러져 있었다.",
    });

    expect(shortStep).toBe(1);
    expect(longStep).toBeGreaterThan(shortStep);
  });
});
