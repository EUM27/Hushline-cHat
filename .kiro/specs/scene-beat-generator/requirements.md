# Requirements Document

## Introduction

`SceneBeatGenerator` 모듈(`packages/server/src/engine-v2/scene-beat-generator.ts`)은 이미
`shouldInjectBeat / selectBeat / updateInertia`를 구현해 두었지만, 턴 파이프라인에
연결되어 있지 않다. 연결을 막는 두 가지 공백이 있다.

1. **데이터 공백** — `ScenarioPack`에 `sceneDevices` 필드가 없어서 시나리오 팩이
   `SceneOccurrenceDevice` 데이터를 공급할 수 없다. (타입 `SceneOccurrenceDevice`는
   `shared/engine-v2/case.ts`에 이미 정의되어 있으나 어디서도 채워지지 않는다.)
2. **상태/연결 공백** — `WorldState`(base)에 `sceneInertiaCounter`와 최근 비트 추적
   필드가 없고, `runTurnV2` 파이프라인에 비트 주입 단계가 없다.

이 기능의 목표는 위 두 공백을 메워서, 대화가 정체(inertia)될 때 시나리오 팩이 정의한
장면 장치(scene device)에서 한 개의 장면 비트(scene beat)를 선택해 턴 결과에 주입하는
것이다. 이는 정체 방지(anti-stall)와 장르 리듬을 담당하던 옛 ScenePressureGovernor를
대체한다.

핵심 불변식: **장면 비트 주입이 hidden truth를 누출해서는 안 된다.** 디바이스 효과의
`factReveals`는 공개/관찰 가능 사실로 한정되어야 하며, hidden truth fact id는 절대
주입될 수 없다.

## Glossary

- **Scene Device (`SceneOccurrenceDevice`)**: 시나리오 팩이 정의하는 장면 장치.
  트리거 조건과 효과(장면 비트 텍스트, 상태 변화, NPC 반응)를 가진다.
- **Scene Beat (`GeneratedBeat`)**: 한 턴에 주입되는 환경/사건 단위. 디바이스에서 생성된다.
- **Scene Inertia**: 의미 있는 사건 없이 지나간 턴 수를 추적하는 카운터. 임계값(2) 도달 시
  비트 주입이 고려된다.
- **One-shot device**: 1회만 발동 가능한 디바이스.
- **Hidden truth**: 유저에게 절대 직접 노출되면 안 되는 사건의 핵심 진실 fact.

## Requirements

### Requirement 1: 시나리오 팩 sceneDevices 스키마

**User Story:** 시나리오 작가로서, 시나리오 팩에 장면 장치를 선언하고 싶다. 그래야 정체된
장면에 주입할 사건/리듬 비트를 데이터로 정의할 수 있다.

#### Acceptance Criteria

1. THE `ScenarioPack` 타입 SHALL 선택적 `sceneDevices?: SceneOccurrenceDevice[]` 필드를 가진다.
2. WHEN 시나리오 팩 디렉터리에 `scene-devices.json` 파일이 존재하면 THE scenario loader
   SHALL 이를 읽어 `pack.sceneDevices`로 채운다.
3. WHEN `scene-devices.json` 파일이 존재하지 않으면 THE scenario loader SHALL `sceneDevices`를
   빈 배열 또는 미정의로 두고 로드를 성공시킨다 (하위 호환).
4. WHEN `scene-devices.json`이 스키마 검증에 실패하면 THE scenario loader SHALL 명확한
   `ScenarioLoadError`를 반환하고 로드를 실패시킨다.
5. THE scene device 스키마 검증 SHALL 각 디바이스의 `id`, `type`, `trigger`, `effect`,
   `oneShot` 필수 필드 존재를 확인한다.

### Requirement 2: sceneDevices 참조 무결성 검증

**User Story:** 시나리오 작가로서, 디바이스가 참조하는 fact/npc id가 실제로 존재하는지
검증받고 싶다. 그래야 런타임에 깨진 참조로 인한 오작동을 사전에 막을 수 있다.

#### Acceptance Criteria

1. WHEN 디바이스 효과의 `stateDelta.factReveals`가 존재하는 fact id가 아닌 값을 참조하면
   THE scenario validation SHALL 오류를 보고한다.
2. WHEN 디바이스 효과의 `npcReactions[].npcId`가 시나리오 캐릭터 id 집합에 없으면 THE
   scenario validation SHALL 오류를 보고한다.
3. WHEN 디바이스 효과의 `stateDelta.factReveals`가 hidden truth fact id를 참조하면 THE
   scenario validation SHALL hidden-truth 누출 위험 오류를 보고하고 로드를 실패시킨다.
