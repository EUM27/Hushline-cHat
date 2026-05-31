# Implementation Plan — Hidden-Truth Leak Harness

## Overview

전 시나리오 × 유도성 입력 코퍼스를 dry-run 파이프라인으로 통과시켜 누출 0을 종단 검증한다.
재사용 헬퍼 → 코퍼스 → 드라이버 테스트 → 자기검증 → 전체 검증 순. 순수 테스트 추가(프로덕션
코드 무변경).

## Tasks

- [x] 1. 재사용 하니스 헬퍼
  - `__tests__/leak-harness.ts` — `collectLeakSignals(pack)`, `loadCasePacks(dir)`,
    `makeHarnessSession(pack)`, `assertNoHiddenTruthLeak(args)`
  - 표면 수집: messages content + caseRuntime.devTrace.allowedFacts + caseBoard 직렬화
  - 단언: hidden id substring / redaction token / 솔루션 원문(있으면) 없음, 위치 식별 메시지
  - _Requirements: 2.1, 2.4, 3.1, 3.2, 3.4, 3.5, 3.6, 4.5_

- [x] 2. 유도성 입력 코퍼스
  - `__tests__/adversarial-inputs.ts` — `AdversarialInput` + `ADVERSARIAL_INPUTS`
  - 카테고리: direct_truth / indirect / deduction / contradiction / accusation / meta
  - high-risk inquiry 타입 각 최소 1개 보장
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 3. 드라이버 테스트
  - `__tests__/hidden-truth-leak.test.ts`
  - single-turn: 각 입력 → runTurnV2(dry-run) → buildCaseBoard → assertNoHiddenTruthLeak
  - cumulative: 입력 순차 적용 세션 → 매 턴 단언
  - _Requirements: 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 4. 자기검증 + 전체 검증
  - sanity 테스트: 인위적 hidden id 주입 result를 단언에 통과시키면 throw 확인
  - `corepack pnpm -r run check` + 전체 서버 테스트 통과
  - _Requirements: 3.6, 4.1, 4.2, 4.3, 4.4_

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1", "2"] },
    { "wave": 2, "tasks": ["3"] },
    { "wave": 3, "tasks": ["4"] }
  ]
}
```

```
1 (헬퍼) ─┐
2 (코퍼스) ┴─> 3 (드라이버) ─> 4 (자기검증/전체검증)
```

## Notes

- 순수 테스트 추가 — 프로덕션 코드 무변경. shared/server 동작 불변.
- 결정적: dry-run 폴백 경로(외부 API 없음).
- 확장성: 시나리오 추가 시 코퍼스만 늘리면 자동 커버.
- keyword(예 "범인") substring 강제 금지(거짓 양성) — id/token/원문이 1차 강한 단언.
- 검증: `pnpm -r run check` + 서버 테스트 전체 통과.
