# 진행 기록 — Multi-Agent Turn Engine v2

---

## 2026-05-13 (세션 1)

### 완료된 작업

#### 엔진 코어 (v2)
- [x] shared 타입 정의 (`engine-v2.ts`) — WorldState, DirectorOutput, PublicContext, PrivateHandout, OmniscientContext, ScenarioPack, SessionStateV2, TurnResultV2
- [x] Zod 검증 스키마 (`schemas.ts`)
- [x] Scenario Pack Loader (`scenario-loader.ts`) — 파일 기반 로딩 + 검증
- [x] Context Builder (`context-builder.ts`) — Public/Private/Omniscient 3계층
- [x] State Manager (`state-manager.ts`) — WorldState 전이, 클램핑, 관계 그래프
- [x] Input Classifier (`input-classifier.ts`) — chat/action/whisper 감지 + strip
- [x] Output Sanitizer (`output-sanitizer.ts`) — 라벨 strip, 나레이션 strip, Director JSON 검증
- [x] Director Agent (`director.ts`) — Omniscient Context + 장르 목표 + JSON 출력
- [x] Narrator Agent (`narrator.ts`) — 감각 묘사 전용, 대사 금지
- [x] Character Agent (`character.ts`) — Private Handout + Autonomy + Director Intent
- [x] Turn Pipeline (`pipeline.ts`) — 전체 오케스트레이션
- [x] v2 API Layer (`app-v2.ts`) — /api/v2/sessions, advance, reroll, undo
- [x] v2 SQLite Store (`sqlite-store-v2.ts`)
- [x] Character Card Importer (`card-importer.ts`) — chara_card_v3 파싱
- [x] Scene Summarizer (`summarizer.ts`) — N턴마다 자동 요약

#### 시나리오 팩
- [x] `school-life-anomaly` — 공포 학교 (핸드아웃 + 관계 그래프 + Director 목표)
- [x] `locked-room-mystery` — 밀실 추리 군상극 (4명 용의자 + fact ledger 구조)

#### 클라이언트
- [x] 시나리오 선택 UI
- [x] Connection Panel (Director/Narrator/캐릭터 슬롯)
- [x] Dev Panel (🔧 — WorldState, 핸드아웃, 관계 그래프, 이벤트)
- [x] Input Mode Toggle (chat/action/whisper)
- [x] Reroll/Undo 버튼
- [x] Model Search Picker (직접 입력 + 필터 드롭다운)
- [x] 세션 복원 (localStorage + v2 API)
- [x] 디자인 시스템 CSS (토큰 기반)
- [x] v2 엔드포인트 전환

#### 설계 문서
- [x] requirements.md (17개 요구사항)
- [x] design.md (기술 설계)
- [x] tasks.md (15개 태스크)
- [x] reference-marinara.md (마리나라 엔진 분석)
- [x] preset-analysis.md (9개 프리셋 제약 시스템 분석)
- [x] npc-fact-reveal-engine.md (NPC 사실 공개 + 장면 발생 장치)
- [x] scenario-runtime-design.md (통합 설계 — 용어 통일, 모듈 스펙, 개발 티켓)
- [x] future-background-system.md (배경 이미지 시스템)

#### 타입 + 모듈 뼈대 (구현 시작점)
- [x] FactVisibility, RevealCondition, SceneOccurrenceDevice, RevealBudget, Claim, ClaimLedger 타입 (`engine-v2.ts`)
- [x] VisibilityGraph 뼈대 (`visibility-graph.ts`)
- [x] NpcFactRevealEngine 뼈대 (`fact-reveal-engine.ts`)
- [x] SceneBeatGenerator 뼈대 (`scene-beat-generator.ts`)
- [x] NpcAgendaScheduler 뼈대 (`agenda-scheduler.ts`)

---

### 미구현 (다음 세션에서 계속)

#### Phase 1: 정보 시스템 완성
- [x] VisibilityGraph를 파이프라인/Character private handout에 연결
- [ ] NpcFactRevealEngine을 Character Agent pre-generation에 연결
- [ ] RuntimeGenerationContract (pre/post 검증 미들웨어)
- [ ] DirectorOutput에 reveal_permissions 필드 추가
- [ ] Reveal Budget을 턴마다 차감/리셋

#### Phase 2: 장면 자동 발생
- [ ] SceneBeatGenerator를 파이프라인에 연결
- [ ] EvidenceChain 구현 (linked_facts, contradicts 자동 감지)
- [ ] ClaimLedger를 StateDeltaWriter에 연결
- [ ] Off-Screen Simulation (background_tick)
- [ ] Chekhov Tracker (planted_elements)

