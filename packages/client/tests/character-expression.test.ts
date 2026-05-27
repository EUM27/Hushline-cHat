import { describe, expect, test } from "bun:test";
import { resolveCharacterExpressionPose } from "../src/character-expression";

describe("resolveCharacterExpressionPose", () => {
  test("keeps engine expression ids stable for character face rendering", () => {
    expect(resolveCharacterExpressionPose("neutral")).toBe("neutral");
    expect(resolveCharacterExpressionPose("happy")).toBe("happy");
    expect(resolveCharacterExpressionPose("sad")).toBe("sad");
    expect(resolveCharacterExpressionPose("thinking")).toBe("thinking");
    expect(resolveCharacterExpressionPose("surprised")).toBe("surprised");
    expect(resolveCharacterExpressionPose("worried")).toBe("worried");
    expect(resolveCharacterExpressionPose("angry")).toBe("angry");
  });

  test("accepts mockup mood aliases without changing the engine enum", () => {
    expect(resolveCharacterExpressionPose("smile")).toBe("happy");
    expect(resolveCharacterExpressionPose("serious")).toBe("thinking");
  });

  test("falls back to neutral for empty or unknown expression values", () => {
    expect(resolveCharacterExpressionPose(null)).toBe("neutral");
    expect(resolveCharacterExpressionPose(undefined)).toBe("neutral");
    expect(resolveCharacterExpressionPose("")).toBe("neutral");
    expect(resolveCharacterExpressionPose("glitch")).toBe("neutral");
  });
});
