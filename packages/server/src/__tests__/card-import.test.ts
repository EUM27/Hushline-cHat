import { describe, expect, test } from "bun:test";
import { createAppV2 } from "../app-v2";
import { createMemoryProfileLibraryStore } from "../store/profile-library-store";
import { createSqliteStoreV2 } from "../store/sqlite-store-v2";

const SAMPLE_CARD = {
  spec: "chara_card_v3",
  spec_version: "3.0",
  data: {
    name: "강민재",
    description: "오랜 소꿉친구",
    personality: "다정하지만 우유부단",
    system_prompt: "너는 강민재다.",
    extensions: {
      hushline: {
        id: "kang-minjae",
        mbti: "INFP",
        ocean: { openness: 62, conscientiousness: 52, extraversion: 40, agreeableness: 74, neuroticism: 66 },
        autonomy: 0.65,
        handout: { secret: "오래된 마음", initialRelationshipToUser: 3 },
        relationships: [{ targetId: "seo-yujin", descriptor: "envy", intensity: 5 }],
      },
    },
  },
};

const SAMPLE_METADATA = {
  sourceFileName: "minjae-chara.png",
  sourceFormat: "png-chara-v2",
  cardSpec: "chara_card_v2",
  cardSpecVersion: "2.0",
  creator: "janitor-maker",
  sourceUrl: "https://janitor.example.test/cards/minjae",
  extensionKeys: ["chub", "hushline", "janitor"],
  hasFirstMessage: true,
  alternateGreetingCount: 2,
  hasScenario: true,
  hasCharacterBook: true,
};

function makeApp() {
  return createAppV2({
    store: createSqliteStoreV2(":memory:"),
    profileLibraryStore: createMemoryProfileLibraryStore(),
  });
}

