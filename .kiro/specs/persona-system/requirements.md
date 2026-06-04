# Requirements Document

## Introduction

페르소나는 바로 구현으로 들어가지 않는다. Marinara Engine과 SillyTavern Lab을 확인한 뒤
Hushline에 필요한 최소 구조를 다시 잡는다.

참조 결과:

- Marinara는 페르소나를 단순 이름/역할이 아니라 유저 캐릭터 카드로 다룬다. 주요 필드는
  `description`, `personality`, `scenario`, `backstory`, `appearance`, avatar, alt descriptions,
  persona stats다.
- SillyTavern은 persona description의 prompt 위치를 조정하고 `{{user}}`/이름/아바타와 묶는다.
  ST-Hushline Lab에서는 실제 사용자 이름을 prompt에 하드코딩하지 않고, `{{user}}`, 사용자 공개 정보,
  공개 인물 정보, 핸드아웃을 서로 다른 데이터 블록으로 분리했다.
- Hushline의 1차 목표는 Marinara식 전체 캐릭터 카드/스탯 시스템 복제가 아니다. 목표는 유저가
  장면 안에서 어떤 인물인지 NPC들이 알 수 있게 하되, Character가 유저를 메타적인 "플레이어"로
  의식하지 않게 하는 것이다.

따라서 페르소나는 세션에 영속되는 "유저 캐릭터 정체성"이고, 각 에이전트에는 서로 다른 가시성으로
주입된다.

핵심 불변식:

- Director는 플레이어/세션 주체를 인식해 agency를 보호한다.
- Character는 유저를 "장면 속 상대 인물"로만 인식한다. Character prompt에 `사용자`, `플레이어`,
  `User Persona` 같은 메타 라벨을 노출하지 않는다.
- Narrator는 관찰 가능한 외형/행동만 다룬다. 유저 내면/감정/의도는 단정하지 않는다.
- Guard는 유저가 조종하는 주체를 코드 레벨에서 보호한다.
- hidden truth, 사건 정답, NPC handout은 페르소나에 섞이지 않는다.

## Glossary

- **PersonaProfile**: 세션에 저장되는 유저 캐릭터 정체성. 이름, 장면 내 역할, 공개 설명, 외형,
  관계 태그를 가진다.
- **Director Persona Brief**: Director가 보는 페르소나. 플레이어 agency 보호를 위한 메타 정보 포함.
- **Character Persona Brief**: Character가 보는 페르소나. 장면 속 상대 인물에 대한 공개 정보만 포함.
- **Narrator Persona Brief**: Narrator가 보는 페르소나. 관찰 가능한 외형/위치/행동 묘사에 필요한 정보.
- **PersonaDraft**: persona-maker가 생성하는 초안. Hushline 1차 범위에서는 name/shortName/role/
  description/appearance/relationshipTags만 사용한다.
- **UserAgencyGuard**: 유저 대사/행동/내면 대리 서술을 차단하는 코드 레벨 검증.

## Requirements

### Requirement 1: 페르소나 모델 확장 및 영속

**User Story:** 플레이어로서, 내 페르소나가 이름만이 아니라 장면 안에서 누구인지 표현하고, 세션에
보존되길 원한다.

#### Acceptance Criteria

1. THE `SessionStateV2.persona` SHALL `role?`, `description?`, `appearance?`, `relationshipTags?`
   필드를 추가로 가진다. 모든 신규 필드는 옵셔널이어야 한다.
2. WHEN 세션 생성 요청에 name/shortName/role/description/appearance/relationshipTags가 들어오면
   THE session SHALL 해당 값을 보존한다.
3. WHEN persona-maker 출력이 세션 생성에 전달되면 THE session SHALL Hushline 1차 필드
   (name/shortName/role/description/appearance/relationshipTags)를 버리지 않는다.
4. WHEN 기존 호출이 name만 보내면 THE session SHALL 기존과 동일하게 정상 생성된다.
5. THE client session DTO SHALL persona 확장 필드를 노출하되, hidden truth나 NPC private handout을
   포함하지 않는다.

### Requirement 2: 에이전트별 페르소나 가시성

**User Story:** 시스템 설계자로서, Director/Character/Narrator가 같은 페르소나를 각자의 역할에 맞는
가시성으로 보길 원한다.

#### Acceptance Criteria

1. WHEN Director context is built, THE context SHALL include a Director Persona Brief with player-agency
   framing and the player-authored persona fields.
2. WHEN Character prompt is built, THE prompt SHALL include only a Character Persona Brief: 장면 속 상대의
   공개 역할, 공개 설명, 외형, 관계 태그.
3. THE Character prompt SHALL NOT describe the persona as `사용자`, `플레이어`, `유저`, `AI user`, or a
   service recipient.
4. WHEN Narrator prompt is built, THE prompt SHALL include only observable persona data needed for sensory
   description and SHALL preserve the rule that user inner state is not asserted.
5. THE Guard SHALL receive persona name/shortName/aliases needed to detect user-action hijack and user
   dialogue generation.

### Requirement 3: 이름/매크로/장면 권위 경계

**User Story:** 플레이어로서, 내 페르소나 정보가 NPC의 몰입을 깨거나 장면 권위를 오염시키지 않길 원한다.

#### Acceptance Criteria

1. THE existing unintroduced-name masking SHALL remain active. A Character SHALL NOT know the persona's
   exact name before it is introduced in-scene unless the scenario explicitly starts with that knowledge.
2. THE Character Persona Brief SHALL still provide role/description/appearance without forcing exact name
   exposure.
3. THE system SHALL treat long persona descriptions as user-authored identity/background, not as narrator-
   declared scene facts.
4. THE prompt construction SHALL keep ST Lab's separation principle: user/persona public info, public
   character info, and private handout info are separate blocks or typed fields.
5. THE implementation SHALL avoid hard-coded real user names in prompts; use session persona labels and
   masking helpers consistently.

### Requirement 4: 클라이언트 페르소나 편집

**User Story:** 플레이어로서, 시작 전에 내 이름, 장면 내 입장, 공개 설명, 외형을 직접 적거나 생성해서
세션에 넣고 싶다.

#### Acceptance Criteria

1. THE setup UI SHALL let the user edit name, role, description, and appearance.
2. THE setup UI MAY expose relationshipTags as generated/editable chips or a compact text field.
3. WHEN persona-maker generation is used, THE UI SHALL populate generated fields and keep them editable.
4. WHEN session creation starts, THE client SHALL send the full first-pass persona object.
5. THE UI SHALL keep the existing scenario -> persona -> advisor/start flow. Marinara-style avatar, stats,
   alt descriptions, and persistent persona library are out of scope for this first pass.

### Requirement 5: 검증 및 하위 호환

**User Story:** 개발자로서, 페르소나 추가가 기존 세션, 시나리오, 추리 안전성, 빌드를 깨지 않길 원한다.

#### Acceptance Criteria

1. WHEN an old session or name-only request is used, THE system SHALL behave as before.
2. THE focused tests SHALL cover persona persistence, DTO exposure, Director/Character/Narrator brief
   construction, name masking, and user-agency guard inputs.
3. THE prompt tests SHALL assert that Character prompt uses world-internal wording and does not expose
   `사용자/플레이어/User Persona` meta labels.
4. THE hidden-truth leak harness SHALL still pass with persona data present.
5. THE verification SHALL include focused tests, `corepack pnpm -r run check`, server tests, client build
   when UI changes are included, and `git diff --check`.
