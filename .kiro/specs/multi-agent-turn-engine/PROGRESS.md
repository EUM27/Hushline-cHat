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

---

## 2026-05-30 (세션 — 설계도 재점검 + Case Board UI)

> ⚠️ 이 세션 전까지 PROGRESS.md가 실제 코드보다 한참 뒤처져 있었음.
> 5/23~5/30 사이 `codex/mystery-runtime-layer` 브랜치에서 mystery runtime이 대거 추가됐는데 문서 미반영.
> 상세 재점검은 `replan-2026-05-30.md` 참조.

### 먼저: 실제 코드 상태 재점검 (문서 vs 코드)

PROGRESS.md에 "미구현"으로 적혀 있었지만 **이미 구현·연결 완료**된 것들:

- ✅ 코드베이스 리팩토링 (App.tsx 훅/컴포넌트 분리, styles 9분할, shared 6분할, app-v2 라우트 분리, pipeline 헬퍼 분리) — `2026-05-29-hushline-codebase-refactor.md` plan 거의 완수
- ✅ VisibilityGraph → private handout 연결
- ✅ NpcFactRevealEngine / RuntimeGenerationContract(`runtime-boundary-gate.ts`)
- ✅ DirectorOutput `revealPermissions` 필드 + `buildRevealPermissions`
- ✅ Reveal Budget 차감/리셋 (`reveal-budget-manager.ts` 파이프라인 연결)
- ✅ ClaimLedger / 모순 감지 / 연역 검증 / 지식 전파 / 모호성 존 (mystery runtime 전체 파이프라인 연결)
- ✅ Director Law / State Law + DevPanel 노출
- ✅ 비주얼 테마 3종 (moonlight/dunkshoot/cherryNight)

### 이번 세션에서 한 일: 유저용 Case Board (단서장 + 인물 기록)

서버가 풍부한 case 데이터를 생산하지만 **유저 노출 경로가 없던** Phase 3 항목 완결.

**구현 (전부 빌드/테스트 통과):**
- [x] `shared`: `engine-v2/case-board.ts` — `CaseBoardView` player-safe 타입 (배럴 + index.ts export)
- [x] `shared`: `ClientSessionState`에 `caseBoard?` 필드 추가
- [x] `server`: `app-v2/case-board.ts` — `buildCaseBoard(session, pack)`
  - hidden_truth/solution fact + hiddenTruthVault id 전부 필터링 (핵심 불변식)
  - 단서: briefing/public(턴0) + snapshot에서 실제 공개된 observable fact
  - 진술: claimLedger.claims (이미 boundary gate 통과한 NPC 출력)
  - 모순: `playerNoticed === true`인 것만
  - 의문: ambiguousFacts 중 `playerVisibleStatus !== "unnoticed"`
  - 추리: playerDeductionAttempts + 안전한 verdict
  - 인물 기록: 표면 정보 + 호감도 + 공개 여부 + 진술 수
- [x] `server`: `toClientSession`에 `caseBoard` 부착 (create/get/advance/reroll/undo 전부)
- [x] `server` 테스트: `app-v2/__tests__/case-board.test.ts` 4개
  - 비-미스터리 팩 → 빈 보드 + dossier만
  - 미스터리 팩 → briefing/public 단서 노출
  - **hidden truth 누출 0 검증** (snapshot에 hidden id 강제 주입해도 필터됨, "HIDDEN_TRUTH_REDACTED" 미포함)
  - playerNoticed 모순만 노출
- [x] `client`: `components/CaseBoardPanel.tsx` — 단서장/인물기록 2탭
- [x] `client`: `AppToolStrip`에 사건 기록(NotebookPen) 토글 추가
- [x] `client`: App.tsx 오버레이 연결 (connection/dev 패널과 상호 배타)
- [x] `client`: `styles/case-board.css` + manifest 등록 + vn-panel-layer 공통 규칙에 편입

**검증:**
- `corepack pnpm -r run check` → 통과 (shared/client/server)
- `corepack pnpm --filter @hushline/server test` → 103 pass / 0 fail (신규 4개 포함)
- `corepack pnpm --filter @hushline/client build` → 통과

### 아직 안 한 것 (다음 세션 후보, 우선순위순)

