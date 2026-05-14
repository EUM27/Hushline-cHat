# Hushline Scenario Runtime — 통합 설계 문서

> 이 문서는 preset-analysis.md와 npc-fact-reveal-engine.md를 병합·통일한 최종 설계 문서다.
> 기존 문서는 수정하지 않는다. 이 문서가 구현의 기준이 된다.

---

## 1. 문서 목적과 범위

**목적:** 시나리오팩 런타임 엔진의 내부 모듈 설계를 확정한다.
**범위:** NPC 정보 처리, 장면 발생, 상태 관리, 검증 계층.
**제품:** 시나리오팩 판매. 프리셋은 내부 연구 자료일 뿐이다.

---

## 2. 용어 통일 (Rename Map)

| 구 용어 | 신 용어 | 비고 |
|---------|---------|------|
| ScenePressureGovernor | **SceneBeatGenerator** | 장면 비트를 생성하는 모듈 |
| pressure | **scene_motion** 또는 **scene_occurrence** | "압력"이 아니라 "장면이 발생하는 힘" |
| quiet_pressure | **quiet_texture** | 조용한 장면도 질감이 있다 |
| pressure_timer | **optional_deadline** | 타이머는 선택 장치 |
| scene_pressure_on_user | **antagonist_scene_function** | 적대 NPC의 장면 기능 |
| pressure_mechanism | **scene_occurrence_mechanism** | 장면 발생 메커니즘 |
| stall_counter | **scene_inertia_counter** | 장면 관성 (정체 감지) |
| Anti-Stall | **scene_motion_injector** | 정체 시 비트 주입 |

> **주석:** "pressure"는 스릴러/공포에서만 적합한 용어. 로맨스/일상에서는 "장면이 발생한다"가 더 정확. 내부적으로 tension 수치는 유지하되, 상위 개념어로 pressure를 쓰지 않는다.

---

## 3. 충돌/중복 분석

### 3.1 중복 정의

| 개념 | preset-analysis 위치 | npc-fact-reveal 위치 | 통일안 |
|------|---------------------|---------------------|--------|
| NPC 지식 범위 | §3.1 Information Firewall | §1 Fact Visibility Model | → **VisibilityGraph** 단일 모듈 |
| NPC 목표/의제 | §3.4 NPC Autonomous Action | agenda 필드 | → **NpcAgendaScheduler** 단일 모듈 |
| 장면 진행 | §3.3 Anti-Stall Engine | Scene Occurrence Device | → **SceneBeatGenerator** 단일 모듈 |
| 상태 추적 | §6 SceneState 구조 | §7 state_delta | → **StateDeltaWriter** 단일 모듈 |

### 3.2 충돌

| 충돌 | preset-analysis 입장 | npc-fact-reveal 입장 | 해결 |
|------|---------------------|---------------------|------|
| 정보 공개 주체 | Director가 결정 | NPC reveal_policy가 결정 | **Director가 허용 범위 지정 → NPC가 범위 내에서 자율 결정** |
| 장면 발생 트리거 | stall_counter 기반 자동 | 조건 기반 명시적 | **둘 다 지원. 자동(inertia) + 명시적(device trigger)** |
| NPC 응답 생성 | Character Agent가 자유 생성 | reveal_policy가 제약 | **reveal_policy를 Character Agent의 pre-generation 제약으로 주입** |

---

## 4. 제품 경계 정의

```yaml
product_boundary:
  we_sell: "시나리오팩 (.storypack)"
  we_dont_sell: "프리셋, 프롬프트, 모델 가중치"
  
  scenario_pack_contains:
    - 세계관 + 규칙
    - NPC 정의 (fact_ledger + reveal_policy + agenda)
    - 장면 발생 장치 정의
    - Director/Narrator 프롬프트
    - 배경 프롬프트 또는 이미지
    - 오프닝 비트
    - 대목표 + 장기 thread
    
  engine_provides:
    - NpcFactRevealEngine
    - SceneBeatGenerator
    - VisibilityGraph
    - EvidenceChain
    - NpcAgendaScheduler
    - StateDeltaWriter
    - Director/Narrator/Character Agent 파이프라인
    - 검증 계층 (Agency/Omniscience/Echo Guard)
    - 후처리 (Slopfix, Visual Renderer)
```

