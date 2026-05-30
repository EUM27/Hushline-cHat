# Implementation Plan — Scene Beat Generator 연결

## Overview

`SceneBeatGenerator`를 턴 파이프라인에 연결하기 위한 작업 목록. shared 타입 → 상태 전이 →
제너레이터 헬퍼 → 스키마/로더 → 파이프라인 연결 → 데이터 → 테스트 순으로 진행한다.
각 작업은 코드 작성·수정에 한정하며 점진적으로 빌드 가능한 상태를 유지한다.

## Tasks

- [x] 1. shared 타입 확장
  - `ScenarioPack`에 `sceneDevices?: SceneOccurrenceDevice[]` 추가 (scenario.ts)
  - `WorldState`(base.ts)에 `sceneInertiaCounter: number`, `recentBeatTypes: string[]` 추가
  - shared 빌드/타입체크 통과 확인
  - _Requirements: 1.1, 3.1, 3.2_

- [x] 2. WorldState 초기화 + 상태 전이
  - `createInitialWorldState`에서 `sceneInertiaCounter: 0`, `recentBeatTypes: []` 초기화
  - state-manager에 `applySceneBeat(state, beat)` 추가 (tension/danger clamp, inertia reset, recentBeatTypes/recentEvents 상한 유지)
  - _Requirements: 3.3, 3.4, 4.3, 4.4_

- [x] 3. scene-beat-generator 헬퍼 보강
  - `turnHadMeaningfulEvent(input)` 추가
  - `sanitizeBeat(beat, hiddenTruthIds)` 추가 (hidden truth factReveal 제거)
  - `shouldInjectBeat(counter, threshold?)`에 override 인자 추가 (기본 2)
  - _Requirements: 4.1, 5.1, 5.3_

- [x] 4. Zod 스키마 + 로더
  - schemas.ts에 `sceneOccurrenceDeviceSchema` 추가
  - scenario-loader에서 `scene-devices.json` 옵셔널 로드 (없으면 성공)
  - `validateSceneDevices()` — factReveals 존재성, npcId/관계 id 존재성, hidden-truth 누출 거부
  - fact/hidden-truth id 수집 로직을 공통 헬퍼로 추출해 재사용
  - `reconstructPack`에 `sceneDevices: []` 포함
  - _Requirements: 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4_

- [x] 5. 파이프라인 비트 주입 연결
  - `runTurnV2` Step 6 이후 Step 7 직전에 비트 주입 단계 삽입
  - meaningful event 판정 → updateInertia → shouldInjectBeat 시 selectBeat → sanitizeBeat → applySceneBeat
  - 비트 메시지(`role: narrator`, `speakerLabel: "[장면]"`) 생성 후 turnMessages에 추가
  - narrator boundary gate로 비트 텍스트 2차 필터
  - 런타임 하위호환: `sceneInertiaCounter ?? 0`, `recentBeatTypes ?? []`
  - _Requirements: 4.2, 4.5, 4.6, 4.7, 5.2_

- [x] 6. 시나리오 데이터
  - `locked-room-mystery/scene-devices.json` 작성 (실제 fact/character id, hidden truth 미사용)
  - 로더로 정상 검증되는지 확인
  - _Requirements: 1.2, 2.1, 2.2_

- [x] 7. 테스트 + 검증
  - scene-beat-generator.test 확장: one-shot 제외, 최근 비트 회피, sanitizeBeat 누출 0, inertia 누적/리셋
  - 로더 테스트: 정상 로드 / hidden-truth factReveal 거부 / 미존재 npcId 거부 / 기존 팩 하위호환
  - 파이프라인 통합 테스트: inertia 누적 후 비트 주입 + tension 반영 + 누출 0
  - 기존 minimalWorldState 등 WorldState 생성 지점에 신규 필드 반영
  - `corepack pnpm -r run check` + 서버 테스트 전체 통과
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 4.6, 5.1, 5.3_

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1"] },
    { "wave": 2, "tasks": ["2", "3", "4"] },
    { "wave": 3, "tasks": ["5", "6"] },
    { "wave": 4, "tasks": ["7"] }
  ]
}
```

```
1 (shared 타입)
├─ 2 (상태 전이)        ← 1
├─ 3 (제너레이터 헬퍼)   ← 1
├─ 4 (스키마/로더)       ← 1
│   └─ 6 (데이터)        ← 4
├─ 5 (파이프라인)        ← 2, 3, 4
└─ 7 (테스트/검증)       ← 5, 6
```

작업 1이 모든 후속 작업의 선행조건이다. 2·3·4는 1 이후 병렬 가능. 5는 2·3·4 완료 후,
6은 4 완료 후, 7은 5·6 완료 후 마지막에 수행한다.

## Notes

- 모든 변경은 additive — `sceneDevices` 없는 팩은 기존과 동일 동작.
- hidden-truth 누출 방지는 데이터 검증(4) + `sanitizeBeat`(3) + narrator gate(5) 삼중 방어.
- 검증 기준: `pnpm -r run check` 통과 + 서버 테스트 전체(기존 103 + 신규) pass.

