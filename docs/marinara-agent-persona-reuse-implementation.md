# Marinara Agent / Persona Structure Reuse Implementation

작성일: 2026-05-20

## 1. 결론

Marinara Engine에서 직접 가져올 가치는 전체 agent/tracker 레이어가 아니라, 다음 두 가지였다.

- 생성기 구조: `persona-maker`, `character/advisor-maker`처럼 고정 JSON 계약을 가진 초안 생성 API
- 세션 초기화 연결: 생성된 persona/advisor draft를 실제 runtime character, handout, world state로 반영하는 경로

Hushline v2는 이미 `Director -> Narrator -> Character`와 `WorldState`, `PrivateHandout`, `OmniscientContext`가 정규 상태를 소유한다. 따라서 Marinara의 tracker-style agent를 그대로 붙이면 상태 소유권이 중복된다. 이번 작업에서는 agent layer를 추가하지 않고 onboarding draft를 v2 session contract에 연결하는 쪽만 반영했다.

## 2. 구현된 구조

### 2.1 Persona Maker

새 엔드포인트:

```text
POST /api/v2/persona-maker/generate
```

요청:

```json
{
  "prompt": "규칙을 의심하지만 사람을 쉽게 못 버리는 전학생",
  "connection": {
    "providerId": "openrouter",
    "apiKey": "...",
    "model": "..."
  }
}
```

응답:

```json
{
  "persona": {
    "name": "전학생",
    "shortName": "전학생",
    "role": "이상공간 단톡방에 끌려온 참여자...",
    "relationshipTags": ["user-persona", "scenario-participant", "scene-driver"]
  },
  "source": "api"
}
```

`connection`이 없거나 모델 응답이 유효한 JSON 계약을 만족하지 못하면 deterministic fallback을 반환한다.

### 2.2 Advisor Maker

새 엔드포인트:

```text
POST /api/v2/advisor-maker/generate
```

요청:

```json
{
  "prompt": "소리를 무서워해서 채팅 규칙을 먼저 확인하는 익명 조력자",
  "count": 2,
  "connection": {
    "providerId": "openrouter",
    "apiKey": "...",
    "model": "..."
  }
}
```

응답:

```json
{
  "advisors": [
    {
      "id": "advisor-1",
      "anonymousLabel": "[익명 1]",
      "role": "단톡방에서 위험 신호를 먼저 짚는 익명 조력자",
      "systemPrompt": "너는 [익명 1]로 보이는 조언자다...",
      "mbti": "ISTP",
      "ocean": {
        "openness": 52,
        "conscientiousness": 76,
        "extraversion": 34,
        "agreeableness": 46,
        "neuroticism": 68
      },
      "relationshipTags": ["advisor-slot", "risk-first", "generated-draft"],
      "autonomy": 0.55,
      "handout": {
        "secret": "이 조력자만 아는 비밀",
        "desire": "이 조력자가 원하는 것",
        "objective": "현재 런타임 목표",
        "initialRelationshipToUser": 1,
        "surfacePersonality": ["경고가 빠르다"],
        "fear": "두려워하는 것",
        "behaviorRules": ["대사는 짧게", "위험 규칙 우선"]
      }
    }
  ],
  "source": "api"
}
```

Persona Maker와 동일하게 connection이 없거나 응답 검증에 실패하면 fallback을 반환한다.

## 3. Session Create 연결

기존 문제:

- 클라이언트 onboarding은 `advisorDrafts`를 만들고 있었다.
- 하지만 `/api/v2/sessions`는 `persona.name`만 받았다.
- 결과적으로 사용자가 만든 advisor draft가 실제 v2 character, handout, world state에 들어가지 않았다.

변경 후:

```text
POST /api/v2/sessions
```

이제 요청 본문에 `advisors`를 받을 수 있다.

```json
{
  "scenarioPackId": "school-life-anomaly",
  "persona": {
    "name": "한서윤"
  },
  "advisors": [
    {
      "id": "advisor-1",
      "anonymousLabel": "[익명 22]",
      "role": "문틈의 규칙을 먼저 의심하는 감시자",
      "systemPrompt": "너는 [익명 22]다...",
      "mbti": "INTJ",
      "ocean": {
        "openness": 66,
        "conscientiousness": 82,
        "extraversion": 24,
        "agreeableness": 41,
        "neuroticism": 73
      },
      "relationshipTags": ["advisor-slot", "door-rule", "cold-observer"],
      "autonomy": 0.88,
      "handout": {
        "secret": "이 캐릭터만 아는 비밀",
        "desire": "이 캐릭터가 원하는 것",
        "objective": "현재 목표",
        "initialRelationshipToUser": -2
      }
    }
  ]
}
```

