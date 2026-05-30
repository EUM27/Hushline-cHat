# Design Document — Phone Device Apps (1단계)

## Overview

왼쪽 휴대폰(`PhoneSubScreen`)을 단일 메신저 화면에서 **앱 셸**로 개편한다. 사건파일 앱을
상시 기본으로 올리고 메신저를 조건부 앱으로 강등한다. 순수 클라이언트 변경이며, 표시 데이터
(`session.caseBoard`, phone-channel 메시지)는 이미 존재한다.

핵심 설계:
- **순수 함수로 앱 가용성/기본 앱 판정** → 단위 테스트 가능, React 비종속.
- **표시 컴포넌트 공유** → `CaseBoardPanel`의 단서/인물 렌더를 추출해 휴대폰과 공유.
- **오른쪽 사건 오버레이 제거** → 사건 기록은 휴대폰으로 일원화.

## Architecture

```
ScenarioShell
├── PhoneSubScreen (앱 셸)
│   ├── status row / app header (공통)
│   ├── [activeApp === "messenger"] → 기존 피드 + 입력바
│   ├── [activeApp === "casefile"]  → PhoneCaseFile (입력바 숨김)
│   └── PhoneAppDock (가용 앱 2개 이상일 때만)
└── VisualNovelMainScreen
    └── overlays: 연결/개발 패널만 (CaseBoard 제거)
```

### 데이터 신호 (이미 존재)
- `session.scenario.uiMode` — `ClientSessionState.scenario.uiMode` (shared `ScenarioCard.uiMode`).
- `session.caseBoard` — player-safe 사건 투영(`CaseBoardView`).
- `visibleMessages.filter(isPhoneChannelMessage)` — 메신저 메시지.

## Components and Interfaces

### 1. `utils/phone-apps.ts` (신규, 순수 모듈)

```ts
import type { ClientSessionState, ChatMessage, CaseBoardView } from "@hushline/shared";
import { isPhoneChannelMessage } from "./stage-messages";

export type PhoneAppId = "casefile" | "messenger";

export interface PhoneAppAvailability {
  casefile: boolean;
  messenger: boolean;
  /** 가용 앱 수가 2개 이상일 때만 dock을 보여준다. */
  showDock: boolean;
  available: PhoneAppId[];
}

export function getPhoneAppAvailability(
  caseBoard: CaseBoardView | null | undefined,
  uiMode: ClientSessionState["scenario"]["uiMode"],
  phoneChannelCount: number,
): PhoneAppAvailability {
  const casefile = Boolean(caseBoard && (caseBoard.isCaseScenario || caseBoard.dossiers.length > 0));
  const messenger = phoneChannelCount > 0 || uiMode === "messenger-first";
  const available: PhoneAppId[] = [];
  if (casefile) available.push("casefile");
  if (messenger) available.push("messenger");
  return { casefile, messenger, showDock: available.length >= 2, available };
}

export function getDefaultPhoneApp(
  availability: PhoneAppAvailability,
  uiMode: ClientSessionState["scenario"]["uiMode"],
): PhoneAppId {
  if (uiMode === "messenger-first" && availability.messenger) return "messenger";
  if (availability.casefile) return "casefile";
  if (availability.messenger) return "messenger";
  return "casefile"; // 빈 상태 안내
}

export function countPhoneChannelMessages(messages: ChatMessage[]): number {
  return messages.filter(isPhoneChannelMessage).length;
}

/** 사건파일 unread 비교용 시그니처. */
export function caseFileSignature(caseBoard: CaseBoardView | null | undefined): number {
  if (!caseBoard) return 0;
  return caseBoard.clues.length + caseBoard.contradictions.length + caseBoard.deductions.length;
}
```

순수 함수 → bun으로 단위 테스트.

### 2. `utils/phone-apps-storage.ts` (신규, localStorage 래퍼)

```ts
interface PhoneAppsSeenState {
  seenMessenger: number;   // 마지막으로 본 phone-channel 메시지 수
  seenCasefile: number;    // 마지막으로 본 사건파일 시그니처
  lastApp?: PhoneAppId;    // 유저가 마지막으로 본 앱
}
function key(sessionId: string) { return `hushline.phoneApps.${sessionId}`; }
export function loadPhoneAppsSeen(sessionId: string): PhoneAppsSeenState;
export function savePhoneAppsSeen(sessionId: string, state: PhoneAppsSeenState): void;
```

방어적 파싱(손상/부재 시 0 기본). 세션별 키.

### 3. `components/case-board-sections.tsx` (신규, 추출)

기존 `CaseBoardPanel.tsx`의 `CluesTab`, `DossiersTab`, 라벨 맵(`clueSourceLabel` 등)을 이 파일로
옮긴다. export:
- `CaseClues({ caseBoard })`
- `CaseDossiers({ caseBoard })`
- 라벨 맵들

