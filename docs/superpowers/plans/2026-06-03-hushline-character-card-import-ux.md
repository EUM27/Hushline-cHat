# Hushline Character Card Import UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make external PNG/JSON character-card import feel trustworthy by showing detected format/source metadata, saving cards into the reusable library, and making scenario-slot application visible.

**Architecture:** Extend server import parsing to return source metadata alongside the converted `CharacterDefinition`, persist that metadata in the profile library, then surface it through the client API and setup UI. Keep Hushline-specific fields additive; preserve external card identity and avoid changing provider/model UI hierarchy.

**Tech Stack:** Bun, Hono, Zod, React, TypeScript, CSS modules by feature stylesheet, `bun:test`, local Browser smoke on `http://127.0.0.1:4187/`.

---

## Preconditions And Dirty Tree Rules

- The checkout currently has mixed local WIP. Before editing any already-modified file, run `git diff -- <path>` and preserve existing user changes.
- Stage only files touched by the active task if committing.
- Do not commit the user's sample files from `C:/Users/limoj/Downloads`.
- Use the real sample PNGs only for local manual verification. Tests should synthesize representative `chara`/`ccv3` PNGs in code.
- Keep provider UI peer-level. This feature should not promote any model/provider.
- Avoid hard-coded layout magic. Verify desktop and mobile setup render after UI changes.

## File Structure

- `packages/server/src/engine-v2/png-card.ts`
  - Add PNG card keyword/source-format reporting instead of returning only raw JSON.
- `packages/server/src/engine-v2/card-importer.ts`
  - Convert cards and build import metadata such as format, spec, creator, extension keys, first-message presence, alternate greetings count, and raw-card preservation hooks.
- `packages/server/src/engine-v2/schemas.ts`
  - Add Zod schemas/types for source metadata and allow save/list APIs to carry it.
- `packages/server/src/app-v2/card-routes.ts`
  - Return `{ character, metadata, characterCard }` from import.
- `packages/server/src/store/profile-library-store.ts`
  - Persist optional metadata for reusable character-card records.
- `packages/server/src/app-v2/library-routes.ts`
  - Accept and return metadata on saved/listed character cards.
- `packages/client/src/api-v2.ts`
  - Add metadata types and return metadata from import/save/list APIs.
- `packages/client/src/components/setup/CharacterCardImport.tsx`
  - Show an import preview with detected format/source details and clear save/apply state.
- `packages/client/src/components/setup/ScenarioSetupPanel.tsx`
  - Make cast-slot card states visible and connect import/library cards to target slots.
- `packages/client/src/styles/setup.css`
  - Style import preview, library browser, slot states, and mobile setup layout using responsive grid/flex.
- Tests:
  - `packages/server/src/__tests__/card-import.test.ts`
  - `packages/server/src/store/__tests__/profile-library-store.test.ts`
  - `packages/client/src/__tests__/api-v2.test.ts`
  - `packages/client/tests/app-shell-components.test.tsx`
  - `packages/client/src/__tests__/scenario-character-import.test.ts`

---

## Task 1: Server Import Metadata

**Files:**
- Modify: `packages/server/src/engine-v2/png-card.ts`
- Modify: `packages/server/src/engine-v2/card-importer.ts`
- Modify: `packages/server/src/engine-v2/schemas.ts`
- Modify: `packages/server/src/app-v2/card-routes.ts`
- Test: `packages/server/src/__tests__/card-import.test.ts`

- [ ] **Step 1: Inspect current dirty diffs**

Run:

```powershell
git diff -- packages/server/src/engine-v2/png-card.ts packages/server/src/engine-v2/card-importer.ts packages/server/src/engine-v2/schemas.ts packages/server/src/app-v2/card-routes.ts packages/server/src/__tests__/card-import.test.ts
```

Expected: existing user edits are understood before changing the files.

- [ ] **Step 2: Add failing tests for `chara` PNG v2 metadata**

In `packages/server/src/__tests__/card-import.test.ts`, add this test inside `describe("character card import route", ...)`:

```ts
test("reports source metadata for a real-world chara v2 PNG card", async () => {
  const app = makeApp();
  const janitorCard = {
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: {
      name: "Antonio",
      description: "Retired consigliere with a guarded public face.",
      personality: "Controlled, severe, observant.",
      first_mes: "The door shuts behind you before Antonio looks up.",
      alternate_greetings: ["Antonio folds the newspaper without a word."],
      extensions: {
        janitor: {
          creator: "darkmountain",
        },
      },
    },
  };
  const pngBase64 = Buffer.from(makePngWithKeyword("chara", JSON.stringify(janitorCard))).toString("base64");

  const response = await app.request("/api/v2/character-card/import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "png", data: pngBase64, fileName: "Antonio.png" }),
  });

  expect(response.status).toBe(200);
  const payload = await response.json() as {
    metadata: {
      sourceFileName: string;
      sourceFormat: string;
      cardSpec: string;
      cardSpecVersion: string;
      creator: string;
      extensionKeys: string[];
      hasFirstMessage: boolean;
      alternateGreetingCount: number;
      hasScenario: boolean;
      hasCharacterBook: boolean;
    };
  };

  expect(payload.metadata).toMatchObject({
    sourceFileName: "Antonio.png",
    sourceFormat: "png-chara-v2",
    cardSpec: "chara_card_v2",
    cardSpecVersion: "2.0",
    creator: "darkmountain",
    extensionKeys: ["janitor"],
    hasFirstMessage: true,
    alternateGreetingCount: 1,
    hasScenario: false,
    hasCharacterBook: false,
  });
});
```

Add this helper near `makePng`:

```ts
function makePngWithKeyword(keyword: "chara" | "ccv3", cardJson: string): Uint8Array {
  const chunks: Uint8Array[] = [chunk("IHDR", new Uint8Array(13))];
  const text = Buffer.from(cardJson, "utf-8").toString("base64");
  const data = concat(latin1(keyword), Uint8Array.from([0]), latin1(text));
  chunks.push(chunk("tEXt", data));
  chunks.push(chunk("IEND", new Uint8Array(0)));
  return concat(Uint8Array.from(PNG_SIGNATURE), ...chunks);
}
```

