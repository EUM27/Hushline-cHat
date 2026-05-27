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

export function shouldStreamMessageContent(
  message: Pick<ChatMessage, "content" | "role">,
): boolean {
  return message.role !== "user" && message.content.trim().length > 0 && !looksLikeRichHtml(message.content);
}

export function calculateStreamTickDelay(
  message: Pick<ChatMessage, "role" | "isOpeningBeat">,
  visibleCharacters?: number,
): number {
  const base = message.role === "narrator"
    ? 38
    : message.role === "character"
      ? 30
      : 34;
  const normalizedBase = message.isOpeningBeat ? Math.round(base * 1.08) : base;
  if (hasContent(message) && visibleCharacters !== undefined && shouldPauseAfterImpactCharacter(message.content, visibleCharacters)) {
    return normalizedBase + 170;
  }
  return normalizedBase;
}

export function calculateStreamStepSize(
  message: Pick<ChatMessage, "content" | "role">,
  visibleCharacters = 0,
): number {
  const length = countStreamCharacters(message.content);
  if (isInsideImpactSoundEffect(message.content, visibleCharacters)) {
    return 1;
  }
  if (message.role === "character" && length < 24) {
    return 1;
  }
  if (length >= 120) {
    return 3;
  }
  if (length >= 64) {
    return 2;
  }
  return 1;
}

export function countStreamCharacters(content: string): number {
  return [...content].length;
}

export function sliceStreamedText(content: string, visibleCharacters: number): string {
  return [...content].slice(0, visibleCharacters).join("");
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

function hasContent(message: Pick<ChatMessage, "role">): message is Pick<ChatMessage, "role"> & { content: string } {
  return typeof (message as { content?: unknown }).content === "string";
}

function isInsideImpactSoundEffect(content: string, visibleCharacters: number): boolean {
  return getImpactSoundEffectRanges(content).some(
    ([start, end]) => visibleCharacters >= start && visibleCharacters < end,
  );
}

function shouldPauseAfterImpactCharacter(content: string, visibleCharacters: number): boolean {
  if (visibleCharacters <= 0) {
    return false;
  }
  const previousIndex = visibleCharacters - 1;
  return getImpactSoundEffectRanges(content).some(
    ([start, end]) => previousIndex >= start && previousIndex < end,
  );
}

function getImpactSoundEffectRanges(content: string): Array<[number, number]> {
  const characters = [...content];
  const ranges: Array<[number, number]> = [];
  for (let index = 0; index < characters.length; index += 1) {
    const syllable = characters[index];
    const punctuation = characters[index + 1];
    if (syllable && /[가-힣]/.test(syllable) && /[!！]/.test(punctuation ?? "")) {
      ranges.push([index, index + 2]);
      index += 1;
    }
  }
  return ranges;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function looksLikeRichHtml(content: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(content);
}
