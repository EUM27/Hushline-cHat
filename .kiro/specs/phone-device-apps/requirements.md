# Requirements Document

## Introduction

현재 왼쪽 휴대폰(`PhoneSubScreen`)은 시나리오와 무관하게 **메신저 피드를 항상** 표시하고,
사건 기록(단서장 + 인물 노트)은 오른쪽 별도 오버레이(`CaseBoardPanel`, NotebookPen 토글)에
격리되어 있다. 그 결과 밀실/탐정극에서도 메신저가 늘 떠 있어 어색하고, 정작 수사에 필요한
단서·인물 노트는 상시 참조되지 않는다.

이 기능은 휴대폰을 **앱 디바이스**로 재구성한다. 사건파일(단서 + 인물 노트)을 디바이스의
상시 기본 앱으로 올리고, 메신저는 이벤트로 등장하거나 시나리오에 따라 아예 없는 조건부 앱으로
강등한다. 어떤 앱이 기본으로 뜨는지는 시나리오 신호(`uiMode`, `caseBoard.isCaseScenario`)와
진행 상황(메신저 메시지 존재 여부)으로 결정한다.

스코프는 **1단계: 순수 클라이언트**다. 서버/shared 변경 없이, 이미 클라이언트에 들어와 있는
`session.caseBoard`와 phone-channel 메시지만으로 구현한다. 메신저는 1단계에서 단일 대화방으로
다룬다(여러 대화방 분리는 별도 작업 2단계).

## Glossary

- **디바이스(Phone Device)**: 왼쪽 `PhoneSubScreen`. 여러 앱을 담는 셸.
- **사건파일 앱(Case File)**: 단서장 + 인물 노트. `session.caseBoard` 렌더.
- **메신저 앱(Messenger)**: phone-channel 메시지 피드 + 입력. (1단계는 단일 대화방)
- **phone-channel 메시지**: `isPhoneChannelMessage(...)`가 true인 메시지(초대/입장 안내,
  advisor-slot 발화, 익명 채팅 등). 1개 이상 존재 = "메신저가 생겼다".
- **앱 dock**: 디바이스 하단의 앱 전환 바. 가용 앱만 표시.
- **기본 앱(default app)**: 세션 시작 시 떠 있는 앱.

## Requirements

### Requirement 1: 앱 가용성 판정

**User Story:** 플레이어로서, 시나리오 성격에 맞는 앱만 휴대폰에 보이길 원한다. 그래야 밀실극에
불필요한 메신저가 안 뜨고, 단톡 시나리오엔 메신저가 제대로 뜬다.

#### Acceptance Criteria

1. WHEN `caseBoard?.isCaseScenario === true`이거나 `caseBoard.dossiers.length > 0`이면 THE
   디바이스 SHALL 사건파일 앱을 가용으로 표시한다.
2. WHEN phone-channel 메시지가 1개 이상 존재하거나 `scenario.uiMode === "messenger-first"`이면
   THE 디바이스 SHALL 메신저 앱을 가용으로 표시한다.
3. WHEN 가용 앱이 1개뿐이면 THE 디바이스 SHALL 앱 dock을 숨긴다.
4. WHEN 가용 앱이 2개 이상이면 THE 디바이스 SHALL 가용 앱만 dock에 버튼으로 표시한다.
5. THE 앱 가용성 판정 SHALL 순수 함수로 구현되어 단위 테스트 가능해야 한다.

### Requirement 2: 기본 앱 선택

**User Story:** 플레이어로서, 시나리오를 시작하면 가장 적절한 앱이 먼저 떠 있길 원한다.

#### Acceptance Criteria

1. WHEN `scenario.uiMode === "messenger-first"`이면 THE 디바이스 SHALL 메신저 앱을 기본으로 연다.
2. WHEN messenger-first가 아니고 사건파일 앱이 가용이면 THE 디바이스 SHALL 사건파일 앱을 기본으로 연다.
3. WHEN 사건파일이 비가용이고 메신저가 가용이면 THE 디바이스 SHALL 메신저 앱을 기본으로 연다.
4. WHEN 둘 다 비가용이면 THE 디바이스 SHALL 사건파일 앱을 빈 상태("기록 없음")로 연다.
5. WHEN 유저가 dock으로 앱을 수동 전환하면 THE 디바이스 SHALL 그 선택을 세션 동안 유지한다.