#### Phase 3: 클라이언트 완성
- [ ] delay/directives 연출 처리 (fade, shake, silence)
- [ ] 배경 전환 렌더링 (backgroundId → 이미지)
- [ ] 캐릭터 카드 import UI (파일 업로드 → 슬롯 대체)
- [ ] Clue Ledger UI (유저용 단서장)
- [ ] NPC Dossier UI (인물 기록)

#### Phase 4: 품질 향상
- [ ] NPC Tiers (주연/조연/배경 리소스 분배)
- [ ] Slopfix Post-Processor (클리셰 regex 교체)
- [ ] VAD Emotion System (감정 관성)
- [ ] Visual Renderer ([PHONE], [LETTER] HTML)
- [ ] Session Summary 고도화
- [ ] Background AI 생성 (프롬프트 → 이미지)
- [ ] v1 엔진 제거

---

### 알려진 이슈
- CSS 레이아웃: 일부 모드에서 스크롤 안 되는 문제 있었음 (수정했으나 재확인 필요)
- OpenRouter 모델 목록: 로드 실패 시 직접 입력으로 우회 가능
- v2 실제 플레이 테스트: 아직 안 돌려봄 (세션 생성은 되는데 Director API 호출 검증 필요)
- Kimi 모델: 나레이션 침범 습관 있음 (output sanitizer로 방어 중)

---

### 파일 구조 (engine-v2)

```
packages/server/src/engine-v2/
├── index.ts              (public API exports)
├── pipeline.ts           (turn orchestrator)
├── director.ts           (Director agent)
├── narrator.ts           (Narrator agent)
├── character.ts          (Character agent)
├── context-builder.ts    (3-layer context assembly)
├── state-manager.ts      (WorldState transitions)
├── input-classifier.ts   (chat/action/whisper)
├── output-sanitizer.ts   (strip/truncate/validate)
├── scenario-loader.ts    (file-based pack loader)
├── schemas.ts            (Zod validation)
├── card-importer.ts      (chara_card_v3 parser)
├── summarizer.ts         (scene summary generator)
├── visibility-graph.ts   (fact visibility — 뼈대)
├── fact-reveal-engine.ts (reveal policy — 뼈대)
├── scene-beat-generator.ts (scene motion — 뼈대)
└── agenda-scheduler.ts   (NPC agenda — 뼈대)
```


---

## 2026-05-14 (세션 2 — SillyTavern Lab 실험)

### 완료된 작업

#### SillyTavern-HushlineLab Extension (`st-hushline-lab`)
- [x] Extension 기본 구조 생성 (index.js, engine.js, style.css, test)
- [x] 핸드아웃 주입 시스템 — API payload 직전에 현재 발화자 핸드아웃만 주입
- [x] 정보 격리 검증 — `previewApiPayload("강무진", ...)` 시 강무진 핸드아웃만 포함, 다른 캐릭터 핸드아웃 미포함
- [x] chatId 기준 상태 분리 — 대화창 간 Lab 상태 오염 없음
- [x] 리셋 기능 — `HushlineLab.reset()`으로 현재 대화창 상태만 초기화
- [x] 캐릭터 하드코딩 제거 — 현재 그룹 멤버에서 동적으로 handout owner 생성
- [x] ownerAvatar 기반 매칭 (이름은 fallback)
- [x] "Use current group members" 버튼으로 handout 템플릿 자동 생성
- [x] 테스트 통과 (node --test, node --check)

#### 검증된 원칙
- ✅ 구조적 정보 격리: 발화자에게 자기 핸드아웃만 전달됨
- ✅ 엔진은 카드 조합에 중립: 특정 캐릭터/분위기를 선결정하지 않음
- ✅ 대화창 독립성: Lab 상태가 다른 채팅에 영향 안 줌

#### 아직 검증 안 된 것 (다음 실험)
- [ ] Surface transcript 패치 (shared history에서 추론/의도 제거)
- [ ] Human perception prompt 효과 (행동 뺏기 감소 여부)
- [ ] GM tick / Scene beat injector (장면 정체 해소)
- [ ] Output guard (agency violation 감지)
- [ ] 실제 3인 그룹챗 플레이 테스트

### 설계 문서 추가
- [x] `user-perception-layers.md` — 에이전트 간 인식 설계 (컨텍스트 격리 + 사람 인식)
- [x] `sillytavern-lab-plan.md` — 실험 계획 + 방식 비교 + Mini Game Director MVP + 마리나라 참고

### 파일 위치
```
D:\SillyTavern-HushlineLab\public\scripts\extensions\third-party\st-hushline-lab\
├── index.js          (이벤트 후킹, UI, API payload hook)
├── engine.js         (핸드아웃 주입, 상태 관리, context block 생성)
├── style.css         (HUD 스타일)
└── hushline-lab.test.mjs (테스트)
```


### SillyTavern Lab 실험 결과 — 2026-05-14 최종 요약

