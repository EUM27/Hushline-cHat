# Theme Concepts 계획안

> 컴포넌트 분리 구조 위에서 작동하는 테마 시스템과 초기 컨셉 8종.
> 구현 명세 아님. 방향 합의용 계획서.

---

## 1. 컴포넌트 분리 전제

테마는 "기능"이 아니라 "껍데기"다. 엔진(턴 처리, 상태)은 그대로 두고 UI shell만 갈아끼운다.

```
ScenarioShell                  ← 장르/시나리오별 셸 컨테이너
├── DeviceFrame                ← 장치 메타포 프레임 (스킨 교체 지점)
│   ├── PhoneScreen
│   ├── LaptopArchiveScreen
│   ├── RecoveredTerminalScreen
│   └── BulletinBoardScreen
├── ChatTimeline               ← 공통: 메시지 시계열
├── MessageBubble              ← 공통: Utterance 렌더러
├── TypingIndicator            ← 공통: 타이핑 펄스
├── RevealDelay                ← 공통: 메시지 순차 노출
└── Composer                   ← 공통: 입력창
```

**원칙**:
- 공통 컴포넌트는 데이터에 종속, 모드에 비종속
- 테마는 셸·색·폰트·모션·오버레이만 바꿈, 데이터 의미는 못 바꿈 (design-system.md §0.7 준수)
- 테마 전환은 Beat 종료 시점에 적용 (`pendingThemeOverlay` 큐잉)

---

## 2. 테마가 영향을 주는 레이어

| 레이어 | 영향 범위 |
|--------|-----------|
| 컬러 토큰 | 배경, 액센트, 보더, mood tint |
| 타이포 | 제목·본문·나레이터·로그 폰트 |
| 모션 | fade, glitch, dissolve, shake |
| 표면 처리 | glass, grain, scanline, vignette |
| 사운드 무드 | 향후 — 배경 톤, 알림음 |
| 배경 그라데이션 | 단톡 모드 backdrop, scene-wash 오버레이 |
| Stage 영역 코팅 | VN 모드 배경 위 컬러 그레이딩 |

테마는 **장르를 강제하지 않는다.** 같은 호러 시나리오를 "파란 달밤"으로도, "VHS 호러"로도 돌릴 수 있어야 한다.

---

## 3. 테마 컨셉 8종

각 컨셉마다: 키워드, 핵심 팔레트(3색), 어울리는 시나리오, 모션·표면 톤.

### 3.1 파란 달밤 (Blue Moonlight) — *우선순위 1*

| 항목 | 값 |
|------|-----|
| 키워드 | 새벽 / 고요 / 외로움 / 슬로우번 |
| 핵심 색 | `#0F1A2E` (밤하늘) / `#3B5B8C` (달빛 남색) / `#E8E4DD` (창백한 텍스트) |
| 액센트 | `#A8C5E8` (달빛 하이라이트) |
| 폰트 | 본문 Pretendard light, 나레이터 Noto Serif KR italic |
| 모션 | `--motion-slow` 위주, fade-in 길게, glitch 없음 |
| 표면 | 창문 결로 텍스처(미세한 노이즈), 글로우 약하게 |
| 어울림 | 새벽 단톡, urban loneliness, slowburn mystery |
| 배경 그레이딩 | cool dim + pale bloom |

가장 먼저 만들 테마. 허쉬라인의 시그니처 톤이 될 가능성 높음. "메신저 + 야간 + 외로움" 조합이 RP 몰입과 정확히 맞물린다.

---

### 3.2 네온 시티 (Neon City)

| 항목 | 값 |
|------|-----|
| 키워드 | 사이버 / 비 / 고독 / 밤거리 |
| 핵심 색 | `#0A0A12` (검은 도로) / `#FF3D9A` (핑크 네온) / `#00E5FF` (시안 네온) |
| 액센트 | `#FFD700` (택시 옐로우) |
| 폰트 | 본문 Pretendard, 라벨 JetBrains Mono |
| 모션 | 빠른 fade, scanline 깜빡임, 약한 chromatic aberration |
| 표면 | 빗방울 글래스, 네온 글로우, 약한 motion blur |
| 어울림 | SF 스릴러, 사이버펑크, 추적극 |
| 배경 그레이딩 | wet street + magenta highlight |

