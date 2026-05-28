import { type FormEvent, type KeyboardEvent, type ReactNode, type RefObject, useEffect, useState } from "react";
import { MessageCircle, MessageSquare, Plus, RefreshCw, RotateCcw, Send, Undo2, Zap } from "lucide-react";
import type { ChatMessage, ClientSessionState, InputMode, ProviderProfile } from "@hushline/shared";
import {
  shouldStreamMessageContent,
  countStreamCharacters,
  calculateStreamStepSize,
  calculateStreamTickDelay,
  sliceStreamedText,
} from "../reveal-timing";
import {
  type MessageFormatToken,
  looksLikeRichHtml,
  parseMessageFormat,
  sanitizeRichHtml,
  getSourceBadge,
} from "../utils/ui-helpers";

export function ChatTimeline({
  className = "message-log",
  logRef,
  children,
}: {
  className?: string;
  logRef?: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  return (
    <div className={className} ref={logRef}>
      {children}
    </div>
  );
}

export function TypingIndicator() {
  return (
    <div className="typing-pulse" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

export function ChatComposer({
  className,
  input,
  inputMode,
  enterToSend,
  isSending,
  disabled = false,
  placeholder,
  onSubmit,
  onInputChange,
  onKeyDown,
  onModeChange,
  onEnterToSendChange,
}: {
  className?: string;
  input: string;
  inputMode: InputMode;
  enterToSend: boolean;
  isSending: boolean;
  disabled?: boolean;
  placeholder: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onInputChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onModeChange: (mode: InputMode) => void;
  onEnterToSendChange: (enabled: boolean) => void;
}) {
  return (
    <form className={["composer", className].filter(Boolean).join(" ")} onSubmit={onSubmit}>
      <ComposerOptions
        mode={inputMode}
        enterToSend={enterToSend}
        onModeChange={onModeChange}
        onEnterToSendChange={onEnterToSendChange}
      />
      <textarea
        value={input}
        onChange={(event) => onInputChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label="메시지"
        rows={1}
      />
      <button type="submit" disabled={isSending || disabled} aria-label="보내기">
        <Send size={20} />
      </button>
    </form>
  );
}

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

export function ComposerOptions({
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

export function InputModeToggle({
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

export function TurnActions({
  canModifyTurn,
  isStarting,
  isSending,
  messageRevealInProgress,
  onNewGame,
  onRestart,
  onUndo,
  onReroll,
}: {
  canModifyTurn: boolean;
  isStarting: boolean;
  isSending: boolean;
  messageRevealInProgress: boolean;
  onNewGame: () => void;
  onRestart: () => void;
  onUndo: () => void;
  onReroll: () => void;
}) {
  const sessionBusy = isStarting || isSending;
  const turnBusy = isSending || messageRevealInProgress || !canModifyTurn;

  return (
    <div className="turn-actions">
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
        <RefreshCw size={14} aria-hidden="true" />
        <span>리롤</span>
      </button>
    </div>
  );
}

export function MessageBubble({
  message,
  session,
  providerProfiles,
  forceComplete,
}: {
  message: ChatMessage;
  session: ClientSessionState;
  providerProfiles: ProviderProfile[];
  forceComplete: boolean;
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
      <MessageContent content={message.content} message={message} forceComplete={forceComplete} />
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

export function MessageContent({
  content,
  message,
  forceComplete,
}: {
  content: string;
  message: ChatMessage;
  forceComplete: boolean;
}) {
  const shouldStream = shouldStreamMessageContent(message);
  const [visibleCharacters, setVisibleCharacters] = useState(() =>
    shouldStream && !forceComplete ? 0 : countStreamCharacters(content),
  );

  useEffect(() => {
    setVisibleCharacters(shouldStream && !forceComplete ? 0 : countStreamCharacters(content));
  }, [content, forceComplete, message.id, shouldStream]);

  useEffect(() => {
    if (!shouldStream || forceComplete) {
      return;
    }

    const totalCharacters = countStreamCharacters(content);
    if (visibleCharacters >= totalCharacters) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setVisibleCharacters((current) =>
        Math.min(current + calculateStreamStepSize(message, current), totalCharacters),
      );
    }, calculateStreamTickDelay(message, visibleCharacters));

    return () => window.clearTimeout(timeout);
  }, [content, forceComplete, message, shouldStream, visibleCharacters]);

  const visibleContent = shouldStream && !forceComplete
    ? sliceStreamedText(content, visibleCharacters)
    : content;
  const isStreaming = shouldStream && !forceComplete && visibleCharacters < countStreamCharacters(content);

  if (!looksLikeRichHtml(content)) {
    return (
      <div className="message-content">
        {renderFormattedMessageContent(visibleContent)}
        {isStreaming ? <span className="stream-caret" aria-hidden="true" /> : null}
      </div>
    );
  }

  return (
    <div
      className="message-content rich-html"
      dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(content) }}
    />
  );
}

function renderFormattedMessageContent(content: string): ReactNode {
  return parseMessageFormat(content).map((token, index) => renderMessageToken(token, index));
}

function renderMessageToken(token: MessageFormatToken, index: number): ReactNode {
  if (token.kind === "lineBreak") {
    return <br key={`br-${index}`} />;
  }
  if (token.kind === "dialogue" || token.kind === "bold") {
    return (
      <strong
        key={`${token.kind}-${index}`}
        className={token.kind === "dialogue" ? "message-dialogue" : undefined}
      >
        {token.text}
      </strong>
    );
  }
  if (token.kind === "thought" || token.kind === "italic") {
    return (
      <em
        key={`${token.kind}-${index}`}
        className={token.kind === "thought" ? "message-thought" : undefined}
      >
        {token.text}
      </em>
    );
  }
  return token.text;
}
