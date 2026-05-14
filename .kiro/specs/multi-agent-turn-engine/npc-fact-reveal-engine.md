# NPC Fact Reveal Engine + 장면 발생 장치 설계

> 이 문서는 기존 설계 문서를 수정하지 않고 별도로 작성된 추가 모듈 설계입니다.

---

## 모듈 정의

```yaml
module_name:
  korean: "NPC 사실 공개 시스템"
  internal: "NpcFactRevealEngine"

related_modules:
  - VisibilityGraph
  - EvidenceChain
  - NpcAgendaScheduler
  - SceneBeatGenerator
  - ScenarioNodeMap
```

## 핵심 원칙

NPC는 고정 대사를 가진 캐릭터가 아니라, **자신이 아는 사실, 숨기는 사실, 잘못 믿는 사실, 공개 조건을 가진 행위자**다.

1. NPC는 사실을 가진다.
2. NPC는 그 사실을 무조건 공개하지 않는다.
3. 플레이어는 선택지를 누르는 것이 아니라 자기 말로 질문한다.
4. 엔진은 질문의 주제, 증거 제시 여부, 말투, 관계 상태를 해석한다.
5. NPC는 자신의 지식 범위, 성격, 목표, 위험도에 따라 답한다.
6. 공개된 정보는 단서, 오해, 관계 변화, 장소 해금, 장면 발생으로 이어진다.

## 이 모듈이 해결하는 문제

- NPC가 너무 쉽게 모든 정보를 말하는 문제
- NPC가 모르는 정보를 아는 것처럼 말하는 문제
- 플레이어가 선택지만 누르는 수동적 흐름
- 단서가 고정 루트로만 공개되는 문제
- 매 플레이마다 같은 대화가 반복되는 문제

---

## NPC Fact Ledger 스키마

```yaml
npc:
  id: "registry_clerk"
  name: "등록소 직원"
  role: "서약의 벽 담당자"

  personality_role:
    traits:
      - 조심스러움
      - 관료적
      - 책임 회피 성향
    speech_style:
      - 직접 말하기보다 규정과 절차를 앞세움
      - 불리한 질문에는 표현을 흐림
    relationships:
      - 왕궁 지시를 부담스러워함
      - 외부인에게 쉽게 신뢰를 주지 않음

  agenda:
    goal: "문제가 커지기 전에 등록소 책임을 피한다"
    constraint: "공문 존재를 완전히 부정할 수는 없다"
    next_action: "질문이 구체적이면 일부만 인정한다"

  fact_ledger:
    known_facts:
      - id: "fact_notice_draft"
        text: "이용 제한 공문 초안이 있다"
        source: "직접 문서를 봄"

      - id: "fact_next_village"
        text: "다음 마을에도 소문이 먼저 갈 수 있다"
        source: "동료에게 들음"

    hidden_facts:
      - id: "fact_palace_request"
        text: "공문 요청자는 왕궁 쪽 인물이다"
        reason_hidden: "말하면 등록소가 정치 문제에 휘말림"

    false_beliefs:
      - id: "belief_user_already_knows"
        text: "나림은 이미 공문 내용을 어느 정도 알고 있을 것이다"
        source: "나림의 질문이 너무 구체적이라고 오해함"

  reveal_policy:
    - topic: "공문"
      reveal: "fact_notice_draft"
      reveal_level: "partial"
      condition:
        requires_question_specificity: 2
      behavior: "초안이라는 표현으로 축소해서 말함"

    - topic: "다음 마을"
      reveal: "fact_next_village"
      reveal_level: "hint"
      condition:
        requires_prior_fact: "fact_notice_draft"
      behavior: "확정이 아니라 소문 가능성으로 말함"

    - topic: "요청자"
      reveal: "fact_palace_request"
      reveal_level: "oblique_hint"
      condition:
        requires_evidence:
          - "왕궁 문양이 찍힌 봉투"
        requires_trust: 40
      behavior: "왕궁이라는 단어를 직접 말하지 않고 '높은 곳'이라고 돌려 말함"

  refusal_policy:
    if_cornered:
      - "절차상 확인해줄 수 없다고 말함"
      - "상급자에게 문의하라고 떠넘김"
      - "대화 기록이 남는 장소에서는 침묵함"

  scene_occurrence_links:
    on_partial_reveal:
      - "다음 마을 노드가 지도에 흐릿하게 표시됨"
    on_contradiction_found:
      - "등록소 직원의 신뢰도 하락"
      - "왕궁 관련 thread 활성화"
```

