import { describe, expect, test } from "bun:test";
import { createAppV2 } from "../app-v2";
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

function makeApp() {
  return createAppV2({ store: createSqliteStoreV2(":memory:") });
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

  test("imports a PNG card (base64) and returns the converted character", async () => {
    const app = makeApp();
    const pngBase64 = Buffer.from(makePng(JSON.stringify(SAMPLE_CARD))).toString("base64");
    const response = await app.request("/api/v2/character-card/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "png", data: pngBase64, fileName: "minjae.png" }),
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { character: { id: string; name: string } };
    expect(payload.character.name).toBe("강민재");
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

function makePng(cardJson: string | null): Uint8Array {
  const chunks: Uint8Array[] = [chunk("IHDR", new Uint8Array(13))];
  if (cardJson !== null) {
    const text = Buffer.from(cardJson, "utf-8").toString("base64");
    const data = concat(latin1("ccv3"), Uint8Array.from([0]), latin1(text));
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
