import { z } from "zod";
import type { AdvisorDraft, CharacterHandoutDefinition, ModelConnection, PersonaDraft } from "@hushline/shared";
import { completeWithConnection, isConnectionReady } from "../providers/adapters/index.js";
import { advisorDraftSchema, personaDraftSchema, type AdvisorDraftInput, type ModelConnectionInput } from "./schemas.js";
import { clamp, cleanStringArray, nonEmpty, truncateForPrompt, uniqueStrings } from "./utils.js";

export async function generatePersonaDraft(
  prompt: string,
  connectionInput?: ModelConnectionInput,
): Promise<{ persona: PersonaDraft; source: "api" | "fallback"; error?: string }> {
  const fallback = createFallbackPersonaDraft(prompt);
  const connection = normalizeModelConnection(connectionInput);
  if (!hasUsableConnection(connection)) {
    return { persona: fallback, source: "fallback" };
  }

  try {
    const raw = await completeWithConnection({
      connection,
      systemPrompt: PERSONA_MAKER_SYSTEM_PROMPT,
      messages: [makeMakerMessage(buildPersonaMakerPrompt(prompt))],
    });
    const parsed = parseJsonObject(raw);
    const candidate = getNestedObject(parsed, "persona") ?? parsed;
    const result = personaDraftSchema.safeParse(candidate);
    if (!result.success) {
      return { persona: fallback, source: "fallback", error: "Persona maker returned invalid JSON shape." };
    }
    return {
      persona: {
        name: result.data.name,
        shortName: result.data.shortName ?? fallback.shortName ?? result.data.name,
        role: result.data.role,
        description: result.data.description ?? fallback.description ?? "",
        appearance: result.data.appearance ?? fallback.appearance ?? "",
        relationshipTags: uniqueStrings(result.data.relationshipTags.length > 0
          ? result.data.relationshipTags
          : fallback.relationshipTags),
      },
      source: "api",
    };
  } catch (reason: unknown) {
    return {
      persona: fallback,
      source: "fallback",
      error: reason instanceof Error ? reason.message : "Persona maker failed.",
    };
  }
}

export async function generateAdvisorDrafts(
  prompt: string,
  count: number,
  connectionInput?: ModelConnectionInput,
): Promise<{ advisors: AdvisorDraft[]; source: "api" | "fallback"; error?: string }> {
  const fallback = createFallbackAdvisorDrafts(prompt, count);
  const connection = normalizeModelConnection(connectionInput);
  if (!hasUsableConnection(connection)) {
    return { advisors: fallback, source: "fallback" };
  }

  try {
    const raw = await completeWithConnection({
      connection,
      systemPrompt: ADVISOR_MAKER_SYSTEM_PROMPT,
      messages: [makeMakerMessage(buildAdvisorMakerPrompt(prompt, count))],
    });
    const parsed = parseJsonObject(raw);
    const candidate = Array.isArray(parsed) ? parsed : getNestedArray(parsed, "advisors");
    const result = z.array(advisorDraftSchema).min(1).max(4).safeParse(candidate);
    if (!result.success) {
      return { advisors: fallback, source: "fallback", error: "Advisor maker returned invalid JSON shape." };
    }
    return {
      advisors: result.data.slice(0, count).map((draft, index) => normalizeAdvisorDraft(draft, index)),
      source: "api",
    };
  } catch (reason: unknown) {
    return {
      advisors: fallback,
      source: "fallback",
      error: reason instanceof Error ? reason.message : "Advisor maker failed.",
    };
  }
}

const PERSONA_MAKER_SYSTEM_PROMPT = [
  "You generate Hushline onboarding persona drafts.",
  "Return JSON only. No markdown.",
  "The persona is the user's playable stance, not an NPC card.",
  "Keep fields compact and writer-facing.",
].join("\n");

const ADVISOR_MAKER_SYSTEM_PROMPT = [
  "You generate Hushline anonymous advisor drafts.",
  "Return JSON only. No markdown.",
  "Each advisor is an agent slot for the group-chat survival engine.",
  "Do not create full SillyTavern or Marinara character cards.",
  "Keep secrets/objectives playable and useful for runtime handouts.",
].join("\n");

