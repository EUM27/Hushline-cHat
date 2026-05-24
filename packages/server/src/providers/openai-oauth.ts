import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server, type ServerResponse } from "node:http";
import { dirname, resolve } from "node:path";
import type { Hono } from "hono";
import type { ModelOption } from "@hushline/shared";
import type { AdapterRequest } from "./adapters/types";

const openAiOAuthIssuer = "https://auth.openai.com";
const openAiOAuthClientId = "app_EMoamEEZ73f0CkXaXp7hrann";
const openAiOAuthTokenUrl = `${openAiOAuthIssuer}/oauth/token`;
const openAiOAuthUpstreamUrl = "https://chatgpt.com/backend-api/codex";
const openAiOAuthOriginator = "codex_cli_rs";
const openAiOAuthClientVersion = "0.111.0";
const openAiOAuthDefaultModel = "gpt-5.4";
const openAiOAuthDefaultLoginPort = 1455;
const openAiOAuthDefaultBrokerUrl = "http://localhost:5173";

type OpenAiOAuthTokens = {
  id_token?: string;
  access_token?: string;
  refresh_token?: string;
  account_id?: string;
};

type OpenAiOAuthAuthFile = {
  tokens?: OpenAiOAuthTokens;
  last_refresh?: string;
};

type OpenAiOAuthLoginSession = {
  state: string;
  codeVerifier: string;
  redirectUri: string;
  createdAt: number;
};

type OpenAiOAuthBrokerPayload = {
  ok?: boolean;
  error?: string;
  authorizeUrl?: string;
  account?: unknown;
  data?: unknown;
  models?: unknown;
  choices?: unknown;
};

let openAiOAuthLoginSession: OpenAiOAuthLoginSession | null = null;
let openAiOAuthCallbackServer: Server | null = null;
let openAiOAuthCallbackServerStart: Promise<Server> | null = null;
let openAiOAuthModelCache: { expiresAt: number; data: ModelOption[] } | null = null;

function getAuthFilePath() {
  return process.env.HUSHLINE_OPENAI_OAUTH_AUTH_FILE
    || resolve(process.cwd(), "packages/server/data/openai-oauth-auth.json");
}

function getLoginPort() {
  const parsed = Number(process.env.HUSHLINE_OPENAI_OAUTH_LOGIN_PORT ?? openAiOAuthDefaultLoginPort);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : openAiOAuthDefaultLoginPort;
}

