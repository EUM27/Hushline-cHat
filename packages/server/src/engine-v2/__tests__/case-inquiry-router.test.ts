import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { routeCaseInquiry } from "../case-inquiry-router";
import { resolveCaseAnswerScope } from "../case-scope-resolver";
import { loadScenarioPack } from "../scenario-loader";
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

  test("routes Korean book investigation to the locked-room book object", () => {
    const result = loadScenarioPack(resolve(import.meta.dir, "../../../scenarios/locked-room-mystery"));
    expect(result.success).toBe(true);
    if (!result.success) return;

    const frame = routeCaseInquiry("윤서하 책을 살펴본다.", result.pack);

    expect(frame.isCaseInquiry).toBe(true);
    expect(frame.inquiryType).toBe("object_query");
    expect(frame.targetObjectId).toBe("seha-book-bundle");
    expect(frame.topicTags).toContain("book");
  });

  test("does not broaden anxious suspect dialogue into unrelated clue topics", () => {
    const result = loadScenarioPack(resolve(import.meta.dir, "../../../scenarios/locked-room-mystery"));
    expect(result.success).toBe(true);
    if (!result.success) return;

    const frame = routeCaseInquiry(
      "나는 한숨을 쉬었다. \"짜증내서 미안합니다. 그런데 사람이 죽었다니까 날카로워질만 하잖습니까. 사람은 꼴랑 넷인데 미성년자 빼면 용의자는 셋 뿐이지 않습니까. 의심받기도 싫고 속은 쓰리고. 그러다보니 좀 매서운 말만 듣고 성냈습니다. 그런데 정말로... 마찰 일으킬 발언은 주의해주시면 감사하겠습니다. 솔직히 좀 무서워요.\"",
      result.pack,
    );
    const scope = resolveCaseAnswerScope({
      inquiryFrame: frame,
      caseKnowledge: result.pack.caseKnowledge!,
      revealedFactIds: [],
      claims: [],
      currentTurn: 4,
      ...(result.pack.caseKnowledge?.revealBudget ? { revealBudget: result.pack.caseKnowledge.revealBudget } : {}),
    });

    expect(frame.topicTags).not.toContain("key");
    expect(frame.topicTags).not.toContain("table");
    expect(frame.topicTags).not.toContain("book");
    expect(frame.topicTags).not.toContain("study");
    expect(scope.publicFactIds).toEqual([]);
    expect(scope.observableFactIds).toEqual([]);
    expect(scope.allowedWitnesses).toEqual([]);
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
