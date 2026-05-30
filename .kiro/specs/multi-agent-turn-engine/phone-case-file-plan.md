# 설계도 — 휴대폰 디바이스: 사건파일 상시 + 메신저 조건부 (Phone Device Apps)

> 주종을 뒤집는다. 지금은 **단톡방이 항상 떠 있고** 사건파일은 별도 오버레이다.
> 바꿀 방향: **사건파일(단서 + 캐릭터 노트)이 디바이스의 상시 기본 화면**이 되고,
> **메신저는 이벤트로 생기거나 시나리오에 따라 아예 없는 조건부 앱**이 된다.
>
> 밀실 살인극에 단톡방이 늘 떠 있는 건 어색하다. 디바이스는 "내 수사 노트"가 기본이고,
> 메신저는 상황(이벤트)이 만들 때만 열리는 하나의 앱일 뿐이다.
>
> **"단톡방"이 아니라 "메신저"다.** 메신저는 여러 대화방을 담는 앱이다 — 특정 인물과의
> 1:1 DM, 그룹챗, 익명 쪽지가 모두 들어올 수 있다. 단톡방 하나에 묶인 건 school-life-anomaly
> (학교 공포 단톡물)의 형태일 뿐, 메신저 자체의 본질이 아니다. 탐정극이라면 용의자 한 명이
> 개인적으로 DM을 보내올 수도 있어야 한다.
>
> 핵심: `session.caseBoard`와 phone-channel 메시지 모두 **이미 클라이언트에 들어와 있다.**
> → 사건파일/단일 대화 통합은 서버/shared 작업 0. 단, **멀티 대화방(1:1 DM과 그룹 분리)**은
> 메시지에 대화방 식별자가 없어서 가벼운 서버 신호가 필요할 수 있다(§3.6 참조).

---

## 1. 현재 상태 (확인됨)

| 요소 | 위치 | 데이터 | 노출 조건 |
|------|------|--------|-----------|
| 메신저 피드 | `PhoneSubScreen` (왼쪽 상시) | `buildPhoneMessages` (phone-channel 메시지, **단일 평탄 피드**) | **항상** |
| 사건파일 | `CaseBoardPanel` (오른쪽 오버레이) | `session.caseBoard` | 토글 시 |

신호로 쓸 수 있는 기존 데이터:
- `manifest.uiMode`: `"messenger-first"`(school-life-anomaly) / `"scene-first"`(locked-room-mystery) / `"hybrid"`.
- `caseBoard.isCaseScenario`: 시나리오에 추리 사건 레이어가 있는지(= 사건파일 의미 있음).
- `isPhoneChannelMessage(...)`: 어떤 메시지가 "메신저에 속하는지". → **이게 1개라도 있으면 메신저가 "생긴" 것.**

데이터 한계(중요):
- `TurnMessage`에 **대화방 식별자(`channelId`/`threadId`)가 없다.** 그래서 현재는 모든 메신저
  메시지가 하나의 평탄 피드로 합쳐진다. 1:1 DM과 그룹챗을 별도 대화방으로 나누려면 메시지에
  소속 대화방 정보가 필요하다(§3.6).

문제:
- 메신저(단톡방)가 시나리오 무관하게 상시 표시 → 밀실/탐정극에서 어색, 휴대폰이 사건 수사 도구로 안 쓰임.
- 진짜 수사 데이터(단서/인물 노트)는 오른쪽에 격리 → 상시 참조가 안 됨.
- 메신저가 사실상 "단톡방 하나"로 고정 → 1:1 연락 같은 자연스러운 형태를 못 살림.

---

## 2. 목표 모델 — 디바이스 = 앱 런처

휴대폰 디바이스 안에 여러 앱이 있고, **무엇이 기본으로 떠 있는지가 시나리오와 진행 상황에
따라 결정된다.**

