import { type FormEvent, type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import type {
  AdvisorDraft,
  InputMode,
} from "@hushline/shared";
import { resolveCharacterExpressionPose } from "./character-expression";
import type { ConnectionSlot, PersonaDraft, VisualThemeId } from "./types/ui";
import {
  visualThemeOrder,
  visualThemePresets,
} from "./constants/theme-presets";
import {
  buildConnectionSlots,
  createAdvisorDrafts,
  findBackgroundUrl,
  getSessionShellMode,
  getConnectionStatus,
  loadEnterToSend,
  activeConnections,
} from "./utils/ui-helpers";
import { generatePersonaDraftV2 } from "./api-v2";
import { PhoneSubScreen } from "./components/PhoneSubScreen";
import { VisualNovelMainScreen } from "./components/VisualNovelMainScreen";
import { ConnectionPanel } from "./components/ConnectionPanel";
import { DevPanel } from "./components/DevPanel";
import { DirectorLawPanel } from "./components/DirectorLawPanel";
import { AppToolStrip } from "./components/AppToolStrip";
import { ScenarioShell } from "./components/ScenarioShell";
import { ScenarioSetupPanel } from "./components/setup/ScenarioSetupPanel";
import { PersonaSetupPanel } from "./components/setup/PersonaSetupPanel";
import { AdvisorSetupPanel } from "./components/setup/AdvisorSetupPanel";
import { useBootData } from "./hooks/useBootData";
import { useScenarioSelection } from "./hooks/useScenarioSelection";
import { useModelConnections } from "./hooks/useModelConnections";
import { useSessionActions } from "./hooks/useSessionActions";

const defaultInputMode: InputMode = "chat";

function createEmptyPersonaDraft(): PersonaDraft {
  return {
    name: "",
    shortName: "",
    role: "",
    description: "",
    appearance: "",
    relationshipTags: [],
  };
}

export function App() {
  const [personaDraft, setPersonaDraft] = useState<PersonaDraft>(() => createEmptyPersonaDraft());
  const [personaPrompt, setPersonaPrompt] = useState("");
  const [relationshipTagText, setRelationshipTagText] = useState("");
  const [isGeneratingPersona, setIsGeneratingPersona] = useState(false);
  const [personaGenerationError, setPersonaGenerationError] = useState<string | null>(null);
  const [advisorDrafts, setAdvisorDrafts] = useState<AdvisorDraft[]>(() => createAdvisorDrafts());
  const [chatInput, setChatInput] = useState("");
  const [actionInput, setActionInput] = useState("");
  const [enterToSend, setEnterToSend] = useState(() => loadEnterToSend());
  const [isConnectionPanelOpen, setIsConnectionPanelOpen] = useState(false);
  const [isPhoneConnectionPanelOpen, setIsPhoneConnectionPanelOpen] = useState(false);
  const [isDevPanelOpen, setIsDevPanelOpen] = useState(false);
  const [rightToolMode, setRightToolMode] = useState<"connections" | "law">("connections");
  const [visualThemeId, setVisualThemeId] = useState<VisualThemeId>("moonlight");
  const [isVisualThemeOpen, setIsVisualThemeOpen] = useState(false);
  const logRef = useRef<HTMLDivElement | null>(null);
  const { assets, providerProfiles, restoredSession, bootError } = useBootData();
  const {
    connections,
    modelOptions,
    modelLoadState,
    connectionTestState,
    oauthAccount,
    oauthChecked,
    oauthStatus,
    saveStatus,
    setConnections,
    loadModels,
    testConnection,
    openChatGptLogin,
    checkChatGptAccount,
    saveConnections,
  } = useModelConnections();
  const {
    session,
    isStarting,
    isSending,
    revealedMessageCount,
    error,
    lastBoundaryReport,
    lastStateLaw,
    lastCaseRuntime,
    lastDirectorOutput,
    setError,
    restoreSession,
    startSession,
    submitEngineInput,
    reroll,
    undo,
    restart,
    newGame,
    advanceDialogue,
  } = useSessionActions(connections, defaultInputMode, {
    chatGptOAuthConnected: oauthAccount?.connected === true,
  });
  const {
    setupStep,
    scenarioList,
    isScenarioListLoading,
    scenarioListError,
    selectedScenario,
    selectedScenarioDetail,
    setSetupStep,
    setSelectedScenario,
    resetScenarioSelection,
  } = useScenarioSelection(setError);

  useEffect(() => {
    if (bootError) {
      setError(bootError);
    }
  }, [bootError]);

  useEffect(() => {
    if (!restoredSession) {
      return;
    }

    restoreSession(restoredSession);
  }, [restoredSession?.id]);

  useEffect(() => {
    localStorage.setItem("hushline.enterToSend.v1", enterToSend ? "1" : "0");
  }, [enterToSend]);

  useEffect(() => {
    logRef.current?.scrollTo({
      top: logRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [revealedMessageCount, session?.messages.length]);

  const slots = useMemo<ConnectionSlot[]>(
    () => buildConnectionSlots(session, selectedScenarioDetail),
    [session, selectedScenarioDetail],
  );

  const backgroundUrl = findBackgroundUrl(assets, session?.scene.backgroundId);
  const visibleMessages = session?.messages.slice(0, revealedMessageCount) ?? [];
  const messageRevealInProgress = Boolean(session && revealedMessageCount < session.messages.length);
  const activeCharacter = session?.characters.find(
    (character) => character.id === session.scene.activeSpeakerId,
  );
  const defaultConnectionStatus = getConnectionStatus(connections.default, providerProfiles, "", {
    chatGptOAuthChecked: oauthChecked,
    chatGptOAuthConnected: oauthAccount?.connected === true,
  });
  const latestSpeakerLabel = [...visibleMessages]
    .reverse()
    .find((message) => message.role === "character" && message.speakerLabel)?.speakerLabel;
  const activeSpeakerLabel =
    activeCharacter?.anonymousLabel ?? activeCharacter?.name ?? latestSpeakerLabel ?? "단톡방";
  const visualTheme = visualThemePresets[visualThemeId];
  const shellMode = session
    ? getSessionShellMode(session)
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

    void startSession(selectedScenario, personaDraft);
  }

  function handlePersonaDraftChange(patch: Partial<PersonaDraft>) {
    setPersonaDraft((current) => ({ ...current, ...patch }));
    if (patch.relationshipTags) {
      setRelationshipTagText(patch.relationshipTags.join(", "));
    }
  }

  function handleRelationshipTagTextChange(value: string) {
    setRelationshipTagText(value);
    setPersonaDraft((current) => ({
      ...current,
      relationshipTags: parseRelationshipTagText(value),
    }));
  }

  async function handleGeneratePersona() {
    const prompt = personaPrompt.trim();
    if (!prompt || isGeneratingPersona) {
      return;
    }

    setIsGeneratingPersona(true);
    setPersonaGenerationError(null);
    try {
      const active = activeConnections(connections, {
        chatGptOAuthConnected: oauthAccount?.connected === true,
      });
      const result = await generatePersonaDraftV2(prompt, active.default);
      const generatedDraft: PersonaDraft = {
        name: result.persona.name,
        shortName: result.persona.shortName ?? result.persona.name,
        role: result.persona.role,
        description: result.persona.description ?? "",
        appearance: result.persona.appearance ?? "",
        relationshipTags: result.persona.relationshipTags,
      };
      setPersonaDraft(generatedDraft);
      setRelationshipTagText(generatedDraft.relationshipTags.join(", "));
    } catch (reason: unknown) {
      setPersonaGenerationError(reason instanceof Error ? reason.message : "페르소나 초안 생성 실패");
    } finally {
      setIsGeneratingPersona(false);
    }
  }

  async function handleStart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isStarting) {
      return;
    }

    await startSession(
      selectedScenario || "school-life-anomaly",
      personaDraft,
      advisorDrafts,
    );
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

  function handleAdvanceDialogue() {
    advanceDialogue();
  }

  function handleNewGame() {
    newGame();
    setChatInput("");
    setActionInput("");
    setIsPhoneConnectionPanelOpen(false);
    setIsConnectionPanelOpen(false);
    setIsDevPanelOpen(false);
    resetScenarioSelection();
  }

  const connectionPanel = (
    <ConnectionPanel
      profiles={providerProfiles}
      slots={slots}
      connections={connections}
      modelOptions={modelOptions}
      modelLoadState={modelLoadState}
      connectionTestState={connectionTestState}
      oauthAccount={oauthAccount}
      oauthChecked={oauthChecked}
      oauthStatus={oauthStatus}
      saveStatus={saveStatus}
      onChange={setConnections}
      onLoadModels={loadModels}
      onTestConnection={testConnection}
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
              isModelSettingsOpen={isPhoneConnectionPanelOpen}
              modelSettingsPanel={connectionPanel}
              chatInput={chatInput}
              onToggleTheme={() => setIsVisualThemeOpen((current) => !current)}
              onSelectTheme={(nextThemeId) => {
                setVisualThemeId(nextThemeId);
                setIsVisualThemeOpen(false);
              }}
              onToggleModelSettings={() => {
                setIsPhoneConnectionPanelOpen((current) => !current);
                setIsConnectionPanelOpen(false);
                setIsDevPanelOpen(false);
              }}
              onCloseModelSettings={() => setIsPhoneConnectionPanelOpen(false)}
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
                    setIsPhoneConnectionPanelOpen(false);
                    setIsDevPanelOpen(false);
                  }}
                  onToggleDevPanel={() => {
                    setIsDevPanelOpen((current) => !current);
                    setIsPhoneConnectionPanelOpen(false);
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
                        directorOutput={lastDirectorOutput}
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
              onRestart={restart}
              onUndo={undo}
              onReroll={reroll}
              onAdvanceDialogue={handleAdvanceDialogue}
            />
          </ScenarioShell>
        ) : setupStep === "scenario" ? (
          <ScenarioSetupPanel
            scenarioList={scenarioList}
            isScenarioListLoading={isScenarioListLoading}
            scenarioListError={scenarioListError}
            selectedScenario={selectedScenario}
            selectedScenarioDetail={selectedScenarioDetail}
            error={error}
            onSelectScenario={setSelectedScenario}
            onNext={() => setSetupStep("persona")}
          />
        ) : setupStep === "persona" ? (
          <PersonaSetupPanel
            personaDraft={personaDraft}
            personaPrompt={personaPrompt}
            relationshipTagText={relationshipTagText}
            hasScenarioAdvisors={(selectedScenarioDetail?.characters.length ?? 0) > 0}
            isStarting={isStarting}
            isGeneratingPersona={isGeneratingPersona}
            error={error}
            personaGenerationError={personaGenerationError}
            onDraftChange={handlePersonaDraftChange}
            onPersonaPromptChange={setPersonaPrompt}
            onRelationshipTagTextChange={handleRelationshipTagTextChange}
            onGeneratePersona={handleGeneratePersona}
            onBack={() => setSetupStep("scenario")}
            onSubmit={handlePersonaContinue}
          />
        ) : (
          <AdvisorSetupPanel
            advisors={advisorDrafts}
            isStarting={isStarting}
            error={error}
            onBack={() => setSetupStep("persona")}
            onRegenerate={() => setAdvisorDrafts(createAdvisorDrafts())}
            onSubmit={handleStart}
          />
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

function parseRelationshipTagText(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 20);
}
