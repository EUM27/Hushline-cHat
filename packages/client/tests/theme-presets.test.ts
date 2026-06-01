import { describe, expect, test } from "bun:test";
import { visualThemePresets } from "../src/constants/theme-presets";
import { createVisualThemeStyle } from "../src/utils/theme";

describe("visual theme presets", () => {
  test("moonlight uses the blue moonlight signature palette", () => {
    const moonlight = visualThemePresets.moonlight;

    expect(moonlight.name).toBe("파란 달밤");
    expect(moonlight.colors.canvas).toBe("#0F1A2E");
    expect(moonlight.colors.accent).toBe("#A8C5E8");
    expect(moonlight.colors.myBubble).toBe("rgba(168, 197, 232, 0.18)");
    expect(createVisualThemeStyle(moonlight)["--theme-canvas-wash"]).toBe("#0F1A2E");
    expect(moonlight.tw.myBubble).not.toContain("amber");
    expect(moonlight.tw.sendBtnActive).not.toContain("amber");
  });
});