---

## 5. 모듈 아키텍처

```
유저 입력
  ↓
[InputClassifier] → mode + content
  ↓
[Director Agent] → DirectorOutput JSON
  ├── speakers[]
  ├── reveal_permissions{} ← NEW
  ├── scene_beat_instruction
  ├── narrator_instruction
  └── state_delta
  ↓
[SceneBeatGenerator] → 장면 비트 평가/주입
  ↓
[NpcFactRevealEngine] → reveal 가능 여부 판정
  ├── input: user question + reveal_permissions + npc.reveal_policy
  ├── output: reveal_instruction (none/hint/partial/full/lie/deflect)
  └── constraint: reveal_budget
  ↓
[Narrator Agent] → 나레이션 (조건부)
  ↓
[Character Agent] → 대사 생성
  ├── pre: VisibilityGraph.filter()
  ├── pre: NpcFactRevealEngine.instruction
  ├── pre: NpcAgendaScheduler.current_intent
  └── post: RuntimeGenerationContract.validate()
  ↓
[StateDeltaWriter] → 상태 업데이트
  ├── revealed_facts
  ├── claim_ledger
  ├── relationship_changes
  ├── scene_occurrence_triggers
  └── world_state
  ↓
응답 조립 → 클라이언트
```

---

## 6. 모듈별 상세 스펙

### 6.1 VisibilityGraph

**역할:** NPC가 무엇을 아는가.

| | 내용 |
|---|---|
| **Input** | fact_id, agent_id |
| **Output** | `{ knows: boolean, source: string, confidence: number }` |
| **State Update** | fact 공개 시 auto_propagate 실행 |
| **Edge Cases** | NPC가 거짓 정보를 "안다"고 믿는 경우 (false_belief) |
| **Acceptance Criteria** | NPC가 blocked_from에 있는 사실을 절대 참조하지 않음 |

### 6.2 EvidenceChain

**역할:** 그 사실의 근거가 무엇인가.

| | 내용 |
|---|---|
| **Input** | fact_id |
| **Output** | `{ source: string, linked_facts: string[], contradicts: string[], ground_truth: boolean }` |
| **State Update** | 새 증거 발견 시 linked_facts 업데이트, 모순 자동 감지 |
| **Edge Cases** | 순환 참조 (A가 B를 증명, B가 A를 증명) |
| **Acceptance Criteria** | contradicts 배열이 정확히 모순 관계만 포함 |

### 6.3 NpcAgendaScheduler

**역할:** NPC가 왜 숨기거나 왜곡하거나 먼저 움직이는가.

| | 내용 |
|---|---|
| **Input** | npc_id, current_scene_state |
| **Output** | `{ current_goal: string, constraint: string, next_action: string, hide_motivation: string }` |
| **State Update** | 목표 달성/실패 시 agenda 스택 pop, 새 목표 push |
| **Edge Cases** | 목표 충돌 (두 NPC의 agenda가 상호 배타적) |
| **Acceptance Criteria** | NPC 행동이 항상 현재 agenda와 일관됨 |

### 6.4 NpcFactRevealEngine

**역할:** NPC가 지금 그것을 말할 것인가.

| | 내용 |
|---|---|
| **Input** | user_question, npc_id, reveal_permissions (from Director), reveal_budget |
| **Output** | `{ reveal_level: enum, fact_id: string?, behavior: string, body_language: string }` |
| **State Update** | revealed_facts 등록, reveal_budget 차감 |
| **Edge Cases** | Director가 허용했지만 NPC agenda가 거부하는 경우 → agenda 우선 (autonomy 기반) |
| **Acceptance Criteria** | reveal_budget 초과 시 절대 full reveal 안 함. 조건 미충족 시 deflect/refuse |

### 6.5 SceneBeatGenerator

**역할:** 다음 장면 비트를 무엇으로 할 것인가.

