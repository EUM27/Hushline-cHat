import { describe, expect, test } from "bun:test";
import { routeCaseInquiry } from "../case-inquiry-router";
import { makeCasePack } from "./case-test-helpers";

describe("case inquiry router", () => {
  test("classifies table last-seen questions as timeline or witness inquiry", () => {
    const frame = routeCaseInquiry("누가 마지막으로 테이블 근처에 있었어?", makeCasePack());

    expect(["timeline_query", "witness_testimony"]).toContain(frame.inquiryType);
    expect(frame.isCaseInquiry).toBe(true);
    expect(frame.topicTags).toContain("table");
    expect(frame.topicTags).toContain("last_seen");
    expect(frame.truthLeakRisk).toBeGreaterThanOrEqual(1);
  });

  test("classifies direct culprit questions as high-risk truth requests", () => {
    const frame = routeCaseInquiry("그래서 범인 누구야?", makeCasePack());

    expect(frame.inquiryType).toBe("truth_request");
    expect(frame.requestedTruthLevel).toBe("hidden_truth");
    expect(frame.truthLeakRisk).toBe(3);
  });

  test("supports the runtime-layer object input contract", () => {
    const pack = makeCasePack();
    const frame = routeCaseInquiry({
      content: "누가 마지막으로 테이블 근처에 있었어?",
      inputMode: "chat",
      currentLocationId: "lodge-foyer",
      knownClaimIds: [],
      revealedFactIds: [],
      caseKnowledge: pack.caseKnowledge,
    });

    expect(frame.inquiryType).toBe("timeline_query");
    expect(frame.topicTags).toContain("table");
    expect(frame.topicTags).toContain("last_seen");
    expect(frame.truthLeakRisk).toBeLessThanOrEqual(2);
  });

  test("classifies witness, contradiction, and deduction turns without an LLM", () => {
    const pack = makeCasePack();
    const base = {
      inputMode: "chat",
      currentLocationId: "lodge-foyer",
      knownClaimIds: [],
      revealedFactIds: [],
      caseKnowledge: pack.caseKnowledge,
    };

    expect(routeCaseInquiry({ ...base, content: "신지연, 열쇠 봤어?" }).inquiryType).toBe("witness_testimony");
    expect(routeCaseInquiry({ ...base, content: "하진우는 열쇠가 없댔고 유라는 있었다고 했잖아" }).inquiryType)
      .toBe("contradiction_challenge");
    expect(routeCaseInquiry({ ...base, content: "정전 전 열쇠가 있었고 정전 후 사라졌으니 누군가 옮긴 거야" }).inquiryType)
      .toBe("deduction_attempt");
  });
});