### Requirement 3: 앱별 화면 렌더

**User Story:** 플레이어로서, 각 앱이 자기 콘텐츠를 제대로 보여주길 원한다.

#### Acceptance Criteria

1. WHEN 메신저 앱이 활성이면 THE 디바이스 SHALL 기존 phone-channel 피드와 입력바를 그대로 렌더한다.
2. WHEN 사건파일 앱이 활성이면 THE 디바이스 SHALL `caseBoard`의 단서/진술/모순/의문/추리와 인물
   노트를 렌더하고, 메신저 입력바를 숨긴다.
3. WHEN 사건파일 앱이 활성이고 `caseBoard`가 없거나 비어 있으면 THE 디바이스 SHALL "기록 없음"
   안내를 표시한다.
4. THE 사건파일 표시 로직 SHALL 기존 `CaseBoardPanel`의 단서/인물 렌더와 동일한 컴포넌트를
   공유한다(중복 제거).

### Requirement 4: 메신저 연락 도착 알림 (강제 전환 금지)

**User Story:** 플레이어로서, 수사 중에 메신저 연락이 와도 화면이 갑자기 바뀌지 않길 원한다.
다만 새 연락이 온 건 알고 싶다.

#### Acceptance Criteria

1. WHEN phone-channel 메시지 수가 "마지막으로 본 시점"보다 많으면 THE dock의 메신저 앱 버튼 SHALL
   미확인(unread) 배지를 표시한다.
2. WHEN 유저가 메신저 앱을 열면 THE 디바이스 SHALL 마지막으로 본 메시지 수를 갱신해 배지를 지운다.
3. WHEN 메신저 앱이 처음 가용이 되는 순간(0→1) THE 디바이스 SHALL 활성 앱을 강제로 바꾸지 않는다
   (배지만 표시).
4. WHEN 사건파일에 새 항목(단서/모순/추리)이 늘면 THE dock의 사건파일 앱 버튼 SHALL unread 배지를
   표시하고, 사건파일 앱을 열면 지운다.
5. THE unread 상태 SHALL 세션별 `localStorage` 키로 저장되어 새로고침 후에도 유지된다.

### Requirement 5: 오른쪽 사건 기록 오버레이 일원화

**User Story:** 플레이어로서, 사건 기록을 한 곳(휴대폰)에서만 보고 싶다. 같은 정보가 두 군데 있으면
헷갈린다.

#### Acceptance Criteria

1. THE 앱 SHALL 사건 기록을 휴대폰 사건파일 앱으로 일원화한다.
2. THE `AppToolStrip` SHALL 더 이상 사건 기록(NotebookPen) 토글을 표시하지 않는다.
3. THE App SHALL 오른쪽 `CaseBoardPanel` 오버레이와 관련 상태(`isCaseBoardOpen`)를 제거한다.
4. THE 연결(모델)/개발 패널 오버레이 동작 SHALL 변경되지 않는다.

### Requirement 6: 하위 호환 및 검증

**User Story:** 개발자로서, 이 변경이 기존 단톡 시나리오와 빌드를 깨지 않길 원한다.

#### Acceptance Criteria

1. WHEN `school-life-anomaly`(messenger-first, caseKnowledge 없음)를 플레이하면 THE 디바이스 SHALL
   메신저 앱을 기본으로 띄우고 입력 동작을 기존과 동일하게 유지한다.
2. WHEN 변경 적용 후 THE 타입체크(`pnpm -r run check`) SHALL 통과한다.
3. WHEN 변경 적용 후 THE 클라이언트 빌드 SHALL 통과한다.
4. THE 변경 SHALL shared/server 코드를 수정하지 않는다(순수 클라이언트, 1단계).
5. THE 앱 가용성/기본 앱 유틸 SHALL 단위 테스트로 검증된다.
