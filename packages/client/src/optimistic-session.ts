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
