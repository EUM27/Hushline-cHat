import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSqliteProfileLibraryStore, type ProfileLibraryStore } from "../profile-library-store";

describe("profile library store", () => {
  test("persists persona profiles and character cards across store instances", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "hushline-profile-library-"));
    const dbPath = join(tempDir, "library.db");
    let firstStore: ProfileLibraryStore | null = null;
    let secondStore: ProfileLibraryStore | null = null;

    try {
      firstStore = createSqliteProfileLibraryStore(dbPath);
      const persona = firstStore.savePersonaProfile({
        label: "비 오는 밤 새 입주자",
        persona: {
          name: "정해윤",
          shortName: "해윤",
          role: "공유주택에 막 들어온 새 입주자",
          description: "경계심이 있지만 사람을 밀어내지는 않는다.",
          appearance: "비에 젖은 회색 후드와 낡은 운동화를 신고 있다.",
          portraitUrl: "https://example.test/haeyoon.png",
          relationshipTags: ["new-tenant", "keeps-distance"],
        },
      });
      const card = firstStore.saveCharacterCard({
        name: "백이현",
        sourceFileName: "baek-ihyeon.json",
        sourceMetadata: {
          sourceFileName: "baek-ihyeon.json",
          sourceFormat: "json-v3",
          cardSpec: "chara_card_v3",
          cardSpecVersion: "3.0",
          creator: "janitor-maker",
          sourceUrl: "https://janitor.example.test/cards/baek-ihyeon",
          extensionKeys: ["hushline", "janitor"],
          hasFirstMessage: true,
          alternateGreetingCount: 1,
          hasScenario: true,
          hasCharacterBook: true,
        },
        character: {
          id: "imported-card",
          name: "백이현",
          shortName: "이현",
          role: "폭설 속 산장에 늦게 도착한 법의학자",
          profileKind: "named-actor",
          mbti: "INTJ",
          ocean: {
            openness: 61,
            conscientiousness: 83,
            extraversion: 28,
            agreeableness: 39,
            neuroticism: 55,
          },
          autonomy: 0.72,
          systemPrompt: "너는 백이현이다. 감정보다 증거를 먼저 본다.",
          relationshipTags: ["evidence-first"],
          handout: {
            secret: "피해자를 오래전부터 알고 있었다.",
            desire: "사건 현장의 훼손을 막고 싶다.",
            objective: "시신 주변의 단서를 보존한다.",
            initialRelationshipToUser: -1,
          },
          relationships: [],
        },
      });

      firstStore.close();
      firstStore = null;
      secondStore = createSqliteProfileLibraryStore(dbPath);

      expect(secondStore.listPersonaProfiles()).toEqual([
        expect.objectContaining({
          id: persona.id,
          label: "비 오는 밤 새 입주자",
          persona: expect.objectContaining({
            name: "정해윤",
            portraitUrl: "https://example.test/haeyoon.png",
            relationshipTags: ["new-tenant", "keeps-distance"],
          }),
        }),
      ]);
      expect(secondStore.getCharacterCard(card.id)).toMatchObject({
        id: card.id,
        name: "백이현",
        sourceFileName: "baek-ihyeon.json",
        sourceMetadata: {
          sourceFileName: "baek-ihyeon.json",
          sourceFormat: "json-v3",
          cardSpec: "chara_card_v3",
          cardSpecVersion: "3.0",
          creator: "janitor-maker",
          sourceUrl: "https://janitor.example.test/cards/baek-ihyeon",
          extensionKeys: ["hushline", "janitor"],
          hasFirstMessage: true,
          alternateGreetingCount: 1,
          hasScenario: true,
          hasCharacterBook: true,
        },
        character: {
          name: "백이현",
          relationshipTags: ["evidence-first"],
          handout: {
            secret: "피해자를 오래전부터 알고 있었다.",
          },
        },
      });
      expect(secondStore.listCharacterCards()[0]?.sourceMetadata?.extensionKeys).toEqual(["hushline", "janitor"]);
    } finally {
      firstStore?.close();
      secondStore?.close();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
