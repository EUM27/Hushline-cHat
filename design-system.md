# Hushline 디자인 시스템 v0.1

> **제품 정의 — 멀티 에이전트 생성형 상황 엔진**
>
> Hushline은 Director가 상황을 굴리고, Character들이 각자 목적·지식대로 움직이며, User가 개입해 상태를 변동시키는 실시간 드라마 생성 엔진. UI는 "메신저 앱"이 아니라 **현재 세계 상태를 표현하는 인터페이스**다. 단톡 / VN / 로그 / 스프라이트+배경 / 선택지 / 나레이터 등 여러 뷰가 상황에 따라 전환된다.
>
> **장르는 변수, 핵심은 상수.** 연애·일상·학원·추리·SF·좀비·아이돌·코미디 어떤 톤이든 "목표와 관계 충돌" 위에서 작동한다. 따라서 디자인 시스템은 특정 톤(학원물·VN 등)에 결합되지 않고, **모드 전환과 상태 표현**을 1급 시민으로 다룬다.

---

## 0. 시스템 모델

UI가 따라야 할 기본 데이터 모델. 모든 컴포넌트는 이 객체들을 받아 렌더링한다.

### 0.1 데이터 스키마

#### 전체 계층

```
StoryPack            // 배포 단위 (.storypack import → 자동 시작)
 ├ World             // 세계관, 규칙, Genre
 ├ Characters[]      // 독립 Agent 정의
 ├ Scenes[]          // 큰 장면 단위
 │  └ Beats[]        // 한 단위의 상황 변화
 │     ├ utterances[] // 발화 배열
 │     └ state_changes // Beat 종료 후 World State diff
 ├ State             // 런타임 World State (시간/장소/플래그)
 ├ Director          // 연출자 — 분위기·이벤트·카메라
 ├ Theme             // UI 시각 스타일 (Base + Overlay)
 └ UI Modes          // 활성화된 뷰 모드 집합
```

#### Beat

```
Beat
 ├ metadata           // beatId, timestamp, source(director/user/system), parent
 ├ atmosphere         // 분위기 (Mood enum, §1.7)
 ├ location           // 장소 식별자
 ├ involved_characters // 등장 Agent ID 배열
 ├ utterances[]       // 시간순 Utterance 배열
 └ state_changes      // 종료 시 적용할 World State 변경
```

#### Utterance

```
Utterance
 ├ speaker            // Agent ID (또는 'narrator', 'system')
 ├ type               // 'dialogue' | 'action' | 'reaction' | 'monologue'
 ├ text               // 본문
 ├ emotion            // (선택) 발화 시점 화자 감정 — Mood enum 공유
 └ visibility         // §0.5 visibility 객체
```

> **action은 연출 전용.** 실제 세계 변화(위치 이동, 관계 변화, 시간 변화, 아이템 획득, 플래그 변경)는 반드시 Beat.state_changes에 기록한다. action type Utterance는 분위기·묘사 표현에만 쓴다 (예: "천천히 창문 쪽으로 다가갔다"). 두 개가 동시에 일어나는 비트면 같은 Beat 안에 action Utterance + state_changes를 둘 다 둔다.

### 0.2 Genre · Mood · Theme — 3축 분리

세 개념은 분리되며 서로 영향을 주지 않는다.

| 축 | 정의 | 영향 범위 | 결정자 |
|---|---|---|---|
| **Genre** | 콘텐츠 분류 (연애/추리/SF/좀비/일상...) | 콘텐츠 메타, 매칭, 추천 | 시나리오/시드 |
| **Mood** | 순간 분위기 (닫힌 enum, §1.7 참조) | 색 액센트, 모션, sprite 표정 | Beat.atmosphere, Utterance.emotion |
| **Theme** | UI 비주얼 프리셋 (팔레트·타이포·모션 묶음) | 토큰 레이어 | User 설정 또는 챕터 단위 |

→ 같은 Mood enum이 좀비 장르에도 연애 장르에도 쓰일 수 있음. Theme만 바꾸면 같은 콘텐츠가 다른 톤으로 보임.

### 0.3 개념 → UI 매핑

| 개념 | 책임 | UI 노출 형태 |
|---|---|---|
| **World State** | 현재 시간/장소/분위기/플래그 | StateChip(Beat.atmosphere/location), Backdrop |
| **Director** | 다음 Beat 결정, 모드 전환 | (비가시) ModeSwitcher, BeatTransition |
| **Beat** | Utterance 묶음 + 상태 변화 단위 | BeatGroup(시각 그루핑) + 자식 Utterance/StateChange |
| **Agent** | 발화·행동·내적 상태 보유 | AgentIdentity, Utterance.speaker, GoalChip(제작자 모드) |
| **Utterance** | 한 발화 단위 (text + action + emotion) | Utterance(bubble/vn-line/log-row 등) |
| **state_changes** | World State diff | StateChange(LogEntry 형식 또는 인라인 인디케이터) |
| **visibility** | 발화 가시 범위 | Whisper variant, HiddenMarker, POV 필터 |
| **User Intervention** | 입력·선택·대상 지정 | ChoicePrompt, FreeInput, TargetPicker |
| **Theme** | 토큰 프리셋 묶음 | ThemeProvider (시스템 레이어) |

### 0.3.1 Narrator / System 표시 원칙

`narrator`와 `system`은 데이터 의미상 분리하되, 플레이 화면에서는 텍스트 라벨을 과하게 노출하지 않는다. 사용자는 “나레이터:” “시스템:” 같은 명시 라벨보다 **표현 효과의 차이**로 메시지 성격을 알아차리게 한다.

| speaker | 의미 | 권장 표현 |
|---|---|---|
| `narrator` | 세계 안의 장면 묘사, 분위기, 사건 서술 | 장면 서술 블록, 문학적 타이포, 배경 오버레이, 느린 fade |
| `system` | 앱/게임 진행 안내, 모드 전환, 튜토리얼, 상태 알림 | 작은 안내문, 이탤릭체, 보조 폰트, 낮은 대비의 시스템 톤, 토스트/로그형 처리 |