| | 내용 |
|---|---|
| **Input** | world_state, scene_inertia_counter, available_devices[], recent_beats[] |
| **Output** | `{ beat_type: string, description: string, involved_npcs: string[], state_delta: object }` |
| **State Update** | scene_inertia_counter 리셋, device.one_shot 마킹 |
| **Edge Cases** | 모든 device가 소진된 경우 → quiet_texture 폴백 |
| **Acceptance Criteria** | 같은 beat_type 3턴 연속 금지. inertia >= 2일 때 반드시 비트 주입 |

### 6.6 StateDeltaWriter

**역할:** 상태 변화를 어떻게 기록하는가.

| | 내용 |
|---|---|
| **Input** | 모든 모듈의 output (reveal, beat, relationship, claim 등) |
| **Output** | 업데이트된 WorldState + ClaimLedger |
| **State Update** | 모든 필드 (tension, danger, facts, claims, relationships, events) |
| **Edge Cases** | 동시에 모순되는 업데이트 (tension +2와 tension -1) → 합산 |
| **Acceptance Criteria** | 모든 수치 클램핑 적용. 업데이트 순서 결정적 (deterministic) |

---

## 7. 시나리오팩 작성자용 YAML 스키마

### 7.1 NPC 정의

```yaml
npc:
  id: string (required)
  name: string (required)
  tier: 1 | 2 | 3 (required)
  
  personality:
    traits: string[] (required)
    speech_style: string[] (required)
    
  agenda:
    goal: string (required)
    constraint: string (required)
    next_action: string (required)
    
  fact_ledger:
    known_facts:
      - id: string
        text: string
        source: string
    hidden_facts:
      - id: string
        text: string
        reason_hidden: string
    false_beliefs:
      - id: string
        text: string
        source: string
        
  reveal_policy:
    - topic: string
      reveal: fact_id
      reveal_level: "none" | "hint" | "partial" | "full" | "lie" | "deflect"
      condition:
        requires_topic_mention?: string[]
        requires_question_specificity?: 0-3
        requires_evidence?: string[]
        requires_prior_fact?: string[]
        requires_trust?: number
        requires_alone?: boolean
        requires_location?: string
      behavior: string
      
  refusal_policy:
    if_cornered: string[]
    
  scene_occurrence_links:
    on_partial_reveal?: string[]
    on_full_reveal?: string[]
    on_contradiction_found?: string[]
```

### 7.2 장면 발생 장치 정의

```yaml
scene_occurrence_device:
  id: string (required)
  type: "relational" | "informational" | "npc_driven" | "social" | "logistical" | "quiet" | "timed" (required)
  
  trigger:
    condition_type: string (required)
    condition_value: any (required)
    requires_all?: string[]
    requires_any?: string[]
    blocks_if?: string[]
    
  effect:
    scene_beat: string (required)
    state_delta?:
      tension?: number
      danger?: number
      fact_reveals?: string[]
      relationship_changes?: object[]
    npc_reactions?: object[]
    
  one_shot: boolean (default: true)
  cooldown?: number
  priority?: number
```

### 7.3 Reveal Budget 정의

```yaml
reveal_budget:
  per_turn:
    max_full_reveals: number (default: 1)
    max_partial_reveals: number (default: 2)
    max_hints: number (default: 3)
  override_conditions?: string[]
```

---

## 8. 장면 발생 장치 분류 체계

```yaml
scene_occurrence_devices:
  relational:
    - unresolved_conflict
    - changed_distance
    - awkward_nonanswer
    - broken_promise
    - debt_or_obligation

  informational:
    - clue_discovery
    - rumor_spread
    - mistaken_inference
    - partial_reveal
    - contradictory_evidence

  npc_driven:
    - npc_initiative
    - npc_refusal
    - npc_departure
    - npc_arrival
    - npc_changes_tactic

  social:
    - reputation_shift
    - witness_reaction
    - gossip_spread
    - public_misreading
    - ally_distancing

  logistical:
    - arrival
    - departure
    - interruption
    - resource_change
    - route_closes
    - opportunity_window

  quiet_texture:  # ← 구 quiet_pressure
    - ordinary_life_detail
    - small_environmental_change
    - mundane_interruption
    - routine_continues

  timed_optional:  # ← 구 pressure_timer. 선택 장치일 뿐.
    - optional_deadline
    - countdown
    - scheduled_event
```

---

## 9. 개발 티켓

