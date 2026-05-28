# Case Knowledge Layer + Inquiry Routing 설계

> 추리/조사 장르에서 AI가 사건 정보를 즉흥 생성하는 문제를 차단한다.
> "캐릭터 출력 = 대사만 / 사건 정보 = Director가 정해진 범위에서 허가" 라는 계약을 코드와 데이터로 강제한다.

---

## 1. 지금 잡혀 있는 문제 (요약)

| # | 문제 | 현재 어디까지 처리됐나 |
|---|------|-----------------------|
| 1 | 캐릭터가 나레이션·지문까지 출력 | `output-sanitizer.ts`에서 일부 strip, embedded-narration 감지 시작. 계약 자체는 약함 |
| 2 | 캐릭터가 유저 입력 형식(대사+지문 혼용)을 따라 함 | character.ts 시스템 프롬프트에 "대사만" 지시. 모델 따라 흔들림 |
| 3 | 사건 기본 정보를 모델이 즉흥 생성 | **방어 전무.** Public/observable/testimony 분리 없음 |
| 4 | Director가 질문 성격을 분류하지 않음 | 현재 Director는 speakers/intents만 결정. 질문 type 라우팅 없음 |
| 5 | 캐릭터별 "알고/말할 수 있는 것" 부족 | `FactVisibility` 타입은 있지만 시나리오 팩이 안 채움. handout secret만 있고 testimony seed 없음 |

---

## 2. 도입할 5가지 새 개념

```
Case Knowledge Layer       ← 사건 데이터 (시나리오 팩)
        ↓
Case Inquiry Router        ← Director 직전 단계 (유저 질문 분류)
        ↓
Answer Scope Resolver      ← Director가 "이번 턴 답변 가능 범위" 결정
        ↓
Character Draft            ← 캐릭터 모델은 draft만 생성
        ↓
Boundary Approver          ← 사후 검증 후 메시지 확정
```

각 단계는 기존 파이프라인을 건드리지 않고 **그 사이에 끼워 넣는다.**

---

## 3. Case Knowledge Layer (사건 지식 계층)

### 3.1 파일 위치

```
scenarios/locked-room-mystery/
├── case/
│   ├── briefing.json         ← publicFacts (공개 브리핑)
│   ├── observable.json       ← observableFacts (현장 감각 단서)
│   ├── testimonies.json      ← testimonySeeds (캐릭터별 증언)
│   └── truth.json            ← hiddenTruth (진상/트릭/범인)
```

기존 `characters/*.json`의 `handout.secret` / `knownFacts`는 그대로 두고, 사건 데이터만 별도 파일로 분리한다. 작가가 사건 정보와 캐릭터 정보를 따로 작성/검수할 수 있게 한다.

### 3.2 publicFacts (모두가 아는 기본 정보)

```ts
interface PublicFact {
  id: string;
  category: "victim" | "location" | "time" | "weather" | "common-knowledge";
  text: string;            // "피해자는 이태성, 백화장 회장"
  knownByDefault: true;    // 항상 모든 NPC + 유저
}
```

**예시 (백화장)**:
- `pf-victim-id`: 피해자는 이태성, 백화장 회장
- `pf-time-of-discovery`: 시신 발견 시각 — 오전 7시 경
- `pf-location`: 사건 현장 — 3층 서재
- `pf-weather`: 폭설로 외부 고립
- `pf-residents`: 백화장에 머물던 인원 명단

### 3.3 observableFacts (현장에서 보이는 정보)

```ts
interface ObservableFact {
  id: string;
  location: string;        // "3f-study"
  text: string;            // "데드볼트 안쪽에 미세한 긁힘"
  visibleTo: "all_present" | "investigator_only";
  requiresInvestigation?: string;  // "지문 채취", "데드볼트 분해" 등
}
```

유저가 그 장소에 있어야/조사를 시도해야 노출되는 단서. AI가 임의로 이걸 끌어와 말하면 안 된다.

**예시**:
- `of-deadbolt-scratches`: 데드볼트 안쪽 미세 긁힘 (location: 3f-study, requiresInvestigation: "데드볼트 검사")
- `of-doorframe-fiber`: 문턱 아래 검은 섬유 한 올
- `of-snow-untouched`: 창밖 신설에 발자국 없음

