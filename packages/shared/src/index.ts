import type { CaseBoardView, CharacterHandoutDefinition, SessionStateV2 } from "./engine-v2.js";

export type ProviderKind = "dry-run" | "openai-compatible" | "gemini";

/**
 * How the user's input should be interpreted by the engine.
 *
 * - `chat`    : typed into the group chat — other characters read it as a message
 * - `action`  : physical action in the scene (*별표* or ⚡ button)
 * - `whisper` : inner monologue / aside — not visible to other characters
 */
export type InputMode = "chat" | "action" | "whisper";

export type ModelProviderId = "nanogpt" | "openrouter" | "chatgpt";

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
  autonomy?: number;
  handout?: Partial<CharacterHandoutDefinition>;
}

export interface PersonaDraft {
  name: string;
  shortName?: string;
  role: string;
  description?: string;
  appearance?: string;
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
  /** Free-form persona description (optional, player-authored). */
  description?: string;
  /** Observable appearance, for narrator/visual continuity. */
  appearance?: string;
}

export interface ScenarioOpeningBeat {
  id: string;
  role: "narrator" | "system";
  speakerKind: SpeakerKind;
  speakerLabel: string;
  characterId?: string;
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
  initialSceneMode?: import("./engine-v2.js").SceneMode;
  uiMode?: import("./engine-v2.js").ScenarioManifest["uiMode"];
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
  generationModel?: GenerationModelSnapshot;
  fallbackReason?: string;
  /** How the user intended this message to be read by the engine. */
  inputMode?: InputMode;
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

export interface GenerationModelSnapshot {
  providerId: ModelProviderId;
  model: string;
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
  billingTier?: "subscription" | "paid" | "unknown";
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

/**
 * Client-facing v2 session DTO while the React app still renders v1-compatible fields.
 * It keeps canonical v2 state (`scenarioPackId`, `worldState`, `handouts`, `summaries`)
 * and adds v1 UI aliases (`scenario`, `scene`, `persona`, `characters`, `messages`).
 */
export type ClientSessionState = Omit<
  SessionStateV2,
  "persona" | "characters" | "messages" | "title" | "turnCheckpoints" | "createdAt" | "updatedAt"
> & SessionState & {
  /** Player-safe case board projection (clues, statements, contradictions, dossiers). */
  caseBoard?: CaseBoardView;
};

export interface AssetManifest {
  backgrounds: Array<{
    id: string;
    name: string;
    url: string;
    kind: "messenger" | "school" | "interior" | "exterior";
    tags?: string[];
  }>;
  sprites: Array<{
    id: string;
    characterId: string;
    expression: ExpressionId;
    url: string;
    fullBody: boolean;
  }>;
}

// ── Engine v2 types ──
export * from "./engine-v2.js";
