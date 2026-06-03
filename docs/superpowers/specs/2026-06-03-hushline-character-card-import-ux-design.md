# Hushline Character Card Import UX Design

Date: 2026-06-03
Status: approved
Scope: setup flow UX, external character-card import, reusable character-card library, scenario slot application

## Problem

Hushline already has backend support for importing and saving character cards, but the setup UI does not make the workflow feel reliable. Users can import or select cards, yet the screen does not clearly answer:

- Was this PNG/JSON actually parsed as a character card?
- What external format did Hushline detect?
- Which fields were imported, and which were ignored or inferred?
- Was the card saved into the reusable library?
- Was it applied to the current scenario character slot?
- Can it be reused in a later session?

The current setup flow also makes direct character replacement feel like a small side control instead of a central part of preparing a session.

## Priority Shift

The first UX/UI slice should center on external character-card compatibility, not on a Hushline-only character writer.

Direct card writing is still important, but it should be designed as a Tavern-compatible card creator/exporter later. The first useful improvement is making imported PNG/JSON cards from existing AI-chat character-card ecosystems feel trustworthy and reusable.

## Evidence

The user-provided examples are real external character-card PNGs, not plain images:

- `C:/Users/limoj/Downloads/Antonio.png`
  - PNG text keyword: `chara`
  - Spec: `chara_card_v2`
  - Name: `Antonio`
  - Creator: `darkmountain`
  - Extension keys: `janitor`
- `C:/Users/limoj/Downloads/Nikolai (1).png`
  - PNG text keyword: `chara`
  - Spec: `chara_card_v2`
  - Name: `Nikolai`
  - Creator: `xHoneyBunniex`
  - Extension keys: `janitor`
- `C:/Users/limoj/Downloads/Eduardo_.png`
  - PNG text keyword: `chara`
  - Spec: `chara_card_v2`
  - Name: `Eduardo`
  - Creator: `EvaPorsche`
  - Extension keys: `janitor`
  - Has alternate greetings

These should become acceptance examples for the import UX, even if the actual image files are not committed.

## Existing System

Relevant current surfaces:

- Server PNG extractor: `packages/server/src/engine-v2/png-card.ts`
- Server card importer: `packages/server/src/engine-v2/card-importer.ts`
- Server import route: `packages/server/src/app-v2/card-routes.ts`
- Server reusable library route: `packages/server/src/app-v2/library-routes.ts`
- Client import API: `packages/client/src/api-v2.ts`
- Scenario setup UI: `packages/client/src/components/setup/ScenarioSetupPanel.tsx`
- Import preview component: `packages/client/src/components/setup/CharacterCardImport.tsx`
- Setup styles: `packages/client/src/styles/setup.css`

The current backend already supports `ccv3` and `chara` PNG metadata, JSON import, conversion into `CharacterDefinition`, and reusable library save. The planned work should improve normalization, metadata reporting, and user-facing state before adding a separate full editor.

## Design Goals

1. External cards should feel first-class.
   The UI should say `PNG / JSON 카드 가져오기`, not hide import behind a character badge click.

2. Parsing should be transparent.
   After import, the preview should show detected format, source filename, card name, creator/source when available, image presence, first message presence, alternate greetings count, and extension keys such as `janitor`.

3. Save and apply must be separate states.
   The screen should distinguish:
   - `라이브러리에 저장됨`
   - `현재 시나리오 슬롯에 적용됨`
   - `저장 실패`
   - `적용 전 미리보기`

4. Original data should be preserved.
   Hushline can store a converted `CharacterDefinition`, but it should also retain source metadata and raw card JSON where practical so future export/compatibility work is possible.

5. Hushline-specific fields should be additive.
   Hushline extensions can enrich imported cards, but they should not make external cards incompatible with other apps.

6. Respect source and creator context.
   Cards with creator/source metadata or visible watermarking should preserve source labels in local UI. Hushline should not present imported cards as newly authored by the user unless the user explicitly edits or clones them.

## Proposed Setup Flow

### Step 1: Scenario

Keep scenario selection, but make character replacement more visible:

- Show scenario cast slots as cards.
- Each slot has state:
  - `기본 인물`
  - `외부 카드 적용됨`
  - `저장된 카드 적용됨`
  - `작성 중`
- Each slot has actions:
  - `카드 가져오기`
  - `저장된 카드 선택`
  - `직접 작성`
  - `기본값으로 되돌리기`

### Step 2: Card Import Drawer Or Panel

When importing a card, show a focused panel:

- Drop zone / file picker for `.png` and `.json`
- Accepted format text:
  - `SillyTavern/TavernAI PNG`
  - `chara_card_v2 JSON`
  - `chara_card_v3 JSON`
  - `Janitor extension detected`
- Import result preview:
  - Portrait thumbnail
  - Name
  - Creator/source
  - Description/personality lengths
  - First message available or missing
  - Alternate greetings count
  - Scenario field available or missing
  - Extension keys
- Actions:
  - `라이브러리에 저장`
  - `이 슬롯에 적용`
  - `저장하고 적용`
  - `취소`

### Step 3: Library

The character-card library should be visible as a small browser, not only a disabled select:

- Count: `저장된 카드 N개`
- Cards show name, source filename, format, and last saved time when available.
- Applying a library card to a slot should produce a visible applied state.
- Empty state should explain what will happen:
  - `PNG/JSON 캐릭터 카드를 가져오면 여기에 저장됩니다. 다음 세션에서도 다시 쓸 수 있습니다.`

### Step 4: Persona

