# 설계안 (rev2) — 이식 가능한 단일 파일 시나리오 팩 (Portable Pack)

> 목표: 디렉터리 흩뿌림 팩을 **단일 파일(JSON) 팩**으로 import/export 하고, 업로드 팩으로
> 세션을 실행·재개할 수 있게 한다. 이후 **기본 템플릿 3종**으로 생성 → 불러오기 → 구동을 검증.
>
> rev2: 리뷰 피드백 반영. 핵심 변경 3가지 —
> (1) `embeddedPack`을 SessionState에 직접 넣지 않고 `packSource` + 서버측 스냅샷 참조,
> (2) PortablePack 외부 계약을 Runtime `ScenarioPack`과 분리(+ NormalizedPackDraft 중간 계약),
> (3) 업로드를 validate → import → create session 3단계로 분리.

---

## 0. 현재 구조 (확인 결과)

- 팩은 이미 디렉터리 단위로 디스크 로드(`loadScenarioPack(packDir)`): manifest / scenario-card /
  characters(카드 or inline) / prompts(txt) / objectives / events / case-knowledge / scene-devices
  를 읽어 Zod + 교차참조 검증 후 `ScenarioPack` 조립.
- `/api/v2/scenarios`, `/:packId`, `/sessions`, `/advance` 전부 `scenariosDir` 기준 디스크 로드.
- 세션 생성: `scenarioPackId`로 팩 로드 → handout 구성. advance: `scenarioPackId`로 재로드 → runTurnV2.
- `reconstructPack(session)`은 빈 껍데기(prompts "", genre 항상 horror) — 현재 advance는 디스크
  재로드로 우회하므로 가려져 있음.

### 공백
1. 단일 파일 팩 포맷 없음 → "파일 하나 불러오기" 불가.
2. 업로드 실행 경로 없음 → 디스크 선배치 팩만 실행.
3. 세션 자립성 결함 → 디스크에 없는 업로드 팩은 재개 불가.
4. 기본 템플릿 없음.

---

## 1. 계층 분리 — 외부 계약 vs 런타임 객체

가장 중요한 원칙. **PortablePack(외부 파일 계약)** 과 **ScenarioPack(런타임 내부 객체)** 을 분리한다.
런타임 필드가 바뀌어도 외부 포맷은 `formatVersion`으로만 마이그레이션.

```
PortablePackV1 (외부 파일 계약, 안정)
        │  parse + normalize
        ▼
NormalizedPackDraft (중간 계약 — 디렉터리/단일파일 공통 수렴점)
        │  validate (단일 검증 파이프라인)
        ▼
ScenarioPack (런타임 내부 객체)
```

두 입력 경로가 **같은 중간 계약(NormalizedPackDraft)** 으로 수렴 → 검증 일원화.

```
Directory files → DirectoryRawPack → NormalizedPackDraft → validate → ScenarioPack
Portable JSON   → PortablePackV1   → NormalizedPackDraft → validate → ScenarioPack
```

---

## 2. PortablePackV1 포맷 (외부 계약)

```ts
interface PortablePackV1 {
  format: "hushline.portablePack";
  formatVersion: 1;

  manifest: ScenarioManifest;
  scenarioCard: ScenarioCardV2;
  characters: CharacterDefinition[];   // 카드/ inline 모두 허용(파싱 시 정규화)
  prompts: { director: string; narrator: string };
  objectives: { main: ObjectiveDefinition };

  events?: { triggers: EventTrigger[] };
  caseKnowledge?: CaseKnowledge;
  sceneDevices?: SceneOccurrenceDevice[];

  // v1: 참조만. binary/base64 금지.
  assets?: { backgrounds?: PortableAssetRef[]; sprites?: PortableAssetRef[] };

  metadata: PortablePackMeta;          // 필수
}

interface PortableAssetRef {
  id: string;
  kind: "background" | "sprite";
  mode: "builtin" | "external_url";    // v1: builtin만 런타임 사용, external_url은 검증만
  value: string;
}

interface PortablePackMeta {
  contentHash: string;                 // sha256(canonical JSON, metadata 제외) — 필수
  exportedAt: string;
  sourcePackId?: string;
  generator?: { name: string; version: string };
}
```

변환 함수(명시적):
```ts
portableToScenarioPack(p: PortablePackV1): ScenarioPack       // = normalize→validate→compile
scenarioPackToPortable(pack: ScenarioPack): PortablePackV1
directoryToPortable(packDir: string): PortablePackV1
portableToDirectory(p: PortablePackV1, targetDir: string): void
```

---

## 3. 검증 파이프라인 — 함수 분리 (이름 명확화)

