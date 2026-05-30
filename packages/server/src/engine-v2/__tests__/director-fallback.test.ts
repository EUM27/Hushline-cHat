import { describe, expect, test } from "bun:test";
import { getFallbackDirectorOutput } from "../output-sanitizer";

describe("director fallback", () => {
  test("varies the opening fallback speaker from the user input instead of always picking the first character", () => {
    const output = getFallbackDirectorOutput(
      ["kang-mujin", "yoon-haeon", "yoon-seha"],
      [],
      "야단 났네요.",
    );

    expect(output.speakers).toEqual(["yoon-haeon"]);
  });

  test("does not always choose the first character when a recent speaker exists", () => {
    const output = getFallbackDirectorOutput(
      ["ha-jinwoo", "kwak-sangcheol", "seo-yura"],
      ["ha-jinwoo", "ha-jinwoo"],
    );

    expect(output.speakers).toEqual(["kwak-sangcheol"]);
    expect(output.characterIntents["kwak-sangcheol"]).toContain("최근 발화자와 다른 관점");
  });
});
