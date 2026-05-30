# Implementation Plan — Phone Device Apps (1단계)

## Overview

휴대폰을 앱 셸로 개편한다. 순수 유틸(가용성/기본 앱) → 표시 컴포넌트 추출 → 사건파일/도크
컴포넌트 → PhoneSubScreen 개편 → App/ToolStrip 정리 → 스타일 → 검증 순. 전부 클라이언트.

## Tasks

- [x] 1. 앱 가용성 순수 유틸
  - `utils/phone-apps.ts` — `getPhoneAppAvailability`, `getDefaultPhoneApp`,
    `countPhoneChannelMessages`, `caseFileSignature`, 타입(`PhoneAppId`/`PhoneAppAvailability`)
  - bun 단위 테스트로 4케이스 + 기본 앱 + 시그니처 검증
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4_

- [x] 2. seen 상태 저장 래퍼
  - `utils/phone-apps-storage.ts` — `loadPhoneAppsSeen`/`savePhoneAppsSeen` (세션별 키, 방어적 파싱)
  - _Requirements: 4.2, 4.5_

- [x] 3. 표시 컴포넌트 추출
  - `components/case-board-sections.tsx` — `CaseClues`/`CaseDossiers` + 라벨 맵 추출
  - `CaseBoardPanel.tsx`가 추출 컴포넌트를 사용하도록 변경(동작 불변)
  - _Requirements: 3.4_

- [x] 4. 사건파일 / 도크 컴포넌트
  - `components/PhoneCaseFile.tsx` — 단서장/인물 2탭, 빈 상태 안내, 컴팩트 스타일
  - `components/PhoneAppDock.tsx` — 가용 앱 버튼 + unread dot
  - _Requirements: 3.2, 3.3, 4.1, 4.4_

- [x] 5. PhoneSubScreen 앱 셸 개편
  - `activeApp` 상태(초기 = 기본 앱), 세션 변경 시 재계산
  - 본문 분기(messenger 피드 / PhoneCaseFile), 입력바 messenger 한정
  - dock 조건부 렌더(가용 2개 이상), unread 배지 + seen 갱신/저장
  - 강제 전환 금지(유저 액션으로만 activeApp 변경)
  - `caseBoard` prop 추가
  - _Requirements: 2.5, 3.1, 3.2, 4.1, 4.2, 4.3, 4.4_

- [x] 6. App.tsx / AppToolStrip 정리 (오른쪽 오버레이 제거)
  - `isCaseBoardOpen` 상태 + `CaseBoardPanel` 오버레이 블록 제거
  - `PhoneSubScreen`에 `caseBoard` 전달
  - `AppToolStrip`에서 사건 기록 토글/props 제거
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 7. 스타일
  - `styles/`에 `phone-app-dock` / `phone-casefile` 규칙 추가, 기존 `case-board.css` 토큰 재사용
  - 휴대폰 폭 컴팩트 레이아웃
  - _Requirements: 3.2_

- [x] 8. 검증
  - `corepack pnpm -r run check` 통과
  - 클라이언트 빌드(`pnpm --filter @hushline/client build`) 통과
  - phone-apps 단위 테스트 통과
  - shared/server 무변경 확인
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1", "2", "3"] },
    { "wave": 2, "tasks": ["4"] },
    { "wave": 3, "tasks": ["5"] },
    { "wave": 4, "tasks": ["6", "7"] },
    { "wave": 5, "tasks": ["8"] }
  ]
}
```

```
1 (가용성 유틸) ─┐
2 (seen 저장)   ─┼─> 4 (사건파일/도크) ─> 5 (PhoneSubScreen) ─> 6 (App 정리) ─> 8 (검증)
3 (섹션 추출)   ─┘                                            └> 7 (스타일) ──┘
```

## Notes

- 스코프: 1단계(순수 클라이언트, 단일 메신저 대화방). 멀티 대화방(channelId)은 별도 작업.
- 데이터 안전: `caseBoard`는 서버 필터 완료 → 렌더만. 새 경로 없음.
- 회귀 핵심: school-life-anomaly(messenger-first)는 기존과 동일하게 메신저 기본 + 입력 유지.
- 검증: `pnpm -r run check` + 클라 빌드 + phone-apps 단위 테스트.

