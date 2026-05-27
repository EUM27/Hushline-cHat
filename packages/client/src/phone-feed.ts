import type { ChatMessage, ClientSessionState } from "@hushline/shared";
import { isPhoneChannelMessage } from "./utils/ui-helpers";

export interface PhoneMessage {
  id: string;
  sender: string;
  text: string;
  time: string;
  side: "inbound" | "outbound" | "system";
}

const maxPhoneChannelMessages = 500;
const maxWorldEventMessages = 4;

export function buildPhoneMessages(
  session: ClientSessionState,
  visibleMessages: ChatMessage[],
): PhoneMessage[] {
  const worldState = session.worldState;
  const locationId = worldState?.locationId ?? session.scene.locationId;
  const tension = worldState?.tension ?? session.scene.tension;
  const danger = worldState?.danger ?? session.scene.danger;
  const turnNumber = worldState?.turnNumber ?? session.scene.turnNumber;

  const syncMessage: PhoneMessage = {
    id: `scene-sync-${turnNumber}`,
    sender: "System",
    text: `현재 위치 ${locationId}. 긴장 ${tension}, 위험 ${danger}.`,
    time: formatTurnLabel(turnNumber),
    side: "system",
  };

  const phoneChannelMessages = visibleMessages
    .filter(isPhoneChannelMessage)
    .slice(-maxPhoneChannelMessages)
    .map((message) => toPhoneMessage(session, message));

  const worldEventMessages = (worldState?.recentEvents ?? [])
    .slice(-maxWorldEventMessages)
    .map((event): PhoneMessage => ({
      id: `event-${event.id}`,
      sender: "단서",
      text: event.description,
      time: formatTurnLabel(event.turnNumber),
      side: "system",
    }));

  return [syncMessage, ...phoneChannelMessages, ...worldEventMessages];
}

function toPhoneMessage(session: ClientSessionState, message: ChatMessage): PhoneMessage {
  const side: PhoneMessage["side"] =
    message.role === "user" ? "outbound" : message.role === "system" ? "system" : "inbound";

  return {
    id: `phone-${message.id}`,
    sender: getPhoneSender(session, message),
    text: message.content,
    time: formatMessageTime(message.createdAt),
    side,
  };
}

function getPhoneSender(session: ClientSessionState, message: ChatMessage): string {
  if (message.role === "user") {
    return session.persona.shortName || session.persona.name || "Me";
  }

  if (message.role === "system") {
    return message.speakerLabel ?? "System";
  }

  const character = message.characterId
    ? session.characters.find((candidate) => candidate.id === message.characterId)
    : undefined;
  return message.speakerLabel ?? character?.anonymousLabel ?? character?.shortName ?? character?.name ?? "Observer";
}

function formatMessageTime(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTurnLabel(turnNumber: number | undefined): string {
  if (typeof turnNumber !== "number") {
    return "";
  }
  return `T${turnNumber}`;
}