원칙:

1. **일반 플레이 UI에서는 role명을 라벨링하지 않는다.** `narrator`/`system` 문자열은 제작자 모드·디버그 로그·접근성 설명에서만 노출한다.
2. **구분은 타이포·색·모션·배치로 한다.** 예: system 메시지는 이탤릭체/보조 폰트/작은 크기, narrator는 별도 서술 블록이나 장면 전환 효과.
3. **텍스트 의미를 시각 효과에만 의존하지 않는다.** 접근성 모드에서는 스크린리더용 숨김 라벨 또는 `aria-label`로 “시스템 안내”, “장면 서술”을 제공한다.
4. **system은 몰입을 깨지 않게 최소화한다.** 진행에 필요한 안내만 짧게 보여주고, 스토리 정보처럼 보이지 않도록 narrator와 분리한다.

### 0.4 핵심 디자인 원칙

1. **같은 Beat가 다른 모드에서 다르게 표현된다.** Utterance 하나가 단톡에서는 말풍선, VN에서는 vn-line, 로그에서는 한 줄 로그로 렌더된다. 컴포넌트는 데이터에 종속되고, 레이아웃은 모드에 종속된다.
2. **Beat는 시각적 단위다.** 같은 Beat 안의 Utterance들은 모든 모드에서 묶여 보여야 한다 (간격, 좌측 보더, 시간 헤더 등). state_changes는 Beat 종료 시점에 함께 렌더된다.
3. **visibility는 1급 시민이다.** Agent A·B만 보는 발화는 User POV에서는 HiddenMarker로 처리되거나, User가 그 정보에 접근 가능한 권한일 때만 Whisper로 노출된다. POV 필터를 끄면 모든 visibility가 풀리는 디렉터/디버그 모드가 따로 있다.


### 0.5 visibility / User POV 규칙

Hushline v0.1의 기본 전제는 **User ≠ Character**다. User는 특정 캐릭터를 조종하지 않으며, 세계 안에 개입할 수 있는 별도 참가자/관찰자로 취급한다. Character는 모두 독립 Agent로 움직인다.

#### visibility 객체 형식

초기 버전은 **allow list만 지원**한다. `except`, `deny`, `all_except` 같은 부정형은 v0.1에서 금지한다.

```json
{
  "visibility": {
    "mode": "allow",
    "targets": ["user", "director"]
  }
}
```

#### 허용 target

| target | 의미 | User POV 노출 여부 |
|---|---|---|
| `all` | 전체 공개 | 노출 |
| `user` | 실제 사용자 | 노출 |
| `director` | Director 내부 판단용 | 비노출 |
| `narrator` | 나레이터/전지 서술 레이어 | 일반적으로 비노출, NarratorBlock 결과만 노출 |
| `system` | 시스템/엔진 | 비노출 |
| `ch_*` | 특정 Character Agent | 비노출. User가 그 캐릭터를 조종하지 않기 때문 |

#### User POV 자동 노출 규칙

User는 `visibility.targets`에 `all` 또는 `user`가 포함된 정보만 본다. `ch_hayun` 같은 Character ID가 들어 있어도 User에게 자동 공개되지 않는다.

```json
{ "visibility": { "mode": "allow", "targets": ["ch_hayun", "director"] } }
```

위 정보는 하윤과 Director만 아는 정보이며, User 화면에서는 HiddenMarker로 처리된다.

#### 디버그/제작자 예외

DirectorPanel, 제작자 모드, 디버그 모드는 POV 필터를 끌 수 있다. 이때 모든 visibility가 풀리지만, 일반 플레이 모드에는 영향을 주지 않는다.

### 0.6 action Utterance / state_changes 경계

원칙은 **서술은 Utterance, 세계의 진실은 state_changes**다.

| 상황 | 기록 위치 | 이유 |
|---|---|---|
| 캐릭터가 말함 | `Utterance.type = dialogue` | 발화 표현 |
| 캐릭터가 몸짓/표정/짧은 행동을 보임 | `Utterance.type = action` | 연출 표현 |
| 위치가 바뀜 | `Beat.state_changes` | 이후 상태 조회 가능해야 함 |
| 관계도/호감/경계 수치가 바뀜 | `Beat.state_changes` | 런타임 State에 반영 필요 |
| 아이템 획득/상실 | `Beat.state_changes` | 인벤토리/플래그 반영 필요 |
| 시간, 장소, 분위기, 플래그 변경 | `Beat.state_changes` | World State diff로 보존 필요 |

예: “에반이 옥상으로 이동했다”는 실제 위치 변경이므로 `state_changes`에 반드시 기록한다. 화면에 분위기 묘사가 필요하면 같은 Beat 안에 action Utterance를 추가한다.

```json
{
  "utterances": [
    {
      "speaker": "ch_evan",
      "type": "action",
      "text": "에반은 말없이 계단 쪽으로 사라졌다.",
      "visibility": { "mode": "allow", "targets": ["all"] }
    }
  ],
  "state_changes": [
    {
      "type": "location-move",
      "target": "ch_evan",
      "from": "hallway_3f",
      "to": "rooftop"
    }
  ]
}
```

### 0.7 Theme 레이어 스펙

Theme은 단순 색상 팔레트가 아니라 **컬러·타이포·모션·표면 질감·전환 효과를 묶은 UI 프리셋**이다. 단, 콘텐츠의 사건/상태를 바꾸지는 않는다.

#### Theme 적용 계층

```
Final Render Theme
 ├ Base Theme        // User 영구 설정
 ├ Story Theme       // StoryPack 기본 톤
 ├ Chapter Overlay   // 챕터/씬 단위 임시 톤
 └ Mood Effects      // Beat.atmosphere / Utterance.emotion 기반 순간 효과
```

#### Theme이 바꿀 수 있는 범위