```
┌─ phone-screen ──────────────┐
│ status row                   │
│ app header (현재 앱 제목)     │
│ ┌──────────────────────────┐ │
│ │   [활성 앱 뷰]            │ │   ← 사건파일(기본) 또는 메신저(조건부)
│ │                          │ │
│ └──────────────────────────┘ │
│ (메신저 앱일 때만) 입력바      │
│ ┌─ app-dock ───────────────┐ │
│ │  🗂 사건파일   💬 메신저②  │ │   ← 사용 가능한 앱만 표시 + 알림 배지
│ └──────────────────────────┘ │
│ home indicator               │
└──────────────────────────────┘
```

메신저 앱은 내부에 **대화방 목록**을 가질 수 있다(1:1 DM, 그룹챗, 익명 쪽지). 대화방이 하나뿐이면
바로 그 스레드를 열고, 여럿이면 목록 → 스레드 구조로 들어간다.

### 2.1 앱 가용성 (데이터 기반, 결정적)

| 앱 | 가용 조건 | 비고 |
|----|-----------|------|
| 사건파일 | `caseBoard?.isCaseScenario === true` 또는 `dossiers.length > 0` | 수사형 시나리오에서 상시 |
| 메신저 | phone-channel 메시지가 1개 이상 존재 **또는** `uiMode === "messenger-first"` | 이벤트가 만들면 등장 |

- 메신저는 "이벤트로 생긴다" = 엔진이 첫 phone-channel 메시지(초대/입장 안내, 인물의 연락 등)를
  내보내는 순간 dock에 **나타난다.** 그 전까지는 dock에 메신저 앱이 없다.
- 시나리오에 메신저 연락이 영영 안 오면(예: 순수 밀실극) 메신저 앱은 끝까지 안 보인다.
- 반대로 메신저형 시나리오(school chat)는 caseKnowledge가 없어 사건파일 앱이 비활성 →
  메신저가 기본.

### 2.2 기본(부팅) 앱 선택

```
defaultApp =
  uiMode === "messenger-first"        → "messenger"
  else if 사건파일 가용                 → "casefile"
  else if 메신저 가용                   → "messenger"
  else                                 → "casefile" (빈 상태 안내)
```

- 유저가 dock에서 수동 전환하면 그 선택을 유지(세션 동안).
- 단, 메신저에 **새 연락이 오는 순간**(첫 phone-channel 메시지)에는 알림 배지만 띄우고
  화면을 강제 전환하지 않는다(수사 중 방해 금지). 유저가 탭하면 전환.

---

## 3. 컴포넌트 설계

### 3.1 `PhoneSubScreen` = 앱 셸
```ts
type PhoneApp = "casefile" | "messenger";
const [activeApp, setActiveApp] = useState<PhoneApp>(/* defaultApp 계산 */);
```
- 가용 앱 목록 계산(§2.1) → dock 렌더.
- `activeApp` 기준으로 본문/입력바 분기:
  - `messenger` → 기존 채팅 피드 + 입력바(지금 로직 그대로).
  - `casefile` → 신규 `PhoneCaseFile`, 입력바 숨김(또는 단서 검색 필터).

### 3.2 신규 `PhoneCaseFile`
- 입력: `caseBoard?: CaseBoardView`.
- 단서장 + 인물 노트(하위 탭). 기존 `CaseBoardPanel`의 `CluesTab`/`DossiersTab` **재사용**.
- 휴대폰 폭에 맞춘 컴팩트 스타일(섹션 접기).

### 3.3 표시 로직 공통화 (선행 리팩터)
- `CaseBoardPanel.tsx`의 `CluesTab`/`DossiersTab`/라벨 맵을 `case-board-sections.tsx`로 추출.
- `PhoneCaseFile`(휴대폰)과 기존 `CaseBoardPanel`(있다면)이 공유 → 중복 제거, 한 곳만 수정.

### 3.4 `app-dock`
- 가용 앱만 버튼으로 표시(아이콘: 사건파일 NotebookPen / 메신저 MessageCircle).
- 메신저 unread 배지: phone-channel 메시지 수가 "마지막으로 본 시점"보다 늘면 빨간 점.
- 앱이 하나뿐이면 dock 자체를 숨김(밀실극 = 사건파일만 → dock 불필요, 깔끔).

