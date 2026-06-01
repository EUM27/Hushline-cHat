# Implementation Plan — Persona System

## Overview

Revise the existing dirty persona WIP from a single `PersonaBrief` into layered persona visibility:
Director brief, Character brief, Narrator brief, and Guard context. Then wire first-pass persona fields
(name/shortName/role/description/appearance/relationshipTags) through server, client, prompts, and tests.

All fields are optional except id/name/shortName. Name-only sessions must keep working.

## Tasks

- [x] 0. Reconcile current dirty WIP with the revised spec
  - [x] Inspect current changes in `packages/shared/src/engine-v2/session.ts`, `context.ts`, `packages/server/src/engine-v2/context-builder.ts`, `director.ts`, `character.ts`, `pipeline.ts`, `app-v2/schemas.ts`, `session-routes.ts`, and `session-presenter.ts`.
  - [x] Keep already-correct persistence/DTO pieces where they match the revised spec.
  - [x] Replace single shared `PersonaBrief` usage where it would leak Director wording into Character prompts.
  - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.4_

- [x] 1. Extend shared persona model
  - [x] Add `appearance?` to `SessionStateV2.persona`.
  - [x] Add or revise brief types: `DirectorPersonaBrief`, `CharacterPersonaBrief`, `NarratorPersonaBrief`,
    `PersonaGuardContext`.
  - [x] Extend `ClientSessionState` persona alias to expose role/description/appearance/relationshipTags.
  - _Requirements: 1.1, 1.5_

- [x] 2. Add layered brief builders
  - [x] In `context-builder.ts`, implement:
    - `buildDirectorPersonaBrief(persona)`
    - `buildCharacterPersonaBrief(persona, userNameIntroduced)`
    - `buildNarratorPersonaBrief(persona, userNameIntroduced)`
    - `buildPersonaGuardContext(persona)`
  - [x] Use masked display labels for Character/Narrator when the exact name is not introduced.
  - [x] Add focused unit tests for full, minimal, and unintroduced-name personas.
  - _Requirements: 2.1, 2.2, 2.4, 2.5, 3.1, 3.2_

- [x] 3. Wire server persistence and DTO
  - [x] Extend `createSessionBodySchema.persona` with `appearance?`.
  - [x] Store non-empty role/description/appearance/relationshipTags in `session-routes.ts`.
  - [x] Expose the same safe fields from `toClientSession`.
  - [x] Add route/presenter tests for full persona and name-only compatibility.
  - _Requirements: 1.2, 1.3, 1.4, 1.5, 5.1_

- [x] 4. Wire agent prompts with correct visibility
  - [x] Director prompt receives Director brief and can use player/agency wording.
  - [x] Character prompt receives Character brief and uses world-internal labels such as `[상대 인물 정보]`.
  - [x] Character prompt tests must fail if it contains `사용자`, `플레이어`, or `User Persona` in the persona section.
  - [x] Narrator prompt path receives Narrator brief or keeps an explicit no-inner-state rule if no prompt path change is needed.
  - [x] Guard/boundary path receives persona aliases from `PersonaGuardContext`.
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.5_

- [x] 5. Wire client setup and API payload
  - [x] Extend `PersonaDraft` with role/description/appearance/relationshipTags.
  - [x] Change `createSessionV2` to accept a persona object while keeping a name-only compatibility path if local callers still use it.
  - [x] Update `useSessionActions.ts` and `App.tsx` to pass the full draft.
  - [x] Update `PersonaSetupPanel` with compact inputs for role, description, and appearance.
  - [x] Add setup-screen persona-maker controls, then populate generated fields into the draft and keep them editable.
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 6. Verification
  - [x] Run focused server tests for context builders, prompt tests, session route/presenter tests, and leak harness.
  - [x] Run focused client tests for setup/session payload if available.
  - [x] Run `corepack pnpm -r run check`.
  - [x] Run server tests.
  - [x] Run client build if client UI changed.
  - [x] Run `git diff --check`.
  - [x] Browser-smoke setup -> session start if client UI changes are committed in this slice.
  - _Requirements: 3.3, 5.2, 5.3, 5.4, 5.5_

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["0"] },
    { "wave": 2, "tasks": ["1"] },
    { "wave": 3, "tasks": ["2", "3"] },
    { "wave": 4, "tasks": ["4", "5"] },
    { "wave": 5, "tasks": ["6"] }
  ]
}
```

```
0 (dirty WIP reconciliation)
└─ 1 (shared model)
   ├─ 2 (brief builders)
   │  └─ 4 (agent prompts)
   ├─ 3 (server persistence/DTO)
   │  └─ 5 (client setup/API)
   └─ 6 (verification)
```

## Notes

- Current dirty persona code was started before the Marinara/ST Lab reference pass. Treat it as partial WIP,
  not the final design.
- Keep Character prompts world-internal. Director may say "player"; Character should not.
- Do not add persona stats/avatar/library in this pass.
- Do not mix persona public info with NPC handouts or hidden case data.
