# Design Document — Romance Relationship Pack

## Overview

순수 관계 드라마(연애) 시나리오 팩을 **데이터만으로** 추가한다. caseKnowledge 없이
relationshipGraph / relationshipToUser / surfacePersonality·fear·behaviorRules /
Director relationshipUpdate / scene device relationshipChanges 를 실제로 작동시켜, 엔진의
관계 동역학을 콘텐츠로 검증한다.

설계 원칙:
- **로더/스키마/파이프라인 무수정** — 기존 팩 구조를 그대로 미러링.
- **관계 동역학 정면 가동** — 삼각관계 + 라이벌 + 오랜 친구 구도.
- **누출 하니스 무관** — caseKnowledge 없으므로 hidden-truth 대상 아님(자연 제외).

## Architecture

비미스터리 경로로 동작하는 데이터-only 시나리오 팩. 기존 팩 구조를 그대로 미러링하며,
관계 동역학을 가동시키는 콘텐츠를 채운다.

## Concept — "늦은 봄의 셰어하우스" (가제, id: `shared-house-romance`)

대학 졸업반 무렵, 여성 {{유저}}가 우연히 들어간 오래된 셰어하우스. 먼저 살고 있던 세 남자와
한 계절을 보내며 감정이 얽힌다. 미스터리도 위협도 없다. 일상의 거리감, 오해, 설렘, 질투가
유일한 사건이다.

### 인물 (3명, named-actor)

| id | 이름 | 한 줄 | OCEAN 경향 | 유저 초기 호감 |
|----|------|-------|-----------|----------------|
| `seo-yujin` | 서유진 | 밝고 직진형. 먼저 다가오지만 속은 외로움 (25세 남) | 高 외향/개방, 低 신경성 | +2 |
| `han-doyun` | 한도윤 | 무뚝뚝한 완벽주의자. 거리 두지만 챙김 (27세 남) | 高 성실, 低 외향 | 0 |
| `kang-minjae` | 강민재 | 오랜 소꿉친구. 편하지만 변화를 두려워함 (25세 남) | 高 우호/신경성 | +3 |

### 관계 구도 (relationshipGraph)

```
seo-yujin ──(라이벌적 의식: rivalry 5)──> han-doyun
han-doyun ──(존중하나 어색: respect 4)──> seo-yujin
kang-minjae ──(서유진을 부러워함: envy 5)──> seo-yujin
seo-yujin ──(민재를 편하게 여김: fondness 6)──> kang-minjae
kang-minjae ──(유저에게 오랜 마음: hidden_affection)──> (유저는 relationshipToUser로 표현)
```

유저(여성)를 둘러싼 삼각: 서유진(직진) vs 강민재(소꿉친구의 오랜 마음) + 한도윤(천천히 여는
쪽). Director가 관계를 어떻게 흔드는지가 핵심 검증 포인트.

## Components and Interfaces

팩 파일 구성. `packages/server/scenarios/shared-house-romance/`:

### manifest.json
```json
{
  "id": "shared-house-romance",
  "title": "늦은 봄의 셰어하우스",
  "subtitle": "한 계절의 거리",
  "genre": "romance",
  "version": "1.0.0",
  "engineVersion": ">=2.0.0",
  "uiMode": "scene-first"
}
```
- `scene-first`: 메신저보다 장면/대화 중심. (이벤트로 메신저가 생기면 dock에 등장 — 앞서 만든
  phone-device-apps와 자연 결합. 단 1단계에선 phone-channel 메시지가 없으면 메신저 앱 미표시.)

### scenario-card.json
- spaceRules: 셰어하우스 공간(거실/부엌/옥상/각자 방), 일상 리듬.
- chatRules: 인물은 각자 감정·거리감을 가지고 반응. 유저를 조수처럼 따르지 않음.
- toneRules: 잔잔하고 구체적인 일상 묘사, 직접적 감정 토로보다 행동·머뭇거림.
- hardNos: 미스터리/폭력/초자연 요소 배제. 유저 감정 대리 서술 금지.
- backgroundIds: 재사용 가능한 기존 배경 우선(없으면 일반 ID 문자열 — 배경 에셋 없어도 동작).
- initialSceneMode: `dialogue`.
- openingBeats: 셰어하우스 첫 입주 장면(나레이터 + 세 인물의 첫인사).

### characters/*.json (3개) — chara_card_v3 카드 형식
각 캐릭터는 **하드코딩된 CharacterDefinition이 아니라 chara_card_v3 카드**로 작성한다:
- 표준 필드(name/description/personality/system_prompt/first_mes)는 카드 스펙대로.
- 엔진 고유 데이터(handout secret/desire/objective, relationships, OCEAN, autonomy, id 등)는
  표준 확장 슬롯 `data.extensions.hushline`에 담는다.
- 로더가 카드를 감지하면 `cardToCharacterDefinition`로 `CharacterDefinition`으로 변환한다.
- 카드는 여전히 valid chara_card_v3 → 다른 앱에서도 열리고, 향후 PNG import(②)와 동일 경로.
- `handout.secret`: 미스터리가 아니라 "감정적 비밀"(예: 강민재는 오랜 마음을 숨김). behaviorRules로 표현.
- systemPrompt/behaviorRules에 "유저(그녀) 행동·대사·감정 대리 서술 금지" 포함.