#### 환경
- Lab 서버: `http://127.0.0.1:8010`
- 세션 분리: `sessionCookieName: session-hushline-lab`
- 테스트: `node --test ...hushline-lab.test.mjs` → 24/24 pass
- 문법 검사: engine.js, index.js 통과

#### 확인된 것 (작동함)

| 항목 | 상태 |
|------|------|
| HUD 대화방별 상태 분리 | ✅ |
| 현재 대화방 리셋 | ✅ |
| HUD 위치 이동 (드래그) | ✅ |
| 핸드아웃/사용자 정보/공개 인물 정보/위반 기록 표시 | ✅ |
| {{user}} / 현재 발화자 / 독립 캐릭터 분리 | ✅ |
| 사용자 행동 전이 감지 (user_action_mirroring) | ✅ |
| API payload에 현재 발화자 핸드아웃만 주입 | ✅ |
| 다른 캐릭터 핸드아웃 미포함 확인 | ✅ |
| 캐릭터 하드코딩 없음 (그룹 멤버에서 동적 생성) | ✅ |
| CSRF 토큰 재발급 후 캐릭터 import 재시도 | ✅ |

#### 발견된 문제

| 문제 | 원인 | ST Lab 해결 | Hushline 해결 |
|------|------|------------|--------------|
| 사용자 행동 이어쓰기 | 캐릭터가 유저 행동을 자기 행동으로 복제 | guard에 mirroring 감지 추가 ✅ | Output Sanitizer 확장 |
| 동시 발언 반응 수렴 | Director 없이 같은 입력 → 비슷한 출력 | **ST 한계 — 해결 불가** | Director characterIntents로 역할 분배 |

#### ST Lab의 한계 (Hushline에서만 해결 가능)

```yaml
st_cannot_solve:
  - Director가 speakers + characterIntents를 먼저 배정하는 구조
  - 동시 발언 시 각 캐릭터에게 다른 기능 배정
  - 두 번째 캐릭터가 첫 번째 출력을 보고 반응하는 순차 구조
  - reveal_policy 기반 정보 공개 제어
  - scene_beat 자동 주입 (Director 판단 기반)
```

#### 내일 테스트 계획 (2026-05-15)

```yaml
baseline:
  - Extension off 순정 ST 3-5턴 확인

surface_transcript:
  - Extension on, API isolation off → surface transcript만 테스트

handout_isolation:
  - API isolation on → 핸드아웃 분리 효과 비교

public_info:
  - 공개 인물 정보에 나이/관계 넣고 유지 확인
  - 청소년-성인 정보 일관성

addressing:
  - "아저씨" 같은 호칭이 올바른 캐릭터에 귀속되는지

mirroring:
  - 유저 행동 후 캐릭터 이어쓰기 guard 재확인

convergence_samples:
  - 동시 호출 반응 수렴 샘플 2-3개 추가 수집
  - Hushline Director 설계 검증 자료로 보존
```

#### Hushline 정식 엔진 이식 항목

```yaml
from_st_lab_to_hushline:
  surface_transcript:
    st: "shared history에서 메타/시스템 정보 제거"
    hushline: "buildCharacterChatContext()에서 최종 출력만 전달"
    
  actor_identity:
    st: "{{user}} / 발화자 / 독립 캐릭터 라벨 분리"
    hushline: "PublicChatEntry.label 구조"
    
  user_action_mirroring:
    st: "regex guard로 감지"
    hushline: "Output Sanitizer에 echo_detector 추가"
    
  director_characterIntents:
    st: "불가능 (Director 레이어 없음)"
    hushline: "Director Agent → characterIntents{} → 각 Character Agent에 주입"
```


### 2026-05-14 테스트 결과 요약

#### 환경
- Lab 서버: `http://127.0.0.1:8010`
- 세션 분리: `sessionCookieName: session-hushline-lab`
- 테스트: 24/24 pass, 문법 검사 통과
- 상세 기록: `D:\SillyTavern-HushlineLab\...\st-hushline-lab\NOTES.md`

#### 확인된 것
- HUD: 대화방별 상태 분리, 리셋, 위치 이동, 핸드아웃/인물정보/위반기록 표시
- 행위자 분리: {{user}} / 현재 발화자 / 독립 캐릭터 구분 개선됨
- user_action_mirroring guard 추가 (유저 행동 이어쓰기 감지)
- API payload isolation: 현재 발화자 핸드아웃만 주입 확인

#### 확인된 한계 (ST Lab 구조적 한계)
- 동시 호출 시 A/B 반응 수렴 → Director 없는 환경의 본질적 한계
- 이건 ST 실패가 아니라 "Director 없으면 수렴한다"는 설계 검증

---

### ST Lab 실험의 핵심 확인 대상 (정리)

