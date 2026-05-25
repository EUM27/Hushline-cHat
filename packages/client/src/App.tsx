import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { Send, Sparkles, MessageSquare, Zap, MessageCircle, Plus, RotateCcw, Undo2, SkipForward } from "lucide-react";
import type {
  AdvisorDraft,
  AssetManifest,
  ChatMessage,
  InputMode,
  ModelConnection,
  ModelOption,
  ModelProviderId,
  ProviderProfile,
  ClientSessionState,
} from "@hushline/shared";
import { advanceV2, createSessionV2, getScenarioDetail, getSessionV2, listScenarios, rerollV2, undoV2, type V2ScenarioDetailResponse } from "./api-v2";
import { appendOptimisticUserMessage } from "./optimistic-session";
import { calculateRevealDelay } from "./reveal-timing";

interface ModelsResponse {
  models: ModelOption[];
}

interface OpenAiOAuthAccount {
  connected?: boolean;
  email?: string;
  planType?: string;
}

interface OpenAiOAuthLoginResult {
  ok: boolean;
  authorizeUrl?: string;
  account?: OpenAiOAuthAccount | null;
  error?: string;
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
const enterToSendStorageKey = "hushline.enterToSend.v1";

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
  const [session, setSession] = useState<ClientSessionState | null>(null);
  const [setupStep, setSetupStep] = useState<SetupStep>("scenario");
  const [scenarioList, setScenarioList] = useState<string[]>([]);
  const [isScenarioListLoading, setIsScenarioListLoading] = useState(true);
  const [scenarioListError, setScenarioListError] = useState<string | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<string>("");
  const [selectedScenarioDetail, setSelectedScenarioDetail] = useState<V2ScenarioDetailResponse | null>(null);
  const [personaDraft, setPersonaDraft] = useState<PersonaDraft>({
    name: "",
  });
  const [advisorDrafts, setAdvisorDrafts] = useState<AdvisorDraft[]>(() => createAdvisorDrafts());
  const [input, setInput] = useState(defaultInput);
  const [inputMode, setInputMode] = useState<InputMode>("chat");
  const [enterToSend, setEnterToSend] = useState(() => loadEnterToSend());
  const [connections, setConnections] = useState<Record<string, ModelConnection>>(() =>
    loadConnections(),
  );
  const [modelOptions, setModelOptions] = useState<Record<string, ModelOption[]>>({});
  const [modelLoadState, setModelLoadState] = useState<
    Record<string, { loading: boolean; error: string | null }>
  >({});
  const [oauthStatus, setOauthStatus] = useState<string | null>(null);
  const [manualSaveAt, setManualSaveAt] = useState<string | null>(null);
  const [connectionSaveError, setConnectionSaveError] = useState<string | null>(null);
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