---

## 자유 질문 처리 흐름

```yaml
free_inquiry_flow:
  1_input:
    - user_message

  2_classify:
    - OOC인지 IC인지 구분
    - 질문인지, 주장인지, 증거 제시인지, 협박/설득인지 구분

  3_extract:
    - target_npc
    - mentioned_topics
    - referenced_evidence
    - tone_or_approach
    - implied_accusation

  4_visibility_check:
    - 해당 NPC가 그 사실을 아는가
    - NPC가 그 증거를 봤는가
    - NPC가 그 주제를 이해할 수 있는가

  5_reveal_policy_check:
    - 공개 조건 충족 여부
    - 신뢰/관계/위험도 확인
    - 공개 수준 결정
      - none
      - hint
      - partial
      - full
      - lie
      - deflect
      - mistaken_answer

  6_generate_response:
    - NPC 성격과 말투에 맞춰 답함
    - 모든 정보를 한 번에 말하지 않음
    - 불리하면 회피, 축소, 침묵, 역질문 가능

  7_state_delta:
    - revealed_facts 업데이트
    - false_beliefs 업데이트
    - relationship shift 기록
    - unlocked_nodes 업데이트
    - next scene occurrence 후보 생성
```

---

## 시스템 위치

```yaml
scenario_pack_runtime:
  core:
    - UserAgencyGuard
    - VisibilityGraph
    - EvidenceChain
    - NpcAgendaScheduler
    - NpcFactRevealEngine
    - SceneBeatGenerator
    - StateDeltaWriter

  ui:
    - ScenarioStateHUD
    - ClueLedgerView
    - NpcDossierView
    - ScenarioNodeMap
```

### 모듈 간 관계

```yaml
VisibilityGraph:
  decides: "NPC가 무엇을 아는가"

EvidenceChain:
  decides: "그 사실의 근거가 무엇인가"

NpcFactRevealEngine:
  decides: "NPC가 지금 그것을 말할 것인가"

NpcAgendaScheduler:
  decides: "NPC가 왜 숨기거나 왜곡하거나 먼저 움직이는가"
```

---

## 장르별 확장

이 구조는 추리물에만 쓰는 게 아니다.

```yaml
mystery:
  facts:
    - 목격 정보
    - 증언
    - 숨겨진 동선
    - 물증

romance_drama:
  facts:
    - 과거 관계
    - 숨긴 약속
    - 말하지 못한 사정
    - 제3자와의 오해

obsession_drama:
  facts:
    - 추적 경로
    - 숨겨진 연락망
    - 누가 어디까지 알고 있는지
    - 통제 수단

court_intrigue:
  facts:
    - 파벌 정보
    - 밀서
    - 소문
    - 공개되면 위험한 혈통/계약

academy:
  facts:
    - 동아리 내부 사정
    - 학생회 기록
    - 교사만 아는 징계 이력
    - 기숙사 소문
```

**이 모듈의 본질은 추리가 아니라 정보 비대칭 기반 장면 발생이다.**

---

## NPC 작성 최소 요구사항

모든 주요 NPC는 최소한 다음을 가진다:

```yaml
minimum_npc_requirements:
  - role
  - goal
  - known_facts
  - hidden_facts
  - false_beliefs
  - reveal_conditions
  - refusal_behavior
  - scene_occurrence_links
```

1. 겉으로 보이는 역할
2. 현재 목표
3. 숨기는 것
4. 잘못 믿는 것
5. 플레이어가 물어야 드러나는 정보
6. 먼저 말하지 않는 이유
7. 공개 조건
8. 거짓말하거나 회피하는 방식
9. 다른 NPC와의 정보 차이
10. 정보가 공개되었을 때 열리는 다음 장면

---

## UI 컴포넌트

```yaml
ui_components:
  clue_ledger:
    label: "현재 단서"
    shows:
      - 유저가 확인한 사실
      - 아직 검증 안 된 소문
      - 모순된 증언

  npc_dossier:
    label: "인물 기록"
    shows:
      - 유저가 아는 NPC 정보
      - 관계 상태
      - 최근 발언
      - 의심 지점

  hypothesis_board:
    label: "가설"
    shows:
      - 사용자가 세운 추론
      - 연결된 단서
      - 반박 증거

  scenario_node_map:
    label: "장면 지도"
    shows:
      - 열린 장소
      - 잠긴 장소
      - 관련 NPC
      - 조사 가능 노드

  author_debug_view:
    label: "작가/제작자용"
    shows:
      - NPC가 실제로 아는 사실
      - 숨겨진 진실
      - 공개 조건
      - 잘못된 믿음
```