function getBrokerUrl() {
  return (process.env.HUSHLINE_OPENAI_OAUTH_BROKER_URL ?? openAiOAuthDefaultBrokerUrl).replace(/\/+$/u, "");
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeOpenAiOAuthError(error: unknown, fallback: string) {
  let message = error instanceof Error ? error.message : fallback;
  try {
    const parsed = toRecord(JSON.parse(message));
    const nestedError = toRecord(parsed.error);
    if (typeof parsed.detail === "string") message = parsed.detail;
    else if (typeof parsed.error === "string") message = parsed.error;
    else if (typeof nestedError.message === "string") message = nestedError.message;
    else if (typeof parsed.message === "string") message = parsed.message;
  } catch {
    // Keep the original message if the upstream body is not JSON.
  }
  return message;
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

function parseJwtClaims(token?: string): Record<string, unknown> {
  if (!token?.includes(".")) return {};
  const [, payload] = token.split(".");
  if (!payload) return {};
  try {
    return toRecord(JSON.parse(decodeBase64Url(payload)));
  } catch {
    return {};
  }
}

function deriveAccountId(idToken?: string) {
  const claims = parseJwtClaims(idToken);
  const auth = toRecord(claims["https://api.openai.com/auth"]);
  return typeof auth.chatgpt_account_id === "string" ? auth.chatgpt_account_id : undefined;
}

function readOpenAiOAuthAuthFile(): OpenAiOAuthAuthFile {
  try {
    return toRecord(JSON.parse(readFileSync(getAuthFilePath(), "utf8"))) as OpenAiOAuthAuthFile;
  } catch {
    return {};
  }
}

function writeOpenAiOAuthAuthFile(auth: OpenAiOAuthAuthFile) {
  const authFile = getAuthFilePath();
  mkdirSync(dirname(authFile), { recursive: true });
  writeFileSync(authFile, JSON.stringify(auth, null, 2), { encoding: "utf8", mode: 0o600 });
}

function getTokenExpiryMs(accessToken?: string) {
  const claims = parseJwtClaims(accessToken);
  return typeof claims.exp === "number" ? claims.exp * 1000 : 0;
}

function isAccessTokenFresh(accessToken?: string) {
  const expiryMs = getTokenExpiryMs(accessToken);
  return Boolean(accessToken && expiryMs > Date.now() + 5 * 60_000);
}

export function getOpenAiOAuthAccount() {
  const auth = readOpenAiOAuthAuthFile();
  const tokens = auth.tokens;
  const claims = parseJwtClaims(tokens?.id_token);
  const authClaims = toRecord(claims["https://api.openai.com/auth"]);
  const email = typeof claims.email === "string" ? claims.email : undefined;
  const planType = typeof authClaims.chatgpt_plan_type === "string" ? authClaims.chatgpt_plan_type : undefined;
  const accountId = tokens?.account_id ?? deriveAccountId(tokens?.id_token);
  return {
    connected: Boolean(tokens?.access_token && accountId),
    email,
    planType,
    accountId,
  };
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 1_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function getExternalOpenAiOAuthBrokerUrl() {
  if (process.env.HUSHLINE_OPENAI_OAUTH_DISABLE_EXTERNAL_BROKER === "1") {
    return null;
  }

  try {
    const brokerUrl = getBrokerUrl();
    const response = await fetchWithTimeout(`${brokerUrl}/api/openai-oauth/account`, {
      method: "GET",
    });
    if (!response.ok) {
      return null;
    }
    const payload = toRecord(await response.json().catch(() => ({})));
    return payload.ok === true ? brokerUrl : null;
  } catch {
    return null;
  }
}

async function requestExternalOpenAiOAuthBroker(
  brokerUrl: string,
  path: string,
  init: RequestInit = {},
): Promise<OpenAiOAuthBrokerPayload> {
  const response = await fetch(`${brokerUrl}${path}`, init);
  const bodyText = await response.text();
  const payload = toRecord(bodyText ? JSON.parse(bodyText) : {}) as OpenAiOAuthBrokerPayload;
  if (!response.ok || payload.ok === false) {
    throw new Error(typeof payload.error === "string" ? payload.error : `ChatGPT OAuth broker request failed: ${response.status}`);
  }
  return payload;
}

async function startExternalOpenAiOAuthLogin(brokerUrl: string) {
  return requestExternalOpenAiOAuthBroker(brokerUrl, "/api/openai-oauth/login/start", {
    method: "POST",
  });
}

async function getExternalOpenAiOAuthAccount(brokerUrl: string) {
  return requestExternalOpenAiOAuthBroker(brokerUrl, "/api/openai-oauth/account", {
    method: "GET",
  });
}

function modelOptionsFromBrokerPayload(payload: OpenAiOAuthBrokerPayload): ModelOption[] {
  const rawModels = Array.isArray(payload.data)
    ? payload.data
    : Array.isArray(payload.models)
      ? payload.models
      : [];
  return rawModels
    .map((model) => {
      const record = toRecord(model);
      const id = typeof record.id === "string"
        ? record.id
        : typeof record.slug === "string"
          ? record.slug
          : "";
      const label = typeof record.name === "string"
        ? record.name
        : typeof record.label === "string"
          ? record.label
          : id;
      return id ? { id, label } : null;
    })
    .filter((model): model is ModelOption => Boolean(model));
}

async function listExternalOpenAiOAuthModels(brokerUrl: string): Promise<ModelOption[]> {
  const payload = await requestExternalOpenAiOAuthBroker(brokerUrl, "/api/openai-oauth/models", {
    method: "GET",
  });
  const models = modelOptionsFromBrokerPayload(payload);
  if (models.length === 0) {
    throw new Error("ChatGPT OAuth broker returned an empty model list.");
  }
  return models;
}

async function refreshOpenAiOAuthTokens(tokens: OpenAiOAuthTokens): Promise<OpenAiOAuthTokens> {
  if (!tokens.refresh_token) {
    throw new Error("ChatGPT 로그인이 필요합니다.");
  }

  const response = await fetch(openAiOAuthTokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      client_id: openAiOAuthClientId,
    }),
  });
  const payload = toRecord(await response.json().catch(() => ({})));
  if (!response.ok) {
    throw new Error(typeof payload.error_description === "string" ? payload.error_description : "OpenAI OAuth 토큰 갱신에 실패했습니다.");
  }

  const nextTokens = {
    id_token: typeof payload.id_token === "string" ? payload.id_token : tokens.id_token,
    access_token: typeof payload.access_token === "string" ? payload.access_token : tokens.access_token,
    refresh_token: typeof payload.refresh_token === "string" ? payload.refresh_token : tokens.refresh_token,
  };
  const refreshed: OpenAiOAuthTokens = {};
  if (nextTokens.id_token) refreshed.id_token = nextTokens.id_token;
  if (nextTokens.access_token) refreshed.access_token = nextTokens.access_token;
  if (nextTokens.refresh_token) refreshed.refresh_token = nextTokens.refresh_token;
  const accountId = deriveAccountId(nextTokens.id_token) ?? tokens.account_id;
  if (accountId) refreshed.account_id = accountId;
  return refreshed;
}

