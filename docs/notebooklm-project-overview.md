# Hushline Chat — 프로젝트 전체 분석 (NotebookLM용)

> 이 문서는 Hushline Chat 프로젝트의 전체 구조, 설계 철학, 기술 스택, 핵심 시스템을 하나의 문서로 정리한 것입니다.

---

## 1. 프로젝트 정의

**Hushline Chat**은 멀티 에이전트 생성형 상황 엔진(Multi-Agent Generative Situation Engine)입니다.

핵심 개념:
- Director AI가 상황을 굴리고
- Character AI들이 각자 목적, 지식, 비밀대로 독립적으로 움직이며
- User가 개입해 세계 상태를 변동시키는 실시간 드라마 생성 엔진

UI는 한국어 메신저 앱(단톡방) 형태로 제공되지만, 본질은 "현재 세계 상태를 표현하는 인터페이스"입니다. 장르는 변수(공포, 추리, 연애, SF 등)이고, "목표와 관계 충돌" 위에서 작동하는 엔진이 상수입니다.

---

## 2. 기술 스택

| 계층 | 기술 |
|------|------|
| 패키지 관리 | pnpm 10.30.3 (모노레포) |
| 언어 | TypeScript 전체 |
| 클라이언트 | React 19 + Vite 7 + Lucide React (아이콘) |
| 서버 | Bun 런타임 + Hono 웹 프레임워크 |
| 검증 | Zod 4 (스키마 검증) |
| 저장소 | SQLite (세션 영속화) |
| AI 프로바이더 | NanoGPT, OpenRouter (OpenAI 호환 API) |
| 공유 타입 | @hushline/shared 워크스페이스 패키지 |

---

## 3. 모노레포 구조

```
hushline-chat/
├── packages/
│   ├── shared/          → 클라이언트/서버 공유 TypeScript 타입
│   ├── client/          → React SPA (메신저 스타일 UI)
│   └── server/
│       ├── src/
│       │   ├── index.ts           → Bun.serve 진입점
│       │   ├── app.ts             → v1 API (레거시)
│       │   ├── app-v2.ts          → v2 API (현재 메인)
│       │   ├── engine-v2/         → 멀티 에이전트 턴 엔진
│       │   │   ├── pipeline.ts    → 턴 오케스트레이터
│       │   │   ├── director.ts    → Director 에이전트
│       │   │   ├── narrator.ts    → Narrator 에이전트
│       │   │   ├── character.ts   → Character 에이전트
│       │   │   ├── context-builder.ts → 지식 계층 조립
│       │   │   ├── input-classifier.ts → 입력 모드 분류
│       │   │   ├── output-sanitizer.ts → 출력 검증/정제
│       │   │   ├── scenario-loader.ts → 시나리오 팩 로딩
│       │   │   ├── state-manager.ts → 월드 스테이트 관리
│       │   │   ├── schemas.ts     → Zod 검증 스키마
│       │   │   ├── summarizer.ts  → 컨텍스트 윈도우 관리
│       │   │   └── card-importer.ts → 캐릭터 카드 임포트
│       │   ├── store/             → SQLite 세션 저장소
│       │   └── providers/         → API 프로바이더 어댑터
│       └── scenarios/             → 파일 기반 시나리오 팩
├── docs/                → 분석 문서
└── design-system.md     → UI 디자인 시스템 명세
```

---

## 4. 핵심 아키텍처: 멀티 에이전트 턴 파이프라인

이 프로젝트의 핵심 혁신은 턴 처리를 여러 독립 AI 에이전트로 분리한 것입니다.

### 턴 처리 흐름

```
유저 입력
    ↓
[1] Input Classification (chat / action / whisper)
    ↓
[2] Context Assembly (Public / Omniscient / Private)
    ↓
[3] Director Agent 호출 → 구조화된 JSON 결정
    ↓
[4] Narrator Agent 호출 (조건부) → 1-2문장 감각 묘사
    ↓
[5] Character Agent(s) 호출 (1-2명, 병렬) → 대사만
    ↓
[6] State Update → World State 갱신
    ↓
[7] Message Assembly → 클라이언트 응답
```

### 에이전트별 역할과 지식 범위

