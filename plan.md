# Hushline cHat Project Plan

Last updated: 2026-06-01

이 문서는 여러 Codex 스레드가 동시에 열려 있을 때 가장 먼저 읽는 상태판이다. 상세 설계와 보드가 따로 있어도, 현재 프로젝트가 어디까지 왔고 다음에 무엇을 해야 하는지는 여기서 확인한다.

## Start Here

새 스레드를 시작하면 이 순서로 확인한다.

1. `git status --short`
2. `CODEX.md`
3. `plan.md`
4. 현재 작업에 해당하는 세부 문서

작업을 끝낼 때는 이 문서의 `Current Snapshot`, `Active Workstreams`, `Priority Queue` 중 바뀐 부분만 갱신한다. 구현 파일을 건드린 경우 검증 명령과 결과도 함께 남긴다.

## Current Snapshot

- Workspace: `D:\Hushline cHat`
- Branch: `codex/shared-house-romance-visuals`
- Root `plan.md`: newly created on 2026-05-31
- Latest shipped commit on branch: `b06ac38 feat: expand persona and scene-first flows`
- Staged files at snapshot time: none
- Merge conflicts at snapshot time: none
- Dirty files at snapshot time: none

The branch currently contains one verified feature tranche:

- Persona system expansion: layered Director/Character/Narrator/Guard persona visibility, expanded persona persistence, prompt injection, client setup inputs, and session payload wiring.
- Shared-house romance scene-first metadata: opening beats carry character ids, loader validation checks those ids, and the client shell/stage helpers route scene-first openings to the visual stage.
- Phone messenger routing hotfix: user input is no longer classified as a phone messenger message; only advisor-slot character messages, anonymous phone chatter, and digital notices enter the phone feed.

## Project Guardrails

- Provider UI must keep ChatGPT/OpenAI peer-level with NanoGPT, OpenRouter, and other providers. Do not make ChatGPT/OpenAI the default, hero, or special visual center unless explicitly requested.
- Avoid hard-coded layout fixes. Prefer tokens, CSS variables, grid/flex sizing, `min-height: 0`, and real rendered verification.
- Do not bulk-stage dirty work. Stage only the files that belong to the completed task.
- User-visible flow changes need a browser smoke on the actual local app, not only static checks.

## Source Documents

- `CODEX.md`: project-level provider neutrality and no-hard-coded-layout rules.
- `docs/goals/codebase-audit-refactor/state.yaml`: completed GoalBuddy audit/refactor board. It records the broad refactor tranche as done with static checks, client build, diff check, and browser smoke.
- `docs/superpowers/plans/2026-05-29-hushline-codebase-refactor.md`: detailed historical refactor plan.
- `.kiro/specs/persona-system/requirements.md`: persona system requirements.
- `.kiro/specs/persona-system/design.md`: persona system design.
- `.kiro/specs/persona-system/tasks.md`: persona system task list.
- `.kiro/specs/multi-agent-turn-engine/theme-concepts-plan.md`: theme concept directions and implementation priority.

## Active Workstreams

### 1. Persona System - Verified and Pushed

Goal: make the player persona first-class instead of name-only, while preserving hidden-truth safety and backwards compatibility.

Observed done or in progress:

- [x] `.kiro/specs/persona-system` requirements, design, and task files exist.
- [x] `SessionStateV2.persona` has optional `role`, `description`, and `relationshipTags`.
- [x] Legacy `PersonaBrief` was replaced by agent-specific persona brief types; `OmniscientContext.persona` now carries the Director brief.
- [x] Server create-session schema accepts `shortName`, `role`, `description`, and `relationshipTags`.
- [x] Session creation preserves those persona fields when provided.
- [x] Client session DTO exposes persona role, description, and relationship tags.
- [x] Director and Character prompt paths receive persona context.
- [x] `SessionStateV2.persona`, `PersonaProfile`, and create-session payloads now include optional `appearance`.
- [x] Persona visibility is split into `DirectorPersonaBrief`, `CharacterPersonaBrief`, `NarratorPersonaBrief`, and `PersonaGuardContext`.
- [x] Character prompts use `[상대 인물 정보]` and do not expose exact persona names before in-scene introduction.
- [x] Narrator prompts receive observable persona role/appearance only.
- [x] Runtime boundary checks unintroduced persona aliases, not just the full persona name.
- [x] Setup UI captures persona name, scene role, public description, and appearance, then sends the full persona object.
- [x] Persona-maker fallback/API normalization preserves description and appearance.
- [x] Setup UI now includes persona-maker generation controls and editable relationship tag input.
- [x] Persona-maker API results backfill description, appearance, short name, and tags from deterministic fallback when a provider omits optional fields.

Remaining:

- [ ] If polishing the setup UX further, consider chip-style relationship tag editing or field-level helper copy as a separate follow-up slice.

Verification:

- `corepack pnpm --filter @hushline/server test` - pass, 193 tests.
- `corepack pnpm --filter @hushline/client exec bun test src/__tests__ src/utils/__tests__ tests` - pass, 66 tests.
- `corepack pnpm -r run check` - pass.
- `corepack pnpm --filter @hushline/client build` - pass.
- `git diff --check` - pass.
- Browser smoke on `http://localhost:4188/` with API `http://localhost:7872`: persona maker prompt generated editable name/short name/role/description/appearance/tags, setup submit entered `scene-open`, and the live `/api/v2/persona-maker/generate` endpoint returned populated description/appearance.