```ts
parsePortablePackJson(raw: unknown): PortablePackV1            // 구조 파싱(formatVersion 확인)
normalizePortablePack(p: PortablePackV1): NormalizedPackDraft  // 카드→정의, prompts 흡수 등
normalizeDirectoryPack(dir: string): NormalizedPackDraft       // 디스크 조각 → 동일 draft
validateNormalizedPack(d: NormalizedPackDraft): ScenarioValidationReport  // Zod + 교차참조 + 누출
compileScenarioPack(d: NormalizedPackDraft): ScenarioPack      // 런타임 객체 조립
```

- 기존 `loadScenarioPack(dir)` 공개 시그니처/동작은 **유지**하되 내부를
  `normalizeDirectoryPack → validateNormalizedPack → compileScenarioPack` 경유로 리팩터(회귀 테스트로 보증).
- 디렉터리 로더의 현 검증들(openingBeat ref / caseKnowledge / sceneDevices / hidden-truth 누출)을
  `validateNormalizedPack` 안으로 이전 → **단일 검증 경로**.

---

## 4. contentHash (필수)

```ts
type PackContentHash = string; // "sha256:..."
contentHash = sha256(stableStringify(portableWithoutMetadata))
```

- `stableStringify` = key 정렬 canonical JSON(공백/순서 무관).
- 용도: 같은 id 다른 내용 충돌 감지, 세션 시작 팩 버전 추적, 업로드 중복 저장 방지, round-trip 비교.
- 내부 식별자: `packId@sha256:abcd…` (예: `locked-room-mystery@sha256:...`).

---

## 5. 세션 자립화 — packSource (클라 누출 차단)

**embeddedPack 본문을 SessionState에 직접 넣지 않는다.** session은 presenter로 클라에 내려가므로
hiddenTruth/handout secret/solutionGraph 누출 위험. 대신 참조만 둔다.

```ts
interface SessionStateV2 {
  scenarioPackId: string;     // 기존 유지
  packSource: PackSource;     // 추가
  // … 기존
}

type PackSource =
  | { kind: "disk"; packId: string; contentHash?: string }
  | { kind: "uploaded"; packId: string; contentHash: string; portablePackId: string };
```

서버 저장소에 PortablePack 본문을 **별도 테이블**로 둔다:
```
sessions         (id, state_json, …)               ← 기존
portable_packs   (id, content_hash, pack_json, created_at)   ← 신규
```

advance/reroll의 팩 해석 순서:
1. `options.scenarioPack` 직접 주입 → 사용 (테스트/내부)
2. `packSource.kind === "uploaded"` → store에서 `portablePackId` 로드 → `compileScenarioPack`
3. `packSource.kind === "disk"` → `scenariosDir`에서 디스크 로드
4. 실패 → 세션 진행 불가, 명확한 오류 (reconstructPack은 advance에서 사용 금지)

---

## 6. 클라이언트 노출 — PackMeta만

ClientSessionState에는 팩 공개 메타데이터만. hiddenTruth/handout secret/solutionGraph 전문은 절대 금지.

```ts
interface ClientPackMeta {
  id: string;
  title: string;
  subtitle: string;
  genre: string;
  version: string;
  contentHash: string;
  sourceKind: "disk" | "uploaded";
}
```

presenter 테스트로 "ClientSessionState 직렬화에 hiddenTruth/secret/solutionGraph 미포함"을 단언.

---

## 7. 업로드 라우트 — 3단계 분리

```
POST /api/v2/portable-packs/validate   // 구조+참조+누출 검증, 저장 안 함, 결과만
POST /api/v2/portable-packs/import     // 검증 통과분을 store 저장, portablePackId 반환
GET  /api/v2/portable-packs/:id        // 메타/요약 조회
POST /api/v2/sessions                   // packSource(uploaded|disk)로 세션 생성
```

세션 생성 본문 예:
```json
{ "packSource": { "kind": "uploaded", "portablePackId": "uploaded_abc123" }, "persona": { "name": "나림" } }
```

- validate는 캐릭터 카드 import와 동일한 "업로드→검증→미리보기" UX.
- 크기 상한 + 신뢰 경계(검증 통과분만 import/실행).

---

## 8. 기본 템플릿 3종

한 장르 과적합 방지를 위해 3개:
- `template-minimal-chat` — caseKnowledge 없음, 최소 RP 팩 → 로더 기본 검증.
- `template-minimal-mystery` — caseKnowledge 있음, hiddenTruth REDACTED, testimonySeed 1~2 → 추리 런타임 검증.
- `template-minimal-scene-device` — sceneDevices 중심 → 장면 발생 장치 검증.