- [ ] **Step 3: Run test to verify failure**

Run:

```powershell
corepack pnpm --filter @hushline/server exec bun test ./src/__tests__/card-import.test.ts
```

Expected: FAIL because `metadata` is not returned yet.

- [ ] **Step 4: Add metadata types in `schemas.ts`**

Add this near the character-card schemas:

```ts
export const characterCardSourceFormatSchema = z.enum([
  "png-chara-v2",
  "png-ccv3",
  "json-v2",
  "json-v3",
  "json-unknown",
]);

export const characterCardSourceMetadataSchema = z.object({
  sourceFileName: z.string().max(260).optional(),
  sourceFormat: characterCardSourceFormatSchema,
  cardSpec: z.string().max(80).optional(),
  cardSpecVersion: z.string().max(40).optional(),
  creator: z.string().max(200).optional(),
  sourceUrl: z.string().max(1000).optional(),
  extensionKeys: z.array(z.string().max(100)).default([]),
  hasFirstMessage: z.boolean(),
  alternateGreetingCount: z.number().int().min(0),
  hasScenario: z.boolean(),
  hasCharacterBook: z.boolean(),
});

export type CharacterCardSourceMetadataInput = z.infer<typeof characterCardSourceMetadataSchema>;
```

- [ ] **Step 5: Return PNG keyword from `png-card.ts`**

Change `PngCardResult` to include the keyword:

```ts
export type PngCardKeyword = "ccv3" | "chara";

export type PngCardResult =
  | { ok: true; json: string; keyword: PngCardKeyword }
  | { ok: false; error: string };
```

Update `extractCardFromPng` card selection:

```ts
const ccv3 = chunks.get("ccv3");
const chara = chunks.get("chara");
const keyword: PngCardKeyword | null = ccv3 !== undefined ? "ccv3" : chara !== undefined ? "chara" : null;
const card = keyword === "ccv3" ? ccv3 : keyword === "chara" ? chara : undefined;
if (card === undefined || keyword === null) {
  return { ok: false, error: "PNG에 캐릭터 카드 데이터(ccv3/chara)가 없습니다." };
}

const json = decodeCardText(card);
if (json === null) {
  return { ok: false, error: "카드 데이터 base64 디코드에 실패했습니다." };
}

return { ok: true, json, keyword };
```

- [ ] **Step 6: Add import metadata builder in `card-importer.ts`**

Add these types and helpers:

```ts
export type CharacterCardSourceFormat =
  | "png-chara-v2"
  | "png-ccv3"
  | "json-v2"
  | "json-v3"
  | "json-unknown";

export interface CharacterCardSourceMetadata {
  sourceFileName?: string;
  sourceFormat: CharacterCardSourceFormat;
  cardSpec?: string;
  cardSpecVersion?: string;
  creator?: string;
  sourceUrl?: string;
  extensionKeys: string[];
  hasFirstMessage: boolean;
  alternateGreetingCount: number;
  hasScenario: boolean;
  hasCharacterBook: boolean;
}

function sourceFormatForJson(card: CharaCardV3): CharacterCardSourceFormat {
  if (card.spec === "chara_card_v2") return "json-v2";
  if (card.spec === "chara_card_v3") return "json-v3";
  return "json-unknown";
}

function sourceFormatForPng(keyword: "ccv3" | "chara"): CharacterCardSourceFormat {
  return keyword === "ccv3" ? "png-ccv3" : "png-chara-v2";
}

function extractCreator(data: CharaCardV3["data"]): string | undefined {
  const extensionRecord = data.extensions ?? {};
  const janitor = extensionRecord.janitor as { creator?: unknown } | undefined;
  const chub = extensionRecord.chub as { creator?: unknown; full_path?: unknown } | undefined;
  const cardData = data as CharaCardV3["data"] & { creator?: unknown };
  const candidates = [
    typeof janitor?.creator === "string" ? janitor.creator : undefined,
    typeof chub?.creator === "string" ? chub.creator : undefined,
    typeof cardData.creator === "string" ? cardData.creator : undefined,
  ];
  return candidates.find((value) => value && value.trim())?.trim();
}

export function buildCharacterCardSourceMetadata(
  card: CharaCardV3,
  sourceFormat: CharacterCardSourceFormat,
  fileName?: string,
): CharacterCardSourceMetadata {
  const data = card.data;
  return {
    ...(fileName ? { sourceFileName: fileName } : {}),
    sourceFormat,
    ...(card.spec ? { cardSpec: card.spec } : {}),
    ...(card.spec_version ? { cardSpecVersion: card.spec_version } : {}),
    ...(extractCreator(data) ? { creator: extractCreator(data) } : {}),
    extensionKeys: Object.keys(data.extensions ?? {}).sort(),
    hasFirstMessage: Boolean(data.first_mes?.trim()),
    alternateGreetingCount: data.alternate_greetings?.length ?? 0,
    hasScenario: Boolean(data.scenario?.trim()),
    hasCharacterBook: Boolean((data as { character_book?: unknown }).character_book),
  };
}
```

If TypeScript rejects `data.creator`, extend `CharaCardV3["data"]` with optional `creator?: string` and `character_book?: unknown`.

- [ ] **Step 7: Return metadata from JSON and PNG import**

Change import result types:

```ts
export type ImportedCardResult =
  | { ok: true; character: CharacterDefinition; metadata: CharacterCardSourceMetadata }
  | { ok: false; error: string };
```

Update `importCardJson` signature and result:

```ts
export function importCardJson(jsonText: string, fallbackId: string, fileName?: string): ImportedCardResult {
  // existing parse and validation
  const card = parsed.data as CharaCardV3;
  const character = cardToCharacterDefinition(card, fallbackId);
  return {
    ok: true,
    character,
    metadata: buildCharacterCardSourceMetadata(card, sourceFormatForJson(card), fileName),
  };
}
```