- [x] **SceneBeatGenerator 파이프라인 연결** — 완료 (2026-05-30 세션 2, 아래 참조)
- [ ] **agenda-scheduler 연결** — NPC 자율 행동 (Director 미선택 시 발화). 수렴 방지 효과 검증 필요
- [ ] Chekhov Tracker (planted_elements)
- [ ] 테마 시스템 고도화 — 현재 inline style 3종 → plan의 `data-theme` 전환 + DeviceFrame 분리 + 8종 (UI 리아키텍처라 별도 작업)
- [ ] NPC Tiers / Slopfix / VAD emotion / Background AI 생성 (Phase 4)
- [ ] v1 엔진 제거 (refactor Task 7 — README 경계만 표시, 제거는 유저 승인 대기)

### 참고
- 재점검 상세: `.kiro/specs/multi-agent-turn-engine/replan-2026-05-30.md`

---

## 2026-05-30 (세션 2 — SceneBeatGenerator 연결)

> 새 spec: `.kiro/specs/scene-beat-generator/` (requirements + design + tasks).
> `SceneBeatGenerator` 모듈은 있었지만 파이프라인 미연결 상태였음. 두 공백(팩 데이터 스키마 부재, WorldState 추적 상태/연결 부재)을 메워 정체 방지(anti-stall) 비트 주입을 완결.

**구현 (전부 빌드/테스트 통과):**
- [x] `shared`: `ScenarioPack.sceneDevices?` 필드 + `WorldState.sceneInertiaCounter`/`recentBeatTypes` 추가
- [x] `server`: `createInitialWorldState` 초기화 + state-manager `applySceneBeat` (tension/danger 클램프, inertia 리셋, recentBeatTypes/recentEvents 상한)
- [x] `server`: scene-beat-generator에 `turnHadMeaningfulEvent`/`sanitizeBeat`/`shouldInjectBeat(threshold override)` 추가
- [x] `server`: `schemas.ts` `sceneOccurrenceDeviceSchema` + scenario-loader `scene-devices.json` 옵셔널 로드 + `validateSceneDevices` (factReveal 존재성/누출, npcId/관계 id 검증)
- [x] `server`: `runTurnV2` Step 6.5 비트 주입 (meaningful event 판정 → updateInertia → selectBeat → sanitizeBeat → narrator gate → applySceneBeat → `[장면]` 메시지)
- [x] `data`: `locked-room-mystery/scene-devices.json` 4종 (hidden truth 미사용)
- [x] 테스트: scene-beat 단위 확장 + 로더 6개 + 파이프라인 통합 2개

**hidden-truth 누출 방지 삼중 방어:** 데이터 검증(로더) + `sanitizeBeat`(런타임) + narrator boundary gate(텍스트).

**검증:**
- `corepack pnpm -r run check` → 통과 (shared/client/server)
- 서버 테스트 → 118 pass / 0 fail (103 → +15 신규)

### 다음 세션 후보
- agenda-scheduler 연결 (NPC 자율 발화) — 다음 우선순위

---

## 2026-05-30 (세션 3 — NPC Agenda Scheduler 연결)

> 새 spec: `.kiro/specs/npc-agenda-scheduler/` (requirements + design + tasks).
> `agenda-scheduler` 모듈은 있었지만 미연결 + 두 결함(존재하지 않는 `turnNumber` 참조, `Math.random()` 비결정성)이 있었음. Director가 발화자를 비워둔 턴에 한해 자율성 높고 오래 침묵한 NPC 1명이 자기 안건대로 발화하도록 결정적으로 연결.

**구현 (전부 빌드/테스트 통과):**
- [x] `server/agenda-scheduler`: `Math.random()` 제거 → `isAutonomyEligible` 결정적 게이트, `getCurrentAgenda(currentTurn)` 시그니처 수정(`(state as any).turnNumber` 제거), `selectAutonomousSpeaker` 추가(침묵 기간 → autonomy → 정의 순서)
- [x] `server/pipeline`: Step 5 캐릭터 처리 로직을 `processCharacterResult` 헬퍼로 추출 + Step 5.5 자율 발화 연결 (Director 미선택 & non-silence & 발화 0건일 때만)
- [x] 자율 발화도 기존 `invokeCharacter` + boundary gate + answerScope + handout 동일 적용 (새 정보 경로 아님)
- [x] 테스트: agenda-scheduler 단위 8개 + 파이프라인 회귀 1개 (Director 선택 턴 → 자율 미주입 + 누출 0)

