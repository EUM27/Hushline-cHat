import { type CSSProperties, type FormEvent, type KeyboardEvent, type ReactNode, type RefObject, useEffect, useState } from "react";
import { BookOpen, ChevronRight, Compass, CornerDownLeft, History, Moon, Plus, RefreshCw, RotateCcw, Save, Send, Undo2, User } from "lucide-react";
import type { AssetManifest, ChatMessage, ClientSessionState, ProviderProfile } from "@hushline/shared";
import type { ConnectionStatus, VisualThemePreset } from "../types/ui";
import { MessageContent } from "./ChatTimeline";
import {
  findSpriteUrl,
  formatKoreanTime,
  getStageCharacterId,
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
  activeSpeakerLabel,
  visibleMessages,
  providerProfiles,
  defaultConnectionStatus,
  messageRevealInProgress,
  isStarting,
  isSending,
  actionInput,
  enterToSend,
  error,
  logRef,
  onActionSubmit,
  onActionInputChange,
  onKeyDown,
  onEnterToSendChange,
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
  activeSpeakerLabel: string;
  visibleMessages: ChatMessage[];
  providerProfiles: ProviderProfile[];
  defaultConnectionStatus: ConnectionStatus;
  messageRevealInProgress: boolean;
  isStarting: boolean;
  isSending: boolean;
  actionInput: string;
  enterToSend: boolean;
  error: string | null;
  logRef: RefObject<HTMLDivElement | null>;
  onActionSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onActionInputChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>, mode: "chat" | "action") => void;
  onEnterToSendChange: (enabled: boolean) => void;
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
  const stageCharacterId = getStageCharacterId(stageMessage);
  const stageCharacter = stageCharacterId
    ? session.characters.find((character) => character.id === stageCharacterId)
    : undefined;
  const spriteUrl = findSpriteUrl(assets, stageCharacter?.id, stageExpression);
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
        {spriteUrl ? (
          <img
            className="vn-character-standee"
            src={spriteUrl}
            alt={stageCharacter?.name ?? activeSpeakerLabel}
            data-character-id={stageCharacter?.id}
          />
        ) : null}
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
                    <MessageContent content={message.content} message={message} forceComplete />
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

          <div className="vn-input-bar">
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

            <form className="vn-reply-shell action" onSubmit={onActionSubmit}>
              <span className="vn-input-mode-label">행동</span>
              <textarea
                className="vn-reply-input"
                value={actionInput}
                onChange={(event) => onActionInputChange(event.target.value)}
                onKeyDown={(event) => onKeyDown(event, "action")}
                placeholder="물리적인 행동을 보냅니다... (예: 주변을 살펴본다)"
                aria-label="행동 입력"
                rows={1}
              />
              <button className="vn-reply-send secondary" type="submit" disabled={isSending}>
                <Send size={14} aria-hidden="true" />
                ACT
              </button>
            </form>

            <label className="enter-send-inline">
              <input
                type="checkbox"
                checked={enterToSend}
                onChange={(event) => onEnterToSendChange(event.target.checked)}
              />
              <CornerDownLeft size={12} aria-hidden="true" />
              <span>Enter</span>
            </label>
          </div>
        </div>
      </div>
    </main>
  );
}
