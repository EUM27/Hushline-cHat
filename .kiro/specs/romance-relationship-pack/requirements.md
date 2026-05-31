# Requirements Document

## Introduction

현재 패키지된 시나리오는 두 종류뿐이다 — `school-life-anomaly`(호러, messenger-first,
caseKnowledge 없음)와 `locked-room-mystery`(추리, scene-first, caseKnowledge 있음). 두 팩
모두 엔진의 **관계 동역학**(relationshipGraph, relationshipToUser, Director relationshipUpdate,
scene device의 relationshipChanges, surfacePersonality/fear/behaviorRules)을 진지하게 쓰지
않는다. 즉 코드에 구현돼 있으나 콘텐츠로 검증된 적 없는 영역이다.

이 기능은 **순수 관계 드라마(연애) 시나리오 팩**을 만든다. caseKnowledge(미스터리 레이어)
없이, 인물 간 관계와 유저에 대한 호감도 변화, 감정 beat가 중심이 되는 시나리오다. 목적은
두 가지: (1) 새로운 장르 콘텐츠 제공, (2) 콘텐츠로 엔진의 관계 동역학을 스트레스 테스트하여
숨은 가정이나 버그를 드러낸다.

핵심 제약: 기존 시나리오 로더/스키마/파이프라인을 **수정하지 않고** 데이터만으로 구성한다.
로더가 추가 변경을 요구하면 그건 별도로 처리한다(이 팩의 목적이 그런 공백을 드러내는 것이다).

## Glossary

- **관계 드라마 팩**: caseKnowledge 없이 인물 관계·감정 중심으로 진행되는 시나리오 팩.
- **relationshipToUser**: 캐릭터의 유저 호감도(-10..10). 진행에 따라 변한다.
- **relationshipGraph**: 인물 간 관계 엣지(질투/우정/경쟁 등).
- **surfacePersonality / fear / behaviorRules**: 캐릭터의 표면 성격/두려움/행동 규칙.

## Requirements

### Requirement 1: 시나리오 팩 골격

**User Story:** 플레이어로서, 새로운 연애 시나리오를 선택해 시작하고 싶다.

#### Acceptance Criteria

1. THE 팩 SHALL `packages/server/scenarios/<id>/` 아래 기존 팩과 동일한 파일 구조를 가진다
   (manifest.json, scenario-card.json, characters/*.json, prompts/director.txt,
   prompts/narrator.txt, objectives/main.json, events/triggers.json).
2. THE manifest SHALL `genre: "romance"`, `uiMode`는 관계 드라마에 맞는 값(`scene-first` 또는
   `hybrid`)을 가진다.
3. THE 팩 SHALL `caseKnowledge`를 포함하지 않는다(순수 관계 드라마).
4. WHEN 시나리오 로더가 이 팩을 로드하면 THE 로드 SHALL 성공한다(`loadScenarioPack` success=true).
5. WHEN 서버가 시나리오 목록을 노출하면 THE 새 팩 SHALL 목록에 나타난다.

### Requirement 2: 관계 중심 캐릭터

**User Story:** 플레이어로서, 각자 성격과 관계가 뚜렷한 인물들과 감정적으로 얽히고 싶다.

#### Acceptance Criteria

1. THE 팩 SHALL 최소 2명 이상의 named-actor 캐릭터를 가진다.
2. THE 각 캐릭터 SHALL `handout.surfacePersonality`, `fear`, `behaviorRules`, `desire`,
   `objective`, `initialRelationshipToUser`를 채운다.
3. THE 캐릭터들 SHALL 서로에 대한 `relationships`(관계 엣지)를 가진다(예: 삼각관계, 라이벌,
   오랜 친구 등).
4. THE 각 캐릭터 SHALL 고유한 OCEAN 수치와 systemPrompt를 가져 말투/태도가 구분된다.
5. THE 캐릭터 systemPrompt와 behaviorRules SHALL 유저 행동/대사/감정을 대신 서술하지 않도록
   기존 경계 규칙과 일관된다.

### Requirement 3: 감정/관계 진행 장치

**User Story:** 플레이어로서, 내 선택과 대화에 따라 인물들의 감정과 관계가 변하는 걸 느끼고 싶다.

#### Acceptance Criteria

1. THE director 프롬프트 SHALL 관계 드라마에 맞는 GM 지침을 담는다(호감/긴장/질투/오해의 점진적
   전개, 감정 beat 우선, 유저 강제 금지).
2. THE 팩 SHALL scene device(`scene-devices.json`)로 관계/감정 beat를 정의한다(예: 둘만 남는 순간,
   오해가 생기는 순간). 단, scene device의 `factReveals`는 사용하지 않거나 사용 시에도 안전하다.
3. WHEN scene device가 `relationshipChanges`를 포함하면 THE 참조하는 sourceId/targetId SHALL
   실제 캐릭터 id여야 한다(로더 검증 통과).
4. THE eventTriggers SHALL 관계 전개를 유도하는 이벤트를 담는다(고백 기회, 갈등 표면화 등).

### Requirement 4: 엔진 관계 동역학 검증

**User Story:** 개발자로서, 이 팩이 엔진의 관계 동역학을 실제로 작동시키는지 확인하고 싶다.

#### Acceptance Criteria

1. WHEN 이 팩으로 dry-run 턴을 진행하면 THE 파이프라인 SHALL 오류 없이 동작한다.
2. WHEN Director가 `relationshipUpdate`를 출력하면 THE state-manager SHALL relationshipGraph를
   갱신한다(기존 `applyRelationshipUpdate` 경로).
3. THE 캐릭터 dossier(인물 기록) SHALL 조우 시 surfacePersonality/관계 호감도를 표시한다(기존
   buildDossiers 경로 재사용).
4. WHEN 비-미스터리 팩이므로 THE caseBoard SHALL `isCaseScenario: false`이고 단서장은 비어 있다.

### Requirement 5: 검증 및 하위 호환

**User Story:** 개발자로서, 이 추가가 기존 시나리오/테스트/빌드를 깨지 않길 원한다.

#### Acceptance Criteria

1. WHEN 변경 적용 후 THE 타입체크(`pnpm -r run check`) SHALL 통과한다.
2. WHEN 변경 적용 후 THE 전체 서버 테스트 SHALL 통과한다.
3. THE 신규 테스트 SHALL 새 팩의 로드 성공, 캐릭터/관계 무결성, dry-run 턴 동작을 검증한다.
4. WHEN hidden-truth 누출 하니스가 실행되면 THE 새 팩 SHALL caseKnowledge가 없으므로 하니스
   대상에서 자연히 제외되거나 무해 처리된다.
5. THE 기존 두 시나리오의 동작 SHALL 변하지 않는다.
