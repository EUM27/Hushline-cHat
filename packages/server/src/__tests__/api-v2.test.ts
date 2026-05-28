import { afterEach, describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { createAppV2 } from "../app-v2";
import { createSqliteStoreV2 } from "../store/sqlite-store-v2";

const scenariosDir = resolve(import.meta.dir, "../../scenarios");

describe("Hushline API v2", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("default scenario directory points at packaged scenario packs", async () => {
    const app = createAppV2({ store: createSqliteStoreV2(":memory:") });

    const response = await app.request("/api/v2/scenarios");
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.scenarios).toContain("school-life-anomaly");
    expect(payload.scenarios).toContain("locked-room-mystery");
  });

  test("lists scenario packs and exposes safe scenario details", async () => {
    const app = createAppV2({ store: createSqliteStoreV2(":memory:"), scenariosDir });

    const listResponse = await app.request("/api/v2/scenarios");
    expect(listResponse.status).toBe(200);
    const listPayload = await listResponse.json();
    expect(listPayload.scenarios).toContain("school-life-anomaly");
    expect(listPayload.scenarios).toContain("locked-room-mystery");

    const detailResponse = await app.request("/api/v2/scenarios/school-life-anomaly");
    expect(detailResponse.status).toBe(200);
    const detailPayload = await detailResponse.json();
    expect(detailPayload.manifest.id).toBe("school-life-anomaly-chat");
    expect(detailPayload.characters.length).toBeGreaterThan(0);
    expect(detailPayload.directorPrompt).toBeUndefined();
    expect(detailPayload.narratorPrompt).toBeUndefined();
  });

  test("exposes scene-first UI metadata for non-chat lodge scenarios", async () => {
    const app = createAppV2({ store: createSqliteStoreV2(":memory:"), scenariosDir });

    const detailResponse = await app.request("/api/v2/scenarios/locked-room-mystery");
    expect(detailResponse.status).toBe(200);
    const detailPayload = await detailResponse.json();
    expect(detailPayload.manifest.uiMode).toBe("scene-first");
    expect(detailPayload.scenarioCard.initialSceneMode).toBe("dialogue");

    const createdResponse = await app.request("/api/v2/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scenarioPackId: "locked-room-mystery",
        persona: { name: "한서윤" },
      }),
    });
    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json();
    expect(created.session.scenario.uiMode).toBe("scene-first");
    expect(created.session.scenario.initialSceneMode).toBe("dialogue");
    expect(created.session.worldState.sceneMode).toBe("dialogue");
  });

  test("keeps v1-compatible session shape after create advance reroll and undo", async () => {
    const app = createAppV2({ store: createSqliteStoreV2(":memory:"), scenariosDir });

    const createdResponse = await app.request("/api/v2/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scenarioPackId: "school-life-anomaly",
        persona: { name: "정해원" },
      }),
    });
    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json();
    expect(created.session.scene.sessionId).toBe(created.session.id);
    expect(created.session.scenario.id).toBe("school-life-anomaly");
    expect(created.session.scenario.title).toBe("학교생활");
    expect(created.session.scenario.subtitle).toBe("이상공간 단톡방");
    expect(created.session.scenario.interventionPrompt).toBe("눈앞에 몇 반 팻말 보여?");
    expect(created.session.worldState.sessionId).toBe(created.session.id);
    expect(created.session.persona.name).toBe("정해원");

    const advancedResponse = await app.request(`/api/v2/sessions/${created.session.id}/advance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "여기 누구 있어?", inputMode: "chat" }),
    });
    expect(advancedResponse.status).toBe(200);
    const advanced = await advancedResponse.json();
    expect(advanced.session.scene.sessionId).toBe(created.session.id);
    expect(advanced.session.scene.turnNumber).toBeGreaterThan(0);
    expect(advanced.turn.messages.some((message: { role: string }) => message.role === "user")).toBe(true);
    expect(advanced.turn.boundaryReport).toEqual({
      corrected: false,
      violations: [],
    });

    const rerollResponse = await app.request(`/api/v2/sessions/${created.session.id}/reroll`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ inputMode: "chat" }),
    });
    expect(rerollResponse.status).toBe(200);
    const rerolled = await rerollResponse.json();
    expect(rerolled.session.scene.sessionId).toBe(created.session.id);
    expect(rerolled.turn.messages.some((message: { role: string }) => message.role === "user")).toBe(true);
    expect(rerolled.turn.boundaryReport).toEqual({
      corrected: false,
      violations: [],
    });

    const undoResponse = await app.request(`/api/v2/sessions/${created.session.id}/undo`, {
      method: "POST",
    });
    expect(undoResponse.status).toBe(200);
    const undone = await undoResponse.json();
    expect(undone.session.scene.sessionId).toBe(created.session.id);
    expect(undone.session.messages.some((message: { role: string }) => message.role === "user")).toBe(false);
  });

  test("advance response includes developer-only state law snapshot", async () => {
    const app = createAppV2({ store: createSqliteStoreV2(":memory:"), scenariosDir });

    const createdResponse = await app.request("/api/v2/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scenarioPackId: "locked-room-mystery",
        persona: { name: "한서윤" },
      }),
    });
    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json();

    const advancedResponse = await app.request(`/api/v2/sessions/${created.session.id}/advance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "지금 나가도 되나요?", inputMode: "chat" }),
    });
    expect(advancedResponse.status).toBe(200);
    const advanced = await advancedResponse.json();

    expect(advanced.turn.stateLaw).toBeDefined();
    expect(advanced.turn.stateLaw.immutableFacts.length).toBeGreaterThan(0);
    expect(advanced.turn.stateLaw.outputRules).toContain("유저 행동/생각/감정 대리 금지");
  });

  test("advance response includes developer-only case runtime metadata", async () => {
    const app = createAppV2({ store: createSqliteStoreV2(":memory:"), scenariosDir });

    const createdResponse = await app.request("/api/v2/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scenarioPackId: "locked-room-mystery",
        persona: { name: "한서윤" },
      }),
    });
    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json();

    const advancedResponse = await app.request(`/api/v2/sessions/${created.session.id}/advance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "누가 마지막으로 테이블 근처에 있었어?", inputMode: "chat" }),
    });
    expect(advancedResponse.status).toBe(200);
    const advanced = await advancedResponse.json();

    expect(advanced.turn.caseRuntime.inquiry.isCaseInquiry).toBe(true);
    expect(["timeline_query", "witness_testimony"]).toContain(advanced.turn.caseRuntime.inquiry.inquiryType);
    expect(advanced.turn.caseRuntime.answerScope.blockedTruthIds).toContain("truth_killer_identity");
  });

  test("can return a flexible multi-message turn when the director asks for narration, characters, and scene state", async () => {
    const app = createAppV2({ store: createSqliteStoreV2(":memory:"), scenariosDir });
    const responses = [
      JSON.stringify({
        speakers: ["advisor-1", "advisor-2"],
        silence: false,
        event: "복도 끝 조명이 한 번 깜빡이고, 대화창의 알림음이 겹친다.",
        narratorInstruction: "사용자의 메시지 직후 복도와 채팅방의 변화를 짧게 묘사한다.",
        characterIntents: {
          "advisor-1": "먼저 본 것을 조심스럽게 말한다.",
          "advisor-2": "다른 각도에서 의심을 제기한다.",
        },
        stateDelta: { tension: 1 },
        subObjectiveUpdate: null,
        relationshipUpdate: null,
        directives: [],
        delay: null,
      }),
      "복도 끝 조명이 한 번 꺼졌다 켜지고, 채팅방에는 짧은 정적이 내려앉는다.",
      "나도 봤어. 방금 창문 쪽에 뭔가 비쳤어.",
      "잠깐, 그게 사람이었다고 단정하면 안 돼.",
    ];

    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: responses.shift() ?? "" } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )) as unknown as typeof fetch;

    const createdResponse = await app.request("/api/v2/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scenarioPackId: "school-life-anomaly",
        persona: { name: "정해원" },
      }),
    });
    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json();

    const advancedResponse = await app.request(`/api/v2/sessions/${created.session.id}/advance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content: "다들 지금 뭐가 보이는지 각자 말해줘",
        inputMode: "chat",
        connections: {
          default: {
            providerId: "openrouter",
            apiKey: "test-key",
            model: "test/model",
          },
        },
      }),
    });

    expect(advancedResponse.status).toBe(200);
    const advanced = await advancedResponse.json();
    const roles = advanced.turn.messages.map((message: { role: string }) => message.role);
    expect(roles).toEqual(["user", "narrator", "character", "character", "system"]);
    expect(advanced.turn.messages.filter((message: { role: string }) => message.role === "character")).toHaveLength(2);
    expect(advanced.turn.messages.find((message: { role: string }) => message.role === "system")?.content).toContain("긴장 +1");
  });

  test("scene-first turns include narration even when the director only selects speakers", async () => {
    const app = createAppV2({ store: createSqliteStoreV2(":memory:"), scenariosDir });
    const responses = [
      JSON.stringify({
        speakers: ["yoon-seha"],
        silence: false,
        event: null,
        narratorInstruction: null,
        characterIntents: {
          "yoon-seha": "문가의 흔적을 보고 차분하지만 방어적으로 반응한다.",
        },
        stateDelta: {},
        subObjectiveUpdate: null,
        relationshipUpdate: null,
        directives: [],
        delay: null,
      }),
      "서재 문 아래의 어두운 틈으로 찬 바람이 얇게 밀려들고, 안쪽 걸쇠 근처에는 희미한 긁힌 자국이 빛난다.",
      "그 정도 흠집은 오래된 산장 문이면 어디에나 있습니다.",
    ];

    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: responses.shift() ?? "" } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )) as unknown as typeof fetch;

    const createdResponse = await app.request("/api/v2/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scenarioPackId: "locked-room-mystery",
        persona: { name: "한서윤" },
      }),
    });
    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json();

    const advancedResponse = await app.request(`/api/v2/sessions/${created.session.id}/advance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content: "문 아래쪽을 확인해볼게.",
        inputMode: "chat",
        connections: {
          default: {
            providerId: "openrouter",
            apiKey: "test-key",
            model: "test/model",
          },
        },
      }),
    });

    expect(advancedResponse.status).toBe(200);
    const advanced = await advancedResponse.json();
    const roles = advanced.turn.messages.map((message: { role: string }) => message.role);
    expect(roles).toEqual(["user", "narrator", "character"]);
    expect(advanced.turn.messages[1].content).toContain("걸쇠");
    expect(advanced.turn.messages[2].content).toContain("흠집");
  });

  test("scene-first turns parse narrator background tags into world state", async () => {
    const app = createAppV2({ store: createSqliteStoreV2(":memory:"), scenariosDir });
    const responses = [
      JSON.stringify({
        speakers: [],
        silence: true,
        event: null,
        narratorInstruction: "서재 사건 현장을 짧게 묘사하고 배경 태그를 붙인다.",
        characterIntents: {},
        messagePlan: [{ kind: "narrator" }],
        stateDelta: {},
        subObjectiveUpdate: null,
        relationshipUpdate: null,
        directives: [],
        delay: null,
      }),
      "[bg:lodge-study-crime-scene]\n서재 안쪽에는 피 냄새와 젖은 목재 냄새가 뒤섞여 있다.",
    ];

    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: responses.shift() ?? "" } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )) as unknown as typeof fetch;

    const createdResponse = await app.request("/api/v2/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scenarioPackId: "locked-room-mystery",
        persona: { name: "한서윤" },
      }),
    });
    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json();

    const advancedResponse = await app.request(`/api/v2/sessions/${created.session.id}/advance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content: "서재 안쪽을 확인합니다.",
        inputMode: "action",
        connections: {
          default: {
            providerId: "openrouter",
            apiKey: "test-key",
            model: "test/model",
          },
        },
      }),
    });

    expect(advancedResponse.status).toBe(200);
    const advanced = await advancedResponse.json();
    expect(advanced.session.worldState.backgroundId).toBe("lodge-study-crime-scene");
    expect(advanced.turn.messages.map((message: { role: string }) => message.role)).toEqual(["user", "narrator"]);
    expect(advanced.turn.messages[1].content).not.toContain("[bg:");
    expect(advanced.turn.messages[1].content).toContain("피 냄새");
  });

  test("can compose a turn with character dialogue before narration when the director plans that rhythm", async () => {
    const app = createAppV2({ store: createSqliteStoreV2(":memory:"), scenariosDir });
    const responses = [
      JSON.stringify({
        speakers: ["kang-mujin"],
        silence: false,
        event: null,
        narratorInstruction: "강무진의 말이 먼저 튀어나온 뒤 복도의 정적을 짧게 잡는다.",
        characterIntents: {
          "kang-mujin": "사망 여부를 거칠게 단정하고 현장 접근을 막는다.",
        },
        messagePlan: [
          { kind: "character", speakerId: "kang-mujin" },
          { kind: "narrator" },
        ],
        stateDelta: {},
        subObjectiveUpdate: null,
        relationshipUpdate: null,
        directives: [],
        delay: null,
      }),
      "강무진의 짧은 말 뒤로 복도에 서 있던 사람들이 반 박자 늦게 숨을 삼킨다.",
      "봐도 모르겠냐. 숨도 안 쉬잖아.",
    ];

    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: responses.shift() ?? "" } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )) as unknown as typeof fetch;

    const createdResponse = await app.request("/api/v2/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scenarioPackId: "locked-room-mystery",
        persona: { name: "한서윤" },
      }),
    });
    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json();

    const advancedResponse = await app.request(`/api/v2/sessions/${created.session.id}/advance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content: "여기 누구 사망고지 가능하신 분 안 계시겠죠.",
        inputMode: "chat",
        connections: {
          default: {
            providerId: "openrouter",
            apiKey: "test-key",
            model: "test/model",
          },
        },
      }),
    });

    expect(advancedResponse.status).toBe(200);
    const advanced = await advancedResponse.json();
    const roles = advanced.turn.messages.map((message: { role: string }) => message.role);
    expect(roles).toEqual(["user", "character", "narrator"]);
    expect(advanced.turn.messages[1].characterId).toBe("kang-mujin");
    expect(advanced.turn.messages[2].role).toBe("narrator");
  });

  test("records the model used when a character message is generated", async () => {
    const app = createAppV2({ store: createSqliteStoreV2(":memory:"), scenariosDir });
    const responses = [
      JSON.stringify({
        speakers: ["advisor-1"],
        silence: false,
        event: null,
        narratorInstruction: null,
        characterIntents: {
          "advisor-1": "현재 상황에 짧게 반응한다.",
        },
        stateDelta: {},
        subObjectiveUpdate: null,
        relationshipUpdate: null,
        directives: [],
        delay: null,
      }),
      "그 모델로 생성된 대사.",
    ];

    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: responses.shift() ?? "" } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )) as unknown as typeof fetch;

    const createdResponse = await app.request("/api/v2/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scenarioPackId: "school-life-anomaly",
        persona: { name: "정해원" },
      }),
    });
    const created = await createdResponse.json();

    const advancedResponse = await app.request(`/api/v2/sessions/${created.session.id}/advance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content: "여기 누구 있어?",
        inputMode: "chat",
        connections: {
          default: {
            providerId: "openrouter",
            apiKey: "director-key",
            model: "director/model",
          },
          "advisor-1": {
            providerId: "openrouter",
            apiKey: "character-key",
            model: "character/model",
          },
        },
      }),
    });

    expect(advancedResponse.status).toBe(200);
    const advanced = await advancedResponse.json();
    const characterMessage = advanced.turn.messages.find((message: { role: string }) => message.role === "character");
    expect(characterMessage.generationSource).toBe("api");
    expect(characterMessage.generationModel).toEqual({
      providerId: "openrouter",
      model: "character/model",
    });
    expect(JSON.stringify(characterMessage)).not.toContain("character-key");
  });

  test("does not let onboarding advisor drafts overwrite named fixed-cast characters", async () => {
    const app = createAppV2({ store: createSqliteStoreV2(":memory:"), scenariosDir });

    const response = await app.request("/api/v2/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scenarioPackId: "locked-room-mystery",
        persona: { name: "한서윤" },
        advisors: [
          {
            id: "advisor-1",
            anonymousLabel: "[익명 22]",
            role: "고정 캐스트를 덮어쓰면 안 되는 임시 조언자",
            systemPrompt: "고정 캐스트 시나리오에는 적용되면 안 된다.",
            mbti: "INTJ",
            ocean: {
              openness: 66,
              conscientiousness: 82,
              extraversion: 24,
              agreeableness: 41,
              neuroticism: 73,
            },
            relationshipTags: ["advisor-slot"],
          },
        ],
      }),
    });

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.session.characters.map((character: { id: string }) => character.id)).toEqual([
      "kang-mujin",
      "yoon-haeon",
      "yoon-seha",
    ]);
    expect(payload.session.characters.every((character: { profileKind: string }) => character.profileKind === "named-actor")).toBe(true);
    expect(payload.session.characters.some((character: { name: string }) => character.name === "[익명 22]")).toBe(false);
  });

  test("turns onboarding advisor drafts into canonical v2 session characters", async () => {
    const app = createAppV2({ store: createSqliteStoreV2(":memory:"), scenariosDir });

    const response = await app.request("/api/v2/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scenarioPackId: "school-life-anomaly",
        persona: { name: "한서윤" },
        advisors: [
          {
            id: "advisor-1",
            anonymousLabel: "[익명 22]",
            role: "문틈의 규칙을 먼저 의심하는 감시자",
            systemPrompt: "너는 [익명 22]다. 대답보다 위험 징후를 먼저 짚는다.",
            mbti: "INTJ",
            ocean: {
              openness: 66,
              conscientiousness: 82,
              extraversion: 24,
              agreeableness: 41,
              neuroticism: 73,
            },
            relationshipTags: ["advisor-slot", "door-rule", "cold-observer"],
            autonomy: 0.88,
            handout: {
              secret: "교실 문틈으로 보이는 복도 숫자가 매번 바뀐다는 것을 알고 있다.",
              desire: "사용자가 첫 번째 오답을 말하기 전에 시야 규칙을 검증하게 만들고 싶다.",
              objective: "사용자가 팻말과 복도 숫자를 동시에 확인하게 만든다.",
              initialRelationshipToUser: -2,
              surfacePersonality: ["차갑다", "관찰이 빠르다"],
              fear: "사용자가 아무 문이나 열어버리는 것",
              behaviorRules: ["확신 없는 위로 금지", "위험 규칙 우선"],
            },
          },
        ],
      }),
    });

    expect(response.status).toBe(201);
    const payload = await response.json();
    const character = payload.session.characters[0];
    expect(character.id).toBe("advisor-1");
    expect(character.name).toBe("[익명 22]");
    expect(character.anonymousLabel).toBe("[익명 22]");
    expect(character.role).toBe("문틈의 규칙을 먼저 의심하는 감시자");
    expect(character.mbti).toBe("INTJ");
    expect(character.ocean.conscientiousness).toBe(82);
    expect(character.systemPrompt).toBe("너는 [익명 22]다. 대답보다 위험 징후를 먼저 짚는다.");
    expect(character.relationshipTags).toContain("door-rule");
    expect(payload.session.handouts["advisor-1"].secret).toBe("교실 문틈으로 보이는 복도 숫자가 매번 바뀐다는 것을 알고 있다.");
    expect(payload.session.handouts["advisor-1"].objective).toBe("사용자가 팻말과 복도 숫자를 동시에 확인하게 만든다.");
    expect(payload.session.handouts["advisor-1"].relationshipToUser).toBe(-2);
    expect(payload.session.handouts["advisor-1"].autonomy).toBe(0.88);
    expect(payload.session.worldState.characterStates["advisor-1"].currentObjective).toBe("사용자가 팻말과 복도 숫자를 동시에 확인하게 만든다.");
    expect(payload.session.scene.relationships["advisor-1"]).toBe(-2);
  });

  test("generates persona and advisor drafts with deterministic fallbacks", async () => {
    const app = createAppV2({ store: createSqliteStoreV2(":memory:"), scenariosDir });

    const personaResponse = await app.request("/api/v2/persona-maker/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt: "규칙을 의심하지만 사람을 쉽게 못 버리는 전학생",
      }),
    });
    expect(personaResponse.status).toBe(200);
    const personaPayload = await personaResponse.json();
    expect(personaPayload.persona.name).toBe("전학생");
    expect(personaPayload.persona.role).toContain("규칙을 의심하지만");
    expect(personaPayload.source).toBe("fallback");

    const advisorResponse = await app.request("/api/v2/advisor-maker/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt: "소리를 무서워해서 채팅 규칙을 먼저 확인하는 익명 조력자",
        count: 2,
      }),
    });
    expect(advisorResponse.status).toBe(200);
    const advisorPayload = await advisorResponse.json();
    expect(advisorPayload.advisors).toHaveLength(2);
    expect(advisorPayload.advisors[0].id).toBe("advisor-1");
    expect(advisorPayload.advisors[0].anonymousLabel).toBe("[익명 1]");
    expect(advisorPayload.advisors[0].role).toContain("소리를 무서워해서");
    expect(advisorPayload.advisors[0].handout.objective).toContain("소리를 무서워해서");
    expect(advisorPayload.source).toBe("fallback");
  });
});
