import { describe, expect, test } from "bun:test";
import { calculateRevealDelay } from "../src/reveal-timing";

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
});
