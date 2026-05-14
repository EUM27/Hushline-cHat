# Reference: Marinara Engine Analysis

마리나라 엔진(Pasta-Devs/Marinara-Engine v1.5.8)의 게임 모드 데이터 모델 분석.
Hushline v2 엔진 설계 시 참고용.

## 마리나라 엔진 개요

- TypeScript 모노레포 (client/server/shared)
- 3가지 채팅 모드: Conversation (DM), Roleplay (VN+스프라이트), Game (AI GM + 파티)
- 25+ 빌트인 에이전트 시스템
- AGPL-3.0 라이선스

---

## 핵심 데이터 모델 비교

### 1. 장면 상태 (GameActiveState)

```typescript
// 마리나라
type GameActiveState = "exploration" | "dialogue" | "combat" | "travel_rest";

// Hushline v2 — Director가 결정하는 장면 모드로 확장 가능
type SceneMode = "messenger" | "exploration" | "dialogue" | "tension" | "crisis" | "resolution";
```

**시사점**: 장면 모드를 명시적 enum으로 관리하면 Director가 "지금 어떤 분위기인지"를 구조적으로 전달 가능. 우리의 `sceneSignal`을 이쪽으로 확장하면 좋음.

### 2. 게임 스테이트 스냅샷 (GameState)

```typescript
// 마리나라 — 메시지마다 스냅샷 연결
interface GameState {
  id: string;
  chatId: string;
  messageId: string;      // ← 메시지에 1:1 연결
  swipeIndex: number;     // ← 리롤(swipe) 인덱스
  date/time/location/weather/temperature: string | null;
  presentCharacters: PresentCharacter[];
  recentEvents: string[];
  playerStats: PlayerStats | null;
  committed?: boolean;    // ← 유저가 다음 메시지 보내면 확정
}
```

**시사점**: 
- 메시지마다 WorldState 스냅샷을 연결하는 구조 → 리롤/undo 시 정확한 상태 복원 가능
- `committed` 플래그 → 확정 전까지는 임시 상태, 확정 후에는 불변
- 우리도 턴마다 WorldState 스냅샷을 메시지에 연결하면 undo가 깔끔해짐

### 3. NPC/캐릭터 추적 (GameNpc)

```typescript
// 마리나라
interface GameNpc {
  id: string;
  name: string;
  emoji: string;
  description: string;
  location: string;
  reputation: number;     // -100 ~ 100 (넓은 범위)
  met: boolean;
  notes: string[];
  avatarUrl?: string;
}
```

**시사점**:
- reputation 범위가 -100~100으로 넓음 → 미세한 관계 변화 표현 가능
- 우리의 `relationshipToUser: -5~+5`는 좀 좁을 수 있음
- `met` 플래그 → 처음 만남 이벤트 트리거에 유용
- `notes: string[]` → 우리의 `knownFacts`와 동일 개념

### 4. 퀘스트/목표 시스템 (QuestProgress)

```typescript
// 마리나라
interface QuestProgress {
  questEntryId: string;
  name: string;
  currentStage: number;
  objectives: Array<{ text: string; completed: boolean }>;
  completed: boolean;
}
```

**시사점**:
- `currentStage` → 퀘스트가 단계별로 진행됨
- `objectives` 배열 → 세부 목표를 체크리스트로 관리
- 우리의 `SubObjective`에 `stages` 개념 추가 고려

### 5. 세션 요약 (SessionSummary)

```typescript
// 마리나라 — 세션 종료 시 생성, 다음 세션에 전달
interface SessionSummary {
  sessionNumber: number;
  summary: string;
  resumePoint: string;           // 다음 세션 시작 지점
  partyDynamics: string;         // 관계 변화 요약
  partyState: string;
  keyDiscoveries: string[];      // 중요 발견
  characterMoments: string[];    // 캐릭터 간 중요 순간
  littleDetails: string[];       // 소소한 디테일 (기억용)
  statsSnapshot: Record<string, unknown>;
  npcUpdates: string[];
  nextSessionRequest?: string;   // 유저가 다음 세션에 원하는 것
  timestamp: string;
}
```

**시사점 (중요)**:
- 긴 세션 후 컨텍스트 윈도우 한계를 넘기 위해 필수
- `resumePoint` → 다음 세션 시작 시 Director에게 전달
- `characterMoments` → 관계 그래프 변화의 서사적 기록
- `littleDetails` → AI가 나중에 "아 그때 그거" 하고 꺼낼 수 있는 소재
- **Hushline v2에 반드시 추가해야 할 기능**

### 6. 에이전트 시스템 (AgentConfig)

```typescript
// 마리나라
type AgentPhase = "pre_generation" | "parallel" | "post_processing";

interface AgentConfig {
  id: string;
  type: string;
  phase: AgentPhase;
  enabled: boolean;
  connectionId: string | null;   // 에이전트별 모델 지정
  promptTemplate: string;
  tools: ToolDefinition[];
}
```

**시사점**:
- 에이전트를 플러그인처럼 on/off 가능
- 에이전트별 다른 모델 사용 가능 (우리의 connection routing과 동일)
- `phase` 개념 → pre/parallel/post 파이프라인
- 우리는 Director→Narrator→Character 순차 파이프라인이지만, 나중에 에이전트 확장 시 phase 개념 참고

### 7. 연출 시스템 (DirectionEffect)

