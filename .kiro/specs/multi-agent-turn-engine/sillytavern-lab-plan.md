# SillyTavern Lab — 실험 엔진 계획

> 날짜: 2026-05-13
> 목적: Hushline 규칙을 SillyTavern 실험판에서 검증
> 설치 위치: `D:\SillyTavern-HushlineLab` (순정 별도 클론)

---

## 1. 실험 목표

Hushline 엔진의 핵심 규칙 3가지가 실제로 작동하는지 검증:

1. **컨텍스트 격리** — 캐릭터가 상대의 내부 추론/의도를 못 보는가
2. **행동 주권 보호** — 캐릭터가 상대 대사/행동을 대신 안 쓰는가
3. **Collective mode 억제** — 즉시 이해/즉시 협조가 안 일어나는가

---

## 2. SillyTavern 기본 구조 이해

### 그룹챗 모드

| 모드 | 동작 | 우리 실험에 적합? |
|------|------|-----------------|
| **Swap character cards** | 매 생성마다 활성 화자 카드만 컨텍스트에 포함 | ✅ 기본으로 사용 |
| **Join character cards** | 모든 멤버의 description/personality 합침 | ❌ 성격 병합 위험 |

### 이미 격리되는 것 (Swap 모드 기준)

- 다른 캐릭터의 시스템 프롬프트
- 다른 캐릭터의 personality/description
- 다른 캐릭터의 depth prompt

### 여전히 공유되는 것 (패치 대상)

- **Shared chat history** — 모든 멤버의 발화가 전체 히스토리로 공유됨
- 히스토리 안의 메타 지시, 시스템성 문구
- Narrator 내부 단정
- 과도한 summary
- Hidden note / system note 잔여물

---

## 3. 실험 방식 비교 (최종 평가)

| # | 방식 | 정보격리 | 행동보호 | 협업억제 | 난이도 | 총점 |
|---|------|---------|---------|---------|--------|------|
| 1 | Extension만 | 70% | 20% | 50% | 낮 | **55%** |
| 2 | 프롬프트+Regex | 30% | 65% | 40% | 매우낮 | **45%** |
| 3 | 코어 패치 | 90% | 40% | 75% | 중 | **78%** |
| 4 | 통합 (1+2+3) | 95% | 80% | 85% | 중상 | **87%** |
| 5 | API 프록시 | 95% | 85% | 90% | 높 | **90%** |

### 보정 사항

- 방식 3의 진짜 가치는 "카드 제거"가 아님 (Swap 모드에서 이미 됨)
- 진짜 패치 대상은 **shared chat history를 surface transcript로 재작성**하는 것
- 방식 5는 사실상 Hushline 엔진 구현이라 "SillyTavern 실험"이라기보다 "Hushline 프로토타입"

### 결론: 방식 4 채택

---

## 4. 실행 계획 (Phase별)

### Phase 0: Group Settings Baseline

```yaml
action:
  - Swap character cards 모드 강제
  - Join character cards 사용 금지
  - 캐릭터명 prefix 유지 확인
  - 포트: 8010 (기존 SillyTavern과 분리)
난이도: 설정만
```

### Phase 1: Surface Transcript Patch (코어)

```yaml
target: "그룹챗 shared history 재작성"
action:
  - 다른 캐릭터는 최종 발화 텍스트만 전달
  - "캐릭터명: 대사" 형태로 명확히 라벨링
  - narrator는 관찰 가능한 문장만 전달
  - hidden/system/depth/intent성 정보 제거
  - 다른 캐릭터의 reasoning/CoT 제거
  
not_target:
  - "다른 캐릭터 시스템 프롬프트 제거" (Swap 모드에서 이미 됨)
  
patch_location: "그룹챗 히스토리 조립 함수"
난이도: 중
```

### Phase 2: Human Perception Prompt

