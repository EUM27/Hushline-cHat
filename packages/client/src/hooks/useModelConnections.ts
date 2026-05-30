import { type Dispatch, type SetStateAction, useEffect, useState } from "react";
import type { ModelConnection, ModelOption, ModelProviderId } from "@hushline/shared";
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
  oauthStatus: string | null;
  saveStatus: string;
  setConnections: Dispatch<SetStateAction<Record<string, ModelConnection>>>;
  loadModels: (providerId: ModelProviderId, apiKey?: string) => Promise<void>;
  openChatGptLogin: () => Promise<void>;
  checkChatGptAccount: () => Promise<void>;
  saveConnections: () => void;
}

export function useModelConnections(): ModelConnectionsState {
  const [connections, setConnectionsState] = useState<Record<string, ModelConnection>>(() =>
    loadConnections(),
  );
  const [modelOptions, setModelOptions] = useState<Record<string, ModelOption[]>>({});
  const [modelLoadState, setModelLoadState] = useState<
    Record<string, { loading: boolean; error: string | null }>
  >({});
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

  const setConnections: Dispatch<SetStateAction<Record<string, ModelConnection>>> = (nextConnections) => {
    setManualSaveAt(null);
    setConnectionsState(nextConnections);
  };

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
      if (!payload.authorizeUrl) {
        setOauthStatus("ChatGPT 로그인 URL을 받지 못했습니다.");
        return;
      }
      window.open(payload.authorizeUrl, "_blank", "noopener,noreferrer");
      setOauthStatus("브라우저에서 ChatGPT 로그인 진행");
    } catch (reason: unknown) {
      setOauthStatus(reason instanceof Error ? reason.message : "ChatGPT 연결을 시작하지 못했습니다.");
    }
  }

  async function checkChatGptAccount() {
    try {
      const response = await fetch("/api/openai-oauth/account", { method: "GET" });
      const payload = await parseOpenAiOAuthJson<{ ok: boolean; account: OpenAiOAuthAccount }>(response);
      if (!payload.account?.connected) {
        setOauthStatus("ChatGPT 로그인이 필요합니다.");
        return;
      }
      const plan = payload.account.planType ? ` · ${payload.account.planType}` : "";
      setOauthStatus(`${payload.account.email ?? "ChatGPT"} 연결됨${plan}`);
    } catch (reason: unknown) {
      setOauthStatus(reason instanceof Error ? reason.message : "ChatGPT 연결을 확인하지 못했습니다.");
    }
  }

  return {
    connections,
    modelOptions,
    modelLoadState,
    oauthStatus,
    saveStatus: connectionSaveError ?? (manualSaveAt ? `저장됨 ${manualSaveAt}` : "브라우저에 자동 저장됨"),
    setConnections,
    loadModels,
    openChatGptLogin,
    checkChatGptAccount,
    saveConnections,
  };
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