Update `importCardPng`:

```ts
export function importCardPng(bytes: Uint8Array, fallbackId: string, fileName?: string): ImportedCardResult {
  const extracted = extractCardFromPng(bytes);
  if (!extracted.ok) {
    return { ok: false, error: extracted.error };
  }
  const imported = importCardJson(extracted.json, fallbackId, fileName);
  if (!imported.ok) return imported;
  return {
    ok: true,
    character: imported.character,
    metadata: {
      ...imported.metadata,
      sourceFormat: sourceFormatForPng(extracted.keyword),
    },
  };
}
```

- [ ] **Step 8: Return metadata from the import route**

In `card-routes.ts`, pass `fileName` into import calls:

```ts
const result = pngBytes
  ? importCardPng(pngBytes, fallbackId, fileName)
  : importCardJson(data, fallbackId, fileName);
```

Include metadata in response and save input:

```ts
const characterCard = options.profileLibraryStore?.saveCharacterCard({
  name: result.character.name,
  ...(fileName ? { sourceFileName: fileName } : {}),
  sourceMetadata: result.metadata,
  character: result.character,
});

return context.json({
  character: result.character,
  metadata: result.metadata,
  ...(characterCard ? { characterCard } : {}),
});
```

This step will not compile until Task 2 adds `sourceMetadata` to the store types. If implementing Task 1 alone, temporarily return metadata without saving `sourceMetadata`, then complete Task 2 before final validation.

- [ ] **Step 9: Run focused server tests**

Run:

```powershell
corepack pnpm --filter @hushline/server exec bun test ./src/__tests__/card-import.test.ts
```

Expected: PASS for import route tests.

---

## Task 2: Persist Character Card Source Metadata

**Files:**
- Modify: `packages/server/src/store/profile-library-store.ts`
- Modify: `packages/server/src/app-v2/library-routes.ts`
- Modify: `packages/server/src/app-v2/schemas.ts`
- Test: `packages/server/src/store/__tests__/profile-library-store.test.ts`
- Test: `packages/server/src/__tests__/card-import.test.ts`

- [ ] **Step 1: Inspect current dirty diffs**

Run:

```powershell
git diff -- packages/server/src/store/profile-library-store.ts packages/server/src/app-v2/library-routes.ts packages/server/src/app-v2/schemas.ts packages/server/src/store/__tests__/profile-library-store.test.ts packages/server/src/__tests__/card-import.test.ts
```

Expected: existing WIP is known.

- [ ] **Step 2: Add failing store test for metadata persistence**

In `packages/server/src/store/__tests__/profile-library-store.test.ts`, add:

```ts
test("saves and lists character card source metadata", () => {
  const store = createMemoryProfileLibraryStore();
  const character = makeCharacterDefinition("antonio", "Antonio");
  const saved = store.saveCharacterCard({
    name: "Antonio",
    sourceFileName: "Antonio.png",
    sourceMetadata: {
      sourceFileName: "Antonio.png",
      sourceFormat: "png-chara-v2",
      cardSpec: "chara_card_v2",
      cardSpecVersion: "2.0",
      creator: "darkmountain",
      extensionKeys: ["janitor"],
      hasFirstMessage: true,
      alternateGreetingCount: 0,
      hasScenario: false,
      hasCharacterBook: false,
    },
    character,
  });

  expect(saved.sourceMetadata).toMatchObject({
    sourceFormat: "png-chara-v2",
    creator: "darkmountain",
  });
  expect(store.listCharacterCards()[0]?.sourceMetadata).toMatchObject({
    sourceFileName: "Antonio.png",
    extensionKeys: ["janitor"],
  });
});
```

If `makeCharacterDefinition` is missing, add a local helper:

```ts
function makeCharacterDefinition(id: string, name: string): CharacterDefinition {
  return {
    id,
    name,
    shortName: name,
    role: "Imported character",
    profileKind: "named-actor",
    mbti: "unspecified",
    ocean: { openness: 50, conscientiousness: 50, extraversion: 50, agreeableness: 50, neuroticism: 50 },
    autonomy: 0.6,
    systemPrompt: `You are ${name}.`,
    handout: { secret: "", desire: "", objective: "", initialRelationshipToUser: 0 },
    relationships: [],
  };
}
```

- [ ] **Step 3: Run test to verify failure**

Run:

```powershell
corepack pnpm --filter @hushline/server exec bun test ./src/store/__tests__/profile-library-store.test.ts
```

Expected: FAIL because `sourceMetadata` is not supported.

- [ ] **Step 4: Extend store interfaces**

In `profile-library-store.ts`, import the metadata type:

```ts
import type { CharacterCardSourceMetadata } from "../engine-v2/card-importer.js";
```

Extend records and save input:

```ts
export interface CharacterCardRecord {
  id: string;
  name: string;
  sourceFileName?: string;
  sourceMetadata?: CharacterCardSourceMetadata;
  character: CharacterDefinition;
  createdAt: string;
  updatedAt: string;
}

export interface SaveCharacterCardRecordInput {
  id?: string;
  name?: string;
  sourceFileName?: string;
  sourceMetadata?: CharacterCardSourceMetadata;
  character: CharacterDefinition;
}
```

- [ ] **Step 5: Clone metadata safely**

Add:

```ts
function cloneSourceMetadata(metadata: CharacterCardSourceMetadata): CharacterCardSourceMetadata {
  return {
    ...metadata,
    extensionKeys: [...metadata.extensionKeys],
  };
}
```

Update memory and SQLite save paths to include:

```ts
...(input.sourceMetadata ? { sourceMetadata: cloneSourceMetadata(input.sourceMetadata) } : {}),
```

Update `cloneCharacterCardRecord`:

