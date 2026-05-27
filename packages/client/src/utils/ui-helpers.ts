import type {
  AdvisorDraft,
  AssetManifest,
  ChatMessage,
  ClientSessionState,
  InputMode,
  ModelConnection,
  ModelOption,
  ModelProviderId,
  ProviderProfile,
} from "@hushline/shared";
import type { V2ScenarioDetailResponse } from "../api-v2";
import type {
  ConnectionSlot,
  ConnectionStatus,
  ThemeStyle,
  VisualThemePreset,
} from "../types/ui";
import {
  connectionStorageKey,
  enterToSendStorageKey,
  secondAdvisorPool,
} from "../constants/theme-presets";

export function createVisualThemeStyle(theme: VisualThemePreset): ThemeStyle {
  return {
    "--vn-accent": theme.colors.accent,
    "--vn-accent-soft": theme.colors.accentSoft,
    "--vn-stage-bg": theme.colors.stagePanel,
    "--vn-stage-panel": theme.colors.stagePanel,
    "--vn-stage-border": theme.colors.stageBorder,
    "--vn-stage-text": theme.colors.stageText,
    "--vn-stage-muted": theme.colors.stageMuted,
    "--vn-phone-bg": theme.colors.phoneBg,
    "--vn-phone-surface": theme.colors.phoneSurface,
    "--vn-phone-header": theme.colors.phoneHeader,
    "--vn-phone-text": theme.colors.phoneText,
    "--vn-phone-muted": theme.colors.phoneMuted,
    "--vn-phone-border": theme.colors.phoneBorder,
    "--vn-phone-my-bubble": theme.colors.myBubble,
    "--vn-phone-other-bubble": theme.colors.otherBubble,
    "--vn-input-bg": theme.colors.inputBg,
    "--vn-character-highlight": theme.colors.characterHighlight,
    "--vn-character-eye": theme.colors.characterEye,
  } as ThemeStyle;
}

export function looksLikeRichHtml(content: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(content);
}

export function sanitizeRichHtml(raw: string): string {
  const parser = new DOMParser();
  const document = parser.parseFromString(`<div>${raw}</div>`, "text/html");
  const root = document.body.firstElementChild;
  if (!root) return "";

  root.querySelectorAll("script, iframe, object, embed, link, meta, base, form, input, button, select, textarea, svg, math").forEach((element) => {
    element.remove();
  });

  root.querySelectorAll("*").forEach((element) => {
    for (const attr of Array.from(element.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim();
      const lowerValue = value.toLowerCase();
      if (name.startsWith("on") || name === "srcdoc") {
        element.removeAttribute(attr.name);
        continue;
      }
      if ((name === "href" || name === "src") && /^(javascript:|data:text\/html)/i.test(lowerValue)) {
        element.removeAttribute(attr.name);
        continue;
      }
      if (name === "style") {
        const cleaned = sanitizeCssText(value);
        if (cleaned) {
          element.setAttribute("style", cleaned);
        } else {
          element.removeAttribute(attr.name);
        }
      }
    }
  });

  root.querySelectorAll("style").forEach((element) => {
    element.textContent = scopeCssToMessage(sanitizeCssText(element.textContent ?? ""));
  });

  return root.innerHTML;
}

export function sanitizeCssText(value: string): string {
  return value
    .replace(/@import\s+[^;]+;?/gi, "")
    .replace(/javascript\s*:/gi, "")
    .replace(/expression\s*\([^)]*\)/gi, "")
    .trim();
}

export function scopeCssToMessage(value: string): string {
  return value.replace(/(^|})\s*([^@{}][^{}]*)\s*{/g, (_match, closeBrace: string, selectorBlock: string) => {
    const selectors = selectorBlock
      .split(",")
      .map((selector) => selector.trim())
      .filter(Boolean)
      .map((selector) => `.message-content.rich-html ${selector}`)
      .join(", ");
    return selectors ? `${closeBrace} ${selectors} {` : `${closeBrace} {`;
  });
}

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

export function createAdvisorDrafts(): AdvisorDraft[] {
  const secondary = secondAdvisorPool[Math.floor(Math.random() * secondAdvisorPool.length)];
  if (!secondary) {
    throw new Error("Advisor template pool is empty.");
  }

  return [
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
      relationshipTags: ["advisor-slot", "rough-warning", "survivor-senior"],
    },
    {
      id: "advisor-2",
      ...secondary,
      ocean: { ...secondary.ocean },
      relationshipTags: [...secondary.relationshipTags],
    },
  ];
}

