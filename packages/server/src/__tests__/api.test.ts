import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../app";
import { createSqliteStore } from "../store/sqlite-store";

function makeJwt(claims: Record<string, unknown>) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode(claims)}.`;
}

describe("Hushline API", () => {
  const originalFetch = globalThis.fetch;
  const originalAuthFile = process.env.HUSHLINE_OPENAI_OAUTH_AUTH_FILE;
  const originalBrokerUrl = process.env.HUSHLINE_OPENAI_OAUTH_BROKER_URL;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalAuthFile === undefined) {
      delete process.env.HUSHLINE_OPENAI_OAUTH_AUTH_FILE;
    } else {
      process.env.HUSHLINE_OPENAI_OAUTH_AUTH_FILE = originalAuthFile;
    }
    if (originalBrokerUrl === undefined) {
      delete process.env.HUSHLINE_OPENAI_OAUTH_BROKER_URL;
    } else {
      process.env.HUSHLINE_OPENAI_OAUTH_BROKER_URL = originalBrokerUrl;
    }
  });

  test("creates a scenario session with opening beats and advances one dry-run turn", async () => {
    const store = createSqliteStore(":memory:");
    const app = createApp({ store });

    const createdResponse = await app.request("/api/sessions", { method: "POST" });
    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json();
    const sessionId = created.session.id;
    expect(created.session.scenario.id).toBe("school-life-anomaly-chat");
    expect(created.session.messages.length).toBeGreaterThan(4);
    expect(created.session.characters.every((character: { profileKind: string }) => character.profileKind === "advisor-slot")).toBe(true);
    expect(created.session.messages.some((message: { speakerLabel?: string }) => message.speakerLabel === "[현실]")).toBe(false);

    const advancedResponse = await app.request(`/api/sessions/${sessionId}/advance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "2반 팻말 보여." }),
    });

    expect(advancedResponse.status).toBe(200);
    const advanced = await advancedResponse.json();
    expect(advanced.turn.messages).toHaveLength(3);
    expect(advanced.session.scene.activeSpeakerId).not.toBe("evan");
    expect(advanced.session.scene.locationId).toBe("old-school-hallway");
    expect(advanced.session.messages.length).toBeGreaterThan(created.session.messages.length);
    expect(advanced.turn.messages.at(-1).generationSource).toBe("dry-run");
  });

  test("creates sessions with generated anonymous advisor slots", async () => {
    const store = createSqliteStore(":memory:");
    const app = createApp({ store });

    const createdResponse = await app.request("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        persona: { name: "정해원" },
        advisors: [
          {
            id: "advisor-1",
            anonymousLabel: "[익명 1]",
            role: "위험 규칙을 먼저 말하는 생존 조언자",
            systemPrompt:
              "너는 [익명 1]로 보이는 조언자다. 짧고 거칠게 경고하지만 사용자를 버리지 않는다.",
            mbti: "ISTP",
            ocean: {
              openness: 52,
              conscientiousness: 74,
              extraversion: 38,
              agreeableness: 47,
              neuroticism: 62,
            },
            relationshipTags: ["advisor-slot", "rough-warning"],
          },
          {
            id: "advisor-2",
            anonymousLabel: "[익명 9]",
            role: "주변 단서를 조심스럽게 줍는 익명 관찰자",
            systemPrompt:
              "너는 [익명 9]로 보이는 조언자다. 겁먹었지만 관찰력이 좋고, 확신 없는 말은 조심스럽게 꺼낸다.",
            mbti: "INFJ",
            ocean: {
              openness: 70,
              conscientiousness: 64,
              extraversion: 30,
              agreeableness: 72,
              neuroticism: 78,
            },
            relationshipTags: ["advisor-slot", "nervous-observer"],
          },
        ],
      }),
    });

    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json();
    expect(created.session.persona.name).toBe("정해원");
    expect(created.session.characters).toHaveLength(2);
    expect(created.session.characters.map((character: { anonymousLabel: string }) => character.anonymousLabel)).toEqual([
      "[익명 1]",
      "[익명 9]",
    ]);
    expect(created.session.characters[0].systemPrompt).toContain("사용자를 버리지 않는다");
  });

  test("returns the visual asset manifest", async () => {
    const store = createSqliteStore(":memory:");
    const app = createApp({ store });

    const response = await app.request("/api/assets");

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.backgrounds.some((asset: { id: string }) => asset.id === "school-exterior")).toBe(
      true,
    );
    expect(payload.backgrounds.some((asset: { id: string }) => asset.id === "lodge-foyer")).toBe(
      true,
    );
    expect(payload.sprites.some((asset: { characterId: string }) => asset.characterId === "evan")).toBe(
      false,
    );
    expect(payload.sprites.some((asset: { characterId: string }) => asset.characterId === "kang-mujin")).toBe(
      true,
    );
    expect(payload.sprites.some((asset: { characterId: string }) => asset.characterId === "yoon-haeon")).toBe(
      true,
    );
    expect(payload.sprites.some((asset: { characterId: string }) => asset.characterId === "yoon-seha")).toBe(
      true,
    );
  });

  test("exposes NanoGPT, OpenRouter, and ChatGPT OAuth model connection profiles", async () => {
    const store = createSqliteStore(":memory:");
    const app = createApp({ store });

    const response = await app.request("/api/provider-profiles");

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.profiles.map((profile: { id: string }) => profile.id)).toEqual([
      "nanogpt",
      "openrouter",
      "chatgpt",
    ]);
  });

  test("loads ChatGPT OAuth models without an API key after browser login", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "hushline-openai-oauth-"));
    process.env.HUSHLINE_OPENAI_OAUTH_AUTH_FILE = join(tempDir, "auth.json");
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const idToken = makeJwt({
      email: "tester@example.com",
      "https://api.openai.com/auth": {
        chatgpt_account_id: "acct_123",
        chatgpt_plan_type: "plus",
      },
    });
    const accessToken = makeJwt({ exp: futureExp });
    writeFileSync(
      process.env.HUSHLINE_OPENAI_OAUTH_AUTH_FILE,
      JSON.stringify({ tokens: { id_token: idToken, access_token: accessToken, refresh_token: "refresh" } }),
      "utf8",
    );

    const app = createApp({ store: createSqliteStore(":memory:") });
    const requested: Array<{ url: string; accountId: string | null; authorization: string | null }> = [];
    globalThis.fetch = (async (input, init) => {
      const headers = new Headers(init?.headers);
      requested.push({
        url: String(input),
        accountId: headers.get("chatgpt-account-id"),
        authorization: headers.get("authorization"),
      });
      return new Response(
        JSON.stringify({
          models: [{ slug: "gpt-5.4" }, { slug: "gpt-5.4-thinking" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;

    const response = await app.request("/api/provider-profiles/chatgpt/models", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.models).toEqual([
      { id: "gpt-5.4", label: "gpt-5.4" },
      { id: "gpt-5.4-thinking", label: "gpt-5.4-thinking" },
    ]);
    expect(requested).toHaveLength(1);
    expect(requested[0]?.url).toContain("https://chatgpt.com/backend-api/codex/models");
    expect(requested[0]?.accountId).toBe("acct_123");
    expect(requested[0]?.authorization).toBe(`Bearer ${accessToken}`);
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("delegates ChatGPT OAuth login and models to an existing local broker", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "hushline-openai-oauth-empty-"));
    process.env.HUSHLINE_OPENAI_OAUTH_AUTH_FILE = join(tempDir, "auth.json");
    process.env.HUSHLINE_OPENAI_OAUTH_BROKER_URL = "http://localhost:1455";
    const app = createApp({ store: createSqliteStore(":memory:") });
    const requested: Array<{ url: string; method: string }> = [];

    globalThis.fetch = (async (input, init) => {
      const url = String(input);
      requested.push({ url, method: init?.method ?? "GET" });
      if (url.endsWith("/api/openai-oauth/account")) {
        return new Response(
          JSON.stringify({ ok: true, account: { connected: true, email: "tester@example.com" } }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.endsWith("/api/openai-oauth/login/start")) {
        return new Response(
          JSON.stringify({
            ok: true,
            authorizeUrl: "https://auth.openai.com/oauth/authorize?redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.endsWith("/api/openai-oauth/models")) {
        return new Response(
          JSON.stringify({
            ok: true,
            data: [
              { id: "gpt-5.4", name: "gpt-5.4" },
              { id: "gpt-5.4-thinking", name: "gpt-5.4-thinking" },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("unexpected", { status: 500 });
    }) as typeof fetch;

    const loginResponse = await app.request("/api/openai-oauth/login/start", { method: "POST" });
    expect(loginResponse.status).toBe(200);
    const loginPayload = await loginResponse.json();
    expect(loginPayload.authorizeUrl).toContain("localhost%3A1455%2Fauth%2Fcallback");

    const modelsResponse = await app.request("/api/provider-profiles/chatgpt/models", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(modelsResponse.status).toBe(200);
    const modelsPayload = await modelsResponse.json();
    expect(modelsPayload.models).toEqual([
      { id: "gpt-5.4", label: "gpt-5.4" },
      { id: "gpt-5.4-thinking", label: "gpt-5.4-thinking" },
    ]);
    expect(requested.map((request) => request.url)).toEqual([
      "http://localhost:1455/api/openai-oauth/account",
      "http://localhost:1455/api/openai-oauth/login/start",
      "http://localhost:1455/api/openai-oauth/account",
      "http://localhost:1455/api/openai-oauth/models",
    ]);
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("loads model options through the selected provider adapter", async () => {
    const store = createSqliteStore(":memory:");
    const app = createApp({ store });
    const requestedUrls: string[] = [];

    globalThis.fetch = (async (input) => {
      requestedUrls.push(String(input));
      return new Response(
        JSON.stringify({
          data: [
            { id: "zeta/model", name: "Zeta Model" },
            { id: "alpha/model", name: "Alpha Model" },
          ],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }) as typeof fetch;

    const response = await app.request("/api/provider-profiles/openrouter/models", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ apiKey: "test-key" }),
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(requestedUrls).toEqual(["https://openrouter.ai/api/v1/models"]);
    expect(payload.models).toEqual([
      { id: "alpha/model", label: "Alpha Model" },
      { id: "zeta/model", label: "Zeta Model" },
    ]);
  });

  test("loads NanoGPT subscription and paid model catalogs with visible tiers", async () => {
    const store = createSqliteStore(":memory:");
    const app = createApp({ store });
    const requestedUrls: string[] = [];

    globalThis.fetch = (async (input) => {
      const url = String(input);
      requestedUrls.push(url);
      const data = url.includes("/subscription/")
        ? [
            { id: "sub/model", name: "Subscription Model" },
            { id: "shared/model", name: "Shared Model" },
          ]
        : [
            { id: "paid/model", name: "Paid Model" },
            { id: "shared/model", name: "Shared Model Paid" },
          ];
      return new Response(JSON.stringify({ data }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const response = await app.request("/api/provider-profiles/nanogpt/models", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ apiKey: "test-key" }),
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(requestedUrls).toEqual([
      "https://nano-gpt.com/api/subscription/v1/models?detailed=true",
      "https://nano-gpt.com/api/paid/v1/models?detailed=true",
    ]);
    expect(payload.models).toEqual([
      { id: "paid/model", label: "Paid Model", billingTier: "paid" },
      { id: "shared/model", label: "Shared Model", billingTier: "subscription" },
      { id: "sub/model", label: "Subscription Model", billingTier: "subscription" },
    ]);
  });

  test("advances the scene with a dry-run fallback when a provider request fails", async () => {
    const store = createSqliteStore(":memory:");
    const app = createApp({ store });

    globalThis.fetch = (async () =>
      new Response("bad key", {
        status: 401,
      })) as unknown as typeof fetch;

    const createdResponse = await app.request("/api/sessions", { method: "POST" });
    const created = await createdResponse.json();

    const advancedResponse = await app.request(`/api/sessions/${created.session.id}/advance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content: "[익명 1] 2반 팻말 보여.",
        connections: {
          "advisor-1": {
            providerId: "openrouter",
            apiKey: "bad-key",
            model: "bad/model",
          },
        },
      }),
    });

    expect(advancedResponse.status).toBe(200);
    const advanced = await advancedResponse.json();
    expect(advanced.session.scene.hasEnteredScene).toBe(true);
    expect(advanced.session.scene.locationId).toBe("old-school-hallway");
    expect(advanced.turn.messages.at(-1).content).toContain("팻말");
    expect(advanced.turn.messages.at(-1).generationSource).toBe("dry-run");
  });
});
