import { describe, expect, test } from "bun:test";
import app from "../vercel-app";

describe("Vercel API app", () => {
  test("serves boot data routes without the Bun SQLite store", async () => {
    const [assetsResponse, providersResponse, scenariosResponse] = await Promise.all([
      app.request("/api/assets"),
      app.request("/api/provider-profiles"),
      app.request("/api/v2/scenarios"),
    ]);

    expect(assetsResponse.status).toBe(200);
    expect(providersResponse.status).toBe(200);
    expect(scenariosResponse.status).toBe(200);

    const scenarios = await scenariosResponse.json();
    expect(scenarios.scenarios).toContain("school-life-anomaly");
  });

  test("can create and advance a v2 session through the serverless entrypoint", async () => {
    const createResponse = await app.request("/api/v2/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scenarioPackId: "school-life-anomaly",
        persona: { name: "테스터" },
        connections: {},
      }),
    });

    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();

    const advanceResponse = await app.request(`/api/v2/sessions/${created.session.id}/advance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content: "전송 확인",
        inputMode: "chat",
        connections: {},
      }),
    });

    expect(advanceResponse.status).toBe(200);
    const advanced = await advanceResponse.json();
    expect(advanced.session.messages.some((message: { content: string }) => message.content === "전송 확인")).toBe(true);
  });
});
