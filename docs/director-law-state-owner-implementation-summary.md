# Director Law / State Owner 구현 요약

작성일: 2026-05-28

## 목적

모델 슬롯을 더 늘리는 대신, 장면의 법칙과 역할별 권한을 먼저 고정하는 `Director Law / State Owner` 계층을 추가했습니다. 일반 플레이 화면에는 노출하지 않고, 개발자 패널에서만 최근 턴의 상태 법칙과 Boundary 개입 내역을 확인할 수 있게 했습니다.

## 핵심 변경

- `WorldState`와 시나리오 팩에서 `StateLawSnapshot`을 파생합니다.
- `DirectorOutput`은 기존 Boundary 검사에 더해 `Director Law`를 통과합니다.
- `/api/v2/sessions/:id/advance`와 `reroll` 응답의 `turn` payload에 `stateLaw`가 포함됩니다.
- VN 화면과 폰로그에는 `stateLaw`가 보이지 않습니다.
- 오른쪽 개발자 도구에 `Director Law` 패널을 추가했습니다.
- 고압 장면이 반복되면 장면 마무리 또는 감정적 이탈 선택지를 유도하는 output rule이 자동 추가됩니다.

## 서버 변경

- `packages/shared/src/engine-v2.ts`
  - `StateLawSnapshot` 타입 추가
  - `TurnResultV2.stateLaw` 추가
- `packages/server/src/engine-v2/state-law.ts`
  - `buildStateLawSnapshot()` 추가
  - `immutableFacts`, `slowState`, `scenePressure`, `outputRules` 파생
- `packages/server/src/engine-v2/director-law.ts`
  - `enforceDirectorLaw()` 추가
  - 기존 `enforceDirectorBoundary()`를 내부 권한 검사로 사용
- `packages/server/src/engine-v2/pipeline.ts`
  - Director Law 적용
  - 턴 결과에 `stateLaw` 포함
- `packages/server/src/app-v2.ts`
  - `advance` / `reroll` API 응답에 `turn.stateLaw` 포함

## 클라이언트 변경

- `packages/client/src/api-v2.ts`
  - `V2AdvanceResponse.turn.stateLaw` 타입 반영
- `packages/client/src/App.tsx`
  - 최근 `stateLaw` 저장
  - 오른쪽 개발자 도구에 `모델 연결` / `Director Law` 탭 추가
- `packages/client/src/components/DevPanel.tsx`
  - 개발자 패널에서만 상태 법칙 요약 표시
- `packages/client/src/components/DirectorLawPanel.tsx`
  - `고정 사실`, `느린 상태`, `장면 압력`, `출력 규칙` 섹션 표시
- `packages/client/src/utils/ui-helpers.ts`
  - DevPanel 표시용 state law summary helper 추가
- `packages/client/src/styles.css`
  - 오른쪽 도구 패널과 Director Law 패널 스타일 추가

## 테스트

추가 및 갱신한 테스트:

- `packages/server/src/engine-v2/__tests__/state-law.test.ts`
- `packages/server/src/engine-v2/__tests__/director-law.test.ts`
- `packages/server/src/__tests__/api-v2.test.ts`
- `packages/client/tests/ui-helpers.test.ts`
- `packages/client/tests/director-law-panel.test.ts`

최종 확인:

```powershell
corepack pnpm --filter @hushline/server test src/engine-v2/__tests__/state-law.test.ts src/engine-v2/__tests__/director-law.test.ts src/engine-v2/__tests__/boundary.test.ts src/__tests__/api-v2.test.ts
corepack pnpm --filter @hushline/server check
corepack pnpm --filter @hushline/client exec bun test
corepack pnpm --filter @hushline/client check
corepack pnpm --filter @hushline/client build
```

결과:

- 서버 관련 테스트: 통과
- 서버 check: 통과
- 클라이언트 bun test: 통과
- 클라이언트 check: 통과
- 클라이언트 build: 통과

브라우저 확인:

- `http://127.0.0.1:4187`에서 모델 설정 패널을 열고 `Director Law` 탭 표시를 확인했습니다.
- 새 턴 생성 전에는 fallback 안내가 표시됩니다.

## 운영 메모

- `stateLaw`는 개발자용 metadata입니다.
- 플레이어용 VN 화면과 왼쪽 폰로그에는 Boundary / Director Law 개입 표시를 노출하지 않습니다.
- 이번 작업은 dirty worktree에서 진행되었으므로, 기존 사용자 변경은 되돌리지 않았습니다.
- 모델/API 슬롯 구조는 유지했고, 이번 변경의 중심은 상태 소유권과 권한 검사입니다.
