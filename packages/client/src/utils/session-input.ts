import type { ClientSessionState, InputMode } from "@hushline/shared";
import { enterToSendStorageKey } from "../constants/theme-presets";

export function loadEnterToSend(): boolean {
  try {
    const raw = localStorage.getItem(enterToSendStorageKey);
    return raw === null ? true : raw === "1";
  } catch {
    return true;
  }
}

export async function parseOpenAiOAuthJson<T extends { ok?: boolean; error?: string }>(response: Response): Promise<T> {
  const bodyText = await response.text();
  if (!bodyText.trim()) {
    throw new Error(`OpenAI OAuth 응답이 비어 있습니다: ${response.status}`);
  }
  let payload: T;
  try {
    payload = JSON.parse(bodyText) as T;
  } catch {
    throw new Error(`OpenAI OAuth 응답 JSON 파싱 실패: ${response.status}`);
  }
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error ?? `OpenAI OAuth 요청 실패: ${response.status}`);
  }
  return payload;
}

const CLIENT_ACTION_PATTERNS = [
  /^\*[^*]+\*$/, // *행동*
  /^\/\//, // //행동
  /^\/me\s/i, // /me 행동
];

const CLIENT_WHISPER_PATTERNS = [
  /^\(+[^)]+\)+$/, // (혼잣말) 또는 ((혼잣말))
  /^\[혼잣말\]/,
  /^\[독백\]/,
  /^\[내면\]/,
];

export function detectInputModeFromText(text: string): InputMode | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (CLIENT_ACTION_PATTERNS.some((p) => p.test(trimmed))) return "action";
  if (CLIENT_WHISPER_PATTERNS.some((p) => p.test(trimmed))) return "whisper";
  // 일반 텍스트는 null — 현재 토글 상태 유지
  return null;
}

export function hasUserMessages(session: ClientSessionState | null): boolean {
  if (!session) return false;
  return session.messages.some((m) => m.role === "user" && !m.isOpeningBeat);
}
