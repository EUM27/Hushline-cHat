import type { ChatMessage } from "@hushline/shared";

export function isPhoneChannelMessage(message: ChatMessage): boolean {
  if (!message.content.trim()) {
    return false;
  }

  // 1. User messages: standard chat (plain text) is phone
  if (message.role === "user") {
    return message.inputMode === "chat" || !message.inputMode;
  }

  // 2. Character messages: advisor-slot is phone
  if (message.role === "character") {
    return message.speakerKind === "advisor-slot";
  }

  // 3. Narrator messages: only explicitly anonymous phone chat belongs in the phone log.
  if (message.role === "narrator") {
    return Boolean(message.speakerLabel && message.speakerLabel.includes("익명"));
  }

  // 4. System messages: only digital notices belong in the phone log.
  if (message.role === "system") {
    const isDigitalNotice =
      message.speakerLabel === "[안내]" ||
      message.speakerLabel === "[방장]" ||
      message.content.includes("초대") ||
      message.content.includes("입장 확인");
    return isDigitalNotice;
  }

  return false;
}

export function isStageMessage(message: ChatMessage): boolean {
  if (!message.content.trim()) {
    return false;
  }
  return !isPhoneChannelMessage(message);
}

export function getLatestStageMessage(messages: ChatMessage[]): ChatMessage | null {
  return [...messages].reverse().find(isStageMessage) ?? null;
}

export function getStageCharacterId(stageMessage: ChatMessage | null): string | undefined {
  return stageMessage?.role === "character" ? stageMessage.characterId : undefined;
}

export function getStageExpression(
  messages: ChatMessage[],
  stageMessage: ChatMessage | null,
): ChatMessage["expression"] | undefined {
  if (stageMessage?.expression) {
    return stageMessage.expression;
  }

  return [...messages].reverse().find((message) => message.role === "character" && message.expression)?.expression;
}

export function getStageSpeakerLabel(message: ChatMessage | null, fallback: string): string {
  if (!message) return fallback;
  if (message.speakerLabel) return message.speakerLabel;
  if (message.role === "narrator") return "장면";
  if (message.role === "system") return "알림";
  if (message.role === "user") return "나";
  return fallback;
}