### 뷰 분리

```yaml
player_view:
  shows:
    - 유저가 알 수 있는 정보만

author_view:
  shows:
    - 숨겨진 진실
    - 공개 조건
    - NPC별 전체 fact ledger
```

---

## 우리 시스템 최종 해석

```yaml
import_from_reference:
  - NPC는 고정 대사가 아니라 fact + policy로 작동한다
  - NPC는 중요한 사실을 갖지만 무조건 말하지 않는다
  - 플레이어는 선택지가 아니라 자유 질문으로 진행한다
  - 단서는 대화, 장소, NPC, 증거를 오가며 조립된다
  - LLM은 정해진 대사를 읽는 게 아니라 현재 대화에 맞춰 발화한다
  - 재플레이성은 고정 루트가 아니라 fact reveal variation에서 나온다

our_adaptation:
  - fact reveal을 추리뿐 아니라 모든 장르에 적용
  - NPC를 단서 보유자가 아니라 장면 발생 주체로 확장
  - 정보 공개가 곧 StateDelta와 SceneBeatGenerator로 연결됨
  - 유저용 HUD에는 확인된 정보만 표시
  - 제작자용 HUD에는 전체 fact ledger와 reveal condition 표시
```

---

# 장면 발생 장치 (Scene Occurrence Device)

## 핵심 원칙

**시나리오팩의 기본 구동력은 타이머가 아니라 "장면 발생 구조"다.**

타이머는 공항, 추격, 제한 시간 미션, 생존물, 재판 전날, 마감 임박 같은 장르에는 좋지만, 로맨스/집착/군상극/일상 붕괴형 시나리오에는 오히려 게임 UI처럼 느껴질 수 있다.

```yaml
wrong:
  scenario_pack_requires:
    - pressure_timer
    - deadline

correct:
  scenario_pack_requires:
    - scene_occurrence_device

  scene_occurrence_device_types:
    - unresolved_conflict
    - npc_agenda
    - information_asymmetry
    - hidden_truth
    - relationship_friction
    - social_reputation_change
    - offscreen_npc_action
    - opportunity_window
    - evidence_discovery
    - misunderstanding
    - arrival_or_departure
    - ordinary_life_interruption
    - optional_deadline
    - optional_timer
```

---

## Scenario Pack Runtime Contract

모든 시나리오팩은 내부 엔진이 읽을 수 있는 다음 정보를 포함한다.

```yaml
scenario_pack_core:
  required:
    - user_role
    - npc_goals
    - npc_knowledge_scope
    - relationship_graph
    - hidden_truth
    - reveal_conditions
    - scene_occurrence_devices
    - opening_hook
    - long_term_threads
    - replay_variations

  optional:
    - deadline
    - timer
    - visible_countdown
    - time_attack
```

1. 유저 역할과 agency 보호 범위
2. 주요 NPC와 각자의 goal / constraint / next_action
3. NPC별 known / suspected / unknown 정보
4. 관계 그래프와 unresolved conflict
5. 숨겨진 진실과 reveal condition
6. 오프스크린에서 움직일 수 있는 사건 후보
7. 장면 발생 장치
8. 첫 장면 hook
9. 장기 thread
10. 반복 플레이용 변주 요소

---

## 장면 발생 장치 분류

```yaml
scene_occurrence_device:
  relational:
    - unresolved_conflict
    - changed_distance
    - awkward_nonanswer
    - broken_promise
    - debt_or_obligation

  informational:
    - clue
    - rumor
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

  quiet:
    - ordinary_life_texture
    - small_environmental_change
    - mundane_interruption
    - routine_continues

  timed_optional:
    - deadline
    - countdown
    - final_call
    - scheduled_event
```

---

## 모드별 적용