각각 디렉터리 + 번들된 단일 파일 둘 다 제공. "생성 → 불러오기 → dry-run 턴 구동" 종단 테스트의 픽스처.

---

## 9. Round-trip 기준 — Semantic Equivalence

byte-for-byte 아님. directory → portable → directory(또는 → ScenarioPack) 시 의미 동일:
- manifest / scenarioCard / characters / prompts / objectives / eventTriggers / caseKnowledge /
  sceneDevices 값 동일
- validateNormalizedPack 결과 동일
- canonical hash 동일 (`sha256(stableStringify(withoutMetadata))`)

JSON key 순서/공백은 달라도 됨.

---

## 10. Assets — v1은 참조만

- `mode: "builtin"`만 런타임 사용. `external_url`은 검증만 하고 런타임 보류. base64/binary 금지.
- 현재 구조와 정합: scenarioCard의 `backgroundIds`/`initialBackgroundId`를 안정 보존하는 게 먼저.
  PortablePack v1은 배경 파일을 들지 않고 background id만 보존.

---

## 11. reconstructPack — fallback 전용으로 격하

제거가 아니라 역할 제한: 테스트/긴급 fallback 전용, advance 경로에서 사용 금지(§5의 4단계 오류 처리).

---

## Portable Pack Invariants

1. Runtime은 검증되지 않은 팩을 실행하지 않는다.
2. Directory pack과 PortablePack은 동일한 validation pipeline(validateNormalizedPack)을 통과한다.
3. PortablePack은 hiddenTruth를 publicFacts / observableFacts / testimonySeeds.canSay / openingBeats에 노출하지 않는다.
4. 업로드 팩은 contentHash로 식별한다(`id@sha256:…`).
5. 세션은 시작 당시 사용한 팩 버전을 재현할 수 있어야 한다(packSource + 스냅샷).
6. ClientSessionState에는 hiddenTruth / handout secret / solutionGraph 전문이 포함되지 않는다.
7. Round-trip은 byte-for-byte가 아니라 semantic equivalence 기준이다.
8. 단일 JSON import는 runtime 실행 전 validate / import 단계를 거친다.
9. PortablePack v1은 binary asset을 포함하지 않는다(참조만).
10. schema migration은 formatVersion 기준으로만 수행한다.

---

## 최종 설계 요약 (rev2)

1. PortablePackV1 포맷 정의 — Runtime ScenarioPack과 분리된 외부 파일 계약.
2. 디렉터리/단일 JSON 모두 NormalizedPackDraft로 수렴.
3. 검증은 validateNormalizedPack 하나로 통일.
4. import된 PortablePack은 서버 store에 contentHash와 함께 저장.
5. SessionStateV2는 본문 대신 packSource로 스냅샷 참조.
6. ClientSessionState에는 PackMeta만 노출.
7. round-trip은 semantic equivalence 기준 테스트.
8. v1은 binary asset 미포함, builtin asset id만 허용.
9. 기본 템플릿 3종(minimal-chat / minimal-mystery / minimal-scene-device).
10. 업로드는 validate → import → create session 순서.

---

## 작업 우선순위

| # | 작업 | 비고 |
|---|------|------|
| 1 | `PortablePackV1` / `PortableAssetRef` / `PortablePackMeta` 타입 정의 | 외부 계약 |
| 2 | `NormalizedPackDraft` 중간 계약 도입 | 수렴점 |
| 3 | 디렉터리 로더를 normalize→validate→compile 경유로 리팩터 | 동작 불변 회귀 |
| 4 | portable JSON 로더(parse→normalize) 추가 | 단일 파일 입력 |
| 5 | `contentHash`(stableStringify+sha256) 추가 | 식별/충돌/round-trip |
| 6 | validate / import API 분리 | 신뢰 경계 |
| 7 | `packSource` 도입 + presenter 누출 차단 테스트 | 클라 안전 |
| 8 | 서버 store `portable_packs` 저장 + advance 팩 해석 순서 | 세션 자립 |
| 9 | 기본 템플릿 3종 | 생성 출발점 |
| 10 | round-trip + dry-run simulate 종단 테스트 | 무손실/구동 검증 |

권장 순서: 1→2→3→4→5 (포맷·로더·해시) → 9 (템플릿) → 10 (round-trip) → 6→7→8 (업로드·자립·클라안전) → UI(후속).

---

## 검증 기준

- `pnpm -r run check` + 서버 테스트 전체 통과.
- round-trip(기존 3팩 + 템플릿 3종): semantic equivalence + canonical hash 일치.
- presenter 누출 테스트: ClientSessionState에 hiddenTruth/secret/solutionGraph 미포함.
- 업로드 팩 dry-run 세션: validate→import→create→advance 1턴 정상 + 누출 0.
