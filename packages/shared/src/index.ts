export type ProviderKind = "dry-run" | "openai-compatible" | "gemini";

export type ModelProviderId = "nanogpt" | "openrouter";

export type SpeakerKind =
  | "scenario-crowd"
  | "room-master"
  | "advisor-slot"
  | "named-actor";

export type ExpressionId =
  | "neutral"
  | "happy"
  | "sad"
  | "thinking"
  | "surprised"
  | "worried"
  | "angry";

export interface AdvisorDraft {
  id: string;
  anonymousLabel: string;
  role: string;
  systemPrompt: string;
  mbti: string;
  ocean: {
    openness: number;
    conscientiousness: number;
    extraversion: number;
    agreeableness: number;
    neuroticism: number;
  };
  relationshipTags: string[];
}

export interface CharacterProfile {
  id: string;
  name: string;
  shortName: string;
  role: string;
  profileKind: "advisor-slot" | "named-actor";
  anonymousLabel?: string;
  revealed: boolean;
  provider: ProviderKind;
  model: string;
  mbti: string;
  ocean: {
    openness: number;
    conscientiousness: number;
    extraversion: number;
    agreeableness: number;
    neuroticism: number;
  };
  systemPrompt: string;
  relationshipTags: string[];
  spriteSetId?: string;
  avatarId?: string;
}

export interface PersonaProfile {
  id: string;
  name: string;
  shortName: string;
  role: string;
  mbti: string;
  relationshipTags: string[];
}

export interface ScenarioOpeningBeat {
  id: string;
  role: "narrator" | "system";
  speakerKind: SpeakerKind;
  speakerLabel: string;
  content: string;
}

export interface ScenarioCard {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  spaceRules: string[];
  chatRules: string[];
  toneRules: string[];
  hardNos: string[];
  backgroundIds: string[];
  initialLocationId: string;
  initialBackgroundId: string;
  interventionPrompt: string;
  openingBeats: ScenarioOpeningBeat[];
}

export interface SceneState {
  sessionId: string;
  scenarioId: string;
  locationId: string;
  backgroundId: string;
  activeSpeakerId: string | null;
  tension: number;
  danger: number;
  turnNumber: number;
  hasEnteredScene: boolean;
  recentSpeakerIds: string[];
  relationships: Record<string, number>;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: "user" | "character" | "narrator" | "system";
  content: string;
  createdAt: string;
  characterId?: string;
  speakerKind?: SpeakerKind;
  speakerLabel?: string;
  isOpeningBeat?: boolean;
  expression?: ExpressionId;
  generationSource?: "api" | "dry-run";
  fallbackReason?: string;
}

export interface DirectorDecision {
  sceneSignal:
    | "stay_messenger"
    | "scenario_opening"
    | "answer_opening_prompt"
    | "raise_tension"
    | "cooldown";
  candidateSpeakerIds: string[];
  primarySpeakerId: string;
  needsFollowUp: boolean;
  followUpSpeakerId?: string;
  stateDelta: {
    locationId?: string;
    backgroundId?: string;
    tension?: number;
    danger?: number;
    hasEnteredScene?: boolean;
  };
  note: string;
}

export interface ActorReply {
  characterId: string;
  content: string;
  expression: ExpressionId;
  intent: "answer" | "warn" | "deflect" | "escalate" | "comfort";
  wantsFollowUp: boolean;
  generationSource: "api" | "dry-run";
  fallbackReason?: string;
}

export interface ModelConnection {
  providerId: ModelProviderId;
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export interface ProviderProfile {
  id: ModelProviderId;
  label: string;
  baseUrl: string;
  endpointPath: string;
  docsUrl: string;
}

export interface ModelOption {
  id: string;
  label: string;
}

export interface SessionState {
  id: string;
  title: string;
  persona: PersonaProfile;
  scenario: ScenarioCard;
  scene: SceneState;
  characters: CharacterProfile[];
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface AssetManifest {
  backgrounds: Array<{
    id: string;
    name: string;
    url: string;
    kind: "messenger" | "school" | "interior";
  }>;
  sprites: Array<{
    id: string;
    characterId: string;
    expression: ExpressionId;
    url: string;
    fullBody: boolean;
  }>;
}
