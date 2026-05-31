import type {
  ModelConnection,
  ModelOption,
  ModelProviderId,
  ProviderProfile,
} from "@hushline/shared";
import { useEffect, useMemo, useState } from "react";
import type { ConnectionSlot } from "../types/ui";
import { ModelSearchPicker } from "./ModelSearchPicker";
import { getConnectionStatus, getSharedProviderApiKey } from "../utils/ui-helpers";

export function ConnectionPanel({
  profiles,
  slots,
  connections,
  modelOptions,
  modelLoadState,
  connectionTestState,
  oauthStatus,
  saveStatus,
  onChange,
  onLoadModels,
  onTestConnection,
  onOpenChatGptLogin,
  onCheckChatGptAccount,
  onSave,
}: {
  profiles: ProviderProfile[];
  slots: ConnectionSlot[];
  connections: Record<string, ModelConnection>;
  modelOptions: Record<string, ModelOption[]>;
  modelLoadState: Record<string, { loading: boolean; error: string | null }>;
  oauthStatus: string | null;
  saveStatus: string;
  connectionTestState?: Record<string, { loading: boolean; tone: "success" | "error"; message: string }>;
  onChange: (connections: Record<string, ModelConnection>) => void;
  onLoadModels: (providerId: ModelProviderId, apiKey?: string) => void;
  onTestConnection?: (slotKey: string, connection: ModelConnection) => void;
  onOpenChatGptLogin: () => void;
  onCheckChatGptAccount: () => void;
  onSave: () => void;
}) {
  const [activeSlotKey, setActiveSlotKey] = useState("default");
  const fallbackProviderId = profiles[0]?.id ?? ("nanogpt" as ModelProviderId);
  const slotKey = resolveConnectionSlotKey(slots, activeSlotKey);
  const slot = slots.find((candidate) => candidate.key === slotKey);
  const currentConnection =
    connections[slotKey] ??
    ({
      providerId: fallbackProviderId,
      apiKey: "",
      model: "",
    } as ModelConnection);
  const selectedProfile = profiles.find((profile) => profile.id === currentConnection.providerId);
  const providerModels = modelOptions[currentConnection.providerId] ?? [];
  const modelChoices = useMemo(
    () => currentConnection.model
      ? ensureSelectedModel(providerModels, currentConnection.model)
      : providerModels,
    [currentConnection.model, providerModels],
  );
  const currentModelLoadState = modelLoadState[currentConnection.providerId] ?? {
    loading: false,
    error: null,
  };
  const usesChatGptOAuth = currentConnection.providerId === "chatgpt";
  const inheritedApiKey = getSharedProviderApiKey(connections, currentConnection.providerId, slotKey);
  const effectiveApiKey = currentConnection.apiKey.trim() || inheritedApiKey;
  const slotStatus = getConnectionStatus(connections[slotKey], profiles, inheritedApiKey);
  const testState = connectionTestState?.[slotKey] ?? null;
  const canTestConnection = Boolean(
    currentConnection.model.trim() && (usesChatGptOAuth || effectiveApiKey),
  );

  useEffect(() => {
    setActiveSlotKey((current) => resolveConnectionSlotKey(slots, current));
  }, [slots]);

  function updateSlotConnection(next: Partial<ModelConnection>) {
    const providerId = next.providerId ?? currentConnection.providerId;
    const nextModel = next.providerId && next.model === undefined ? "" : next.model ?? currentConnection.model;
    onChange({
      ...connections,
      [slotKey]: {
        ...currentConnection,
        ...next,
        providerId,
        model: nextModel,
      },
    });
  }

  return (
    <aside className="connection-panel" aria-label="모델 연결">
      <div className="connection-header">
        <div className="connection-title-row">
          <strong>모델 연결</strong>
        </div>
        <span className="connection-hint">
          {slotKey === "default"
            ? "슬롯별 키가 없으면 이 연결이 대신 쓰입니다."
            : "이 캐릭터가 말할 차례일 때 이 연결이 쓰입니다."}
        </span>
      </div>

      <div className="slot-tabs" role="tablist">
        {slots.map((candidate) => {
          const isActive = candidate.key === slotKey;
          return (
            <button
              type="button"
              key={candidate.key}
              role="tab"
              aria-selected={isActive}
              className={`slot-tab ${isActive ? "active" : ""}`}
              onClick={() => setActiveSlotKey(candidate.key)}
            >
              <span className="slot-tab-title">{candidate.title}</span>
              <span className="slot-tab-subtitle">{candidate.subtitle}</span>
            </button>
          );
        })}
      </div>

      <label>
        provider
        <select
          value={currentConnection.providerId}
          onChange={(event) =>
            updateSlotConnection({ providerId: event.target.value as ModelProviderId })
          }
        >
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        model
        <ModelSearchPicker
          value={currentConnection.model}
          options={modelChoices}
          loading={currentModelLoadState.loading}
          onSelect={(model) => updateSlotConnection({ model })}
          onLoadModels={() => onLoadModels(currentConnection.providerId, effectiveApiKey)}
        />
      </label>
      <label className="api-key-field">
        {slotKey === "default" ? "API key" : "API key override"}
        {usesChatGptOAuth ? (
          <span className="oauth-key-placeholder">브라우저 ChatGPT 로그인 사용</span>
        ) : (
          <>
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={currentConnection.apiKey}
              onChange={(event) => updateSlotConnection({ apiKey: event.target.value })}
              placeholder={slotKey === "default" ? "브라우저에 자동 저장" : "비우면 같은 provider 키를 공유"}
            />
            {slotKey !== "default" && !currentConnection.apiKey.trim() ? (
              <small className="shared-key-hint">
                {inheritedApiKey
                  ? "기본/다른 슬롯의 같은 provider API key를 공유합니다."
                  : "같은 provider의 기본 API key를 먼저 입력하세요."}
              </small>
            ) : null}
          </>
        )}
      </label>
      <div className="connection-actions">
        {usesChatGptOAuth ? (
          <>
            <button type="button" onClick={onOpenChatGptLogin}>
              ChatGPT 연결
            </button>
            <button type="button" onClick={onCheckChatGptAccount}>
              연결 확인
            </button>
          </>
        ) : null}
        <button
          type="button"
          disabled={!canTestConnection || testState?.loading}
          onClick={() =>
            onTestConnection?.(slotKey, {
              ...currentConnection,
              apiKey: effectiveApiKey,
            })
          }
        >
          {testState?.loading ? "테스트 중" : "연결 테스트"}
        </button>
        <button type="button" onClick={onSave}>
          저장
        </button>
        <span>{saveStatus}</span>
      </div>
      {testState ? (
        <p className={`connection-test-result ${testState.tone}`}>{testState.message}</p>
      ) : null}
      <div className={`connection-status ${slotStatus.tone}`}>
        <strong>{slotStatus.label}</strong>
        <span>{slotStatus.detail}</span>
      </div>
      <p>{selectedProfile ? `${selectedProfile.baseUrl}${selectedProfile.endpointPath}` : "dry-run"}</p>
      {currentModelLoadState.error ? (
        <p className="connection-error">{currentModelLoadState.error}</p>
      ) : null}
      {usesChatGptOAuth && oauthStatus ? (
        <p className="connection-error">{oauthStatus}</p>
      ) : null}
    </aside>
  );
}

export function resolveConnectionSlotKey(slots: ConnectionSlot[], activeSlotKey: string): string {
  if (slots.some((slot) => slot.key === activeSlotKey)) {
    return activeSlotKey;
  }
  return slots[0]?.key ?? "default";
}

function ensureSelectedModel(models: ModelOption[], selectedModelId: string): ModelOption[] {
  const exists = models.some((m) => m.id === selectedModelId);
  if (exists || !selectedModelId) {
    return models;
  }
  const customOption: ModelOption = {
    id: selectedModelId,
    label: selectedModelId,
  };
  return [customOption, ...models];
}
