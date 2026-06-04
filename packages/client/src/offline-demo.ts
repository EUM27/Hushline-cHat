import type {
  AdvisorDraft,
  AssetManifest,
  BoundaryReport,
  CharacterProfile,
  ClientSessionState,
  DirectorOutput,
  InputMode,
  ProviderProfile,
  StateLawSnapshot,
  TurnMessage,
} from "@hushline/shared";
import type { SessionPersonaInput, V2AdvanceResponse, V2ScenarioDetailResponse } from "./api-v2";

const offlineSessionStore = new Map<string, ClientSessionState>();

export const offlineAssetManifest: AssetManifest = {
  backgrounds: [
    {
      id: "messenger-blank",
      name: "메신저 화면",
      url: "/assets/backgrounds/messenger-blank.svg",
      kind: "messenger",
    },
    {
      id: "school-classroom",
      name: "새 학기 교실",
      url: "/assets/backgrounds/school-classroom.png",
      kind: "interior",
    },
  ],
  sprites: [],
};

export const offlineProviderProfiles: ProviderProfile[] = [
  {
    id: "nanogpt",
    label: "NanoGPT",
    baseUrl: "https://nano-gpt.com/api/v1",
    endpointPath: "/chat/completions",
    docsUrl: "https://docs.nano-gpt.com/api-reference/endpoint/chat-completion",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    endpointPath: "/chat/completions",
    docsUrl: "https://openrouter.ai/docs/api-reference/chat-completion",
  },
  {
    id: "chatgpt",
    label: "ChatGPT",
    baseUrl: "https://chatgpt.com/backend-api/codex",
    endpointPath: "/responses",
    docsUrl: "https://auth.openai.com",
  },
];

export const offlineScenarioIds = ["school-life-anomaly"];

export const offlineScenarioDetail: V2ScenarioDetailResponse = {
  manifest: {
    id: "school-life-anomaly-chat",
    title: "학교생활",
    subtitle: "이상공간 단톡방",
    genre: "horror",
    version: "1.0.0",
  },
  scenarioCard: {
    title: "학교생활",
    subtitle: "이상공간 단톡방",
    description: "학교에 갇힌 채 단톡방만 연결되는 상황에서, 익명의 참가자들과 단서를 맞춰 나간다.",
    interventionPrompt: "채팅으로 반응하거나 행동을 선언해 상황을 밀어 보세요.",
  },
  characters: [
    {
      id: "advisor-1",
      name: "익명 1",
      shortName: "익명 1",
      role: "침착하게 상황을 정리하는 참가자",
      anonymousLabel: "익명 1",
      autonomy: 0.55,
    },
    {
      id: "advisor-2",
      name: "익명 2",
      shortName: "익명 2",
      role: "위험 신호에 민감하게 반응하는 참가자",
      anonymousLabel: "익명 2",
      autonomy: 0.7,
    },
  ],
  mainObjective: {
    id: "survive-chat-room",
    description: "이상공간의 규칙을 파악하고 안전한 출구를 찾는다.",
  },
};

