import type { ChatMessage, SessionState, SessionStateV2 } from "@hushline/shared";
import { createInitialSessionState, type CreateSessionOptions } from "../engine/turn-engine";
import type { SessionStore } from "./sqlite-store";
import type { SessionStoreV2 } from "./sqlite-store-v2";

export function createMemoryStore(): SessionStore {
  const sessions = new Map<string, SessionState>();

  return {
    createSession(options?: CreateSessionOptions): SessionState {
      const session = createInitialSessionState(crypto.randomUUID(), options);
      sessions.set(session.id, session);
      return session;
    },

    getSession(id: string): SessionState | null {
      return sessions.get(id) ?? null;
    },

    saveSession(session: SessionState): void {
      sessions.set(session.id, session);
    },

    appendMessage(sessionId: string, message: ChatMessage): SessionState | null {
      const session = sessions.get(sessionId);
      if (!session) {
        return null;
      }

      const nextSession = {
        ...session,
        messages: [...session.messages, message],
        updatedAt: new Date().toISOString(),
      };
      sessions.set(sessionId, nextSession);
      return nextSession;
    },
  };
}

export function createMemoryStoreV2(): SessionStoreV2 {
  const sessions = new Map<string, SessionStateV2>();

  return {
    getSession(id: string): SessionStateV2 | null {
      return sessions.get(id) ?? null;
    },

    saveSession(session: SessionStateV2): void {
      sessions.set(session.id, session);
    },

    deleteSession(id: string): void {
      sessions.delete(id);
    },
  };
}