| 에이전트 | 역할 | 아는 것 | 출력 형식 |
|----------|------|---------|-----------|
| Director | 세계의 적대적 의지. 누가 말할지, 무슨 이벤트가 일어날지, 긴장도 변화를 결정 | 전지적 (모든 비밀, 모든 관계, 모든 목표) | JSON만 (DirectorOutput 스키마) |
| Narrator | 감각/공간 묘사 전담 | 공개 정보만 (캐릭터 비밀 모름) | 1-2문장 나레이션 (대사 금지) |
| Character | 개별 캐릭터 대사 생성 | 자기 핸드아웃만 + 공개 채팅 로그 | 대사만 (나레이션 금지, 다른 캐릭터 대사 금지) |

---

## 5. 지식 계층 분리 (Knowledge Layer Separation)

드라마의 핵심은 정보 비대칭입니다. 이 엔진은 세 가지 지식 계층을 엄격히 분리합니다.

### Public Context (공개 정보)
- 공유 채팅 로그
- 현재 위치, 배경
- 긴장도, 위험도
- 공개적으로 관찰된 이벤트
- 메인 목표 설명

### Private Handout (캐릭터별 비공개 정보)
- 해당 캐릭터의 비밀 (secret)
- 욕망 (desire)
- 목표 (objective)
- 유저와의 관계 수치
- 알고 있는 사실 목록 (knownFacts)
- 자기가 느끼는 다른 캐릭터와의 관계

### Omniscient Context (Director 전용 전지적 정보)
- 모든 캐릭터의 비밀
- 모든 캐릭터의 욕망과 목표
- 전체 관계 그래프
- 이벤트 트리거 조건
- 장르별 목표
- 최근 이벤트 히스토리

---

## 6. Director Agent — 세계의 적대적 의지

Director는 중립적 진행자가 아닙니다. 장르의 드라마적 압력을 대표하는 적대적 힘입니다.

### 장르별 Director 목표

**공포 (horror)**:
- 유저를 고립시킨다
- 안전감을 빼앗는다
- 긴장을 점진적으로 올린다
- 관계에 의심을 심는다
- 현실을 침식한다
- 탈출을 지연시킨다 (단, 항상 최소 하나의 생존 경로를 남긴다)

**추리 (mystery)**:
- 진실을 늦게 드러낸다
- 단서를 분산시킨다
- 거짓 정보를 섞는다
- 증거를 충돌시킨다
- 조사를 보상하되 즉각적 해답은 주지 않는다

### Director 출력 스키마 (DirectorOutput)

```typescript
interface DirectorOutput {
  speakers: string[];           // 이번 턴에 말할 캐릭터 ID (1-2명)
  silence: boolean;             // true면 아무도 말하지 않는 침묵 턴
  event: string | null;         // 이번 턴의 서사 이벤트
  narratorInstruction: string | null;  // 나레이터에게 줄 장면 지시
  characterIntents: Record<string, string>;  // 각 캐릭터에게 줄 의도 지시
  stateDelta: {                 // 상태 변화량 (절대값 아님)
    tension?: number;
    danger?: number;
    locationId?: string;
    backgroundId?: string;
    sceneMode?: SceneMode;
  };
  subObjectiveUpdate: {...} | null;    // 세부 목표 변경
  relationshipUpdate: {...} | null;    // 관계 그래프 변경
  directives: DirectorDirective[];     // 클라이언트 연출 지시
  delay: number | null;                // 메시지 표시 전 대기 시간(ms)
}
```

---

## 7. World State (세계 상태)

모든 에이전트가 참조하는 정규 런타임 상태입니다.

```typescript
interface WorldState {
  sessionId: string;
  scenarioId: string;
  sceneMode: SceneMode;        // messenger | exploration | dialogue | tension | crisis | resolution
  locationId: string;
  backgroundId: string;
  tension: number;             // 0-10
  danger: number;              // 0-10
  turnNumber: number;
  hasEnteredScene: boolean;
  mainObjective: Objective;
  subObjectives: SubObjective[];
  characterStates: Record<string, CharacterStateV2>;
  relationshipGraph: RelationshipEdge[];
  recentEvents: NarrativeEvent[];
  recentSpeakerIds: string[];
}
```

---

## 8. 시나리오 팩 시스템

시나리오는 코드 변경 없이 파일 기반으로 추가할 수 있습니다.

### 디렉토리 구조

