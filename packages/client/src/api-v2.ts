// ──────────────────────────────────────────────
// Client — v2 API Client
// ──────────────────────────────────────────────
// Thin wrapper around v2 endpoints.
// Handles session creation, advance, reroll, undo through the same-origin API.
// ──────────────────────────────────────────────

import type {
  AdvisorDraft,
  ClientSessionState,
  ModelConnection,
  InputMode,
  DirectorOutput,
  BoundaryReport,
  CaseRuntimeTrace,
  PersonaDraft,
  StateLawSnapshot,
  TurnMessage,
} from "@hushline/shared";
import {
  advanceOfflineSession,
  createOfflineSession,
  getOfflineSession,
  offlineScenarioDetail,
  offlineScenarioIds,
  rerollOfflineSession,
  undoOfflineSession,
} from "./offline-demo";

export interface V2SessionResponse {
  session: ClientSessionState;
}

export interface V2AdvanceResponse {
  session: ClientSessionState;
  turn: {
    messages: TurnMessage[];
    directorOutput: DirectorOutput;
    boundaryReport: BoundaryReport;
    stateLaw: StateLawSnapshot;
    caseRuntime?: CaseRuntimeTrace;
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

export interface V2PersonaMakerResponse {
  persona: PersonaDraft;
  source: "api" | "fallback";
  error?: string;
}

export interface V2AdvisorMakerResponse {
  advisors: AdvisorDraft[];
  source: "api" | "fallback";
  error?: string;
}

export interface ProviderConnectionTestResponse {
  ok: boolean;
  providerId: ModelConnection["providerId"];
  model: string;
  message?: string;
  error?: string;
}

// ── Scenario Listing ──

export async function listScenarios(): Promise<string[]> {
  try {
    const response = await fetch("/api/v2/scenarios");
    if (!response.ok) throw new Error("시나리오 목록을 불러올 수 없습니다.");
    const payload = (await response.json()) as V2ScenarioListResponse;
    return payload.scenarios;
  } catch {
    return offlineScenarioIds;
  }
}

export async function getScenarioDetail(packId: string): Promise<V2ScenarioDetailResponse> {
  try {
    const response = await fetch(`/api/v2/scenarios/${packId}`);
    if (!response.ok) throw new Error("시나리오 정보를 불러올 수 없습니다.");
    return (await response.json()) as V2ScenarioDetailResponse;
  } catch {
    return offlineScenarioDetail;
  }
}

// ── Session Management ──

export async function createSessionV2(
  scenarioPackId: string,
  personaName?: string,
  advisors?: AdvisorDraft[],
  connections?: Record<string, ModelConnection>,
): Promise<ClientSessionState> {
  try {
    const response = await fetch("/api/v2/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scenarioPackId,
        persona: personaName ? { name: personaName } : undefined,
        advisors,
        connections,
      }),
    });
    if (!response.ok) throw new Error("세션을 생성할 수 없습니다.");
    const payload = (await response.json()) as V2SessionResponse;
    return payload.session;
  } catch {
    return createOfflineSession(scenarioPackId, personaName, advisors);
  }
}

// ── Draft Makers ──

export async function generatePersonaDraftV2(
  prompt: string,
  connection?: ModelConnection,
): Promise<V2PersonaMakerResponse> {
  const response = await fetch("/api/v2/persona-maker/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt, connection }),
  });
  if (!response.ok) throw new Error("페르소나 초안을 만들 수 없습니다.");
  return (await response.json()) as V2PersonaMakerResponse;
}

export async function generateAdvisorDraftsV2(
  prompt: string,
  count = 2,
  connection?: ModelConnection,
): Promise<V2AdvisorMakerResponse> {
  const response = await fetch("/api/v2/advisor-maker/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt, count, connection }),
  });
  if (!response.ok) throw new Error("조언자 초안을 만들 수 없습니다.");
  return (await response.json()) as V2AdvisorMakerResponse;
}