```ts
function cloneCharacterCardRecord(record: CharacterCardRecord): CharacterCardRecord {
  return {
    ...record,
    ...(record.sourceMetadata ? { sourceMetadata: cloneSourceMetadata(record.sourceMetadata) } : {}),
    character: cloneCharacterDefinition(record.character),
  };
}
```

- [ ] **Step 6: Add SQLite column**

In table creation:

```sql
source_metadata_json TEXT,
```

Because existing local DBs may already have `character_cards`, add a guarded migration after `CREATE TABLE`:

```ts
try {
  db.exec("ALTER TABLE character_cards ADD COLUMN source_metadata_json TEXT;");
} catch {
  // Column already exists.
}
```

Update `SELECT`, `INSERT`, and row mapping:

```ts
SELECT id, name, source_file_name, source_metadata_json, character_json, created_at, updated_at
```

```sql
INSERT INTO character_cards (id, name, source_file_name, source_metadata_json, character_json, created_at, updated_at)
VALUES ($id, $name, $sourceFileName, $sourceMetadataJson, $characterJson, $createdAt, $updatedAt)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  source_file_name = excluded.source_file_name,
  source_metadata_json = excluded.source_metadata_json,
  character_json = excluded.character_json,
  updated_at = excluded.updated_at
```

```ts
$sourceMetadataJson: record.sourceMetadata ? JSON.stringify(record.sourceMetadata) : null,
```

```ts
interface CharacterCardRow {
  id: string;
  name: string;
  source_file_name: string | null;
  source_metadata_json: string | null;
  character_json: string;
  created_at: string;
  updated_at: string;
}
```

```ts
...(row.source_metadata_json ? { sourceMetadata: JSON.parse(row.source_metadata_json) as CharacterCardSourceMetadata } : {}),
```

- [ ] **Step 7: Extend save schemas and routes**

In `packages/server/src/app-v2/schemas.ts`, add optional metadata to `saveCharacterCardBodySchema`:

```ts
sourceMetadata: characterCardSourceMetadataSchema.optional(),
```

In `library-routes.ts`, pass it through:

```ts
...(parsed.data.sourceMetadata ? { sourceMetadata: parsed.data.sourceMetadata } : {}),
```

- [ ] **Step 8: Run store and import tests**

Run:

```powershell
corepack pnpm --filter @hushline/server exec bun test ./src/store/__tests__/profile-library-store.test.ts ./src/__tests__/card-import.test.ts
```

Expected: PASS.

---

## Task 3: Client API Types And Tests

**Files:**
- Modify: `packages/client/src/api-v2.ts`
- Test: `packages/client/src/__tests__/api-v2.test.ts`

- [ ] **Step 1: Inspect current dirty diffs**

Run:

```powershell
git diff -- packages/client/src/api-v2.ts packages/client/src/__tests__/api-v2.test.ts
```

Expected: existing WIP is known.

- [ ] **Step 2: Add failing test for import metadata**

In `packages/client/src/__tests__/api-v2.test.ts`, import `importCharacterCard` if not already imported:

```ts
import { importCharacterCard } from "../api-v2";
```

Add:

```ts
test("returns character card import metadata from PNG imports", async () => {
  globalThis.fetch = (async (input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { kind: string; fileName: string };
    expect(String(input)).toBe("/api/v2/character-card/import");
    expect(body.kind).toBe("png");
    expect(body.fileName).toBe("Antonio.png");
    return jsonResponse({
      character: makeImportedCharacterCard(),
      metadata: {
        sourceFileName: "Antonio.png",
        sourceFormat: "png-chara-v2",
        cardSpec: "chara_card_v2",
        cardSpecVersion: "2.0",
        creator: "darkmountain",
        extensionKeys: ["janitor"],
        hasFirstMessage: true,
        alternateGreetingCount: 0,
        hasScenario: false,
        hasCharacterBook: false,
      },
      characterCard: {
        id: "card-1",
        name: "Antonio",
        sourceFileName: "Antonio.png",
        sourceMetadata: {
          sourceFileName: "Antonio.png",
          sourceFormat: "png-chara-v2",
          extensionKeys: ["janitor"],
          hasFirstMessage: true,
          alternateGreetingCount: 0,
          hasScenario: false,
          hasCharacterBook: false,
        },
        character: makeImportedCharacterCard(),
        createdAt: "2026-06-03T00:00:00.000Z",
        updatedAt: "2026-06-03T00:00:00.000Z",
      },
    });
  }) as typeof fetch;

  const file = new File([new Uint8Array([1, 2, 3])], "Antonio.png", { type: "image/png" });
  const imported = await importCharacterCard(file);

  expect(imported.character.name).toBe("백이현");
  expect(imported.metadata).toMatchObject({
    sourceFormat: "png-chara-v2",
    creator: "darkmountain",
  });
  expect(imported.characterCard?.sourceMetadata?.extensionKeys).toEqual(["janitor"]);
});
```

- [ ] **Step 3: Run client API test to verify failure**

Run:

```powershell
corepack pnpm --filter @hushline/client exec bun test src/__tests__/api-v2.test.ts
```

Expected: FAIL because `importCharacterCard` returns only the character.

- [ ] **Step 4: Add API metadata types**

In `api-v2.ts`, add:

```ts
export type CharacterCardSourceFormat =
  | "png-chara-v2"
  | "png-ccv3"
  | "json-v2"
  | "json-v3"
  | "json-unknown";

export interface CharacterCardSourceMetadata {
  sourceFileName?: string;
  sourceFormat: CharacterCardSourceFormat;
  cardSpec?: string;
  cardSpecVersion?: string;
  creator?: string;
  sourceUrl?: string;
  extensionKeys: string[];
  hasFirstMessage: boolean;
  alternateGreetingCount: number;
  hasScenario: boolean;
  hasCharacterBook: boolean;
}

export interface ImportedCharacterCardResult {
  character: ImportedCharacterCard;
  metadata: CharacterCardSourceMetadata;
  characterCard?: CharacterCardLibraryEntry;
}
```

