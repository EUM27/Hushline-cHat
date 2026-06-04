# Design Document — Persona System

## Overview

페르소나 시스템은 Marinara의 풍부한 유저 캐릭터 카드와 SillyTavern의 `{{user}}`/persona prompt
삽입 방식을 참고하되, Hushline의 정보 격리 구조에 맞게 더 작게 시작한다.

1차 목표:

- 세션 페르소나에 name/shortName/role/description/appearance/relationshipTags를 영속한다.
- 같은 페르소나를 Director, Character, Narrator, Guard에 서로 다른 brief로 전달한다.
- Character는 유저를 메타적 플레이어가 아니라 "장면 속 상대 인물"로 인식한다.
- 기존 이름 미소개 마스킹과 유저 agency guard를 약화하지 않는다.
- 클라이언트 setup에서 필요한 최소 필드를 입력/생성/전송한다.

비목표:

- Marinara식 avatar library, persistent persona library, persona stats, RPG stats, alt descriptions,
  appearance sprite references는 1차 범위가 아니다.
- Character에게 hidden truth, NPC private handout, Director intent, real user metadata를 전달하지 않는다.

## Reference Findings

### Marinara Engine

Marinara `Persona`는 `description`, `personality`, `scenario`, `backstory`, `appearance`, avatar,
alt descriptions, persona stats를 가진다. Prompt layer는 active persona를 찾아 `description`,
`personality`, `backstory`, `appearance`, `scenario`를 별도 필드로 감싸 주입한다.

Hushline에 바로 가져올 것:

- `description`과 `appearance`를 분리한다.
- prompt에 넣을 때 한 덩어리 문자열이 아니라 의미별 필드로 감싼다.
- stats/avatar/alt descriptions는 후속 확장 포인트로만 남긴다.

### SillyTavern / ST-Hushline Lab

SillyTavern은 persona description을 prompt 본문, Author's Note, depth prompt에 삽입할 수 있다.
ST-Hushline Lab은 실제 이름을 하드코딩하지 않고 `{{user}}`, 사용자 정보, 공개 인물 정보, 핸드아웃을
분리했다. 또한 긴 도입부를 persona가 말하면 NPC가 persona를 narrator/director처럼 오해한다는
문제를 기록했다.

Hushline에 바로 가져올 것:

- user/persona public info와 NPC handout을 같은 prompt 블록에 섞지 않는다.
- Character prompt에서 `사용자/플레이어` 메타 라벨을 제거한다.
- 긴 persona description은 장면 사실 선언이 아니라 유저 캐릭터 배경으로만 취급한다.
- 출력 guard는 user action hijack/mirroring을 계속 잡는다.

## Architecture

```
SessionStateV2.persona
  { id, name, shortName, role?, description?, appearance?, relationshipTags? }
        │
        ├─ buildDirectorPersonaBrief(persona)
        │     → Director: player agency + full player-authored identity
        │
        ├─ buildCharacterPersonaBrief(persona, nameVisibility)
        │     → Character: scene-internal public identity only
        │
        ├─ buildNarratorPersonaBrief(persona, nameVisibility)
        │     → Narrator: observable identity/appearance only
        │
        └─ buildPersonaGuardContext(persona)
              → Guard: names/aliases for user action/dialogue detection
```

The pipeline builds persona briefs once per turn after name-introduction state is known, then passes the
right brief to each agent layer. A shared `PersonaBrief` with one visibility is not enough because it tempts
Character prompts to reuse Director wording.

## Components and Interfaces

### 1. shared — session persona

`packages/shared/src/engine-v2/session.ts`

```ts
persona: {
  id: string;
  name: string;
  shortName: string;
  /** Scene role / stance, e.g. "new tenant in the share house". */
  role?: string;
  /** Public self-description/background the user authored. */
  description?: string;
  /** Observable appearance, for narrator/visual prompts. */
  appearance?: string;
  relationshipTags?: string[];
};
```

`ClientSessionState` mirrors these fields. These fields are player-authored and player-safe, but not all are
visible to every agent in the same form.

### 2. shared/server — persona brief types

`packages/shared/src/engine-v2/context.ts` or a small sibling type file:

```ts
export interface DirectorPersonaBrief {
  name: string;
  shortName: string;
  role?: string;
  description?: string;
  appearance?: string;
  relationshipTags?: string[];
}

export interface CharacterPersonaBrief {
  displayName: string;
  nameKnown: boolean;
  role?: string;
  description?: string;
  appearance?: string;
  relationshipTags?: string[];
}

export interface NarratorPersonaBrief {
  displayName: string;
  nameKnown: boolean;
  role?: string;
  appearance?: string;
}

export interface PersonaGuardContext {
  names: string[];
}
```

`displayName` is either the known name/shortName or a masked label such as `상대 인물`. It is not `사용자`.

