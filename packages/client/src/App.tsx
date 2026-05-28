import { type FormEvent, type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Compass, RotateCcw, Settings, Sparkles, Wrench } from "lucide-react";
import type {
  AdvisorDraft,
  AssetManifest,
  InputMode,
  ModelConnection,
  ModelOption,
  ModelProviderId,
  ProviderProfile,
  ClientSessionState,
  BoundaryReport,
  CaseRuntimeTrace,
  StateLawSnapshot,
} from "@hushline/shared";
import { advanceV2, createSessionV2, getScenarioDetail, getSessionV2, listScenarios, rerollV2, undoV2, type V2ScenarioDetailResponse } from "./api-v2";
import { appendOptimisticUserMessage } from "./optimistic-session";
import { resolveCharacterExpressionPose } from "./character-expression";
import type { ConnectionSlot, VisualThemeId, VisualThemePreset, OpenAiOAuthLoginResult, OpenAiOAuthAccount } from "./types/ui";
import {
  connectionStorageKey,
  sessionStorageKey,
  visualThemeOrder,
  visualThemePresets,
} from "./constants/theme-presets";
import {
  activeConnections,
  advisorDraftsFromSession,
  buildConnectionSlots,
  createAdvisorDrafts,
  createVisualThemeStyle,
  findBackgroundUrl,
  formatKoreanTime,
  getConnectionStatus,
  loadConnections,
  loadEnterToSend,
  persistConnections,
} from "./utils/ui-helpers";
import { PhoneSubScreen } from "./components/PhoneSubScreen";
import { VisualNovelMainScreen } from "./components/VisualNovelMainScreen";
import { ConnectionPanel } from "./components/ConnectionPanel";
import { DevPanel } from "./components/DevPanel";
import { DirectorLawPanel } from "./components/DirectorLawPanel";

const defaultInputMode: InputMode = "chat";

