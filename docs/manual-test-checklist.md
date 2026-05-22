# Hushline 수동 테스트 체크리스트

마지막 갱신: 2026-05-23

## 빠른 사전 확인

터미널에서 한 번만 확인:

```bash
corepack pnpm -r run check
corepack pnpm --filter @hushline/client build
corepack pnpm --filter @hushline/server test
```

현재 기준 자동 검증은 다음 상태로 통과해야 한다.

- TypeScript check: shared/client/server 통과
- client build: Vite production build 통과
- server tests: 25개 통과

## A/C 이후 내일 낮 수동 테스트 기준

### 1. 앱 시작/기본 진입

1. 서버와 클라이언트를 실행한다.
2. 새 v2 세션을 만든다.
3. 시나리오 목록이 보이고 기본 시나리오 상세가 깨지지 않는지 본다.
4. opening beats가 named fixed-cast 캐릭터로 덮이지 않고, 시나리오/나레이터성 안내로 표시되는지 확인한다.

통과 기준:
- 새로고침해도 세션 복원이 된다.
- 콘솔에 치명적인 오류가 없다.
- v2 세션 생성/advance/reroll/undo가 모두 응답한다.

### 2. 모델 연결 패널

1. Director, Narrator, 각 캐릭터 슬롯에 서로 다른 provider/model을 설정해본다.
2. default connection만 둔 상태도 테스트한다.
3. ChatGPT OAuth 항목은 API key 없이 브라우저 로그인 경로가 표시되는지 확인한다.
4. OpenRouter/NanoGPT는 모델 목록 로드 실패 시 직접 입력으로 우회 가능한지 본다.

통과 기준:
- 슬롯별 모델 선택이 UI에서 유지된다.
- 특정 캐릭터 슬롯이 비어 있으면 default connection으로 fallback한다.
- provider 실패 시 dry-run fallback 메시지와 fallbackReason이 과하게 UI를 망가뜨리지 않는다.

### 3. Director/Narrator/Character 역할 분리

같은 장면에서 5~8턴 정도 플레이한다.

확인할 입력 예시:

```text
여기 어디야? 다들 지금 뭐 봤어?
/action 문 쪽으로 천천히 다가간다.
/whisper 이거 누가 거짓말하는 거 같은데...
```

통과 기준:
- Director가 현재 장면 인과를 우선하고 갑자기 외부 사건만 던지지 않는다.
- Narrator는 감각/장면 묘사 위주이고 캐릭터 대사를 대신하지 않는다.
- Character는 자기 대사만 짧게 말하고, 다른 캐릭터 대사/나레이션을 생성하지 않는다.
- 2명 발화 시 둘의 반응 기능이 완전히 수렴하지 않고 각자 의도 차이가 보인다.

### 4. 정보 격리 / VisibilityGraph 연결 확인

이번 C 작업의 핵심 수동 확인이다.

테스트 방법:
1. Dev Panel에서 WorldState/handouts/characterStates를 열어둔다.
2. 한 캐릭터에게만 알려진 사실이 있는 상태를 만든다. 현재 UI에서 직접 factVisibility 편집이 없으면 서버 테스트 기준으로는 `factVisibility`가 worldState에 있을 때만 확인 가능하다.
3. 해당 캐릭터가 발화할 때 private handout의 `알고 있는 사실`에 자기에게 보이는 fact content만 들어가는지 본다.
4. 다른 캐릭터가 같은 턴에 그 사실을 전지적으로 말하지 않는지 본다.

통과 기준:
- `blockedFrom`에 들어간 캐릭터에게는 해당 fact가 보이지 않는다.
- `knownBy`에 있는 캐릭터에게만 fact content가 private handout에 포함된다.
- 기존 `characterStates[charId].knownFacts`와 `factVisibility`에서 보이는 fact가 합쳐져 전달된다.
- 같은 사실이 중복으로 반복 주입되지 않는다.

주의:
- FactRevealEngine의 정책 기반 공개/예산 차감은 아직 완전한 UI/시나리오 연결 검증 대상이 아니다.
- 이번 C 범위는 “VisibilityGraph 결과가 Character Agent private context에 실제 반영되는가”를 우선 확인한다.

### 5. Reroll/Undo 상태 보존

1. 2~3턴 진행한다.
2. Reroll을 눌러 마지막 응답이 다시 생성되는지 확인한다.
3. Undo를 눌러 직전 턴 state와 메시지가 빠지는지 확인한다.
4. Undo 이후 다시 advance했을 때 turnNumber/recentSpeakers가 꼬이지 않는지 본다.

통과 기준:
- turnNumber가 음수/중복/점프하지 않는다.
- recentEvents/recentSpeakerIds가 UI에서 과하게 누적되거나 소실되지 않는다.
- handout/knownFacts가 undo 후 엉뚱한 캐릭터로 섞이지 않는다.

### 6. CSS/레이아웃 회귀

1. 세션 선택 화면, 채팅 화면, Connection Panel, Dev Panel을 각각 열어본다.
2. 창을 좁게/넓게 바꿔본다.
3. 메시지가 길 때 스크롤이 막히지 않는지 확인한다.

통과 기준:
- 하단 입력창이 화면 밖으로 밀리지 않는다.
- 패널을 열어도 채팅 스크롤이 동작한다.
- 모바일 폭에서 주요 버튼이 겹치지 않는다.

## 발견 시 기록하면 좋은 것

버그를 발견하면 아래 형식으로 남기면 다음 작업이 빠르다.

```md
### 증상
-

### 재현 순서
1.
2.
3.

### 기대 동작
-

### 실제 동작
-

### 콘솔/서버 로그
-

### 사용한 provider/model/slot
-
```