---

### 3.3 흐린 안개 (Foggy)

| 항목 | 값 |
|------|-----|
| 키워드 | 몽환 / 기억 / 미스터리 / 흐릿함 |
| 핵심 색 | `#D8DDE2` (옅은 회색) / `#7A8C9A` (안개 청) / `#3F4A52` (어둠 끝) |
| 액센트 | `#B89B7A` (낡은 종이) |
| 폰트 | 본문 Pretendard, 나레이터 Noto Serif KR |
| 모션 | crossfade 길게, blur 전환, 천천히 dissolve |
| 표면 | gaussian blur 8px, 가장자리 페이드 |
| 어울림 | 추리, 회상씬, 기억 조작극 |
| 배경 그레이딩 | desaturated + heavy fog overlay |

---

### 3.4 아날로그 필름 (Analog Film)

| 항목 | 값 |
|------|-----|
| 키워드 | 복고 / 노이즈 / 추억 / 80-90년대 |
| 핵심 색 | `#F4E4C1` (필름 베이스) / `#8B5A3C` (세피아 그림자) / `#2A1F18` (어둠) |
| 액센트 | `#D7553D` (빨간 표지) |
| 폰트 | 본문 Pretendard, 라벨 Noto Serif KR (소문자 강조) |
| 모션 | grain 흔들림, 미세한 색번짐, 갑작스런 cut |
| 표면 | film grain, light leak, 가장자리 vignette |
| 어울림 | 학원 일상, 회상극, 가족 비밀 |
| 배경 그레이딩 | warm sepia + gentle bloom |

---

### 3.5 검은 성당 (Black Cathedral)

| 항목 | 값 |
|------|-----|
| 키워드 | 의식 / 비밀 / 고딕 / 종교적 무게 |
| 핵심 색 | `#0A0608` (칠흑) / `#5C1F1F` (포도주 적) / `#C9A86A` (촛불 금) |
| 액센트 | `#E8DAB2` (양피지) |
| 폰트 | 본문 Pretendard, 제목 Noto Serif KR bold, 라틴 small caps |
| 모션 | slow dissolve, 촛불 깜빡임 패턴 |
| 표면 | dark vignette + warm candle glow, gold leaf 텍스처 |
| 어울림 | 판타지 의식극, 컬트 미스터리, 다크 로맨스 |
| 배경 그레이딩 | crushed blacks + warm gold highlight |

---

### 3.6 따뜻한 겨울 (Warm Winter)

| 항목 | 값 |
|------|-----|
| 키워드 | 잔잔함 / 실내등 / 관계 / 안도 |
| 핵심 색 | `#3A2E26` (다크 우드) / `#E8B86A` (전구색) / `#F8EDD8` (크림) |
| 액센트 | `#9C5C3D` (벽돌 적) |
| 폰트 | 본문 Pretendard regular, 나레이터 Noto Serif KR |
| 모션 | 부드러운 ease, 빠른 모션 없음 |
| 표면 | warm bloom, 약한 grain, 창밖 눈송이 ambient |
| 어울림 | 일상극, 슬라이스 오브 라이프, 잔잔한 로맨스 |
| 배경 그레이딩 | warm tungsten + soft shadow |

---

### 3.7 투명 메신저 (Glass Messenger)

| 항목 | 값 |
|------|-----|
| 키워드 | 미니멀 / 유리 / 현대 / 깨끗함 |
| 핵심 색 | `#F4F6F9` (오프 화이트) / `#5468FF` (시그널 블루) / `#0E1116` (블랙) |
| 액센트 | `#34C759` (라이브 그린) |
| 폰트 | 본문 Pretendard, 라벨 Pretendard semibold |
| 모션 | 빠른 ease-out, 굵은 fade |
| 표면 | glassmorphism (backdrop-blur 24px), thin borders |
| 어울림 | 모던 일상, 직장극, 첩보·해킹 |
| 배경 그레이딩 | clean + cool 미세 tint |