export function App() {
  const [assets, setAssets] = useState<AssetManifest | null>(null);
  const [providerProfiles, setProviderProfiles] = useState<ProviderProfile[]>([]);
  const [session, setSession] = useState<ClientSessionState | null>(null);
  const [setupStep, setSetupStep] = useState<"scenario" | "persona" | "advisors">("scenario");
  const [scenarioList, setScenarioList] = useState<string[]>([]);
  const [isScenarioListLoading, setIsScenarioListLoading] = useState(true);
  const [scenarioListError, setScenarioListError] = useState<string | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<string>("");
  const [selectedScenarioDetail, setSelectedScenarioDetail] = useState<V2ScenarioDetailResponse | null>(null);
  const [personaDraft, setPersonaDraft] = useState({ name: "" });
  const [advisorDrafts, setAdvisorDrafts] = useState<AdvisorDraft[]>(() => createAdvisorDrafts());
  const [chatInput, setChatInput] = useState("");
  const [actionInput, setActionInput] = useState("");
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
  const [isStarting, setIsStarting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [revealedMessageCount, setRevealedMessageCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isConnectionPanelOpen, setIsConnectionPanelOpen] = useState(false);
  const [isDevPanelOpen, setIsDevPanelOpen] = useState(false);
  const [rightToolMode, setRightToolMode] = useState<"connections" | "law">("connections");
  const [lastBoundaryReport, setLastBoundaryReport] = useState<BoundaryReport | null>(null);
  const [lastStateLaw, setLastStateLaw] = useState<StateLawSnapshot | null>(null);
  const [lastCaseRuntime, setLastCaseRuntime] = useState<CaseRuntimeTrace | null>(null);
  const [visualThemeId, setVisualThemeId] = useState<VisualThemeId>("moonlight");
  const [isVisualThemeOpen, setIsVisualThemeOpen] = useState(false);
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
            setLastBoundaryReport(null);
            setLastStateLaw(null);
            setLastCaseRuntime(null);
            setRevealedMessageCount(savedSession.messages.length);
          } else {
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
    localStorage.setItem("hushline.enterToSend.v1", enterToSend ? "1" : "0");
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
  const visualTheme = visualThemePresets[visualThemeId];
  const shellMode = session
    ? isOpeningSequence
      ? "invitation-open"
      : isSceneOpen
        ? "scene-open"
        : "messenger-open"
    : `setup-open ${setupStep}-step`;

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>, _mode: "chat" | "action") {
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
        setLastBoundaryReport(null);
        setLastStateLaw(null);
        setLastCaseRuntime(null);
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
      setLastBoundaryReport(null);
      setLastStateLaw(null);
      setLastCaseRuntime(null);
      setRevealedMessageCount(0);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "세션 시작 실패");
    } finally {
      setIsStarting(false);
    }
  }

  async function submitEngineInput(content: string, mode: InputMode): Promise<boolean> {
    if (!content || !session || isSending) {
      return false;
    }

    setIsSending(true);
    setError(null);
    const baseSession = session;
    const optimisticSession = appendOptimisticUserMessage(baseSession, content, mode);
    const nextVisibleCount = optimisticSession.messages.length;
    setSession(optimisticSession);
    setRevealedMessageCount(nextVisibleCount);

    try {
      const payload = await advanceV2(baseSession.id, content, mode, activeConnections(connections));
      setSession(payload.session);
      setLastBoundaryReport(payload.turn.boundaryReport);
      setLastStateLaw(payload.turn.stateLaw);
      setLastCaseRuntime(payload.turn.caseRuntime ?? null);
      setRevealedMessageCount(Math.min(nextVisibleCount, payload.session.messages.length));
      return true;
    } catch (reason: unknown) {
      setSession(baseSession);
      setRevealedMessageCount(baseSession.messages.length);
      setError(reason instanceof Error ? reason.message : "응답 실패");
      return false;
    } finally {
      setIsSending(false);
    }
  }

  async function handleChatSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = chatInput.trim();
    if (!content) {
      return;
    }

    setChatInput("");
    const didSubmit = await submitEngineInput(content, "chat");
    if (!didSubmit) {
      setChatInput(content);
    }
  }

  async function handleActionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = actionInput.trim();
    if (!content) {
      return;
    }

    setActionInput("");
    const didSubmit = await submitEngineInput(content, "action");
    if (!didSubmit) {
      setActionInput(content);
    }
  }

  async function handleReroll() {
    if (!session || isSending) return;
    setIsSending(true);
    setError(null);
    try {
      const payload = await rerollV2(session.id, activeConnections(connections), defaultInputMode);
      setSession(payload.session);
      setLastBoundaryReport(payload.turn.boundaryReport);
      setLastStateLaw(payload.turn.stateLaw);
      setLastCaseRuntime(payload.turn.caseRuntime ?? null);
      setRevealedMessageCount(payload.session.messages.length);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "리롤 실패");
    } finally {
      setIsSending(false);
    }
  }

  function handleAdvanceDialogue() {
    if (!session) return;
    setRevealedMessageCount((current) => Math.min(Math.max(current, 1) + 1, session.messages.length));
  }

  async function handleUndo() {
    if (!session || isSending) return;
    setIsSending(true);
    setError(null);
    try {
      const nextSession = await undoV2(session.id);
      setSession(nextSession);
      setLastCaseRuntime(null);
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
      setLastBoundaryReport(null);
      setLastStateLaw(null);
      setLastCaseRuntime(null);
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
    setChatInput("");
    setActionInput("");
    setError(null);
    setLastBoundaryReport(null);
    setLastStateLaw(null);
    setLastCaseRuntime(null);
    setSetupStep("scenario");
    setSelectedScenario("");
    setSelectedScenarioDetail(null);
    localStorage.removeItem(sessionStorageKey);
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

  const connectionPanel = (
    <ConnectionPanel
      profiles={providerProfiles}
      slots={slots}
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
  );

  return (
    <main
      className={`app-shell ${shellMode}`}
      style={{ "--scene-bg": backgroundUrl } as React.CSSProperties}
    >
      <div className="scene-wash" />
      <section className="stage-layout" aria-label="Hushline Chat">
        {!session ? (
          <aside className="scenario-card" aria-label="현재 시나리오">
            <p className="room-mark">Hushline</p>
            <h1>학교생활</h1>
            <p>이상공간 단톡방</p>
            <div className="trait-row">
              <span>{"{{유저}}"}</span>
              <span>긴장도 0</span>
              <span>위험도 0</span>
            </div>
          </aside>
        ) : null}

        {session ? (
          <ScenarioShell theme={visualTheme}>
            <PhoneSubScreen
              session={session}
              theme={visualTheme}
              visibleMessages={visibleMessages}
              isSending={isSending}
              themeOptions={visualThemeOrder.map((themeId) => visualThemePresets[themeId])}
              isThemeOpen={isVisualThemeOpen}
              chatInput={chatInput}
              onToggleTheme={() => setIsVisualThemeOpen((current) => !current)}
              onSelectTheme={(nextThemeId) => {
                setVisualThemeId(nextThemeId);
                setIsVisualThemeOpen(false);
              }}
              onChatInputChange={setChatInput}
              onChatSubmit={handleChatSubmit}
            />
            <VisualNovelMainScreen
              assets={assets}
              backgroundUrl={backgroundUrl}
              session={session}
              theme={visualTheme}
              tools={
                <AppToolStrip
                  placement="inline"
                  isConnectionPanelOpen={isConnectionPanelOpen}
                  isDevPanelOpen={isDevPanelOpen}
                  showDevTools
                  onToggleConnectionPanel={() => {
                    setRightToolMode("connections");
                    setIsConnectionPanelOpen((current) => !current);
                    setIsDevPanelOpen(false);
                  }}
                  onToggleDevPanel={() => {
                    setIsDevPanelOpen((current) => !current);
                    setIsConnectionPanelOpen(false);
                  }}
                />
              }
              overlays={
                isConnectionPanelOpen || isDevPanelOpen ? (
                  <>
                    {isConnectionPanelOpen ? (
                      <div className="vn-panel-overlay" role="presentation">
                        <button
                          type="button"
                          className="vn-panel-backdrop"
                          aria-label="모델 설정 닫기"
                          onClick={() => setIsConnectionPanelOpen(false)}
                        />
                        <div className="vn-right-tool-panel">
                          <div className="vn-right-tool-tabs" aria-label="오른쪽 개발 도구">
                            <button
                              type="button"
                              className={rightToolMode === "connections" ? "active" : ""}
                              onClick={() => setRightToolMode("connections")}
                            >
                              모델 연결
                            </button>
                            <button
                              type="button"
                              className={rightToolMode === "law" ? "active" : ""}
                              onClick={() => setRightToolMode("law")}
                            >
                              Director Law
                            </button>
                          </div>
                          {rightToolMode === "connections" ? connectionPanel : <DirectorLawPanel stateLaw={lastStateLaw} />}
                        </div>
                      </div>
                    ) : null}
                    {isDevPanelOpen ? (
                      <DevPanel
                        session={session}
                        open
                        theme={visualTheme}
                        boundaryReport={lastBoundaryReport}
                        stateLaw={lastStateLaw}
                        caseRuntime={lastCaseRuntime}
                      />
                    ) : null}
                  </>
                ) : null
              }
              activeSpeakerLabel={activeSpeakerLabel}
              visibleMessages={visibleMessages}
              providerProfiles={providerProfiles}
              defaultConnectionStatus={defaultConnectionStatus}
              messageRevealInProgress={messageRevealInProgress}
              isStarting={isStarting}
              isSending={isSending}
              actionInput={actionInput}
              enterToSend={enterToSend}
              error={error}
              logRef={logRef}
              onActionSubmit={handleActionSubmit}
              onActionInputChange={setActionInput}
              onKeyDown={handleComposerKeyDown}
              onEnterToSendChange={setEnterToSend}
              onNewGame={handleNewGame}
              onRestart={handleRestartSession}
              onUndo={handleUndo}
              onReroll={handleReroll}
              onAdvanceDialogue={handleAdvanceDialogue}
            />
          </ScenarioShell>
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

        {!session ? (
          <AppToolStrip
            placement="floating"
            isConnectionPanelOpen={isConnectionPanelOpen}
            isDevPanelOpen={isDevPanelOpen}
            showDevTools={false}
            onToggleConnectionPanel={() => setIsConnectionPanelOpen((current) => !current)}
            onToggleDevPanel={() => setIsDevPanelOpen((current) => !current)}
          />
        ) : null}

        {!session && isConnectionPanelOpen ? (
          <div className="connection-drawer" role="presentation">
            <button
              type="button"
              className="connection-drawer-backdrop"
              aria-label="모델 설정 닫기"
              onClick={() => setIsConnectionPanelOpen(false)}
            />
            {connectionPanel}
          </div>
        ) : null}
      </section>
    </main>
  );
}

function AppToolStrip({
  placement,
  isConnectionPanelOpen,
  isDevPanelOpen,
  showDevTools,
  onToggleConnectionPanel,
  onToggleDevPanel,
}: {
  placement: "inline" | "floating";
  isConnectionPanelOpen: boolean;
  isDevPanelOpen: boolean;
  showDevTools: boolean;
  onToggleConnectionPanel: () => void;
  onToggleDevPanel: () => void;
}) {
  return (
    <div
      className={`app-tool-strip ${placement} ${isConnectionPanelOpen || isDevPanelOpen ? "overlay-open" : ""}`}
      aria-label="앱 도구"
    >
      <button
        type="button"
        className={`app-tool-toggle ${isConnectionPanelOpen ? "active" : ""}`}
        aria-label={isConnectionPanelOpen ? "모델 설정 닫기" : "모델 설정 열기"}
        aria-expanded={isConnectionPanelOpen}
        onClick={onToggleConnectionPanel}
        title="모델 설정"
      >
        <Settings size={18} aria-hidden="true" />
      </button>

      {showDevTools ? (
        <button
          type="button"
          className={`app-tool-toggle ${isDevPanelOpen ? "active" : ""}`}
          aria-label={isDevPanelOpen ? "개발자 패널 닫기" : "개발자 패널 열기"}
          aria-expanded={isDevPanelOpen}
          onClick={onToggleDevPanel}
          title="개발자 패널"
        >
          <Wrench size={18} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

function ScenarioShell({ children, theme }: { children: ReactNode; theme: VisualThemePreset }) {
  return (
    <section
      className="scenario-shell vn-split-skin text-blue-100 font-sans select-none transition-colors duration-500"
      style={createVisualThemeStyle(theme)}
      aria-label="시나리오 화면"
    >
      {children}
    </section>
  );
}