| 범위 | 허용 여부 | 예시 |
|---|---|---|
| Color tokens | 허용 | 배경, 액센트, 보더, mood tint |
| Typography tokens | 허용 | 제목 폰트, narrator 폰트, log 폰트 |
| Motion tokens | 허용 | fade, glitch, slow dissolve |
| Surface treatment | 허용 | glass, grain, scanline, vignette |
| Layout 구조 | 제한 | GroupChat/VN/Log 같은 모드 구조 자체는 변경 금지 |
| 데이터 의미 | 금지 | visibility, state_changes, Agent 목표 변경 불가 |

#### 적용 우선순위

User의 Base Theme는 앱 전체 취향이고, Story/Chapter Overlay는 콘텐츠 연출이다. 충돌 시 **안전·가독성 토큰은 User 설정 우선**, 연출 토큰은 Story/Chapter Overlay 우선으로 둔다.

#### 동적 전환 처리

Theme이 Beat 도중 즉시 바뀌지 않는다. ModeSwitcher와 동일하게 `pendingThemeOverlay`로 큐잉하고, **현재 Beat 종료 후 BeatTransition에서 적용**한다.

| 전환 유형 | 권장 모션 |
|---|---|
| 일반 Theme 전환 | crossfade / slow dissolve |
| horror/scared overlay | vignette + short glitch |
| dreamlike overlay | blur fade |
| tense/combat overlay | fast dim + small shake |

---

## 1. 디자인 토큰

### 1.1 컬러

> 팔레트 D — 미니멀 모노 + 에메랄드. 흰/크림 표면 + 깊은 에메랄드 포인트 + 머스타드 강조의 3색 구조. 캐릭터별 액센트는 시스템 토큰화하지 않고 Agent 데이터의 `accentColor` 필드에 위임 (장르가 다양해 시스템에 특정 캐릭터 색을 묶지 않음).

#### Brand — Emerald (포인트)
| 토큰 | 값 | 용도 |
|---|---|---|
| `--color-brand-emerald-50` | `#F1F6F3` | 가장 옅은 배경 워시 |
| `--color-brand-emerald-100` | `#E8F0EC` | 칩 배경, 보조 표면 |
| `--color-brand-emerald-200` | `#C5DCD0` | 보더, 호버 톤 |
| `--color-brand-emerald-500` | `#2D5F4F` | 주요 액센트, 시스템 라벨, 링크 |
| `--color-brand-emerald-700` | `#1F4538` | 액티브, 강한 강조 |
| `--color-brand-emerald-900` | `#0F2A21` | 에메랄드 위 다크 텍스트 |

#### Brand — Mustard (강조)
| 토큰 | 값 | 용도 |
|---|---|---|
| `--color-brand-mustard-100` | `#FBF1D2` | 강조 칩 배경, 알림 라이트 |
| `--color-brand-mustard-500` | `#E8C547` | 송신 버튼, 주요 CTA, User 개입 강조 |
| `--color-brand-mustard-700` | `#B79626` | 호버, 액티브 |
| `--color-brand-mustard-900` | `#5C4810` | 머스타드 위 다크 텍스트 |

#### Neutral / Surface
| 토큰 | 값 | 용도 |
|---|---|---|
| `--color-bg-canvas` | `#FAF8F5` | 앱 베이스 (오프 화이트) |
| `--color-bg-surface` | `#FFFFFF` | 카드, 패널 표면 |
| `--color-bg-surface-alt` | `#F2EFEA` | 보조 표면, 입력 비활성 |
| `--color-bg-stage` | `#1A1A1A` | 채팅·VN·로그 등 "무대" 다크 배경 |
| `--color-bg-stage-elevated` | `#2A2A2A` | 무대 위 인풋, 캐릭터 발화 버블 |
| `--color-bg-overlay` | `rgba(255,255,255,0.6)` | Backdrop 위 글래스 |

#### Text
| 토큰 | 값 | 용도 |
|---|---|---|
| `--color-text-primary` | `#1A1A1A` | 본문 |
| `--color-text-secondary` | `#5C5853` | 보조 정보 |
| `--color-text-tertiary` | `#8B8780` | 메타, 플레이스홀더 |
| `--color-text-on-dark` | `#F2EFEA` | 무대 위 텍스트 |
| `--color-text-on-emerald` | `#FFFFFF` | 에메랄드 500/700 위 |
| `--color-text-on-mustard` | `#5C4810` | 머스타드 500 위 |

#### Border
| 토큰 | 값 | 용도 |
|---|---|---|
| `--color-border-default` | `#E8E4DD` | 카드, 인풋 기본 |
| `--color-border-strong` | `#C5C0B6` | 호버, 강조 |
| `--color-border-focus` | `#2D5F4F` | 포커스 링 (에메랄드 500) |

#### Semantic
| 토큰 | 값 | 용도 |
|---|---|---|
| `--color-state-success` | `#2D5F4F` | 성공 |
| `--color-state-online` | `#5DD66E` | 라이브 인디케이터 |
| `--color-state-warning` | `#E8C547` | 주의 |
| `--color-state-danger` | `#D7553D` | 오류 |
| `--color-state-info` | `#4A7B8C` | 정보 |
| `--color-state-mood-tension` | `#D7553D` | 긴장도 높은 상황 (옵션) |
| `--color-state-mood-calm` | `#4A7B8C` | 차분한 상황 (옵션) |

---

### 1.2 타이포그래피

전제: 한국어 + 영문 혼용. 디스플레이는 헤드라인용 굵은 산세리프, 본문은 가독성 우선.

| 토큰 | 패밀리 | 사이즈 / 라인하이트 | 웨이트 | 용도 |
|---|---|---|---|---|
| `--font-display-xl` | Pretendard, Inter | 48 / 56 | 800 | Agent 이름 (VN 모드 큰 라벨, 인트로) |
| `--font-display-lg` | Pretendard, Inter | 32 / 40 | 700 | 챕터/씬 제목, 모드 전환 헤더 |
| `--font-title-md` | Pretendard | 18 / 26 | 600 | 패널 타이틀, 모드 헤더 |
| `--font-body-md` | Pretendard | 14 / 22 | 400 | Utterance 본문 |
| `--font-body-sm` | Pretendard | 13 / 20 | 400 | 메타, 인풋 플레이스홀더 |
| `--font-label-xs` | Pretendard | 11 / 16 | 600 | 칩, 메타 라벨 |
| `--font-mono-sm` | JetBrains Mono | 12 / 18 | 500 | 로그 모드, 디렉터 디버그 표시 |
| `--font-narrator` | (serif) Noto Serif KR | 15 / 26 | 400 italic | 나레이터 블록 (장르 톤 분리용) |