```
scenarios/{pack-id}/
├── manifest.json          → 메타데이터 (id, title, genre, version)
├── scenario-card.json     → 규칙, 오프닝 비트, 톤, 금지사항
├── characters/            → 캐릭터별 JSON (프로필 + 핸드아웃 + 관계)
├── prompts/
│   ├── director.txt       → Director 시스템 프롬프트
│   └── narrator.txt       → Narrator 시스템 프롬프트
├── objectives/
│   └── main.json          → 메인 목표 정의
└── events/
    └── triggers.json      → 조건부 이벤트 트리거
```

### 현재 구현된 시나리오

**1. school-life-anomaly (학교생활 — 이상공간 단톡방)**
- 장르: 공포
- 설정: 평범한 단체 채팅방 형태의 폐쇄형 이상공간. 초대 알림을 확인하는 순간 현실 공간이 낡고 뒤틀린 학교 건물로 강제 전이됨
- 캐릭터: 익명 생존자들 ([익명 1], [익명 N]...), 방장 (공간의 절대 규칙)
- 특징: 채팅방에서 언급되는 상황이 유저 주변 현실에 물리적으로 구현됨
- 이벤트 트리거: 정전, 천장 소리, 방장 경고, 인원 감소

**2. locked-room-mystery (백화장 살인사건 — 밀실 군상 추리극)**
- 장르: 추리
- 설정: 강원도 산속 3층 서양식 대저택. 폭설로 고립된 상태에서 저택 주인이 밀실에서 살해됨
- 캐릭터: 하진우 (비서, 횡령 비밀), 서유라, 신지연, 곽상철 — 각자 비밀과 동기 보유
- 특징: 유저가 특정 장소를 지목해 조사할 때만 단서 제공. 추리의 정답은 유저가 논리로 증명하기 전까지 절대 먼저 밝히지 않음
- 이벤트 트리거: 알리바이 충돌, 정전, 증거 훼손, 자백 압박

---

## 9. 캐릭터 시스템

### 캐릭터 정의 구조

```typescript
interface CharacterDefinition {
  id: string;
  name: string;
  shortName: string;
  role: string;
  profileKind: "advisor-slot" | "named-actor";
  anonymousLabel?: string;      // [익명 1] 등
  mbti: string;
  ocean: { openness, conscientiousness, extraversion, agreeableness, neuroticism };
  autonomy: number;             // 0.0-1.0 (Director 지시 준수도)
  systemPrompt: string;
  handout: {
    secret: string;             // 이 캐릭터만 아는 비밀
    desire: string;             // 욕망
    objective: string;          // 현재 목표
    initialRelationshipToUser: number;
    surfacePersonality?: string[];
    fear?: string;
    behaviorRules?: string[];
  };
  relationships: Array<{        // 다른 캐릭터와의 관계
    targetId: string;
    descriptor: string;         // "distrust", "suspicion", "wary_ally" 등
    intensity: number;          // 0-10
  }>;
}
```

### Autonomy Score (자율성 점수)

- 0.0-0.3: Director 지시에 엄격히 따름 (예측 가능한 조력자)
- 0.4-0.6: 중간 (기본값)
- 0.7-1.0: Director 지시를 재해석하거나 부분적으로 거부 가능 (예측 불가능한 와일드카드)

---

## 10. 입력 모드 시스템

유저 입력은 세 가지 모드로 분류됩니다:

| 모드 | 의미 | 텍스트 컨벤션 | 엔진 처리 |
|------|------|--------------|-----------|
| chat | 단톡방에 보내는 메시지 | 일반 텍스트 | 모든 캐릭터가 읽고 반응 가능 |
| action | 장면 안에서의 물리적 행동 | *별표로 감싸기* | 나레이터 항상 호출, 긴장도 상승 |
| whisper | 내면의 독백 | ((괄호로 감싸기)) | 캐릭터는 못 들음, 나레이터만 반응 가능 |

---

## 11. API 설계 (v2)

모든 v2 엔드포인트는 `/api/v2/` 하위:

| 메서드 | 경로 | 기능 |
|--------|------|------|
| GET | /scenarios | 사용 가능한 시나리오 팩 목록 |
| GET | /scenarios/:packId | 시나리오 상세 정보 |
| POST | /sessions | 세션 생성 (팩 로드 → 월드 스테이트 초기화 → 오프닝 비트 생성) |
| GET | /sessions/:id | 세션 복원 |
| POST | /sessions/:id/advance | 메인 턴 (유저 입력 → 전체 파이프라인 → 응답) |
| POST | /sessions/:id/reroll | 마지막 턴 재실행 (같은 입력, 다른 결과) |
| POST | /sessions/:id/undo | 마지막 턴 삭제 (에이전트 재호출 없음) |

