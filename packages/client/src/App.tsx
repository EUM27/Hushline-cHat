import { FormEvent, useEffect, useRef, useState } from "react";
import { Send, Sparkles } from "lucide-react";
import type {
  AdvisorDraft,
  AssetManifest,
  ChatMessage,
  ModelConnection,
  ModelOption,
  ModelProviderId,
  ProviderProfile,
  SessionState,
} from "@hushline/shared";

interface SessionResponse {
  session: SessionState;
}

interface AdvanceResponse {
  session: SessionState;
}

interface ModelsResponse {
  models: ModelOption[];
}

interface ConnectionStatus {
  tone: "ready" | "warning" | "idle";
  label: string;
  detail: string;
}

interface PersonaDraft {
  name: string;
}

type SetupStep = "persona" | "advisors";

const defaultInput = "";
const connectionStorageKey = "hushline.modelConnections.v1";
const secondAdvisorPool: Array<Pick<AdvisorDraft, "anonymousLabel" | "role" | "systemPrompt" | "mbti" | "ocean" | "relationshipTags">> = [
  {
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
    relationshipTags: ["advisor-slot", "nervous-observer", "hidden-route"],
  },
  {
    anonymousLabel: "[익명 6]",
    role: "채팅 규칙을 많이 알고 있지만 말을 아끼는 익명 참여자",
    systemPrompt:
      "너는 [익명 6]으로 보이는 조언자다. 규칙을 많이 알고 있지만, 말하면 위험해지는 정보는 돌려 말한다.",
    mbti: "INTP",
    ocean: {
      openness: 76,
      conscientiousness: 58,
      extraversion: 24,
      agreeableness: 55,
      neuroticism: 69,
    },
    relationshipTags: ["advisor-slot", "rule-keeper", "cryptic-warning"],
  },
  {
    anonymousLabel: "[익명 12]",
    role: "패닉 직전이지만 위험한 소리를 먼저 알아차리는 익명 참여자",
    systemPrompt:
      "너는 [익명 12]로 보이는 조언자다. 겁이 많고 말이 흔들리지만, 이상한 소리와 시야 끝 움직임을 빨리 알아차린다.",
    mbti: "ISFP",
    ocean: {
      openness: 62,
      conscientiousness: 46,
      extraversion: 28,
      agreeableness: 68,
      neuroticism: 84,
    },
    relationshipTags: ["advisor-slot", "panic-sensor", "sound-cue"],
  },
];

