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
- [ ] VisibilityGraph를 파이프라인에 연결
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
