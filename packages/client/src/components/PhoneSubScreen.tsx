import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Battery, ChevronLeft, Menu, Palette, Plus, Search, Send, Wifi, X } from "lucide-react";
import type { ChatMessage, ClientSessionState } from "@hushline/shared";
import { buildPhoneMessages, type PhoneMessage } from "../phone-feed";
import type { VisualThemePreset, VisualThemeId } from "../types/ui";
import { formatKoreanTime } from "../utils/ui-helpers";
import {
  caseFileSignature,
  countPhoneChannelMessages,
  getDefaultPhoneApp,
  getPhoneAppAvailability,
  type PhoneAppId,
} from "../utils/phone-apps";
import { loadPhoneAppsSeen, savePhoneAppsSeen } from "../utils/phone-apps-storage";
import { PhoneCaseFile } from "./PhoneCaseFile";
import { PhoneAppDock } from "./PhoneAppDock";

export function PhoneSubScreen({
  session,
  theme,
  visibleMessages,
  isSending,
  themeOptions,
  isThemeOpen,
  chatInput,
  onToggleTheme,
  onSelectTheme,
  onChatInputChange,
  onChatSubmit,
}: {
  session: ClientSessionState;
  theme: VisualThemePreset;
  visibleMessages: ChatMessage[];
  isSending: boolean;
  themeOptions: VisualThemePreset[];
  isThemeOpen: boolean;
  chatInput: string;
  onToggleTheme: () => void;
  onSelectTheme: (themeId: VisualThemeId) => void;
  onChatInputChange: (value: string) => void;
  onChatSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [phoneFilter, setPhoneFilter] = useState("");
  const [isFiltering, setIsFiltering] = useState(false);
  const [isPhoneMenuOpen, setIsPhoneMenuOpen] = useState(false);
  const [pinnedPhoneMessageIds, setPinnedPhoneMessageIds] = useState<string[]>([]);
  const phoneInputRef = useRef<HTMLInputElement | null>(null);
  const phoneFeedRef = useRef<HTMLDivElement | null>(null);

  const caseBoard = session.caseBoard;
  const uiMode = session.scenario.uiMode;
  const phoneChannelCount = useMemo(
    () => countPhoneChannelMessages(visibleMessages),
    [visibleMessages],
  );
  const availability = useMemo(
    () => getPhoneAppAvailability(caseBoard, uiMode, phoneChannelCount),
    [caseBoard, uiMode, phoneChannelCount],
  );

  // Active app: initialise from the default for this session, then user-driven only.
  const [activeApp, setActiveApp] = useState<PhoneAppId>(() =>
    getDefaultPhoneApp(getPhoneAppAvailability(caseBoard, uiMode, phoneChannelCount), uiMode),
  );

  // Track "seen" counts per session for unread badges.
  const [seen, setSeen] = useState(() => loadPhoneAppsSeen(session.id));

  // Re-derive default app + seen state when the session changes.
  useEffect(() => {
    const freshAvailability = getPhoneAppAvailability(
      session.caseBoard,
      session.scenario.uiMode,
      countPhoneChannelMessages(visibleMessages),
    );
    setActiveApp(getDefaultPhoneApp(freshAvailability, session.scenario.uiMode));
    setSeen(loadPhoneAppsSeen(session.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  const caseSignature = useMemo(() => caseFileSignature(caseBoard), [caseBoard]);
  const messengerUnread = availability.messenger && phoneChannelCount > seen.seenMessenger;
  const casefileUnread = availability.casefile && caseSignature > seen.seenCasefile;

  // Mark the active app as seen (clears its badge) and persist.
  useEffect(() => {
    setSeen((current) => {
      const next = { ...current, lastApp: activeApp };
      if (activeApp === "messenger") next.seenMessenger = phoneChannelCount;
      if (activeApp === "casefile") next.seenCasefile = caseSignature;
      if (
        next.seenMessenger === current.seenMessenger &&
        next.seenCasefile === current.seenCasefile &&
        next.lastApp === current.lastApp
      ) {
        return current;
      }
      savePhoneAppsSeen(session.id, next);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeApp, phoneChannelCount, caseSignature, session.id]);

  const phoneMessages: PhoneMessage[] = buildPhoneMessages(session, visibleMessages);
  const filteredPhoneMessages = phoneFilter.trim()
    ? phoneMessages.filter((message) =>
        [message.sender, message.text].some((value) =>
          value.toLocaleLowerCase().includes(phoneFilter.trim().toLocaleLowerCase()),
        ),
      )
    : phoneMessages;
  const pinnedPhoneMessages = pinnedPhoneMessageIds
    .map((messageId) => phoneMessages.find((message) => message.id === messageId))
    .filter((message): message is PhoneMessage => Boolean(message));

  const isMessengerApp = activeApp === "messenger";

  useEffect(() => {
    if (isMessengerApp && phoneFeedRef.current) {
      phoneFeedRef.current.scrollTop = phoneFeedRef.current.scrollHeight;
    }
  }, [filteredPhoneMessages.length, isMessengerApp]);

  function handlePhoneBack() {
    if (isThemeOpen) {
      onToggleTheme();
      return;
    }
    if (isPhoneMenuOpen) {
      setIsPhoneMenuOpen(false);
      return;
    }
    if (isFiltering) {
      setIsFiltering(false);
      setPhoneFilter("");
      return;
    }
    phoneFeedRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handlePhoneSearch() {
    setIsPhoneMenuOpen(false);
    setIsFiltering(true);
    window.requestAnimationFrame(() => {
      phoneInputRef.current?.focus();
      phoneInputRef.current?.select();
    });
  }

  function handlePhoneSubmit(event: FormEvent<HTMLFormElement>) {
    if (!isFiltering) {
      onChatSubmit(event);
      return;
    }
    event.preventDefault();
    phoneFeedRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handlePinPhoneClue() {
    const latestClue = [...filteredPhoneMessages]
      .reverse()
      .find((message) => message.side !== "system" && !pinnedPhoneMessageIds.includes(message.id));

    if (!latestClue) {
      setIsPhoneMenuOpen(true);
      return;
    }

    setPinnedPhoneMessageIds((current) => [...current, latestClue.id]);
    setIsPhoneMenuOpen(true);
  }

  const headerSubtitle = isMessengerApp ? session.scene.locationId : "사건파일";

  return (
    <aside className="phone-panel" aria-label="보조 휴대폰 화면">
      <div className="phone-notch" aria-hidden="true">
        <span />
      </div>
      <div className="phone-screen">
        <div className="phone-status-row">
          <span>{formatKoreanTime()}</span>
          <span>
            <Wifi size={12} aria-hidden="true" />
            <Battery size={14} aria-hidden="true" />
          </span>
        </div>

        <header className="phone-room-header">
          <div className="phone-room-title">
            <button type="button" onClick={handlePhoneBack} aria-label="뒤로가기">
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <div>
              <strong>{session.scenario.title}</strong>
              <span>{headerSubtitle}</span>
            </div>
          </div>
          <div className="phone-room-tools" aria-label="보조 화면 도구">
            <button type="button" onClick={onToggleTheme} aria-label={isThemeOpen ? "테마 닫기" : "테마 열기"}>
              <Palette size={15} aria-hidden="true" />
            </button>
            {isMessengerApp ? (
              <>
                <button type="button" onClick={handlePhoneSearch} aria-label="검색">
                  <Search size={15} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsPhoneMenuOpen((current) => !current)}
                  aria-label={isPhoneMenuOpen ? "메뉴 닫기" : "메뉴 열기"}
                >
                  <Menu size={15} aria-hidden="true" />
                </button>
              </>
            ) : null}
          </div>
        </header>

        {isMessengerApp ? (
          <div className="phone-message-feed" aria-live="polite" ref={phoneFeedRef}>
            {isPhoneMenuOpen ? (
              <section className="phone-menu-card" aria-label="보조 화면 메뉴">
                <div>
                  <strong>현재 위치</strong>
                  <span>{session.scene.locationId}</span>
                </div>
                <div>
                  <strong>상태</strong>
                  <span>긴장 {session.scene.tension} · 위험 {session.scene.danger}</span>
                </div>
                <div>
                  <strong>첨부 단서</strong>
                  <span>{pinnedPhoneMessages.length > 0 ? `${pinnedPhoneMessages.length}개 선택됨` : "선택된 단서 없음"}</span>
                </div>
                {pinnedPhoneMessages.length > 0 ? (
                  <ul>
                    {pinnedPhoneMessages.map((message) => (
                      <li key={message.id}>{message.text}</li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ) : null}
            <div className="phone-date-pill">{session.scenario.subtitle || session.scenario.id}</div>
            {filteredPhoneMessages.map((message) => (
              <div key={message.id} className={`phone-message-row ${message.side}`}>
                {message.side === "inbound" ? <span className="phone-avatar">O</span> : null}
                <div className="phone-message-stack">
                  {message.side === "inbound" ? <span className="phone-sender">{message.sender}</span> : null}
                  <div className="phone-bubble-line">
                    {message.side === "outbound" ? <span className="phone-time">{message.time}</span> : null}
                    <p className="phone-bubble">{message.text}</p>
                    {message.side === "inbound" ? <span className="phone-time">{message.time}</span> : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="phone-message-feed phone-casefile-feed" aria-live="polite">
            <PhoneCaseFile caseBoard={caseBoard} />
          </div>
        )}

        {isMessengerApp ? (
          <form className="phone-input-bar" onSubmit={handlePhoneSubmit}>
            <button type="button" className="phone-round-btn" onClick={handlePinPhoneClue} aria-label="현재 단서 첨부">
              <Plus size={15} aria-hidden="true" />
            </button>
            <label className="phone-input-shell">
              <Search size={14} aria-hidden="true" />
              <input
                ref={phoneInputRef}
                type="text"
                value={isFiltering ? phoneFilter : chatInput}
                onChange={(event) =>
                  isFiltering ? setPhoneFilter(event.target.value) : onChatInputChange(event.target.value)
                }
                placeholder={isFiltering ? "단서 필터" : "단톡방에 문자를 보냅니다..."}
                aria-label={isFiltering ? "보조 화면 단서 필터" : "단톡방 문자 입력"}
              />
              {(isFiltering ? phoneFilter.trim() : chatInput.trim()) ? (
                <button
                  type="button"
                  className="phone-inline-clear"
                  onClick={() => {
                    if (isFiltering) {
                      setPhoneFilter("");
                      setIsFiltering(false);
                      return;
                    }
                    onChatInputChange("");
                  }}
                  aria-label={isFiltering ? "단서 필터 지우기" : "문자 입력 지우기"}
                >
                  <X size={13} aria-hidden="true" />
                </button>
              ) : null}
            </label>
            <button
              className="phone-round-btn phone-send-btn"
              type="submit"
              disabled={isSending}
              aria-label={isFiltering ? "필터 적용" : "문자 보내기"}
            >
              {isFiltering ? <Search size={13} aria-hidden="true" /> : <Send size={13} aria-hidden="true" />}
            </button>
          </form>
        ) : null}

        {availability.showDock ? (
          <PhoneAppDock
            available={availability.available}
            activeApp={activeApp}
            unread={{ casefile: casefileUnread, messenger: messengerUnread }}
            onSelect={setActiveApp}
          />
        ) : null}

        <div className="phone-home-indicator" aria-hidden="true" />

        {isThemeOpen ? (
          <div className="phone-theme-drawer">
            <header>
              <span>
                <Palette size={14} aria-hidden="true" />
                THEME STORE
              </span>
              <button type="button" onClick={onToggleTheme} aria-label="테마 닫기">
                <Palette size={14} aria-hidden="true" />
              </button>
            </header>
            <div className="phone-theme-list">
              {themeOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={option.id === theme.id ? "selected" : ""}
                  onClick={() => onSelectTheme(option.id)}
                >
                  <span>
                    <strong>{option.name}</strong>
                    <small>{option.desc}</small>
                  </span>
                  <span className="theme-select-dot" aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
