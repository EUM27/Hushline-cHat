# Technical Design — Multi-Agent Turn Engine v2

## Overview

The v2 engine replaces the monolithic `turn-engine.ts` with a pipeline of isolated agent invocations orchestrated by a deterministic state machine. Each agent (Director, Narrator, Character) operates in its own knowledge sandbox with strictly controlled inputs and validated outputs.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT                                │
│  InputModeToggle → Composer → POST /api/sessions/:id/advance│
└────────────────────────────┬────────────────────────────────┘
                             │ { content, inputMode, connections }
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                     TURN PIPELINE (server)                    │
│                                                              │
│  1. Input Classification                                     │
│     └─ detectInputMode() + stripPrefix()                     │
│                                                              │
│  2. Context Assembly                                         │
│     ├─ buildPublicContext(state)                             │
│     ├─ buildOmniscientContext(state)                         │
│     └─ buildPrivateHandout(characterId, state)              │
│                                                              │
│  3. Director Invocation                                      │
│     ├─ System: directorPrompt + omniscientContext            │
│     ├─ Messages: publicChatLog (last 20)                     │
│     ├─ Output: DirectorOutput JSON                           │
│     └─ Validation: schema check + clamp + fallback           │
│                                                              │
│  4. Narrator Invocation (conditional)                        │
│     ├─ Condition: directorOutput.narratorInstruction != null  │
│     ├─ System: narratorPrompt + publicContext                │
│     ├─ Messages: last 6 public messages + user input         │
│     └─ Output: 1-2 sentence narration (truncated at labels)  │
│                                                              │
│  5. Character Invocations (1-2, sequential)                  │
│     ├─ For each speaker in directorOutput.speakers:          │
│     │   ├─ System: characterPrompt + privateHandout          │
│     │   │         + directorIntent + autonomyGuideline       │
│     │   ├─ Messages: publicChatLog (last 12)                 │
│     │   └─ Output: dialogue only (stripped + truncated)      │
│     └─ Silence: if directorOutput.silence == true, skip all  │
│                                                              │
│  6. State Update                                             │
│     ├─ Apply stateDelta (clamped)                            │
│     ├─ Update relationshipGraph                              │
│     ├─ Update characterStates (lastSpokeTurn, knownFacts)    │
│     ├─ Update subObjectives                                  │
│     └─ Persist to SQLite                                     │
│                                                              │
│  7. Response Assembly                                        │
│     └─ [userMsg, ?narratorMsg, ...characterMsgs]             │
└─────────────────────────────────────────────────────────────┘
```

## Data Models

### WorldState (extends current SceneState)

```typescript
interface WorldState {
  sessionId: string;
  scenarioId: string;
  locationId: string;
  backgroundId: string;
  tension: number;           // 0-10, clamped
  danger: number;            // 0-10, clamped
  turnNumber: number;
  hasEnteredScene: boolean;
  mainObjective: Objective;
  subObjectives: SubObjective[];
  characterStates: Record<string, CharacterState>;
  relationshipGraph: RelationshipEdge[];
  recentEvents: NarrativeEvent[];
  recentSpeakerIds: string[];
}

interface Objective {
  id: string;
  description: string;
  status: "active" | "completed" | "failed";
}

interface SubObjective extends Objective {
  createdAtTurn: number;
  deliveredVia: "dialogue" | "narrator" | "event";
}

interface CharacterState {
  id: string;
  currentObjective: string;
  knownFacts: string[];
  relationshipToUser: number;  // -5 to +5
  lastSpokeTurn: number;
  isRevealed: boolean;
  autonomy: number;            // 0.0-1.0
}

interface RelationshipEdge {
  sourceId: string;
  targetId: string;
  descriptor: string;          // e.g. "distrust", "curiosity", "hidden_affection"
  intensity: number;           // 0-10
}