```yaml
thriller_mode:
  - offscreen_pulse
  - information_asymmetry
  - scene_occurrence_mechanism
  - evidence_reveal

romance_mode:
  - relationship_friction
  - misunderstanding
  - opportunity_window
  - ordinary_life_texture

mystery_mode:
  - information_asymmetry
  - contradictory_evidence
  - npc_refusal
  - partial_reveal

slice_of_life_mode:
  - ordinary_life_texture
  - small_environmental_change
  - relationship_friction
  - mundane_interruption
```

---

## 적대 NPC 장면 기능 (타이머 제거 버전)

```yaml
antagonist_scene_function:
  - blocks_access
  - withholds_information
  - distorts_reputation
  - creates_misunderstanding
  - redirects_attention
  - changes_relationship_cost
  - reveals_selective_evidence
  - leaves_before_resolution
  - triggers_third_party_reaction
  - removes_easy_option
  - optional_deadline
```

---

*이 문서는 multi-agent-turn-engine 설계의 추가 모듈로, 기존 문서를 수정하지 않습니다.*


---

# 추가 스키마 정의

## 1. Fact Visibility Model

사실 하나가 "누구에게 보이는가"를 결정하는 모델.

```yaml
fact_visibility_model:
  fact_id: string
  content: string
  
  # 이 사실의 존재를 아는 주체들
  visibility:
    known_by:
      - { agent_id: "npc_a", source: "witnessed", confidence: 1.0 }
      - { agent_id: "npc_b", source: "told_by_npc_a", confidence: 0.7 }
      - { agent_id: "user", source: "deduced", confidence: 0.5 }
    
    # 이 사실을 절대 모르는 주체 (엔진 강제)
    blocked_from:
      - { agent_id: "npc_c", reason: "물리적으로 불가능 — 다른 층에 있었음" }
    
    # 이 사실이 공개되면 자동으로 알게 되는 주체
    auto_propagate_on_reveal:
      - { agent_id: "all_present", condition: "같은 방에 있을 때" }

  # 사실의 성격
  fact_type: "event" | "relationship" | "object" | "location" | "motive" | "alibi"
  
  # 사실의 신뢰도 (false_belief일 수 있음)
  ground_truth: true | false
  
  # 연결된 다른 사실
  linked_facts: string[]  # fact_id 배열
  contradicts: string[]   # 이 사실과 모순되는 fact_id
```

## 2. Reveal Condition Schema

NPC가 사실을 공개하기 위한 조건 정의.

```yaml
reveal_condition_schema:
  fact_id: string
  npc_id: string
  
  # 공개 수준
  reveal_level: "none" | "hint" | "partial" | "full" | "lie" | "deflect" | "mistaken"
  
  # 조건 (AND 결합)
  conditions:
    # 질문 관련
    requires_topic_mention: string[]        # 이 주제가 언급되어야 함
    requires_question_specificity: 0-3      # 0=아무 질문, 3=매우 구체적
    requires_direct_ask: boolean            # 직접 물어야 함 (간접 X)
    
    # 증거 관련
    requires_evidence: string[]             # 이 증거를 제시해야 함
    requires_prior_fact: string[]           # 이 사실이 먼저 공개되어야 함
    requires_contradiction_presented: boolean # 모순을 지적해야 함
    
    # 관계 관련
    requires_trust: number                  # 최소 신뢰도 (0-100)
    requires_relationship: string           # 특정 관계 상태
    requires_alone: boolean                 # 둘만 있어야 함
    
    # 상황 관련
    requires_location: string               # 특정 장소에서만
    requires_time_window: string            # 특정 시간대에만
    requires_mood: string                   # NPC가 특정 감정일 때만
    requires_pressure: number               # 압박 수준 (0-10)
    
  # 공개 시 NPC 행동
  reveal_behavior:
    speech_style: string                    # "축소해서 말함", "돌려 말함" 등
    body_language: string                   # "시선 회피", "손 떨림" 등
    follow_up: string                       # 공개 후 NPC가 하는 행동
    
  # 공개 실패 시
  on_condition_not_met:
    response_type: "deflect" | "refuse" | "lie" | "partial_truth" | "counter_question"
    behavior: string
```

## 3. Scene Occurrence Device Schema

장면을 발생시키는 장치의 정의.