```yaml
action:
  - 각 캐릭터 카드에 최소 규칙 삽입
  - 또는 그룹챗 system note로 전역 삽입

prompt_content: |
  상대는 실제 사람이다. 너와 함께 이야기를 쓰는 공동 작가가 아니다.
  상대가 다음에 뭘 할지, 뭘 말할지, 뭘 느낄지는 네가 결정하지 않는다.
  너는 네 반응만 쓴다.

난이도: 매우 낮
```

### Phase 3: Agency Guard Extension

```yaml
action:
  - 타 캐릭터 라벨 생성 감지 (regex)
  - 유저 라벨 생성 감지
  - 내면 단정 감지 ("~라고 느꼈다", "~라고 생각했다")
  - violation 로그 표시 (콘솔 또는 UI)
  - 필요 시 자동 재생성 트리거

implementation: "third-party extension"
난이도: 중
```

### Phase 4: Scene Beat Injector (선택)

```yaml
action:
  - 무난한 선택 반복 감지 (3턴 연속 비슷한 패턴)
  - 사건/오해/방해/정보 조각 주입
  - 장르별 beat 선택
  - system note 또는 narrator 삽입으로 구현

implementation: "extension 또는 lorebook trigger"
난이도: 중상
```

---

## 5. 검증 지표

```yaml
success_metrics:
  information_isolation:
    - "캐릭터 A가 캐릭터 B의 비밀을 알아맞히지 않는가"
    - "캐릭터가 모르는 정보를 자연스럽게 아는 척 하지 않는가"
    
  agency_protection:
    - "다른 캐릭터 대사를 대신 쓰지 않는가"
    - "유저 행동/감정을 단정하지 않는가"
    
  anti_collective:
    - "서로 바로 협조하지 않는가"
    - "정보 공유에 이유/비용이 생기는가"
    - "갈등이 생기되 억지로 느껴지지 않는가"
    
  natural_behavior:
    - "오해가 자연스럽게 발생하는가"
    - "캐릭터가 자기 agenda를 유지하는가"
    - "유저가 무난하게 굴어도 장면이 움직이는가"
```

---

## 6. 테스트 시나리오

```yaml
test_scenario:
  name: "밀실 추리 3인 그룹챗"
  characters:
    - name: "신지연"
      knows: "금고 절도 계획"
      hides: "서재 앞에서 소리를 들었다"
      agenda: "의심을 다른 사람에게 돌린다"
      
    - name: "하진우"  
      knows: "횡령 사실"
      hides: "회계 감사 예정이었다"
      agenda: "최소한의 정보만 제공한다"
      
    - name: "서유라"
      knows: "내연 관계, 유언장 수정 예정"
      hides: "이태성이 죽기를 바랐다"
      agenda: "연약한 약혼녀 연기를 유지한다"
      
  test_inputs:
    - "누가 마지막으로 이태성을 봤어?"
    - "11시에 다들 어디 있었어?"
    - "서재 열쇠는 누가 갖고 있었어?"
    
  expected_behavior:
    - 각자 자기 알리바이만 말함
    - 상대 비밀을 모름
    - 서로 의심하거나 회피함
    - 한 번에 다 말하지 않음
    - 유저 행동을 대신 쓰지 않음
```

---

## 7. Hushline 정식 엔진과의 관계

```yaml
sillytavern_lab:
  role: "규칙 검증 실험장"
  validates:
    - 컨텍스트 격리 효과
    - human perception prompt 효과
    - agency guard regex 패턴
    - scene beat 주입 타이밍
    
hushline_engine:
  role: "정식 구조화 엔진"
  implements:
    - VisibilityGraph (코드 레벨 격리)
    - NpcFactRevealEngine (reveal policy)
    - Director/Narrator/Character 분리 호출
    - StateDeltaWriter (자동 상태 추적)
    - UserAgencyGuard (코드 레벨 검증)
    
migration_path:
  "SillyTavern Lab에서 먹히는 규칙 → Hushline 정식 엔진으로 이식"
```

---

## 8. 주의사항

