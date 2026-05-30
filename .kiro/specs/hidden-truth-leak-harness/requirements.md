# Requirements Document

## Introduction

이 프로젝트의 핵심 불변식은 **"hidden truth(범인 정체, 밀실 트릭 등 사건의 정답)는 어떤
경로로도 플레이어에게 직접 노출되지 않는다"**이다. 현재 누출 방지는 여러 레이어
(scenario-loader 검증, runtime-boundary-gate, narrator-boundary-gate, case-scope-resolver,
buildCaseBoard 필터)에 분산 구현되어 있고, 각 레이어마다 단위 테스트가 점점이 있다.

그러나 **모든 시나리오 × 모든 inquiry 타입 × 다양한 유도성(adversarial) 입력**을 실제 턴
파이프라인(`runTurnV2`)에 통과시켜 "어떤 표면에도 진실이 새지 않는다"를 종단(end-to-end)으로
검증하는 하니스는 없다. 이 기능은 그 적대적 누출 테스트 하니스를 구축한다.

목적: 한 번 만들어 두면 이후 모든 엔진 변경에서 누출 회귀를 자동으로 잡는 영구 안전망.
dry-run(결정적 폴백) 경로로 동작하므로 외부 API 없이 재현 가능하다.

## Glossary

- **Hidden truth**: `caseKnowledge.hiddenTruths[]` + `hiddenTruthVault.hiddenTruthIds` +
  category가 `hidden_truth`/`solution`인 fact. id, 원문 텍스트, blockedKeywords 포함.
- **Adversarial input(유도성 입력)**: 진실을 캐내려는 플레이어 입력. 직접 질문("범인 누구야"),
  우회("그럼 누가 거짓말하는 거야"), 추리 단정, 메타 질문 등.
- **Surface(노출 표면)**: 플레이어/클라이언트에 전달되는 모든 텍스트 — 턴 메시지 content,
  caseRuntime devTrace, caseBoard(clues/statements/openQuestions/deductions/dossiers).
- **Leak signal(누출 신호)**: hidden truth id 문자열, `HIDDEN_TRUTH_REDACTED` 토큰,
  hidden truth blockedKeywords가 노출 표면에 나타나는 것.

## Requirements

### Requirement 1: 적대적 입력 코퍼스

**User Story:** 테스터로서, 진실을 캐내려는 다양한 입력을 한곳에 모아두고 싶다. 그래야 누출
검증이 현실적인 공격 표면을 덮는다.

#### Acceptance Criteria

1. THE 하니스 SHALL 유도성 입력 코퍼스를 정의한다(직접 진실 요청, 우회 질문, 추리 단정,
   모순 추궁, 메타/OOC 질문, 특정 인물 지목 등 카테고리별).
2. THE 코퍼스 SHALL 각 입력이 어떤 inquiry 타입을 노리는지 분류 가능한 형태로 구성된다.
3. THE 코퍼스 SHALL 최소 한 입력 이상이 각 high-risk inquiry 타입(truth_request,
   deduction_attempt, contradiction_challenge, accusation)을 유도한다.

### Requirement 2: 전 시나리오 × 전 입력 종단 실행

**User Story:** 테스터로서, 모든 케이스 시나리오에 모든 유도성 입력을 실제 파이프라인으로
통과시키고 싶다.

#### Acceptance Criteria

1. THE 하니스 SHALL caseKnowledge를 가진 모든 패키지 시나리오 팩을 로드한다(현재 locked-room-mystery).
2. WHEN 각 시나리오에 각 유도성 입력을 적용하면 THE 하니스 SHALL `runTurnV2`를 dry-run 경로로
   실행한다(외부 API 없이 결정적).
3. THE 하니스 SHALL 단일 턴뿐 아니라 누적 상태(여러 입력을 순차 적용한 세션)에서도 검증한다.
4. WHEN 시나리오에 hidden truth가 없으면 THE 하니스 SHALL 그 시나리오를 건너뛰거나 무해 처리한다.

### Requirement 3: 누출 0 단언

**User Story:** 게임 디자이너로서, 어떤 표면에도 진실이 새지 않음을 보장받고 싶다.

#### Acceptance Criteria

1. WHEN 한 턴이 처리되면 THE 하니스 SHALL 모든 턴 메시지 content에 hidden truth id가 없음을 단언한다.
2. WHEN 한 턴이 처리되면 THE 하니스 SHALL 모든 표면에 `HIDDEN_TRUTH_REDACTED` 토큰이 없음을 단언한다.
3. WHEN 한 턴이 처리되면 THE 하니스 SHALL hidden truth blockedKeywords가 NPC/나레이터 출력에
   진실을 확정하는 형태로 노출되지 않음을 단언한다(키워드 자체의 일반적 등장과 진실 확정 노출을 구분).
4. WHEN caseBoard를 빌드하면 THE 하니스 SHALL clues/statements/openQuestions/deductions/dossiers
   어디에도 hidden truth id나 원문이 없음을 단언한다.
5. WHEN caseRuntime devTrace가 존재하면 THE 하니스 SHALL allowedFacts에 hidden truth id가 없음을 단언한다.
6. WHEN 누출이 발견되면 THE 단언 SHALL 어떤 시나리오·입력·표면에서 샜는지 식별 가능한 메시지로 실패한다.

### Requirement 4: 결정성 및 통합

**User Story:** 개발자로서, 이 하니스가 재현 가능하고 기존 테스트 스위트에 자연히 합류하길 원한다.

#### Acceptance Criteria

1. THE 하니스 SHALL `Math.random()` 등 비결정 요소 없이 동일 결과를 재현한다(dry-run 경로).
2. THE 하니스 SHALL 기존 서버 테스트 러너(`bun test`)로 실행된다.
3. WHEN 하니스 실행 후 THE 타입체크(`pnpm -r run check`) SHALL 통과한다.
4. WHEN 하니스 실행 후 THE 전체 서버 테스트 SHALL 통과한다.
5. THE 하니스 SHALL 재사용 가능한 헬퍼(시나리오 로드, 누출 단언)를 분리해 향후 시나리오 추가 시
   코퍼스만 늘리면 커버되도록 한다.
