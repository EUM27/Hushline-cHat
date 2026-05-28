import { describe, expect, test } from "bun:test";
import type { CharacterDefinition } from "@hushline/shared";
import { sanitizeCharacterOutput } from "../output-sanitizer";

describe("character output sanitizer", () => {
  test("rejects output that starts with another named character label", () => {
    const cleaned = sanitizeCharacterOutput(
      [
        "하진우: 네, 방금 전에 연락했습니다. 폭설 때문에 시간이 좀 걸릴 거라고 하더군요.",
        "",
        "서유라: 저, 저는 괜찮아요... 다만 너무 놀라서...",
      ].join("\n"),
      minimalCharacter("shin-jiyeon", "신지연", "지연"),
    );

    expect(cleaned).toBe("");
  });

  test("keeps only the active character line before another plain name label and marks it as dialogue", () => {
    const cleaned = sanitizeCharacterOutput(
      [
        "신지연: 경찰이 그렇게 빨리 온다고요? 이 눈에? 말이 된다고 생각해요?",
        "",
        "하진우: 방금 전에 연락했습니다.",
      ].join("\n"),
      minimalCharacter("shin-jiyeon", "신지연", "지연"),
    );

    expect(cleaned).toBe("\"경찰이 그렇게 빨리 온다고요? 이 눈에? 말이 된다고 생각해요?\"");
  });

  test("wraps unmarked character output as dialogue for client formatting", () => {
    const cleaned = sanitizeCharacterOutput(
      "일단 움직이지 마. 상황 봐야 해.",
      minimalCharacter("advisor-1", "Henry", "Henry"),
    );

    expect(cleaned).toBe("\"일단 움직이지 마. 상황 봐야 해.\"");
  });

  test("keeps wrapping dialogue quotes as display formatting markers", () => {
    const cleaned = sanitizeCharacterOutput(
      "\"봐도 모르겠냐. 숨도 안 쉬고 피도 식었어.\"",
      minimalCharacter("kwak-sangcheol", "곽상철", "상철"),
    );

    expect(cleaned).toBe("\"봐도 모르겠냐. 숨도 안 쉬고 피도 식었어.\"");
  });

  test("preserves repeated per-line dialogue markers after narration trimming", () => {
    const cleaned = sanitizeCharacterOutput(
      [
        "윤해온은 잠깐 시선을 피했다.",
        "",
        "\"아, 네. 저 것도 아까부터 아예 안 돼요, 신호도 없고.\"",
        "\"강무진, 지금 큰소리 내면 더... 불안해져요. 그냥 확인한 거잖아요.\"",
      ].join("\n"),
      minimalCharacter("yoon-haeon", "윤해온", "해온"),
    );

    expect(cleaned).toBe([
      "\"아, 네. 저 것도 아까부터 아예 안 돼요, 신호도 없고.\"",
      "\"강무진, 지금 큰소리 내면 더... 불안해져요. 그냥 확인한 거잖아요.\"",
    ].join("\n"));
  });
});

function minimalCharacter(id: string, name: string, shortName: string): CharacterDefinition {
  return {
    id,
    name,
    shortName,
    role: "테스트 캐릭터",
    profileKind: "named-actor",
    mbti: "INTJ",
    ocean: {
      openness: 50,
      conscientiousness: 50,
      extraversion: 50,
      agreeableness: 50,
      neuroticism: 50,
    },
    autonomy: 0.5,
    systemPrompt: "한 명의 캐릭터만 연기한다.",
    handout: {
      secret: "비밀",
      desire: "욕망",
      objective: "목표",
      initialRelationshipToUser: 0,
    },
    relationships: [],
  };
}