---

### 1.3 스페이싱

4px 베이스 스케일.

| 토큰 | 값 | 일반 용도 |
|---|---|---|
| `--space-1` | 4px | 칩 내부, 아이콘 갭 |
| `--space-2` | 8px | 인접 요소 |
| `--space-3` | 12px | 컴포넌트 내부 패딩 |
| `--space-4` | 16px | 카드 패딩, Utterance 간격 |
| `--space-5` | 24px | 섹션 간격 |
| `--space-6` | 32px | 큰 블록 간격 |
| `--space-8` | 48px | 페이지 마진 |

---

### 1.4 라운드 / 보더

| 토큰 | 값 | 용도 |
|---|---|---|
| `--radius-sm` | 6px | 칩, 작은 버튼 |
| `--radius-md` | 12px | 인풋, 단톡 모드 말풍선 |
| `--radius-lg` | 20px | 카드, AgentIdentity |
| `--radius-xl` | 28px | 무대 패널 컨테이너 |
| `--radius-full` | 9999px | 아바타, 상태 점 |
| `--border-default` | `1px solid var(--color-border-default)` | 카드 보더 |
| `--border-focus` | `2px solid var(--color-border-focus)` | 포커스 링 |

---

### 1.5 그림자 / 엘리베이션

| 토큰 | 값 | 용도 |
|---|---|---|
| `--shadow-card` | `0 4px 16px rgba(28,26,24,0.06)` | 카드 |
| `--shadow-floating` | `0 12px 32px rgba(28,26,24,0.12)` | 무대 패널, 모달, ChoiceOverlay |
| `--shadow-bubble` | `0 2px 6px rgba(0,0,0,0.08)` | 단톡 말풍선 |

---

### 1.6 모션

| 토큰 | 값 | 용도 |
|---|---|---|
| `--motion-fast` | `120ms ease-out` | 호버, 칩, 타이핑 펄스 |
| `--motion-base` | `220ms cubic-bezier(0.2, 0.8, 0.2, 1)` | Utterance 등장, 패널 토글 |
| `--motion-slow` | `420ms cubic-bezier(0.2, 0.8, 0.2, 1)` | 모드 전환, 스프라이트 페이드 |
| `--motion-beat` | `680ms cubic-bezier(0.4, 0, 0.2, 1)` | Beat 사이 호흡, 무드 전환 |

---

### 1.7 Mood Enum (닫힘)

Beat.atmosphere(씬 전체 분위기)와 Utterance.emotion(개별 발화 감정)이 **공유하는 닫힌 어휘**. 새 mood 값은 시스템 토큰 추가와 함께만 도입.

| 값 | 의미 | 색 토큰 | 모션 톤 | sprite 표정 키 |
|---|---|---|---|---|
| `neutral` | 기본, 평온 | `#8B8780` | base | `neutral` |
| `warm` | 호의, 친밀, 안정 | `#E8A87C` | base | `smile` |
| `cold` | 냉담, 거리감 | `#4A7B8C` | slow | `flat` |
| `tense` | 긴장, 경계 | `#B79626` | fast | `narrow_eyes` |
| `scared` | 공포, 불안 | `#6B4570` | fast | `wide_eyes` |
| `angry` | 분노, 적의 | `#D7553D` | fast | `glare` |
| `sad` | 슬픔, 침체 | `#5C4810` | slow | `lowered` |
| `amused` | 흥미, 유희 | `#E8C547` | base | `smirk` |
| `surprised` | 놀람, 충격 | `#F0997B` | fast | `agape` |
| `resigned` | 체념, 수용 | `#5F5E5A` | slow | `sigh` |

색 토큰은 `--color-mood-{value}` 형태로 시스템에 등록. UI 적용 위치:
- **Beat.atmosphere**: Backdrop tint(8% alpha), StateChip(mood) 배경, BeatGroup 좌측 보더
- **Utterance.emotion**: bubble 좌측 점 4px, vn-line 화자명 옆 점, log-row의 `(emotion)` 표기, sprite 표정 매핑

---

### 1.8 다크 모드 — Stage / Surface 토큰 분리

**Stage(무대)와 Surface(앱)는 다크 모드 처리가 다름.**

| 레이어 | 라이트 모드 | 다크 모드 | 비고 |
|---|---|---|---|
| **Stage** (드라마 무대) | 항상 다크 (`#1A1A1A`) | 동일 (`#1A1A1A`) | 드라마 몰입을 위해 모드와 무관 |
| **Surface** (앱 셸) | `#FFFFFF` / `#FAF8F5` | `#15140F` / `#1F1D17` | OS/유저 설정 따름 |

#### Surface 다크 토큰
| 토큰 | 라이트 | 다크 |
|---|---|---|
| `--color-bg-canvas` | `#FAF8F5` | `#15140F` |
| `--color-bg-surface` | `#FFFFFF` | `#1F1D17` |
| `--color-bg-surface-alt` | `#F2EFEA` | `#28251D` |
| `--color-text-primary` | `#1A1A1A` | `#F2EFEA` |
| `--color-text-secondary` | `#5C5853` | `#A8A39A` |
| `--color-text-tertiary` | `#8B8780` | `#7A766E` |
| `--color-border-default` | `#E8E4DD` | `#3A372F` |
| `--color-border-strong` | `#C5C0B6` | `#5C5853` |

#### Stage 토큰 (모드 무관)
| 토큰 | 값 |
|---|---|
| `--color-bg-stage` | `#1A1A1A` |
| `--color-bg-stage-elevated` | `#2A2A2A` |
| `--color-text-on-stage` | `#F2EFEA` |

