import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Send, Sparkles, MessageSquare, Zap, MessageCircle } from "lucide-react";
import type {
  AdvisorDraft,
  AssetManifest,
  ChatMessage,
  InputMode,
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

interface ConnectionSlot {
  key: string;
  title: string;
  subtitle: string;
}

interface PersonaDraft {
  name: string;
}

type SetupStep = "scenario" | "persona" | "advisors";

const defaultInput = "";
const connectionStorageKey = "hushline.modelConnections.v1";
const sessionStorageKey = "hushline.activeSessionId.v1";

const secondAdvisorPool: Array<
  Pick<AdvisorDraft, "anonymousLabel" | "role" | "systemPrompt" | "mbti" | "ocean" | "relationshipTags">
> = [
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
  const [setupStep, setSetupStep] = useState<SetupStep>("scenario");
  const [scenarioList, setScenarioList] = useState<string[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<string>("");
  const [personaDraft, setPersonaDraft] = useState<PersonaDraft>({
    name: "",
  });
  const [advisorDrafts, setAdvisorDrafts] = useState<AdvisorDraft[]>(() => createAdvisorDrafts());
  const [input, setInput] = useState(defaultInput);
  const [inputMode, setInputMode] = useState<InputMode>("chat");
  const [connections, setConnections] = useState<Record<string, ModelConnection>>(() =>
    loadConnections(),
  );
  const [modelOptions, setModelOptions] = useState<Record<string, ModelOption[]>>({});
  const [modelLoadState, setModelLoadState] = useState<
    Record<string, { loading: boolean; error: string | null }>
  >({});
  const [manualSaveAt, setManualSaveAt] = useState<string | null>(null);
  const [activeSlotKey, setActiveSlotKey] = useState<string>("default");
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

      // 시나리오 목록 로드
      try {
        const scenarioResponse = await fetch("/api/v2/scenarios");
        if (scenarioResponse.ok && !cancelled) {
          const scenarioPayload = (await scenarioResponse.json()) as { scenarios: string[] };
          setScenarioList(scenarioPayload.scenarios);
        }
      } catch { /* 무시 */ }

      // 저장된 세션 복원
      const savedSessionId = localStorage.getItem(sessionStorageKey);
      if (savedSessionId && !cancelled) {
        try {
          const sessionResponse = await fetch(`/api/v2/sessions/${savedSessionId}`);
          if (sessionResponse.ok) {
            const payload = (await sessionResponse.json()) as SessionResponse;
            if (!cancelled) {
              setSession(payload.session);
              setRevealedMessageCount(payload.session.messages.length);
            }
          } else {
            // 세션이 서버에 없으면 로컬 키 제거
            localStorage.removeItem(sessionStorageKey);
          }
        } catch {
          localStorage.removeItem(sessionStorageKey);
        }
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
    if (session) {
      localStorage.setItem(sessionStorageKey, session.id);
    }
  }, [session?.id]);

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

  const slots = useMemo<ConnectionSlot[]>(
    () => buildConnectionSlots(session, advisorDrafts),
    [session, advisorDrafts],
  );

  useEffect(() => {
    if (!slots.some((slot) => slot.key === activeSlotKey)) {
      setActiveSlotKey(slots[0]?.key ?? "default");
    }
  }, [slots, activeSlotKey]);

  const isSceneOpen = Boolean(session?.scene.hasEnteredScene);
  const backgroundUrl = findBackgroundUrl(assets, session?.scene.backgroundId);
  const visibleMessages = session?.messages.slice(0, revealedMessageCount) ?? [];
  const messageRevealInProgress = Boolean(session && revealedMessageCount < session.messages.length);
  const isOpeningSequence = Boolean(session && session.scene.turnNumber === 0);
  const activeCharacter = session?.characters.find(
    (character) => character.id === session.scene.activeSpeakerId,
  );
  const defaultConnectionStatus = getConnectionStatus(connections.default, providerProfiles);
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

  function handleInputChange(value: string) {
    setInput(value);
    // 텍스트 컨벤션 자동 감지 — UI 토글을 따라감
    const detected = detectInputModeFromText(value);
    if (detected !== null) setInputMode(detected);
  }

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
      const response = await fetch("/api/v2/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scenarioPackId: selectedScenario || "school-life-anomaly",
          persona: {
            name: personaDraft.name || undefined,
          },
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
      const response = await fetch(`/api/v2/sessions/${session.id}/advance`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content, connections: activeConnections(connections), inputMode }),
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

  async function handleReroll() {
    if (!session || isSending) return;
    setIsSending(true);
    setError(null);
    try {
      const response = await fetch(`/api/v2/sessions/${session.id}/reroll`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ connections: activeConnections(connections), inputMode }),
      });
      if (!response.ok) throw new Error("리롤에 실패했습니다.");
      const payload = (await response.json()) as AdvanceResponse;
      setSession(payload.session);
      setRevealedMessageCount(payload.session.messages.length);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "리롤 실패");
    } finally {
      setIsSending(false);
    }
  }

  async function handleUndo() {
    if (!session || isSending) return;
    setIsSending(true);
    setError(null);
    try {
      const response = await fetch(`/api/v2/sessions/${session.id}/undo`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("삭제에 실패했습니다.");
      const payload = (await response.json()) as { session: SessionState };
      setSession(payload.session);
      setRevealedMessageCount(payload.session.messages.length);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "삭제 실패");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <main
      className={`app-shell ${shellMode}`}
      style={{ "--scene-bg": backgroundUrl } as React.CSSProperties}
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
                <MessageBubble
                  key={message.id}
                  message={message}
                  session={session}
                  slots={slots}
                  connections={connections}
                  providerProfiles={providerProfiles}
                />
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
                <InputModeToggle mode={inputMode} onChange={setInputMode} />
                <input
                  value={input}
                  onChange={(event) => handleInputChange(event.target.value)}
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
                <MessageBubble
                  key={message.id}
                  message={message}
                  session={session}
                  slots={slots}
                  connections={connections}
                  providerProfiles={providerProfiles}
                />
              ))}
            </div>

            {error ? <p className="error-line">{error}</p> : null}

            <div className="turn-actions">
              <button
                type="button"
                className="turn-action-btn"
                disabled={isSending || messageRevealInProgress || !hasUserMessages(session)}
                onClick={handleUndo}
                title="마지막 턴 삭제"
              >
                ↩ 삭제
              </button>
              <button
                type="button"
                className="turn-action-btn"
                disabled={isSending || messageRevealInProgress || !hasUserMessages(session)}
                onClick={handleReroll}
                title="마지막 응답 리롤"
              >
                🎲 리롤
              </button>
            </div>

            <form className="composer" onSubmit={handleSubmit}>
              <InputModeToggle mode={inputMode} onChange={setInputMode} />
              <input
                value={input}
                onChange={(event) => handleInputChange(event.target.value)}
                placeholder={
                  inputMode === "action"
                    ? "행동을 입력하세요 (*별표* 또는 버튼)"
                    : inputMode === "whisper"
                      ? "혼잣말... ((괄호)로도 입력 가능)"
                      : session.scenario.interventionPrompt
                }
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
        ) : setupStep === "scenario" ? (
          <section className="persona-panel" aria-label="시나리오 선택">
            <div className="persona-copy">
              <Sparkles size={18} />
              <span>시나리오 선택</span>
            </div>
            <div className="scenario-list">
              {scenarioList.length === 0 ? (
                <p className="scenario-empty">시나리오 팩을 불러오는 중...</p>
              ) : (
                scenarioList.map((packId) => (
                  <button
                    key={packId}
                    type="button"
                    className={`scenario-card-btn ${selectedScenario === packId ? "selected" : ""}`}
                    onClick={() => setSelectedScenario(packId)}
                  >
                    <strong>{packId.replace(/-/g, " ")}</strong>
                  </button>
                ))
              )}
            </div>
            {error ? <p className="error-line setup-error">{error}</p> : null}
            <button
              type="button"
              disabled={!selectedScenario}
              onClick={() => setSetupStep("persona")}
            >
              다음
            </button>
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
          slots={slots}
          activeSlotKey={activeSlotKey}
          onSelectSlot={setActiveSlotKey}
          connections={connections}
          modelOptions={modelOptions}
          modelLoadState={modelLoadState}
          saveStatus={manualSaveAt ? `저장됨 ${manualSaveAt}` : "자동 저장됨"}
          onChange={(nextConnections) => {
            setManualSaveAt(null);
            setConnections(nextConnections);
          }}
          onLoadModels={loadModels}
          onSave={saveConnections}
        />

        {session && <DevPanel session={session} />}
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

function DevPanel({ session }: { session: SessionState }) {
  const [open, setOpen] = useState(false);

  // v2 세션이면 worldState/handouts가 있음
  const worldState = (session as any).worldState;
  const handouts = (session as any).handouts;
  const scene = session.scene;

  return (
    <aside className={`dev-panel ${open ? "open" : ""}`}>
      <button
        type="button"
        className="dev-panel-toggle"
        onClick={() => setOpen(!open)}
        title="개발자 패널"
      >
        {open ? "✕" : "🔧"}
      </button>
      {open && (
        <div className="dev-panel-content">
          <h3>🔧 Dev Panel</h3>

          <section className="dev-section">
            <h4>World State</h4>
            <div className="dev-grid">
              <span>Tension</span><strong>{worldState?.tension ?? scene?.tension ?? "?"}</strong>
              <span>Danger</span><strong>{worldState?.danger ?? scene?.danger ?? "?"}</strong>
              <span>Turn</span><strong>{worldState?.turnNumber ?? scene?.turnNumber ?? "?"}</strong>
              <span>Location</span><strong>{worldState?.locationId ?? scene?.locationId ?? "?"}</strong>
              <span>Scene Mode</span><strong>{worldState?.sceneMode ?? "?"}</strong>
            </div>
          </section>

          {worldState?.mainObjective && (
            <section className="dev-section">
              <h4>Main Objective</h4>
              <p className="dev-objective">{worldState.mainObjective.description} [{worldState.mainObjective.status}]</p>
            </section>
          )}

          {worldState?.subObjectives?.length > 0 && (
            <section className="dev-section">
              <h4>Sub-Objectives</h4>
              {worldState.subObjectives.map((obj: any) => (
                <p key={obj.id} className="dev-sub-obj">
                  <span className={`dev-status ${obj.status}`}>{obj.status}</span> {obj.description}
                </p>
              ))}
            </section>
          )}

          {handouts && (
            <section className="dev-section">
              <h4>Handouts</h4>
              {Object.entries(handouts).map(([charId, handout]: [string, any]) => (
                <details key={charId} className="dev-handout">
                  <summary>{charId}</summary>
                  <div className="dev-handout-content">
                    <p><strong>비밀:</strong> {handout.secret}</p>
                    <p><strong>욕망:</strong> {handout.desire}</p>
                    <p><strong>목표:</strong> {handout.objective}</p>
                    <p><strong>유저 관계:</strong> {handout.relationshipToUser}</p>
                    <p><strong>Autonomy:</strong> {handout.autonomy}</p>
                    {handout.knownFacts?.length > 0 && (
                      <p><strong>알고 있는 사실:</strong> {handout.knownFacts.join(", ")}</p>
                    )}
                  </div>
                </details>
              ))}
            </section>
          )}

          {worldState?.relationshipGraph?.length > 0 && (
            <section className="dev-section">
              <h4>Relationship Graph</h4>
              {worldState.relationshipGraph.map((edge: any, i: number) => (
                <p key={i} className="dev-edge">
                  {edge.sourceId} → {edge.targetId}: <strong>{edge.descriptor}</strong> ({edge.intensity}/10)
                </p>
              ))}
            </section>
          )}

          {worldState?.characterStates && (
            <section className="dev-section">
              <h4>Character States</h4>
              {Object.entries(worldState.characterStates).map(([id, state]: [string, any]) => (
                <div key={id} className="dev-char-state">
                  <strong>{id}</strong>
                  <span>목표: {state.currentObjective}</span>
                  <span>유저관계: {state.relationshipToUser}</span>
                  <span>마지막 발화: T{state.lastSpokeTurn}</span>
                  <span>Autonomy: {state.autonomy}</span>
                </div>
              ))}
            </section>
          )}

          {worldState?.recentEvents?.length > 0 && (
            <section className="dev-section">
              <h4>Recent Events</h4>
              {worldState.recentEvents.slice(-5).map((evt: any) => (
                <p key={evt.id} className="dev-event">T{evt.turnNumber}: {evt.description}</p>
              ))}
            </section>
          )}
        </div>
      )}
    </aside>
  );
}

function ModelSearchPicker({
  value,
  options,
  loading,
  onSelect,
  onLoadModels,
}: {
  value: string;
  options: ModelOption[];
  loading: boolean;
  onSelect: (modelId: string) => void;
  onLoadModels: () => void;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  const filtered = options.filter(
    (m) =>
      m.id.toLowerCase().includes(query.toLowerCase()) ||
      m.label.toLowerCase().includes(query.toLowerCase()),
  );

  function handleSelect(modelId: string) {
    setQuery(modelId);
    onSelect(modelId);
    setOpen(false);
  }

  function handleInputChange(v: string) {
    setQuery(v);
    setOpen(true);
    // 직접 입력도 모델 ID로 반영
    onSelect(v);
  }

  return (
    <div className="model-search-picker">
      <div className="model-picker">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="모델 ID 검색 또는 직접 입력"
        />
        <button type="button" onClick={onLoadModels} disabled={loading}>
          {loading ? "로드 중" : "목록"}
        </button>
      </div>
      {open && filtered.length > 0 && (
        <ul className="model-dropdown">
          {filtered.slice(0, 30).map((m) => (
            <li
              key={m.id}
              onMouseDown={() => handleSelect(m.id)}
              className={m.id === value ? "selected" : ""}
            >
              <span className="model-dropdown-id">{m.id}</span>
              {m.label !== m.id && <span className="model-dropdown-label">{m.label}</span>}
            </li>
          ))}
          {filtered.length > 30 && (
            <li className="model-dropdown-more">+{filtered.length - 30}개 더...</li>
          )}
        </ul>
      )}
    </div>
  );
}

function ConnectionPanel({
  profiles,
  slots,
  activeSlotKey,
  onSelectSlot,
  connections,
  modelOptions,
  modelLoadState,
  saveStatus,
  onChange,
  onLoadModels,
  onSave,
}: {
  profiles: ProviderProfile[];
  slots: ConnectionSlot[];
  activeSlotKey: string;
  onSelectSlot: (key: string) => void;
  connections: Record<string, ModelConnection>;
  modelOptions: Record<string, ModelOption[]>;
  modelLoadState: Record<string, { loading: boolean; error: string | null }>;
  saveStatus: string;
  onChange: (connections: Record<string, ModelConnection>) => void;
  onLoadModels: (providerId: ModelProviderId, apiKey?: string) => void;
  onSave: () => void;
}) {
  const fallbackProviderId = profiles[0]?.id ?? ("nanogpt" as ModelProviderId);
  const slot = slots.find((candidate) => candidate.key === activeSlotKey) ?? slots[0];
  const slotKey = slot?.key ?? "default";
  const currentConnection =
    connections[slotKey] ??
    ({
      providerId: fallbackProviderId,
      apiKey: "",
      model: "",
    } as ModelConnection);
  const selectedProfile = profiles.find((profile) => profile.id === currentConnection.providerId);
  const providerModels = modelOptions[currentConnection.providerId] ?? [];
  const modelChoices = currentConnection.model
    ? ensureSelectedModel(providerModels, currentConnection.model)
    : providerModels;
  const currentModelLoadState = modelLoadState[currentConnection.providerId] ?? {
    loading: false,
    error: null,
  };
  const slotStatus = getConnectionStatus(connections[slotKey], profiles);

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
        <strong>모델 연결</strong>
        <span className="connection-hint">
          {slotKey === "default"
            ? "슬롯별 키가 없으면 이 연결이 대신 쓰입니다."
            : "이 캐릭터가 말할 차례일 때 이 연결이 쓰입니다."}
        </span>
      </div>

      <div className="slot-tabs" role="tablist">
        {slots.map((candidate) => {
          const tabStatus = getConnectionStatus(connections[candidate.key], profiles);
          const isActive = candidate.key === slotKey;
          return (
            <button
              type="button"
              key={candidate.key}
              role="tab"
              aria-selected={isActive}
              className={`slot-tab ${isActive ? "active" : ""} ${tabStatus.tone}`}
              onClick={() => onSelectSlot(candidate.key)}
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
          onLoadModels={() => onLoadModels(currentConnection.providerId, currentConnection.apiKey)}
        />
      </label>
      <label className="api-key-field">
        API key
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={currentConnection.apiKey}
          onChange={(event) => updateSlotConnection({ apiKey: event.target.value })}
          placeholder="브라우저에 자동 저장"
        />
      </label>
      <div className="connection-actions">
        <button type="button" onClick={onSave}>
          저장
        </button>
        <span>{saveStatus}</span>
      </div>
      <div className={`connection-status ${slotStatus.tone}`}>
        <strong>{slotStatus.label}</strong>
        <span>{slotStatus.detail}</span>
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

function MessageBubble({
  message,
  session,
  slots,
  connections,
  providerProfiles,
}: {
  message: ChatMessage;
  session: SessionState;
  slots: ConnectionSlot[];
  connections: Record<string, ModelConnection>;
  providerProfiles: ProviderProfile[];
}) {
  const character = message.characterId
    ? session.characters.find((candidate) => candidate.id === message.characterId)
    : null;
  const speakerLabel = message.speakerLabel ?? character?.anonymousLabel ?? character?.name;
  const sourceBadge = getSourceBadge(message, character?.id, slots, connections, providerProfiles);

  return (
    <article className={`message-bubble ${message.role} ${message.speakerKind ?? ""} ${message.inputMode ? `mode-${message.inputMode}` : ""}`}>
      {speakerLabel ? (
        <div className="bubble-title">
          <strong>{speakerLabel}</strong>
          {sourceBadge ? (
            <span className={`source-badge ${sourceBadge.tone}`}>{sourceBadge.label}</span>
          ) : null}
        </div>
      ) : null}
      <p>{message.content}</p>
      {message.generationSource === "dry-run" && message.fallbackReason ? (
        <small className="fallback-reason">{message.fallbackReason}</small>
      ) : null}
    </article>
  );
}

function getSourceBadge(
  message: ChatMessage,
  characterId: string | undefined,
  slots: ConnectionSlot[],
  connections: Record<string, ModelConnection>,
  providerProfiles: ProviderProfile[],
): { tone: "api" | "dry-run"; label: string } | null {
  if (message.role !== "character" || !message.generationSource) {
    return null;
  }

  if (message.generationSource === "dry-run") {
    return { tone: "dry-run", label: "dry-run" };
  }

  const slotKey = characterId && slots.some((slot) => slot.key === characterId) ? characterId : "default";
  const connection = connections[slotKey] ?? connections.default;
  if (!connection) {
    return { tone: "api", label: "API" };
  }

  const providerLabel =
    providerProfiles.find((profile) => profile.id === connection.providerId)?.label ??
    connection.providerId;
  return { tone: "api", label: `${providerLabel}/${connection.model}` };
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

function buildConnectionSlots(
  session: SessionState | null,
  drafts: AdvisorDraft[],
): ConnectionSlot[] {
  const characterSlots = session
    ? session.characters.map<ConnectionSlot>((character) => ({
        key: character.id,
        title: character.anonymousLabel ?? character.name,
        subtitle: character.role,
      }))
    : drafts.map<ConnectionSlot>((draft) => ({
        key: draft.id,
        title: draft.anonymousLabel,
        subtitle: draft.role,
      }));

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
  if (!backgroundId) return "none";
  const found = assets?.backgrounds.find((background) => background.id === backgroundId)?.url;
  return found ? `url("${found}")` : "none";
}

function loadConnections(): Record<string, ModelConnection> {
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

function activeConnections(
  connections: Record<string, ModelConnection>,
): Record<string, ModelConnection> {
  const active = Object.fromEntries(
    Object.entries(connections).filter(
      ([, connection]) =>
        connection.providerId && connection.apiKey.trim() && connection.model.trim(),
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

// ---------------------------------------------------------------------------
// Input mode toggle component
// ---------------------------------------------------------------------------

const INPUT_MODE_CONFIG: Array<{
  mode: InputMode;
  label: string;
  icon: React.ReactNode;
  title: string;
}> = [
  {
    mode: "chat",
    label: "채팅",
    icon: <MessageSquare size={14} />,
    title: "채팅 — 단톡방에 메시지를 보냅니다",
  },
  {
    mode: "action",
    label: "행동",
    icon: <Zap size={14} />,
    title: "행동 — 장면 안에서 실제 행동을 취합니다 (*별표* 로도 입력 가능)",
  },
  {
    mode: "whisper",
    label: "혼잣말",
    icon: <MessageCircle size={14} />,
    title: "혼잣말 — 내면의 독백, 다른 참가자에게 들리지 않습니다 ((괄호) 로도 입력 가능)",
  },
];

function InputModeToggle({
  mode,
  onChange,
}: {
  mode: InputMode;
  onChange: (mode: InputMode) => void;
}) {
  return (
    <div className="input-mode-toggle" role="group" aria-label="입력 모드">
      {INPUT_MODE_CONFIG.map((config) => (
        <button
          key={config.mode}
          type="button"
          className={`input-mode-btn ${config.mode} ${mode === config.mode ? "active" : ""}`}
          title={config.title}
          aria-pressed={mode === config.mode}
          onClick={() => onChange(config.mode)}
        >
          {config.icon}
          <span>{config.label}</span>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Text convention detector (client-side mirror of server detectInputMode)
// Returns null if no convention is detected (don't override manual toggle)
// ---------------------------------------------------------------------------

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

function detectInputModeFromText(text: string): InputMode | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (CLIENT_ACTION_PATTERNS.some((p) => p.test(trimmed))) return "action";
  if (CLIENT_WHISPER_PATTERNS.some((p) => p.test(trimmed))) return "whisper";
  // 일반 텍스트는 null — 현재 토글 상태 유지
  return null;
}

function hasUserMessages(session: SessionState | null): boolean {
  if (!session) return false;
  return session.messages.some((m) => m.role === "user" && !m.isOpeningBeat);
}