---

## 12. 클라이언트 UI

### 레이아웃 구조 (3-column grid)
- 왼쪽: 시나리오 카드 (제목, 긴장도, 위험도)
- 중앙: 채팅 프레임 (메시지 로그 + 입력 컴포저)
- 오른쪽: 모델 연결 패널 (프로바이더/모델/API키 설정)

### 셋업 플로우
1. 시나리오 선택
2. 페르소나 이름 입력
3. 익명 조언자 생성 (랜덤 풀에서 선택)
4. 세션 시작 → 오프닝 비트 재생

### 연결 슬롯 시스템
각 에이전트(Director, Narrator, 각 캐릭터)에 별도 AI 모델을 할당할 수 있습니다:
- 기본 연결: 전체 폴백
- Director 슬롯: JSON 출력에 강한 모델 권장
- Narrator 슬롯: 문체에 강한 모델 권장
- 캐릭터별 슬롯: 개별 설정 가능

API 키가 없으면 dry-run 모드로 동작 (결정론적 플레이스홀더 출력).

### 메시지 타이핑 애니메이션
오프닝 비트와 응답 메시지는 순차적으로 reveal되며, 타이핑 펄스 애니메이션으로 메신저 느낌을 줍니다.

---

## 13. 디자인 시스템

### 핵심 원칙
- 같은 데이터가 다른 뷰 모드에서 다르게 표현됨
- Beat는 시각적 단위 (Utterance 묶음 + state_changes)
- Visibility는 1급 시민 (정보 비대칭의 시각적 표현)
- Stage(무대)는 항상 다크, Surface(앱 셸)만 라이트/다크 전환

### 컬러 팔레트
- **Emerald** (브랜드 포인트): #2D5F4F
- **Mustard** (CTA/강조): #E8C547
- **Stage 배경**: #1A1A1A (항상 다크)
- **Surface**: #FAF8F5 (라이트) / #15140F (다크)

### 뷰 모드 (설계됨, 현재 GroupChat만 구현)
1. GroupChatView (단톡 모드) — 현재 구현
2. VisualNovelView (VN 모드) — 미구현
3. LogView (로그 모드) — 미구현
4. SpriteSceneView (스프라이트 씬) — 미구현
5. DirectorPanel (디버그) — 부분 구현 (Dev Panel)

### Mood Enum (10종, 닫힌 어휘)
neutral, warm, cold, tense, scared, angry, sad, amused, surprised, resigned

---

## 14. 이벤트 트리거 시스템

시나리오 팩에 정의된 조건부 이벤트입니다. Director가 조건 충족 여부를 판단합니다.

예시 (학교생활):
```json
{
  "id": "blackout",
  "condition": "danger >= 5 AND turnNumber >= 3",
  "description": "복도 전체 정전. 형광등이 하나씩 꺼지며 완전한 암흑.",
  "oneShot": true
}
```

예시 (밀실 추리):
```json
{
  "id": "alibi-conflict",
  "condition": "turnNumber >= 3 AND 유저가 2명 이상의 증언을 확보함",
  "description": "두 용의자의 알리바이가 서로 모순됨이 드러난다.",
  "oneShot": true
}
```

---

## 15. 관계 그래프 시스템

캐릭터 간 관계는 방향성 있는 그래프로 관리됩니다.

```typescript
interface RelationshipEdge {
  sourceId: string;      // 느끼는 주체
  targetId: string;      // 대상
  descriptor: string;    // "distrust", "curiosity", "hidden_affection", "hatred"
  intensity: number;     // 0-10
}
```

- Director만 전체 그래프를 봄
- 각 캐릭터는 자기가 느끼는 관계만 봄 (다른 사람이 자기를 어떻게 느끼는지 모름)
- Director가 턴마다 관계 변화를 출력할 수 있음

---

## 16. 방어적 출력 처리 (Defensive Output Processing)

AI 출력의 품질을 보장하기 위한 후처리:

- Character 출력에서 화자 라벨 제거 ([익명 1]: 같은 접두사)
- Character 출력에서 다른 캐릭터 라벨 발견 시 해당 지점에서 절단
- Character 출력에서 나레이션 문단 제거
- Narrator 출력에서 대사 라벨 발견 시 절단
- Director 출력이 유효한 JSON이 아니면 안전한 기본값으로 폴백

