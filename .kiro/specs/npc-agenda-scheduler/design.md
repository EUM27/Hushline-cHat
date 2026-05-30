# Design Document — NPC Agenda Scheduler 연결

## Overview

`NpcAgendaScheduler`를 턴 파이프라인에 연결한다. 스코프는 **Director가 발화자를 비워둔
턴 한정**으로, 자율성이 높고 오래 침묵한 NPC 1명을 결정적으로 선택해 기존 character
invocation 경로로 발화시킨다. 동시에 모듈의 두 결함(존재하지 않는 `turnNumber` 참조,
`Math.random()` 비결정성)을 수정한다.

설계 원칙:
- **Additive + 보수적** — Director가 speaker를 고른 턴은 일절 건드리지 않는다.
- **결정적** — 무작위 제거. autonomy·침묵 기간 기반 정렬로 선택.
- **경계 재사용** — 자율 발화도 `invokeCharacter` + boundary gate + answerScope를
  그대로 통과한다. 새 정보 경로를 만들지 않는다.

## Architecture

### 데이터 흐름 (한 턴)

```
runTurnV2
  ├─ Step 3: Director → directorOutput (speakers, silence, intents)
  ├─ Step 5: Character Invocations (directorOutput.speakers 기준)
  │     └─ [NEW] Step 5.5: Autonomous Speaker Fallback
  │           조건: !directorOutput.silence && directorOutput.speakers.length === 0
  │                 && characterMessages.length === 0
  │           ├─ candidate = selectAutonomousSpeaker(characters, worldState, currentTurn)
  │           ├─ if candidate:
  │           │     handout = buildPrivateHandout(candidate)
  │           │     intent  = getCurrentAgenda(...).nextAction (안전 요약)
  │           │     invokeCharacter(...) → boundary gate → answerScope filter
  │           │     characterMessages.push(...)  // 기존 경로 재사용
  │           └─ else: 변화 없음
  ├─ Step 6: State Update (speakerIds에 자율 발화자 포함 → lastSpokeTurn 갱신)
  ├─ Step 6.5: Scene Beat (자율 발화 발생 시 hadCharacterSpeech=true → inertia reset)
  └─ Step 7: Message Assembly
```

### 모듈 책임 분배

| 모듈 | 변경 | 책임 |
|------|------|------|
| `agenda-scheduler.ts` | 결함 수정 + `selectAutonomousSpeaker` 추가 | 자율 발화 판정/선택 |
| `pipeline.ts` | Step 5.5 삽입 | 오케스트레이션 |

서버만 변경. shared 타입 변경 없음(기존 `CharacterStateV2.lastSpokeTurn`, `autonomy` 사용).

## Components and Interfaces

### 1. agenda-scheduler — 결함 수정

```ts
// 기존: shouldActAutonomously가 Math.random() 사용 → 비결정적
// 변경: 결정적 게이트만 남긴다. "자격(eligibility)"만 판정.
export function isAutonomyEligible(
  state: CharacterStateV2,
  currentTurn: number,
  opts: { minAutonomy?: number; minSilenceTurns?: number } = {},
): boolean {
  const minAutonomy = opts.minAutonomy ?? 0.7;
  const minSilence = opts.minSilenceTurns ?? 3;
  if (state.autonomy < minAutonomy) return false;
  const silenceTurns = currentTurn - state.lastSpokeTurn;
  return silenceTurns >= minSilence;
}
```

기존 `shouldActAutonomously(state, currentTurn)`는 하위호환을 위해 유지하되 내부를
`isAutonomyEligible`로 위임하고 `Math.random()`을 제거한다(결정적으로 변경).

`getCurrentAgenda`는 `currentTurn` 인자를 받도록 시그니처를 확장한다:

```ts
export function getCurrentAgenda(
  character: CharacterDefinition,
  state: CharacterStateV2,
  currentTurn: number,   // [NEW] (state as any).turnNumber 제거
): AgendaOutput { ... shouldActAutonomously: isAutonomyEligible(state, currentTurn) }
```

### 2. agenda-scheduler — 자율 발화자 선택

```ts
/**
 * Director가 아무도 선택하지 않은 턴에 자율 발화할 NPC 1명을 결정적으로 고른다.
 * 정렬: (1) 더 오래 침묵한 NPC 우선 → (2) autonomy 높은 NPC → (3) 정의 순서.
 */
export function selectAutonomousSpeaker(
  characters: CharacterDefinition[],
  worldState: WorldState,
  currentTurn: number,
  opts?: { minAutonomy?: number; minSilenceTurns?: number },
): string | undefined {
  const eligible = characters.filter((c) => {
    const state = worldState.characterStates[c.id];
    return state ? isAutonomyEligible(state, currentTurn, opts) : false;
  });
  if (eligible.length === 0) return undefined;

  return [...eligible].sort((a, b) => {
    const sa = worldState.characterStates[a.id]!;
    const sb = worldState.characterStates[b.id]!;
    const silenceA = currentTurn - sa.lastSpokeTurn;
    const silenceB = currentTurn - sb.lastSpokeTurn;
    if (silenceA !== silenceB) return silenceB - silenceA;     // 더 오래 침묵 우선
    if (sb.autonomy !== sa.autonomy) return sb.autonomy - sa.autonomy;
    return characters.indexOf(a) - characters.indexOf(b);
  })[0]?.id;
}
```