Extend `CharacterCardLibraryEntry` with:

```ts
sourceMetadata?: CharacterCardSourceMetadata;
```

- [ ] **Step 5: Change `importCharacterCard` return type**

Replace:

```ts
export async function importCharacterCard(file: File): Promise<ImportedCharacterCard> {
```

with:

```ts
export async function importCharacterCard(file: File): Promise<ImportedCharacterCardResult> {
```

Update payload type:

```ts
const payload = (await response.json().catch(() => null)) as
  | ImportedCharacterCardResult
  | { error: string }
  | null;
```

Keep the existing error branch and return `payload`.

- [ ] **Step 6: Update `saveCharacterCard` request type**

If `saveCharacterCard` accepts only `{ character, sourceFileName }`, add optional `sourceMetadata`:

```ts
export async function saveCharacterCard(input: {
  id?: string;
  name?: string;
  sourceFileName?: string;
  sourceMetadata?: CharacterCardSourceMetadata;
  character: ImportedCharacterCard;
}): Promise<CharacterCardLibraryEntry> {
```

Include it in the JSON body:

```ts
...(input.sourceMetadata ? { sourceMetadata: input.sourceMetadata } : {}),
```

- [ ] **Step 7: Update old import call sites to use `.character`**

Search:

```powershell
rg -n "importCharacterCard\\(" packages/client/src
```

For each call, change:

```ts
const character = await importCharacterCard(file);
```

to:

```ts
const imported = await importCharacterCard(file);
const character = imported.character;
```

Where metadata is needed later, keep the full `imported` result.

- [ ] **Step 8: Run client API tests**

Run:

```powershell
corepack pnpm --filter @hushline/client exec bun test src/__tests__/api-v2.test.ts
```

Expected: PASS.

---

## Task 4: Character Card Import Preview Component

**Files:**
- Modify: `packages/client/src/components/setup/CharacterCardImport.tsx`
- Modify: `packages/client/src/styles/setup.css`
- Test: `packages/client/tests/app-shell-components.test.tsx`

- [ ] **Step 1: Inspect current dirty diffs**

Run:

```powershell
git diff -- packages/client/src/components/setup/CharacterCardImport.tsx packages/client/src/styles/setup.css packages/client/tests/app-shell-components.test.tsx
```

Expected: existing WIP is known.

- [ ] **Step 2: Add failing component test**

In `packages/client/tests/app-shell-components.test.tsx`, add a test that renders `CharacterCardImport` with a supplied preview state if the test harness already supports direct component render. If the file uses `@testing-library/react`, use:

```tsx
test("character card import preview shows detected external card metadata", () => {
  render(
    <CharacterCardImport
      preview={{
        character: makeImportedCharacterCard(),
        metadata: {
          sourceFileName: "Antonio.png",
          sourceFormat: "png-chara-v2",
          cardSpec: "chara_card_v2",
          cardSpecVersion: "2.0",
          creator: "darkmountain",
          extensionKeys: ["janitor"],
          hasFirstMessage: true,
          alternateGreetingCount: 0,
          hasScenario: false,
          hasCharacterBook: false,
        },
      }}
      targetLabel="강무진"
      onApply={() => undefined}
    />,
  );

  expect(screen.getByText("Antonio.png")).toBeTruthy();
  expect(screen.getByText("chara_card_v2")).toBeTruthy();
  expect(screen.getByText("darkmountain")).toBeTruthy();
  expect(screen.getByText("Janitor")).toBeTruthy();
  expect(screen.getByRole("button", { name: "강무진 슬롯에 적용" })).toBeTruthy();
});
```

If the test file does not currently import `CharacterCardImport`, add:

```ts
import { CharacterCardImport } from "../src/components/setup/CharacterCardImport";
```

- [ ] **Step 3: Run component test to verify failure**

Run:

```powershell
corepack pnpm --filter @hushline/client exec bun test tests/app-shell-components.test.tsx
```

Expected: FAIL because `preview`, `targetLabel`, and `onApply` props do not exist.

- [ ] **Step 4: Extend component props**

In `CharacterCardImport.tsx`, import `ImportedCharacterCardResult`:

```ts
import {
  importCharacterCard,
  type ImportedCharacterCard,
  type ImportedCharacterCardResult,
} from "../../api-v2";
```

Update props:

```ts
export interface CharacterCardImportProps {
  targetLabel?: string;
  preview?: ImportedCharacterCardResult | null;
  onImported?: (result: ImportedCharacterCardResult) => void;
  onApply?: (result: ImportedCharacterCardResult) => void;
}
```

Change local preview state:

```ts
const [localPreview, setLocalPreview] = useState<ImportedCharacterCardResult | null>(null);
const activePreview = preview ?? localPreview;
```

Update import handling:

```ts
const result = await importCharacterCard(file);
setLocalPreview(result);
onImported?.(result);
```

- [ ] **Step 5: Render source metadata**

Below the preview header, render:

```tsx
{activePreview ? (
  <article className="card-import-preview">
    <div className="card-import-preview-head">
      <strong>{activePreview.character.name}</strong>
      <span>{formatSourceFormat(activePreview.metadata.sourceFormat)}</span>
    </div>
    <dl className="card-import-source-grid">
      <div>
        <dt>파일</dt>
        <dd>{activePreview.metadata.sourceFileName ?? "직접 입력"}</dd>
      </div>
      <div>
        <dt>스펙</dt>
        <dd>{activePreview.metadata.cardSpec ?? "알 수 없음"}</dd>
      </div>
      <div>
        <dt>Creator</dt>
        <dd>{activePreview.metadata.creator ?? "미기재"}</dd>
      </div>
      <div>
        <dt>첫 메시지</dt>
        <dd>{activePreview.metadata.hasFirstMessage ? "있음" : "없음"}</dd>
      </div>
    </dl>
    {activePreview.metadata.extensionKeys.length ? (
      <div className="card-import-tags">
        {activePreview.metadata.extensionKeys.map((key) => (
          <span key={key}>{formatExtensionKey(key)}</span>
        ))}
      </div>
    ) : null}
    {onApply ? (
      <button type="button" className="card-import-apply" onClick={() => onApply(activePreview)}>
        {targetLabel ? `${targetLabel} 슬롯에 적용` : "현재 슬롯에 적용"}
      </button>
    ) : null}
  </article>
) : null}
```