**스코프 한정:** Director가 speaker를 고른 턴은 불변. 자율 발화는 최대 1명. 완전 결정적.

**검증:**
- `corepack pnpm -r run check` → 통과 (shared/client/server)
- 서버 테스트 → 128 pass / 0 fail (118 → +10 신규)

### 다음 세션 후보
- Chekhov Tracker (planted_elements) — 다음 우선순위
- 테마 시스템 고도화 / Phase 4 품질 항목 / v1 엔진 제거(유저 승인 대기)

---

## 2026-05-30 (세션 4 — 휴대폰 디바이스 앱화: 사건파일 상시 + 메신저 조건부)

> 새 spec: `.kiro/specs/phone-device-apps/` (requirements + design + tasks).
> 설계도: `phone-case-file-plan.md`, 후보 정리: `remaining-roadmap-2026-05-30.md`.
> 단서 수첩(사건 기록)을 오른쪽 별도 오버레이에서 떼어, **왼쪽 휴대폰 안의 상시 기본 앱**으로
> 통합. 메신저(단톡방)는 시나리오/이벤트가 만들 때만 등장하는 조건부 앱으로 강등.
> **1단계: 순수 클라이언트(서버/shared 무변경).** 메신저 멀티 대화방(channelId)은 2단계 별도 작업.

**구현 (전부 빌드/테스트 통과):**
- [x] `client/utils/phone-apps.ts` — 앱 가용성/기본 앱 순수 함수 (`uiMode`/`caseBoard`/phone-channel 수 기반)
- [x] `client/utils/phone-apps-storage.ts` — 세션별 unread seen 상태(localStorage, 방어적 파싱)
- [x] `client/components/case-board-sections.tsx` — `CaseClues`/`CaseDossiers` 추출 (CaseBoardPanel과 공유)
- [x] `client/components/PhoneCaseFile.tsx` — 휴대폰 내 사건파일 앱(단서장/인물 2탭, 빈 상태)
- [x] `client/components/PhoneAppDock.tsx` — 가용 앱 전환 dock + unread 배지
- [x] `client/components/PhoneSubScreen.tsx` — 앱 셸 개편(activeApp, 본문/입력바 분기, dock, 강제 전환 금지)
- [x] `client/App.tsx` + `AppToolStrip.tsx` — 오른쪽 CaseBoard 오버레이/토글 제거(휴대폰으로 일원화)
- [x] `styles/case-board.css` — phone-casefile / phone-app-dock 규칙 추가
- [x] 테스트: `phone-apps.test.ts` 11개 (가용성 4 + 기본앱 4 + 시그니처 + 엣지)

**동작:** 밀실극(scene-first+caseKnowledge) → 사건파일 기본·dock 숨김. 학교 단톡(messenger-first)
→ 메신저 기본(기존과 동일). 메신저 메시지가 생기면 dock에 메신저 앱 등장(강제 전환 X, 배지만).

**검증:**
- `corepack pnpm -r run check` → 통과 (shared/client/server)
- 클라이언트 빌드 → 통과 (1736 modules)
- phone-apps 단위 테스트 11 pass / 서버 테스트 132 pass(무영향 확인)

### 다음 세션 후보
- 메신저 멀티 대화방 2단계 (`TurnMessage.channelId` — 1:1 DM/그룹/익명 분리)
- Chekhov Tracker (planted_elements)
- 테마 시스템 고도화 / Phase 4 / v1 엔진 제거(승인 대기)

---

## 2026-05-30 (세션 5 — 단서 점진적 공개)

> 새 spec: `.kiro/specs/case-clue-progressive-reveal/`.
> 단서장이 briefing/public 사실을 처음부터 전량(`knownSinceTurn:0`) 노출하던 걸,
> **빈 상태로 시작해 공개될 때마다 누적**되도록 변경. "수첩이 차오르는" 추리 경험.