export async function testProviderConnection(
  connection: ModelConnection,
): Promise<ProviderConnectionTestResponse> {
  const response = await fetch(`/api/provider-profiles/${connection.providerId}/test`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(connection),
  });
  const payload = (await response.json().catch(() => null)) as ProviderConnectionTestResponse | null;
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error ?? "연결 테스트에 실패했습니다.");
  }
  return payload;
}

export async function getSessionV2(sessionId: string): Promise<ClientSessionState | null> {
  try {
    const response = await fetch(`/api/v2/sessions/${sessionId}`);
    if (response.status === 404) return getOfflineSession(sessionId);
    if (!response.ok) throw new Error("세션을 불러올 수 없습니다.");
    const payload = (await response.json()) as V2SessionResponse;
    return payload.session;
  } catch {
    return getOfflineSession(sessionId);
  }
}

// ── Turn Actions ──

export async function advanceV2(
  sessionId: string,
  content: string,
  inputMode: InputMode,
  connections: Record<string, ModelConnection>,
): Promise<V2AdvanceResponse> {
  try {
    const response = await fetch(`/api/v2/sessions/${sessionId}/advance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content, inputMode, connections }),
    });
    if (!response.ok) throw new Error("메시지를 보낼 수 없습니다.");
    return (await response.json()) as V2AdvanceResponse;
  } catch {
    return advanceOfflineSession(sessionId, content, inputMode);
  }
}

export async function rerollV2(
  sessionId: string,
  connections: Record<string, ModelConnection>,
  inputMode?: InputMode,
): Promise<V2AdvanceResponse> {
  try {
    const response = await fetch(`/api/v2/sessions/${sessionId}/reroll`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ connections, inputMode }),
    });
    if (!response.ok) throw new Error("리롤에 실패했습니다.");
    return (await response.json()) as V2AdvanceResponse;
  } catch {
    return rerollOfflineSession(sessionId);
  }
}

export async function undoV2(sessionId: string): Promise<ClientSessionState> {
  try {
    const response = await fetch(`/api/v2/sessions/${sessionId}/undo`, {
      method: "POST",
    });
    if (!response.ok) throw new Error("삭제에 실패했습니다.");
    const payload = (await response.json()) as V2SessionResponse;
    return payload.session;
  } catch {
    return undoOfflineSession(sessionId);
  }
}

// ──────────────────────────────────────────────
// Character card import (PNG / JSON)
// ──────────────────────────────────────────────

export interface ImportedCharacterCard {
  id: string;
  name: string;
  shortName: string;
  role: string;
  mbti: string;
  autonomy: number;
  ocean: {
    openness: number;
    conscientiousness: number;
    extraversion: number;
    agreeableness: number;
    neuroticism: number;
  };
  systemPrompt: string;
  handout: {
    secret: string;
    desire: string;
    objective: string;
    initialRelationshipToUser: number;
    surfacePersonality?: string[];
    fear?: string;
    behaviorRules?: string[];
  };
  relationships: Array<{ targetId: string; descriptor: string; intensity: number }>;
}

/** Read a File as base64 (without the data URL prefix). */
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("파일을 읽을 수 없습니다."));
        return;
      }
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("파일 읽기 실패"));
    reader.readAsDataURL(file);
  });
}

/**
 * Upload a character card file (PNG or JSON) and return the converted character preview.
 */
export async function importCharacterCard(file: File): Promise<ImportedCharacterCard> {
  const isPng = file.type === "image/png" || /\.png$/i.test(file.name);
  const body = isPng
    ? { kind: "png" as const, data: await readFileAsBase64(file), fileName: file.name }
    : { kind: "json" as const, data: await file.text(), fileName: file.name };

  const response = await fetch("/api/v2/character-card/import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => null)) as
    | { character: ImportedCharacterCard }
    | { error: string }
    | null;

  if (!response.ok || !payload || !("character" in payload)) {
    const message = payload && "error" in payload ? payload.error : "카드를 불러오지 못했습니다.";
    throw new Error(message);
  }

  return payload.character;
}