describe("character card import route", () => {
  test("imports a JSON card and returns the converted character", async () => {
    const app = makeApp();
    const response = await app.request("/api/v2/character-card/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "json", data: JSON.stringify(SAMPLE_CARD), fileName: "kang-minjae.json" }),
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { character: { id: string; name: string; ocean: { neuroticism: number }; handout: { initialRelationshipToUser: number } } };
    expect(payload.character.id).toBe("kang-minjae");
    expect(payload.character.name).toBe("강민재");
    expect(payload.character.ocean.neuroticism).toBe(66);
    expect(payload.character.handout.initialRelationshipToUser).toBe(3);
  });

  test("saves imported cards into the reusable character library", async () => {
    const app = makeApp();
    const importResponse = await app.request("/api/v2/character-card/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "json", data: JSON.stringify(SAMPLE_CARD), fileName: "kang-minjae.json" }),
    });
    expect(importResponse.status).toBe(200);

    const listResponse = await app.request("/api/v2/character-cards");
    expect(listResponse.status).toBe(200);
    const payload = await listResponse.json() as {
      characterCards: Array<{ name: string; sourceFileName?: string; character: { name: string; systemPrompt: string } }>;
    };

    expect(payload.characterCards).toHaveLength(1);
    expect(payload.characterCards[0]).toMatchObject({
      name: "강민재",
      sourceFileName: "kang-minjae.json",
      character: {
        name: "강민재",
        systemPrompt: "너는 강민재다.\n\n[성격] 다정하지만 우유부단",
      },
    });
  });

  test("imports a PNG card (base64) and returns the converted character", async () => {
    const app = makeApp();
    const pngBase64 = Buffer.from(makePng(JSON.stringify(SAMPLE_CARD))).toString("base64");
    const response = await app.request("/api/v2/character-card/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "png", data: pngBase64, fileName: "minjae.png" }),
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { character: { id: string; name: string; standingImageUrl?: string } };
    expect(payload.character.name).toBe("강민재");
    expect(payload.character.standingImageUrl).toBeUndefined();
  });

  test("returns and saves metadata for chara PNG v2 imports", async () => {
    const app = makeApp();
    const card = {
      ...SAMPLE_CARD,
      spec: "chara_card_v2",
      spec_version: "2.0",
      data: {
        ...SAMPLE_CARD.data,
        creator: "data-maker",
        scenario: "비 오는 공유주택 거실",
        first_mes: "오늘도 늦었네.",
        alternate_greetings: ["왔어?", "기다렸어."],
        character_book: { entries: [] },
        extensions: {
          ...SAMPLE_CARD.data.extensions,
          janitor: {
            creator: "janitor-maker",
            source_url: "https://janitor.example.test/cards/minjae",
          },
          chub: {
            creator: "chub-maker",
          },
        },
      },
    };
    const pngBase64 = Buffer.from(makePng(JSON.stringify(card), "chara")).toString("base64");

    const response = await app.request("/api/v2/character-card/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "png", data: pngBase64, fileName: "minjae-chara.png" }),
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      metadata: typeof SAMPLE_METADATA;
      characterCard?: { sourceMetadata?: typeof SAMPLE_METADATA };
    };
    expect(payload.metadata).toEqual(SAMPLE_METADATA);
    expect(payload.characterCard?.sourceMetadata).toEqual(SAMPLE_METADATA);

    const listResponse = await app.request("/api/v2/character-cards");
    expect(listResponse.status).toBe(200);
    const listPayload = (await listResponse.json()) as {
      characterCards: Array<{ sourceMetadata?: typeof SAMPLE_METADATA }>;
    };
    expect(listPayload.characterCards[0]?.sourceMetadata).toEqual(SAMPLE_METADATA);
  });

  test("imports real-world PNG cards with long personality and system prompt fields", async () => {
    const app = makeApp();
    const longCard = {
      ...SAMPLE_CARD,
      data: {
        ...SAMPLE_CARD.data,
        name: "Damien Griffin",
        personality: "protective ".repeat(1200),
        system_prompt: "You are Damien Griffin. ".repeat(600),
      },
    };
    const pngBase64 = Buffer.from(makePng(JSON.stringify(longCard))).toString("base64");

    const response = await app.request("/api/v2/character-card/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "png", data: pngBase64, fileName: "damien.png" }),
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { character: { name: string; systemPrompt: string } };
    expect(payload.character.name).toBe("Damien Griffin");
    expect(payload.character.systemPrompt.length).toBeGreaterThan(20000);
  });

  test("keeps imported character payloads within session override limits", async () => {
    const app = makeApp();
    const longFileName = `${"very-long-card-name-".repeat(7)}.json`;
    const card = {
      ...SAMPLE_CARD,
      data: {
        ...SAMPLE_CARD.data,
        system_prompt: "system ".repeat(80_000 / 7),
        personality: "personality ".repeat(80_000 / 12),
      },
    };

    const response = await app.request("/api/v2/character-card/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "json", data: JSON.stringify(card), fileName: longFileName }),
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { character: { id: string; systemPrompt: string } };
    expect(payload.character.id.length).toBeLessThanOrEqual(120);
    expect(payload.character.systemPrompt.length).toBeLessThanOrEqual(100_000);
  });

  test("does not fail import when external extension namespaces exceed metadata limits", async () => {
    const app = makeApp();
    const longExtensionKey = "external-extension-namespace-".repeat(8);
    const card = {
      ...SAMPLE_CARD,
      data: {
        ...SAMPLE_CARD.data,
        extensions: {
          [longExtensionKey]: {},
          janitor: {
            creator: "creator ".repeat(80),
            source_url: `https://example.test/${"cards/".repeat(500)}`,
          },
        },
      },
    };

    const response = await app.request("/api/v2/character-card/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "json", data: JSON.stringify(card), fileName: "long-extension.json" }),
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      metadata: { creator?: string; sourceUrl?: string; extensionKeys: string[] };
    };
    expect(payload.metadata.creator?.length ?? 0).toBeLessThanOrEqual(200);
    expect(payload.metadata.sourceUrl?.length ?? 0).toBeLessThanOrEqual(2048);
    expect(payload.metadata.extensionKeys.every((key) => key.length <= 120)).toBe(true);
  });

  test("rejects an invalid request body", async () => {
    const app = makeApp();
    const response = await app.request("/api/v2/character-card/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "exe", data: "x" }),
    });
    expect(response.status).toBe(400);
  });

  test("rejects a PNG with no embedded card", async () => {
    const app = makeApp();
    const pngBase64 = Buffer.from(makePng(null)).toString("base64");
    const response = await app.request("/api/v2/character-card/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "png", data: pngBase64, fileName: "blank.png" }),
    });
    expect(response.status).toBe(400);
  });
});

// ── Minimal PNG synthesis (signature + IHDR + optional ccv3 tEXt + IEND) ──

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function makePng(cardJson: string | null, keyword: "ccv3" | "chara" = "ccv3"): Uint8Array {
  const chunks: Uint8Array[] = [chunk("IHDR", new Uint8Array(13))];
  if (cardJson !== null) {
    const text = Buffer.from(cardJson, "utf-8").toString("base64");
    const data = concat(latin1(keyword), Uint8Array.from([0]), latin1(text));
    chunks.push(chunk("tEXt", data));
  }
  chunks.push(chunk("IEND", new Uint8Array(0)));
  return concat(Uint8Array.from(PNG_SIGNATURE), ...chunks);
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = latin1(type);
  const length = new Uint8Array(4);
  new DataView(length.buffer).setUint32(0, data.length);
  const crc = new Uint8Array(4);
  new DataView(crc.buffer).setUint32(0, crc32(concat(typeBytes, data)));
  return concat(length, typeBytes, data, crc);
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

function latin1(text: string): Uint8Array {
  return new Uint8Array(Buffer.from(text, "latin1"));
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
