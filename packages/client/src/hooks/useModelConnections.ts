import { type Dispatch, type SetStateAction, useEffect, useState } from "react";
import type { ModelConnection, ModelOption, ModelProviderId } from "@hushline/shared";
import { testProviderConnection } from "../api-v2";
import type { OpenAiOAuthAccount, OpenAiOAuthLoginResult } from "../types/ui";
import {
  formatKoreanTime,
  loadConnections,
  persistConnections,
} from "../utils/ui-helpers";

export interface ModelConnectionsState {
  connections: Record<string, ModelConnection>;
  modelOptions: Record<string, ModelOption[]>;
  modelLoadState: Record<string, { loading: boolean; error: string | null }>;
  connectionTestState: Record<string, ConnectionTestState>;
  oauthAccount: OpenAiOAuthAccount | null;
  oauthChecked: boolean;
  oauthStatus: string | null;
  saveStatus: string;
  setConnections: Dispatch<SetStateAction<Record<string, ModelConnection>>>;
  loadModels: (providerId: ModelProviderId, apiKey?: string) => Promise<void>;
  testConnection: (slotKey: string, connection: ModelConnection) => Promise<void>;
  openChatGptLogin: () => Promise<void>;
  checkChatGptAccount: () => Promise<void>;
  saveConnections: () => void;
}

export interface ConnectionTestState {
  loading: boolean;
  tone: "success" | "error";
  message: string;
}

export function useModelConnections(): ModelConnectionsState {
  const [connections, setConnectionsState] = useState<Record<string, ModelConnection>>(() =>
    loadConnections(),
  );
  const [modelOptions, setModelOptions] = useState<Record<string, ModelOption[]>>({});
  const [modelLoadState, setModelLoadState] = useState<
    Record<string, { loading: boolean; error: string | null }>
  >({});
  const [connectionTestState, setConnectionTestState] = useState<Record<string, ConnectionTestState>>({});
  const [oauthAccount, setOauthAccount] = useState<OpenAiOAuthAccount | null>(null);
  const [oauthChecked, setOauthChecked] = useState(false);
  const [oauthStatus, setOauthStatus] = useState<string | null>(null);
  const [manualSaveAt, setManualSaveAt] = useState<string | null>(null);
  const [connectionSaveError, setConnectionSaveError] = useState<string | null>(null);

  useEffect(() => {
    persistConnections(connections, {
      onSuccess: () => {
        setConnectionSaveError(null);
        setManualSaveAt(formatKoreanTime());
      },
      onError: (message) => setConnectionSaveError(message),
    });
  }, [connections]);

  useEffect(() => {
    void refreshChatGptAccount({ silent: true });
  }, []);

  const setConnections: Dispatch<SetStateAction<Record<string, ModelConnection>>> = (nextConnections) => {
    setManualSaveAt(null);
    setConnectionsState(nextConnections);
  };

  async function refreshChatGptAccount(options: { silent?: boolean } = {}) {
    try {
      const account = await fetchChatGptAccount();
      setOauthAccount(account);
      setOauthChecked(true);
      return account;
    } catch (reason: unknown) {
      setOauthAccount(null);
      setOauthChecked(true);
      if (!options.silent) {
        throw reason;
      }
      return null;
    }
  }

  async function loadModels(providerId: ModelProviderId, apiKey?: string) {
    setModelLoadState((current) => ({
      ...current,
      [providerId]: { loading: true, error: null },
    }));

    try {
      const response = await fetch(`/api/provider-profiles/${providerId}/models`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey || undefined }),
      });

      if (!response.ok) {
        const detail = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(detail?.error ?? "모델 목록을 불러오지 못했습니다.");
      }

      const payload = (await response.json()) as { models: ModelOption[] };
      setModelOptions((current) => ({
        ...current,
        [providerId]: payload.models,
      }));
      setModelLoadState((current) => ({
        ...current,
        [providerId]: { loading: false, error: null },
      }));
    } catch (reason: unknown) {
      setModelLoadState((current) => ({
        ...current,
        [providerId]: {
          loading: false,
          error: reason instanceof Error ? reason.message : "모델 목록 로드 실패",
        },
      }));
    }
  }

  async function testConnection(slotKey: string, connection: ModelConnection) {
    setConnectionTestState((current) => ({
      ...current,
      [slotKey]: {
        loading: true,
        tone: "success",
        message: "연결 테스트 중",
      },
    }));

    try {
      const payload = await testProviderConnection(connection);
      setConnectionTestState((current) => ({
        ...current,
        [slotKey]: {
          loading: false,
          tone: "success",
          message: payload.message ?? "연결 테스트 성공",
        },
      }));
    } catch (reason: unknown) {
      setConnectionTestState((current) => ({
        ...current,
        [slotKey]: {
          loading: false,
          tone: "error",
          message: reason instanceof Error ? reason.message : "연결 테스트 실패",
        },
      }));
    }
  }

  function saveConnections() {
    const saved = persistConnections(connections, {
      onSuccess: () => setConnectionSaveError(null),
      onError: (message) => setConnectionSaveError(message),
    });
    if (!saved) return;
    setManualSaveAt(formatKoreanTime());
  }

  async function openChatGptLogin() {
    setOauthStatus("ChatGPT 연결 준비 중");
    try {
      const response = await fetch("/api/openai-oauth/login/start", { method: "POST" });
      const payload = await parseOpenAiOAuthJson<OpenAiOAuthLoginResult>(response);
      if (payload.account) {
        setOauthAccount(payload.account);
        setOauthChecked(true);
      }
      if (payload.account?.connected) {
        setOauthStatus(formatChatGptAccountStatus(payload.account));
        return;
      }
      if (!payload.authorizeUrl) {
        setOauthStatus("ChatGPT 로그인 URL을 받지 못했습니다.");
        return;
      }
      if (!canUseOpenAiOAuthRedirectInCurrentBrowser(payload.authorizeUrl, window.location.hostname)) {
        setOauthStatus(
          "ChatGPT 로그인 콜백은 PC 로컬 브라우저에서만 받을 수 있습니다. 모바일/Tailscale에서는 PC에서 로그인한 뒤 연결 확인을 누르세요.",
        );
        return;
      }
      window.open(payload.authorizeUrl, "_blank", "noopener,noreferrer");
      setOauthStatus("브라우저에서 ChatGPT 로그인 진행");
    } catch (reason: unknown) {
      setOauthAccount(null);
      setOauthChecked(true);
      setOauthStatus(reason instanceof Error ? reason.message : "ChatGPT 연결을 시작하지 못했습니다.");
    }
  }

  async function checkChatGptAccount() {
    try {
      const account = await refreshChatGptAccount();
      if (!account?.connected) {
        setOauthStatus("ChatGPT 로그인이 필요합니다.");
        return;
      }
      setOauthStatus(formatChatGptAccountStatus(account));
    } catch (reason: unknown) {
      setOauthStatus(reason instanceof Error ? reason.message : "ChatGPT 연결을 확인하지 못했습니다.");
    }
  }

  return {
    connections,
    modelOptions,
    modelLoadState,
    connectionTestState,
    oauthAccount,
    oauthChecked,
    oauthStatus,
    saveStatus: connectionSaveError ?? (manualSaveAt ? `저장됨 ${manualSaveAt}` : "브라우저에 자동 저장됨"),
    setConnections,
    loadModels,
    testConnection,
    openChatGptLogin,
    checkChatGptAccount,
    saveConnections,
  };
}

