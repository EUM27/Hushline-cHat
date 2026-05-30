import type {
  ChatMessage,
  ClientSessionState,
  ModelConnection,
  ModelProviderId,
  ProviderProfile,
} from "@hushline/shared";
import type { V2ScenarioDetailResponse } from "../api-v2";
import type { ConnectionSlot, ConnectionStatus } from "../types/ui";
import { connectionStorageKey } from "../constants/theme-presets";

export function getSourceBadge(
  message: ChatMessage,
  providerProfiles: ProviderProfile[],
): { tone: "api" | "dry-run"; label: string } | null {
  if (message.role !== "character" || !message.generationSource) {
    return null;
  }

  if (message.generationSource === "dry-run") {
    return { tone: "dry-run", label: "dry-run" };
  }

  if (!message.generationModel) {
    return { tone: "api", label: "API" };
  }

  const providerLabel =
    providerProfiles.find((profile) => profile.id === message.generationModel?.providerId)?.label ??
    message.generationModel.providerId;
  return { tone: "api", label: `${providerLabel}/${message.generationModel.model}` };
}

export function getConnectionStatus(
  connection: ModelConnection | undefined,
  profiles: ProviderProfile[],
  inheritedApiKey = "",
): ConnectionStatus {
  if (!connection) {
    return {
      tone: "idle",
      label: "dry-run",
      detail: "API 연결값이 아직 없습니다.",
    };
  }

  const providerLabel =
    profiles.find((profile) => profile.id === connection.providerId)?.label ?? connection.providerId;

  if (connection.providerId === "chatgpt") {
    if (!connection.model) {
      return {
        tone: "warning",
        label: "모델 선택 필요",
        detail: "ChatGPT 연결 후 모델을 불러와 선택하세요.",
      };
    }
    return {
      tone: "ready",
      label: "API 적용 중",
      detail: `${providerLabel} / ${connection.model}`,
    };
  }

  const effectiveApiKey = connection.apiKey.trim() || inheritedApiKey;

  if (!effectiveApiKey && !connection.model) {
    return {
      tone: "idle",
      label: "dry-run",
      detail: `${providerLabel} 키와 모델을 선택하면 API가 대화에 적용됩니다.`,
    };
  }

  if (!effectiveApiKey) {
    return {
      tone: "warning",
      label: "API key 필요",
      detail: `${providerLabel} 모델은 선택됐지만 공유할 키가 없습니다. 기본 연결에 같은 provider 키를 넣거나 이 슬롯에 override 키를 입력하세요.`,
    };
  }

  if (!connection.model) {
    return {
      tone: "warning",
      label: "모델 선택 필요",
      detail: `${providerLabel} 키는 있지만 모델이 비어 있습니다.`,
    };
  }

  return {
    tone: "ready",
    label: inheritedApiKey && !connection.apiKey.trim() ? "공유 API key 적용 중" : "API 적용 중",
    detail: `${providerLabel} / ${connection.model}`,
  };
}

export function buildConnectionSlots(
  session: ClientSessionState | null,
  scenarioDetail: V2ScenarioDetailResponse | null,
): ConnectionSlot[] {
  const characterSlots = session
    ? session.characters.map<ConnectionSlot>((character) => ({
        key: character.id,
        title: character.anonymousLabel ?? character.name,
        subtitle: character.role,
      }))
    : scenarioDetail
      ? scenarioDetail.characters.map<ConnectionSlot>((char) => ({
          key: char.id,
          title: char.anonymousLabel ?? char.name,
          subtitle: char.role,
        }))
      : [];

  return [
    {
      key: "default",
      title: "기본 연결",
      subtitle: "전체 폴백",
    },
    {
      key: "director",
      title: "Director",
      subtitle: "세계의 의지 (JSON 출력)",
    },
    {
      key: "narrator",
      title: "나레이터",
      subtitle: "장면 묘사 전용",
    },
    ...characterSlots,
  ];
}

export function loadConnections(): Record<string, ModelConnection> {
  try {
    const raw = localStorage.getItem(connectionStorageKey);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as Record<string, ModelConnection>;
    // Legacy key migration: `evan` → `default`
    if (parsed.evan && !parsed.default) {
      const { evan, ...rest } = parsed;
      return { default: evan, ...rest };
    }
    return parsed;
  } catch {
    return {};
  }
}

export function persistConnections(
  connections: Record<string, ModelConnection>,
  callbacks?: { onSuccess?: () => void; onError?: (message: string) => void },
): boolean {
  try {
    const serialized = JSON.stringify(connections);
    localStorage.setItem(connectionStorageKey, serialized);

    const stored = localStorage.getItem(connectionStorageKey);
    if (stored !== serialized) {
      callbacks?.onError?.("브라우저 저장 확인 실패: API 키/모델이 저장되지 않았습니다.");
      return false;
    }

    callbacks?.onSuccess?.();
    return true;
  } catch (reason: unknown) {
    callbacks?.onError?.(
      reason instanceof Error
          ? `브라우저 저장 실패: ${reason.message}`
          : "브라우저 저장 실패: localStorage를 사용할 수 없습니다.",
    );
    return false;
  }
}

export function activeConnections(
  connections: Record<string, ModelConnection>,
): Record<string, ModelConnection> {
  const active = Object.fromEntries(
    Object.entries(connections)
      .map(([slotKey, connection]) => {
        const apiKey = connection.apiKey.trim()
          || getSharedProviderApiKey(connections, connection.providerId, slotKey);
        return [
          slotKey,
          {
            ...connection,
            apiKey,
          },
        ] as const;
      })
      .filter(
        ([, connection]) =>
          connection.providerId
          && connection.model.trim()
          && (connection.providerId === "chatgpt" || connection.apiKey.trim()),
      ),
  );
  const primaryConnection = active.default ?? Object.values(active)[0];

  if (primaryConnection && !active.default) {
    return {
      default: primaryConnection,
      ...active,
    };
  }

  return active;
}

export function getSharedProviderApiKey(
  connections: Record<string, ModelConnection>,
  providerId: ModelProviderId,
  currentSlotKey?: string,
): string {
  const defaultConnection = connections.default;
  if (
    currentSlotKey !== "default"
    && defaultConnection?.providerId === providerId
    && defaultConnection.apiKey.trim()
  ) {
    return defaultConnection.apiKey.trim();
  }

  for (const [slotKey, connection] of Object.entries(connections)) {
    if (slotKey === currentSlotKey) continue;
    if (connection.providerId === providerId && connection.apiKey.trim()) {
      return connection.apiKey.trim();
    }
  }

  return "";
}