```yaml
core_experiment_focus:
  1_surface_transcript:
    question: "다른 캐릭터의 hidden/intent/reasoning이 현재 캐릭터에게 새지 않는가"
    validates: "컨텍스트 격리"
    
  2_actor_identity:
    question: "{{user}} / 현재 발화자 / 다른 캐릭터를 모델이 구분하는가"
    validates: "행위자 분리"
    
  3_handout_isolation:
    question: "현재 캐릭터가 자기 핸드아웃만 알고 반응하는가"
    validates: "정보 비대칭"
    
  4_narrator_character_boundary:
    question: "캐릭터가 나레이션/장면 진행까지 하려는 문제가 줄어드는가"
    validates: "Hushline에 Director/Narrator 계층이 필요하다는 근거"
    
  5_violation_detection:
    question: "타 캐릭터 대사 대리, 유저 행동 전이, 전지적 폭로를 guard가 잡는가"
    validates: "디버깅 가능한 신호 제공"

not_core_for_st_lab:
  - 완벽한 장면 디렉팅
  - 동시 호출 캐릭터별 intent 배정
  - Director speakers[]/characterIntents{} 구현
  - 제품 수준 UX
```

---

### 내일(2026-05-15) 테스트 계획

```yaml
test_plan:
  1: "Extension off — 순정 ST baseline 3-5턴 확인"
  2: "Extension on, API isolation off — surface transcript만 테스트"
  3: "같은 장면에서 API isolation on — 핸드아웃 분리 효과 비교"
  4: "공개 인물 정보에 나이/관계 넣고 유지되는지 확인"
  5: "유저가 '아저씨'로 부르면 강무진에게 귀속되는지 확인"
  6: "유저 행동 후 캐릭터 이어쓰기 guard 확인"
  7: "동시 호출 반응 수렴 샘플 2-3개 추가 수집 (Hushline Director 검증 자료)"
```

---

### Hushline 정식 엔진 이식 항목

```yaml
from_st_lab_to_hushline:
  surface_transcript:
    st_lab: "shared history에서 hidden/system/intent 제거"
    hushline: "buildCharacterChatContext()에서 최종 출력만 전달"
    status: "v2에 이미 구현됨. ST Lab에서 효과 검증 중."
    
  actor_identity:
    st_lab: "{{user}} / 발화자 / 독립 캐릭터 라벨 분리"
    hushline: "context-builder.ts의 라벨링 로직"
    status: "v2에 이미 구현됨."
    
  user_action_mirroring:
    st_lab: "guard에서 직전 유저 발화와 비교해 감지"
    hushline: "output-sanitizer.ts에 추가 필요"
    status: "❌ 미구현. ST Lab에서 패턴 확인 후 이식."
    
  director_characterIntents:
    st_lab: "ST에서는 구현 불가 (Director 레이어 없음)"
    hushline: "director.ts → characterIntents{} → character.ts"
    status: "v2에 이미 설계됨. 동시 발언 수렴 문제의 해답."
    
  sequential_character_calls:
    st_lab: "확인된 문제: 병렬 호출 시 수렴"
    hushline: "pipeline.ts에서 2명일 때 순차 호출로 변경 권장"
    status: "❌ 현재 Promise.all 병렬. 순차로 변경 검토."
```

---

### 2026-05-23 작업 기록 — A/C 정리

#### 완료
- [x] A: 현재 작업 상태 검증 후 기준 커밋 생성
  - `corepack pnpm -r run check`
  - `corepack pnpm --filter @hushline/client build`
  - `corepack pnpm --filter @hushline/server test`
- [x] C: VisibilityGraph 결과를 Character Agent private handout 경로에 연결
  - `buildPrivateHandout()`가 `worldState.factVisibility`를 읽고 `getAgentKnowledge()`로 현재 character에게 보이는 fact만 합친다.
  - 기존 `characterStates[charId].knownFacts`는 유지하고 visible fact content를 dedupe해서 병합한다.
  - `blockedFrom` fact는 handout에 들어가지 않도록 테스트 추가.

#### 자동 검증
- server test: 25 pass / 0 fail
- 신규 테스트: `packages/server/src/engine-v2/__tests__/visibility-context.test.ts`

#### 내일 수동 테스트 기준
- 상세 체크리스트: `docs/manual-test-checklist.md`
- 특히 확인할 것:
  1. v2 세션 생성/advance/reroll/undo 정상 동작
  2. provider/slot별 모델 라우팅과 default fallback
  3. Director/Narrator/Character 역할 분리
  4. VisibilityGraph 기반 정보 격리: 특정 캐릭터에게만 보이는 fact가 다른 캐릭터 대사에 새지 않는지
  5. CSS 스크롤/패널 레이아웃 회귀

#### 남은 Phase 1
- [ ] NpcFactRevealEngine을 Character Agent pre-generation에 연결
- [ ] DirectorOutput reveal permissions 설계/검증
- [ ] Reveal budget 차감/리셋
