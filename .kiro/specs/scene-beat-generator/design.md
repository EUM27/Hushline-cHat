# Design Document — Scene Beat Generator 연결

## Overview

`SceneBeatGenerator`(이미 구현됨)를 턴 파이프라인에 연결한다. 작업은 4개 레이어를
관통한다.

```
shared (타입)        →  ScenarioPack.sceneDevices, WorldState.sceneInertiaCounter/recentBeatTypes
server (스키마/로더)  →  sceneOccurrenceDeviceSchema, scene-devices.json 로드 + 참조/누출 검증
server (파이프라인)   →  runTurnV2 안에 비트 주입 단계 + 런타임 누출 가드 + 메시지 표면화
data (시나리오 팩)    →  locked-room-mystery/scene-devices.json
```

핵심 설계 원칙: **기존 동작을 깨지 않는 순수 증분(additive)**. `sceneDevices`가 없는 팩은
지금과 동일하게 동작하고, 비트는 inertia 임계값에 도달할 때만 주입된다.

## Architecture

### 데이터 흐름 (한 턴)

```
runTurnV2
  ├─ (기존) Director → Narrator → Characters → State Update
  ├─ [NEW] Step 6.5: Scene Beat Injection
  │     ├─ turnHadMeaningfulEvent = 판정(직접 발화/이벤트/상태변화 유무)
  │     ├─ nextInertia = updateInertia(prevInertia, turnHadMeaningfulEvent)
  │     ├─ if shouldInjectBeat(nextInertia) && pack.sceneDevices?.length:
  │     │     beat = selectBeat(pack.sceneDevices, nextWorldState, recentBeatTypes)
  │     │     beat = sanitizeBeat(beat, hiddenTruthIds, caseFacts)   // 런타임 누출 가드
  │     │     nextWorldState = applySceneBeat(nextWorldState, beat)  // stateDelta + recentBeatTypes + inertia reset
  │     │     beatMessage = buildBeatMessage(beat)                   // 나레이터 계열 메시지
  │     └─ else: nextWorldState.sceneInertiaCounter = nextInertia
  └─ Step 7: Message Assembly (beatMessage 포함)
```

### 모듈 책임 분배

| 모듈 | 변경 | 책임 |
|------|------|------|
| `shared/engine-v2/scenario.ts` | `sceneDevices?` 필드 추가 | 팩 타입 |
| `shared/engine-v2/base.ts` | `WorldState`에 추적 필드 2개 추가 | 상태 모양 |
| `server/.../schemas.ts` | `sceneOccurrenceDeviceSchema` 추가 | Zod 검증 |
| `server/.../scenario-loader.ts` | `scene-devices.json` 로드 + 검증 | I/O + 참조 무결성 |
| `server/.../state-manager.ts` | init 필드 + `applySceneBeat` | 상태 전이 |
| `server/.../scene-beat-generator.ts` | `sanitizeBeat`, `turnHadMeaningfulEvent` 헬퍼 추가 | 비트 로직 |
| `server/.../pipeline.ts` | Step 6.5 연결 | 오케스트레이션 |
| `server/.../session-helpers.ts` | `reconstructPack`에 `sceneDevices: []` | 라운드트립 |

## Components and Interfaces

### 1. shared — 타입 변경

```ts
// scenario.ts
export interface ScenarioPack {
  // ...기존 필드
  sceneDevices?: SceneOccurrenceDevice[];   // [NEW]
}

// base.ts — WorldState
export interface WorldState {
  // ...기존 필드
  sceneInertiaCounter: number;   // [NEW] 의미 있는 사건 없이 지난 턴 수
  recentBeatTypes: string[];     // [NEW] 최근 주입된 비트 유형 (직전 N개)
}
```

`WorldState`를 사용하는 모든 생성 지점(`createInitialWorldState`, 테스트의
`minimalWorldState`)에서 두 필드를 초기화해야 한다. 옵셔널이 아닌 필수 필드로 두어
누락 시 타입 에러로 잡히게 한다 (안전).

### 2. server — Zod 스키마

```ts
export const sceneOccurrenceDeviceSchema = z.object({
  id: z.string().min(1).max(120),
  type: z.enum(["relational","informational","npc_driven","social","logistical","quiet_texture","timed_optional"]),
  trigger: z.object({
    conditionType: z.string().min(1),
    conditionValue: z.unknown(),
    requiresAll: z.array(z.string()).optional(),
    requiresAny: z.array(z.string()).optional(),
    blocksIf: z.array(z.string()).optional(),
  }),
  effect: z.object({
    sceneBeat: z.string().min(1).max(2000),
    stateDelta: z.object({
      tension: z.number().min(-10).max(10).optional(),
      danger: z.number().min(-10).max(10).optional(),
      factReveals: z.array(z.string()).optional(),
      relationshipChanges: z.array(z.object({
        sourceId: z.string(), targetId: z.string(),
        descriptor: z.string(), intensityDelta: z.number(),
      })).optional(),
    }).optional(),
    npcReactions: z.array(z.object({ npcId: z.string(), reaction: z.string() })).optional(),
  }),
  oneShot: z.boolean(),
  cooldown: z.number().int().min(0).optional(),
  priority: z.number().optional(),
});
```