```yaml
do:
  - 실험판은 별도 폴더에 순정 클론
  - 포트 분리 (기존 8000, 실험 8010)
  - 코어 수정은 최소한으로
  - 먹히는 규칙만 기록하고 Hushline으로 이식

dont:
  - 기존 SillyTavern 건드리기
  - 코어 전체 개조 (업데이트 불가능해짐)
  - Extension에 핵심 로직 넣기 (불안정)
  - 프롬프트만으로 모든 걸 해결하려 하기
```

---

*이 문서는 SillyTavern Lab 실험의 계획서이자, 실험 결과를 Hushline 정식 엔진에 반영할 때의 기준이 된다.*


---

# 보완: ST-Hushline Game Mode Shim 설계

> 마리나라 게임모드의 "코드"가 아니라 "상태 주도 감각"만 빌린다.

---

## 9. 마리나라에서 빌릴 것 / 빌리지 않을 것

```yaml
safe_import:
  - scene state (장소/시간/분위기/모드)
  - GM tick (무난한 선택 반복 시 사건 발생)
  - HUD snapshot (현재 상태 요약 표시)
  - directives (fade, silence, background switch)

do_not_import:
  - full quest system (퀘스트창/진행바)
  - combat-first structure (전투 시스템)
  - stat-heavy gameplay (스탯 중심 진행)
  - 모든 장르에 timer/countdown 강제
  - 중립 GM 감각 (우리 Director는 적대적)
  - 25개 agent 플러그인 구조 (우리는 파이프라인)
```

### 왜 통째로 안 가져오는가

마리나라는 "Conversation / Roleplay / Game"을 한 앱에 통합한 범용 프론트엔드.
Hushline은 "정보 비대칭 + 캐릭터 자율성 + 장면 발생"에 집중하는 드라마 엔진.

마리나라를 너무 강하게 가져오면:
- 퀘스트/스탯/HUD가 전면화됨
- 캐릭터 관계보다 진행 목표가 우선됨
- 모든 장면이 "게임 이벤트"처럼 느껴짐
- 로맨스/일상/집착극에서 타이머/퀘스트 냄새가 남

---

## 10. ST-Hushline Game Mode Shim 구조

```yaml
prototype_name: "ST-Hushline Game Mode Shim"
purpose: "SillyTavern 안에 Hushline식 Mini Game Director를 만든다"

layers:
  layer_1_surface_context:
    purpose: "캐릭터끼리 표면 대사/행동만 보게 함"
    source: "User Perception Layers 문서"
    implementation: "코어 패치 (Phase 1)"

  layer_2_game_director_tick:
    purpose: "무난한 선택 반복 시 사건/위기/오해/기회 생성"
    source: "Marinara Game Mode 감각 + SceneBeatGenerator 설계"
    implementation: "Extension 또는 system note 삽입"

  layer_3_state_snapshot:
    purpose: "장면 상태를 매 턴 저장"
    fields:
      - scene_mode: "dialogue | tension | crisis | quiet"
      - location: string
      - time: string
      - present_characters: string[]
      - recent_events: string[]
      - tension: 0-10
      - danger: 0-10
      - active_threads: string[]
    implementation: "Extension이 매 턴 후 파싱/저장"

  layer_4_hud:
    purpose: "유저가 현재 상태를 볼 수 있게 함"
    shows:
      - 현재 장면 모드
      - 단서 (확인된 것만)
      - 관계 변화 힌트
      - 위기 신호
    does_not_show:
      - NPC 내부 목표
      - 숨겨진 진실
      - Director 판정 과정
    implementation: "Extension UI 패널"

  layer_5_guard:
    purpose: "유저/타 캐릭터 행동 뺏기, 전지성, 과공유 감지"
    implementation: "regex + Extension 후처리"
```

---

## 11. Mini Game Director — MVP 스펙

