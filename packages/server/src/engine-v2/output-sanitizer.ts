// ──────────────────────────────────────────────
// Engine v2 — Output Sanitizer
// ──────────────────────────────────────────────
// Defensive processing for all agent outputs.
// Ensures characters don't narrate, narrators don't dialogue,
// and Director output is valid JSON.
// ──────────────────────────────────────────────

import type { DirectorOutput, CharacterDefinition } from "@hushline/shared";
import { directorOutputSchema } from "./schemas.js";
import { parseModelJson } from "../engine/json.js";

// ──────────────────────────────────────────────
// Character Output Sanitization
// ──────────────────────────────────────────────

/**
 * Clean character agent output:
 * 1. Strip leading speaker label
 * 2. Truncate at any label mid-text (own or foreign)
 * 3. Strip leading narration paragraphs
 * 4. Normalize remaining character lines into quote markers for client formatting
 */
export function sanitizeCharacterOutput(raw: string, character: CharacterDefinition): string {
  let text = raw.trim();
  if (!text) return "";

  // Strip leading label (up to 3 attempts)
  text = stripOwnLeadingLabelsOrRejectForeign(text, character);
  if (!text) return "";

  // Truncate at any label mid-text
  text = truncateAtLabel(text);

  // Strip leading narration
  text = stripLeadingNarration(text);

  // Narration stripping can expose a leading speaker label.
  text = stripOwnLeadingLabelsOrRejectForeign(text, character);
  if (!text) return "";

  text = truncateAtLabel(text);

  text = enforceCharacterLineMarkers(text);

  return text.trim();
}

// ──────────────────────────────────────────────
// Narrator Output Sanitization
// ──────────────────────────────────────────────

/**
 * Clean narrator agent output:
 * Truncate at any character dialogue label.
 */
export function sanitizeNarratorOutput(raw: string): string {
  const text = raw.trim();
  if (!text) return "";

  // Match [익명 N]: or [라벨]: at any position
  const labelPattern = /\[[\w가-힣\s]{1,40}\]\s*[:：]/;
  const match = labelPattern.exec(text);

  if (match) {
    if (match.index === 0) return ""; // Entire output is dialogue
    return text.slice(0, match.index).trim();
  }

  return text;
}

// ──────────────────────────────────────────────
// Director Output Validation
// ──────────────────────────────────────────────

const FALLBACK_DIRECTOR_OUTPUT: DirectorOutput = {
  speakers: [],
  silence: false,
  event: null,
  narratorInstruction: null,
  characterIntents: {},
  stateDelta: {},
  subObjectiveUpdate: null,
  relationshipUpdate: null,
  directives: [],
  delay: null,
};

/**
 * Parse and validate Director JSON output.
 * Returns validated DirectorOutput or null if completely unparseable.
 */
export function validateDirectorOutput(raw: string): DirectorOutput | null {
  // Try to extract JSON from potentially messy model output
  const candidate = parseModelJson(raw, FALLBACK_DIRECTOR_OUTPUT);

  // Validate with Zod schema
  const result = directorOutputSchema.safeParse(candidate);
  if (result.success) {
    return result.data as DirectorOutput;
  }

  // If parse succeeded but validation failed, try with fallback merge
  try {
    const merged = { ...FALLBACK_DIRECTOR_OUTPUT, ...candidate };
    const retryResult = directorOutputSchema.safeParse(merged);
    if (retryResult.success) {
      return retryResult.data as DirectorOutput;
    }
  } catch {
    // Fall through
  }

  return null;
}

/**
 * Get a safe fallback DirectorOutput when API fails or output is invalid.
 */
export function getFallbackDirectorOutput(
  characterIds: string[],
  recentSpeakerIds: string[] = [],
  userInput = "",
): DirectorOutput {
  const speakerId = pickFallbackSpeaker(characterIds, recentSpeakerIds, userInput);
  return {
    ...FALLBACK_DIRECTOR_OUTPUT,
    speakers: speakerId ? [speakerId] : [],
    characterIntents: speakerId
      ? { [speakerId]: "최근 발화자와 다른 관점에서, 자신의 이해관계와 비밀을 지키며 짧게 반응한다." }
      : {},
  };
}

// ──────────────────────────────────────────────
// Internal Helpers
// ──────────────────────────────────────────────

function stripOwnLeadingLabelsOrRejectForeign(text: string, character: CharacterDefinition): string {
  let next = text.trim();
  for (let i = 0; i < 3; i++) {
    const label = parseLeadingSpeakerLabel(next);
    if (!label) break;
    if (!isOwnSpeakerLabel(label.label, character)) {
      return "";
    }
    next = next.slice(label.endIndex).trim();
  }
  return next;
}

function parseLeadingSpeakerLabel(text: string): { label: string; endIndex: number } | null {
  const bracketMatch = /^\s*\[([^\]\n]{1,40})\]\s*[:：>\-]?\s*/.exec(text);
  if (bracketMatch?.[1]) {
    return {
      label: bracketMatch[1],
      endIndex: bracketMatch[0].length,
    };
  }

  const plainMatch = /^\s*([A-Za-z가-힣0-9_][A-Za-z가-힣0-9_\s]{0,39})\s*[:：]\s*/.exec(text);
  if (plainMatch?.[1]) {
    return {
      label: plainMatch[1],
      endIndex: plainMatch[0].length,
    };
  }

  return null;
}

