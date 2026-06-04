# 설계 메모 — 페르소나 시스템

> 상태: **참조 재점검 완료 / 구현 전 spec 재정의 필요**.
> 이전 메모는 "입력 경로 연결"만 다뤘지만, 사용자 지적대로 Marinara Engine과 SillyTavern Lab을
> 먼저 본 뒤 Hushline에 필요한 페르소나 범위를 다시 잡았다.

---

## 1. 참조 결과

### Marinara Engine에서 본 것

- 페르소나는 이름/역할이 아니라 유저 캐릭터 카드에 가깝다.
- 주요 필드: `description`, `personality`, `scenario`, `backstory`, `appearance`, avatar,
  alt descriptions, persona stats.
- Prompt assembly는 active persona를 찾아 description/personality/backstory/appearance/scenario를
  의미별 필드로 감싸 넣는다.
- Game/tracker 쪽은 persona stats까지 추적한다.

### SillyTavern / ST-Hushline Lab에서 본 것

- SillyTavern persona description은 prompt 위치(IN_PROMPT, Author's Note, depth prompt)를 선택할 수 있다.
- ST-Hushline Lab은 실제 사용자 이름을 prompt에 하드코딩하지 않고 `{{user}}`를 유지했다.
- 사용자 정보, 공개 인물 정보, 현재 발화자 핸드아웃은 별도 블록으로 분리했다.
- 긴 도입부를 persona/user가 말하면 NPC가 그 persona를 narrator/director처럼 오해한다.
- Character prompt는 긴 금지문보다 surface transcript와 정보 경계가 핵심이다.

---

## 2. Hushline에 바로 필요한 것

1. 이름-only는 부족하다.
2. `description`과 `appearance`는 분리해야 한다.
3. `role`은 "장면 안에서 유저가 어떤 입장인가"를 짧게 주는 필드로 유지한다.
4. Character에게는 "사용자/플레이어"가 아니라 "장면 속 상대 인물"로 보여야 한다.
5. Director, Character, Narrator, Guard가 같은 페르소나를 다른 가시성으로 봐야 한다.

---

## 3. 1차 범위

세션 페르소나:

```ts
{
  id: "user",
  name: string,
  shortName: string,
  role?: string,
  description?: string,
  appearance?: string,
  relationshipTags?: string[]
}
```

에이전트별 brief:

- Director: 전체 first-pass persona + player agency framing.
- Character: 장면 속 상대 인물의 공개 role/description/appearance/tags. 메타 라벨 금지.
- Narrator: 관찰 가능한 appearance/role 중심. 내면 단정 금지.
- Guard: name/shortName/alias로 user action hijack/dialogue detection.

---

## 4. 이번에 하지 않는 것

- Marinara식 persistent persona library.
- avatar/crop/sprite reference.
- persona stats/RPG stats.
- alt descriptions.
- persona lorebook linking.
- prompt 위치 옵션 UI.

이들은 Hushline이 reusable persona library나 game-mode tracker를 필요로 할 때 별도 spec으로 한다.

---

## 5. 기존 dirty WIP에서 조정할 점

현재 dirty diff에는 `PersonaBrief`, `buildPersonaBrief`, Director/Character 주입, create-session schema 확장이
이미 일부 들어가 있다. 이걸 그대로 진행하면 Character prompt에 Director식 "사용자(플레이어)" 표현이
들어갈 위험이 있다.

정리 방향:

- single `PersonaBrief` 대신 layered brief로 나눈다.
- `appearance?`를 추가한다.
- Character prompt의 persona 섹션 문구를 `사용자/플레이어`가 아니라 `[상대 인물 정보]`로 바꾼다.
- 이름 미소개 마스킹을 유지한다.
- persona public info, public character info, private handout을 분리한다.

---

## 6. 관련 파일

- `.kiro/specs/persona-system/requirements.md`
- `.kiro/specs/persona-system/design.md`
- `.kiro/specs/persona-system/tasks.md`
- `packages/shared/src/engine-v2/session.ts`
- `packages/shared/src/engine-v2/context.ts`
- `packages/shared/src/index.ts`
- `packages/server/src/app-v2/schemas.ts`
- `packages/server/src/app-v2/session-routes.ts`
- `packages/server/src/app-v2/session-presenter.ts`
- `packages/server/src/engine-v2/context-builder.ts`
- `packages/server/src/engine-v2/director.ts`
- `packages/server/src/engine-v2/character.ts`
- `packages/server/src/engine-v2/pipeline.ts`
- `packages/client/src/components/setup/PersonaSetupPanel.tsx`
- `packages/client/src/api-v2.ts`
- `packages/client/src/hooks/useSessionActions.ts`
- `packages/client/src/App.tsx`
- `packages/client/src/types/ui.ts`

---

## 7. 다음 작업

1. 현재 dirty persona WIP를 새 spec에 맞춰 재정렬한다.
2. `appearance?`와 layered brief 타입/빌더를 추가한다.
3. Character prompt의 메타 라벨을 제거한다.
4. 세션 생성/DTO/클라이언트 입력을 full persona object로 연결한다.
5. focused tests + leak/agency guard + check/build 검증을 돌린다.
