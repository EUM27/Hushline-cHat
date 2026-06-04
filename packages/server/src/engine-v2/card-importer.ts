// ──────────────────────────────────────────────
// Engine v2 — Character Card Importer
// ──────────────────────────────────────────────
// Parses chara_card_v3 JSON and converts to CharacterDefinition.
// Supports slot replacement in scenario packs.
// ──────────────────────────────────────────────

import type { CharacterDefinition, CharacterHandoutDefinition } from "@hushline/shared";
import {
  characterCardSchema,
  characterCardSourceMetadataSchema,
  type CharacterCardSourceFormat,
  type CharacterCardSourceMetadata,
} from "./schemas.js";
import { extractCardFromPng } from "./png-card.js";

const MAX_CHARACTER_ID_LENGTH = 120;
const MAX_IMPORTED_SYSTEM_PROMPT_LENGTH = 100_000;
const MAX_SOURCE_FILE_NAME_LENGTH = 200;
const MAX_CARD_SPEC_LENGTH = 120;
const MAX_CARD_SPEC_VERSION_LENGTH = 80;
const MAX_CREATOR_LENGTH = 200;
const MAX_SOURCE_URL_LENGTH = 2048;
const MAX_EXTENSION_KEY_LENGTH = 120;

/**
 * Minimal chara_card_v3 shape we care about.
 * Full spec has more fields but we only extract what maps to our system.
 */
export interface CharaCardV3 {
  spec?: string; // "chara_card_v3"
  spec_version?: string;
  data: {
    name: string;
    creator?: string;
    source_url?: string;
    description: string;
    personality: string;
    scenario?: string;
    first_mes?: string;
    system_prompt?: string;
    post_history_instructions?: string;
    tags?: string[];
    alternate_greetings?: string[];
    character_book?: unknown;
    extensions?: Record<string, unknown>;
  };
}

/** Hushline engine data embedded in `data.extensions.hushline`. */
export interface HushlineCardExtension {
  id?: string;
  shortName?: string;
  role?: string;
  profileKind?: "advisor-slot" | "named-actor";
  anonymousLabel?: string;
  mbti?: string;
  ocean?: CharacterDefinition["ocean"];
  autonomy?: number;
  relationshipTags?: string[];
  handout?: Partial<CharacterHandoutDefinition>;
  relationships?: CharacterDefinition["relationships"];
  spriteSetId?: string;
  avatarId?: string;
}

/**
 * Convert a parsed chara_card_v3 into a full CharacterDefinition.
 * Standard card fields drive name/prompt; engine-specific data (handout,
 * relationships, OCEAN, autonomy) is read from `data.extensions.hushline`.
 * The card stays a valid chara_card_v3 — the extension is ignored by other apps.
 */
export function cardToCharacterDefinition(
  card: CharaCardV3,
  fallbackId: string,
): CharacterDefinition {
  const data = card.data;
  const ext = (data.extensions?.hushline ?? {}) as HushlineCardExtension;
  const name = data.name.trim();
  const shortName = ext.shortName ?? (name.length > 10 ? name.slice(0, 10) : name);

  const promptParts = [
    data.system_prompt,
    data.personality ? `[성격] ${data.personality}` : null,
    data.post_history_instructions,
  ].filter(Boolean);
  const systemPrompt = limitText(
    promptParts.join("\n\n") || `너는 ${name}이다. ${data.description?.slice(0, 200) ?? ""}`,
    MAX_IMPORTED_SYSTEM_PROMPT_LENGTH,
  );

  const extHandout = ext.handout ?? {};
  const handout: CharacterHandoutDefinition = {
    secret: extHandout.secret ?? "",
    desire: extHandout.desire ?? "",
    objective: extHandout.objective ?? "",
    initialRelationshipToUser: extHandout.initialRelationshipToUser ?? 0,
    ...(extHandout.surfacePersonality?.length ? { surfacePersonality: extHandout.surfacePersonality } : {}),
    ...(extHandout.fear ? { fear: extHandout.fear } : {}),
    ...(extHandout.behaviorRules?.length ? { behaviorRules: extHandout.behaviorRules } : {}),
  };

  return {
    id: normalizeCharacterId(ext.id ?? fallbackId),
    name,
    shortName,
    role: ext.role ?? data.description?.slice(0, 100) ?? "",
    profileKind: ext.profileKind ?? "named-actor",
    ...(ext.anonymousLabel ? { anonymousLabel: ext.anonymousLabel } : {}),
    mbti: ext.mbti ?? "unspecified",
    ocean: ext.ocean ?? inferOcean(data.personality ?? ""),
    autonomy: ext.autonomy ?? 0.6,
    systemPrompt,
    ...(ext.relationshipTags?.length ? { relationshipTags: ext.relationshipTags } : {}),
    handout,
    relationships: ext.relationships ?? [],
    ...(ext.spriteSetId ? { spriteSetId: ext.spriteSetId } : {}),
    ...(ext.avatarId ? { avatarId: ext.avatarId } : {}),
  };
}

