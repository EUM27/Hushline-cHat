import type { ChatMessage, ClientSessionState, InputMode } from "@hushline/shared";

interface OptimisticMessageOptions {
  id?: string;
  createdAt?: string;
}

export function appendOptimisticUserMessage(
  session: ClientSessionState,
  content: string,
  inputMode: InputMode,
  options: OptimisticMessageOptions = {},
): ClientSessionState {
  const createdAt = options.createdAt ?? new Date().toISOString();
  const message: ChatMessage = {
    id: options.id ?? `optimistic-${crypto.randomUUID()}`,
    sessionId: session.id,
    role: "user",
    content,
    inputMode,
    createdAt,
  };

  return {
    ...session,
    messages: [...session.messages, message],
    updatedAt: createdAt,
  };
}

export interface OptimisticSubmitFailureState {
  session: ClientSessionState;
  revealedMessageCount: number;
  error: string;
  didSubmitLocally: boolean;
}

export function resolveOptimisticSubmitFailure(
  optimisticSession: ClientSessionState,
  reason: unknown,
): OptimisticSubmitFailureState {
  const detail = reason instanceof Error ? reason.message : "응답 실패";

  return {
    session: optimisticSession,
    revealedMessageCount: optimisticSession.messages.length,
    error: `${detail} · 서버 응답은 실패했지만 보낸 말은 화면에 남겼습니다.`,
    didSubmitLocally: true,
  };
}