### 3.5 메신저 "연락 도착" 연출
- phone-channel 메시지 수가 0 → 1로 바뀌는 순간 dock에 메신저 앱이 페이드인 + 배지.
- (선택) 작은 토스트/진동 모션으로 "새 메시지" 알림. 과하지 않게.

### 3.6 메신저 멀티 대화방 — 단계적 접근

메신저의 본질은 여러 대화방이다. 하지만 현재 `TurnMessage`에는 대화방 식별자가 없다.
무리하게 한 번에 가지 말고 단계를 나눈다.

- **1단계 (이번 스코프, 서버 0)**: 메신저 앱 = **단일 대화방**으로 시작. 지금 `buildPhoneMessages`의
  평탄 피드를 그대로 메신저 앱 안에 넣는다. 앱 셸/사건파일 상시화/조건부 등장만 먼저 완성한다.
- **2단계 (별도 작업, 가벼운 서버 신호)**: `TurnMessage`에 옵셔널 `channelId?`/`channelKind?`
  (`"group" | "dm" | "anon"`)와 `channelLabel?`를 추가. Director/엔진이 phone-channel 메시지를
  낼 때 어느 방인지 표시. 클라이언트는 `channelId`로 그룹핑해 **대화방 목록 → 스레드** UI로 확장.
  1:1 DM(특정 용의자가 개인적으로 연락), 익명 쪽지 등이 분리된 방으로 표현된다.
- 1단계는 2단계의 상위호환: `channelId`가 없으면 전부 "기본 대화방" 하나로 폴백 → 하위호환 유지.

> 즉 "메신저 = 단톡방"이라는 제약은 데이터 한계가 아니라 **아직 channelId가 없어서**일 뿐이다.
> 2단계에서 그 신호만 넣으면 1:1·그룹·익명이 자연스럽게 분리된다.

---

## 4. Unread / 등장 감지 (순수 클라이언트, 결정적)

- 메신저 unread: `phoneChannelCount = visibleMessages.filter(isPhoneChannelMessage).length`.
  `phoneChannelCount > lastSeenMessengerCount`면 배지. 메신저 앱 열면 `lastSeen = count`.
  (2단계에서 channelId가 생기면 방별 unread로 세분화.)
- 사건파일 unread: `clues.length + contradictions.length + deductions.length` 비교(이전 안 동일).
- 저장: `localStorage` 세션별 키(`hushline.phoneApps.{sessionId}`)에 `{seenMessenger, seenCasefile, lastApp}`.

---

## 5. 오른쪽 오버레이(CaseBoardPanel) 처리 — 권장 (A)

- **(A) 휴대폰으로 일원화** — 사건 기록 = 휴대폰 사건파일 앱 단일화.
  `AppToolStrip`의 NotebookPen 토글 + 오른쪽 CaseBoard 오버레이 제거. 연결/개발 패널만 우측 잔류.
  → "수사는 휴대폰을 본다"는 일관된 멘탈모델. App.tsx의 `isCaseBoardOpen` 상태/오버레이 정리.
- (B) 둘 다 유지 — 과도기용. 표시 컴포넌트는 공유. 큰 화면 선호 유저 대응.

---

## 6. 기존 "단서 첨부(+ 핀)" 기능

현재 휴대폰 입력바의 `+` 핀(`pinnedPhoneMessageIds`)은 메신저 로컬 메시지 핀. 사건파일과 별개.
- 이번 스코프에서는 **건드리지 않음**(회귀 위험). 메신저 앱 내부 기능으로 그대로 둠.
- 차후 "메시지를 사건파일 메모에 첨부" 의미로 재정의 검토(별도 작업).

---

## 7. 시나리오별 동작 예시

