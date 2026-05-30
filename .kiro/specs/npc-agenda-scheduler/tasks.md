# Implementation Plan — NPC Agenda Scheduler 연결

## Overview

agenda-scheduler를 결정적으로 고쳐 파이프라인에 연결한다. 모듈 결함 수정 → 선택 함수
추가 → 파이프라인 Step 5의 캐릭터 처리 로직을 헬퍼로 추출 → Step 5.5 자율 발화 연결 →
테스트 순으로 진행한다. Director가 speaker를 고른 턴은 절대 건드리지 않는다.

## Tasks

- [x] 1. agenda-scheduler 결함 수정
  - `shouldActAutonomously`에서 `Math.random()` 제거 → 결정적 게이트로 변경
  - `isAutonomyEligible(state, currentTurn, opts)` 추가 (autonomy/침묵 임계값)
  - `getCurrentAgenda`에 `currentTurn` 인자 추가, `(state as any).turnNumber` 제거
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 2. 자율 발화자 선택 함수
  - `selectAutonomousSpeaker(characters, worldState, currentTurn, opts?)` 추가
  - 정렬: 더 오래 침묵 → autonomy 높음 → 정의 순서(결정적)
  - 자격자 없으면 undefined
  - _Requirements: 2.3, 2.4_

- [x] 3. 파이프라인 캐릭터 처리 헬퍼 추출
  - Step 5의 메시지 가공(boundary gate, character gate, answerScope fact 필터, background tag) 로직을 `processCharacterResult(...)` 헬퍼로 추출
  - 기존 Step 5가 헬퍼를 사용하도록 리팩터(동작 불변)
  - _Requirements: 3.2, 3.3, 4.1, 4.2_

- [x] 4. Step 5.5 자율 발화 연결
  - 조건: `!directorOutput.silence && directorOutput.speakers.length === 0 && characterMessages.length === 0`
  - `selectAutonomousSpeaker`로 후보 선택 → `getCurrentAgenda`로 intent 구성 → `invokeCharacter` → `processCharacterResult` → characterMessages.push
  - speakerIds 파생을 통해 lastSpokeTurn 자동 갱신, Step 6.5 inertia 자동 리셋 확인
  - _Requirements: 2.1, 2.2, 3.1, 3.4, 3.5_

- [x] 5. 테스트 + 검증
  - 단위: `isAutonomyEligible` (미달/최근발화/자격/결정성), `selectAutonomousSpeaker` (최적 1명/없음)
  - 통합: Director가 speaker 비운 dry-run 턴 → 자율 발화 1건 + lastSpokeTurn 갱신 + hidden truth 누출 0
  - 회귀: Director가 speaker 고른 턴 → 자율 발화 미주입
  - `corepack pnpm -r run check` + 서버 테스트 전체 통과
  - _Requirements: 4.3, 5.1, 5.2, 5.3, 5.4_

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1"] },
    { "wave": 2, "tasks": ["2", "3"] },
    { "wave": 3, "tasks": ["4"] },
    { "wave": 4, "tasks": ["5"] }
  ]
}
```

```
1 (결함 수정)
├─ 2 (선택 함수)     ← 1
├─ 3 (헬퍼 추출)     ← (독립, pipeline 리팩터)
└─ 4 (Step 5.5 연결) ← 2, 3
    └─ 5 (테스트)    ← 4
```

## Notes

- 스코프: Director 미선택 턴 한정. Director가 speaker를 고른 턴은 불변.
- 결정성: 무작위 완전 제거 — dry-run 테스트 재현성 확보.
- 경계 재사용: 자율 발화도 기존 boundary gate + answerScope + handout 제약을 동일 적용.
- 검증 기준: `pnpm -r run check` 통과 + 서버 테스트 전체(기존 118 + 신규) pass.