export function App() {
  const [assets, setAssets] = useState<AssetManifest | null>(null);
  const [providerProfiles, setProviderProfiles] = useState<ProviderProfile[]>([]);
  const [session, setSession] = useState<SessionState | null>(null);
  const [setupStep, setSetupStep] = useState<SetupStep>("persona");
  const [personaDraft, setPersonaDraft] = useState<PersonaDraft>({
    name: "",
  });
  const [advisorDrafts, setAdvisorDrafts] = useState<AdvisorDraft[]>(() => createAdvisorDrafts());
  const [input, setInput] = useState(defaultInput);
  const [connections, setConnections] = useState<Record<string, ModelConnection>>(() =>
    loadConnections(),
  );
  const [modelOptions, setModelOptions] = useState<Record<string, ModelOption[]>>({});
  const [modelLoadState, setModelLoadState] = useState<
    Record<string, { loading: boolean; error: string | null }>
  >({});
  const [manualSaveAt, setManualSaveAt] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [revealedMessageCount, setRevealedMessageCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const [assetResponse, providerResponse] = await Promise.all([
        fetch("/api/assets"),
        fetch("/api/provider-profiles"),
      ]);

      if (!assetResponse.ok || !providerResponse.ok) {
        throw new Error("초기 데이터를 열 수 없습니다.");
      }

      const nextAssets = (await assetResponse.json()) as AssetManifest;
      const providerPayload = (await providerResponse.json()) as { profiles: ProviderProfile[] };

      if (!cancelled) {
        setAssets(nextAssets);
        setProviderProfiles(providerPayload.profiles);
      }
    }

    boot().catch((reason: unknown) => {
      if (!cancelled) {
        setError(reason instanceof Error ? reason.message : "초기화 실패");
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(connectionStorageKey, JSON.stringify(connections));
  }, [connections]);

  useEffect(() => {
    logRef.current?.scrollTo({
      top: logRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [revealedMessageCount, session?.messages.length]);

  useEffect(() => {
    if (!session) {
      setRevealedMessageCount(0);
      return;
    }

    setRevealedMessageCount((current) => Math.min(current || 1, session.messages.length));
  }, [session?.id, session?.messages.length]);

  useEffect(() => {
    if (!session || revealedMessageCount >= session.messages.length) {
      return;
    }

    const currentMessage = session.messages[revealedMessageCount];
    const delay = currentMessage?.isOpeningBeat ? 1250 : 650;
    const timeout = window.setTimeout(() => {
      setRevealedMessageCount((current) => Math.min(current + 1, session.messages.length));
    }, delay);

    return () => window.clearTimeout(timeout);
  }, [revealedMessageCount, session]);

  const isSceneOpen = Boolean(session?.scene.hasEnteredScene);
  const backgroundUrl = findBackgroundUrl(assets, session?.scene.backgroundId);
  const visibleMessages = session?.messages.slice(0, revealedMessageCount) ?? [];
  const messageRevealInProgress = Boolean(session && revealedMessageCount < session.messages.length);
  const isOpeningSequence = Boolean(session && session.scene.turnNumber === 0);
  const activeCharacter = session?.characters.find(
    (character) => character.id === session.scene.activeSpeakerId,
  );
  const defaultConnection = connections.default ?? connections.evan;
  const defaultConnectionStatus = getConnectionStatus(defaultConnection, providerProfiles);
  const latestSpeakerLabel = [...visibleMessages]
    .reverse()
    .find((message) => message.speakerLabel)?.speakerLabel;
  const activeSpeakerLabel =
    activeCharacter?.anonymousLabel ?? activeCharacter?.name ?? latestSpeakerLabel ?? "단톡방";
  const shellMode = session
    ? isOpeningSequence
      ? "invitation-open"
      : isSceneOpen
        ? "scene-open"
        : "messenger-open"
    : `setup-open ${setupStep}-step`;

  function handlePersonaContinue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSetupStep("advisors");
  }

  async function handleStart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isStarting) {
      return;
    }

    setIsStarting(true);
    setError(null);

    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          persona: {
            name: personaDraft.name || undefined,
          },
          advisors: advisorDrafts,
        }),
      });

      if (!response.ok) {
        throw new Error("초대장을 열 수 없습니다.");
      }

      const payload = (await response.json()) as SessionResponse;
      setSession(payload.session);
      setRevealedMessageCount(0);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "세션 시작 실패");
    } finally {
      setIsStarting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = input.trim();
    if (!content || !session || isSending) {
      return;
    }

    setInput("");
    setIsSending(true);
    setError(null);
    const nextVisibleCount = session.messages.length + 1;

    try {
      const response = await fetch(`/api/sessions/${session.id}/advance`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content, connections: activeConnections(connections) }),
      });

      if (!response.ok) {
        throw new Error("메시지를 보낼 수 없습니다.");
      }

      const payload = (await response.json()) as AdvanceResponse;
      setSession(payload.session);
      setRevealedMessageCount(Math.min(nextVisibleCount, payload.session.messages.length));
    } catch (reason: unknown) {
      setInput(content);
      setError(reason instanceof Error ? reason.message : "응답 실패");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <main
      className={`app-shell ${shellMode}`}
      style={{ "--scene-bg": `url("${backgroundUrl}")` } as React.CSSProperties}
    >
      <div className="scene-wash" />
      <section className="stage-layout" aria-label="Hushline Chat">
        <aside className="scenario-card" aria-label="현재 시나리오">
          <p className="room-mark">Hushline</p>
          <h1>{session?.scenario.title ?? "학교생활"}</h1>
          <p>{session?.scenario.subtitle ?? "이상공간 단톡방"}</p>
          <div className="trait-row">
            <span>{session?.persona.name ?? "{{유저}}"}</span>
            <span>긴장도 {session?.scene.tension ?? 0}</span>
            <span>위험도 {session?.scene.danger ?? 0}</span>
          </div>
        </aside>

        {session && isOpeningSequence ? (
          <section className="invitation-panel" aria-label="초대 단톡방">
            <header>
              <span className="status-dot" />
              <strong>{session.scenario.title}</strong>
              <span>초대 수신</span>
            </header>
            <div className="invitation-log" ref={logRef}>
              {visibleMessages.map((message) => (
                <MessageBubble key={message.id} message={message} session={session} />
              ))}
              {messageRevealInProgress ? (
                <div className="typing-pulse" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
              ) : null}
            </div>
            {!messageRevealInProgress ? (
              <form className="composer invitation-composer" onSubmit={handleSubmit}>
                <input
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder={session.scenario.interventionPrompt}
                  aria-label="메시지"
                />
                <button type="submit" disabled={isSending} aria-label="보내기">
                  <Send size={20} />
                </button>
              </form>
            ) : null}
          </section>
        ) : session ? (
          <section className="chat-frame" aria-label="채팅">
            <header className="chat-header">
              <div>
                <span className="status-dot" />
                <strong>{activeSpeakerLabel}</strong>
              </div>
              <div className="chat-meta">
                <span>{session.scene.locationId}</span>
                <span className={`api-mode ${defaultConnectionStatus.tone}`}>
                  {defaultConnectionStatus.label}
                </span>
              </div>
            </header>

            <div className="message-log" ref={logRef}>
              {visibleMessages.map((message) => (
                <MessageBubble key={message.id} message={message} session={session} />
              ))}
            </div>

            {error ? <p className="error-line">{error}</p> : null}

            <form className="composer" onSubmit={handleSubmit}>
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={session.scenario.interventionPrompt}
                aria-label="메시지"
                disabled={messageRevealInProgress}
              />
              <button
                type="submit"
                disabled={isSending || !session || messageRevealInProgress}
                aria-label="보내기"
              >
                <Send size={20} />
              </button>
            </form>
          </section>
        ) : setupStep === "persona" ? (
          <section className="persona-panel" aria-label="페르소나 생성">
            <div className="persona-copy">
              <Sparkles size={18} />
              <span>초대 대기 중</span>
            </div>
            <form onSubmit={handlePersonaContinue}>
              <label>
                표시 이름
                <input
                  value={personaDraft.name}
                  onChange={(event) =>
                    setPersonaDraft((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="{{유저}}"
                />
              </label>
              {error ? <p className="error-line setup-error">{error}</p> : null}
              <button type="submit">다음</button>
            </form>
          </section>
        ) : (
          <section className="advisor-panel" aria-label="조언자 생성">
            <div className="persona-copy">
              <Sparkles size={18} />
              <span>익명 조언자 생성</span>
            </div>
            <div className="advisor-list">
              {advisorDrafts.map((advisor) => (
                <article key={advisor.id} className="advisor-card">
                  <strong>{advisor.anonymousLabel}</strong>
                  <p>{advisor.role}</p>
                  <span>{advisor.mbti}</span>
                </article>
              ))}
            </div>
            {error ? <p className="error-line setup-error">{error}</p> : null}
            <div className="advisor-actions">
              <button type="button" onClick={() => setSetupStep("persona")}>
                이전
              </button>
              <button type="button" onClick={() => setAdvisorDrafts(createAdvisorDrafts())}>
                다시 구성
              </button>
              <form onSubmit={handleStart}>
                <button type="submit" disabled={isStarting}>
                  {isStarting ? "연결 중" : "초대 확인"}
                </button>
              </form>
            </div>
          </section>
        )}

        <ConnectionPanel
          profiles={providerProfiles}
          connections={connections}
          modelOptions={modelOptions}
          modelLoadState={modelLoadState}
          saveStatus={manualSaveAt ? `저장됨 ${manualSaveAt}` : "자동 저장됨"}
          connectionStatus={defaultConnectionStatus}
          onChange={(nextConnections) => {
            setManualSaveAt(null);
            setConnections(nextConnections);
          }}
          onLoadModels={loadModels}
          onSave={saveConnections}
        />
      </section>
    </main>
  );

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

      const payload = (await response.json()) as ModelsResponse;
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
    localStorage.setItem(connectionStorageKey, JSON.stringify(connections));
    setManualSaveAt(
      new Date().toLocaleTimeString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    );
  }
}

function ConnectionPanel({
  profiles,
  connections,
  modelOptions,
  modelLoadState,
  saveStatus,
  connectionStatus,
  onChange,
  onLoadModels,
  onSave,
}: {
  profiles: ProviderProfile[];
  connections: Record<string, ModelConnection>;
  modelOptions: Record<string, ModelOption[]>;
  modelLoadState: Record<string, { loading: boolean; error: string | null }>;
  saveStatus: string;
  connectionStatus: ConnectionStatus;
  onChange: (connections: Record<string, ModelConnection>) => void;
  onLoadModels: (providerId: ModelProviderId, apiKey?: string) => void;
  onSave: () => void;
}) {
  const activeConnection = connections.default ?? connections.evan ?? {
    providerId: profiles[0]?.id ?? ("nanogpt" as ModelProviderId),
    apiKey: "",
    model: "",
  };
  const selectedProfile = profiles.find((profile) => profile.id === activeConnection.providerId);
  const selectedModels = modelOptions[activeConnection.providerId] ?? [];
  const modelChoices = activeConnection.model
    ? ensureSelectedModel(selectedModels, activeConnection.model)
    : selectedModels;
  const currentModelLoadState = modelLoadState[activeConnection.providerId] ?? {
    loading: false,
    error: null,
  };

  function updateDefaultConnection(next: Partial<ModelConnection>) {
    const providerId = next.providerId ?? activeConnection.providerId;
    const { evan: _legacyEvan, ...restConnections } = connections;
    onChange({
      ...restConnections,
      default: {
        ...activeConnection,
        ...next,
        providerId,
        model: next.providerId && !next.model ? "" : next.model ?? activeConnection.model,
      },
    });
  }

  return (
    <aside className="connection-panel" aria-label="모델 연결">
      <strong>기본 연결 어댑터</strong>
      <label>
        provider
        <select
          value={activeConnection.providerId}
          onChange={(event) =>
            updateDefaultConnection({ providerId: event.target.value as ModelProviderId })
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
        <div className="model-picker">
          <select
            value={activeConnection.model}
            onChange={(event) => updateDefaultConnection({ model: event.target.value })}
          >
            <option value="">모델 선택</option>
            {modelChoices.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => onLoadModels(activeConnection.providerId, activeConnection.apiKey)}
            disabled={currentModelLoadState.loading}
          >
            {currentModelLoadState.loading ? "로드 중" : "목록"}
          </button>
        </div>
      </label>
      <label className="api-key-field">
        API key
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={activeConnection.apiKey}
          onChange={(event) => updateDefaultConnection({ apiKey: event.target.value })}
          placeholder="브라우저에 자동 저장"
        />
      </label>
      <div className="connection-actions">
        <button type="button" onClick={onSave}>
          저장
        </button>
        <span>{saveStatus}</span>
      </div>
      <div className={`connection-status ${connectionStatus.tone}`}>
        <strong>{connectionStatus.label}</strong>
        <span>{connectionStatus.detail}</span>
      </div>
      <p>{selectedProfile ? `${selectedProfile.baseUrl}${selectedProfile.endpointPath}` : "dry-run"}</p>
      {currentModelLoadState.error ? (
        <p className="connection-error">{currentModelLoadState.error}</p>
      ) : null}
    </aside>
  );
}

function ensureSelectedModel(models: ModelOption[], selectedModelId: string): ModelOption[] {
  if (models.some((model) => model.id === selectedModelId)) {
    return models;
  }

  return [{ id: selectedModelId, label: `${selectedModelId} (저장됨)` }, ...models];
}

function MessageBubble({ message, session }: { message: ChatMessage; session: SessionState }) {
  const character = message.characterId
    ? session.characters.find((candidate) => candidate.id === message.characterId)
    : null;
  const speakerLabel = message.speakerLabel ?? character?.anonymousLabel ?? character?.name;

  return (
    <article className={`message-bubble ${message.role} ${message.speakerKind ?? ""}`}>
      {speakerLabel ? (
        <div className="bubble-title">
          <strong>{speakerLabel}</strong>
        </div>
      ) : null}
      <p>{message.content}</p>
      {message.generationSource === "dry-run" && message.fallbackReason ? (
        <small className="fallback-reason">{message.fallbackReason}</small>
      ) : null}
    </article>
  );
}

function getConnectionStatus(
  connection: ModelConnection | undefined,
  profiles: ProviderProfile[],
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

  if (!connection.apiKey && !connection.model) {
    return {
      tone: "idle",
      label: "dry-run",
      detail: `${providerLabel} 키와 모델을 선택하면 API가 대화에 적용됩니다.`,
    };
  }

  if (!connection.apiKey) {
    return {
      tone: "warning",
      label: "API key 필요",
      detail: `${providerLabel} 모델은 선택됐지만 키가 비어 있습니다.`,
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
    label: "API 적용 중",
    detail: `${providerLabel} / ${connection.model}`,
  };
}

function createAdvisorDrafts(): AdvisorDraft[] {
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

function findBackgroundUrl(assets: AssetManifest | null, backgroundId?: string): string {
  return (
    assets?.backgrounds.find((background) => background.id === backgroundId)?.url ??
    "/assets/backgrounds/messenger-blank.svg"
  );
}

function loadConnections(): Record<string, ModelConnection> {
  try {
    const raw = localStorage.getItem(connectionStorageKey);
    if (!raw) {
      return {};
    }
    return JSON.parse(raw) as Record<string, ModelConnection>;
  } catch {
    return {};
  }
}

function activeConnections(
  connections: Record<string, ModelConnection>,
): Record<string, ModelConnection> {
  const active = Object.fromEntries(
    Object.entries(connections).filter(
      ([, connection]) =>
        connection.providerId && connection.apiKey.trim() && connection.model.trim(),
    ),
  );
  const primaryConnection = active.default ?? active.evan ?? Object.values(active)[0];

  if (primaryConnection && !active.default) {
    return {
      default: primaryConnection,
      ...active,
    };
  }

  return active;
}