async function getFreshOpenAiOAuthTokens(): Promise<OpenAiOAuthTokens> {
  const auth = readOpenAiOAuthAuthFile();
  const tokens = auth.tokens ?? {};
  if (!tokens.access_token) {
    throw new Error("ChatGPT 로그인이 필요합니다.");
  }
  if (isAccessTokenFresh(tokens.access_token)) {
    return tokens;
  }
  const refreshed = await refreshOpenAiOAuthTokens(tokens);
  writeOpenAiOAuthAuthFile({ ...auth, tokens: refreshed, last_refresh: new Date().toISOString() });
  return refreshed;
}

function createPkceCodes() {
  const codeVerifier = randomBytes(64).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  return { codeVerifier, codeChallenge };
}

function createOpenAiOAuthAuthorizeUrl(session: OpenAiOAuthLoginSession, codeChallenge: string) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: openAiOAuthClientId,
    redirect_uri: session.redirectUri,
    scope: "openid profile email offline_access api.connectors.read api.connectors.invoke",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    id_token_add_organizations: "true",
    codex_cli_simplified_flow: "true",
    state: session.state,
    originator: openAiOAuthOriginator,
  });
  return `${openAiOAuthIssuer}/oauth/authorize?${params.toString()}`;
}

async function exchangeOpenAiOAuthCode(code: string, session: OpenAiOAuthLoginSession): Promise<OpenAiOAuthTokens> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: session.redirectUri,
    client_id: openAiOAuthClientId,
    code_verifier: session.codeVerifier,
  });
  const response = await fetch(openAiOAuthTokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = toRecord(await response.json().catch(() => ({})));
  if (!response.ok) {
    throw new Error(typeof payload.error_description === "string" ? payload.error_description : "OpenAI OAuth 토큰 교환에 실패했습니다.");
  }
  const idToken = typeof payload.id_token === "string" ? payload.id_token : undefined;
  const tokens: OpenAiOAuthTokens = {};
  if (idToken) tokens.id_token = idToken;
  if (typeof payload.access_token === "string") tokens.access_token = payload.access_token;
  if (typeof payload.refresh_token === "string") tokens.refresh_token = payload.refresh_token;
  const accountId = deriveAccountId(idToken);
  if (accountId) tokens.account_id = accountId;
  return tokens;
}