→ 결과: 다크 모드에서도 무대(채팅창/VN 박스)는 같은 톤을 유지하고, 앱 셸(헤더/사이드바/카드)만 어두워진다. Stage 안에 진입하면 다크/라이트 차이가 사라져 "드라마는 항상 같은 톤"이라는 일관성을 유지.

---

## 2. 핵심 프리미티브

뷰 모드와 무관하게 재사용되는 데이터 표현 단위. **데이터 1개 → 모드별 다른 렌더링.**

### 2.1 BeatGroup

한 Beat에 속한 Utterance들 + state_changes를 묶는 시각적 컨테이너. 모든 모드에서 항상 렌더되며, 모드별로 그루핑 방식이 다르다.

#### Props
| Property | Type | Description |
|---|---|---|
| `beatId` | string | Beat 참조 |
| `metadata` | object | timestamp, source, parent beat |
| `atmosphere` | mood enum | StateChip(mood) 자동 표시용 |
| `location` | string | StateChip(place) 자동 표시용 |
| `involvedCharacters` | string[] | 활성 화자 강조용 |
| `utterances` | Utterance[] | 자식 발화 |
| `stateChanges` | StateChange[] | Beat 종료 후 적용 변화 |

#### Variants (모드별 그루핑)
| Variant | 사용 모드 | 비주얼 |
|---|---|---|
| `chat-cluster` | 단톡 | 시간/위치 변경 시 상단에 작은 헤더, Utterance 사이 간격 좁힘, Beat 종료 시 state_changes를 인라인 회색 시스템 라인으로 |
| `vn-scene` | VN | Beat 시작 시 location 페이드 인, 종료 시 BeatTransition + state_changes를 NarratorBlock 또는 화면 코너 토스트로 |
| `log-block` | 로그 | `--- BEAT [id] @ [location] ---` 헤더 + LogEntry들 + state_changes를 마지막 줄로 |
| `sprite-stage` | 스프라이트 씬 | involvedCharacters 등장/퇴장 처리, state_changes는 화면 하단 스트립 |

#### State_changes 렌더링
| 종류 | 표시 |
|---|---|
| Location 변경 | `→ 옥상에서 복도-3층으로` |
| Atmosphere 변경 | `분위기: 평온 → 긴장` (mood 색 점) |
| Flag 추가/제거 | `+비밀공유` / `-경계해제` |
| Relationship 변경 | (관찰자 모드 전용) RelationshipBadge |

---

### 2.2 Utterance

한 Agent의 한 발화 단위 — `text`(말) + `action`(행동) + `emotion`(감정 상태) + `visibility`(가시 범위)를 함께 표현.

#### Variants (모드별 렌더링)
| Variant | 사용 모드 | 비주얼 |
|---|---|---|
| `bubble` | 단톡 모드 | 좌/우 정렬 말풍선, 라벨 + 본문 (action은 본문 위 `*action*` 줄) |
| `vn-line` | VN 모드 | 화면 하단 풀폭 박스, 큰 화자명 + 본문 (action은 화자명 옆 작은 italic) |
| `log-row` | 로그 모드 | 모노 한 줄, `[time] AGENT (emotion): "text" *action*` |
| `floating` | 스프라이트 씬 | 스프라이트 옆 말풍선 (꼬리 화살표) |
| `narrator` | 모든 모드 | serif italic, 정렬 가운데, speaker = narrator |
| `whisper` | 모든 모드 | dashed border + 60% opacity, 작은 자물쇠 아이콘, 자막 "[A→B에게만]" |

#### Props
| Property | Type | Description |
|---|---|---|
| `speaker` | string | Agent ID (narrator/system도 별도 ID) |
| `text` | string | 발화 본문 (없을 수도 있음 — action만 있을 때) |
| `emotion` | emotion enum | 발화 시점 감정 (sprite 표정, bubble 톤 결정) |
| `action` | string \| null | 행동 묘사 ("펜을 내려놓는다", "고개를 돌린다") |
| `visibility` | VisibilityObject | `mode: allow` + `targets[]`; User는 `all` 또는 `user`만 자동 노출 |
| `targetAgentId` | string \| string[] | 누구를 향한 발화인지 (mention, 시선 처리) |
| `tokenStream` | boolean | 스트리밍 중 여부 |
| `beatId` | string | 속한 Beat |

#### text · action · emotion 조합
| 조합 | 렌더링 |
|---|---|
| text만 | 디폴트 발화 |
| action만 | Utterance 자체가 action 라인 ("*에반은 자리에서 일어선다*") |
| text + action | action 먼저 (위/옆) → text |
| emotion 추가 | sprite 표정 변경 (VN/스프라이트), bubble 좌측 점/테두리 색 (단톡), 로그에 `(emotion)` 표기 |

#### Visibility 처리
| visibility 값 | User POV 결과 |
|---|---|
| `{ mode: 'allow', targets: ['all'] }` | 정상 노출 |
| `{ mode: 'allow', targets: ['user'] }` | 정상 노출 + 작은 인디케이터 (눈 아이콘 + 대상 명단) |
| `{ mode: 'allow', targets: ['ch_*'] }` | **HiddenMarker**로 대체 — User는 캐릭터를 조종하지 않으므로 자동 노출 없음 |
| `{ mode: 'allow', targets: ['director'] }` | 일반 플레이에서는 비노출, DirectorPanel/디버그에서만 노출 |
| 디렉터/디버그 모드 | POV 필터 해제 시 항상 풀 노출 |

#### States
| State | 비주얼 | 행동 |
|---|---|---|
| Default | 모드별 디폴트 | — |
| Streaming | 끝에 깜빡이는 커서 \| | 스트림 종료 시 커서 제거 |
| Highlighted | 에메랄드 좌측 보더 2px | Director가 강조한 발화 |
| Retracted | 50% opacity + 취소선 | Director가 철회한 발화 |
| Targeted-at-user | 머스타드 백라이트 | User가 답해야 함을 시사 |
| Whispered | dashed 0.5px + 자물쇠 | visibility 한정 표시 |