interface NarrativeEvent {
  id: string;
  turnNumber: number;
  description: string;
  affectedCharacterIds: string[];
}
```

### DirectorOutput (JSON schema for Director responses)

```typescript
interface DirectorOutput {
  speakers: string[];                    // 1-2 character IDs
  silence: boolean;                      // true = skip all character invocations
  event: string | null;                  // narrative event description
  narratorInstruction: string | null;    // scene direction for narrator
  characterIntents: Record<string, string>; // characterId → intent string
  stateDelta: {
    tension?: number;                    // delta, not absolute
    danger?: number;
    locationId?: string;
    backgroundId?: string;
  };
  subObjectiveUpdate: {
    action: "create" | "progress" | "complete" | "fail";
    id?: string;
    description?: string;
    deliveredVia?: "dialogue" | "narrator" | "event";
  } | null;
  relationshipUpdate: {
    sourceId: string;
    targetId: string;
    descriptor: string;
    intensityDelta: number;
  } | null;
  delay: number | null;                  // ms suggestion for client display timing
}
```

### Scenario Pack File Structure

```
scenarios/
└── school-life-anomaly/
    ├── manifest.json
    │   {
    │     "id": "school-life-anomaly-chat",
    │     "title": "학교생활",
    │     "subtitle": "이상공간 단톡방",
    │     "genre": "horror",
    │     "version": "1.0.0",
    │     "engineVersion": ">=2.0.0"
    │   }
    ├── scenario-card.json
    │   (spaceRules, chatRules, toneRules, hardNos, backgrounds, openingBeats)
    ├── characters/
    │   ├── advisor-1.json
    │   │   {
    │   │     "profile": { id, name, shortName, mbti, ocean, autonomy, ... },
    │   │     "handout": { secret, desire, objective, initialRelationshipToUser },
    │   │     "systemPrompt": "너는 [익명 1]로 보이는 조언자다...",
    │   │     "relationships": [
    │   │       { "targetId": "advisor-2", "descriptor": "wary_ally", "intensity": 4 }
    │   │     ]
    │   │   }
    │   └── advisor-2.json
    ├── prompts/
    │   ├── director.txt    (base director system prompt)
    │   └── narrator.txt    (base narrator system prompt)
    ├── objectives/
    │   ├── main.json       { id, description }
    │   └── sub-templates.json  (optional hints for Director)
    └── events/
        └── triggers.json   (condition → event mappings for Director context)
```

### Knowledge Layer Assembly

```typescript
// PUBLIC — given to Narrator + Characters
interface PublicContext {
  scenarioTitle: string;
  currentLocation: string;
  currentBackground: string;
  tension: number;
  danger: number;
  turnNumber: number;
  publicChatLog: ChatMessage[];  // last N messages
  publicEvents: string[];        // events that happened visibly
}

// PRIVATE — given to ONE Character only
interface PrivateHandout {
  secret: string;
  desire: string;
  objective: string;
  relationshipToUser: number;
  knownFacts: string[];
  myRelationships: RelationshipEdge[];  // only edges FROM this character
  autonomy: number;
}

// OMNISCIENT — given to Director only
interface OmniscientContext {
  allSecrets: Record<string, string>;
  allDesires: Record<string, string>;
  allObjectives: Record<string, string>;
  fullRelationshipGraph: RelationshipEdge[];
  mainObjective: Objective;
  subObjectives: SubObjective[];
  characterSummaries: CharacterSummary[];
  eventTriggers: EventTrigger[];
  genreGoals: string;
}
```

## Module Structure (new engine)

```
packages/server/src/
├── engine-v2/
│   ├── pipeline.ts           # Main turn pipeline orchestrator
│   ├── director.ts           # Director agent invocation + validation
│   ├── narrator.ts           # Narrator agent invocation + truncation
│   ├── character.ts          # Character agent invocation + stripping
│   ├── context-builder.ts    # Public/Private/Omniscient assembly
│   ├── state-manager.ts      # WorldState transitions + clamping
│   ├── input-classifier.ts   # InputMode detection + prefix stripping
│   ├── output-sanitizer.ts   # All defensive strip/truncate logic
│   ├── scenario-loader.ts    # File-based scenario pack loading + validation
│   ├── schemas.ts            # Zod schemas for DirectorOutput, Manifest, etc.
│   └── types.ts              # Engine-internal types
├── engine-v2/__tests__/
│   ├── pipeline.test.ts
│   ├── director.test.ts
│   ├── narrator.test.ts
│   ├── character.test.ts
│   ├── context-builder.test.ts
│   ├── state-manager.test.ts
│   └── scenario-loader.test.ts
```

## Director System Prompt Structure

```
[Director Role]
너는 이 세계의 의지다. 중립적 진행자가 아니다.
너의 목표는 {genreGoals}이다.
단, 플레이어에게 항상 최소 하나의 생존/진행 경로를 남겨야 한다.