| # | 티켓 | Scope | 의존성 | 난이도 |
|---|------|-------|--------|--------|
| 1 | **VisibilityGraph 구현** — fact_visibility_model 타입 + known_by/blocked_from 필터 함수 | shared 타입 + engine-v2 모듈 | 없음 | 중 |
| 2 | **EvidenceChain 구현** — linked_facts, contradicts 자동 감지, ground_truth 검증 | shared 타입 + engine-v2 모듈 | #1 |중 |
| 3 | **NpcAgendaScheduler 구현** — agenda 스택, goal/constraint/next_action 관리 | engine-v2 모듈 | 없음 | 중 |
| 4 | **NpcFactRevealEngine 구현** — reveal_policy 평가, reveal_level 결정, budget 차감 | engine-v2 모듈 | #1, #3 | 높음 |
| 5 | **SceneBeatGenerator 구현** — scene_inertia 감지, device trigger 평가, beat 주입 | engine-v2 모듈 | #1 | 높음 |
| 6 | **StateDeltaWriter 확장** — claim_ledger, revealed_facts, scene_occurrence 기록 | engine-v2/state-manager.ts 확장 | #4, #5 | 중 |
| 7 | **RuntimeGenerationContract 구현** — pre/post 검증 미들웨어 (omniscience/budget/agency) | engine-v2/character.ts 확장 | #1, #4 | 높음 |
| 8 | **DirectorOutput 확장** — reveal_permissions, scene_beat_instruction 필드 추가 | shared 타입 + schemas.ts + director.ts | #4, #5 | 중 |
| 9 | **시나리오팩 스키마 확장** — fact_ledger, reveal_policy, scene_devices를 팩 로더에 추가 | scenario-loader.ts + schemas.ts | #1~#6 | 중 |
| 10 | **ClaimLedger UI + ClueLedger UI** — 유저용 단서장 + 제작자용 전체 뷰 | client App.tsx | #6 | 중 |

### 실행 순서

```
Phase 1 (기반): #1 → #2 → #3 (병렬 가능)
Phase 2 (핵심): #4 → #5 (병렬 가능, #1·#3 완료 후)
Phase 3 (통합): #6 → #7 → #8
Phase 4 (완성): #9 → #10
```

---

## 10. 부록: 프리셋 연구에서 가져온 핵심 규칙

> 프리셋은 판매 대상이 아니다. 내부 연구 자료로만 참조한다.

### 엔진에 반영된 규칙 (출처 → 모듈)

| 규칙 | 출처 프리셋 | 반영 모듈 |
|------|------------|-----------|
| NPC 전지성 금지 | KittyLotus, Sushi, Frankenstein | VisibilityGraph |
| 유저 에이전시 보호 | Lucid Loom, 전체 | RuntimeGenerationContract |
| 장면 정체 시 비트 주입 | KittyLotus, Frankenstein | SceneBeatGenerator |
| NPC 독립 목표 | Sushi, Frankenstein | NpcAgendaScheduler |
| 오프스크린 시뮬레이션 | Sushi, Frankenstein | (미구현 — Phase 2 이후) |
| T+1 Anti-Echo | Lucid Loom, KittyLotus | Output Sanitizer |
| 감정 관성 | Frankenstein VAD, Megumin | (미구현 — Phase 4) |
| 체호프의 총 | Paramnesia | (미구현 — Phase 2 이후) |

### 프롬프트에만 남길 규칙

| 규칙 | 이유 |
|------|------|
| 문체/톤 지시 | 장르별로 다름, 코드화 불가 |
| 감각 묘사 로테이션 | 프롬프트 가이드로 충분 |
| 대화 비율 제어 | 프롬프트 가이드로 충분 |
| POV 제어 | 시나리오팩별 설정 |

### 삭제된 규칙

| 규칙 | 이유 |
|------|------|
| Jailbreak 문구 | 정책 위반 |
| NSFW 강제 | 정책 위반 |
| README 텍스트 | 토큰 낭비 |
| 테마 장식 언어 | 토큰 낭비 |

---

*이 문서는 구현의 기준이 된다. 기존 preset-analysis.md와 npc-fact-reveal-engine.md는 참고 자료로 보존한다.*
