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

  test("blocks character drafts that attribute an unmade exit proposal to the user", () => {
    const result = validateCharacterDraft({
      draft: "\"밖에 나가자는 말은 하지 말자, 정해윤.\"",
      npcId: "yoon-haeon",
      userInput: "\"누가 사람 죽였는지도 모르는 판국에 설산에 갇혀있는 게 보통 일입니까.\"",
      allowedFactIds: [],
      blockedFactIds: [],
      hiddenTruthIds: ["truth_killer_identity"],
      knownClaimIds: [],
      caseFacts: [...caseFacts],
      currentTurn: 6,
    });

    expect(result.violations).toContain("unsupported_user_proposal");
    expect(result.finalText).not.toContain("나가자는");
  });

  test("masks persona names that were not introduced in scene", () => {
    const result = validateCharacterDraft({
      draft: "\"정해윤 씨, 지금은 움직이지 마.\"",
      npcId: "kang-mujin",
      userInput: "\"전화선이 완전히 죽었네요.\"",
      userPersonaName: "정해윤",
      userNameIntroduced: false,
      allowedFactIds: [],
      blockedFactIds: [],
      hiddenTruthIds: ["truth_killer_identity"],
      knownClaimIds: [],
      caseFacts: [...caseFacts],
      currentTurn: 6,
    });

    expect(result.violations).toContain("unintroduced_user_name");
    expect(result.finalText).toBe("\"당신, 지금은 움직이지 마.\"");
    expect(result.finalText).not.toContain("정해윤");
  });

  test("allows persona names after an explicit in-scene introduction", () => {
    const result = validateCharacterDraft({
      draft: "\"정해윤 씨, 그 말은 맞는 것 같습니다.\"",
      npcId: "yoon-haeon",
      userInput: "\"제 이름은 정해윤입니다.\"",
      userPersonaName: "정해윤",
      userNameIntroduced: true,
      allowedFactIds: [],
      blockedFactIds: [],
      hiddenTruthIds: ["truth_killer_identity"],
      knownClaimIds: [],
      caseFacts: [...caseFacts],
      currentTurn: 7,
    });

    expect(result.status).toBe("approved");
    expect(result.violations).not.toContain("unintroduced_user_name");
  });
});
