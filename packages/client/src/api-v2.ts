// ──────────────────────────────────────────────
// Client — v2 API Client
// ──────────────────────────────────────────────
// Thin wrapper around v2 endpoints.
// Handles session creation, advance, reroll, undo.
// ──────────────────────────────────────────────

import type {
  SessionStateV2,
  TurnResultV2,
  ModelConnection,
  InputMode,
  DirectorOutput,
  TurnMessage,
} from "@hushline/shared";

export interface V2SessionResponse {
  session: SessionStateV2;
}

export interface V2AdvanceResponse {
  session: SessionStateV2;
  turn: {
    messages: TurnMessage[];
    directorOutput: DirectorOutput;
  };
}

export interface V2ScenarioListResponse {
  scenarios: string[];
}

export interface V2ScenarioDetailResponse {
  manifest: {
    id: string;
    title: string;
    subtitle: string;
    genre: string;
    version: string;
  };
  scenarioCard: {
    title: string;
    subtitle: string;
    description: string;
    interventionPrompt: string;
  };
  characters: Array<{
    id: string;
    name: string;
    shortName: string;
    role: string;
    anonymousLabel?: string;
    autonomy: number;
  }>;
  mainObjective: {
    id: string;
    description: string;
  };
}

// ── Scenario Listing ──

export async function listScenarios(): Promise<string[]> {
  const response = await fetch("/api/v2/scenarios");
  if (!response.ok) throw new Error("시나리오 목록을 불러올 수 없습니다.");
  const payload = (await response.json()) as V2ScenarioListResponse;
  return payload.scenarios;
}

export async function getScenarioDetail(packId: string): Promise<V2ScenarioDetailResponse> {
  const response = await fetch(`/api/v2/scenarios/${packId}`);
  if (!response.ok) throw new Error("시나리오 정보를 불러올 수 없습니다.");
  return (await response.json()) as V2ScenarioDetailResponse;
}

// ── Session Management ──

export async function createSessionV2(
  scenarioPackId: string,
  personaName?: string,
  connections?: Record<string, ModelConnection>,
): Promise<SessionStateV2> {
  const response = await fetch("/api/v2/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      scenarioPackId,
      persona: personaName ? { name: personaName } : undefined,
      connections,
    }),
  });
  if (!response.ok) throw new Error("세션을 생성할 수 없습니다.");
  const payload = (await response.json()) as V2SessionResponse;
  return payload.session;
}

export async function getSessionV2(sessionId: string): Promise<SessionStateV2 | null> {
  const response = await fetch(`/api/v2/sessions/${sessionId}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("세션을 불러올 수 없습니다.");
  const payload = (await response.json()) as V2SessionResponse;
  return payload.session;
}

// ── Turn Actions ──

export async function advanceV2(
  sessionId: string,
  content: string,
  inputMode: InputMode,
  connections: Record<string, ModelConnection>,
): Promise<V2AdvanceResponse> {
  const response = await fetch(`/api/v2/sessions/${sessionId}/advance`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content, inputMode, connections }),
  });
  if (!response.ok) throw new Error("메시지를 보낼 수 없습니다.");
  return (await response.json()) as V2AdvanceResponse;
}

export async function rerollV2(
  sessionId: string,
  connections: Record<string, ModelConnection>,
  inputMode?: InputMode,
): Promise<V2AdvanceResponse> {
  const response = await fetch(`/api/v2/sessions/${sessionId}/reroll`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ connections, inputMode }),
  });
  if (!response.ok) throw new Error("리롤에 실패했습니다.");
  return (await response.json()) as V2AdvanceResponse;
}

export async function undoV2(sessionId: string): Promise<SessionStateV2> {
  const response = await fetch(`/api/v2/sessions/${sessionId}/undo`, {
    method: "POST",
  });
  if (!response.ok) throw new Error("삭제에 실패했습니다.");
  const payload = (await response.json()) as V2SessionResponse;
  return payload.session;
}
