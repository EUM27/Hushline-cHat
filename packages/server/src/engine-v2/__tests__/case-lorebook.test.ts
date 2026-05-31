import { describe, expect, test } from "bun:test";
import { routeCaseInquiry } from "../case-inquiry-router";
import { buildCaseLorebook, retrieveCaseLore } from "../case-lorebook";
import { makeCasePack } from "./case-test-helpers";

describe("case lorebook", () => {
  test("adapts legacy case knowledge into a tree-indexed lorebook", () => {
    const pack = makeCasePack();
    const lorebook = buildCaseLorebook(pack.caseKnowledge);

    expect(lorebook.entries.map((entry) => entry.id)).toContain("pub_key_after_blackout");
    expect(lorebook.entries.map((entry) => entry.id)).toContain("fact_lounge_shadow_before_blackout");
    expect(lorebook.entries.map((entry) => entry.id)).toContain("truth_killer_identity");
    expect(lorebook.tree.children.map((node) => node.label)).toContain("Public");
    expect(lorebook.tree.children.map((node) => node.label)).toContain("Observable");
    expect(lorebook.tree.children.map((node) => node.label)).toContain("Major Secrets");
  });

  test("keeps major secrets out of narrator retrieval while allowing deduction validation access", () => {
    const pack = makeCasePack();
    const inquiryFrame = routeCaseInquiry("그래서 범인 누구야?", pack);

    const narratorResult = retrieveCaseLore({
      caseKnowledge: pack.caseKnowledge,
      inquiryFrame,
      actor: "narrator",
      revealedFactIds: [],
      currentTurn: 3,
    });
    const deductionResult = retrieveCaseLore({
      caseKnowledge: pack.caseKnowledge,
      inquiryFrame,
      actor: "deduction_validator",
      revealedFactIds: [],
      currentTurn: 3,
    });

    expect(narratorResult.entries.map((entry) => entry.id)).not.toContain("truth_killer_identity");
    expect(narratorResult.blockedEntryIds).toContain("truth_killer_identity");
    expect(deductionResult.entries.map((entry) => entry.id)).toContain("truth_killer_identity");
  });

  test("retrieves character testimony only for the matching witness actor", () => {
    const pack = makeCasePack();
    const inquiryFrame = routeCaseInquiry("해온 씨, 정전 전에 테이블 쪽에서 뭐 봤어요?", pack);

    const witnessResult = retrieveCaseLore({
      caseKnowledge: pack.caseKnowledge,
      inquiryFrame,
      actor: "character",
      characterId: "yoon-haeon",
      revealedFactIds: [],
      currentTurn: 2,
    });
    const otherCharacterResult = retrieveCaseLore({
      caseKnowledge: pack.caseKnowledge,
      inquiryFrame,
      actor: "character",
      characterId: "kang-mujin",
      revealedFactIds: [],
      currentTurn: 2,
    });

    expect(witnessResult.entries.map((entry) => entry.id)).toContain("testimony_haeon_lounge_shadow");
    expect(witnessResult.factIds).toContain("fact_lounge_shadow_before_blackout");
    expect(otherCharacterResult.entries.map((entry) => entry.id)).not.toContain("testimony_haeon_lounge_shadow");
  });
});