#### Tokens
- bubble 라운드: `--radius-md` (반대 모서리는 4px)
- vn-line 패딩: `--space-5`
- log-row 폰트: `--font-mono-sm`
- narrator 폰트: `--font-narrator`
- action 폰트: `--font-body-sm` italic + `--color-text-tertiary`
- emotion 색 매핑: 별도 emotion enum → 색 토큰 표 (미해결 6번 참조)

---

### 2.3 AgentIdentity

Agent 한 명의 식별 표현. 모드별로 풀스프라이트, 헤더 칩, 리스트 행 등으로 변형.

#### Variants
| Variant | 사용 위치 |
|---|---|
| `sprite` | VN/스프라이트 씬 — 풀바디 일러스트 |
| `portrait` | VN 대사 박스 옆 — 반신/얼굴 |
| `avatar` | 단톡 헤더, Utterance bubble — 원형 작은 이미지 |
| `chip` | 멀티 에이전트 표시 ("3명 대화 중") |
| `card` | 캐릭터 선택, 디렉터 패널 — 풀 카드 |
| `roster-row` | 디렉터 모드 사이드바 — 가로 줄 |

#### Props
| Property | Type | Description |
|---|---|---|
| `agentId` | string | Agent 참조 |
| `name` | string | 표시명 |
| `accentColor` | hex | Agent 데이터 필드 (시스템 토큰 아님) |
| `presence` | 'active' \| 'observing' \| 'absent' | 현재 씬 참여 상태 |
| `assets` | { sprite, portrait, avatar } | 모드별 이미지 자산 |

#### States
| State | 비주얼 |
|---|---|
| Active speaker | 액센트 컬러 글로우/보더, 다른 Agent는 디밍 |
| Observing | 스프라이트 25% 디밍 |
| Absent | 스프라이트 미표시, chip만 회색 처리 |
| Targeting user | 머스타드 점 표시 |

---

### 2.4 SpeakerAvatar

Agent의 모드 독립적 시각 식별자(작은 원형). Utterance bubble에 붙거나, 단톡 헤더에 노출.

크기: `xs(20)`, `sm(28)`, `md(40)`, `lg(56)`. 라운드: `--radius-full`. 보더는 `accentColor`로 1.5px (active 시 2px).

---

### 2.5 StateChip

현재 World State의 한 차원을 보여주는 칩. **Beat.atmosphere → mood 칩, Beat.location → place 칩으로 자동 매핑**되며, time과 flag는 별도 데이터 소스.

#### Variants
| Variant | 데이터 소스 | 예시 |
|---|---|---|
| `time` | World clock | `오후 4:32`, `방과 후` |
| `place` | Beat.location | `옥상`, `복도-3층` |
| `mood` | Beat.atmosphere | `긴장`, `평온`, `의심` |
| `flag` | World flags | `비밀 공유됨`, `에반 의심 중` |

머스타드 100 배경 + 머스타드 900 텍스트가 디폴트. mood는 `--color-state-mood-*`로 색을 바꿀 수 있음.

---

### 2.6 StateChange

Beat.state_changes 한 항목의 시각 표현. BeatGroup 종료 시점에 인라인 노출.

#### Variants
| Variant | 형식 |
|---|---|
| `location-move` | `→ 옥상에서 복도-3층으로` (화살표 아이콘) |
| `mood-shift` | `분위기: 평온 → 긴장` (양쪽 mood 색 점) |
| `flag-add` | `+ 비밀 공유됨` (mustard 칩) |
| `flag-remove` | `− 경계 해제` (회색 칩) |
| `relationship` | (관찰자 모드 전용) RelationshipBadge로 위임 |

폰트는 `--font-body-sm`, 컬러는 `--color-text-secondary` 디폴트. 플래그 변경은 `--color-brand-mustard-*`.

---

### 2.7 HiddenMarker

User POV에서 visibility 미허용된 Utterance가 발생했음을 알리는 placeholder. "무엇이 일어났는지는 알지만 내용은 모름"을 표현.

#### Props
| Property | Type | Description |
|---|---|---|
| `participants` | string[] | 발화에 참여한 Agent 명단 (이름은 노출) |
| `hint` | string \| null | "속삭였다", "무언가 주고받았다" 같은 모호한 묘사 |

#### Variants
| Variant | 비주얼 |
|---|---|
| `bubble` | 흐릿한 회색 말풍선, 자물쇠 + 참여자 명단 |
| `vn-line` | 화면 하단 회색 박스, italic, 본문 미노출 |
| `log-row` | `[14:35] HIDDEN: 에반↔시우` |

User에게 권한이 부여되면(예: 회상, 진실 노출 비트) 같은 위치의 HiddenMarker가 whisper Utterance로 교체될 수 있음.

---

### 2.8 GoalChip / RelationshipBadge

Agent의 내적 상태(목표·관계)를 시각화하는 메타 정보. **공개 범위는 모드별로 다르다.**

#### 공개 범위
| 모드 | GoalChip 노출 | RelationshipBadge 노출 |
|---|---|---|
| **일반 유저** | 기본 비공개. Director가 단서로 허용한 경우에만 모호한 요약("무언가 숨기는 중") | User와 Agent 사이의 드러난 관계만 |
| **제작자/디버그** | 전체 공개 — 모든 Agent의 모든 목표 | 전체 관계 매트릭스 |

#### Variants
| Variant | 표시 |
|---|---|
| `goal-user` | User 목표/현재 개입 목적 — `목표: 진실 알아내기` (실선 보더, mustard 액센트) |
| `goal-fog` | 타 Agent 추정 — `에반: 무언가 숨기는 중` (dashed, 회색, italic) |
| `goal-full` | 디버그 — `에반 / 목표: 진실 숨기기 / 우선순위 0.8` (dashed, 모노) |
| `relationship-user` | User 기준 관계 — `에반 → User: 경계 ↑` |
| `relationship-full` | 디버그 — `에반 → 시우: 경계 0.7, 호감 0.2` |

폰트는 `--font-mono-sm`, 디버그 variant는 dashed 0.5px로 "메타 정보"임을 시각적으로 분리.