기본(default) 테마 자리. design-system.md의 Emerald + Mustard와 별개의 "그냥 깔끔한" 옵션.

---

### 3.8 VHS 호러 (VHS Horror)

| 항목 | 값 |
|------|-----|
| 키워드 | 글리치 / CRT / ARG / 70-80년대 호러 |
| 핵심 색 | `#0D0D0D` (CRT 검정) / `#FF1F1F` (경고 적) / `#7FFFD4` (CRT 인광) |
| 액센트 | `#FFFF00` (트래킹 노랑) |
| 폰트 | 본문 Pretendard, 라벨/시스템 JetBrains Mono |
| 모션 | scanline scroll, RGB split, tracking error 점프 |
| 표면 | scanline overlay, vignette 진하게, chromatic aberration |
| 어울림 | 호러, ARG, found footage, 도시전설 |
| 배경 그레이딩 | crushed + 약한 noise + scanline |

호러 시나리오(school-life-anomaly) 톤 강화용. 기본 테마와 충돌하지 않게 페이지 단위 overlay로 적용.

---

## 4. 테마 토큰 구조 (구현 시 형태)

design-tokens.css에 base layer가 이미 있음. 테마는 별도 파일에서 base를 override.

```css
/* themes/blue-moonlight.css */
[data-theme="blue-moonlight"] {
  --color-bg-canvas: #0F1A2E;
  --color-bg-surface: #182742;
  --color-bg-surface-alt: #1F2F4D;
  --color-text-primary: #E8E4DD;
  --color-text-secondary: #A8C5E8;
  --color-brand-emerald-500: #3B5B8C;     /* 액센트 재배정 */
  --color-brand-mustard-500: #A8C5E8;     /* CTA를 달빛으로 */
  --shadow-floating: 0 12px 32px rgba(0, 8, 24, 0.6);
  /* 표면 효과 */
  --surface-grain: url("noise-fine.svg");
  --surface-bloom: radial-gradient(...);
}
```

**규칙**:
- Stage 토큰(`--color-bg-stage`)은 테마와 무관, 항상 다크 유지
- Mood 토큰(`--color-mood-*`)은 테마가 미세 보정만 가능, 의미는 못 바꿈
- 테마는 완전 셋(컬러+그림자+표면+옵션 폰트)을 한꺼번에 제공

---

## 5. 적용 우선순위

1. **컴포넌트 분리** — DeviceFrame / ChatTimeline / Composer로 분리. 테마 작업의 전제.
2. **ThemeProvider** — `data-theme` 속성을 `<html>`에 토글하는 React 훅.
3. **파란 달밤** 1종 먼저 — 시그니처 테마 검증.
4. **투명 메신저** — 기본값으로 사용할 깨끗한 옵션.
5. **VHS 호러 / 검은 성당** — 장르 강화용 dramatic 테마.
6. 나머지 4종은 시나리오 팩이 늘면서 추가.

---

## 6. 시나리오 팩과의 관계

시나리오 팩은 **추천 테마**를 manifest에서 지정만 한다. 강제는 안 함.

```json
{
  "id": "school-life-anomaly",
  "recommendedTheme": "vhs-horror",
  "fallbackTheme": "blue-moonlight"
}
```

유저가 다른 테마로 바꿀 수 있음. 테마는 시나리오 종속이 아니라 유저 취향 + 시나리오 추천의 조합.

---

## 7. 아직 안 정한 것

- DeviceFrame을 시나리오 팩이 지정할지, 테마가 지정할지 (둘 다 후보)
- 사운드 무드까지 테마에 묶을지 (지금은 보류)
- 다크 모드와 테마의 관계 — 라이트/다크 토글이 테마 안에 들어갈지, 별도 축으로 둘지
- mood 효과(scared, tense)가 테마별로 다른 색을 쓸지, 공통 enum을 유지할지