### prompts/director.txt
관계 드라마용 GM 지침:
- 감정/관계 beat 우선, 외부 사건으로 끊지 않기.
- 호감/질투/오해/설렘을 점진적으로. 한 턴에 관계를 급변시키지 않기.
- 유저 선택에 따라 relationshipUpdate를 신중히 출력(과도한 호감 급상승 금지).
- 인물 간 관계(삼각)를 활용해 긴장 만들기.
- JSON만 출력. speakers 가능 id: seo-yujin, han-doyun, mer-ari.

### prompts/narrator.txt
일상 관계극 나레이터:
- 잔잔한 감각 묘사, 인물의 미세한 표정·머뭇거림.
- 대사 금지(캐릭터 에이전트 담당), 유저 감정 단정 금지.

### objectives/main.json
```json
{ "id": "spend-the-season", "description": "셰어하우스에서 한 계절을 보내며 세 사람과의 거리를 좁혀간다." }
```

### events/triggers.json
관계 전개 이벤트:
- 둘만 남는 저녁 / 오해가 생기는 메시지 / 옥상에서의 고백 기회 / 라이벌 의식 표면화 등.
- `oneShot` 적절히 설정.

### scene-devices.json
관계/감정 beat 장치(SceneBeatGenerator 가동):
- type `relational`/`social`/`quiet_texture` 위주.
- 일부 device에 `relationshipChanges`(sourceId/targetId는 실제 캐릭터 id) 포함 → 로더 검증 + 엔진
  관계 갱신 경로 검증.
- `factReveals`는 사용하지 않음(caseKnowledge 없음 → fact id 없음). 빈 채로 둠.

## Data Models

신규 타입 없음. 전부 기존 `ScenarioPack` 데이터. caseKnowledge 미포함.

## Engine touch-points (검증되는 부분)

| 엔진 요소 | 이 팩이 가동시키는 방식 |
|-----------|------------------------|
| relationshipGraph | 캐릭터 relationships로 초기화 → createInitialWorldState |
| relationshipToUser | initialRelationshipToUser → Director relationshipUpdate로 변동 |
| applyRelationshipUpdate | Director가 relationshipUpdate 출력 시 |
| scene device relationshipChanges | scene-devices.json → 로더 검증 + (향후) 적용 |
| buildDossiers | 조우한 인물의 surfacePersonality/호감도 표시 |
| caseBoard | isCaseScenario=false, 빈 단서장 (비미스터리 경로) |
| phone-device-apps | scene-first + caseKnowledge 없음 → 사건파일 비활성, 메신저는 이벤트 시 |

## Error Handling

| 상황 | 처리 |
|------|------|
| 배경 에셋 없음 | backgroundId 문자열만 사용(이미지 없어도 동작, 기존 동작) |
| scene device relationshipChanges가 없는 캐릭터 참조 | 로더가 검증 실패 → 데이터 수정 |
| caseKnowledge 부재로 case 경로 스킵 | 정상(비미스터리 분기) |

## Testing Strategy

1. **로드 테스트**: `loadScenarioPack("shared-house-romance")` success=true, 캐릭터 3명,
   relationships 무결성(참조 id 존재).
2. **dry-run 턴 테스트**: 이 팩으로 `runTurnV2` 1턴 — 오류 없이 메시지 생성, caseBoard
   isCaseScenario=false.
3. **관계 초기화 테스트**: createInitialWorldState가 relationshipGraph를 캐릭터 relationships로
   채우는지.
4. 검증: `corepack pnpm -r run check` + 전체 서버 테스트.

## Correctness Properties

### Property 1: 데이터-only 추가
팩 추가는 로더/스키마/파이프라인 코드를 수정하지 않고 데이터만으로 로드·동작한다.
**Validates: Requirements 1.1, 1.4, 5.1, 5.5**

### Property 2: 관계 무결성
모든 캐릭터 relationships와 scene device relationshipChanges의 참조 id는 실제 캐릭터다.
**Validates: Requirements 2.3, 3.3**

### Property 3: 비미스터리 경로
caseKnowledge가 없으므로 caseBoard.isCaseScenario=false, 단서장은 비고, 누출 하니스 대상 아님.
**Validates: Requirements 4.4, 5.4**

### Property 4: 관계 동역학 가동
dry-run 턴이 오류 없이 동작하고 relationshipGraph가 캐릭터 relationships로 초기화된다.
**Validates: Requirements 4.1, 4.2, 4.3**

### Property 5: 경계 일관성
캐릭터 systemPrompt/behaviorRules는 유저 행동·대사·감정 대리 서술을 금지한다.
**Validates: Requirements 2.5**

## Appendix — PNG 캐릭터 카드 메모 (다음 단계 ②용)

> 사용자가 언급한 PNG 캐릭터 카드 포맷. 이번 팩 스코프는 아니지만 card-import 작업에 반영.

- PNG의 tEXt/zTXt 청크에 데이터 매립: 키워드 `ccv3`(chara_card_v3, base64) 우선, 없으면
  `chara`(chara_card_v2, base64).
- 디코드 결과는 기존 `card-importer.ts`의 `CharaCardV3` 구조와 호환.
- PNG import 경로 = "tEXt 청크 추출 → base64 디코드 → 기존 `importCharaCard`에 전달".
- ② 단계에서: PNG 청크 파서(서버) + import API 라우트 + 클라이언트 업로드 UI.
