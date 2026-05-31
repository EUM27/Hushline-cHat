import { useEffect, useState } from "react";
import type {
  AdvisorDraft,
  BoundaryReport,
  CaseRuntimeTrace,
  ClientSessionState,
  DirectorOutput,
  InputMode,
  ModelConnection,
  StateLawSnapshot,
} from "@hushline/shared";
import { advanceV2, createSessionV2, rerollV2, undoV2 } from "../api-v2";
import { sessionStorageKey } from "../constants/theme-presets";
import {
  appendOptimisticUserMessage,
  resolveOptimisticSubmitFailure,
} from "../optimistic-session";
import {
  activeConnections,
  advisorDraftsFromSession,
} from "../utils/ui-helpers";

export interface SessionActionsState {
  session: ClientSessionState | null;
  isStarting: boolean;
  isSending: boolean;
  revealedMessageCount: number;
  error: string | null;
  lastBoundaryReport: BoundaryReport | null;
  lastStateLaw: StateLawSnapshot | null;
  lastCaseRuntime: CaseRuntimeTrace | null;
  lastDirectorOutput: DirectorOutput | null;
  setError: (message: string | null) => void;
  restoreSession: (nextSession: ClientSessionState) => void;
  startSession: (
    scenarioId: string,
    personaName?: string,
    advisorDrafts?: AdvisorDraft[],
  ) => Promise<boolean>;
  submitEngineInput: (content: string, mode: InputMode) => Promise<boolean>;
  reroll: () => Promise<void>;
  undo: () => Promise<void>;
  restart: () => Promise<void>;
  newGame: () => void;
  advanceDialogue: () => void;
}

export function useSessionActions(
  connections: Record<string, ModelConnection>,
  defaultInputMode: InputMode = "chat",
  connectionAuth: { chatGptOAuthConnected?: boolean } = {},
): SessionActionsState {
  const [session, setSession] = useState<ClientSessionState | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [revealedMessageCount, setRevealedMessageCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [lastBoundaryReport, setLastBoundaryReport] = useState<BoundaryReport | null>(null);
  const [lastStateLaw, setLastStateLaw] = useState<StateLawSnapshot | null>(null);
  const [lastCaseRuntime, setLastCaseRuntime] = useState<CaseRuntimeTrace | null>(null);
  const [lastDirectorOutput, setLastDirectorOutput] = useState<DirectorOutput | null>(null);

  useEffect(() => {
    if (session) {
      localStorage.setItem(sessionStorageKey, session.id);
    }
  }, [session?.id]);

  useEffect(() => {
    if (!session) {
      setRevealedMessageCount(0);
      return;
    }

    setRevealedMessageCount((current) => Math.min(current || 1, session.messages.length));
  }, [session?.id, session?.messages.length]);

  function restoreSession(nextSession: ClientSessionState) {
    setSession(nextSession);
    setLastBoundaryReport(null);
    setLastStateLaw(null);
    setLastCaseRuntime(null);
    setLastDirectorOutput(null);
    setRevealedMessageCount(nextSession.messages.length);
  }

  async function startSession(
    scenarioId: string,
    personaName?: string,
    advisorDrafts?: AdvisorDraft[],
  ): Promise<boolean> {
    setIsStarting(true);
    setError(null);

    try {
      const nextSession = await createSessionV2(
        scenarioId,
        personaName || undefined,
        advisorDrafts,
        activeConnections(connections, connectionAuth),
      );
      setSession(nextSession);
      setLastBoundaryReport(null);
      setLastStateLaw(null);
      setLastCaseRuntime(null);
      setLastDirectorOutput(null);
      setRevealedMessageCount(0);
      return true;
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "세션 시작 실패");
      return false;
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
      const payload = await advanceV2(baseSession.id, content, mode, activeConnections(connections, connectionAuth));
      setSession(payload.session);
      setLastBoundaryReport(payload.turn.boundaryReport);
      setLastStateLaw(payload.turn.stateLaw);
      setLastCaseRuntime(payload.turn.caseRuntime ?? null);
      setLastDirectorOutput(payload.turn.directorOutput);
      setRevealedMessageCount(Math.min(nextVisibleCount, payload.session.messages.length));
      return true;
    } catch (reason: unknown) {
      const failureState = resolveOptimisticSubmitFailure(optimisticSession, reason);
      setSession(failureState.session);
      setRevealedMessageCount(failureState.revealedMessageCount);
      setError(failureState.error);
      return failureState.didSubmitLocally;
    } finally {
      setIsSending(false);
    }
  }

  async function reroll() {
    if (!session || isSending) return;
    setIsSending(true);
    setError(null);
    try {
      const payload = await rerollV2(session.id, activeConnections(connections, connectionAuth), defaultInputMode);
      setSession(payload.session);
      setLastBoundaryReport(payload.turn.boundaryReport);
      setLastStateLaw(payload.turn.stateLaw);
      setLastCaseRuntime(payload.turn.caseRuntime ?? null);
      setLastDirectorOutput(payload.turn.directorOutput);
      setRevealedMessageCount(payload.session.messages.length);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "리롤 실패");
    } finally {
      setIsSending(false);
    }
  }

  async function undo() {
    if (!session || isSending) return;
    setIsSending(true);
    setError(null);
    try {
      const nextSession = await undoV2(session.id);
      setSession(nextSession);
      setLastBoundaryReport(null);
      setLastStateLaw(null);
      setLastCaseRuntime(null);
      setLastDirectorOutput(null);
      setRevealedMessageCount(nextSession.messages.length);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "삭제 실패");
    } finally {
      setIsSending(false);
    }
  }

  async function restart() {
    if (!session || isStarting || isSending) return;
    setIsStarting(true);
    setError(null);
    try {
      const restartAdvisors = advisorDraftsFromSession(session);
      const nextSession = await createSessionV2(
        session.scenario.id,
        session.persona.name || undefined,
        restartAdvisors.length > 0 ? restartAdvisors : undefined,
        activeConnections(connections, connectionAuth),
      );
      setSession(nextSession);
      setLastBoundaryReport(null);
      setLastStateLaw(null);
      setLastCaseRuntime(null);
      setLastDirectorOutput(null);
      setRevealedMessageCount(0);
      localStorage.setItem(sessionStorageKey, nextSession.id);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "재시작 실패");
    } finally {
      setIsStarting(false);
    }
  }

  function newGame() {
    setSession(null);
    setRevealedMessageCount(0);
    setError(null);
    setLastBoundaryReport(null);
    setLastStateLaw(null);
    setLastCaseRuntime(null);
    setLastDirectorOutput(null);
    localStorage.removeItem(sessionStorageKey);
  }

  function advanceDialogue() {
    if (!session) return;
    setRevealedMessageCount((current) => Math.min(Math.max(current, 1) + 1, session.messages.length));
  }

  return {
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
  };
}