### 3.4 testimonySeeds (캐릭터별 조건부 증언)

```ts
interface TestimonySeed {
  id: string;
  speakerId: string;             // "ha-jinwoo"
  topic: string;                 // "데드볼트", "회계", "어젯밤 동선"
  factId: string;                // 본인이 알고 있는 fact 참조
  conditions: {
    requiresUserToAsk?: boolean;
    requiresEvidencePresented?: string[];
    requiresTrust?: number;
    requiresDirectAccusation?: boolean;
  };
  defaultBehavior: "tell_full" | "tell_partial" | "deflect" | "lie" | "silence";
  whenLying?: string;            // 거짓말 시 어떻게 거짓말하는지
}
```

핵심은 **캐릭터가 어떤 주제에 어디까지 답할 수 있는지를 데이터로 명시**하는 것. 모델이 즉흥 생성하지 않도록.

**예시 (하진우)**:
- `ts-jinwoo-deadbolt`: 데드볼트 → `defaultBehavior: deflect` (절차상 답할 수 없다고 회피)
- `ts-jinwoo-accounting`: 회계 → `defaultBehavior: lie`, `whenLying: "정상이라고 단언"`
- `ts-jinwoo-last-night`: 어젯밤 동선 → `defaultBehavior: tell_partial` (시간만 정확히)

### 3.5 hiddenTruth (진상)

```ts
interface HiddenTruth {
  culprit: string;               // "ha-jinwoo"
  motive: string;
  trick: string;                 // 밀실 트릭 설명
  keyEvidence: string[];         // factId 배열
  revealConditions: {
    requiresFactsCollected: string[];  // 유저가 확보해야 할 단서
    requiresLogicalAccusation: boolean;
  };
}
```

Director만 본다. 유저가 `revealConditions`를 충족하기 전에는 어떤 캐릭터도 진상을 말할 수 없다.

---

## 4. Case Inquiry Router (질문 분류기)

### 4.1 위치

```
pipeline.ts
  → classifyInput        // 기존 (chat/action/whisper)
  → classifyInquiry      // 새로 추가
  → invokeDirector
```

### 4.2 분류 카테고리

```ts
type InquiryType =
  | "small_talk"            // 일반 대화 (사건 데이터 안 건드림)
  | "case_briefing"         // 사건 기본 정보 요청 ("뭐가 일어났어?")
  | "observation_query"     // 현장 단서 ("저기 뭐 있어?", "*책상을 본다*")
  | "testimony_query"       // 특정 인물 증언 요청 ("하진우, 어젯밤 어디 있었어?")
  | "interrogation"         // 추궁 ("회계 감사 들었지?")
  | "accusation"            // 범인 지목 / 추리 시도
  | "meta";                 // OOC, 시스템 질문
```

### 4.3 분류 신호

```ts
interface InquirySignals {
  type: InquiryType;
  targetCharacterIds: string[];     // 호명한 캐릭터
  mentionedTopics: string[];        // 추출된 주제 키워드
  referencedEvidence: string[];     // 언급한 증거(이미 확보된 단서)
  isAccusationStrong: boolean;
}
```

Heuristic 우선 (정규식 + 키워드 매칭). 정확도가 부족하면 작은 LLM 호출로 보강 가능 (옵션). 가장 단순한 형태로 시작해서 실 플레이 데이터로 수정.

### 4.4 출력 활용

Director에게 InquirySignals를 추가 컨텍스트로 넘긴다. Director가 자기가 추측하지 않고 **분류 결과를 받아서** 답변 범위를 정한다.

---

## 5. Answer Scope Resolver (Director 답변 범위 잠금)

### 5.1 Director Output 확장

기존 `DirectorOutput`에 필드 추가:

```ts
interface DirectorOutput {
  // ... 기존 ...
  answerScope: {
    inquiryType: InquiryType;
    allowedFacts: string[];       // 이번 턴 공개 가능한 fact id
    allowedTestimonies: string[]; // 이번 턴 발화 가능한 testimony seed id
    forbiddenTopics: string[];    // 절대 언급 금지 주제 (예: "트릭", "범인")
    revealLevel: Record<string, RevealLevel>;  // testimonyId → 공개 수준
  };
}
```