서버는 이 draft를 scenario pack의 advisor slot에 적용한다.

반영 위치:

- `session.characters`
- `session.handouts`
- `session.worldState.characterStates`
- v1-compatible `session.scene.relationships`

advance/reroll 시에도 저장된 `session.characters`를 runtime pack에 다시 반영하므로, draft 기반 캐릭터 정보가 다음 턴에서 사라지지 않는다.

## 4. 타입 변경

공유 타입에 다음 구조를 추가했다.

```typescript
interface PersonaDraft {
  name: string;
  shortName?: string;
  role: string;
  relationshipTags: string[];
}
```

`AdvisorDraft`에는 v2 runtime 초기화에 필요한 필드를 추가했다.

```typescript
interface AdvisorDraft {
  id: string;
  anonymousLabel: string;
  role: string;
  systemPrompt: string;
  mbti: string;
  ocean: {
    openness: number;
    conscientiousness: number;
    extraversion: number;
    agreeableness: number;
    neuroticism: number;
  };
  relationshipTags: string[];
  autonomy?: number;
  handout?: Partial<CharacterHandoutDefinition>;
}
```

`CharacterDefinition`에는 클라이언트 호환을 위해 optional `relationshipTags`를 추가했다.

## 5. 변경 파일

서버:

- `packages/server/src/app-v2.ts`
  - maker endpoints 추가
  - session create의 `advisors` 계약 추가
  - advisor draft를 `CharacterDefinition`과 `CharacterHandoutDefinition`으로 변환
  - advance/reroll runtime pack에 session character 재반영

- `packages/server/src/engine-v2/schemas.ts`
  - `CharacterDefinition` 검증 스키마에 `relationshipTags` 추가

- `packages/server/src/__tests__/api-v2.test.ts`
  - advisor draft session wiring 테스트 추가
  - persona/advisor maker fallback 테스트 추가

클라이언트:

- `packages/client/src/api-v2.ts`
  - `createSessionV2`가 `advisors`를 전송하도록 확장
  - `generatePersonaDraftV2`, `generateAdvisorDraftsV2` 추가

- `packages/client/src/App.tsx`
  - onboarding에서 생성된 `advisorDrafts`를 session create 요청에 전달

공유 타입:

- `packages/shared/src/index.ts`
  - `PersonaDraft` 추가
  - `AdvisorDraft.autonomy`, `AdvisorDraft.handout` 추가

- `packages/shared/src/engine-v2.ts`
  - `CharacterDefinition.relationshipTags` 추가

## 6. 검증 결과

통과한 명령:

```powershell
corepack pnpm --filter @hushline/server test
corepack pnpm --filter @hushline/server check
corepack pnpm --filter @hushline/client check
```

결과:

- server test: 19 pass
- server typecheck: pass
- client typecheck: pass

## 7. 현재 한계

- Maker endpoint는 서버 API와 client wrapper까지만 추가되었다.
- 클라이언트 UI에서 자유 입력 prompt로 maker endpoint를 호출하는 화면은 아직 연결하지 않았다.
- 현재 onboarding UI는 기존 random advisor draft 생성 흐름을 유지하며, 그 draft가 session create에 반영되도록 연결된 상태다.
- NotebookLM/Notion에는 아직 동기화하지 않았다. 이 문서가 현재 로컬 canonical handoff다.

## 8. 다음 단계 후보

우선순위가 높은 다음 작업:

1. Onboarding의 advisor 생성 단계에 prompt 입력과 `generateAdvisorDraftsV2` 호출을 연결한다.
2. Persona 단계에 `generatePersonaDraftV2` 호출을 연결하고, 생성된 `role`/`relationshipTags`를 session persona 확장에 반영할지 결정한다.
3. Director state에 Marinara `secret-plot-driver` 계열 아이디어를 직접 agent로 붙이지 말고, `arcState`, pacing, stale detection 같은 director-owned state로 설계한다.
4. 이 문서를 NotebookLM source와 Notion project index에 등록할지 결정한다.