Add helpers:

```ts
function formatSourceFormat(format: ImportedCharacterCardResult["metadata"]["sourceFormat"]): string {
  switch (format) {
    case "png-chara-v2":
      return "Tavern PNG v2";
    case "png-ccv3":
      return "Tavern PNG v3";
    case "json-v2":
      return "JSON v2";
    case "json-v3":
      return "JSON v3";
    default:
      return "JSON";
  }
}

function formatExtensionKey(key: string): string {
  return key === "janitor" ? "Janitor" : key;
}
```

- [ ] **Step 6: Add responsive styles**

In `setup.css`, add:

```css
.card-import-source-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  gap: 0.5rem;
  margin: 0.75rem 0;
}

.card-import-source-grid div {
  min-width: 0;
  padding: 0.6rem;
  border: 1px solid color-mix(in srgb, var(--theme-line) 70%, transparent);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--theme-panel) 80%, transparent);
}

.card-import-source-grid dt {
  font-size: 0.72rem;
  color: var(--theme-muted);
}

.card-import-source-grid dd {
  margin: 0.2rem 0 0;
  overflow-wrap: anywhere;
}

.card-import-apply {
  width: 100%;
}
```

Use existing tokens if `--theme-line`, `--theme-panel`, or `--radius-sm` differ in this stylesheet.

- [ ] **Step 7: Run component test**

Run:

```powershell
corepack pnpm --filter @hushline/client exec bun test tests/app-shell-components.test.tsx
```

Expected: PASS.

---

## Task 5: Scenario Slot Application UX

**Files:**
- Modify: `packages/client/src/components/setup/ScenarioSetupPanel.tsx`
- Modify: `packages/client/src/App.tsx`
- Modify: `packages/client/src/styles/setup.css`
- Test: `packages/client/src/__tests__/scenario-character-import.test.ts`
- Test: `packages/client/tests/app-shell-components.test.tsx`

- [ ] **Step 1: Inspect current dirty diffs**

Run:

```powershell
git diff -- packages/client/src/components/setup/ScenarioSetupPanel.tsx packages/client/src/App.tsx packages/client/src/styles/setup.css packages/client/src/__tests__/scenario-character-import.test.ts packages/client/tests/app-shell-components.test.tsx
```

Expected: existing WIP is known.

- [ ] **Step 2: Add failing slot-state test**

In `packages/client/tests/app-shell-components.test.tsx`, add or update a `ScenarioSetupPanel` render test:

```tsx
test("scenario setup shows imported card applied state for a cast slot", () => {
  render(
    <ScenarioSetupPanel
      scenarioList={["locked-room-mystery"]}
      isScenarioListLoading={false}
      scenarioListError={null}
      selectedScenario="locked-room-mystery"
      selectedScenarioDetail={makeScenarioDetail()}
      characterOverrides={{
        "kang-mujin": makeImportedCharacterCard({ name: "Antonio", role: "Imported Janitor card" }),
      }}
      characterLibrary={[]}
      error={null}
      onSelectScenario={() => undefined}
      onCharacterOverride={() => undefined}
      onNext={() => undefined}
    />,
  );

  expect(screen.getByText("Antonio")).toBeTruthy();
  expect(screen.getByText("외부 카드 적용됨")).toBeTruthy();
  expect(screen.getByRole("button", { name: "기본값으로 되돌리기" })).toBeTruthy();
});
```

Add test helpers only if missing:

```ts
function makeImportedCharacterCard(patch: Partial<ImportedCharacterCard> = {}): ImportedCharacterCard {
  return {
    id: "antonio",
    name: "Antonio",
    shortName: "Antonio",
    role: "Imported card",
    mbti: "unspecified",
    autonomy: 0.6,
    ocean: { openness: 50, conscientiousness: 50, extraversion: 50, agreeableness: 50, neuroticism: 50 },
    systemPrompt: "You are Antonio.",
    handout: { secret: "", desire: "", objective: "", initialRelationshipToUser: 0 },
    relationships: [],
    ...patch,
  };
}
```

- [ ] **Step 3: Run test to verify failure**

Run:

```powershell
corepack pnpm --filter @hushline/client exec bun test tests/app-shell-components.test.tsx
```

Expected: FAIL because visible state labels/actions are missing.

- [ ] **Step 4: Add reset handler prop**

In `ScenarioSetupPanelProps`, add:

```ts
onCharacterOverrideClear: (targetId: string) => void;
```

In `App.tsx`, add:

```ts
function handleCharacterOverrideClear(targetId: string) {
  setCharacterOverrides((current) => {
    const next = { ...current };
    delete next[targetId];
    return next;
  });
}
```

Pass it to `ScenarioSetupPanel`:

```tsx
onCharacterOverrideClear={handleCharacterOverrideClear}
```

- [ ] **Step 5: Replace compact character badges with slot cards**

Inside `selectedScenarioDetail.characters.map`, change each button into an article-style slot:

```tsx
<article key={char.id} className={`scenario-cast-slot${override ? " is-overridden" : ""}`}>
  <div className="scenario-cast-slot-head">
    <div>
      <strong>{displayName}</strong>
      <span>{displayRole}</span>
    </div>
    <em>{override ? "외부 카드 적용됨" : "기본 인물"}</em>
  </div>
  <div className="scenario-cast-slot-actions">
    <button type="button" onClick={() => handleCharacterClick(char.id)} disabled={isImporting}>
      {isImporting ? "불러오는 중..." : "카드 가져오기"}
    </button>
    {override ? (
      <button type="button" onClick={() => onCharacterOverrideClear(char.id)}>
        기본값으로 되돌리기
      </button>
    ) : null}
  </div>
</article>
```

