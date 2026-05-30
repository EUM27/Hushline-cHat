# Design Document — Case Clue Progressive Reveal

## Overview

단서장을 "처음부터 가득" → "빈 상태에서 공개될 때마다 누적"으로 바꾼다. 공개 이력을
`WorldState.revealedCaseFacts`(factId → 최초 공개 턴)로 누적 보관하고, 파이프라인이 턴마다
`caseAnswerScope`에서 공개 사실을 기록하며, `buildCaseBoard`가 이 누적 맵만 읽어 단서를 만든다.

설계 원칙:
- **단조 증가** — snapshot(최근 10개 한정)이 아니라 영구 누적 맵을 진실의 원천으로.
- **기존 신호 재사용** — 새 공개 판정 로직을 만들지 않고, 엔진이 이미 만드는
  `caseAnswerScope.publicFactIds`/`observableFactIds`를 쓴다.
- **불변식 유지** — hidden truth는 기록·표시 양쪽에서 차단.

## Architecture

```
runTurnV2 (Step 6 상태 갱신)
  └─ recordRevealedCaseFacts(worldState, caseAnswerScope, hiddenTruthIds, currentTurn)
       → revealedCaseFacts에 신규 factId만 {turn} 기록 (기존 항목 보존)

buildCaseBoard
  └─ clues = revealedCaseFacts 의 각 factId를
       briefing/public/observable 사전에서 찾아 source/text 매핑 (hidden truth 제외)
       knownSinceTurn = 기록된 최초 공개 턴, 오름차순 정렬
```

## Components and Interfaces

### 1. shared — `WorldState` 필드 추가

```ts
// base.ts, WorldState
/** factId → 최초로 플레이어에게 공개된 턴. 단서장 누적의 원천. */
revealedCaseFacts?: Record<string, number>;
```

옵셔널로 둔다(하위호환: 기존 세션엔 없음 → `?? {}` 폴백). 런타임 정규화로 안전.

### 2. server — 공개 기록 헬퍼 (case-board.ts 또는 case-state.ts)

```ts
export function recordRevealedCaseFacts(
  prev: Record<string, number> | undefined,
  revealedFactIds: string[],
  hiddenTruthIds: Set<string>,
  currentTurn: number,
): Record<string, number> {
  const next = { ...(prev ?? {}) };
  for (const id of revealedFactIds) {
    if (hiddenTruthIds.has(id)) continue;     // 누출 차단
    if (next[id] === undefined) next[id] = currentTurn;  // 최초 턴 보존
  }
  return next;
}
```

순수 함수 → 단위 테스트.

### 3. server — pipeline 연결 (Step 6)

`caseAnswerScope`가 계산된 이후(이미 있음), 상태 갱신부에서:

```ts
const revealedThisTurn = [
  ...caseAnswerScope.publicFactIds,
  ...caseAnswerScope.observableFactIds,
];
nextWorldState = {
  ...nextWorldState,
  revealedCaseFacts: recordRevealedCaseFacts(
    nextWorldState.revealedCaseFacts,
    revealedThisTurn,
    new Set(hiddenTruthIds),
    session.worldState.turnNumber + 1,
  ),
};
```

`hiddenTruthIds`는 파이프라인에 이미 있음(`getHiddenTruthIds`). public 답변 범위는
플레이어 질문에 매칭된 사실이므로 "언급되면 채워진다"에 정확히 부합.

> 주: briefing 사실은 publicFacts에 포함되거나 별도이므로, briefing이 첫 턴 인사/요약으로
> 공개되는 흐름에서 `caseAnswerScope`(case_summary_request 등)로 들어온다. 자동 전량 노출은
> 제거하되, 사건 개요를 묻는 행위로 briefing이 채워지는 경로는 유지된다.

### 4. server — `buildCaseBoard` 재작성 (clue 부분만)

기존: briefing/public 전량 + snapshot observable.
변경: `revealedCaseFacts`를 순회하며 각 factId를 사전에서 찾아 단서화.

```ts
const factIndex = buildFactIndex(caseKnowledge); // id → { text, tags, source, category }
const revealed = session.worldState.revealedCaseFacts ?? {};
const clues: CaseBoardClue[] = Object.entries(revealed)
  .map(([id, turn]) => {
    const f = factIndex.get(id);
    if (!f || !isSafe(f)) return null;
    return { id, text: f.text, source: f.source, tags: f.tags, knownSinceTurn: turn };
  })
  .filter((c): c is CaseBoardClue => c !== null)
  .sort((a, b) => a.knownSinceTurn - b.knownSinceTurn);
```

`buildFactIndex`는 briefing.publicSummary / publicFacts / observableFacts를 합쳐
factId → source(briefing|public|observed) 매핑. hidden truth 제외.

기존 snapshot 기반 observable 수집 로직은 제거(누적 맵으로 대체). 단, 하위호환·안전을 위해
snapshot의 revealedFactIds도 `revealedCaseFacts`에 합산하는 보강은 선택(둘 다 같은 맵으로 수렴).

### 5. server — `createInitialWorldState`

`revealedCaseFacts: {}` 초기화(또는 옵셔널 미설정 → 빌더에서 `?? {}`). 명시 초기화 권장.

## Data Models

신규: `WorldState.revealedCaseFacts?: Record<FactId, number>`. shared 1필드.
나머지(`CaseBoardClue` 등)는 불변.

## Error Handling

| 상황 | 처리 |
|------|------|
| `revealedCaseFacts` 없음(기존 세션) | `?? {}` 폴백, 빈 단서장 |
| revealed factId가 사전에 없음 | 해당 항목 스킵(깨진 참조 무시) |
| revealed factId가 hidden truth | 기록 단계 + 표시 단계 양쪽에서 차단 |
| caseKnowledge 없음 | 기존대로 빈 보드 |

## Testing Strategy

1. **단위 — `recordRevealedCaseFacts`**: 신규 추가, 최초 턴 보존(재공개 시 미변경), hidden truth 제외.
2. **빌더 — `buildCaseBoard`**:
   - 초기 세션 → clues 빈 배열 (기존 "from the start" 테스트를 "starts empty"로 갱신).
   - `revealedCaseFacts` 채운 세션 → 해당 단서만, source/turn 정확, 정렬.
   - hidden truth가 `revealedCaseFacts`에 (강제로) 있어도 표시 안 됨.
3. **회귀**: 비-미스터리 빈 보드, 누출 0(기존 테스트 유지).

검증: `corepack pnpm -r run check` + 서버 테스트 전체.

## Correctness Properties

### Property 1: Empty start
공개 이력이 없는 세션의 단서장은 비어 있다.
**Validates: Requirements 1.1, 1.2**

### Property 2: Monotonic accumulation
한 번 기록된 factId의 최초 공개 턴은 이후 절대 바뀌지 않고, 단서는 사라지지 않는다.
**Validates: Requirements 2.2, 2.3, 3.1**

### Property 3: No hidden-truth leak
hidden truth fact는 `revealedCaseFacts`에도, 단서장에도 들어가지 않는다.
**Validates: Requirements 2.5, 3.5**

### Property 4: Backward compatible
`revealedCaseFacts`가 없는 세션·비미스터리 팩은 빈 단서장으로 안전하게 동작한다.
**Validates: Requirements 4.1, 4.2**

### Property 5: Source/order fidelity
단서는 원래 카테고리(briefing/public/observed)와 최초 공개 턴을 보존하며 턴 오름차순으로 정렬된다.
**Validates: Requirements 3.2, 3.3, 3.4**