**구현 (전부 빌드/테스트 통과):**
- [x] `shared`: `WorldState.revealedCaseFacts?: Record<factId, turn>` (최초 공개 턴 누적 맵)
- [x] `server/case-state.ts`: `recordRevealedCaseFacts` — 신규만 추가, 최초 턴 보존, hidden truth 제외(단조 증가)
- [x] `server/state-manager`: `createInitialWorldState`에 `revealedCaseFacts: {}` 초기화
- [x] `server/pipeline`: Step 6에서 `caseAnswerScope.public/observableFactIds`를 누적 기록
- [x] `server/case-board`: briefing/public 전량 노출 제거 → `revealedCaseFacts` 기반 단서 구성(factIndex로 source/turn 매핑, 오름차순)
- [x] 테스트: `recordRevealedCaseFacts` 2개 + case-board "빈 시작"/"누적 표시"로 갱신 + 누출 0 강화

**핵심:** snapshot(최근 10 한정)이 아니라 영구 누적 맵을 진실의 원천으로 → 단서 유실 없음.
hidden truth는 기록·표시 이중 차단.

**검증:**
- `corepack pnpm -r run check` → 통과 (shared/client/server)
- 서버 테스트 → 135 pass / 0 fail (132 → +3 신규)

### 다음 세션 후보
- 메신저 멀티 대화방 2단계 (`TurnMessage.channelId`)
- Chekhov Tracker / 테마 고도화 / Phase 4 / v1 제거(승인 대기)

---

## 2026-05-30 (세션 6 — 인물 기록도 점진적 공개)

> 세션 5의 단서 점진 공개와 동일 패턴을 인물 기록(dossier)에 확장.
> `buildDossiers`가 `session.characters` 전체를 무조건 나열하던 걸, **만난/진술한 인물만** 누적 표시로 변경.
> spec: `case-clue-progressive-reveal` (확장).

**구현 (전부 빌드/테스트 통과):**
- [x] `shared`: `WorldState.encounteredCharacters?: Record<characterId, turn>` (최초 조우 턴 누적)
- [x] `server/case-state.ts`: `recordEncounteredCharacters` — 신규만 추가, 최초 턴 보존(단조 증가)
- [x] `server/state-manager`: `createInitialWorldState`에 `encounteredCharacters: {}` 초기화
- [x] `server/pipeline`: Step 6에서 발화/등장 speakerIds를 조우 기록
- [x] `server/case-board`: `buildDossiers`를 조우 또는 진술 인물만 필터 + 최초 조우 턴 오름차순 정렬
- [x] 테스트: 인물 빈 시작 / 조우 인물만·정렬 / 진술 인물 포함 (4개 추가·갱신)

**부수 효과:** 휴대폰 앱 가용성이 `dossiers.length > 0`를 쓰는데, 비-미스터리(학교 단톡)도
dossier가 꽉 차서 사건파일 앱이 잘못 떴던 문제가 함께 해결됨(조우 전엔 0개).

**검증:**
- `corepack pnpm -r run check` → 통과 (shared/client/server)
- 서버 테스트 → 137 pass / 0 fail (135 → +2 순증)
- 클라이언트 빌드 → 통과

### 다음 세션 후보
- 메신저 멀티 대화방 2단계 (`TurnMessage.channelId`)
- Chekhov Tracker / 테마 고도화 / Phase 4 / v1 제거(승인 대기)

---

## 2026-05-30 (세션 7 — 적대적 hidden-truth 누출 테스트 하니스)

> 새 spec: `.kiro/specs/hidden-truth-leak-harness/`.
> 핵심 불변식("진실은 절대 안 샌다")을 단위 테스트 점점이가 아니라
> **전 시나리오 × 유도성 입력 코퍼스 × 전 노출 표면** 종단으로 영구 검증하는 하니스 구축.
> 순수 테스트 추가 — 프로덕션 코드 무변경.

**구현 (전부 통과):**
- [x] `__tests__/leak-harness.ts` — `collectLeakSignals`/`loadCasePacks`/`makeHarnessSession`/`collectSurfaces`/`assertNoHiddenTruthLeak`
  - 표면 전수: 메시지 content + caseRuntime.devTrace.allowedFacts + caseBoard 직렬화
  - 단언: hidden id substring / `HIDDEN_TRUTH_REDACTED` 토큰 / 솔루션 원문 없음 + allowedFacts에 hidden id 없음, 위치 식별 메시지