export type CardImportResult =
  | { success: true; character: CharacterDefinition }
  | { success: false; error: string };

/**
 * Parse a chara_card_v3 JSON string into a CharacterDefinition.
 * The card's personality/description become the systemPrompt.
 * Handout fields are inferred from description or left empty for scenario to fill.
 */
export function importCharaCard(
  raw: string,
  slotId: string,
  options: {
    autonomy?: number;
    profileKind?: "advisor-slot" | "named-actor";
    anonymousLabel?: string;
  } = {},
): CardImportResult {
  let card: CharaCardV3;
  try {
    card = JSON.parse(raw);
  } catch {
    return { success: false, error: "JSON 파싱 실패" };
  }

  if (!card?.data?.name) {
    return { success: false, error: "캐릭터 이름이 없습니다" };
  }

  if (card.spec !== "chara_card_v3" && card.spec !== "chara_card_v2") {
    // Be lenient — accept v2 cards too
    if (!card.data) {
      return { success: false, error: "지원하지 않는 카드 형식입니다" };
    }
  }

  const data = card.data;
  const name = data.name.trim();
  const shortName = name.length > 10 ? name.slice(0, 10) : name;

  // Build system prompt from card fields
  const promptParts = [
    data.system_prompt,
    data.personality ? `[성격] ${data.personality}` : null,
    data.post_history_instructions,
  ].filter(Boolean);

  const systemPrompt = limitText(
    promptParts.join("\n\n") || `너는 ${name}이다. ${data.description?.slice(0, 200) ?? ""}`,
    MAX_IMPORTED_SYSTEM_PROMPT_LENGTH,
  );

  // Try to extract handout from description
  const handout = extractHandoutFromDescription(data.description ?? "");

  // Infer OCEAN from personality keywords (rough heuristic)
  const ocean = inferOcean(data.personality ?? "");

  const character: CharacterDefinition = {
    id: normalizeCharacterId(slotId),
    name,
    shortName,
    role: data.description?.slice(0, 100) ?? "",
    profileKind: options.profileKind ?? "named-actor",
    ...(options.anonymousLabel ? { anonymousLabel: options.anonymousLabel } : {}),
    mbti: "unspecified",
    ocean,
    autonomy: options.autonomy ?? 0.6,
    systemPrompt,
    handout,
    relationships: [],
  };

  return { success: true, character };
}

/**
 * Try to extract secret/desire/objective from a character description.
 * Looks for patterns like (비밀: ...) or keywords.
 */
function extractHandoutFromDescription(description: string): CharacterHandoutDefinition {
  const secretMatch = description.match(/\(비밀[:\s]*([^)]+)\)/);
  const desireMatch = description.match(/(?:욕망|원하는 것|목적)[:\s]*([^.。\n]+)/);

  return {
    secret: secretMatch?.[1]?.trim() ?? "",
    desire: desireMatch?.[1]?.trim() ?? "",
    objective: "",
    initialRelationshipToUser: 0,
    surfacePersonality: [],
    fear: "",
    behaviorRules: [],
  };
}

/**
 * Rough OCEAN inference from personality text.
 */