User 모드에서 `goal-fog`로 표시되는 추정 정보는 Director가 어떤 단서를 노출했는지에 따라 변동. 단서가 없으면 GoalChip 자체가 렌더되지 않음.

---

### 2.9 ChoicePrompt

User 개입 슬롯. Director가 분기 지점에서 노출.

#### Variants
| Variant | 사용 시나리오 |
|---|---|
| `option-list` | 명시적 선택지 2~5개 |
| `free-input` | 자유 입력 (단톡 모드의 디폴트) |
| `target-picker` | 누구에게 말할지 선택 (멀티 에이전트 씬) |
| `timed` | 제한 시간 + 카운트다운 바 (긴장도 ↑) |

옵션 칩은 머스타드 500 배경, 호버 시 머스타드 700. timed variant는 상단에 머스타드 진행 바.

---

### 2.10 NarratorBlock

전지적 시점 묘사. 화자 없음, 풀폭, serif italic, 위아래 `--space-5` 호흡.

`--font-narrator` 사용. Director가 씬을 열거나 닫을 때, 시간 점프, 분위기 환기 시 등장.

---

### 2.11 Backdrop

씬의 시각적 배경. 단톡 모드에서는 흐릿한 무드 레이어, VN/스프라이트 씬에서는 풀스크린 배경 이미지.

#### Props
| Property | Type | Description |
|---|---|---|
| `image` | string | 배경 이미지 URL |
| `blur` | 0–24px | 모드별 차등 (단톡 12, VN 0, 로그 미적용) |
| `tint` | hex + alpha | 무드 톤 (긴장 시 약한 레드 틴트 등) |
| `vignette` | boolean | 가장자리 어둡게 |

---

### 2.12 LogEntry

로그 모드의 한 줄. Utterance와 StateChange 모두 같은 줄 단위로 표현.

#### 포맷
| 종류 | 예시 |
|---|---|
| 발화 (text) | `[14:32] EVAN → USER (cold): "지금은 말보다 확인이 먼저야"` |
| 행동 (action) | `[14:32] EVAN: *펜을 내려놓는다*` |
| 발화+행동 | `[14:32] EVAN → USER (cold): *펜을 내려놓는다* "지금은 말보다 확인이 먼저야"` |
| 나레이션 | `[14:32] NARRATOR: 옥상 문이 닫혔다.` |
| 비공개 | `[14:33] HIDDEN: 에반↔시우` |
| 위치 변경 | `[14:34] STATE.location: 옥상 → 복도-3층` |
| 분위기 변경 | `[14:34] STATE.atmosphere: 평온 → 긴장` |
| 플래그 | `[14:34] STATE.flag: +비밀공유` |
| Beat 헤더 | `--- BEAT b042 @ 옥상 (긴장) ---` |

`--font-mono-sm` 사용. emotion은 괄호로, action은 asterisk로, 화자는 대문자로 정렬해 시각적 그리드 형성.

---

### 2.13 BeatTransition

Beat와 Beat 사이의 시각적 휴지. 1~2 frames의 어두워지기, 시간 표기 페이드, 또는 NarratorBlock 등장.

`--motion-beat` 사용.

---

## 3. 뷰 모드 (Layouts)

같은 World State를 다르게 렌더링하는 풀스크린 레이아웃. Director가 모드 전환을 트리거.

### 3.1 GroupChatView (단톡 모드)

가장 캐주얼한 모드. 단톡 UI + 자유 입력. 일상·코미디·아이돌 톤에 적합.

| 영역 | 비고 |
|---|---|
| Header | 참여 Agent들의 SpeakerAvatar 가로 정렬 + 채널/씬 이름 |
| Stream | Utterance(bubble) 시계열, NarratorBlock 인라인 |
| Composer | ChoicePrompt(free-input) + target picker (선택 시 mention) |
| Backdrop | 흐릿한 씬 배경, blur 12px |

### 3.2 VisualNovelView (VN 모드)

집중도 높은 1대1/1대N 대화. 추리·연애·SF 톤에 적합.

| 영역 | 비고 |
|---|---|
| Backdrop | 풀스크린 배경 (blur 0) |
| Sprite stage | AgentIdentity(sprite) 1~3명, active speaker 강조 |
| VN box | Utterance(vn-line), 화자명 + 본문 |
| Composer | ChoicePrompt(option-list 또는 timed) 하단 오버레이 |

#### 동시 발화 처리
같은 Beat 안에서 여러 Utterance가 동시 시점일 때:
- **GroupChat**: 시계열 그대로 모두 노출 (자연스러움)
- **VN**: **대표 발화 + 보조 반응** 패턴
  - 대표 1개: vn-line 박스에 풀 텍스트
  - 나머지: sprite 머리 위 floating 말풍선(짧게 trim, 30자 제한, 60% opacity)
  - 대표 선정: Director 명시 우선 → 없으면 Utterance.text 길이 기준 → 동률 시 visibility 'all' 우선

### 3.3 LogView (로그 모드)

빠른 진행, 디버그성 톤, 시뮬레이션 관전. 좀비·전쟁·메타 추리 톤.

| 영역 | 비고 |
|---|---|
| Header | 현재 World State (StateChip 가로 나열) |
| Stream | LogEntry 시계열, 모노스페이스 |
| Composer | 명령형 free-input ("> 옥상으로 이동", "> 시우에게 묻다") |

### 3.4 SpriteSceneView (스프라이트 씬)

이동·조우 같은 비대화 비트. AgentIdentity(sprite) 여러 명을 무대 위에 배치, Utterance(floating)가 머리 위 말풍선으로 떠오름. VN 모드의 동적 버전.

### 3.5 ChoiceOverlay

모드와 무관하게 어떤 모드 위에도 풀스크린/하단 오버레이로 띄울 수 있는 ChoicePrompt 풀화면. timed variant가 자주 여기에 올라감.

### 3.6 DirectorPanel (관찰자/디버그)

User 플레이에서는 비활성. 개발/디버깅 시 사이드 패널로 열림.