```yaml
state:
  scene_mode: "dialogue" | "tension" | "crisis" | "quiet"
  tension: 0-10
  danger: 0-10
  location: string
  active_threads: string[]
  recent_events: string[]
  safe_choice_counter: 0  # 무난한 선택 연속 횟수

trigger:
  if safe_choice_counter >= 2:
    inject_scene_beat:
      mystery: "모순 단서 / 알리바이 충돌 / 새 증거"
      horror: "위험 신호 / 환경 변화 / 인원 감소"
      romance: "오해 / 타이밍 실패 / 제3자 등장"
      intrigue: "제3자 개입 / 소문 / 밀서 발견"
      slice_of_life: "생활 사건 / 우연한 만남 / 작은 갈등"

prompt_injection:
  system_note_content: |
    [현재 장면 상태]
    모드: {scene_mode}
    긴장도: {tension}/10
    위치: {location}
    최근 사건: {recent_events[-1]}
    
    [이번 턴 GM 지시]
    {scene_beat_instruction 또는 "자연스럽게 진행"}
    
    [상대 인식]
    상대는 실제 사람이다. 공동 작가가 아니다.
    상대 행동/대사/내면을 대신 쓰지 않는다.

output_guard:
  detect:
    - user_action_hijack: "유저 이름 + 자발적 동사"
    - other_char_dialogue: "다른 캐릭터 이름 + 따옴표"
    - omniscient_reveal: "모르는 정보 정확히 맞춤"
  action:
    - violation_log에 기록
    - 심각하면 재생성 트리거
```

---

## 12. 마리나라 vs Hushline 핵심 차이

| 축 | 마리나라 Game Mode | Hushline |
|---|---|---|
| GM 성격 | 중립 진행자 | 적대적 세계의 힘 |
| 정보 모델 | 에이전트가 전체 컨텍스트 공유 | 3계층 격리 (Public/Private/Omniscient) |
| NPC 자율성 | 에이전트 on/off 토글 | autonomy score + agenda + reveal_policy |
| 장면 발생 | 에이전트가 이벤트 제안 | 구조적 장치 (device trigger + inertia) |
| 상대 인식 | 명시 안 됨 | "실제 사람" 계약 + 컨텍스트 격리 |
| 제품 형태 | 범용 AI 프론트엔드 | 시나리오팩 판매 엔진 |

---

## 13. 실험에서 Hushline으로의 이식 경로

```yaml
sillytavern_lab_validates:
  - "surface transcript만으로 정보 격리가 되는가"
  - "human perception prompt가 행동 뺏기를 막는가"
  - "GM tick이 장면 정체를 해소하는가"
  - "state snapshot이 일관성을 유지하는가"
  - "output guard가 위반을 잡는가"

if_validated_then_hushline_implements:
  surface_transcript → VisibilityGraph + buildCharacterChatContext
  human_perception → Character Agent 시스템 프롬프트
  gm_tick → SceneBeatGenerator + Director Agent
  state_snapshot → WorldState + StateDeltaWriter
  output_guard → RuntimeGenerationContract + UserAgencyGuard
```

---

## 14. 위험 관리

```yaml
risk_1:
  name: "게임화 과잉"
  symptom: "모든 장면이 퀘스트/이벤트처럼 느껴짐"
  prevention: "GM tick은 inertia >= 2일 때만. 평소엔 캐릭터 자율에 맡김."

risk_2:
  name: "프롬프트 비대화"
  symptom: "system note가 너무 길어져서 토큰 낭비"
  prevention: "state snapshot은 5줄 이내. GM 지시는 1줄."

risk_3:
  name: "SillyTavern 의존"
  symptom: "실험이 ST 구조에 묶여서 Hushline으로 이식 어려움"
  prevention: "로직은 독립 함수로 작성. ST 후킹은 얇은 어댑터만."

risk_4:
  name: "마리나라 따라하기"
  symptom: "Hushline 정체성 잃고 마리나라 클론이 됨"
  prevention: "빌리는 건 '상태 주도 감각'뿐. 구조/철학/제품은 우리 것."
```

---

*이 문서는 SillyTavern Lab 실험의 전체 계획서다. 구현은 별도 세션에서 진행한다.*
