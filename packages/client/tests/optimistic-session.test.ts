import { describe, expect, test } from "bun:test";
import type { ClientSessionState } from "@hushline/shared";
import {
  appendOptimisticUserMessage,
  resolveOptimisticSubmitFailure,
} from "../src/optimistic-session";

describe("appendOptimisticUserMessage", () => {
  test("appends a local user message without mutating the existing session", () => {
    const session = {
      id: "session-1",
      messages: [
        {
          id: "existing-message",
          sessionId: "session-1",
          role: "narrator",
          content: "복도에 정적이 내려앉는다.",
          createdAt: "2026-05-25T00:00:00.000Z",
        },
      ],
    } as ClientSessionState;

    const next = appendOptimisticUserMessage(session, "아무도 들어가지 마세요.", "chat", {
      id: "optimistic-message",
      createdAt: "2026-05-25T00:00:01.000Z",
    });

    expect(next).not.toBe(session);
    expect(session.messages).toHaveLength(1);
    expect(next.messages).toHaveLength(2);
    expect(next.messages.at(-1)).toEqual({
      id: "optimistic-message",
      sessionId: "session-1",
      role: "user",
      content: "아무도 들어가지 마세요.",
      inputMode: "chat",
      createdAt: "2026-05-25T00:00:01.000Z",
    });
  });
});

describe("resolveOptimisticSubmitFailure", () => {
  test("keeps the optimistic user message visible when the server send fails", () => {
    const optimisticSession = {
      id: "session-1",
      messages: [
        {
          id: "existing-message",
          sessionId: "session-1",
          role: "narrator",
          content: "복도에 정적이 내려앉는다.",
          createdAt: "2026-05-25T00:00:00.000Z",
        },
        {
          id: "optimistic-message",
          sessionId: "session-1",
          role: "user",
          content: "내 말 보여?",
          inputMode: "chat",
          createdAt: "2026-05-25T00:00:01.000Z",
        },
      ],
    } as ClientSessionState;

    const state = resolveOptimisticSubmitFailure(optimisticSession, new Error("Failed to fetch"));

    expect(state.session).toBe(optimisticSession);
    expect(state.revealedMessageCount).toBe(2);
    expect(state.didSubmitLocally).toBe(true);
    expect(state.error).toContain("Failed to fetch");
    expect(state.error).toContain("화면에 남겼습니다");
  });
});
