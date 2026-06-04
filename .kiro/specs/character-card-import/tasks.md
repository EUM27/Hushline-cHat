# Implementation Plan — Character Card Import (PNG/JSON)

## Overview

PNG/JSON 카드 업로드 import 파이프라인. PNG 청크 파서 → 통합 import 함수 → API 라우트 →
클라이언트 UI 순. 서버 변환(`cardToCharacterDefinition`)은 기존 것 재사용. 외부 의존성 없음.

## Tasks

- [x] 1. PNG 청크 파서
  - `engine-v2/png-card.ts` — `extractCardFromPng(bytes)`: 시그니처 검증, tEXt/zTXt 순회,
    ccv3 우선·chara 폴백, base64 디코드(`node:zlib` for zTXt)
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 5.5_

- [x] 2. 통합 import 함수
  - `card-importer.ts`에 `importCardJson(text, fallbackId)` / `importCardPng(bytes, fallbackId)`
  - `characterCardSchema` 검증 → `cardToCharacterDefinition`, 실패 시 안전 오류 결과
  - index.ts export
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 3. import API 라우트
  - `app-v2/card-routes.ts` — `POST /api/v2/character-card/import`, `cardImportBodySchema`
  - kind 감지(png/json), 크기 상한, 성공 200 {character} / 실패 4xx
  - `app-v2.ts`에 `registerCardRoutes` 등록
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 4. 클라이언트 업로드 UI
  - `api-v2.ts` `importCharacterCard(file)` (readAsDataURL → base64 → POST)
  - 설정/캐릭터 흐름에 카드 불러오기 버튼 + 파일 input + 미리보기/오류 표시
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 5. 테스트 + 검증
  - png-card 단위(ccv3/chara/zTXt/없음/시그니처 불량) — 합성 PNG 사용
  - card-importer 단위(importCardJson 유효·실패, importCardPng)
  - 라우트(PNG/JSON 200, 잘못된 본문 400, 과대 413)
  - `corepack pnpm -r run check` + 전체 서버 테스트 + 클라이언트 빌드
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1"] },
    { "wave": 2, "tasks": ["2"] },
    { "wave": 3, "tasks": ["3", "4"] },
    { "wave": 4, "tasks": ["5"] }
  ]
}
```

```
1 (PNG 파서) ─> 2 (통합 import) ─┬─> 3 (API 라우트) ─┐
                                 └─> 4 (클라 UI)     ─┴─> 5 (테스트/검증)
```

## Notes

- 외부 의존성 없이 `node:zlib` + 버퍼만으로 PNG 파싱.
- 스코프: 카드 → CharacterDefinition 변환 + 미리보기. 세션/팩 주입(replaceCharacterSlot)은 후속.
- 합성 PNG로 테스트(시그니처+IHDR+tEXt/zTXt+IEND 최소 구성) → 외부 픽스처 불필요.
- 검증: `pnpm -r run check` + 서버 테스트 전체(현재 170 기준) + 클라 빌드.