완전 결정적: 무작위 없음, 동률 시 정의 순서로 안정 정렬.

### 3. pipeline — Step 5.5 연결

Step 5(캐릭터 호출) 직후, Step 6(상태 갱신) 직전에 삽입:

```ts
if (!directorOutput.silence
    && directorOutput.speakers.length === 0
    && characterMessages.length === 0) {
  const currentTurn = session.worldState.turnNumber + 1;
  const autoSpeakerId = selectAutonomousSpeaker(session.characters, session.worldState, currentTurn);
  if (autoSpeakerId) {
    const character = session.characters.find((c) => c.id === autoSpeakerId);
    if (character) {
      const handout = buildPrivateHandout(autoSpeakerId, session.worldState, session.characters);
      const agenda = getCurrentAgenda(character, session.worldState.characterStates[autoSpeakerId]!, currentTurn);
      const intent = `자기 안건에 따라 먼저 말을 꺼낸다: ${agenda.nextAction}. 현재 장소·관계·감정에 맞게 짧게.`;
      const connection = getConnection(connections, autoSpeakerId);
      const result = await invokeCharacter(character, handout, intent, inputMode, userContent,
        publicContext, session.messages, session.persona.name, pack, connection, caseAnswerScope);
      // 기존 boundary gate + answerScope 필터를 Step 5와 동일하게 적용 (헬퍼로 추출)
      // 통과한 메시지를 characterMessages에 push → 이후 Step 6/6.5/7이 자연히 처리
    }
  }
}
```

핵심: 자율 발화도 Step 5의 캐릭터 처리 로직(boundary gate, character gate, answerScope
fact 필터, background tag 파싱)을 **동일하게** 거친다. 이를 위해 Step 5의 메시지 가공
블록을 `processCharacterResult(...)` 헬퍼로 추출해 두 곳에서 공유한다.

Step 6의 `speakerIds`는 `characterMessages`에서 파생되므로 자율 발화자도 자동으로
`markCharacterSpoke`로 `lastSpokeTurn`이 갱신된다(Req 3.4).

Step 6.5의 `hadCharacterSpeech = characterMessages.length > 0`도 자동으로 true가 되어
scene inertia가 리셋된다(Req 3.5). 추가 작업 불필요.

## Data Models

신규 타입 없음. 기존 `AgendaOutput`, `CharacterStateV2`, `WorldState`, `TurnMessage` 사용.

## Error Handling

| 상황 | 처리 |
|------|------|
| 자격 NPC 없음 | `selectAutonomousSpeaker`가 undefined → 턴 변화 없음 |
| 자율 발화자 connection 없음 | `invokeCharacter`가 dry-run fallback 반환(기존 동작) |
| 자율 발화가 boundary gate 위반 | 기존 gate가 교체/제거(기존 동작과 동일) |
| Director가 speaker 선택함 | Step 5.5 진입 조건 불충족 → 미동작 |

## Testing Strategy

1. **단위 — isAutonomyEligible**: autonomy 미달 false, 최근 발화 false, 자격 충족 true, 결정성(동일 입력 동일 결과)
2. **단위 — selectAutonomousSpeaker**: 다수 자격자 중 가장 오래 침묵+autonomy 높은 1명, 자격자 없으면 undefined, Director 선택 턴 가정에서 호출 안 됨
3. **통합 — pipeline**: Director가 speaker를 비운 dry-run 턴 → 자율 발화 1건 주입 + lastSpokeTurn 갱신 + hidden truth 누출 0
4. **회귀 — pipeline**: Director가 speaker를 고른 턴 → 자율 발화 미주입(기존과 동일)

검증: `corepack pnpm -r run check` + 서버 테스트 전체.

## Correctness Properties

### Property 1: Director-priority
Director가 speaker를 1명 이상 선택했거나 silence면 자율 발화는 절대 주입되지 않는다.
**Validates: Requirements 2.1, 2.2, 5.1**

### Property 2: At-most-one
한 턴에 자율 발화는 최대 1명만 주입된다.
**Validates: Requirements 2.3, 3.1**

### Property 3: Determinism
동일 worldState/characters/currentTurn 입력은 항상 동일한 자율 발화자(또는 없음)를 낳는다.
**Validates: Requirements 1.1, 1.4, 2.3**

### Property 4: No-leak
자율 발화는 Director 선택 발화와 동일한 handout/answerScope/boundary gate 제약을 받으며
hidden truth를 노출하지 않는다.
**Validates: Requirements 4.1, 4.2, 4.3**

### Property 5: State consistency
자율 발화자는 발화 후 `lastSpokeTurn`이 현재 턴으로 갱신된다.
**Validates: Requirements 3.4, 3.5**
