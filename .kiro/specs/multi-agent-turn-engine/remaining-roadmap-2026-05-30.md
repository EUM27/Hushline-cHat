# 남은 작업 설계도 — 2026-05-30 (안 한 것만)

> 실제 코드(`codex/mystery-runtime-layer`) 기준으로 **아직 구현·연결되지 않은 것만** 모은
> 설계 블루프린트. 끝난 항목은 제외했다. 각 항목은 별도 spec으로 분리해 진행하는 것을
> 전제로, 목적 / 현재 상태 / 설계 방향 / 연결 지점 / 의존성 / 불변식을 정리한다.
>
> 이미 끝난 것: VisibilityGraph, NpcFactRevealEngine, RevealBudget, ClaimLedger,
> 모순/연역/지식전파/모호성, Director/State Law, Case Board UI, **SceneBeatGenerator(세션2)**,
> **NPC Agenda Scheduler(세션3)**. 상세는 `PROGRESS.md` / `replan-2026-05-30.md`.

---

## 0. 우선순위 요약

| # | 항목 | 영역 | 난이도 | 의존 | 비고 |
|---|------|------|--------|------|------|
| 1 | Chekhov Tracker (planted_elements) | server engine | 중 | SceneBeat(완) | 복선 심기/회수 추적 |
| 2 | Off-Screen Simulation (background_tick) | server engine | 중 | Agenda(완) | 비등장 NPC 상태 진행 |
| 3 | 테마 시스템 고도화 | client UI | 대 | 없음 | UI 리아키텍처(DeviceFrame 분리) |
| 4 | Visual Renderer (PHONE/LETTER) | client+shared | 중 | 테마(권장) | HTML 안전 렌더 |
| 5 | VAD Emotion System | server engine | 중 | 없음 | 감정 관성 |
| 6 | Slopfix Post-Processor | server engine | 소 | 없음 | 클리셰 후처리 |
| 7 | NPC Tiers | server engine | 중 | 없음 | 리소스 분배 |
| 8 | Background AI 생성 | server+client | 대 | 없음 | 프롬프트→이미지 |
| 9 | v1 엔진 제거 | 전역 | 중 | 전부 | **유저 승인 대기** |

권장 순서: 1 → 2 (엔진 깊이) → 3 → 4 (UI 한 묶음) → 5·6·7 (품질) → 8 → 9.

---

## 1. Chekhov Tracker (planted_elements)

### 목적
장면에 의도적으로 "심어둔 요소(복선)"를 추적하고, 적절한 시점에 회수(fire)되도록 만든다.
미회수 복선이 쌓이면 SceneBeat/Director가 회수를 유도한다. (출처: Paramnesia Chekhov Plant/Fired)

### 현재 상태
- ❌ 모듈 없음. `preset-analysis.md`에 `PlantedElement` 타입 초안만 존재.
- SceneBeatGenerator가 연결돼 있어(세션2) "정체 시 비트 주입" 훅에 자연스럽게 얹을 수 있음.

### 설계 방향
- `shared`: `PlantedElement` 타입 확정.
  ```ts
  interface PlantedElement {
    id: string;
    description: string;
    plantedAtTurn: number;
    expectedPayoff?: string;
    fired: boolean;
    firedAtTurn?: number;
    sourceFactId?: FactId;     // case fact와 연결 가능(옵션)
  }
  ```
- `WorldState.plantedElements?: PlantedElement[]` 추가.
- `server/chekhov-tracker.ts`:
  - `detectPlant(...)` — NPC 발화/나레이션/scene beat에서 복선 후보를 (결정적 규칙으로) 식별·등록.
  - `selectReadyToFire(worldState, currentTurn)` — 일정 턴 이상 미회수 + 조건 충족 복선을 결정적으로 선택.
- 시나리오 팩이 사전 정의한 복선도 지원(`pack.plantedElements` 시드).

### 연결 지점
- pipeline Step 6.5(SceneBeat) 직전/직후: ready 복선이 있으면 Director context 또는 scene beat
  description에 "회수 힌트"를 주입. SceneBeat 모듈의 `selectBeat` 입력에 ready 복선을 우선순위로 얹는 방안.
- Step 6 상태 갱신에서 신규 복선 등록 + fired 마킹.

### 의존성 / 불변식
- 의존: SceneBeatGenerator(완료).
- 불변식: 복선 회수가 **hidden truth를 노출하면 안 됨**. `sourceFactId`가 hidden truth면 등록 거부(로더/런타임 이중 가드, SceneBeat와 동일 패턴).
- 결정성: 무작위 금지(dry-run 테스트 재현성).

---

## 2. Off-Screen Simulation (background_tick)