function isOwnSpeakerLabel(label: string, character: CharacterDefinition): boolean {
  const normalized = normalizeSpeakerLabel(label);
  const ownLabels = [character.name, character.shortName, character.anonymousLabel]
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => [value, value.replace(/^\[/, "").replace(/\]$/, "")])
    .map(normalizeSpeakerLabel);

  return ownLabels.includes(normalized);
}

function normalizeSpeakerLabel(label: string): string {
  return label
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/\s+/g, "")
    .trim();
}

/**
 * Truncate at any newline followed by a [label]: pattern.
 * This catches both foreign labels AND the character repeating its own label.
 */
function truncateAtLabel(text: string): string {
  const labelPattern = /\n\s*(?:\[[^\]\n]{1,40}\]|[A-Za-z가-힣0-9_][A-Za-z가-힣0-9_\s]{0,39})\s*[:：]\s*/g;
  const match = labelPattern.exec(text);
  if (match && match.index > 0) {
    return text.slice(0, match.index).trim();
  }
  return text;
}

function enforceCharacterLineMarkers(text: string): string {
  const trimmed = text.trim();
  if (!trimmed || matchesCharacterLineMarkers(trimmed)) {
    return trimmed;
  }

  return trimmed
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `"${normalizeUnmarkedCharacterLine(line)}"`)
    .join("\n");
}

function matchesCharacterLineMarkers(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return true;
  const quotedSegment = /(?:["“][^"”\n]+["”]|['‘][^'’\n]+['’])/y;
  let index = 0;
  while (index < trimmed.length) {
    while (/\s/.test(trimmed[index] ?? "")) index += 1;
    quotedSegment.lastIndex = index;
    const match = quotedSegment.exec(trimmed);
    if (!match || match.index !== index) {
      return false;
    }
    index = quotedSegment.lastIndex;
  }
  return true;
}

function normalizeUnmarkedCharacterLine(line: string): string {
  return line
    .trim()
    .replace(/^["“'‘]+/, "")
    .replace(/["”'’]+$/, "")
    .replace(/["“”]/g, "")
    .replace(/[‘’]/g, "'");
}

/**
 * If output has multiple paragraphs and the first looks like narration
 * (sensory/descriptive, no dialogue markers), strip it.
 */
function stripLeadingNarration(text: string): string {
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim());
  if (paragraphs.length <= 1) return text;

  const first = paragraphs[0]?.trim() ?? "";
  const rest = paragraphs.slice(1).join("\n\n").trim();
  if (looksLikeNarration(first) || (looksLikeActionSentence(first) && containsStandaloneDialogue(rest))) {
    return paragraphs.slice(1).join("\n\n").trim();
  }

  return text;
}

function containsStandaloneDialogue(text: string): boolean {
  return /^["'“”‘’][^"'“”‘’\n]+["'“”‘’]/m.test(text.trim());
}

function looksLikeActionSentence(text: string): boolean {
  return /(시선|고개|손|입술|숨|침묵|눈|몸|어깨|라이터|문 쪽|테이블)/.test(text)
    && /(했다|하였다|피했다|돌렸다|내렸다|올렸다|움직였다|굳었다|멈췄다|닫았다|열었다)\.?$/.test(text);
}

function looksLikeNarration(text: string): boolean {
  const narrationMarkers = [
    /냄새/, /소리/, /느껴/, /닿는다/, /스친다/, /들린다/, /보인다/,
    /어둠/, /빛/, /그림자/, /공기/, /바닥/, /천장/, /벽/, /시선/, /고개/,
    /한다\./, /했다\./, /였다\./, /있다\./, /된다\./,
  ];
  const dialogueMarkers = [
    /야\s/, /너\s/, /해\b/, /마\b/, /봐\b/, /말해/, /대답/,
    /\?$/, /ㅋ/, /ㅎ/, /ㅠ/, /시발/, /씨발/,
    /거든/, /잖아/, /인데/, /는데/,
  ];

  const narrationScore = narrationMarkers.filter((p) => p.test(text)).length;
  const dialogueScore = dialogueMarkers.filter((p) => p.test(text)).length;

  return narrationScore >= 2 && narrationScore > dialogueScore;
}

function pickFallbackSpeaker(
  characterIds: string[],
  recentSpeakerIds: string[],
  userInput: string,
): string | undefined {
  if (characterIds.length === 0) return undefined;
  if (recentSpeakerIds.length === 0 && userInput.trim()) {
    return characterIds[hashString(userInput) % characterIds.length];
  }

  const recentIndex = new Map<string, number>();
  for (const [index, id] of recentSpeakerIds.entries()) {
    if (!recentIndex.has(id)) {
      recentIndex.set(id, index);
    }
  }

  return [...characterIds].sort((a, b) => {
    const aRank = recentIndex.has(a) ? recentIndex.get(a)! : Number.POSITIVE_INFINITY;
    const bRank = recentIndex.has(b) ? recentIndex.get(b)! : Number.POSITIVE_INFINITY;
    if (aRank !== bRank) return bRank - aRank;
    return characterIds.indexOf(a) - characterIds.indexOf(b);
  })[0];
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (const char of value.normalize("NFKC")) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash;
}
