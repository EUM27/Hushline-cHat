# Implementation Plan — Case Clue Progressive Reveal

## Overview

단서장을 빈 시작 + 누적 공개로 전환한다. shared 1필드 추가 → 공개 기록 헬퍼 → 파이프라인
연결 → 빌더 재작성 → 테스트 갱신 순. 단조 증가와 hidden truth 차단이 핵심.

## Tasks

- [x] 1. shared 필드 추가
  - `WorldState`에 `revealedCaseFacts?: Record<string, number>` 추가
  - _Requirements: 2.1_

- [x] 2. 공개 기록 헬퍼 + 초기화
  - `recordRevealedCaseFacts(prev, revealedFactIds, hiddenTruthIds, currentTurn)` 순수 함수 (최초 턴 보존, hidden truth 제외)
  - `createInitialWorldState`에서 `revealedCaseFacts: {}` 초기화
  - _Requirements: 2.2, 2.3, 2.4, 2.5_

- [x] 3. 파이프라인 연결
  - Step 6 상태 갱신에서 `caseAnswerScope.publicFactIds + observableFactIds`를 `recordRevealedCaseFacts`로 누적
  - 런타임 하위호환: `revealedCaseFacts ?? {}`
  - _Requirements: 2.2, 2.3, 2.5, 4.1_

- [x] 4. buildCaseBoard 재작성 (clue 부분)
  - briefing/public 전량 노출 제거
  - `buildFactIndex` (id → text/tags/source, hidden truth 제외)
  - `revealedCaseFacts` 순회 → 단서 구성, source/turn 매핑, 오름차순 정렬
  - 기존 snapshot observable 수집 경로 정리(누적 맵으로 일원화)
  - _Requirements: 1.1, 1.2, 1.3, 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 5. 인물 기록 점진 공개
  - `WorldState.encounteredCharacters?` 필드 + `recordEncounteredCharacters` 헬퍼 + 초기화
  - 파이프라인 Step 6에서 speakerIds로 조우 기록
  - `buildDossiers`를 조우/진술 인물만, 최초 조우 턴 오름차순으로 필터·정렬
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

- [x] 6. 테스트 갱신 + 검증
  - `recordRevealedCaseFacts` 단위 테스트(추가/보존/누출 제외)
  - case-board 테스트: "from the start" → "starts empty"로 갱신, 누적 후 표시, 누출 0 유지
  - 인물 기록 테스트: 빈 시작 / 조우 인물만·정렬 / 진술 인물 포함
  - WorldState 생성 지점(테스트 헬퍼들)에 신규 필드 반영(옵셔널이라 대부분 무변경)
  - `corepack pnpm -r run check` + 서버 테스트 전체 통과
  - _Requirements: 5.2, 5.3, 5.4, 5.5_

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1"] },
    { "wave": 2, "tasks": ["2"] },
    { "wave": 3, "tasks": ["3", "4", "5"] },
    { "wave": 4, "tasks": ["6"] }
  ]
}
```

```
1 (shared 필드) ─> 2 (헬퍼/초기화) ─┬─> 3 (파이프라인) ─┐
                                    ├─> 4 (단서 빌더)   ─┤
                                    └─> 5 (인물 빌더)   ─┴─> 6 (테스트/검증)
```

## Notes

- 단조 증가: snapshot(최근 10 한정) 아니라 영구 누적 맵이 진실의 원천.
- 공개 신호: 엔진이 이미 만드는 `caseAnswerScope` 재사용(새 판정 로직 없음).
- hidden truth 차단: 기록 단계 + 표시 단계 이중.
- 검증: `pnpm -r run check` + 서버 테스트 전체(기존 132 기준, 갱신 포함) pass.