      // 저장된 세션 복원
      const savedSessionId = localStorage.getItem(sessionStorageKey);
      if (savedSessionId && !cancelled) {
        try {
          const savedSession = await getSessionV2(savedSessionId);
          if (savedSession && !cancelled) {
            setSession(savedSession);
            setRevealedMessageCount(savedSession.messages.length);
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
    let cancelled = false;
    setIsScenarioListLoading(true);
    setScenarioListError(null);

    listScenarios()
      .then((scenarios) => {
        if (!cancelled) {
          setScenarioList(scenarios);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setScenarioList([]);
          setScenarioListError(reason instanceof Error ? reason.message : "시나리오 목록을 불러올 수 없습니다.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsScenarioListLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

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
    localStorage.setItem(enterToSendStorageKey, enterToSend ? "1" : "0");
  }, [enterToSend]);

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

    const currentMessage = session.messages[Math.max(0, revealedMessageCount - 1)];
    const delay = currentMessage ? calculateRevealDelay(currentMessage) : 650;
    const timeout = window.setTimeout(() => {
      setRevealedMessageCount((current) => Math.min(current + 1, session.messages.length));
    }, delay);

    return () => window.clearTimeout(timeout);
  }, [revealedMessageCount, session]);

  useEffect(() => {
    if (!selectedScenario) {
      setSelectedScenarioDetail(null);
      return;
    }

    let cancelled = false;
    setSelectedScenarioDetail(null);
    setError(null);

    getScenarioDetail(selectedScenario)
      .then((detail) => {
        if (!cancelled) {
          setSelectedScenarioDetail(detail);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "시나리오 정보를 불러올 수 없습니다.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedScenario]);

  const slots = useMemo<ConnectionSlot[]>(
    () => buildConnectionSlots(session, selectedScenarioDetail),
    [session, selectedScenarioDetail],
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
    .find((message) => message.role === "character" && message.speakerLabel)?.speakerLabel;
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

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing || event.key !== "Enter") {
      return;
    }
    if (event.shiftKey) {
      return;
    }
    if (enterToSend || event.ctrlKey || event.metaKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  function handlePersonaContinue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedScenario) return;

    const hasAdvisors = (selectedScenarioDetail?.characters.length ?? 0) > 0;
    if (!hasAdvisors) {
      setSetupStep("advisors");
      return;
    }

    setIsStarting(true);
    setError(null);

    createSessionV2(selectedScenario, personaDraft.name || undefined, undefined, activeConnections(connections))
      .then((nextSession) => {
        setSession(nextSession);
        setRevealedMessageCount(0);
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "세션 시작 실패");
      })
      .finally(() => {
        setIsStarting(false);
      });
  }

  async function handleStart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isStarting) {
      return;
    }

    setIsStarting(true);
    setError(null);

    try {
      const nextSession = await createSessionV2(
        selectedScenario || "school-life-anomaly",
        personaDraft.name || undefined,
        advisorDrafts,
        activeConnections(connections),
      );
      setSession(nextSession);
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
    const baseSession = session;
    const optimisticSession = appendOptimisticUserMessage(baseSession, content, inputMode);
    const nextVisibleCount = optimisticSession.messages.length;
    setSession(optimisticSession);
    setRevealedMessageCount(nextVisibleCount);

    try {
      const payload = await advanceV2(baseSession.id, content, inputMode, activeConnections(connections));
      setSession(payload.session);
      setRevealedMessageCount(Math.min(nextVisibleCount, payload.session.messages.length));
    } catch (reason: unknown) {
      setSession(baseSession);
      setRevealedMessageCount(baseSession.messages.length);
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
      const payload = await rerollV2(session.id, activeConnections(connections), inputMode);
      setSession(payload.session);
      setRevealedMessageCount(payload.session.messages.length);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "리롤 실패");
    } finally {
      setIsSending(false);
    }
  }

  function handleSkipReveal() {
    if (!session) return;
    setRevealedMessageCount(session.messages.length);
  }

  async function handleUndo() {
    if (!session || isSending) return;
    setIsSending(true);
    setError(null);
    try {
      const nextSession = await undoV2(session.id);
      setSession(nextSession);
      setRevealedMessageCount(nextSession.messages.length);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "삭제 실패");
    } finally {
      setIsSending(false);
    }
  }

  async function handleRestartSession() {
    if (!session || isStarting || isSending) return;
    setIsStarting(true);
    setError(null);
    try {
      const restartAdvisors = advisorDraftsFromSession(session);
      const nextSession = await createSessionV2(
        session.scenario.id,
        session.persona.name || undefined,
        restartAdvisors.length > 0 ? restartAdvisors : undefined,
        activeConnections(connections),
      );
      setSession(nextSession);
      setRevealedMessageCount(0);
      localStorage.setItem(sessionStorageKey, nextSession.id);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "재시작 실패");
    } finally {
      setIsStarting(false);
    }
  }

  function handleNewGame() {
    setSession(null);
    setRevealedMessageCount(0);
    setInput("");
    setError(null);
    setSetupStep("scenario");
    setSelectedScenario("");
    setSelectedScenarioDetail(null);
    localStorage.removeItem(sessionStorageKey);
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
            <TurnActions
              canModifyTurn={hasUserMessages(session)}
              isStarting={isStarting}
              isSending={isSending}
              messageRevealInProgress={messageRevealInProgress}
              onNewGame={handleNewGame}
              onRestart={handleRestartSession}
              onUndo={handleUndo}
              onReroll={handleReroll}
              onSkipReveal={handleSkipReveal}
            />
            <form className="composer invitation-composer" onSubmit={handleSubmit}>
              <ComposerOptions
                mode={inputMode}
                enterToSend={enterToSend}
                onModeChange={setInputMode}
                onEnterToSendChange={setEnterToSend}
              />
              <textarea
                value={input}
                onChange={(event) => handleInputChange(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder={session.scenario.interventionPrompt}
                aria-label="메시지"
                rows={1}
              />
              <button type="submit" disabled={isSending} aria-label="보내기">
                <Send size={20} />
              </button>
            </form>
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
                  providerProfiles={providerProfiles}
                />
              ))}
            </div>

            {error ? <p className="error-line">{error}</p> : null}

            <TurnActions
              canModifyTurn={hasUserMessages(session)}
              isStarting={isStarting}
              isSending={isSending}
              messageRevealInProgress={messageRevealInProgress}
              onNewGame={handleNewGame}
              onRestart={handleRestartSession}
              onUndo={handleUndo}
              onReroll={handleReroll}
              onSkipReveal={handleSkipReveal}
            />

            <form className="composer" onSubmit={handleSubmit}>
              <ComposerOptions
                mode={inputMode}
                enterToSend={enterToSend}
                onModeChange={setInputMode}
                onEnterToSendChange={setEnterToSend}
              />
              <textarea
                value={input}
                onChange={(event) => handleInputChange(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder={
                  inputMode === "action"
                    ? "행동을 입력하세요 (*별표* 또는 버튼)"
                    : inputMode === "whisper"
                      ? "혼잣말... ((괄호)로도 입력 가능)"
                      : session.scenario.interventionPrompt
                }
                aria-label="메시지"
                rows={1}
              />
              <button
                type="submit"
                disabled={isSending || !session}
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
              {isScenarioListLoading ? (
                <p className="scenario-empty">시나리오 팩을 불러오는 중...</p>
              ) : scenarioListError ? (
                <p className="error-line setup-error">{scenarioListError}</p>
              ) : scenarioList.length === 0 ? (
                <p className="scenario-empty">사용 가능한 시나리오 팩이 없습니다.</p>
              ) : (
                <select
                  className="scenario-dropdown"
                  value={selectedScenario}
                  onChange={(e) => {
                    setSelectedScenario(e.target.value);
                  }}
                >
                  <option value="" disabled>시나리오를 선택하세요</option>
                  {scenarioList.map((packId) => (
                    <option key={packId} value={packId}>
                      {packId.replace(/-/g, " ")}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {selectedScenarioDetail && (
              <div className="scenario-detail-box">
                <div className="scenario-detail-header">
                  <div className="scenario-detail-meta">
                    <span className="scenario-badge genre-badge">{selectedScenarioDetail.manifest.genre}</span>
                    <span className="scenario-badge version-badge">v{selectedScenarioDetail.manifest.version}</span>
                  </div>
                  <h2 className="scenario-detail-title">
                    {selectedScenarioDetail.scenarioCard.title || selectedScenarioDetail.manifest.title}
                  </h2>
                  <p className="scenario-detail-subtitle">
                    {selectedScenarioDetail.scenarioCard.subtitle || selectedScenarioDetail.manifest.subtitle}
                  </p>
                </div>
                <div className="scenario-detail-body">
                  <div className="scenario-section">
                    <h3>시나리오 개요</h3>
                    <p className="scenario-description">{selectedScenarioDetail.scenarioCard.description}</p>
                  </div>
                  <div className="scenario-section">
                    <h3>핵심 목표</h3>
                    <p className="scenario-objective">🎯 {selectedScenarioDetail.mainObjective.description}</p>
                  </div>
                  <div className="scenario-section">
                    <h3>등장 인물 ({selectedScenarioDetail.characters.length}명)</h3>
                    <div className="scenario-characters-preview">
                      {selectedScenarioDetail.characters.map((char) => (
                        <div key={char.id} className="scenario-char-preview-badge">
                          <strong>{char.name}</strong>
                          <span>{char.role}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {error ? <p className="error-line setup-error">{error}</p> : null}
            <button
              type="button"
              disabled={!selectedScenario || !selectedScenarioDetail}
              onClick={() => setSetupStep("persona")}
            >
              {selectedScenario && !selectedScenarioDetail ? "불러오는 중..." : "다음"}
            </button>
          </section>
        ) : setupStep === "persona" ? (
          <section className="persona-panel" aria-label="유저 설정">
            <div className="persona-copy">
              <Sparkles size={18} />
              <span>유저 기본 설정</span>
            </div>
            <div className="advisor-list">
              <article className="advisor-card">
                <strong>{personaDraft.name || "{{유저}}"}</strong>
                <p>사건의 중심에 선 주인공. 선택과 대화로 상황의 흐름을 결정합니다.</p>
                <span>플레이어</span>
              </article>
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
              <div className="advisor-actions" style={{ gridTemplateColumns: "auto 1fr" }}>
                <button type="button" onClick={() => setSetupStep("scenario")}>
                  이전
                </button>
                <button type="submit" disabled={isStarting}>
                  {selectedScenarioDetail && selectedScenarioDetail.characters.length > 0
                    ? isStarting
                      ? "초대 중..."
                      : "초대 확인"
                    : "다음"}
                </button>
              </div>
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
          oauthStatus={oauthStatus}
          saveStatus={connectionSaveError ?? (manualSaveAt ? `저장됨 ${manualSaveAt}` : "브라우저에 자동 저장됨")}
          onChange={(nextConnections) => {
            setManualSaveAt(null);
            setConnections(nextConnections);
          }}
          onLoadModels={loadModels}
          onOpenChatGptLogin={openChatGptLogin}
          onCheckChatGptAccount={checkChatGptAccount}
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
      if (!payload.account.connected) {
        setOauthStatus("ChatGPT 로그인이 필요합니다.");
        return;
      }
      const plan = payload.account.planType ? ` · ${payload.account.planType}` : "";
      setOauthStatus(`${payload.account.email ?? "ChatGPT"} 연결됨${plan}`);
    } catch (reason: unknown) {
      setOauthStatus(reason instanceof Error ? reason.message : "ChatGPT 연결을 확인하지 못했습니다.");
    }
  }
}

function DevPanel({ session }: { session: ClientSessionState }) {
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
        <ul className="model-dropdown" onMouseDown={(event) => event.preventDefault()}>
          {filtered.map((m) => (
            <li
              key={m.id}
              onMouseDown={() => handleSelect(m.id)}
              className={m.id === value ? "selected" : ""}
            >
              <span className="model-dropdown-id">{m.id}</span>
              {m.label !== m.id && <span className="model-dropdown-label">{m.label}</span>}
            </li>
          ))}
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
  oauthStatus,
  saveStatus,
  onChange,
  onLoadModels,
  onOpenChatGptLogin,
  onCheckChatGptAccount,
  onSave,
}: {
  profiles: ProviderProfile[];
  slots: ConnectionSlot[];
  activeSlotKey: string;
  onSelectSlot: (key: string) => void;
  connections: Record<string, ModelConnection>;
  modelOptions: Record<string, ModelOption[]>;
  modelLoadState: Record<string, { loading: boolean; error: string | null }>;
  oauthStatus: string | null;
  saveStatus: string;
  onChange: (connections: Record<string, ModelConnection>) => void;
  onLoadModels: (providerId: ModelProviderId, apiKey?: string) => void;
  onOpenChatGptLogin: () => void;
  onCheckChatGptAccount: () => void;
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
  const usesChatGptOAuth = currentConnection.providerId === "chatgpt";
  const inheritedApiKey = getSharedProviderApiKey(connections, currentConnection.providerId, slotKey);
  const effectiveApiKey = currentConnection.apiKey.trim() || inheritedApiKey;
  const slotStatus = getConnectionStatus(connections[slotKey], profiles, inheritedApiKey);

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
      {usesChatGptOAuth && oauthStatus ? (
        <p className="connection-error">{oauthStatus}</p>
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

function TurnActions({
  canModifyTurn,
  isStarting,
  isSending,
  messageRevealInProgress,
  onNewGame,
  onRestart,
  onUndo,
  onReroll,
  onSkipReveal,
}: {
  canModifyTurn: boolean;
  isStarting: boolean;
  isSending: boolean;
  messageRevealInProgress: boolean;
  onNewGame: () => void;
  onRestart: () => void;
  onUndo: () => void;
  onReroll: () => void;
  onSkipReveal: () => void;
}) {
  const sessionBusy = isStarting || isSending || messageRevealInProgress;
  const turnBusy = isSending || messageRevealInProgress || !canModifyTurn;

  return (
    <div className="turn-actions">
      {messageRevealInProgress ? (
        <button
          type="button"
          className="turn-action-btn skip-reveal"
          onClick={onSkipReveal}
          title="남은 메시지 바로 표시"
        >
          <SkipForward size={14} aria-hidden="true" />
          <span>스킵</span>
        </button>
      ) : null}
      <button
        type="button"
        className="turn-action-btn"
        disabled={sessionBusy}
        onClick={onNewGame}
        title="현재 세션을 닫고 시나리오 선택으로 돌아가기"
      >
        <Plus size={14} aria-hidden="true" />
        <span>새 게임</span>
      </button>
      <button
        type="button"
        className="turn-action-btn"
        disabled={sessionBusy}
        onClick={onRestart}
        title="같은 시나리오를 처음부터 다시 시작"
      >
        <RotateCcw size={14} aria-hidden="true" />
        <span>처음부터</span>
      </button>
      <button
        type="button"
        className="turn-action-btn"
        disabled={turnBusy}
        onClick={onUndo}
        title="마지막 턴 삭제"
      >
        <Undo2 size={14} aria-hidden="true" />
        <span>삭제</span>
      </button>
      <button
        type="button"
        className="turn-action-btn"
        disabled={turnBusy}
        onClick={onReroll}
        title="마지막 응답 리롤"
      >
        <Sparkles size={14} aria-hidden="true" />
        <span>리롤</span>
      </button>
    </div>
  );
}

function MessageBubble({
  message,
  session,
  providerProfiles,
}: {
  message: ChatMessage;
  session: ClientSessionState;
  providerProfiles: ProviderProfile[];
}) {
  const character = message.characterId
    ? session.characters.find((candidate) => candidate.id === message.characterId)
    : null;
  const speakerLabel = message.speakerLabel ?? character?.anonymousLabel ?? character?.name;
  const visibleSpeakerLabel = getVisibleSpeakerLabel(message, speakerLabel);
  const sourceBadge = getSourceBadge(message, providerProfiles);
  const semanticLabel = getSemanticMessageLabel(message);

  return (
    <article
      className={`message-bubble ${message.role} ${message.speakerKind ?? ""} ${message.inputMode ? `mode-${message.inputMode}` : ""}`}
      aria-label={semanticLabel}
    >
      {visibleSpeakerLabel ? (
        <div className="bubble-title">
          <strong>{visibleSpeakerLabel}</strong>
          {sourceBadge ? (
            <span className={`source-badge ${sourceBadge.tone}`}>{sourceBadge.label}</span>
          ) : null}
        </div>
      ) : null}
      <MessageContent content={message.content} />
      {message.generationSource === "dry-run" && message.fallbackReason ? (
        <small className="fallback-reason">{message.fallbackReason}</small>
      ) : null}
    </article>
  );
}

function getVisibleSpeakerLabel(message: ChatMessage, speakerLabel?: string): string | null {
  if (message.role === "narrator" || message.role === "system") {
    return null;
  }
  return speakerLabel ?? null;
}

function getSemanticMessageLabel(message: ChatMessage): string | undefined {
  if (message.role === "narrator") {
    return "나레이터";
  }
  if (message.role === "system") {
    return "시스템";
  }
  return undefined;
}

function MessageContent({ content }: { content: string }) {
  if (!looksLikeRichHtml(content)) {
    return <div className="message-content">{content}</div>;
  }

  return (
    <div
      className="message-content rich-html"
      dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(content) }}
    />
  );
}

function looksLikeRichHtml(content: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(content);
}

function sanitizeRichHtml(raw: string): string {
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

function sanitizeCssText(value: string): string {
  return value
    .replace(/@import\s+[^;]+;?/gi, "")
    .replace(/javascript\s*:/gi, "")
    .replace(/expression\s*\([^)]*\)/gi, "")
    .trim();
}

function scopeCssToMessage(value: string): string {
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

function getSourceBadge(
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

function getConnectionStatus(
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

function buildConnectionSlots(
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

function advisorDraftsFromSession(session: ClientSessionState): AdvisorDraft[] {
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

function formatKoreanTime(): string {
  return new Date().toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
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

function persistConnections(
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

function loadEnterToSend(): boolean {
  try {
    const raw = localStorage.getItem(enterToSendStorageKey);
    return raw === null ? true : raw === "1";
  } catch {
    return true;
  }
}

function activeConnections(
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

function getSharedProviderApiKey(
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

function ComposerOptions({
  mode,
  enterToSend,
  onModeChange,
  onEnterToSendChange,
}: {
  mode: InputMode;
  enterToSend: boolean;
  onModeChange: (mode: InputMode) => void;
  onEnterToSendChange: (enabled: boolean) => void;
}) {
  return (
    <div className="composer-options">
      <InputModeToggle mode={mode} onChange={onModeChange} />
      <label className="enter-send-toggle">
        <input
          type="checkbox"
          checked={enterToSend}
          onChange={(event) => onEnterToSendChange(event.target.checked)}
        />
        <span>Enter 전송</span>
      </label>
    </div>
  );
}

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

function hasUserMessages(session: ClientSessionState | null): boolean {
  if (!session) return false;
  return session.messages.some((m) => m.role === "user" && !m.isOpeningBeat);
}