---

## 17. 세션 영속화

- 매 턴 후 완전한 WorldState + 메시지 히스토리를 SQLite에 저장
- 페이지 새로고침 시 세션 복원 (localStorage에 세션 ID 저장)
- Undo: 마지막 턴 메시지 제거 + turnNumber 감소
- Reroll: 마지막 턴 제거 후 같은 입력으로 파이프라인 재실행

---

## 18. RP 프리셋 분석에서 가져온 설계 원칙

9개의 RP 프리셋(Sushi, Nemo Engine, KittyLotus, Megumin, Paramnesia, Frankenstein, Lucid Loom)을 분석하여 추출한 핵심 규칙:

### 엔진에 코드로 구현한 것
1. **유저 에이전시 보호**: AI가 유저 캐릭터의 행동/대사/생각을 대신 쓰지 않음
2. **정보 방화벽**: NPC는 직접 인지한 것만 앎 (전지성 금지)
3. **장면 진행 압력**: 정체 시 자동으로 새 자극 주입
4. **NPC 자율 행동**: 각 NPC가 독립적 목표와 일정을 가짐
5. **T+1 연속성**: 유저 입력을 재진술하지 않고 결과부터 시작
6. **오프스크린 시뮬레이션**: 유저가 안 볼 때도 NPC 시간이 흐름

### 삭제한 것
- 정책 우회/Jailbreak 문구
- 과도한 NSFW 지시
- README/가이드가 프롬프트에 포함된 것
- 중복 XML 래퍼 태그
- 장식적 페르소나 프레이밍

### 토큰 효율 최적화
- 규칙을 엔진 코드로 이동 (-60%)
- 상태를 구조화 JSON으로 (-20%)
- 슬롭 처리를 후처리로 (-15%)
- 프롬프트 압축 (-10%)
- 목표: 턴당 1400-3000 토큰 (기존 프리셋 대비 50-80% 절감)

---

## 19. NPC 사실 공개 시스템 (NpcFactRevealEngine)

일본식 자유대화 추리 게임 구조에서 가져온 핵심 모듈:

- NPC는 고정 대사가 아니라 fact + reveal policy로 작동
- 플레이어는 선택지가 아니라 자유 질문으로 진행
- 엔진이 질문의 주제, 증거 제시 여부, 말투, 관계 상태를 해석
- NPC는 지식 범위, 성격, 목표, 위험도에 따라 답함
- 공개 수준: none / hint / partial / full / lie / deflect / mistaken_answer

이 모듈의 본질은 추리가 아니라 **정보 비대칭 기반 장면 발생**입니다. 모든 장르에 적용 가능합니다.

---

## 20. 미래 계획

### 배경 이미지 시스템 (미구현)
1. 현재: backgroundId 문자열 + 프리셋 이미지
2. 다음: AI 실시간 생성 (DALL-E / Stability / ComfyUI)
3. 마지막: 비전 모델 자동 태깅 + 유저 업로드

### 추가 뷰 모드
- VisualNovelView (스프라이트 + 대사 박스)
- LogView (모노스페이스 로그)
- SpriteSceneView (동적 스프라이트 배치)

### 컨텍스트 윈도우 관리
- summarizer.ts로 일정 턴 간격마다 요약 생성
- 오래된 메시지를 요약으로 대체하여 토큰 절약

---

## 21. 핵심 설계 철학 요약

1. **장르는 변수, 엔진은 상수**: 어떤 톤이든 "목표와 관계 충돌" 위에서 작동
2. **Director는 적대적 힘**: 중립 진행자가 아니라 장르의 드라마적 압력을 대표
3. **정보 비대칭이 드라마의 원천**: 누가 무엇을 알고, 무엇을 원하고, 무엇을 할 수 있는가
4. **유저 ≠ 캐릭터**: 유저는 세계 안에 개입하는 별도 참가자/관찰자
5. **좋은 RP 엔진은 "잘 못하게 막는 시스템"**: 유저 조종 금지, 전지성 금지, 상태 리셋 금지, 장면 정체 금지
6. **파일 기반 시나리오**: 코드 변경 없이 새 시나리오 추가 가능
7. **슬롯별 모델 라우팅**: 각 에이전트에 최적화된 모델 할당 가능

---

*이 문서는 2026년 5월 13일 기준 프로젝트 상태를 반영합니다.*