### 3. server — brief builders

`packages/server/src/engine-v2/context-builder.ts`

- `buildDirectorPersonaBrief(persona)` copies all first-pass fields.
- `buildCharacterPersonaBrief(persona, userNameIntroduced)` returns world-internal wording.
- `buildNarratorPersonaBrief(persona, userNameIntroduced)` keeps observable fields only.
- `buildPersonaGuardContext(persona)` returns unique non-empty names and aliases.

The existing dirty `buildPersonaBrief` implementation should be replaced or wrapped so callers cannot
accidentally pass Director wording into Character prompts.

### 4. server — prompt injection

`director.ts`:

- Director may use "플레이어" / "agency" wording.
- Director prompt can include all first-pass persona fields.
- Director must be reminded that persona is player-authored identity, not hidden case knowledge.

`character.ts`:

- Character prompt uses labels like `[상대 인물 정보]`.
- It must say "상대는 같은 장면 안의 인물이다" rather than "사용자/플레이어".
- If `nameKnown === false`, exact name must not be printed in the Character system prompt.
- Role/description/appearance are framed as public/contextual information, not narrator authority.

`narrator.ts` or narrator prompt path:

- Narrator can use role/appearance for sensory continuity.
- Narrator still cannot assert user inner state, emotions, choices, or future actions.

### 5. server — session route and DTO

`packages/server/src/app-v2/schemas.ts`

```ts
persona: z.object({
  name: z.string().trim().max(80).default("{{유저}}"),
  shortName: z.string().trim().max(80).optional(),
  role: z.string().trim().max(800).optional(),
  description: z.string().trim().max(2000).optional(),
  appearance: z.string().trim().max(2000).optional(),
  relationshipTags: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
}).optional()
```

`session-routes.ts` stores only non-empty fields.

`session-presenter.ts` exposes persona fields to the client and keeps hidden case data out of persona.

### 6. client — setup flow

`packages/client/src/components/setup/PersonaSetupPanel.tsx`

Fields:

- display name
- role / stance
- public description
- appearance
- optional tags if the existing UI can support them without clutter

The UI should not present stats/avatar/library concepts in this slice. Those are a separate Marinara-inspired
feature if Hushline later needs persistent reusable personas.

`api-v2.ts`, `useSessionActions.ts`, `App.tsx`, `types/ui.ts` should pass a persona object instead of a name-only
string while keeping name-only compatibility.

## Data Flow

1. User edits persona in setup or accepts persona-maker output.
2. Client sends persona object in `POST /api/v2/sessions`.
3. Server validates and stores `SessionStateV2.persona`.
4. `toClientSession` returns the same safe fields.
5. On turn advance, pipeline determines whether the persona name has been introduced.
6. Pipeline builds brief variants.
7. Director receives Director brief, Character receives Character brief, Narrator receives Narrator brief, Guard
   receives name aliases.
8. Runtime boundary and leak harness validate outputs as before.

## Error Handling

| Situation | Handling |
|---|---|
| Name-only persona | Build all briefs with minimal data and keep old behavior |
| Empty role/description/appearance | Omit empty lines; do not emit blank prompt blocks |
| Name not introduced | Character/Narrator display masked label; Director still knows real name |
| persona-maker failure | Use existing fallback draft and let user edit |
| Malformed tags | Trim, drop empty values, cap count |
| Old session missing new fields | Treat as undefined |

## Testing Strategy

1. **Brief builders**: full persona produces correct Director/Character/Narrator/Guard briefs.
2. **Name masking**: Character brief does not expose exact name before introduction; Director brief still has it.
3. **Prompt tests**: Character system prompt contains role/description/appearance but not `사용자`, `플레이어`, or
   `User Persona`.
4. **Session route**: role/description/appearance/tags persist and appear in `toClientSession`.
5. **Client tests**: setup payload sends the full persona object; name-only path remains compatible.
6. **Leak/agency tests**: hidden truth leak harness remains green; user-action hijack tests use persona aliases.
7. **Verification**: focused tests, `corepack pnpm -r run check`, server tests, client build if UI changed,
   `git diff --check`.

## Correctness Properties

### Property 1: Layered Visibility

Each agent receives only the persona view it needs. Director can reason about player agency; Character cannot
see player/meta labels; Narrator only sees observable identity/appearance.

### Property 2: World-Internal Character Framing

Character prompts treat the persona as a person in the scene, not a user to serve or a co-writer to follow.

### Property 3: Name Masking Preservation

Existing unintroduced-name behavior remains intact while still allowing role/appearance context.

### Property 4: Prompt Block Separation

Persona public info, public character info, and private handouts remain separate typed blocks. Persona never
becomes a route for hidden truth or NPC private knowledge.

### Property 5: Small First Pass

Hushline gets the persona identity it needs now without importing Marinara's full avatar/stats/library system.