```typescript
// 마리나라
type DirectionEffect =
  | "fade_from_black" | "fade_to_black" | "flash"
  | "screen_shake" | "blur" | "vignette" | "letterbox"
  | "color_grade" | "focus" | "pulse" | "slow_zoom"
  | "impact_zoom" | "tilt" | "desaturate"
  | "chromatic_aberration" | "film_grain"
  | "rain_streaks" | "spotlight";

interface DirectionCommand {
  effect: DirectionEffect;
  duration?: number;      // 초
  intensity?: number;     // 0-1
  target?: "background" | "content" | "all";
  params?: Record<string, string>;
}
```

**시사점 (매우 중요)**:
- 우리의 `delay` 필드를 `directives: DirectionCommand[]`로 확장하면 됨
- Director가 JSON에 연출 지시를 포함 → 클라이언트가 렌더링
- 사용자님이 말한 "채팅방이 조용해지고 → 배경 fade-in" 연출이 정확히 이 구조
- **v2 DirectorOutput에 `directives` 필드 추가 권장**

### 8. HUD 위젯 (HudWidget)

```typescript
// 마리나라
type HudWidgetType =
  | "progress_bar" | "gauge" | "relationship_meter"
  | "counter" | "stat_block" | "list"
  | "inventory_grid" | "timer";
```

**시사점**:
- 나중에 UI 확장 시 참고
- 지금은 불필요하지만, "긴장도 게이지", "관계도 미터" 같은 걸 시각화할 때 유용

### 9. Secret Plot Driver (에이전트)

```typescript
// 마리나라 빌트인 에이전트
{
  id: "secret-plot-driver",
  name: "Secret Plot Driver",
  description: "Secretly develops an overarching story arc and scene directions behind the scenes. The user never sees the actual plot — only a hint that something is unfolding.",
  phase: "pre_generation",
}
```

**시사점**:
- **우리의 Director Agent와 거의 동일한 역할**
- "유저가 모르게 뒤에서 플롯 진행" = Director의 Omniscient Context
- 마리나라는 이걸 선택적 에이전트로 두지만, 우리는 핵심 파이프라인으로 내장

### 10. 캠페인 계획 (GameCampaignPlan)

```typescript
// 마리나라
interface GameCampaignPlan {
  openingSituation?: string;
  pressureClocks?: CampaignPressureClock[];  // 시간 압박 장치
  factions?: CampaignFaction[];              // 세력 구조
  questSeeds?: string[];                     // 퀘스트 씨앗
  encounterPrinciples?: string[];            // 조우 원칙
}

interface CampaignPressureClock {
  name: string;
  steps: number;
  current: number;
  failure: string;    // 시간 다 되면 뭐가 터지는지
}
```

**시사점 (매우 좋음)**:
- `pressureClocks` → 시간 제한 장치. "30턴 안에 탈출 못하면 공간 붕괴" 같은 거
- `factions` → 세력 구조. 우리의 RelationshipGraph를 그룹 단위로 확장 가능
- `questSeeds` → Director에게 "이런 퀘스트 만들어도 됨" 힌트 제공
- **v2 시나리오 팩에 `campaignPlan` 필드 추가 고려**

---

## Hushline v2 설계에 반영할 항목

### 즉시 반영 (v2 초기 구현)

1. **DirectorOutput에 `directives` 필드 추가**
   ```typescript
   directives?: Array<{
     effect: "fade_to_black" | "screen_shake" | "blur" | "flash" | "silence_pause";
     duration?: number;
     intensity?: number;
   }>;
   ```

2. **SceneMode enum 추가** (Director가 전환)
   ```typescript
   type SceneMode = "messenger" | "exploration" | "dialogue" | "tension" | "crisis";
   ```

3. **WorldState에 스냅샷 연결 구조**
   - 각 턴의 WorldState를 메시지 ID에 연결
   - undo 시 해당 스냅샷으로 정확히 복원

### 나중에 반영 (v2 안정화 후)

4. **SessionSummary 시스템** — 긴 세션 후 자동 요약 생성
5. **PressureClock** — 시간 제한 이벤트 시스템
6. **Faction/세력 구조** — RelationshipGraph의 그룹 확장
7. **HUD 위젯** — 긴장도/관계도 시각화
8. **Combat 시스템** — 판정 + 턴제 전투 (별도 스펙)

---

## 구조적 차이점

| 항목 | 마리나라 | Hushline v2 |
|------|----------|-------------|
| 에이전트 구조 | 플러그인형 (on/off, 25+개) | 파이프라인형 (Director→Narrator→Character 고정) |
| GM 역할 | 선택적 에이전트 | 핵심 파이프라인 (Director = 세계의 의지) |
| 지식 분리 | 없음 (모든 에이전트가 같은 컨텍스트) | 3계층 (Public/Private/Omniscient) |
| 캐릭터 자율성 | 없음 | Autonomy Score (0.0-1.0) |
| 적대적 GM | 없음 (중립 진행자) | 핵심 설계 (장르별 적대적 목표) |
| 침묵 연출 | 없음 | Silence Directive |
| 시나리오 구조 | 캐릭터 카드 + 로어북 | 시나리오 팩 (파일 기반, 핸드아웃 포함) |

---

## 결론

마리나라는 "범용 AI RP 프론트엔드"로 넓게 가고 있고, Hushline은 "멀티에이전트 드라마 엔진"으로 깊게 가고 있음. 데이터 모델은 참고하되, 핵심 차별점(지식 분리, 적대적 Director, 캐릭터 자율성, 침묵 연출)은 우리만의 구조.