[Output Format]
반드시 아래 JSON 스키마만 출력한다. 설명, 대사, 나레이션 금지.
{DirectorOutput schema description}

[World State]
{omniscientContext serialized}

[Character Summaries]
{id, name, autonomy, currentObjective, secret (요약), relationships}

[Main Objective]
{mainObjective}

[Sub-Objectives]
{subObjectives with status}

[Event Triggers]
{available triggers and conditions}

[Recent Chat]
{last 20 messages, labeled}
```

## Character System Prompt Structure

```
[Character Identity]
{character.systemPrompt}

[Actor Contract]
- 대사만 출력. 나레이션/지문/다른 캐릭터 대사 금지.
- prefix 금지. 줄바꿈 후 라벨 금지.
- 1~3문장 짧게.

[Your Handout — PRIVATE]
비밀: {secret}
욕망: {desire}
현재 목표: {objective}
유저와의 관계: {relationshipToUser}
알고 있는 사실: {knownFacts}
다른 캐릭터에 대한 감정: {myRelationships}

[Autonomy: {autonomy}]
{autonomy >= 0.8: "Director의 의도를 참고하되, 네 욕망과 비밀에 따라 비틀어도 된다."}
{autonomy <= 0.3: "Director의 의도를 충실히 따른다."}

[Director's Intent for This Turn]
{characterIntents[thisCharacterId]}

[Input Mode]
{inputModeInstruction}

[Current Scene]
{publicContext summary}

[Voice Rules]
{toneRules + hardNos}
```

## Connection Routing (v2)

```typescript
// Slot keys for v2
type AgentSlot = "director" | "narrator" | string; // string = characterId

// Resolution order:
// 1. connections[slotKey]     — explicit slot config
// 2. connections["default"]   — fallback
// 3. null                     — dry-run mode
```

Client connection panel adds "Director" and "Narrator" tabs alongside character tabs.

## API Changes

### POST /api/sessions/:id/advance (updated response)

```typescript
interface AdvanceResponse {
  session: SessionState;  // includes WorldState
  turn: {
    messages: ChatMessage[];
    directorOutput: DirectorOutput;  // exposed for debugging
    worldStateDelta: Partial<WorldState>;
  };
}
```

### POST /api/sessions (updated body)

```typescript
interface CreateSessionBody {
  scenarioPackId: string;       // which pack to load
  persona?: { name?: string };
  connections?: Record<string, ModelConnection>;
}
```

## Migration Strategy

1. Build `engine-v2/` alongside existing `engine/` — no breaking changes initially
2. Add `/api/v2/sessions` endpoints using new engine
3. Client switches to v2 endpoints via feature flag
4. Remove old engine once v2 is stable

## Dry-Run Fallback Strategy

Each agent has a deterministic dry-run fallback:
- **Director**: returns safe default (first character speaks, no event, no state change)
- **Narrator**: returns hardcoded atmospheric one-liner based on location
- **Character**: returns personality-appropriate placeholder line (existing logic)

## Performance Considerations

- Director + Narrator + Character = 3 sequential API calls minimum per turn
- Optimization: Director + Narrator can be parallelized (narrator doesn't need director output if we pre-compute instruction)
- Actually no — narrator needs director's instruction. Keep sequential.
- Character calls for 2 speakers can be parallelized (Promise.all)
- Target: < 8s total turn time with fast models, < 15s with slow models
