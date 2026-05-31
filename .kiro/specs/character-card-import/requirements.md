# Requirements Document

## Introduction

서버에는 이미 chara_card_v3 JSON을 `CharacterDefinition`으로 변환하는 경로가 있다
(`importCharaCard`, `cardToCharacterDefinition` — romance 팩이 이 형식으로 작성됨). 하지만
사용자가 **캐릭터 카드 파일(JSON 또는 PNG)을 직접 업로드**해서 불러오는 경로는 없다.

캐릭터 카드의 사실상 표준은 PNG다 — 보이는 건 일러스트지만 실제 데이터는 PNG의 tEXt/zTXt
청크에 base64로 매립되어 있다(키워드 `ccv3` = chara_card_v3 우선, 없으면 `chara` =
chara_card_v2). 이 기능은 PNG/JSON 카드 파일을 업로드해 파싱하고, 기존 변환 경로로
`CharacterDefinition`을 만들어 미리보기하는 import 파이프라인을 추가한다.

스코프: 카드 파일 → `CharacterDefinition` 변환 + 미리보기까지. 변환된 캐릭터를 실제 세션/팩에
주입(슬롯 대체)하는 것은 기존 `replaceCharacterSlot`을 활용하되, 이번엔 **미리보기 반환**까지를
1차 목표로 하고 세션 주입 연결은 후속으로 둔다.

## Glossary

- **캐릭터 카드(Character Card)**: chara_card_v2/v3 형식. JSON 또는 PNG(tEXt 청크 매립).
- **tEXt/zTXt 청크**: PNG 내 텍스트 메타데이터 블록. 키워드 + 텍스트(또는 zlib 압축 텍스트).
- **카드 키워드**: `ccv3`(v3, base64), `chara`(v2, base64).
- **CharacterDefinition**: 엔진이 쓰는 캐릭터 구조(OCEAN/handout/relationships 등).

## Requirements

### Requirement 1: PNG 카드 청크 추출

**User Story:** 사용자로서, 캐릭터 일러스트 PNG를 올리면 그 안의 카드 데이터가 읽히길 원한다.

#### Acceptance Criteria

1. WHEN PNG 바이트가 주어지면 THE 파서 SHALL PNG 시그니처를 검증하고 tEXt/zTXt 청크를 순회한다.
2. WHEN `ccv3` 키워드 청크가 있으면 THE 파서 SHALL 그 값을 base64 디코드해 chara_card_v3 JSON으로 사용한다.
3. WHEN `ccv3`가 없고 `chara` 키워드 청크가 있으면 THE 파서 SHALL 그 값을 base64 디코드해 카드 JSON으로 사용한다.
4. WHEN zTXt(압축) 청크면 THE 파서 SHALL zlib 해제 후 동일하게 처리한다.
5. WHEN PNG에 카드 청크가 없으면 THE 파서 SHALL 명확한 오류를 반환한다.
6. WHEN PNG 시그니처가 유효하지 않으면 THE 파서 SHALL 명확한 오류를 반환한다.

### Requirement 2: JSON/PNG 통합 import

**User Story:** 사용자로서, JSON 카드든 PNG 카드든 같은 방식으로 불러오고 싶다.

#### Acceptance Criteria

1. WHEN 입력이 JSON 텍스트면 THE import SHALL 그대로 카드로 파싱한다.
2. WHEN 입력이 PNG 바이트면 THE import SHALL 청크 추출(Requirement 1) 후 카드로 파싱한다.
3. WHEN 카드가 파싱되면 THE import SHALL 기존 `cardToCharacterDefinition`으로 `CharacterDefinition`을 만든다.
4. WHEN 카드 JSON이 스키마 검증에 실패하면 THE import SHALL 명확한 오류를 반환한다.
5. THE 변환된 캐릭터 SHALL `data.extensions.hushline`이 있으면 그 엔진 데이터를, 없으면 안전한 기본값을 사용한다.

### Requirement 3: import API 라우트

**User Story:** 클라이언트로서, 카드 파일을 업로드하면 변환된 캐릭터 미리보기를 받고 싶다.

#### Acceptance Criteria

1. THE 서버 SHALL `/api/v2/character-card/import` POST 라우트를 노출한다.
2. WHEN 요청이 PNG(멀티파트 파일 또는 base64) 또는 JSON 본문을 담으면 THE 라우트 SHALL 형식을 감지해 import한다.
3. WHEN import가 성공하면 THE 라우트 SHALL 변환된 `CharacterDefinition`(미리보기)을 JSON으로 반환한다.
4. WHEN import가 실패하면 THE 라우트 SHALL 4xx와 오류 사유를 반환한다.
5. THE 라우트 SHALL 과도하게 큰 파일을 거부한다(크기 상한).

### Requirement 4: 클라이언트 업로드 UI

**User Story:** 사용자로서, UI에서 카드 파일을 골라 올리고 결과를 확인하고 싶다.

#### Acceptance Criteria

1. THE 클라이언트 SHALL 캐릭터 카드(JSON/PNG) 파일 선택 UI를 제공한다.
2. WHEN 파일이 선택되면 THE 클라이언트 SHALL import API를 호출하고 변환된 캐릭터 미리보기(이름/성격/핸드아웃 요약)를 보여준다.
3. WHEN import가 실패하면 THE 클라이언트 SHALL 사용자에게 읽기 쉬운 오류를 표시한다.
4. THE UI SHALL 기존 설정/캐릭터 관련 패널 흐름과 일관된 위치에 배치된다.

### Requirement 5: 검증 및 하위 호환

**User Story:** 개발자로서, 이 추가가 기존 동작/빌드/테스트를 깨지 않길 원한다.

#### Acceptance Criteria

1. WHEN 변경 적용 후 THE 타입체크(`pnpm -r run check`) SHALL 통과한다.
2. WHEN 변경 적용 후 THE 전체 서버 테스트 SHALL 통과한다.
3. WHEN 변경 적용 후 THE 클라이언트 빌드 SHALL 통과한다.
4. THE 신규 테스트 SHALL PNG 청크 추출(ccv3/chara/없음/잘못된 시그니처), JSON/PNG import, API 라우트 성공·실패를 커버한다.
5. THE PNG 청크 파서 SHALL 외부 의존성 없이 표준 라이브러리(zlib 등)만으로 구현된다.