### 3. server — 로더 + 검증

`loadScenarioPack`에 추가:

```ts
// scene-devices.json (optional)
const sceneDevicesPath = join(abs, "scene-devices.json");
let sceneDevices: SceneOccurrenceDevice[] = [];
if (existsSync(sceneDevicesPath)) {
  // JSON 파싱 → 배열 → 각 항목 sceneOccurrenceDeviceSchema.safeParse
  // 실패 시 errors.push(...) → 로드 실패
}
// pack에 ...(sceneDevices.length ? { sceneDevices } : {})
```

검증 함수 `validateSceneDevices(devices, characters, caseKnowledge, errors)`:
- `factReveals`의 각 id가 fact id 집합에 존재하는가 (Req 2.1)
- `factReveals`가 hidden truth id를 참조하면 누출 위험 오류 + 실패 (Req 2.3)
- `npcReactions[].npcId`가 캐릭터 id 집합에 있는가 (Req 2.2)
- `relationshipChanges`의 sourceId/targetId가 캐릭터 id 집합에 있는가 (Req 2.4)

fact id / hidden truth id 집합은 기존 `validateCaseKnowledge`의 수집 로직을 재사용한다
(공통 헬퍼로 추출).

### 4. server — scene-beat-generator 보강

기존 export 유지. 다음 두 헬퍼 추가:

```ts
/** 이번 턴이 의미 있는 사건을 포함했는지 판정 */
export function turnHadMeaningfulEvent(input: {
  hadCharacterSpeech: boolean;
  hadDirectorEvent: boolean;
  hadStateChange: boolean;
}): boolean {
  return input.hadCharacterSpeech || input.hadDirectorEvent || input.hadStateChange;
}

/** 런타임 누출 가드 — hidden truth factReveal 제거 */
export function sanitizeBeat(
  beat: GeneratedBeat,
  hiddenTruthIds: string[],
): GeneratedBeat {
  if (!beat.stateDelta.factReveals?.length) return beat;
  const safe = beat.stateDelta.factReveals.filter((id) => !hiddenTruthIds.includes(id));
  return { ...beat, stateDelta: { ...beat.stateDelta, factReveals: safe } };
}
```

비트 텍스트(`sceneBeat`)의 hidden-truth 누출은 데이터 검증(Req 2.3)에서 1차로 막고,
주입 시 기존 narrator boundary gate(`validateNarratorDraft`)로 2차 방어한다.

`INERTIA_THRESHOLD`는 매니페스트 override를 받도록 `shouldInjectBeat(counter, threshold?)`로
확장한다 (기본값 2 유지).

### 5. server — state-manager `applySceneBeat`

```ts
const MAX_RECENT_BEAT_TYPES = 5;

export function applySceneBeat(state: WorldState, beat: GeneratedBeat): WorldState {
  const tensionDelta = beat.stateDelta.tension ?? 0;
  const dangerDelta = beat.stateDelta.danger ?? 0;
  return {
    ...state,
    tension: clamp(state.tension + tensionDelta, 0, 10),
    danger: clamp(state.danger + dangerDelta, 0, 10),
    sceneInertiaCounter: 0,  // reset (Req 4.4)
    recentBeatTypes: [...state.recentBeatTypes, beat.beatType].slice(-MAX_RECENT_BEAT_TYPES),
    recentEvents: [...state.recentEvents, {
      id: crypto.randomUUID(),
      turnNumber: state.turnNumber,
      description: `[scene-beat:${beat.deviceId}] ${beat.description}`,
      affectedCharacterIds: beat.involvedNpcs,
    }].slice(-20),
  };
}
```

`factReveals`는 caseFacts 노출 경로(scene snapshot 등)와 별개로, 현재 단계에서는
`recentEvents` 기록 + 메시지 표면화로 충분하다(스코프 최소화).

### 6. server — pipeline 연결

Step 6 이후, Step 7(메시지 조립) 직전에 삽입. `turnHadMeaningfulEvent` 판정 입력:
- `hadCharacterSpeech` = `characterMessages.length > 0`
- `hadDirectorEvent` = `Boolean(directorOutput.event)`
- `hadStateChange` = `directorOutput.stateDelta`의 tension/danger != 0

비트 메시지는 나레이터와 동일한 `role: "narrator"` 메시지로 만들되 `speakerLabel`을
`"[장면]"`으로 구분하고, `composeSceneMessages` 결과 뒤에 덧붙인다(별도 배열로 push).