Persona setup stays in the flow, but the first pass should only fix obvious layout breakage and save/load clarity:

- Fix preview overlap around `{{유저}}`.
- Keep `저장된 페르소나` and `현재 페르소나 저장` visible, but avoid making persona work block character-card import work.

### Step 5: Chat Screen

After setup improvements, run a second pass on chat controls:

- Clarify ACT/NEXT state.
- Reduce always-visible command noise.
- Recheck mobile layout.

## Data Model Additions

Add source metadata to imported card results and saved library entries:

```ts
interface CharacterCardSourceMetadata {
  sourceFileName?: string;
  sourceFormat: "png-chara-v2" | "png-ccv3" | "json-v2" | "json-v3" | "json-unknown";
  cardSpec?: string;
  cardSpecVersion?: string;
  creator?: string;
  sourceUrl?: string;
  extensionKeys: string[];
  hasFirstMessage: boolean;
  alternateGreetingCount: number;
  hasScenario: boolean;
  hasCharacterBook: boolean;
  rawCardJson?: unknown;
}
```

For the first implementation slice, `rawCardJson` may be stored server-side only or omitted from client responses if payload size is a concern. The important part is preserving enough source metadata to make import trustworthy and future export possible.

## Error Handling

The UI should distinguish common failures:

- Plain PNG with no card data:
  - `이미지는 읽혔지만 캐릭터 카드 데이터(chara/ccv3)가 없습니다.`
- Invalid JSON:
  - `JSON을 파싱할 수 없습니다.`
- Unsupported or incomplete card:
  - `카드 이름 또는 data 필드가 없습니다.`
- Oversized card:
  - `파일이 너무 큽니다.`
- Partial import:
  - `카드는 적용됐지만 일부 필드는 Hushline에서 아직 사용하지 않습니다. 원본 데이터는 보존됩니다.`

## Implementation Slices

### Slice 1: Import Metadata And Preview

Goal: imported cards show detected format and useful metadata.

Files likely touched:

- `packages/server/src/engine-v2/png-card.ts`
- `packages/server/src/engine-v2/card-importer.ts`
- `packages/server/src/app-v2/card-routes.ts`
- `packages/server/src/engine-v2/schemas.ts`
- `packages/client/src/api-v2.ts`
- `packages/client/src/components/setup/CharacterCardImport.tsx`
- `packages/server/src/__tests__/card-import.test.ts`
- `packages/client/src/__tests__/api-v2.test.ts`

Verification:

- Server import tests for `chara` PNG v2 and `ccv3` PNG v3.
- Import preview renders source format, creator, extension keys, first-message availability, and alternate greeting count.

### Slice 2: Scenario Slot Application UX

Goal: scenario cast slots make imported/applied/default states obvious.

Files likely touched:

- `packages/client/src/components/setup/ScenarioSetupPanel.tsx`
- `packages/client/src/components/setup/character-card-target.ts`
- `packages/client/src/styles/setup.css`
- `packages/client/src/App.tsx`
- `packages/client/tests/app-shell-components.test.tsx`
- `packages/client/src/__tests__/scenario-character-import.test.ts`

Verification:

- Applying an imported card changes the target slot state.
- Saved library cards can be selected and applied.
- Empty library state is visible and explanatory.

### Slice 3: Library Browser

Goal: saved cards feel reusable across sessions.

Files likely touched:

- `packages/client/src/components/setup/ScenarioSetupPanel.tsx`
- `packages/client/src/api-v2.ts`
- `packages/server/src/app-v2/library-routes.ts`
- `packages/server/src/store/profile-library-store.ts`
- `packages/server/src/store/__tests__/profile-library-store.test.ts`

Verification:

- Importing saves a card.
- Listing shows saved card metadata.
- Applying from library works after a fresh app load.

### Slice 4: Direct Card Writer

Goal: users can create a new card, but the model remains Tavern-compatible.

Defer until import and library UX are solid.

Initial fields:

- Name
- Role / public description
- Personality
- Speaking style
- Relationship to user
- First message

Advanced collapsed fields:

- Scenario
- Alternate greetings
- Secret / hidden motivation
- Behavior rules
- Hushline-specific autonomy and handout fields

## Acceptance Criteria

1. A user can drag or select `Antonio.png`, `Nikolai (1).png`, or `Eduardo_.png` and see that Hushline detected a `chara_card_v2` PNG card.
2. The preview shows card name, source filename, creator when available, `janitor` extension detection, and first-message availability.
3. The user can save the imported card to the reusable library.
4. The user can apply the imported card to a specific scenario character slot.
5. The slot visibly changes from default to applied.
6. The library shows that the card is reusable in later setup flows.
7. If a PNG has no embedded card metadata, the UI says it is an image-only PNG, not a failed mystery.
8. Provider settings remain peer-level and are not promoted as part of this UX work.
9. Layout fixes avoid hard-coded magic dimensions; desktop and mobile screenshots are used for verification.

## Out Of Scope For First Slice

- Public sharing or reposting imported cards.
- Full card export as PNG.
- Full character-card authoring UI.
- Character book/world book editing.
- Long-term asset storage for portrait binaries.
- Full mobile redesign of the chat screen.

## Follow-Up Audit Plan

After Slice 1-3, rerun the Product Design audit with these states:

1. Scenario setup with empty library.
2. Importing a real `chara` PNG card.
3. Imported card preview before save/apply.
4. Slot after imported card is applied.
5. Library after card is saved.
6. Session entered with imported character applied.
7. Mobile setup view.