```yaml
scene_occurrence_device_schema:
  id: string
  type: "relational" | "informational" | "npc_driven" | "social" | "logistical" | "quiet" | "timed"
  
  # 발동 조건
  trigger:
    condition_type: "state_threshold" | "fact_revealed" | "turn_count" | "relationship_change" | "npc_agenda" | "random_weighted"
    condition_value: any
    
    # 복합 조건
    requires_all: string[]    # 모든 조건 충족
    requires_any: string[]    # 하나라도 충족
    blocks_if: string[]       # 이 조건이면 발동 안 함
    
  # 발동 시 효과
  effect:
    scene_beat: string                    # 생성할 장면 비트 설명
    state_delta:
      tension: number
      danger: number
      relationship_changes: object[]
      fact_reveals: string[]              # 자동 공개되는 사실
      location_unlock: string[]
      
    npc_reactions:
      - { npc_id: string, reaction: string }
      
    ui_effect:
      background_change: string
      mood_shift: string
      directive: string                   # fade, shake 등
      
  # 메타
  one_shot: boolean                       # 한 번만 발동
  cooldown: number                        # 재발동까지 최소 턴 수
  priority: number                        # 동시 발동 시 우선순위 (높을수록 먼저)
  genre_affinity: string[]                # 이 장치가 잘 맞는 장르
```

## 4. Reveal Budget

한 턴/한 장면에서 공개할 수 있는 정보량 제한.

```yaml
reveal_budget:
  # 턴당 제한
  per_turn:
    max_full_reveals: 1                   # 완전 공개는 턴당 1개
    max_partial_reveals: 2                # 부분 공개는 턴당 2개
    max_hints: 3                          # 힌트는 턴당 3개
    
  # 장면당 제한 (여러 턴에 걸친 하나의 대화)
  per_scene:
    max_full_reveals: 3
    max_critical_reveals: 1               # 게임 전환급 정보는 장면당 1개
    
  # 전체 세션 페이싱
  pacing:
    early_game_bias: "hints_only"         # 초반엔 힌트 위주
    mid_game_bias: "partial_reveals"      # 중반엔 부분 공개
    late_game_bias: "full_reveals"        # 후반엔 완전 공개 허용
    
  # 예산 초과 시
  on_budget_exceeded:
    action: "defer_to_next_turn"          # 다음 턴으로 미룸
    npc_behavior: "NPC가 말을 끊거나 화제를 돌림"
    
  # Director가 예산을 무시할 수 있는 조건
  override_conditions:
    - "tension >= 9"                      # 극도의 긴장 상태
    - "user_presented_critical_evidence"  # 결정적 증거 제시
    - "npc_cornered_with_no_escape"       # NPC가 완전히 궁지에 몰림
```

## 5. Claim Ledger

유저와 NPC가 주장한 것들의 기록. 사실과 별개로 "누가 뭐라고 말했는가"를 추적.

```yaml
claim_ledger:
  claims:
    - id: "claim_001"
      speaker: "npc_jiyeon"
      turn: 5
      content: "나는 11시에 방에 있었다"
      claim_type: "alibi"
      
      # 검증 상태
      verification:
        status: "unverified" | "confirmed" | "contradicted" | "partially_true"
        contradicted_by: string[]         # 모순되는 claim/fact ID
        supported_by: string[]            # 뒷받침하는 claim/fact ID
        
      # 유저가 이 주장을 어떻게 받아들였는지
      user_stance: "accepted" | "doubted" | "challenged" | "unknown"
      
    - id: "claim_002"
      speaker: "user"
      turn: 7
      content: "하진우가 11시에 복도에 있었다고 들었다"
      claim_type: "accusation"
      references: ["claim_001"]           # 이 주장이 참조하는 다른 주장
      
  # 모순 자동 감지
  contradictions:
    - claims: ["claim_001", "claim_003"]
      type: "temporal_impossibility"      # 시간적으로 불가능
      detected_at_turn: 8
      resolved: false
      
  # 유저가 세운 가설
  hypotheses:
    - id: "hyp_001"
      content: "하진우가 범인이다"
      supporting_claims: ["claim_003", "claim_005"]
      contradicting_claims: ["claim_002"]
      confidence: 0.4                     # 엔진이 평가한 논리적 강도
```

## 6. NPC Tiers

NPC를 중요도별로 분류. 리소스 할당과 디테일 수준을 결정.

