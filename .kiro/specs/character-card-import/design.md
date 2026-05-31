# Design Document — Character Card Import (PNG/JSON)

## Overview

캐릭터 카드 파일(JSON 또는 PNG)을 업로드해 `CharacterDefinition`으로 변환·미리보기하는 import
파이프라인. 서버 변환 경로(`cardToCharacterDefinition`)는 이미 존재하므로, 이번엔 ⓐ PNG tEXt/zTXt
청크 파서, ⓑ JSON/PNG 통합 import 함수, ⓒ import API 라우트, ⓓ 클라이언트 업로드 UI를 추가한다.

설계 원칙:
- **표준 라이브러리만** — PNG 파싱은 외부 의존성 없이 `node:zlib` + 버퍼 처리.
- **기존 변환 재사용** — 카드 JSON → `cardToCharacterDefinition`(이미 구현·테스트됨).
- **JSON 본문 전송** — 파일은 클라이언트에서 base64로 읽어 JSON 본문으로 POST(기존 라우트 패턴과 일관, Hono 멀티파트 회피).

## Architecture

```
client: 파일 선택 → readAsDataURL → base64 추출 → POST /api/v2/character-card/import
server route: { kind: "png"|"json", data: base64|string }
  ├─ png  → extractCardFromPng(bytes) → cardJson
  ├─ json → JSON.parse
  → characterCardSchema.safeParse → cardToCharacterDefinition → CharacterDefinition
  → 200 { character } | 4xx { error }
client: 미리보기(이름/성격/핸드아웃 요약) 또는 오류 표시
```

## Components and Interfaces

### 1. `engine-v2/png-card.ts` (신규) — PNG 청크 파서

```ts
export interface PngCardResult {
  ok: true; json: string;          // decoded card JSON text
} | { ok: false; error: string };

/** Extract embedded chara-card JSON text from PNG bytes. ccv3 preferred, then chara. */
export function extractCardFromPng(bytes: Uint8Array): PngCardResult;
```

구현 개요:
- PNG 시그니처(`89 50 4E 47 0D 0A 1A 0A`) 검증.
- 청크 순회: 길이(4) + 타입(4) + 데이터(len) + CRC(4).
- `tEXt`: 데이터 = keyword + `\0` + text(latin1). `zTXt`: keyword + `\0` + 압축방식(1) + zlib(text).
- keyword가 `ccv3`/`chara`인 청크 수집. `ccv3` 우선.
- 값은 base64 → utf-8 디코드하여 카드 JSON 문자열로 반환.
- 청크 없음/시그니처 불량 → `{ ok:false, error }`.

### 2. `engine-v2/card-importer.ts` 보강 — 통합 import

```ts
export interface ImportedCardResult {
  ok: true; character: CharacterDefinition;
} | { ok: false; error: string };

/** Import from a raw card JSON string (validates + converts). */
export function importCardJson(jsonText: string, fallbackId: string): ImportedCardResult;

/** Import from PNG bytes (extract → importCardJson). */
export function importCardPng(bytes: Uint8Array, fallbackId: string): ImportedCardResult;
```

- `importCardJson`: `JSON.parse` → `characterCardSchema.safeParse` → `cardToCharacterDefinition`.
  실패 시 사유 반환.
- `importCardPng`: `extractCardFromPng` → 성공 시 `importCardJson`.
- 기존 `importCharaCard`(slot 기반, 휴리스틱)는 유지하되, 새 경로는 `characterCardSchema` 기반으로
  더 엄격하게 검증.

### 3. `app-v2/card-routes.ts` (신규) — import 라우트

```ts
export function registerCardRoutes(app: Hono) {
  app.post("/api/v2/character-card/import", async (context) => {
    const body = await context.req.json().catch(() => null);
    const parsed = cardImportBodySchema.safeParse(body); // { kind, data, fileName? }
    if (!parsed.success) return context.json({ error: "Invalid import request" }, 400);

    // size guard
    if (parsed.data.data.length > MAX_CARD_BYTES_B64) return context.json({ error: "파일이 너무 큽니다." }, 413);

    const fallbackId = deriveSlotId(parsed.data.fileName); // e.g. file stem → kebab
    const result = parsed.data.kind === "png"
      ? importCardPng(base64ToBytes(parsed.data.data), fallbackId)
      : importCardJson(parsed.data.data, fallbackId);

    if (!result.ok) return context.json({ error: result.error }, 400);
    return context.json({ character: result.character });
  });
}
```