| 시나리오 | uiMode | caseKnowledge | 메신저 | 기본 앱 | 결과 |
|----------|--------|---------------|--------|---------|------|
| locked-room-mystery | scene-first | 있음 | 이벤트 전엔 없음 | 사건파일 | 수사 노트가 상시. 메신저는 인물이 연락하면 등장 |
| school-life-anomaly | messenger-first | 없음 | 처음부터 | 메신저 | 지금과 동일(메신저 기본, 사건파일 앱 비활성) |
| (가상) 탐정 + 제보자 DM | hybrid | 있음 | 제보자가 1:1 DM | 사건파일 | 사건파일 기본 + 제보 DM 도착 시 메신저 dock에 추가 |

---

## 8. 작업 분해 (예상)

**1단계 — 앱 셸 + 사건파일 상시화 (서버 0):**
1. `case-board-sections.tsx` 추출 — `CluesTab`/`DossiersTab`/라벨 공통화(동작 불변 리팩터).
2. 앱 가용성 + 기본 앱 계산 유틸 — `uiMode`/`caseBoard`/phone-channel 수 기반(순수 함수, 테스트 가능).
3. `PhoneSubScreen`을 앱 셸로 개편 — `activeApp` 상태, 본문/입력바 분기, dock 렌더.
4. `PhoneCaseFile` 컴포넌트 — 공통 섹션 재사용, 컴팩트 스타일.
5. `app-dock` + unread/연락 도착 배지 + localStorage(세션별).
6. 메신저 연락 도착 페이드인 연출.
7. (A안) App.tsx 정리 — 오른쪽 CaseBoard 오버레이/툴 토글 제거.
8. 스타일 — `styles/`에 app-dock / phone-case-file 규칙, 기존 case-board.css 재사용.
9. 검증 — `pnpm -r run check` + 클라이언트 빌드. 앱 가용성 유틸 단위 테스트.

**2단계 — 메신저 멀티 대화방 (별도 작업, 가벼운 서버 신호):**
10. `shared`: `TurnMessage`에 옵셔널 `channelId?`/`channelKind?`/`channelLabel?` 추가.
11. `server`: phone-channel 메시지 생성 시 대화방 정보 부착(엔진/Director).
12. `client`: `buildPhoneMessages`를 `channelId` 그룹핑으로 확장, 대화방 목록 → 스레드 UI.
13. 하위호환: `channelId` 없으면 단일 "기본 대화방"으로 폴백.

---

## 9. 불변식 / 주의

- **데이터 안전**: `caseBoard`는 서버에서 hidden truth가 필터된 player-safe 투영. 클라는 렌더만.
- **Additive / 하위호환**: messenger-first 시나리오(school chat)는 지금과 사실상 동일하게 보여야 함
  (메신저 기본 + 입력 동작 유지). 회귀 핵심 케이스.
- **강제 전환 금지**: 메신저에 새 연락이 와도 화면을 뺏지 않는다(배지만). 수사 흐름 보호.
- **앱 1개면 dock 숨김**: 단일 앱 시나리오에서 불필요한 UI 제거.
- **순수 클라이언트(1단계)**: shared/server 무변경 → 서버 테스트 그린 유지. 멀티 대화방(2단계)만
  옵셔널 `channelId` 신호가 필요(하위호환 폴백 보장).

---

## 10. 왜 이게 맞는 방향인가

- 메신저를 "상황이 만드는 채널"로 강등 → 장르(밀실/탐정)에 맞는 자연스러운 디바이스 경험.
- 메신저는 단톡방 전용이 아니라 1:1 DM·그룹·익명 쪽지를 담는 범용 앱 → 탐정극의 제보자 연락 등
  다양한 형태를 수용(2단계).
- 사건파일을 상시 노출 → 단서/인물 노트를 계속 참조하는 추리 플레이 루프 완성.
- `uiMode`/`caseBoard`/phone-channel 신호가 이미 존재 → **1단계는 서버 0, 데이터 0 추가**, 낮은 리스크.
- 기존 표시 컴포넌트 재사용 → 새 표시 코드 최소.
