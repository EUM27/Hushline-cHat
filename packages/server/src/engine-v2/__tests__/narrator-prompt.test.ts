import { afterEach, describe, expect, test } from "bun:test";
import type { ModelConnection, PublicContext, ScenarioPack, SessionStateV2 } from "@hushline/shared";
import { buildNarratorPersonaBrief } from "../context-builder";
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
    expect(capturedSystemPrompt).toContain("[Perception Boundary — HARD]");
    expect(capturedSystemPrompt).toContain("Do not treat undelivered information as shared knowledge.");
    expect(capturedSystemPrompt).toContain("Do not narrate the user's emotional conclusions.");
    expect(capturedSystemPrompt).toContain("Advance the story through external events");
    expect(capturedUserPayload).toContain("{{user}}: 무진 씨, 지금 나가도 되나요?");
    expect(capturedUserPayload).not.toContain("유저: 무진 씨");
  });

  test("uses only observable persona fields for narration", async () => {
    let capturedSystemPrompt = "";
    globalThis.fetch = (async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        messages?: Array<{ role: string; content: string }>;
      };
      capturedSystemPrompt = body.messages?.find((message) => message.role === "system")?.content ?? "";
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "젖은 운동화가 현관 바닥에 작은 물자국을 남긴다." } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;
    const persona: SessionStateV2["persona"] = {
      id: "user",
      name: "정해윤",
      shortName: "해윤",
      role: "공유주택에 막 들어온 새 입주자",
      description: "속으로는 의심을 거두지 못한다.",
      appearance: "비에 젖은 회색 후드와 낡은 운동화를 신고 있다.",
    };

    await invokeNarrator(
      "입주자가 현관에 들어선 직후의 공간 반응을 잡는다.",
      "action",
      publicContext(),
      "현관에 멈춰 서서 주변을 훑어본다.",
      pack(),
      connection(),
      buildNarratorPersonaBrief(persona, false),
    );

    expect(capturedSystemPrompt).toContain("[상대 인물 관찰 정보]");
    expect(capturedSystemPrompt).toContain("표시: 상대 인물");
    expect(capturedSystemPrompt).toContain("관찰 가능한 외형: 비에 젖은 회색 후드와 낡은 운동화를 신고 있다.");
    expect(capturedSystemPrompt).toContain("공개 역할: 공유주택에 막 들어온 새 입주자");
    expect(capturedSystemPrompt).not.toContain("정해윤");
    expect(capturedSystemPrompt).not.toContain("속으로는 의심");
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