```yaml
npc_tiers:
  tier_1_principal:
    description: "주요 캐릭터. 독립 에이전트로 구동. 풀 핸드아웃."
    count: 2-5
    features:
      - 독립 API 호출 (캐릭터 에이전트)
      - 풀 fact_ledger
      - 풀 reveal_policy
      - 풀 agenda
      - 관계 그래프 참여
      - 감정 상태 추적
      - 오프스크린 시뮬레이션
    token_budget: 500-1500 per character
    model_assignment: "dedicated slot or default"
    
  tier_2_supporting:
    description: "조연. Director가 대사를 생성. 간소화된 핸드아웃."
    count: 3-8
    features:
      - Director가 대사 방향 결정
      - 간소화된 fact_ledger (known_facts + 1-2 hidden)
      - 단순 reveal_policy
      - 기본 agenda (goal + constraint)
      - 관계 그래프 참여 (제한적)
    token_budget: 200-400 per character
    model_assignment: "default connection"
    
  tier_3_background:
    description: "배경 NPC. 고정 반응 또는 Director 나레이션으로 처리."
    count: unlimited
    features:
      - 고정 대사 풀 또는 Director 생성
      - fact 없음 (정보 제공자가 아님)
      - agenda 없음
      - 분위기/세계관 표현용
    token_budget: 0-50 per character
    model_assignment: "none (hardcoded or director-narrated)"
    
  tier_assignment_rules:
    - "시나리오팩 작성자가 명시적으로 지정"
    - "fact_ledger가 있으면 최소 tier_2"
    - "hidden_facts가 있으면 최소 tier_1"
    - "reveal_policy가 복잡하면 tier_1"
```

## 7. Runtime Generation Contract

엔진이 턴마다 NPC 응답을 생성할 때 지켜야 하는 계약.

```yaml
runtime_generation_contract:
  # 생성 전 체크리스트
  pre_generation:
    - visibility_check: "NPC가 이 정보를 아는가?"
    - reveal_budget_check: "이번 턴에 더 공개할 수 있는가?"
    - agenda_check: "NPC의 현재 목표와 일치하는가?"
    - relationship_check: "현재 관계 상태에서 이 행동이 자연스러운가?"
    - consistency_check: "이전 발언과 모순되지 않는가?"
    
  # 생성 시 주입할 컨텍스트
  context_injection:
    always:
      - character_system_prompt
      - current_agenda
      - knowledge_scope (known_facts only)
      - relationship_to_user
      - recent_conversation (last 12)
    conditional:
      - reveal_instruction (Director가 공개 지시한 경우)
      - pressure_level (유저가 압박 중인 경우)
      - false_belief_active (잘못된 믿음이 관련될 때)
      
  # 생성 후 검증
  post_generation:
    - omniscience_guard: "NPC가 모르는 정보를 말했는가?"
    - reveal_budget_guard: "예산을 초과했는가?"
    - consistency_guard: "이전 주장과 모순되는가?"
    - agency_guard: "유저 행동을 대신 결정했는가?"
    - claim_registration: "새로운 주장을 claim_ledger에 등록"
    - fact_reveal_registration: "공개된 사실을 revealed_facts에 등록"
    
  # 검증 실패 시
  on_violation:
    omniscience: "재생성 (해당 정보 제거 후)"
    budget_exceeded: "NPC가 말을 끊는 형태로 truncate"
    consistency: "재생성 또는 NPC가 정정하는 형태로 수정"
    agency: "유저 행동 부분 제거"
    
  # Director와의 협업
  director_handoff:
    director_provides:
      - which_npc_speaks
      - intent (무슨 의도로 말할지)
      - reveal_permission (이번 턴에 공개 허용된 fact_id)
      - pressure_instruction (압박 수준 지시)
    character_agent_decides:
      - exact_wording (정확한 표현)
      - body_language
      - how_much_to_reveal (허용 범위 내에서)
      - whether_to_lie_or_deflect (agenda 기반)
```

---

# 구현 상태 정리

## ✅ 구현 완료