function inferOcean(personality: string): CharacterDefinition["ocean"] {
  const lower = personality.toLowerCase();
  return {
    openness: lower.includes("창의") || lower.includes("호기심") ? 70 : 50,
    conscientiousness: lower.includes("계획") || lower.includes("성실") ? 70 : lower.includes("충동") ? 30 : 50,
    extraversion: lower.includes("활발") || lower.includes("사교") ? 70 : lower.includes("조용") || lower.includes("내향") ? 30 : 50,
    agreeableness: lower.includes("친절") || lower.includes("공감") ? 70 : lower.includes("냉정") || lower.includes("냉혹") ? 30 : 50,
    neuroticism: lower.includes("불안") || lower.includes("예민") ? 70 : lower.includes("침착") || lower.includes("안정") ? 30 : 50,
  };
}

/**
 * Replace a character slot in a scenario pack's character array.
 * Preserves the original slot's handout if the imported card doesn't have one.
 */
export function replaceCharacterSlot(
  characters: CharacterDefinition[],
  slotId: string,
  imported: CharacterDefinition,
  options: {
    preserveOriginalCharacterization?: boolean;
  } = {},
): CharacterDefinition[] {
  const original = characters.find((c) => c.id === slotId);
  const preserveOriginalCharacterization = options.preserveOriginalCharacterization ?? true;

  // Merge: imported card takes priority, but fill empty handout fields from original
  const mergedHandout: CharacterHandoutDefinition = {
    secret: imported.handout.secret || original?.handout.secret || "",
    desire: imported.handout.desire || original?.handout.desire || "",
    objective: imported.handout.objective || original?.handout.objective || "",
    initialRelationshipToUser: imported.handout.initialRelationshipToUser || original?.handout.initialRelationshipToUser || 0,
    ...(imported.handout.surfacePersonality?.length
      ? { surfacePersonality: imported.handout.surfacePersonality }
      : preserveOriginalCharacterization && original?.handout.surfacePersonality?.length
        ? { surfacePersonality: original.handout.surfacePersonality }
        : {}),
    ...(imported.handout.fear
      ? { fear: imported.handout.fear }
      : preserveOriginalCharacterization && original?.handout.fear
        ? { fear: original.handout.fear }
        : {}),
    ...(imported.handout.behaviorRules?.length
      ? { behaviorRules: imported.handout.behaviorRules }
      : preserveOriginalCharacterization && original?.handout.behaviorRules?.length
        ? { behaviorRules: original.handout.behaviorRules }
        : {}),
  };

  const merged: CharacterDefinition = {
    ...imported,
    id: slotId,
    handout: mergedHandout,
    relationships: imported.relationships.length > 0
      ? imported.relationships
      : original?.relationships ?? [],
  };

  return characters.map((c) => (c.id === slotId ? merged : c));
}

// ──────────────────────────────────────────────
// Unified card import (strict, schema-validated)
// ──────────────────────────────────────────────

export type ImportedCardResult =
  | { ok: true; character: CharacterDefinition; metadata: CharacterCardSourceMetadata }
  | { ok: false; error: string };

/**
 * Import a character from raw card JSON text.
 * Validates against characterCardSchema, then converts via cardToCharacterDefinition.
 */
export function importCardJson(
  jsonText: string,
  fallbackId: string,
  sourceFileName?: string,
  options: {
    sourceFormat?: CharacterCardSourceFormat;
  } = {},
): ImportedCardResult {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    return { ok: false, error: "카드 JSON 파싱에 실패했습니다." };
  }

  const parsed = characterCardSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: `카드 형식 검증 실패: ${issue ? `[${issue.path.join(".")}] ${issue.message}` : "unknown"}`,
    };
  }

  const card = parsed.data as CharaCardV3;
  const character = cardToCharacterDefinition(card, fallbackId);
  const metadata = buildCardSourceMetadata(
    card,
    options.sourceFormat ?? getJsonSourceFormat(card.spec),
    sourceFileName,
  );
  return { ok: true, character, metadata };
}

/**
 * Import a character from PNG bytes (extract embedded card → importCardJson).
 */
export function importCardPng(bytes: Uint8Array, fallbackId: string, sourceFileName?: string): ImportedCardResult {
  const extracted = extractCardFromPng(bytes);
  if (!extracted.ok) {
    return { ok: false, error: extracted.error };
  }
  return importCardJson(extracted.json, fallbackId, sourceFileName, {
    sourceFormat: extracted.keyword === "ccv3" ? "png-ccv3" : "png-chara-v2",
  });
}

