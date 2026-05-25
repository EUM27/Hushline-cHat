import type { ChatMessage } from "@hushline/shared";

const MIN_STANDARD_DELAY_MS = 650;
const MIN_OPENING_DELAY_MS = 1300;
const MIN_SHORT_DRAMA_OPENING_MS = 1600;
const MAX_REVEAL_DELAY_MS = 9000;

export function calculateRevealDelay(
  message: Pick<ChatMessage, "content" | "role" | "isOpeningBeat">,
): number {
  const content = message.content.trim();
  if (!content) {
    return MIN_STANDARD_DELAY_MS;
  }

  const compactLength = [...content.replace(/\s+/g, "")].length;
  const basePerCharacter = getBaseMsPerCharacter(message.role);
  let delay = 420 + compactLength * basePerCharacter;

  delay += countMatches(content, /[,，、]/g) * 120;
  delay += countMatches(content, /[.!。]/g) * 220;
  delay += countMatches(content, /[?？]/g) * 220;
  delay += countMatches(content, /[!！]/g) * 180;
  delay += countMatches(content, /(\.\.\.|…)/g) * 450;
  delay += countMatches(content, /\n/g) * 300;

  if (message.isOpeningBeat) {
    delay *= 1.15;
  }

  if (compactLength < 12) {
    delay = Math.max(delay, message.isOpeningBeat ? MIN_SHORT_DRAMA_OPENING_MS : 1200);
  }

  const minimum = message.isOpeningBeat ? MIN_OPENING_DELAY_MS : MIN_STANDARD_DELAY_MS;
  return Math.round(clamp(delay, minimum, MAX_REVEAL_DELAY_MS));
}

function getBaseMsPerCharacter(role: ChatMessage["role"]): number {
  if (role === "narrator") return 34;
  if (role === "system") return 30;
  if (role === "character") return 28;
  return 24;
}

function countMatches(content: string, pattern: RegExp): number {
  return content.match(pattern)?.length ?? 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
