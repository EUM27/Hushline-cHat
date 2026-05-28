import { afterEach, describe, expect, test } from "bun:test";
import type { ModelConnection, PublicContext, ScenarioPack } from "@hushline/shared";
import { invokeNarrator } from "../narrator";

describe("narrator prompt boundaries", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("keeps narrator instructions separate from character dialogue authority", async () => {
    let capturedSystemPrompt = "";
    let capturedUserPayload = "";
    globalThis.fetch = (async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        messages?: Array<{ role: string; content: string }>;
      };
      capturedSystemPrompt = body.messages?.find((message) => message.role === "system")?.content ?? "";
      capturedUserPayload = body.messages?.find((message) => message.role === "user")?.content ?? "";
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "샹들리에의 빛이 젖은 바닥 위에서 흔들린다." } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;

    await invokeNarrator(
      "강무진의 반응 전에 복도의 압력을 짧게 잡는다.",
      "chat",
      publicContext(),
      "무진 씨, 지금 나가도 되나요?",
      pack(),
      connection(),
    );

    expect(capturedSystemPrompt).toContain("[Narration Contract]");
    expect(capturedSystemPrompt).toContain("나레이터는 대사를 쓰지 않는다");
    expect(capturedSystemPrompt).toContain("캐릭터의 목소리, 말투, 문장 결정을 대신하지 않는다");
    expect(capturedSystemPrompt).toContain("따옴표 대사와 '말했다/중얼거렸다/대답했다' 발화문을 쓰지 않는다");
    expect(capturedUserPayload).toContain("{{user}}: 무진 씨, 지금 나가도 되나요?");
    expect(capturedUserPayload).not.toContain("유저: 무진 씨");
  });
});

function connection(): ModelConnection {
  return {
    providerId: "openrouter",
    apiKey: "test-key",
    model: "test/model",
    baseUrl: "https://example.test/api/v1",
  };
}

function publicContext(): PublicContext {
  return {
    scenarioTitle: "설산 산장 살인사건",
    scenarioSubtitle: "폭설 속 산장",
    sceneMode: "dialogue",
    currentLocation: "산장 로비",
    currentBackground: "lodge-foyer",
    tension: 6,
    danger: 3,
    turnNumber: 2,
    publicChatLog: [
      { role: "character", label: "강무진", content: "아무도 문 근처에 가지 마." },
    ],
    publicEvents: ["폭설로 산장 통신이 끊겼다."],
    mainObjectiveDescription: "범인을 찾는다.",
  };
}

function pack(): ScenarioPack {
  return {
    manifest: {
      id: "locked-room-mystery",
      title: "설산 산장 살인사건",
      subtitle: "폭설 속 산장",
      genre: "mystery",
      version: "1.0.0",
      engineVersion: ">=2.0.0",
      uiMode: "scene-first",
    },
    scenarioCard: {
      id: "locked-room-mystery-card",
      title: "설산 산장 살인사건",
      subtitle: "폭설 속 산장",
      description: "",
      spaceRules: ["공개적으로 보이는 변화만 확정한다."],
      chatRules: [],
      toneRules: ["짧고 긴장감 있게 쓴다."],
      hardNos: [],
      backgroundIds: ["lodge-foyer"],
      initialLocationId: "lodge-foyer",
      initialBackgroundId: "lodge-foyer",
      initialSceneMode: "dialogue",
      interventionPrompt: "",
      openingBeats: [],
    },
    characters: [],
    directorPrompt: "",
    narratorPrompt: "",
    mainObjective: {
      id: "solve",
      description: "범인을 찾는다.",
    },
    eventTriggers: [],
  };
}
