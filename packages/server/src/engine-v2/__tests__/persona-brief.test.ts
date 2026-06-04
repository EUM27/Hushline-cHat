import { describe, expect, test } from "bun:test";
import type { SessionStateV2 } from "@hushline/shared";
import {
  buildCharacterPersonaBrief,
  buildDirectorPersonaBrief,
  buildNarratorPersonaBrief,
  buildPersonaGuardContext,
} from "../context-builder";

describe("persona brief builders", () => {
  test("splits one session persona into agent-specific visibility", () => {
    const persona: SessionStateV2["persona"] = {
      id: "user",
      name: "정해윤",
      shortName: "해윤",
      role: "공유주택에 막 들어온 새 입주자",
      description: "경계심이 있지만 사람을 밀어내지는 않는다.",
      appearance: "비에 젖은 회색 후드와 낡은 운동화를 신고 있다.",
      relationshipTags: ["new-tenant", "keeps-distance"],
    };

    expect(buildDirectorPersonaBrief(persona)).toEqual({
      name: "정해윤",
      shortName: "해윤",
      role: "공유주택에 막 들어온 새 입주자",
      description: "경계심이 있지만 사람을 밀어내지는 않는다.",
      appearance: "비에 젖은 회색 후드와 낡은 운동화를 신고 있다.",
      relationshipTags: ["new-tenant", "keeps-distance"],
    });

    expect(buildCharacterPersonaBrief(persona, false)).toEqual({
      displayName: "상대 인물",
      nameKnown: false,
      role: "공유주택에 막 들어온 새 입주자",
      description: "경계심이 있지만 사람을 밀어내지는 않는다.",
      appearance: "비에 젖은 회색 후드와 낡은 운동화를 신고 있다.",
      relationshipTags: ["new-tenant", "keeps-distance"],
    });

    expect(buildCharacterPersonaBrief(persona, true).displayName).toBe("해윤");

    expect(buildNarratorPersonaBrief(persona, false)).toEqual({
      displayName: "상대 인물",
      nameKnown: false,
      role: "공유주택에 막 들어온 새 입주자",
      appearance: "비에 젖은 회색 후드와 낡은 운동화를 신고 있다.",
    });

    expect(buildPersonaGuardContext(persona)).toEqual({
      names: ["정해윤", "해윤"],
    });
  });

  test("keeps name-only sessions compatible", () => {
    const persona: SessionStateV2["persona"] = {
      id: "user",
      name: "{{유저}}",
      shortName: "{{유저}}",
    };

    expect(buildDirectorPersonaBrief(persona)).toEqual({
      name: "{{유저}}",
      shortName: "{{유저}}",
    });
    expect(buildCharacterPersonaBrief(persona, false)).toEqual({
      displayName: "상대 인물",
      nameKnown: false,
    });
    expect(buildNarratorPersonaBrief(persona, false)).toEqual({
      displayName: "상대 인물",
      nameKnown: false,
    });
    expect(buildPersonaGuardContext(persona)).toEqual({ names: [] });
  });
});