function getJsonSourceFormat(spec: string | undefined): CharacterCardSourceFormat {
  if (spec === "chara_card_v3") return "json-v3";
  if (spec === "chara_card_v2") return "json-v2";
  return "json-unknown";
}

function buildCardSourceMetadata(
  card: CharaCardV3,
  sourceFormat: CharacterCardSourceFormat,
  sourceFileName?: string,
): CharacterCardSourceMetadata {
  const data = card.data;
  const extensions = data.extensions ?? {};
  const normalizedSourceFileName = cleanText(sourceFileName, MAX_SOURCE_FILE_NAME_LENGTH);
  const cardSpec = cleanText(card.spec, MAX_CARD_SPEC_LENGTH);
  const cardSpecVersion = cleanText(card.spec_version, MAX_CARD_SPEC_VERSION_LENGTH);
  const creator = findCreator(data);
  const sourceUrl = findSourceUrl(data);
  const metadata = {
    ...(normalizedSourceFileName ? { sourceFileName: normalizedSourceFileName } : {}),
    sourceFormat,
    ...(cardSpec ? { cardSpec } : {}),
    ...(cardSpecVersion ? { cardSpecVersion } : {}),
    ...(creator ? { creator } : {}),
    ...(sourceUrl ? { sourceUrl } : {}),
    extensionKeys: normalizeExtensionKeys(Object.keys(extensions)),
    hasFirstMessage: Boolean(cleanText(data.first_mes)),
    alternateGreetingCount: data.alternate_greetings?.length ?? 0,
    hasScenario: Boolean(cleanText(data.scenario)),
    hasCharacterBook: data.character_book !== undefined && data.character_book !== null,
  };
  return characterCardSourceMetadataSchema.parse(metadata);
}

function findCreator(data: CharaCardV3["data"]): string | undefined {
  const extensions = data.extensions ?? {};
  const janitor = getRecord(extensions.janitor);
  const chub = getRecord(extensions.chub);
  return cleanText(janitor?.creator, MAX_CREATOR_LENGTH)
    ?? cleanText(chub?.creator, MAX_CREATOR_LENGTH)
    ?? cleanText(data.creator, MAX_CREATOR_LENGTH);
}

function findSourceUrl(data: CharaCardV3["data"]): string | undefined {
  const extensions = data.extensions ?? {};
  const janitor = getRecord(extensions.janitor);
  const chub = getRecord(extensions.chub);
  return (
    cleanText(janitor?.source_url, MAX_SOURCE_URL_LENGTH) ??
    cleanText(janitor?.sourceUrl, MAX_SOURCE_URL_LENGTH) ??
    cleanText(janitor?.url, MAX_SOURCE_URL_LENGTH) ??
    cleanText(chub?.source_url, MAX_SOURCE_URL_LENGTH) ??
    cleanText(chub?.sourceUrl, MAX_SOURCE_URL_LENGTH) ??
    cleanText(chub?.url, MAX_SOURCE_URL_LENGTH) ??
    cleanText(chub?.full_path, MAX_SOURCE_URL_LENGTH) ??
    cleanText(data.source_url, MAX_SOURCE_URL_LENGTH)
  );
}

function getRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function cleanText(value: unknown, maxLength = Number.POSITIVE_INFINITY): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? limitText(value.trim(), maxLength) : undefined;
}

function limitText(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength).trimEnd() : value;
}

function normalizeCharacterId(value: string): string {
  const normalized = value
    .normalize("NFKC")
    .trim()
    .slice(0, MAX_CHARACTER_ID_LENGTH)
    .replace(/-+$/g, "");
  return normalized || "imported-character";
}

function normalizeExtensionKeys(keys: string[]): string[] {
  const normalized = keys
    .map((key) => cleanText(key, MAX_EXTENSION_KEY_LENGTH))
    .filter((key): key is string => Boolean(key));
  return [...new Set(normalized)].sort((a, b) => a.localeCompare(b));
}
