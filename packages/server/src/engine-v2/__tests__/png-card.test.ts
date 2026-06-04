import { describe, expect, test } from "bun:test";
import { deflateSync } from "node:zlib";
import { extractCardFromPng } from "../png-card";
import { importCardJson, importCardPng } from "../card-importer";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const SAMPLE_CARD = {
  spec: "chara_card_v3",
  spec_version: "3.0",
  data: {
    name: "테스트 카드",
    description: "PNG 매립 카드",
    personality: "차분함",
    system_prompt: "너는 테스트 카드다.",
    extensions: {
      hushline: {
        id: "png-char",
        mbti: "INTJ",
        ocean: { openness: 11, conscientiousness: 22, extraversion: 33, agreeableness: 44, neuroticism: 55 },
        autonomy: 0.8,
        handout: { secret: "비밀", initialRelationshipToUser: 2 },
        relationships: [{ targetId: "other", descriptor: "ally", intensity: 3 }],
      },
    },
  },
};

describe("extractCardFromPng", () => {
  test("extracts a tEXt ccv3 chunk", () => {
    const png = makePng([textChunk("ccv3", base64(JSON.stringify(SAMPLE_CARD)))]);
    const result = extractCardFromPng(png);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(JSON.parse(result.json).data.name).toBe("테스트 카드");
  });

  test("prefers ccv3 over chara when both exist", () => {
    const v3 = { ...SAMPLE_CARD, data: { ...SAMPLE_CARD.data, name: "V3" } };
    const v2 = { ...SAMPLE_CARD, data: { ...SAMPLE_CARD.data, name: "V2" } };
    const png = makePng([
      textChunk("chara", base64(JSON.stringify(v2))),
      textChunk("ccv3", base64(JSON.stringify(v3))),
    ]);
    const result = extractCardFromPng(png);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(JSON.parse(result.json).data.name).toBe("V3");
  });

  test("falls back to chara when ccv3 is absent", () => {
    const png = makePng([textChunk("chara", base64(JSON.stringify(SAMPLE_CARD)))]);
    const result = extractCardFromPng(png);
    expect(result.ok).toBe(true);
  });

  test("reads a compressed zTXt chunk", () => {
    const png = makePng([ztxtChunk("ccv3", base64(JSON.stringify(SAMPLE_CARD)))]);
    const result = extractCardFromPng(png);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(JSON.parse(result.json).data.name).toBe("테스트 카드");
  });

  test("fails when no card chunk is present", () => {
    const png = makePng([textChunk("Comment", "그냥 코멘트")]);
    const result = extractCardFromPng(png);
    expect(result.ok).toBe(false);
  });

  test("fails on an invalid PNG signature", () => {
    const result = extractCardFromPng(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
    expect(result.ok).toBe(false);
  });
});

describe("importCardPng / importCardJson", () => {
  test("PNG import yields the same character as JSON import", () => {
    const json = JSON.stringify(SAMPLE_CARD);
    const fromJson = importCardJson(json, "fallback");
    const png = makePng([textChunk("ccv3", base64(json))]);
    const fromPng = importCardPng(png, "fallback");

    expect(fromJson.ok).toBe(true);
    expect(fromPng.ok).toBe(true);
    if (!fromJson.ok || !fromPng.ok) return;
    expect(fromPng.character).toEqual(fromJson.character);
    expect(fromPng.character.id).toBe("png-char");
    expect(fromPng.character.ocean.neuroticism).toBe(55);
  });

  test("importCardJson rejects invalid card schema", () => {
    const result = importCardJson(JSON.stringify({ data: {} }), "fallback");
    expect(result.ok).toBe(false);
  });

  test("importCardJson rejects non-JSON", () => {
    const result = importCardJson("not json", "fallback");
    expect(result.ok).toBe(false);
  });
});

// ── PNG synthesis helpers ──

function makePng(chunks: Uint8Array[]): Uint8Array {
  const ihdr = chunk("IHDR", new Uint8Array(13)); // minimal (content irrelevant for our parser)
  const iend = chunk("IEND", new Uint8Array(0));
  const parts = [Uint8Array.from(PNG_SIGNATURE), ihdr, ...chunks, iend];
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function textChunk(keyword: string, text: string): Uint8Array {
  const data = concat(latin1Bytes(keyword), Uint8Array.from([0]), latin1Bytes(text));
  return chunk("tEXt", data);
}

function ztxtChunk(keyword: string, text: string): Uint8Array {
  const compressed = new Uint8Array(deflateSync(Buffer.from(text, "latin1")));
  const data = concat(latin1Bytes(keyword), Uint8Array.from([0, 0]), compressed);
  return chunk("zTXt", data);
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = latin1Bytes(type);
  const length = new Uint8Array(4);
  new DataView(length.buffer).setUint32(0, data.length);
  const crcInput = concat(typeBytes, data);
  const crc = new Uint8Array(4);
  new DataView(crc.buffer).setUint32(0, crc32(crcInput));
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

function latin1Bytes(text: string): Uint8Array {
  return new Uint8Array(Buffer.from(text, "latin1"));
}

function base64(text: string): string {
  return Buffer.from(text, "utf-8").toString("base64");
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
