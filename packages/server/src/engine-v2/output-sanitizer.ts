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
 */
export function sanitizeCharacterOutput(raw: string, character: CharacterDefinition): string {
  let text = raw.trim();
  if (!text) return "";

  // Strip leading label (up to 3 attempts)
  for (let i = 0; i < 3; i++) {
    const next = removeLeadingLabel(text, character);
    if (next === text) break;
    text = next.trim();
  }

  // Truncate at any label mid-text
  text = truncateAtLabel(text);

  // Strip leading narration
  text = stripLeadingNarration(text);

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
): DirectorOutput {
  const speakerId = pickLeastRecentSpeaker(characterIds, recentSpeakerIds);
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

function removeLeadingLabel(text: string, character: CharacterDefinition): string {
  // [라벨]: or [라벨] at start
  const bracketPattern = /^\s*\[[^\]\n]{1,40}\]\s*[:：>\-]?\s*/;
  if (bracketPattern.test(text)) {
    return text.replace(bracketPattern, "");
  }

  // name: at start
  const names = new Set(
    [character.name, character.shortName, character.anonymousLabel]
      .filter((v): v is string => Boolean(v))
      .flatMap((v) => [v, v.replace(/^\[/, "").replace(/\]$/, "")]),
  );

  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const namePattern = new RegExp(`^\\s*${escaped}\\s*[:：>\\-]\\s*`);
    if (namePattern.test(text)) {
      return text.replace(namePattern, "");
    }
  }

  return text;
}

/**
 * Truncate at any newline followed by a [label]: pattern.
 * This catches both foreign labels AND the character repeating its own label.
 */
function truncateAtLabel(text: string): string {
  const labelPattern = /\n\s*\[[^\]\n]{1,40}\]\s*[:：]?\s*/g;
  const match = labelPattern.exec(text);
  if (match && match.index > 0) {
    return text.slice(0, match.index).trim();
  }
  return text;
}

/**
 * If output has multiple paragraphs and the first looks like narration
 * (sensory/descriptive, no dialogue markers), strip it.
 */
function stripLeadingNarration(text: string): string {
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim());
  if (paragraphs.length <= 1) return text;

  const first = paragraphs[0]?.trim() ?? "";
  if (looksLikeNarration(first)) {
    return paragraphs.slice(1).join("\n\n").trim();
  }

  return text;
}

function looksLikeNarration(text: string): boolean {
  const narrationMarkers = [
    /냄새/, /소리/, /느껴/, /닿는다/, /스친다/, /들린다/, /보인다/,
    /어둠/, /빛/, /그림자/, /공기/, /바닥/, /천장/, /벽/,
    /한다\./, /였다\./, /있다\./, /된다\./,
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

function pickLeastRecentSpeaker(
  characterIds: string[],
  recentSpeakerIds: string[],
): string | undefined {
  if (characterIds.length === 0) return undefined;

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
