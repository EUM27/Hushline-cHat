# Requirements Document

## Introduction

`NpcAgendaScheduler` 모듈(`packages/server/src/engine-v2/agenda-scheduler.ts`)은
NPC가 자기 목표/제약/비밀 동기에 따라 "먼저 움직일지"를 판정하는 로직을 담고 있지만,
턴 파이프라인에 연결되어 있지 않다. 현재 발화자(speaker) 선택은 전적으로 Director가
담당하며, Director가 아무도 선택하지 않거나 침묵(silence)을 결정하면 그 턴에는 NPC가
스스로 끼어들 수 없다.

이 기능의 목표는 agenda-scheduler를 파이프라인에 연결해서, **Director가 발화자를 비워둔
턴에 한해** 자율성이 높고 오래 침묵한 NPC 1명이 자기 안건(agenda)에 따라 발화하도록
하는 것이다. 이는 대화 수렴(같은 인물만 반복 발화) 방지와 군상극의 생동감을 위한 것이다.

추가로 기존 모듈에는 두 가지 결함이 있어 함께 수정한다.

1. **존재하지 않는 필드 참조** — `getCurrentAgenda`가 `(state as any).turnNumber`를
   읽지만 `CharacterStateV2`에는 `turnNumber`가 없다(항상 `NaN` 비교 → 의도와 다름).
2. **비결정성** — `shouldActAutonomously`가 `Math.random()`을 사용해, 코드베이스의
   결정적(dry-run) 테스트 원칙과 충돌한다.

핵심 불변식: **자율 발화도 기존 경계(boundary gate / 정보 격리 / hidden truth 차단)를
그대로 통과해야 한다.** 자율 발화는 새로운 정보 노출 경로가 아니다.

## Glossary

- **Agenda**: NPC의 현재 목표·제약·다음 행동·은폐 동기를 담은 구조(`AgendaOutput`).
- **Autonomous speech (자율 발화)**: Director가 speaker로 지정하지 않았지만 NPC가
  자기 안건에 따라 스스로 발화하는 것.
- **Autonomy**: 캐릭터의 자율성 수치(0.0–1.0). 높을수록 스스로 움직일 가능성이 큼.
- **Silence turn**: Director가 `silence: true`이거나 `speakers`가 비어 있는 턴.

## Requirements

### Requirement 1: 자율 발화 후보 판정 (결정적)

**User Story:** 엔진으로서, NPC가 스스로 끼어들 자격이 있는지 결정적으로 판정하고 싶다.
그래야 dry-run 테스트가 재현 가능하고 동작을 검증할 수 있다.

#### Acceptance Criteria

1. THE `shouldActAutonomously` 판정 SHALL `Math.random()` 같은 비결정적 요소를 사용하지 않는다.
2. WHEN 캐릭터의 autonomy가 임계값(기본 0.7) 미만이면 THE 판정 SHALL false를 반환한다.
3. WHEN 캐릭터가 최근 N턴(기본 3턴) 이내에 발화했으면 THE 판정 SHALL false를 반환한다.
4. WHEN autonomy가 임계값 이상이고 침묵 턴 수가 기준 이상이면 THE 판정 SHALL true를 반환한다.
5. THE `getCurrentAgenda` SHALL 존재하지 않는 `state.turnNumber` 대신 명시적으로 전달된
   `currentTurn` 인자를 사용한다.

### Requirement 2: 자율 발화자 선택

**User Story:** 엔진으로서, 여러 NPC가 자율 발화 자격을 가질 때 가장 적합한 1명만 고르고
싶다. 그래야 턴이 과밀해지지 않고 수렴도 막을 수 있다.

#### Acceptance Criteria

1. WHEN Director가 이미 speaker를 1명 이상 선택했으면 THE 스케줄러 SHALL 자율 발화를
   추가하지 않는다(이번 스코프는 Director 미선택 턴 한정).
2. WHEN Director가 `silence: true`를 명시했으면 THE 스케줄러 SHALL 자율 발화를 주입하지
   않는다(침묵 연출 존중).
3. WHEN 여러 NPC가 자율 발화 자격을 가지면 THE 스케줄러 SHALL 가장 오래 침묵했고 autonomy가
   높은 NPC 1명을 결정적 기준으로 선택한다.
4. WHEN 자격을 가진 NPC가 없으면 THE 스케줄러 SHALL 아무도 선택하지 않는다(턴 그대로).

### Requirement 3: 파이프라인 연결

**User Story:** 플레이어로서, Director가 아무 말도 시키지 않은 턴에도 인물들이 살아있길
원한다. 그래야 장면이 정적으로 죽지 않는다.

#### Acceptance Criteria

1. WHEN Director 출력이 speaker를 비워두고 silence도 아니면 THE 파이프라인 SHALL
   스케줄러를 호출해 자율 발화 후보를 검토한다.
2. WHEN 자율 발화자가 선택되면 THE 파이프라인 SHALL 기존 character invocation 경로
   (`invokeCharacter`)를 그대로 사용해 발화를 생성한다.
3. WHEN 자율 발화가 생성되면 THE 파이프라인 SHALL 그 발화를 기존 boundary gate와 정보
   격리(answerScope/handout)를 통과시킨 뒤 턴 메시지로 포함한다.
4. WHEN 자율 발화자가 발화하면 THE 파이프라인 SHALL 해당 NPC의 `lastSpokeTurn`을 갱신한다.
5. WHEN scene beat 주입(Step 6.5)과 자율 발화가 같은 턴에 모두 후보가 되면 THE 파이프라인
   SHALL 자율 발화를 "의미 있는 사건"으로 간주해 scene inertia를 리셋한다(중복 정체 방지).

### Requirement 4: Hidden truth / 경계 불변식

**User Story:** 게임 디자이너로서, 자율 발화가 정보 누출의 우회로가 되지 않길 원한다.

#### Acceptance Criteria

1. WHEN 자율 발화가 생성되면 THE 발화 SHALL 그 NPC의 private handout과 현재 answerScope에
   허용된 사실만 사용한다(Director 선택 발화와 동일 제약).
2. THE 자율 발화 SHALL hidden truth fact를 노출하지 않는다(기존 runtime boundary gate 적용).
3. THE 테스트 SHALL 자율 발화 경로에서도 hidden truth 누출이 없음을 검증한다.

### Requirement 5: 검증 및 하위 호환

**User Story:** 개발자로서, 변경이 기존 동작과 테스트를 깨지 않길 원한다.

#### Acceptance Criteria

1. WHEN Director가 speaker를 선택한 일반 턴이면 THE 파이프라인 동작 SHALL 이 기능 도입
   전과 동일하다(자율 발화 미주입).
2. WHEN 변경 적용 후 THE 타입체크(`pnpm -r run check`) SHALL 통과한다.
3. WHEN 변경 적용 후 THE 서버 테스트 스위트 SHALL 전부 통과한다(기존 118 + 신규).
4. THE 신규 단위 테스트 SHALL 자율 발화 자격 판정(결정적), 후보 선택, Director 선택 턴에서
   미주입, hidden truth 누출 0을 각각 커버한다.
