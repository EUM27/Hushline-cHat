import { describe, expect, test } from "bun:test";
import { createInitialSessionState, runDryTurn, runTurn } from "../turn-engine";
import { parseModelJson } from "../json";
import { defaultScenarioCard } from "../scenarios";

describe("Hushline dry-run turn engine", () => {
  test("loads the fixed ScenarioCard with normalized user macro and opening beats", () => {
    const state = createInitialSessionState("test-session");

    expect(state.scenario.id).toBe("school-life-anomaly-chat");
    expect(defaultScenarioCard.description).toContain("{{유저}}");
    expect(defaultScenarioCard.description).not.toContain("{{user}}");
    expect(state.persona.id).toBe("user");
    expect(state.persona.name).toBe("{{유저}}");
    expect(state.persona.relationshipTags).toContain("scenario-participant");
    expect(state.characters.map((character) => character.id)).not.toContain("user");
    expect(state.characters.every((character) => character.profileKind === "advisor-slot")).toBe(
      true,
    );
    expect(state.messages.length).toBeGreaterThan(4);
    expect(state.messages.map((message) => message.speakerKind)).toContain("room-master");
    expect(state.messages.map((message) => message.speakerKind)).toContain("scenario-crowd");
  });

  test("lets the user answer the opening prompt without routing to a named cast or fixed scene id", async () => {
    const state = createInitialSessionState("test-session");

    const result = await runDryTurn(state, "2반 팻말 보여. 뒤에서 소리도 나.");

    expect(result.messages.map((message) => message.role)).toEqual([
      "user",
      "narrator",
      "character",
    ]);
    expect(result.messages[1]?.speakerKind).toBe("scenario-crowd");
    expect(result.messages[2]?.speakerKind).toBe("advisor-slot");
    expect(result.messages[2]?.speakerLabel).toMatch(/^\[익명 \d+\]$/);
    expect(result.scene.locationId).toBe("old-school-hallway");
    expect(result.scene.backgroundId).toBe("school-hallway");
    expect(result.scene.tension).toBeGreaterThan(state.scene.tension);
  });

  test("prevents one advisor from monopolizing consecutive unmentioned turns", async () => {
    let state = createInitialSessionState("test-session");
    state = (await runDryTurn(state, "2반이 보여.")).state;

    const result = await runDryTurn(state, "다른 사람은 어떻게 생각해?");

    expect(result.scene.activeSpeakerId).not.toBe(state.scene.recentSpeakerIds[0]);
    expect(result.messages.at(-1)?.characterId).not.toBe(state.scene.recentSpeakerIds[0]);
  });

  test("limits follow-up chains to one optional character response", async () => {
    const state = createInitialSessionState("test-session");

    const result = await runDryTurn(state, "갑자기 정전됐어. 다들 반응해봐.");

    const characterMessages = result.messages.filter((message) => message.role === "character");
    expect(characterMessages.length).toBeLessThanOrEqual(2);
  });

  test("can route a character through an OpenRouter connection", async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; init: RequestInit }> = [];
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "외부 모델 응답" } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;

    try {
      const state = createInitialSessionState("test-session");
      const result = await runTurn(state, "[익명 1] 대답해봐", {
        connections: {
          "advisor-1": {
            providerId: "openrouter",
            apiKey: "test-key",
            model: "openai/gpt-5.1",
          },
        },
      });

      expect(calls[0]?.url).toBe("https://openrouter.ai/api/v1/chat/completions");
      expect(calls[0]?.init?.headers).toMatchObject({
        authorization: "Bearer test-key",
      });
      expect(result.messages.at(-1)?.content).toBe("외부 모델 응답");
      expect(result.messages.at(-1)?.generationSource).toBe("api");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("uses the default connection when the routed character has no dedicated connection", async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; init: RequestInit }> = [];
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "기본 연결 API 응답" } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;

    try {
      const state = createInitialSessionState("test-session");
      const result = await runTurn(
        {
          ...state,
          scene: {
            ...state.scene,
            recentSpeakerIds: ["advisor-1"],
          },
        },
        "다른 사람은 어떻게 생각해?",
        {
          connections: {
            default: {
              providerId: "nanogpt",
              apiKey: "test-key",
              model: "xiaomi/mimo-v2.5-pro",
            },
          },
        },
      );

      expect(result.messages.at(-1)?.characterId).toBe("advisor-2");
      expect(calls[0]?.url).toBe("https://nano-gpt.com/api/v1/chat/completions");
      expect(result.messages.at(-1)?.content).toBe("기본 연결 API 응답");
      expect(result.messages.at(-1)?.generationSource).toBe("api");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("sends other characters as labeled context instead of the active actor assistant", async () => {
    const originalFetch = globalThis.fetch;
    const requestBodies: Array<{
      messages: Array<{ role: string; content: string }>;
    }> = [];

    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      requestBodies.push(JSON.parse(String(init?.body ?? "{}")));
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "도윤 전용 응답" } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;

    try {
      const state = createInitialSessionState("test-session");
      const result = await runTurn(
        {
          ...state,
          scene: {
            ...state.scene,
            hasEnteredScene: true,
            locationId: "old-school-hallway",
            backgroundId: "school-hallway",
            recentSpeakerIds: ["advisor-1"],
          },
          messages: [
            {
              id: "u1",
              sessionId: state.id,
              role: "user",
              content: "여기 어디야?",
              createdAt: new Date().toISOString(),
            },
            {
              id: "e1",
              sessionId: state.id,
              role: "character",
              characterId: "advisor-1",
              speakerKind: "advisor-slot",
              speakerLabel: "[익명 1]",
              content: "가만히 있어. 먼저 확인한다.",
              createdAt: new Date().toISOString(),
              expression: "thinking",
              generationSource: "dry-run",
            },
          ],
        },
        "[익명 9] 너도 뭔가 알아?",
        {
          connections: {
            default: {
              providerId: "openrouter",
              apiKey: "test-key",
              model: "openai/gpt-5.1",
            },
          },
        },
      );

      expect(result.messages.at(-1)?.characterId).toBe("advisor-2");
      // requestBodies[0] may be narrator (default connection), character is [1] or last
      const characterRequest = requestBodies.find((body) =>
        body.messages[0]?.content?.includes("너는 [익명 9]로 보이는 조언자다"),
      );
      expect(characterRequest).toBeTruthy();
      expect(characterRequest?.messages[0]?.role).toBe("system");
      expect(characterRequest?.messages[0]?.content).toContain("이전 맥락 없음");
      expect(characterRequest?.messages).toContainEqual({
        role: "user",
        content: "[익명 1]: 가만히 있어. 먼저 확인한다.",
      });
      expect(
        characterRequest?.messages.some(
          (message) =>
            message.role === "assistant" && message.content.includes("가만히 있어"),
        ),
      ).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("model JSON parser", () => {
  test("recovers JSON from fenced or broken model output", () => {
    const parsed = parseModelJson(
      "```json\n{\"primarySpeakerId\":\"advisor-1\",\"needsFollowUp\":true}\n```\n뒤에 쓸데없는 말",
      { primarySpeakerId: "narrator", needsFollowUp: false },
    );

    expect(parsed.primarySpeakerId).toBe("advisor-1");
    expect(parsed.needsFollowUp).toBe(true);
  });
});