- `cardImportBodySchema`: `{ kind: "png"|"json", data: string (base64 for png, raw text for json), fileName?: string }`.
- `app-v2.ts`에서 `registerCardRoutes(app)` 등록.
- 크기 상한(예: base64 기준 ~8MB)으로 과대 파일 거부.

### 4. client — `api-v2.ts` import 호출 + UI

```ts
// api-v2.ts
export interface ImportedCharacterPreview { character: CharacterDefinition }
export async function importCharacterCard(file: File): Promise<ImportedCharacterPreview>;
```
- 파일을 `FileReader.readAsDataURL`로 읽어 base64 추출, 확장자/MIME로 `kind` 결정(`.png` → png, else json).
- `POST /api/v2/character-card/import`.

UI: 기존 advisor/persona 설정 흐름(`components/setup/`) 근처에 "캐릭터 카드 불러오기" 버튼 +
파일 input. 성공 시 변환된 캐릭터 요약(이름, shortName, OCEAN 일부, handout secret 유무,
relationships 수) 미리보기. 실패 시 오류 텍스트.
- 이번 스코프는 **미리보기까지**. 세션/팩 주입(슬롯 대체)은 기존 `replaceCharacterSlot`을 쓰는
  후속 작업으로 명시.

## Data Models

- 신규 클라 타입: `ImportedCharacterPreview`.
- 신규 서버 스키마: `cardImportBodySchema`.
- 변환 산출물은 기존 `CharacterDefinition`. shared 타입 변경 없음.

## Error Handling

| 상황 | 처리 |
|------|------|
| PNG 시그니처 불량 | `{ ok:false }` → 400 |
| PNG에 카드 청크 없음 | 400 "카드 데이터를 찾을 수 없습니다" |
| base64/zlib 디코드 실패 | 400 사유 |
| 카드 JSON 파싱/스키마 실패 | 400 사유 |
| 파일 과대 | 413 |
| 잘못된 요청 본문 | 400 |

## Testing Strategy

1. **단위 — png-card**: ccv3 청크 추출, chara 폴백, zTXt 압축 해제, 청크 없음, 시그니처 불량.
   (테스트용 PNG는 코드로 합성 — 시그니처 + IHDR + tEXt/zTXt + IEND 최소 구성.)
2. **단위 — card-importer**: `importCardJson`(유효/스키마실패), `importCardPng`(합성 PNG).
3. **라우트 — card import**: PNG/JSON 성공 200 + character 반환, 잘못된 본문 400, 과대 413.
4. 검증: `pnpm -r run check` + 전체 서버 테스트 + 클라이언트 빌드.

## Correctness Properties

### Property 1: 형식 무관 동일 결과
같은 카드가 JSON으로 오든 PNG에 매립돼 오든 동일한 `CharacterDefinition`으로 변환된다.
**Validates: Requirements 2.1, 2.2, 2.3**

### Property 2: ccv3 우선
PNG에 ccv3와 chara가 모두 있으면 ccv3가 채택된다.
**Validates: Requirements 1.2, 1.3**

### Property 3: 안전한 실패
시그니처 불량·청크 없음·스키마 실패는 throw가 아니라 명확한 오류 결과/4xx로 반환된다.
**Validates: Requirements 1.5, 1.6, 2.4, 3.4**

### Property 4: 엔진 데이터 보존
`extensions.hushline`가 있으면 OCEAN/handout/relationships가 보존되고, 없으면 안전 기본값.
**Validates: Requirements 2.5**

### Property 5: 의존성 없음
PNG 파싱은 외부 패키지 없이 표준 라이브러리만 사용한다.
**Validates: Requirements 5.5**