- [x] `__tests__/adversarial-inputs.ts` — 16개 유도성 입력 (direct_truth/indirect/deduction/contradiction/accusation/meta)
- [x] `__tests__/hidden-truth-leak.test.ts` — single-turn + cumulative(누적 세션) 종단 검증
- [x] 자기검증 2개: 인위적 hidden id 주입 / 토큰 주입 시 단언이 실제로 throw(=빈 통과 아님)

**효과:** dry-run 결정적 경로로 외부 API 없이 재현. 시나리오 추가 시 코퍼스만 늘리면 자동 커버.
이후 모든 엔진 변경에서 누출 회귀를 자동으로 잡는 영구 안전망.

**검증:**
- `corepack pnpm -r run check` → 통과 (shared/client/server)
- 서버 테스트 → 143 pass / 0 fail (137 → +6 신규)

### 다음 세션 후보
- 멀티턴 플레이스루 통합 테스트 (단서/인물 누적·앱 전환·beat 주입 종단)
- 두 번째 완성형 시나리오 팩 / CI 워크플로우
- 메신저 멀티 대화방 2단계 / Chekhov / 테마 / v1 제거(승인 대기)

---

## 2026-05-30 (세션 8 — 연애 시나리오 팩 "늦은 봄의 셰어하우스")

> 새 spec: `.kiro/specs/romance-relationship-pack/`.
> 세 번째 장르(연애). caseKnowledge 없는 **순수 관계 드라마**로, 엔진의 관계 동역학
> (relationshipGraph / relationshipToUser / surfacePersonality·fear·behaviorRules /
> relationshipUpdate / scene device relationshipChanges)을 콘텐츠로 스트레스 테스트.
> 데이터-only — 로더/스키마/파이프라인 무수정.

**구현 (전부 통과):**
- [x] `scenarios/shared-house-romance/` — manifest(romance, scene-first, caseKnowledge 없음) + scenario-card + objective
- [x] 캐릭터 3명 **(chara_card_v3 카드 형식으로 작성, 하드코딩 X)**: 서유진(직진/외로움 +2), 한도윤(과묵/완벽주의 0), 강민재(소꿉친구/숨긴 마음 +3) — 전원 남성, 여성 유저 기준
  - 삼각 구도: 유진↔도윤 라이벌, 민재→유진 부러움, 민재 오랜 마음(유저)
  - 엔진 데이터(handout/relationships/OCEAN/autonomy)는 `data.extensions.hushline`에 탑재 → valid chara_card_v3 유지
- [x] **카드→정의 변환 경로**: `cardToCharacterDefinition` + `characterCardSchema` 추가, 로더가 카드/인라인 정의 양쪽 자동 감지(`looksLikeCharacterCard`), 기존 두 팩(인라인 정의)은 그대로 로드
- [x] director.txt(관계 드라마 GM — 감정 beat 우선/호감 점진/relationshipUpdate ±1~2) + narrator.txt
- [x] events/triggers.json + scene-devices.json(relational/social/quiet, relationshipChanges 포함)
- [x] 테스트 8개: 로드/카드변환 검증/관계 무결성/scene device 참조/관계그래프 초기화/dry-run + `cardToCharacterDefinition` 단위 2개

**효과:** 미답이던 "비미스터리 + 관계중심" 조합으로 엔진 관계 동역학 가동 검증.
**시나리오 캐릭터를 카드 형식으로 전환** → ②(PNG/JSON 카드 import)의 서버 절반이 이미 완성됨.
누출 하니스는 caseKnowledge 없어 자연 제외. 기존 두 팩 동작 불변.

**검증:**
- `corepack pnpm -r run check` → 통과 (shared/client/server)
- 서버 테스트 → 164 pass / 0 fail (143 → +21)

### 다음 세션 후보 (사용자 요청 순)
- ② 캐릭터 카드(JSON/PNG) import — PNG tEXt 청크(`ccv3`/`chara` base64) 추출 → 기존 `importCharaCard`, API 라우트 + 클라 업로드 UI (포맷 메모: romance design.md Appendix)
- ③ 페르소나 시스템
- 멀티턴 플레이스루 통합 테스트 / CI / 메신저 멀티 대화방 2단계