| 모듈 | 파일 | 상태 |
|------|------|------|
| WorldState 타입 | `shared/src/engine-v2.ts` | ✅ |
| DirectorOutput 스키마 | `engine-v2/schemas.ts` | ✅ |
| Scenario Pack Loader | `engine-v2/scenario-loader.ts` | ✅ |
| Context Builder (Public/Private/Omniscient) | `engine-v2/context-builder.ts` | ✅ |
| State Manager | `engine-v2/state-manager.ts` | ✅ |
| Input Classifier | `engine-v2/input-classifier.ts` | ✅ |
| Output Sanitizer | `engine-v2/output-sanitizer.ts` | ✅ |
| Director Agent | `engine-v2/director.ts` | ✅ |
| Narrator Agent | `engine-v2/narrator.ts` | ✅ |
| Character Agent | `engine-v2/character.ts` | ✅ |
| Turn Pipeline | `engine-v2/pipeline.ts` | ✅ |
| v2 API Layer | `app-v2.ts` | ✅ |
| v2 SQLite Store | `store/sqlite-store-v2.ts` | ✅ |
| Scenario: school-life-anomaly | `scenarios/school-life-anomaly/` | ✅ |
| Scenario: locked-room-mystery | `scenarios/locked-room-mystery/` | ✅ |
| Character Card Importer | `engine-v2/card-importer.ts` | ✅ |
| Scene Summarizer | `engine-v2/summarizer.ts` | ✅ |
| Client: 시나리오 선택 UI | `App.tsx` | ✅ |
| Client: Connection Panel (Director/Narrator 슬롯) | `App.tsx` | ✅ |
| Client: Dev Panel | `App.tsx` | ✅ |
| Client: Input Mode Toggle | `App.tsx` | ✅ |
| Client: Reroll/Undo | `App.tsx` | ✅ |
| Client: Model Search Picker | `App.tsx` | ✅ |
| Design System CSS | `styles.css` | ✅ |

## ❌ 미구현 (설계만 완료)

| 모듈 | 설계 문서 | 우선순위 |
|------|----------|----------|
| **NpcFactRevealEngine** | 이 문서 | 🔴 높음 |
| **Fact Visibility Model** | 이 문서 §1 | 🔴 높음 |
| **Reveal Condition Schema** | 이 문서 §2 | 🔴 높음 |
| **Scene Occurrence Device** | 이 문서 §3 | 🟡 중간 |
| **Reveal Budget** | 이 문서 §4 | 🟡 중간 |
| **Claim Ledger** | 이 문서 §5 | 🟡 중간 |
| **NPC Tiers** | 이 문서 §6 | 🟢 낮음 (구조만) |
| **Runtime Generation Contract** | 이 문서 §7 | 🔴 높음 |
| EvidenceChain | preset-analysis.md | 🟡 중간 |
| VAD Emotion System | preset-analysis.md | 🟢 낮음 |
| Slopfix Post-Processor | preset-analysis.md | 🟢 낮음 |
| Chekhov Tracker (PlantedElement) | preset-analysis.md | 🟡 중간 |
| Off-Screen Simulation | preset-analysis.md | 🟡 중간 |
| Visual Renderer (PHONE/LETTER 등) | preset-analysis.md | 🟢 낮음 |
| Background Image System (AI 생성) | future-background-system.md | 🟢 낮음 |
| Session Summary (장기 세션 압축) | summarizer.ts (기본만) | 🟡 중간 |
| Client: delay/directives 연출 처리 | design.md | 🟡 중간 |
| Client: 배경 전환 렌더링 | design.md | 🟡 중간 |
| Client: 캐릭터 카드 import UI | - | 🟡 중간 |
| v1 엔진 제거 | - | 🟢 낮음 |

---

# 다음 구현 순서 (추천)

## Phase 1: 핵심 정보 시스템 (NPC가 제대로 작동하게)

```
1. Fact Visibility Model → shared 타입 추가
2. Reveal Condition Schema → shared 타입 추가  
3. Runtime Generation Contract → Character Agent에 pre/post 검증 추가
4. NpcFactRevealEngine → 새 모듈 (Director ↔ Character 사이 미들웨어)
5. Reveal Budget → Director output에 reveal_permission 필드 추가
```

## Phase 2: 장면 자동 발생

```
6. Scene Occurrence Device Schema → shared 타입 + 시나리오 팩 확장
7. Claim Ledger → WorldState에 claims 필드 추가
8. Off-Screen Simulation → background_tick() 구현
9. Chekhov Tracker → WorldState에 planted_elements 추가
```

## Phase 3: 클라이언트 완성

```
10. Client: delay/directives 연출 처리
11. Client: 배경 전환 렌더링
12. Client: 캐릭터 카드 import UI
13. Client: Claim Ledger / Clue Ledger 뷰
```

## Phase 4: 품질 향상

```
14. NPC Tiers 구현
15. Slopfix Post-Processor
16. VAD Emotion System
17. Session Summary 고도화
18. v1 엔진 제거
```
