import { type CSSProperties, type FormEvent, type KeyboardEvent, type ReactNode, type RefObject, useEffect, useState } from "react";
import { BookOpen, ChevronRight, Compass, CornerDownLeft, History, Moon, Plus, RefreshCw, RotateCcw, Save, Send, Undo2, User } from "lucide-react";
import type { AssetManifest, ChatMessage, ClientSessionState, ProviderProfile } from "@hushline/shared";
import type { ConnectionStatus, VisualThemePreset } from "../types/ui";
import { MessageContent } from "./ChatTimeline";
import {
  findSpriteUrl,
  formatKoreanTime,
  getLatestStageMessage,
  getStageExpression,
  getStageSpeakerLabel,
  hasUserMessages,
  isStageMessage,
} from "../utils/ui-helpers";

export function VisualNovelMainScreen({
  assets,
  backgroundUrl,
  session,
  theme,
  tools,
  overlays,
  activeCharacter,
  activeSpeakerLabel,
  visibleMessages,
  providerProfiles,
  defaultConnectionStatus,
  messageRevealInProgress,
  isStarting,
  isSending,
  input,
  enterToSend,
  error,
  logRef,
  inputMode,
  onSubmit,
  onInputChange,
  onKeyDown,
  onEnterToSendChange,
  onInputModeChange,
  onNewGame,
  onRestart,
  onUndo,
  onReroll,
  onAdvanceDialogue,
}: {
  assets: AssetManifest | null;
  backgroundUrl: string;
  session: ClientSessionState;
  theme: VisualThemePreset;
  tools: ReactNode;
  overlays: ReactNode;
  activeCharacter: ClientSessionState["characters"][number] | undefined;
  activeSpeakerLabel: string;
  visibleMessages: ChatMessage[];
  providerProfiles: ProviderProfile[];
  defaultConnectionStatus: ConnectionStatus;
  messageRevealInProgress: boolean;
  isStarting: boolean;
  isSending: boolean;
  input: string;
  enterToSend: boolean;
  error: string | null;
  logRef: RefObject<HTMLDivElement | null>;
  inputMode: "chat" | "action";
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onInputChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onEnterToSendChange: (enabled: boolean) => void;
  onInputModeChange: (mode: "chat" | "action") => void;
  onNewGame: () => void;
  onRestart: () => void;
  onUndo: () => void;
  onReroll: () => void;
  onAdvanceDialogue: () => void;
}) {
  const [isVnMenuOpen, setIsVnMenuOpen] = useState(false);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [isAutoAdvance, setIsAutoAdvance] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const stageMessage = getLatestStageMessage(visibleMessages);
  const latestVisibleMessage = visibleMessages.at(-1);
  const shouldStreamStageMessage = Boolean(stageMessage && stageMessage.id === latestVisibleMessage?.id);
  const stageExpression = getStageExpression(visibleMessages, stageMessage);
  const spriteUrl = findSpriteUrl(assets, activeCharacter?.id, stageExpression);
  const visibleLogMessages = visibleMessages.filter(isStageMessage);

  useEffect(() => {
    if (isLogOpen && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [isLogOpen, visibleLogMessages.length]);

  useEffect(() => {
    if (!isAutoAdvance || !messageRevealInProgress || isSending) {
      return;
    }

    // Wait 3.5 seconds after character dialogue typing is fully finished
    const timeout = window.setTimeout(onAdvanceDialogue, 3500);
    return () => window.clearTimeout(timeout);
  }, [isAutoAdvance, isSending, messageRevealInProgress, onAdvanceDialogue, visibleMessages.length]);

  function handleCopyVisibleLog() {
    const logText = visibleLogMessages
      .map((message) => `[${getStageSpeakerLabel(message, activeSpeakerLabel)}] ${message.content}`)
      .join("\n");
    void navigator.clipboard?.writeText(logText).catch(() => undefined);
  }

  function handleSaveSnapshot() {
    localStorage.setItem(
      "hushline.manualSaveSnapshot.v1",
      JSON.stringify({
        sessionId: session.id,
        scenarioId: session.scenario.id,
        locationId: session.scene.locationId,
        turnNumber: session.scene.turnNumber,
        messageCount: session.messages.length,
        savedAt: new Date().toISOString(),
      }),
    );
    setSaveStatus(`저장됨 ${formatKoreanTime()}`);
    setIsVnMenuOpen(true);
  }

  function handleToggleLog() {
    setIsLogOpen((current) => !current);
    setIsVnMenuOpen(false);
  }

  return (
    <main
      className="vn-stage-panel"
      aria-label="비주얼 노벨 메인 화면"
      style={{ "--vn-bg": backgroundUrl } as CSSProperties}
    >
      <header className="vn-system-bar">
        <div className="vn-system-title">
          <span className="vn-live-dot" aria-hidden="true" />
          <span>{session.scenario.title}</span>
        </div>
        <div className="vn-system-actions">
          <span>
            <Compass size={14} aria-hidden="true" />
            {session.scene.locationId}
          </span>
          <span className={`vn-provider-pill ${defaultConnectionStatus.tone}`}>{defaultConnectionStatus.label}</span>
          <button type="button" onClick={onRestart} disabled={isStarting || isSending}>
            <RotateCcw size={14} aria-hidden="true" />
            RESET
          </button>
          <button type="button" onClick={onNewGame} disabled={isStarting || isSending}>
            새 게임
          </button>
          {tools}
        </div>
      </header>

      {overlays ? <div className="vn-panel-layer">{overlays}</div> : null}

      <div className="vn-visual-area">
        <div className="vn-scene-backdrop" aria-hidden="true" />
        {spriteUrl ? <img className="vn-character-standee" src={spriteUrl} alt={activeSpeakerLabel} /> : null}
      </div>

      <div className={`vn-command-dock ${isLogOpen ? "log-open" : ""}`}>
        <div className={`vn-dialogue-card ${isLogOpen ? "log-open" : ""}`} aria-label="대사 및 입력">
          {isLogOpen ? (
            <section className="vn-log-panel" aria-label="이전 대화 로그">
              <header>
                <strong>LOG</strong>
                <button type="button" onClick={handleCopyVisibleLog}>
                  COPY
                </button>
              </header>
              <div className="vn-log-list" ref={logRef}>
                {visibleLogMessages.map((message) => (
                  <article key={message.id} className={`vn-log-entry ${message.role}`}>
                    <span>{getStageSpeakerLabel(message, activeSpeakerLabel)}</span>
                    <p>{message.content}</p>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          <div className="vn-dialogue-main">
            <div className="vn-speaker-tag">
              <User size={13} aria-hidden="true" />
              {getStageSpeakerLabel(stageMessage, activeSpeakerLabel)}
            </div>
            <div className="vn-dialogue-text">
              {stageMessage ? (
                <MessageContent
                  content={stageMessage.content}
                  message={stageMessage}
                  forceComplete={!shouldStreamStageMessage}
                />
              ) : (
                <p className="vn-empty-line">장면 대기 중</p>
              )}
              <button
                type="button"
                className="vn-next-btn"
                onClick={onAdvanceDialogue}
                disabled={isSending || !messageRevealInProgress}
                title="다음 대사"
                aria-label="다음 대사"
              >
                <span>NEXT</span>
                <ChevronRight size={14} aria-hidden="true" />
              </button>
            </div>
          </div>

          {error ? <p className="error-line vn-error-line">{error}</p> : null}

          <div className="vn-menu-row">
            <button
              type="button"
              onClick={() => setIsVnMenuOpen((current) => !current)}
              aria-expanded={isVnMenuOpen}
            >
              <Moon size={12} aria-hidden="true" />
              MENU
            </button>
            <button
              type="button"
              className={isLogOpen ? "active" : undefined}
              onClick={handleToggleLog}
              aria-expanded={isLogOpen}
            >
              <History size={12} aria-hidden="true" />
              LOG
            </button>
            <button type="button" onClick={handleSaveSnapshot} disabled={isSending}>
              <Save size={12} aria-hidden="true" />
              SAVE
            </button>
            <button
              type="button"
              onClick={() => setIsAutoAdvance((current) => !current)}
              disabled={isSending}
              aria-pressed={isAutoAdvance}
            >
              <BookOpen size={12} aria-hidden="true" />
              {isAutoAdvance ? "AUTO ON" : "AUTO"}
            </button>
          </div>

          {isVnMenuOpen ? (
            <div className="vn-menu-panel" aria-label="본화면 메뉴">
              <span>위치 {session.scene.locationId}</span>
              <span>턴 {session.scene.turnNumber}</span>
              <span>{saveStatus ?? "수동 저장 전"}</span>
              <span>{isAutoAdvance ? "자동 넘김 켜짐" : "자동 넘김 꺼짐"}</span>
            </div>
          ) : null}

          <form className="vn-input-bar" onSubmit={onSubmit}>
            <div className="vn-quick-actions" aria-label="빠른 기능">
              <button
                className="vn-quick-btn"
                type="button"
                disabled={isSending || !hasUserMessages(session)}
                onClick={onUndo}
                title="마지막 턴 삭제"
                aria-label="마지막 턴 삭제"
              >
                <Undo2 size={15} aria-hidden="true" />
              </button>
              <button
                className="vn-quick-btn"
                type="button"
                disabled={isSending || !hasUserMessages(session)}
                onClick={onReroll}
                title="마지막 응답 리롤"
                aria-label="마지막 응답 리롤"
              >
                <RefreshCw size={15} aria-hidden="true" />
              </button>
            </div>

            <label className="vn-reply-shell">
              <button
                type="button"
                className="vn-input-mode-toggle-btn"
                onClick={() => onInputModeChange(inputMode === "chat" ? "action" : "chat")}
                title="클릭하여 입력 상태 전환 (문자 / 행동)"
              >
                {inputMode === "chat" ? "💬 문자" : "🎭 행동"}
              </button>
              <textarea
                className="vn-reply-input"
                value={input}
                onChange={(event) => onInputChange(event.target.value)}
                onKeyDown={onKeyDown}
                placeholder={
                  inputMode === "chat"
                    ? "단톡방에 문자를 보냅니다..."
                    : "물리적인 행동을 보냅니다... (예: *주변을 살펴본다*)"
                }
                aria-label="메시지"
                rows={1}
              />
              <label className="enter-send-inline">
                <input
                  type="checkbox"
                  checked={enterToSend}
                  onChange={(event) => onEnterToSendChange(event.target.checked)}
                />
                <CornerDownLeft size={12} aria-hidden="true" />
                <span>Enter</span>
              </label>
            </label>

            <button className="vn-reply-send" type="submit" disabled={isSending}>
              <Send size={14} aria-hidden="true" />
              SEND
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
