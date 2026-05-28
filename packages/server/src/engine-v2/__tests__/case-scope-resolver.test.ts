import { describe, expect, test } from "bun:test";
import { routeCaseInquiry } from "../case-inquiry-router";
import { resolveCaseAnswerScope } from "../case-scope-resolver";
import { makeCasePack } from "./case-test-helpers";

describe("case scope resolver", () => {
  test("allows testimony seeds while blocking hidden truths", () => {
    const pack = makeCasePack();
    const inquiry = routeCaseInquiry("해온 씨, 정전 전에 테이블 쪽에서 뭐 봤어요?", pack);
    const scope = resolveCaseAnswerScope(inquiry, pack);

    expect(scope.answerability).toBe("partial");
    expect(scope.allowedWitnesses.map((witness) => witness.characterId)).toContain("yoon-haeon");
    expect(scope.allowedWitnesses.flatMap((witness) => witness.factIds)).toContain("fact_lounge_shadow_before_blackout");
    expect(scope.blockedTruthIds).toContain("truth_killer_identity");
    expect(scope.publicFactIds).not.toContain("truth_killer_identity");
  });
});