function ensureOpenAiOAuthCallbackServer() {
  if (openAiOAuthCallbackServer) {
    return Promise.resolve(openAiOAuthCallbackServer);
  }
  if (openAiOAuthCallbackServerStart) {
    return openAiOAuthCallbackServerStart;
  }

  const loginPort = getLoginPort();
  const server = createServer(async (req, res) => {
    const requestUrl = new URL(req.url ?? "/", `http://localhost:${loginPort}`);
    if (requestUrl.pathname !== "/auth/callback") {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }

    try {
      const session = openAiOAuthLoginSession;
      if (!session || requestUrl.searchParams.get("state") !== session.state) {
        res.statusCode = 400;
        res.end("ChatGPT login state mismatch. Please retry from Hushline.");
        return;
      }
      const code = requestUrl.searchParams.get("code");
      if (!code) {
        res.statusCode = 400;
        res.end("ChatGPT login did not return an authorization code.");
        return;
      }
      const tokens = await exchangeOpenAiOAuthCode(code, session);
      writeOpenAiOAuthAuthFile({ tokens, last_refresh: new Date().toISOString() });
      openAiOAuthLoginSession = null;
      openAiOAuthModelCache = null;
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end("<!doctype html><meta charset=\"utf-8\"><title>Hushline Chat</title><p>ChatGPT 연결이 완료되었습니다. 이 창은 닫아도 됩니다.</p>");
    } catch (error) {
      res.statusCode = 500;
      res.end(error instanceof Error ? error.message : "ChatGPT login failed.");
    }
  });

  openAiOAuthCallbackServerStart = new Promise<Server>((resolveServer, reject) => {
    const handleError = (error: Error) => {
      server.close();
      reject(new Error(`ChatGPT 로그인 콜백 서버를 열 수 없습니다. 127.0.0.1:${loginPort} 포트를 확인하세요. ${error.message}`));
    };
    server.once("error", handleError);
    server.listen(loginPort, "127.0.0.1", () => {
      server.off("error", handleError);
      openAiOAuthCallbackServer = server;
      server.once("close", () => {
        if (openAiOAuthCallbackServer === server) openAiOAuthCallbackServer = null;
      });
      resolveServer(server);
    });
  }).finally(() => {
    openAiOAuthCallbackServerStart = null;
  });
  return openAiOAuthCallbackServerStart;
}

export async function startOpenAiOAuthLogin() {
  const brokerUrl = await getExternalOpenAiOAuthBrokerUrl();
  if (brokerUrl) {
    return startExternalOpenAiOAuthLogin(brokerUrl);
  }

  await ensureOpenAiOAuthCallbackServer();
  const { codeVerifier, codeChallenge } = createPkceCodes();
  const loginPort = getLoginPort();
  openAiOAuthLoginSession = {
    state: randomBytes(32).toString("base64url"),
    codeVerifier,
    redirectUri: `http://localhost:${loginPort}/auth/callback`,
    createdAt: Date.now(),
  };
  return {
    ok: true,
    authorizeUrl: createOpenAiOAuthAuthorizeUrl(openAiOAuthLoginSession, codeChallenge),
    account: getOpenAiOAuthAccount(),
  };
}