4. WHEN 디바이스 `relationshipChanges`의 `sourceId`/`targetId`가 캐릭터 id 집합에 없으면
   THE scenario validation SHALL 오류를 보고한다.

### Requirement 3: WorldState 장면 비트 추적 상태

**User Story:** 엔진으로서, 장면 정체와 최근 주입 비트를 기억하고 싶다. 그래야 비트를
언제 주입할지, 어떤 유형을 피할지 판단할 수 있다.

#### Acceptance Criteria

1. THE `WorldState`(base) 타입 SHALL `sceneInertiaCounter: number` 필드를 가진다.
2. THE `WorldState`(base) 타입 SHALL 최근 주입된 비트 유형 추적 필드(`recentBeatTypes: string[]`)를 가진다.
3. WHEN 새 세션의 WorldState가 생성되면 THE 엔진 SHALL `sceneInertiaCounter`를 0,
   `recentBeatTypes`를 빈 배열로 초기화한다.
4. THE `recentBeatTypes` 배열 SHALL 최근 N개(최소 직전 2개)만 보존되도록 상한을 둔다.

### Requirement 4: 턴 파이프라인 비트 주입 연결

**User Story:** 플레이어로서, 대화가 멈췄을 때 장면이 스스로 움직이길 원한다. 그래야
경험이 정체되지 않고 긴장과 리듬이 유지된다.

#### Acceptance Criteria

1. WHEN 한 턴이 처리되면 THE 파이프라인 SHALL 그 턴이 "의미 있는 사건"을 포함했는지
   판정하고 `updateInertia`로 `sceneInertiaCounter`를 갱신한다.
2. WHEN `shouldInjectBeat(sceneInertiaCounter)`가 true이고 `pack.sceneDevices`가 비어있지
   않으면 THE 파이프라인 SHALL `selectBeat`를 호출해 비트 후보를 1개 선택한다.
3. WHEN 비트가 선택되면 THE 파이프라인 SHALL 그 비트의 `stateDelta`(tension/danger/factReveals)를
   다음 WorldState에 반영하고, 비트 유형을 `recentBeatTypes`에 기록한다.
4. WHEN 비트가 주입되면 THE 파이프라인 SHALL `sceneInertiaCounter`를 리셋한다.
5. WHEN 비트가 주입되면 THE 파이프라인 SHALL 그 비트를 턴 메시지(나레이터/시스템 계열)로
   표면화하여 `TurnResultV2`에 포함한다.
6. WHEN one-shot 디바이스가 이미 발동되었으면 THE `selectBeat` SHALL 그 디바이스를 다시
   선택하지 않는다.
7. WHEN 적격 디바이스가 없으면 THE 파이프라인 SHALL `quiet_texture` 폴백 비트를 사용하거나
   비트를 주입하지 않는다(폴백 동작 일관 유지).

### Requirement 5: Hidden truth 누출 방지 (런타임 가드)

**User Story:** 게임 디자이너로서, 어떤 경로로도 hidden truth가 새지 않길 원한다. 그래야
미스터리의 핵심 불변식이 깨지지 않는다.

#### Acceptance Criteria

1. WHEN 선택된 비트의 `stateDelta.factReveals`에 hidden truth fact id가 포함되면 THE
   파이프라인 SHALL 그 fact id를 주입에서 제외한다(런타임 방어선, 데이터 검증과 별개).
2. WHEN 비트가 표면화될 때 THE 비트 텍스트(sceneBeat) SHALL 기존 narrator boundary gate와
   동일한 수준의 hidden-truth 필터를 통과한다.
3. THE 테스트 SHALL hidden truth id가 어떤 비트 주입에도 노출되지 않음을 검증한다(누출 0).

### Requirement 6: 검증 및 하위 호환

**User Story:** 개발자로서, 변경이 기존 시나리오와 테스트를 깨지 않길 원한다.

#### Acceptance Criteria

1. WHEN `sceneDevices`가 없는 기존 시나리오 팩(`school-life-anomaly`, `locked-room-mystery`)을
   로드하면 THE 로더 SHALL 기존과 동일하게 성공한다.
2. WHEN 변경 적용 후 THE 빌드/타입체크(`pnpm -r run check`) SHALL 통과한다.
3. WHEN 변경 적용 후 THE 서버 테스트 스위트 SHALL 전부 통과한다(기존 103 pass 유지 + 신규 테스트).
4. THE 신규 단위 테스트 SHALL 비트 주입 트리거, one-shot 제외, 최근 비트 유형 회피,
   hidden-truth 누출 0을 각각 커버한다.
