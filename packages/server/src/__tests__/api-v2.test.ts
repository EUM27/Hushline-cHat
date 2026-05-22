import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { createAppV2 } from "../app-v2";
import { createSqliteStoreV2 } from "../store/sqlite-store-v2";

const scenariosDir = resolve(import.meta.dir, "../../scenarios");

describe("Hushline API v2", () => {
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

    const rerollResponse = await app.request(`/api/v2/sessions/${created.session.id}/reroll`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ inputMode: "chat" }),
    });
    expect(rerollResponse.status).toBe(200);
    const rerolled = await rerollResponse.json();
    expect(rerolled.session.scene.sessionId).toBe(created.session.id);
    expect(rerolled.turn.messages.some((message: { role: string }) => message.role === "user")).toBe(true);

    const undoResponse = await app.request(`/api/v2/sessions/${created.session.id}/undo`, {
      method: "POST",
    });
    expect(undoResponse.status).toBe(200);
    const undone = await undoResponse.json();
    expect(undone.session.scene.sessionId).toBe(created.session.id);
    expect(undone.session.messages.some((message: { role: string }) => message.role === "user")).toBe(false);
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
      "ha-jinwoo",
      "kwak-sangcheol",
      "seo-yura",
      "shin-jiyeon",
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