async function fetchChatGptAccount(): Promise<OpenAiOAuthAccount | null> {
  const response = await fetch("/api/openai-oauth/account", { method: "GET" });
  const payload = await parseOpenAiOAuthJson<{ ok: boolean; account: OpenAiOAuthAccount }>(response);
  return payload.account ?? null;
}

function formatChatGptAccountStatus(account: OpenAiOAuthAccount): string {
  const plan = account.planType ? ` · ${account.planType}` : "";
  return `${account.email ?? "ChatGPT"} 연결됨${plan}`;
}

export function canUseOpenAiOAuthRedirectInCurrentBrowser(
  authorizeUrl: string,
  browserHostname: string,
): boolean {
  const redirectUri = getAuthorizeRedirectUri(authorizeUrl);
  if (!redirectUri) {
    return true;
  }
  const redirectHost = getUrlHostname(redirectUri);
  if (!redirectHost) {
    return true;
  }
  return !isLoopbackHost(redirectHost) || isLoopbackHost(browserHostname);
}

function getAuthorizeRedirectUri(authorizeUrl: string): string | null {
  try {
    return new URL(authorizeUrl).searchParams.get("redirect_uri");
  } catch {
    return null;
  }
}

function getUrlHostname(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

async function parseOpenAiOAuthJson<T extends { ok?: boolean; error?: string }>(response: Response): Promise<T> {
  const bodyText = await response.text();
  if (!bodyText.trim()) {
    throw new Error(`OpenAI OAuth 응답이 비어 있습니다: ${response.status}`);
  }
  let payload: T;
  try {
    payload = JSON.parse(bodyText) as T;
  } catch {
    throw new Error(`OpenAI OAuth 응답 JSON 파싱 실패: ${response.status}`);
  }
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error ?? `OpenAI OAuth 요청 실패: ${response.status}`);
  }
  return payload;
}
