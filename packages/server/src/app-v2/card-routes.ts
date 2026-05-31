import type { Hono } from "hono";
import { importCardJson, importCardPng } from "../engine-v2/index.js";
import { cardImportBodySchema, MAX_CARD_DATA_LENGTH } from "./schemas.js";

export function registerCardRoutes(app: Hono) {
  app.post("/api/v2/character-card/import", async (context) => {
    const parsed = cardImportBodySchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) {
      return context.json({ error: "잘못된 카드 import 요청입니다." }, 400);
    }

    const { kind, data, fileName } = parsed.data;
    if (data.length > MAX_CARD_DATA_LENGTH) {
      return context.json({ error: "파일이 너무 큽니다." }, 413);
    }

    const fallbackId = deriveSlotId(fileName);
    const result = kind === "png"
      ? importCardPng(base64ToBytes(data), fallbackId)
      : importCardJson(data, fallbackId);

    if (!result.ok) {
      return context.json({ error: result.error }, 400);
    }

    return context.json({ character: result.character });
  });
}

function base64ToBytes(base64: string): Uint8Array {
  // Tolerate data URL prefixes (e.g. "data:image/png;base64,....").
  const comma = base64.indexOf(",");
  const payload = base64.startsWith("data:") && comma >= 0 ? base64.slice(comma + 1) : base64;
  return new Uint8Array(Buffer.from(payload, "base64"));
}

function deriveSlotId(fileName?: string): string {
  if (!fileName) return "imported-character";
  const stem = fileName.replace(/\.[^.]+$/, "");
  const slug = stem
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "imported-character";
}