### 목적
장면에 등장하지 않은 NPC도 시간이 흐르면 목표를 향해 움직인다. 유저가 자리를 비운 사이
세계가 "살아 있었다"는 감각을 만든다.

### 현재 상태
- ❌ 모듈 없음. 옛 PROGRESS Phase 2 항목.
- Agenda Scheduler(세션3)가 `getCurrentAgenda` / `isAutonomyEligible`을 제공하므로 재사용 가능.

### 설계 방향
- `server/offscreen-sim.ts`:
  - `tickOffscreenAgendas(worldState, characters, currentTurn)` — 비등장(최근 발화 없음 + 현재 위치 아님)
    NPC들의 agenda를 N턴마다 한 스텝 진행. 결과는 **공개 가능한 작은 흔적**으로만 표면화
    (직접 정보 노출 아님 — "누군가 서재 쪽을 다녀간 흔적" 수준).
  - 결정적 스케줄: turn % interval == 0 같은 규칙 기반.
- `WorldState`에 NPC별 off-screen 진행 메모(가벼운 카운터/메모) 추가.

### 연결 지점
- pipeline Step 6 상태 갱신 단계에서 주기적 호출.
- 흔적은 scene beat 또는 narrator bridge로만 노출(Chekhov와 결합 가능).

### 의존성 / 불변식
- 의존: Agenda Scheduler(완료), 가능하면 Chekhov(#1) 이후.
- 불변식: off-screen 결과도 정보 격리/hidden truth 가드를 통과. 유저가 못 본 사건의 "내용"이
  아니라 "흔적/정황"만 표면화.

---

## 3. 테마 시스템 고도화

### 목적
현재 inline style 3종(moonlight/dunkshoot/cherryNight)을 `theme-concepts-plan.md`의
`data-theme` 토큰 아키텍처 + DeviceFrame 분리 구조로 전환하고 컨셉 8종으로 확장.

### 현재 상태
- △ `packages/client/src/constants/theme-presets.ts` + `utils/theme.ts`에 3종 inline 방식.
- plan(`theme-concepts-plan.md`)의 `[data-theme]` CSS override / DeviceFrame 컴포넌트 분리 미구현.

### 설계 방향 (plan 요약)
- **컴포넌트 분리(전제)**: `ScenarioShell > DeviceFrame > {Phone/Laptop/Terminal/Bulletin}Screen`
  + 공통(`ChatTimeline / MessageBubble / TypingIndicator / RevealDelay / Composer`).
- **ThemeProvider**: `<html data-theme="...">` 토글 React 훅.
- **토큰 override**: `themes/<name>.css`에서 base design-token을 override. Stage/Mood 토큰은
  의미 불변(미세 보정만).
- **컨셉 8종**: 파란 달밤(1순위) → 투명 메신저(기본값) → VHS 호러 / 검은 성당 → 나머지 4종.
- 시나리오 팩 manifest에 `recommendedTheme` / `fallbackTheme`(강제 아님, 유저 변경 가능).

### 연결 지점
- client 전역 셸 리아키텍처(가장 큰 작업). 엔진/데이터는 불변.
- manifest 스키마에 테마 추천 필드 추가(옵션).

### 의존성 / 미정 사항
- 의존: 없음(독립). 단 UI 대규모 리팩터라 별도 세션 권장.
- 미정(plan §7): DeviceFrame 지정 주체(팩 vs 테마), 사운드 무드 포함 여부,
  라이트/다크와 테마의 축 관계, mood 색상 테마별 분기 여부.

---

## 4. Visual Renderer (PHONE / LETTER / 문서 HTML)

### 목적
메시지 안의 특수 블록(`[PHONE]`, `[LETTER]`, 문서/단서 카드)을 안전한 HTML로 렌더.
(출처: Paramnesia 시각 렌더러 20종)

### 현재 상태
- ❌ 미구현. Phase 3/4 항목.

### 설계 방향
- `shared`: 렌더 블록 마커 스펙 정의(화이트리스트 태그·속성만).
- `client`: 마커 파서 + 안전 렌더러(XSS 방지 — sanitize, 허용 태그 한정).
- 테마(#3)의 DeviceFrame과 시각적으로 맞물리므로 테마 이후가 자연스러움.

### 의존성 / 불변식
- 의존: 테마 시스템(#3) 권장 선행.
- 불변식: **신뢰 불가 콘텐츠로 취급** — 모델 출력 HTML은 반드시 sanitize. 스크립트/이벤트 핸들러/
  외부 리소스 차단.

---

## 5. VAD Emotion System

### 목적
NPC 감정을 Valence/Arousal/Dominance 3축으로 추적해 감정 관성(급변 방지)을 부여.
(출처: Frankenstein VAD)

### 현재 상태
- ❌ 미구현. Phase 4.

### 설계 방향
- `shared`: `CharacterStateV2`에 `emotion?: { valence; arousal; dominance }` 추가.
- `server/vad-emotion.ts`: 턴 결과(발화/사건)로 VAD를 점진 갱신(관성 계수). character prompt에
  현재 감정 톤을 주입.
- 결정적 갱신 규칙(무작위 금지).

### 의존성 / 불변식
- 의존: 없음.
- 불변식: 감정은 표현 톤에만 영향, 정보 공개 범위(answerScope)는 불변.

---

## 6. Slopfix Post-Processor

### 목적
클리셰·상투구("심장이 두근거렸다" 류)를 후처리로 감지·완화. (출처: 프리셋 anti-slop)

### 현재 상태
- ❌ 미구현. Phase 4. 난이도 가장 낮음.

### 설계 방향
- `server/slopfix.ts`: 클리셰 regex/사전 기반 치환·약화. boundary gate 이후, 메시지 확정 직전 단계.
- 데이터(클리셰 사전)는 외부 JSON으로 분리해 확장 가능.

### 의존성 / 불변식
- 의존: 없음.
- 불변식: 의미 보존(치환이 문장 사실관계를 바꾸면 안 됨). 과교정 방지(보수적 매칭).

---

## 7. NPC Tiers

### 목적
주연/조연/배경 NPC를 구분해 모델 호출 비용·컨텍스트 분량을 차등 배분.

### 현재 상태
- ❌ 미구현. Phase 4.

### 설계 방향
- `shared`: `CharacterDefinition.tier?: "lead" | "support" | "background"`.
- pipeline/character: tier별 컨텍스트 깊이·연결(connection) 라우팅·발화 빈도 차등.
- Director speaker 선택과 Agenda 자율 발화에 tier 가중치 반영(결정적).

### 의존성 / 불변식
- 의존: 없음(단 Agenda Scheduler 선택 로직과 맞물림).
- 불변식: tier가 정보 격리/경계를 약화하면 안 됨(비용/분량만 조절).

---

## 8. Background AI 생성

### 목적
장면 배경 이미지를 프롬프트→이미지로 동적 생성(현재는 사전 제작 PNG 세트).

### 현재 상태
- ❌ 미구현. Phase 4. 외부 이미지 provider 연동 필요라 난이도 큼.
- 참고: `future-background-system.md`.

### 설계 방향
- 이미지 provider 어댑터(기존 텍스트 provider 어댑터 구조 차용).
- 배경 태그(`backgroundId`)가 없을 때 fallback으로 생성, 캐시.
- 비용·지연 큼 → 옵션 기능 + 캐싱 우선.

### 의존성 / 불변식 / 주의
- 의존: 없음.
- **주의**: 외부 네트워크 호출 + 비용 발생. 유저 명시 동의·키 설정 전제. 기본 비활성 권장.

---

## 9. v1 엔진 제거

### 목적
레거시 v1 엔진(`packages/server/src/engine/`)을 제거해 코드베이스 단일화.

### 현재 상태
- △ README/경계 주석만 표시, 실제 제거 보류. refactor plan Task 7.
- v1 `turn-engine.ts` 등은 별도 WorldState 형태(`relationships` 등)를 쓰며 v2와 분리돼 있음.

### 설계 방향
- v1 의존 지점(API 라우트, 테스트, 클라 호환 필드) 전수 조사 → v2로 일원화 → v1 디렉터리 제거.
- 단계적: (a) v1 진입점 차단 → (b) 참조 제거 → (c) 파일 삭제 → (d) 테스트 정리.

### 의존성 / 불변식 / 주의
- 의존: 위 모든 기능이 v2에서 안정화된 후.
- **주의**: 파괴적/광범위 변경. 반드시 **유저 명시 승인 후** 진행. 제거 전 전체 테스트 그린 + 백업 브랜치.

---

## 10. 공통 원칙 (모든 항목 적용)

1. **정보 격리 불변식 최우선** — 어떤 신규 기능도 hidden truth 노출 경로가 되면 안 됨.
   데이터 검증 + 런타임 가드 이중 방어(SceneBeat/Case Board에서 검증된 패턴).
2. **결정성** — 엔진 로직은 무작위 금지(dry-run 테스트 재현성). 필요한 변동은 상태 기반 규칙으로.
3. **Additive** — 기존 시나리오/세션/테스트를 깨지 않는 증분. 옵션 필드는 미설정 시 기존 동작.
4. **spec 분리** — 각 항목은 독립 spec(requirements→design→tasks)으로 진행. 본 문서는 인덱스.
5. **검증 기준** — `corepack pnpm -r run check` 통과 + 서버 테스트 전체 그린 + 신규 테스트.