function buildPersonaMakerPrompt(prompt: string): string {
  return [
    "Create one Korean persona draft for this playable user concept.",
    "",
    "Required JSON shape:",
    "{",
    '  "persona": {',
    '    "name": "short display name",',
    '    "shortName": "optional shorter label",',
    '    "role": "one or two sentences about stance and narrative pressure",',
    '    "description": "public identity/background other characters may know",',
    '    "appearance": "observable appearance, clothing, posture, or visible habit",',
    '    "relationshipTags": ["user-persona", "scenario-participant", "..."]',
    "  }",
    "}",
    "",
    `User concept: ${prompt}`,
  ].join("\n");
}

function buildAdvisorMakerPrompt(prompt: string, count: number): string {
  return [
    `Create ${count} Korean anonymous advisor drafts for Hushline v2.`,
    "",
    "Required JSON shape:",
    "{",
    '  "advisors": [',
    "    {",
    '      "id": "advisor-1",',
    '      "anonymousLabel": "[익명 1]",',
    '      "role": "runtime role in one sentence",',
    '      "systemPrompt": "voice and behavioral contract",',
    '      "mbti": "ISTP",',
    '      "ocean": { "openness": 50, "conscientiousness": 70, "extraversion": 35, "agreeableness": 45, "neuroticism": 65 },',
    '      "relationshipTags": ["advisor-slot", "..."],',
    '      "autonomy": 0.6,',
    '      "handout": {',
    '        "secret": "private knowledge",',
    '        "desire": "private want",',
    '        "objective": "current runtime objective",',
    '        "initialRelationshipToUser": 1,',
    '        "surfacePersonality": ["short trait"],',
    '        "fear": "private fear",',
    '        "behaviorRules": ["short rule"]',
    "      }",
    "    }",
    "  ]",
    "}",
    "",
    `Advisor concept: ${prompt}`,
  ].join("\n");
}

function createFallbackPersonaDraft(prompt: string): PersonaDraft {
  const name = inferPersonaName(prompt);
  return {
    name,
    shortName: name,
    role: `${truncateForPrompt(prompt, 120)}. 이상공간 단톡방에 끌려온 참여자이며, 사람을 버리지 않으면서도 규칙의 허점을 확인하려 한다.`,
    description: `${truncateForPrompt(prompt, 120)}라는 정체성을 가진 인물. 사람을 쉽게 못 버리는 성향 때문에 위험한 상황에서도 주변 반응을 먼저 살핀다.`,
    appearance: "관찰 가능한 외형은 시작 장면에 맞게 비워 둔다. 필요하면 젖은 소매, 낡은 가방, 굳은 표정처럼 눈에 보이는 단서로 구체화한다.",
    relationshipTags: ["user-persona", "scenario-participant", "scene-driver"],
  };
}

function createFallbackAdvisorDrafts(prompt: string, count: number): AdvisorDraft[] {
  return Array.from({ length: count }, (_, index) => {
    const id = `advisor-${index + 1}`;
    const label = index === 0 ? "[익명 1]" : `[익명 ${index + 8}]`;
    const role = `${truncateForPrompt(prompt, 120)}. 단톡방에서 위험 신호를 먼저 짚는 익명 조력자.`;
    const ocean = index === 0
      ? {
          openness: 52,
          conscientiousness: 76,
          extraversion: 34,
          agreeableness: 46,
          neuroticism: 68,
        }
      : {
          openness: 68,
          conscientiousness: 62,
          extraversion: 28,
          agreeableness: 70,
          neuroticism: 78,
        };

    return {
      id,
      anonymousLabel: label,
      role,
      systemPrompt: `너는 ${label}로 보이는 조언자다. ${truncateForPrompt(prompt, 120)}라는 관점으로 짧게 말하고, 감정보다 위험 규칙과 관찰 단서를 먼저 꺼낸다.`,
      mbti: index === 0 ? "ISTP" : "INFJ",
      ocean,
      relationshipTags: uniqueStrings([
        "advisor-slot",
        index === 0 ? "risk-first" : "nervous-observer",
        "generated-draft",
      ]),
      autonomy: index === 0 ? 0.55 : 0.65,
      handout: {
        secret: `${truncateForPrompt(prompt, 120)}와 연결된 위험 징후를 이전 턴 또는 이전 루프에서 일부 목격했다.`,
        desire: "사용자가 첫 선택에서 치명적인 실수를 피하게 만들고 싶다.",
        objective: `${truncateForPrompt(prompt, 120)} 단서를 확인하게 만들고, 사용자가 성급하게 이동하지 않게 붙잡는다.`,
        initialRelationshipToUser: index === 0 ? 1 : 2,
        surfacePersonality: [index === 0 ? "경고가 빠르다" : "불안하지만 관찰력이 좋다"],
        fear: "사용자가 규칙을 검증하기 전에 방장이나 공간의 유도에 반응하는 것",
        behaviorRules: ["대사는 짧게", "위험 규칙 우선", "다른 인물의 대사를 대신 쓰지 않음"],
      },
    };
  });
}