export function createOfflineSession(
  scenarioPackId: string,
  personaInput?: string | SessionPersonaInput,
  advisorDrafts?: AdvisorDraft[],
): ClientSessionState {
  const id = `offline-${crypto.randomUUID()}`;
  const createdAt = new Date().toISOString();
  const personaProfile = normalizeOfflinePersona(personaInput);
  const persona = {
    id: "user",
    name: personaProfile.name || "나",
    shortName: personaProfile.shortName || personaProfile.name || "나",
    role: personaProfile.role || "단톡방에 초대된 인물",
    mbti: "UNKNOWN",
    relationshipTags: personaProfile.relationshipTags ?? [],
    ...(personaProfile.description ? { description: personaProfile.description } : {}),
    ...(personaProfile.appearance ? { appearance: personaProfile.appearance } : {}),
  };
  const characters = buildCharacters(advisorDrafts);
  const firstCharacter = characters[0];
  const openingCharacterMessage: TurnMessage = {
    id: `offline-opening-${crypto.randomUUID()}`,
    sessionId: id,
    role: "character",
    speakerKind: "advisor-slot",
    speakerLabel: firstCharacter?.anonymousLabel ?? firstCharacter?.name ?? "익명 1",
    content: "…초대장이 떴어. 일단 화면은 움직이는지부터 확인하자.",
    createdAt,
    isOpeningBeat: true,
    generationSource: "dry-run",
  };
  if (firstCharacter) {
    openingCharacterMessage.characterId = firstCharacter.id;
  }
  const openingMessages: TurnMessage[] = [
    {
      id: `offline-opening-${crypto.randomUUID()}`,
      sessionId: id,
      role: "system",
      speakerKind: "room-master",
      speakerLabel: "방장",
      content: "모바일 피드백용 로컬 데모로 열렸습니다. API가 복구되면 실제 런타임 응답으로 전환됩니다.",
      createdAt,
      isOpeningBeat: true,
      generationSource: "dry-run",
    },
    openingCharacterMessage,
  ];

  const session: ClientSessionState = {
    id,
    scenarioPackId,
    title: offlineScenarioDetail.manifest.title,
    persona,
    scenario: {
      id: offlineScenarioDetail.manifest.id,
      title: offlineScenarioDetail.scenarioCard.title,
      subtitle: offlineScenarioDetail.scenarioCard.subtitle,
      description: offlineScenarioDetail.scenarioCard.description,
      spaceRules: [],
      chatRules: [],
      toneRules: [],
      hardNos: [],
      backgroundIds: ["messenger-blank", "school-classroom"],
      initialLocationId: "school-chat-room",
      initialBackgroundId: "messenger-blank",
      initialSceneMode: "messenger",
      uiMode: "messenger-first",
      interventionPrompt: offlineScenarioDetail.scenarioCard.interventionPrompt,
      openingBeats: [],
    },
    scene: {
      sessionId: id,
      scenarioId: offlineScenarioDetail.manifest.id,
      locationId: "school-chat-room",
      backgroundId: "messenger-blank",
      activeSpeakerId: characters[0]?.id ?? null,
      tension: 0,
      danger: 0,
      turnNumber: 0,
      hasEnteredScene: false,
      recentSpeakerIds: [],
      relationships: {},
    },
    worldState: {
      sessionId: id,
      scenarioId: offlineScenarioDetail.manifest.id,
      sceneMode: "messenger",
      locationId: "school-chat-room",
      backgroundId: "messenger-blank",
      tension: 0,
      danger: 0,
      turnNumber: 0,
      hasEnteredScene: false,
      mainObjective: {
        id: offlineScenarioDetail.mainObjective.id,
        description: offlineScenarioDetail.mainObjective.description,
        status: "active",
      },
      subObjectives: [],
      characterStates: Object.fromEntries(characters.map((character) => [
        character.id,
        {
          id: character.id,
          currentObjective: "모바일 화면 흐름을 유지한다.",
          knownFacts: [],
          relationshipToUser: 0,
          lastSpokeTurn: 0,
          isRevealed: true,
          autonomy: 0.5,
        },
      ])),
      relationshipGraph: [],
      recentEvents: [],
      recentSpeakerIds: [],
      sceneInertiaCounter: 0,
      recentBeatTypes: [],
    },
    characters,
    handouts: Object.fromEntries(characters.map((character) => [
      character.id,
      {
        characterId: character.id,
        secret: "로컬 데모 세션에서는 비밀 정보를 사용하지 않습니다.",
        desire: "사용자가 모바일 화면을 확인할 수 있게 돕는다.",
        objective: "대화 흐름을 끊기지 않게 유지한다.",
        relationshipToUser: 0,
        knownFacts: [],
        myRelationships: [],
        autonomy: 0.5,
      },
    ])),
    summaries: [],
    messages: openingMessages,
    createdAt,
    updatedAt: createdAt,
  };

  offlineSessionStore.set(id, session);
  return session;
}

function normalizeOfflinePersona(input?: string | SessionPersonaInput): SessionPersonaInput {
  if (typeof input === "string") {
    return { name: input.trim() };
  }
  return {
    ...(input?.name?.trim() ? { name: input.name.trim() } : {}),
    ...(input?.shortName?.trim() ? { shortName: input.shortName.trim() } : {}),
    ...(input?.role?.trim() ? { role: input.role.trim() } : {}),
    ...(input?.description?.trim() ? { description: input.description.trim() } : {}),
    ...(input?.appearance?.trim() ? { appearance: input.appearance.trim() } : {}),
    ...(input?.relationshipTags?.length
      ? { relationshipTags: input.relationshipTags.map((tag) => tag.trim()).filter(Boolean) }
      : {}),
  };
}

export function getOfflineSession(sessionId: string): ClientSessionState | null {
  return offlineSessionStore.get(sessionId) ?? null;
}