Keep the hidden file input outside the map as it is now.

- [ ] **Step 6: Update file import handling for new return type**

In `handleCharacterFileChange`, change:

```ts
const character = await importCharacterCard(file);
onCharacterOverride(targetId, character);
```

to:

```ts
const imported = await importCharacterCard(file);
onCharacterOverride(targetId, imported.character);
```

If the UI needs metadata later, add a local `lastImportedCard` state in a follow-up step rather than changing `characterOverrides` shape in this task.

- [ ] **Step 7: Style slot cards**

In `setup.css`, add:

```css
.scenario-characters-preview {
  display: grid;
  gap: 0.75rem;
}

.scenario-cast-slot {
  display: grid;
  gap: 0.75rem;
  padding: 0.8rem;
  border: 1px solid color-mix(in srgb, var(--theme-line) 75%, transparent);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--theme-panel) 82%, transparent);
}

.scenario-cast-slot.is-overridden {
  border-color: var(--theme-accent);
}

.scenario-cast-slot-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.scenario-cast-slot-head div {
  min-width: 0;
}

.scenario-cast-slot-head strong,
.scenario-cast-slot-head span {
  display: block;
  overflow-wrap: anywhere;
}

.scenario-cast-slot-head em {
  flex: 0 0 auto;
  font-size: 0.72rem;
  font-style: normal;
  color: var(--theme-accent);
}

.scenario-cast-slot-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
```

Use existing radius/accent variables if names differ.

- [ ] **Step 8: Run component tests**

Run:

```powershell
corepack pnpm --filter @hushline/client exec bun test tests/app-shell-components.test.tsx src/__tests__/scenario-character-import.test.ts
```

Expected: PASS.

---

## Task 6: Library Browser And Empty State

**Files:**
- Modify: `packages/client/src/components/setup/ScenarioSetupPanel.tsx`
- Modify: `packages/client/src/styles/setup.css`
- Test: `packages/client/tests/app-shell-components.test.tsx`

- [ ] **Step 1: Add failing test for library empty state**

Add:

```tsx
test("scenario setup explains empty reusable character-card library", () => {
  render(
    <ScenarioSetupPanel
      scenarioList={["locked-room-mystery"]}
      isScenarioListLoading={false}
      scenarioListError={null}
      selectedScenario="locked-room-mystery"
      selectedScenarioDetail={makeScenarioDetail()}
      characterOverrides={{}}
      characterLibrary={[]}
      error={null}
      onSelectScenario={() => undefined}
      onCharacterOverride={() => undefined}
      onCharacterOverrideClear={() => undefined}
      onNext={() => undefined}
    />,
  );

  expect(screen.getByText("저장된 카드 0개")).toBeTruthy();
  expect(screen.getByText("PNG/JSON 캐릭터 카드를 가져오면 여기에 저장됩니다. 다음 세션에서도 다시 쓸 수 있습니다.")).toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```powershell
corepack pnpm --filter @hushline/client exec bun test tests/app-shell-components.test.tsx
```

Expected: FAIL because the library browser text is not rendered.

- [ ] **Step 3: Replace disabled select-only library area**

In `ScenarioSetupPanel.tsx`, replace or augment `.character-library-apply` with:

```tsx
<section className="character-library-browser" aria-label="저장된 캐릭터 카드">
  <header>
    <strong>저장된 카드 {characterLibrary.length}개</strong>
    <span>다음 세션에서도 다시 쓸 수 있습니다.</span>
  </header>
  {characterLibrary.length === 0 ? (
    <p className="character-library-empty">
      PNG/JSON 캐릭터 카드를 가져오면 여기에 저장됩니다. 다음 세션에서도 다시 쓸 수 있습니다.
    </p>
  ) : (
    <div className="character-library-list">
      {characterLibrary.map((entry) => (
        <button
          key={entry.id}
          type="button"
          className={`character-library-card${libraryCardId === entry.id ? " selected" : ""}`}
          onClick={() => setLibraryCardId(entry.id)}
        >
          <strong>{entry.name}</strong>
          <span>{entry.sourceFileName ?? "저장된 카드"}</span>
        </button>
      ))}
    </div>
  )}
  <div className="character-library-apply">
    <select
      value={libraryTargetId}
      onChange={(event) => setLibraryTargetId(event.target.value)}
      aria-label="교체할 시나리오 인물"
      disabled={characterLibrary.length === 0}
    >
      <option value="">적용할 인물 선택</option>
      {selectedScenarioDetail.characters.map((char) => (
        <option key={char.id} value={char.id}>
          {char.name}
        </option>
      ))}
    </select>
    <button
      type="button"
      className="persona-secondary-button"
      onClick={handleApplyLibraryCard}
      disabled={!libraryTargetId || !libraryCardId}
    >
      저장된 카드 적용
    </button>
  </div>
</section>
```

- [ ] **Step 4: Style library browser**

In `setup.css`, add:

```css
.character-library-browser {
  display: grid;
  gap: 0.75rem;
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid color-mix(in srgb, var(--theme-line) 70%, transparent);
}

.character-library-browser header {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: baseline;
}

.character-library-browser header span,
.character-library-empty {
  color: var(--theme-muted);
  font-size: 0.85rem;
}

.character-library-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  gap: 0.5rem;
}

.character-library-card {
  text-align: left;
  min-width: 0;
}