| 영역 | 비고 |
|---|---|
| Roster | AgentIdentity(roster-row) 전체 명단 + presence |
| Goals | GoalChip 그룹별로 노출 |
| Relationships | RelationshipBadge 매트릭스 |
| Beat history | LogEntry 풀 히스토리 + 분기점 마커 |
| Mode switcher | 강제 모드 전환 버튼 |

---

## 4. 모드 전환 (ModeSwitcher)

전환은 `--motion-slow` 또는 `--motion-beat`로 호흡을 두고, 직전 모드의 마지막 Utterance가 새 모드에 대응하는 형태로 다시 렌더링되어 "같은 World가 시점만 바뀜"을 보여준다.

### 4.1 전환 권한 (3주체)

| 주체 | 트리거 | 예시 |
|---|---|---|
| **Director** | Beat 결과·임계치 자동 판정 | 긴장도 초과 시 단톡 → VN |
| **User** | 명시적 요청 | "이거 로그로 보여줘", 모드 토글 버튼 |
| **System** | 하드코딩된 규칙 | 선택 타임아웃 → 다음 Beat 강제, 챕터 시작 시 default 모드 |

→ Agent는 모드를 바꿀 수 없다. 모드는 메타-레이어다.

### 4.2 스트리밍 중 전환

**즉시 적용하지 않는다.** 토큰 스트림 도중 모드 전환 요청이 오면 `pendingMode` 상태로 큐잉했다가 **현재 Beat 종료 시점에 적용**한다.

| 단계 | 동작 |
|---|---|
| 전환 요청 발생 | ModeSwitcher가 `pendingMode` 세팅, 현재 모드 헤더에 작은 인디케이터 (`다음 비트부터 VN으로`) |
| 현재 Beat 진행 | 스트리밍 중인 Utterance는 현재 모드로 끝까지 렌더 |
| Beat 종료 | BeatTransition 발동 → `pendingMode` 적용 → 새 모드로 다음 Beat 시작 |

→ 도중에 끊지 않으니 사용자 체감 끊김이 없고, Beat 단위로 보장되니 데이터 정합성도 유지됨.

### 4.3 권장 전환 규칙 (Director용)

- 단톡 → VN: 긴장도 임계치 초과 시
- VN → 단톡: 긴장 해소, 다수 Agent 합류 시
- 모든 모드 → 로그: 시간 점프, 빠른 진행 요청 시
- 모든 모드 → SpriteScene: 위치 이동, 비대화 비트
- 모든 모드 → ChoiceOverlay: User 결정 강제 비트

전환 자체에 시각적 인디케이터(짧은 NarratorBlock 또는 무대 페이드)를 두어 User가 "장면이 바뀌었다"를 인지하게 한다.

---

## 5. 우선 적용 순서

1. **토큰 코드화** — 컬러/타이포/스페이싱/모션을 CSS 변수 또는 디자인 토큰 JSON으로
2. **BeatGroup + Utterance + StateChip + AgentIdentity** — 모든 모드의 기반. BeatGroup이 먼저여야 시각 그루핑이 자연스러움
3. **GroupChatView + LogView 먼저** — 가장 단순, 텍스트 위주, 일러스트 자산 의존도 낮음
4. **HiddenMarker + visibility POV 필터** — 멀티 에이전트 비밀 처리, 엔진 핵심
5. **VisualNovelView + SpriteSceneView** — 일러스트 자산 준비 후
6. **ChoicePrompt 전 variant** — 분기 메커니즘 확정 후
7. **ModeSwitcher / BeatTransition** — 위가 다 되면 모드 간 호흡 손보기
8. **DirectorPanel** — 디버그/QA용, 마지막

---

## 6. 미해결 / 결정 필요

### 6.1 해결됨

| 항목 | 결정 | 반영 위치 |
|---|---|---|
| Beat 단위 정의 | Beat = Utterance 묶음 + state_changes 컨테이너 | §0.1, §2.1 |
| Mood 표준화 | 닫힌 enum (10종), Beat.atmosphere ↔ Utterance.emotion 공유 어휘 | §1.7 |
| Genre / Mood / Theme | 3축 분리, 상호 비종속 | §0.2 |
| 모드 전환 권한 | Director / User / System 3주체만 | §4.1 |
| 스트리밍 중 전환 | 즉시 적용 X, 다음 Beat부터 적용 (pendingMode 큐잉) | §4.2 |
| 다수 동시 발화 | Chat: 시계열 그대로, VN: 대표 1 + 보조 floating | §3.2 |
| 다크 모드 | Stage(항상 다크) / Surface(라이트·다크) 토큰 분리 | §1.8 |
| 관찰자 정보 공개 | 일반 유저는 기본 비공개 + 단서 기반 fog, 제작자/디버그 전체 공개 | §2.8 |
| visibility 어휘 형식 | `VisibilityObject` 채택, `mode: allow` + `targets[]`, deny/except 미지원 | §0.5 |
| User POV 자동 노출 | User ≠ Character. `all` 또는 `user`만 자동 노출, Character ID는 자동 노출 없음 | §0.5 |
| action/state_changes 경계 | 서술은 Utterance, 실제 세계 변화는 반드시 `Beat.state_changes` | §0.6 |
| Theme 레이어 스펙 | Base/Story/Chapter Overlay/Mood Effects 4계층, 컬러·타이포·모션·표면 처리 허용 | §0.7 |

### 6.2 다음 결정 후보

v0.1의 핵심 데이터/표현 규칙은 위 항목까지 반영 완료. 다음 단계에서는 아래처럼 구현 세부만 남긴다.

- **StateChange 타입 enum 확정** — `location-move`, `mood-shift`, `flag-add`, `flag-remove`, `relationship`, `inventory` 등.
- **StoryPack JSON Schema 분리** — 디자인 문서와 별도로 검증 가능한 `storypack.schema.json` 작성.
- **Theme token JSON 분리** — CSS 변수와 런타임 ThemeProvider가 먹을 수 있는 `theme.schema.json` 작성.
- **DirectorPanel 권한 모델** — 일반 유저에게 절대 노출되지 않을 디버그 필드 목록 확정.