### 7. data — locked-room-mystery/scene-devices.json

실제 fact/character id 사용. 예:

```json
[
  {
    "id": "device-wind-howl",
    "type": "quiet_texture",
    "trigger": { "conditionType": "always", "conditionValue": null },
    "effect": {
      "sceneBeat": "창밖에서 눈보라가 거세지며 산장 전체가 낮게 삐걱인다.",
      "stateDelta": { "tension": 1 }
    },
    "oneShot": false,
    "cooldown": 2,
    "priority": 3
  },
  {
    "id": "device-lounge-draft",
    "type": "informational",
    "trigger": { "conditionType": "turn_count", "conditionValue": 3 },
    "effect": {
      "sceneBeat": "라운지 테이블 쪽에서 찬 공기가 새어 들어온다. 누군가 최근 그곳을 지난 듯하다.",
      "stateDelta": { "tension": 1, "factReveals": ["fact_key_not_accounted_for"] },
      "npcReactions": [{ "npcId": "yoon-haeon", "reaction": "테이블 쪽을 흘깃 본다" }]
    },
    "oneShot": true,
    "priority": 6
  }
]
```

`factReveals`는 공개/관찰 가능 fact만 사용(`fact_key_not_accounted_for`). hidden truth
(`truth_killer_identity`, `truth_locked_room_trick`)는 절대 미사용.

## Data Models

변경되는 타입은 위 §Components에 명시. 신규 영속 데이터는 `WorldState`의 두 필드뿐이며,
기존 세션(필드 없는 상태)을 로드할 때를 대비해 파이프라인 진입 시 다음 정규화를 둔다:

```ts
const inertia = nextWorldState.sceneInertiaCounter ?? 0;
const recentBeats = nextWorldState.recentBeatTypes ?? [];
```

(타입은 필수지만 런타임 하위호환을 위해 nullish 병합으로 방어)

## Error Handling

| 상황 | 처리 |
|------|------|
| `scene-devices.json` 없음 | 정상, `sceneDevices` 미설정 |
| `scene-devices.json` JSON 파싱 실패 | `ScenarioLoadError` → 로드 실패 |
| 디바이스 스키마 검증 실패 | 항목별 `ScenarioLoadError` → 로드 실패 |
| factReveal이 미존재 fact | 검증 오류 → 로드 실패 |
| factReveal이 hidden truth | 누출 위험 오류 → 로드 실패 |
| 런타임에 hidden truth가 factReveals에 잔존 | `sanitizeBeat`가 제거(이중 방어) |
| 적격 디바이스 없음 | `selectBeat`의 `quiet_texture` 폴백 |

## Testing Strategy

기존 `scene-beat-generator.test.ts` 확장 + 신규 테스트:

1. **단위 — selectBeat**: one-shot 발동된 디바이스 제외 (Req 4.6), 최근 비트 유형 회피 (Req 4.x)
2. **단위 — sanitizeBeat**: hidden truth id가 factReveals에서 제거됨 (Req 5.1, 5.3)
3. **단위 — turnHadMeaningfulEvent / updateInertia**: 임계값 누적·리셋 (Req 4.1)
4. **로더 — scene-devices**: 정상 로드, hidden-truth factReveal 거부, 미존재 npcId 거부 (Req 1, 2)
5. **로더 — 하위호환**: `scene-devices.json` 없는 기존 팩 정상 로드 (Req 6.1)
6. **통합 — pipeline**: inertia 누적 후 비트 주입 → tension 반영 + recentBeatTypes 기록 + 누출 0 (Req 4, 5)

검증 명령: `corepack pnpm -r run check` + 서버 테스트 스위트 (`bun test`).
모든 기존 테스트 + 신규 테스트 통과가 완료 기준.

## Correctness Properties

이 기능이 항상 만족해야 하는 불변식(invariant):

1. **No hidden-truth leak** — 어떤 비트 주입 경로에서도 hidden truth fact id가
   `factReveals`로 표면화되거나 비트 텍스트에 노출되지 않는다. (데이터 검증 + `sanitizeBeat` +
   narrator gate, 삼중 방어)
2. **Additive compatibility** — `sceneDevices`가 없는 팩의 턴 결과는 이 기능 도입 전과
   동일하다(비트 미주입, 상태 변화 없음).
3. **Bounded growth** — `recentBeatTypes`와 `recentEvents`는 상한(각각 5, 20)을 넘지 않는다.
4. **Inertia monotonicity** — 의미 있는 사건이 없는 턴은 `sceneInertiaCounter`를 정확히 +1
   하고, 사건이 있거나 비트가 주입된 턴은 0으로 리셋한다.
5. **One-shot exclusivity** — 이미 발동된 one-shot 디바이스는 다시 선택되지 않는다.
6. **State clamping** — 비트의 tension/danger 적용 후에도 값은 항상 [0, 10] 범위를 유지한다.