.character-library-card strong,
.character-library-card span {
  display: block;
  overflow-wrap: anywhere;
}
```

- [ ] **Step 5: Run component test**

Run:

```powershell
corepack pnpm --filter @hushline/client exec bun test tests/app-shell-components.test.tsx
```

Expected: PASS.

---

## Task 7: Persona Preview Breakage Quick Fix

**Files:**
- Modify: `packages/client/src/components/setup/PersonaSetupPanel.tsx`
- Modify: `packages/client/src/styles/setup.css`
- Test: `packages/client/tests/app-shell-components.test.tsx`

- [ ] **Step 1: Inspect current dirty diffs**

Run:

```powershell
git diff -- packages/client/src/components/setup/PersonaSetupPanel.tsx packages/client/src/styles/setup.css packages/client/tests/app-shell-components.test.tsx
```

Expected: existing WIP is known.

- [ ] **Step 2: Add test for stable preview text**

Add:

```tsx
test("persona preview exposes the default user name without overlapping helper text", () => {
  render(
    <PersonaSetupPanel
      personaDraft={{ name: "", shortName: "", role: "", description: "", appearance: "", relationshipTags: [] }}
      personaPrompt=""
      relationshipTagText=""
      savedPersonaProfiles={[]}
      isStarting={false}
      isGeneratingPersona={false}
      isSavingPersona={false}
      error={null}
      personaGenerationError={null}
      libraryStatus={null}
      onDraftChange={() => undefined}
      onPersonaPromptChange={() => undefined}
      onRelationshipTagTextChange={() => undefined}
      onGeneratePersona={() => undefined}
      onSavePersona={() => undefined}
      onApplyPersonaProfile={() => undefined}
      onBack={() => undefined}
      onSubmit={(event) => event.preventDefault()}
    />,
  );

  expect(screen.getByText("{{유저}}")).toBeTruthy();
  expect(screen.getByText("이미지 선택")).toBeTruthy();
});
```

This test cannot prove visual overlap, so browser screenshot remains required in Task 9.

- [ ] **Step 3: Fix preview layout without magic height**

In `setup.css`, update persona portrait placeholder rules so the text stacks:

```css
.persona-portrait-placeholder {
  display: grid;
  place-items: center;
  gap: 0.35rem;
  min-width: 0;
  text-align: center;
}

.persona-portrait-placeholder strong,
.persona-portrait-placeholder em {
  max-width: 100%;
  overflow-wrap: anywhere;
}
```

If `.persona-portrait-drop` lacks stable intrinsic sizing, use an existing aspect-ratio rule or add:

```css
.persona-portrait-drop {
  display: grid;
  place-items: center;
  min-height: 0;
}
```

- [ ] **Step 4: Run component test**

Run:

```powershell
corepack pnpm --filter @hushline/client exec bun test tests/app-shell-components.test.tsx
```

Expected: PASS.

---

## Task 8: Integration Checks

**Files:**
- No new files expected.
- Verify all files touched in Tasks 1-7.

- [ ] **Step 1: Run focused server tests**

Run:

```powershell
corepack pnpm --filter @hushline/server exec bun test ./src/__tests__/card-import.test.ts ./src/store/__tests__/profile-library-store.test.ts ./src/__tests__/api-v2.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run focused client tests**

Run:

```powershell
corepack pnpm --filter @hushline/client exec bun test src/__tests__/api-v2.test.ts src/__tests__/scenario-character-import.test.ts tests/app-shell-components.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run client check/build**

Run:

```powershell
corepack pnpm --filter @hushline/client check
corepack pnpm --filter @hushline/client build
```

Expected: both PASS.

- [ ] **Step 4: Run server check**

Run:

```powershell
corepack pnpm --filter @hushline/server check
```

Expected: PASS.

- [ ] **Step 5: Run diff whitespace check**

Run:

```powershell
git diff --check
```

Expected: no whitespace errors.

---

## Task 9: Browser Smoke And Product Design Re-Audit Prep

**Files:**
- Optional local evidence folder under `output/product-design-audits/`.
- Do not stage local screenshots unless the user asks.

- [ ] **Step 1: Verify local ports**

Run:

```powershell
Get-NetTCPConnection -LocalPort 4187,7871 -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,State,OwningProcess
```

Expected: UI listens on `4187`, API listens on `7871`. If not, start the app using the repo's existing dev workflow.

- [ ] **Step 2: Open the setup flow in Browser**

Use the Browser plugin and navigate to:

```text
http://127.0.0.1:4187/
```

Expected: scenario setup loads without console errors.

- [ ] **Step 3: Import real local sample cards**

Use the UI to import:

```text
C:/Users/limoj/Downloads/Antonio.png
C:/Users/limoj/Downloads/Nikolai (1).png
C:/Users/limoj/Downloads/Eduardo_.png
```

Expected for each:

- Detected as `chara_card_v2` or `Tavern PNG v2`.
- Creator/source is shown when available.
- `Janitor` extension is shown.
- First-message availability is shown.
- The card can be applied to a scenario slot.
- The slot visibly changes to imported/applied state.

- [ ] **Step 4: Capture required screenshots**

Capture:

- Scenario setup with empty library.
- Imported card preview.
- Slot after card applied.
- Library after card saved.
- Persona setup after preview fix.
- Mobile setup at 390 x 844.

Expected: screenshots are nonblank and show the intended state.

- [ ] **Step 5: Re-run UX audit after implementation**

Use Product Design audit criteria from:

```text
output/product-design-audits/2026-06-03-hushline-chat-ux/audit-report.md
```

Expected: new audit specifically answers whether import trust, save/apply visibility, and setup clarity improved.

---

## Self-Review

Spec coverage:

- External PNG/JSON import metadata: Tasks 1, 3, 4.
- Original/source preservation: Tasks 1, 2.
- Saved library visibility: Tasks 2, 6.
- Slot application visibility: Task 5.
- Persona breakage quick fix: Task 7.
- Provider neutrality and no hard-coded layout: Preconditions, Tasks 7-9.
- Follow-up audit: Task 9.

Red-flag scan:

- No incomplete marker strings or unspecified implementation steps remain.

Type consistency:

- Server metadata type is `CharacterCardSourceMetadata`.
- Client metadata type is `CharacterCardSourceMetadata`.
- API import result type is `ImportedCharacterCardResult`.
- Library record metadata field is `sourceMetadata`.
