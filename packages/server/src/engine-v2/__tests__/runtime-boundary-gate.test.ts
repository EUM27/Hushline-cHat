import { describe, expect, test } from "bun:test";
import type { CaseFact } from "@hushline/shared";
import { validateCharacterDraft } from "../runtime-boundary-gate";

const caseFacts: CaseFact[] = [
  {
    id: "fact_table_key_seen",
    text: "정전 직전 응접실 테이블 위에 서재 열쇠가 놓여 있었다.",
    category: "object",
    truthStatus: "true",
    tags: ["key", "table", "before_blackout"],
    visibility: { knownBy: [] },
  },
  {
    id: "truth_killer_identity",
    text: "HIDDEN_TRUTH_REDACTED",
    category: "hidden_truth",
    truthStatus: "true",
    tags: ["killer", "truth"],
    visibility: { knownBy: [] },
  },
];

describe("runtime boundary gate", () => {
  test("detects embedded narration and speaker labels in character drafts", () => {
    const narration = validateCharacterDraft({
      draft: "*고개를 돌리며* 봤어요.",
      npcId: "shin-jiyeon",
      allowedFactIds: ["fact_table_key_seen"],
      blockedFactIds: [],
      hiddenTruthIds: ["truth_killer_identity"],
      knownClaimIds: [],
      caseFacts: [...caseFacts],
      currentTurn: 4,
    });
    const label = validateCharacterDraft({
      draft: "하진우: 제가 봤습니다.",
      npcId: "shin-jiyeon",
      allowedFactIds: ["fact_table_key_seen"],
      blockedFactIds: [],
      hiddenTruthIds: ["truth_killer_identity"],
      knownClaimIds: [],
      caseFacts: [...caseFacts],
      currentTurn: 4,
    });

    expect(narration.violations).toContain("embedded_narration");
    expect(label.violations).toContain("speaker_label");
  });

  test("blocks unauthorized facts and hidden truth terms", () => {
    const unauthorized = validateCharacterDraft({
      draft: "정전 직전 테이블 위에 서재 열쇠가 있었어요.",
      npcId: "kang-mujin",
      allowedFactIds: [],
      blockedFactIds: ["fact_table_key_seen"],
      hiddenTruthIds: ["truth_killer_identity"],
      knownClaimIds: [],
      caseFacts: [...caseFacts],
      currentTurn: 5,
    });
    const hidden = validateCharacterDraft({
      draft: "범인은 제가 압니다.",
      npcId: "kang-mujin",
      allowedFactIds: [],
      blockedFactIds: [],
      hiddenTruthIds: ["truth_killer_identity"],
      knownClaimIds: [],
      caseFacts: [...caseFacts],
      currentTurn: 5,
    });

    expect(unauthorized.violations).toContain("unauthorized_fact");
    expect(hidden.violations).toContain("hidden_truth_leak");
  });
});