export function advisorDraftsFromSession(session: ClientSessionState): AdvisorDraft[] {
  return session.characters
    .filter((character) => character.profileKind === "advisor-slot")
    .map((character): AdvisorDraft => {
      const handout = session.handouts[character.id];
      const draft: AdvisorDraft = {
        id: character.id,
        anonymousLabel: character.anonymousLabel ?? character.name,
        role: character.role,
        systemPrompt: character.systemPrompt,
        mbti: character.mbti,
        ocean: { ...character.ocean },
        relationshipTags: [...character.relationshipTags],
      };

      if (handout) {
        draft.handout = {
          secret: handout.secret,
          desire: handout.desire,
          objective: handout.objective,
          initialRelationshipToUser: handout.relationshipToUser,
        };
      }

      return draft;
    });
}

export function formatKoreanTime(): string {
  return new Date().toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function findBackgroundUrl(assets: AssetManifest | null, backgroundId?: string): string {
  if (!backgroundId) return "none";
  const found = assets?.backgrounds.find((background) => background.id === backgroundId)?.url;
  return found ? `url("${found}")` : "none";
}

export function findSpriteUrl(
  assets: AssetManifest | null,
  characterId: string | undefined,
  expression: ChatMessage["expression"] | undefined,
): string | null {
  if (!characterId) return null;

  const matchingExpression = expression
    ? assets?.sprites.find((sprite) =>
        sprite.characterId === characterId && sprite.expression === expression && sprite.fullBody,
      )
    : null;
  const fallback = assets?.sprites.find((sprite) => sprite.characterId === characterId && sprite.fullBody);
  return matchingExpression?.url ?? fallback?.url ?? null;
}

export function isPhoneChannelMessage(message: ChatMessage): boolean {
  if (!message.content.trim()) {
    return false;
  }

  // 1. User messages: standard chat (plain text) is phone
  if (message.role === "user") {
    return message.inputMode === "chat" || !message.inputMode;
  }

  // 2. Character messages: advisor-slot is phone
  if (message.role === "character") {
    return message.speakerKind === "advisor-slot";
  }

  // 3. Narrator messages: anonymous chat participants (scenario-crowd) or "[익명 N]" labels are phone
  if (message.role === "narrator") {
    const isAnonymousChat =
      message.speakerKind === "scenario-crowd" ||
      Boolean(message.speakerLabel && message.speakerLabel.includes("익명"));
    return isAnonymousChat;
  }

  // 4. System messages: digital notifications (room-master, 안내, 방장, 초대, 입장) are phone
  if (message.role === "system") {
    const isDigitalNotice =
      message.speakerKind === "room-master" ||
      message.speakerLabel === "[안내]" ||
      message.speakerLabel === "[방장]" ||
      message.content.includes("초대") ||
      message.content.includes("입장 확인") ||
      Boolean(message.isOpeningBeat);
    return isDigitalNotice;
  }

  return false;
}

export function isStageMessage(message: ChatMessage): boolean {
  if (!message.content.trim()) {
    return false;
  }
  return !isPhoneChannelMessage(message);
}

export function getLatestStageMessage(messages: ChatMessage[]): ChatMessage | null {
  return [...messages].reverse().find(isStageMessage) ?? null;
}

export function getStageExpression(
  messages: ChatMessage[],
  stageMessage: ChatMessage | null,
): ChatMessage["expression"] | undefined {
  if (stageMessage?.expression) {
    return stageMessage.expression;
  }

  return [...messages].reverse().find((message) => message.role === "character" && message.expression)?.expression;
}

export function getStageSpeakerLabel(message: ChatMessage | null, fallback: string): string {
  if (!message) return fallback;
  if (message.role === "narrator") return "장면";
  if (message.role === "system") return "알림";
  if (message.role === "user") return message.speakerLabel ?? "나";
  return message.speakerLabel ?? fallback;
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

export function loadEnterToSend(): boolean {
  try {
    const raw = localStorage.getItem(enterToSendStorageKey);
    return raw === null ? true : raw === "1";
  } catch {
    return true;
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

export async function parseOpenAiOAuthJson<T extends { ok?: boolean; error?: string }>(response: Response): Promise<T> {
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

const CLIENT_ACTION_PATTERNS = [
  /^\*[^*]+\*$/, // *행동*
  /^\/\//, // //행동
  /^\/me\s/i, // /me 행동
];

const CLIENT_WHISPER_PATTERNS = [
  /^\(+[^)]+\)+$/, // (혼잣말) 또는 ((혼잣말))
  /^\[혼잣말\]/,
  /^\[독백\]/,
  /^\[내면\]/,
];

export function detectInputModeFromText(text: string): InputMode | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (CLIENT_ACTION_PATTERNS.some((p) => p.test(trimmed))) return "action";
  if (CLIENT_WHISPER_PATTERNS.some((p) => p.test(trimmed))) return "whisper";
  // 일반 텍스트는 null — 현재 토글 상태 유지
  return null;
}

export function hasUserMessages(session: ClientSessionState | null): boolean {
  if (!session) return false;
  return session.messages.some((m) => m.role === "user" && !m.isOpeningBeat);
}
