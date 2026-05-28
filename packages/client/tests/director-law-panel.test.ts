import { describe, expect, test } from "bun:test";
import { buildDirectorLawSections } from "../src/components/DirectorLawPanel";

describe("DirectorLawPanel model", () => {
  test("groups state law into editable-looking sections without mutating state", () => {
    const sections = buildDirectorLawSections({
      immutableFacts: ["시나리오: 설산 산장 살인사건"],
      slowState: ["강무진: 신뢰도 0"],
      scenePressure: ["긴장 6 / 위험 3"],
      outputRules: ["유저 행동/생각/감정 대리 금지"],
    });

    expect(sections.map((section) => section.title)).toEqual([
      "고정 사실",
      "느린 상태",
      "장면 압력",
      "출력 규칙",
    ]);
    expect(sections[0]?.items).toContain("시나리오: 설산 산장 살인사건");
  });
});