function normalizeAdvisorDraft(draft: AdvisorDraftInput, index: number): AdvisorDraft {
  const normalized: AdvisorDraft = {
    id: draft.id || `advisor-${index + 1}`,
    anonymousLabel: draft.anonymousLabel || `[익명 ${index + 1}]`,
    role: draft.role,
    systemPrompt: draft.systemPrompt,
    mbti: draft.mbti || "unspecified",
    ocean: { ...draft.ocean },
    relationshipTags: uniqueStrings(["advisor-slot", ...draft.relationshipTags]),
  };
  if (draft.autonomy !== undefined) {
    normalized.autonomy = draft.autonomy;
  }
  if (draft.handout) {
    normalized.handout = normalizePartialHandout(draft.handout);
  }
  return normalized;
}

function normalizePartialHandout(handout: NonNullable<AdvisorDraftInput["handout"]>): Partial<CharacterHandoutDefinition> {
  const normalized: Partial<CharacterHandoutDefinition> = {};
  const secret = nonEmpty(handout.secret);
  const desire = nonEmpty(handout.desire);
  const objective = nonEmpty(handout.objective);
  const fear = nonEmpty(handout.fear);
  if (secret) normalized.secret = secret;
  if (desire) normalized.desire = desire;
  if (objective) normalized.objective = objective;
  if (handout.initialRelationshipToUser !== undefined) {
    normalized.initialRelationshipToUser = clamp(handout.initialRelationshipToUser, -10, 10);
  }
  const surfacePersonality = cleanStringArray(handout.surfacePersonality);
  if (surfacePersonality.length > 0) {
    normalized.surfacePersonality = surfacePersonality;
  }
  if (fear) {
    normalized.fear = fear;
  }
  const behaviorRules = cleanStringArray(handout.behaviorRules);
  if (behaviorRules.length > 0) {
    normalized.behaviorRules = behaviorRules;
  }
  return normalized;
}

function normalizeModelConnection(connection?: ModelConnectionInput): ModelConnection | undefined {
  if (!connection) {
    return undefined;
  }
  const normalized: ModelConnection = {
    providerId: connection.providerId,
    apiKey: connection.apiKey,
    model: connection.model,
  };
  if (connection.baseUrl) {
    normalized.baseUrl = connection.baseUrl;
  }
  return normalized;
}

function makeMakerMessage(content: string) {
  return {
    id: crypto.randomUUID(),
    sessionId: "draft-maker",
    role: "user" as const,
    content,
    createdAt: new Date().toISOString(),
  };
}

function hasUsableConnection(connection?: ModelConnection): connection is ModelConnection {
  return isConnectionReady(connection);
}

function parseJsonObject(raw: string): unknown {
  const candidate = extractJsonCandidate(raw);
  return JSON.parse(candidate);
}

function extractJsonCandidate(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const objectStart = trimmed.indexOf("{");
  const arrayStart = trimmed.indexOf("[");
  const starts = [objectStart, arrayStart].filter((index) => index >= 0);
  if (starts.length === 0) {
    return trimmed;
  }

  const start = Math.min(...starts);
  const objectEnd = trimmed.lastIndexOf("}");
  const arrayEnd = trimmed.lastIndexOf("]");
  const end = Math.max(objectEnd, arrayEnd);
  return end > start ? trimmed.slice(start, end + 1) : trimmed.slice(start);
}

function getNestedObject(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return (value as Record<string, unknown>)[key];
}

function getNestedArray(value: unknown, key: string): unknown {
  const nested = getNestedObject(value, key);
  return Array.isArray(nested) ? nested : undefined;
}

function inferPersonaName(prompt: string): string {
  if (prompt.includes("전학생")) {
    return "전학생";
  }
  if (prompt.includes("선생")) {
    return "선생님";
  }
  if (prompt.includes("작가")) {
    return "작가";
  }
  return "초대자";
}