### 5.2 Director 시스템 프롬프트 강화

```
[Answer Scope 결정 규칙]
1. inquiryType이 small_talk면 allowedFacts/allowedTestimonies 모두 빈 배열로.
2. inquiryType이 case_briefing이면 publicFacts.* 만 허용.
3. observation_query면 유저가 현재 위치에서 볼 수 있는 observableFact만 허용.
4. testimony_query / interrogation이면 targetCharacterIds의 testimonySeed 중 conditions를 만족하는 것만 허용.
5. accusation이면 hiddenTruth.revealConditions를 검증하고, 충족 전이면 forbiddenTopics에 "정답"/"범인"/"트릭" 추가.
6. 어떤 경우에도 hiddenTruth의 culprit/motive/trick은 Character에게 절대 흘리지 않는다.
```

### 5.3 코드 검증 (안전망)

Director가 위 규칙을 어겨도 코드가 잡는다:

```ts
function validateAnswerScope(scope, packCase, worldState): AnswerScope {
  // 1. allowedFacts에서 hiddenTruth.keyEvidence 중 미확보 항목 제거
  // 2. allowedTestimonies에서 conditions 미충족 항목 제거
  // 3. forbiddenTopics에 항상 "범인", "트릭", "정답" 포함
  // 4. revealLevel을 RevealBudget 안으로 클램프
}
```

---

## 6. Character 출력 — Draft → Approve

### 6.1 Character Agent에 답변 범위 전달

`character.ts` 시스템 프롬프트에 **answerScope 발췌**를 주입한다 (전지적 정보는 빼고):

```
[Answer Scope — 이번 턴]
이번 턴 inquiryType: testimony_query
당신이 말할 수 있는 사실:
  - 어젯밤 23:00–01:00 사이 비서실에 있었음 (ts-jinwoo-last-night, partial)
당신이 말하면 안 되는 주제:
  - 회계 감사 (defaultBehavior: lie — "정상이라고 단언")
  - 데드볼트 트릭 (forbidden)
  - 범인의 정체 (forbidden)
```

캐릭터가 자기가 모르는/말하면 안 되는 정보를 우연히 끌어내지 못하게.

### 6.2 출력 계약 강화

기존 `[Actor Contract]` 위에 한 줄 추가:

```
- 이번 턴 [Answer Scope]에 명시되지 않은 사건 정보는 어떤 형태로도 발설하지 않는다.
- 모르는 정보를 추측해서 말하지 않는다. 모르면 "모른다", "확인되지 않았다", 또는 회피한다.
```

### 6.3 Boundary Approver (사후 검증)

`output-sanitizer.ts`를 확장해서 캐릭터 draft 검사:

```ts
interface ApprovalResult {
  approved: boolean;
  cleaned: string;         // 위반 부분 제거 후
  violations: Array<{
    type: "narration_leak" | "foreign_dialogue" | "out_of_scope_fact" | "user_action_mirroring" | "hidden_truth_leak";
    excerpt: string;
  }>;
}

function approveCharacterDraft(draft, character, scope, packCase): ApprovalResult {
  // 1. 기존 체크: 라벨 strip, foreign label truncate, narration prefix
  // 2. 새 체크:
  //    - hiddenTruth의 culprit/trick 키워드 등장 → reject
  //    - allowedFacts / allowedTestimonies에 매핑 안 되는 사건 정보 키워드 등장 → 해당 문장 제거
  //    - 유저 행동 mirroring 감지 → 제거
  // 3. 결과가 비면 fallback 응답
}
```

위반은 DevPanel에 표시한다 (어떤 검증을 통과/실패했는지).

---

## 7. DevPanel 표시

```
[Inquiry Router]
  Type: testimony_query
  Targets: ha-jinwoo
  Topics: 어젯밤, 동선
  Evidence: (없음)

[Answer Scope]
  Allowed Facts: pf-time-of-discovery
  Allowed Testimonies: ts-jinwoo-last-night (partial)
  Forbidden: 회계, 트릭, 범인

[Boundary Check]
  ✓ no narration leak
  ✓ no foreign dialogue
  ✓ no hidden truth leak
  ✗ out_of_scope_fact: "감사가 미뤄졌다는 건..." → removed
```