### 2. Shared-House Romance Scene Metadata - Verified and Pushed

Goal: scene-first shared-house romance sessions should open directly into the scene with correct staged speaker identity for opening beats.

Observed done or in progress:

- [x] Scenario opening beats can include `characterId`.
- [x] Shared-house romance opening beat data includes speaker ids.
- [x] Scenario loader validates opening beat `characterId` references.
- [x] Session creation copies opening beat `characterId` into opening messages.
- [x] Client shell mode uses scene-first metadata instead of forcing all turn-zero sessions into invitation mode.
- [x] Server tests were added or updated for scene-first metadata and opening speaker ids.
- [x] Client helper tests were added for session shell mode and stage-message speaker resolution.

Remaining:

- [ ] If this flow changes again, re-run focused server/client helper tests and browser-smoke the scene-first opening.

Verification:

- `corepack pnpm --filter @hushline/server test` - pass, 193 tests.
- `corepack pnpm --filter @hushline/client exec bun test src/__tests__ src/utils/__tests__ tests` - pass, 66 tests.
- `corepack pnpm -r run check` - pass.
- `corepack pnpm --filter @hushline/client build` - pass.

### 2a. Phone Messenger User Input Routing - Verified and Pushed

Goal: keep user input visible in the main VN/stage surface without echoing it into the left phone messenger feed.

Observed done:

- [x] `isPhoneChannelMessage` now returns false for all `role: "user"` messages.
- [x] Phone feed tests now assert that user chat text does not produce `phone-user-*` messages.
- [x] Phone app focus tests now assert that a latest user input does not auto-open Messenger.

Verification:

- `corepack pnpm --filter @hushline/client exec bun test tests/ui-helpers.test.ts tests/phone-feed.test.ts src/utils/__tests__/phone-apps.test.ts` - pass, 28 tests.
- `corepack pnpm --filter @hushline/client exec bun test src/__tests__ src/utils/__tests__ tests` - pass, 66 tests.
- `corepack pnpm -r run check` - pass.
- `corepack pnpm --filter @hushline/client build` - pass.
- `git diff --check` - pass.
- Browser smoke on `http://localhost:4188/` and `http://127.0.0.1:4187/`: phone feed has no outbound user bubbles after reload.

### 3. Codebase Audit/Refactor Tranche - Complete

Status: complete in `docs/goals/codebase-audit-refactor/state.yaml`.

Evidence recorded there:

- `corepack pnpm check`
- `corepack pnpm test`
- `corepack pnpm --filter @hushline/client exec bun test tests`
- `corepack pnpm --filter @hushline/client build`
- `git diff --check`
- Browser smoke on local client/API

Do not reopen this tranche just because the document exists. Start a new bounded tranche if a new refactor goal appears.

### 4. Theme Concepts - Blue Moonlight Slice Complete

Goal: make the existing `moonlight` preset match the priority-1 "파란 달밤 / Blue Moonlight" direction without introducing a new theme system yet.

Observed done:

- [x] `moonlight` was retuned from amber-accented "달빛 안개" to pale moonlight "파란 달밤".
- [x] The preset now uses the plan palette anchors `#0F1A2E`, `#3B5B8C`, `#E8E4DD`, and `#A8C5E8`.
- [x] `createVisualThemeStyle` now applies `theme.colors.canvas` through `--theme-canvas-wash`.
- [x] Focused client test coverage locks the key moonlight palette tokens and prevents amber CTA regression.

Verification:

- `corepack pnpm --filter @hushline/client exec bun test tests/theme-presets.test.ts` - pass
- `corepack pnpm --filter @hushline/client check` - pass
- `corepack pnpm --filter @hushline/client build` - pass
- Browser smoke on `http://127.0.0.1:4187/` with API health on `http://127.0.0.1:7871/api/health` - `scene-open` rendered, `--vn-accent=#A8C5E8`, `--theme-canvas-wash=#0F1A2E`

Remaining:

- [ ] Decide whether the next theme slice should be `ThemeProvider` / `data-theme`, Glass Messenger default, or a high-contrast genre theme such as VHS Horror.
- [ ] Broaden visual QA if theme work starts changing layout or device-frame structure.

## Priority Queue

1. Open or update a PR for `codex/shared-house-romance-visuals`.
2. If review wants more runtime confidence, browser-smoke persona setup, scene-first opening, and the no-user-echo phone messenger case on the active local app.
3. Next product slice: pick one bounded follow-up, preferably `ThemeProvider` / `data-theme`, Glass Messenger default, or persona setup tag-chip UX.
4. If user asks "현상황의 잔여 과제와 다음 작업", answer from this `Priority Queue` plus fresh `git status --short`.
5. Theme next task: pick the next bounded slice from `.kiro/specs/multi-agent-turn-engine/theme-concepts-plan.md` instead of expanding all 8 themes at once.

## Handoff Template

Use this format when updating the file after a thread:

```text
Date:
Thread/task:
Changed files:
Verification:
Result:
Next task:
Risks:
```