async function openAiOAuthFetch(path: string, init?: RequestInit) {
  const tokens = await getFreshOpenAiOAuthTokens();
  const accountId = tokens.account_id ?? deriveAccountId(tokens.id_token);
  if (!accountId) {
    throw new Error("ChatGPT 계정 ID를 확인하지 못했습니다. 다시 로그인하세요.");
  }
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${tokens.access_token}`);
  headers.set("chatgpt-account-id", accountId);
  headers.set("OpenAI-Beta", "responses=experimental");
  headers.set("originator", openAiOAuthOriginator);
  return fetch(`${openAiOAuthUpstreamUrl}${path}`, { ...init, headers });
}

export async function listOpenAiOAuthModels(): Promise<ModelOption[]> {
  if (!getOpenAiOAuthAccount().connected) {
    const brokerUrl = await getExternalOpenAiOAuthBrokerUrl();
    if (brokerUrl) {
      return listExternalOpenAiOAuthModels(brokerUrl);
    }
  }

  if (openAiOAuthModelCache && openAiOAuthModelCache.expiresAt > Date.now()) {
    return openAiOAuthModelCache.data;
  }

  const response = await openAiOAuthFetch(`/models?client_version=${encodeURIComponent(openAiOAuthClientVersion)}`);
  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(bodyText || `ChatGPT 모델 목록 요청 실패: ${response.status}`);
  }
  const payload = toRecord(JSON.parse(bodyText));
  const models = Array.isArray(payload.models)
    ? payload.models
        .map((model) => toRecord(model).slug)
        .filter((slug): slug is string => typeof slug === "string" && slug.trim().length > 0)
    : [];
  if (models.length === 0) {
    throw new Error("ChatGPT 모델 목록이 비어 있습니다.");
  }
  const options = [...new Set(models)].map((id) => ({ id, label: id }));
  openAiOAuthModelCache = { data: options, expiresAt: Date.now() + 5 * 60_000 };
  return options;
}

function convertChatCompletionToResponseInput(body: Record<string, unknown>) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  return messages
    .map((message) => {
      const record = toRecord(message);
      if (record.role === "system") return null;
      const role = record.role === "assistant" ? "assistant" : "user";
      const content = typeof record.content === "string" ? record.content : JSON.stringify(record.content ?? "");
      return {
        type: "message",
        role,
        content: [{ type: "input_text", text: content }],
      };
    })
    .filter((message): message is { type: string; role: string; content: Array<{ type: string; text: string }> } => Boolean(message?.content[0]?.text.trim()));
}

function getSystemInstructions(body: Record<string, unknown>) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  return messages
    .map((message) => toRecord(message))
    .filter((message) => message.role === "system")
    .map((message) => typeof message.content === "string" ? message.content : JSON.stringify(message.content ?? ""))
    .filter(Boolean)
    .join("\n\n");
}

function buildOpenAiOAuthResponseBody(body: Record<string, unknown>) {
  return {
    model: typeof body.model === "string" && body.model.trim() ? body.model : openAiOAuthDefaultModel,
    input: convertChatCompletionToResponseInput(body),
    instructions: getSystemInstructions(body),
    stream: true,
    store: false,
  };
}

function buildOpenAiOAuthChatCompletionBody(request: AdapterRequest) {
  return {
    model: request.connection.model || openAiOAuthDefaultModel,
    messages: [
      { role: "system", content: request.systemPrompt },
      ...request.messages.map((message) => ({
        role: message.role === "user" ? "user" : "assistant",
        content: message.content,
      })),
    ],
  };
}

function extractChatCompletionContent(payload: OpenAiOAuthBrokerPayload) {
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const firstChoice = toRecord(choices[0]);
  const message = toRecord(firstChoice.message);
  return typeof message.content === "string" ? message.content : "";
}

async function completeExternalOpenAiOAuth(brokerUrl: string, request: AdapterRequest) {
  const payload = await requestExternalOpenAiOAuthBroker(brokerUrl, "/api/openai-oauth/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildOpenAiOAuthChatCompletionBody(request)),
  });
  const content = extractChatCompletionContent(payload);
  if (!content.trim()) {
    throw new Error("ChatGPT OAuth broker returned an empty completion.");
  }
  return content;
}

export async function completeOpenAiOAuth(request: AdapterRequest): Promise<string> {
  if (!getOpenAiOAuthAccount().connected) {
    const brokerUrl = await getExternalOpenAiOAuthBrokerUrl();
    if (brokerUrl) {
      return completeExternalOpenAiOAuth(brokerUrl, request);
    }
  }

  const response = await openAiOAuthFetch("/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildOpenAiOAuthResponseBody(buildOpenAiOAuthChatCompletionBody(request))),
  });
  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(bodyText || `ChatGPT 요청 실패: ${response.status}`);
  }
  return collectTextFromOpenAiOAuthSse(bodyText);
}

function collectTextFromOpenAiOAuthSse(bodyText: string) {
  let text = "";
  let completedText = "";
  for (const block of bodyText.split(/\r?\n\r?\n/u)) {
    const event = block.split(/\r?\n/u).find((line) => line.startsWith("event:"))?.slice(6).trim();
    const data = block
      .split(/\r?\n/u)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data) continue;
    try {
      const parsed = toRecord(JSON.parse(data));
      if (event === "response.output_text.delta" && typeof parsed.delta === "string") {
        text += parsed.delta;
      }
      const response = toRecord(parsed.response);
      if (event === "response.completed" && typeof response.output_text === "string") {
        completedText = response.output_text;
      }
    } catch {
      // Ignore malformed SSE frames and keep any valid text already collected.
    }
  }
  return completedText || text;
}

async function readHonoJson(context: { req: { json(): Promise<unknown> } }) {
  return toRecord(await context.req.json().catch(() => ({})));
}

export function registerOpenAiOAuthRoutes(app: Hono) {
  app.post("/api/openai-oauth/login/start", async (context) => {
    try {
      return context.json(await startOpenAiOAuthLogin());
    } catch (error) {
      return context.json({ ok: false, error: normalizeOpenAiOAuthError(error, "OpenAI OAuth 연결을 시작하지 못했습니다.") }, 500);
    }
  });

  app.get("/api/openai-oauth/account", async (context) => {
    try {
      const account = getOpenAiOAuthAccount();
      if (!account.connected) {
        const brokerUrl = await getExternalOpenAiOAuthBrokerUrl();
        if (brokerUrl) {
          const payload = await getExternalOpenAiOAuthAccount(brokerUrl);
          return context.json({ ...payload, broker: brokerUrl });
        }
      }
      return context.json({ ok: true, account, authFileExists: existsSync(getAuthFilePath()) });
    } catch (error) {
      return context.json({ ok: false, error: normalizeOpenAiOAuthError(error, "ChatGPT 연결을 확인하지 못했습니다.") }, 500);
    }
  });

  app.get("/api/openai-oauth/models", async (context) => {
    try {
      const models = await listOpenAiOAuthModels();
      return context.json({ ok: true, data: models.map((model) => ({ id: model.id, name: model.label, owned_by: "chatgpt" })) });
    } catch (error) {
      return context.json({ ok: false, error: normalizeOpenAiOAuthError(error, "ChatGPT 모델 목록을 불러오지 못했습니다.") }, 500);
    }
  });

  app.post("/api/openai-oauth/chat/completions", async (context) => {
    try {
      const body = await readHonoJson(context);
      const content = await completeOpenAiOAuth({
        connection: { providerId: "chatgpt", apiKey: "", model: typeof body.model === "string" ? body.model : openAiOAuthDefaultModel },
        systemPrompt: getSystemInstructions(body),
        messages: Array.isArray(body.messages)
          ? body.messages.map((message) => {
              const record = toRecord(message);
              return {
                id: "",
                sessionId: "",
                role: record.role === "assistant" ? "character" as const : "user" as const,
                content: typeof record.content === "string" ? record.content : JSON.stringify(record.content ?? ""),
                createdAt: "",
              };
            })
          : [],
      });
      return context.json({
        id: `chatcmpl-${randomUUID()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: typeof body.model === "string" ? body.model : openAiOAuthDefaultModel,
        choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content } }],
      });
    } catch (error) {
      return context.json({ ok: false, error: normalizeOpenAiOAuthError(error, "ChatGPT 요청에 실패했습니다.") }, 500);
    }
  });
}
