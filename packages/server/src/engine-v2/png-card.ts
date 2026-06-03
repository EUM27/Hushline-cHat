// ──────────────────────────────────────────────
// Engine v2 — PNG character-card chunk extractor
// ──────────────────────────────────────────────
// Character cards are commonly distributed as PNG files with the card JSON
// embedded in tEXt/zTXt chunks (keyword "ccv3" for chara_card_v3, base64;
// fallback "chara" for chara_card_v2, base64). No external dependencies.
// ──────────────────────────────────────────────

import { inflateSync } from "node:zlib";

export type PngCardResult =
  | { ok: true; json: string; keyword: "ccv3" | "chara" }
  | { ok: false; error: string };

const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Extract embedded character-card JSON text from PNG bytes.
 * Prefers the "ccv3" keyword (chara_card_v3), falls back to "chara" (v2).
 */
export function extractCardFromPng(bytes: Uint8Array): PngCardResult {
  if (!hasPngSignature(bytes)) {
    return { ok: false, error: "유효한 PNG 파일이 아닙니다." };
  }

  const chunks = readTextChunks(bytes);
  if (chunks === null) {
    return { ok: false, error: "PNG 청크를 읽을 수 없습니다 (손상된 파일)." };
  }

  const ccv3 = chunks.get("ccv3");
  const chara = chunks.get("chara");
  const selected = ccv3 !== undefined
    ? { keyword: "ccv3" as const, text: ccv3 }
    : chara !== undefined
      ? { keyword: "chara" as const, text: chara }
      : null;
  if (selected === null) {
    return { ok: false, error: "PNG에 캐릭터 카드 데이터(ccv3/chara)가 없습니다." };
  }

  const json = decodeCardText(selected.text);
  if (json === null) {
    return { ok: false, error: "카드 데이터 base64 디코드에 실패했습니다." };
  }

  return { ok: true, json, keyword: selected.keyword };
}

// ── Internals ──

function hasPngSignature(bytes: Uint8Array): boolean {
  if (bytes.length < PNG_SIGNATURE.length) return false;
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return false;
  }
  return true;
}

/**
 * Walk PNG chunks and return a map of keyword → raw text payload for tEXt/zTXt.
 * Returns null on malformed structure.
 */
function readTextChunks(bytes: Uint8Array): Map<string, string> | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const result = new Map<string, string>();
  let offset = PNG_SIGNATURE.length;

  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset);
    const typeStart = offset + 4;
    const dataStart = typeStart + 4;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) {
      return result.size > 0 ? result : null;
    }

    const type = latin1(bytes, typeStart, typeStart + 4);
    const data = bytes.subarray(dataStart, dataEnd);

    if (type === "tEXt") {
      const parsed = parseTextChunk(data);
      if (parsed && !result.has(parsed.keyword)) result.set(parsed.keyword, parsed.text);
    } else if (type === "zTXt") {
      const parsed = parseCompressedTextChunk(data);
      if (parsed && !result.has(parsed.keyword)) result.set(parsed.keyword, parsed.text);
    } else if (type === "IEND") {
      break;
    }

    offset = dataEnd + 4; // skip CRC
  }

  return result;
}

/** tEXt: keyword \0 text (latin1). */
function parseTextChunk(data: Uint8Array): { keyword: string; text: string } | null {
  const sep = data.indexOf(0);
  if (sep < 0) return null;
  const keyword = latin1(data, 0, sep);
  const text = latin1(data, sep + 1, data.length);
  return { keyword, text };
}

/** zTXt: keyword \0 compressionMethod(1) zlib(text). */
function parseCompressedTextChunk(data: Uint8Array): { keyword: string; text: string } | null {
  const sep = data.indexOf(0);
  if (sep < 0 || sep + 2 > data.length) return null;
  const keyword = latin1(data, 0, sep);
  const compressed = data.subarray(sep + 2); // skip separator + compression method byte
  try {
    const inflated = inflateSync(Buffer.from(compressed));
    return { keyword, text: inflated.toString("latin1") };
  } catch {
    return null;
  }
}

/** Card payloads are base64-encoded JSON (utf-8). */
function decodeCardText(text: string): string | null {
  try {
    const decoded = Buffer.from(text.trim(), "base64").toString("utf-8");
    if (!decoded.trim()) return null;
    return decoded;
  } catch {
    return null;
  }
}

function latin1(bytes: Uint8Array, start: number, end: number): string {
  return Buffer.from(bytes.subarray(start, end)).toString("latin1");
}