작가/디버거가 어디서 차단됐는지 한눈에 본다.

---

## 8. 시나리오 팩 보강 (백화장)

이 설계가 의미를 가지려면 데이터가 필수. 1차로 채울 항목:

| 파일 | 항목 수 |
|------|--------|
| `case/briefing.json` (publicFacts) | 6–8개 |
| `case/observable.json` (observableFacts) | 8–12개 (장소별 분산) |
| `case/testimonies.json` (testimonySeeds) | 캐릭터당 6–10개 |
| `case/truth.json` (hiddenTruth) | 1세트 (범인 + 동기 + 트릭 + key evidence 4–6개) |

학교생활 팩(공포)은 **적용 우선순위 낮음** — 추리·조사 동선이 약하므로 case layer는 옵션. 필요 시 동일 구조 재활용.

---

## 9. 단계별 작업 순서

```
Phase A — 데이터 (코드 손 안 댐)
  1. shared 타입 추가: PublicFact, ObservableFact, TestimonySeed, HiddenTruth, AnswerScope, InquirySignals
  2. scenario-loader 확장: case/*.json 로딩 + Zod 검증
  3. 백화장 case 데이터 작성

Phase B — Inquiry Router
  4. classifyInquiry() 함수 (heuristic) + 단위 테스트
  5. pipeline.ts에서 classifyInput 다음에 호출, Director에 InquirySignals 주입

Phase C — Answer Scope
  6. Director 시스템 프롬프트에 Answer Scope 결정 규칙 추가
  7. directorOutputSchema에 answerScope 필드 + 기본값
  8. validateAnswerScope() 코드 검증
  9. Character 시스템 프롬프트에 발췌된 scope 주입

Phase D — Boundary Approver
  10. output-sanitizer.ts → approveCharacterDraft() 확장
  11. hidden_truth_leak / out_of_scope_fact 키워드 매칭
  12. ApprovalResult를 TurnMessage에 첨부 (디버그용)

Phase E — DevPanel
  13. Inquiry/Scope/Boundary 섹션 추가
  14. 위반 항목 색 표시 (warning/danger)

Phase F — 검증
  15. 백화장 시나리오 5턴 플레이 테스트
  16. 잘못된 즉흥 정보 발생률 측정 (수기)
```

A → B → C 까지 가면 즉흥 생성은 거의 잡힌다. D는 안전망, E는 디버깅 편의.

---

## 10. 결정 사항 (확정)

1. **Inquiry Router는 LLM 호출 사용** — Director 호출 직전 단계에서 어차피 분류 정확도가 직접 품질에 영향을 미치므로 heuristic 1차 + LLM 보강을 처음부터 채택. (Director가 답변 범위를 잠그기 전에 잘못 분류되면 나머지가 무너짐.)
2. **공포 시나리오 적용 여부** — 미정. 추리부터 우선 적용. 공포에는 공포 규칙(이벤트 트리거, 분위기 침식)이 따로 있되, fact ledger / inquiry router 자체는 통할 가능성 높음. 추리에서 검증 끝나면 공포 적용 시 어떤 부분이 공통화되는지 다시 본다.
3. **forbiddenTopics는 캐릭터 프롬프트에 명시하지 않음** — 출력 후 Boundary Approver가 사후 검사로 잘라낸다. 모델이 "말 못 하지만 힌트는 줄 수 있다" 식 우회를 시도하지 못하게 한다.
4. **Boundary 위반 시 잘라내기 (재생성 안 함)** — API 비용·응답 시간 우선. 잘려서 부자연스러우면 fallback 응답으로 대체. 품질 부족하면 후속 단계에서 재생성 옵션 추가 검토.

---

## 11. 가장 작게 시작하기 (PoC 1일치)

위 전체 구현 전에 효과 빨리 보고 싶으면:

1. **백화장 testimony seed 5개만 추가** (하진우 위주)
2. **Director 시스템 프롬프트에 "당신이 답할 수 있는 testimony는 [...] 만"** 한 줄 주입 (코드 검증 없이 프롬프트로만)
3. **즉흥 생성률**이 눈에 띄게 줄면 Phase B–D 진행
4. 효과가 미미하면 코드 검증으로 강하게

PoC가 의미 있다고 판단되면 본 설계대로.