`CaseBoardPanel`은 이 컴포넌트를 import해서 그대로 사용(동작 불변). → 오른쪽 오버레이를
제거(Req 5)하더라도 컴포넌트는 휴대폰에서 재사용되므로 살아남는다. (CaseBoardPanel 파일
자체는 제거하고 sections만 남기는 방안도 가능 — 구현 시 결정.)

### 4. `components/PhoneCaseFile.tsx` (신규)

```tsx
export function PhoneCaseFile({ caseBoard }: { caseBoard?: CaseBoardView | null }) {
  const [tab, setTab] = useState<"clues" | "dossiers">("clues");
  // 빈 상태 처리 → "기록 없음"
  // 단서장/인물기록 탭 → CaseClues / CaseDossiers 재사용
}
```

휴대폰 폭 컴팩트 스타일(`phone-casefile` 클래스).

### 5. `components/PhoneAppDock.tsx` (신규)

```tsx
export function PhoneAppDock({
  available, activeApp, messengerUnread, casefileUnread, onSelect,
}: {...}) { /* NotebookPen / MessageCircle 버튼 + unread dot */ }
```

### 6. `PhoneSubScreen` 개편

- 신규 props: `caseBoard`, `uiMode`(또는 session에서 직접 읽음 — 이미 session prop 있음).
- 내부 상태: `const [activeApp, setActiveApp] = useState<PhoneAppId>(...)` — 초기값은
  `getDefaultPhoneApp`. 세션 변경 시 재계산(`useEffect` on `session.id`).
- `availability = getPhoneAppAvailability(...)`.
- 본문 분기: messenger → 기존 피드, casefile → `PhoneCaseFile`.
- 입력바: messenger일 때만 렌더.
- dock: `availability.showDock`일 때만 렌더.
- unread: phone-channel 수 / 사건 시그니처를 seen 상태와 비교. 앱 열면 seen 갱신 + 저장.
- **강제 전환 금지**: activeApp은 유저 액션으로만 바뀐다. 새 메시지/단서는 배지만.

### 7. `App.tsx` 정리 (Req 5)

- `isCaseBoardOpen` 상태 제거.
- `CaseBoardPanel` import 및 오른쪽 오버레이 블록 제거.
- `AppToolStrip`에서 `showCaseBoard`/`isCaseBoardOpen`/`onToggleCaseBoard` 제거.
- `PhoneSubScreen`에 `caseBoard={session.caseBoard}` 전달.

### 8. `AppToolStrip` 정리

- 사건 기록 버튼/관련 props 제거. 연결/개발 토글만 유지.

## Data Models

신규 타입은 클라이언트 로컬(`PhoneAppId`, `PhoneAppAvailability`, `PhoneAppsSeenState`)만.
shared/server 무변경.

## Error Handling

| 상황 | 처리 |
|------|------|
| `caseBoard` 없음/null | 사건파일 비가용 또는 빈 상태 안내 |
| localStorage 파싱 실패 | seen 0 기본값으로 폴백 |
| 가용 앱 0개(이론상) | 사건파일 빈 상태로 표시(dock 숨김) |
| 세션 전환 | activeApp/ seen 키 재계산(sessionId 기준) |

## Testing Strategy

1. **단위 — `phone-apps.ts`** (bun, 순수 함수):
   - `getPhoneAppAvailability`: caseScenario만/메신저만/둘다/둘다아님 4케이스 + showDock.
   - `getDefaultPhoneApp`: messenger-first 우선, 사건파일 우선, 폴백.
   - `caseFileSignature` / `countPhoneChannelMessages` 계산.
2. **빌드 검증**: `pnpm -r run check` + 클라이언트 빌드.
3. (수동) school-life-anomaly = 메신저 기본 / locked-room = 사건파일 기본 회귀 확인.

## Correctness Properties

### Property 1: 시나리오 적합 가용성
밀실 추리(caseKnowledge 있음, 메신저 메시지 없음)는 사건파일만 가용, 메신저 미표시.
**Validates: Requirements 1.1, 1.2, 1.3**

### Property 2: 기본 앱 결정성
동일 (caseBoard, uiMode, phoneChannelCount) 입력은 항상 동일한 가용성/기본 앱을 낳는다.
**Validates: Requirements 1.5, 2.1, 2.2, 2.3, 2.4**

### Property 3: 강제 전환 금지
메신저 메시지나 사건 항목이 늘어도 `activeApp`은 유저 액션 없이는 바뀌지 않는다(배지만).
**Validates: Requirements 4.3, 2.5**

### Property 4: 하위 호환
messenger-first 시나리오는 메신저 기본 + 기존 입력/피드 동작 유지.
**Validates: Requirements 6.1**

### Property 5: 데이터 안전
휴대폰은 `caseBoard`(서버 필터 완료)를 렌더만 하며 새 데이터 경로를 만들지 않는다.
**Validates: Requirements 6.4**