export function advanceOfflineSession(
  sessionId: string,
  content: string,
  inputMode: InputMode,
): V2AdvanceResponse {
  const session = offlineSessionStore.get(sessionId);
  if (!session) {
    throw new Error("로컬 데모 세션을 찾을 수 없습니다.");
  }

  const createdAt = new Date().toISOString();
  const turnNumber = session.scene.turnNumber + 1;
  const speaker = session.characters[turnNumber % session.characters.length] ?? session.characters[0];
  const userMessage: TurnMessage = {
    id: `offline-user-${crypto.randomUUID()}`,
    sessionId,
    role: "user",
    content,
    inputMode,
    createdAt,
  };
  const characterMessage: TurnMessage = {
    id: `offline-character-${crypto.randomUUID()}`,
    sessionId,
    role: "character",
    speakerKind: "advisor-slot",
    speakerLabel: speaker?.anonymousLabel ?? speaker?.name ?? "익명",
    content: "도착했어. 지금은 로컬 데모 응답이라 실제 엔진 판단은 아니지만, 모바일 채팅 흐름은 계속 확인할 수 있어.",
    createdAt,
    generationSource: "dry-run",
  };
  if (speaker) {
    characterMessage.characterId = speaker.id;
  }
  const nextSession: ClientSessionState = {
    ...session,
    scene: {
      ...session.scene,
      activeSpeakerId: speaker?.id ?? null,
      turnNumber,
      hasEnteredScene: true,
      recentSpeakerIds: [...session.scene.recentSpeakerIds.slice(-4), speaker?.id ?? "offline"],
    },
    worldState: {
      ...session.worldState,
      turnNumber,
      hasEnteredScene: true,
      recentSpeakerIds: [...session.worldState.recentSpeakerIds.slice(-4), speaker?.id ?? "offline"],
    },
    messages: [...session.messages, userMessage, characterMessage],
    updatedAt: createdAt,
  };
  offlineSessionStore.set(sessionId, nextSession);

  return {
    session: nextSession,
    turn: {
      messages: [userMessage, characterMessage],
      directorOutput: makeOfflineDirectorOutput(speaker?.id),
      boundaryReport: emptyBoundaryReport,
      stateLaw: offlineStateLaw,
    },
  };
}

export function rerollOfflineSession(sessionId: string): V2AdvanceResponse {
  const session = offlineSessionStore.get(sessionId);
  if (!session) {
    throw new Error("로컬 데모 세션을 찾을 수 없습니다.");
  }
  const lastUser = [...session.messages].reverse().find((message) => message.role === "user");
  return advanceOfflineSession(sessionId, lastUser?.content ?? "다시 보여줘.", lastUser?.inputMode ?? "chat");
}

export function undoOfflineSession(sessionId: string): ClientSessionState {
  const session = offlineSessionStore.get(sessionId);
  if (!session) {
    throw new Error("로컬 데모 세션을 찾을 수 없습니다.");
  }
  const nextSession = {
    ...session,
    messages: session.messages.slice(0, Math.max(1, session.messages.length - 2)),
    updatedAt: new Date().toISOString(),
  };
  offlineSessionStore.set(sessionId, nextSession);
  return nextSession;
}

function buildCharacters(advisorDrafts?: AdvisorDraft[]): CharacterProfile[] {
  const drafts = advisorDrafts?.length ? advisorDrafts : [
    {
      id: "advisor-1",
      anonymousLabel: "익명 1",
      role: "침착하게 상황을 정리하는 참가자",
      systemPrompt: "침착하고 짧게 답한다.",
      mbti: "INTJ",
      ocean: { openness: 60, conscientiousness: 70, extraversion: 30, agreeableness: 45, neuroticism: 35 },
      relationshipTags: [],
    },
    {
      id: "advisor-2",
      anonymousLabel: "익명 2",
      role: "위험 신호에 민감한 참가자",
      systemPrompt: "불길한 단서를 놓치지 않는다.",
      mbti: "INFJ",
      ocean: { openness: 65, conscientiousness: 55, extraversion: 35, agreeableness: 50, neuroticism: 65 },
      relationshipTags: [],
    },
  ];

  return drafts.map((draft, index) => ({
    id: draft.id || `advisor-${index + 1}`,
    name: draft.anonymousLabel || `익명 ${index + 1}`,
    shortName: draft.anonymousLabel || `익명 ${index + 1}`,
    role: draft.role,
    profileKind: "advisor-slot",
    anonymousLabel: draft.anonymousLabel || `익명 ${index + 1}`,
    revealed: true,
    provider: "dry-run",
    model: "offline-demo",
    mbti: draft.mbti,
    ocean: draft.ocean,
    systemPrompt: draft.systemPrompt,
    relationshipTags: draft.relationshipTags,
  }));
}

function makeOfflineDirectorOutput(speakerId?: string): DirectorOutput {
  return {
    speakers: speakerId ? [speakerId] : [],
    silence: false,
    event: null,
    narratorInstruction: null,
    characterIntents: speakerId ? { [speakerId]: "모바일 화면 피드백용 응답" } : {},
    stateDelta: {},
    subObjectiveUpdate: null,
    relationshipUpdate: null,
    directives: [],
    delay: null,
  };
}

const emptyBoundaryReport: BoundaryReport = {
  corrected: false,
  violations: [],
};

const offlineStateLaw: StateLawSnapshot = {
  immutableFacts: ["API 실패 시에만 로컬 데모 세션을 사용한다."],
  slowState: ["실제 서버 상태와 동기화되지 않는다."],
  scenePressure: ["모바일 UI 피드백을 위해 화면 흐름을 유지한다."],
  outputRules: ["실제 엔진 판단으로 취급하지 않는다."],
};
